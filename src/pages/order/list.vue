<template>
<!--pages/order/list 任务大厅（按 flow 出不同卡片）-->
<view class="page">
  <!-- 筛选条 -->
  <view class="filter-bar">
    <view :class="`filter-chip ${scopeSchool ? 'chip-on' : ''}`" @tap="toggleScope">
      {{scopeSchool ? L?.scopeSchool : L?.scopeAll}}
    </view>
    <view v-if="loaded" class="filter-count">{{hasMore ? L?.scrollMore : L?.countPrefix + list?.length + L?.countUnit}}</view>
  </view>

  <!-- 货架式卡片：闲置/租房/兼职（图片优先 + 价格大字） -->
  <template v-for="(item, index) in list" :key="item._id"><view v-if="item?.flow === 'listing'" class="card listing-card" :data-id="item?._id" @tap="onTapOrder" hover-class="card-hover">
    <view class="thumb-wrap">
      <image v-if="item?.thumb" class="thumb" :src="item?.thumb" mode="aspectFill" />
      <view v-else class="thumb thumb-placeholder">{{item?.meta?.icon}}</view>
    </view>
    <view class="listing-main">
      <view class="listing-title">{{item?.title}}</view>
      <view v-if="item?.summary?.text" class="listing-summary">{{item?.summary?.text}}</view>
      <view class="listing-foot">
        <view class="listing-badges">
          <view v-if="item?.rentTag" class="listing-badge" :style="`background: ${item?.rentTag?.bg}; color: ${item?.rentTag?.color};`">{{item?.rentTag?.label}}</view>
          <view v-if="item?.parttimeTag" class="listing-badge" :style="`background: ${item?.parttimeTag?.bg}; color: ${item?.parttimeTag?.color};`">{{item?.parttimeTag?.label}}</view>
          <view class="listing-badge" :style="`background: ${item?.sMeta?.bg}; color: ${item?.sMeta?.color};`">{{item?.sMeta?.label}}</view>
          <view v-if="!scopeSchool &amp;&amp; item?.schoolName" class="listing-badge" style="background: #EAE4FF; color: #7A6BC9;">🏫 {{item?.schoolName}}</view>
        </view>
        <text class="ago">{{item?.ago}}</text>
      </view>
    </view>
  </view></template>

  <!-- 任务式卡片：帮取帮送/出行信息/凑单/陪玩 -->
  <template v-for="(item, index) in list" :key="item._id"><view v-if="item?.flow !== 'listing'" class="card" :data-id="item?._id" @tap="onTapOrder" hover-class="card-hover">
    <view class="card-top">
      <view class="badge">{{item?.meta?.icon}} {{item?.meta?.badgeName}}</view>
      <view v-if="item?.gbTag" class="badge" :style="`background: ${item?.gbTag?.bg}; color: ${item?.gbTag?.color};`">{{item?.gbTag?.label}}</view>
      <view v-if="item?.homecookTag" class="badge" :style="`background: ${item?.homecookTag?.bg}; color: ${item?.homecookTag?.color};`">{{item?.homecookTag?.label}}</view>
      <view class="badge" :style="`background: ${item?.sMeta?.bg}; color: ${item?.sMeta?.color};`">{{item?.sMeta?.label}}</view>
      <view v-if="!scopeSchool &amp;&amp; item?.schoolName" class="badge badge-school">🏫 {{item?.schoolName}}</view>
    </view>
    <view class="card-title">{{item?.title}}</view>
    <view v-if="item?.summary?.text" class="route">
      <template v-if="item?.summary?.type === 'route'">
        <view class="route-line">
          <text class="route-tag">{{item?.summary?.fromTag}}</text>
          <text class="route-text">{{item?.summary?.from}}</text>
        </view>
        <view class="route-down">↓</view>
        <view class="route-line">
          <text class="route-tag route-tag-to">{{item?.summary?.toTag}}</text>
          <text class="route-text">{{item?.summary?.to}}</text>
        </view>
      </template>
      <text v-else class="summary-text">{{item?.summary?.text}}</text>
    </view>
    <view class="card-foot">
      <text v-if="item?.reward" class="reward">{{item?.reward}}</text>
      <text v-if="item?.deadlineText" class="deadline">⏰ {{item?.deadlineText}}</text>
      <text class="ago">{{item?.ago}}</text>
    </view>
  </view></template>

  <!-- 加载中（Win11 风格转圈） -->
  <view v-if="!loaded" class="empty">
    <view class="spinner" />
    <view class="loading-text">{{L?.loading}}</view>
  </view>

  <!-- 空状态 -->
  <view v-if="loaded &amp;&amp; !list?.length" class="empty">
    <view class="empty-emoji">🐻</view>
    <view class="empty-text">{{L?.emptyTitle}}</view>
    <view class="empty-sub">{{L?.emptySub}}</view>
    <view v-if="scopeSchool" class="empty-btn" @tap="toggleScope">{{L?.emptyBtn}}</view>
  </view>

  <view v-if="list?.length &amp;&amp; !hasMore" class="load-more">{{L?.noMore}}</view>
  <view v-if="list?.length &amp;&amp; hasMore" class="load-more">{{loading ? L?.loading : L?.pullMore}}</view>

  <!-- 回到顶部（加号按钮上方） -->
  <!-- 悬浮发布按钮 -->
  <view class="fab" @tap="onPublish" hover-class="fab-hover">＋</view>

  <view :class="`to-top ${showTop ? 'to-top-show' : ''}`" @tap="onToTop" hover-class="to-top-hover">⬆</view>
