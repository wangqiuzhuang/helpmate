// utils/cloud.js —— 云开发调用适配层(替代页面里的 wx.cloud.*)
//
// 与 wx.cloud 保持同样的 Promise 接口,页面代码只把 `wx.cloud` 换成 `cloud`:
//   cloud.callFunction({ name, data }) → { result }
//   cloud.uploadFile({ cloudPath, filePath }) → { fileID }
//   cloud.deleteFile({ fileList }) → { fileList }
//
// 小程序端:原样转发给 wx.cloud(身份 = 微信 OPENID,行为与原小程序完全一致)
// App/H5 端:腾讯云开发 JS SDK + 匿名登录调用同一个云函数;业务身份用 App 账号令牌(_appToken)
//   - 云存储 fileID(cloud://...)在 App/H5 的 <image> 中无法直接显示,
//     返回给页面前统一转成 https 地址,发回云函数前再转回 cloud://,数据库里始终存 fileID

import SERVER from '../config/server.js';
import { getCountry } from './school-data.js';

const TOKEN_KEY = 'krstuast_app_token_v1';
const LOGIN_PAGE = '/pages/login/login';

export const getAppToken = () => {
  try {
    return uni.getStorageSync(TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
};
export const setAppToken = (token) => {
  try {
    if (token) uni.setStorageSync(TOKEN_KEY, token);
    else uni.removeStorageSync(TOKEN_KEY);
  } catch (e) {}
};

// ---------- fileID ⇄ https ----------
// cloud://<env>.<bucket>/<path>  ⇄  https://<bucket>.tcb.qcloud.la/<path>
const CLOUD_RE = /^cloud:\/\/([^./]+)\.([^/]+)\/(.+)$/;
const HTTP_RE = /^https:\/\/([^/]+)\.tcb\.qcloud\.la\/(.+)$/;
const bucketEnv = {}; // bucket → env(从见过的 fileID 中学习,用于反向转换)

export const toHttpUrl = (s) => {
  const m = typeof s === 'string' && s.match(CLOUD_RE);
  if (!m) return s;
  bucketEnv[m[2]] = m[1];
  return `https://${m[2]}.tcb.qcloud.la/${m[3]}`;
};
export const toFileID = (s, env) => {
  const m = typeof s === 'string' && s.match(HTTP_RE);
  if (!m) return s;
  const e = bucketEnv[m[1]] || env;
  return e ? `cloud://${e}.${m[1]}/${m[2]}` : s;
};
export const isCloudFile = (s) => typeof s === 'string' && (CLOUD_RE.test(s) || HTTP_RE.test(s));

const deepMap = (v, fn) => {
  if (typeof v === 'string') return fn(v);
  if (Array.isArray(v)) return v.map((x) => deepMap(x, fn));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = deepMap(v[k], fn);
    return o;
  }
  return v;
};

let cloud;

const PUBLIC_ACTIONS = ['dbCheck', 'appRegister', 'appLogin', 'wxLogin', 'getAppVersion', 'requestSchool', 'getAppConfig'];
// 游客(未登录)也能调用的只读接口;与云函数 GUEST_ACTIONS 保持一致
const GUEST_ACTIONS = ['getExploreData', 'getHotFeed', 'getPosts', 'getOrders', 'getPostDetail', 'getOrderDetail', 'getUserHome', 'getMoments', 'getTopToday', 'getSchoolStats'];

const IS_MP = (() => {
  // #ifdef MP-WEIXIN
  return true;
  // #endif
  // #ifndef MP-WEIXIN
  return false;
  // #endif
})();

// 游客:App/H5 端未登录(小程序端用微信身份自动登录,不存在游客)
export const isGuest = () => !IS_MP && !getAppToken();

// 登录引导弹窗:用户可选「去登录」或「先逛逛」;登录成功后回到原页面
const LOGIN_TEXT = {
  zh: { title: '登录后继续', more: '登录后可以查看更多内容', act: '发布、评论、私聊等操作需要先登录', ok: '去登录', cancel: '先逛逛' },
  en: { title: 'Sign in to continue', more: 'Sign in to see more', act: 'Posting, commenting and messaging need an account', ok: 'Sign in', cancel: 'Not now' },
  ko: { title: '로그인이 필요해요', more: '로그인하면 더 많은 글을 볼 수 있어요', act: '글쓰기, 댓글, 채팅은 로그인 후 이용할 수 있어요', ok: '로그인', cancel: '둘러보기' },
};
let prompting = false;
export const promptLogin = (reason) => {
  if (prompting) return;
  const pages = getCurrentPages();
  const cur = pages[pages.length - 1];
  if (cur && '/' + cur.route === LOGIN_PAGE) return;
  let lang = 'zh';
  try {
    lang = uni.getStorageSync('krstuast_lang_v1') || 'zh';
  } catch (e) {}
  const T = LOGIN_TEXT[lang] || LOGIN_TEXT.zh;
  prompting = true;
  uni.showModal({
    title: T.title,
    content: reason === 'more' ? T.more : T.act,
    confirmText: T.ok,
    cancelText: T.cancel,
    confirmColor: '#D63A73',
    success: (res) => {
      if (res.confirm) uni.navigateTo({ url: LOGIN_PAGE });
    },
    complete: () => setTimeout(() => (prompting = false), 300),
  });
};
const goLogin = () => promptLogin('act');

// 页面入口拦截:已登录返回 true;游客弹出登录引导并返回 false
export const requireLogin = (reason) => {
  if (!isGuest()) return true;
  promptLogin(reason || 'act');
  return false;
};

// #ifdef MP-WEIXIN
import { resolveEnv } from '../config/env.js';
let mpInited = false;
const mpInit = () => {
  if (mpInited) return;
  mpInited = true;
  if (wx.cloud) wx.cloud.init({ env: resolveEnv(), traceUser: true });
};
cloud = {
  init: mpInit,
  callFunction: (opts) => (mpInit(), wx.cloud.callFunction(opts)),
  uploadFile: (opts) => (mpInit(), wx.cloud.uploadFile(opts)),
  deleteFile: (opts) => (mpInit(), wx.cloud.deleteFile(opts)),
  isCloudFile,
  isApp: false,
};
// #endif

// #ifndef MP-WEIXIN
import cloudbase from '@cloudbase/js-sdk';
import adapter from '@cloudbase/adapter-uni-app';
import CFG from '../config/app-cloud.js';

let tcb = null;
let loginPromise = null;

const getTcb = () => {
  if (tcb) return tcb;
  cloudbase.useAdapters(adapter, { uni });
  const conf = { env: CFG.env, region: CFG.region };
  // #ifdef APP-PLUS
  conf.appSign = CFG.appSign;
  conf.appSecret = { appAccessKeyId: CFG.appAccessKeyId, appAccessKey: CFG.appAccessKey };
  // #endif
  tcb = cloudbase.init(conf);
  return tcb;
};

// 云开发「匿名登录」:只用于通过云开发网关;业务身份由 _appToken 决定
const ensureTcbLogin = () => {
  if (loginPromise) return loginPromise;
  const app = getTcb();
  const auth = app.auth({ persistence: 'local' });
  loginPromise = Promise.resolve(auth.getLoginState())
    .then((state) => {
      if (state) return state;
      if (auth.signInAnonymously) return auth.signInAnonymously();
      return auth.anonymousAuthProvider().signIn();
    })
    .catch((e) => {
      loginPromise = null;
      throw e;
    });
  return loginPromise;
};


let mock = null;
// #ifdef H5
// H5 预览/界面走查:VITE_MOCK=1 时使用本地假数据,不连云端
if (import.meta.env.VITE_MOCK === '1') mock = () => import('../mock/mock-cloud.js');
// #endif

const callFunction = ({ name, data }) => {
  const action = data && data.action;
  const token = getAppToken();
  if (!token && !PUBLIC_ACTIONS.includes(action) && !GUEST_ACTIONS.includes(action)) {
    goLogin();
    return Promise.resolve({ result: { success: false, message: '未登录', code: 'NO_AUTH' } });
  }
  const payload = deepMap({ ...(data || {}), _appToken: token || undefined }, (s) => toFileID(s, CFG.env));
  const run = mock
    ? mock().then((m) => m.default.callFunction({ name, data: payload }))
    : ensureTcbLogin().then(() => getTcb().callFunction({ name, data: payload }));
  return run.then((res) => {
    const result = deepMap(res && res.result, toHttpUrl);
    if (result && result.code === 'NO_AUTH') {
      setAppToken('');
      goLogin();
    } else if (result && result.code === 'NEED_LOGIN') {
      promptLogin('more');
    }
    return { result };
  });
};

const uploadFile = ({ cloudPath, filePath }) => {
  if (mock) return mock().then((m) => m.default.uploadFile({ cloudPath, filePath }));
  return ensureTcbLogin()
    .then(() => getTcb().uploadFile({ cloudPath, filePath }))
    .then((res) => {
      if (!res || !res.fileID) throw new Error((res && res.message) || 'upload failed');
      return { ...res, fileID: toHttpUrl(res.fileID) };
    });
};

const deleteFile = ({ fileList }) => {
  if (mock) return Promise.resolve({ fileList: [] });
  return ensureTcbLogin().then(() => getTcb().deleteFile({ fileList: (fileList || []).map((f) => toFileID(f, CFG.env)) }));
};

cloud = { init: () => {}, callFunction, uploadFile, deleteFile, isCloudFile, isApp: true };
// #endif

// ================= 自建后端模式(config/server.js 填了 base 时,所有平台生效) =================
// 身份:App 用账号密码登录拿令牌;小程序用 wx.login 的 code 换令牌(用户 ID 仍为 openid)
const BASE = (SERVER.base || '').replace(/\/$/, '');

let mpLoginPromise = null;
const mpLogin = () => {
  if (mpLoginPromise) return mpLoginPromise;
  mpLoginPromise = uni
    .login({ provider: 'weixin' })
    .then(({ code }) => {
      let schoolId = '';
      try {
        schoolId = (uni.getStorageSync('krstuast_school_v1') || {}).id || '';
      } catch (e) {}
      return uni.request({ url: BASE + '/api/call', method: 'POST', data: { name: 'krstuast', data: { action: 'wxLogin', code, schoolId } } });
    })
    .then((res) => {
      const r = (res.data && res.data.result) || {};
      if (!r.success || !r.token) throw new Error(r.message || 'wxLogin failed');
      setAppToken(r.token);
      return r.token;
    })
    .finally(() => {
      mpLoginPromise = null;
    });
  return mpLoginPromise;
};

const needLogin = () => {
  // #ifdef MP-WEIXIN
  return mpLogin();
  // #endif
  // #ifndef MP-WEIXIN
  goLogin();
  return Promise.resolve('');
  // #endif
};

// 全站类查询按国家隔离:自动带上当前国家(后端仅在 schoolId 为空时使用)
const withCountry = (data) => (data && data.country === undefined && getCountry() ? { ...data, country: getCountry() } : data);
const serverPost = (data, name) =>
  uni.request({ url: BASE + '/api/call', method: 'POST', timeout: 30000, data: { name: name || 'krstuast', data: withCountry(data) } }).then((res) => {
    if (res.statusCode !== 200) throw new Error('HTTP ' + res.statusCode);
    return (res.data && res.data.result) || {};
  });

const NO_AUTH_RESULT = { success: false, message: '未登录', code: 'NO_AUTH' };

const serverCall = async ({ name, data }) => {
  const action = data && data.action;
  let token = getAppToken();
  const guestOk = !IS_MP && GUEST_ACTIONS.includes(action);
  if (!token && !PUBLIC_ACTIONS.includes(action) && !guestOk) {
    token = await needLogin();
    if (!token) return { result: NO_AUTH_RESULT };
  }
  let result = await serverPost({ ...(data || {}), _appToken: token || undefined }, name);
  if (result && result.code === 'NO_AUTH' && !PUBLIC_ACTIONS.includes(action)) {
    setAppToken('');
    token = await needLogin();
    if (!token) return { result };
    result = await serverPost({ ...(data || {}), _appToken: token }, name); // 令牌过期:重新登录后重试一次
  } else if (result && result.code === 'NEED_LOGIN') {
    if (IS_MP) {
      token = await mpLogin();
      result = await serverPost({ ...(data || {}), _appToken: token }, name);
    } else {
      promptLogin('more');
    }
  }
  return { result };
};

const serverUpload = async ({ filePath }) => {
  let token = getAppToken();
  if (!token) token = await needLogin();
  const res = await uni.uploadFile({ url: BASE + '/api/upload', filePath, name: 'file', header: { 'x-token': token } });
  let body = {};
  try {
    body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data || {};
  } catch (e) {}
  if (res.statusCode !== 200 || !body.fileID) throw new Error(body.message || 'upload failed');
  return { fileID: body.fileID };
};

if (BASE) {
  cloud = {
    init: () => {},
    callFunction: serverCall,
    uploadFile: serverUpload,
    deleteFile: () => Promise.resolve({ fileList: [] }), // 旧图清理:服务器端暂不删除
    isCloudFile: (s) => typeof s === 'string' && s.indexOf(BASE + '/uploads/') === 0,
    // #ifdef MP-WEIXIN
    isApp: false,
    // #endif
    // #ifndef MP-WEIXIN
    isApp: true,
    // #endif
    isServer: true,
  };
}

// 列表缩略图:自建后端上传的图片同时生成 xxx_s.jpg(最长边 400px),列表/信息流优先加载它
export const thumbUrl = (u) =>
  BASE && typeof u === 'string' && u.indexOf(BASE + '/uploads/') === 0 && /\.jpg$/.test(u) ? u.replace(/\.jpg$/, '_s.jpg') : u;

// 便捷:直接调用业务云函数 krstuast
export const callKrstuast = (data) => cloud.callFunction({ name: 'krstuast', data });
export default cloud;
