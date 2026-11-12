<template>
<!-- pages/features 全部功能:按场景分组;mode=publish 时用作「选择发布类型」 -->
<view class="page">
  <view class="search-wrap">
    <view class="search">
      <image class="ic18" src="/static/icons/search-1f1d24.png" />
      <input class="search-input" :value="query" :focus="autoFocus" :placeholder="L.searchPh" placeholder-class="ph" confirm-type="search" @input="onInput" />
    </view>
  </view>

  <view class="body">
    <view v-if="mode === 'publish'" class="tip">{{ L.publishTip }}</view>
    <view v-for="g in groups" :key="g.key" class="group">
      <view class="group-title">{{ g.title }}</view>
      <view class="grid">
        <view v-for="f in g.items" :key="f.id" class="cell" hover-class="tap-hover" @tap="onTap(f.id)">
          <view class="cell-icon" :style="{ background: f.bg }"><image class="ic24" :src="f.icon" /></view>
          <text class="cell-name">{{ f.name }}</text>
        </view>
      </view>
    </view>
    <view v-if="!groups.length" class="empty">{{ L.empty }}</view>
  </view>
</view>
</template>

<script>
import { t } from '../../utils/i18n.js';
import { requireLogin } from '@/utils/cloud.js';
import { funcMeta } from '../../utils/order-meta.js';
import { GROUPS, catStyle, listUrl, publishUrl, VIEW_ONLY_IDS } from '../../data/ui-categories.js';

export default {
  data() {
    return { mode: 'browse', query: '', autoFocus: false, groups: [], L: {} };
  },
  onLoad(q) {
    this.mode = q && q.mode === 'publish' ? 'publish' : 'browse';
    this.autoFocus = !!(q && q.focus);
    uni.setNavigationBarTitle({ title: t(this.mode === 'publish' ? 'features.publishTitle' : 'features.title') });
    this.L = { searchPh: t('features.searchPh'), empty: t('features.empty'), publishTip: t('features.publishTip') };
    this.build();
  },
  methods: {
    build() {
      const q = this.query.trim().toLowerCase();
      this.groups = GROUPS.map((g) => ({
        key: g.key,
        title: t('features.group.' + g.key),
        items: g.ids
          .filter((id) => this.mode !== 'publish' || VIEW_ONLY_IDS.indexOf(id) < 0)
          .map((id) => ({ id, name: funcMeta(id).name, ...catStyle(id) }))
          .filter((f) => !q || f.name.toLowerCase().indexOf(q) >= 0 || f.id.indexOf(q) >= 0),
      })).filter((g) => g.items.length);
    },
    onInput(e) {
      this.query = e.detail.value;
      this.build();
    },
    onTap(id) {
      if (this.mode === 'publish' && !requireLogin()) return;
      uni.navigateTo({ url: this.mode === 'publish' ? publishUrl(id) : listUrl(id) });
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
.ic18 { width: 36rpx; height: 36rpx; opacity: 0.6; }
.ic24 { width: 48rpx; height: 48rpx; }
.tap-hover { opacity: 0.6; }
.search-wrap { padding: 16rpx 32rpx 28rpx; background: #ffffff; }
.search {
  display: flex; align-items: center; gap: 16rpx;
  height: 84rpx; padding: 0 28rpx; border-radius: 24rpx; background: #f3f1f5;
}
.search-input { flex: 1; min-width: 0; font-size: 28rpx; color: #1f1d24; }
.ph { color: #8a8494; }
.body { padding: 24rpx 24rpx 60rpx; display: flex; flex-direction: column; gap: 24rpx; }
.tip { font-size: 26rpx; color: #6e6878; padding: 0 8rpx; }
.group { background: #ffffff; border-radius: 32rpx; padding: 32rpx 16rpx 16rpx; }
.group-title { margin: 0 16rpx 24rpx; font-size: 30rpx; font-weight: 700; }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); row-gap: 16rpx; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 12rpx; padding: 12rpx 0 16rpx; }
.cell-icon { width: 96rpx; height: 96rpx; border-radius: 32rpx; display: flex; align-items: center; justify-content: center; }
.cell-name { font-size: 24rpx; color: #3b3642; text-align: center; }
.empty { padding: 80rpx 0; text-align: center; font-size: 28rpx; color: #6e6878; }
</style>
