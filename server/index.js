// server/index.js —— krstuast 自建后端:MongoDB + 原云函数业务逻辑
//
//   POST /api/call     { name: 'krstuast', data }      → { result }   (等价于 wx.cloud.callFunction)
//   POST /api/upload   multipart(file),header x-token → { fileID }   (等价于 wx.cloud.uploadFile)
//   GET  /api/healthz
// 图片保存在 UPLOAD_DIR,由 Nginx 以 /uploads/ 直接提供访问
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const Module = require('module');
const Busboy = require('busboy');
const sharp = require('sharp');
const { WebSocketServer } = require('ws');
const admin = require('./admin');

// 云函数里的 require('wx-server-sdk') 指向 MongoDB 实现
const SDK = path.join(__dirname, 'lib/wx-server-sdk-mongo.js');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'wx-server-sdk') return SDK;
  return origResolve.call(this, request, ...rest);
};
const sdk = require('wx-server-sdk');

const PORT = Number(process.env.PORT || 8095);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MONGO_DB = process.env.MONGO_DB || 'krstuast';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const PUBLIC_BASE = (process.env.PUBLIC_BASE || '').replace(/\/$/, ''); // 如 https://kr.new-apis.com
const FUNC_DIR = process.env.FUNC_DIR || path.join(__dirname, 'cloudfunctions/krstuast');
const MAX_UPLOAD = 10 * 1024 * 1024;
const MSG_RETENTION_DAYS = Number(process.env.MSG_RETENTION_DAYS || 180); // 私聊消息保留天数,超期自动删除
const MAX_BODY = 1024 * 1024;

const send = (res, code, obj) => {
  if (res.headersSent) return;
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

// ---------- 学校名单 ----------
// 中国:教育部名单(data/schools-cn.json)+ 后台新增;韩国:名单随 App 打包,这里只下发后台新增的学校
const SCHOOL_BASE = { cn: path.join(__dirname, 'data/schools-cn.json') };
const schoolCache = {};
const schoolsChanged = () => Object.keys(schoolCache).forEach((k) => delete schoolCache[k]);
async function loadSchools(country) {
  if (!['cn', 'kr'].includes(country)) return null;
  if (schoolCache[country]) return schoolCache[country];
  const custom = await sdk.__db().collection('custom_schools').find({ country }).sort({ createdAt: 1 }).toArray().catch(() => []);
  let data;
  if (country === 'cn') {
    data = JSON.parse(fs.readFileSync(SCHOOL_BASE.cn, 'utf8'));
    for (const c of custom) {
      const prov = data.provinces.indexOf(c.region);
      if (prov < 0) continue;
      data.rows.push([c._id.slice(3), c.nameCn, c.nameEn || '', prov, c.city || '', c.type === '专科' ? 2 : 1, 0, 0, c.pinyin || '']);
    }
  } else {
    data = {
      country: 'kr',
      extra: custom.map((c) => ({ id: c._id, nameCn: c.nameCn, nameKr: c.nameKr || '', nameEn: c.nameEn || '', region: c.region, type: c.type || '大学', pinyin: (c.pinyin || '').trim() })),
    };
  }
  const last = custom.length ? custom[custom.length - 1].createdAt : 0;
  data.version = (data.version || 'base') + (custom.length ? '+' + custom.length + '.' + last : '');
  const raw = Buffer.from(JSON.stringify(data));
  return (schoolCache[country] = { raw, gz: zlib.gzipSync(raw), version: data.version, etag: '"' + crypto.createHash('md5').update(raw).digest('hex').slice(0, 16) + '"' });
}
async function sendSchools(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const c = await loadSchools(q.get('country') || '');
  if (!c) return send(res, 404, { message: 'unknown country' });
  // ?meta=1 只返回版本号,App 用来判断本地缓存是否需要更新
  if (q.get('meta')) return send(res, 200, { version: c.version });
  if (req.headers['if-none-match'] === c.etag) {
    res.writeHead(304, { etag: c.etag });
    return res.end();
  }
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache',
    etag: c.etag,
    ...(gz ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}),
  });
  res.end(gz ? c.gz : c.raw);
}

let fn = null;
const callFn = (data) => sdk.__runWithContext({ OPENID: '' }, () => fn.main(data || {}));

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}


