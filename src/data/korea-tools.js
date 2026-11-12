import __m0_i18n from '../utils/i18n.js';
// korea-tools.js —— 探索页「韩国生存工具箱」结构 + 本地化组装
//
// 文案(名称/提示/条目)全部在 locales 的 korea.* 命名空间,按语言差异化:
// 「常用韩语」的中文谐音注释仅 zh 需要,en 用罗马音,ko 直接韩文原文。
// 维护文案请改 locales/{zh,en,ko}.js;结构/数量改本文件。
// 数据更新于 2026-09,涉及电话/时薪/政策的条目请注意时效。
const i18n = __m0_i18n;
const { t } = i18n;

const TOOLS = [
  { id: 'emergency', icon: '🚨', itemCount: 6, hasTip: true, tels: ['112', '119', '1345', '1330', '1350', '02-738-1038'] },
  { id: 'korean', icon: '🗣️', itemCount: 10, hasTip: true },
  { id: 'transport', icon: '🚇', itemCount: 5 },
  { id: 'trash', icon: '🗑️', itemCount: 6 },
  { id: 'arc', icon: '📝', itemCount: 5 },
  { id: 'work', icon: '💼', itemCount: 5 },
];

// 按当前语言组装 [{ id, icon, name, tip, items: [{ label, value, tel }] }]
const localizedTools = () =>
  TOOLS.map((tool) => ({
    id: tool.id,
    icon: tool.icon,
    name: t('korea.' + tool.id + '.name'),
    tip: tool.hasTip ? t('korea.' + tool.id + '.tip') : undefined,
    items: Array.from({ length: tool.itemCount }, (_, i) => ({
      label: t('korea.' + tool.id + '.item' + i + '.label'),
      value: t('korea.' + tool.id + '.item' + i + '.value'),
      tel: tool.tels ? tool.tels[i] : undefined,
    })),
  }));

const __exports = { localizedTools };
export { localizedTools };
export default __exports;
