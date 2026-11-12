import __m0_i18n from './i18n.js';
// utils/lang.js —— 语言切换流程(「我的」页设置行与主页顶部按钮共用)
const i18n = __m0_i18n;

const SUPPORTED = [
  { code: 'zh', native: '简体中文', short: '中' },
  { code: 'en', native: 'English', short: 'EN' },
  { code: 'ko', native: '한국어', short: '한' },
  { code: 'vi', native: 'Tiếng Việt', short: 'VI' },
];

// 切换语言:持久化后 reLaunch 到主页,全站页面重建、文案全部重新求值
function switchLang(next) {
  if (!next || next === i18n.getLang()) return;
  i18n.setLang(next);
  uni.reLaunch({ url: '/pages/home/home' });
}

// 原生 ActionSheet 选择(当前项打勾);选项永远用原生名,误设语言也能找回来
function pickLang() {
  const cur = i18n.getLang();
  uni.showActionSheet({
    itemList: SUPPORTED.map((l) => l.native + (l.code === cur ? ' ✓' : '')),
    success: (res) => {
      const next = SUPPORTED[res.tapIndex];
      if (next) switchLang(next.code);
    },
    fail: () => {},
  });
}

const __exports = { SUPPORTED, switchLang, pickLang };
export { SUPPORTED, switchLang, pickLang };
export default __exports;
