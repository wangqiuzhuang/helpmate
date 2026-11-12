<template>
<!--pages/login App 端账号登录/注册(小程序端不编入,身份为微信 OPENID)-->
<view class="page">
  <view class="hero">
    <image class="hero-logo" src="/static/logo.png" mode="aspectFill" />
    <view class="hero-title">{{L.hero}}</view>
    <view class="hero-sub">{{L.sub}}</view>
  </view>

  <view class="card">
    <view class="tabs">
      <view :class="['tab', mode === 'login' ? 'tab-on' : '']" @tap="setMode('login')">{{L.tabLogin}}</view>
      <view :class="['tab', mode === 'register' ? 'tab-on' : '']" @tap="setMode('register')">{{L.tabRegister}}</view>
    </view>

    <view class="field">
      <view class="label">{{L.username}}</view>
      <input class="input" :value="username" :placeholder="L.usernamePh" placeholder-class="ph" maxlength="20" @input="onUsername" />
    </view>
    <view class="field">
      <view class="label">{{L.password}}</view>
      <input class="input" :value="password" password :placeholder="L.passwordPh" placeholder-class="ph" maxlength="32" @input="onPassword" />
    </view>
    <view v-if="mode === 'register'" class="field">
      <view class="label">{{L.password2}}</view>
      <input class="input" :value="password2" password :placeholder="L.password2Ph" placeholder-class="ph" maxlength="32" @input="onPassword2" />
    </view>

    <view class="agree" @tap="agreed = !agreed">
      <view :class="['check', agreed ? 'check-on' : '']">{{ agreed ? '✓' : '' }}</view>
      <text class="agree-text">{{L.agreePre}}<text class="link" @tap.stop="openDoc('agreement')">{{L.agreement}}</text>{{L.and}}<text class="link" @tap.stop="openDoc('privacy')">{{L.privacy}}</text></text>
    </view>

    <view :class="['submit', submitting ? 'submit-dis' : '']" hover-class="submit-hover" @tap="onSubmit">
      {{ mode === 'login' ? L.submitLogin : L.submitRegister }}
    </view>
  </view>

  <view class="tip">{{L.tip}}</view>
  <view class="skip" @tap="leave">{{L.skip}}</view>
</view>
</template>

<script>
import { t, cloudMsg } from '../../utils/i18n.js';
import { pickLang } from '../../utils/lang.js';
import cloud, { setAppToken } from '@/utils/cloud.js';
import appState from '@/utils/app-state.js';
import realtime from '@/utils/realtime.js';

// 协议/隐私政策地址:上架前替换为你自己的网页(与 androidPrivacy.json 中保持一致)
const DOCS = {
  agreement: 'https://YOUR-DOMAIN/agreement.html',
  privacy: 'https://YOUR-DOMAIN/privacy.html',
};

