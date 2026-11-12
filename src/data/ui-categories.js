// data/ui-categories.js —— 新版 UI 的分类视觉(图标/配色)、分组与路由
// 业务 ID 与 data/functions.js 保持一致;名称文案经 funcMeta() 本地化
const ICON = (name, color) => `/static/icons/${name}-${color}.png`;

// 每个功能:线条图标 + 浅色底 + 同色系深色字(文字对比度 ≥ 4.5:1)
export const CAT_STYLE = {
  pickup: { icon: ICON('package', '23744d'), bg: '#E6F6EE', fg: '#23744D' },
  delivery: { icon: ICON('package', '23744d'), bg: '#E6F6EE', fg: '#23744D' },
  carpool: { icon: ICON('car', '1f5fa8'), bg: '#E7F2FF', fg: '#1F5FA8' },
  groupbuy: { icon: ICON('basket', 'b4561c'), bg: '#FFF1E6', fg: '#A4501A' },
  meal: { icon: ICON('utensils', 'b23b3b'), bg: '#FFECEC', fg: '#A53434' },
  homecook: { icon: ICON('chef', '7a5000'), bg: '#FFF6DB', fg: '#7A5000' },
  secondhand: { icon: ICON('tag', 'b4561c'), bg: '#FFF1E6', fg: '#A4501A' },
  housing: { icon: ICON('house', '7a5000'), bg: '#FFF6DB', fg: '#7A5000' },
  parttime: { icon: ICON('briefcase', '3d4656'), bg: '#EEF0F4', fg: '#3D4656' },
  hangout: { icon: ICON('users', '5b45c2'), bg: '#EEEAFE', fg: '#5B45C2' },
  friends: { icon: ICON('heart', 'c22f66'), bg: '#FFEEF4', fg: '#C22F66' },
  companion: { icon: ICON('gamepad', '1f5fa8'), bg: '#E7F2FF', fg: '#1F5FA8' },
  treehole: { icon: ICON('moon', '4a4552'), bg: '#F1EFF3', fg: '#4A4552' },
  confession: { icon: ICON('moon', '4a4552'), bg: '#F1EFF3', fg: '#4A4552' },
  qa: { icon: ICON('help', '1f5fa8'), bg: '#E7F2FF', fg: '#1F5FA8' },
  help: { icon: ICON('help', '1f5fa8'), bg: '#E7F2FF', fg: '#1F5FA8' },
  rant: { icon: ICON('megaphone', 'b4561c'), bg: '#FFF1E6', fg: '#A4501A' },
  warning: { icon: ICON('megaphone', 'b4561c'), bg: '#FFF1E6', fg: '#A4501A' },
  food: { icon: ICON('bowl', 'b23b3b'), bg: '#FFECEC', fg: '#A53434' },
  lostfound: { icon: ICON('search', '23744d'), bg: '#E6F6EE', fg: '#23744D' },
  freshman: { icon: ICON('graduation', '5b45c2'), bg: '#EEEAFE', fg: '#5B45C2' },
  deals: { icon: ICON('tag', 'b4561c'), bg: '#FFE9F0', fg: '#B02A5B' },
  game: { icon: ICON('gamepad', '1f5fa8'), bg: '#EEEAFE', fg: '#5B45C2' },
  more: { icon: ICON('grid', '4a4552'), bg: '#F1EFF3', fg: '#4A4552' },
};
export const catStyle = (id) => CAT_STYLE[id] || CAT_STYLE.more;

// 全部功能页分组(组名 key 见 locales: features.group.*)
export const GROUPS = [
  { key: 'life', ids: ['deals', 'pickup', 'carpool', 'groupbuy', 'meal', 'homecook'] },
  { key: 'trade', ids: ['secondhand', 'housing', 'parttime'] },
  { key: 'social', ids: ['hangout', 'friends', 'companion', 'game', 'treehole'] },
  { key: 'info', ids: ['qa', 'rant', 'food', 'lostfound', 'freshman'] },
];

// 主页快捷入口 + 分类标签
export const QUICK_IDS = ['deals', 'secondhand', 'meal', 'hangout', 'qa'];
// 只能浏览、不能由用户发布的功能(专属折扣由后台发布)
export const VIEW_ONLY_IDS = ['deals'];
const SPECIAL_URL = { deals: '/pages/deals/list' };
export const CHIP_IDS = ['secondhand', 'pickup', 'hangout', 'qa', 'housing', 'parttime', 'food'];

// 任务类(订单模型)与帖子类(帖子模型)
export const TASK_IDS = ['pickup', 'delivery', 'carpool', 'groupbuy', 'secondhand', 'housing', 'parttime', 'companion', 'hangout', 'friends', 'meal', 'homecook'];
export const POST_IDS = ['rant', 'help', 'qa', 'warning', 'food', 'confession', 'lostfound', 'treehole', 'freshman', 'game'];
export const isTask = (id) => TASK_IDS.indexOf(id) >= 0;

// 进入某功能的列表页 / 发布页
export const listUrl = (id) => SPECIAL_URL[id] || (isTask(id) ? '/pages/order/list?category=' : '/pages/post/list?category=') + id;
export const publishUrl = (id) => (isTask(id) ? '/pages/order/publish?category=' : '/pages/post/publish?category=') + id;

export default { CAT_STYLE, catStyle, GROUPS, QUICK_IDS, CHIP_IDS, TASK_IDS, POST_IDS, isTask, listUrl, publishUrl };