</view>
</template>

<script>
import { definePage } from '@/utils/mp-compat.js';
import __m0_app_state from '@/utils/app-state.js';
import __m1_order_meta from '../../utils/order-meta.js';
import __m2_format from '../../utils/format.js';
import __m3_school_map from '../../utils/school-map.js';
import __m4_i18n from '../../utils/i18n.js';
import cloud, { requireLogin, thumbUrl } from '@/utils/cloud.js';
// pages/order/list —— 任务大厅（8 类任务通用，按 flow 展示不同卡片；滚到底自动分页）
const app = __m0_app_state;
const { funcMeta, rewardLabel, summaryText, taskCategory, flowOf, statusMetaOf, rentTagOf, gbTagOf, parttimeTagOf, homecookTagOf, isVisibleOf } = __m1_order_meta;
const { timeAgo, fmtDeadline } = __m2_format;
const { schoolName } = __m3_school_map;
const { t, cloudMsg } = __m4_i18n;

const PAGE_SIZE = 15;

export default definePage({
  data: {
    category: 'pickup',    // functionId
    queryCategory: '',
    func: null,            // { id, name, icon }
    flow: 'claim',         // claim / join / listing
    scopeSchool: true,
    list: [],
    skip: 0,
    hasMore: true,
    loaded: false,
    loading: false,
    showTop: false,
    L: {},
  },

  onLoad(options) {
    const category = options.category || 'pickup';
    const func = funcMeta(category);
    // 帮取帮送：合并历史帮送单一起展示
    const queryCategory = category === 'pickup' ? 'pickup,delivery' : category;
    this.setData({ category, queryCategory, func, flow: flowOf(category) });
    uni.setNavigationBarTitle({ title: t('nav.orderList.hall', { icon: func.icon, name: func.name }) });
    this.applyI18n();
  },

  onShow() {
    this.applyI18n();
    this.reset();
  },

  applyI18n() {
    this.setData({
      L: {
        scopeSchool: t('orderList.scopeSchool'),
        scopeAll: t('orderList.scopeAll'),
        scrollMore: t('orderList.scrollMore'),
        countPrefix: t('orderList.countPrefix'),
        countUnit: t('orderList.countUnit'),
        loading: t('common.loading'),
        emptyTitle: t('orderList.emptyTitle'),
        emptySub: t('orderList.emptySub'),
        emptyBtn: t('orderList.emptyBtn'),
        noMore: t('common.noMore'),
        pullMore: t('common.pullMore'),
      },
    });
  },

  onPullDownRefresh() {
    this.reset(() => uni.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;
    this.load(true);
  },
  // 回到顶部按钮：页面下滑时出现
  onPageScroll(e) {
    const showTop = e.scrollTop > 500;
    if (showTop !== this.data.showTop) this.setData({ showTop });
  },

  onToTop() {
    uni.pageScrollTo({ scrollTop: 0, duration: 300 });
    this.setData({ showTop: false });
  },


  // 回到顶部按钮：页面下滑时出现


  reset(done) {
    this.setData({ list: [], skip: 0, hasMore: true, loaded: false });
    this.load(false, done);
  },

  load(append, done) {
    const { queryCategory, category, scopeSchool, skip } = this.data;
    const cats = (queryCategory || category).split(',');
    const schoolId = scopeSchool ? ((app.readSchool() || {}).id || '') : '';
    // 已下架信息也展示（靠后），供参考
    const includeClosed = true;
    this.setData({ loading: true });
    // 多分类合并在前端完成（不依赖云函数版本）：各分类并行查询 → 去重 → 在售优先+时间倒序 → 本地分页
    Promise.all(
      cats.map((c) =>
        cloud.callFunction({
          name: 'krstuast',
          data: { action: 'getOrders', mode: 'hall', functionId: c, schoolId, includeClosed, skip: 0, limit: 50 },
        })
      )
    )
      .then((ress) => {
        this.setData({ loading: false });
        const map = {};
        let cloudError = '';
        ress.forEach((res) => {
          const r = res.result || {};
          if (!r.success && !cloudError) cloudError = cloudMsg(r.message) || t('common.loadFailed');
          if (r.success) {
            (r.list || []).forEach((o) => {
              if (!map[o._id]) map[o._id] = o;
            });
          }
        });
        if (cloudError && !Object.keys(map).length) {
          uni.showToast({ title: cloudError, icon: 'none', duration: 3000 });
        }
        let all = Object.keys(map).map((k) => map[k]);
        all.sort((a, b) => {
          const pa = isVisibleOf(a) ? 0 : 1; // 进行中优先，已下架/超时/已结束靠后
          const pb = isVisibleOf(b) ? 0 : 1;
          if (pa !== pb) return pa - pb;
          return b.createdAt - a.createdAt; // 组内按创建时间从晚到早（新发布在前）
        });
        const rows = all.slice(skip, skip + PAGE_SIZE).map((o) => this.decorate(o));
        const list = append ? this.data.list.concat(rows) : rows;
        this.setData({
          list,
          skip: skip + rows.length,
          hasMore: rows.length > 0 && skip + rows.length < all.length,
          loaded: true,
        });
        if (done) done();
      })
      .catch((e) => {
        console.error('hall reload', e);
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
        this.setData({ loading: false, loaded: true });
        if (done) done();
      });
  },

  decorate(o) {
    const hasReward = taskCategory(o.functionId).hasReward;
    const flow = flowOf(o.functionId);
    const deadlineLabel = fmtDeadline(o.deadline);
    return {
      ...o,
      meta: funcMeta(o.functionId),
      sMeta: statusMetaOf(o),
      flow,
      reward: hasReward ? rewardLabel(o) : '',
      ago: timeAgo(o.createdAt),
      deadlineText: deadlineLabel ? t('orderList.deadlineBefore', { time: deadlineLabel }) : '',
      summary: summaryText(o),
      schoolName: schoolName(o.schoolId),
      rentTag: rentTagOf(o),     // 租房三标签徽章
      gbTag: gbTagOf(o),         // 拆单/凑单徽章
      parttimeTag: parttimeTagOf(o), // 兼职找/招徽章
      homecookTag: homecookTagOf(o), // 私厨做菜/点菜徽章
      thumb: thumbUrl((o.images && o.images[0]) || ''),     // listing 卡片缩略图
      joinedCount: (o.participants || []).length, // join 进度
      targetN: o.targetN || 0,
      progressText: o.targetN ? t('orderList.progress', { n: (o.participants || []).length, total: o.targetN }) : '',
      progressPercent: o.targetN ? Math.min(100, Math.round(((o.participants || []).length * 100) / o.targetN)) : 0,
    };
  },

  toggleScope() {
    this.setData({ scopeSchool: !this.data.scopeSchool });
    this.reset();
  },

  onTapOrder(e) {
    const { id } = e.currentTarget.dataset;
    uni.navigateTo({ url: '/pages/order/detail?id=' + id });
  },

  onPublish() {
    if (!requireLogin()) return;
    uni.navigateTo({ url: '/pages/order/publish?category=' + this.data.category });
  },
});

</script>

<style scoped>
/* pages/order/list 任务大厅 */
.page {
  min-height: 100vh;
  padding: 24rpx 32rpx calc(48rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}
.filter-chip {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: #ffffff;
  color: #6e6878;
  font-size: 24rpx;
  font-weight: 600;
  margin-right: 16rpx;
  box-shadow: 0 4rpx 16rpx rgba(31, 29, 36, 0.05);
}
.chip-on {
  background: #d63a73;
  color: #ffffff;
}
.filter-count {
  margin-left: auto;
  font-size: 22rpx;
  color: #7a7383;
}
.card {
  background: #ffffff;
  border-radius: 28rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(31, 29, 36, 0.05);
}
.card-hover {
  opacity: 0.85;
}
.card-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap; /* 徽章多时自动换行，不溢出卡片 */
  row-gap: 10rpx;
}
.badge {
  font-size: 22rpx;
  color: #d63a73;
  background: #ffeef4;
  border-radius: 999rpx;
  padding: 6rpx 18rpx;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.badge-school {
  margin-left: 12rpx;
  background: #eae4ff;
  color: #7a6bc9;
  max-width: 260rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-title {
  margin-top: 16rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: #1f1d24;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route {
  margin-top: 12rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.route-line {
  display: flex;
  align-items: center;
  max-width: 100%;
}
.route-text {
  font-size: 26rpx;
  color: #625c6b;
  max-width: 440rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route-down {
  color: #d63a73;
  font-weight: 700;
  font-size: 22rpx;
  line-height: 1.4;
  padding-left: 20rpx;
}

.route-tag {
  flex-shrink: 0;
  font-size: 20rpx;
  font-weight: 700;
  color: #3e8e6b;
  background: #dff6ec;
  border-radius: 999rpx;
  padding: 4rpx 14rpx;
  margin-right: 10rpx;
}
.route-tag-to {
  color: #d63a73;
  background: #ffeef4;
}
.route-arrow {
  margin: 0 14rpx;
  color: #d63a73;
  font-weight: 700;
}
.summary-text {
  font-size: 26rpx;
  color: #625c6b;
  display: block;
  max-width: 100%;
  word-break: break-all; /* 内容自动换行，不溢出卡片 */
  line-height: 1.6;
}
.card-foot {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
}
.reward {
  font-size: 28rpx;
  font-weight: 700;
  color: #d63a73;
}
.deadline {
  margin-left: 20rpx;
  font-size: 22rpx;
  color: #b07f2e;
}
.ago {
  margin-left: auto;
  font-size: 22rpx;
  color: #7a7383;
}
/* 货架式卡片（闲置/租房/兼职） */
.listing-card {
  display: flex;
  align-items: center;
}
.thumb-wrap {
  flex-shrink: 0;
  margin-right: 24rpx;
}
.thumb {
  width: 160rpx;
  height: 160rpx;
  border-radius: 20rpx;
  background: #ffeef4;
}
.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 64rpx;
}
.listing-main {
  flex: 1;
  min-width: 0;
}
.listing-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #1f1d24;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.listing-summary {
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #d63a73;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.listing-foot {
  margin-top: 14rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.listing-badges {
  display: flex;
  align-items: center;
}
.listing-badge {
  font-size: 22rpx;
  border-radius: 999rpx;
  padding: 6rpx 18rpx;
  font-weight: 600;
  margin-right: 10rpx;
}
/* join 进度条 */
.join-progress {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
}
.progress-track {
  flex: 1;
  height: 14rpx;
  border-radius: 999rpx;
  background: #f3f1f5;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 999rpx;
  background: #d63a73;
}
.progress-text {
  margin-left: 16rpx;
  font-size: 22rpx;
  color: #d63a73;
  font-weight: 600;
}
.load-more {
  text-align: center;
  font-size: 24rpx;
  color: #7a7383;
  padding: 20rpx 0;
}
.empty {
  padding: 160rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-emoji {
  font-size: 120rpx;
  animation: float 3s ease-in-out infinite;
}
.empty-text {
  margin-top: 28rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: #1f1d24;
}
.empty-sub {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #7a7383;
}
.empty-btn {
  margin-top: 32rpx;
  padding: 14rpx 40rpx;
  border-radius: 999rpx;
  background: #d63a73;
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 700;
}
.to-top {
  position: fixed;
  right: calc(52rpx + var(--k-side, 0px));
  bottom: calc(200rpx + env(safe-area-inset-bottom));
  width: 80rpx;
  height: 80rpx;
  line-height: 76rpx;
  text-align: center;
  font-size: 40rpx;
  color: #d63a73;
  background: #ffffff;
  border-radius: 50%;
  box-shadow: 0 8rpx 24rpx rgba(31, 29, 36, 0.08);
  opacity: 0;
  transform: translateY(20rpx);
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.to-top-show {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.to-top-hover {
  opacity: 0.8;
}
.fab {
  position: fixed;
  right: calc(40rpx + var(--k-side, 0px));
  bottom: calc(48rpx + env(safe-area-inset-bottom));
  width: 112rpx;
  height: 112rpx;
  line-height: 108rpx;
  text-align: center;
  font-size: 64rpx;
  color: #ffffff;
  background: #d63a73;
  border-radius: 50%;
  box-shadow: 0 12rpx 32rpx rgba(31, 29, 36, 0.08);
}
.fab-hover {
  transform: scale(0.94);
}
/* Win11 风格转圈加载 */
.spinner {
  width: 48rpx;
  height: 48rpx;
  border: 6rpx solid #f3f1f5;
  border-top-color: #d63a73;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16rpx;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.loading-text {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #7a7383;
}

</style>
