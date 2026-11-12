<template>
<!--pages/notice 消息中心（私聊会话列表）:左滑 已读/未读/删除 · 右上角 一键已读 / 批量操作 -->
<view class="page">
  <view v-if="guest" class="guest">
    <view class="guest-title">{{L.guestTitle}}</view>
    <view class="guest-sub">{{L.guestSub}}</view>
    <view class="guest-btn" @tap="goLogin">{{L.guestBtn}}</view>
  </view>

  <view v-if="!guest" class="toolbar">
    <text class="tb-hint">{{ unreadTotal ? L.unreadN.replace('{n}', unreadTotal) : '' }}</text>
    <view v-if="!batch" class="tb-btn" hover-class="tap-hover" @tap="onAllRead"><image class="tb-ic" src="/static/icons/brush-1f1d24.png" /></view>
    <view v-if="!batch" class="tb-btn" hover-class="tap-hover" @tap="enterBatch"><image class="tb-ic" src="/static/icons/list-checks-1f1d24.png" /></view>
    <view v-else class="tb-done" @tap="exitBatch">{{ L.done }}</view>
  </view>

  <view v-if="!guest && !batch" class="sys-row" hover-class="tap-hover" @tap="goSystem">
    <view class="sys-ic">🔔</view>
    <text class="sys-t">{{ L.system }}</text>
    <text v-if="sysUnread" class="sys-n">{{ sysUnread > 99 ? '99+' : sysUnread }}</text>
    <image class="sys-arr" src="/static/icons/chevright-9a93a3.png" />
  </view>
  <view v-if="!guest && !batch" class="sys-row" hover-class="tap-hover" @tap="goFriendReq">
    <view class="sys-ic sys-ic2">👋</view>
    <text class="sys-t">{{ L.newFriends }}</text>
    <text v-if="frUnread" class="sys-n">{{ frUnread > 99 ? '99+' : frUnread }}</text>
    <image class="sys-arr" src="/static/icons/chevright-9a93a3.png" />
  </view>

  <view v-for="item in list" :key="item.convId" class="conv-wrap">
    <view v-if="!batch" class="acts">
      <view class="act act-read" @tap="onSwipeRead(item)">{{ item.unread > 0 ? L.markRead : L.markUnread }}</view>
      <view class="act act-del" @tap="onSwipeDelete(item)">{{ L.del }}</view>
    </view>
    <view
      class="conv"
      :style="{ transform: 'translateX(' + (offsets[item.convId] || 0) + 'px)', transition: dragging === item.convId ? 'none' : 'transform 0.2s' }"
      @touchstart="onTouchStart($event, item)"
      @touchmove="onTouchMove($event, item)"
      @touchend="onTouchEnd(item)"
      @touchcancel="onTouchEnd(item)"
      @tap="onTapConv(item)"
    >
      <view v-if="batch" :class="['check', selected[item.convId] ? 'check-on' : '']">{{ selected[item.convId] ? '✓' : '' }}</view>
      <view class="avatar-wrap">
        <image class="avatar" :src="item.other.avatarUrl || defaultAvatar" mode="aspectFill" @tap.stop="onTapAvatar(item)" />
        <view v-if="item.unread > 0" class="unread-badge">{{item.unread > 99 ? '99+' : item.unread}}</view>
      </view>
      <view class="conv-main">
        <view class="conv-top">
          <text class="conv-name">{{item.nickDisplay}}</text>
          <text class="conv-ago">{{item.ago}}</text>
        </view>
        <view :class="['conv-last', item.unread > 0 ? 'conv-last-unread' : '']">{{item.lastMsg || L.startChat}}</view>
      </view>
    </view>
  </view>

  <view v-if="loaded && !guest && !list.length" class="empty">
    <view class="empty-emoji">💌</view>
    <view class="empty-title">{{L.emptyTitle}}</view>
    <view class="empty-sub">{{L.emptySub1}}<br />{{L.emptySub2}}</view>
  </view>

  <view v-if="batch" class="batch-bar">
    <view class="bb-all" @tap="toggleAll">{{ allSelected ? L.unselectAll : L.selectAll }}</view>
    <view class="bb-n">{{ L.selectedN.replace('{n}', selectedIds.length) }}</view>
    <view :class="['bb-btn', selectedIds.length ? '' : 'bb-off']" @tap="batchOp('read')">{{ L.markRead }}</view>
    <view :class="['bb-btn', 'bb-del', selectedIds.length ? '' : 'bb-off']" @tap="batchOp('delete')">{{ L.del }}</view>
  </view>
