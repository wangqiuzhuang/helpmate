<template>
<!-- pages/tools 工具箱:后台「工具箱」维护的实用网站,按分类展示,点开用系统浏览器打开 -->
<view class="page">
  <view class="search-wrap">
    <view class="search">
      <image class="ic18" src="/static/icons/search-1f1d24.png" />
      <input class="search-input" :value="query" :placeholder="L.searchPh" placeholder-class="ph" @input="(e) => (query = e.detail.value)" />
    </view>
  </view>

  <view v-for="g in groups" :key="g.cat" class="group">
    <view class="group-title">{{ g.cat }}</view>
    <view class="list">
      <view v-for="x in g.items" :key="x.id" class="item" hover-class="tap-hover" @tap="open(x)" @longpress="copy(x)">
        <view class="item-ic">{{ x.icon }}</view>
        <view class="item-main">
          <view class="item-name">{{ x.name }}</view>
          <view class="item-desc">{{ x.desc }}</view>
        </view>
        <image class="ic16" src="/static/icons/chevright-9a93a3.png" />
      </view>
    </view>
  </view>

  <view v-if="!loaded" class="empty">{{ L.loading }}</view>
  <view v-else-if="!groups.length" class="empty">{{ L.empty }}</view>
  <view v-else class="hint">{{ L.hint }}</view>

  <view class="bottom-space" />
  <k-tab-bar :selected="3" />
</view>
</template>

<script>
import { t } from '../../utils/i18n.js';
import { callKrstuast } from '@/utils/cloud.js';
import appState from '@/utils/app-state.js';

const CACHE = 'kr_tools_cache';

export default {
  data() {
    return { list: [], query: '', loaded: false, L: {} };
  },
  computed: {
    groups() {
      const q = this.query.trim().toLowerCase();
      const map = {};
      const order = [];
      this.list
        .filter((x) => !q || (x.name + ' ' + x.desc + ' ' + x.cat + ' ' + x.url).toLowerCase().indexOf(q) >= 0)
        .forEach((x) => {
          const c = x.cat || this.L.other;
          if (!map[c]) { map[c] = []; order.push(c); }
          map[c].push(x);
        });
      return order.map((cat) => ({ cat, items: map[cat] }));
    },
  },
  onLoad() {
    this.L = { searchPh: t('tools.searchPh'), loading: t('common.loading'), empty: t('tools.empty'), hint: t('tools.hint'), other: t('tools.other'), copied: t('tools.copied') };
    // 先用缓存秒开,再拉最新
    const c = uni.getStorageSync(CACHE);
    if (Array.isArray(c) && c.length) { this.list = c; this.loaded = true; }
  },
  onShow() {
    uni.setNavigationBarTitle({ title: t('tab.tools') });
    uni.hideTabBar({ animation: false, fail: () => {} });
    this.load();
  },
  onPullDownRefresh() {
    this.load().finally(() => uni.stopPullDownRefresh());
  },
  methods: {
    load() {
      return callKrstuast({ action: 'getAppConfig', withTools: true, country: appState.getCountry(), lang: appState.readLang() })
        .then((r) => {
          const ret = (r && r.result) || {};
          if (Array.isArray(ret.tools)) {
            this.list = ret.tools;
            uni.setStorageSync(CACHE, ret.tools);
          }
        })
        .catch(() => {})
        .finally(() => (this.loaded = true));
    },
    open(x) {
      // #ifdef APP-PLUS
      plus.runtime.openURL(x.url);
      // #endif
      // #ifdef H5
      window.open(x.url, '_blank');
      // #endif
      // #ifdef MP
      this.copy(x);
      // #endif
    },
    copy(x) {
      uni.setClipboardData({ data: x.url, success: () => uni.showToast({ title: this.L.copied, icon: 'none' }) });
    },
  },
};
</script>

<style scoped>
.page { min-height: 100vh; background: #f6f5f7; color: #1f1d24; padding-top: 12rpx; }
.search-wrap { padding: 12rpx 24rpx 8rpx; }
.search { display: flex; align-items: center; gap: 14rpx; height: 80rpx; padding: 0 28rpx; border-radius: 40rpx; background: #fff; }
.ic18 { width: 36rpx; height: 36rpx; }
.ic16 { width: 32rpx; height: 32rpx; flex-shrink: 0; }
.search-input { flex: 1; font-size: 28rpx; }
.ph { color: #b5aebd; }
.group { margin: 24rpx 24rpx 0; }
.group-title { margin: 0 8rpx 14rpx; font-size: 26rpx; font-weight: 700; color: #6e6878; }
.list { background: #fff; border-radius: 28rpx; overflow: hidden; }
.item { display: flex; align-items: center; gap: 22rpx; padding: 26rpx 28rpx; border-bottom: 2rpx solid #f0edf2; }
.item:last-child { border-bottom: none; }
.tap-hover { background: #faf9fb; }
.item-ic { width: 76rpx; height: 76rpx; line-height: 76rpx; text-align: center; border-radius: 22rpx; background: #fff0f5; font-size: 40rpx; flex-shrink: 0; }
.item-main { flex: 1; min-width: 0; }
.item-name { font-size: 30rpx; font-weight: 600; }
.item-desc { margin-top: 4rpx; font-size: 24rpx; color: #9a93a3; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.empty { padding: 120rpx 40rpx; text-align: center; color: #9a93a3; font-size: 26rpx; }
.hint { padding: 28rpx 40rpx 0; text-align: center; color: #b5aebd; font-size: 22rpx; }
.bottom-space { height: calc(200rpx + env(safe-area-inset-bottom)); }
</style>
