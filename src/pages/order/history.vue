<template>
<!--pages/order/history 历史订单-->
<view class="page">
  <!-- 发布/参与 tab -->
  <view class="role-tabs">
    <view :class="`role-tab ${role === 'published' ? 'role-on' : ''}`" data-role="published" @tap="onTabRole">
      {{L?.rolePublished}}
    </view>
    <view :class="`role-tab ${role === 'joined' ? 'role-on' : ''}`" data-role="joined" @tap="onTabRole">
      {{L?.roleJoined}}
    </view>
  </view>

  <!-- 功能筛选 -->
  <scroll-view class="chips" scroll-x :show-scrollbar="false">
    <view :class="`chip ${functionId === '' ? 'chip-on' : ''}`" data-id @tap="onTapFunc">{{L?.allFuncs}}</view>
    <view v-for="(item, index) in funcChips" :key="item.id" :class="`chip ${functionId === item?.id ? 'chip-on' : ''}`" :data-id="item?.id" @tap="onTapFunc">{{item?.icon}} {{item?.name}}</view>
  </scroll-view>

  <!-- 状态筛选 -->
  <view class="status-row">
    <view v-for="(item, index) in statusFilters" :key="item.key" :class="`chip ${status === item?.key ? 'chip-on' : ''}`" :data-key="item?.key" @tap="onTapStatus">{{item?.label}}</view>
  </view>

  <!-- 列表 -->
  <view v-for="(item, index) in list" :key="item._id" class="card" :data-id="item?._id" @tap="onTapOrder" hover-class="card-hover">
    <view class="card-top">
      <view class="badge">{{item?.meta?.icon}} {{item?.meta?.badgeName}}</view>
      <view class="badge" :style="`background: ${item?.sMeta?.bg}; color: ${item?.sMeta?.color};`">{{item?.sMeta?.label}}</view>
      <view v-if="item?.schoolName" class="badge badge-school">🏫 {{item?.schoolName}}</view>
    </view>
    <view class="card-title">{{item?.title}}</view>
    <view v-if="item?.from || item?.to" class="route">
      <text class="route-text">{{item?.from}}</text>
      <text class="route-arrow">→</text>
      <text class="route-text">{{item?.to}}</text>
    </view>
    <view class="card-foot">
      <text v-if="item?.reward" class="reward">{{item?.reward}}</text>
      <text class="ago">{{item?.ago}}</text>
    </view>
  </view>

  <!-- 空状态 -->
  <view v-if="loaded &amp;&amp; !list?.length" class="empty">
    <view class="empty-emoji">🕊️</view>
    <view class="empty-text">{{role === 'published' ? L?.emptyPublished : L?.emptyJoined}}</view>
    <view class="empty-sub">{{L?.emptySub}}</view>
    <view v-if="debugOpenid" class="debug-line">{{L?.debugLine}}</view>
  </view>

  <view v-if="list?.length &amp;&amp; !hasMore" class="load-more">{{L?.noMore}}</view>
  <view v-if="list?.length &amp;&amp; hasMore" class="load-more">{{loading ? L?.loading : L?.pullMore}}</view>

</view>
</template>

<script>
import { orderTitle } from '@/utils/feed.js';
import { definePage } from '@/utils/mp-compat.js';
import __m0_functions from '../../data/functions.js';
import __m1_order_meta from '../../utils/order-meta.js';
import __m2_format from '../../utils/format.js';
import __m3_school_map from '../../utils/school-map.js';
import __m4_i18n from '../../utils/i18n.js';
import cloud from '@/utils/cloud.js';
// pages/order/history —— 历史订单（我发布的 / 我参与的 · 覆盖全部功能）
const functions = __m0_functions;
const { funcMeta, statusMetaOf, rewardLabel, taskCategory, taskCategories } = __m1_order_meta;
const { timeAgo, fmtDeadline } = __m2_format;
const { schoolName } = __m3_school_map;
const { t, tv, cloudMsg } = __m4_i18n;

// 状态筛选:key 为云端过滤值(不变),label 本地化
const buildStatusFilters = () => [
  { key: '', label: t('common.all') },
  { key: 'active', label: tv('statusFilter', 'active') },
  { key: 'cancelled', label: tv('statusFilter', 'cancelled') },
  { key: 'done', label: tv('statusFilter', 'done') },
];

