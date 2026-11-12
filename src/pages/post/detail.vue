<template>
<!--pages/post/detail 帖子详情-->
<view v-if="loaded &amp;&amp; post" class="page">
  <!-- 帖子内容 -->
  <view class="card">
    <view class="card-top">
      <view class="badges">
        <view class="badge">{{post?.meta?.icon}} {{post?.meta?.name}}</view>
        <view v-if="post?.schoolName" class="badge badge-school">🏫 {{post?.schoolName}}</view>
      </view>
      <text class="ago">{{post?.ago}}</text>
    </view>
    <view class="card-title">{{post?.title}}</view>
    <view v-if="post?.stateLabel" :class="['state-banner', post?.closeReason === 'solved' ? 'state-ok' : '']">{{post?.stateLabel}}</view>
    <view v-if="post?.bountyLabel" class="reward-banner">{{post?.bountyLabel}}</view>
    <view v-if="post?.rewardLabel" class="reward-banner">{{post?.rewardLabel}}</view>
    <view class="card-content">{{post?.content}}</view>
    <k-translate :text="post?.content" />
    <view v-if="post?.images?.length" class="img-grid">
      <image v-for="(item, index) in post?.images" :key="item" class="img" :src="item" mode="aspectFill" @tap="onPreviewImage" :data-url="item" />
    </view>
    <view class="del-row">
      <text class="views">👁 {{post?.viewCount || 0}}</text>
      <view class="share-btn" @tap="onPoster">{{L?.poster}}</view>
      <view v-if="canSolve" class="close-btn close-ok" @tap="onClosePost('solved')">{{L?.solve}}</view>
      <view v-if="canClose" class="close-btn" @tap="onClosePost('manual')">{{L?.close}}</view>
      <view v-if="canReopen" class="close-btn" @tap="onReopenPost">{{L?.reopen}}</view>
      <view v-if="canDelete" class="del-btn" @tap="onDeletePost">{{L?.deletePost}}</view>
      <view v-else class="more-ic" @tap="onReportPost">···</view>
    </view>
  </view>

  <!-- 发布者（匿名板块不显示） -->
  <view v-if="publisher" class="card user-card">
    <image class="avatar" :src="publisher?.avatarUrl || defaultAvatar" mode="aspectFill" @tap="onTapAuthorAvatar" />
    <view class="user-main">
      <view class="user-name">{{publisher?.nickDisplay}}<k-lv :lv="publisher?.level || 0" /></view>
      <k-badges :items="publisher?.badges || []" />
      <view v-if="publisher?.ratingCount" class="user-rating">⭐ {{publisher?.rating}}</view>
      <view v-if="publisher?.signature" class="user-sig">{{publisher?.signature}}</view>
    </view>
    <view v-if="publisher?.uid" class="contact-chip" @tap.stop="onContactAuthor">{{L?.contactTA}}</view>
  </view>

  <!-- 评论区 -->
  <view class="card">
    <view class="card-head">{{L?.commentsHead}}</view>
    <view v-for="(item, index) in comments" :key="item._id" :class="['comment', item?.accepted ? 'comment-best' : '']">
      <image class="c-avatar" :src="item?.user?.avatarUrl || defaultAvatar" mode="aspectFill" @tap="goUser(item.user)" />
      <view class="c-main">
        <view class="c-top">
          <text class="c-name" @tap="goUser(item.user)">{{item?.nickDisplay}}</text><k-lv :lv="item?.user?.level || 0" />
          <text v-if="item?.accepted" class="c-best">✅ {{L?.bestAnswer}}</text>
          <text class="c-ago">{{item?.ago}}</text>
          <text :class="['c-like', item?.liked ? 'c-liked' : '']" :data-id="item?._id" @tap.stop="onLikeComment">{{item?.liked ? '♥' : '♡'}} {{item?.likeCount || ''}}</text>
          <text class="c-reply-btn" :data-id="item?._id" :data-name="item?.user?.nickname" @tap.stop="onReplyComment">{{L?.replyBtn}}</text>
          <text v-if="!item?.canDelete" class="c-more" :data-id="item?._id" @tap.stop="onReportComment">···</text>
        </view>
        <view class="c-content"><text v-if="item?.replyToName" class="c-reply">{{L?.replyPrefix}}{{item?.replyToNameDisplay}}{{L?.replySuffix}}</text>{{item?.content}}</view>
        <k-translate :text="item?.content" small />
      </view>
      <view v-if="canAccept &amp;&amp; !item?.canDelete" class="c-accept" @tap.stop="onAccept(item)">{{L?.accept}}</view>
      <view v-if="item?.canDelete" class="c-del" :data-id="item?._id" @tap.stop="onDeleteComment">✕</view>
    </view>
    <view v-if="!comments?.length" class="no-comment">{{L?.noComment}}</view>
  </view>

  <k-poster ref="poster" />

  <!-- 评论输入条 -->
  <view v-if="post?.closed" class="input-bar closed-bar">{{L?.closedTip}}</view>
  <view v-else class="input-bar">
    <view v-if="replyTo" class="reply-banner">
      {{L?.replyPrefix}}{{replyTo?.name}}
      <text class="reply-cancel" @tap.stop="onCancelReply">✕</text>
    </view>
    <input class="comment-input" :placeholder="replyTo ? L?.replyPrefix + replyTo?.name + L?.replySuffix : L?.commentPh" placeholder-class="ph" :value="commentText" @input="onCommentInput" confirm-type="send" @confirm="onSendComment" cursor-spacing="16" />
    <view :class="`send-btn ${commentText ? 'send-on' : ''}`" @tap="onSendComment">{{L?.send}}</view>
  </view>
  <view class="bar-space" />

