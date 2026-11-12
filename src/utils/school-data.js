// utils/school-data.js —— 国家 + 学校名单(韩国随包内置;中国 2919 所由服务器下发,存本地缓存)
//
//   - 学校 ID 前缀即国家:kr-xxxxxxxx(韩国)/ cn-<教育部学校标识码>(中国)
//   - 中国名单 ~56KB(gzip),首次选「中国」时下载一次,之后按版本号增量判断,不随 APK 打包
//   - 本模块不依赖 i18n / cloud,避免循环引用;模块加载时不调用 uni.*
import SERVER from '../config/server.js';
import krSchools from '../data/schools.js';

const BASE = (SERVER.base || '').replace(/\/$/, '');
const COUNTRY_KEY = 'krstuast_country_v1';
const CN_CACHE_KEY = 'krstuast_schools_cn_v1';
const SCHOOL_KEY = 'krstuast_school_v1';
const KR_EXTRA_KEY = 'krstuast_schools_kr_extra_v1';

export const COUNTRIES = [
  { code: 'kr', flag: '🇰🇷' },
  { code: 'cn', flag: '🇨🇳' },
];
const CODES = COUNTRIES.map((c) => c.code);

export const countryOf = (schoolId) => {
  const c = String(schoolId || '').split('-')[0];
  return CODES.indexOf(c) >= 0 ? c : '';
};

// 当前国家:显式选择 > 已选学校推断 > 空(首次启动)
let country = '';
export function getCountry() {
  if (country) return country;
  try {
    country = uni.getStorageSync(COUNTRY_KEY) || '';
    if (!country) {
      const s = uni.getStorageSync(SCHOOL_KEY);
      country = (s && countryOf(s.id)) || '';
    }
  } catch (e) {
    country = '';
  }
  return country;
}
export function setCountry(c) {
  country = CODES.indexOf(c) >= 0 ? c : '';
  try {
    uni.setStorageSync(COUNTRY_KEY, country);
  } catch (e) {}
  return country;
}

// 货币符号跟随界面语言:中文 ¥(人民币);韩语 / 英语 / 越南语 ₩(韩币)
// 直接读语言存储,避免和 i18n.js 循环引用
export const localCurrency = () => {
  let l = '';
  try { l = uni.getStorageSync('krstuast_lang_v1') || ''; } catch (e) {}
  return !l || l === 'zh' ? '¥' : '₩';
};

// ---------- 中国高校:解码服务器紧凑格式 ----------
// rows: [code, name, en, provIdx, city, level(1本科/2专科), nature(0公办/1民办/2合作), tags(4=985|2=211|1=双一流), pinyin]
const TAG_LABELS = (bits) => [bits & 4 ? '985' : '', bits & 2 ? '211' : '', bits & 1 ? '双一流' : ''].filter(Boolean);
let cn = null; // { version, provinces, list, byId }

function decodeCn(data) {
  if (!data || !data.rows || !data.provinces) return null;
  const list = data.rows.map((r, i) => {
    const py = String(r[8] || '');
    return {
      id: 'cn-' + r[0],
      nameCn: r[1],
      nameEn: r[2] || '',
      nameKr: '',
      region: data.provinces[r[3]] || '',
      city: r[4] || '',
      type: r[5] === 1 ? '本科' : '专科',
      nature: r[6],
      tags: TAG_LABELS(r[7] || 0),
      rank: (r[7] & 4 ? 40 : 0) + (r[7] & 2 ? 20 : 0) + (r[7] & 1 ? 10 : 0) + (r[5] === 1 ? 5 : 0) + (r[6] === 0 ? 1 : 0),
      pinyin: py,
      initials: py.split(' ').map((w) => w[0] || '').join(''),
      order: i,
    };
  });
  const byId = {};
  list.forEach((s) => (byId[s.id] = s));
  return { version: data.version, provinces: data.provinces, list, byId };
}

