// config/app-cloud.js —— App(安卓/iOS) 与 H5 端连接云开发的配置
//
// 小程序端走 wx.cloud,不读本文件;App/H5 端通过腾讯云开发 JS SDK 调用同一个云环境、
// 同一个 krstuast 云函数 —— 小程序用户和 App 用户看到的是同一份数据。
//
// 填写步骤(详见根目录「打包发布说明.md」):
//   1. 打开云开发控制台(https://tcb.cloud.tencent.com)→ 选择环境 cloud1-d0gqil538c98c573e
//   2. 身份认证 → 登录方式 → 开启「匿名登录」
//   3. 环境配置 → 安全来源 → 移动应用 → 添加应用(安卓包名/iOS Bundle ID 与 manifest.json 一致)
//      复制「应用标识」→ appSign;「应用凭证」→ appAccessKey;凭证版本 → appAccessKeyId
//   4. H5 调试时还需在「安全来源 → Web 安全域名」加入 localhost:5173 等
export default {
  env: 'cloud1-d0gqil538c98c573e', // 与 config/env.js 的 dev 环境一致;上线时换成生产环境 ID
  region: 'ap-shanghai', // 环境所在地域,微信云开发默认 ap-shanghai
  appSign: '', // 移动应用标识(App 端必填)
  appAccessKeyId: 1, // 应用凭证版本
  appAccessKey: '', // 应用凭证(App 端必填)
};
