<template>
<!-- pages/mine 我的(清新社区风):资料 + 信用统计 + 列表菜单 -->
<view class="page">
  <view v-if="guest" class="profile">
    <view class="profile-row" @tap="goLogin">
      <view class="avatar avatar-text">🐻</view>
      <view class="profile-main">
        <view class="nick">{{ L.guestTitle }}</view>
        <view class="sub">{{ L.guestSub }}</view>
      </view>
      <view class="login-btn">{{ L.guestBtn }}</view>
    </view>
  </view>
  <view v-else class="profile">
    <view class="profile-row">
      <image v-if="user && user.avatarUrl" class="avatar" :src="user.avatarUrl" mode="aspectFill" @tap="onTapEdit" />
      <view v-else class="avatar avatar-text" @tap="onTapEdit">{{ initial }}</view>
      <view class="profile-main">
        <view class="nick">{{ nickDisplay || L.loading }}</view>
        <view class="sub">{{ schoolMain }}<text v-if="user && user.uid"> · ID {{ user.uid }}</text></view>
      </view>
      <view class="edit-btn" hover-class="tap-hover" @tap="onTapEdit">{{ L.editProfile }}</view>
    </view>
    <view v-if="user && user.signature" class="sig">{{ user.signature }}</view>
    <view class="stats">
      <view class="stat"><text class="stat-num">{{ ratingLabel }}</text><text class="stat-label">{{ L.statRating }}</text></view>
      <view class="stat"><text class="stat-num">{{ user ? user.publishCount : '–' }}</text><text class="stat-label">{{ L.statPublish }}</text></view>
      <view class="stat"><text class="stat-num">{{ user ? user.claimCount : '–' }}</text><text class="stat-label">{{ L.statClaim }}</text></view>
      <view class="stat"><text class="stat-num">{{ user ? user.doneCount : '–' }}</text><text class="stat-label">{{ L.statDone }}</text></view>
    </view>
  </view>

  <view v-if="!guest && user" class="card lv-card">
    <view class="lv-top"><text class="lv-big">Lv{{ user.level || 1 }}</text><text class="lv-name">{{ L.lvName }}</text><text class="lv-exp">{{ user.exp || 0 }}{{ user.nextExp ? ' / ' + user.nextExp : '' }} {{ L.exp }}</text></view>
    <view class="lv-bar"><view class="lv-fill" :style="{ width: lvPct + '%' }" /></view>
    <k-badges :items="user.badges || []" />
  </view>

  <view class="card">
    <view class="item" hover-class="item-hover" @tap="onTapOrders('published')">
      <image class="ic22" src="/static/icons/list-4a4552.png" />
      <text class="item-label">{{ L.myPublished }}</text>
      <image class="ic18" src="/static/icons/chevright-9a93a3.png" />
    </view>
    <view class="item" hover-class="item-hover" @tap="onTapOrders('joined')">
      <image class="ic22" src="/static/icons/users-4a4552.png" />
      <text class="item-label">{{ L.myJoined }}</text>
      <image class="ic18" src="/static/icons/chevright-9a93a3.png" />
    </view>
  </view>

  <view class="card">
    <view class="item" hover-class="item-hover" @tap="onChangeSchool">
      <image class="ic22" src="/static/icons/graduation-4a4552.png" />
      <text class="item-label">{{ L.school }}</text>
      <text class="item-value">{{ countryFlag }} {{ schoolMain }}</text>
      <image class="ic18" src="/static/icons/chevright-9a93a3.png" />
    </view>
    <view class="item" hover-class="item-hover" @tap="onTapLang">
      <image class="ic22" src="/static/icons/globe-4a4552.png" />
      <text class="item-label">{{ L.lang }}</text>
      <text class="item-value">{{ L.langValue }}</text>
      <image class="ic18" src="/static/icons/chevright-9a93a3.png" />
    </view>
    <view v-if="!guest" class="item" hover-class="item-hover" @tap="onTapRider">
      <image class="ic22" src="/static/icons/package-23744d.png" />
      <text class="item-label">{{ L.rider }}</text>
      <image class="ic18" src="/static/icons/chevright-9a93a3.png" />
    </view>
    <view v-if="!guest" class="item" hover-class="item-hover" @tap="onTapMyMoments">
      <image class="ic22" src="/static/icons/compass-6e6878.png" />
      <text class="item-label">{{ L.myMoments }}</text>
      <image class="ic18" src="/static/icons/chevright-9a93a3.png" />
    </view>
    <view v-if="!guest" class="item" hover-class="item-hover" @tap="onTapFriends">
      <image class="ic22" src="/static/icons/user-6e6878.png" />
      <text class="item-label">{{ L.friends }}</text>
      <text v-if="friendReqs" class="item-badge">{{ friendReqs }}</text>
      <image class="ic18" src="/static/icons/chevright-9a93a3.png" />
    </view>
    <view v-if="!guest" class="item" hover-class="item-hover" @tap="onTapBlocked">
      <image class="ic22" src="/static/icons/users-4a4552.png" />
      <text class="item-label">{{ L.blocked }}</text>
      <image class="ic18" src="/static/icons/chevright-9a93a3.png" />
    </view>
    <view class="item" hover-class="item-hover" @tap="onTapFeedback">
      <image class="ic22" src="/static/icons/comment-4a4552.png" />
      <text class="item-label">{{ L.feedback }}</text>
      <image class="ic18" src="/static/icons/chevright-9a93a3.png" />
    </view>
    <!-- #ifdef APP-PLUS -->
    <view class="item" hover-class="item-hover" @tap="onTapUpdate">
      <image class="ic22" src="/static/icons/download-4a4552.png" />
      <text class="item-label">{{ L.update }}</text>
      <text class="item-value">{{ version ? 'v' + version : '' }}</text>
      <image class="ic18" src="/static/icons/chevright-9a93a3.png" />
    </view>
    <!-- #endif -->
  </view>

  <!-- #ifndef MP-WEIXIN -->
  <view v-if="!guest" class="card">
    <view class="item item-center" hover-class="item-hover" @tap="onTapLogout">{{ L.logout }}</view>
  </view>
  <view v-if="!guest" class="delete" @tap="onTapDeleteAccount">{{ L.deleteAccount }}</view>
  <!-- #endif -->

  <view class="footer">{{ L.footer }}</view>
  <view class="bottom-space" />
  <k-tab-bar :selected="4" />
