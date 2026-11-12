import __m0_i18n from './i18n.js';
// utils/toast.js —— 统一提示封装(toast(key, params) 自动本地化)
const { t, cloudMsg } = __m0_i18n;

// 文案 key + 插值参数(或直接传已本地化文本)
const toast = (keyOrText, params) => {
  const title = params ? t(keyOrText, params) : (keyOrText && keyOrText.indexOf('.') >= 0 ? t(keyOrText) : keyOrText);
  uni.showToast({ title, icon: 'none' });
};

// 云函数返回的 r.message(中文原文) → 本地化后提示
const toastCloud = (raw) => uni.showToast({ title: cloudMsg(raw), icon: 'none' });

// 成功/失败统一提示(带 🎀 结尾的既有文案风格走各页面 L)
const toastOk = (keyOrText, params) => toast(keyOrText, params);

const __exports = { toast, toastCloud, toastOk };
export { toast, toastCloud, toastOk };
export default __exports;