function loadCnCache() {
  if (cn) return cn;
  try {
    const raw = uni.getStorageSync(CN_CACHE_KEY);
    if (raw) cn = decodeCn(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch (e) {
    cn = null;
  }
  return cn;
}

const request = (url) =>
  new Promise((resolve, reject) => {
    uni.request({
      url,
      method: 'GET',
      timeout: 20000,
      success: (res) => (res.statusCode === 200 ? resolve(res.data) : reject(new Error('HTTP ' + res.statusCode))),
      fail: (e) => reject(e),
    });
  });

let checked = false; // 每次启动最多检查一次版本
let pending = null;
function fetchCn() {
  if (pending) return pending;
  pending = request(BASE + '/api/schools?country=cn')
    .then((data) => {
      const d = typeof data === 'string' ? JSON.parse(data) : data;
      const decoded = decodeCn(d);
      if (!decoded) throw new Error('bad data');
      cn = decoded;
      try {
        uni.setStorageSync(CN_CACHE_KEY, JSON.stringify(d));
      } catch (e) {}
      return cn;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

// ---------- 韩国:随包名单 + 后台新增的学校(服务器下发,本地缓存)----------
let krExtra = null; // { version, list }
function loadKrExtra() {
  if (krExtra) return krExtra;
  try {
    const raw = uni.getStorageSync(KR_EXTRA_KEY);
    krExtra = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { version: '', list: [] };
  } catch (e) {
    krExtra = { version: '', list: [] };
  }
  krExtra.list = (krExtra.list || []).map((x) => ({ ...x, initials: (x.pinyin || '').split(' ').map((w) => w[0] || '').join('') }));
  return krExtra;
}
let krChecked = false;
function refreshKrExtra() {
  if (krChecked || !BASE) return Promise.resolve();
  krChecked = true;
  const cur = loadKrExtra();
  return request(BASE + '/api/schools?country=kr&meta=1')
    .then((m) => {
      if (!m || !m.version || m.version === cur.version) return;
      return request(BASE + '/api/schools?country=kr').then((d) => {
        const data = typeof d === 'string' ? JSON.parse(d) : d;
        const next = { version: data.version, list: data.extra || [] };
        try {
          uni.setStorageSync(KR_EXTRA_KEY, JSON.stringify(next));
        } catch (e) {}
        krExtra = null;
        krAll = null;
        krById = null;
      });
    })
    .catch(() => {});
}
let krAll = null;
const krList = () => (krAll = krAll || krSchools.concat(loadKrExtra().list));

// 保证某国名单可用:韩国先返回现有名单(后台检查新增学校);中国有缓存先用缓存(后台比对版本),无缓存则下载
export function ensureSchools(c) {
  if (c !== 'cn') {
    refreshKrExtra();
    return Promise.resolve(krList());
  }
  const cached = loadCnCache();
  if (cached) {
    if (!checked && BASE) {
      checked = true;
      request(BASE + '/api/schools?country=cn&meta=1')
        .then((m) => {
          if (m && m.version && m.version !== cached.version) fetchCn().catch(() => {});
        })
        .catch(() => {});
    }
    return Promise.resolve(cached.list);
  }
  checked = true;
  return fetchCn().then((x) => x.list);
}

// 同步读取(未下载时中国名单为空数组)
export function getSchools(c) {
  if (c === 'cn') {
    const x = loadCnCache();
    return x ? x.list : [];
  }
  return krList();
}
export const cnProvinces = () => {
  const x = loadCnCache();
  return x ? x.provinces : [];
};

let krById = null;
export function findSchool(id) {
  if (!id) return null;
  if (countryOf(id) === 'cn') {
    const x = loadCnCache();
    return (x && x.byId[id]) || null;
  }
  if (!krById) {
    krById = {};
    krList().forEach((s) => (krById[s.id] = s));
  }
  return krById[id] || null;
}

export default { COUNTRIES, countryOf, getCountry, setCountry, localCurrency, ensureSchools, getSchools, cnProvinces, findSchool };
