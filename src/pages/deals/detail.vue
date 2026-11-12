<template>
<!-- pages/deals/detail 折扣详情 + 出示使用(给店员看的核销页,实时时钟防截图) -->
<view v-if="deal" class="page">
  <image v-if="deal.cover" class="cover" :src="deal.cover" mode="aspectFill" />
  <view class="card">
    <view class="discount">{{ deal.discount }}</view>
    <view class="title">{{ deal.merchant }} · {{ deal.title }}</view>
    <view :class="['state', live ? 'state-on' : '']">{{ live ? L.until : L.ended }}</view>
    <view v-if="deal.address" class="row" @tap="copy(deal.address)"><text class="k">📍</text><text class="v">{{ deal.address }}</text></view>
    <view v-if="deal.phone" class="row" @tap="call"><text class="k">📞</text><text class="v">{{ deal.phone }}</text></view>
    <view class="row"><text class="k">👥</text><text class="v">{{ L.usedN }}</text></view>
  </view>
  <view v-if="deal.desc" class="card">
    <view class="sub">{{ L.howTo }}</view>
    <view class="desc">{{ deal.desc }}</view>
  </view>
  <view class="tip">{{ L.tip }}</view>

  <view class="bar">
    <view class="bbtn bbtn-sec" @tap="onShare">📣 {{ L.share }}</view>
    <view :class="['bbtn', live ? '' : 'bbtn-off']" @tap="onUse">{{ L.use }}</view>
  </view>

  <!-- 出示给店员 -->
  <view v-if="code" class="mask" @tap="code = null">
    <view class="show" @tap.stop>
      <view class="show-m">{{ deal.merchant }}</view>
      <view class="show-d">{{ deal.discount }}</view>
      <view class="show-code">{{ code.code }}</view>
      <view class="show-clock">{{ clock }}</view>
      <view class="show-u">HelpMate · {{ code.nickname }} · ID {{ code.uid }}</view>
      <view class="show-tip">{{ L.showTip }}</view>
      <view class="show-close" @tap="code = null">{{ L.close }}</view>
    </view>
  </view>

  <k-poster ref="poster" />
</view>
</template>

<script>
import { t, cloudMsg } from '../../utils/i18n.js';
import { callKrstuast, requireLogin } from '@/utils/cloud.js';
const fmtDay = (ms) => { if (!ms) return ''; const d = new Date(ms); return d.getMonth() + 1 + '/' + d.getDate(); };

const pad = (n) => (n < 10 ? '0' + n : '' + n);

export default {
  data() {
    return { id: '', deal: null, live: false, usedToday: 0, code: null, clock: '', L: {} };
  },
  onLoad(q) {
    this.id = (q && q.id) || '';
    uni.setNavigationBarTitle({ title: t('func.deals.name') });
    this.load();
  },
  onUnload() {
    clearInterval(this._t);
  },
  methods: {
    load() {
      callKrstuast({ action: 'getDealDetail', dealId: this.id }).then((r) => {
        const ret = (r && r.result) || {};
        if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
        const d = ret.deal;
        this.deal = d;
        this.live = d.status === 'active';
        this.usedToday = ret.usedToday || 0;
        this.L = {
          until: t('deals.until', { d: fmtDay(d.endAt) }), ended: t('deals.ended'), usedN: t('deals.usedN', { n: d.useCount || 0 }),
          howTo: t('deals.howTo'), tip: t('deals.tip'), share: t('deals.share'), use: t('deals.use'),
          showTip: t('deals.showTip'), close: t('poster.close'),
        };
      });
    },
    onUse() {
      if (!this.live) return uni.showToast({ title: t('deals.ended'), icon: 'none' });
      if (!requireLogin()) return;
      callKrstuast({ action: 'useDeal', dealId: this.id }).then((r) => {
        const ret = (r && r.result) || {};
        if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
        this.code = ret;
        this.deal.useCount = (this.deal.useCount || 0) + 1;
        const tick = () => { const d = new Date(); this.clock = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
        tick();
        clearInterval(this._t);
        this._t = setInterval(tick, 1000);
      });
    },
    onShare() {
      const d = this.deal;
      this.$refs.poster.open({
        refType: 'deal', refId: d._id, title: d.discount, content: d.desc || '', tag: t('func.deals.name'), image: d.cover,
        rows: [{ label: '', value: d.merchant + ' · ' + d.title }].concat(d.address ? [{ label: '📍', value: d.address }] : []).concat([{ label: '', value: t('deals.until', { d: fmtDay(d.endAt) }) }]),
      });
    },
    copy(text) {
      uni.setClipboardData({ data: text });
    },
    call() {
      uni.makePhoneCall({ phoneNumber: this.deal.phone, fail: () => this.copy(this.deal.phone) });
    },
  },
};
</script>

<style scoped>
.page { min-height: 100vh; background: #f6f5f7; padding-bottom: 180rpx; }
.cover { width: 100%; height: 400rpx; display: block; }
.card { margin: 24rpx; padding: 32rpx; border-radius: 28rpx; background: #fff; }
.discount { font-size: 48rpx; font-weight: 800; color: #d63a73; }
.title { margin-top: 10rpx; font-size: 30rpx; font-weight: 700; color: #1f1d24; }
.state { display: inline-block; margin-top: 16rpx; padding: 4rpx 18rpx; border-radius: 10rpx; background: #f3f0f5; color: #9a93a8; font-size: 22rpx; font-weight: 700; }
.state-on { background: #dff6ec; color: #3e8e6b; }
.row { display: flex; gap: 14rpx; margin-top: 18rpx; font-size: 26rpx; color: #3b3642; }
.sub { font-size: 26rpx; font-weight: 700; color: #1f1d24; margin-bottom: 12rpx; }
.desc { font-size: 27rpx; color: #3b3642; line-height: 1.7; white-space: pre-wrap; }
.tip { margin: 0 40rpx; font-size: 22rpx; color: #9a93a3; line-height: 1.6; }
.bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 20rpx; padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.04); }
.bbtn { flex: 2; height: 88rpx; line-height: 88rpx; text-align: center; border-radius: 44rpx; background: #d63a73; color: #fff; font-size: 30rpx; font-weight: 800; }
.bbtn-sec { flex: 1; background: #fff0f5; color: #d63a73; font-size: 26rpx; }
.bbtn-off { opacity: 0.4; }
.mask { position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, 0.65); display: flex; align-items: center; justify-content: center; }
.show { width: 640rpx; padding: 48rpx 36rpx; border-radius: 36rpx; background: linear-gradient(160deg, #fff, #fff3f7); text-align: center; }
.show-m { font-size: 30rpx; font-weight: 700; color: #1f1d24; }
.show-d { margin-top: 8rpx; font-size: 44rpx; font-weight: 800; color: #d63a73; }
.show-code { margin-top: 28rpx; font-size: 64rpx; font-weight: 800; letter-spacing: 6rpx; color: #1f1d24; font-family: monospace; }
.show-clock { margin-top: 8rpx; font-size: 40rpx; font-weight: 700; color: #3e8e6b; font-family: monospace; }
.show-u { margin-top: 18rpx; font-size: 24rpx; color: #6e6878; }
.show-tip { margin-top: 18rpx; font-size: 22rpx; color: #9a93a3; line-height: 1.5; }
.show-close { margin-top: 28rpx; height: 80rpx; line-height: 80rpx; border-radius: 40rpx; background: #f1eff3; font-size: 28rpx; }
</style>
