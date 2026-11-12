// lib/wx-server-sdk-mongo.js —— 用 MongoDB 实现 wx-server-sdk 中 krstuast 用到的接口
//
// 目的:云函数 cloudfunctions/krstuast/index.js 一行业务代码都不改,直接跑在自己的服务器上。
//   db.collection(x).where({...}).orderBy().skip().limit().get()/count()/update()/remove()
//   db.collection(x).doc(id).get()/update()/set()/remove()、add()、createCollection()
//   db.command: in / all / inc / neq / gt / gte / lt / lte / nin / push / pull / remove
//   getWXContext():OPENID 由 HTTP 服务按请求注入(AsyncLocalStorage,并发安全)
//   openapi.subscribeMessage.send:调用微信 HTTP 接口(需要 WX_APPID / WX_SECRET)
const { MongoClient } = require('mongodb');
const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const als = new AsyncLocalStorage();
let client = null;
let mdb = null;

async function connect(uri, dbName) {
  client = new MongoClient(uri, { maxPoolSize: 20 });
  await client.connect();
  mdb = client.db(dbName);
  return mdb;
}

class Cmd {
  constructor(op, v) {
    this.op = op;
    this.v = v;
  }
}
const command = {
  in: (v) => new Cmd('in', v), nin: (v) => new Cmd('nin', v), all: (v) => new Cmd('all', v),
  neq: (v) => new Cmd('neq', v), gt: (v) => new Cmd('gt', v), gte: (v) => new Cmd('gte', v),
  lt: (v) => new Cmd('lt', v), lte: (v) => new Cmd('lte', v),
  inc: (v) => new Cmd('inc', v), push: (v) => new Cmd('push', v), pull: (v) => new Cmd('pull', v),
  remove: () => new Cmd('remove'),
};
const QUERY_OP = { in: '$in', nin: '$nin', all: '$all', neq: '$ne', gt: '$gt', gte: '$gte', lt: '$lt', lte: '$lte' };
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Cmd) && !(v instanceof Date) && !(v instanceof RegExp);

// where 条件:嵌套对象按「点路径」匹配(与云数据库语义一致),命令对象转 Mongo 操作符
function toFilter(where, prefix = '', out = {}) {
  for (const k of Object.keys(where || {})) {
    const v = where[k];
    const key = prefix + k;
    if (v instanceof Cmd) {
      if (!QUERY_OP[v.op]) throw new Error('unsupported query command ' + v.op);
      out[key] = { ...(out[key] || {}), [QUERY_OP[v.op]]: v.v };
    } else if (isPlain(v)) toFilter(v, key + '.', out);
    else out[key] = v;
  }
  return out;
}

// update:嵌套对象局部合并(点路径 $set),命令对象转 $inc/$push/$pull/$unset
function toUpdate(data) {
  const u = {};
  const add = (op, k, v) => ((u[op] = u[op] || {})[k] = v);
  const walk = (obj, prefix) => {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const key = prefix + k;
      if (key === '_id') continue;
      if (v instanceof Cmd) {
        if (v.op === 'inc') add('$inc', key, v.v);
        else if (v.op === 'push') add('$push', key, { $each: Array.isArray(v.v) ? v.v : [v.v] });
        else if (v.op === 'pull') add('$pull', key, v.v instanceof Cmd ? toFilter({ x: v.v }).x : v.v);
        else if (v.op === 'remove') add('$unset', key, '');
        else throw new Error('unsupported update command ' + v.op);
      } else if (isPlain(v) && Object.keys(v).length) walk(v, key + '.');
      else add('$set', key, v);
    }
  };
  walk(data || {}, '');
  return u;
}

const genId = () => crypto.randomBytes(12).toString('hex');

