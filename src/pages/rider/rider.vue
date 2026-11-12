<template>
<!-- pages/rider 接单员:申请 / 状态 / 信用分 / 规则 -->
<view class="page">
  <view class="card head">
    <view class="h-ic">🛵</view>
    <view class="h-main">
      <view class="h-title">{{ L.title }}</view>
      <view :class="['h-st', 'st-' + (rider ? rider.status : 'none')]">{{ statusText }}</view>
    </view>
    <view v-if="rider" class="score"><text class="score-n">{{ rider.score }}</text><text class="score-l">{{ L.score }}</text></view>
  </view>
  <view v-if="rider && rider.note" class="note">{{ rider.note }}</view>

  <view class="card">
    <view class="sec-t">{{ L.rulesTitle }}</view>
    <view v-for="(r, i) in rules" :key="i" class="rule">{{ i + 1 }}. {{ r }}</view>
  </view>

  <view class="card warn">
    <view class="sec-t">⚠️ {{ L.fraudTitle }}</view>
    <view class="rule">{{ L.fraudErrand }}</view>
  </view>

  <view v-if="canApply" class="card">
    <view class="sec-t">{{ L.applyTitle }}</view>
    <input class="ipt" v-model="contact" :placeholder="L.contactPh" maxlength="50" />
    <textarea class="ta" v-model="reason" :placeholder="L.reasonPh" maxlength="200" auto-height />
    <view class="btn" @tap="apply">{{ L.applyBtn }}</view>
    <view class="tip">{{ L.applyTip }}</view>
  </view>
</view>
</template>

<script>
import { callKrstuast, requireLogin } from '@/utils/cloud.js';
import { t, cloudMsg } from '../../utils/i18n.js';

export default {
  data() {
    return { rider: null, contact: '', reason: '', L: {}, rules: [] };
  },
  computed: {
    statusText() {
      return t('rider.st.' + (this.rider ? this.rider.status : 'none'));
    },
    canApply() {
      return !this.rider || ['rejected', 'revoked'].includes(this.rider.status);
    },
  },
  onShow() {
    if (!requireLogin()) return;
    uni.setNavigationBarTitle({ title: t('rider.title') });
    const k = ['title', 'score', 'rulesTitle', 'fraudTitle', 'applyTitle', 'contactPh', 'reasonPh', 'applyBtn', 'applyTip'];
    const L = {};
    k.forEach((x) => (L[x] = t('rider.' + x)));
    L.fraudErrand = t('fraud.errand');
    this.L = L;
    this.rules = [1, 2, 3, 4, 5].map((i) => t('rider.rule' + i));
    this.load();
  },
  methods: {
    load() {
      callKrstuast({ action: 'getRiderStatus' }).then((r) => {
        const ret = (r && r.result) || {};
        if (ret.success) this.rider = ret.rider;
      });
    },
    apply() {
      if (!this.contact.trim()) return uni.showToast({ title: t('rider.contactPh'), icon: 'none' });
      callKrstuast({ action: 'applyRider', contact: this.contact.trim(), reason: this.reason.trim() }).then((r) => {
        const ret = (r && r.result) || {};
        if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
        uni.showToast({ title: t('rider.applied'), icon: 'none' });
        this.load();
      });
    },
  },
};
</script>

<style>
page { background: #f6f5f7; }
</style>
<style scoped>
.page { min-height: 100vh; padding: 24rpx; box-sizing: border-box; }
.card { background: #fff; border-radius: 28rpx; padding: 28rpx; margin-bottom: 24rpx; }
.head { display: flex; align-items: center; gap: 22rpx; }
.h-ic { width: 96rpx; height: 96rpx; line-height: 96rpx; text-align: center; border-radius: 50%; background: #e4efff; font-size: 48rpx; }
.h-main { flex: 1; }
.h-title { font-size: 32rpx; font-weight: 800; }
.h-st { display: inline-block; margin-top: 8rpx; padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 22rpx; font-weight: 700; background: #f1eff3; color: #6e6878; }
.st-approved { background: #e3f6ec; color: #1e7a4c; }
.st-pending { background: #fff4d6; color: #7a5200; }
.st-revoked, .st-rejected { background: #ffe8e8; color: #a32f2f; }
.score { text-align: center; }
.score-n { display: block; font-size: 44rpx; font-weight: 900; color: #1f59a8; }
.score-l { font-size: 22rpx; color: #9a93a3; }
.note { margin: -8rpx 8rpx 24rpx; font-size: 24rpx; color: #a32f2f; }
.sec-t { font-size: 28rpx; font-weight: 800; margin-bottom: 14rpx; }
.rule { font-size: 26rpx; line-height: 1.7; color: #3b3642; }
.warn { background: #fff4e5; }
.ipt { height: 84rpx; padding: 0 24rpx; border-radius: 18rpx; background: #f6f5f7; font-size: 28rpx; margin-bottom: 18rpx; }
.ta { width: 100%; min-height: 160rpx; padding: 20rpx 24rpx; border-radius: 18rpx; background: #f6f5f7; font-size: 28rpx; box-sizing: border-box; }
.btn { margin-top: 24rpx; height: 88rpx; line-height: 88rpx; text-align: center; border-radius: 44rpx; background: #d63a73; color: #fff; font-size: 30rpx; font-weight: 800; }
.tip { margin-top: 14rpx; font-size: 22rpx; color: #9a93a3; text-align: center; }
</style>
