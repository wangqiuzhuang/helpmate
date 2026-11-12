// krstuast 业务云函数
//
// 订单分三种流程（flow），按功能实际场景设计，而非一套流程套所有：
//   claim   单人认领：帮取/帮送/陪玩陪练陪聊
//           pending(待接单) → active(进行中) → done(完成) / cancelled
//           认领后双方确认完成，互评
//   join    多人加入：拼车/凑单
//           pending(招募中) → full(满员) → done(成行·成团) / cancelled
//           participants[] 记录参与者，人数达标自动满员，发布人确认成行
//   listing 货架式：闲置/租房/兼职
//           pending(在售/出租中/招聘中) → sold(已售出/已租出/已招满) / cancelled
//           买家点「我想要」，卖家标记已售出，无接单流程
//
// action 路由：
//   createOrder / claimOrder / joinOrder / leaveOrder / wantOrder / markSold /
//   cancelOrder / confirmOrder(claim) / confirmDoneJoin(join) /
//   reviewOrder / getOrders / getOrderDetail / getMyProfile / updateProfile /
//   createPost / getPosts / getPostDetail / addComment / deletePost / deleteComment
//
// 安全：全部读写基于 OPENID 鉴权；数据库权限建议「所有用户不可读写」。
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 用户短 ID：稳定、可展示、不暴露 openid
const genUid = (openid) => 'KS' + crypto.createHash('md5').update(openid).digest('hex').slice(0, 8).toUpperCase();

const TASK_FUNCTIONS = ['pickup', 'delivery', 'carpool', 'groupbuy', 'secondhand', 'housing', 'parttime', 'companion', 'hangout', 'friends', 'meal', 'homecook'];
const POST_FUNCTIONS = ['rant', 'help', 'qa', 'warning', 'food', 'confession', 'lostfound', 'treehole', 'freshman', 'game'];
// 游戏专区合规:禁止外挂/私服/代练代打/账号交易/代充/赌博等(内置词表 + 后台敏感词表都生效)
const GAME_BANNED = ['外挂', '辅助脚本', '挂机脚本', '透视', '自瞄', '私服', '破解版', '代练', '代打', '代肝', '护航', '陪玩', '代充', '低价充值', '折扣充值', '充值返利', '卖号', '买号', '收号', '出号', '租号', '账号交易', '账号出售', '盗号', '黑号', '刷钻', '刷金币', '赌', '博彩', '菠菜', '下注', '押注', '开盘', '抽奖返现', 'RMT'];
const gameBad = (...texts) => { const t = texts.join(' ').toLowerCase(); return GAME_BANNED.some((w) => t.includes(w.toLowerCase())); };
const GAME_BAD_MSG = '游戏专区禁止外挂、私服、代练代打、账号交易、代充、赌博等内容，请修改后再发';
// 互助问答悬赏:用积分(经验值)悬赏,只给被采纳的最佳答案;7 天未采纳自动退回
const QA_BOUNTY_OPTIONS = [0, 5, 10, 20, 50];
const QA_ACCEPT_BONUS = 5; // 被采纳额外奖励
const QA_BOUNTY_DAYS = 7;
// 帖子也要有始有终:open(展示中) → closed(已结束),closeReason: solved(已解决/已找回) | manual(作者结束) | expired(到期自动结束)
// 结束后不在大厅展示、不能再评论;作者主页仍可看到。作者手动结束的可以重新打开(重新计时)
const POST_TTL_DAYS = { food: 90, freshman: 90 }; // 其余默认 30 天
const POST_TTL_DEFAULT = 30;
const postTtlMs = (fid) => (POST_TTL_DAYS[fid] || POST_TTL_DEFAULT) * 864e5;
const postCloseAt = (p) => p.closeAt || (p.createdAt || 0) + postTtlMs(p.functionId);
const SOLVABLE_POSTS = ['qa', 'help', 'lostfound']; // 有「已解决/已找回」结局的板块
const ORDER_FALLBACK_DAYS = 30;
const ROUTE_FUNCTIONS = ['pickup', 'delivery', 'carpool'];
const ANON_FUNCTIONS = ['treehole', 'confession'];

// 流程分配
const FLOWS = {
  pickup: 'claim', delivery: 'claim', companion: 'claim',
  carpool: 'join', groupbuy: 'join', hangout: 'join', meal: 'join',
  secondhand: 'listing', housing: 'listing', parttime: 'listing',
};
// join 流程的人数目标来自 payload 哪个字段
const JOIN_TARGET_FIELD = { carpool: 'seats', groupbuy: 'target' };

const CLOUD_VERSION = 'v2026-11-01.hangout2'; // 云函数版本号（诊断用：dbCheck 接口返回）

// ---------- 意见反馈微信推送（开发者本人） ----------
// 使用 Server酱（https://sct.ftqq.com）：微信扫码登录 → 复制 SendKey 填到这里。
// 用户提交意见反馈后，你的微信「服务通知」会收到推送；留空则不推送。
const FEEDBACK_PUSH_KEY = process.env.FEEDBACK_PUSH_KEY || '';

// ---------- 订阅消息（用户收到回复/私聊时的微信服务通知） ----------
// 在微信公众平台「订阅消息」申请模板后把模板 ID 填到这里；留空则不推送。
// 注意：普通类目为「一次性订阅」——用户每授权一次可推送一条，发送失败静默忽略。
const SUBSCRIBE_TEMPLATES = {
  comment: '', // 帖子/订单收到新评论提醒（建议「评论回复通知」类模板）
  chat: '',    // 收到私聊消息提醒（建议「新消息通知」类模板）
};

const ok = (data) => ({ success: true, ...data });
const fail = (message, code) => ({ success: false, message: message || '服务开小差了 🥲', code: code || 'BIZ_ERROR' });
const now = () => Date.now();
// 闲置/租房/兼职/交友/陪玩:没有期望时间,发布后默认 N 天自动下架(到期可一键重新上架,编辑也会顺延)
const LISTING_TTL_FUNCTIONS = ['secondhand', 'housing', 'parttime', 'friends', 'companion'];
const LISTING_TTL_DAYS = Number(process.env.LISTING_TTL_DAYS || 30); // 默认值;后台「系统设置」可改
// 时间统一按 'YYYY-MM-DD HH:mm'(韩国时间)存,与客户端选择器格式一致
const fmtLocal = (ts) => new Date(ts + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
const listingDelistAt = (days) => fmtLocal(now() + (days || LISTING_TTL_DAYS) * 24 * 3600 * 1000);
const isPastLocal = (s) => !!s && new Date(String(s).replace(' ', 'T') + ':00+09:00').getTime() < now();

// ---------- 运营配置(后台「系统设置/敏感词/公告/版本」写入 app_config,这里 60 秒缓存)----------
const CONFIG_TTL = 60 * 1000;
const _cfgCache = {};
async function getConfig(key, fallback) {
  const c = _cfgCache[key];
  if (c && c.exp > Date.now()) return c.value;
  let value = fallback;
  try {
    const d = (await db.collection('app_config').doc('cfg_' + key).get()).data;
    if (d && d.value !== undefined) value = d.value;
  } catch (e) {}
  _cfgCache[key] = { value, exp: Date.now() + CONFIG_TTL };
  return value;
}
async function getSettings() {
  const s = (await getConfig('settings', {})) || {};
  const num = (v, d) => (Number(v) > 0 ? Number(v) : d);
  return {
    translateDailyLimit: num(s.translateDailyLimit, Number(process.env.TRANSLATE_DAILY_LIMIT || 200)),
    listingTtlDays: num(s.listingTtlDays, Number(process.env.LISTING_TTL_DAYS || 30)),
    guestMaxItems: num(s.guestMaxItems, 30),
  };
}

// 敏感词:mode=block 拦截并提示修改;mode=mask 替换成 ***
const escRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function screenTexts(obj, keys) {
  if (!obj) return '';
  const cfg = (await getConfig('sensitive', { words: [], mode: 'block' })) || {};
  const words = (cfg.words || []).map((w) => String(w).trim()).filter(Boolean);
  if (!words.length) return '';
  const re = new RegExp(words.map(escRe).join('|'), 'gi');
  for (const k of keys || Object.keys(obj)) {
    const v = obj[k];
    if (typeof v !== 'string' || !v) continue;
    re.lastIndex = 0;
    if (!re.test(v)) continue;
    if (cfg.mode === 'mask') obj[k] = v.replace(re, (m) => '*'.repeat(m.length));
    else return '内容包含不当词语，请修改后再发布';
  }
  return '';
}

// 用户状态:封禁 / 黑名单
async function getUserDoc(userId) {
  try {
    return (await db.collection('users').doc(userId).get()).data || null;
  } catch (e) {
    return null;
  }
}
const isBanned = (u) => !!(u && u.bannedUntil && u.bannedUntil > Date.now());
async function blockedOf(userId) {
  if (!userId) return [];
  const u = await getUserDoc(userId);
  return (u && Array.isArray(u.blocked) && u.blocked) || [];
}
// 列表查询:排除后台隐藏的内容 + 我拉黑的人发的内容
async function visibleWhere(viewer) {
  const w = { hidden: _.neq(true) };
  const bl = await blockedOf(viewer);
  if (bl.length) w.publisherId = _.nin(bl);
  return w;
}

// 国家:学校 ID 前缀即国家(kr-xxxx 韩国 / cn-xxxx 中国);全站类查询按国家隔离
const COUNTRIES = ['kr', 'cn'];
const countryOf = (schoolId) => {
  const c = String(schoolId || '').split('-')[0];
  return COUNTRIES.includes(c) ? c : '';
};
// 无 schoolId 的「全站」查询:带 country 时只看该国
const scopeWhere = (schoolId, country) => (schoolId ? { schoolId } : COUNTRIES.includes(country) ? { country } : {});

// ---------- users ----------

const newUserDoc = (openid, schoolId) => ({
  _id: openid,
  uid: genUid(openid), // 用户短 ID（展示用，只读）
  schoolId: schoolId || '',
  nickname: '微信用户',
  avatarUrl: '',
  rating: 0,
  ratingCount: 0,
  publishCount: 0,
  claimCount: 0,
  doneCount: 0,
  major: '',
  age: 0,
  gender: '',
  hometown: '',
  orientation: '',
  roleAttr: '',      // 属性标签（性取向为同性恋时可选）：top/btm/vers/side/other
  relationship: '',
  signature: '',
  createdAt: now(),
});

async function ensureUser(openid, schoolId) {
  const users = db.collection('users');
  try {
    const res = await users.doc(openid).get();
    const u = res.data;
    const patch = {};
    // 只在还没有学校时直接设置;已有学校时换校必须走 changeSchool(每周限 2 次,超出需管理员审核)
    if (schoolId && !u.schoolId) patch.schoolId = schoolId;
    if (!u.uid) patch.uid = genUid(openid); // 老用户补齐短 ID
    if (Object.keys(patch).length) {
      await users.doc(openid).update({ data: patch });
      Object.assign(u, patch);
    }
    return u;
  } catch (e) {
    const doc = newUserDoc(openid, schoolId);
    await users.add({ data: doc });
    return doc;
  }
}

const PUBLIC_FIELDS = {
  nickname: true, avatarUrl: true, rating: true, ratingCount: true,
  publishCount: true, claimCount: true, doneCount: true, schoolId: true,
  uid: true, // 用户短 ID 公开（交友/订单卡片可展示）
  major: true, age: true, gender: true, hometown: true,
  relationship: true, signature: true, // 性取向/属性标签已下线,不再公开
};

async function getUserPublic(userId) {
  const u = await ensureUser(userId);
  const pub = {};
  for (const k of Object.keys(PUBLIC_FIELDS)) pub[k] = u[k];
  pub.level = levelOf(u.exp);
  pub.badges = badgesOf(u);
  return pub;
}

async function incCounter(userId, field) {
  // 先直接自增（少一次读，降低延迟）；用户文档不存在时再创建后重试
  try {
    await db.collection('users').doc(userId).update({ data: { [field]: _.inc(1) } });
  } catch (e) {
    await ensureUser(userId);
    await db.collection('users').doc(userId).update({ data: { [field]: _.inc(1) } });
  }
}

// 流程从功能类型推导（兼容老数据：早期订单没有存 flow 字段）
const flowOfOrder = (o) => o.flow || FLOWS[o.functionId] || 'claim';

async function getOrder(orderId) {
  return db.collection('orders').doc(orderId).get().then((r) => r.data).catch(() => null);
}

// ---------- 创建/编辑订单 ----------

// 校验 + 字段构建（createOrder / updateOrder 共用）
async function buildOrderFields(p) {
  const { functionId, title, desc, images, from, to, deadline, autoDelistAt, rewardAmount, rewardText, payload, schoolId } = p || {};
  if (!TASK_FUNCTIONS.includes(functionId)) return fail('功能类型不支持');
  if (!['hangout', 'secondhand'].includes(functionId) && (!title || !title.trim() || title.trim().length > 200)) return fail('标题必填（200 字以内）');
  if (ROUTE_FUNCTIONS.includes(functionId)) {
    if (!from || !from.trim()) return fail('请填写出发/取件地点');
    if (!to || !to.trim()) return fail('请填写目的地/送达地点');
  }
  if ((desc || '').length > 50) return fail('描述 50 字以内');
  // 帮取/帮送：期望时间必传
  if (['pickup', 'delivery'].includes(functionId) && !deadline) return fail('请选择期望时间');
  // 陪玩陪聊：期望时间必传
  if (functionId === 'companion' && !deadline) return fail('请选择期望时间');
  // 拆单凑单：预期时间必传
  if (functionId === 'groupbuy' && !deadline) return fail('请选择预期时间');
  // 攒局：期望时间必传
  if (functionId === 'hangout' && !deadline) return fail('请选择期望时间');
  // 帮取/帮送/拼车/拆单凑单/攒局：任务下架时间必传
  if (['pickup', 'delivery', 'carpool', 'groupbuy', 'hangout'].includes(functionId) && !autoDelistAt) return fail('请选择任务下架时间');
  // 时间不得早于当前时间
  if (deadline && new Date(deadline.replace(/-/g, '/')).getTime() < now()) return fail('期望时间不能早于当前时间');
  if (autoDelistAt && new Date(autoDelistAt.replace(/-/g, '/')).getTime() < now()) return fail('下架时间不能早于当前时间');
  if (images && images.length > 6) return fail('最多 6 张图片');
  const amount = Number(rewardAmount);
  if (rewardAmount !== '' && rewardAmount != null && (isNaN(amount) || amount < 0 || amount > 10000000 || !/^\d+(\.\d{1,2})?$/.test(String(rewardAmount)))) return fail('报酬金额不合法');

  const extra = {};
  if (payload && typeof payload === 'object') {
    for (const k of Object.keys(payload)) {
      const v = payload[k];
      if (typeof v === 'string') extra[k] = v.trim().slice(0, 100); // 招聘要求等长文本上限 100
      else if (typeof v === 'number' && isFinite(v)) extra[k] = v;
    }
  }

  // 交友扩列：资料字段必填
  if (functionId === 'friends') {
    if (!extra.gender) return fail('请选择性别');
    const age = Number(extra.age);
    if (!extra.age || !(age >= 14 && age <= 100)) return fail('请填写年龄（14~100）');
    if (!extra.height || !(Number(extra.height) > 0)) return fail('请填写身高');
    if (!extra.weight || !(Number(extra.weight) > 0)) return fail('请填写体重');
    if (!extra.bodyType) return fail('请选择体型');
    if (!extra.hobbies) return fail('请填写兴趣爱好');
    if (!extra.skills) return fail('请填写技能');
    if (!extra.mbti) return fail('请填写 MBTI');
    if (!extra.constellation) return fail('请选择星座');
    if (!extra.contactType) return fail('请选择联系方式');
    if (!extra.contactAccount) return fail('请填写账号信息');
    if (!extra.seekRelation) return fail('请选择寻找关系');
    if (!extra.seekGender) return fail('请选择寻找性别');
    if (!extra.seekReq) return fail('请填写寻找要求');
  }
  // 闲置：物品名称/新旧程度/价格/原价/联系方式必填
  if (functionId === 'secondhand') {
    if (!extra.productName) return fail('请填写物品名称');
    if (!extra.condition) return fail('请选择新旧程度');
    if (!extra.price || !(Number(extra.price) > 0)) return fail('请填写价格');
    if (!extra.originalPrice || !(Number(extra.originalPrice) > 0)) return fail('请填写原价');
    if (!extra.contactType) return fail('请选择联系方式');
    if (!extra.contactAccount) return fail('请填写号码');
    if ((extra.contactAccount || '').length > 200) return fail('号码 200 字以内');
  }
  // 陪玩陪聊：价格/数量/价格单位/联系方式必填
  if (functionId === 'companion') {
    if (!extra.price || !(Number(extra.price) > 0)) return fail('请填写价格');
    if (!extra.priceN || !(Number(extra.priceN) > 0)) return fail('请填写次数/时数');
    if (!extra.priceUnit) return fail('请选择价格单位');
    if (!extra.contactType) return fail('请选择联系方式');
    if (!extra.contactAccount) return fail('请填写号码');
    if ((extra.contactAccount || '').length > 200) return fail('号码 200 字以内');
  }
  // 私厨点菜：做菜/点菜双向校验
  if (functionId === 'homecook') {
    if (!extra.date) return fail('请选择用餐日期');
    if (!extra.mealSlot) return fail('请选择餐段');
    if (!extra.contactType) return fail('请选择联系方式');
    if (!extra.contactAccount) return fail('请填写号码');
    if ((extra.contactAccount || '').length > 200) return fail('号码 200 字以内');
    if (extra.cookType === '点菜') {
      if (!extra.wantDish) return fail('请填写想吃什么');
      if (!extra.budget || !(Number(extra.budget) > 0)) return fail('请填写预算');
    } else {
      if (!extra.dish) return fail('请填写拿手菜');
      if (!extra.price || !(Number(extra.price) > 0)) return fail('请填写每份价格');
    }
  }
  // 拼好饭：日期/餐段/吃什么/联系方式必填
  if (functionId === 'meal') {
    if (!extra.date) return fail('请选择日期');
    if (!extra.mealSlot) return fail('请选择餐段');
    if (!extra.food) return fail('请填写吃什么');
    if (!extra.contactType) return fail('请选择联系方式');
    if (!extra.contactAccount) return fail('请填写号码');
    if ((extra.contactAccount || '').length > 200) return fail('号码 200 字以内');
  }
  // 兼职：类型/金额/单位/工作地点/招聘要求必填
  if (functionId === 'parttime') {
    if (!extra.type) return fail('请选择类型');
    if (!extra.payAmount || !(Number(extra.payAmount) > 0)) return fail('请填写待遇金额');
    if (!extra.payUnit) return fail('请选择单位');
    if (!extra.workLocation) return fail('请填写工作地点');
    if ((extra.workLocation || '').length > 200) return fail('工作地点 200 字以内');
    if (!extra.requirement) return fail('请填写招聘要求');
    if (!extra.contactType) return fail('请选择联系方式');
    if (!extra.contactAccount) return fail('请填写号码');
    if ((extra.contactAccount || '').length > 200) return fail('号码 200 字以内');
    if (!extra.workHours || !(Number(extra.workHours) > 0)) return fail('请填写工作时长');
    if (!extra.workHoursUnit) return fail('请选择时长单位');
  }
  // 租房：房型/月租/保证金/位置/管理费/是否包网必填（管理费可为 0）
  if (functionId === 'housing') {
    if (!extra.roomType) return fail('请选择房型');
    if (!extra.price || !(Number(extra.price) > 0)) return fail('请填写月租');
    if (!extra.deposit || !(Number(extra.deposit) > 0)) return fail('请填写保证金');
    if (!extra.location) return fail('请填写位置');
    if (extra.manageFee === '' || extra.manageFee == null || isNaN(Number(extra.manageFee)) || Number(extra.manageFee) < 0) return fail('请填写管理费');
    if (!extra.internet) return fail('请选择是否包网');
    if (!extra.extraFee) return fail('请选择是否有其他额外收费');
  }
  // 攒局：类型/自定义类型/期望人数/联系方式校验
  if (functionId === 'hangout') {
    if (!extra.type) return fail('请选择类型');
    if (extra.type === '自定义' && !extra.customType) return fail('请填写自定义类型');
    if (!extra.people || !(Number(extra.people) > 0)) return fail('请填写期望人数');
    if (!extra.contactType) return fail('请选择联系方式');
    if (!extra.contactAccount) return fail('请填写号码');
    if ((extra.contactAccount || '').length > 200) return fail('号码 200 字以内');
  }
  // 拆单凑单：商品名称必传
  if (functionId === 'groupbuy' && !extra.productName) return fail('请填写商品名称');
  // 帮取/帮送：物品与重量必传（在 extra 构建完成后校验）
  if (['pickup', 'delivery'].includes(functionId)) {
    if (!extra.item) return fail('请填写物品');
    const wt = Number(extra.weight);
    if (!extra.weight || !/^\d+(\.\d{1,2})?$/.test(String(extra.weight)) || !(wt > 0) || wt > 100) return fail('请填写物品重量（0.01~100 kg）');
  }
  if (functionId === 'carpool' && (!extra.time || new Date(extra.time.replace(/-/g, '/')).getTime() < now())) {
    return fail('出发时间不能早于当前时间');
  }

  // 胶囊类型兜底：客户端未选时给默认值（保证卡片徽章可展示）
  if (functionId === 'housing' && !extra.rentType) extra.rentType = '求租';
  if (functionId === 'groupbuy' && !extra.gbType) extra.gbType = '拆单';
  if (functionId === 'parttime' && !extra.parttimeType) extra.parttimeType = '找兼职';
  if (functionId === 'homecook' && !extra.cookType) extra.cookType = '做菜';

  const flow = FLOWS[functionId];
  // join 流程：人数目标必填（拼车空位数 / 凑单目标人数）
  let targetN = 0;
  if (flow === 'join') {
    const field = JOIN_TARGET_FIELD[functionId];
    targetN = Math.floor(Number(extra[field] || (['hangout', 'meal'].includes(functionId) ? extra.people : 0)));
    if (functionId === 'meal') {
      // 饭搭子:人数含发起人,2~20
      if (!targetN || targetN < 2 || targetN > 20) return fail('饭搭子人数请填 2~20（含你自己）');
      targetN -= 1;
    } else if (functionId === 'hangout') {
      if (!targetN || targetN < 2 || targetN > 50) return fail('攒局人数请填 2~50（含你自己）');
      const minP = Math.floor(Number(extra.minPeople || 0));
      if (extra.minPeople && (!(minP >= 2) || minP > targetN)) return fail('最少成局人数需在 2 和总人数之间');
      targetN -= 1; // 名额不含发起人
    } else {
      // 拼车/拼单凑单:同样含发起人,填 2 表示「我 + 1 人」,发布时已有 1 人
      if (!targetN || targetN < 2 || targetN > 50) return fail('人数请填 2~50（含你自己）');
      targetN -= 1;
    }
  }

  return ok({
    fields: {
      functionId,
      flow,
      targetN,
      targetIncl: true, // 人数含发起人(2026-11-01 起统一口径)
      schoolId: schoolId || '',
      country: countryOf(schoolId),
      title: (title || '').trim(),
      desc: (desc || '').trim(),
      images: images || [],
      from: ROUTE_FUNCTIONS.includes(functionId) ? (from || '').trim() : '',
      to: ROUTE_FUNCTIONS.includes(functionId) ? (to || '').trim() : '',
      deadline: deadline || '',
      autoDelistAt: autoDelistAt || (LISTING_TTL_FUNCTIONS.includes(functionId) ? listingDelistAt((await getSettings()).listingTtlDays) : ''),
      rewardAmount: amount || 0,
      rewardText: (rewardText || '').trim(),
      payload: extra,
    },
  });
}

async function createOrder(openid, p) {
  const { clientOrderId } = p || {};
  // 幂等：网络抖动导致客户端重试时，同一 clientOrderId 不会重复建单
  if (clientOrderId) {
    const exist = await db.collection('orders').where({ clientOrderId, publisherId: openid }).limit(1).get();
    if (exist.data[0]) return ok({ orderId: exist.data[0]._id, duplicated: true });
  }
  const built = await buildOrderFields(p);
  if (!built.success) return built;
  const created = now();
  const order = {
    ...built.fields,
    clientOrderId: clientOrderId || '',
    secret: String((p && p.secret) || '').trim().slice(0, 100),
    publisherId: openid,
    helperId: '',
    participants: [], // 历史字段，无状态流转后不再使用
    wanters: [],
    wantCount: 0,
    status: 'active', // 无状态流转：发布即展示，直到发布人下架
    publisherConfirmed: false,
    helperConfirmed: false,
    createdAt: created,
    claimedAt: 0,
    doneAt: 0,
    soldAt: 0,
    cancelledAt: 0,
  };
  const res = await db.collection('orders').add({ data: order });
  await incCounter(openid, 'publishCount');
  return ok({ orderId: res._id });
}

// 编辑订单（仅发布人、仅展示中的订单）
async function updateOrder(openid, p) {
  const { orderId } = p || {};
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (o.publisherId !== openid) return fail('只有发布人可以编辑');
  if (!['pending', 'active'].includes(o.status)) return fail('已下架的订单不能编辑');
  // 客户端把表单放在 payload 里（与 createOrder 结构一致），必须解包再校验
  const built = await buildOrderFields(p.payload || p);
  if (!built.success) return built;
  const sec = ((p && p.payload) || p || {}).secret;
  await db.collection('orders').doc(orderId).update({ data: { ...built.fields, ...(sec !== undefined ? { secret: String(sec || '').trim().slice(0, 100) } : {}) } });
  return ok();
}

// 重新上架（仅发布人、仅手动下架的单；超时/过期单由前端懒判定兜底）
async function relistOrder(openid, orderId) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (o.publisherId !== openid) return fail('只有发布人可以操作');
  const isListing = LISTING_TTL_FUNCTIONS.includes(o.functionId);
  // 手动下架的单,或到期自动下架的闲置/租房等,都可以重新上架(重新计 N 天)
  const expiredListing = isListing && ['pending', 'active'].includes(o.status) && isPastLocal(o.autoDelistAt);
  if (o.status !== 'cancelled' && !expiredListing) return fail('该订单不是已下架状态');
  const data = { status: 'active', cancelledAt: 0 };
  if (isListing) data.autoDelistAt = listingDelistAt((await getSettings()).listingTtlDays);
  await db.collection('orders').doc(orderId).update({ data });
  return ok();
}

