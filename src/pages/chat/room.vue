<template>
<!--pages/chat/room 聊天室-->
<view class="page">
  <view class="room-more" @tap="onRoomMore">···</view>
  <scroll-view class="msg-scroll" scroll-y :scroll-into-view="scrollInto" @scrolltoupper="loadOlder" enhanced :show-scrollbar="false">
    <view v-if="loadingOlder" class="older-tip">{{L?.loading}}</view>
    <view v-if="messages?.length >= total &amp;&amp; messages?.length > 0" class="older-tip">{{L?.noMore}}</view>

    <view v-for="(item, index) in messages" :key="item._id" class="msg">
      <view class="msg-time">{{item?.timeLabel}}</view>
      <view :class="`msg-row ${item?.mine ? 'msg-mine' : ''}`">
        <image v-if="!item?.mine" class="msg-avatar" :src="otherAvatar || defaultAvatar" mode="aspectFill" @tap="onTapOther" />
        <view class="bubble-col"><view class="bubble">{{item?.content}}</view><k-translate v-if="!item?.mine" :text="item?.content" small /></view>
      </view>
    </view>
    <view id="msg-bottom" class="msg-bottom" />
  </scroll-view>

  <!-- 输入条 -->
  <view class="input-bar">
    <input class="chat-input" :placeholder="L?.inputPh" placeholder-class="ph" :value="inputText" @input="onInput" confirm-type="send" @confirm="onSend" @focus="scrollToBottom" cursor-spacing="16" :adjust-position="true" />
    <view :class="`send-btn ${inputText ? 'send-on' : ''}`" @tap="onSend">{{L?.send}}</view>
  </view>
</view>
</template>

<script>
import { openReport, userActions, confirmBlock } from '@/utils/moderation.js';
import { callKrstuast } from '@/utils/cloud.js';
import { definePage } from '@/utils/mp-compat.js';
import __m0_format from '../../utils/format.js';
import __m1_subscribe from '../../utils/subscribe.js';
import __m2_i18n from '../../utils/i18n.js';
import cloud from '@/utils/cloud.js';
// pages/chat/room —— 聊天室（轮询拉新 + 上滑加载旧消息）
const { timeAgo } = __m0_format;
const { requestSubscribe } = __m1_subscribe;
const { t, cloudMsg } = __m2_i18n;

const PAGE_SIZE = 30;

export default definePage({
  data: {
    convId: '',
    name: '',
    otherAvatar: '',
    otherUid: '',
    messages: [],   // 正序
    total: 0,
    inputText: '',
    loadingOlder: false,
    sending: false,
    L: {},
    defaultAvatar: '/static/avatar-default.png', // 1x1 透明占位，避免包内大图
  },

  onTapOther() {
    if (this.data.otherUid) uni.navigateTo({ url: '/pages/profile/index?uid=' + this.data.otherUid });
  },

  onRoomMore() {
    const uid = this.data.otherUid;
    if (!uid) return;
    uni.showActionSheet({
      itemList: [t('chat.viewProfile'), t('friends.editRemark'), t('report.reportUser'), t('block.action')],
      success: (r) => {
        if (r.tapIndex === 0) return this.onTapOther();
        if (r.tapIndex === 2) return openReport('user', uid, { convId: this.data.convId });
        if (r.tapIndex === 3) return confirmBlock(uid, this.data.name, () => uni.navigateBack());
        uni.showModal({
          title: t('friends.editRemark'),
          editable: true,
          placeholderText: t('friends.remarkPh'),
          content: '',
          confirmColor: '#D63A73',
          success: (m) => {
            if (!m.confirm) return;
            callKrstuast({ action: 'setFriendRemark', uid, remark: (m.content || '').trim() }).then((x) => {
              const ret = (x && x.result) || {};
              if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
              const name = ret.remark || this.data.name;
              this.setData({ name });
              uni.setNavigationBarTitle({ title: name });
            });
          },
        });
      },
      fail: () => {},
    });
  },

  onLoad(options) {
    this.setData({
      convId: options.convId || '',
      name: decodeURIComponent(options.name || ''),
      L: {
        loading: t('common.loading'),
        noMore: t('chat.noMore'),
        inputPh: t('chat.inputPh'),
        send: t('common.send'),
      },
    });
  },

  onShow() {
    // 导航标题依赖 name,setData 异步,故在 onShow 里设置(语言切换 reLaunch 后也会重跑)
    uni.setNavigationBarTitle({ title: this.data.name || t('nav.chat') });
    this.pullLatest(true);
    this.markRead();
    // 实时推送(WebSocket):收到本会话新消息立即拉取;轮询降为 15 秒兜底(断线/小程序未配 socket 域名时)
    this._onMsg = (m) => {
      if (m && m.convId === this.data.convId) {
        this.pullLatest(false);
        this.markRead();
      }
    };
    uni.$on('kr:message', this._onMsg);
    this._timer = setInterval(() => this.pullLatest(false), 15000);
  },

  onHide() {
    if (this._timer) clearInterval(this._timer);
    if (this._onMsg) uni.$off('kr:message', this._onMsg);
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer);
    if (this._onMsg) uni.$off('kr:message', this._onMsg);
    this.markRead();
  },

  markRead() {
    if (!this.data.convId) return;
    cloud.callFunction({ name: 'krstuast', data: { action: 'markRead', convId: this.data.convId } }).catch(() => {});
  },

  // 拉最新一页；reset=true 整体刷新，false 增量合并
  pullLatest(reset) {
    if (!this.data.convId) return;
    cloud
      .callFunction({
        name: 'krstuast',
        data: { action: 'getMessages', convId: this.data.convId, skip: 0, limit: PAGE_SIZE },
      })
      .then((res) => {
        const r = res.result || {};
        if (!r.success) return;
        const rows = (r.list || []).map((m) => ({
          ...m,
          timeLabel: timeAgo(m.createdAt),
        }));
        if (reset) {
          this.setData(
            { messages: rows, total: r.total, otherAvatar: (r.other || {}).avatarUrl || '', otherUid: (r.other || {}).uid || '' },
            () => this.scrollToBottom()
          );
          return;
        }
        const old = this.data.messages;
        if (rows.length === old.length) {
          // 条数没变则不刷新（时间戳标签无需更新）
          return;
        }
        // 增量：以 _id 去重合并，保持正序
        const map = {};
        old.forEach((m) => {
          map[m._id] = m;
        });
        rows.forEach((m) => {
          map[m._id] = m;
        });
        const merged = Object.values(map).sort((a, b) => a.createdAt - b.createdAt);
        this.setData({ messages: merged, total: r.total }, () => this.scrollToBottom());
        this.markRead();
      })
      .catch(() => {});
  },

  loadOlder() {
    if (this.data.loadingOlder) return;
    if (this.data.messages.length >= this.data.total) return;
    this.setData({ loadingOlder: true });
    cloud
      .callFunction({
        name: 'krstuast',
        data: {
          action: 'getMessages',
          convId: this.data.convId,
          skip: this.data.messages.length,
          limit: PAGE_SIZE,
        },
      })
      .then((res) => {
        this.setData({ loadingOlder: false });
        const r = res.result || {};
        if (!r.success) return;
        const older = (r.list || []).map((m) => ({ ...m, timeLabel: timeAgo(m.createdAt) }));
        const map = {};
        this.data.messages.forEach((m) => {
          map[m._id] = m;
        });
        older.forEach((m) => {
          map[m._id] = m;
        });
        const merged = Object.values(map).sort((a, b) => a.createdAt - b.createdAt);
        this.setData({ messages: merged, total: r.total });
      })
      .catch(() => this.setData({ loadingOlder: false }));
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  onSend() {
    const content = this.data.inputText.trim();
    if (!content || this.data.sending) return;
    this.setData({ sending: true, inputText: '' });
    cloud
      .callFunction({
        name: 'krstuast',
        data: { action: 'sendMessage', convId: this.data.convId, content },
      })
      .then((res) => {
        this.setData({ sending: false });
        const r = res.result || {};
        if (!r.success) {
          this.setData({ inputText: content });
          return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
        }
        this.pullLatest(true);
        // 发消息后申请订阅：对方回我时能收到微信通知
        requestSubscribe(['chat']);
      })
      .catch(() => {
        this.setData({ sending: false, inputText: content });
        uni.showToast({ title: t('chat.sendFailed'), icon: 'none' });
      });
  },

  scrollToBottom() {
    // 同一个值重复设置不会再次滚动:先清空再设,保证每条新消息都滚到底
    this.setData({ scrollInto: '' });
    setTimeout(() => {
      this.setData({ scrollInto: 'msg-bottom' });
    }, 50);
  },

  noop() {},
});