</view>
</template>

<script>
import { openReport, userActions } from '@/utils/moderation.js';
import { localCurrency } from '@/utils/school-data.js';
import { definePage } from '@/utils/mp-compat.js';
import __m0_order_meta from '../../utils/order-meta.js';
import __m1_format from '../../utils/format.js';
import __m2_chat from '../../utils/chat.js';
import __m3_school_map from '../../utils/school-map.js';
import __m4_subscribe from '../../utils/subscribe.js';
import __m5_i18n from '../../utils/i18n.js';
import cloud, { callKrstuast, requireLogin } from '@/utils/cloud.js';
// pages/post/detail —— 帖子详情（内容 + 评论 + 删除）
const { funcMeta } = __m0_order_meta;
const { timeAgo } = __m1_format;
const { openChatWith } = __m2_chat;
const { schoolName } = __m3_school_map;
const { requestSubscribe } = __m4_subscribe;
const { t, tv, cloudMsg } = __m5_i18n;

export default definePage({
  data: {
    postId: '',
    post: null,
    publisher: null,
    canDelete: false,
    canAccept: false, canClose: false, canSolve: false, canReopen: false,
    comments: [],
    loaded: false,
    acting: false,
    commentText: '',
    replyTo: null, // 正在回复的评论 {id, name}
    L: {},
    defaultAvatar: '/static/avatar-default.png', // 1x1 透明占位，避免包内大图
  },

  onReportPost() {
    openReport('post', this.data.postId);
  },

  onReportComment(e) {
    openReport('comment', e.currentTarget.dataset.id);
  },

  onLoad(options) {
    this.setData({ postId: options.id || '' });
    uni.setNavigationBarTitle({ title: t('nav.postDetail') });
    this.setData({
      L: {
        deletePost: t('postDetail.deletePost'),
        accept: t('qa.accept'), bestAnswer: t('qa.accepted'), close: t('post.close'), solve: t('post.solve'), reopen: t('post.reopen'), closedTip: t('post.closedTip'),
        contactTA: t('orderDetail.contactTA'),
        commentsHead: t('postDetail.commentsHead', { n: 0 }),
        replyBtn: t('orderDetail.replyBtn'),
        report: t('report.action'),
        replyPrefix: t('orderDetail.replyPrefix'),
        replySuffix: t('orderDetail.replySuffix'),
        noComment: t('postDetail.noComment'),
        poster: t('poster.make'),
        commentPh: t('orderDetail.commentPh'),
        send: t('common.send'),
        deleteTitle: t('postDetail.deleteTitle'),
        deleteContent: t('postDetail.deleteContent'),
        deleteConfirm: t('orderDetail.deleteConfirm'),
        thinkAgain: t('orderDetail.thinkAgain'),
        commentDeleteTitle: t('orderDetail.commentDeleteTitle'),
        cancelText: t('common.no'), // 弹窗按钮 ≤4 字符(微信 API 限制)
      },
    });
  },

  onShow() {
    this.load();
  },

  load() {
    if (!this.data.postId) return;
    cloud
      .callFunction({ name: 'krstuast', data: { action: 'getPostDetail', postId: this.data.postId } })
      .then((res) => {
        const r = res.result || {};
        if (!r.success) {
          uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
          this.setData({ loaded: true });
          return;
        }
        const p = r.post;
        const rewardParts = [];
        if (p.rewardAmount) rewardParts.push(localCurrency() + p.rewardAmount);
        if (p.rewardText) rewardParts.push(p.rewardText);
        const publisher = r.publisher
          ? { ...r.publisher, nickDisplay: tv('sysNick', r.publisher.nickname) }
          : null;
        // 帖子状态:展示中(显示自动结束时间) / 已解决 / 已找回 / 已结束 / 已到期
        const closeAt = p.closeAt || 0;
        const stateLabel = p.closed
          ? (p.closeReason === 'solved' ? t(p.functionId === 'lostfound' ? 'post.closedFound' : 'post.closedSolved') : t(p.closeReason === 'expired' ? 'post.closedExpired' : 'post.closedManual'))
          : '';
        const bx = p.bountyExp || 0;
        const bountyLabel = !bx ? '' : p.bountyState === 'accepted' ? t('qa.bountyAccepted', { n: bx }) : p.bountyState === 'refunded' ? t('qa.bountyRefunded', { n: bx }) : t('qa.bountyOpen', { n: bx });
        const comments = (r.comments || []).slice().sort((a, b) => (b.accepted ? 1 : 0) - (a.accepted ? 1 : 0)); // 最佳答案置顶
        this.setData({
          post: {
            ...p,
            meta: funcMeta(p.functionId),
            ago: timeAgo(p.createdAt),
            schoolName: schoolName(p.schoolId),
            stateLabel,
            bountyLabel,
            closeAtText: closeAt && !p.closed ? t('post.autoClose', { d: new Date(closeAt).toLocaleDateString() }) : '',
            rewardLabel: rewardParts.length
              ? t(p.functionId === 'help' ? 'postDetail.rewardHelp' : 'postDetail.rewardBounty') + ' 🎁 ' + rewardParts.join(' + ')
              : '',
          },
          publisher,
          canDelete: r.canDelete,
          canAccept: !!r.canAccept, canClose: !!r.canClose, canSolve: !!r.canSolve, canReopen: !!r.canReopen,
          comments: comments.map((c) => ({
            ...c,
            ago: timeAgo(c.createdAt),
            nickDisplay: tv('sysNick', c.user && c.user.nickname),
            replyToNameDisplay: tv('sysNick', c.replyToName),
          })),
          allComments: [],
          'L.commentsHead': t('postDetail.commentsHead', { n: (r.comments || []).length }),
          loaded: true,
        });
      })
      .catch((e) => {
        console.error('post detail', e);
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
        this.setData({ loaded: true });
      });
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value });
  },

  onReplyComment(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({ replyTo: { id, name: name ? tv('sysNick', name) : '' } });
  },

  onCancelReply() {
    this.setData({ replyTo: null });
  },

  onSendComment() {
    const content = this.data.commentText.trim();
    if (!content) return uni.showToast({ title: t('common.writeSomething'), icon: 'none' });
    if (this.data.acting) return;
    const replyToId = this.data.replyTo ? this.data.replyTo.id : '';
    this.setData({ acting: true });
    cloud
      .callFunction({
        name: 'krstuast',
        data: { action: 'addComment', postId: this.data.postId, content, replyToId },
      })
      .then((res) => {
        this.setData({ acting: false });
        const r = res.result || {};
        if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
        this.setData({ commentText: '', replyTo: null });
        this.load();
        // 评论后申请订阅：帖主回复我时能收到微信通知
        if (!this.data.canDelete) requestSubscribe(['comment']);
      })
      .catch((e) => {
        console.error('comment', e);
        this.setData({ acting: false });
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
      });
  },

  onDeletePost() {
    const L = this.data.L;
    uni.showModal({
      title: L.deleteTitle,
      content: L.deleteContent,
      confirmText: L.deleteConfirm,
      cancelText: L.thinkAgain,
      confirmColor: '#d63a73',
      success: (res) => {
        if (!res.confirm) return;
        cloud
          .callFunction({ name: 'krstuast', data: { action: 'deletePost', postId: this.data.postId } })
          .then((r2) => {
            const r = r2.result || {};
            if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
            uni.showToast({ title: t('common.deleted'), icon: 'none' });
            setTimeout(() => uni.navigateBack(), 600);
          });
      },
    });
  },

  onDeleteComment(e) {
    const { id } = e.currentTarget.dataset;
    const L = this.data.L;
    uni.showModal({
      title: L.commentDeleteTitle,
      confirmText: L.deleteConfirm,
      cancelText: L.cancelText,
      confirmColor: '#d63a73',
      success: (res) => {
        if (!res.confirm) return;
        cloud
          .callFunction({ name: 'krstuast', data: { action: 'deleteComment', commentId: id } })
          .then((r2) => {
            const r = r2.result || {};
            if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
            this.load();
          });
      },
    });
  },

  // ---------- 采纳 / 结束 / 已找回 / 重新打开 ----------
  onAccept(item) {
    uni.showModal({
      title: t('qa.accept'),
      content: t('qa.acceptConfirm'),
      confirmColor: '#d63a73',
      success: (m) => {
        if (!m.confirm) return;
        callKrstuast({ action: 'acceptAnswer', postId: this.data.postId, commentId: item._id }).then((r2) => {
          const r = (r2 && r2.result) || {};
          uni.showToast({ title: r.success ? t('qa.acceptDone') : cloudMsg(r.message), icon: 'none' });
          if (r.success) this.load();
        });
      },
    });
  },

  onClosePost(reason) {
    uni.showModal({
      title: reason === 'solved' ? t('post.solve') : t('post.close'),
      content: reason === 'solved' ? t('post.solveConfirm') : t('post.closeConfirm'),
      confirmColor: '#d63a73',
      success: (m) => {
        if (!m.confirm) return;
        callKrstuast({ action: 'closePost', postId: this.data.postId, reason }).then((r2) => {
          const r = (r2 && r2.result) || {};
          if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
          this.load();
        });
      },
    });
  },

  onReopenPost() {
    callKrstuast({ action: 'reopenPost', postId: this.data.postId }).then((r2) => {
      const r = (r2 && r2.result) || {};
      if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
      this.load();
    });
  },

  onContactAuthor() {
    const u = this.data.publisher;
    if (u && u.uid) openChatWith(u.uid, u.nickname, { type: 'post', id: this.data.postId });
  },

  // 点头像 → 个人主页

  goUser(u) {
    if (u && u.uid) uni.navigateTo({ url: '/pages/profile/index?uid=' + u.uid });
  },

  onLikeComment(e) {
    const id = e.currentTarget.dataset.id;
    if (!requireLogin()) return;
    callKrstuast({ action: 'likeComment', commentId: id }).then((r) => {
      const ret = (r && r.result) || {};
      if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
      const fix = (list) => (list || []).map((c) => (c._id === id ? { ...c, liked: ret.liked, likeCount: Math.max(0, (c.likeCount || 0) + (ret.liked ? 1 : -1)) } : c));
      this.setData({ comments: fix(this.data.comments), allComments: fix(this.data.allComments) });
    });
  },

  onPoster() {
    const p = this.data.post || {};
    const u = this.data.publisher || {};
    this.$refs.poster.open({ refType: 'post', refId: p._id, title: p.title, content: p.content, author: u.nickname || t('poster.anon'), avatar: u.avatarUrl, image: (p.images || [])[0], tag: (p.meta && p.meta.name) || '' });
  },

  onTapAuthorAvatar() {
    const u = this.data.publisher;
    if (u && u.uid) uni.navigateTo({ url: '/pages/profile/index?uid=' + u.uid });
  },

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url;
    uni.previewImage({ urls: this.data.post.images, current: url });
  },
});