// 删除订单（仅发布人；连同评论一起删除）
async function deleteOrder(openid, orderId) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (o.publisherId !== openid) return fail('只有发布人可以删除');
  await db.collection('orders').doc(orderId).remove();
  const comments = (await db.collection('comments').where({ orderId }).get()).data;
  for (const c of comments) {
    await db.collection('comments').doc(c._id).remove();
  }
  return ok();
}

// ---------- claim 流程 ----------

async function claimOrder(openid, orderId) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (flowOfOrder(o) !== 'claim') return fail('该功能不支持认领');
  if (o.publisherId === openid) return fail('不能认领自己的订单哦');
  if (!['pending', 'active'].includes(o.status) || (o.autoDelistAt && isPastLocal(o.autoDelistAt))) return fail('订单已结束或已下架');
  if (o.helperId) return fail('订单已被别人接了 🥲');
  if (RIDER_FUNCS.includes(o.functionId) && !isRiderOk(await getUserDoc(openid))) return fail('你还没有接单权限，请先申请成为接单员', 'NO_RIDER');
  const res = await db.collection('orders').where({ _id: orderId, status: o.status, helperId: '' }).update({
    data: { helperId: openid, claimState: 'claimed', claimedAt: now(), helperConfirmed: false, publisherConfirmed: false, handoverCode: genCode(), codeTries: 0, staleCount: 0, staleAt: 0, pickedAt: 0, pickPhoto: '', deliverPhoto: '', deliveredAt: 0 },
  });
  if (!res.stats.updated) return fail('手慢了，订单已被别人认领 🥲');
  await incCounter(openid, 'claimCount');
  await notify(o.publisherId, 'claimed', openid, 'order', orderId, o.title || '');
  return ok();
}

async function confirmOrder(openid, orderId) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (flowOfOrder(o) !== 'claim') return fail('该功能不支持确认完成');
  if (o.status === 'done' || o.status === 'cancelled') return fail('订单已结束');
  if (!o.helperId) return fail('接单后才能确认完成');
  const isPublisher = o.publisherId === openid;
  const isHelper = o.helperId === openid;
  if (!isPublisher && !isHelper) return fail('没有操作权限');

  if (RIDER_FUNCS.includes(o.functionId)) {
    if (!isPublisher) return fail('请输入发布人的收件码，或选择无接触送达并上传照片');
    await completeOrder(o, 'publisher');
    return ok();
  }
  const patch = isPublisher ? { publisherConfirmed: true } : { helperConfirmed: true };
  await db.collection('orders').doc(orderId).update({ data: patch });
  const fresh = await getOrder(orderId);
  if (fresh.publisherConfirmed && fresh.helperConfirmed && fresh.status === 'active') {
    await db.collection('orders').doc(orderId).update({ data: { status: 'done', claimState: 'done', doneAt: now() } });
    await incCounter(fresh.publisherId, 'doneCount');
    await incCounter(fresh.helperId, 'doneCount');
    if (RIDER_FUNCS.includes(fresh.functionId)) await changeRiderScore(fresh.helperId, 2);
  }
  return ok();
}

// ---------- join 流程（多人） ----------

async function joinOrder(openid, orderId) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (!o.targetN && ['hangout', 'meal'].includes(o.functionId)) o.targetN = Math.max(0, Math.floor(Number((o.payload || {}).people || 0)) - 1);
  if (flowOfOrder(o) !== 'join') return fail('该功能不支持加入');
  if (o.publisherId === openid) return fail('这是你自己发布的哦');
  if (!['pending', 'active', 'full'].includes(o.status) || (o.autoDelistAt && isPastLocal(o.autoDelistAt))) return fail('已经结束啦');
  if ((o.participants || []).includes(openid)) return fail('你已经加入啦');
  if (o.deadline && isPastLocal(o.deadline)) return fail('活动已经开始，不能再加入啦');
  if (o.targetN && (o.participants || []).length >= o.targetN) {
    // 满员:排队候补,有人退出自动递补
    const wl = o.waitlist || [];
    if (!wl.includes(openid)) await db.collection('orders').doc(orderId).update({ data: { waitlist: _.push(openid) } });
    return ok({ waitlisted: true, pos: (wl.includes(openid) ? wl.indexOf(openid) : wl.length) + 1 });
  }
  const participants = (o.participants || []).concat([openid]);
  const patch = o.targetN && participants.length >= o.targetN
    ? { participants, status: 'full', targetN: o.targetN, flow: 'join' }
    : { participants, targetN: o.targetN || 0, flow: 'join' };
  await db.collection('orders').doc(orderId).update({ data: patch });
  await incCounter(openid, 'claimCount');
  await notify(o.publisherId, 'joined', openid, 'order', orderId, o.title || '');
  return ok({ joined: participants.length, target: o.targetN });
}

async function leaveOrder(openid, orderId, p) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (flowOfOrder(o) !== 'join') return fail('该功能不支持退出');
  if ((o.waitlist || []).includes(openid) && !(o.participants || []).includes(openid)) {
    await db.collection('orders').doc(orderId).update({ data: { waitlist: _.pull(openid) } });
    return ok({ leftWaitlist: true });
  }
  if (!['pending', 'active', 'full'].includes(o.status)) return fail('已结束，不能退出');
  if (!(o.participants || []).includes(openid)) return fail('你还没有加入');
  const start = o.deadline ? new Date(String(o.deadline).replace(' ', 'T') + ':00+09:00').getTime() : 0;
  if (start && now() >= start) return fail('活动已经开始，不能退出啦');
  const late = start && start - now() < 2 * 3600e3;
  if (late && !(p && p.confirmLate)) return fail('距离开始不到 2 小时，退出会记一次「临时退出」，确定要退出吗？', 'LATE_LEAVE');
  await removeParticipant(o, openid);
  if (late) await incCounter(openid, 'lateLeaveCount').catch(() => {});
  await notify(o.publisherId, 'left', openid, 'order', orderId, o.title || '');
  return ok({ late: !!late });
}
// 移除一个成员并按顺序递补候补
async function removeParticipant(o, uid) {
  const participants = (o.participants || []).filter((id) => id !== uid);
  const waitlist = (o.waitlist || []).filter((id) => id !== uid);
  let promoted = '';
  if (waitlist.length && (!o.targetN || participants.length < o.targetN)) {
    promoted = waitlist.shift();
    participants.push(promoted);
  }
  const status = o.targetN && participants.length >= o.targetN ? 'full' : o.status === 'full' ? 'active' : o.status;
  await db.collection('orders').doc(o._id).update({ data: { participants, waitlist, status } });
  if (promoted) await notify(promoted, 'promoted', o.publisherId, 'order', o._id, o.title || '');
  return promoted;
}
// 发起人移出成员
async function removeMember(openid, p) {
  const o = await getOrder(p && p.orderId);
  if (!o) return fail('订单不存在或已删除');
  if (o.publisherId !== openid) return fail('只有发起人可以移出成员');
  const target = await resolveByUid(p.uid);
  if (!target || !(o.participants || []).includes(target._id)) return fail('该成员不在局里');
  await removeParticipant(o, target._id);
  await notify(target._id, 'removed', openid, 'order', o._id, String(p.reason || '').slice(0, 40) || (o.title || ''));
  return ok({});
}

// 发布人确认成行/成团（满员后）
async function confirmDoneJoin(openid, orderId) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (flowOfOrder(o) !== 'join') return fail('该功能不支持成行确认');
  if (o.publisherId !== openid) return fail('只有发布人可以确认');
  if (o.status !== 'full') return fail('满员后才能确认成行');
  await db.collection('orders').doc(orderId).update({ data: { status: 'done', doneAt: now() } });
  await incCounter(o.publisherId, 'doneCount');
  for (const uid of o.participants) {
    await incCounter(uid, 'doneCount');
  }
  return ok();
}

// ---------- listing 流程（货架式） ----------

async function wantOrder(openid, orderId) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (flowOfOrder(o) !== 'listing') return fail('该功能不支持「我想要」');
  if (o.publisherId === openid) return fail('这是你自己发布的哦');
  if (!['pending', 'active'].includes(o.status) || (o.autoDelistAt && isPastLocal(o.autoDelistAt))) return fail('已经售出/下架啦');
  const prev = o.wanters || [];
  if (prev.includes(openid)) return ok({ wantCount: prev.length, already: true }); // 已想要:前端照常打开私聊
  const wanters = prev.concat([openid]);
  await db.collection('orders').doc(orderId).update({
    data: { wanters, wantCount: wanters.length },
  });
  await notify(o.publisherId, 'want', openid, 'order', o._id, o.title || '');
  return ok({ wantCount: wanters.length });
}

// 卖家标记已售出/已租出/已招满
async function markSold(openid, orderId, buyerUid) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (flowOfOrder(o) !== 'listing') return fail('该功能不支持标记售出');
  if (o.publisherId !== openid) return fail('只有发布人可以标记');
  if (!['pending', 'active'].includes(o.status)) return fail('已经标记过或已结束');
  // 买家:只能从「想要」的人里选(可不选,线下成交的非平台用户)
  let buyerId = '';
  if (buyerUid) {
    const b = await resolveByUid(buyerUid);
    if (!b || !(o.wanters || []).includes(b._id)) return fail('买家需要是点过「我想要」的人');
    buyerId = b._id;
  }
  await db.collection('orders').doc(orderId).update({ data: { status: 'sold', soldAt: now(), buyerId, reserved: false } });
  await incCounter(o.publisherId, 'doneCount');
  await addExp(openid, 'done');
  if (buyerId) { await incCounter(buyerId, 'doneCount'); await addExp(buyerId, 'done'); await notify(buyerId, 'sold_to', openid, 'order', o._id, o.title || ''); }
  return ok();
}

// 卖家标记「已预订」/取消预订(仍在大厅展示,只是挂个标签)
async function reserveOrder(openid, orderId, on) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (flowOfOrder(o) !== 'listing') return fail('该功能不支持预订');
  if (o.publisherId !== openid) return fail('只有发布人可以标记');
  if (!['pending', 'active'].includes(o.status)) return fail('已经售出或下架');
  await db.collection('orders').doc(orderId).update({ data: { reserved: !!on, reservedAt: on ? now() : 0 } });
  return ok({ reserved: !!on });
}

// ---------- 通用：取消 ----------

async function cancelOrder(openid, orderId) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (o.status === 'done' || o.status === 'sold' || o.status === 'cancelled') return fail('订单已结束');
  if (o.publisherId === openid) {
    await db.collection('orders').doc(orderId).update({
      data: { status: 'cancelled', cancelledAt: now() },
    });
    return ok();
  }
  // claim：认领人放弃 → 退回待接单
  if (flowOfOrder(o) === 'claim' && o.helperId === openid && o.status === 'active') {
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'pending',
        helperId: '',
        helperConfirmed: false,
        claimedAt: 0,
      },
    });
    return ok();
  }
  // join：参与者退出（pending 时）
  if (flowOfOrder(o) === 'join' && o.participants.includes(openid) && o.status === 'pending') {
    const participants = o.participants.filter((id) => id !== openid);
    await db.collection('orders').doc(orderId).update({ data: { participants } });
    return ok();
  }
  return fail('没有操作权限');
}

// ---------- 互评 ----------

async function reviewOrder(openid, orderId, p) {
  const { score, content, tags, toUid } = p || {};
  let toId = (p || {}).toId;
  if (!toId && toUid) toId = ((await resolveByUid(toUid)) || {})._id || '';
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (o.status !== 'done' && !(o.status === 'sold' && o.buyerId)) return fail('完成后才能评价');
  const members = [o.publisherId, o.helperId, o.buyerId].concat(o.participants || []).filter(Boolean);
  if (!members.includes(openid)) return fail('没有评价权限');
  if (!members.includes(toId) || toId === openid) return fail('评价对象不合法');
  const scoreNum = Math.round(Number(score));
  if (isNaN(scoreNum) || scoreNum < 1 || scoreNum > 5) return fail('请打 1~5 星');
  if ((content || '').length > 100) return fail('评价 100 字以内');

  const dup = await db.collection('reviews').where({ orderId, fromId: openid }).count();
  if (dup.total > 0) return fail('已经评价过啦');

  await db.collection('reviews').add({
    data: {
      orderId,
      functionId: o.functionId,
      fromId: openid,
      toId,
      score: scoreNum,
      content: (content || '').trim(),
      tags: tags || [],
      createdAt: now(),
    },
  });

  const u = await ensureUser(toId);
  const newCount = u.ratingCount + 1;
  const newRating = Math.round(((u.rating * u.ratingCount + scoreNum) / newCount) * 10) / 10;
  await db.collection('users').doc(toId).update({
    data: { rating: newRating, ratingCount: newCount },
  });
  return ok({ rating: newRating, ratingCount: newCount });
}

// ---------- 查询 ----------

