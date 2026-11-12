<template>
<!-- k-moment:一条动态(朋友圈样式)— 头像昵称 / 正文+翻译 / 九宫格图片 / 点赞 / 评论 -->
<view class="m">
  <image v-if="m.user.avatarUrl" class="av" :src="m.user.avatarUrl" mode="aspectFill" @tap="goUser(m.user)" />
  <view v-else class="av av-text" @tap="goUser(m.user)">{{ (m.user.nickname || '?').slice(0, 1) }}</view>
  <view class="body">
    <view class="nick" @tap="goUser(m.user)">{{ m.user.nickname }}<k-lv :lv="m.user.level || 0" /></view>
    <view v-if="m.content" class="text" @longpress="copy(m.content)">{{ m.content }}</view>
    <k-translate v-if="m.content" :text="m.content" small />
    <view v-if="m.images.length === 1" class="one">
      <image class="one-img" :src="thumb(m.images[0])" mode="widthFix" @tap="preview(0)" />
    </view>
    <view v-else-if="m.images.length" :class="['grid', m.images.length === 4 ? 'grid4' : '']">
      <image v-for="(img, i) in m.images" :key="img" class="cell" :src="thumb(img)" mode="aspectFill" @tap="preview(i)" />
    </view>
    <view class="bar">
      <text class="time">{{ ago }}</text>
      <text v-if="m.visibility !== 'public'" class="vis">{{ visLabel }}</text>
      <text v-if="m.mine" class="del" @tap="onDelete">{{ L.del }}</text>
      <view class="spacer" />
      <view class="act" @tap="onLike"><text :class="['heart', m.liked ? 'heart-on' : '']">{{ m.liked ? '♥' : '♡' }}</text><text v-if="m.likeCount" class="act-n">{{ m.likeCount }}</text></view>
      <view class="act" @tap="onComment()"><image class="ic" src="/static/icons/comment-6e6878.png" /><text v-if="m.commentCount" class="act-n">{{ m.commentCount }}</text></view>
      <view class="act more" @tap="onMore">···</view>
    </view>
    <view v-if="m.likeUsers.length || m.comments.length" class="box">
      <view v-if="m.likeUsers.length" class="likes">
        <text class="heart-s">♥ </text>
        <text v-for="(u, i) in m.likeUsers" :key="u.uid" class="lname" @tap="goUser(u)">{{ u.nickname }}{{ i < m.likeUsers.length - 1 ? '，' : '' }}</text>
      </view>
      <view v-if="m.likeUsers.length && m.comments.length" class="sep" />
      <view v-for="c in m.comments" :key="c._id" class="cm" hover-class="cm-hover" @tap="onTapComment(c)">
        <text class="cname" @tap.stop="goUser(c.user)">{{ c.user.nickname }}</text>
        <block v-if="c.replyToName"><text class="cre">{{ L.reply }}</text><text class="cname">{{ c.replyToName }}</text></block>
        <text class="ctext">：{{ c.content }}</text>
      </view>
    </view>
  </view>
</view>
</template>

<script>
import { callKrstuast, requireLogin, thumbUrl } from '@/utils/cloud.js';
import { openReport } from '@/utils/moderation.js';
import { timeAgo } from '@/utils/format.js';
import { t, cloudMsg } from '../../utils/i18n.js';

