// dev-server/server.js —— 本地联调服务器:用内存数据库运行真实的 krstuast 云函数
//   node dev-server/server.js  → http://localhost:8787
//   H5 端 VITE_MOCK=1 时调用这里(App 端令牌登录流程与线上一致),便于浏览器里走查界面
const http = require('http');
const https = require('https');
const path = require('path');
https.request = () => ({ on() {}, write() {}, end() {} }); // 屏蔽意见反馈推送等外网请求
// 云函数里的 require('wx-server-sdk') 指向本地替身
const Module = require('module');
const FAKE = path.join(__dirname, 'fake-wx-server-sdk/index.js');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'wx-server-sdk') return FAKE;
  return origResolve.call(this, request, ...rest);
};
const sdk = require('wx-server-sdk');
const fn = require(path.join(__dirname, '../cloudfunctions/krstuast/index.js'));

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') return res.end();
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { data, openid } = JSON.parse(body || '{}');
        sdk.__setContext({ OPENID: openid || '' });
        const result = await fn.main(data || {});
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ result }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  })
  .listen(process.env.PORT || 8787, () => console.log('krstuast dev server on', process.env.PORT || 8787));
