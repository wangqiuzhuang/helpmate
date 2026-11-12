<template>
<!-- pages/friends 好友:好友列表 / 新的朋友 / 按 ID 添加 / 加好友设置 -->
<view class="page">
  <view class="search">
    <input class="search-input" v-model="kw" :placeholder="L.searchPh" :focus="autoFocus" confirm-type="search" @confirm="onSearch" @input="onKwInput" />
    <view class="search-btn" hover-class="btn-hover" @tap="onSearch">{{ L.searchGo }}</view>
  </view>

  <!-- 搜索结果:按 ID / 昵称 -->
  <block v-if="searched">
    <view class="sr-head"><text>{{ L.results }}</text><text class="sr-close" @tap="clearSearch">{{ L.close }}</text></view>
    <view v-if="!results.length" class="empty sr-empty">{{ L.notFound }}</view>
    <view v-else class="card sr-card">
      <view v-for="u in results" :key="u.uid" class="row" hover-class="row-hover" @tap="goProfile(u)">
        <image v-if="u.avatarUrl" class="avatar" :src="u.avatarUrl" mode="aspectFill" />
        <view v-else class="avatar avatar-text">{{ (u.nickname || '?').slice(0, 1) }}</view>
        <view class="main">
          <view class="nick">{{ u.nickname }}</view>
          <view class="sub">ID {{ u.uid }}</view>
        </view>
        <view v-if="u.status === 'friend'" class="btn btn-off">{{ L.isFriend }}</view>
        <view v-else-if="u.status === 'pending_out'" class="btn btn-off">{{ L.pending }}</view>
        <view v-else-if="u.status === 'pending_in'" class="btn btn-pri" hover-class="btn-hover" @tap.stop="acceptFromSearch(u)">{{ L.accept }}</view>
        <view v-else-if="u.policy !== 'none'" class="btn btn-pri" hover-class="btn-hover" @tap.stop="addFromSearch(u)">{{ L.add }}</view>
      </view>
    </view>
  </block>

  <view class="tabs">
    <view :class="['tab', tab === 'friends' ? 'tab-on' : '']" @tap="tab = 'friends'">{{ L.tabFriends }}<text v-if="friends.length" class="tab-n">{{ friends.length }}</text></view>
    <view :class="['tab', tab === 'requests' ? 'tab-on' : '']" @tap="tab = 'requests'">{{ L.tabRequests }}<text v-if="requests.length" class="dot">{{ requests.length }}</text></view>
    <view class="tab-set" @tap="onPolicy">⚙︎</view>
  </view>

  <block v-if="tab === 'friends'">
    <view v-if="loaded && !friends.length" class="empty">{{ L.empty }}</view>
    <view v-if="friends.length" class="card">
      <view v-for="u in friends" :key="u.uid" class="row" hover-class="row-hover" @tap="goProfile(u)" @longpress="onRemove(u)">
        <image v-if="u.avatarUrl" class="avatar" :src="u.avatarUrl" mode="aspectFill" />
        <view v-else class="avatar avatar-text">{{ (u.nickname || '?').slice(0, 1) }}</view>
        <view class="main">
          <view class="nick">{{ u.remark || u.nickname }}</view>
          <view class="sub">{{ u.remark ? u.nickname : u.signature || 'ID ' + u.uid }}</view>
        </view>
        <view class="btn btn-pri" hover-class="btn-hover" @tap.stop="chat(u)">{{ L.chat }}</view>
        <view class="more" @tap.stop="onRemove(u)">···</view>
      </view>
    </view>
  </block>

  <block v-else>
    <view v-if="loaded && !requests.length" class="empty">{{ L.reqEmpty }}</view>
    <view v-if="requests.length" class="card">
      <view v-for="r in requests" :key="r.requestId" class="row">
        <image v-if="r.user.avatarUrl" class="avatar" :src="r.user.avatarUrl" mode="aspectFill" @tap="goProfile(r.user)" />
        <view v-else class="avatar avatar-text" @tap="goProfile(r.user)">{{ (r.user.nickname || '?').slice(0, 1) }}</view>
        <view class="main" @tap="goProfile(r.user)">
          <view class="nick">{{ r.user.nickname }}</view>
          <view class="sub">{{ r.msg || 'ID ' + r.user.uid }}</view>
        </view>
        <view class="btn" hover-class="btn-hover" @tap="respond(r, false)">{{ L.reject }}</view>
        <view class="btn btn-pri" hover-class="btn-hover" @tap="respond(r, true)">{{ L.accept }}</view>
      </view>
    </view>
  </block>
</view>
</template>

