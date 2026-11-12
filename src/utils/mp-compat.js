// utils/mp-compat.js —— 原生小程序 Page({...}) 写法 → Vue3 选项式组件 的运行时适配
//
// 迁移原则:页面业务代码尽量不改,由这里补齐差异:
//   - data 对象 → data() 工厂函数(每个页面实例独立深拷贝)
//   - this.setData({ 'a.b[0].c': v }, cb) → 按路径写入响应式数据,cb 在下一帧回调
//   - this.data.xxx → 指向 this.$data(读写都走响应式)
//   - 非生命周期函数 → methods;非函数的自定义字段(如 _timer)→ 实例属性
//   - noop:模板里 catchtap="noop" 用于阻止冒泡,统一提供空方法
const PAGE_HOOKS = new Set([
  'onLoad', 'onShow', 'onReady', 'onHide', 'onUnload', 'onPullDownRefresh', 'onReachBottom',
  'onShareAppMessage', 'onShareTimeline', 'onPageScroll', 'onTabItemTap', 'onResize', 'onAddToFavorites',
  'onBackPress', 'onNavigationBarButtonTap',
]);

const clone = (v) => {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(clone);
  const o = {};
  for (const k of Object.keys(v)) o[k] = clone(v[k]);
  return o;
};

// 'a.b[2].c' → ['a', 'b', 2, 'c']
const parsePath = (p) => {
  const out = [];
  String(p).replace(/[^.[\]]+|\[(\d+)\]/g, (m, idx) => {
    out.push(idx !== undefined ? Number(idx) : m);
    return m;
  });
  return out;
};

export function setByPath(root, path, value) {
  const segs = parsePath(path);
  let cur = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const k = segs[i];
    if (cur[k] === null || typeof cur[k] !== 'object') cur[k] = typeof segs[i + 1] === 'number' ? [] : {};
    cur = cur[k];
  }
  cur[segs[segs.length - 1]] = value;
}

export function definePage(opts) {
  const { data = {}, components, ...rest } = opts || {};
  const methods = {
    noop() {},
    setData(obj, cb) {
      if (obj) {
        for (const k of Object.keys(obj)) setByPath(this.$data, k, obj[k]);
      }
      if (typeof cb === 'function') this.$nextTick(cb);
    },
  };
  const hooks = {};
  const fields = {};
  for (const k of Object.keys(rest)) {
    const v = rest[k];
    if (typeof v === 'function') {
      if (PAGE_HOOKS.has(k)) hooks[k] = v;
      else methods[k] = v;
    } else {
      fields[k] = v;
    }
  }
  return {
    ...(components ? { components } : {}),
    data() {
      return clone(data);
    },
    computed: {
      // 兼容 this.data.xxx 读取
      data() {
        return this.$data;
      },
    },
    created() {
      for (const k of Object.keys(fields)) this[k] = clone(fields[k]);
    },
    methods,
    ...hooks,
  };
}
