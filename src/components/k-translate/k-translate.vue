<template>
<!-- k-translate:放在一段用户内容下方,点「翻译」调用 AI 翻成当前界面语言;再点切回原文 -->
<view v-if="text" :class="['kt', small ? 'kt-small' : '']">
  <view v-if="result && shown" class="kt-result">{{ result }}</view>
  <view class="kt-bar" @tap.stop="onTap">
    <image class="kt-ic" :src="busy ? '/static/icons/translate-9a93a3.png' : '/static/icons/translate-c22f66.png'" />
    <text :class="['kt-link', busy ? 'kt-busy' : '']">{{ label }}</text>
  </view>
</view>
</template>

<script>
import { translate } from '../../utils/translate.js';
import { t } from '../../utils/i18n.js';

export default {
  props: {
    text: { type: String, default: '' },
    small: { type: Boolean, default: false },
  },
  data() {
    return { result: '', shown: false, busy: false };
  },
  computed: {
    label() {
      if (this.busy) return t('translate.busy');
      return this.result && this.shown ? t('translate.showOriginal') : t('translate.action');
    },
  },
  watch: {
    text() {
      this.result = '';
      this.shown = false;
    },
  },
  methods: {
    onTap() {
      if (this.busy) return;
      if (this.result) {
        this.shown = !this.shown;
        return;
      }
      this.busy = true;
      translate(this.text)
        .then((r) => {
          this.result = r;
          this.shown = true;
        })
        .catch((msg) => {
          if (msg) uni.showToast({ title: msg, icon: 'none' });
        })
        .finally(() => (this.busy = false));
    },
  },
};
</script>

<style scoped>
.kt { margin-top: 12rpx; }
.kt-result { padding: 16rpx 20rpx; border-radius: 16rpx; background: #f7f5f8; border-left: 6rpx solid #f3c3d5; font-size: 28rpx; line-height: 1.7; color: #1f1d24; white-space: pre-wrap; word-break: break-all; margin-bottom: 8rpx; }
.kt-bar { display: inline-flex; align-items: center; gap: 8rpx; padding: 6rpx 0; }
.kt-ic { width: 30rpx; height: 30rpx; }
.kt-link { font-size: 24rpx; color: #c22f66; }
.kt-busy { color: #8a8494; }
.kt-small { margin-top: 6rpx; }
.kt-small .kt-result { font-size: 26rpx; padding: 12rpx 16rpx; }
.kt-small .kt-link { font-size: 22rpx; }
.kt-small .kt-ic { width: 26rpx; height: 26rpx; }
</style>