</view>
<k-tab-bar v-if="!batch" :selected="2" />
</template>

<script>
import { timeAgo } from '../../utils/format.js';
import { t, tv, cloudMsg } from '../../utils/i18n.js';
import { callKrstuast, isGuest } from '@/utils/cloud.js';
import { refreshBadges } from '@/utils/badges.js';

export default {
  data() {
    return {
      list: [],
      loaded: false,
      guest: false,
      batch: false,
      selected: {},
      offsets: {},
      dragging: '',
      sysUnread: 0,
      frUnread: 0,
      L: {},
      defaultAvatar: '/static/avatar-default.png',
    };
  },
  computed: {
    unreadTotal() {
      return this.list.reduce((n, c) => n + (c.unread > 0 ? c.unread : 0), 0);
    },
    selectedIds() {
      return this.list.filter((c) => this.selected[c.convId]).map((c) => c.convId);
    },
    allSelected() {
      return this.list.length > 0 && this.selectedIds.length === this.list.length;
    },
  },
  onShow() {
    uni.setNavigationBarTitle({ title: t('nav.notice') });
    const k = (x) => t('notice.' + x);
    this.L = {
      startChat: k('startChat'), emptyTitle: k('emptyTitle'), emptySub1: k('emptySub1'), emptySub2: k('emptySub2'),
      guestTitle: k('guestTitle'), guestSub: k('guestSub'), guestBtn: t('mine.guestBtn'),
      markRead: k('markRead'), markUnread: k('markUnread'), del: k('delete'), done: k('done'),
      system: t('sysNotice.title'), newFriends: t('friends.tabRequests'), selectAll: k('selectAll'), unselectAll: k('unselectAll'), selectedN: k('selectedN'), unreadN: k('unreadN'),
    };
    if (isGuest()) {
      this.guest = true;
      this.list = [];
      this.loaded = true;
      return;
    }
    this.guest = false;
    this.load();
    refreshBadges(true).then((s) => {
      this.sysUnread = s.notifications || 0;
      this.frUnread = s.friendRequests || 0;
    });
    // 新私聊到达时刷新会话列表(未读数、最后一条)
    if (!this._onMsg) {
      this._onMsg = () => this.load();
      uni.$on('kr:message', this._onMsg);
    }
  },
  onHide() {
    this.closeAll();
  },
  onPullDownRefresh() {
    if (this.guest) return uni.stopPullDownRefresh();
    this.load(() => uni.stopPullDownRefresh());
  },
  methods: {
    goFriendReq() {
      uni.navigateTo({ url: '/pages/friends/friends?tab=requests' });
    },
    goSystem() {
      uni.navigateTo({ url: '/pages/notice/system' });
    },
    onTapAvatar(item) {
      if (this.batch) return this.onTapConv(item);
      if (item.other && item.other.uid) uni.navigateTo({ url: '/pages/profile/index?uid=' + item.other.uid });
    },
    goLogin() {
      uni.navigateTo({ url: '/pages/login/login' });
    },
    toast(title) {
      uni.showToast({ title, icon: 'none' });
    },
    load(done) {
      callKrstuast({ action: 'getConversations' })
        .then((res) => {
          const r = (res && res.result) || {};
          if (!r.success) return this.toast(cloudMsg(r.message));
          this.list = (r.list || []).map((c) => ({
            ...c,
            other: c.other || {},
            ago: timeAgo(c.lastMsgAt),
            nickDisplay: (c.other && c.other.remark) || tv('sysNick', c.other && c.other.nickname),
          }));
        })
        .catch(() => this.toast(t('common.networkError')))
        .finally(() => {
          this.loaded = true;
          done && done();
        });
    },
    // ---- 左滑 ----
    actWidth() {
      return uni.upx2px(300);
    },
    closeAll(except) {
      const o = {};
      if (except && this.offsets[except]) o[except] = this.offsets[except];
      this.offsets = o;
    },
    onTouchStart(e, item) {
      if (this.batch) return;
      const p = e.touches[0];
      this._touch = { x: p.clientX, y: p.clientY, base: this.offsets[item.convId] || 0, dir: '' };
      this.closeAll(item.convId);
    },
    onTouchMove(e, item) {
      const s = this._touch;
      if (!s || this.batch) return;
      const p = e.touches[0];
      const dx = p.clientX - s.x;
      const dy = p.clientY - s.y;
      if (!s.dir) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        s.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (s.dir !== 'h') return;
      this.dragging = item.convId;
      const x = Math.min(0, Math.max(-this.actWidth(), s.base + dx));
      this.offsets = { ...this.offsets, [item.convId]: x };
    },
    onTouchEnd(item) {
      const s = this._touch;
      this._touch = null;
      this.dragging = '';
      if (!s || s.dir !== 'h') return;
      s.moved = true;
      this._justSwiped = Date.now();
      const x = this.offsets[item.convId] || 0;
      this.offsets = { ...this.offsets, [item.convId]: x < -this.actWidth() / 3 ? -this.actWidth() : 0 };
    },
    onTapConv(item) {
      if (this._justSwiped && Date.now() - this._justSwiped < 300) return;
      if (this.batch) {
        this.selected = { ...this.selected, [item.convId]: !this.selected[item.convId] };
        return;
      }
      if (this.offsets[item.convId]) return this.closeAll();
      uni.navigateTo({ url: `/pages/chat/room?convId=${item.convId}&name=${encodeURIComponent(item.nickDisplay || '')}` });
    },
    // ---- 操作 ----
    apply(op, ids) {
      if (!ids.length) return Promise.resolve();
      return callKrstuast({ action: 'convAction', op, convIds: ids }).then((r) => {
        const ret = (r && r.result) || {};
        if (!ret.success) return this.toast(cloudMsg(ret.message));
        const set = new Set(ids);
        if (op === 'delete') this.list = this.list.filter((c) => !set.has(c.convId));
        else this.list = this.list.map((c) => (set.has(c.convId) ? { ...c, unread: op === 'read' ? 0 : Math.max(1, c.unread || 0) } : c));
        uni.$emit('kr:unread-changed');
      });
    },
    onSwipeRead(item) {
      this.closeAll();
      this.apply(item.unread > 0 ? 'read' : 'unread', [item.convId]);
    },
    onSwipeDelete(item) {
      uni.showModal({
        title: t('notice.deleteConfirm'),
        content: t('notice.deleteTip'),
        confirmColor: '#E5484D',
        success: (m) => {
          this.closeAll();
          if (m.confirm) this.apply('delete', [item.convId]);
        },
      });
    },
    onAllRead() {
      if (!this.unreadTotal) return this.toast(t('notice.noUnread'));
      callKrstuast({ action: 'markAllRead' }).then((r) => {
        const ret = (r && r.result) || {};
        if (!ret.success) return this.toast(cloudMsg(ret.message));
        this.list = this.list.map((c) => ({ ...c, unread: 0 }));
        uni.$emit('kr:unread-changed');
        this.toast(t('notice.allReadDone'));
      });
    },
    enterBatch() {
      this.closeAll();
      this.selected = {};
      this.batch = true;
    },
    exitBatch() {
      this.batch = false;
      this.selected = {};
    },
    toggleAll() {
      const all = !this.allSelected;
      const s = {};
      if (all) this.list.forEach((c) => (s[c.convId] = true));
      this.selected = s;
    },
    batchOp(op) {
      const ids = this.selectedIds;
      if (!ids.length) return;
      const run = () => this.apply(op, ids).then(() => this.exitBatch());
      if (op !== 'delete') return run();
      uni.showModal({
        title: t('notice.deleteBatchConfirm', { n: ids.length }),
        content: t('notice.deleteTip'),
        confirmColor: '#E5484D',
        success: (m) => m.confirm && run(),
      });
    },
  },
};
</script>