async function getOrders(openid, q) {
  const { mode, functionId, schoolId, country, includeClosed, role, status, skip, limit } = q || {};
  const where = {};
  // 多分类合并查询（帮取帮送 = pickup,delivery）：逗号分隔
  const functionFilter = (id) => (id && id.includes(',') ? _.in(id.split(',').map((s) => s.trim()).filter(Boolean)) : id);
  if (mode === 'hall') {
    // 展示中（active + 历史 pending）；includeClosed 时追加已下架供参考
    where.status = _.in(['pending', 'active'].concat(includeClosed ? ['cancelled'] : [], q.includeDone ? ['done', 'sold', 'full'] : []));
    if (functionId) where.functionId = functionFilter(functionId);
    Object.assign(where, scopeWhere(schoolId, country), await visibleWhere(openid));
    const skipN = Math.max(0, Number(skip) || 0);
    const limitN = Math.min(30, Number(limit) || 15);
    const [res, cnt] = await Promise.all([
      db.collection('orders').where(where).orderBy('pinned', 'desc').orderBy('createdAt', 'desc').skip(skipN).limit(limitN).get(),
      db.collection('orders').where(where).count(),
    ]);
    return ok({ list: res.data, total: cnt.total, skip: skipN });
  }
  // history：我发布的 / 我参与的（认领 + 加入 + 想要都算参与）
  const base = {};
  if (functionId) base.functionId = functionFilter(functionId);
  if (status === 'active') base.status = _.in(['pending', 'active']); // 展示中
  else if (status === 'cancelled') base.status = 'cancelled'; // 已下架
  else if (status === 'done') base.status = _.in(['done', 'sold', 'full']); // 历史已结束
  else if (status) base.status = status;
  const skipN = Math.max(0, Number(skip) || 0);
  const limitN = Math.min(50, Number(limit) || 20);
  const fetchLimit = skipN + limitN + 1;

  let rows;
  if (role === 'joined') {
    const contacted = await db.collection('contacts').where({ userId: openid, refType: 'order' }).orderBy('createdAt', 'desc').limit(100).get();
    const ids = contacted.data.map((x) => x.refId);
    const [a, b, c, d] = await Promise.all([
      db.collection('orders').where({ ...base, helperId: openid }).orderBy('createdAt', 'desc').limit(fetchLimit).get(),
      db.collection('orders').where({ ...base, participants: openid }).orderBy('createdAt', 'desc').limit(fetchLimit).get(),
      db.collection('orders').where({ ...base, wanters: openid }).orderBy('createdAt', 'desc').limit(fetchLimit).get(),
      ids.length ? db.collection('orders').where({ ...base, _id: _.in(ids) }).orderBy('createdAt', 'desc').limit(fetchLimit).get() : Promise.resolve({ data: [] }),
    ]);
    const map = {};
    for (const x of a.data.concat(b.data, c.data, d.data)) map[x._id] = x;
    rows = Object.values(map).sort((x, y) => y.createdAt - x.createdAt);
  } else {
    const r = await db.collection('orders').where({ ...base, publisherId: openid }).orderBy('createdAt', 'desc').limit(fetchLimit).get();
    rows = r.data;
  }
  const total = rows.length;
  const list = rows.slice(skipN, skipN + limitN);
  return ok({ list, total, skip: skipN });
}

async function getOrderDetail(openid, orderId) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (o.hidden && o.publisherId !== openid) return fail('订单不存在或已删除');
  const myBlocked = await blockedOf(openid);
  const publisher = await getUserPublic(o.publisherId);
  const helper = o.helperId ? await getUserPublic(o.helperId) : null;
  const participants = [];
  for (const pid of o.participants || []) {
    const u = await getUserPublic(pid);
    participants.push({ ...u, isMe: pid === openid });
  }
  // 订单评论（复用 comments 集合，orderId 标记）
  const comments = (await db.collection('comments').where({ orderId }).orderBy('createdAt', 'asc').limit(100).get()).data
    .filter((c) => !c.hidden && !myBlocked.includes(c.userId));
  const commentUserIds = Array.from(new Set(comments.map((c) => c.userId)));
  const commentUserMap = {};
  for (const cid of commentUserIds) {
    const cu = await getUserPublic(cid).catch(() => null);
    if (cu) commentUserMap[cid] = { nickname: cu.nickname, avatarUrl: cu.avatarUrl, uid: cu.uid, level: cu.level };
  }
  const reviews = (await db.collection('reviews').where({ orderId }).get()).data;
  const iAmPublisher = o.publisherId === openid;
  const iAmHelper = o.helperId === openid;
  const iAmParticipant = (o.participants || []).includes(openid);
  const iAmWanter = (o.wanters || []).includes(openid);
  const myRole = iAmPublisher ? 'publisher' : iAmHelper ? 'helper' : iAmParticipant ? 'participant' : 'other';
  const wanterList = [];
  if (iAmPublisher) for (const wid of (o.wanters || []).slice(-30)) { const u = await getUserPublic(wid).catch(() => null); if (u) wanterList.push({ uid: u.uid, nickname: u.nickname, avatarUrl: u.avatarUrl }); }
  const buyer = o.buyerId ? await getUserPublic(o.buyerId).catch(() => null) : null;
  return ok({
    order: o,
    wanterList,
    buyer: buyer ? { uid: buyer.uid, nickname: buyer.nickname, avatarUrl: buyer.avatarUrl } : null,
    iAmBuyer: !!o.buyerId && o.buyerId === openid,
    publisher,
    helper,
    participants,
    myRole,
    iAmWanter,
    reviews: reviews.map((rv) => ({ ...rv, mine: rv.fromId === openid })),
    isMember: iAmPublisher || iAmHelper || iAmParticipant,
    comments: comments
      .filter((c) => c.channel !== 'members' || iAmPublisher || iAmHelper || iAmParticipant)
      .map((c) => ({
        ...c,
        likes: undefined,
        liked: (c.likes || []).includes(openid),
        likeCount: c.likeCount || 0,
        channel: c.channel || 'public',
        mine: c.userId === openid,
        canDelete: c.userId === openid,
        user: commentUserMap[c.userId] || { nickname: '微信用户', avatarUrl: '' },
      })),
  });
}

// ---------- 用户资料 ----------

const GENDER_OPTIONS = ['男', '女', '保密'];
const ORIENTATION_OPTIONS = ['异性恋', '同性恋', '双性恋', '其他', '保密'];
const RELATIONSHIP_OPTIONS = ['单身', '恋爱中', '已婚', '离异', '保密'];
// 属性标签（仅性取向为同性恋时可填）
const ROLE_ATTR_OPTIONS = ['top', 'btm', 'vers', 'side', 'other'];

async function getMyProfile(openid, p) {
  const u = await ensureUser(openid, p && p.schoolId);
  return ok({ user: u });
}

// ======================= 换学校:每人 7 天内最多 2 次,超出提交管理员审核 =======================
const SCHOOL_CHANGE_LIMIT = 2;
const SCHOOL_CHANGE_DAYS = 7;
async function changeSchool(openid, p) {
  const to = String((p && p.schoolId) || '');
  if (!to) return fail('请选择学校');
  const u = await ensureUser(openid, to);
  if (u.schoolId === to) return ok({ status: 'changed', schoolId: to });
  const since = now() - SCHOOL_CHANGE_DAYS * 864e5;
  const recent = (u.schoolChanges || []).filter((ts) => ts > since);
  if (recent.length < SCHOOL_CHANGE_LIMIT) {
    await db.collection('users').doc(openid).update({ data: { schoolId: to, schoolChanges: recent.concat([now()]) } });
    await db.collection('school_change_requests').where({ userId: openid, status: 'pending' }).update({ data: { status: 'cancelled', handledAt: now() } }).catch(() => {});
    return ok({ status: 'changed', schoolId: to, left: SCHOOL_CHANGE_LIMIT - recent.length - 1 });
  }
  // 超出次数:提交审核(同一用户只保留一条待审核,重复提交时更新目标学校)
  const reason = String((p && p.reason) || '').trim().slice(0, 200);
  const old = (await db.collection('school_change_requests').where({ userId: openid, status: 'pending' }).limit(1).get()).data[0];
  if (old) await db.collection('school_change_requests').doc(old._id).update({ data: { toSchoolId: to, reason, createdAt: now() } });
  else await db.collection('school_change_requests').add({ data: { userId: openid, fromSchoolId: u.schoolId || '', toSchoolId: to, reason, status: 'pending', createdAt: now() } });
  return ok({ status: 'pending', schoolId: u.schoolId });
}

async function updateProfile(openid, p) {
  const { nickname, avatarUrl, schoolId, major, age, gender, hometown, orientation, roleAttr, relationship, signature } = p || {};
  const data = {};
  if (nickname !== undefined) {
    if (!nickname || !nickname.trim() || nickname.trim().length > 20) return fail('昵称 1~20 字');
    data.nickname = nickname.trim();
  }
  if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
  // 学校不在这里改(换校走 changeSchool 限次/审核)
  if (major !== undefined) {
    if ((major || '').trim().length > 200) return fail('专业 200 字以内');
    data.major = (major || '').trim();
  }
  if (age !== undefined) {
    if (age === '' || age == null) {
      data.age = 0;
    } else {
      const n = Number(age);
      if (!Number.isInteger(n) || n < 14 || n > 100) return fail('年龄需为 14~100 的整数');
      data.age = n;
    }
  }
  if (gender !== undefined) {
    if (gender && !GENDER_OPTIONS.includes(gender)) return fail('性别选项不合法');
    data.gender = gender || '';
  }
  if (hometown !== undefined) {
    if ((hometown || '').trim().length > 200) return fail('故乡 200 字以内');
    data.hometown = (hometown || '').trim();
  }
  if (relationship !== undefined) {
    if (relationship && !RELATIONSHIP_OPTIONS.includes(relationship)) return fail('婚恋情况选项不合法');
    data.relationship = relationship || '';
  }
  if (signature !== undefined) {
    if ((signature || '').trim().length > 60) return fail('签名 60 字以内');
    data.signature = (signature || '').trim();
  }
  const currentUser = await ensureUser(openid, schoolId);
  // 性取向/属性标签已下线:保存资料时顺手清掉旧数据
  if (currentUser.orientation || currentUser.roleAttr) Object.assign(data, { orientation: '', roleAttr: '' });
  if (!Object.keys(data).length) return fail('没有可更新的内容');
  await db.collection('users').doc(openid).update({ data });
  const u = (await db.collection('users').doc(openid).get()).data;
  return ok({ user: u });
}

// ---------- 帖子 ----------

async function createPost(openid, p) {
  const { functionId, title, content, images, schoolId, rewardAmount, rewardText } = p || {};
  if (!POST_FUNCTIONS.includes(functionId)) return fail('功能类型不支持');
  if (!['hangout', 'secondhand'].includes(functionId) && (!title || !title.trim() || title.trim().length > 200)) return fail('标题必填（200 字以内）');
  if (!content || !content.trim()) return fail('内容必填');
  if (content.trim().length > 1000) return fail('内容 1000 字以内');
  if (images && images.length > 3) return fail('最多 3 张图片');
  // 悬赏答谢（选填）：金额 + 软答谢文字
  const amount = Number(rewardAmount);
  if (rewardAmount !== '' && rewardAmount != null && (isNaN(amount) || amount < 0)) return fail('答谢金额不合法');
  if ((rewardText || '').trim().length > 200) return fail('答谢 200 字以内');
  if (functionId === 'game' && gameBad(title || '', content || '')) return fail(GAME_BAD_MSG);
  // 积分悬赏(仅互助问答):发帖时先扣除冻结
  let bounty = 0;
  if (functionId === 'qa') {
    bounty = Math.floor(Number(p.bountyExp) || 0);
    if (!QA_BOUNTY_OPTIONS.includes(bounty)) return fail('悬赏积分不合法');
    if (bounty) {
      const me = await getUserDoc(openid);
      if (!me || (me.exp || 0) < bounty) return fail('积分不足，当前 ' + ((me && me.exp) || 0) + ' 积分');
      await db.collection('users').doc(openid).update({ data: { exp: _.inc(-bounty) } });
    }
  }
  const res = await db.collection('posts').add({
    data: {
      functionId,
      schoolId: schoolId || '',
      country: countryOf(schoolId),
      publisherId: openid,
      title: title.trim(),
      content: content.trim(),
      images: images || [],
      rewardAmount: functionId === 'qa' ? 0 : amount || 0, // 互助问答不再支持现金悬赏
      rewardText: (rewardText || '').trim(),
      ...(functionId === 'qa' ? { bountyExp: bounty, bountyState: bounty ? 'open' : 'none', bountyDeadline: now() + QA_BOUNTY_DAYS * 864e5, acceptedCommentId: '' } : {}),
      commentCount: 0,
      closed: false,
      closeAt: now() + postTtlMs(functionId),
      createdAt: now(),
    },
  });
  await incCounter(openid, 'publishCount');
  return ok({ postId: res._id });
}

async function getPosts(q, viewer) {
  const { functionId, schoolId, country, skip, limit } = q || {};
  const where = {};
  // 支持多分类合并查询（如「互助问答」= qa + 历史 help 帖）：逗号分隔
  if (functionId && functionId.includes(',')) {
    where.functionId = _.in(functionId.split(',').map((s) => s.trim()).filter(Boolean));
  } else if (functionId) {
    where.functionId = functionId;
  }
  Object.assign(where, scopeWhere(schoolId, country), await visibleWhere(viewer));
  if (!(q && q.includeClosed)) where.closed = _.neq(true); // 已结束的帖子不在大厅展示
  const skipN = Math.max(0, Number(skip) || 0);
  const limitN = Math.min(30, Number(limit) || 15);
  const [res, cnt] = await Promise.all([
    db.collection('posts').where(where).orderBy('pinned', 'desc').orderBy('createdAt', 'desc').skip(skipN).limit(limitN).get(),
    db.collection('posts').where(where).count(),
  ]);
  return ok({ list: res.data, total: cnt.total, skip: skipN });
}

async function getPostDetail(openid, postId) {
  const post = await db.collection('posts').doc(postId).get().then((r) => r.data).catch(() => null);
  if (!post) return fail('帖子不存在或已删除');
  if (post.hidden && post.publisherId !== openid) return fail('帖子不存在或已删除');
  await refundBountyIfDue(post);
  if (!post.closed && postCloseAt(post) < now()) { await closePostDoc(post, 'expired'); }
  const myBlocked = await blockedOf(openid);
  const isAnon = ANON_FUNCTIONS.includes(post.functionId);
  const publisher = isAnon ? null : await getUserPublic(post.publisherId);
  const comments = (await db.collection('comments').where({ postId }).orderBy('createdAt', 'asc').limit(100).get()).data
    .filter((c) => !c.hidden && !myBlocked.includes(c.userId));
  const userIds = Array.from(new Set(comments.map((c) => c.userId)));
  const userMap = {};
  for (const uid of userIds) {
    const u = await getUserPublic(uid).catch(() => null);
    if (u) userMap[uid] = { nickname: u.nickname, avatarUrl: u.avatarUrl, rating: u.rating, ratingCount: u.ratingCount, uid: u.uid, level: u.level };
  }
  return ok({
    post,
    publisher,
    canDelete: post.publisherId === openid,
    canAccept: post.publisherId === openid && !post.closed && ['qa', 'help'].includes(post.functionId) && !post.acceptedCommentId && post.bountyState !== 'refunded',
    canClose: post.publisherId === openid && !post.closed,
    canSolve: post.publisherId === openid && !post.closed && post.functionId === 'lostfound',
    canReopen: post.publisherId === openid && !!post.closed && post.closeReason === 'manual',
    comments: comments.map((c) => ({
      ...c,
      likes: undefined,
      liked: (c.likes || []).includes(openid),
      likeCount: c.likeCount || 0,
      canDelete: c.userId === openid,
      user: isAnon
        ? { nickname: '匿名同学', avatarUrl: '' }
        : userMap[c.userId] || { nickname: '微信用户', avatarUrl: '' },
    })),
  });
}

async function addComment(openid, p) {
  const { postId, content, replyToId } = p || {};
  if (!content || !content.trim()) return fail('评论不能为空');
  if (content.trim().length > 200) return fail('评论 200 字以内');
  const post = await db.collection('posts').doc(postId).get().then((r) => r.data).catch(() => null);
  if (!post) return fail('帖子不存在或已删除');
  if (post.closed || postCloseAt(post) < now()) return fail('这个帖子已经结束啦，不能再评论');
  if (post.functionId === 'game' && gameBad(content)) return fail(GAME_BAD_MSG);
  // 回复某条评论：服务端推导被回复人昵称（匿名帖统一「匿名同学」），不信任客户端传的名字
  let replyToName = '';
  let replyToUser = '';
  if (replyToId) {
    const target = await db.collection('comments').doc(replyToId).get().then((r) => r.data).catch(() => null);
    if (!target || target.postId !== postId) return fail('回复的评论不存在');
    if (ANON_FUNCTIONS.includes(post.functionId)) {
      replyToName = '匿名同学';
    } else {
      const tu = await getUserPublic(target.userId).catch(() => null);
      replyToName = tu ? tu.nickname : '微信用户';
    }
    replyToUser = target.userId;
  }
  await db.collection('comments').add({
    data: {
      postId,
      schoolId: post.schoolId || '', // 学校管理员按学校管理评论
      userId: openid,
      content: content.trim(),
      replyToId: replyToId || '',
      replyToName,
      createdAt: now(),
    },
  });
  await db.collection('posts').doc(postId).update({ data: { commentCount: _.inc(1) } });
  // 通知帖主（本人评论不通知）
  if (post.publisherId !== openid) {
    await pushSubscribe(post.publisherId, 'comment', 'pages/post/detail?id=' + postId, {
      thing1: { value: content.trim().slice(0, 20) },
      thing2: { value: '你的帖子有新评论啦' },
    });
  }
  // 回复评论：同时通知被回复的人（去重）
  if (replyToUser && replyToUser !== openid && replyToUser !== post.publisherId) {
    await pushSubscribe(replyToUser, 'comment', 'pages/post/detail?id=' + postId, {
      thing1: { value: content.trim().slice(0, 20) },
      thing2: { value: replyToName + ' 回复了你' },
    });
  }
  return ok();
}

async function deletePost(openid, postId) {
  const post = await db.collection('posts').doc(postId).get().then((r) => r.data).catch(() => null);
  if (!post) return fail('帖子不存在或已删除');
  if (post.publisherId !== openid) return fail('只能删除自己的帖子');
  const comments = (await db.collection('comments').where({ postId }).get()).data;
  // 未采纳的悬赏:没人回答 → 退回;已有人回答 → 不退(防止拿到答案后删帖逃避悬赏)
  if (post.bountyState === 'open' && post.bountyExp > 0 && !comments.some((c) => c.userId !== openid)) {
    await db.collection('users').doc(openid).update({ data: { exp: _.inc(post.bountyExp) } });
  }
  await db.collection('posts').doc(postId).remove();
  for (const c of comments) {
    await db.collection('comments').doc(c._id).remove();
  }
  return ok();
}

// 订单评论（订单详情页）
async function addOrderComment(openid, p) {
  const { orderId, content, replyToId } = p || {};
  if (!content || !content.trim()) return fail('评论不能为空');
  if (content.trim().length > 200) return fail('评论 200 字以内');
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  const channel = p.channel === 'members' ? 'members' : 'public';
  if (channel === 'members' && ![o.publisherId, o.helperId, ...(o.participants || [])].includes(openid)) return fail('加入后才能参与成员讨论');
  // 回复某条评论：服务端推导被回复人昵称
  let replyToName = '';
  let replyToUser = '';
  if (replyToId) {
    const target = await db.collection('comments').doc(replyToId).get().then((r) => r.data).catch(() => null);
    if (!target || target.orderId !== orderId) return fail('回复的评论不存在');
    const tu = await getUserPublic(target.userId).catch(() => null);
    replyToName = tu ? tu.nickname : '微信用户';
    replyToUser = target.userId;
  }
  await db.collection('orders').doc(orderId).update({ data: { commentCount: _.inc(1) } });
  if (o.publisherId !== openid) await recordContact(openid, 'order', orderId);
  await db.collection('comments').add({
    data: {
      orderId,
      channel,
      schoolId: o.schoolId || '',
      userId: openid,
      content: content.trim(),
      replyToId: replyToId || '',
      replyToName,
      createdAt: now(),
    },
  });
  // 通知发布人（本人评论不通知）
  if (o.publisherId !== openid) {
    await pushSubscribe(o.publisherId, 'comment', 'pages/order/detail?id=' + orderId, {
      thing1: { value: content.trim().slice(0, 20) },
      thing2: { value: '你的任务有新评论啦' },
    });
  }
  // 回复评论：同时通知被回复的人（去重）
  if (replyToUser && replyToUser !== openid && replyToUser !== o.publisherId) {
    await pushSubscribe(replyToUser, 'comment', 'pages/order/detail?id=' + orderId, {
      thing1: { value: content.trim().slice(0, 20) },
      thing2: { value: replyToName + ' 回复了你' },
    });
  }
  return ok();
}

async function deleteComment(openid, commentId) {
  const c = await db.collection('comments').doc(commentId).get().then((r) => r.data).catch(() => null);
  if (!c) return fail('评论不存在或已删除');
  if (c.userId !== openid) return fail('只能删除自己的评论');
  await db.collection('comments').doc(commentId).remove();
  // 帖子/订单评论回写计数
  if (c.postId) {
    await db.collection('posts').doc(c.postId).update({ data: { commentCount: _.inc(-1) } });
  }
  if (c.orderId) {
    await db.collection('orders').doc(c.orderId).update({ data: { commentCount: _.inc(-1) } }).catch(() => {});
  }
  return ok();
}

