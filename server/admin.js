// admin.js —— HelpMate 管理后台(接口 + 页面),挂在 /api/admin 下(复用 Nginx 现有的 /api/ 转发,无需改 Nginx)
//
//   GET  /api/admin/            后台页面(admin-ui/index.html)
//   GET  /api/admin/vendor/*    页面依赖(Vue / Element Plus,本地文件,不走外部 CDN)
//   POST /api/admin/login       { username, password, code }  → { token }(两步验证:密码 + 验证器动态码)
//   POST /api/admin/call        { action, ... }  请求头 x-admin-token
//   POST /api/admin/upload      公告图片上传(multipart,字段 file)
//
// 管理员账号只能在服务器上用命令创建(admin-cli.js),App 用户无法变成管理员。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const { pinyin } = require('pinyin-pro');
const QRCode = require('qrcode');

let ctx = null; // { db, send, readJson, compressImage, UPLOAD_DIR, PUBLIC_BASE, schoolsChanged }
const UI_DIR = path.join(__dirname, 'admin-ui');
const TOKEN_TTL = 12 * 3600 * 1000;
const now = () => Date.now();

// ---------- 密码 / 令牌 / 动态码 ----------
const hashPassword = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
const safeEq = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of clean) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function base32Encode(buf) {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function totp(secret, step) {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const code = (h.readUInt32BE(o) & 0x7fffffff) % 1000000;
  return String(code).padStart(6, '0');
}
// 允许前后 30 秒的时间误差
function verifyTotp(secret, code) {
  const step = Math.floor(now() / 30000);
  return [-1, 0, 1].some((d) => safeEq(totp(secret, step + d), String(code || '').trim()));
}

async function adminSecret() {
  const col = ctx.db().collection('app_config');
  let d = await col.findOne({ _id: 'admin_secret' });
  if (!d) {
    d = { _id: 'admin_secret', value: crypto.randomBytes(32).toString('hex') };
    await col.updateOne({ _id: 'admin_secret' }, { $setOnInsert: { value: d.value } }, { upsert: true });
    d = await col.findOne({ _id: 'admin_secret' });
  }
  return d.value;
}
async function signToken(username) {
  const exp = now() + TOKEN_TTL;
  const body = Buffer.from(username).toString('base64url') + '.' + exp;
  const sig = crypto.createHmac('sha256', await adminSecret()).update(body).digest('hex');
  return body + '.' + sig;
}
async function verifyToken(token) {
  const [u, exp, sig] = String(token || '').split('.');
  if (!u || !exp || !sig || Number(exp) < now()) return '';
  const want = crypto.createHmac('sha256', await adminSecret()).update(u + '.' + exp).digest('hex');
  if (!safeEq(want, sig)) return '';
  const username = Buffer.from(u, 'base64url').toString();
  const a = await ctx.db().collection('admins').findOne({ _id: username });
  if (!a || a.disabled) return null;
  // 老账号没有 role 字段 = 超级管理员
  const role = a.role === 'school' ? 'school' : 'super';
  return { name: a._id, role, isSuper: role === 'super', schools: role === 'school' ? a.schools || [] : null, tokenAfter: a.tokenAfter || 0, exp: Number(exp) };
}

// ---------- 权限:超级管理员管全部;学校管理员只能管自己负责的学校 ----------
const SUPER_ONLY = ['defaultTools', 'listDeals', 'saveDeal', 'setDealStatus', 'listMerchantSuggestions', 'setMerchantSuggestion', 'listFeedback', 'setFeedback', 'listSchoolRequests', 'approveSchool', 'rejectSchool', 'removeCustomSchool', 'getConfig', 'setConfig', 'listAdmins', 'saveAdmin', 'resetAdmin', 'deleteAdmin'];
const SCHOOL_MAX_BAN_DAYS = 30; // 学校管理员最多封 30 天,永久封禁只有超级管理员能做
const inScope = (me, schoolId) => me.isSuper || (!!schoolId && me.schools.includes(schoolId));
// 查询条件里限定学校:超级管理员可选任一学校,学校管理员只能是自己的学校
function schoolFilter(me, wanted) {
  if (me.isSuper) return wanted ? { schoolId: wanted } : {};
  if (wanted) return me.schools.includes(wanted) ? { schoolId: wanted } : { schoolId: '__none__' };
  return { schoolId: { $in: me.schools } };
}
const NO_SCOPE = '这不在你负责的学校范围内';

// 登录失败限流:同一 IP 15 分钟内最多 8 次
const fails = new Map();
const clientIp = (req) => String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function tooMany(ip) {
  const f = fails.get(ip);
  return f && f.until > now() && f.n >= 8;
}
function addFail(ip) {
  const f = fails.get(ip);
  if (!f || f.until < now()) fails.set(ip, { n: 1, until: now() + 15 * 60 * 1000 });
  else f.n += 1;
}

// ---------- 工具 ----------
const ok = (data) => ({ success: true, ...(data || {}) });
const fail = (message) => ({ success: false, message });
const clampInt = (v, d, max) => Math.min(max, Math.max(0, parseInt(v, 10) || d));
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function log(admin, action, target, detail) {
  await ctx.db().collection('admin_logs').insertOne({ _id: crypto.randomBytes(12).toString('hex'), admin, action, target: target || '', detail: detail || '', createdAt: now() }).catch(() => {});
}
async function usersByIds(ids) {
  const list = await ctx.db().collection('users').find({ _id: { $in: Array.from(new Set(ids.filter(Boolean))) } }, { projection: { nickname: 1, uid: 1, avatarUrl: 1, schoolId: 1, bannedUntil: 1 } }).toArray();
  const map = {};
  list.forEach((u) => (map[u._id] = u));
  return map;
}
const dayStart = (ts) => {
  const d = new Date(ts + 9 * 3600 * 1000); // 按韩国时间切日
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - 9 * 3600 * 1000;
};

// 学校名(看板、列表展示用)
let _names = null;
async function schoolNames() {
  if (!_names) {
    _names = {};
    const kr = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/schools-kr.json'), 'utf8'));
    for (const id of Object.keys(kr)) _names[id] = kr[id].nameCn;
    const cn = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/schools-cn.json'), 'utf8'));
    for (const r of cn.rows) _names['cn-' + r[0]] = r[1];
    setTimeout(() => (_names = null), 10 * 60 * 1000).unref();
  }
  const custom = await ctx.db().collection('custom_schools').find({}, { projection: { nameCn: 1 } }).toArray();
  const out = { ..._names };
  custom.forEach((c) => (out[c._id] = c.nameCn));
  return out;
}

// 学校搜索索引:韩国 261 所(中/韩/英名 + 拼音)+ 中国 2919 所(中/英名 + 拼音)+ 后台新增
let _index = null;
async function schoolIndex() {
  if (!_index) {
    const list = [];
    const kr = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/schools-kr.json'), 'utf8'));
    for (const id of Object.keys(kr)) {
      const k = kr[id];
      list.push({ id, country: 'kr', name: k.nameCn, sub: [k.nameKr, k.nameEn].filter(Boolean).join(' · '), keys: [k.nameCn, k.nameKr, k.nameEn, (k.pinyin || '').replace(/\s+/g, ''), k.initials].join('|').toLowerCase() });
    }
    const cn = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/schools-cn.json'), 'utf8'));
    for (const r of cn.rows) {
      const py = String(r[8] || '');
      list.push({ id: 'cn-' + r[0], country: 'cn', rank: (r[7] || 0) * 2 + (r[5] === 1 ? 1 : 0), name: r[1], sub: [cn.provinces[r[3]], r[2]].filter(Boolean).join(' · '), keys: [r[1], r[2], py.replace(/\s+/g, ''), py.split(' ').map((w) => w[0] || '').join('')].join('|').toLowerCase() });
    }
    _index = list;
    setTimeout(() => (_index = null), 10 * 60 * 1000).unref();
  }
  const custom = await ctx.db().collection('custom_schools').find({}).toArray();
  return _index.concat(custom.map((c) => {
    const py = c.pinyin || '';
    return { id: c._id, country: c.country, name: c.nameCn, sub: [c.region, c.nameKr, c.nameEn].filter(Boolean).join(' · '), keys: [c.nameCn, c.nameKr, c.nameEn, py.replace(/\s+/g, ''), py.split(' ').map((w) => w[0] || '').join('')].join('|').toLowerCase() };
  }));
}

// ---------- 业务动作 ----------
const CONTENT = { posts: 'posts', orders: 'orders', comments: 'comments', moments: 'moments' };

const actions = {
  async me(admin, p, me) {
    const names = await schoolNames();
    return ok({ username: admin, role: me.role, schools: (me.schools || []).map((id) => ({ id, name: names[id] || id })) });
  },

  // 学校搜索(给管理员分配学校、内容/用户筛选用)
  // 可按中文名、韩文名、英文名、拼音、拼音首字母搜索;不输入时先列出有用户的学校
  async searchSchools(admin, p, me) {
    const all = await schoolIndex();
    const kw = String(p.keyword || '').trim().toLowerCase().replace(/\s+/g, '');
    const country = ['kr', 'cn'].includes(p.country) ? p.country : '';
    let pool = me.isSuper ? all : all.filter((x) => me.schools.includes(x.id));
    if (country) pool = pool.filter((x) => x.country === country);
    const flag = { kr: '🇰🇷 ', cn: '🇨🇳 ' };
    const fmt = (x) => ({ id: x.id, country: x.country, name: (flag[x.country] || '') + x.name, sub: x.sub });
    if (!kw) {
      const top = await ctx.db().collection('users').aggregate([{ $match: { schoolId: { $nin: ['', null] } } }, { $group: { _id: '$schoolId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 30 }]).toArray();
      const byId = {};
      pool.forEach((x) => (byId[x.id] = x));
      const hot = top.map((t) => byId[t._id]).filter(Boolean);
      const rest = pool.filter((x) => !hot.includes(x)).slice(0, Math.max(0, 30 - hot.length));
      return ok({ list: hot.concat(rest).map(fmt), total: pool.length });
    }
    // 排序:校名开头命中 > 某个字段完全相等(如拼音首字母)> 其他包含;同档按知名度(985/211/双一流/本科)
    const hits = [];
    for (const x of pool) {
      if (x.keys.indexOf(kw) < 0) continue;
      const fields = x.keys.split('|');
      const score = x.name.toLowerCase().startsWith(kw) ? 0 : fields.includes(kw) ? 1 : fields.some((f) => f.startsWith(kw)) ? 2 : 3;
      hits.push({ x, score });
    }
    hits.sort((a, b) => a.score - b.score || (b.x.rank || 0) - (a.x.rank || 0));
    return ok({ list: hits.slice(0, 50).map((h) => fmt(h.x)), total: hits.length });
  },

  // 自己修改密码(所有管理员)
  async changePassword(admin, p) {
    const a = await ctx.db().collection('admins').findOne({ _id: admin });
    if (!a || !safeEq(hashPassword(p.oldPassword || '', a.salt), a.hash)) return fail('原密码不正确');
    const pw = String(p.newPassword || '');
    if (pw.length < 10) return fail('新密码至少 10 位');
    const salt = crypto.randomBytes(16).toString('hex');
    await ctx.db().collection('admins').updateOne({ _id: admin }, { $set: { salt, hash: hashPassword(pw, salt), tokenAfter: now() } });
    await log(admin, 'admin.password', admin);
    return ok({ note: '已修改，请重新登录' });
  },

  // 数据看板
  async stats(admin, p, me) {
    const db = ctx.db();
    const sf = schoolFilter(me, '');
    const t0 = dayStart(now());
    const days = 14;
    const since = t0 - (days - 1) * 864e5;
    const series = async (col) => {
      const rows = await db.collection(col).aggregate([
        { $match: { createdAt: { $gte: since }, ...sf } },
        { $group: { _id: { $floor: { $divide: [{ $subtract: ['$createdAt', since] }, 864e5] } }, n: { $sum: 1 } } },
      ]).toArray();
      const arr = new Array(days).fill(0);
      rows.forEach((r) => { if (r._id >= 0 && r._id < days) arr[r._id] = r.n; });
      return arr;
    };
    const [users, appAccounts, newToday, new7, posts, orders, comments, pendingReports, pendingFeedback, pendingSchools, banned, sUsers, sPosts, sOrders, byCountry, topSchools, trToday] = await Promise.all([
      db.collection('users').countDocuments(sf),
      me.isSuper ? db.collection('app_accounts').countDocuments() : 0,
      db.collection('users').countDocuments({ createdAt: { $gte: t0 }, ...sf }),
      db.collection('users').countDocuments({ createdAt: { $gte: t0 - 6 * 864e5 }, ...sf }),
      db.collection('posts').countDocuments(sf),
      db.collection('orders').countDocuments(sf),
      db.collection('comments').countDocuments(sf),
      db.collection('reports').countDocuments({ status: 'pending', ...sf }),
      me.isSuper ? db.collection('feedback').countDocuments({ status: { $ne: 'done' } }) : 0,
      me.isSuper ? db.collection('school_requests').countDocuments({ status: { $nin: ['approved', 'rejected'] } }) : 0,
      db.collection('users').countDocuments({ bannedUntil: { $gt: now() }, ...sf }),
      series('users'), series('posts'), series('orders'),
      db.collection('users').aggregate([{ $match: sf }, { $group: { _id: { $arrayElemAt: [{ $split: [{ $ifNull: ['$schoolId', ''] }, '-'] }, 0] }, n: { $sum: 1 } } }]).toArray(),
      db.collection('users').aggregate([{ $match: me.isSuper ? { schoolId: { $nin: ['', null] } } : sf }, { $group: { _id: '$schoolId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]).toArray(),
      me.isSuper ? db.collection('translate_usage').aggregate([{ $match: { createdAt: { $gte: t0 } } }, { $group: { _id: null, n: { $sum: '$count' } } }]).toArray() : [],
    ]);
    const labels = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since + i * 864e5 + 9 * 3600 * 1000);
      labels.push(d.getUTCMonth() + 1 + '/' + d.getUTCDate());
    }
    return ok({
      totals: { users, appAccounts, newToday, new7, posts, orders, comments, pendingReports, pendingFeedback, pendingSchools, banned, translateToday: (trToday[0] && trToday[0].n) || 0 },
      series: { labels, users: sUsers, posts: sPosts, orders: sOrders },
      byCountry: byCountry.map((r) => ({ country: r._id || 'unknown', n: r.n })),
      topSchools: await (async () => {
        const names = await schoolNames();
        return topSchools.map((r) => ({ schoolId: r._id, name: names[r._id] || r._id, n: r.n }));
      })(),
    });
  },

  // ----- 内容管理 -----
  async listContent(admin, p, me) {
    const col = CONTENT[p.type];
    if (!col) return fail('类型不对');
    const q = schoolFilter(me, p.schoolId);
    if (p.keyword) {
      const re = { $regex: escRe(p.keyword), $options: 'i' };
      q.$or = col === 'comments' ? [{ content: re }] : [{ title: re }, { content: re }, { desc: re }, { 'payload.productName': re }];
    }
    if (p.functionId) q.functionId = p.functionId;
    if (p.userId) q[col === 'comments' ? 'userId' : 'publisherId'] = p.userId;
    if (p.filter === 'hidden') q.hidden = true;
    if (p.filter === 'pinned') q.pinned = true;
    const skip = clampInt(p.skip, 0, 1e6);
    const limit = clampInt(p.limit, 20, 100) || 20;
    const [list, total] = await Promise.all([
      ctx.db().collection(col).find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      ctx.db().collection(col).countDocuments(q),
    ]);
    const users = await usersByIds(list.map((d) => d.publisherId || d.userId));
    const names = await schoolNames();
    return ok({
      total,
      list: list.map((d) => ({
        schoolName: names[d.schoolId] || '',
        _id: d._id,
        type: p.type,
        functionId: d.functionId || '',
        schoolId: d.schoolId || '',
        title: d.title || (d.payload && d.payload.productName) || '',
        content: d.content || d.desc || '',
        images: d.images || [],
        status: d.status || '',
        hidden: !!d.hidden,
        pinned: !!d.pinned,
        commentCount: d.commentCount || 0,
        postId: d.postId || '',
        orderId: d.orderId || '',
        createdAt: d.createdAt,
        user: users[d.publisherId || d.userId] || { _id: d.publisherId || d.userId },
      })),
    });
  },

  async setContent(admin, p, me) {
    const col = CONTENT[p.type];
    if (!col || !p.id) return fail('参数不对');
    const db = ctx.db();
    const doc = await db.collection(col).findOne({ _id: p.id });
    if (!doc) return fail('内容不存在');
    if (!inScope(me, doc.schoolId)) return fail(NO_SCOPE);
    const op = p.op;
    if ((op === 'hide' || op === 'delete') && !doc.hidden) await penalizeExp(col, doc);
    if (op === 'hide' || op === 'unhide') await db.collection(col).updateOne({ _id: p.id }, { $set: { hidden: op === 'hide', hiddenAt: now() } });
    else if (op === 'pin' || op === 'unpin') {
      if (col === 'comments') return fail('评论不能置顶');
      await db.collection(col).updateOne({ _id: p.id }, { $set: { pinned: op === 'pin' } });
    } else if (op === 'delete') await deleteContent(col, doc);
    else return fail('操作不对');
    await log(admin, 'content.' + op, col + ':' + p.id, (doc.title || doc.content || doc.desc || '').slice(0, 60));
    return ok();
  },

  // ----- 用户管理 -----
  async listUsers(admin, p, me) {
    const db = ctx.db();
    const q = schoolFilter(me, p.schoolId);
    if (p.keyword) {
      const kw = String(p.keyword).trim();
      const re = { $regex: escRe(kw), $options: 'i' };
      const acc = await db.collection('app_accounts').find({ _id: re }).limit(50).toArray();
      q.$or = [{ nickname: re }, { uid: kw.toUpperCase() }, { _id: kw }, { _id: { $in: acc.map((a) => a.userId) } }];
    }
    if (p.filter === 'banned') q.bannedUntil = { $gt: now() };
    const skip = clampInt(p.skip, 0, 1e6);
    const limit = clampInt(p.limit, 20, 100) || 20;
    const [list, total] = await Promise.all([
      db.collection('users').find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('users').countDocuments(q),
    ]);
    const accs = await db.collection('app_accounts').find({ userId: { $in: list.map((u) => u._id) } }).toArray();
    const accMap = {};
    accs.forEach((a) => (accMap[a.userId] = a._id));
    const names = await schoolNames();
    return ok({
      total,
      list: list.map((u) => ({
        _id: u._id, uid: u.uid, nickname: u.nickname, avatarUrl: u.avatarUrl, schoolId: u.schoolId, schoolName: names[u.schoolId] || '',
        username: accMap[u._id] || '', platform: u._id.indexOf('app_') === 0 ? 'App' : '小程序',
        publishCount: u.publishCount || 0, createdAt: u.createdAt, bannedUntil: u.bannedUntil || 0, banReason: u.banReason || '', deleted: !!u.deleted,
      })),
    });
  },

  async userDetail(admin, p, me) {
    const db = ctx.db();
    const u = await db.collection('users').findOne({ _id: p.id });
    if (!u) return fail('用户不存在');
    if (!inScope(me, u.schoolId)) return fail(NO_SCOPE);
    const [acc, posts, orders, comments, reportsAgainst, reportsBy] = await Promise.all([
      db.collection('app_accounts').findOne({ userId: u._id }),
      db.collection('posts').find({ publisherId: u._id }).sort({ createdAt: -1 }).limit(20).toArray(),
      db.collection('orders').find({ publisherId: u._id }).sort({ createdAt: -1 }).limit(20).toArray(),
      db.collection('comments').find({ userId: u._id }).sort({ createdAt: -1 }).limit(20).toArray(),
      db.collection('reports').countDocuments({ ownerId: u._id }),
      db.collection('reports').countDocuments({ reporterId: u._id }),
    ]);
    const { blocked, ...rest } = u;
    return ok({
      user: { ...rest, username: acc ? acc._id : '', blockedCount: (blocked || []).length },
      posts: posts.map((d) => ({ _id: d._id, title: d.title, content: d.content, hidden: !!d.hidden, createdAt: d.createdAt })),
      orders: orders.map((d) => ({ _id: d._id, functionId: d.functionId, title: d.title || (d.payload && d.payload.productName) || d.desc, status: d.status, hidden: !!d.hidden, createdAt: d.createdAt })),
      comments: comments.map((d) => ({ _id: d._id, content: d.content, hidden: !!d.hidden, createdAt: d.createdAt })),
      reportsAgainst,
      reportsBy,
    });
  },

  async banUser(admin, p, me) {
    const days = Number(p.days);
    const target = await ctx.db().collection('users').findOne({ _id: p.id });
    if (!target) return fail('用户不存在');
    if (!inScope(me, target.schoolId)) return fail(NO_SCOPE);
    if (!me.isSuper && !(days > 0 && days <= SCHOOL_MAX_BAN_DAYS)) return fail('学校管理员最多封禁 ' + SCHOOL_MAX_BAN_DAYS + ' 天，永久封禁请联系超级管理员');
    const until = days > 0 ? now() + days * 864e5 : 9e15; // 0 = 永久
    const r = await ctx.db().collection('users').updateOne({ _id: p.id }, { $set: { bannedUntil: until, banReason: String(p.reason || '').slice(0, 100), bannedBy: admin, bannedAt: now() } });
    if (!r.matchedCount) return fail('用户不存在');
    if (p.hideContent) {
      for (const col of ['posts', 'orders']) await ctx.db().collection(col).updateMany({ publisherId: p.id }, { $set: { hidden: true, hiddenAt: now() } });
      await ctx.db().collection('comments').updateMany({ userId: p.id }, { $set: { hidden: true, hiddenAt: now() } });
    }
    await log(admin, 'user.ban', p.id, (days > 0 ? days + '天' : '永久') + ' ' + (p.reason || '') + (p.hideContent ? ' +隐藏全部内容' : ''));
    return ok();
  },

  async unbanUser(admin, p, me) {
    const target = await ctx.db().collection('users').findOne({ _id: p.id });
    if (!target) return fail('用户不存在');
    if (!inScope(me, target.schoolId)) return fail(NO_SCOPE);
    await ctx.db().collection('users').updateOne({ _id: p.id }, { $set: { bannedUntil: 0, banReason: '' } });
    await log(admin, 'user.unban', p.id);
    return ok();
  },

  // ----- 举报处理 -----
  async listReports(admin, p, me) {
    const q = { status: p.status === 'all' ? { $exists: true } : p.status || 'pending', ...schoolFilter(me, p.schoolId) };
    const skip = clampInt(p.skip, 0, 1e6);
    const [list, total] = await Promise.all([
      ctx.db().collection('reports').find(q).sort({ createdAt: -1 }).skip(skip).limit(20).toArray(),
      ctx.db().collection('reports').countDocuments(q),
    ]);
    const users = await usersByIds(list.flatMap((r) => [r.ownerId, r.reporterId]));
    // 同一对象被举报的次数(帮助判断严重程度)
    const counts = await ctx.db().collection('reports').aggregate([{ $match: { targetId: { $in: list.map((r) => r.targetId) } } }, { $group: { _id: '$targetId', n: { $sum: 1 } } }]).toArray();
    const cnt = {};
    counts.forEach((c) => (cnt[c._id] = c.n));
    return ok({ total, list: list.map((r) => ({ ...r, owner: users[r.ownerId] || { _id: r.ownerId }, reporter: users[r.reporterId] || { _id: r.reporterId }, timesReported: cnt[r.targetId] || 1 })) });
  },

  // decision: dismiss 驳回 / hide 隐藏内容 / delete 删除内容 / ban 封禁发布人(可同时隐藏)
  async resolveReport(admin, p, me) {
    const db = ctx.db();
    const r = await db.collection('reports').findOne({ _id: p.id });
    if (!r) return fail('举报不存在');
    if (!inScope(me, r.schoolId)) return fail(NO_SCOPE);
    if (p.decision === 'ban' && r.ownerId) {
      const b = await actions.banUser(admin, { id: r.ownerId, days: p.days, reason: p.note || '举报处理', hideContent: !!p.hideContent }, me);
      if (!b.success) return b;
    }
    const col = { post: 'posts', order: 'orders', comment: 'comments', message: 'messages', moment: 'moments' }[r.targetType];
    if ((p.decision === 'hide' || p.decision === 'delete') && col) {
      const doc = await db.collection(col).findOne({ _id: r.targetId });
      if (doc) {
        await penalizeExp(col, doc);
        if (p.decision === 'delete') await deleteContent(col, doc);
        else if (col !== 'messages') await db.collection(col).updateOne({ _id: r.targetId }, { $set: { hidden: true, hiddenAt: now() } });
        else await db.collection('messages').deleteOne({ _id: r.targetId });
      }
    }
    const status = p.decision === 'dismiss' ? 'dismissed' : 'resolved';
    // 同一对象的其他待处理举报一起结案
    await db.collection('reports').updateMany({ targetType: r.targetType, targetId: r.targetId, status: 'pending' }, { $set: { status, resolution: p.decision, note: String(p.note || '').slice(0, 200), handledBy: admin, handledAt: now() } });
    await log(admin, 'report.' + p.decision, r.targetType + ':' + r.targetId, p.note || '');
    return ok();
  },

  // ----- 意见反馈 -----
  // ----- 接单员审核 -----
  async listRiders(admin, p, me) {
    const q = { ...schoolFilter(me, p.schoolId), rider: { $exists: true } };
    if (p.status && p.status !== 'all') q['rider.status'] = p.status;
    const skip = clampInt(p.skip, 0, 1e6);
    const [list, total] = await Promise.all([
      ctx.db().collection('users').find(q).sort({ 'rider.appliedAt': -1 }).skip(skip).limit(20).toArray(),
      ctx.db().collection('users').countDocuments(q),
    ]);
    const names = await schoolNames();
    return ok({ total, list: list.map((u) => ({ _id: u._id, uid: u.uid, nickname: u.nickname, schoolName: names[u.schoolId] || '', doneCount: u.doneCount || 0, rider: u.rider })) });
  },
  async setRider(admin, p, me) {
    const db = ctx.db();
    const u = await db.collection('users').findOne({ _id: p.id });
    if (!u || !u.rider) return fail('申请不存在');
    if (!inScope(me, u.schoolId)) return fail(NO_SCOPE);
    if (!['approved', 'rejected', 'revoked'].includes(p.status)) return fail('状态不对');
    const set = { 'rider.status': p.status, 'rider.note': String(p.note || '').slice(0, 100), 'rider.handledBy': admin, 'rider.handledAt': now() };
    if (p.status === 'approved') set['rider.score'] = Math.max(Number(u.rider.score) || 0, 80);
    if (p.status === 'revoked') set['rider.revokedAt'] = now();
    await db.collection('users').updateOne({ _id: p.id }, { $set: set });
    const text = { approved: '你的接单员申请已通过，可以开始接单啦', rejected: '你的接单员申请未通过', revoked: '你的接单资格已被管理员取消' }[p.status] + (p.note ? ':' + p.note : '');
    await db.collection('notifications').insertOne({ _id: crypto.randomBytes(12).toString('hex'), toId: p.id, type: 'rider', fromId: '', refType: 'user', refId: '', text, read: false, createdAt: now() });
    await log(admin, 'rider.' + p.status, p.id, p.note || '');
    return ok();
  },

  // 工具箱默认清单(和 App 端一致,从云函数源码读取,避免两份不同步)
  async defaultTools() {
    try {
      const src = fs.readFileSync(path.join(process.env.FUNC_DIR || path.join(__dirname, '../cloudfunctions/krstuast'), 'index.js'), 'utf8');
      const m = src.match(/const DEFAULT_TOOLS = (\[[\s\S]*?\n\]);/);
      return ok({ list: m ? Function('return ' + m[1])().map((x) => ({ ...x, lang: 'all', sort: 0, enabled: true })) : [] });
    } catch (e) { return ok({ list: [] }); }
  },

  // ---------- 换校审核(学校管理员可审核本校相关的申请,超级管理员全部) ----------
  async listSchoolChanges(admin, p, me) {
    const q = p.status === 'all' ? {} : { status: p.status || 'pending' };
    if (!me.isSuper) q.$or = [{ fromSchoolId: { $in: me.schools } }, { toSchoolId: { $in: me.schools } }];
    const skip = clampInt(p.skip, 0, 1e6);
    const db = ctx.db();
    const [list, total] = await Promise.all([
      db.collection('school_change_requests').find(q).sort({ createdAt: -1 }).skip(skip).limit(20).toArray(),
      db.collection('school_change_requests').countDocuments(q),
    ]);
    const users = await usersByIds(list.map((r) => r.userId));
    const names = await schoolNames();
    return ok({ total, list: list.map((r) => ({ ...r, user: users[r.userId] || { _id: r.userId }, fromName: names[r.fromSchoolId] || r.fromSchoolId || '(无)', toName: names[r.toSchoolId] || r.toSchoolId })) });
  },
  async handleSchoolChange(admin, p, me) {
    const db = ctx.db();
    const r = await db.collection('school_change_requests').findOne({ _id: p.id });
    if (!r) return fail('申请不存在');
    if (r.status !== 'pending') return fail('已经处理过了');
    if (!inScope(me, r.fromSchoolId) && !inScope(me, r.toSchoolId)) return fail(NO_SCOPE);
    const ok2 = p.decision === 'approve';
    await db.collection('school_change_requests').updateOne({ _id: r._id }, { $set: { status: ok2 ? 'approved' : 'rejected', handledBy: admin, handledAt: now(), note: String(p.note || '').slice(0, 200) } });
    if (ok2) await db.collection('users').updateOne({ _id: r.userId }, { $set: { schoolId: r.toSchoolId }, $push: { schoolChanges: now() } });
    const names = await schoolNames();
    const text = (ok2 ? '你的换校申请已通过,学校已改为 ' : '你的换校申请未通过:') + (ok2 ? names[r.toSchoolId] || r.toSchoolId : String(p.note || '请联系管理员'));
    await db.collection('notifications').insertOne({ _id: crypto.randomBytes(12).toString('hex'), toId: r.userId, type: ok2 ? 'school_ok' : 'school_reject', fromId: '', refType: 'user', refId: '', text, read: false, createdAt: now() });
    await log(admin, 'schoolChange.' + (ok2 ? 'approve' : 'reject'), r.userId, r.fromSchoolId + ' -> ' + r.toSchoolId);
    return ok();
  },

  // ---------- 专属折扣 ----------
  async listDeals(admin, p) {
    const q = p.status === 'all' ? { status: { $ne: 'deleted' } } : p.status === 'ended' ? { status: 'ended' } : { status: 'active' };
    const list = await ctx.db().collection('deals').find(q).sort({ sort: -1, createdAt: -1 }).limit(200).toArray();
    const names = await schoolNames();
    const t0 = now() - 7 * 864e5;
    const week = await ctx.db().collection('deal_uses').aggregate([{ $match: { createdAt: { $gte: t0 } } }, { $group: { _id: '$dealId', n: { $sum: 1 } } }]).toArray();
    const wk = {}; week.forEach((w) => (wk[w._id] = w.n));
    return ok({ list: list.map((d) => ({ ...d, week: wk[d._id] || 0, schoolNames: (d.schoolIds || []).map((id) => names[id] || id), expired: !!(d.endAt && d.endAt < now()) })) });
  },
  async saveDeal(admin, p) {
    const d = p.d || {};
    const str = (v, n) => String(v || '').trim().slice(0, n);
    const doc = {
      title: str(d.title, 30), merchant: str(d.merchant, 30), discount: str(d.discount, 20), desc: str(d.desc, 800), address: str(d.address, 80), phone: str(d.phone, 30),
      cover: str(d.cover, 300), country: ['kr', 'cn'].includes(d.country) ? d.country : '', schoolIds: Array.isArray(d.schoolIds) ? d.schoolIds.slice(0, 50).map(String) : [],
      startAt: Number(d.startAt) || 0, endAt: Number(d.endAt) || 0, perDay: clampInt(d.perDay, 1, 99), sort: Number(d.sort) || 0, updatedAt: now(), updatedBy: admin,
    };
    if (!doc.title || !doc.merchant || !doc.discount) return fail('请填写标题、商家和折扣');
    if (!doc.endAt) return fail('请设置结束时间(有始有终)');
    if (doc.endAt < now()) return fail('结束时间不能早于现在');
    const col = ctx.db().collection('deals');
    if (d._id) {
      await col.updateOne({ _id: d._id }, { $set: { ...doc, status: 'active' } });
      await log(admin, 'deal.edit', d._id, doc.title);
    } else {
      const _id = crypto.randomBytes(12).toString('hex');
      await col.insertOne({ _id, ...doc, status: 'active', useCount: 0, viewCount: 0, createdAt: now(), createdBy: admin });
      await log(admin, 'deal.create', _id, doc.title);
    }
    return ok();
  },
  async setDealStatus(admin, p) {
    if (!['ended', 'deleted'].includes(p.status)) return fail('状态不对');
    await ctx.db().collection('deals').updateOne({ _id: p.id }, { $set: { status: p.status, endedAt: now() } });
    await log(admin, 'deal.' + p.status, p.id, '');
    return ok();
  },
  async listMerchantSuggestions(admin, p) {
    const q = p.status === 'all' ? {} : { status: p.status === 'done' ? 'done' : 'open' };
    const skip = clampInt(p.skip, 0, 1e6);
    const [list, total] = await Promise.all([
      ctx.db().collection('merchant_suggestions').find(q).sort({ createdAt: -1 }).skip(skip).limit(20).toArray(),
      ctx.db().collection('merchant_suggestions').countDocuments(q),
    ]);
    const users = await usersByIds(list.map((f) => f.userId));
    const names = await schoolNames();
    // 同名商家被推荐的次数(热度,洽谈时可以参考)
    const agg = await ctx.db().collection('merchant_suggestions').aggregate([{ $group: { _id: '$name', n: { $sum: 1 } } }]).toArray();
    const hot = {}; agg.forEach((a) => (hot[a._id] = a.n));
    return ok({ total, list: list.map((f) => ({ ...f, user: users[f.userId] || { _id: f.userId }, schoolName: names[f.schoolId] || '', times: hot[f.name] || 1 })) });
  },
  async setMerchantSuggestion(admin, p) {
    await ctx.db().collection('merchant_suggestions').updateOne({ _id: p.id }, { $set: { status: p.status === 'done' ? 'done' : 'open', handledNote: String(p.note || '').slice(0, 200), handledBy: admin, handledAt: now() } });
    return ok();
  },
  async listFeedback(admin, p) {
    const q = p.status === 'done' ? { status: 'done' } : p.status === 'all' ? {} : { status: { $ne: 'done' } };
    const skip = clampInt(p.skip, 0, 1e6);
    const [list, total] = await Promise.all([
      ctx.db().collection('feedback').find(q).sort({ createdAt: -1 }).skip(skip).limit(20).toArray(),
      ctx.db().collection('feedback').countDocuments(q),
    ]);
    const users = await usersByIds(list.map((f) => f.userId));
    return ok({ total, list: list.map((f) => ({ ...f, user: users[f.userId] || { _id: f.userId } })) });
  },
  async setFeedback(admin, p) {
    await ctx.db().collection('feedback').updateOne({ _id: p.id }, { $set: { status: p.status === 'done' ? 'done' : 'open', note: String(p.note || '').slice(0, 300), handledBy: admin, handledAt: now() } });
    await log(admin, 'feedback.' + (p.status || 'done'), p.id, p.note || '');
    return ok();
  },

  // ----- 学校申请 -----
  async listSchoolRequests(admin, p) {
    const q = p.status === 'all' ? {} : p.status ? { status: p.status } : { status: { $nin: ['approved', 'rejected'] } };
    const list = await ctx.db().collection('school_requests').find(q).sort({ createdAt: -1 }).limit(100).toArray();
    const provinces = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/schools-cn.json'), 'utf8')).provinces;
    const custom = await ctx.db().collection('custom_schools').find({}).sort({ createdAt: -1 }).limit(200).toArray();
    const krRegions = ['首尔', '京畿·仁川', '江原', '大田·世宗·忠清', '光州·全罗', '釜山·蔚山·大邱·庆尚', '济州'];
    return ok({ list, provinces, krRegions, custom });
  },
  async approveSchool(admin, p) {
    const country = p.country === 'kr' ? 'kr' : 'cn';
    const nameCn = String(p.nameCn || '').trim();
    if (nameCn.length < 2) return fail('请填写中文校名');
    const db = ctx.db();
    const exists = await db.collection('custom_schools').findOne({ country, nameCn });
    if (exists) return fail('这所学校已经添加过了');
    if (country === 'cn') {
      const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/schools-cn.json'), 'utf8'));
      if (base.rows.some((r) => r[1] === nameCn)) return fail('教育部名单里已有这所学校');
      if (!base.provinces.includes(p.region)) return fail('请选择省份');
    } else if (!p.region) return fail('请选择地区');
    const doc = {
      _id: country + '-c' + crypto.randomBytes(4).toString('hex'),
      country,
      nameCn,
      nameEn: String(p.nameEn || '').trim(),
      nameKr: String(p.nameKr || '').trim(),
      region: p.region,
      city: String(p.city || '').trim(),
      type: p.type || (country === 'cn' ? '本科' : '大学'),
      pinyin: pinyin(nameCn, { toneType: 'none', nonZh: 'consecutive' }).toLowerCase(),
      requestId: p.requestId || '',
      createdAt: now(),
      createdBy: admin,
    };
    await db.collection('custom_schools').insertOne(doc);
    if (p.requestId) await db.collection('school_requests').updateOne({ _id: p.requestId }, { $set: { status: 'approved', schoolId: doc._id, handledBy: admin, handledAt: now() } });
    ctx.schoolsChanged();
    await log(admin, 'school.add', doc._id, nameCn);
    return ok({ school: doc });
  },
  async rejectSchool(admin, p) {
    await ctx.db().collection('school_requests').updateOne({ _id: p.id }, { $set: { status: 'rejected', note: String(p.note || '').slice(0, 200), handledBy: admin, handledAt: now() } });
    await log(admin, 'school.reject', p.id, p.note || '');
    return ok();
  },
  async removeCustomSchool(admin, p) {
    await ctx.db().collection('custom_schools').deleteOne({ _id: p.id });
    ctx.schoolsChanged();
    await log(admin, 'school.remove', p.id);
    return ok();
  },

  // ----- 配置:系统设置 / 敏感词 / 公告 / 版本 -----
  async getConfig(admin, p) {
    if (!CONFIG_KEYS.includes(p.key)) return fail('配置项不对');
    const d = await ctx.db().collection('app_config').findOne({ _id: 'cfg_' + p.key });
    return ok({ value: d ? d.value : null, updatedAt: d ? d.updatedAt : 0 });
  },
  async setConfig(admin, p) {
    if (!CONFIG_KEYS.includes(p.key)) return fail('配置项不对');
    const value = CONFIG_CLEAN[p.key](p.value);
    if (typeof value === 'string') return fail(value);
    await ctx.db().collection('app_config').updateOne({ _id: 'cfg_' + p.key }, { $set: { value, updatedAt: now(), updatedBy: admin } }, { upsert: true });
    await log(admin, 'config.' + p.key, '', JSON.stringify(value).slice(0, 200));
    return ok({ value, note: '已保存,App 端 1 分钟内生效' });
  },

  // ----- 管理员账号(仅超级管理员)-----
  async listAdmins() {
    const list = await ctx.db().collection('admins').find({}).sort({ createdAt: 1 }).toArray();
    const names = await schoolNames();
    return ok({
      list: list.map((a) => ({
        username: a._id, role: a.role === 'school' ? 'school' : 'super', note: a.note || '', disabled: !!a.disabled,
        schools: (a.schools || []).map((id) => ({ id, name: names[id] || id })),
        createdAt: a.createdAt || 0, lastLoginAt: a.lastLoginAt || 0, createdBy: a.createdBy || '',
      })),
    });
  },
  // 新建 / 修改:新建时生成随机密码和验证器密钥,只返回这一次
  async saveAdmin(admin, p) {
    const username = String(p.username || '').trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return fail('用户名为 3~20 位字母、数字或下划线');
    const role = p.role === 'super' ? 'super' : 'school';
    const names = await schoolNames();
    const schools = Array.from(new Set((p.schools || []).filter((id) => names[id]))).slice(0, 50);
    if (role === 'school' && !schools.length) return fail('请至少选择一所学校');
    const col = ctx.db().collection('admins');
    const exists = await col.findOne({ _id: username });
    if (p.isNew && exists) return fail('这个用户名已经存在');
    if (!p.isNew && !exists) return fail('管理员不存在');
    if (username === admin && (role !== 'super' || p.disabled)) return fail('不能降级或停用自己');
    const set = { role, schools: role === 'school' ? schools : [], note: String(p.note || '').slice(0, 40), disabled: !!p.disabled, updatedAt: now() };
    if (p.disabled && exists && !exists.disabled) set.tokenAfter = now(); // 停用后立即踢下线
    if (!p.isNew) {
      await col.updateOne({ _id: username }, { $set: set });
      await log(admin, 'admin.update', username, role + ' ' + schools.map((id) => names[id]).join('、') + (p.disabled ? ' 已停用' : ''));
      return ok();
    }
    const cred = newCredentials(username);
    await col.insertOne({ _id: username, ...set, salt: cred.salt, hash: cred.hash, totpSecret: cred.totpSecret, createdAt: now(), createdBy: admin });
    await log(admin, 'admin.create', username, role + ' ' + schools.map((id) => names[id]).join('、'));
    return ok({ credentials: await showCredentials(username, cred) });
  },
  // 忘记密码 / 换手机:重新生成密码和验证器
  async resetAdmin(admin, p) {
    const col = ctx.db().collection('admins');
    const a = await col.findOne({ _id: String(p.username || '') });
    if (!a) return fail('管理员不存在');
    const cred = newCredentials(a._id);
    await col.updateOne({ _id: a._id }, { $set: { salt: cred.salt, hash: cred.hash, totpSecret: cred.totpSecret, tokenAfter: now(), updatedAt: now() } });
    await log(admin, 'admin.reset', a._id);
    return ok({ credentials: await showCredentials(a._id, cred) });
  },
  async deleteAdmin(admin, p) {
    if (p.username === admin) return fail('不能删除自己');
    const a = await ctx.db().collection('admins').findOne({ _id: String(p.username || '') });
    if (!a) return fail('管理员不存在');
    if (a.role !== 'school') {
      const supers = await ctx.db().collection('admins').countDocuments({ role: { $ne: 'school' }, disabled: { $ne: true } });
      if (supers <= 1) return fail('至少保留一个超级管理员');
    }
    await ctx.db().collection('admins').deleteOne({ _id: a._id });
    await log(admin, 'admin.delete', a._id);
    return ok();
  },

  // 下载页二维码(印在海报、发到群里,扫码直接进下载页)
  async downloadQr() {
    const url = (ctx.PUBLIC_BASE || '') + '/api/download';
    const png = await QRCode.toDataURL(url, { width: 640, margin: 2, color: { dark: '#1f1d24', light: '#ffffff' } });
    return ok({ url, png });
  },

  // ----- 操作日志 -----
  async listLogs(admin, p, me) {
    const skip = clampInt(p.skip, 0, 1e6);
    const q = me.isSuper ? (p.admin ? { admin: p.admin } : {}) : { admin };
    const [list, total] = await Promise.all([
      ctx.db().collection('admin_logs').find(q).sort({ createdAt: -1 }).skip(skip).limit(50).toArray(),
      ctx.db().collection('admin_logs').countDocuments(q),
    ]);
    return ok({ list, total });
  },
};

const ISSUER = 'HelpMate Admin';
function newCredentials() {
  const password = crypto.randomBytes(9).toString('base64url'); // 12 位随机密码
  const salt = crypto.randomBytes(16).toString('hex');
  return { password, salt, hash: hashPassword(password, salt), totpSecret: base32Encode(crypto.randomBytes(20)) };
}
async function showCredentials(username, cred) {
  const uri = `otpauth://totp/${encodeURIComponent(ISSUER + ':' + username)}?secret=${cred.totpSecret}&issuer=${encodeURIComponent(ISSUER)}&digits=6&period=30`;
  const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, width: 200 });
  return { username, password: cred.password, secret: cred.totpSecret.replace(/(.{4})/g, '$1 ').trim(), qrSvg };
}

// 违规内容被隐藏/删除:扣回发布时所得经验的两倍(评论按 2 分算),最低 0
async function penalizeExp(col, doc) {
  const owner = doc.publisherId || doc.userId;
  if (!owner || col === 'messages' || doc.expPenalized) return;
  const n = (col === 'comments' ? 2 : Number(doc.expGain) || 0) * 2;
  const db = ctx.db();
  await db.collection(col).updateOne({ _id: doc._id }, { $set: { expPenalized: true } }).catch(() => {});
  if (!n) return;
  const u = await db.collection('users').findOne({ _id: owner });
  if (u) await db.collection('users').updateOne({ _id: owner }, { $set: { exp: Math.max(0, (u.exp || 0) - n) } });
}
async function deleteContent(col, doc) {
  const db = ctx.db();
  await db.collection(col).deleteOne({ _id: doc._id });
  if (col === 'posts') await db.collection('comments').deleteMany({ postId: doc._id });
  if (col === 'orders') await db.collection('comments').deleteMany({ orderId: doc._id });
  if (col === 'moments') await db.collection('comments').deleteMany({ momentId: doc._id });
  if (col === 'comments') {
    if (doc.postId) await db.collection('posts').updateOne({ _id: doc.postId }, { $inc: { commentCount: -1 } });
    if (doc.orderId) await db.collection('orders').updateOne({ _id: doc.orderId }, { $inc: { commentCount: -1 } });
    if (doc.momentId) await db.collection('moments').updateOne({ _id: doc.momentId }, { $inc: { commentCount: -1 } });
  }
}

const CONFIG_KEYS = ['settings', 'sensitive', 'announcements', 'version', 'tools', 'groups'];
const CONFIG_CLEAN = {
  settings(v) {
    v = v || {};
    const n = (x, min, max) => {
      const k = Number(x);
      return k >= min && k <= max ? Math.round(k) : null;
    };
    const out = {
      translateDailyLimit: n(v.translateDailyLimit, 0, 10000),
      listingTtlDays: n(v.listingTtlDays, 1, 365),
      guestMaxItems: n(v.guestMaxItems, 5, 500),
      msgRetentionDays: n(v.msgRetentionDays, 7, 3650),
    };
    for (const k of Object.keys(out)) if (out[k] === null) return '数值超出范围:' + k;
    return out;
  },
  sensitive(v) {
    v = v || {};
    const words = Array.from(new Set((Array.isArray(v.words) ? v.words : String(v.words || '').split(/[\n,，]/)).map((w) => String(w).trim()).filter(Boolean))).slice(0, 5000);
    return { mode: v.mode === 'mask' ? 'mask' : 'block', words };
  },
  announcements(v) {
    if (!Array.isArray(v)) return '格式不对';
    return v.slice(0, 30).map((a) => ({
      id: a.id || crypto.randomBytes(6).toString('hex'),
      title: String(a.title || '').slice(0, 40),
      content: String(a.content || '').slice(0, 500),
      image: /^https:\/\//.test(a.image || '') || /^\/uploads\//.test(a.image || '') ? a.image : '',
      link: /^https?:\/\//.test(a.link || '') ? a.link : '',
      country: ['all', 'kr', 'cn'].includes(a.country) ? a.country : 'all',
      lang: ['all', 'zh', 'en', 'ko', 'vi'].includes(a.lang) ? a.lang : 'all',
      start: a.start || '',
      end: a.end || '',
      sort: Number(a.sort) || 0,
      enabled: a.enabled !== false,
    }));
  },
  groups(v) {
    if (!Array.isArray(v)) return '格式不对';
    for (const g of v) {
      if (!g || !g.name || (!g.qr && !g.link)) return '每个群都要有名称,并上传二维码或填写链接';
      if (!g.schoolId) return '「' + g.name + '」没有选择所属圈子(学校/小区/村庄)';
    }
    const seen = {};
    for (const g of v) if (g.enabled !== false) { if (seen[g.schoolId]) return '「' + (g.schoolName || g.schoolId) + '」配置了不止一个启用中的群,请只保留一个'; seen[g.schoolId] = 1; }
    return v.slice(0, 200).map((g) => ({
      id: g.id || crypto.randomBytes(6).toString('hex'),
      name: String(g.name).slice(0, 30),
      headline: String(g.headline || '').slice(0, 30),
      platform: String(g.platform || '').slice(0, 12),
      qr: /^https:\/\//.test(g.qr || '') || /^\/uploads\//.test(g.qr || '') ? g.qr : '',
      link: /^https?:\/\//.test(g.link || '') ? String(g.link).slice(0, 300) : '',
      note: String(g.note || '').slice(0, 100),
      country: ['all', 'kr', 'cn'].includes(g.country) ? g.country : 'all',
      schoolId: String(g.schoolId || ''),
      schoolName: String(g.schoolName || '').slice(0, 60),
      sort: Number(g.sort) || 0,
      enabled: g.enabled !== false,
    }));
  },
  tools(v) {
    if (!Array.isArray(v)) return '格式不对';
    for (const x of v) if (!/^https?:\/\//.test((x && x.url) || '')) return '链接要以 http:// 或 https:// 开头:' + ((x && x.name) || '');
    return v.slice(0, 100).map((x) => ({
      id: x.id || crypto.randomBytes(6).toString('hex'),
      cat: String(x.cat || '').slice(0, 10),
      name: String(x.name || '').slice(0, 20),
      url: String(x.url).slice(0, 300),
      desc: String(x.desc || '').slice(0, 40),
      icon: String(x.icon || '').slice(0, 4),
      lang: ['all', 'zh', 'en', 'ko', 'vi'].includes(x.lang) ? x.lang : 'all',
      sort: Number(x.sort) || 0,
      enabled: x.enabled !== false,
    }));
  },
  version(v) {
    v = v || {};
    const code = parseInt(v.code, 10) || 0;
    if (code && !/^https?:\/\//.test(v.url || '')) return '请填写下载链接';
    if (v.iosUrl && !/^https:\/\//.test(v.iosUrl)) return 'App Store 链接要以 https:// 开头';
    return { version: String(v.version || '').slice(0, 20), code, minCode: parseInt(v.minCode, 10) || 0, url: String(v.url || ''), iosUrl: String(v.iosUrl || ''), note: String(v.note || '').slice(0, 500) };
  },
};

// ---------- 静态页面 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
function serveStatic(res, rel) {
  const abs = path.resolve(UI_DIR, rel);
  if (!abs.startsWith(UI_DIR + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return ctx.send(res, 404, { message: 'not found' });
  const isHtml = abs.endsWith('.html');
  res.writeHead(200, {
    'content-type': MIME[path.extname(abs)] || 'application/octet-stream',
    'cache-control': isHtml ? 'no-store' : 'public, max-age=86400',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
  });
  fs.createReadStream(abs).pipe(res);
}

async function handleUpload(req, res) {
  const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 10 * 1024 * 1024 } });
  const chunks = [];
  let mime = '';
  let tooLarge = false;
  bb.on('file', (f, file, info) => {
    mime = info.mimeType || '';
    file.on('data', (c) => chunks.push(c));
    file.on('limit', () => (tooLarge = true));
  });
  bb.on('close', async () => {
    if (!chunks.length) return ctx.send(res, 400, { message: '没有收到文件' });
    if (tooLarge) return ctx.send(res, 413, { message: '图片不能超过 10MB' });
    const r = await ctx.compressImage(Buffer.concat(chunks), mime);
    if (!r) return ctx.send(res, 400, { message: '只支持图片' });
    const rel = `admin/${crypto.randomBytes(12).toString('hex')}${r.ext}`;
    fs.mkdirSync(path.join(ctx.UPLOAD_DIR, 'admin'), { recursive: true });
    fs.writeFileSync(path.join(ctx.UPLOAD_DIR, rel), r.buf);
    ctx.send(res, 200, { success: true, url: `${ctx.PUBLIC_BASE}/uploads/${rel}` });
  });
  req.pipe(bb);
}

// ---------- 入口:index.js 在 /api/admin 前缀下调用 ----------
async function handle(req, res, url) {
  const sub = url.replace(/^\/api\/admin\/?/, '');
  if (req.method === 'GET') {
    if (url === '/api/admin') {
      res.writeHead(301, { location: '/api/admin/' });
      return res.end();
    }
    if (sub === '' || sub === 'index.html') return serveStatic(res, 'index.html');
    if (sub.startsWith('vendor/')) return serveStatic(res, sub);
    return ctx.send(res, 404, { message: 'not found' });
  }
  if (req.method !== 'POST') return ctx.send(res, 405, { message: 'method not allowed' });

  if (sub === 'login') {
    const ip = clientIp(req);
    if (tooMany(ip)) return ctx.send(res, 429, fail('尝试次数太多，请 15 分钟后再试'));
    const { username, password, code } = await ctx.readJson(req);
    const a = await ctx.db().collection('admins').findOne({ _id: String(username || '') });
    const good = a && !a.disabled && safeEq(hashPassword(password || '', a.salt), a.hash) && verifyTotp(a.totpSecret, code);
    if (!good) {
      addFail(ip);
      return ctx.send(res, 200, fail('账号、密码或动态码不正确'));
    }
    fails.delete(ip);
    await ctx.db().collection('admins').updateOne({ _id: a._id }, { $set: { lastLoginAt: now(), lastLoginIp: ip } });
    await log(a._id, 'login', '', ip);
    return ctx.send(res, 200, ok({ token: await signToken(a._id), username: a._id, role: a.role === 'school' ? 'school' : 'super' }));
  }

  const me = await verifyToken(req.headers['x-admin-token']);
  if (!me || me.exp - TOKEN_TTL < me.tokenAfter) return ctx.send(res, 401, fail('登录已过期，请重新登录'));
  const admin = me.name;
  if (sub === 'upload') {
    if (!me.isSuper) return ctx.send(res, 200, fail('只有超级管理员可以操作'));
    return handleUpload(req, res);
  }
  if (sub === 'call') {
    const body = await ctx.readJson(req);
    const fn = actions[body.action];
    if (!fn) return ctx.send(res, 200, fail('未知操作'));
    if (!me.isSuper && SUPER_ONLY.includes(body.action)) return ctx.send(res, 200, fail('只有超级管理员可以操作'));
    try {
      return ctx.send(res, 200, await fn(admin, body, me));
    } catch (e) {
      console.error('[admin]', body.action, e);
      return ctx.send(res, 200, fail('服务出错:' + e.message));
    }
  }
  return ctx.send(res, 404, { message: 'not found' });
}

module.exports = { init: (c) => (ctx = c), handle, hashPassword, base32Encode, totp };