<script>
import { callKrstuast, requireLogin } from '@/utils/cloud.js';
import { openChatWith } from '@/utils/chat.js';
import { t, cloudMsg } from '../../utils/i18n.js';

const POLICIES = ['verify', 'all', 'none'];

export default {
  data() {
    return { tab: 'friends', kw: '', friends: [], requests: [], loaded: false, searched: false, results: [], autoFocus: false, L: {} };
  },
  onLoad(o) {
    if (o && o.tab === 'requests') this.tab = 'requests';
    if (o && o.focus) this.autoFocus = true;
  },
  onShow() {
    if (!requireLogin()) return;
    uni.setNavigationBarTitle({ title: t('nav.friends') });
    const k = ['searchPh', 'searchGo', 'tabFriends', 'tabRequests', 'empty', 'reqEmpty', 'chat', 'accept', 'reject', 'results', 'close', 'notFound', 'isFriend', 'pending', 'add'];
    const L = {};
    k.forEach((x) => (L[x] = t('friends.' + x)));
    this.L = L;
    this.load();
  },
  onPullDownRefresh() {
    this.load().finally(() => uni.stopPullDownRefresh());
  },
  methods: {
    res(r) {
      return (r && r.result) || {};
    },
    toast(msg) {
      uni.showToast({ title: msg, icon: 'none' });
    },
    load() {
      return Promise.all([callKrstuast({ action: 'getFriends' }), callKrstuast({ action: 'getFriendRequests' })])
        .then(([a, b]) => {
          this.friends = this.res(a).list || [];
          this.requests = this.res(b).list || [];
          this.loaded = true;
        })
        .catch(() => {
          this.loaded = true;
          this.toast(t('common.networkError'));
        });
    },
    onSearch() {
      const keyword = (this.kw || '').trim();
      if (!keyword) return;
      uni.showLoading({ title: '' });
      callKrstuast({ action: 'searchUsers', keyword })
        .then((r) => {
          const ret = this.res(r);
          if (!ret.success) return this.toast(cloudMsg(ret.message));
          this.results = ret.list || [];
          this.searched = true;
        })
        .catch(() => this.toast(t('common.networkError')))
        .finally(() => uni.hideLoading());
    },
    onKwInput(e) {
      if (!e.detail.value) this.clearSearch();
    },
    clearSearch() {
      this.searched = false;
      this.results = [];
      this.kw = '';
    },
    addFromSearch(u) {
      uni.showModal({
        title: t('friends.add'),
        editable: true,
        placeholderText: t('friends.msgPh'),
        content: '',
        confirmColor: '#D63A73',
        success: (m) => {
          if (!m.confirm) return;
          callKrstuast({ action: 'sendFriendRequest', uid: u.uid, msg: (m.content || '').slice(0, 50) }).then((r) => {
            const ret = this.res(r);
            if (!ret.success) return this.toast(cloudMsg(ret.message));
            u.status = ret.status;
            this.toast(t(ret.status === 'friend' ? 'friends.added' : 'friends.sent'));
            if (ret.status === 'friend') this.load();
          });
        },
      });
    },
    acceptFromSearch(u) {
      callKrstuast({ action: 'respondFriendRequest', requestId: u.requestId, accept: true }).then((r) => {
        const ret = this.res(r);
        if (!ret.success) return this.toast(cloudMsg(ret.message));
        u.status = 'friend';
        this.toast(t('friends.accepted'));
        this.load();
      });
    },
    goProfile(u) {
      if (u && u.uid) uni.navigateTo({ url: '/pages/profile/index?uid=' + u.uid });
    },
    chat(u) {
      openChatWith(u.uid, u.remark || u.nickname);
    },
    respond(r, accept) {
      callKrstuast({ action: 'respondFriendRequest', requestId: r.requestId, accept }).then((x) => {
        const ret = this.res(x);
        if (!ret.success) return this.toast(cloudMsg(ret.message));
        this.toast(t(accept ? 'friends.accepted' : 'friends.rejected'));
        this.load();
      });
    },
    onRemove(u) {
      uni.showActionSheet({
        itemList: [t('friends.editRemark'), t('friends.remove')],
        success: (sel) => {
          if (sel.tapIndex === 0) return this.editRemark(u);
          uni.showModal({
            title: t('friends.removeConfirm', { name: u.nickname || '' }),
            confirmColor: '#E5484D',
            success: (m) => {
              if (!m.confirm) return;
              callKrstuast({ action: 'removeFriend', uid: u.uid }).then((x) => {
                const ret = this.res(x);
                if (!ret.success) return this.toast(cloudMsg(ret.message));
                this.toast(t('friends.removed'));
                this.friends = this.friends.filter((f) => f.uid !== u.uid);
              });
            },
          });
        },
        fail: () => {},
      });
    },
    editRemark(u) {
      uni.showModal({
        title: t('friends.editRemark'),
        editable: true,
        placeholderText: t('friends.remarkPh'),
        content: u.remark || '',
        confirmColor: '#D63A73',
        success: (m) => {
          if (!m.confirm) return;
          callKrstuast({ action: 'setFriendRemark', uid: u.uid, remark: (m.content || '').trim() }).then((x) => {
            const ret = this.res(x);
            if (!ret.success) return this.toast(cloudMsg(ret.message));
            u.remark = ret.remark;
            this.friends = this.friends.slice();
          });
        },
      });
    },
    onPolicy() {
      callKrstuast({ action: 'getFriendPolicy' }).then((r) => {
        const cur = this.res(r).policy || 'verify';
        uni.showActionSheet({
          title: t('friends.policy'),
          itemList: POLICIES.map((p) => (p === cur ? '✓ ' : '') + t('friends.policy.' + p)),
          success: (s) => {
            const policy = POLICIES[s.tapIndex];
            if (!policy || policy === cur) return;
            callKrstuast({ action: 'setFriendPolicy', policy }).then((x) => {
              const ret = this.res(x);
              this.toast(ret.success ? t('friends.policySaved') : cloudMsg(ret.message));
            });
          },
          fail: () => {},
        });
      });
    },
  },
};
</script>

