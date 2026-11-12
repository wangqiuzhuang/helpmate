<template>
<!--pages/mine/feedback 意见反馈-->
<view class="page">
  <view class="form-card">
    <view class="field">
      <view class="field-label">{{L?.label}} <text class="req">*</text> <text class="count-tip">{{content?.length}}/500</text></view>
      <textarea class="field-textarea" :placeholder="L?.ph" placeholder-class="ph" maxlength="500" :value="content" data-field="content" @input="onInput" auto-height />
    </view>

    <view class="field">
      <view class="field-label">{{L?.shots}}</view>
      <view class="img-row">
        <view v-for="(item, index) in images" :key="item" class="img-box">
          <image class="img" :src="item" mode="aspectFill" />
          <view class="img-del" :data-index="index" @tap.stop="onRemoveImage">✕</view>
        </view>
        <view v-if="images?.length < 3" class="img-add" @tap="onChooseImages">＋</view>
      </view>
    </view>
  </view>

  <button class="submit-btn" @tap="onSubmit" :disabled="submitting">
    {{submitting ? L?.submitting : L?.submit}}
  </button>
  <view class="safe-bottom" />
</view>
  <privacy-popup :visible="privacyVisible" @agree="onPrivacyAgree" @reject="onPrivacyReject" />
</template>

<script>
import { definePage } from '@/utils/mp-compat.js';
import appState from '@/utils/app-state.js';
import __m0_i18n from '../../utils/i18n.js';
import cloud from '@/utils/cloud.js';
import { chooseMedia } from '@/utils/platform.js';
// pages/mine/feedback —— 意见反馈
const { t, cloudMsg } = __m0_i18n;

export default definePage({
  data: {
    content: '',
    images: [],
    submitting: false,
    privacyVisible: false,
    L: {},
  },

  onLoad() {
    uni.setNavigationBarTitle({ title: t('nav.mineFeedback') });
    this.setData({
      L: {
        label: t('feedback.label'),
        ph: t('feedback.ph'),
        shots: t('feedback.shots'),
        submitting: t('feedback.submitting'),
        submit: t('feedback.submit'),
      },
    });
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onChooseImages() {
    const remain = 3 - this.data.images.length;
    if (remain <= 0) {
      uni.showToast({ title: t('feedback.maxImages'), icon: 'none' });
      return;
    }
    chooseMedia({
      count: remain,
      mediaType: ['image'],
      success: (res) => {
        uni.showLoading({ title: t('common.uploading') });
        const uploads = res.tempFiles.map((f, i) =>
          cloud.uploadFile({
            cloudPath: `feedback/${Date.now()}-${i}-${Math.floor(Math.random() * 10000)}.jpg`,
            filePath: f.tempFilePath,
          })
        );
        Promise.all(uploads)
          .then((rs) => {
            uni.hideLoading();
            this.setData({ images: this.data.images.concat(rs.map((r) => r.fileID)) });
          })
          .catch(() => {
            uni.hideLoading();
            uni.showToast({ title: t('common.uploadFailed'), icon: 'none' });
          });
      },
    });
  },

  onRemoveImage(e) {
    const { index } = e.currentTarget.dataset;
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  onSubmit() {
    const d = this.data;
    if (d.submitting) return;
    if (!d.content.trim()) return uni.showToast({ title: t('feedback.emptyContent'), icon: 'none' });
    this.setData({ submitting: true });
    cloud
      .callFunction({
        name: 'krstuast',
        data: {
          action: 'submitFeedback',
          content: d.content,
          images: d.images,
        },
      })
      .then((res) => {
        this.setData({ submitting: false });
        const r = res.result || {};
        if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
        uni.showToast({ title: t('feedback.thanks'), icon: 'none' });
        setTimeout(() => uni.navigateBack(), 700);
      })
      .catch(() => {
        this.setData({ submitting: false });
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
      });
  },

  // ---------- 隐私弹窗 ----------
  openPrivacyPopup() {
    this.setData({ privacyVisible: true });
  },
  onPrivacyAgree() {
    this.setData({ privacyVisible: false });
    appState.resolvePrivacy(true);
  },
  onPrivacyReject() {
    this.setData({ privacyVisible: false });
    appState.resolvePrivacy(false);
  },
});

</script>

<style scoped>
/* pages/mine/feedback 意见反馈 */
.page {
  min-height: 100vh;
  padding: 24rpx 32rpx 32rpx;
  box-sizing: border-box;
}
.form-card {
  background: #ffffff;
  border-radius: 32rpx;
  padding: 8rpx 32rpx;
  box-shadow: 0 12rpx 32rpx rgba(31, 29, 36, 0.06);
}
.field {
  padding: 26rpx 0;
  border-bottom: 2rpx solid #f3f1f5;
}
.field:last-child {
  border-bottom: none;
}
.field-label {
  font-size: 28rpx;
  font-weight: 700;
  color: #1f1d24;
  margin-bottom: 16rpx;
}
.count-tip {
  font-size: 22rpx;
  font-weight: 400;
  color: #8a8494;
  margin-left: 12rpx;
}
.req {
  color: #d63a73;
}
.field-input {
  font-size: 28rpx;
  color: #1f1d24;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
  min-height: 40rpx;
  height: auto;
}
.ph {
  color: #8a8494;
}
.field-textarea {
  width: 100%;
  box-sizing: border-box;
  font-size: 28rpx;
  color: #1f1d24;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
  min-height: 220rpx;
}
.img-row {
  display: flex;
  flex-wrap: wrap;
}
.img-box {
  position: relative;
  width: 160rpx;
  height: 160rpx;
  margin-right: 16rpx;
  margin-bottom: 16rpx;
}
.img {
  width: 100%;
  height: 100%;
  border-radius: 20rpx;
}
.img-del {
  position: absolute;
  top: -12rpx;
  right: -12rpx;
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  background: #1f1d24;
  color: #ffffff;
  font-size: 22rpx;
  border-radius: 50%;
}
.img-add {
  width: 160rpx;
  height: 160rpx;
  line-height: 156rpx;
  text-align: center;
  font-size: 64rpx;
  color: #8a8494;
  background: #f6f5f7;
  border-radius: 20rpx;
  border: 2rpx dashed #e3dfe7;
  box-sizing: border-box;
}
.submit-btn {
  margin-top: 40rpx;
  height: 96rpx;
  line-height: 96rpx;
  text-align: center;
  border-radius: 999rpx;
  background: #d63a73;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 700;
  box-shadow: 0 12rpx 32rpx rgba(31, 29, 36, 0.08);
}
.submit-btn[disabled] {
  opacity: 0.6;
}
.safe-bottom {
  height: calc(env(safe-area-inset-bottom) + 24rpx);
}

</style>