// ---------- 私聊 ----------
// 会话：members=[openidA, openidB]；unread0/unread1 按成员位置存未读
// 消息：messages { convId, fromId, content, createdAt }
// 不暴露 openid：对外用 uid（用户短 ID）寻址

async function resolveByUid(uid) {
  if (!uid) return null;
  const res = await db.collection('users').where({ uid }).limit(1).get();
  return res.data[0] || null;
}

async function findConv(a, b) {
  const res = await db.collection('conversations').where({ members: _.all([a, b]) }).limit(1).get();
  return res.data[0] || null;
}

// 发起/进入与某用户的会话（通过对方 uid）
// 「我联系过的」:记录用户主动联系(私聊/评论)过的订单或帖子;同一条只记一次
async function recordContact(openid, refType, refId) {
  try {
    await db.collection('contacts').add({ data: { _id: openid + ':' + refId, userId: openid, refType, refId, createdAt: now() } });
  } catch (e) {
    // 已记录过
  }
}

async function startConversation(openid, p) {
  const { targetUid, greet, refType, refId } = p || {};
  if (!targetUid) return fail('缺少目标用户');
  const target = await resolveByUid(targetUid);
  if (!target) return fail('用户不存在');
  if (target._id === openid) return fail('不能和自己聊天哦');
  if ((await blockedOf(openid)).includes(target._id) || (await blockedOf(target._id)).includes(openid)) return fail('你们之间有拉黑关系，无法私聊');
  if ((refType === 'order' || refType === 'post') && typeof refId === 'string' && refId) {
    await recordContact(openid, refType, refId);
  }
  let conv = await findConv(openid, target._id);
  if (conv && conv['hidden' + conv.members.indexOf(openid)]) {
    await db.collection('conversations').doc(conv._id).update({ data: { ['hidden' + conv.members.indexOf(openid)]: false } });
  }
  if (!conv) {
    const doc = {
      members: [openid, target._id],
      lastMsg: (greet || '').trim().slice(0, 50),
      lastMsgAt: now(),
      unread0: 0,
      unread1: 0,
      createdAt: now(),
    };
    const res = await db.collection('conversations').add({ data: doc });
    conv = { _id: res._id, ...doc };
    if (doc.lastMsg) {
      await db.collection('messages').add({
        data: { convId: conv._id, fromId: openid, content: doc.lastMsg, createdAt: now() },
      });
      // 给对方 +1 未读
      const myIdx = conv.members.indexOf(openid);
      await db.collection('conversations').doc(conv._id).update({
        data: { ['unread' + (1 - myIdx)]: _.inc(1) },
      });
    }
  }
  return ok({ convId: conv._id });
}

async function sendMessage(openid, p) {
  const { convId, content } = p || {};
  if (!content || !content.trim()) return fail('消息不能为空');
  if (content.trim().length > 500) return fail('消息 500 字以内');
  const conv = await db.collection('conversations').doc(convId).get().then((r) => r.data).catch(() => null);
  if (!conv) return fail('会话不存在');
  const myIdx = conv.members.indexOf(openid);
  if (myIdx < 0) return fail('没有权限');
  const peer = conv.members[1 - myIdx];
  if ((await blockedOf(openid)).includes(peer) || (await blockedOf(peer)).includes(openid)) return fail('你们之间有拉黑关系，无法私聊');
  const msg = { convId, fromId: openid, content: content.trim(), createdAt: now() };
  await db.collection('messages').add({ data: msg });
  await db.collection('conversations').doc(convId).update({
    data: {
      lastMsg: content.trim().slice(0, 50),
      lastMsgAt: msg.createdAt,
      ['unread' + (1 - myIdx)]: _.inc(1),
      hidden0: false,
      hidden1: false,
    },
  });
  // 通知对方收到私聊
  await pushSubscribe(conv.members[1 - myIdx], 'chat', 'pages/chat/room?convId=' + convId, {
    thing1: { value: content.trim().slice(0, 20) },
    thing2: { value: '收到一条新私聊' },
  });
  return ok({ message: msg });
}

async function getConversations(openid) {
  const res = await db.collection('conversations')
    .where({ members: openid })
    .orderBy('lastMsgAt', 'desc')
    .limit(50)
    .get();
  const list = [];
  for (const c of res.data) {
    const myIdx = c.members.indexOf(openid);
    if (c['hidden' + myIdx]) continue; // 我删除了这个会话(对方再发消息时会重新出现)
    const otherId = c.members[1 - myIdx];
    const other = await getUserPublic(otherId).catch(() => null);
    list.push({
      convId: c._id,
      other: other || { nickname: '微信用户', avatarUrl: '', uid: '' },
      lastMsg: c.lastMsg,
      lastMsgAt: c.lastMsgAt,
      unread: myIdx === 0 ? c.unread0 : c.unread1,
    });
  }
  return ok({ list });
}

async function getMessages(openid, p) {
  const { convId, skip, limit } = p || {};
  const conv = await db.collection('conversations').doc(convId).get().then((r) => r.data).catch(() => null);
  if (!conv || !conv.members.includes(openid)) return fail('会话不存在或无权访问');
  const skipN = Math.max(0, Number(skip) || 0);
  const limitN = Math.min(50, Number(limit) || 30);
  const [res, cnt] = await Promise.all([
    db.collection('messages').where({ convId }).orderBy('createdAt', 'desc').skip(skipN).limit(limitN).get(),
    db.collection('messages').where({ convId }).count(),
  ]);
  // 倒序取回，转为正序返回（标记哪些是我发的）
  const list = res.data.reverse().map((m) => ({ ...m, mine: m.fromId === openid }));
  const myIdx = conv.members.indexOf(openid);
  const other = await getUserPublic(conv.members[1 - myIdx]).catch(() => null);
  return ok({
    list,
    total: cnt.total,
    skip: skipN,
    other: other ? { avatarUrl: other.avatarUrl, nickname: other.nickname, uid: other.uid } : { avatarUrl: '', nickname: '', uid: '' },
  });
}

async function markRead(openid, p) {
  const { convId } = p || {};
  const conv = await db.collection('conversations').doc(convId).get().then((r) => r.data).catch(() => null);
  if (!conv || !conv.members.includes(openid)) return fail('会话不存在或无权访问');
  const myIdx = conv.members.indexOf(openid);
  await db.collection('conversations').doc(convId).update({
    data: { ['unread' + myIdx]: 0 },
  });
  return ok();
}

// ---------- 集合保障 ----------

// 业务用到的全部集合；不存在则自动创建（免去手动建集合步骤）
const ALL_COLLECTIONS = ['orders', 'users', 'reviews', 'posts', 'comments', 'conversations', 'messages', 'feedback', 'app_accounts', 'app_config', 'contacts', 'translations', 'translate_usage', 'school_requests', 'reports', 'custom_schools', 'admins', 'admin_logs', 'friendships', 'friend_requests', 'moments', 'notifications', 'deals', 'deal_uses', 'merchant_suggestions', 'school_change_requests'];
const ensuredCols = new Set();

async function ensureCollections() {
  for (const name of ALL_COLLECTIONS) {
    if (ensuredCols.has(name)) continue;
    try {
      await db.createCollection(name);
    } catch (e) {
      // 集合已存在时 createCollection 会报错，忽略即可
    }
    ensuredCols.add(name);
  }
}

// 诊断：检查各集合是否可访问 + 各集合文档数（云端测试用，count 接口不收流量费）
async function dbCheck() {
  const result = {};
  for (const name of ALL_COLLECTIONS) {
    try {
      const c = await db.collection(name).count();
      result[name] = { status: 'ok', count: c.total };
    } catch (e) {
      result[name] = { status: 'error: ' + (e.errMsg || e.message || String(e)) };
    }
  }
  return ok({ version: CLOUD_VERSION, collections: result });
}

// ---------- 意见反馈 ----------

// 推送新反馈到开发者微信（Server酱）；失败不影响反馈写入
function pushFeedbackNotice(fb) {
  if (!FEEDBACK_PUSH_KEY) return;
  const body = JSON.stringify({
    title: '🍑 krstuast 收到新反馈',
    desp: [
      '内容：' + String(fb.content || '').slice(0, 200),
      '时间：' + new Date(fb.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Seoul', hour12: false }),
    ].join('\n'),
  });
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'sctapi.ftqq.com',
        path: '/' + FEEDBACK_PUSH_KEY + '.send',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 5000,
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          console.log('[feedback-push] status', res.statusCode);
          resolve();
        });
      }
    );
    req.on('error', (e) => {
      console.error('[feedback-push]', e.message);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

async function submitFeedback(openid, p) {
  const { content, images } = p || {};
  if (!content || !content.trim()) return fail('反馈内容不能为空');
  if (content.trim().length > 500) return fail('反馈 500 字以内');
  if (images && images.length > 3) return fail('最多 3 张图片');
  const doc = {
    userId: openid,
    content: content.trim(),
    images: images || [],
    createdAt: now(),
  };
  await db.collection('feedback').add({ data: doc });
  // 推送给开发者微信（推送失败不影响反馈写入）
  await pushFeedbackNotice(doc);
  return ok();
}

// ---------- 订阅消息推送 ----------

// 向用户推送订阅消息（未配置模板 ID 或用户未授权时静默跳过）
async function pushSubscribe(toOpenid, key, page, data) {
  const templateId = SUBSCRIBE_TEMPLATES[key];
  if (!templateId || !toOpenid) return;
  if (isAppUser(toOpenid)) return; // App 账号没有微信 openid,订阅消息不适用
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: toOpenid,
      templateId,
      page,
      miniprogramState: 'developer', // 上线前改为 'formal'
      data,
    });
  } catch (e) {
    // 43101 = 用户未订阅或授权次数用尽，静默忽略即可
    console.log('[subscribe]', key, e.errCode || e.errMsg || e.message);
  }
}

// ---------- 探索页聚合 ----------

// 探索页一次拉取：最新帖子 + 精选任务 + 热门板块计数
async function getExploreData(q, viewer) {
  const { schoolId, country } = q || {};
  const schoolWhere = { ...scopeWhere(schoolId, country), ...(await visibleWhere(viewer)) };
  const orderWhere = { ...schoolWhere, status: _.in(q && q.includeDone ? ['pending', 'active', 'done', 'sold', 'full'] : ['pending', 'active']) };
  const [posts, orders] = await Promise.all([
    db.collection('posts').where({ ...schoolWhere, closed: _.neq(true) }).orderBy('createdAt', 'desc').limit(15).get(),
    db.collection('orders').where(orderWhere).orderBy('createdAt', 'desc').limit(q && q.includeDone ? 20 : 10).get(),
  ]);
  // 热门任务板块计数（展示中）
  const hotIds = ['housing', 'parttime', 'carpool', 'groupbuy', 'secondhand', 'meal', 'homecook'];
  const counts = {};
  await Promise.all(
    hotIds.map(async (id) => {
      const c = await db.collection('orders').where({ ...scopeWhere('', country), functionId: id, status: _.in(['pending', 'active']) }).count();
      counts[id] = c.total;
    })
  );
  return ok({ posts: posts.data, orders: orders.data, counts });
}

// 本校热门:最近 N 天(默认 7)的帖子与展示中任务,按评论数 → 发布时间排序
async function getHotFeed(q, viewer) {
  const { schoolId, country, days } = q || {};
  const since = now() - Math.min(30, Math.max(1, Number(days) || 7)) * 24 * 3600 * 1000;
  const where = { createdAt: _.gte(since), ...scopeWhere(schoolId, country), ...(await visibleWhere(viewer)) };
  const [posts, orders] = await Promise.all([
    db.collection('posts').where({ ...where, closed: _.neq(true) }).orderBy('commentCount', 'desc').orderBy('createdAt', 'desc').limit(15).get(),
    db.collection('orders').where({ ...where, status: _.in(['pending', 'active']) }).orderBy('commentCount', 'desc').orderBy('createdAt', 'desc').limit(15).get(),
  ]);
  return ok({ posts: posts.data, orders: orders.data });
}

// ---------- 个人主页 ----------

async function getUserHome(q) {
  const { uid } = q || {};
  const target = await resolveByUid(uid);
  if (!target) return fail('用户不存在');
  const user = await getUserPublic(target._id);
  const [orders, posts] = await Promise.all([
    db.collection('orders').where({ publisherId: target._id, status: _.in(['pending', 'active']), hidden: _.neq(true) })
      .orderBy('createdAt', 'desc').limit(20).get(),
    db.collection('posts').where({ publisherId: target._id, hidden: _.neq(true) })
      .orderBy('createdAt', 'desc').limit(20).get(),
  ]);
  return ok({ user, orders: orders.data, posts: posts.data });
}

// ---------- App 端账号体系（uni-app 打包的安卓/iOS App 使用） ----------
//
// 小程序端身份 = 微信 OPENID（不变）；App 端没有 OPENID，改为「账号 + 密码」登录：
//   appRegister / appLogin → 返回签名令牌 token；之后 App 每次调用在 event._appToken 带上
//   入口处校验令牌 → 得到 userId（形如 app_xxxxxxxx），后续业务逻辑与小程序完全共用。
// 安全：令牌只在没有 OPENID 时才会被采信（小程序端请求无法冒充 App 用户，反之亦然）。
const APP_TOKEN_TTL = 180 * 24 * 3600 * 1000; // 180 天
const isAppUser = (id) => typeof id === 'string' && id.indexOf('app_') === 0;
let _tokenSecret = '';

async function getTokenSecret() {
  if (_tokenSecret) return _tokenSecret;
  if (process.env.APP_TOKEN_SECRET) return (_tokenSecret = process.env.APP_TOKEN_SECRET);
  const col = db.collection('app_config');
  try {
    const r = await col.doc('token_secret').get();
    if (r.data && r.data.value) return (_tokenSecret = r.data.value);
  } catch (e) {}
  const value = crypto.randomBytes(32).toString('hex');
  try {
    await col.add({ data: { _id: 'token_secret', value, createdAt: now() } });
  } catch (e) {
    // 并发首建：读回已存在的那一份
    const r = await col.doc('token_secret').get();
    return (_tokenSecret = r.data.value);
  }
  return (_tokenSecret = value);
}

const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');

async function signAppToken(userId) {
  const secret = await getTokenSecret();
  const exp = now() + APP_TOKEN_TTL;
  const body = userId + '.' + exp;
  return body + '.' + hmac(secret, body);
}