</view>
</template>

<script>
import appState from '@/utils/app-state.js';
import cloud, { setAppToken, isGuest, requireLogin } from '@/utils/cloud.js';
import realtime from '@/utils/realtime.js';
import { checkUpdate, currentVersion } from '@/utils/update.js';
import { COUNTRIES, findSchool, ensureSchools, countryOf } from '@/utils/school-data.js';
import { t, tv, cloudMsg, localizedSchool } from '../../utils/i18n.js';
import { SUPPORTED, pickLang } from '../../utils/lang.js';

export default {
  data() {
    return { guest: false, user: null, nickDisplay: '', initial: '🐻', ratingLabel: '–', schoolMain: '', countryFlag: '', version: '', friendReqs: 0, L: {} };
  },

  onShow() {
    uni.setNavigationBarTitle({ title: t('nav.mine') });
    const school = appState.readSchool();
    if (!school) {
      uni.reLaunch({ url: '/pages/index/index' });
      return;
    }
    const loc = localizedSchool(school);
    const cur = appState.readLang();
    const current = SUPPORTED.find((l) => l.code === cur) || SUPPORTED[0];
    this.schoolMain = loc.nameMain;
    const c = COUNTRIES.find((x) => x.code === appState.getCountry());
    this.countryFlag = c ? c.flag : '';
    currentVersion().then((v) => (this.version = v.version));
    this.L = {
      loading: t('common.loading'),
      editProfile: t('mine.editProfile'),
      statRating: t('mine.statRating'),
      statPublish: t('mine.statPublish'),
      statClaim: t('mine.statClaim'),
      statDone: t('mine.statDone'),
      myPublished: t('mine.myPublished'),
      myJoined: t('mine.myJoined'),
      school: t('mine.school'),
      lang: t('mine.lang'),
      langValue: current.native,
      feedback: t('mine.feedback'),
      update: t('update.check'),
      blocked: t('blocked.title'),
      friends: t('friends.title'),
      myMoments: t('moment.mine'),
      rider: t('rider.title'),
      logout: t('mine.logout'),
      deleteAccount: t('mine.deleteAccount'),
      footer: t('mine.footer'),
      guestTitle: t('mine.guestTitle'),
      guestSub: t('mine.guestSub'),
      guestBtn: t('mine.guestBtn'),
    };
    this.guest = isGuest();
    if (!this.guest) {
      this.loadProfile(school);
      cloud.callFunction({ name: 'krstuast', data: { action: 'getFriendRequests' } }).then((r) => (this.friendReqs = ((r && r.result) || {}).total || 0)).catch(() => {});
    }
    else this.user = null;
  },

  computed: {
    lvPct() {
      const u = this.user || {};
      if (!u.nextExp) return 100;
      return Math.max(4, Math.min(100, Math.round((((u.exp || 0) - (u.levelExp || 0)) / (u.nextExp - (u.levelExp || 0))) * 100)));
    },
  },

  methods: {
    loadProfile(school) {
      cloud
        .callFunction({ name: 'krstuast', data: { action: 'getMyProfile', schoolId: school ? school.id : '' } })
        .then((res) => {
          const r = res.result || {};
          if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
          const u = r.user;
          this.user = u;
          // 学校以服务器为准(换校审核通过后,本地自动同步过来)
          if (u.schoolId && (!school || school.id !== u.schoolId)) {
            ensureSchools(countryOf(u.schoolId)).then(() => {
              const s2 = findSchool(u.schoolId);
              if (s2) { appState.setSchool(s2); uni.removeStorageSync('krstuast_prev_school'); }
            }).catch(() => {});
          }
          this.L = { ...this.L, lvName: t('level.' + (u.level || 1)), exp: t('level.exp') };
          uni.setStorageSync('krstuast_me_brief', { uid: u.uid, nickname: u.nickname, avatarUrl: u.avatarUrl });
          this.nickDisplay = tv('sysNick', u.nickname || '微信用户');
          this.initial = (this.nickDisplay || '🐻').slice(0, 1).toUpperCase();
          this.ratingLabel = u.ratingCount > 0 ? u.rating.toFixed(1) : '–';
        })
        .catch(() => uni.showToast({ title: t('common.networkError'), icon: 'none' }));
    },

    goLogin() {
      uni.navigateTo({ url: '/pages/login/login' });
    },

    onTapEdit() {
      uni.navigateTo({ url: '/pages/mine/edit' });
    },

    onTapOrders(role) {
      if (!requireLogin()) return;
      uni.navigateTo({ url: '/pages/order/history?role=' + role });
    },

    onTapFeedback() {
      if (!requireLogin()) return;
      uni.navigateTo({ url: '/pages/mine/feedback' });
    },

    onTapLang() {
      pickLang();
    },

    onTapRider() {
      uni.navigateTo({ url: '/pages/rider/rider' });
    },

    onTapMyMoments() {
      if (this.user && this.user.uid) uni.navigateTo({ url: '/pages/profile/index?uid=' + this.user.uid });
    },

    onTapFriends() {
      uni.navigateTo({ url: '/pages/friends/friends' + (this.friendReqs ? '?tab=requests' : '') });
    },

    onTapBlocked() {
      uni.navigateTo({ url: '/pages/mine/blocked' });
    },

    onTapUpdate() {
      checkUpdate(false);
    },

    onChangeSchool() {
      uni.showModal({
        title: t('mine.switchSchoolTitle'),
        content: t('mine.switchSchoolConfirm', { school: this.schoolMain }),
        confirmText: t('common.goSelect'),
        cancelText: t('common.cancel'),
        confirmColor: '#D63A73',
        success: (res) => {
          if (res.confirm) {
            appState.setSchool(null);
            uni.reLaunch({ url: '/pages/index/index' });
          }
        },
      });
    },

    // #ifndef MP-WEIXIN
    onTapLogout() {
      uni.showModal({
        title: t('mine.logoutTitle'),
        content: t('mine.logoutContent'),
        confirmColor: '#D63A73',
        success: (res) => {
          if (!res.confirm) return;
          setAppToken('');
          realtime.disconnect();
          uni.reLaunch({ url: '/pages/login/login' });
        },
      });
    },

    onTapDeleteAccount() {
      uni.showModal({
        title: t('mine.deleteTitle'),
        content: t('mine.deleteContent'),
        confirmText: t('mine.deleteConfirm'),
        confirmColor: '#E5484D',
        success: (res) => {
          if (!res.confirm) return;
          uni.showLoading({ title: '' });
          cloud
            .callFunction({ name: 'krstuast', data: { action: 'appDeleteAccount' } })
            .then((r) => {
              uni.hideLoading();
              const ret = r.result || {};
              if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
              setAppToken('');
          realtime.disconnect();
              uni.showToast({ title: t('mine.deleteDone'), icon: 'none' });
              setTimeout(() => uni.reLaunch({ url: '/pages/login/login' }), 800);
            })
            .catch(() => {
              uni.hideLoading();
              uni.showToast({ title: t('common.networkError'), icon: 'none' });
            });
        },
      });
    },
    // #endif
  },
};
</script>

