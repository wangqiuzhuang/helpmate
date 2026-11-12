
// config/subscribe.js —— 订阅消息模板 ID 配置（客户端）
//
// 在微信公众平台（mp.weixin.qq.com）→「订阅消息」→「公共模板库」选用模板后，
// 把模板 ID 填到对应位置。留空 = 对应场景不弹订阅授权、不推送。
// 注意：普通类目为「一次性订阅」，用户每授权一次可推送一条。
// 改完这里后，还需同步修改云函数 krstuast/index.js 顶部的 SUBSCRIBE_TEMPLATES。
const __exports = {
  SUBSCRIBE_TEMPLATES: {
    comment: '', // 帖子/订单收到新评论提醒（建议「评论回复通知」类模板）
    chat: '',    // 收到私聊消息提醒（建议「新消息通知」类模板）
  },
};
export const { SUBSCRIBE_TEMPLATES } = __exports;
export default __exports;
