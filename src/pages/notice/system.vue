<template>
<!-- pages/notice/system 系统通知:好友申请 / 通过 / 评论 / 回复 / @ / 点赞 -->
<view class="page">
  <view v-if="loaded && !list.length" class="empty">{{ L.empty }}</view>
  <view v-for="n in list" :key="n._id" :class="['item', n.read ? '' : 'unread']" hover-class="item-hover" @tap="open(n)">
    <image v-if="n.from && n.from.avatarUrl" class="av" :src="n.from.avatarUrl" mode="aspectFill" @tap.stop="goUser(n.from)" />
    <view v-else class="av av-text" @tap.stop="goUser(n.from)">{{ ((n.from && n.from.nickname) || '🔔').slice(0, 1) }}</view>
    <view class="main">
      <view class="title"><text class="nick">{{ (n.from && n.from.nickname) || L.system }}</text> {{ L.types[n.type] || '' }}</view>
      <view v-if="n.text" class="text">{{ n.text }}</view>
      <view class="time">{{ ago(n.createdAt) }}</view>
    </view>
    <view v-if="!n.read" class="dot" />
  </view>
  <view v-if="hasMore && list.length" class="more" @tap="load(false)">{{ L.more }}</view>
</view>
</template>

<script>
import { callKrstuast, requireLogin } from '@/utils/cloud.js';
import { timeAgo } from '@/utils/format.js';
import { t } from '../../utils/i18n.js';
import { refreshBadges } from '@/utils/badges.js';

export default {
  data() {
    return { list: [], loaded: false, hasMore: false, L: { types: {} } };
  },
  onShow() {
    if (!requireLogin()) return;
    uni.setNavigationBarTitle({ title: t('sysNotice.title') });
    const types = {};
    ['friend_request', 'friend_accept', 'comment', 'reply', 'mention', 'like', 'claimed', 'abandon', 'rider', 'picked', 'delivered', 'completed', 'released', 'joined', 'left', 'promoted', 'removed', 'hangout_cancelled', 'not_enough', 'want', 'sold_to', 'qa_accepted', 'qa_refund', 'school_ok', 'school_reject'].forEach((k) => (types[k] = t('sysNotice.type.' + k)));
    this.L = { empty: t('sysNotice.empty'), more: t('moment.loadMore'), system: t('sysNotice.system'), types };
    this.load(true);
  },
  onPullDownRefresh() {
    this.load(true).finally(() => uni.stopPullDownRefresh());
  },
  methods: {
    ago(ts) {
      return timeAgo(ts);
    },
    load(reset) {
      return callKrstuast({ action: 'getNotifications', skip: reset ? 0 : this.list.length })
        .then((r) => {
          const ret = (r && r.result) || {};
          if (!ret.success) return;
          this.list = (reset ? [] : this.list).concat(ret.list || []);
          this.hasMore = !!ret.hasMore;
          // 进入即视为已读(界面上保留本次的未读高亮)
          if (reset && this.list.some((n) => !n.read)) callKrstuast({ action: 'markNotificationsRead' }).then(() => refreshBadges(true));
        })
        .finally(() => (this.loaded = true));
    },
    goUser(u) {
      if (u && u.uid) uni.navigateTo({ url: '/pages/profile/index?uid=' + u.uid });
    },
    open(n) {
      n.read = true;
      if (n.type === 'friend_request') return uni.navigateTo({ url: '/pages/friends/friends?tab=requests' });
      if (n.type === 'friend_accept') return this.goUser(n.from);
      if (n.type === 'rider') return uni.navigateTo({ url: '/pages/rider/rider' });
      if (n.refType === 'post') return uni.navigateTo({ url: '/pages/post/detail?id=' + n.refId });
      if (n.refType === 'order') return uni.navigateTo({ url: '/pages/order/detail?id=' + n.refId });
      if (n.refType === 'moment') {
        const me = uni.getStorageSync('krstuast_me_brief') || {};
        if (me.uid) uni.navigateTo({ url: '/pages/profile/index?uid=' + me.uid });
      }
    },
  },
};
</script>

<style>
page { background: #f6f5f7; }
</style>
<style scoped>
.page { min-height: 100vh; padding: 24rpx; box-sizing: border-box; }
.empty { padding: 200rpx 0; text-align: center; color: #6e6878; font-size: 28rpx; }
.item { position: relative; display: flex; gap: 20rpx; padding: 26rpx; margin-bottom: 16rpx; background: #fff; border-radius: 24rpx; }
.unread { background: #fff7fa; }
.item-hover { opacity: 0.8; }
.av { flex: 0 0 80rpx; width: 80rpx; height: 80rpx; border-radius: 50%; background: #ffeef4; }
.av-text { display: flex; align-items: center; justify-content: center; color: #c22f66; font-weight: 700; font-size: 32rpx; }
.main { flex: 1; min-width: 0; }
.title { font-size: 28rpx; color: #3b3642; }
.nick { font-weight: 700; color: #1f1d24; }
.text { margin-top: 8rpx; font-size: 26rpx; color: #6e6878; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.time { margin-top: 8rpx; font-size: 22rpx; color: #9a93a3; }
.dot { position: absolute; top: 28rpx; right: 28rpx; width: 16rpx; height: 16rpx; border-radius: 50%; background: #e5484d; }
.more { padding: 28rpx; text-align: center; font-size: 26rpx; color: #3e5f91; }
</style>
