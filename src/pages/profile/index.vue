<template>
<!--pages/profile 个人主页-->
<view v-if="loaded &amp;&amp; user" class="page">
  <!-- 用户资料卡 -->
  <view class="card head-card">
    <image class="avatar" :src="user?.avatarUrl || defaultAvatar" mode="aspectFill" />
    <view class="head-main">
      <view class="nick">{{fs.remark || user?.nickDisplay || L?.defaultNick}}<k-lv :lv="user?.level || 0" /></view>
      <view v-if="fs.remark" class="real-nick">{{L?.nickPrefix}}{{user?.nickDisplay}}</view>
      <view class="uid-line">{{L?.idPrefix}}{{user?.uid}} <text v-if="user?.ratingCount"> · ⭐ {{user?.rating}}</text></view>
      <view class="info-line">
        {{L?.publishPrefix}}{{user?.publishCount}}
        <text v-if="user?.schoolId"> · 🏫 {{schoolNameLabel}}</text>
      </view>
      <view v-if="user?.signature" class="sig">{{user?.signature}}</view>
      <k-badges :items="user?.badges || []" />
      <view class="tags-row">
        <text v-if="user?.gender" class="tag">{{user?.genderDisplay}}</text>
        <text v-if="user?.age" class="tag">{{user?.ageDisplay}}</text>
        <text v-if="user?.major" class="tag">{{user?.major}}</text>
        <text v-if="user?.hometown" class="tag">{{user?.hometown}}</text>
        <text v-if="user?.relationship" class="tag">{{user?.relationshipDisplay}}</text>
      </view>
    </view>
    <view class="head-actions">
      <view class="contact-btn" @tap="onContact" hover-class="contact-hover">{{L?.contactTA}}</view>
      <view v-if="friendLabel" :class="['friend-btn', fs.status === 'friend' || fs.status === 'pending_out' ? 'friend-btn-off' : '']" @tap="onFriend" hover-class="contact-hover">{{friendLabel}}</view>
    </view>
    <view class="more-ic" @tap="onUserMore">···</view>
  </view>

  <!-- TA 的动态 -->
  <view v-if="moments?.length" class="section">
    <view class="section-title">{{L?.momentsTitle}}</view>
    <view class="moments">
      <k-moment v-for="m in moments" :key="m._id" :item="m" @removed="onMomentRemoved" @poster="onMomentPoster" />
    </view>
    <view v-if="momentsMore" class="more-moments" @tap="loadMoments(true)">{{L?.loadMore}}</view>
  </view>

  <!-- TA 发布的任务 -->
  <view v-if="orders?.length" class="section">
    <view class="section-title">{{L?.ordersTitle}}</view>
    <view v-for="(item, index) in orders" :key="item._id" class="mini-card" :data-id="item?._id" @tap="onTapOrder" hover-class="mini-hover">
      <view class="mini-top">
        <text class="mini-badge">{{item?.meta?.icon}} {{item?.meta?.badgeName}}</text>
        <text class="mini-status" :style="`background: ${item?.sMeta?.bg}; color: ${item?.sMeta?.color};`">{{item?.sMeta?.label}}</text>
      </view>
      <view class="mini-title">{{item?.title}}</view>
      <view class="mini-foot">
        <text v-if="item?.summary?.text" class="mini-sum">{{item?.summary?.text}}</text>
        <text class="mini-ago">{{item?.ago}}</text>
      </view>
    </view>
  </view>

  <!-- TA 的帖子 -->
  <view v-if="posts?.length" class="section">
    <view class="section-title">{{L?.postsTitle}}</view>
    <view v-for="(item, index) in posts" :key="item._id" class="mini-card" :data-id="item?._id" @tap="onTapPost" hover-class="mini-hover">
      <view class="mini-top">
        <text class="mini-badge">{{item?.meta?.icon}} {{item?.meta?.name}}</text>
      </view>
      <view class="mini-title">{{item?.title}}</view>
      <view class="mini-preview">{{item?.preview}}</view>
      <view class="mini-foot"><text class="mini-ago">{{item?.ago}}</text></view>
    </view>
  </view>

  <view v-if="!orders?.length &amp;&amp; !posts?.length &amp;&amp; !moments?.length" class="empty-tip">{{L?.emptyTip}}</view>
  <k-poster ref="poster" />
