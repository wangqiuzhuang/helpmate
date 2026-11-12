import __m0_subscribe from '../config/subscribe.js';
// utils/subscribe.js —— 订阅消息授权请求
//
// 时机：用户做了「会收到回复」的动作后（发评论/发私聊），弹出授权，
// 之后对方回复他时才能收到微信服务通知。用户拒绝则静默，不打扰。
const { SUBSCRIBE_TEMPLATES } = __m0_subscribe;

function requestSubscribe(keys) {
  const tmplIds = (keys || []).map((k) => SUBSCRIBE_TEMPLATES[k]).filter(Boolean);
  if (!tmplIds.length) return; // 未配置模板 ID，不弹
  // #ifdef MP-WEIXIN
  uni.requestSubscribeMessage({
    tmplIds,
    success: () => {},
    fail: () => {}, // 用户拒绝或版本不支持，静默
  });
  // #endif
}

const __exports = { requestSubscribe };
export { requestSubscribe };
export default __exports;
