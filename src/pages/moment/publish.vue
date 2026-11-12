<template>
<!-- pages/moment/publish 发动态:文字 + 最多 9 张图 + 可见范围 -->
<view class="page">
  <view class="card">
    <textarea class="ta" v-model="content" :placeholder="L.ph" maxlength="1000" auto-height :show-confirm-bar="false" />
    <view class="grid">
      <view v-for="(img, i) in images" :key="img" class="cell">
        <image class="img" :src="img" mode="aspectFill" @tap="preview(i)" />
        <view class="x" @tap="remove(i)">×</view>
      </view>
      <view v-if="images.length < 9" class="cell add" @tap="choose">＋</view>
    </view>
  </view>
  <view class="card row" hover-class="row-hover" @tap="pickVis">
    <text class="row-label">{{ L.visLabel }}</text>
    <text class="row-value">{{ visText }}</text>
    <image class="ic18" src="/static/icons/chevright-9a93a3.png" />
  </view>
  <view :class="['submit', canSubmit ? '' : 'submit-off']" @tap="submit">{{ submitting ? L.posting : L.post }}</view>
</view>
</template>

<script>
import appState from '@/utils/app-state.js';
import cloud, { callKrstuast, requireLogin } from '@/utils/cloud.js';
import { chooseMedia } from '@/utils/platform.js';
import { t, cloudMsg } from '../../utils/i18n.js';

const VIS = ['public', 'friends', 'private'];

export default {
  data() {
    return { content: '', images: [], visibility: 'public', submitting: false, L: {} };
  },
  computed: {
    visText() {
      return t('moment.vis.' + this.visibility);
    },
    canSubmit() {
      return !this.submitting && (this.content.trim() || this.images.length);
    },
  },
  onLoad() {
    if (!requireLogin()) return uni.navigateBack();
    uni.setNavigationBarTitle({ title: t('moment.publishTitle') });
    this.L = { ph: t('moment.ph'), visLabel: t('moment.visLabel'), post: t('moment.post'), posting: t('moment.posting') };
  },
  methods: {
    choose() {
      chooseMedia({
        count: 9 - this.images.length,
        mediaType: ['image'],
        success: (res) => {
          uni.showLoading({ title: t('common.uploading') });
          Promise.all(
            res.tempFiles.map((f, i) =>
              cloud.uploadFile({ cloudPath: `moments/${Date.now()}-${i}-${Math.floor(Math.random() * 10000)}.jpg`, filePath: f.tempFilePath })
            )
          )
            .then((rs) => {
              uni.hideLoading();
              this.images = this.images.concat(rs.map((r) => r.fileID)).slice(0, 9);
            })
            .catch(() => {
              uni.hideLoading();
              uni.showToast({ title: t('common.uploadFailed'), icon: 'none' });
            });
        },
      });
    },
    preview(i) {
      uni.previewImage({ urls: this.images, current: this.images[i] });
    },
    remove(i) {
      this.images.splice(i, 1);
    },
    pickVis() {
      uni.showActionSheet({
        itemList: VIS.map((v) => t('moment.vis.' + v)),
        success: (s) => VIS[s.tapIndex] && (this.visibility = VIS[s.tapIndex]),
        fail: () => {},
      });
    },
    submit() {
      if (!this.canSubmit) return;
      this.submitting = true;
      const schoolId = (appState.readSchool() || {}).id || '';
      callKrstuast({ action: 'createMoment', content: this.content.trim(), images: this.images, visibility: this.visibility, schoolId })
        .then((r) => {
          const ret = (r && r.result) || {};
          if (!ret.success) {
            this.submitting = false;
            return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
          }
          uni.$emit('moment:created');
          uni.showToast({ title: t('moment.posted'), icon: 'none' });
          setTimeout(() => uni.navigateBack(), 500);
        })
        .catch(() => {
          this.submitting = false;
          uni.showToast({ title: t('common.networkError'), icon: 'none' });
        });
    },
  },
};
</script>

<style>
page { background: #f6f5f7; }
</style>

<style scoped>
.page { min-height: 100vh; padding: 24rpx; box-sizing: border-box; background: #f6f5f7; }
.card { background: #ffffff; border-radius: 28rpx; padding: 28rpx; margin-bottom: 24rpx; }
.ta { width: 100%; min-height: 220rpx; font-size: 30rpx; line-height: 1.6; }
.grid { margin-top: 20rpx; display: flex; flex-wrap: wrap; gap: 12rpx; }
.cell { position: relative; width: 196rpx; height: 196rpx; border-radius: 12rpx; overflow: hidden; background: #f6f5f7; }
.img { width: 100%; height: 100%; }
.x { position: absolute; top: 0; right: 0; width: 44rpx; height: 44rpx; line-height: 40rpx; text-align: center; background: rgba(0, 0, 0, 0.5); color: #fff; font-size: 32rpx; border-bottom-left-radius: 12rpx; }
.add { display: flex; align-items: center; justify-content: center; font-size: 64rpx; color: #9a93a3; border: 2rpx dashed #d9d4de; box-sizing: border-box; }
.row { display: flex; align-items: center; gap: 16rpx; }
.row-hover { opacity: 0.7; }
.row-label { flex: 1; font-size: 30rpx; }
.row-value { font-size: 28rpx; color: #6e6878; }
.ic18 { width: 36rpx; height: 36rpx; }
.submit { height: 92rpx; line-height: 92rpx; text-align: center; border-radius: 46rpx; background: #d63a73; color: #fff; font-size: 32rpx; font-weight: 700; }
.submit-off { opacity: 0.45; }
</style>
