<template>
<!--privacy-popup 隐私保护提示(仅微信小程序:配合 wx.onNeedPrivacyAuthorization;App 端使用原生隐私弹窗 androidPrivacy.json)-->
<view v-if="visible" class="pp">
  <view class="pp-mask" />
  <view class="pp-card">
    <view class="pp-emoji">🛡️</view>
    <view class="pp-title">{{L.title}}</view>
    <view class="pp-content">
      {{L.before}}
      <text class="pp-link" @tap.stop="noop">{{L.link}}</text>
      {{L.after}}
    </view>
    <view class="pp-btns">
      <button class="pp-btn pp-reject" @tap="onReject">{{L.reject}}</button>
      <!-- #ifdef MP-WEIXIN -->
      <button class="pp-btn pp-agree" id="agree-btn" open-type="agreePrivacyAuthorization" @agreeprivacyauthorization="onAgree">{{L.agree}}</button>
      <!-- #endif -->
      <!-- #ifndef MP-WEIXIN -->
      <button class="pp-btn pp-agree" id="agree-btn" @tap="onAgree">{{L.agree}}</button>
      <!-- #endif -->
    </view>
  </view>
</view>
</template>

<script>
// privacy-popup —— 隐私保护提示弹窗（微信隐私合规）
import { t } from '../../utils/i18n.js';

export default {
  props: {
    visible: { type: Boolean, default: false },
  },
  emits: ['agree', 'reject'],
  data() {
    return {
      L: {
        title: t('privacy.title'),
        before: t('privacy.before'),
        link: t('privacy.link'),
        after: t('privacy.after'),
        reject: t('privacy.reject'),
        agree: t('privacy.agree'),
      },
    };
  },
  methods: {
    onAgree(e) {
      const d = (e && e.detail) || {};
      this.$emit('agree', { detail: { buttonId: d.buttonId || 'agree-btn' } });
    },
    onReject() {
      this.$emit('reject', { detail: {} });
    },
    noop() {},
  },
};
</script>

<style scoped>
/* privacy-popup 样式 */
.pp {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
}
.pp-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(74, 70, 88, 0.5);
}
.pp-card {
  position: absolute;
  left: 64rpx;
  right: 64rpx;
  top: 50%;
  transform: translateY(-50%);
  background: #ffffff;
  border-radius: 32rpx;
  padding: 48rpx 40rpx 36rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.pp-emoji {
  font-size: 72rpx;
}
.pp-title {
  margin-top: 16rpx;
  font-size: 34rpx;
  font-weight: 700;
  color: #1f1d24;
}
.pp-content {
  margin-top: 20rpx;
  font-size: 26rpx;
  color: #625c6b;
  line-height: 1.8;
}
.pp-link {
  color: #d63a73;
}
.pp-btns {
  margin-top: 32rpx;
  display: flex;
  width: 100%;
}
.pp-btn {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 700;
}
.pp-reject {
  background: #f3f1f5;
  color: #6e6878;
}
.pp-agree {
  margin-left: 20rpx;
  background: #d63a73;
  color: #ffffff;
}
</style>