export default {
  props: {
    item: { type: Object, required: true },
  },
  emits: ['removed', 'poster'],
  data() {
    return { m: this.norm(this.item) };
  },
  watch: {
    item(v) {
      this.m = this.norm(v);
    },
  },
  computed: {
    ago() {
      return timeAgo(this.m.createdAt);
    },
    visLabel() {
      return this.m.visibility === 'friends' ? '👥 ' + t('moment.vis.friends') : '🔒 ' + t('moment.vis.private');
    },
    L() {
      return { del: t('moment.delete'), reply: t('moment.replyWord') };
    },
  },
  methods: {
    norm(v) {
      return { user: {}, images: [], likeUsers: [], comments: [], ...(v || {}) };
    },
    thumb(u) {
      return thumbUrl(u);
    },
    preview(i) {
      uni.previewImage({ urls: this.m.images, current: this.m.images[i] });
    },
    copy(text) {
      uni.setClipboardData({ data: text });
    },
    goUser(u) {
      if (u && u.uid) uni.navigateTo({ url: '/pages/profile/index?uid=' + u.uid });
    },
    fail(ret) {
      uni.showToast({ title: cloudMsg(ret.message) || t('common.networkError'), icon: 'none' });
    },
    onLike() {
      if (!requireLogin()) return;
      const m = this.m;
      callKrstuast({ action: 'likeMoment', momentId: m._id }).then((r) => {
        const ret = (r && r.result) || {};
        if (!ret.success) return this.fail(ret);
        m.liked = ret.liked;
        m.likeCount = Math.max(0, (m.likeCount || 0) + (ret.liked ? 1 : -1));
        const me = uni.getStorageSync('krstuast_me_brief') || null;
        if (ret.liked && me && me.uid) m.likeUsers = m.likeUsers.filter((u) => u.uid !== me.uid).concat(me);
        if (!ret.liked && me && me.uid) m.likeUsers = m.likeUsers.filter((u) => u.uid !== me.uid);
      });
    },
    onComment(reply) {
      if (!requireLogin()) return;
      uni.showModal({
        title: reply ? t('moment.replyTo', { name: reply.user.nickname || '' }) : t('moment.comment'),
        editable: true,
        placeholderText: t('moment.commentPh'),
        content: '',
        confirmText: t('moment.send'),
        confirmColor: '#D63A73',
        success: (res) => {
          const text = (res.content || '').trim();
          if (!res.confirm || !text) return;
          callKrstuast({ action: 'commentMoment', momentId: this.m._id, content: text.slice(0, 200), replyToId: reply ? reply._id : '' }).then((r) => {
            const ret = (r && r.result) || {};
            if (!ret.success) return this.fail(ret);
            const me = uni.getStorageSync('krstuast_me_brief') || { nickname: t('moment.me') };
            this.m.comments.push({ _id: ret.commentId, content: text, user: me, replyToName: ret.replyToName || '', mine: true, canDelete: true });
            this.m.commentCount += 1;
          });
        },
      });
    },
    onTapComment(c) {
      const items = [t('moment.reply')];
      if (c.canDelete) items.push(t('moment.delete'));
      else items.push(t('report.action'));
      uni.showActionSheet({
        itemList: items,
        success: (s) => {
          if (s.tapIndex === 0) return this.onComment(c);
          if (!c.canDelete) return openReport('comment', c._id);
          callKrstuast({ action: 'deleteMomentComment', commentId: c._id }).then((r) => {
            const ret = (r && r.result) || {};
            if (!ret.success) return this.fail(ret);
            this.m.comments = this.m.comments.filter((x) => x._id !== c._id);
            this.m.commentCount = Math.max(0, this.m.commentCount - 1);
          });
        },
        fail: () => {},
      });
    },
    onDelete() {
      uni.showModal({
        title: t('moment.deleteConfirm'),
        confirmColor: '#E5484D',
        success: (res) => {
          if (!res.confirm) return;
          callKrstuast({ action: 'deleteMoment', momentId: this.m._id }).then((r) => {
            const ret = (r && r.result) || {};
            if (!ret.success) return this.fail(ret);
            this.$emit('removed', this.m._id);
          });
        },
      });
    },
    onMore() {
      const items = [t('poster.make')].concat(this.m.mine ? [] : [t('report.action')]);
      uni.showActionSheet({
        itemList: items,
        success: (s) => {
          if (s.tapIndex === 1) return openReport('moment', this.m._id);
          this.$emit('poster', { refType: 'moment', refId: this.m._id, content: this.m.content, author: this.m.user.nickname, avatar: this.m.user.avatarUrl, image: this.m.images[0] || '' });
        },
        fail: () => {},
      });
    },
  },
};
</script>

<style scoped>
.m { display: flex; gap: 20rpx; padding: 28rpx; background: #ffffff; border-bottom: 2rpx solid #f0edf2; }
.av { flex: 0 0 84rpx; width: 84rpx; height: 84rpx; border-radius: 16rpx; background: #ffeef4; }
.av-text { display: flex; align-items: center; justify-content: center; color: #c22f66; font-size: 34rpx; font-weight: 700; }
.body { flex: 1; min-width: 0; }
.nick { font-size: 30rpx; font-weight: 600; color: #3e5f91; }
.text { margin-top: 8rpx; font-size: 30rpx; line-height: 1.6; color: #1f1d24; white-space: pre-wrap; word-break: break-all; }
.one { margin-top: 14rpx; }
.one-img { width: 360rpx; max-height: 480rpx; border-radius: 8rpx; background: #f0edf2; }
.grid { margin-top: 14rpx; display: flex; flex-wrap: wrap; gap: 8rpx; width: 540rpx; }
.grid4 { width: 360rpx; }
.cell { width: 174rpx; height: 174rpx; border-radius: 6rpx; background: #f0edf2; }
.bar { display: flex; align-items: center; gap: 16rpx; margin-top: 16rpx; }
.time { font-size: 24rpx; color: #9a93a3; }
.vis { font-size: 22rpx; color: #9a93a3; }
.del { font-size: 24rpx; color: #3e5f91; }
.spacer { flex: 1; }
.act { display: flex; align-items: center; gap: 6rpx; padding: 4rpx 10rpx; }
.act-n { font-size: 24rpx; color: #6e6878; }
.heart { font-size: 34rpx; line-height: 1; color: #6e6878; }
.heart-on { color: #e5484d; }
.ic { width: 34rpx; height: 34rpx; }
.more { font-size: 30rpx; color: #9a93a3; }
.box { margin-top: 14rpx; padding: 12rpx 16rpx; border-radius: 8rpx; background: #f6f5f7; font-size: 26rpx; line-height: 1.6; }
.likes { color: #3e5f91; }
.heart-s { color: #3e5f91; }
.lname { color: #3e5f91; font-weight: 500; }
.sep { height: 2rpx; margin: 8rpx 0; background: #e9e5ec; }
.cm { padding: 2rpx 0; word-break: break-all; }
.cm-hover { background: #ece8ef; }
.cname { color: #3e5f91; font-weight: 500; }
.cre { color: #1f1d24; margin: 0 6rpx; }
.ctext { color: #1f1d24; }
</style>