</script>

<style scoped>
/* pages/post/detail 帖子详情 */
.page {
  min-height: 100vh;
  padding: 24rpx 32rpx 32rpx;
  box-sizing: border-box;
}
.card {
  background: #ffffff;
  border-radius: 28rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(31, 29, 36, 0.05);
}
.card-head {
  font-size: 30rpx;
  font-weight: 700;
  color: #1f1d24;
  margin-bottom: 20rpx;
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.badges {
  display: flex;
  align-items: center;
}
.badge {
  font-size: 22rpx;
  color: #d63a73;
  background: #ffeef4;
  border-radius: 999rpx;
  padding: 6rpx 18rpx;
  font-weight: 600;
}
.badge-school {
  margin-left: 10rpx;
  background: #eae4ff;
  color: #7a6bc9;
  max-width: 260rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ago {
  font-size: 22rpx;
  color: #7a7383;
}
.card-title {
  margin-top: 16rpx;
  font-size: 36rpx;
  font-weight: 700;
  color: #1f1d24;
}
.card-content {
  margin-top: 16rpx;
  font-size: 28rpx;
  color: #1f1d24;
  line-height: 1.8;
  word-break: break-all;
  white-space: pre-wrap; /* 保留换行（美食推荐等结构化内容分行展示） */
}
.state-banner { margin-top: 16rpx; padding: 14rpx 24rpx; border-radius: 16rpx; background: #f3f0f5; color: #6e6878; font-size: 24rpx; font-weight: 700; }
.state-ok { background: #dff6ec; color: #3e8e6b; }
.close-btn { padding: 10rpx 26rpx; border-radius: 999rpx; background: #f1eff3; color: #4a4552; font-size: 24rpx; font-weight: 600; margin-left: 12rpx; }
.close-ok { background: #dff6ec; color: #3e8e6b; }
.comment-best { background: #f2fbf6; border-radius: 16rpx; }
.c-best { margin-left: 10rpx; padding: 2rpx 12rpx; border-radius: 8rpx; background: #dff6ec; color: #3e8e6b; font-size: 20rpx; font-weight: 700; }
.c-accept { align-self: flex-start; margin-left: 12rpx; padding: 6rpx 18rpx; border-radius: 999rpx; border: 2rpx solid #3e8e6b; color: #3e8e6b; font-size: 22rpx; flex-shrink: 0; }
.closed-bar { justify-content: center; color: #9a93a3; font-size: 26rpx; }
.reward-banner {
  margin-top: 16rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #b07f2e;
  background: #fff8e8;
  border-radius: 16rpx;
  padding: 14rpx 24rpx;
}
.img-grid {
  margin-top: 20rpx;
  display: flex;
  flex-wrap: wrap;
}
.img {
  width: 200rpx;
  height: 200rpx;
  border-radius: 16rpx;
  margin-right: 16rpx;
  margin-bottom: 16rpx;
}
.del-row {
  margin-top: 20rpx;
  display: flex;
  justify-content: flex-end;
}
.del-btn {
  font-size: 24rpx;
  color: #6e6878;
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  background: #f3f1f5;
}
.user-card {
  display: flex;
  align-items: center;
}
.avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: #ffeef4;
  margin-right: 20rpx;
}
.user-main {
  flex: 1;
  min-width: 0;
}
.user-name {
  font-size: 30rpx;
  font-weight: 700;
  color: #1f1d24;
}
.user-rating {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #7a7383;
}
.user-sig {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #6e6878;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.contact-chip {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #ffffff;
  background: #d63a73;
  border-radius: 999rpx;
  padding: 10rpx 22rpx;
  font-weight: 600;
}
.comment {
  display: flex;
  align-items: flex-start;
  padding: 20rpx 0;
  border-bottom: 2rpx solid #f3f1f5;
}
.comment:last-child {
  border-bottom: none;
}
.c-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #ffeef4;
  margin-right: 16rpx;
}
.c-main {
  flex: 1;
  min-width: 0;
}
.c-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.c-name {
  font-size: 24rpx;
  font-weight: 600;
  color: #6e6878;
}
.c-ago {
  font-size: 20rpx;
  color: #8a8494;
}
.c-content {
  margin-top: 8rpx;
  font-size: 28rpx;
  color: #1f1d24;
  line-height: 1.6;
  word-break: break-all;
}
.c-del {
  margin-left: 16rpx;
  font-size: 22rpx;
  color: #8a8494;
  padding: 4rpx;
}
.no-comment {
  text-align: center;
  font-size: 24rpx;
  color: #7a7383;
  padding: 12rpx 0;
}
.input-bar {
  position: fixed;
  left: var(--k-side, 0px);
  right: var(--k-side, 0px);
  bottom: 0;
  display: flex;
  flex-wrap: wrap; /* 回复横幅换行展示 */
  align-items: center;
  padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #ffffff;
  box-shadow: 0 -8rpx 32rpx rgba(31, 29, 36, 0.06);
  border-radius: 32rpx 32rpx 0 0;
  z-index: 50;
}
.comment-input {
  flex: 1;
  height: 72rpx;
  background: #f6f5f7;
  border-radius: 999rpx;
  padding: 0 28rpx;
  font-size: 26rpx;
  color: #1f1d24;
}
.ph {
  color: #8a8494;
}
.send-btn {
  margin-left: 16rpx;
  padding: 0 32rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 999rpx;
  background: #f3f1f5;
  color: #6e6878;
  font-size: 26rpx;
  font-weight: 700;
}
.send-on {
  background: #d63a73;
  color: #ffffff;
}
.bar-space {
  height: calc(140rpx + env(safe-area-inset-bottom));
}
.c-reply-btn {
  margin-left: 16rpx;
  font-size: 22rpx;
  color: #d63a73;
  padding: 2rpx 14rpx;
  background: #ffeef4;
  border-radius: 999rpx;
}
.c-reply {
  color: #7a6bc9;
}
.reply-banner {
  width: 100%;
  font-size: 24rpx;
  color: #7a6bc9;
  background: #eae4ff;
  border-radius: 16rpx;
  padding: 10rpx 20rpx;
  margin-bottom: 12rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}
.reply-cancel {
  color: #6e6878;
  padding: 0 8rpx;
}

.c-like { margin-left: auto; padding: 0 10rpx; font-size: 24rpx; color: #9a93a3; }
.c-liked { color: #e5484d; }
.c-more { padding: 0 8rpx 0 14rpx; font-size: 26rpx; color: #b3adbb; letter-spacing: 2rpx; }
.share-btn { padding: 10rpx 26rpx; border-radius: 999rpx; background: #fff0f5; color: #d63a73; font-size: 24rpx; font-weight: 600; }
.more-ic { padding: 6rpx 18rpx; border-radius: 999rpx; background: #f4f2f6; color: #8a8494; font-size: 26rpx; letter-spacing: 2rpx; }
.views { margin-right: auto; font-size: 22rpx; color: #9a93a3; }
</style>
