<template>
<!--pages/post/list 帖子广场-->
<view class="page">
  <view class="filter-bar">
    <view :class="`filter-chip ${scopeSchool ? 'chip-on' : ''}`" @tap="toggleScope">
      {{scopeSchool ? L?.scopeSchool : L?.scopeAll}}
    </view>
    <view v-if="loaded" class="filter-count">{{L?.countPrefix}}{{list?.length}}{{L?.countUnit}}</view>
  </view>

  <view v-for="(item, index) in list" :key="item._id" class="card" :data-id="item?._id" @tap="onTapPost" hover-class="card-hover">
    <view class="card-top">
      <view class="badges">
        <view class="badge">{{item?.meta?.icon}} {{item?.meta?.name}}</view>
        <view v-if="item?.rewardLabel" class="badge badge-reward">{{item?.rewardLabel}}</view>
        <view v-if="!scopeSchool &amp;&amp; item?.schoolName" class="badge badge-school">🏫 {{item?.schoolName}}</view>
      </view>
      <text class="ago">{{item?.ago}}</text>
    </view>
    <view class="card-title">{{item?.title}}</view>
    <view class="card-preview">{{item?.preview}}</view>
    <view v-if="item?.commentCount" class="card-foot">
      <text class="comment-count">💬 {{item?.commentCount}}</text>
    </view>
  </view>

  <!-- 加载中（Win11 风格转圈） -->
  <view v-if="!loaded" class="empty">
    <view class="spinner" />
    <view class="loading-text">{{L?.loading}}</view>
  </view>

  <view v-if="loaded &amp;&amp; !list?.length" class="empty">
    <view class="empty-emoji">🐣</view>
    <view class="empty-text">{{L?.emptyTitle}}</view>
    <view class="empty-sub">{{L?.emptySub}}</view>
    <view v-if="scopeSchool" class="empty-btn" @tap="toggleScope">{{L?.emptyBtn}}</view>
  </view>

  <view v-if="list?.length &amp;&amp; !hasMore" class="load-more">{{L?.noMore}}</view>
  <view v-if="list?.length &amp;&amp; hasMore" class="load-more">{{loading ? L?.loading : L?.pullMore}}</view>

  <view class="fab" @tap="onPublish" hover-class="fab-hover">＋</view>

  <view :class="`to-top ${showTop ? 'to-top-show' : ''}`" @tap="onToTop" hover-class="to-top-hover">⬆</view>
</view>
</template>

<script>
import { localCurrency } from '@/utils/school-data.js';
import { definePage } from '@/utils/mp-compat.js';
import __m0_app_state from '@/utils/app-state.js';
import __m1_order_meta from '../../utils/order-meta.js';
import __m2_format from '../../utils/format.js';
import __m3_school_map from '../../utils/school-map.js';
import __m4_i18n from '../../utils/i18n.js';
import cloud, { requireLogin } from '@/utils/cloud.js';
// pages/post/list —— 帖子广场（吐槽/问答/攒局/表白/树洞… 全部内容类功能共用）
const app = __m0_app_state;
const { funcMeta } = __m1_order_meta;
const { timeAgo } = __m2_format;
const { schoolName } = __m3_school_map;
const { t, cloudMsg } = __m4_i18n;

export default definePage({
  data: {
    category: 'rant',
    queryCategory: '',
    func: null,
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
    const category = options.category || 'rant';
    const func = funcMeta(category);
    // 合并查询：互助问答 = qa+help；吐槽避雷 = rant+warning；匿名树洞 = treehole+confession
    const queryCategory =
      category === 'qa' ? 'qa,help'
      : category === 'rant' ? 'rant,warning'
      : category === 'treehole' ? 'treehole,confession'
      : category;
    this.setData({ category, queryCategory, func });
    uni.setNavigationBarTitle({ title: t('nav.postList', { icon: func.icon, name: func.name }) });
  },

  onShow() {
    this.setData({
      L: {
        scopeSchool: t('orderList.scopeSchool'),
        scopeAll: t('orderList.scopeAll'),
        countPrefix: t('postList.countPrefix'),
        countUnit: t('postList.countUnit'),
        loading: t('common.loading'),
        emptyTitle: t('postList.emptyTitle'),
        emptySub: t('postList.emptySub'),
        emptyBtn: t('postList.emptyBtn'),
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
    this.setData({ loading: true });
    // 多分类合并在前端完成（不依赖云函数版本）：并行查询 → 去重 → 时间倒序 → 本地分页
    Promise.all(
      cats.map((c) =>
        cloud.callFunction({
          name: 'krstuast',
          data: { action: 'getPosts', functionId: c, schoolId, skip, limit: 15 },
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
            (r.list || []).forEach((p) => {
              if (!map[p._id]) map[p._id] = p;
            });
          }
        });
        if (cloudError && !Object.keys(map).length) {
          uni.showToast({ title: cloudError, icon: 'none', duration: 3000 });
        }
        const all = Object.keys(map)
          .map((k) => map[k])
          .sort((a, b) => b.createdAt - a.createdAt); // 新发布在前
        const rows = all.slice(0, 15).map((p) => {
          const rewardParts = [];
          if (p.rewardAmount) rewardParts.push(localCurrency() + p.rewardAmount);
          if (p.rewardText) rewardParts.push(p.rewardText);
          return {
            ...p,
            meta: funcMeta(p.functionId),
            ago: timeAgo(p.createdAt),
            preview: (p.content || '').replace(/\n/g, ' · ').slice(0, 60),
            rewardLabel: p.bountyExp && p.bountyState === 'open' ? t('qa.bountyBadge', { n: p.bountyExp }) : rewardParts.length ? '🎁 ' + rewardParts.join(' + ') : '',
            schoolName: schoolName(p.schoolId),
          };
        });
        const list = append ? this.data.list.concat(rows) : rows;
        this.setData({
          list,
          skip: skip + rows.length,
          hasMore: rows.length >= 15,
          loaded: true,
        });
        if (done) done();
      })
      .catch((e) => {
        console.error('posts load', e);
        this.setData({ loading: false, loaded: true });
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
        if (done) done();
      });
  },

  toggleScope() {
    this.setData({ scopeSchool: !this.data.scopeSchool });
    this.reset();
  },

  onTapPost(e) {
    const { id } = e.currentTarget.dataset;
    uni.navigateTo({ url: '/pages/post/detail?id=' + id });
  },

  onPublish() {
    if (!requireLogin()) return;
    uni.navigateTo({ url: '/pages/post/publish?category=' + this.data.category });
  },
});

</script>

<style scoped>
/* pages/post/list 帖子广场 */
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
  justify-content: space-between;
  flex-wrap: wrap;
  row-gap: 10rpx;
}
.badges {
  display: flex;
  align-items: center;
}
.badge {
  font-size: 22rpx;
  color: #d63a73;
  background: #ffeef4;
  border-radius: 999rpx;
  padding: 6rpx 18rpx;
  font-weight: 600;
}
.badge-reward {
  margin-left: 10rpx;
  background: #fff3ce;
  color: #b07f2e;
}
.badge-school {
  margin-left: 10rpx;
  background: #eae4ff;
  color: #7a6bc9;
  max-width: 240rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ago {
  font-size: 22rpx;
  color: #7a7383;
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
.card-preview {
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #6e6878;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.card-foot {
  margin-top: 16rpx;
}
.comment-count {
  font-size: 22rpx;
  color: #7a7383;
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
.load-more {
  text-align: center;
  font-size: 24rpx;
  color: #7a7383;
  padding: 20rpx 0;
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