</script>

<style scoped>
/* pages/chat/room 聊天室 */
.page {
  /* 不用 100vh:H5 里 100vh 包含导航栏和浏览器工具栏,会把输入框挤到屏幕外。
     改为固定铺满「导航栏以下、底部以上」的可视区域,输入框始终贴底可见 */
  position: fixed;
  top: var(--window-top, 0px);
  bottom: var(--window-bottom, 0px);
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.msg-scroll {
  flex: 1;
  min-height: 0;
  padding: 24rpx 24rpx 0;
  box-sizing: border-box;
}
.older-tip {
  text-align: center;
  font-size: 22rpx;
  color: #8a8494;
  padding: 12rpx 0;
}
.msg {
  margin-bottom: 24rpx;
}
.msg-time {
  text-align: center;
  font-size: 20rpx;
  color: #8a8494;
  margin-bottom: 12rpx;
}
.msg-row {
  display: flex;
  align-items: flex-start;
}
.msg-avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: #ffeef4;
  margin-right: 12rpx;
  flex-shrink: 0;
}
.bubble {
  max-width: 480rpx;
  padding: 18rpx 24rpx;
  border-radius: 24rpx;
  border-top-left-radius: 6rpx;
  background: #ffffff;
  color: #1f1d24;
  font-size: 28rpx;
  line-height: 1.6;
  word-break: break-all;
  box-shadow: 0 4rpx 16rpx rgba(31, 29, 36, 0.04);
}
.msg-mine {
  justify-content: flex-end;
}
.bubble-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 480rpx;
}
.msg-mine .bubble {
  background: #d63a73;
  color: #ffffff;
  border-radius: 24rpx;
  border-top-right-radius: 6rpx;
}
.msg-bottom {
  height: 8rpx;
}
.input-bar {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #ffffff;
  box-shadow: 0 -8rpx 32rpx rgba(31, 29, 36, 0.06);
  border-radius: 32rpx 32rpx 0 0;
  z-index: 50;
}
.chat-input {
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

.room-more { position: fixed; z-index: 20; top: calc(var(--window-top, 0px) + 12rpx); right: calc(var(--k-side, 0px) + 20rpx); width: 64rpx; height: 48rpx; line-height: 40rpx; text-align: center; border-radius: 24rpx; background: rgba(255, 255, 255, 0.85); color: #6e6878; font-size: 30rpx; letter-spacing: 2rpx; }
</style>