<style scoped>
/* pages/notice 消息中心 */
.page { min-height: 100vh; padding: 8rpx 0 calc(160rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.tap-hover { opacity: 0.6; }
.toolbar { display: flex; align-items: center; gap: 8rpx; padding: 8rpx 32rpx 16rpx; }
.tb-hint { flex: 1; font-size: 24rpx; color: #8a8494; }
.tb-btn { width: 68rpx; height: 68rpx; border-radius: 34rpx; background: #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4rpx 12rpx rgba(31, 29, 36, 0.05); }
.tb-ic { width: 40rpx; height: 40rpx; }
.tb-done { padding: 12rpx 28rpx; border-radius: 34rpx; background: #1f1d24; color: #ffffff; font-size: 26rpx; font-weight: 600; }
.conv-wrap { position: relative; margin: 0 32rpx 20rpx; border-radius: 28rpx; overflow: hidden; }
.acts { position: absolute; top: 0; right: 0; bottom: 0; display: flex; }
.act { width: 150rpx; display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 26rpx; font-weight: 600; text-align: center; padding: 0 8rpx; box-sizing: border-box; }
.act-read { background: #3e5f91; }
.act-del { background: #e5484d; }
.conv { position: relative; display: flex; align-items: center; padding: 28rpx 32rpx; background: #ffffff; box-shadow: 0 8rpx 24rpx rgba(31, 29, 36, 0.05); }
.check { flex: 0 0 auto; width: 40rpx; height: 40rpx; line-height: 36rpx; margin-right: 20rpx; border-radius: 50%; border: 3rpx solid #d0cad6; text-align: center; color: #ffffff; font-size: 24rpx; font-weight: 700; box-sizing: border-box; }
.check-on { background: #d63a73; border-color: #d63a73; }
.avatar-wrap { position: relative; margin-right: 20rpx; }
.avatar { width: 96rpx; height: 96rpx; border-radius: 50%; background: #ffeef4; }
.unread-badge { position: absolute; top: -8rpx; right: -8rpx; min-width: 36rpx; height: 36rpx; line-height: 36rpx; text-align: center; padding: 0 8rpx; border-radius: 999rpx; background: #d63a73; color: #ffffff; font-size: 20rpx; font-weight: 700; box-sizing: border-box; }
.conv-main { flex: 1; min-width: 0; }
.conv-top { display: flex; align-items: center; justify-content: space-between; }
.conv-name { font-size: 30rpx; font-weight: 700; color: #1f1d24; }
.conv-ago { font-size: 22rpx; color: #8a8494; }
.conv-last { margin-top: 8rpx; font-size: 24rpx; color: #7a7383; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conv-last-unread { color: #1f1d24; font-weight: 600; }
.batch-bar { position: fixed; left: var(--k-side, 0px); right: var(--k-side, 0px); bottom: 0; z-index: 999; display: flex; align-items: center; gap: 20rpx; height: calc(120rpx + env(safe-area-inset-bottom)); padding: 0 32rpx env(safe-area-inset-bottom); background: #ffffff; border-top: 2rpx solid #edeaf0; box-sizing: border-box; }
.bb-all { font-size: 28rpx; color: #3e5f91; }
.bb-n { flex: 1; font-size: 24rpx; color: #8a8494; }
.bb-btn { height: 68rpx; line-height: 68rpx; padding: 0 30rpx; border-radius: 34rpx; background: #3e5f91; color: #ffffff; font-size: 26rpx; font-weight: 600; }
.bb-del { background: #e5484d; }
.bb-off { opacity: 0.4; }
.empty { padding: 180rpx 40rpx; display: flex; flex-direction: column; align-items: center; }
.empty-emoji { font-size: 110rpx; }
.empty-title { margin-top: 26rpx; font-size: 32rpx; font-weight: 700; color: #1f1d24; }
.empty-sub { margin-top: 14rpx; font-size: 24rpx; color: #7a7383; text-align: center; line-height: 1.8; }
.guest { margin: 120rpx 48rpx 0; padding: 56rpx 40rpx; background: #ffffff; border-radius: 32rpx; text-align: center; }
.guest-title { font-size: 34rpx; font-weight: 700; color: #1f1d24; }
.guest-sub { margin-top: 16rpx; font-size: 26rpx; color: #6e6878; line-height: 1.6; }
.guest-btn { margin: 40rpx auto 0; width: 280rpx; height: 84rpx; line-height: 84rpx; border-radius: 42rpx; background: #d63a73; color: #ffffff; font-size: 30rpx; font-weight: 700; }
.sys-row { display: flex; align-items: center; gap: 20rpx; margin: 0 32rpx 20rpx; padding: 26rpx 32rpx; background: #fff; border-radius: 28rpx; }
.sys-ic { width: 72rpx; height: 72rpx; line-height: 72rpx; text-align: center; border-radius: 50%; background: #fff4c2; font-size: 36rpx; }
.sys-t { flex: 1; font-size: 30rpx; font-weight: 700; color: #1f1d24; }
.sys-n { min-width: 36rpx; height: 36rpx; line-height: 36rpx; padding: 0 10rpx; border-radius: 18rpx; background: #e5484d; color: #fff; font-size: 22rpx; text-align: center; box-sizing: border-box; }
.sys-arr { width: 32rpx; height: 32rpx; }
.sys-ic2 { background: #e8f3ff; }
</style>