// 上传:先读入内存(≤10MB),再统一压缩——自动旋转、最长边 1600px、转 JPEG(质量 80);GIF 原样保存
// 头像等小图也走同一流程;压缩后单张通常 100~300KB
const MAX_SIDE = 1600;
// 另存一张列表用缩略图(最长边 400px,约 20~40KB):同名加 _s 后缀,列表/信息流优先加载它
const THUMB_SIDE = 400;
async function compressImage(buf, mime) {
  if (mime === 'image/gif') return { buf, ext: '.gif' };
  try {
    const base = sharp(buf, { failOn: 'none' }).rotate();
    const [out, thumb] = await Promise.all([
      base.clone().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer(),
      base.clone().resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer(),
    ]);
    return { buf: out, thumb, ext: '.jpg' };
  } catch (e) {
    return null; // 不是有效图片
  }
}

async function handleUpload(req, res) {
  const token = req.headers['x-token'] || '';
  const who = await callFn({ action: 'whoami', _appToken: token });
  if (!who || !who.success) return send(res, 401, { message: '未登录', code: 'NO_AUTH' });
  const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_UPLOAD } });
  let gotFile = false;
  let tooLarge = false;
  const chunks = [];
  let mime = '';
  bb.on('file', (field, file, info) => {
    gotFile = true;
    mime = info.mimeType || '';
    file.on('data', (c) => chunks.push(c));
    file.on('limit', () => {
      tooLarge = true;
      file.resume();
    });
  });
  bb.on('close', async () => {
    try {
      if (!gotFile) return send(res, 400, { message: '没有收到文件' });
      if (tooLarge) return send(res, 413, { message: '图片不能超过 10MB' });
      const r = await compressImage(Buffer.concat(chunks), mime);
      if (!r) return send(res, 400, { message: '只支持图片' });
      const month = new Date().toISOString().slice(0, 7).replace('-', '');
      const rel = `${month}/${crypto.randomBytes(12).toString('hex')}${r.ext}`;
      const abs = path.join(UPLOAD_DIR, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, r.buf);
      if (r.thumb) fs.writeFileSync(abs.replace(/\.jpg$/, '_s.jpg'), r.thumb);
      try {
        await sdk.__db().collection('files').insertOne({ _id: rel, owner: who.userId, size: r.buf.length, createdAt: Date.now() });
      } catch (e) {}
      send(res, 200, { fileID: `${PUBLIC_BASE}/uploads/${rel}` });
    } catch (e) {
      console.error('[upload]', e);
      send(res, 500, { message: '上传失败' });
    }
  });
  req.pipe(bb);
}

const server = http.createServer(async (req, res) => {
  // CORS:H5 端浏览器访问需要;App/小程序不受影响
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-token');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  try {
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && url === '/api/healthz') return send(res, 200, { ok: true });
    // 海报用二维码:/api/qrcode?text=...(只允许本站链接,防滥用)
    if (req.method === 'GET' && url === '/api/qrcode') {
      const text = String(new URL(req.url, 'http://x').searchParams.get('text') || '').slice(0, 300);
      if (!/^https:\/\/[a-z0-9.-]*new-apis\.com\//.test(text)) return send(res, 400, { message: 'bad text' });
      const buf = await require('qrcode').toBuffer(text, { width: 360, margin: 1 });
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
      return res.end(buf);
    }
    if (req.method === 'POST' && url === '/api/call') {
      const { name, data } = await readJson(req);
      if (name && name !== 'krstuast') return send(res, 404, { message: 'unknown function' });
      const result = await callFn(data);
      send(res, 200, { result });
      // 实时消息:私聊发送成功后,经 WebSocket 推给会话双方(发送者的其他设备也同步)
      if (data && data.action === 'sendMessage' && result && result.success) pushNewMessage(data.convId, result.message).catch(() => {});
      return;
    }
    if (req.method === 'POST' && url === '/api/upload') return await handleUpload(req, res);
    // 学校名单(中国高校 2919 所等):静态 JSON,按版本号缓存;App 首次用到时下载并存本地
    if (req.method === 'GET' && url === '/api/schools') return await sendSchools(req, res);
    // 下载页:扫码后自动识别安卓 / iPhone / 微信内打开
    if (req.method === 'GET' && (url === '/api/download' || url === '/api/download/')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      return fs.createReadStream(path.join(__dirname, 'download.html')).pipe(res);
    }
    // 管理后台
    if (url === '/api/admin' || url.startsWith('/api/admin/')) return await admin.handle(req, res, url);
    // 图片访问:正式环境由 Nginx 直接提供;用 IP:端口 直连测试时由这里兜底
    if (req.method === 'GET' && url.startsWith('/uploads/')) {
      const rel = decodeURIComponent(url.slice('/uploads/'.length));
      const abs = path.resolve(UPLOAD_DIR, rel);
      if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep) || !fs.existsSync(abs)) return send(res, 404, { message: 'not found' });
      const type = { '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic' }[path.extname(abs)] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable' });
      return fs.createReadStream(abs).pipe(res);
    }
    send(res, 404, { message: 'not found' });
  } catch (e) {
    console.error('[server]', e);
    if (!res.headersSent) send(res, 500, { message: '服务开小差了' });
  }
});

