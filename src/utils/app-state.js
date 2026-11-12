// utils/app-state.js —— 全局状态(原 app.js 的 globalData + 学校/语言持久化方法)
//
// 原小程序页面里 `const app = getApp()` 统一改为引入本模块:
// App/H5 端页面模块会在 App 实例创建前求值,模块顶层 getApp() 拿不到实例。
import { findSchool, countryOf, getCountry, setCountry, ensureSchools } from './school-data.js';
import { resolveEnv } from '../config/env.js';
import i18n from './i18n.js';

const SCHOOL_KEY = 'krstuast_school_v1';

const appState = {
  globalData: {
    school: null, // { id, nameCn, nameKr, nameEn, region }
    country: '', // kr / cn
    lang: 'zh',
    cloudEnv: '',
  },
  _privacyResolve: null,

  // App.vue onLaunch 调用
  launch() {
    this.globalData.lang = i18n.init();
    this.globalData.cloudEnv = resolveEnv();
    this.readSchool();
    // 中国高校名单:有缓存直接用,并在后台检查是否有新版本
    ensureSchools(this.globalData.country || 'kr').catch(() => {}); // 中国名单 / 韩国新增学校:后台检查更新

    // #ifdef MP-WEIXIN
    // 隐私合规:调用隐私接口(选图/头像/昵称)前微信触发此回调,由当前页面弹出隐私同意框
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization((resolve) => {
        this._privacyResolve = resolve;
        const pages = getCurrentPages();
        const page = pages[pages.length - 1];
        const vm = page && (page.$vm || page);
        if (vm && typeof vm.openPrivacyPopup === 'function') {
          vm.openPrivacyPopup();
        } else if (resolve) {
          resolve({ event: 'disagree' });
        }
      });
    }
    // #endif
  },

  resolvePrivacy(agree) {
    if (this._privacyResolve) {
      this._privacyResolve({ event: agree ? 'agree' : 'disagree' });
      this._privacyResolve = null;
    }
  },

  readSchool() {
    let raw = null;
    try {
      raw = uni.getStorageSync(SCHOOL_KEY);
    } catch (e) {
      raw = null;
    }
    this.globalData.country = getCountry();
    if (raw && raw.id) {
      // 中国学校名单可能尚未下载:本地存的学校信息本身就够用
      const school = findSchool(raw.id) || (countryOf(raw.id) === 'cn' && raw.nameCn ? raw : null);
      if (school) {
        this.globalData.school = {
          id: school.id,
          nameCn: school.nameCn,
          nameKr: school.nameKr || '',
          nameEn: school.nameEn || '',
          region: school.region || '',
        };
        return this.globalData.school;
      }
    }
    this.globalData.school = null;
    return null;
  },

  setSchool(school) {
    if (school && school.id) {
      const full = findSchool(school.id) || school;
      this.globalData.school = {
        id: full.id,
        nameCn: full.nameCn,
        nameKr: full.nameKr || '',
        nameEn: full.nameEn || '',
        region: full.region || '',
      };
      uni.setStorageSync(SCHOOL_KEY, this.globalData.school);
      this.globalData.country = setCountry(countryOf(full.id));
    } else {
      // 记住切换前的学校:换校被限制时可以恢复
      if (this.globalData.school) uni.setStorageSync('krstuast_prev_school', this.globalData.school);
      this.globalData.school = null;
      uni.removeStorageSync(SCHOOL_KEY);
    }
    return this.globalData.school;
  },

  getCountry() {
    return this.globalData.country || getCountry();
  },

  setCountry(c) {
    this.globalData.country = setCountry(c);
    return this.globalData.country;
  },

  readLang() {
    this.globalData.lang = i18n.getLang();
    return this.globalData.lang;
  },

  setLang(l) {
    i18n.setLang(l);
    this.globalData.lang = i18n.getLang();
    return this.globalData.lang;
  },
};

// 方法绑定 this,允许 `const { setSchool } = app` 这类解构调用
for (const k of Object.keys(appState)) {
  if (typeof appState[k] === 'function') appState[k] = appState[k].bind(appState);
}

export default appState;