<style>
page { background: #f6f5f7; }
</style>

<style scoped>
.page { min-height: 100vh; padding: 24rpx; box-sizing: border-box; background: #f6f5f7; color: #1f1d24; }
.search { display: flex; gap: 16rpx; margin-bottom: 20rpx; }
.search-input { flex: 1; height: 76rpx; padding: 0 28rpx; border-radius: 38rpx; background: #ffffff; font-size: 28rpx; }
.search-btn { flex: 0 0 auto; height: 76rpx; line-height: 76rpx; padding: 0 32rpx; border-radius: 38rpx; background: #d63a73; color: #fff; font-size: 28rpx; font-weight: 600; }
.tabs { display: flex; align-items: center; gap: 40rpx; padding: 8rpx 12rpx 20rpx; }
.tab { position: relative; font-size: 30rpx; color: #6e6878; padding-bottom: 8rpx; }
.tab-on { color: #1f1d24; font-weight: 700; border-bottom: 6rpx solid #d63a73; }
.tab-n { margin-left: 8rpx; font-size: 24rpx; color: #9a93a3; font-weight: 400; }
.dot { margin-left: 8rpx; padding: 0 12rpx; border-radius: 999rpx; background: #e5484d; color: #fff; font-size: 22rpx; }
.tab-set { margin-left: auto; font-size: 36rpx; color: #6e6878; padding: 0 8rpx; }
.empty { padding: 160rpx 40rpx; text-align: center; font-size: 28rpx; color: #6e6878; }
.card { background: #ffffff; border-radius: 32rpx; overflow: hidden; }
.row { display: flex; align-items: center; gap: 20rpx; padding: 24rpx 28rpx; border-bottom: 2rpx solid #f0edf2; }
.row:last-child { border-bottom: 0; }
.row-hover { background: #faf8fb; }
.avatar { flex: 0 0 88rpx; width: 88rpx; height: 88rpx; border-radius: 50%; background: #ffeef4; }
.avatar-text { display: flex; align-items: center; justify-content: center; color: #c22f66; font-size: 36rpx; font-weight: 700; }
.main { flex: 1; min-width: 0; }
.nick { font-size: 30rpx; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { margin-top: 4rpx; font-size: 24rpx; color: #6e6878; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn { flex: 0 0 auto; height: 60rpx; line-height: 56rpx; padding: 0 24rpx; border: 2rpx solid #e3dfe7; border-radius: 30rpx; font-size: 26rpx; color: #3b3642; box-sizing: border-box; }
.btn-pri { border-color: #d63a73; background: #d63a73; color: #fff; }
.btn-hover { opacity: 0.6; }
.more { flex: 0 0 auto; padding: 0 4rpx 0 8rpx; font-size: 30rpx; color: #9a93a3; }
.sr-head { display: flex; justify-content: space-between; padding: 4rpx 12rpx 16rpx; font-size: 26rpx; color: #6e6878; }
.sr-close { color: #3e5f91; }
.sr-card { margin-bottom: 28rpx; }
.sr-empty { padding: 60rpx 40rpx; }
.btn-off { border-color: #e3dfe7; color: #9a93a3; }
</style>