// ---------- 实时消息(WebSocket /ws?token=…)----------
// 只负责「通知」:客户端收到后按会话增量拉取,消息本身仍以数据库为准;断线时客户端退回低频轮询
const sockets = new Map(); // userId → Set<ws>
const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });

server.on('upgrade', async (req, socket, head) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/ws') return socket.destroy();
    const who = await callFn({ action: 'whoami', _appToken: u.searchParams.get('token') || '' });
    if (!who || !who.success) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = who.userId;
      ws.alive = true;
      if (!sockets.has(ws.userId)) sockets.set(ws.userId, new Set());
      sockets.get(ws.userId).add(ws);
      ws.on('pong', () => (ws.alive = true));
      ws.on('message', (buf) => {
        if (String(buf) === 'ping') ws.send('pong'); // 客户端心跳(小程序/App 无法发协议层 ping)
      });
      ws.on('close', () => {
        const set = sockets.get(ws.userId);
        if (set) {
          set.delete(ws);
          if (!set.size) sockets.delete(ws.userId);
        }
      });
    });
  } catch (e) {
    socket.destroy();
  }
});

// 30 秒心跳:清理已断开的连接
setInterval(() => {
  for (const set of sockets.values()) {
    for (const ws of set) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      try {
        ws.ping();
      } catch (e) {}
    }
  }
}, 30000).unref();

async function pushNewMessage(convId, message) {
  const conv = await sdk.__db().collection('conversations').findOne({ _id: convId });
  if (!conv) return;
  const payload = JSON.stringify({ type: 'message', convId, message });
  for (const uid of conv.members || []) {
    for (const ws of sockets.get(uid) || []) {
      if (ws.readyState === 1) ws.send(payload);
    }
  }
}

// ---------- 私聊消息定期清理(省空间)----------
async function cleanupMessages() {
  const d = sdk.__db();
  const cfg = await d.collection('app_config').findOne({ _id: 'cfg_settings' }).catch(() => null);
  const days = Number(cfg && cfg.value && cfg.value.msgRetentionDays) || MSG_RETENTION_DAYS;
  if (!(days > 0)) return;
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const m = await d.collection('messages').deleteMany({ createdAt: { $lt: cutoff } });
  const c = await d.collection('conversations').deleteMany({ lastMsgAt: { $lt: cutoff } });
  if (m.deletedCount || c.deletedCount) console.log(`[cleanup] messages -${m.deletedCount}, conversations -${c.deletedCount}`);
}

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

