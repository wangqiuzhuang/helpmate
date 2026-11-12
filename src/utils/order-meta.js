import { localCurrency } from './school-data.js';
import __m0_functions from '../data/functions.js';
import __m1_i18n from './i18n.js';
// order-meta.js —— 订单展示元信息（状态/功能/报酬文案,全部经 i18n 本地化）
//
// 重要约定:DB 中的中文枚举值(rentType 求租、gbType 拆单、cookType 做菜…)原样保留,
// 所有逻辑比较仍用中文字面量;只有「显示层」经 tv() 换语言。改显示、动存值、改比较
// 三者必须分清楚:改存值/比较会破坏历史数据与云端校验,禁止。
const functions = __m0_functions;
const i18n = __m1_i18n;
const { t, tv } = i18n;

const FUNC_MAP = {};
functions.forEach((f) => {
  FUNC_MAP[f.id] = f;
});

// 订单流程：按功能实际场景分三种
const FLOW_OF = {
  pickup: 'claim', delivery: 'claim', companion: 'claim',
  carpool: 'join', groupbuy: 'join', hangout: 'join', meal: 'join',
  secondhand: 'listing', housing: 'listing', parttime: 'listing',
};
const flowOf = (id) => FLOW_OF[id] || 'claim';

// 状态极简化：发布即展示 → 私聊成交 → 发布人下架（无认领/确认/完成流转）
// label 不入表(经 i18n value.status.*),此处只留颜色
const STATUS_BASE = {
  active: { bg: '#DFF6EC', color: '#3E8E6B' },
  pending: { bg: '#DFF6EC', color: '#3E8E6B' }, // 历史订单的旧状态，等同展示中
  cancelled: { bg: '#F3F0F5', color: '#9A93A8' },
  expired: { bg: '#F3F0F5', color: '#9A93A8' }, // 拼好饭：日期过后自动过期
  done: { bg: '#F3F0F5', color: '#9A93A8' },   // 历史订单
  sold: { bg: '#F3F0F5', color: '#9A93A8' },   // 历史订单
  full: { bg: '#F3F0F5', color: '#9A93A8' },   // 历史订单
};

const funcMeta = (id) => {
  const f = FUNC_MAP[id];
  if (!f) return { id, name: id, icon: '📌', badgeName: id, homeName: id };
  const name = t('func.' + id + '.name');
  return {
    id: f.id,
    icon: f.icon,
    name,
    badgeName: t('func.' + id + '.badge') || name,
    homeName: t('func.' + id + '.home') || name,
  };
};

const statusMeta = (s) => {
  const base = STATUS_BASE[s];
  if (base) return { label: t('value.status.' + s), ...base };
  return { label: s || t('common.unknown'), bg: '#F3F0F5', color: '#9A93A8' };
};

// 报酬展示：¥金额 + 软报酬 或 面议（互助报酬统一人民币）
const rewardLabel = (o) => {
  const parts = [];
  if (o.rewardAmount) parts.push(localCurrency() + o.rewardAmount);
  if (o.rewardText) parts.push(o.rewardText);
  return parts.join(' + ') || t('value.reward.negotiable');
};

// ---- 任务分类配置（表单字段 + 展示行）----
// 按当前语言记忆化构建:setLang + reLaunch 后模块仍常驻,必须按 lang 重建
// options 统一 { value: 中文枚举, label: 本地化显示 };value 为存库值,label 仅展示
const P = (mapName, values) => values.map((v) => ({ value: v, label: mapName ? tv(mapName, v) : v }));

