<template>
<!--pages/index 启动页:先选国家(韩国 / 中国),再选学校;已选过学校直接进主页-->
<view class="page">
  <view class="top">
    <view />
    <view class="lang-chip" hover-class="chip-hover" @tap="onTapLang">
      <image class="ic" src="/static/icons/globe-4a4552.png" />
      <text>{{ L.langShort }}</text>
    </view>
  </view>

  <view class="hero">
    <image class="logo" src="/static/logo.png" mode="aspectFill" />
    <view class="hero-title">{{ L.countryTitle }}</view>
    <view class="hero-sub">{{ L.countrySub }}</view>
  </view>

  <view class="countries">
    <view v-for="c in countries" :key="c.code" :class="['country', c.code === country ? 'country-on' : '']" hover-class="card-hover" @tap="onPickCountry(c.code)">
      <text class="flag">{{ c.flag }}</text>
      <view class="country-main">
        <view class="country-name">{{ c.name }}</view>
        <view class="country-sub">{{ c.sub }}</view>
      </view>
      <view :class="['radio', c.code === country ? 'radio-on' : '']" />
    </view>
  </view>

  <view class="tips">{{ L.tips }}</view>
  <view :class="['btn', country ? '' : 'btn-dis']" hover-class="btn-hover" @tap="onOpenPicker">{{ L.next }}</view>
  <view class="safe" />

  <school-picker :visible="pickerVisible" :forced="false" :country="country || 'kr'" @select="onPickerSelect" @close="onPickerClose" />
</view>
</template>

<script>
import appState from '@/utils/app-state.js';
import { t } from '../../utils/i18n.js';
import i18n from '../../utils/i18n.js';
import { pickLang, SUPPORTED } from '../../utils/lang.js';
import { COUNTRIES, findSchool, ensureSchools } from '../../utils/school-data.js';
import { callKrstuast, isGuest } from '@/utils/cloud.js';
import { cloudMsg } from '../../utils/i18n.js';

export default {
  data() {
    return { country: '', countries: [], pickerVisible: false, L: {} };
  },

  onShow() {
    // 已有学校 → 直接进主页
    if (appState.readSchool()) {
      if (!this._redirected) {
        this._redirected = true;
        uni.switchTab({ url: '/pages/home/home' });
      }
      return;
    }
    uni.setNavigationBarTitle({ title: t('nav.index') });
    this.country = this.country || appState.getCountry() || '';
    const cur = SUPPORTED.find((l) => l.code === i18n.getLang()) || SUPPORTED[0];
    this.countries = COUNTRIES.map((c) => ({ ...c, name: t('country.' + c.code), sub: t('country.' + c.code + 'Sub') }));
    this.L = {
      langShort: cur.native,
      countryTitle: t('country.title'),
      countrySub: t('country.sub'),
      tips: t('country.tips'),
      next: t('country.next'),
    };
  },

  methods: {
    onTapLang() {
      pickLang();
    },
    onPickCountry(code) {
      this.country = code;
      appState.setCountry(code);
      // 中国名单提前在后台下载,点「下一步」时基本已就绪
      if (code === 'cn') ensureSchools('cn').catch(() => {});
    },
    onOpenPicker() {
      if (!this.country) return uni.showToast({ title: t('country.needPick'), icon: 'none' });
      this.pickerVisible = true;
    },
    onPickerSelect(e) {
      const { id } = e.detail;
      const school = findSchool(id);
      if (!school) return;
      const prev = uni.getStorageSync('krstuast_prev_school');
      const done = (s) => {
        appState.setSchool(s);
        uni.removeStorageSync('krstuast_prev_school');
        this.pickerVisible = false;
        uni.switchTab({ url: '/pages/home/home' });
      };
      // 游客或首次选学校:直接切换;已登录用户换校走服务端限次(7 天 2 次,超出需管理员审核)
      if (isGuest() || !prev || !prev.id || prev.id === school.id) {
        uni.showToast({ title: t('index.welcome'), icon: 'none' });
        return done(school);
      }
      callKrstuast({ action: 'changeSchool', schoolId: school.id }).then((r) => {
        const ret = (r && r.result) || {};
        if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
        if (ret.status === 'pending') {
          uni.showModal({ title: t('schoolChange.pendingTitle'), content: t('schoolChange.pendingContent'), showCancel: false, confirmColor: '#D63A73' });
          return done(prev);
        }
        uni.showToast({ title: t('index.welcome'), icon: 'none' });
        done(school);
      }).catch(() => uni.showToast({ title: t('common.networkError'), icon: 'none' }));
    },
    onPickerClose() {
      this.pickerVisible = false;
    },
  },
};
</script>

<style>
page { background: #f6f5f7; }
</style>

<style scoped>
.page { min-height: 100vh; display: flex; flex-direction: column; padding: 0 40rpx; box-sizing: border-box; background: #f6f5f7; color: #1f1d24; }
.top { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0; padding-top: calc(var(--status-bar-height, 0px) + 20rpx); }
.lang-chip { display: flex; align-items: center; gap: 8rpx; height: 64rpx; padding: 0 24rpx; border-radius: 32rpx; background: #ffffff; font-size: 26rpx; color: #3b3642; }
.chip-hover { opacity: 0.7; }
.ic { width: 32rpx; height: 32rpx; }
.hero { display: flex; flex-direction: column; align-items: center; padding: 48rpx 0 48rpx; }
.logo { width: 144rpx; height: 144rpx; border-radius: 36rpx; margin-bottom: 32rpx; }
.hero-title { font-size: 44rpx; font-weight: 700; text-align: center; }
.hero-sub { margin-top: 12rpx; font-size: 26rpx; color: #6e6878; text-align: center; line-height: 1.6; }
.countries { display: flex; flex-direction: column; gap: 20rpx; }
.country { display: flex; align-items: center; gap: 28rpx; padding: 32rpx; border-radius: 32rpx; background: #ffffff; border: 2rpx solid transparent; }
.country-on { border-color: #d63a73; background: #fff7fa; }
.card-hover { opacity: 0.85; }
.flag { font-size: 64rpx; line-height: 1; }
.country-main { flex: 1; min-width: 0; }
.country-name { font-size: 34rpx; font-weight: 700; }
.country-sub { margin-top: 6rpx; font-size: 24rpx; color: #6e6878; }
.radio { width: 40rpx; height: 40rpx; border-radius: 50%; border: 2rpx solid #c9c3cf; box-sizing: border-box; }
.radio-on { border: 13rpx solid #d63a73; }
.tips { margin-top: 32rpx; text-align: center; font-size: 24rpx; color: #7a7383; line-height: 1.7; }
.btn { margin-top: auto; height: 100rpx; line-height: 100rpx; text-align: center; border-radius: 50rpx; background: #d63a73; color: #ffffff; font-size: 32rpx; font-weight: 700; }
.btn-dis { opacity: 0.45; }
.btn-hover { opacity: 0.85; }
.safe { height: calc(48rpx + env(safe-area-inset-bottom)); }
</style>
