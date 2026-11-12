<template>
<!-- pages/guide 新手引导:首次启动展示一次,完成后进入选学校 -->
<view v-if="step === 'lang'" class="page">
  <view class="top" />
  <view class="lang-body">
    <image class="lang-logo" src="/static/logo.png" mode="aspectFill" />
    <view class="lang-title">{{ L.langTitle }}</view>
    <view class="lang-sub">Choose your language · 언어를 선택하세요 · Chọn ngôn ngữ</view>
    <view v-for="l in langs" :key="l.code" :class="['lang-opt', l.code === lang ? 'lang-on' : '']" @tap="pickLang(l.code)">
      <text>{{ l.native }}</text>
      <view :class="['radio', l.code === lang ? 'radio-on' : '']" />
    </view>
  </view>
  <view class="btn" hover-class="btn-hover" @tap="toIntro">{{ L.continue }}</view>
  <view class="safe" />
</view>

<view v-else class="page">
  <view class="top">
    <view />
    <view v-if="current < slides.length - 1" class="skip" @tap="finish">{{ L.skip }}</view>
  </view>

  <swiper class="swiper" :current="current" @change="onChange">
    <swiper-item v-for="s in slides" :key="s.key">
      <view class="slide">
        <view class="art" :style="{ background: s.bg }">
          <image v-if="s.logo" class="art-logo" src="/static/logo.png" mode="aspectFill" />
          <image v-else class="art-icon" :src="s.icon" />
        </view>
        <view class="title">{{ s.title }}</view>
        <view class="desc">{{ s.desc }}</view>
      </view>
    </swiper-item>
  </swiper>

  <view class="dots">
    <view v-for="(s, i) in slides" :key="s.key" :class="['dot', i === current ? 'dot-on' : '']" />
  </view>
  <view class="btn" hover-class="btn-hover" @tap="onNext">{{ current < slides.length - 1 ? L.next : L.start }}</view>
  <view class="safe" />
</view>
</template>

<script>
import { t } from '../../utils/i18n.js';
import { SUPPORTED } from '../../utils/lang.js';
import i18n from '../../utils/i18n.js';
import appState from '@/utils/app-state.js';

const GUIDE_KEY = 'krstuast_guide_v1';

export default {
  data() {
    return { step: 'lang', lang: 'zh', langs: SUPPORTED, current: 0, slides: [], L: {} };
  },
  onLoad() {
    this.lang = i18n.getLang(); // 默认选中手机系统语言
  },
  onShow() {
    this.build();
  },
  methods: {
    build() {
    this.slides = [
      { key: 's1', logo: true, bg: '#FFEEF4', title: t('guide.t1'), desc: t('guide.d1') },
      { key: 's2', icon: '/static/icons/guide-graduation.png', bg: '#EEEAFE', title: t('guide.t2'), desc: t('guide.d2') },
      { key: 's3', icon: '/static/icons/guide-compass.png', bg: '#E6F6EE', title: t('guide.t3'), desc: t('guide.d3') },
    ];
    this.L = { skip: t('guide.skip'), next: t('guide.next'), start: t('guide.start'), langTitle: t('guide.langTitle'), continue: t('guide.continue') };
    uni.setNavigationBarTitle({ title: ' ' });
    },
    // 选择语言:立即生效(本页文案随之切换),不需要重启
    pickLang(code) {
      this.lang = code;
      appState.setLang(code);
      this.build();
    },
    toIntro() {
      appState.setLang(this.lang);
      this.build();
      this.step = 'intro';
    },
    onChange(e) {
      this.current = e.detail.current;
    },
    onNext() {
      if (this.current < this.slides.length - 1) this.current += 1;
      else this.finish();
    },
    finish() {
      try {
        uni.setStorageSync(GUIDE_KEY, 1);
      } catch (e) {}
      uni.reLaunch({ url: '/pages/index/index' });
    },
  },
};
</script>

<style>
page {
  background: #ffffff;
}
</style>

<style scoped>
.page { height: 100vh; display: flex; flex-direction: column; background: #ffffff; color: #1f1d24; }
.top { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 32rpx; padding-top: calc(var(--status-bar-height, 0px) + 20rpx); }
.skip { padding: 16rpx 8rpx; font-size: 28rpx; color: #6e6878; }
.lang-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 48rpx; }
.lang-logo { width: 160rpx; height: 160rpx; border-radius: 40rpx; margin-bottom: 40rpx; }
.lang-title { font-size: 44rpx; font-weight: 700; }
.lang-sub { margin: 12rpx 0 48rpx; font-size: 26rpx; color: #6e6878; text-align: center; }
.lang-opt { width: 100%; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; height: 112rpx; padding: 0 36rpx; margin-bottom: 20rpx; border: 2rpx solid #e3dfe7; border-radius: 28rpx; font-size: 32rpx; }
.lang-on { border-color: #d63a73; background: #ffeef4; font-weight: 700; }
.radio { width: 36rpx; height: 36rpx; border-radius: 50%; border: 2rpx solid #c9c3cf; box-sizing: border-box; }
.radio-on { border: 12rpx solid #d63a73; }
.swiper { flex: 1; }
.slide { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 64rpx; box-sizing: border-box; }
.art { width: 400rpx; height: 400rpx; border-radius: 120rpx; display: flex; align-items: center; justify-content: center; margin-bottom: 72rpx; }
.art-logo { width: 280rpx; height: 280rpx; border-radius: 72rpx; }
.art-icon { width: 240rpx; height: 240rpx; }
.title { font-size: 48rpx; font-weight: 700; text-align: center; line-height: 1.4; }
.desc { margin-top: 24rpx; font-size: 30rpx; color: #625c6b; text-align: center; line-height: 1.7; }
.dots { display: flex; justify-content: center; gap: 16rpx; padding: 24rpx 0 40rpx; }
.dot { width: 16rpx; height: 16rpx; border-radius: 8rpx; background: #e3dfe7; }
.dot-on { width: 48rpx; background: #d63a73; }
.btn { margin: 0 48rpx; height: 100rpx; line-height: 100rpx; text-align: center; border-radius: 50rpx; background: #d63a73; color: #ffffff; font-size: 32rpx; font-weight: 700; }
.btn-hover { opacity: 0.85; }
.safe { height: calc(48rpx + env(safe-area-inset-bottom)); }
</style>