const buildTaskCategories = () => ({
  pickup: {
    hasRoute: true, hasDeadline: true, hasReward: true, hasImages: false, deadlineRequired: true,
    fromLabel: t('om.pickup.fromLabel'), toLabel: t('om.pickup.toLabel'),
    fromTag: t('om.pickup.fromTag'), toTag: t('om.pickup.toTag'), deadlineLabel: t('om.pickup.deadlineLabel'),
    autoDelistRequired: true, itemRequired: true,
    extras: [
      { key: 'item', label: t('om.pickup.item'), type: 'text', ph: t('om.pickup.itemPh'), formHidden: true },
      { key: 'weight', label: t('om.pickup.weight'), type: 'number', ph: t('om.pickup.weightPh'), formHidden: true },
    ],
  },
  delivery: {
    hasRoute: true, hasDeadline: true, hasReward: true, hasImages: false, deadlineRequired: true,
    fromLabel: t('om.delivery.fromLabel'), toLabel: t('om.delivery.toLabel'),
    fromTag: t('om.delivery.fromTag'), toTag: t('om.delivery.toTag'), deadlineLabel: t('om.delivery.deadlineLabel'),
    autoDelistRequired: true, itemRequired: true,
    extras: [
      { key: 'item', label: t('om.delivery.item'), type: 'text', ph: t('om.delivery.itemPh'), formHidden: true },
      { key: 'weight', label: t('om.delivery.weight'), type: 'number', ph: t('om.delivery.weightPh'), formHidden: true },
    ],
  },
  carpool: {
    hasRoute: true, hasDeadline: false, hasReward: false, hasImages: false, // 出行信息无报酬
    fromLabel: t('om.carpool.fromLabel'), toLabel: t('om.carpool.toLabel'),
    fromTag: t('om.carpool.fromTag'), toTag: t('om.carpool.toTag'),
    autoDelistRequired: true,
    extras: [
      { key: 'time', label: t('om.carpool.time'), type: 'datetime', required: true },
      { key: 'seats', label: t('om.carpool.seats'), type: 'number', ph: t('om.carpool.seatsPh'), required: true },
    ],
  },
  groupbuy: {
    hasRoute: false, hasDeadline: true, hasReward: false, deadlineRequired: true, autoDelistRequired: true,
    deadlineLabel: t('om.groupbuy.deadlineLabel'),
    extras: [
      { key: 'productName', label: t('om.groupbuy.productName'), type: 'text', ph: t('om.groupbuy.productNamePh'), required: true },
      { key: 'platform', label: t('om.groupbuy.platform'), type: 'text', ph: t('om.groupbuy.platformPh') },
      { key: 'totalPrice', label: t('om.groupbuy.totalPrice'), type: 'number', ph: t('om.groupbuy.totalPricePh') },
      { key: 'target', label: t('om.groupbuy.target'), type: 'number', ph: t('om.groupbuy.targetPh'), required: true },
    ],
  },
  secondhand: {
    hasRoute: false, hasDeadline: false, hasReward: false, noTitle: true,
    extras: [
      { key: 'productName', label: t('om.secondhand.productName'), type: 'text', ph: t('om.secondhand.productNamePh'), required: true },
      { key: 'condition', label: t('om.secondhand.condition'), type: 'picker', map: 'condition', options: P('condition', ['99新', '9新', '8新', '7新', '明显使用痕迹']), required: true },
      { key: 'price', label: t('om.secondhand.price'), type: 'number', ph: t('om.secondhand.pricePh'), required: true },
      { key: 'originalPrice', label: t('om.secondhand.originalPrice'), type: 'number', ph: t('om.secondhand.originalPricePh'), required: true },
      { key: 'contactType', label: t('om.secondhand.contactType'), type: 'picker', map: 'contactType', options: P('contactType', ['QQ', '微信', '电话']), required: true },
      { key: 'contactAccount', label: t('om.secondhand.contactAccount'), type: 'text', ph: t('om.secondhand.contactAccountPh'), required: true, max: 200 },
    ],
  },
  housing: {
    hasRoute: false, hasDeadline: false, hasReward: false,
    descPh: t('om.housing.descPh'), // 描述占位文案（租房专属：说明家具电器情况）
    extras: [
      { key: 'rentType', label: t('om.housing.rentType'), type: 'picker', map: 'rentType', options: P('rentType', ['求租', '转租', '出租']), formHidden: true }, // 顶部胶囊选择，不渲染下拉
      { key: 'roomType', label: t('om.housing.roomType'), type: 'picker', map: 'roomType', options: P('roomType', ['单间', '考试院', '公寓', '合租', '整租']), required: true },
      { key: 'price', label: t('om.housing.price'), type: 'number', ph: t('om.housing.pricePh'), required: true },
      { key: 'deposit', label: t('om.housing.deposit'), type: 'number', ph: t('om.housing.depositPh'), required: true },
      { key: 'location', label: t('om.housing.location'), type: 'text', ph: t('om.housing.locationPh'), required: true },
      { key: 'manageFee', label: t('om.housing.manageFee'), type: 'number', ph: t('om.housing.manageFeePh'), required: true },
      { key: 'internet', label: t('om.housing.internet'), type: 'picker', map: 'internet', options: P('internet', ['包网', '不包网']), required: true },
      { key: 'extraFee', label: t('om.housing.extraFee'), type: 'picker', map: 'extraFee', options: P('extraFee', ['是', '否']), required: true },
    ],
  },
  parttime: {
    hasRoute: false, hasDeadline: false, hasReward: false, hasImages: false, noDesc: true, // 兼职用「招聘要求」替代描述，不上传图片
    extras: [
      { key: 'parttimeType', label: t('om.parttime.parttimeType'), type: 'picker', map: 'parttimeType', options: P('parttimeType', ['找兼职', '招兼职']), formHidden: true }, // 顶部胶囊选择，不渲染下拉
      { key: 'type', label: t('om.parttime.type'), type: 'picker', map: 'parttimeJobType', options: P('parttimeJobType', ['餐厅', '便利店', '家教', '翻译', '活动', '其他']), required: true },
      { key: 'payAmount', label: t('om.parttime.payAmount'), type: 'payRow', required: true,
        unitKey: 'payUnit', unitOptions: P('payUnit', ['每小时', '每天']), unitPh: t('om.parttime.payUnitPh'), unitSymbol: localCurrency() }, // 合并行：金额 + 单位
      { key: 'payUnit', label: t('om.parttime.payUnit'), type: 'picker', map: 'payUnit', options: P('payUnit', ['每小时', '每天']), required: true, formHidden: true },
      { key: 'workHours', label: t('om.parttime.workHours'), type: 'payRow', required: true, ph: t('om.parttime.workHoursPh'),
        unitKey: 'workHoursUnit', unitOptions: P('workHoursUnit', ['每天', '每周']), unitPh: t('om.parttime.workHoursUnitPh') }, // 合并行：时长 + 单位
      { key: 'workHoursUnit', label: t('om.parttime.workHoursUnit'), type: 'picker', map: 'workHoursUnit', options: P('workHoursUnit', ['每天', '每周']), required: true, formHidden: true },
      { key: 'workLocation', label: t('om.parttime.workLocation'), type: 'text', ph: t('om.parttime.workLocationPh'), required: true, max: 200 },
      { key: 'requirement', label: t('om.parttime.requirement'), type: 'textarea', ph: t('om.parttime.requirementPh'), required: true, max: 100 },
      { key: 'contactType', label: t('om.parttime.contactType'), type: 'picker', map: 'contactType', options: P('contactType', ['QQ', '微信', '电话']), required: true },
      { key: 'contactAccount', label: t('om.parttime.contactAccount'), type: 'text', ph: t('om.parttime.contactAccountPh'), required: true, max: 200 },
      { key: 'specialNote', label: t('om.parttime.specialNote'), type: 'text', ph: t('om.parttime.specialNotePh'), max: 50 }, // 选填
    ],
  },
  companion: {
    hasRoute: false, hasDeadline: true, hasReward: false, hasImages: false,
    deadlineRequired: true, deadlineLabel: t('om.companion.deadlineLabel'),
    extras: [
      { key: 'activity', label: t('om.companion.activity'), type: 'text', ph: t('om.companion.activityPh') },
      { key: 'price', label: t('om.companion.price'), type: 'priceRow', required: true,
        countKey: 'priceN', unitKey: 'priceUnit', unitOptions: P('priceUnit', ['次', '时']), countPh: t('om.companion.countPh'), unitPh: t('om.companion.unitPh') }, // 合并行：金额 每 N 次/时
      { key: 'priceN', label: t('om.companion.priceN'), type: 'number', required: true, formHidden: true },
      { key: 'priceUnit', label: t('om.companion.priceUnit'), type: 'picker', map: 'priceUnit', options: P('priceUnit', ['次', '时']), required: true, formHidden: true },
      { key: 'contactType', label: t('om.companion.contactType'), type: 'picker', map: 'contactType', options: P('contactType', ['QQ', '微信', '电话']), required: true },
      { key: 'contactAccount', label: t('om.companion.contactAccount'), type: 'text', ph: t('om.companion.contactAccountPh'), required: true, max: 200 },
    ],
  },
  friends: {
    hasRoute: false, hasDeadline: false, hasReward: false, hasImages: true, noDesc: true,
    extras: [
      { key: 'gender', label: t('om.friends.gender'), type: 'picker', map: 'gender', options: P('gender', ['男', '女', '跨性别']), required: true },
      { key: 'age', label: t('om.friends.age'), type: 'number', ph: t('om.friends.agePh'), required: true },
      { key: 'height', label: t('om.friends.height'), type: 'number', ph: t('om.friends.heightPh'), required: true },
      { key: 'weight', label: t('om.friends.weight'), type: 'number', ph: t('om.friends.weightPh'), required: true },
      { key: 'bodyType', label: t('om.friends.bodyType'), type: 'picker', map: 'bodyType', options: P('bodyType', ['匀称', '肌肉', '健美', '偏胖', '不想说']), required: true },
      { key: 'hobbies', label: t('om.friends.hobbies'), type: 'text', ph: t('om.friends.hobbiesPh'), required: true, max: 200 },
      { key: 'skills', label: t('om.friends.skills'), type: 'text', ph: t('om.friends.skillsPh'), required: true, max: 200 },
      { key: 'mbti', label: t('om.friends.mbti'), type: 'picker',
        options: P(null, ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP']),
        required: true },
      { key: 'constellation', label: t('om.friends.constellation'), type: 'picker', map: 'constellation',
        options: P('constellation', ['白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座', '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座']),
        required: true },
      { key: 'contactType', label: t('om.friends.contactType'), type: 'picker', map: 'contactType', options: P('contactType', ['QQ', '微信', 'IG', '抖音', '快手']), required: true },
      { key: 'contactAccount', label: t('om.friends.contactAccount'), type: 'text', ph: t('om.friends.contactAccountPh'), required: true },
      { key: 'seekRelation', label: t('om.friends.seekRelation'), type: 'picker', map: 'seekRelation', options: P('seekRelation', ['情侣', '兄弟', '朋友', '搭子']), required: true },
      { key: 'seekGender', label: t('om.friends.seekGender'), type: 'picker', map: 'seekGender', options: P('seekGender', ['男', '女', '不限制']), required: true },
      { key: 'seekReq', label: t('om.friends.seekReq'), type: 'text', ph: t('om.friends.seekReqPh'), required: true, max: 200 },
    ],
  },
  homecook: {
    hasRoute: false, hasDeadline: false, hasReward: false, hasImages: false,
    extras: [
      { key: 'cookType', label: t('om.homecook.cookType'), type: 'picker', map: 'cookType', options: P('cookType', ['做菜', '点菜']), formHidden: true }, // 顶部胶囊选择，不渲染下拉
      { key: 'date', label: t('om.homecook.date'), type: 'date', required: true }, // 日期（默认当天，不带时间）
      { key: 'mealSlot', label: t('om.homecook.mealSlot'), type: 'picker', map: 'mealSlot', options: P('mealSlot', ['早', '中', '晚', '下午茶']), required: true },
      // 做菜方：拿手菜 + 每份价格
      { key: 'dish', label: t('om.homecook.dish'), type: 'text', ph: t('om.homecook.dishPh'), required: true, max: 200, showWhen: { key: 'cookType', value: '做菜' } },
      { key: 'price', label: t('om.homecook.price'), type: 'number', ph: t('om.homecook.pricePh'), required: true, showWhen: { key: 'cookType', value: '做菜' } },
      { key: 'detail', label: t('om.homecook.detail'), type: 'textarea', ph: t('om.homecook.detailPh'), max: 100, showWhen: { key: 'cookType', value: '做菜' } },
      // 点菜方：想吃什么 + 预算
      { key: 'wantDish', label: t('om.homecook.wantDish'), type: 'text', ph: t('om.homecook.wantDishPh'), required: true, max: 200, showWhen: { key: 'cookType', value: '点菜' } },
      { key: 'budget', label: t('om.homecook.budget'), type: 'number', ph: t('om.homecook.budgetPh'), required: true, showWhen: { key: 'cookType', value: '点菜' } },
      { key: 'servings', label: t('om.homecook.servings'), type: 'number', ph: t('om.homecook.servingsPh'), showWhen: { key: 'cookType', value: '点菜' } },
      { key: 'requirement', label: t('om.homecook.requirement'), type: 'text', ph: t('om.homecook.requirementPh'), max: 200, showWhen: { key: 'cookType', value: '点菜' } },
      // 共用：联系方式
      { key: 'contactType', label: t('om.homecook.contactType'), type: 'picker', map: 'contactType', options: P('contactType', ['QQ', '微信', '电话']), required: true },
      { key: 'contactAccount', label: t('om.homecook.contactAccount'), type: 'text', ph: t('om.homecook.contactAccountPh'), required: true, max: 200 },
    ],
  },
  meal: {
    hasRoute: false, hasDeadline: false, hasReward: false, hasImages: false,
    extras: [
      { key: 'date', label: t('om.meal.date'), type: 'date', required: true }, // 日期（默认当天，不带时间）
      { key: 'mealSlot', label: t('om.meal.mealSlot'), type: 'picker', map: 'mealSlot', options: P('mealSlot', ['早', '中', '晚', '下午茶']), required: true },
      { key: 'food', label: t('om.meal.food'), type: 'text', ph: t('om.meal.foodPh'), required: true, max: 200 },
      { key: 'people', label: t('om.meal.people'), type: 'number', ph: t('om.hangout.peoplePh'), required: true },
      { key: 'contactType', label: t('om.meal.contactType'), type: 'picker', map: 'contactType', options: P('contactType', ['QQ', '微信', '电话']), required: true },
      { key: 'contactAccount', label: t('om.meal.contactAccount'), type: 'text', ph: t('om.meal.contactAccountPh'), required: true, max: 200 },
    ],
  },
  hangout: {
    hasRoute: false, hasDeadline: true, hasReward: false, hasImages: false, noTitle: true,
    deadlineRequired: true, autoDelistRequired: true, deadlineLabel: t('om.hangout.deadlineLabel'),
    extras: [
      { key: 'type', label: t('om.hangout.type'), type: 'picker', map: 'hangoutType', options: P('hangoutType', ['麻将', '棋牌', '约饭', '开黑', '办登陆证', '健身房', '喝咖啡', '自定义']), required: true },
      { key: 'customType', label: t('om.hangout.customType'), type: 'text', ph: t('om.hangout.customTypePh'), showWhen: { key: 'type', value: '自定义' } },
      { key: 'people', label: t('om.hangout.people'), type: 'number', ph: t('om.hangout.peoplePh'), required: true },
      { key: 'minPeople', label: t('om.hangout.minPeople'), type: 'number', ph: t('om.hangout.minPeoplePh') },
      { key: 'contactType', label: t('om.hangout.contactType'), type: 'picker', map: 'contactType', options: P('contactType', ['QQ', '微信', '电话']), required: true },
      { key: 'contactAccount', label: t('om.hangout.contactAccount'), type: 'text', ph: t('om.hangout.contactAccountPh'), required: true, max: 200 },
    ],
  },
});

// 按语言记忆化(语言切换靠 setLang+reLaunch,模块常驻内存,必须随 lang 重建)
let _catCache = null;
let _catLang = '';
const taskCategories = () => {
  const l = i18n.getLang();
  if (l !== _catLang) {
    _catCache = buildTaskCategories();
    _catLang = l;
  }
  return _catCache;
};

// 兼容旧引用(order/history.js 的 TASK_CATEGORIES[id] 真值判断等):转发到当前语言实例
const TASK_CATEGORIES = new Proxy({}, { get: (_, k) => taskCategories()[k] });

const taskCategory = (id) =>
  taskCategories()[id] || { hasRoute: false, hasDeadline: false, hasReward: false, hasImages: true, extras: [] };

// 订单 payload → 展示行 [{key, label, value}]（列表/详情共用）
// picker 字段(带 map)的存值为中文枚举,显示经 tv() 换语言;自由文本原样
const payloadRows = (functionId, payload) => {
  const cfg = taskCategory(functionId);
  const rows = [];
  // 陪玩陪聊：价格/数量/单位三件套拼成一行（如「¥50 每 1 时」），不散开展示
  if (functionId === 'companion' && payload && payload.price) {
    let value;
    if (payload.priceN) {
      value = t('common.pricePer', { price: payload.price, n: payload.priceN, unit: payload.priceUnit ? tv('priceUnit', payload.priceUnit) : '' });
    } else {
      value = localCurrency() + payload.price;
    }
    rows.push({ key: 'price', label: t('common.price'), value });
  }
  (cfg.extras || []).forEach((f) => {
    if (functionId === 'companion' && ['price', 'priceN', 'priceUnit'].includes(f.key)) return; // 已拼成一行
    const v = payload && payload[f.key];
    if (v !== undefined && v !== null && v !== '') {
      rows.push({ key: f.key, label: f.label, value: f.map ? tv(f.map, v) : String(v) });
    }
  });
  return rows;
};

// 列表卡片摘要：路线 或 专属字段拼接
const summaryText = (o) => {
  // 交友扩列：紧凑单行摘要（性别 · 年龄 · 身高 · 体重）
  if (o.functionId === 'friends' && o.payload) {
    const p = o.payload;
    const parts = [];
    if (p.gender) parts.push(tv('gender', p.gender));
    if (p.age) parts.push(t('common.ageYears', { n: p.age }));
    if (p.height) parts.push(p.height + 'cm');
    if (p.weight) parts.push(p.weight + 'kg');
    if (parts.length) return { type: 'rows', text: parts.join(' · ') };
  }
  const route = [];
  if (o.from) route.push(o.from);
  if (o.to) route.push(o.to);
  if (route.length) {
    const cfg = taskCategory(o.functionId);
    return {
      type: 'route',
      from: route[0],
      to: route[1] || route[0],
      fromTag: cfg.fromTag || t('value.fromTag.default'),
      toTag: cfg.toTag || t('value.toTag.default'),
      text: route.join(' → '),
    };
  }
  let rows = payloadRows(o.functionId, o.payload);
  // 兼职的找/招类型已用彩色徽章展示，摘要不重复（按 key 过滤,label 会随语言变化,不能比较 label）
  if (o.functionId === 'parttime') rows = rows.filter((r) => r.key !== 'parttimeType');
  // 摘要只取前 3 行（日期/餐段/核心内容），联系方式等不挤进卡片
  return { type: 'rows', rows: rows.slice(0, 2), text: rows.slice(0, 3).map((r) => `${r.label} ${r.value}`).join(' · ') };
};

// 租房三标签：求租 / 转租 / 出租（三色徽章;查表仍按中文 key,返回 label 本地化）
const RENT_TAG_META = {
  '求租': { bg: '#DFF6EC', color: '#3E8E6B' },
  '转租': { bg: '#FFF3CE', color: '#B07F2E' },
  '出租': { bg: '#FFF4F8', color: '#F76E9C' },
};

// 拆单/凑单徽章（拆单：买多了找人分；凑单：凑满减凑包邮）
const GB_TAG_META = {
  '拆单': { bg: '#DFF6EC', color: '#3E8E6B' },
  '凑单': { bg: '#EAE4FF', color: '#7A6BC9' },
};

// 拆单凑单单的标签徽章信息；非拆单凑单返回 null
const gbTagOf = (o) => {
  if (o.functionId !== 'groupbuy') return null;
  const label = o.payload && o.payload.gbType;
  if (!label || !GB_TAG_META[label]) return null;
  return { label: tv('gbType', label), ...GB_TAG_META[label] };
};

// 租房单的标签徽章信息；非租房返回 null
const rentTagOf = (o) => {
  if (o.functionId !== 'housing') return null;
  const label = o.payload && o.payload.rentType;
  if (!label || !RENT_TAG_META[label]) return null;
  return { label: tv('rentType', label), ...RENT_TAG_META[label] };
};

// 兼职两标签：找兼职 / 招兼职（两色徽章）
const PARTTIME_TAG_META = {
  '找兼职': { bg: '#DFF6EC', color: '#3E8E6B' },
  '招兼职': { bg: '#EAE4FF', color: '#7A6BC9' },
};

// 兼职单的标签徽章信息；非兼职返回 null
const parttimeTagOf = (o) => {
  if (o.functionId !== 'parttime') return null;
  const label = o.payload && o.payload.parttimeType;
  if (!label || !PARTTIME_TAG_META[label]) return null;
  return { label: tv('parttimeType', label), ...PARTTIME_TAG_META[label] };
};

// 私厨点菜两标签：做菜 / 点菜（两色徽章）
const HOMECOOK_TAG_META = {
  '做菜': { bg: '#DFF6EC', color: '#3E8E6B' },
  '点菜': { bg: '#EAE4FF', color: '#7A6BC9' },
};

// 私厨点菜单的标签徽章信息；非私厨点菜返回 null
const homecookTagOf = (o) => {
  if (o.functionId !== 'homecook') return null;
  const label = o.payload && o.payload.cookType;
  if (!label || !HOMECOOK_TAG_META[label]) return null;
  return { label: tv('cookType', label), ...HOMECOOK_TAG_META[label] };
};

// 帮取/帮送：期望时间超时后自动视为已下架（读取时判定，无需定时任务）
const DEADLINE_AUTO_FUNCTIONS = ['pickup', 'delivery', 'carpool', 'groupbuy', 'hangout'];
const LISTING_TTL_FUNCTIONS = ['secondhand', 'housing', 'parttime', 'friends', 'companion']; // 发布后默认 30 天自动下架

const isExpiredOf = (o) => {
  // 拼好饭/私厨点菜：以「日期」为准，当天有效，次日 0 点起过期（读取时判定，无需定时任务）
  if (o.functionId === 'meal' || o.functionId === 'homecook') {
    const d = o.payload && o.payload.date;
    if (!d) return false;
    const end = new Date(String(d).slice(0, 10).replace(/-/g, '/') + ' 23:59:59').getTime();
    return Date.now() > end;
  }
  if (!DEADLINE_AUTO_FUNCTIONS.includes(o.functionId) && !LISTING_TTL_FUNCTIONS.includes(o.functionId)) return false;
  // 只按「任务下架时间」判定；无该字段（老单）不自动下架，只能手动下架
  const expireAt = o.autoDelistAt || (o.payload && o.payload.autoDelistTime) || '';
  if (!expireAt) return false;
  return new Date(expireAt.replace(/-/g, '/')).getTime() < Date.now();
};

// 有效状态：超时的单视为已下架；拼好饭/私厨点菜日期过后视为已过期
const effectiveStatusOf = (o) => {
  if (isExpiredOf(o) && (o.status === 'pending' || o.status === 'active')) {
    return (o.functionId === 'meal' || o.functionId === 'homecook') ? 'expired' : 'cancelled';
  }
  return o.status;
};

// 是否仍在大厅展示中（未超时的展示单）
const isVisibleOf = (o) => ['pending', 'active'].includes(effectiveStatusOf(o));

// 状态元信息：帮取帮送未超时显示「进行中」
const statusMetaOf = (o) => {
  const s = effectiveStatusOf(o);
  // 闲置等:卖家标记「已预订」,仍在展示,只换标签
  if (o.reserved && (s === 'active' || s === 'pending')) return { label: t('value.status.reserved'), bg: '#FFF1E6', color: '#A4501A' };
  const meta = statusMeta(s);
  if (DEADLINE_AUTO_FUNCTIONS.includes(o.functionId) && (s === 'active' || s === 'pending')) {
    return { ...meta, label: t('value.status.ongoing') };
  }
  return meta;
};

const __exports = {
  funcMeta, statusMeta, statusMetaOf, rewardLabel,
  FLOW_OF, flowOf, TASK_CATEGORIES, taskCategory, taskCategories, payloadRows, summaryText,
  RENT_TAG_META, rentTagOf, GB_TAG_META, gbTagOf, PARTTIME_TAG_META, parttimeTagOf,
  HOMECOOK_TAG_META, homecookTagOf,
  DEADLINE_AUTO_FUNCTIONS, isExpiredOf, effectiveStatusOf, isVisibleOf,
};
export { funcMeta, statusMeta, statusMetaOf, rewardLabel, FLOW_OF, flowOf, TASK_CATEGORIES, taskCategory, taskCategories, payloadRows, summaryText, RENT_TAG_META, rentTagOf, GB_TAG_META, gbTagOf, PARTTIME_TAG_META, parttimeTagOf, HOMECOOK_TAG_META, homecookTagOf, DEADLINE_AUTO_FUNCTIONS, isExpiredOf, effectiveStatusOf, isVisibleOf };
export default __exports;
