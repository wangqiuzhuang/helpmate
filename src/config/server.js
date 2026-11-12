// config/server.js —— 自建后端地址(填写后,小程序与 App 都改为调用你自己的服务器 + MongoDB)
//
//   ''                         → 不使用自建后端:小程序走 wx.cloud,App 走腾讯云开发 SDK
//   'http://VPS_IP:8095'       → 临时测试(明文 HTTP;小程序真机不可用,仅 App/开发者工具)
//   'https://kr.new-apis.com'  → 正式使用(HTTPS;小程序需在后台配置 request/uploadFile 合法域名)
export default {
  base: import.meta.env.VITE_SERVER_BASE || 'https://helpmate.new-apis.com', // 正式域名(HTTPS);旧 IP http://46.250.251.251:8095 仅过渡期保留
};