async function verifyAppToken(token) {
  if (typeof token !== 'string') return '';
  const parts = token.split('.');
  if (parts.length !== 3) return '';
  const [userId, exp, sig] = parts;
  if (!userId || !(Number(exp) > now())) return '';
  const secret = await getTokenSecret();
  const expect = hmac(secret, userId + '.' + exp);
  if (expect.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return '';
  // 已注销账号的令牌失效
  try {
    const u = await db.collection('users').doc(userId).get();
    if (u.data && u.data.deleted) return '';
  } catch (e) {
    return '';
  }
  return userId;
}

const hashPassword = (password, salt) => crypto.scryptSync(String(password), salt, 32).toString('hex');
const normUsername = (u) => String(u || '').trim().toLowerCase();

async function appRegister(event) {
  const username = normUsername(event.username);
  const password = String(event.password || '');
  if (!/^[a-z0-9_]{4,20}$/.test(username)) return fail('账号为 4~20 位字母、数字或下划线');
  if (password.length < 6 || password.length > 32) return fail('密码长度 6~32 位');
  const accounts = db.collection('app_accounts');
  try {
    await accounts.doc(username).get();
    return fail('该账号已被注册');
  } catch (e) {
    // 不存在 → 可注册
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const userId = 'app_' + crypto.randomBytes(8).toString('hex');
  try {
    await accounts.add({ data: { _id: username, userId, salt, pwd: hashPassword(password, salt), createdAt: now() } });
  } catch (e) {
    return fail('该账号已被注册');
  }
  await ensureUser(userId, event.schoolId);
  await db.collection('users').doc(userId).update({ data: { nickname: username, appAccount: username } });
  return ok({ token: await signAppToken(userId), userId });
}

async function appLogin(event) {
  const username = normUsername(event.username);
  const password = String(event.password || '');
  let acc = null;
  try {
    acc = (await db.collection('app_accounts').doc(username).get()).data;
  } catch (e) {
    acc = null;
  }
  if (!acc || acc.deleted || hashPassword(password, acc.salt) !== acc.pwd) return fail('账号或密码错误');
  return ok({ token: await signAppToken(acc.userId), userId: acc.userId });
}

// 小程序端（自建服务器部署时）：wx.login 的 code → openid → 签发令牌；用户 ID 仍为 openid，与云开发时期数据一致
// 需要环境变量 WX_APPID / WX_SECRET（微信公众平台 → 开发管理 → 开发设置）
function jscode2session(code) {
  const { WX_APPID, WX_SECRET } = process.env;
  if (!WX_APPID || !WX_SECRET) return Promise.reject(new Error('未配置 WX_APPID/WX_SECRET'));
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function wxLogin(event) {
  if (!event.code) return fail('缺少登录凭证');
  const r = await jscode2session(event.code);
  if (!r.openid) return fail('微信登录失败');
  const u = await ensureUser(r.openid, event.schoolId);
  if (u.deleted) return fail('账号已注销');
  return ok({ token: await signAppToken(r.openid), userId: r.openid });
}

// 注销账号（App Store 审核要求 App 内可删除账号）：删除登录凭据 + 清空个人资料，历史内容匿名保留
async function appDeleteAccount(userId) {
  if (!isAppUser(userId)) return fail('仅 App 账号可注销');
  await db.collection('friendships').where({ members: userId }).remove().catch(() => {});
  await db.collection('friend_requests').where({ fromId: userId }).remove().catch(() => {});
  await db.collection('friend_requests').where({ toId: userId }).remove().catch(() => {});
  const res = await db.collection('app_accounts').where({ userId }).get();
  await Promise.all(res.data.map((a) => db.collection('app_accounts').doc(a._id).remove()));
  await db.collection('users').doc(userId).update({
    data: {
      deleted: true, nickname: '已注销用户', avatarUrl: '', major: '', age: 0, gender: '', hometown: '',
      orientation: '', roleAttr: '', relationship: '', signature: '', appAccount: '',
    },
  });
  return ok({});
}

// ---------- AI 翻译(帖子 / 评论 / 私聊,按需点击)----------
// 走 OpenAI 兼容接口:默认 DeepSeek 官方;也可指向 new-apis 等中转。密钥只放服务器 .env,不进代码
const TRANSLATE = {
  base: (process.env.TRANSLATE_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
  key: process.env.TRANSLATE_API_KEY || '',
  model: process.env.TRANSLATE_MODEL || 'deepseek-chat',
  dailyLimit: Number(process.env.TRANSLATE_DAILY_LIMIT || 200), // 每人每天(缓存命中不计)
};
const LANG_NAMES = { zh: 'Simplified Chinese', en: 'English', ko: 'Korean', vi: 'Vietnamese' };
const dayKey = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

async function translateText(openid, p) {
  const text = String((p && p.text) || '').trim();
  const target = p && p.target;
  if (!text) return fail('没有可翻译的内容');
  if (!LANG_NAMES[target]) return fail('不支持的语言');
  if (text.length > 2000) return fail('内容太长，暂不支持翻译');
  if (!TRANSLATE.key) return fail('翻译服务暂未开启');
  // 1) 缓存:同一段文字翻成同一语言只调用一次模型(所有用户共享)
  const id = crypto.createHash('sha1').update(target + '\n' + text).digest('hex');
  try {
    const hit = await db.collection('translations').doc(id).get();
    if (hit.data && hit.data.result) return ok({ result: hit.data.result, cached: true });
  } catch (e) {}
  // 2) 每人每天限额,防刷
  const usageId = openid + '_' + dayKey();
  let used = 0;
  try {
    used = (await db.collection('translate_usage').doc(usageId).get()).data.count || 0;
  } catch (e) {}
  if (used >= (await getSettings()).translateDailyLimit) return fail('今天的翻译次数用完了，明天再来吧');
  // 3) 调用模型
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  let result = '';
  try {
    const r = await fetch(TRANSLATE.base + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TRANSLATE.key },
      body: JSON.stringify({
        model: TRANSLATE.model,
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          {
            role: 'system',
            content:
              `You are a translation engine inside a campus mutual-aid app used by students. Translate the user's message into ${LANG_NAMES[target]}. ` +
              'Keep the meaning, tone, slang, emojis, line breaks, names, numbers, prices and URLs. Do not explain, do not add quotes, output only the translation. ' +
              `If the text is already entirely in ${LANG_NAMES[target]}, output it unchanged.`,
          },
          { role: 'user', content: text },
        ],
      }),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[translate] http', r.status, JSON.stringify(j).slice(0, 300));
      return fail('翻译服务繁忙，请稍后再试');
    }
    result = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
  } catch (e) {
    console.error('[translate]', e.message);
    return fail('翻译服务繁忙，请稍后再试');
  } finally {
    clearTimeout(timer);
  }
  if (!result) return fail('翻译服务繁忙，请稍后再试');
  await db.collection('translations').doc(id).set({ data: { target, result, len: text.length, createdAt: now(), ttlAt: new Date() } }).catch(() => {});
  await db.collection('translate_usage').doc(usageId).set({ data: { count: used + 1, createdAt: now(), ttlAt: new Date() } }).catch(() => {});
  return ok({ result, cached: false });
}

// ---------- App 版本检查(「检查更新」)----------
// 发新版时只改服务器 .env:APP_LATEST_VERSION / APP_LATEST_CODE / APP_DOWNLOAD_URL / APP_UPDATE_NOTE / APP_MIN_CODE
async function getAppVersion() {
  const cfg = (await getConfig('version', null)) || {};
  if (Number(cfg.code) > 0) {
    return ok({ version: cfg.version || '', code: Number(cfg.code), minCode: Number(cfg.minCode) || 0, url: cfg.url || '', iosUrl: cfg.iosUrl || '', note: cfg.note || '' });
  }
  const env = process.env;
  return ok({
    version: env.APP_LATEST_VERSION || '',
    code: Number(env.APP_LATEST_CODE || 0),
    minCode: Number(env.APP_MIN_CODE || 0), // 低于此版本强制更新
    url: env.APP_DOWNLOAD_URL || '',
    iosUrl: env.APP_IOS_URL || '',
    note: (env.APP_UPDATE_NOTE || '').replace(/\\n/g, '\n'),
  });
}

// ---------- 申请添加学校(选校页「找不到我的学校」)----------
async function requestSchool(openid, p) {
  const name = String((p && p.name) || '').trim();
  const country = COUNTRIES.includes(p && p.country) ? p.country : '';
  if (name.length < 2 || name.length > 60) return fail('请填写完整的学校名称');
  await db.collection('school_requests').add({ data: { name, country, userId: openid || '', createdAt: now() } });
  return ok({});
}

// ---------- 举报 · 拉黑 · 公告(App 端)----------
const REPORT_TYPES = ['post', 'order', 'comment', 'user', 'message', 'moment'];
const REPORT_REASONS = ['spam', 'scam', 'abuse', 'sexual', 'illegal', 'privacy', 'other'];
async function reportContent(openid, p) {
  const { targetType, targetId, reason, detail, convId } = p || {};
  if (!REPORT_TYPES.includes(targetType) || !targetId) return fail('举报对象不存在');
  if (!REPORT_REASONS.includes(reason)) return fail('请选择举报原因');
  if ((detail || '').length > 300) return fail('补充说明 300 字以内');
  // 找到被举报内容 + 留存快照(之后被删也能处理)
  let owner = '';
  let snapshot = '';
  let refId = targetId;
  let schoolId = '';
  const col = { post: 'posts', order: 'orders', comment: 'comments', message: 'messages', moment: 'moments' }[targetType];
  if (col) {
    const d = await db.collection(col).doc(targetId).get().then((r) => r.data).catch(() => null);
    if (!d) return fail('举报对象不存在');
    owner = d.publisherId || d.userId || d.fromId || '';
    schoolId = d.schoolId || '';
    const pl = d.payload || {};
    snapshot = [d.title, d.content, d.desc, pl.productName, pl.dish, pl.food].filter(Boolean).join(' | ').slice(0, 500);
  } else {
    const u = await resolveByUid(targetId);
    if (!u) return fail('用户不存在');
    owner = u._id;
    refId = u._id;
    schoolId = u.schoolId || '';
    snapshot = '昵称: ' + (u.nickname || '');
    // 举报私聊对象:附上 TA 在这段会话里最近的消息
    if (convId) {
      const conv = await db.collection('conversations').doc(convId).get().then((r) => r.data).catch(() => null);
      if (conv && conv.members.includes(openid) && conv.members.includes(owner)) {
        const msgs = (await db.collection('messages').where({ convId, fromId: owner }).orderBy('createdAt', 'desc').limit(10).get()).data;
        snapshot += '\n最近消息:\n' + msgs.reverse().map((m) => '· ' + m.content).join('\n');
      }
    }
  }
  if (owner === openid) return fail('不能举报自己哦');
  const dup = await db.collection('reports').where({ reporterId: openid, targetType, targetId: refId, status: 'pending' }).limit(1).get();
  if (dup.data[0]) return ok({ duplicated: true });
  await db.collection('reports').add({
    data: { targetType, targetId: refId, ownerId: owner, schoolId: schoolId || ((await getUserDoc(owner)) || {}).schoolId || '', snapshot, reason, detail: (detail || '').trim(), convId: convId || '', reporterId: openid, status: 'pending', createdAt: now() },
  });
  return ok({});
}

async function blockUser(openid, p) {
  const target = await resolveByUid(p && p.uid);
  if (!target) return fail('用户不存在');
  if (target._id === openid) return fail('不能拉黑自己哦');
  const list = await blockedOf(openid);
  if (!list.includes(target._id)) {
    await ensureUser(openid);
    await db.collection('users').doc(openid).update({ data: { blocked: list.concat(target._id).slice(-500) } });
  }
  await clearFriendData(openid, target._id); // 拉黑同时解除好友、清掉双方待处理的申请
  return ok({});
}
async function unblockUser(openid, p) {
  const target = await resolveByUid(p && p.uid);
  if (!target) return fail('用户不存在');
  const list = (await blockedOf(openid)).filter((id) => id !== target._id);
  await db.collection('users').doc(openid).update({ data: { blocked: list } });
  return ok({});
}
async function getBlockedUsers(openid) {
  const ids = await blockedOf(openid);
  const list = [];
  for (const id of ids.slice(-200).reverse()) {
    const u = await getUserDoc(id);
    if (u) list.push({ uid: u.uid, nickname: u.nickname, avatarUrl: u.avatarUrl });
  }
  return ok({ list });
}

// ---------- 好友 ----------
// friend_requests: { fromId, toId, msg, status: pending|accepted|rejected, createdAt, handledAt }
// friendships:     _id = 两个用户 ID 排序后用 '__' 拼接(天然去重), members: [a, b], createdAt
// users.friendPolicy: 'verify'(默认,需验证) | 'all'(任何人可直接加) | 'none'(不允许加我)
const FRIEND_DAILY_LIMIT = 20; // 每人每天最多发起的好友申请
const FRIEND_REJECT_COOLDOWN = 3 * 24 * 3600 * 1000; // 被拒绝后 3 天内不能重复申请
const FRIEND_MAX = 1000;
const friendKey = (a, b) => [a, b].sort().join('__');
async function isFriend(a, b) {
  try {
    const d = (await db.collection('friendships').doc(friendKey(a, b)).get()).data;
    return !!d;
  } catch (e) {
    return false;
  }
}
async function makeFriends(a, b) {
  const id = friendKey(a, b);
  if (await isFriend(a, b)) return;
  try {
    await db.collection('friendships').add({ data: { _id: id, members: [a, b].sort(), createdAt: now() } });
  } catch (e) {} // 并发重复创建时忽略
}
async function clearFriendData(a, b) {
  try { await db.collection('friendships').doc(friendKey(a, b)).remove(); } catch (e) {}
  await db.collection('friend_requests').where({ fromId: a, toId: b, status: 'pending' }).remove().catch(() => {});
  await db.collection('friend_requests').where({ fromId: b, toId: a, status: 'pending' }).remove().catch(() => {});
}
async function friendStatusOf(me, otherId) {
  if (me === otherId) return { status: 'self' };
  if (await isFriend(me, otherId)) return { status: 'friend' };
  const inc = await db.collection('friend_requests').where({ fromId: otherId, toId: me, status: 'pending' }).limit(1).get();
  if (inc.data[0]) return { status: 'pending_in', requestId: inc.data[0]._id };
  const out = await db.collection('friend_requests').where({ fromId: me, toId: otherId, status: 'pending' }).limit(1).get();
  if (out.data[0]) return { status: 'pending_out' };
  return { status: 'none' };
}
async function friendStatus(openid, p) {
  const target = await resolveByUid(p && p.uid);
  if (!target) return fail('用户不存在');
  const s = await friendStatusOf(openid, target._id);
  const blocked = (await blockedOf(openid)).includes(target._id);
  return ok({ ...s, blocked, policy: target.friendPolicy || 'verify' });
}
async function sendFriendRequest(openid, p) {
  const target = await resolveByUid(p && p.uid);
  if (!target || target.deleted) return fail('用户不存在');
  if (target._id === openid) return fail('不能加自己为好友哦');
  if ((await blockedOf(openid)).includes(target._id)) return fail('你已拉黑对方，请先在黑名单里解除');
  if ((await blockedOf(target._id)).includes(openid)) return fail('对方暂时无法添加好友');
  const st = await friendStatusOf(openid, target._id);
  if (st.status === 'friend') return ok({ status: 'friend' });
  if (st.status === 'pending_out') return ok({ status: 'pending_out' });
  if (st.status === 'pending_in') return respondFriendRequest(openid, { requestId: st.requestId, accept: true }); // 对方也申请过我:直接成为好友
  const policy = target.friendPolicy || 'verify';
  if (policy === 'none') return fail('对方设置了不允许添加好友');
  const mine = await db.collection('friendships').where({ members: openid }).count();
  if (mine.total >= FRIEND_MAX) return fail('好友数量已达上限');
  // 防骚扰:每天上限 + 被拒冷却
  const since = Date.now() - 24 * 3600 * 1000;
  const today = await db.collection('friend_requests').where({ fromId: openid, createdAt: _.gte(since) }).count();
  if (today.total >= FRIEND_DAILY_LIMIT) return fail('今天发出的好友申请太多了，明天再试吧');
  const rej = await db.collection('friend_requests')
    .where({ fromId: openid, toId: target._id, status: 'rejected', handledAt: _.gte(Date.now() - FRIEND_REJECT_COOLDOWN) }).limit(1).get();
  if (rej.data[0]) return fail('对方暂时无法添加好友，过几天再试吧');
  if (policy === 'all') {
    await makeFriends(openid, target._id);
    return ok({ status: 'friend' });
  }
  const msg = String((p && p.msg) || '').trim().slice(0, 50);
  await db.collection('friend_requests').add({ data: { fromId: openid, toId: target._id, msg, status: 'pending', createdAt: now(), handledAt: 0 } });
  return ok({ status: 'pending_out' });
}
async function respondFriendRequest(openid, p) {
  const { requestId, accept } = p || {};
  if (!requestId) return fail('申请不存在');
  const r = await db.collection('friend_requests').doc(requestId).get().then((x) => x.data).catch(() => null);
  if (!r || r.toId !== openid) return fail('申请不存在');
  if (r.status !== 'pending') return ok({ status: r.status });
  if (accept) {
    if ((await blockedOf(openid)).includes(r.fromId) || (await blockedOf(r.fromId)).includes(openid)) return fail('你们之间有拉黑关系');
    await makeFriends(openid, r.fromId);
  }
  await db.collection('friend_requests').doc(requestId).update({ data: { status: accept ? 'accepted' : 'rejected', handledAt: now() } });
  return ok({ status: accept ? 'friend' : 'rejected' });
}
async function getFriendRequests(openid) {
  const res = await db.collection('friend_requests').where({ toId: openid, status: 'pending' }).orderBy('createdAt', 'desc').limit(100).get();
  const bl = await blockedOf(openid);
  const list = [];
  for (const r of res.data) {
    if (bl.includes(r.fromId)) continue;
    const u = await getUserDoc(r.fromId);
    if (!u || u.deleted) continue;
    list.push({ requestId: r._id, msg: r.msg || '', createdAt: r.createdAt, user: { uid: u.uid, nickname: u.nickname, avatarUrl: u.avatarUrl, schoolId: u.schoolId || '' } });
  }
  return ok({ list, total: list.length });
}
async function getFriends(openid) {
  const res = await db.collection('friendships').where({ members: openid }).orderBy('createdAt', 'desc').limit(1000).get();
  const list = [];
  for (const f of res.data) {
    const other = f.members.find((m) => m !== openid);
    const u = other && (await getUserDoc(other));
    if (!u || u.deleted) continue;
    list.push({ uid: u.uid, nickname: u.nickname, avatarUrl: u.avatarUrl, signature: u.signature || '', schoolId: u.schoolId || '', since: f.createdAt });
  }
  return ok({ list });
}
async function removeFriend(openid, p) {
  const target = await resolveByUid(p && p.uid);
  if (!target) return fail('用户不存在');
  await clearFriendData(openid, target._id);
  return ok({});
}
async function setFriendPolicy(openid, p) {
  const policy = p && p.policy;
  if (!['verify', 'all', 'none'].includes(policy)) return fail('参数错误');
  await ensureUser(openid);
  await db.collection('users').doc(openid).update({ data: { friendPolicy: policy } });
  return ok({ policy });
}
async function getFriendPolicy(openid) {
  const u = await getUserDoc(openid);
  return ok({ policy: (u && u.friendPolicy) || 'verify' });
}

// ---------- 动态(朋友圈)----------
// moments: { publisherId, schoolId, country, content, images[≤9], visibility: public|friends|private,
//            likes: [userId], likeCount, commentCount, hidden, createdAt }
// 动态评论复用 comments 集合(带 momentId),举报/后台删除评论的逻辑可直接复用
const MOMENT_VIS = ['public', 'friends', 'private'];
async function friendIdsOf(userId) {
  const res = await db.collection('friendships').where({ members: userId }).limit(1000).get();
  return res.data.map((f) => f.members.find((m) => m !== userId)).filter(Boolean);
}
async function canSeeMoment(viewer, m) {
  if (!m) return false;
  if (m.publisherId === viewer) return true;
  if (m.hidden || m.visibility === 'private') return false;
  if (viewer && ((await blockedOf(viewer)).includes(m.publisherId) || (await blockedOf(m.publisherId)).includes(viewer))) return false;
  if (m.visibility === 'friends') return !!viewer && (await isFriend(viewer, m.publisherId));
  return true;
}
async function createMoment(openid, p) {
  const { content, images, visibility, schoolId } = p || {};
  const text = String(content || '').trim();
  const imgs = Array.isArray(images) ? images.filter((x) => typeof x === 'string' && x).slice(0, 9) : [];
  if (!text && !imgs.length) return fail('写点什么或者加张图片吧');
  if (text.length > 1000) return fail('内容 1000 字以内');
  if (Array.isArray(images) && images.length > 9) return fail('最多 9 张图片');
  const vis = MOMENT_VIS.includes(visibility) ? visibility : 'public';
  const res = await db.collection('moments').add({
    data: { publisherId: openid, schoolId: schoolId || '', country: countryOf(schoolId), content: text, images: imgs, visibility: vis, likes: [], likeCount: 0, commentCount: 0, createdAt: now() },
  });
  return ok({ momentId: res._id });
}
async function usersMap(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = {};
  for (let i = 0; i < uniq.length; i += 100) {
    const r = await db.collection('users').where({ _id: _.in(uniq.slice(i, i + 100)) }).limit(100).get();
    r.data.forEach((u) => (map[u._id] = { uid: u.uid, nickname: u.deleted ? '已注销用户' : u.nickname, avatarUrl: u.deleted ? '' : u.avatarUrl, level: levelOf(u.exp) }));
  }
  return map;
}
async function decorateMoments(viewer, rows) {
  if (!rows.length) return [];
  const ids = rows.map((m) => m._id);
  const cms = (await db.collection('comments').where({ momentId: _.in(ids) }).orderBy('createdAt', 'asc').limit(1000).get()).data;
  const bl = viewer ? await blockedOf(viewer) : [];
  const users = await usersMap(rows.flatMap((m) => [m.publisherId, ...(m.likes || []).slice(-30)]).concat(cms.map((c) => c.userId)));
  return rows.map((m) => {
    const mc = cms.filter((c) => c.momentId === m._id && !c.hidden && !bl.includes(c.userId));
    return {
      _id: m._id,
      content: m.content,
      images: m.images || [],
      visibility: m.visibility,
      createdAt: m.createdAt,
      mine: m.publisherId === viewer,
      user: users[m.publisherId] || { uid: '', nickname: '', avatarUrl: '' },
      liked: !!viewer && (m.likes || []).includes(viewer),
      likeCount: m.likeCount || 0,
      likeUsers: (m.likes || []).slice(-30).filter((id) => !bl.includes(id)).map((id) => users[id]).filter(Boolean),
      commentCount: mc.length,
      comments: mc.slice(-30).map((c) => ({ _id: c._id, content: c.content, createdAt: c.createdAt, user: users[c.userId] || {}, replyToName: c.replyToName || '', mine: c.userId === viewer, canDelete: c.userId === viewer || m.publisherId === viewer })),
    };
  });
}
// scope: all(公开动态,按国家/学校) | friends(我和好友) | user(某个人的主页)
async function getMoments(viewer, q) {
  const { scope, uid, schoolId, country } = q || {};
  const skipN = Math.max(0, Number(q && q.skip) || 0);
  const limitN = Math.min(Math.max(Number(q && q.limit) || 10, 1), 20);
  const where = { hidden: _.neq(true) };
  if (scope === 'user') {
    const target = await resolveByUid(uid);
    if (!target) return fail('用户不存在');
    if (target._id !== viewer) {
      if (viewer && ((await blockedOf(viewer)).includes(target._id) || (await blockedOf(target._id)).includes(viewer))) return ok({ list: [] });
      where.visibility = viewer && (await isFriend(viewer, target._id)) ? _.in(['public', 'friends']) : 'public';
    } else delete where.hidden;
    where.publisherId = target._id;
  } else if (scope === 'friends') {
    if (!viewer) return fail('未登录', 'NO_AUTH');
    where.publisherId = _.in((await friendIdsOf(viewer)).concat(viewer));
    where.visibility = _.in(['public', 'friends']);
  } else {
    where.visibility = 'public'; // 全部动态:全站公开(不分国家/学校)
    const bl = viewer ? await blockedOf(viewer) : [];
    if (bl.length) where.publisherId = _.nin(bl);
  }
  const res = await db.collection('moments').where(where).orderBy('createdAt', 'desc').skip(skipN).limit(limitN).get();
  let rows = res.data;
  if (scope !== 'user' && viewer) {
    // 拉黑了我的人的动态也不展示
    const checks = await Promise.all(rows.map((m) => (m.publisherId === viewer ? false : blockedOf(m.publisherId).then((b) => b.includes(viewer)))));
    rows = rows.filter((m, i) => !checks[i]);
  }
  return ok({ list: await decorateMoments(viewer, rows), hasMore: res.data.length === limitN });
}
async function getMoment(openid, id) {
  return db.collection('moments').doc(id).get().then((r) => r.data).catch(() => null);
}
async function likeMoment(openid, p) {
  const m = await getMoment(openid, p && p.momentId);
  if (!(await canSeeMoment(openid, m))) return fail('动态不存在或已删除');
  const liked = (m.likes || []).includes(openid);
  await db.collection('moments').doc(m._id).update({
    data: liked ? { likes: _.pull(openid), likeCount: _.inc(-1) } : { likes: _.push(openid), likeCount: _.inc(1) },
  });
  return ok({ liked: !liked });
}
async function commentMoment(openid, p) {
  const { momentId, content, replyToId } = p || {};
  const text = String(content || '').trim();
  if (!text) return fail('评论不能为空');
  if (text.length > 200) return fail('评论 200 字以内');
  const m = await getMoment(openid, momentId);
  if (!(await canSeeMoment(openid, m))) return fail('动态不存在或已删除');
  let replyToName = '';
  let replyToUser = '';
  if (replyToId) {
    const target = await db.collection('comments').doc(replyToId).get().then((r) => r.data).catch(() => null);
    if (!target || target.momentId !== momentId) return fail('回复的评论不存在');
    const tu = await getUserDoc(target.userId);
    replyToName = (tu && tu.nickname) || '微信用户';
    replyToUser = target.userId;
  }
  const res = await db.collection('comments').add({
    data: { momentId, schoolId: m.schoolId || '', userId: openid, content: text, replyToId: replyToId || '', replyToName, replyToUser, createdAt: now() },
  });
  await db.collection('moments').doc(momentId).update({ data: { commentCount: _.inc(1) } });
  return ok({ commentId: res._id, replyToName });
}
async function deleteMoment(openid, p) {
  const m = await getMoment(openid, p && p.momentId);
  if (!m || m.publisherId !== openid) return fail('没有权限');
  await db.collection('comments').where({ momentId: m._id }).remove();
  await db.collection('moments').doc(m._id).remove();
  return ok({});
}
async function deleteMomentComment(openid, p) {
  const c = await db.collection('comments').doc(p && p.commentId).get().then((r) => r.data).catch(() => null);
  if (!c || !c.momentId) return fail('评论不存在');
  const m = await getMoment(openid, c.momentId);
  if (c.userId !== openid && !(m && m.publisherId === openid)) return fail('没有权限');
  await db.collection('comments').doc(c._id).remove();
  if (m) await db.collection('moments').doc(m._id).update({ data: { commentCount: _.inc(-1) } });
  return ok({});
}

// ---------- 找人:按用户 ID(KS 开头)或昵称搜索 ----------
const escReg = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function searchUsers(openid, p) {
  const kw = String((p && p.keyword) || '').trim().slice(0, 30);
  if (!kw) return ok({ list: [] });
  const found = [];
  if (/^KS[0-9A-F]{8}$/i.test(kw)) {
    const u = await resolveByUid(kw.toUpperCase());
    if (u) found.push(u);
  }
  if (kw.length >= 1) {
    const res = await db.collection('users').where({ nickname: new RegExp(escReg(kw), 'i'), deleted: _.neq(true) }).orderBy('createdAt', 'desc').limit(30).get();
    res.data.forEach((u) => !found.some((x) => x._id === u._id) && found.push(u));
  }
  const bl = await blockedOf(openid);
  const list = [];
  for (const u of found) {
    if (u._id === openid || u.deleted || bl.includes(u._id)) continue;
    if ((Array.isArray(u.blocked) ? u.blocked : []).includes(openid)) continue;
    const fs = await friendStatusOf(openid, u._id);
    list.push({ uid: u.uid, nickname: u.nickname, avatarUrl: u.avatarUrl, signature: u.signature || '', schoolId: u.schoolId || '', status: fs.status, requestId: fs.requestId || '', policy: u.friendPolicy || 'verify' });
    if (list.length >= 20) break;
  }
  return ok({ list });
}

// ---------- 会话批量操作:已读 / 未读 / 删除(只对自己生效) / 一键已读 ----------
async function convAction(openid, p) {
  const op = p && p.op;
  if (!['read', 'unread', 'delete'].includes(op)) return fail('参数错误');
  const ids = Array.isArray(p.convIds) ? p.convIds.filter((x) => typeof x === 'string').slice(0, 200) : [];
  if (!ids.length) return ok({ count: 0 });
  const res = await db.collection('conversations').where({ _id: _.in(ids), members: openid }).limit(200).get();
  for (const c of res.data) {
    const i = c.members.indexOf(openid);
    const data = op === 'read' ? { ['unread' + i]: 0 } : op === 'unread' ? { ['unread' + i]: Math.max(1, Number(c['unread' + i]) || 0) } : { ['hidden' + i]: true, ['unread' + i]: 0 };
    await db.collection('conversations').doc(c._id).update({ data });
  }
  return ok({ count: res.data.length });
}
async function markAllRead(openid) {
  const res = await db.collection('conversations').where({ members: openid }).limit(500).get();
  let n = 0;
  for (const c of res.data) {
    const i = c.members.indexOf(openid);
    if (Number(c['unread' + i]) > 0) {
      await db.collection('conversations').doc(c._id).update({ data: { ['unread' + i]: 0 } });
      n++;
    }
  }
  return ok({ count: n });
}

// ======================= 社交增强:通知 / 角标 / 备注 / 热评 / 浏览 / 今日上头 / 等级 / 学校圈 =======================
// ---- 用户等级:经验值 ----
const LEVELS = [0, 20, 60, 150, 300, 600, 1000, 1600, 2500, 4000]; // Lv1..Lv10 所需经验
const levelOf = (exp) => { let lv = 1; LEVELS.forEach((need, i) => { if ((exp || 0) >= need) lv = i + 1; }); return lv; };
// 每种行为的经验值与每日上限(防刷)
const EXP_RULES = {
  login: [2, 2], post: [5, 15], order: [5, 15], moment: [3, 9], comment: [2, 20], liked: [1, 20], done: [10, 50], share: [2, 10], friend: [3, 9],
};
async function addExp(userId, kind, times) {
  const rule = EXP_RULES[kind];
  if (!userId || !rule) return 0;
  const u = await getUserDoc(userId);
  if (!u) return 0;
  const d = dayKey();
  const day = u.expDay && u.expDay.d === d ? u.expDay : { d, c: {} };
  const used = Number(day.c[kind]) || 0;
  const gain = Math.min(rule[0] * (times || 1), rule[1] - used);
  if (gain <= 0) return 0;
  day.c[kind] = used + gain;
  await db.collection('users').doc(userId).update({ data: { exp: _.inc(gain), expDay: day } });
  return gain;
}
// 扣回经验(删除内容时),最低扣到 0
async function takeExp(userId, n) {
  n = Math.floor(Number(n) || 0);
  if (!userId || n <= 0) return;
  const u = await getUserDoc(userId);
  if (!u) return;
  await db.collection('users').doc(userId).update({ data: { exp: Math.max(0, (u.exp || 0) - n) } });
}
// 行为徽章:由计数推导,前端按 key 显示文案
function badgesOf(u) {
  const b = [];
  const tier = (n, key) => { const t = n >= 100 ? 100 : n >= 50 ? 50 : n >= 10 ? 10 : 0; if (t) b.push(key + t); };
  tier(u.doneCount || 0, 'done');
  tier(u.commentCount || 0, 'comment');
  tier(u.shareCount || 0, 'share');
  tier(u.likedCount || 0, 'liked');
  return b;
}

// ---- 通知 ----
// notifications: { toId, type: friend_request|friend_accept|comment|reply|mention|like, fromId, refType: post|order|moment|user, refId, text, read, createdAt }
async function notify(toId, type, fromId, refType, refId, text) {
  if (!toId || toId === fromId) return;
  if (fromId && (await blockedOf(toId)).includes(fromId)) return;
  await db.collection('notifications').add({ data: { toId, type, fromId: fromId || '', refType: refType || '', refId: refId || '', text: String(text || '').slice(0, 80), read: false, createdAt: now() } });
}
async function getNotifications(openid, q) {
  const skipN = Math.max(0, Number(q && q.skip) || 0);
  const res = await db.collection('notifications').where({ toId: openid }).orderBy('createdAt', 'desc').skip(skipN).limit(30).get();
  const users = await usersMap(res.data.map((n) => n.fromId));
  return ok({ list: res.data.map((n) => ({ _id: n._id, type: n.type, refType: n.refType, refId: n.refId, text: n.text, read: n.read, createdAt: n.createdAt, from: users[n.fromId] || null })), hasMore: res.data.length === 30 });
}
async function markNotificationsRead(openid, p) {
  const where = { toId: openid, read: false };
  if (p && Array.isArray(p.ids) && p.ids.length) where._id = _.in(p.ids.slice(0, 100));
  await db.collection('notifications').where(where).update({ data: { read: true } });
  return ok({});
}
// 角标:好友申请 / 未读通知 / 未读私聊 / 新动态
async function getBadges(openid, q) {
  const [fr, nt, convs] = await Promise.all([
    db.collection('friend_requests').where({ toId: openid, status: 'pending' }).count(),
    db.collection('notifications').where({ toId: openid, read: false }).count(),
    db.collection('conversations').where({ members: openid }).limit(200).get(),
  ]);
  let messages = 0;
  convs.data.forEach((c) => { const i = c.members.indexOf(openid); if (!c['hidden' + i]) messages += Number(c['unread' + i]) || 0; });
  let newMoments = 0;
  const since = Number(q && q.momentsSince) || 0;
  if (since) {
    const w = { createdAt: _.gt(since), publisherId: _.neq(openid), visibility: 'public', hidden: _.neq(true) };
    newMoments = (await db.collection('moments').where(w).count()).total;
    const fids = await friendIdsOf(openid);
    if (fids.length) newMoments += (await db.collection('moments').where({ createdAt: _.gt(since), publisherId: _.in(fids), visibility: 'friends', hidden: _.neq(true) }).count()).total;
  }
  addExp(openid, 'login').catch(() => {});
  return ok({ friendRequests: fr.total, notifications: nt.total, messages, newMoments });
}

// 评论类动作之后:通知被评论/被回复/被 @ 的人,并加经验
async function afterComment(openid, kind, event) {
  const content = String(event.content || '');
  let ownerId = '', refType = kind, refId = '', title = '';
  if (kind === 'post') { const d = await db.collection('posts').doc(event.postId).get().then((r) => r.data).catch(() => null); if (!d) return; ownerId = ANON_FUNCTIONS.includes(d.functionId) ? d.publisherId : d.publisherId; refId = d._id; title = d.title || d.content; }
  if (kind === 'order') { const d = await getOrder(event.orderId); if (!d) return; ownerId = d.publisherId; refId = d._id; title = d.title; }
  if (kind === 'moment') { const d = await db.collection('moments').doc(event.momentId).get().then((r) => r.data).catch(() => null); if (!d) return; ownerId = d.publisherId; refId = d._id; title = d.content; }
  const field = kind === 'post' ? 'postId' : kind === 'order' ? 'orderId' : 'momentId';
  const done = new Set([openid]);
  if (event.replyToId) {
    const c = await db.collection('comments').doc(event.replyToId).get().then((r) => r.data).catch(() => null);
    if (c && !done.has(c.userId)) { done.add(c.userId); await notify(c.userId, 'reply', openid, refType, refId, content); }
  }
  // @昵称:只在这条内容的参与者(发布人 + 评论过的人)里匹配
  const names = (content.match(/@([^\s@，,。:：]{1,20})/g) || []).map((s) => s.slice(1));
  if (names.length) {
    const cs = (await db.collection('comments').where({ [field]: refId }).limit(200).get()).data;
    const ids = [...new Set([ownerId, ...cs.map((c) => c.userId)])];
    const um = await usersMap(ids);
    for (const id of ids) if (um[id] && names.includes(um[id].nickname) && !done.has(id)) { done.add(id); await notify(id, 'mention', openid, refType, refId, content); }
  }
  if (!done.has(ownerId)) await notify(ownerId, 'comment', openid, refType, refId, content);
  await incCounter(openid, 'commentCount').catch(() => {});
  await addExp(openid, 'comment');
}

// ---- 好友备注:friendships.remarks[我的ID] = 我给对方的备注 ----
async function remarksOf(openid) {
  const res = await db.collection('friendships').where({ members: openid }).limit(1000).get();
  const map = {};
  res.data.forEach((f) => { const other = f.members.find((m) => m !== openid); const r = f.remarks && f.remarks[openid]; if (other && r) map[other] = r; });
  return map;
}
async function setFriendRemark(openid, p) {
  const target = await resolveByUid(p && p.uid);
  if (!target) return fail('用户不存在');
  if (!(await isFriend(openid, target._id))) return fail('只能给好友设置备注');
  const remark = String((p && p.remark) || '').trim().slice(0, 20);
  await db.collection('friendships').doc(friendKey(openid, target._id)).update({ data: { ['remarks.' + openid]: remark } });
  return ok({ remark });
}

// ---- 评论点赞 / 热评 / 浏览量 ----
async function likeComment(openid, p) {
  const c = await db.collection('comments').doc(p && p.commentId).get().then((r) => r.data).catch(() => null);
  if (!c || c.hidden) return fail('评论不存在');
  const liked = (c.likes || []).includes(openid);
  await db.collection('comments').doc(c._id).update({ data: liked ? { likes: _.pull(openid), likeCount: _.inc(-1) } : { likes: _.push(openid), likeCount: _.inc(1) } });
  if (!liked && c.userId !== openid) { await incCounter(c.userId, 'likedCount').catch(() => {}); await addExp(c.userId, 'liked'); }
  return ok({ liked: !liked });
}
// 给列表里的帖子/订单挂上热评(点赞最多且 ≥1 的评论)
async function attachHot(rows, field) {
  if (!Array.isArray(rows) || !rows.length) return;
  const ids = rows.map((r) => r._id);
  const cs = (await db.collection('comments').where({ [field]: _.in(ids), likeCount: _.gt(0), hidden: _.neq(true), channel: _.neq('members') }).orderBy('likeCount', 'desc').limit(300).get()).data;
  const best = {};
  cs.forEach((c) => { if (!best[c[field]]) best[c[field]] = c; });
  const um = await usersMap(Object.values(best).map((c) => c.userId));
  rows.forEach((r) => { const c = best[r._id]; if (c) r.hot = { content: c.content, likeCount: c.likeCount, nickname: (um[c.userId] || {}).nickname || '' }; });
}
async function decorateListResult(res, action) {
  if (!res || !res.success) return res;
  if (Array.isArray(res.posts)) await attachHot(res.posts, 'postId');
  if (Array.isArray(res.orders)) await attachHot(res.orders, 'orderId');
  if (Array.isArray(res.list)) await attachHot(res.list, action === 'getOrders' ? 'orderId' : 'postId');
  return res;
}

// ---- 今日上头:近 24 小时本校(不够则本国)最热的帖子 ----
async function getTopToday(q) {
  const { schoolId, country } = q || {};
  const since = now() - 24 * 3600 * 1000;
  const pick = async (scope) => {
    const rows = (await db.collection('posts').where({ createdAt: _.gte(since), hidden: _.neq(true), ...scope }).limit(200).get()).data;
    rows.forEach((p) => (p._score = (p.commentCount || 0) * 3 + (p.viewCount || 0) * 0.1));
    rows.sort((a, b) => b._score - a._score);
    return rows.filter((p) => p._score > 0).slice(0, 3);
  };
  let list = schoolId ? await pick({ schoolId }) : [];
  if (!list.length) list = await pick(scopeWhere('', country || countryOf(schoolId)));
  // 校园群(后台「校园群」配置):本校专属群优先,其次本国通用群
  // 群按「圈子」配置:每个学校(以后的小区、村庄同理)单独一个群,只给本圈子的用户看,不按国家通用,杜绝加错群
  const groups = ((await getConfig('groups', [])) || [])
    .filter((g) => g && g.enabled !== false && (g.qr || g.link) && schoolId && g.schoolId === schoolId)
    .sort((a, b) => (Number(b.sort) || 0) - (Number(a.sort) || 0))
    .slice(0, 3)
    .map((g) => ({ id: g.id, name: g.name, headline: g.headline || '', platform: g.platform || '', qr: g.qr || '', link: g.link || '', note: g.note || '', schoolName: g.schoolId ? g.schoolName || '' : '' }));
  return ok({ groups, list: list.map((p) => ({ _id: p._id, title: p.title || (p.content || '').slice(0, 30), viewCount: p.viewCount || 0, commentCount: p.commentCount || 0, functionId: p.functionId })) });
}

// ---- 学校圈氛围:成员数 / 动态数 / 今日新增 ----
async function getSchoolStats(q) {
  const schoolId = q && q.schoolId;
  if (!schoolId) return ok({ members: 0, posts: 0, today: 0 });
  const day = now() - 24 * 3600 * 1000;
  const [m, p, o, mm, t1, t2] = await Promise.all([
    db.collection('users').where({ schoolId }).count(),
    db.collection('posts').where({ schoolId }).count(),
    db.collection('orders').where({ schoolId }).count(),
    db.collection('moments').where({ schoolId }).count(),
    db.collection('posts').where({ schoolId, createdAt: _.gte(day) }).count(),
    db.collection('orders').where({ schoolId, createdAt: _.gte(day) }).count(),
  ]);
  return ok({ members: m.total, posts: p.total + o.total + mm.total, today: t1.total + t2.total });
}

async function recordShare(openid, p) {
  await incCounter(openid, 'shareCount').catch(() => {});
  await addExp(openid, 'share');
  const col = { post: 'posts', order: 'orders', moment: 'moments' }[p && p.refType];
  if (col && p.refId) await db.collection(col).doc(p.refId).update({ data: { shareCount: _.inc(1) } }).catch(() => {});
  return ok({});
}

// 动作之后的统一处理:通知、经验、热评
async function afterAction(openid, action, event, res) {
  try {
    if (!res || !res.success) return res;
    switch (action) {
      case 'addComment': await afterComment(openid, 'post', event); break;
      case 'addOrderComment': await afterComment(openid, 'order', event); break;
      case 'commentMoment': await afterComment(openid, 'moment', event); break;
      case 'cancelOrder': { const o = await getOrder(event.orderId); if (o && flowOfOrder(o) === 'join') for (const id of [...(o.participants || []), ...(o.waitlist || [])]) await notify(id, 'hangout_cancelled', openid, 'order', o._id, o.title || ''); break; }
      case 'createPost': { const g = await addExp(openid, 'post'); if (g && res.postId) await db.collection('posts').doc(res.postId).update({ data: { expGain: g } }).catch(() => {}); break; }
      case 'createOrder': { const g = res.duplicated ? 0 : await addExp(openid, 'order'); if (g && res.orderId) await db.collection('orders').doc(res.orderId).update({ data: { expGain: g } }).catch(() => {}); break; }
      case 'createMoment': { const g = await addExp(openid, 'moment'); if (g && res.momentId) await db.collection('moments').doc(res.momentId).update({ data: { expGain: g } }).catch(() => {}); break; }
      case 'confirmOrder': case 'confirmDoneJoin': await addExp(openid, 'done'); break;
      case 'likeMoment': if (res.liked) { const m = await db.collection('moments').doc(event.momentId).get().then((r) => r.data).catch(() => null); if (m && m.publisherId !== openid) { await incCounter(m.publisherId, 'likedCount').catch(() => {}); await addExp(m.publisherId, 'liked'); await notify(m.publisherId, 'like', openid, 'moment', m._id, m.content); } } break;
      case 'sendFriendRequest': { const t = await resolveByUid(event.uid); if (t) await notify(t._id, res.status === 'friend' ? 'friend_accept' : 'friend_request', openid, 'user', '', event.msg || ''); if (res.status === 'friend') { await addExp(openid, 'friend'); } break; }
      case 'respondFriendRequest': if (res.status === 'friend') { const r = await db.collection('friend_requests').doc(event.requestId).get().then((x) => x.data).catch(() => null); if (r) { await notify(r.fromId, 'friend_accept', openid, 'user', '', ''); await addExp(openid, 'friend'); await addExp(r.fromId, 'friend'); } } break;
      case 'deletePost': case 'deleteOrder': case 'deleteMoment': { const pre = event.__pre; if (pre && pre.publisherId === openid) await takeExp(openid, pre.expGain || 0); break; }
      case 'deleteComment': case 'deleteMomentComment': { const pre = event.__pre; if (pre && pre.userId === openid) { await takeExp(openid, 2); await db.collection('users').doc(openid).update({ data: { commentCount: _.inc(-1) } }).catch(() => {}); } break; }
      case 'getPosts': case 'getOrders': case 'getHotFeed': case 'getExploreData':
        (action === 'getOrders' ? res.list || [] : res.orders || []).forEach((o) => stripPrivate(o, openid));
        return await decorateListResult(res, action);
      case 'getUserHome': (res.orders || []).forEach((o) => stripPrivate(o, openid)); break;
      case 'getPostDetail': if (res.post) await db.collection('posts').doc(res.post._id).update({ data: { viewCount: _.inc(1) } }).catch(() => {}); break;
      case 'getOrderDetail': if (res.order) stripPrivate(res.order, openid); if (res.order) await db.collection('orders').doc(res.order._id).update({ data: { viewCount: _.inc(1) } }).catch(() => {}); break;
      case 'friendStatus': if (res.status === 'friend') { const t2 = await resolveByUid(event.uid); const rm = t2 ? (await remarksOf(openid))[t2._id] : ''; if (rm) res.remark = rm; } break;
      case 'getMyProfile': if (res.user) { const u = res.user; u.level = levelOf(u.exp); u.badges = badgesOf(u); u.levelExp = LEVELS[u.level - 1]; u.nextExp = LEVELS[u.level] || 0; } break;
      case 'getFriends': { const rm = await remarksOf(openid); const ids = {}; for (const f of res.list) { const u = await resolveByUid(f.uid); if (u && rm[u._id]) f.remark = rm[u._id]; } break; }
      case 'getConversations': { const rm = await remarksOf(openid); for (const c of res.list) { const u = c.other && c.other.uid ? await resolveByUid(c.other.uid) : null; if (u && rm[u._id]) c.other.remark = rm[u._id]; } break; }
    }
  } catch (e) {
    console.error('[afterAction]', action, e);
  }
  return res;
}

// ======================= 交付流程:私密信息 / 收件码 / 取件·送达照片 =======================
// claimState: '' 待接 → claimed 已接 → picked 已取件 → delivered 已送达(无接触,待确认) → done
const RIDER_START = 80;
const RIDER_MAX = 120;
const genCode = () => String(Math.floor(1000 + Math.random() * 9000));
// 隐私字段:私密信息/照片只给发布人和接单人;收件码只给发布人
function stripPrivate(o, viewer) {
  if (!o || typeof o !== 'object') return o;
  const isPub = viewer && o.publisherId === viewer;
  const isHelper = viewer && o.helperId && o.helperId === viewer;
  const isMember = viewer && (o.participants || []).includes(viewer);
  if (!isPub && !isHelper && !isMember) delete o.secret;
  if (!isPub && !isHelper) { delete o.pickPhoto; delete o.deliverPhoto; }
  if (Array.isArray(o.waitlist)) { o.waitCount = o.waitlist.length; o.myWaitPos = viewer ? o.waitlist.indexOf(viewer) + 1 : 0; delete o.waitlist; }
  if (!isPub) delete o.handoverCode;
  if (Array.isArray(o.wanters)) { o.wantCount = o.wanters.length; if (!isPub) delete o.wanters; }
  // 组队类(拼车/凑单/攒局):列表里直接显示 已加入/总人数,并告诉前端我是否已在局里
  if (o.flow === 'join' || ['carpool', 'groupbuy', 'hangout', 'meal'].includes(o.functionId)) {
    const parts = o.participants || [];
    const tN = Number(o.targetN) || (['hangout', 'meal'].includes(o.functionId) ? Math.max(0, Math.floor(Number((o.payload || {}).people || 0)) - 1) : 0);
    o.joinN = parts.length + 1;
    o.joinTotal = tN ? tN + 1 : 0;
    o.iJoined = !!viewer && (parts.includes(viewer) || o.publisherId === viewer);
  }
  delete o.codeTries;
  return o;
}
async function completeOrder(o, by) {
  await db.collection('orders').doc(o._id).update({ data: { status: 'done', claimState: 'done', doneAt: now(), completedBy: by, publisherConfirmed: true, helperConfirmed: true } });
  await incCounter(o.publisherId, 'doneCount');
  if (o.helperId) {
    await incCounter(o.helperId, 'doneCount');
    if (RIDER_FUNCS.includes(o.functionId)) await changeRiderScore(o.helperId, o.pickPhoto || o.deliverPhoto ? 3 : 2);
    await addExp(o.helperId, 'done');
    await notify(o.helperId, 'completed', o.publisherId, 'order', o._id, o.title || '');
  }
}
async function markPicked(openid, p) {
  const o = await getOrder(p && p.orderId);
  if (!o || o.helperId !== openid) return fail('只有接单人可以操作');
  if (o.claimState !== 'claimed') return fail('当前状态不能标记已取件');
  const photo = typeof p.photo === 'string' ? p.photo.slice(0, 300) : '';
  await db.collection('orders').doc(o._id).update({ data: { claimState: 'picked', pickedAt: now(), pickPhoto: photo } });
  await notify(o.publisherId, 'picked', openid, 'order', o._id, o.title || '');
  return ok({});
}
async function deliverOrder(openid, p) {
  const o = await getOrder(p && p.orderId);
  if (!o || o.helperId !== openid) return fail('只有接单人可以操作');
  if (!['claimed', 'picked'].includes(o.claimState)) return fail('当前状态不能送达');
  if (p.contactless) {
    const photo = typeof p.photo === 'string' ? p.photo.slice(0, 300) : '';
    if (!photo) return fail('无接触送达需要上传送达照片');
    await db.collection('orders').doc(o._id).update({ data: { claimState: 'delivered', deliveredAt: now(), deliverPhoto: photo } });
    await notify(o.publisherId, 'delivered', openid, 'order', o._id, o.title || '');
    return ok({ status: 'delivered' });
  }
  if ((o.codeTries || 0) >= 5) return fail('收件码输错次数过多，请让发布人在订单里确认完成');
  if (String(p.code || '').trim() !== String(o.handoverCode || '')) {
    await db.collection('orders').doc(o._id).update({ data: { codeTries: _.inc(1) } });
    return fail(`收件码不对，还可以试 ${Math.max(0, 4 - (o.codeTries || 0))} 次`);
  }
  await completeOrder(o, 'code');
  return ok({ status: 'done' });
}
function delFile(url) {
  try {
    const dir = process.env.UPLOAD_DIR;
    const i = String(url || '').indexOf('/uploads/');
    if (!dir || i < 0) return;
    const rel = url.slice(i + 9).replace(/\.\.+/g, '');
    const fs = require('fs');
    const path = require('path');
    [rel, rel.replace(/\.jpg$/, '_s.jpg')].forEach((r) => fs.unlink(path.join(dir, r), () => {}));
  } catch (e) {}
}
// 定时:收尾(超时下架 / 满员拼车完成 / 无接触送达 12 小时自动完成 / 照片 30 天删除)
async function finalizeSweep() {
  const t = now();
  let n = 0;
  // 1) 无接触送达 12 小时无异议 → 自动完成
  const dl = (await db.collection('orders').where({ claimState: 'delivered', status: _.neq('done'), deliveredAt: _.lt(t - 12 * 3600e3) }).limit(200).get()).data;
  for (const o of dl) { await completeOrder(o, 'auto'); n++; }
  // 2) 过了下架时间、没人接的 → 下架
  const ex = (await db.collection('orders').where({ status: _.in(['pending', 'active']), helperId: '' }).limit(1000).get()).data;
  for (const o of ex) {
    // 饭搭子/私厨点菜:过了当天 → 有人加入算「已完成」,没人加入算「已过期」(落库,保证每单都有终态)
    const md = ['meal', 'homecook'].includes(o.functionId) && o.payload && o.payload.date;
    if (md && t > new Date(String(md).slice(0, 10) + 'T23:59:59+09:00').getTime()) {
      const done = (o.participants || []).length > 0;
      await db.collection('orders').doc(o._id).update({ data: done ? { status: 'done', doneAt: t } : { status: 'expired', expiredAt: t } });
      n++; continue;
    }
    if (o.flow === 'join' && (o.participants || []).length) continue; // 有人加入的局交给下面按活动时间收尾
    if (o.autoDelistAt && isPastLocal(o.autoDelistAt)) { await db.collection('orders').doc(o._id).update({ data: { status: 'cancelled', cancelledAt: t, cancelReason: 'expired' } }); n++; continue; }
    // 兜底:没有下架时间的老单,发布 30 天后自动下架(有始有终)
    if (!o.autoDelistAt && !md && o.flow !== 'join' && o.createdAt < t - ORDER_FALLBACK_DAYS * 864e5) { await db.collection('orders').doc(o._id).update({ data: { status: 'cancelled', cancelledAt: t, cancelReason: 'expired' } }); n++; }
  }
  // 3) 拼车/凑单满员且已过出发时间 → 完成
  const fl = (await db.collection('orders').where({ flow: 'join', status: _.in(['pending', 'active', 'full']) }).limit(500).get()).data;
  for (const o of fl) {
    if (!o.deadline || !isPastLocal(o.deadline)) continue;
    const minP = Math.floor(Number((o.payload || {}).minPeople || 0));
    const total = (o.participants || []).length + 1;
    if (minP && total < minP) {
      await db.collection('orders').doc(o._id).update({ data: { status: 'cancelled', cancelledAt: t, cancelReason: 'not_enough' } });
      for (const id of [o.publisherId, ...(o.participants || [])]) await notify(id, 'not_enough', '', 'order', o._id, o.title || '');
    } else if ((o.participants || []).length) {
      await db.collection('orders').doc(o._id).update({ data: { status: 'done', doneAt: t } });
    } else continue;
    n++;
  }
  // 4) 交付照片:结束 30 天后删除
  const old = (await db.collection('orders').where({ status: _.in(['done', 'cancelled']), doneAt: _.lt(t - 30 * 864e5), photosCleared: _.neq(true) }).limit(200).get()).data;
  for (const o of old) {
    if (o.pickPhoto || o.deliverPhoto) { delFile(o.pickPhoto); delFile(o.deliverPhoto); }
    await db.collection('orders').doc(o._id).update({ data: { pickPhoto: '', deliverPhoto: '', photosCleared: true } });
  }
  return n;
}

// ======================= 接单员(帮取/帮送) =======================
// users.rider: { status: pending|approved|rejected|revoked, score, appliedAt, reason, contact, note }
// 规则:管理员审核通过才能接单;一单只能一个人接;接单员放弃后订单回到待接单;
//      长时间不流转(过了期望时间 6 小时,或接单 24 小时仍未完成)每次扣 10 分;分数低于 60 自动取消资格;完成一单 +2(上限 100)
const RIDER_FUNCS = ['pickup', 'delivery'];
const RIDER_MIN = 60;
const RIDER_FULL = RIDER_START; // 默认(初始)分
const isRiderOk = (u) => !!(u && u.rider && u.rider.status === 'approved' && (u.rider.score == null || u.rider.score >= RIDER_MIN));
async function getRiderStatus(openid) {
  const u = await getUserDoc(openid);
  const r = (u && u.rider) || null;
  return ok({ rider: r ? { status: r.status, score: r.score == null ? RIDER_FULL : r.score, note: r.note || '', appliedAt: r.appliedAt || 0 } : null, min: RIDER_MIN, start: RIDER_START, max: RIDER_MAX });
}
async function applyRider(openid, p) {
  const u = await ensureUser(openid);
  if (u.rider && ['pending', 'approved'].includes(u.rider.status) && isRiderOk(u)) return ok({ status: u.rider.status });
  if (u.rider && u.rider.status === 'revoked' && u.rider.revokedAt && now() - u.rider.revokedAt < 7 * 864e5) return fail('接单资格被取消后需 7 天才能重新申请');
  const reason = String((p && p.reason) || '').trim().slice(0, 200);
  const contact = String((p && p.contact) || '').trim().slice(0, 50);
  if (!contact) return fail('请填写联系方式，方便管理员核实');
  await db.collection('users').doc(openid).update({ data: { rider: { status: 'pending', score: (u.rider && u.rider.score) || RIDER_FULL, appliedAt: now(), reason, contact, note: '' } } });
  return ok({ status: 'pending' });
}
async function changeRiderScore(userId, delta, why) {
  const u = await getUserDoc(userId);
  if (!u || !u.rider) return;
  const score = Math.max(0, Math.min(RIDER_MAX, (u.rider.score == null ? RIDER_FULL : u.rider.score) + delta));
  const data = { 'rider.score': score };
  if (score < RIDER_MIN && u.rider.status === 'approved') Object.assign(data, { 'rider.status': 'revoked', 'rider.revokedAt': now(), 'rider.note': '信用分低于 ' + RIDER_MIN + '，接单资格已取消' });
  await db.collection('users').doc(userId).update({ data });
  if (delta < 0) await notify(userId, 'rider', '', 'user', '', (why || '') + `（信用分 ${score}）` + (data['rider.status'] === 'revoked' ? '，接单资格已取消' : ''));
}
async function abandonOrder(openid, orderId) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (o.helperId !== openid) return fail('只有接单人可以放弃接单');
  if (o.status === 'done') return fail('订单已完成，不能放弃');
  if (['picked', 'delivered'].includes(o.claimState)) return fail('已取件后不能直接放弃，请联系发布人交还物品，由发布人解除接单');
  const res = await db.collection('orders').where({ _id: orderId, helperId: openid }).update({
    data: { helperId: '', claimState: '', handoverCode: '', codeTries: 0, pickedAt: 0, pickPhoto: '', deliverPhoto: '', deliveredAt: 0, staleCount: 0, claimedAt: 0, helperConfirmed: false, publisherConfirmed: false, staleAt: 0, abandoned: _.push({ by: openid, at: now() }) },
  });
  if (!res.stats.updated) return fail('操作失败，请刷新后重试');
  await notify(o.publisherId, 'abandon', openid, 'order', orderId, o.title || '');
  return ok({});
}
// 发布人解除接单人(如:接单员送不了,物品已交还),订单重新开放,不扣接单员分
async function releaseHelper(openid, orderId) {
  const o = await getOrder(orderId);
  if (!o) return fail('订单不存在或已删除');
  if (o.publisherId !== openid) return fail('只有发布人可以解除接单');
  if (!o.helperId || o.status === 'done') return fail('当前没有可解除的接单');
  const helper = o.helperId;
  await db.collection('orders').doc(orderId).update({ data: { helperId: '', claimState: '', handoverCode: '', codeTries: 0, pickedAt: 0, pickPhoto: '', deliverPhoto: '', deliveredAt: 0, staleCount: 0, claimedAt: 0, abandoned: _.push({ by: helper, at: now(), releasedBy: openid }) } });
  await notify(helper, 'released', openid, 'order', orderId, o.title || '');
  return ok({});
}
// 定时任务:长时间不流转的接单扣分(服务器每 30 分钟调用一次)

// ======================= 互助问答:采纳最佳答案 / 悬赏退回 =======================
async function refundBountyIfDue(post) {
  if (!post || post.bountyState !== 'open' || !(post.bountyExp > 0) || !(post.bountyDeadline < now())) return false;
  const r = await db.collection('posts').where({ _id: post._id, bountyState: 'open' }).update({ data: { bountyState: 'refunded' } });
  if (!r || !r.stats || r.stats.updated < 1) return false; // 并发:已被别处处理
  await db.collection('users').doc(post.publisherId).update({ data: { exp: _.inc(post.bountyExp) } });
  await notify(post.publisherId, 'qa_refund', '', 'post', post._id, post.title || '');
  post.bountyState = 'refunded';
  return true;
}
async function acceptAnswer(openid, p) {
  const { postId, commentId } = p || {};
  const post = await db.collection('posts').doc(postId).get().then((r) => r.data).catch(() => null);
  if (!post) return fail('帖子不存在或已删除');
  if (post.publisherId !== openid) return fail('只有提问人可以采纳');
  if (!['qa', 'help'].includes(post.functionId)) return fail('该帖子不支持采纳');
  if (post.acceptedCommentId) return fail('已经采纳过啦');
  if (post.bountyState === 'refunded') return fail('悬赏已过期退回，不能再采纳');
  const c = await db.collection('comments').doc(commentId).get().then((r) => r.data).catch(() => null);
  if (!c || c.postId !== postId) return fail('回答不存在');
  if (c.userId === openid) return fail('不能采纳自己的回答');
  const r = await db.collection('posts').where({ _id: postId, acceptedCommentId: _.in(['', null]) }).update({ data: { acceptedCommentId: commentId, bountyState: post.bountyExp > 0 ? 'accepted' : 'none', acceptedAt: now() } });
  if (r && r.stats && r.stats.updated < 1) return fail('已经采纳过啦');
  await db.collection('comments').doc(commentId).update({ data: { accepted: true } });
  await closePostDoc({ ...post, bountyState: 'accepted' }, 'solved');
  const gain = (post.bountyExp || 0) + QA_ACCEPT_BONUS;
  await db.collection('users').doc(c.userId).update({ data: { exp: _.inc(gain) } });
  await incCounter(c.userId, 'acceptedCount').catch(() => {});
  await notify(c.userId, 'qa_accepted', openid, 'post', postId, post.title || '');
  return ok({ gain });
}
async function bountySweep() {
  const rows = (await db.collection('posts').where({ bountyState: 'open', bountyDeadline: _.lt(now()) }).limit(200).get()).data;
  let n = 0;
  for (const p of rows) if (await refundBountyIfDue(p)) n++;
  return n;
}


// ======================= 帖子生命周期:结束 / 已解决 / 重新打开 =======================
async function closePostDoc(post, reason) {
  if (!post || post.closed) return;
  const data = { closed: true, closeReason: reason, closedAt: now() };
  await db.collection('posts').doc(post._id).update({ data });
  Object.assign(post, data);
  // 结束时还挂着的悬赏:没被采纳 → 退回提问人
  if (reason !== 'solved' && post.bountyState === 'open' && post.bountyExp > 0) {
    await db.collection('posts').doc(post._id).update({ data: { bountyDeadline: 0 } });
    await refundBountyIfDue({ ...post, bountyDeadline: 0 });
  }
}
async function closePost(openid, p) {
  const { postId, reason } = p || {};
  const post = await db.collection('posts').doc(postId).get().then((r) => r.data).catch(() => null);
  if (!post) return fail('帖子不存在或已删除');
  if (post.publisherId !== openid) return fail('只有作者可以操作');
  if (post.closed) return fail('已经结束啦');
  const why = reason === 'solved' && SOLVABLE_POSTS.includes(post.functionId) ? 'solved' : 'manual';
  // 有悬赏且已有人回答时,手动结束不退悬赏(防止拿到答案不采纳);没人回答才退
  if (why === 'manual' && post.bountyState === 'open' && post.bountyExp > 0) {
    const answered = (await db.collection('comments').where({ postId, userId: _.neq(openid) }).count()).total > 0;
    if (answered) return fail('已经有人回答了，请先采纳一个最佳答案；7 天内不采纳会自动退回悬赏');
  }
  await closePostDoc(post, why);
  return ok({ closeReason: why });
}
async function reopenPost(openid, postId) {
  const post = await db.collection('posts').doc(postId).get().then((r) => r.data).catch(() => null);
  if (!post) return fail('帖子不存在或已删除');
  if (post.publisherId !== openid) return fail('只有作者可以操作');
  if (!post.closed || post.closeReason !== 'manual') return fail('只有手动结束的帖子可以重新打开');
  await db.collection('posts').doc(postId).update({ data: { closed: false, closeReason: '', closedAt: 0, closeAt: now() + postTtlMs(post.functionId) } });
  return ok();
}
async function postSweep() {
  const minTtl = Math.min(POST_TTL_DEFAULT, ...Object.values(POST_TTL_DAYS)) * 864e5;
  const rows = (await db.collection('posts').where({ closed: _.neq(true), createdAt: _.lt(now() - minTtl) }).limit(500).get()).data;
  let n = 0;
  for (const p of rows) if (postCloseAt(p) < now()) { await closePostDoc(p, 'expired'); n++; }
  return n;
}


// ======================= 专属折扣(商家合作) =======================
// 只有后台能发布;用户可浏览、出示使用(记录核销次数,给洽谈商家提供数据)、推荐商家
// 状态:active(进行中) → ended(到期或后台结束),有始有终
const dealLive = (d) => !!d && d.status === 'active' && (!d.startAt || d.startAt <= now()) && (!d.endAt || d.endAt > now());
const dealPub = (d) => ({ _id: d._id, title: d.title, merchant: d.merchant, discount: d.discount, desc: d.desc, address: d.address, phone: d.phone || '', cover: d.cover || '', images: d.images || [], startAt: d.startAt || 0, endAt: d.endAt || 0, status: dealLive(d) ? 'active' : 'ended', useCount: d.useCount || 0, viewCount: d.viewCount || 0, perDay: d.perDay == null ? 1 : d.perDay, schoolIds: d.schoolIds || [], country: d.country || '' });
async function getDeals(openid, q) {
  const { schoolId } = q || {};
  const c = (q && q.country) || countryOf(schoolId);
  const rows = (await db.collection('deals').where({ status: 'active' }).orderBy('sort', 'desc').orderBy('createdAt', 'desc').limit(100).get()).data;
  const list = rows.filter((d) => dealLive(d) && (!d.country || d.country === c) && (!(d.schoolIds || []).length || d.schoolIds.includes(schoolId)));
  return ok({ list: list.map(dealPub) });
}
async function getDealDetail(openid, dealId) {
  const d = await db.collection('deals').doc(dealId).get().then((r) => r.data).catch(() => null);
  if (!d || d.status === 'deleted') return fail('优惠不存在或已下架');
  await db.collection('deals').doc(dealId).update({ data: { viewCount: _.inc(1) } }).catch(() => {});
  const usedToday = openid ? (await db.collection('deal_uses').where({ dealId, userId: openid, day: dayKey() }).count()).total : 0;
  return ok({ deal: dealPub(d), usedToday });
}
async function useDeal(openid, dealId) {
  const d = await db.collection('deals').doc(dealId).get().then((r) => r.data).catch(() => null);
  if (!dealLive(d)) return fail('优惠已结束');
  const perDay = d.perDay == null ? 1 : Number(d.perDay);
  const day = dayKey();
  if (perDay > 0) {
    const n = (await db.collection('deal_uses').where({ dealId, userId: openid, day }).count()).total;
    if (n >= perDay) return fail('今天已经用过啦，明天再来');
  }
  const u = await getUserDoc(openid);
  const code = 'HM' + String(Math.floor(100000 + Math.random() * 900000));
  await db.collection('deal_uses').add({ data: { dealId, userId: openid, schoolId: (u && u.schoolId) || '', code, day, createdAt: now() } });
  await db.collection('deals').doc(dealId).update({ data: { useCount: _.inc(1) } });
  return ok({ code, at: now(), nickname: (u && u.nickname) || '', uid: (u && u.uid) || '' });
}
async function suggestMerchant(openid, p) {
  const name = String((p && p.name) || '').trim();
  const address = String((p && p.address) || '').trim();
  const note = String((p && p.note) || '').trim();
  if (!name || name.length > 200) return fail('请填写商家名称（200 字以内）');
  if (address.length > 60 || note.length > 200) return fail('内容太长啦');
  const n = (await db.collection('merchant_suggestions').where({ userId: openid, createdAt: _.gte(now() - 864e5) }).count()).total;
  if (n >= 5) return fail('今天推荐太多啦，明天再来');
  await db.collection('merchant_suggestions').add({ data: { userId: openid, schoolId: (p && p.schoolId) || '', name, address, note, status: 'open', createdAt: now() } });
  return ok();
}
async function dealSweep() {
  const rows = (await db.collection('deals').where({ status: 'active', endAt: _.lt(now()) }).limit(200).get()).data.filter((d) => d.endAt > 0);
  for (const d of rows) await db.collection('deals').doc(d._id).update({ data: { status: 'ended', endedAt: now() } });
  return rows.length;
}

async function riderSweep() {
  const rows = (await db.collection('orders').where({ functionId: _.in(RIDER_FUNCS), claimState: _.in(['claimed', 'picked']), status: _.neq('done') }).limit(500).get()).data;
  let n = 0;
  for (const o of rows) {
    if (!o.helperId) continue;
    let due = o.deadline ? new Date(String(o.deadline).replace(' ', 'T') + ':00+09:00').getTime() + 6 * 3600e3 : (o.claimedAt || o.createdAt) + 24 * 3600e3;
    if (o.pickedAt) due = Math.max(due, o.pickedAt + 24 * 3600e3); // 已取件:从取件时间重新计时
    const last = o.staleAt || 0;
    if (now() < due || (last && now() - last < 24 * 3600e3)) continue;
    const cnt = (o.staleCount || 0) + 1;
    await db.collection('orders').doc(o._id).update({ data: { staleAt: now(), staleCount: cnt } });
    await changeRiderScore(o.helperId, -10, `订单「${(o.title || '').slice(0, 12)}」长时间未完成，扣 10 分。不能完成请及时点「放弃接单」`);
    if (cnt >= 3) {
      // 连续 3 次超时:自动解除接单,订单重新开放
      await db.collection('orders').doc(o._id).update({ data: { helperId: '', claimState: '', handoverCode: '', codeTries: 0, pickedAt: 0, pickPhoto: '', deliverPhoto: '', deliveredAt: 0, staleCount: 0, claimedAt: 0, abandoned: _.push({ by: o.helperId, at: now(), auto: true }) } });
      await notify(o.publisherId, 'abandon', o.helperId, 'order', o._id, '接单员长时间未完成，订单已自动重新开放');
    }
    n++;
  }
  const finalized = await finalizeSweep();
  await bountySweep().catch((e) => console.warn('bountySweep', e.message));
  await postSweep().catch((e) => console.warn('postSweep', e.message));
  await dealSweep().catch((e) => console.warn('dealSweep', e.message));
  return ok({ penalized: n, finalized });
}

// 公告 / 横幅:按国家、语言、时间筛出当前生效的
// 工具箱:后台「工具箱」维护(app_config.tools);还没配置时用这份默认清单
const DEFAULT_TOOLS = [
  { id: 'papago', cat: '翻译', name: 'Papago', url: 'https://papago.naver.com', desc: '韩中英互译，韩语更地道', icon: '🦜' },
  { id: 'deepl', cat: '翻译', name: 'DeepL', url: 'https://www.deepl.com/translator', desc: '长文、论文翻译', icon: '🔤' },
  { id: 'navermap', cat: '出行', name: 'Naver 地图', url: 'https://map.naver.com', desc: '韩国公交地铁导航', icon: '🗺️' },
  { id: 'kakaomap', cat: '出行', name: 'Kakao 地图', url: 'https://map.kakao.com', desc: '找店、看路线', icon: '📍' },
  { id: 'korail', cat: '出行', name: 'Korail 火车票', url: 'https://www.letskorail.com', desc: 'KTX / 火车订票', icon: '🚄' },
  { id: 'kobus', cat: '出行', name: '高速巴士', url: 'https://www.kobus.co.kr', desc: '高速大巴订票', icon: '🚌' },
  { id: 'hikorea', cat: '办事', name: 'HiKorea', url: 'https://www.hikorea.go.kr', desc: '签证、外国人登录证预约', icon: '🛂' },
  { id: 'gov24', cat: '办事', name: '政府24', url: 'https://www.gov.kr', desc: '各类证明在线开具', icon: '🏛️' },
  { id: 'ilovepdf', cat: '学习', name: 'iLovePDF', url: 'https://www.ilovepdf.com', desc: 'PDF 合并、压缩、转换', icon: '📄' },
  { id: 'tinypng', cat: '学习', name: 'TinyPNG', url: 'https://tinypng.com', desc: '图片压缩', icon: '🖼️' },
  { id: 'ittools', cat: '开发', name: 'IT Tools', url: 'https://it-tools.tech', desc: '时间戳、Base64、哈希、UUID、JWT 等几十种', icon: '🧰', sort: 10 },
  { id: 'toollu', cat: '开发', name: '在线工具 tool.lu', url: 'https://tool.lu', desc: '中文工具合集，国内访问稳定', icon: '🛠️', sort: 9 },
  { id: 'cloudconvert', cat: '学习', name: 'CloudConvert', url: 'https://cloudconvert.com', desc: '几乎所有格式互转', icon: '🔄' },
  { id: 'jsoncn', cat: '开发', name: 'JSON 格式化', url: 'https://www.json.cn/', desc: 'JSON 格式化、校验、压缩', icon: '🧩' },
];
async function getTools(lang) {
  const all = (await getConfig('tools', null)) || DEFAULT_TOOLS;
  return all
    .filter((x) => x && x.enabled !== false && x.url)
    .filter((x) => !x.lang || x.lang === 'all' || x.lang === lang)
    .sort((a, b) => (Number(b.sort) || 0) - (Number(a.sort) || 0))
    .map((x) => ({ id: x.id, cat: x.cat || '', name: x.name || '', url: x.url, desc: x.desc || '', icon: x.icon || '🔗' }));
}

async function getAppConfig(p) {
  const { country, lang } = p || {};
  const all = (await getConfig('announcements', [])) || [];
  const t = Date.now();
  const list = all
    .filter((a) => a && a.enabled !== false)
    .filter((a) => !a.country || a.country === 'all' || a.country === country)
    .filter((a) => !a.lang || a.lang === 'all' || a.lang === lang)
    .filter((a) => (!a.start || new Date(a.start).getTime() <= t) && (!a.end || new Date(a.end).getTime() >= t))
    .sort((a, b) => (Number(b.sort) || 0) - (Number(a.sort) || 0))
    .slice(0, 5)
    .map((a) => ({ id: a.id, title: a.title || '', content: a.content || '', image: a.image || '', link: a.link || '' }));
  return ok({ announcements: list, tools: p && p.withTools ? await getTools(lang) : undefined });
}

// ---------- 入口 ----------

exports.main = async (event) => {
  let { OPENID } = cloud.getWXContext();
  const { action } = event || {};
  // 每次调用先保障集合存在（同实例只执行一次，开销可忽略）
  await ensureCollections();
  // App 端：无 OPENID 时用 App 令牌换取用户 ID（小程序端始终以 OPENID 为准）
  if (!OPENID && event && event._appToken) OPENID = await verifyAppToken(event._appToken);
  if (action === 'riderSweep') return event._sys && event._sys === process.env.KR_SYS_TOKEN ? riderSweep() : fail('无权限');
  // 无需登录的动作：dbCheck（部署诊断）、App 注册/登录
  const PUBLIC_ACTIONS = ['dbCheck', 'appRegister', 'appLogin', 'wxLogin', 'getAppVersion', 'requestSchool', 'getAppConfig'];
  // 游客模式（App/H5 未登录）：允许浏览公开内容；翻页超过上限、或任何写操作，返回登录引导码
  const GUEST_ACTIONS = ['getDeals', 'getDealDetail', 'getExploreData', 'getHotFeed', 'getPosts', 'getOrders', 'getPostDetail', 'getOrderDetail', 'getUserHome', 'getMoments', 'getTopToday', 'getSchoolStats'];
  const GUEST_MAX_ITEMS = (await getSettings()).guestMaxItems;
  if (!OPENID && GUEST_ACTIONS.includes(action)) {
    if (action === 'getOrders' && event.mode !== 'hall') return fail('未登录', 'NO_AUTH');
    if ((action === 'getPosts' || action === 'getOrders') && (Number(event.skip) || 0) >= GUEST_MAX_ITEMS) {
      return fail('登录后查看更多', 'NEED_LOGIN');
    }
  } else if (!PUBLIC_ACTIONS.includes(action) && !OPENID) {
    return fail('未登录', 'NO_AUTH');
  }
  // 封禁中的账号:可以浏览、举报、反馈,但不能发布、评论、私聊
  const WRITE_ACTIONS = ['createOrder', 'updateOrder', 'relistOrder', 'claimOrder', 'joinOrder', 'wantOrder', 'reviewOrder', 'createPost', 'addComment', 'addOrderComment', 'startConversation', 'sendMessage', 'updateProfile', 'translate', 'sendFriendRequest', 'applyRider', 'createMoment', 'commentMoment', 'likeMoment', 'likeComment', 'useDeal', 'suggestMerchant'];
  if (OPENID && WRITE_ACTIONS.includes(action) && isBanned(await getUserDoc(OPENID))) {
    return fail('你的账号已被封禁，暂时不能发布、评论或私聊', 'BANNED');
  }
  // 发布内容一律归属用户当前学校(以服务器为准),防止本地切换学校绕过换校限制
  if (OPENID && ['createPost', 'createOrder', 'createMoment'].includes(action)) {
    const me = await getUserDoc(OPENID);
    if (me && me.schoolId) {
      event.schoolId = me.schoolId;
      if (event.payload && typeof event.payload === 'object' && event.payload.schoolId) event.payload.schoolId = me.schoolId;
    }
  }
  // 敏感词:发布/评论/私聊/资料
  const SCREEN = {
    createPost: () => screenTexts(event, ['title', 'content', 'rewardText']),
    addComment: () => screenTexts(event, ['content']),
    addOrderComment: () => screenTexts(event, ['content']),
    sendMessage: () => screenTexts(event, ['content']),
    startConversation: () => screenTexts(event, ['greet']),
    suggestMerchant: () => screenTexts(event, ['name', 'address', 'note']),
    sendFriendRequest: () => screenTexts(event, ['msg']),
    createMoment: () => screenTexts(event, ['content']),
    commentMoment: () => screenTexts(event, ['content']),
    updateProfile: () => screenTexts(event, ['nickname', 'signature', 'major', 'hometown']),
    createOrder: async () => (await screenTexts(event.payload, ['title', 'desc', 'from', 'to', 'rewardText'])) || screenTexts(event.payload && event.payload.payload),
    updateOrder: async () => {
      const p = event.payload || event;
      return (await screenTexts(p, ['title', 'desc', 'from', 'to', 'rewardText'])) || screenTexts(p.payload);
    },
  };
  if (SCREEN[action]) {
    const bad = await SCREEN[action]();
    if (bad) return fail(bad);
  }
  try {
    const PRE = { deletePost: ['posts', event.postId], deleteOrder: ['orders', event.orderId], deleteMoment: ['moments', event.momentId], deleteComment: ['comments', event.commentId], deleteMomentComment: ['comments', event.commentId] }[action];
    if (PRE && PRE[1]) event.__pre = await db.collection(PRE[0]).doc(PRE[1]).get().then((r) => r.data).catch(() => null);
    const __res = await (async () => { switch (action) {
      case 'wxLogin':
        return await wxLogin(event);
      case 'whoami':
        return ok({ userId: OPENID });
      case 'appRegister':
        return await appRegister(event);
      case 'appLogin':
        return await appLogin(event);
      case 'appDeleteAccount':
        return await appDeleteAccount(OPENID);
      case 'createOrder':
        return await createOrder(OPENID, event.payload);
      case 'claimOrder':
        return await claimOrder(OPENID, event.orderId);
      case 'joinOrder':
        return await joinOrder(OPENID, event.orderId);
      case 'leaveOrder':
        return await leaveOrder(OPENID, event.orderId, event);
      case 'wantOrder':
        return await wantOrder(OPENID, event.orderId);
      case 'markSold':
        return await markSold(OPENID, event.orderId, event.buyerUid);
      case 'reserveOrder':
        return await reserveOrder(OPENID, event.orderId, event.on);
      case 'acceptAnswer':
        return await acceptAnswer(OPENID, event);
      case 'changeSchool':
        return await changeSchool(OPENID, event);
      case 'getDeals':
        return await getDeals(OPENID, event);
      case 'getDealDetail':
        return await getDealDetail(OPENID, event.dealId);
      case 'useDeal':
        return await useDeal(OPENID, event.dealId);
      case 'suggestMerchant':
        return await suggestMerchant(OPENID, event);
      case 'closePost':
        return await closePost(OPENID, event);
      case 'reopenPost':
        return await reopenPost(OPENID, event.postId);
      case 'updateOrder':
        return await updateOrder(OPENID, event);
      case 'deleteOrder':
        return await deleteOrder(OPENID, event.orderId);
      case 'cancelOrder':
        return await cancelOrder(OPENID, event.orderId);
      case 'relistOrder':
        return await relistOrder(OPENID, event.orderId);
      case 'confirmOrder':
        return await confirmOrder(OPENID, event.orderId);
      case 'confirmDoneJoin':
        return await confirmDoneJoin(OPENID, event.orderId);
      case 'reviewOrder':
        return await reviewOrder(OPENID, event.orderId, event.payload);
      case 'getOrders':
        return await getOrders(OPENID, event);
      case 'getOrderDetail':
        return await getOrderDetail(OPENID, event.orderId);
      case 'getMyProfile':
        return await getMyProfile(OPENID, event);
      case 'updateProfile':
        return await updateProfile(OPENID, event);
      case 'createPost':
        return await createPost(OPENID, event);
      case 'getPosts':
        return await getPosts(event, OPENID);
      case 'getPostDetail':
        return await getPostDetail(OPENID, event.postId);
      case 'addComment':
        return await addComment(OPENID, event);
      case 'deletePost':
        return await deletePost(OPENID, event.postId);
      case 'deleteComment':
        return await deleteComment(OPENID, event.commentId);
      case 'startConversation':
        return await startConversation(OPENID, event);
      case 'sendMessage':
        return await sendMessage(OPENID, event);
      case 'getConversations':
        return await getConversations(OPENID);
      case 'getMessages':
        return await getMessages(OPENID, event);
      case 'markRead':
        return await markRead(OPENID, event);
      case 'dbCheck':
        return await dbCheck();
      case 'submitFeedback':
        return await submitFeedback(OPENID, event);
      case 'getUserHome':
        return await getUserHome(event);
      case 'getHotFeed':
        return await getHotFeed(event, OPENID);
      case 'getExploreData':
        return await getExploreData(event, OPENID);
      case 'addOrderComment':
        return await addOrderComment(OPENID, event);
      case 'translate':
        return await translateText(OPENID, event);
      case 'getAppVersion':
        return await getAppVersion();
      case 'report':
        return await reportContent(OPENID, event);
      case 'blockUser':
        return await blockUser(OPENID, event);
      case 'unblockUser':
        return await unblockUser(OPENID, event);
      case 'getBlockedUsers':
        return await getBlockedUsers(OPENID);
      case 'getAppConfig':
        return await getAppConfig(event);
      case 'friendStatus':
        return await friendStatus(OPENID, event);
      case 'sendFriendRequest':
        return await sendFriendRequest(OPENID, event);
      case 'respondFriendRequest':
        return await respondFriendRequest(OPENID, event);
      case 'getFriendRequests':
        return await getFriendRequests(OPENID);
      case 'getFriends':
        return await getFriends(OPENID);
      case 'removeFriend':
        return await removeFriend(OPENID, event);
      case 'setFriendPolicy':
        return await setFriendPolicy(OPENID, event);
      case 'getFriendPolicy':
        return await getFriendPolicy(OPENID);
      case 'searchUsers':
        return await searchUsers(OPENID, event);
      case 'convAction':
        return await convAction(OPENID, event);
      case 'markAllRead':
        return await markAllRead(OPENID);
      case 'createMoment':
        return await createMoment(OPENID, event);
      case 'getMoments':
        return await getMoments(OPENID, event);
      case 'likeMoment':
        return await likeMoment(OPENID, event);
      case 'commentMoment':
        return await commentMoment(OPENID, event);
      case 'deleteMoment':
        return await deleteMoment(OPENID, event);
      case 'deleteMomentComment':
        return await deleteMomentComment(OPENID, event);
      case 'requestSchool':
        return await requestSchool(OPENID, event);
      case 'getNotifications':
        return await getNotifications(OPENID, event);
      case 'markNotificationsRead':
        return await markNotificationsRead(OPENID, event);
      case 'getBadges':
        return await getBadges(OPENID, event);
      case 'setFriendRemark':
        return await setFriendRemark(OPENID, event);
      case 'likeComment':
        return await likeComment(OPENID, event);
      case 'getTopToday':
        return await getTopToday(event);
      case 'getSchoolStats':
        return await getSchoolStats(event);
      case 'getRiderStatus':
        return await getRiderStatus(OPENID);
      case 'applyRider':
        return await applyRider(OPENID, event);
      case 'removeMember':
        return await removeMember(OPENID, event);
      case 'markPicked':
        return await markPicked(OPENID, event);
      case 'deliverOrder':
        return await deliverOrder(OPENID, event);
      case 'releaseHelper':
        return await releaseHelper(OPENID, event.orderId);
      case 'abandonOrder':
        return await abandonOrder(OPENID, event.orderId);
      case 'recordShare':
        return await recordShare(OPENID, event);
      default:
        return fail('未知操作');
    } })();
    return await afterAction(OPENID, action, event, __res);
  } catch (e) {
    console.error('[krstuast]', action, e);
    return fail(e.message || '服务开小差了');
  }
};