</view>
</template>

<script>
import { openReport, userActions, confirmBlock } from '@/utils/moderation.js';
import { definePage } from '@/utils/mp-compat.js';
import __m0_order_meta from '../../utils/order-meta.js';
import __m1_format from '../../utils/format.js';
import __m2_chat from '../../utils/chat.js';
import __m3_school_map from '../../utils/school-map.js';
import __m4_i18n from '../../utils/i18n.js';
import cloud, { isGuest, callKrstuast, requireLogin } from '@/utils/cloud.js';
// pages/profile —— 用户个人主页（资料 + 联系TA + TA 发布的任务/帖子）
const { funcMeta, statusMetaOf, rewardLabel, summaryText, taskCategory } = __m0_order_meta;
const { timeAgo } = __m1_format;
const { openChatWith } = __m2_chat;
const { schoolName } = __m3_school_map;
const { t, tv, cloudMsg } = __m4_i18n;

export default definePage({
  data: {
    uid: '',
    user: null,
    orders: [],
    posts: [],
    loaded: false,
    fs: {},
    moments: [],
    momentsMore: false,
    friendLabel: '',
    L: {},
    defaultAvatar: '/static/avatar-default.png', // 1x1 透明占位，避免包内大图
  },

  onLoad(options) {
    this.setData({ uid: options.uid || '' });
    this.setData({
      L: {
        defaultNick: tv('sysNick', '微信用户'),
        idPrefix: t('profile.idPrefix'),
        publishPrefix: t('profile.publishPrefix'),
        contactTA: t('orderDetail.contactTA'),
        more: t('report.more'),
        ordersTitle: t('profile.ordersTitle', { n: 0 }),
        postsTitle: t('profile.postsTitle', { n: 0 }),
        emptyTip: t('profile.emptyTip'),
        nickPrefix: t('friends.nickPrefix'),
        momentsTitle: t('moment.profileTitle'),
        loadMore: t('moment.loadMore'),
      },
    });
    this.load();
    this.loadFriend();
    this.loadMoments(false);
  },

  loadMoments(more) {
    if (!this.data.uid) return;
    const skip = more ? this.data.moments.length : 0;
    callKrstuast({ action: 'getMoments', scope: 'user', uid: this.data.uid, skip, limit: 10 }).then((r) => {
      const ret = (r && r.result) || {};
      if (!ret.success) return;
      this.setData({ moments: (more ? this.data.moments : []).concat(ret.list || []), momentsMore: !!ret.hasMore });
    }).catch(() => {});
  },

  onMomentPoster(opts) {
    this.$refs.poster && this.$refs.poster.open(opts);
  },

  onMomentRemoved(id) {
    this.setData({ moments: this.data.moments.filter((m) => m._id !== id) });
  },

  loadFriend() {
    if (!this.data.uid || isGuest()) return;
    callKrstuast({ action: 'friendStatus', uid: this.data.uid }).then((r) => {
      const fs = (r && r.result) || {};
      if (!fs.success) return;
      const map = { friend: 'friends.isFriend', pending_out: 'friends.pending', pending_in: 'friends.respond', none: 'friends.add' };
      const label = fs.blocked || fs.status === 'friend' || !map[fs.status] || (fs.status === 'none' && fs.policy === 'none') ? '' : t(map[fs.status]);
      this.setData({ fs, friendLabel: label });
    }).catch(() => {});
  },

  onFriend() {
    const fs = this.data.fs || {};
    if (!requireLogin()) return;
    const done = (r) => {
      const ret = (r && r.result) || {};
      if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
      uni.showToast({ title: t(ret.status === 'friend' ? 'friends.added' : 'friends.sent'), icon: 'none' });
      this.loadFriend();
    };
    if (fs.status === 'pending_in') return callKrstuast({ action: 'respondFriendRequest', requestId: fs.requestId, accept: true }).then(done);
    if (fs.status === 'friend') return uni.navigateTo({ url: '/pages/friends/friends' });
    if (fs.status !== 'none') return;
    uni.showModal({
      title: t('friends.add'),
      editable: true,
      placeholderText: t('friends.msgPh'),
      content: '',
      confirmColor: '#D63A73',
      success: (m) => {
        if (!m.confirm) return;
        callKrstuast({ action: 'sendFriendRequest', uid: this.data.uid, msg: (m.content || '').slice(0, 50) }).then(done).catch(() => uni.showToast({ title: t('common.networkError'), icon: 'none' }));
      },
    });
  },

  load() {
    if (!this.data.uid) return;
    cloud
      .callFunction({ name: 'krstuast', data: { action: 'getUserHome', uid: this.data.uid } })
      .then((res) => {
        const r = res.result || {};
        if (!r.success) {
          uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
          this.setData({ loaded: true });
          return;
        }
        const u = r.user;
        this.setData({
          user: {
            ...u,
            nickDisplay: tv('sysNick', u.nickname),
            genderDisplay: tv('userGender', u.gender),
            ageDisplay: u.age ? t('common.ageYears', { n: u.age }) : '',
            orientationDisplay: tv('orientation', u.orientation),
            relationshipDisplay: tv('relationship', u.relationship),
            roleAttrDisplay: tv('roleAttr', u.roleAttr),
          },
          schoolNameLabel: schoolName(u.schoolId),
          orders: (r.orders || []).map((o) => ({
            ...o,
            meta: funcMeta(o.functionId),
            sMeta: statusMetaOf(o),
            reward: taskCategory(o.functionId).hasReward ? rewardLabel(o) : '',
            summary: summaryText(o),
            ago: timeAgo(o.createdAt),
          })),
          posts: (r.posts || []).map((p) => ({
            ...p,
            meta: funcMeta(p.functionId),
            ago: timeAgo(p.createdAt),
            preview: (p.content || '').replace(/\n/g, ' · ').slice(0, 50),
          })),
          'L.ordersTitle': t('profile.ordersTitle', { n: (r.orders || []).length }),
          'L.postsTitle': t('profile.postsTitle', { n: (r.posts || []).length }),
          loaded: true,
        });
        uni.setNavigationBarTitle({ title: t('nav.profile', { name: tv('sysNick', u.nickname) || t('common.classmate') }) });
      })
      .catch(() => {
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
        this.setData({ loaded: true });
      });
  },

  onUserMore() {
    const u = this.data.user || {};
    const isFriend = (this.data.fs || {}).status === 'friend';
    const items = (isFriend ? [t('friends.editRemark'), t('friends.remove')] : []).concat([t('report.reportUser'), t('block.action')]);
    uni.showActionSheet({
      itemList: items,
      success: (r) => {
        const k = isFriend ? r.tapIndex : r.tapIndex + 2;
        if (k === 0) return this.editRemark();
        if (k === 1) return uni.showModal({ title: t('friends.removeConfirm', { name: u.nickname || '' }), confirmColor: '#E5484D', success: (m) => m.confirm && callKrstuast({ action: 'removeFriend', uid: u.uid }).then(() => this.loadFriend()) });
        if (k === 2) return openReport('user', u.uid);
        if (k === 3) return confirmBlock(u.uid, u.nickname, () => uni.navigateBack());
      },
      fail: () => {},
    });
  },

  editRemark() {
    const u = this.data.user || {};
    uni.showModal({
      title: t('friends.editRemark'),
      editable: true,
      placeholderText: t('friends.remarkPh'),
      content: (this.data.fs || {}).remark || '',
      confirmColor: '#D63A73',
      success: (m) => {
        if (!m.confirm) return;
        callKrstuast({ action: 'setFriendRemark', uid: u.uid, remark: (m.content || '').trim() }).then((r) => {
          const ret = (r && r.result) || {};
          if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
          this.setData({ fs: { ...this.data.fs, remark: ret.remark } });
        });
      },
    });
  },

  onContact() {
    const u = this.data.user;
    if (u && u.uid) openChatWith(u.uid, u.nickname);
  },

  onTapOrder(e) {
    uni.navigateTo({ url: '/pages/order/detail?id=' + e.currentTarget.dataset.id });
  },

  onTapPost(e) {
    uni.navigateTo({ url: '/pages/post/detail?id=' + e.currentTarget.dataset.id });
  },
});

