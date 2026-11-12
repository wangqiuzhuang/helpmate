import __m0_zh from '../locales/zh.js';
import __m1_en from '../locales/en.js';
import __m2_ko from '../locales/ko.js';
import __m3_vi from '../locales/vi.js';
import { getCountry } from './school-data.js';
// utils/i18n.js —— 多语言文案单例(zh 为源;vi 缺 key 先回退 en;其余回退 zh,再缺回显 key 便于排查)
//
// 设计约束:
//   - 模块加载时不得调用 uni.*(tools/check-order-meta.js 会在 Node 下 require 本模块)
//   - lang 缓存在模块变量 + storage(krstuast_lang_v1),不依赖 getApp()
//     (custom-tab-bar 的 attached 可能在 App() 就绪前触发)
//   - 语言切换 = setLang + uni.reLaunch(见 utils/lang.js),全站页面重建后自动生效
const LOCALES = {
  zh: __m0_zh,
  en: __m1_en,
  ko: __m2_ko,
  vi: __m3_vi,
};
const FALLBACK = { vi: 'en' };

const LANG_KEY = 'krstuast_lang_v1';
let lang = '';

const normalize = (l) => (l === 'en' || l === 'ko' || l === 'vi' ? l : 'zh');

// 系统语言检测:ko* → ko;en* → en;vi* → vi;其他 → zh
function detectSystemLang() {
  let sys = '';
  try {
    sys = (uni.getAppBaseInfo ? uni.getAppBaseInfo().language : '') || uni.getSystemInfoSync().language || '';
  } catch (e) {
    sys = '';
  }
  if (/^ko/i.test(sys)) return 'ko';
  if (/^en/i.test(sys)) return 'en';
  if (/^vi/i.test(sys)) return 'vi';
  return 'zh';
}

// App.onLaunch 调用:storage 有值用之,否则按系统语言检测并持久化
function init() {
  let stored = '';
  try {
    stored = uni.getStorageSync(LANG_KEY);
  } catch (e) {
    stored = '';
  }
  lang = stored ? normalize(stored) : detectSystemLang();
  try {
    uni.setStorageSync(LANG_KEY, lang);
  } catch (e) {}
  return lang;
}

function getLang() {
  return lang || init();
}

function setLang(l) {
  lang = normalize(l);
  try {
    uni.setStorageSync(LANG_KEY, lang);
  } catch (e) {}
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.lang = lang;
  } catch (e) {}
  return lang;
}

// 文案查询 + {name} 插值;缺失回退 zh → key 本身
// 查找顺序:当前语言 → 回退语言(vi→en)→ zh
function lookup(k) {
  const cur = getLang();
  if (LOCALES[cur] && LOCALES[cur][k] !== undefined) return LOCALES[cur][k];
  const fb = FALLBACK[cur];
  if (fb && LOCALES[fb][k] !== undefined) return LOCALES[fb][k];
  return LOCALES.zh[k];
}

// 货币符号跟随界面语言:中文 ¥(人民币) / 韩语、英语、越南语 ₩(韩币)(文案里写死的符号统一替换)
const isCny = () => getLang() === 'zh';
const localize = (s) => {
  if (!s) return s;
  const cn = isCny();
  if (cn && s.indexOf('₩') >= 0) return s.replace(/₩/g, '¥');
  if (!cn && s.indexOf('¥') >= 0) return s.replace(/¥/g, '₩');
  return s;
};

function t(key, params) {
  const raw = localize(lookup(key) || key);
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (params[name] !== undefined ? String(params[name]) : m));
}

// DB 中文枚举 → 显示标签(value.<map>.<中文值>);未映射的值(自由文本)原样返回
function tv(mapName, value) {
  if (value === undefined || value === null || value === '') return '';
  const k = 'value.' + mapName + '.' + value;
  const hit = lookup(k);
  return hit !== undefined ? hit : String(value);
}

// 云函数中文提示 → 本地化文案;未命中回退原文(云函数代码不动)
function cloudMsg(raw) {
  if (!raw) return raw;
  const k = 'cloud.' + raw;
  const hit = lookup(k);
  return hit !== undefined ? hit : raw;
}

// 学校名按语言取主/副行
//   韩国学校:zh→中文+韩文;ko→韩文+中文;en/vi→英文(缺则中文)+韩文/中文
//   中国学校:zh→中文+英文(缺则省份);其他语言→英文+中文(无英文名时中文+省份)
function localizedSchool(s) {
  if (!s) return { nameMain: '', nameSub: '' };
  const cur = getLang();
  if (String(s.id || '').indexOf('cn-') === 0) {
    const prov = s.region ? t('province.' + s.region) : '';
    if (cur === 'zh') return { nameMain: s.nameCn, nameSub: s.nameEn || prov };
    return s.nameEn ? { nameMain: s.nameEn, nameSub: s.nameCn } : { nameMain: s.nameCn, nameSub: prov };
  }
  if (cur === 'ko') return { nameMain: s.nameKr || s.nameCn, nameSub: s.nameCn || '' };
  if (cur === 'en' || cur === 'vi') {
    const main = s.nameEn || s.nameCn;
    return { nameMain: main, nameSub: main === s.nameCn ? s.nameKr || '' : cur === 'vi' ? s.nameKr || '' : s.nameCn || '' };
  }
  return { nameMain: s.nameCn, nameSub: s.nameKr || '' };
}

const __exports = { init, getLang, setLang, detectSystemLang, t, tv, cloudMsg, localizedSchool, LANG_KEY };
export { init, getLang, setLang, detectSystemLang, t, tv, cloudMsg, localizedSchool, LANG_KEY };
export default __exports;
