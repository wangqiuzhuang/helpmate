<template>
<!-- pages/explore 动态(朋友圈):全部公开动态 / 好友动态 / 生活指南(韩国) -->
<view class="page">
  <view class="tabs">
    <view v-for="tb in tabs" :key="tb.key" :class="['tab', tab === tb.key ? 'tab-on' : '']" @tap="switchTab(tb.key)">{{ tb.label }}<text v-if="tb.key === 'all' &amp;&amp; newCount > 0" class="tab-num">{{ newCount > 99 ? '99+' : newCount }}</text></view>
  </view>

  <view v-if="tab !== 'guide'" class="list-wrap">
    <view v-if="items.length" class="feed">
      <k-moment v-for="m in items" :key="m._id" :item="m" @removed="onRemoved" @poster="openPoster" />
    </view>
    <view v-if="!loaded" class="empty">{{ L.loading }}</view>
    <view v-else-if="!items.length" class="empty">
      <view>{{ tab === 'friends' ? L.friendsEmpty : L.allEmpty }}</view>
      <view class="empty-link" @tap="goPublish">{{ L.postFirst }}</view>
    </view>
    <view v-else-if="!hasMore" class="more-tip">{{ L.noMore }}</view>
  </view>

  <view v-if="tab !== 'guide'" class="fab" hover-class="tap-hover" @tap="goPublish"><image class="fab-ic" src="/static/icons/plus-ffffff.png" /></view>
  <k-poster ref="poster" />
  <view class="bottom-space" />
  <k-tab-bar :selected="1" />
</view>
</template>

<script>
import appState from '@/utils/app-state.js';
import { callKrstuast, isGuest, requireLogin } from '@/utils/cloud.js';
import { t, cloudMsg } from '../../utils/i18n.js';
import { localizedTools } from '../../data/korea-tools.js';
import { refreshBadges, markMomentsSeen } from '../../utils/badges.js';

// 生活指南内容的核对日期(更新内容后同步修改)
const GUIDE_UPDATED = '2026-09';
const PAGE = 10;

export default {
  data() {
    return { tab: 'all', tabs: [], items: [], loaded: false, hasMore: true, loading: false, dirty: true, tools: [], openId: '', newCount: 0, L: {} };
  },
  onLoad() {
    uni.$on('moment:created', this.onCreated);
  },
  onUnload() {
    uni.$off('moment:created', this.onCreated);
  },
  onShow() {
    uni.setNavigationBarTitle({ title: t('nav.explore') });
    this.tabs = [
      { key: 'all', label: t('moment.tabAll') },
      { key: 'friends', label: t('moment.tabFriends') },
    ];
    this.L = {
      loading: t('common.loading'),
      allEmpty: t('moment.allEmpty'),
      friendsEmpty: t('moment.friendsEmpty'),
      postFirst: t('moment.postFirst'),
      noMore: t('moment.noMore'),
      guideNote: t('explore.guideNote', { date: GUIDE_UPDATED }),
      call: t('explore.call'),
      newTip: t('moment.newTip'),
    };
    this.tools = localizedTools();
    this.cacheMe();
    if (this.tab !== 'guide' && (this.dirty || !this.items.length)) this.reload();
    else refreshBadges(true).then((s) => (this.newCount = s.newMoments || 0));
    if (!this._onBadges) {
      this._onBadges = (s) => (this.newCount = s.newMoments || 0);
      uni.$on('kr:badges', this._onBadges);
    }
  },
  onPullDownRefresh() {
    if (this.tab === 'guide') return uni.stopPullDownRefresh();
    this.reload(() => uni.stopPullDownRefresh());
  },
  onReachBottom() {
    if (this.tab !== 'guide' && this.hasMore && !this.loading) this.load(false);
  },
  methods: {
    // 点赞/评论时本地立即显示自己的昵称头像
    cacheMe() {
      if (isGuest()) return;
      callKrstuast({ action: 'getMyProfile' })
        .then((r) => {
          const u = ((r && r.result) || {}).user;
          if (u) uni.setStorageSync('krstuast_me_brief', { uid: u.uid, nickname: u.nickname, avatarUrl: u.avatarUrl });
        })
        .catch(() => {});
    },
    switchTab(k) {
      if (k === this.tab) return;
      if (k === 'friends' && !requireLogin()) return;
      this.tab = k;
      if (k !== 'guide') this.reload();
    },
    reload(done) {
      this.items = [];
      this.hasMore = true;
      this.loaded = false;
      this.dirty = false;
      this.load(true, done);
    },
    load(reset, done) {
      const tab = this.tab;
      if (tab === 'friends' && isGuest()) {
        this.loaded = true;
        return done && done();
      }
      this.loading = true;
      callKrstuast({ action: 'getMoments', scope: tab, country: appState.getCountry(), skip: reset ? 0 : this.items.length, limit: PAGE })
        .then((res) => {
          if (tab !== this.tab) return;
          const r = (res && res.result) || {};
          if (!r.success) {
            if (r.code !== 'NO_AUTH') uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
            return;
          }
          const seen = new Set(this.items.map((x) => x._id));
          this.items = (reset ? [] : this.items).concat((r.list || []).filter((x) => reset || !seen.has(x._id)));
          this.hasMore = !!r.hasMore;
          if (reset) {
            this.newCount = 0;
            markMomentsSeen();
          }
        })
        .catch(() => uni.showToast({ title: t('common.networkError'), icon: 'none' }))
        .finally(() => {
          this.loading = false;
          this.loaded = true;
          done && done();
        });
    },
    onCreated() {
      this.dirty = true;
    },
    openPoster(o) {
      this.$refs.poster && this.$refs.poster.open(o);
    },
    onRemoved(id) {
      this.items = this.items.filter((x) => x._id !== id);
    },
    goPublish() {
      if (!requireLogin()) return;
      uni.navigateTo({ url: '/pages/moment/publish' });
    },
    toggle(id) {
      this.openId = this.openId === id ? '' : id;
    },
    call(tel) {
      uni.makePhoneCall({ phoneNumber: tel, fail: () => {} });
    },
  },
};
</script>

