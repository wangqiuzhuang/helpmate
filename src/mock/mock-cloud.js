// mock/mock-cloud.js —— 仅 H5 + VITE_MOCK=1:把云函数调用转发到本地联调服务器(dev-server/server.js)
// 用于在浏览器里走查界面;打包 App/小程序时不会编入
const BASE = import.meta.env.VITE_MOCK_SERVER || 'http://localhost:8787';

export default {
  callFunction({ name, data }) {
    return fetch(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, data }),
    }).then((r) => r.json());
  },
  // 本地预览:图片不上传,直接用本地临时地址
  uploadFile({ filePath }) {
    return Promise.resolve({ fileID: filePath });
  },
};
