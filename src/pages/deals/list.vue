<template>
<!-- pages/deals/list 专属折扣:后台发布的合作商家优惠 + 推荐商家 + 分享推广 -->
<view class="page">
  <view class="hero">
    <view class="hero-t">🎁 {{ L.heroTitle }}</view>
    <view class="hero-s">{{ L.heroSub }}</view>
    <view class="hero-btns">
      <view class="hero-btn" hover-class="tap-hover" @tap="onShare">📣 {{ L.share }}</view>
      <view class="hero-btn hero-btn2" hover-class="tap-hover" @tap="openSuggest">🏪 {{ L.suggest }}</view>
    </view>
  </view>

  <view v-for="d in list" :key="d._id" class="deal" hover-class="tap-hover" @tap="openDeal(d)">
    <image v-if="d.cover" class="cover" :src="d.cover" mode="aspectFill" />
    <view v-else class="cover cover-tile"><text>{{ d.merchant }}</text></view>
    <view class="deal-main">
      <view class="deal-discount">{{ d.discount }}</view>
      <view class="deal-title">{{ d.merchant }} · {{ d.title }}</view>
      <view class="deal-meta">{{ d.endText }}<text v-if="d.useCount"> · {{ d.usedText }}</text></view>
    </view>
  </view>

  <view v-if="loaded && !list.length" class="empty">
    <view class="empty-t">{{ L.emptyTitle }}</view>
    <view class="empty-s">{{ L.emptySub }}</view>
  </view>
  <view v-if="!loaded" class="empty"><view class="empty-s">{{ L.loading }}</view></view>

  <!-- 推荐商家 -->
  <view v-if="sg.show" class="mask" @tap="sg.show = false">
    <view class="sheet" @tap.stop>
      <view class="sheet-t">{{ L.suggestTitle }}</view>
      <view class="sheet-s">{{ L.suggestSub }}</view>
      <input class="ipt" :placeholder="L.sgName" placeholder-class="ph" maxlength="200" :value="sg.name" @input="(e) => (sg.name = e.detail.value)" />
      <input class="ipt" :placeholder="L.sgAddr" placeholder-class="ph" maxlength="60" :value="sg.address" @input="(e) => (sg.address = e.detail.value)" />
      <textarea class="ipt ta" :placeholder="L.sgNote" placeholder-class="ph" maxlength="200" :value="sg.note" @input="(e) => (sg.note = e.detail.value)" />
      <view class="sheet-btns">
        <view class="sbtn" @tap="sg.show = false">{{ L.cancel }}</view>
        <view class="sbtn sbtn-pri" @tap="submitSuggest">{{ L.submit }}</view>
      </view>
    </view>
  </view>

  <k-poster ref="poster" />
</view>
</template>

<script>
import { t, cloudMsg } from '../../utils/i18n.js';
import { callKrstuast, requireLogin } from '@/utils/cloud.js';
import appState from '@/utils/app-state.js';

const fmtDay = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  return d.getMonth() + 1 + '/' + d.getDate();
};

export default {
  data() {
    return { list: [], loaded: false, L: {}, sg: { show: false, name: '', address: '', note: '' } };
  },
  onLoad() {
    uni.setNavigationBarTitle({ title: t('func.deals.name') });
    this.L = {
      heroTitle: t('deals.heroTitle'), heroSub: t('deals.heroSub'), share: t('deals.share'), suggest: t('deals.suggest'),
      emptyTitle: t('deals.emptyTitle'), emptySub: t('deals.emptySub'), loading: t('common.loading'),
      suggestTitle: t('deals.suggestTitle'), suggestSub: t('deals.suggestSub'), sgName: t('deals.sgName'), sgAddr: t('deals.sgAddr'), sgNote: t('deals.sgNote'),
      cancel: t('common.cancel'), submit: t('deals.submit'),
    };
  },
  onShow() {
    this.load();
  },
  onPullDownRefresh() {
    this.load().finally(() => uni.stopPullDownRefresh());
  },
  methods: {
    load() {
      const school = appState.readSchool() || {};
      return callKrstuast({ action: 'getDeals', schoolId: school.id || '' })
        .then((r) => {
          const ret = (r && r.result) || {};
          this.list = (ret.list || []).map((d) => ({ ...d, endText: t('deals.until', { d: fmtDay(d.endAt) }), usedText: t('deals.usedN', { n: d.useCount }) }));
        })
        .catch(() => uni.showToast({ title: t('common.networkError'), icon: 'none' }))
        .finally(() => (this.loaded = true));
    },
    openDeal(d) {
      uni.navigateTo({ url: '/pages/deals/detail?id=' + d._id });
    },
    onShare() {
      const first = this.list[0];
      this.$refs.poster.open({
        refType: 'deals', refId: 'list', title: t('deals.posterTitle'),
        content: first ? this.list.slice(0, 4).map((d) => d.merchant + ' ' + d.discount).join(' / ') : t('deals.heroSub'),
        tag: t('func.deals.name'),
        rows: this.list.slice(0, 5).map((d) => ({ label: d.merchant, value: d.discount })),
      });
    },
    openSuggest() {
      if (!requireLogin()) return;
      this.sg.show = true;
    },
    submitSuggest() {
      const s = this.sg;
      if (!s.name.trim()) return uni.showToast({ title: t('deals.sgName'), icon: 'none' });
      const school = appState.readSchool() || {};
      callKrstuast({ action: 'suggestMerchant', name: s.name, address: s.address, note: s.note, schoolId: school.id || '' }).then((r) => {
        const ret = (r && r.result) || {};
        if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
        Object.assign(this.sg, { show: false, name: '', address: '', note: '' });
        uni.showToast({ title: t('deals.thanks'), icon: 'none' });
      });
    },
  },
};
</script>