<style>
page {
  background: #f6f5f7;
}
</style>

<style scoped>
.page { min-height: 100vh; background: #f6f5f7; color: #1f1d24; }
.ic18 { width: 36rpx; height: 36rpx; }
.ic22 { width: 44rpx; height: 44rpx; }
.tap-hover { opacity: 0.6; }
.profile { background: #ffffff; padding: 48rpx 32rpx 40rpx; padding-top: calc(var(--status-bar-height, 0px) + 48rpx); border-radius: 0 0 40rpx 40rpx; }
.profile-row { display: flex; align-items: center; gap: 28rpx; }
.avatar { flex: 0 0 128rpx; width: 128rpx; height: 128rpx; border-radius: 50%; background: #ffeef4; }
.avatar-text { display: flex; align-items: center; justify-content: center; color: #c22f66; font-size: 52rpx; font-weight: 700; }
.profile-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
.nick { font-size: 40rpx; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { font-size: 26rpx; color: #6e6878; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.edit-btn { flex: 0 0 auto; height: 68rpx; line-height: 64rpx; padding: 0 28rpx; border: 2rpx solid #e3dfe7; border-radius: 34rpx; font-size: 26rpx; color: #3b3642; box-sizing: border-box; }
.login-btn { flex: 0 0 auto; height: 68rpx; line-height: 68rpx; padding: 0 32rpx; border-radius: 34rpx; background: #d63a73; color: #ffffff; font-size: 26rpx; font-weight: 700; }
.sig { margin-top: 24rpx; font-size: 26rpx; color: #625c6b; line-height: 1.5; }
.stats { margin-top: 40rpx; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); background: #f7f5f8; border-radius: 28rpx; padding: 28rpx 0; }
.stat { display: flex; flex-direction: column; align-items: center; gap: 4rpx; }
.stat-num { font-size: 34rpx; font-weight: 700; }
.stat-label { font-size: 24rpx; color: #6e6878; }
.card { margin: 24rpx 24rpx 0; background: #ffffff; border-radius: 32rpx; overflow: hidden; }
.item { display: flex; align-items: center; gap: 24rpx; min-height: 108rpx; padding: 0 32rpx; border-bottom: 2rpx solid #f0edf2; font-size: 30rpx; }
.item:last-child { border-bottom: 0; }
.item-hover { background: #faf9fb; }
.item-label { flex: 1; }
.item-value { font-size: 28rpx; color: #6e6878; max-width: 300rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-center { justify-content: center; }
.delete { text-align: center; padding: 32rpx 0 0; font-size: 26rpx; color: #6e6878; }
.footer { text-align: center; padding: 32rpx 0 0; font-size: 22rpx; color: #8a8494; }
.bottom-space { height: calc(200rpx + env(safe-area-inset-bottom)); }
.item-badge { margin-right: 12rpx; min-width: 36rpx; height: 36rpx; line-height: 36rpx; padding: 0 10rpx; border-radius: 18rpx; background: #e5484d; color: #fff; font-size: 22rpx; text-align: center; box-sizing: border-box; }
.lv-card { padding: 28rpx 32rpx; }
.lv-top { display: flex; align-items: baseline; gap: 14rpx; }
.lv-big { font-size: 40rpx; font-weight: 900; font-style: italic; color: #d63a73; }
.lv-name { font-size: 28rpx; font-weight: 700; color: #1f1d24; }
.lv-exp { margin-left: auto; font-size: 22rpx; color: #9a93a3; }
.lv-bar { margin-top: 16rpx; height: 14rpx; border-radius: 7rpx; background: #f1eff3; overflow: hidden; }
.lv-fill { height: 100%; border-radius: 7rpx; background: linear-gradient(90deg, #ff8fb5, #d63a73); }
</style>