<style>
page {
  background: #f6f5f7;
}
</style>

<style scoped>
.page { min-height: 100vh; background: #f6f5f7; color: #1f1d24; }
.ic18 { width: 36rpx; height: 36rpx; transition: transform 0.2s; }
.rot { transform: rotate(90deg); }
.tap-hover { opacity: 0.6; }
.tabs { position: sticky; top: 0; z-index: 10; display: flex; gap: 8rpx; margin: 0; padding: 20rpx 24rpx; background: #f6f5f7; }
.tab { flex: 1; height: 72rpx; line-height: 72rpx; text-align: center; border-radius: 36rpx; background: #ffffff; font-size: 28rpx; color: #3b3642; }
.tab-on { background: #1f1d24; color: #ffffff; font-weight: 700; }
.empty { padding: 80rpx 32rpx; text-align: center; font-size: 28rpx; color: #6e6878; }
.empty-link { margin-top: 20rpx; color: #c22f66; }
.guide { padding: 0 24rpx; display: flex; flex-direction: column; gap: 20rpx; }
.note { font-size: 24rpx; color: #6e6878; line-height: 1.6; padding: 0 8rpx; }
.g-card { background: #ffffff; border-radius: 28rpx; overflow: hidden; }
.g-head { display: flex; align-items: center; gap: 20rpx; min-height: 104rpx; padding: 0 28rpx; }
.g-icon { font-size: 40rpx; }
.g-name { flex: 1; font-size: 30rpx; font-weight: 500; }
.g-body { padding: 0 28rpx 24rpx; border-top: 2rpx solid #f0edf2; }
.g-tip { margin-top: 20rpx; padding: 20rpx; border-radius: 16rpx; background: #f6f5f7; font-size: 24rpx; color: #625c6b; line-height: 1.6; }
.g-item { display: flex; align-items: center; gap: 20rpx; padding: 20rpx 0; border-bottom: 2rpx solid #f6f5f7; }
.g-item:last-child { border-bottom: 0; }
.g-item-main { flex: 1; min-width: 0; }
.g-label { font-size: 28rpx; color: #1f1d24; }
.g-value { margin-top: 4rpx; font-size: 26rpx; color: #625c6b; line-height: 1.5; }
.g-call { flex: 0 0 auto; height: 60rpx; line-height: 60rpx; padding: 0 24rpx; border-radius: 30rpx; background: #ffeef4; color: #c22f66; font-size: 24rpx; font-weight: 700; }
.fab { position: fixed; right: calc(var(--k-side, 0px) + 36rpx); bottom: calc(172rpx + env(safe-area-inset-bottom)); z-index: 50; width: 104rpx; height: 104rpx; border-radius: 52rpx; background: #d63a73; box-shadow: 0 12rpx 28rpx rgba(214, 58, 115, 0.35); display: flex; align-items: center; justify-content: center; }
.fab-ic { width: 48rpx; height: 48rpx; }
.feed { background: #ffffff; }
.more-tip { padding: 28rpx; text-align: center; font-size: 24rpx; color: #9a93a3; }
.bottom-space { height: calc(200rpx + env(safe-area-inset-bottom)); }
.new-tip { margin: 0 24rpx 16rpx; padding: 18rpx; text-align: center; border-radius: 999rpx; background: #fff0f5; color: #d63a73; font-size: 26rpx; font-weight: 700; }
.ref-btn { position: relative; flex: 0 0 72rpx; height: 72rpx; border-radius: 36rpx; background: #ffffff; display: flex; align-items: center; justify-content: center; }
.ref-on { background: #fff0f5; }
.ref-ic { font-size: 36rpx; color: #6e6878; }
.ref-on .ref-ic { color: #d63a73; }
.ref-num { position: absolute; top: -8rpx; right: -8rpx; min-width: 34rpx; height: 34rpx; line-height: 34rpx; padding: 0 8rpx; border-radius: 17rpx; background: #e5484d; color: #fff; font-size: 20rpx; font-weight: 700; text-align: center; box-sizing: border-box; }
.tab { position: relative; }
.tab-num { position: absolute; top: -8rpx; right: 16rpx; min-width: 34rpx; height: 34rpx; line-height: 34rpx; padding: 0 8rpx; border-radius: 17rpx; background: #e5484d; color: #fff; font-size: 20rpx; font-weight: 700; text-align: center; box-sizing: border-box; }
</style>
