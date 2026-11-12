<template>
<!-- k-a2hs:H5 网页版引导「添加到主屏幕」(App 内不显示;已从主屏幕打开不显示) -->
<view v-if="show" :class="['a2', env === 'ios' ? 'a2-ios' : '']">
  <view class="a2-card">
    <image class="a2-logo" src="/static/apple-touch-icon.png" />
    <view class="a2-main">
      <view class="a2-title">{{ L.title }}</view>
      <view class="a2-text">{{ tip }}</view>
    </view>
    <view class="a2-x" @tap="close(false)">✕</view>
  </view>
  <view class="a2-btns">
    <view class="a2-never" @tap="close(true)">{{ L.never }}</view>
    <view v-if="canPrompt" class="a2-go" @tap="install">{{ L.install }}</view>
  </view>
</view>
</template>

<script>
import { t } from '../../utils/i18n.js';

const KEY = 'kr_a2hs_never';
let deferred = null;
// #ifdef H5
try {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    uni.$emit('kr:a2hs-ready');
  });
} catch (e) {}
// #endif

export default {
  data() {
    return { show: false, env: '', canPrompt: false };
  },
  computed: {
    L() {
      return { title: t('a2hs.title'), never: t('a2hs.never'), install: t('a2hs.install') };
    },
    tip() {
      return t('a2hs.' + (this.env || 'other'));
    },
  },
  mounted() {
    // #ifdef H5
    try {
      const nav = window.navigator;
      const standalone = nav.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
      if (standalone || uni.getStorageSync(KEY) || sessionStorage.getItem(KEY)) return;
      const ua = nav.userAgent || '';
      this.env = /MicroMessenger/i.test(ua) ? 'wechat' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' : 'other';
      this.canPrompt = !!deferred;
      uni.$on('kr:a2hs-ready', () => (this.canPrompt = true));
      setTimeout(() => (this.show = true), 1500);
    } catch (e) {}
    // #endif
  },
  methods: {
    close(never) {
      this.show = false;
      try {
        if (never) uni.setStorageSync(KEY, 1);
        else sessionStorage.setItem(KEY, '1');
      } catch (e) {}
    },
    install() {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(() => {
        deferred = null;
        this.close(true);
      });
    },
  },
};
</script>

<style scoped>
.a2 { position: fixed; left: calc(var(--k-side, 0px) + 24rpx); right: calc(var(--k-side, 0px) + 24rpx); bottom: calc(160rpx + env(safe-area-inset-bottom)); z-index: 998; padding: 24rpx; border-radius: 28rpx; background: #ffffff; box-shadow: 0 16rpx 48rpx rgba(31, 29, 36, 0.18); }
.a2-card { display: flex; align-items: center; gap: 20rpx; }
.a2-logo { flex: 0 0 88rpx; width: 88rpx; height: 88rpx; border-radius: 20rpx; }
.a2-main { flex: 1; min-width: 0; }
.a2-title { font-size: 28rpx; font-weight: 800; color: #1f1d24; }
.a2-text { margin-top: 6rpx; font-size: 24rpx; line-height: 1.5; color: #6e6878; }
.a2-x { align-self: flex-start; padding: 0 6rpx; font-size: 28rpx; color: #b3adbb; }
.a2-btns { display: flex; justify-content: flex-end; align-items: center; gap: 24rpx; margin-top: 16rpx; }
.a2-never { font-size: 24rpx; color: #9a93a3; }
.a2-go { height: 60rpx; line-height: 60rpx; padding: 0 28rpx; border-radius: 30rpx; background: #d63a73; color: #fff; font-size: 26rpx; font-weight: 700; }
.a2-arrow { position: absolute; left: 50%; bottom: -56rpx; transform: translateX(-50%); font-size: 40rpx; color: #d63a73; animation: a2b 1.2s ease-in-out infinite; }
@keyframes a2b { 0%, 100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, 10rpx); } }
</style>
