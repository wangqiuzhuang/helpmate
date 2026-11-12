import __m0_i18n from './i18n.js';
// school-search.js —— 学校模糊搜索(纯函数,不依赖 uni.*,可在 Node 下单测)
const i18n = __m0_i18n;
const { t } = i18n;
// 匹配规则:中文名/韩文名/英文名子串 + 拼音紧凑串前缀 + 拼音首字母前缀(忽略大小写)
// 拼音搜索对所有语言的用户都保留;nameEn/nameKr 无条件进索引
// 结果排序:名称以关键词开头 > 名称包含 > 拼音/首字母命中;同档按 rank(985/211/双一流/本科)→ 原顺序
const normalize = (s) => (s || '').toString().trim().toLowerCase();

const buildIndex = (list) =>
  list.map((school) => {
    const pinyinWords = (school.pinyin || '').split(' ').filter(Boolean);
    const names = [normalize(school.nameCn), normalize(school.nameEn), normalize(school.nameKr)].filter(Boolean);
    return {
      school,
      names,
      haystack: names.join(' '),
      pinyinWords,
      pinyinCompact: (school.pinyin || '').replace(/\s+/g, ''),
      initials: school.initials || '',
    };
  });

// 过滤学校;query 为空返回全部。max 限制结果条数(默认无上限)
const matchSchools = (index, query, max) => {
  const q = normalize(query);
  if (!q) return max ? index.slice(0, max) : index.slice();
  const qCompact = q.replace(/\s+/g, '');
  const hits = [];
  for (const row of index) {
    let score = -1;
    if (row.names.some((n) => n.startsWith(q))) score = 0;
    else if (row.haystack.includes(q)) score = 1;
    else if (row.initials.startsWith(qCompact) || row.pinyinCompact.startsWith(qCompact)) score = 2;
    else if (row.pinyinWords.some((w) => w.startsWith(qCompact)) || row.pinyinCompact.includes(qCompact)) score = 3;
    if (score >= 0) hits.push({ row, score });
  }
  hits.sort((a, b) => a.score - b.score || (b.row.school.rank || 0) - (a.row.school.rank || 0) || (a.row.school.order || 0) - (b.row.school.order || 0));
  const out = hits.map((h) => h.row);
  return max ? out.slice(0, max) : out;
};

// 按地区分组(韩国地区;中国按省份,见 groupByProvince)
const REGION_ORDER = ['首尔', '京畿·仁川', '江原', '大田·世宗·忠清', '光州·全罗', '釜山·蔚山·大邱·庆尚', '济州'];

const groupByRegion = (rows) => {
  const byPinyin = (a, b) => (a.school.pinyin < b.school.pinyin ? -1 : a.school.pinyin > b.school.pinyin ? 1 : 0);
  const byRegion = {};
  for (const row of rows) {
    const key = row.school.region || '其他';
    (byRegion[key] = byRegion[key] || []).push(row);
  }
  const groups = [];
  for (const key of REGION_ORDER) {
    if (byRegion[key]) groups.push({ regionKey: key, region: t('schools.region.' + key), items: byRegion[key].sort(byPinyin) });
    delete byRegion[key];
  }
  for (const key of Object.keys(byRegion)) {
    groups.push({ regionKey: key, region: t('schools.region.' + key), items: byRegion[key].sort(byPinyin) });
  }
  return groups;
};

// 中国:某省份的学校,知名度(rank)优先,其次按拼音
const schoolsOfProvince = (list, prov) =>
  list
    .filter((s) => s.region === prov)
    .sort((a, b) => (b.rank || 0) - (a.rank || 0) || (a.pinyin < b.pinyin ? -1 : a.pinyin > b.pinyin ? 1 : 0));

const __exports = { normalize, buildIndex, matchSchools, groupByRegion, schoolsOfProvince, REGION_ORDER };
export { normalize, buildIndex, matchSchools, groupByRegion, schoolsOfProvince, REGION_ORDER };
export default __exports;