class Query {
  constructor(name, where = {}, sort = [], skipN = 0, limitN = 0) {
    Object.assign(this, { name, w: where, sortList: sort, skipN, limitN });
  }
  get col() {
    return mdb.collection(this.name);
  }
  where(w) {
    return new Query(this.name, { ...this.w, ...w }, this.sortList, this.skipN, this.limitN);
  }
  orderBy(f, dir) {
    return new Query(this.name, this.w, [...this.sortList, [f, dir === 'desc' ? -1 : 1]], this.skipN, this.limitN);
  }
  skip(n) {
    return new Query(this.name, this.w, this.sortList, Number(n) || 0, this.limitN);
  }
  limit(n) {
    return new Query(this.name, this.w, this.sortList, this.skipN, Number(n) || 0);
  }
  field() {
    return this;
  }
  async get() {
    let cur = this.col.find(toFilter(this.w));
    if (this.sortList.length) cur = cur.sort(this.sortList);
    if (this.skipN) cur = cur.skip(this.skipN);
    cur = cur.limit(Math.min(this.limitN || 100, 1000)); // 与云函数端默认上限 100 一致
    return { data: await cur.toArray() };
  }
  async count() {
    return { total: await this.col.countDocuments(toFilter(this.w)) };
  }
  async update({ data }) {
    const r = await this.col.updateMany(toFilter(this.w), toUpdate(data));
    return { stats: { updated: r.modifiedCount } };
  }
  async remove() {
    const r = await this.col.deleteMany(toFilter(this.w));
    return { stats: { removed: r.deletedCount } };
  }
}

class Collection extends Query {
  constructor(name) {
    super(name);
  }
  doc(id) {
    const col = mdb.collection(this.name);
    return {
      async get() {
        const d = await col.findOne({ _id: id });
        if (!d) throw new Error(`document.get:fail document with _id ${id} does not exist`);
        return { data: d };
      },
      async update({ data }) {
        const u = toUpdate(data);
        if (!Object.keys(u).length) return { stats: { updated: 0 } };
        const r = await col.updateOne({ _id: id }, u);
        return { stats: { updated: r.modifiedCount } };
      },
      async set({ data }) {
        const { _id, ...rest } = data || {};
        await col.replaceOne({ _id: id }, rest, { upsert: true });
        return { stats: { updated: 1 } };
      },
      async remove() {
        const r = await col.deleteOne({ _id: id });
        return { stats: { removed: r.deletedCount } };
      },
    };
  }
  async add({ data }) {
    const doc = { ...data, _id: data._id || genId() };
    await mdb.collection(this.name).insertOne(doc); // _id 重复时抛错,与云数据库一致
    return { _id: doc._id };
  }
}

// ---------- 微信接口(订阅消息)----------
let tokenCache = { value: '', exp: 0 };
async function wxAccessToken() {
  if (tokenCache.value && tokenCache.exp > Date.now()) return tokenCache.value;
  const { WX_APPID, WX_SECRET } = process.env;
  if (!WX_APPID || !WX_SECRET) throw new Error('WX_APPID/WX_SECRET not set');
  const r = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`).then((x) => x.json());
  if (!r.access_token) throw new Error('wx token: ' + JSON.stringify(r));
  tokenCache = { value: r.access_token, exp: Date.now() + (r.expires_in - 300) * 1000 };
  return r.access_token;
}

const db = {
  collection: (n) => new Collection(n),
  command,
  createCollection: (n) => mdb.createCollection(n),
};

module.exports = {
  DYNAMIC_CURRENT_ENV: 'self-hosted',
  init() {},
  database: () => db,
  getWXContext: () => ({ OPENID: '', ...(als.getStore() || {}) }),
  openapi: {
    subscribeMessage: {
      async send({ touser, templateId, page, data, miniprogramState }) {
        const token = await wxAccessToken();
        const r = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ touser, template_id: templateId, page, data, miniprogram_state: miniprogramState }),
        }).then((x) => x.json());
        if (r.errcode) {
          const e = new Error(r.errmsg);
          e.errCode = r.errcode;
          throw e;
        }
        return r;
      },
    },
  },
  callFunction: async () => ({ result: {} }),
  // 供 HTTP 服务使用
  __connect: connect,
  __useDb: (d) => (mdb = d), // 测试用:注入兼容 Mongo 接口的数据库对象
  __runWithContext: (ctx, fn) => als.run(ctx, fn),
  __db: () => mdb,
};
