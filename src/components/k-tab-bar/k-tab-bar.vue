<template>
<!--k-tab-bar 底部导航(各 tab 页底部引入,原生 tabBar 隐藏)-->
<view class="bar">
  <view v-for="(item, index) in list" :key="item.pagePath" :class="['tab', selected === index ? 'tab-on' : '']" :data-path="item.pagePath" @tap="switchTab">
    <view class="ic-wrap">
      <image class="tab-icon" :src="selected === index ? item.iconOn : item.icon" />
      <text v-if="badgeNum(item.key) > 0" class="tb-num">{{ badgeNum(item.key) > 99 ? '99+' : badgeNum(item.key) }}</text>
      <view v-else-if="badgeDot(item.key)" class="tb-dot" />
    </view>
    <text class="tab-text">{{ item.text }}</text>
  </view>
</view>
</template>

<script>
import { t } from '../../utils/i18n.js';
import { refreshBadges, getBadgeState } from '../../utils/badges.js';

const TAB_META = [
  { pagePath: '/pages/home/home', key: 'home', icon: 'home' },
  { pagePath: '/pages/explore/explore', key: 'explore', icon: 'compass' },
  { pagePath: '/pages/notice/notice', key: 'notice', icon: 'comment' },
  { pagePath: '/pages/tools/tools', key: 'tools', icon: 'tools' },
  { pagePath: '/pages/mine/mine', key: 'mine', icon: 'user' },
];

export default {
  props: {
    selected: { type: Number, default: 0 },
  },
  computed: {
    list() {
      return TAB_META.map((m) => ({
        key: m.key,
        pagePath: m.pagePath,
        text: t('tab.' + m.key),
        icon: `/static/icons/${m.icon}-6e6878.png`,
        iconOn: `/static/icons/${m.icon}-on-c22f66.png`,
      }));
    },
  },
  data() {
    return { bs: getBadgeState() };
  },
  unmounted() {
    uni.$off('kr:badges', this._onBadges);
  },
  mounted() {
    this._onBadges = (s) => (this.bs = s);
    uni.$on('kr:badges', this._onBadges);
    refreshBadges();
    // 原生 tabBar 隐藏(App.vue 启动时也会调用;H5 等端此时原生 tabBar 才渲染完成)
    uni.hideTabBar({ animation: false, fail: () => {} });
  },
  methods: {
    badgeNum(k) {
      if (k === 'notice') return (this.bs.messages || 0) + (this.bs.notifications || 0);
      if (k === 'explore') return this.bs.newMoments || 0;
      if (k === 'mine') return this.bs.friendRequests || 0;
      return 0;
    },
    badgeDot(k) {
      return (k === 'explore' && this.bs.newMoments > 0) || (k === 'mine' && this.bs.friendRequests > 0);
    },
    switchTab(e) {
      const { path } = e.currentTarget.dataset;
      if (path === TAB_META[this.selected].pagePath) return;
      uni.switchTab({ url: path });
    },
  },
};
</script>

<style scoped>
.bar {
  position: fixed;
  left: var(--k-side, 0px);
  right: var(--k-side, 0px);
  bottom: 0;
  display: flex;
  height: calc(132rpx + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: #ffffff;
  border-top: 2rpx solid #edeaf0;
  z-index: 999;
  box-sizing: border-box;
}
.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
}
.tab-icon {
  width: 48rpx;
  height: 48rpx;
}
.tab-text {
  font-size: 22rpx;
  color: #6e6878;
}
.tab-on .tab-text {
  color: #c22f66;
  font-weight: 700;
}
.ic-wrap { position: relative; }
.tb-num { position: absolute; top: -10rpx; left: 30rpx; min-width: 32rpx; height: 32rpx; line-height: 32rpx; padding: 0 8rpx; border-radius: 16rpx; background: #e5484d; color: #fff; font-size: 20rpx; text-align: center; box-sizing: border-box; }
.tb-dot { position: absolute; top: -4rpx; right: -8rpx; width: 16rpx; height: 16rpx; border-radius: 50%; background: #e5484d; }
</style>
