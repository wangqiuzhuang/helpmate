// utils/feed.js —— 信息流展示数据(主页 / 探索 / 历史订单共用)
import { localCurrency } from './school-data.js';
import { t, tv } from './i18n.js';
import { funcMeta, summaryText, rewardLabel, isVisibleOf, gbTagOf } from './order-meta.js';
import { timeAgo } from './format.js';
import { schoolName } from './school-map.js';
import { thumbUrl } from './cloud.js';
import { catStyle } from '../data/ui-categories.js';

// 千分位(小程序 JS 引擎的 toLocaleString 不可靠,手动格式化)
const money = (sym, v) => (v === undefined || v === null || v === '' ? '' : sym + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','));

// 订单展示标题:无标题的功能(闲置/攒局等)用核心字段拼
export function orderTitle(o) {
  const p = o.payload || {};
  // 闲置:老数据标题里带了「· ¥价格」,价格另行显示,这里只用物品名
  if (o.functionId === 'secondhand' && p.productName) return p.productName + (p.condition ? ' · ' + tv('condition', p.condition) : '');
  if (o.title) return o.title;
  if (o.functionId === 'hangout') {
    const type = p.customType || tv('hangoutType', p.type) || '';
    return [type, o.desc].filter(Boolean).join(' · ');
  }
  const core = p.productName || p.dish || p.wantDish || p.food || p.activity;
  if (core) return core + (p.condition ? ' · ' + tv('condition', p.condition) : '');
  const s = summaryText(o);
  return (s && s.text) || o.desc || funcMeta(o.functionId).name;
}

// 价格/状态
export function orderExtra(o) {
  const p = o.payload || {};
  switch (o.functionId) {
    case 'secondhand':
      return money(localCurrency(), p.price);
    case 'housing':
      return money(localCurrency(), p.price);
    case 'parttime':
      return p.payAmount ? money(localCurrency(), p.payAmount) + (p.payUnit ? ' / ' + tv('payUnit', p.payUnit) : '') : '';
    case 'pickup':
    case 'delivery':
      return rewardLabel(o);
    case 'hangout':
      return p.people ? t('home.peopleN', { n: p.people }) : '';
    case 'homecook':
      return money(localCurrency(), p.price || p.budget);
    case 'groupbuy':
      return money(localCurrency(), p.totalPrice);
    default:
      return '';
  }
}


// 信息流色块:每个功能一种颜色(浅底 + 同色系深字,对比度 ≥ 4.5:1)
const TILE = {
  pickup: ['#E3F6EC', '#1E7A4C'], delivery: ['#DDF4F4', '#16706F'], carpool: ['#E4EFFF', '#1F59A8'],
  groupbuy: ['#FFEEDD', '#9C4A12'], meal: ['#FFE8E8', '#A32F2F'], homecook: ['#FFF4D6', '#7A5200'],
  secondhand: ['#FFE9F0', '#B02A5B'], housing: ['#EFE9DF', '#6B4E2A'], parttime: ['#E9EDF3', '#36435A'],
  hangout: ['#ECE8FF', '#5A3FC0'], friends: ['#FFE6F7', '#A3267F'], companion: ['#E6F3FF', '#0F6699'],
  treehole: ['#ECEAF2', '#4A4458'], confession: ['#ECEAF2', '#4A4458'], qa: ['#E3F2FF', '#1565A0'],
  help: ['#E3F2FF', '#1565A0'], rant: ['#FFEFE3', '#A0420C'], warning: ['#FFEFE3', '#A0420C'],
  food: ['#FFF0E0', '#9A4A00'], lostfound: ['#E8F5E2', '#3D6B1F'], freshman: ['#F1E8FF', '#6E35B5'], game: ['#EEEAFE', '#5B45C2'],
};
const tileOf = (id, st) => (TILE[id] ? { bg: TILE[id][0], fg: TILE[id][1] } : st);

export function decorateOrder(o) {
  const f = funcMeta(o.functionId);
  const st = catStyle(o.functionId);
  const img = (o.images || [])[0] || '';
  // 帮取/帮送在首页合并为一个入口,但每一单要按实际类型显示「帮取」或「帮送」
  const split = o.functionId === 'pickup' || o.functionId === 'delivery';
  // 拆单凑单同理:按实际类型显示「拆单」或「凑单」
  const gb = gbTagOf(o);
  return {
    key: 'o' + o._id, id: o._id, kind: 'order', functionId: o.functionId,
    title: orderTitle(o),
    meta: [gb ? gb.label : split ? f.badgeName : f.name, split ? (o.payload || {}).item : '', schoolName(o.schoolId), timeAgo(o.createdAt)].filter(Boolean).join(' · '),
    extra: orderExtra(o),
    comments: o.commentCount || 0,
    done: ['done', 'sold', 'full'].includes(o.status),
    // 组队类:👥 2/4 + 一键加入
    join: o.joinN
      ? { n: o.joinN, total: o.joinTotal || 0, state: o.iJoined ? 'joined' : !isVisibleOf(o) ? 'closed' : o.joinTotal && o.joinN >= o.joinTotal ? 'full' : 'open' }
      : null,
    views: o.viewCount || 0,
    hot: o.hot || null,
    thumb: thumbUrl(img), full: img,
    tile: gb ? gb.label : split ? f.badgeName : f.homeName || f.badgeName, bg: gb ? gb.bg : tileOf(o.functionId, st).bg, fg: gb ? gb.color : tileOf(o.functionId, st).fg,
    createdAt: o.createdAt,
  };
}

export function decoratePost(p) {
  const f = funcMeta(p.functionId);
  const st = catStyle(p.functionId);
  const img = (p.images || [])[0] || '';
  const preview = (p.content || '').replace(/\n/g, ' ').slice(0, 40);
  return {
    key: 'p' + p._id, id: p._id, kind: 'post', functionId: p.functionId,
    title: p.title || preview || f.name,
    meta: [f.name, schoolName(p.schoolId), timeAgo(p.createdAt)].filter(Boolean).join(' · '),
    extra: '',
    comments: p.commentCount || 0,
    views: p.viewCount || 0,
    hot: p.hot || null,
    thumb: thumbUrl(img), full: img,
    tile: f.homeName || f.badgeName, bg: tileOf(p.functionId, st).bg, fg: tileOf(p.functionId, st).fg,
    createdAt: p.createdAt,
  };
}

export const openFeedItem = (it) =>
  uni.navigateTo({ url: (it.kind === 'order' ? '/pages/order/detail?id=' : '/pages/post/detail?id=') + it.id });

export default { orderTitle, orderExtra, decorateOrder, decoratePost, openFeedItem };
