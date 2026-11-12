// 本地联调用的 wx-server-sdk 替身:内存数据库(可选落盘 data.json),只实现 krstuast 用到的接口
const fs = require('fs');
const path = require('path');
const DATA_FILE = process.env.MOCK_DB_FILE || '';
let store = {};
if (DATA_FILE && fs.existsSync(DATA_FILE)) store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const persist = () => DATA_FILE && fs.writeFileSync(DATA_FILE, JSON.stringify(store));
const col = (name) => (store[name] = store[name] || {});
let ctx = { OPENID: '' };
let seq = 0;
const genId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 8);

class Cmd { constructor(op, v) { this.op = op; this.v = v; } }
const command = {
  in: (v) => new Cmd('in', v), all: (v) => new Cmd('all', v), inc: (v) => new Cmd('inc', v),
  neq: (v) => new Cmd('neq', v), gt: (v) => new Cmd('gt', v), gte: (v) => new Cmd('gte', v),
  lt: (v) => new Cmd('lt', v), lte: (v) => new Cmd('lte', v), nin: (v) => new Cmd('nin', v),
  push: (v) => new Cmd('push', v), pull: (v) => new Cmd('pull', v), remove: () => new Cmd('remove'),
};
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function matchVal(actual, cond) {
  if (cond instanceof Cmd) {
    const v = cond.v;
    switch (cond.op) {
      case 'in': return Array.isArray(actual) ? actual.some((a) => v.includes(a)) : v.includes(actual);
      case 'nin': return !v.includes(actual);
      case 'all': return Array.isArray(actual) && v.every((x) => actual.includes(x));
      case 'neq': return actual !== v;
      case 'gt': return actual > v;
      case 'gte': return actual >= v;
      case 'lt': return actual < v;
      case 'lte': return actual <= v;
    }
    throw new Error('unsupported cmd ' + cond.op);
  }
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    return Object.keys(cond).every((k) => matchVal(actual == null ? undefined : actual[k], cond[k]));
  }
  if (Array.isArray(actual) && !Array.isArray(cond)) return actual.includes(cond);
  return actual === cond;
}
const matches = (doc, where) => Object.keys(where || {}).every((k) => matchVal(getPath(doc, k), where[k]));
function applyUpdate(doc, data) {
  for (const k of Object.keys(data)) {
    const v = data[k];
    const segs = k.split('.');
    let tgt = doc;
    for (let i = 0; i < segs.length - 1; i++) tgt = tgt[segs[i]] = tgt[segs[i]] && typeof tgt[segs[i]] === 'object' ? tgt[segs[i]] : {};
    const last = segs[segs.length - 1];
    if (v instanceof Cmd) {
      if (v.op === 'inc') tgt[last] = (Number(tgt[last]) || 0) + v.v;
      else if (v.op === 'push') tgt[last] = (tgt[last] || []).concat(v.v);
      else if (v.op === 'pull') tgt[last] = (tgt[last] || []).filter((x) => !matchVal(x, v.v));
      else if (v.op === 'remove') delete tgt[last];
      else throw new Error('unsupported update cmd ' + v.op);
    } else if (v && typeof v === 'object' && !Array.isArray(v) && tgt[last] && typeof tgt[last] === 'object' && !Array.isArray(tgt[last])) {
      applyUpdate(tgt[last], v);
    } else tgt[last] = clone(v);
  }
}
class Query {
  constructor(name, where = {}, order = [], skipN = 0, limitN = 100) { Object.assign(this, { name, w: where, order, skipN, limitN }); }
  where(w) { return new Query(this.name, { ...this.w, ...w }, this.order, this.skipN, this.limitN); }
  orderBy(f, dir) { return new Query(this.name, this.w, [...this.order, [f, dir]], this.skipN, this.limitN); }
  skip(n) { return new Query(this.name, this.w, this.order, n, this.limitN); }
  limit(n) { return new Query(this.name, this.w, this.order, this.skipN, n); }
  field() { return this; }
  _rows() {
    let rows = Object.values(col(this.name)).filter((d) => matches(d, this.w));
    for (const [f, dir] of [...this.order].reverse()) rows.sort((a, b) => ((getPath(a, f) > getPath(b, f) ? 1 : getPath(a, f) < getPath(b, f) ? -1 : 0) * (dir === 'desc' ? -1 : 1)));
    return rows;
  }
  async get() { return { data: clone(this._rows().slice(this.skipN, this.skipN + this.limitN)) }; }
  async count() { return { total: this._rows().length }; }
  async update({ data }) { const rows = this._rows(); rows.forEach((d) => applyUpdate(d, data)); persist(); return { stats: { updated: rows.length } }; }
  async remove() { const rows = this._rows(); rows.forEach((d) => delete col(this.name)[d._id]); persist(); return { stats: { removed: rows.length } }; }
}
class Collection extends Query {
  constructor(name) { super(name); }
  doc(id) {
    const name = this.name;
    return {
      async get() { const d = col(name)[id]; if (!d) throw new Error(`document.get:fail document with _id ${id} does not exist`); return { data: clone(d) }; },
      async update({ data }) { const d = col(name)[id]; if (!d) return { stats: { updated: 0 } }; applyUpdate(d, data); persist(); return { stats: { updated: 1 } }; },
      async set({ data }) { col(name)[id] = { ...clone(data), _id: id }; persist(); return { stats: { updated: 1 } }; },
      async remove() { const had = !!col(name)[id]; delete col(name)[id]; persist(); return { stats: { removed: had ? 1 : 0 } }; },
    };
  }
  async add({ data }) {
    const id = data._id || genId();
    if (col(this.name)[id]) throw new Error('duplicate key _id ' + id);
    col(this.name)[id] = { ...clone(data), _id: id };
    persist();
    return { _id: id };
  }
}
const db = { collection: (n) => new Collection(n), command, createCollection: async (n) => { if (store[n]) throw new Error('exists'); col(n); } };
module.exports = {
  DYNAMIC_CURRENT_ENV: 'local-dev',
  init() {},
  database: () => db,
  getWXContext: () => ({ ...ctx }),
  openapi: { subscribeMessage: { send: async () => ({}) } },
  callFunction: async () => ({ result: {} }),
  __setContext: (c) => (ctx = { OPENID: '', ...c }),
  __store: () => store,
};
