import __m0_i18n from './i18n.js';
// format.js —— 时间格式化工具(文案经 i18n 本地化)
const i18n = __m0_i18n;
const { t } = i18n;

const pad = (n) => (n < 10 ? '0' + n : '' + n);

// 相对时间：刚刚 / x分钟前 / x小时前 / x天前 / M月D日
const timeAgo = (ts) => {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('common.justNow');
  if (m < 60) return t('common.minutesAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('common.hoursAgo', { n: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t('common.daysAgo', { n: d });
  return fmtDate(ts);
};

const fmtDate = (ts) => {
  const d = new Date(ts);
  return t('common.monthDay', { m: d.getMonth() + 1, d: d.getDate() });
};

const fmtDateTime = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 截止时间（ISO 字符串）→ M月D日 HH:mm
const fmtDeadline = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.replace(/-/g, '/'));
  if (isNaN(d.getTime())) return iso;
  return `${t('common.monthDay', { m: d.getMonth() + 1, d: d.getDate() })} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const __exports = { timeAgo, fmtDate, fmtDateTime, fmtDeadline };
export { timeAgo, fmtDate, fmtDateTime, fmtDeadline };
export default __exports;
