// school-map.js —— schoolId → 学校名(按语言;韩国名单随包,中国名单读本地缓存;零网络开销)
//   zh 中文 / ko 韩文(中国学校无韩文名 → 中文)/ en、vi 英文(缺失回退中文)
import { findSchool } from './school-data.js';
import i18n from './i18n.js';

const schoolName = (id) => {
  const s = findSchool(id);
  if (!s) return '';
  const lang = i18n.getLang();
  if (lang === 'ko') return s.nameKr || s.nameCn || '';
  if (lang === 'en' || lang === 'vi') return s.nameEn || s.nameCn || '';
  return s.nameCn || '';
};

const __exports = { schoolName };
export { schoolName };
export default __exports;