(async () => {
  if (global.__KRSTUAST_TEST_DB__) sdk.__useDb(global.__KRSTUAST_TEST_DB__);
  else await sdk.__connect(MONGO_URI, MONGO_DB);
  fn = require(FUNC_DIR);
  const d = sdk.__db();
  admin.init({ db: () => sdk.__db(), send, readJson, compressImage, UPLOAD_DIR, PUBLIC_BASE, schoolsChanged });
  // 常用查询索引(幂等)
  await Promise.all([
    d.collection('orders').createIndex({ schoolId: 1, functionId: 1, createdAt: -1 }),
    d.collection('orders').createIndex({ publisherId: 1, createdAt: -1 }),
    d.collection('posts').createIndex({ schoolId: 1, functionId: 1, createdAt: -1 }),
    d.collection('comments').createIndex({ postId: 1, createdAt: 1 }),
    d.collection('comments').createIndex({ orderId: 1, createdAt: 1 }),
    d.collection('messages').createIndex({ convId: 1, createdAt: -1 }),
    d.collection('messages').createIndex({ createdAt: 1 }),
    d.collection('contacts').createIndex({ userId: 1, refType: 1, createdAt: -1 }),
    d.collection('posts').createIndex({ schoolId: 1, createdAt: -1, commentCount: -1 }),
    d.collection('conversations').createIndex({ members: 1 }),
    d.collection('users').createIndex({ uid: 1 }),
    d.collection('app_accounts').createIndex({ userId: 1 }),
    d.collection('orders').createIndex({ country: 1, createdAt: -1 }),
    d.collection('posts').createIndex({ country: 1, createdAt: -1 }),
    d.collection('translations').createIndex({ ttlAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 }),
    d.collection('translate_usage').createIndex({ ttlAt: 1 }, { expireAfterSeconds: 3 * 24 * 3600 }),
    d.collection('reports').createIndex({ status: 1, createdAt: -1 }),
    d.collection('reports').createIndex({ targetId: 1 }),
    d.collection('admin_logs').createIndex({ createdAt: -1 }),
    d.collection('comments').createIndex({ schoolId: 1, createdAt: -1 }),
    d.collection('reports').createIndex({ schoolId: 1, status: 1 }),
    d.collection('users').createIndex({ createdAt: -1 }),
  ]).catch((e) => console.warn('index', e.message));
  // 数据迁移(幂等):闲置/租房/兼职/交友/陪玩老单补默认下架时间(从现在起 30 天)
  {
    const ttl = Number(process.env.LISTING_TTL_DAYS || 30);
    const at = new Date(Date.now() + 9 * 3600 * 1000 + ttl * 864e5).toISOString().slice(0, 16).replace('T', ' ');
    await d.collection('orders').updateMany(
      { functionId: { $in: ['secondhand', 'housing', 'parttime', 'friends', 'companion'] }, status: { $in: ['pending', 'active'] }, $or: [{ autoDelistAt: '' }, { autoDelistAt: { $exists: false } }] },
      { $set: { autoDelistAt: at } }
    ).catch((e) => console.warn('migrate ttl', e.message));
  }
  // 数据迁移(幂等):评论、举报补 schoolId(学校管理员按学校管理)
  try {
    const cs = await d.collection('comments').find({ schoolId: { $exists: false } }).limit(20000).toArray();
    for (const c of cs) {
      const parent = c.postId ? await d.collection('posts').findOne({ _id: c.postId }) : c.orderId ? await d.collection('orders').findOne({ _id: c.orderId }) : null;
      await d.collection('comments').updateOne({ _id: c._id }, { $set: { schoolId: (parent && parent.schoolId) || '' } });
    }
    const rs = await d.collection('reports').find({ schoolId: { $exists: false } }).limit(20000).toArray();
    for (const r of rs) {
      const u = r.ownerId ? await d.collection('users').findOne({ _id: r.ownerId }) : null;
      await d.collection('reports').updateOne({ _id: r._id }, { $set: { schoolId: (u && u.schoolId) || '' } });
    }
  } catch (e) {
    console.warn('migrate schoolId', e.message);
  }
  // 数据迁移(幂等):老数据补 country 字段 —— 学校 ID 前缀 kr-/cn- 即国家
  for (const col of ['orders', 'posts', 'users']) {
    for (const cc of ['kr', 'cn']) {
      await d.collection(col).updateMany({ country: { $exists: false }, schoolId: { $regex: '^' + cc + '-' } }, { $set: { country: cc } }).catch((e) => console.warn('migrate', e.message));
    }
  }
  server.listen(PORT, () => console.log(`krstuast server on :${PORT}, db=${MONGO_DB}, msg retention ${MSG_RETENTION_DAYS}d`));
  cleanupMessages().catch((e) => console.warn('cleanup', e.message));
  setInterval(() => cleanupMessages().catch((e) => console.warn('cleanup', e.message)), 12 * 3600 * 1000).unref();
  // 接单员:长时间不流转扣分(每 30 分钟)
  process.env.KR_SYS_TOKEN = process.env.KR_SYS_TOKEN || crypto.randomBytes(16).toString('hex');
  setInterval(() => callFn({ action: 'riderSweep', _sys: process.env.KR_SYS_TOKEN }).catch((e) => console.warn('riderSweep', e.message)), 30 * 60 * 1000).unref();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