<style scoped>
.page { min-height: 100vh; background: #f6f5f7; padding: 24rpx 24rpx 60rpx; box-sizing: border-box; }
.hero { padding: 36rpx 32rpx; border-radius: 32rpx; background: linear-gradient(135deg, #d63a73, #f08a5d); color: #fff; margin-bottom: 24rpx; }
.hero-t { font-size: 40rpx; font-weight: 800; }
.hero-s { margin-top: 10rpx; font-size: 25rpx; opacity: 0.92; line-height: 1.5; }
.hero-btns { display: flex; gap: 20rpx; margin-top: 26rpx; }
.hero-btn { flex: 1; height: 76rpx; line-height: 76rpx; text-align: center; border-radius: 38rpx; background: #fff; color: #d63a73; font-size: 26rpx; font-weight: 700; }
.hero-btn2 { background: rgba(255, 255, 255, 0.2); color: #fff; }
.tap-hover { opacity: 0.85; }
.deal { display: flex; gap: 24rpx; padding: 24rpx; margin-bottom: 20rpx; border-radius: 28rpx; background: #fff; }
.cover { flex: 0 0 180rpx; width: 180rpx; height: 180rpx; border-radius: 22rpx; background: #fff0f5; }
.cover-tile { display: flex; align-items: center; justify-content: center; padding: 12rpx; box-sizing: border-box; color: #d63a73; font-weight: 800; font-size: 28rpx; text-align: center; }
.deal-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10rpx; justify-content: center; }
.deal-discount { font-size: 36rpx; font-weight: 800; color: #d63a73; }
.deal-title { font-size: 28rpx; color: #1f1d24; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.deal-meta { font-size: 23rpx; color: #9a93a3; }
.empty { padding: 80rpx 40rpx; text-align: center; }
.empty-t { font-size: 30rpx; font-weight: 700; color: #3b3642; }
.empty-s { margin-top: 12rpx; font-size: 25rpx; color: #9a93a3; line-height: 1.6; }
.mask { position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, 0.5); display: flex; align-items: flex-end; }
.sheet { width: 100%; background: #fff; border-radius: 32rpx 32rpx 0 0; padding: 36rpx 32rpx calc(36rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.sheet-t { font-size: 32rpx; font-weight: 800; color: #1f1d24; }
.sheet-s { margin: 8rpx 0 20rpx; font-size: 24rpx; color: #9a93a3; }
.ipt { width: 100%; box-sizing: border-box; margin-top: 16rpx; padding: 20rpx 24rpx; border-radius: 18rpx; background: #f6f5f7; font-size: 28rpx; min-height: 84rpx; }
.ta { height: 180rpx; }
.ph { color: #b5aebd; }
.sheet-btns { display: flex; gap: 20rpx; margin-top: 28rpx; }
.sbtn { flex: 1; height: 84rpx; line-height: 84rpx; text-align: center; border-radius: 42rpx; background: #f1eff3; font-size: 28rpx; }
.sbtn-pri { background: #d63a73; color: #fff; font-weight: 700; }
</style>