export default {
  data() {
    return {
      mode: 'login',
      username: '',
      password: '',
      password2: '',
      agreed: false,
      submitting: false,
      L: {},
    };
  },
  onShow() {
    uni.setNavigationBarTitle({ title: t('nav.login') });
    const keys = ['hero', 'sub', 'tabLogin', 'tabRegister', 'username', 'usernamePh', 'password', 'passwordPh', 'password2', 'password2Ph',
      'submitLogin', 'submitRegister', 'agreePre', 'agreement', 'and', 'privacy', 'tip', 'skip'];
    const L = {};
    keys.forEach((k) => (L[k] = t('login.' + k)));
    this.L = L;
  },
  methods: {
    // 离开登录页:从别的页面跳来 → 返回原页面;否则进入启动页(已选学校会直达主页)
    leave() {
      if (getCurrentPages().length > 1) uni.navigateBack();
      else uni.reLaunch({ url: '/pages/index/index' });
    },
    setMode(m) {
      this.mode = m;
    },
    onUsername(e) {
      this.username = e.detail.value;
    },
    onPassword(e) {
      this.password = e.detail.value;
    },
    onPassword2(e) {
      this.password2 = e.detail.value;
    },
    onTapLang() {
      // 语言切换后 reLaunch 到主页;未登录会被重新带回本页
      pickLang();
    },
    openDoc(key) {
      const url = DOCS[key];
      // #ifdef APP-PLUS
      plus.runtime.openURL(url);
      // #endif
      // #ifdef H5
      window.open(url, '_blank');
      // #endif
      // #ifdef H5
      window.open(url, '_blank');
      // #endif
    },
    onSubmit() {
      if (this.submitting) return;
      const username = this.username.trim();
      if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) return uni.showToast({ title: t('login.needUsername'), icon: 'none' });
      if (this.password.length < 6 || this.password.length > 32) return uni.showToast({ title: t('login.needPassword'), icon: 'none' });
      if (this.mode === 'register' && this.password !== this.password2) return uni.showToast({ title: t('login.pwdMismatch'), icon: 'none' });
      if (!this.agreed) return uni.showToast({ title: t('login.needAgree'), icon: 'none' });
      this.submitting = true;
      uni.showLoading({ title: '' });
      const school = appState.readSchool();
      cloud
        .callFunction({
          name: 'krstuast',
          data: {
            action: this.mode === 'login' ? 'appLogin' : 'appRegister',
            username,
            password: this.password,
            schoolId: school ? school.id : '',
          },
        })
        .then((res) => {
          uni.hideLoading();
          this.submitting = false;
          const r = res.result || {};
          if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
          setAppToken(r.token);
          realtime.connect();
          uni.showToast({ title: t(this.mode === 'login' ? 'login.welcome' : 'login.registered'), icon: 'none' });
          setTimeout(() => this.leave(), 400);
        })
        .catch(() => {
          uni.hideLoading();
          this.submitting = false;
          uni.showToast({ title: t('common.networkError'), icon: 'none' });
        });
    },
  },
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 80rpx 40rpx 80rpx;
  box-sizing: border-box;
  background: #f6f5f7;
  color: #1f1d24;
}
.hero { text-align: center; padding: 40rpx 0 48rpx; }
.hero-logo { width: 160rpx; height: 160rpx; border-radius: 40rpx; box-shadow: 0 12rpx 32rpx rgba(31, 29, 36, 0.12); }
.hero-title { margin-top: 28rpx; font-size: 44rpx; font-weight: 700; color: #1f1d24; }
.hero-sub { margin-top: 12rpx; font-size: 26rpx; color: #6e6878; }
.card { background: #ffffff; border-radius: 32rpx; padding: 36rpx 36rpx 44rpx; }
.tabs { display: flex; background: #f3f1f5; border-radius: 999rpx; padding: 8rpx; margin-bottom: 32rpx; }
.tab { flex: 1; text-align: center; padding: 16rpx 0; border-radius: 999rpx; font-size: 28rpx; color: #6e6878; }
.tab-on { background: #ffffff; color: #1f1d24; font-weight: 700; box-shadow: 0 4rpx 12rpx rgba(31, 29, 36, 0.08); }
.field { margin-bottom: 24rpx; }
.label { font-size: 26rpx; color: #3b3642; font-weight: 500; margin-bottom: 12rpx; }
.input { height: 92rpx; padding: 0 28rpx; border-radius: 20rpx; background: #f3f1f5; font-size: 30rpx; color: #1f1d24; }
.ph { color: #8a8494; }
.agree { display: flex; align-items: flex-start; margin: 12rpx 0 32rpx; }
.check { flex-shrink: 0; width: 34rpx; height: 34rpx; margin: 4rpx 14rpx 0 0; border-radius: 50%; border: 2rpx solid #c9c3cf; font-size: 22rpx; line-height: 34rpx; text-align: center; color: #ffffff; }
.check-on { background: #d63a73; border-color: #d63a73; }
.agree-text { font-size: 24rpx; color: #6e6878; line-height: 1.6; }
.link { color: #c22f66; }
.submit { height: 96rpx; line-height: 96rpx; text-align: center; border-radius: 999rpx; background: #d63a73; color: #ffffff; font-size: 32rpx; font-weight: 700; }
.submit-hover { opacity: 0.85; }
.submit-dis { opacity: 0.6; }
.tip { margin-top: 32rpx; text-align: center; font-size: 22rpx; color: #7a7383; line-height: 1.6; }
.skip { margin: 36rpx auto 0; width: 240rpx; height: 76rpx; line-height: 72rpx; text-align: center; border: 2rpx solid #e3dfe7; border-radius: 38rpx; font-size: 28rpx; color: #3b3642; box-sizing: border-box; }
.lang { margin-top: 28rpx; text-align: center; font-size: 24rpx; color: #6e6878; }
</style>