export default definePage({
  data: {
    role: 'published', // published=我发布的 / joined=我参与的
    functionId: '',     // ''=全部功能
    status: '',         // ''/ongoing/done/cancelled
    funcChips: [],      // 只筛任务类功能
    statusFilters: [],
    list: [],
    skip: 0,
    hasMore: true,
    loaded: false,
    loading: false,
    debugOpenid: '', // 临时调试：空列表时显示本账号 openid，用于对比库里 publisherId
    L: {},
  },

  onLoad(q) {
    if (q && (q.role === 'joined' || q.role === 'published')) this.setData({ role: q.role });
    uni.setNavigationBarTitle({ title: t('nav.orderHistory') });
  },

  onShow() {
    const cats = taskCategories();
    this.setData({
      funcChips: functions
        .filter((f) => f.id !== 'more' && !f.hidden && cats[f.id])
        .map((f) => funcMeta(f.id)),
      statusFilters: buildStatusFilters(),
      L: {
        rolePublished: t('history.rolePublished'),
        roleJoined: t('history.roleJoined'),
        allFuncs: t('history.allFuncs'),
        emptyPublished: t('history.emptyPublished'),
        emptyJoined: t('history.emptyJoined'),
        emptySub: t('history.emptySub'),
        debugLine: t('history.debugLine'),
        loading: t('common.loading'),
        noMore: t('common.noMore'),
        pullMore: t('common.pullMore'),
      },
    });
    this.reset();
  },

  onPullDownRefresh() {
    this.reset(() => uni.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;
    this.load(true);
  },

  reset(done) {
    this.setData({ list: [], skip: 0, hasMore: true, loaded: false });
    this.load(false, done);
  },

  load(append, done) {
    const { role, functionId, status, skip } = this.data;
    this.setData({ loading: true });
    cloud
      .callFunction({
        name: 'krstuast',
        data: {
          action: 'getOrders',
          mode: 'history',
          role,
          functionId: functionId || '',
          status: status || '',
          skip,
          limit: 20,
        },
      })
      .then((res) => {
        this.setData({ loading: false });
        const r = res.result || {};
        if (!r.success) {
          uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
          if (done) done();
          return;
        }
        const rows = r.list.map((o) => ({
          ...o,
          title: orderTitle(o),
          meta: funcMeta(o.functionId),
          sMeta: statusMetaOf(o),
          reward: taskCategory(o.functionId).hasReward ? rewardLabel(o) : '',
          ago: timeAgo(o.createdAt),
          deadlineLabel: fmtDeadline(o.deadline),
          schoolName: schoolName(o.schoolId),
        }));
        const list = append ? this.data.list.concat(rows) : rows;
        this.setData({
          list,
          skip: r.skip + rows.length,
          hasMore: rows.length > 0 && r.skip + rows.length < r.total,
          loaded: true,
        });
        // 临时调试：查不到数据时显示本账号 openid（用户文档 _id 即 openid），
        // 用于和云数据库 orders.publisherId 对比排查账号不一致
        if (!list.length) {
          cloud
            .callFunction({ name: 'krstuast', data: { action: 'getMyProfile' } })
            .then((res2) => {
              const r2 = res2.result || {};
              if (r2.success && r2.user) {
                this.setData({
                  debugOpenid: r2.user._id || '',
                  'L.debugLine': t('history.debugLine', { id: r2.user._id || '' }),
                });
              }
            })
            .catch(() => {});
        }
        if (done) done();
      })
      .catch((e) => {
        console.error('history load', e);
        this.setData({ loading: false, loaded: true });
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
        if (done) done();
      });
  },

  onTabRole(e) {
    const role = e.currentTarget.dataset.role;
    if (role === this.data.role) return;
    this.setData({ role });
    this.reset();
  },

  onTapFunc(e) {
    const id = e.currentTarget.dataset.id || '';
    if (id === this.data.functionId) return;
    this.setData({ functionId: id });
    this.reset();
  },

  onTapStatus(e) {
    const key = e.currentTarget.dataset.key || '';
    if (key === this.data.status) return;
    this.setData({ status: key });
    this.reset();
  },

  onTapOrder(e) {
    const { id } = e.currentTarget.dataset;
    uni.navigateTo({ url: '/pages/order/detail?id=' + id });
  },
});

</script>

<style scoped>
/* pages/order/history 历史订单 */
.page {
  min-height: 100vh;
  padding: 24rpx 32rpx calc(48rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.role-tabs {
  display: flex;
  background: #ffffff;
  border-radius: 999rpx;
  padding: 8rpx;
  box-shadow: 0 8rpx 24rpx rgba(31, 29, 36, 0.05);
  margin-bottom: 24rpx;
}
.role-tab {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #6e6878;
}
.role-on {
  background: #d63a73;
  color: #ffffff;
}
.chips {
  white-space: nowrap;
  margin-bottom: 16rpx;
}
.chip {
  display: inline-block;
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  background: #ffffff;
  color: #6e6878;
  font-size: 24rpx;
  font-weight: 600;
  margin-right: 14rpx;
  box-shadow: 0 4rpx 12rpx rgba(31, 29, 36, 0.04);
}
.chip-on {
  background: #fff3ce;
  color: #b07f2e;
}
.status-row {
  margin-bottom: 24rpx;
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
  justify-content: space-between;
}
.badge {
  font-size: 22rpx;
  color: #d63a73;
  background: #ffeef4;
  border-radius: 999rpx;
  padding: 6rpx 18rpx;
  font-weight: 600;
  margin-right: 10rpx;
}
.badge-school {
  background: #eae4ff;
  color: #7a6bc9;
  max-width: 240rpx;
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
  align-items: center;
}
.route-text {
  font-size: 26rpx;
  color: #625c6b;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route-arrow {
  margin: 0 14rpx;
  color: #d63a73;
  font-weight: 700;
}
.card-foot {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.reward {
  font-size: 26rpx;
  font-weight: 700;
  color: #d63a73;
}
.ago {
  font-size: 22rpx;
  color: #7a7383;
}
.empty {
  padding: 140rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-emoji {
  font-size: 110rpx;
  animation: float 3s ease-in-out infinite;
}
.empty-text {
  margin-top: 26rpx;
  font-size: 30rpx;
  font-weight: 700;
  color: #1f1d24;
}
.empty-sub {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #7a7383;
}
.load-more {
  text-align: center;
  font-size: 24rpx;
  color: #7a7383;
  padding: 20rpx 0;
}
.debug-line {
  margin-top: 16rpx;
  font-size: 20rpx;
  color: #8a8494;
  word-break: break-all;
}

</style>
