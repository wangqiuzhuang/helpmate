<template>
<!-- k-feed 信息流列表(主页/探索共用) -->
<view class="feed">
  <view v-for="it in items" :key="it.key" :class="['row', it.done ? 'row-done' : '']" hover-class="row-hover" @tap="open(it)">
    <image v-if="it.thumb" class="thumb" :src="it.thumb" mode="aspectFill" lazy-load @error="it.thumb = it.full" />
    <view v-else class="thumb thumb-tile" :style="{ background: it.bg, color: it.fg }"><text :class="['tile-text', (it.tile || '').length > 5 ? 'tile-sm' : '']">{{ it.tile }}</text></view>
    <view class="row-main">
      <view class="row-title"><text v-if="it.done" class="done-tag">{{ doneLabel }}</text>{{ it.title }}</view>
      <view class="row-meta">{{ it.meta }}</view>
      <!-- 组队类:人数 + 加入 单独一行,不和浏览/评论挤在一起 -->
      <view v-if="it.join" class="join">
        <text class="join-n">👥 {{ it.join.n }}{{ it.join.total ? '/' + it.join.total : '' }}</text>
        <view v-if="it.join.state === 'open'" class="join-btn" hover-class="join-hover" @tap.stop="join(it)">{{ L.join }}</view>
        <text v-else-if="it.join.state === 'joined'" class="join-st join-in">{{ L.joined }}</text>
        <text v-else-if="it.join.state === 'full'" class="join-st">{{ L.full }}</text>
      </view>
      <view class="row-foot">
        <text class="row-extra">{{ it.extra }}</text>
        <text v-if="it.views > 0" class="row-views">👁 {{ it.views }}</text>
        <view v-if="it.comments > 0" class="row-cmt">
          <image class="ic14" src="/static/icons/comment-9a93a3.png" />
          <text>{{ it.comments }}</text>
        </view>
      </view>
      <view v-if="it.hot" class="hot"><text class="hot-tag">🔥{{ hotLabel }}</text><text class="hot-text">{{ it.hot.nickname }}：{{ it.hot.content }}</text></view>
    </view>
  </view>
  <slot />
</view>
</template>

<script>
import { openFeedItem } from '../../utils/feed.js';
import { t, cloudMsg } from '../../utils/i18n.js';
import { callKrstuast, requireLogin } from '../../utils/cloud.js';

export default {
  props: { items: { type: Array, default: () => [] } },
  computed: {
    hotLabel() {
      return t('feed.hot');
    },
    doneLabel() {
      return t('feed.done');
    },
    L() {
      return { join: t('feed.join'), joined: t('join.joined'), full: t('feed.full') };
    },
  },
  methods: {
    open(it) {
      openFeedItem(it);
    },
    // 一键加入:成功后就地更新人数,不用进详情
    join(it) {
      if (!requireLogin() || it._joining) return;
      it._joining = true;
      callKrstuast({ action: 'joinOrder', orderId: it.id })
        .then((r) => {
          const ret = (r && r.result) || {};
          if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
          if (ret.waitlisted) {
            uni.showToast({ title: t('join.waitlisted', { n: ret.pos }), icon: 'none' });
            it.join = { ...it.join, state: 'full' };
          } else {
            uni.showToast({ title: t('join.joined'), icon: 'none' });
            it.join = { ...it.join, n: it.join.n + 1, state: 'joined' };
          }
        })
        .catch(() => uni.showToast({ title: t('common.networkError'), icon: 'none' }))
        .finally(() => { it._joining = false; });
    },
  },
};
</script>

<style scoped>
.feed { margin: 0 24rpx; background: #ffffff; border-radius: 32rpx; overflow: hidden; }
.ic14 { width: 28rpx; height: 28rpx; }
.row { display: flex; gap: 24rpx; padding: 28rpx; border-bottom: 2rpx solid #f0edf2; }
.row-hover { background: #faf9fb; }
.thumb { flex: 0 0 152rpx; width: 152rpx; height: 152rpx; border-radius: 28rpx; }
.thumb-tile { display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 12rpx; box-sizing: border-box; overflow: hidden; }
.tile-text { font-size: 28rpx; font-weight: 700; line-height: 1.25; word-break: break-word; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.tile-sm { font-size: 22rpx; }
.row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
.row-title { font-size: 30rpx; font-weight: 500; line-height: 1.4; color: #1f1d24; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-all; }
.row-meta { font-size: 24rpx; color: #6e6878; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
.row-extra { font-size: 30rpx; font-weight: 700; color: #1f1d24; }
.row-cmt { display: flex; align-items: center; gap: 6rpx; font-size: 24rpx; color: #6e6878; }
.row-views { margin-left: auto; margin-right: 16rpx; font-size: 22rpx; color: #9a93a3; }
.hot { margin-top: 12rpx; padding: 10rpx 16rpx; border-radius: 14rpx; background: #fffaeb; font-size: 24rpx; color: #3b3642; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hot-tag { margin-right: 10rpx; color: #e0861a; font-weight: 800; font-style: italic; }
.row-done { opacity: 0.55; }
.join { display: flex; align-items: center; justify-content: space-between; gap: 14rpx; margin-top: 4rpx; }
.join-n { font-size: 24rpx; font-weight: 700; color: #5b45c2; }
.join-btn { padding: 8rpx 24rpx; border-radius: 999rpx; background: #d63a73; color: #fff; font-size: 24rpx; font-weight: 700; }
.join-hover { opacity: 0.8; }
.join-st { font-size: 22rpx; color: #9a93a3; }
.join-in { color: #3e8e6b; font-weight: 700; }
.done-tag { display: inline-block; margin-right: 10rpx; padding: 0 12rpx; border-radius: 8rpx; background: #e4e1e8; color: #6e6878; font-size: 20rpx; font-weight: 700; vertical-align: middle; }
</style>