</script>

<style scoped>
/* pages/profile 个人主页 */
.page {
  min-height: 100vh;
  padding: 24rpx 32rpx calc(48rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.card {
  background: #ffffff;
  border-radius: 28rpx;
  padding: 28rpx;
  box-shadow: 0 8rpx 24rpx rgba(31, 29, 36, 0.05);
}
.head-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  margin-bottom: 24rpx;
}
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: #ffeef4;
  flex-shrink: 0;
  margin-right: 20rpx;
}
.head-main {
  flex: 1;
  min-width: 0;
}
.nick {
  font-size: 34rpx;
  font-weight: 700;
  color: #1f1d24;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.uid-line {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #7a7383;
}
.info-line {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #6e6878;
}
.sig {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #6e6878;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tags-row {
  margin-top: 10rpx;
  display: flex;
  flex-wrap: wrap;
}
.tag {
  font-size: 20rpx;
  color: #7a6bc9;
  background: #eae4ff;
  border-radius: 999rpx;
  padding: 4rpx 14rpx;
  margin-right: 8rpx;
  margin-bottom: 6rpx;
}
.contact-btn {
  flex-shrink: 0;
  padding: 12rpx 26rpx;
  border-radius: 999rpx;
  background: #d63a73;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 700;
}
.contact-hover {
  opacity: 0.85;
}
.section {
  margin-bottom: 24rpx;
}
.section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #1f1d24;
  margin: 8rpx 8rpx 16rpx;
}
.mini-card {
  background: #ffffff;
  border-radius: 24rpx;
  padding: 22rpx 26rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 6rpx 20rpx rgba(31, 29, 36, 0.04);
}
.mini-hover {
  opacity: 0.85;
}
.mini-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mini-badge {
  font-size: 22rpx;
  color: #d63a73;
  background: #ffeef4;
  border-radius: 999rpx;
  padding: 4rpx 16rpx;
  font-weight: 600;
}
.mini-status {
  font-size: 20rpx;
  border-radius: 999rpx;
  padding: 4rpx 14rpx;
  font-weight: 600;
}
.mini-title {
  margin-top: 12rpx;
  font-size: 28rpx;
  font-weight: 700;
  color: #1f1d24;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-preview {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #6e6878;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.mini-foot {
  margin-top: 10rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mini-sum {
  font-size: 22rpx;
  color: #625c6b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420rpx;
}
.mini-ago {
  font-size: 20rpx;
  color: #8a8494;
}
.empty-tip {
  text-align: center;
  font-size: 24rpx;
  color: #7a7383;
  padding: 60rpx 0;
}

.more-link { margin-top: 16rpx; text-align: center; font-size: 24rpx; color: #6e6878; }
.head-actions { flex-shrink: 0; display: flex; flex-direction: column; align-items: stretch; gap: 14rpx; }
.friend-btn { padding: 10rpx 26rpx; border-radius: 999rpx; border: 2rpx solid #d63a73; color: #d63a73; font-size: 24rpx; font-weight: 700; text-align: center; }
.friend-btn-off { border-color: #e3dfe7; color: #6e6878; }
.moments { border-radius: 28rpx; overflow: hidden; }
.more-moments { padding: 24rpx; text-align: center; font-size: 26rpx; color: #3e5f91; }
.more-ic { position: absolute; top: 12rpx; right: 20rpx; padding: 0 10rpx; font-size: 34rpx; line-height: 40rpx; color: #b3adbb; letter-spacing: 2rpx; }
.real-nick { margin-top: 4rpx; font-size: 22rpx; color: #9a93a3; }
.head-actions { margin-top: 36rpx; }
</style>
