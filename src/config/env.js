
// config/env.js —— 云环境配置（开发环境 / 生产环境分离）
//
// 使用方式：
//   1. 云开发控制台新建第二个云环境（基础套餐，约 20 元/月）作为生产环境
//   2. 把生产环境 ID 填入下面的 prod
//   3. 两个环境分别部署 cloudfunctions/krstuast 和 initSchools
//      （DevTools 右键云函数 → 上传并部署 → 选择目标环境）
//   4. 之后无需任何手动切换：开发者工具/真机调试自动连 dev，
//      上传体验版/正式版自动连 prod
//
// 云函数内部使用 DYNAMIC_CURRENT_ENV，数据库集合自动创建，
// 两个环境完全独立（数据、云存储互不影响）。
const ENV = {
  dev: 'cloud1-d0gqil538c98c573e', // 测试环境（当前免费环境）
  prod: '', // 生产环境 ID（新建第二个环境后填入）
};

// 按小程序运行环境自动选择云环境：
//   develop（开发版）→ dev；trial/release（体验版/正式版）→ prod
const resolveEnv = () => {
  let envVersion = 'develop';
  // #ifdef MP-WEIXIN
  try {
    envVersion = (uni.getAccountInfoSync().miniProgram || {}).envVersion || 'develop';
  } catch (e) {
    // 获取失败按开发环境处理
  }
  // #endif
  // #ifndef MP-WEIXIN
  // App/H5:本地调试(npm run dev / HBuilderX 运行)→ dev;发行打包 → prod(未填时回退 dev)
  envVersion = process.env.NODE_ENV === 'development' ? 'develop' : 'release';
  // #endif
  return (envVersion === 'develop' ? ENV.dev : ENV.prod) || ENV.dev;
};

const __exports = { ENV, resolveEnv };
export { ENV, resolveEnv };
export default __exports;
