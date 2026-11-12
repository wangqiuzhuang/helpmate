<template>
<!--pages/order/detail 订单详情（无状态流转：展示 → 私聊 → 下架）-->
<view v-if="loaded &amp;&amp; order" class="page">
  <!-- 状态横幅 -->
  <view class="status-banner" :style="`background: ${order?.sMeta?.bg};`">
    <text class="status-label" :style="`color: ${order?.sMeta?.color};`">{{order?.sMeta?.label}}</text>
  </view>

  <!-- 任务信息 -->
  <view class="card">
    <view class="card-title-row">
      <view class="card-title">{{order?.title}}</view>
      <view class="badges-row">
        <view v-if="order?.rentTag" class="rent-badge" :style="`background: ${order?.rentTag?.bg}; color: ${order?.rentTag?.color};`">{{order?.rentTag?.label}}</view>
        <view v-if="order?.gbTag" class="rent-badge" :style="`background: ${order?.gbTag?.bg}; color: ${order?.gbTag?.color};`">{{order?.gbTag?.label}}</view>
        <view v-if="order?.parttimeTag" class="rent-badge" :style="`background: ${order?.parttimeTag?.bg}; color: ${order?.parttimeTag?.color};`">{{order?.parttimeTag?.label}}</view>
        <view v-if="order?.homecookTag" class="rent-badge" :style="`background: ${order?.homecookTag?.bg}; color: ${order?.homecookTag?.color};`">{{order?.homecookTag?.label}}</view>
        <view class="func-badge">{{order?.meta?.icon}} {{order?.meta?.badgeName}}</view>
      </view>
    </view>
    <view v-if="order?.from || order?.to" class="info-route">
      <view class="route-line">
        <text class="route-tag">{{order?.routeTags?.fromTag}}</text>
        <text class="route-text">{{order?.from}}</text>
      </view>
      <view class="route-down">↓</view>
      <view class="route-line">
        <text class="route-tag route-tag-to">{{order?.routeTags?.toTag}}</text>
        <text class="route-text">{{order?.to}}</text>
      </view>
    </view>
    <view v-for="(item, index) in order?.payloadRows" :key="item.key" class="info-row">
      <text class="info-key">{{item?.label}}</text>
      <text class="info-val">{{item?.value}}</text>
    </view>
    <view v-if="order?.hasReward" class="info-row">
      <text class="info-key">{{L?.rewardLabel}}</text>
      <text class="info-val reward">{{order?.reward}}</text>
    </view>
    <view v-if="order?.deadlineLabel" class="info-row">
      <text class="info-key">{{order?.deadlineKey}}</text>
      <text class="info-val">{{order?.deadlineText}}</text>
    </view>
    <view v-if="order?.autoDelistLabel" class="info-row">
      <text class="info-key">{{L?.delistTimeLabel}}</text>
      <text class="info-val">{{order?.autoDelistText}}</text>
    </view>
    <view class="info-row">
      <text class="info-key">{{L?.createdAtLabel}}</text>
      <text class="info-val">{{order?.createdAtLabel}}</text>
    </view>
    <view v-if="order?.schoolName" class="info-row">
      <text class="info-key">{{L?.schoolLabel}}</text>
      <text class="info-val">{{order?.schoolName}}</text>
    </view>
    <view v-if="order?.desc" class="desc">{{L?.descLabel}}{{order?.desc}}</view>
    <k-translate v-if="order?.desc" :text="order?.desc" />
    <view v-if="order?.images?.length" class="img-grid">
      <image v-for="(item, index) in order?.images" :key="item" class="img" :src="item" mode="aspectFill" @tap="onPreviewImage" :data-url="item" />
    </view>
  </view>

  <!-- 组局卡片(拼车/凑单):名额 + 倒计时 + 加入 -->
  <view v-if="isJoin" class="card join-card">
    <view class="join-head">
      <text class="join-tag">{{L?.joinTag}} {{joinedN + 1}}{{targetN ? '/' + (targetN + 1) : ''}}</text>
      <text v-if="countdown" class="join-cd">⏱ {{countdown}}{{L?.cdSuffix}}</text>
    </view>
    <view class="slots">
      <view v-for="s in slots" :key="s.key" class="slot" @tap="onTapSlot(s)">
        <image v-if="s.uid" class="slot-av" :src="s.avatarUrl || defaultAvatar" mode="aspectFill" />
        <view v-else class="slot-av slot-empty">＋</view>
        <text :class="['slot-tag', s.isPub ? 'slot-pub' : '']">{{ s.isPub ? L?.organizer : s.uid ? s.nickname : L?.seat }}</text>
      </view>
    </view>
    <view v-if="minPeople" class="join-min">{{L?.minPrefix}}{{minPeople}}{{L?.minSuffix}}</view>
    <view v-if="order?.secret" class="secret"><text class="secret-k">🔒 {{L?.placeLabel}}</text><text class="secret-v" @longpress="copyText(order.secret)">{{order.secret}}</text></view>
    <view class="join-actions">
      <view class="share-btn" @tap="onPoster">{{L?.poster}}</view>
      <view v-if="canJoin" class="join-btn" @tap="onJoin">🤝 {{L?.joinBtn}}</view>
      <view v-else-if="canWait" class="join-btn join-wait" @tap="onJoin">⏳ {{L?.waitBtn}}{{ order?.waitCount ? '（' + order.waitCount + '）' : '' }}</view>
      <view v-else-if="order?.myWaitPos" class="leave-btn" @tap="onLeave">{{L?.waitingPrefix}}{{order.myWaitPos}} · {{L?.leaveWait}}</view>
      <view v-else-if="canLeave" class="leave-btn" @tap="onLeave">{{L?.leaveBtn}}</view>
    </view>
  </view>

  <!-- 闲置:我想要 → 私聊 → 当面交易;卖家 已预订 / 已售出(选买家) → 双方互评 -->
  <view v-if="isSecondhand" class="card listing-card">
    <view class="lc-head">
      <text class="lc-st" :style="`background: ${order?.sMeta?.bg}; color: ${order?.sMeta?.color};`">{{order?.sMeta?.label}}</text>
      <text class="lc-want">{{L?.wantN}}</text>
    </view>
    <view v-if="buyer" class="lc-buyer" @tap="goUser(buyer)">{{L?.soldTo}}</view>
    <block v-if="myRole === 'publisher' &amp;&amp; listingOpen">
      <view class="lc-sub">{{L?.wanters}}</view>
      <view v-if="!wanterList.length" class="lc-empty">{{L?.noWanters}}</view>
      <view class="lc-ws">
        <view v-for="w in wanterList" :key="w.uid" class="lc-w" @tap="onChatWanter(w)">
          <image class="lc-av" :src="w.avatarUrl || defaultAvatar" mode="aspectFill" />
          <text class="lc-wn">{{w.nickname}}</text>
        </view>
      </view>
      <view class="lc-actions">
        <view class="lc-btn lc-sec" @tap="onReserve">{{order?.reserved ? L?.unreserve : L?.reserve}}</view>
        <view class="lc-btn" @tap="onMarkSold">{{L?.markSold}}</view>
      </view>
    </block>
    <view v-else-if="myRole !== 'publisher' &amp;&amp; listingOpen" class="lc-actions">
      <view class="lc-btn" @tap="onWant">🙋 {{L?.want}}</view>
    </view>
    <view v-if="canRate" class="lc-actions"><view class="lc-btn lc-sec" @tap="onRate">⭐ {{L?.rate}}</view></view>
    <view v-else-if="rated" class="lc-rated">{{L?.rated}}</view>
  </view>

  <!-- 防骗提醒(帮取/帮送/闲置/租房/兼职) -->
  <view v-if="fraudTip" class="fraud">
    <text class="fraud-t">⚠️ {{L?.fraudTitle}}</text>
    <text class="fraud-c">{{fraudTip}}</text>
  </view>

  <!-- 接单(帮取/帮送):待接 → 已接 → 已取件 → 已送达 → 完成 -->
  <view v-if="isClaim" class="card claim-card">
    <view class="claim-head">
      <text class="claim-title">{{L?.claimTitle}}</text>
      <text :class="['claim-st', 'st-' + claimSt]">{{claimStatusText}}</text>
    </view>
    <view class="steps">
      <view v-for="(sp, i) in steps" :key="sp.key" :class="['step', sp.on ? 'step-on' : '']">
        <view v-if="i < steps.length - 1" :class="['step-line', steps[i + 1].on ? 'line-on' : '']" />
        <view class="step-dot">{{ sp.on ? '✓' : i + 1 }}</view><text class="step-t">{{ sp.label }}</text>
      </view>
    </view>
    <view v-if="helper" class="claim-helper" @tap="goUser(helper)">
      <image class="claim-av" :src="helper.avatarUrl || defaultAvatar" mode="aspectFill" />
      <view class="claim-hmain">
        <view class="claim-hname">{{helper.nickname}}<k-lv :lv="helper.level || 0" /></view>
        <view class="claim-hsub">{{L?.helperChip}} · {{L?.doneN}}{{helper.doneCount || 0}}</view>
      </view>
      <view v-if="myRole === 'publisher'" class="contact-chip" @tap.stop="onContactHelper">{{L?.contactTA}}</view>
    </view>
    <!-- 私密信息:仅发布人/接单人可见 -->
    <view v-if="order?.secret" class="secret"><text class="secret-k">🔒 {{L?.secretLabel}}</text><text class="secret-v" @longpress="copyText(order.secret)">{{order.secret}}</text></view>
    <!-- 收件码:仅发布人可见 -->
    <view v-if="order?.handoverCode &amp;&amp; ['claimed', 'picked'].includes(claimSt)" class="code-box">
      <text class="code-k">{{L?.codeLabel}}</text>
      <text class="code-v">{{order.handoverCode}}</text>
      <text class="code-tip">{{L?.codeTip}}</text>
    </view>
    <!-- 交付照片 -->
    <view v-if="order?.pickPhoto || order?.deliverPhoto" class="photos">
      <view v-if="order?.pickPhoto" class="ph"><image class="ph-img" :src="order.pickPhoto" mode="aspectFill" @tap="previewOne(order.pickPhoto)" /><text class="ph-t">{{L?.pickPhoto}}</text></view>
      <view v-if="order?.deliverPhoto" class="ph"><image class="ph-img" :src="order.deliverPhoto" mode="aspectFill" @tap="previewOne(order.deliverPhoto)" /><text class="ph-t">{{L?.deliverPhoto}}</text></view>
    </view>
    <view class="claim-actions">
      <view v-if="claimSt === 'pending' &amp;&amp; myRole !== 'publisher'" class="claim-btn" @tap="onClaim">🛵 {{L?.claimBtn}}</view>
      <block v-if="myRole === 'helper'">
        <view v-if="claimSt === 'claimed'" class="claim-btn" @tap="onPicked">📦 {{L?.pickedBtn}}</view>
        <view v-if="claimSt === 'claimed' || claimSt === 'picked'" :class="['claim-btn', claimSt === 'claimed' ? 'claim-sec' : '']" @tap="onDeliver">✅ {{L?.deliverBtn}}</view>
        <view v-if="claimSt === 'claimed'" class="abandon-btn" @tap="onAbandon">{{L?.abandonBtn}}</view>
      </block>
      <view v-if="myRole === 'publisher' &amp;&amp; ['claimed', 'picked'].includes(claimSt)" class="abandon-btn" @tap="onRelease">{{L?.releaseBtn}}</view>
      <view v-if="myRole === 'publisher' &amp;&amp; ['claimed', 'picked', 'delivered'].includes(claimSt)" :class="['claim-btn', claimSt === 'delivered' ? '' : 'claim-sec']" @tap="onConfirmDone">{{claimSt === 'delivered' ? L?.confirmReceived : L?.confirmDone}}</view>
    </view>
    <view v-if="claimSt === 'delivered'" class="claim-tip">{{myRole === 'publisher' ? L?.deliveredTipPub : L?.deliveredTipHelper}}</view>
    <view v-else-if="myRole === 'helper' &amp;&amp; claimSt === 'picked'" class="claim-tip">{{L?.pickedTip}}</view>
    <view v-else-if="myRole === 'helper' &amp;&amp; ['claimed', 'picked'].includes(claimSt)" class="claim-tip">{{L?.helperTip}}</view>
  </view>

  <!-- 发布人 -->
  <view class="card user-card">
    <image class="avatar" :src="publisher?.avatarUrl || defaultAvatar" mode="aspectFill" @tap="onTapPublisherAvatar" />
    <view class="user-main">
      <view class="user-name">{{publisher?.nickDisplay}}<k-lv :lv="publisher?.level || 0" /></view>
      <k-badges :items="publisher?.badges || []" />
      <view class="user-rating">
        <text v-if="publisher?.ratingCount">⭐ {{publisher?.rating}} · </text>
        <text>{{L?.publishPrefix}}{{publisher?.publishCount}}</text>
      </view>
      <view v-if="publisher?.signature" class="user-sig">{{publisher?.signature}}</view>
    </view>
    <view class="right-chips">
      <view class="role-chip">{{L?.publisherChip}}</view>
      <view v-if="myRole !== 'publisher' &amp;&amp; publisher?.uid" class="contact-chip" @tap.stop="onContactPublisher">{{L?.contactTA}}</view>
    </view>
    <!-- 发布人操作：编辑/下架仅展示中可用；已下架可重新上架；删除任何时候可用 -->
    <view v-if="order?.canDelete" class="pub-actions">
      <view v-if="order?.canDelist" class="pub-action pub-edit" @tap="onEdit" hover-class="pub-action-hover">{{L?.editBtn}}</view>
      <view class="pub-action" @tap="onDelete" hover-class="pub-action-hover">{{L?.deleteBtn}}</view>
      <view v-if="order?.canRelist" class="pub-action" @tap="onRelist" hover-class="pub-action-hover">{{L?.relistBtn}}</view>
      <view v-if="order?.canDelist" class="pub-action" @tap="onCancel" hover-class="pub-action-hover">{{L?.delistBtn}}</view>
    </view>
    <view v-else class="pub-actions">
      <view class="share-btn" @tap="onPoster">{{L?.poster}}</view>
      <view class="more-ic" @tap="onReportOrder">···</view>
    </view>
  </view>

  <!-- 评论区 -->
  <view class="card">
    <view class="card-head">{{L?.commentsHead}}</view>
    <view v-if="isJoin" class="ctabs">
      <view :class="['ctab', ctab === 'public' ? 'ctab-on' : '']" @tap="switchCtab('public')">{{L?.tabAsk}}</view>
      <view :class="['ctab', ctab === 'members' ? 'ctab-on' : '']" @tap="switchCtab('members')">{{L?.tabMembers}}</view>
    </view>
    <view v-if="isJoin && ctab === 'members' && !isMember" class="no-comment">{{L?.membersOnly}}</view>
    <view v-for="(item, index) in comments" :key="item._id" class="comment">
      <image class="c-avatar" :src="item?.user?.avatarUrl || defaultAvatar" mode="aspectFill" @tap="goUser(item.user)" />
      <view class="c-main">
        <view class="c-top">
          <text class="c-name" @tap="goUser(item.user)">{{item?.nickDisplay}}</text><k-lv :lv="item?.user?.level || 0" />
          <text class="c-ago">{{item?.ago}}</text>
          <text :class="['c-like', item?.liked ? 'c-liked' : '']" :data-id="item?._id" @tap.stop="onLikeComment">{{item?.liked ? '♥' : '♡'}} {{item?.likeCount || ''}}</text>
          <text class="c-reply-btn" :data-id="item?._id" :data-name="item?.user?.nickname" @tap.stop="onReplyComment">{{L?.replyBtn}}</text>
          <text v-if="!item?.canDelete" class="c-more" :data-id="item?._id" @tap.stop="onReportComment">···</text>
        </view>
        <view class="c-content"><text v-if="item?.replyToName" class="c-reply">{{L?.replyPrefix}}{{item?.replyToNameDisplay}}{{L?.replySuffix}}</text>{{item?.content}}</view>
        <k-translate :text="item?.content" small />
      </view>
      <view v-if="item?.canDelete" class="c-del" :data-id="item?._id" @tap.stop="onDeleteComment">✕</view>
    </view>
    <view v-if="!comments?.length" class="no-comment">{{L?.noComment}}</view>
  </view>

  <k-poster ref="poster" />

  <!-- 评论输入条 -->
  <view class="input-bar">
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
import { definePage } from '@/utils/mp-compat.js';
import __m0_order_meta from '../../utils/order-meta.js';
import __m1_format from '../../utils/format.js';
import __m2_chat from '../../utils/chat.js';
import __m3_school_map from '../../utils/school-map.js';
import __m4_subscribe from '../../utils/subscribe.js';
import __m5_i18n from '../../utils/i18n.js';
import cloud, { callKrstuast, requireLogin } from '@/utils/cloud.js';
// pages/order/detail —— 订单详情（无状态流转：展示 → 私聊 → 发布人下架）
const { flowOf, funcMeta, statusMetaOf, rewardLabel, payloadRows, taskCategory, rentTagOf, gbTagOf, parttimeTagOf, homecookTagOf, isVisibleOf, isExpiredOf } = __m0_order_meta;
const { fmtDeadline, timeAgo } = __m1_format;
const claimStOf = (o) => (o.status === 'done' ? 'done' : o.status === 'cancelled' || !isVisibleOf(o) ? 'cancelled' : o.helperId ? (['picked', 'delivered'].includes(o.claimState) ? o.claimState : 'claimed') : 'pending');
const FRAUD_KEYS = { hangout: 'meetup', carpool: 'meetup', pickup: 'errand', delivery: 'errand', secondhand: 'trade', housing: 'housing', parttime: 'job' };
const { openChatWith } = __m2_chat;
const { schoolName } = __m3_school_map;
const { requestSubscribe } = __m4_subscribe;
const { t, tv, cloudMsg } = __m5_i18n;

export default definePage({
  data: {
    orderId: '',
    order: null,
    publisher: null,
    myRole: 'other', // publisher / other
    loaded: false,
    acting: false,
    comments: [],     // 订单评论
    allComments: [],
    isClaim: false, steps: [], claimSt: 'pending', helper: null, myConfirmed: false, fraudTip: '', claimStatusText: '',
    canWait: false, minPeople: 0,
    isSecondhand: false, listingOpen: false, wanterList: [], buyer: null, canRate: false, rated: false,
    isJoin: false, slots: [], targetN: 0, joinedN: 0, isMember: false, canJoin: false, canLeave: false, countdown: '', ctab: 'public',
    commentText: '',
    replyTo: null,    // 正在回复的评论 {id, name}
    L: {},
    defaultAvatar: '/static/avatar-default.png', // 1x1 透明占位，避免包内大图
  },

  onReportOrder() {
    openReport('order', this.data.orderId);
  },

  onReportComment(e) {
    openReport('comment', e.currentTarget.dataset.id);
  },

  onLoad(options) {
    this.setData({ orderId: options.id || '' });
    uni.setNavigationBarTitle({ title: t('nav.orderDetail') });
    this.setData({
      L: {
        rewardLabel: t('orderDetail.rewardLabel'),
        delistTimeLabel: t('orderDetail.delistTimeLabel'),
        createdAtLabel: t('orderDetail.createdAtLabel'),
        schoolLabel: t('orderDetail.schoolLabel'),
        descLabel: t('orderDetail.descLabel'),
        publisherChip: t('orderDetail.publisherChip'),
        contactTA: t('orderDetail.contactTA'),
        editBtn: t('orderDetail.editBtn'),
        deleteBtn: t('orderDetail.deleteBtn'),
        relistBtn: t('orderDetail.relistBtn'),
        delistBtn: t('orderDetail.delistBtn'),
        commentsHead: t('orderDetail.commentsHead', { n: this.data.comments.length }),
        replyBtn: t('orderDetail.replyBtn'),
        report: t('report.action'),
        replyPrefix: t('orderDetail.replyPrefix'),
        replySuffix: t('orderDetail.replySuffix'),
        noComment: t('orderDetail.noComment'),
        waitBtn: t('join.waitBtn'), waitingPrefix: t('join.waitingPrefix'), leaveWait: t('join.leaveWait'), minPrefix: t('join.minPrefix'), minSuffix: t('join.minSuffix'), placeLabel: t('op.placeLabel'),
        releaseBtn: t('claim.release'), pickedTip: t('claim.pickedTip'),
        secretLabel: t('op.secretLabel'), codeLabel: t('claim.codeLabel'), codeTip: t('claim.codeTip'), pickPhoto: t('claim.pickPhoto'), deliverPhoto: t('claim.deliverPhoto'), pickedBtn: t('claim.pickedBtn'), deliverBtn: t('claim.deliverBtn'), confirmReceived: t('claim.confirmReceived'), deliveredTipPub: t('claim.deliveredTipPub'), deliveredTipHelper: t('claim.deliveredTipHelper'),
        fraudTitle: t('fraud.title'), claimTitle: t('claim.title'), helperChip: t('claim.helper'), doneN: t('claim.doneN'), claimBtn: t('claim.btn'), confirmDone: t('claim.confirmDone'), waitOther: t('claim.waitOther'), abandonBtn: t('claim.abandon'), helperTip: t('claim.helperTip'),
        want: t('listing.want'), wanters: t('listing.wanters'), noWanters: t('listing.noWanters'), reserve: t('listing.reserve'), unreserve: t('listing.unreserve'), markSold: t('listing.sold'), rate: t('listing.rate'), rated: t('listing.rated'),
        poster: t('poster.make'), joinTag: t('join.tag'), cdSuffix: t('join.cdSuffix'), organizer: t('join.organizer'), seat: t('join.seat'), joinBtn: t('join.joinBtn'), leaveBtn: t('join.leaveBtn'), tabAsk: t('join.tabAsk'), tabMembers: t('join.tabMembers'), membersOnly: t('join.membersOnly'),
        commentPh: t('orderDetail.commentPh'),
        publishPrefix: t('orderDetail.publishPrefix'),
        send: t('common.send'),
        deleteTitle: t('orderDetail.deleteTitle'),
        deleteContent: t('orderDetail.deleteContent'),
        deleteConfirm: t('orderDetail.deleteConfirm'),
        thinkAgain: t('orderDetail.thinkAgain'),
        cancelTitle: t('orderDetail.cancelTitle'),
        cancelContent: t('orderDetail.cancelContent'),
        cancelConfirm: t('orderDetail.cancelConfirm'),
        commentDeleteTitle: t('orderDetail.commentDeleteTitle'),
        cancelText: t('common.no'), // 弹窗按钮 ≤4 字符(微信 API 限制)
      },
    });
  },

  onShow() {
    this.load();
    // 状态本地定时刷新：到「任务下架时间」后横幅自动翻转为已下架（纯本地判断，不依赖网络）
    this._statusTimer = setInterval(() => this.refreshStatus(), 30000);
  },

  onHide() {
    if (this._statusTimer) clearInterval(this._statusTimer);
  },

  onUnload() {
    clearInterval(this._cd);
    if (this._statusTimer) clearInterval(this._statusTimer);
  },

  refreshStatus() {
    if (!this.data.order) return;
    this.setData({
      'order.sMeta': statusMetaOf(this.data.order),
      'order.canDelist': this.data.myRole === 'publisher' && isVisibleOf(this.data.order),
    });
  },

  load() {
    if (!this.data.orderId) return;
    this.fetchDetail(0);
  },

  // 读取详情；网络失败自动重试一次（读取操作重试安全）
  fetchDetail(retry) {
    cloud
      .callFunction({ name: 'krstuast', data: { action: 'getOrderDetail', orderId: this.data.orderId } })
      .then((res) => {
        const r = res.result || {};
        if (!r.success) {
          uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
          this.setData({ loaded: true });
          return;
        }
        const o = r.order;
        const deadlineLabel = fmtDeadline(o.deadline);
        const autoDelistLabel = fmtDeadline(o.autoDelistAt);
        const publisher = r.publisher
          ? { ...r.publisher, nickDisplay: tv('sysNick', r.publisher.nickname) }
          : null;
        this.setData({
          order: {
            ...o,
            meta: funcMeta(o.functionId),
            sMeta: statusMetaOf(o),
            reward: rewardLabel(o),
            deadlineLabel,
            deadlineText: deadlineLabel ? t('orderDetail.deadlineBefore', { time: deadlineLabel }) : '',
            autoDelistLabel,
            autoDelistText: autoDelistLabel ? t('orderDetail.autoDelistAfter', { time: autoDelistLabel }) : '',
            createdAtLabel: timeAgo(o.createdAt),
            payloadRows: payloadRows(o.functionId, o.payload),
            routeTags: {
              fromTag: taskCategory(o.functionId).fromTag || t('value.fromTag.default'),
              toTag: taskCategory(o.functionId).toTag || t('value.toTag.default'),
            },
            hasReward: taskCategory(o.functionId).hasReward,
            deadlineKey: taskCategory(o.functionId).deadlineLabel
              ? '⏰ ' + taskCategory(o.functionId).deadlineLabel
              : t('common.deadline'),
            rentTag: rentTagOf(o),
            gbTag: gbTagOf(o),
            parttimeTag: parttimeTagOf(o),
            homecookTag: homecookTagOf(o),
            schoolName: schoolName(o.schoolId),
            canDelist: r.myRole === 'publisher' && isVisibleOf(o), // 发布人可下架（超时单不可再操作）
            canRelist: r.myRole === 'publisher' && (o.status === 'cancelled' || (['secondhand', 'housing', 'parttime', 'friends', 'companion'].includes(o.functionId) && isExpiredOf(o))), // 手动下架的单可一键重新上架
            canDelete: r.myRole === 'publisher', // 发布人任何时候都能删除自己的单（含已下架/已过期）
          },
          publisher,
          myRole: r.myRole,
          isClaim: flowOf(o.functionId) === 'claim' && ['pickup', 'delivery'].includes(o.functionId),
          helper: r.helper || null,
          myConfirmed: (r.myRole === 'publisher' && !!o.publisherConfirmed) || (r.myRole === 'helper' && !!o.helperConfirmed),
          fraudTip: FRAUD_KEYS[o.functionId] ? t('fraud.' + FRAUD_KEYS[o.functionId]) : '',
          claimSt: claimStOf(o),
            claimStatusText: t('claim.st.' + claimStOf(o)),
            steps: ['claimed', 'picked', 'delivered', 'done'].map((k, i) => ({ key: k, label: t('claim.step.' + k), on: ['claimed', 'picked', 'delivered', 'done'].indexOf(claimStOf(o)) >= i })),
          comments: (r.comments || []).map((c) => ({
            ...c,
            ago: timeAgo(c.createdAt),
            nickDisplay: tv('sysNick', c.user && c.user.nickname),
            replyToNameDisplay: tv('sysNick', c.replyToName),
          })),
          'L.commentsHead': t('orderDetail.commentsHead', { n: (r.comments || []).length }),
          loaded: true,
        });
        this.setData({ allComments: this.data.comments });
        this.setupListing(r);
        this.setupJoin(r);
        if (this.data.isJoin) this.switchCtab(this.data.ctab);
      })
      .catch((e) => {
        console.error('detail load', e);
        if (retry < 1) {
          this.fetchDetail(retry + 1);
          return;
        }
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
        this.setData({ loaded: true });
      });
  },

  // 发布人：编辑（跳发布页回填）
  onEdit() {
    uni.navigateTo({
      url: `/pages/order/publish?category=${this.data.order.functionId}&edit=${this.data.orderId}`,
    });
  },

  // 发布人：删除（不可恢复）
  onDelete() {
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
          .callFunction({ name: 'krstuast', data: { action: 'deleteOrder', orderId: this.data.orderId } })
          .then((r2) => {
            const r = r2.result || {};
            if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
            uni.showToast({ title: t('common.deleted'), icon: 'none' });
            setTimeout(() => uni.navigateBack(), 600);
          });
      },
    });
  },

  // 发布人下架
  onCancel() {
    const L = this.data.L;
    uni.showModal({
      title: L.cancelTitle,
      content: L.cancelContent,
      confirmText: L.cancelConfirm,
      cancelText: L.thinkAgain,
      confirmColor: '#6e6878',
      success: (res) => {
        if (res.confirm) this.act('cancelOrder', { orderId: this.data.orderId });
      },
    });
  },

  // 发布人重新上架（已下架的单）：原下架时间/日期已过则跳编辑页更新，否则直接恢复展示
  onRelist() {
    const o = this.data.order;
    this.act('relistOrder', { orderId: this.data.orderId }, t('orderDetail.relisted'), () => {
      if (isExpiredOf(o)) {
        uni.showToast({ title: t('orderDetail.timePassed'), icon: 'none' });
        setTimeout(() => {
          uni.navigateTo({ url: `/pages/order/publish?category=${o.functionId}&edit=${o._id}` });
        }, 700);
      }
    });
  },

  act(action, extra, okTitle, after) {
    if (this.data.acting) return;
    this.setData({ acting: true });
    cloud
      .callFunction({ name: 'krstuast', data: { action, ...extra } })
      .then((res) => {
        this.setData({ acting: false });
        const r = res.result || {};
        if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
        uni.showToast({ title: okTitle || t('orderDetail.delisted'), icon: 'none' });
        this.load();
        if (after) after();
      })
      .catch((e) => {
        console.error(action, e);
        this.setData({ acting: false });
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
      });
  },

  // ---------- 私聊 ----------

  onContactPublisher() {
    const u = this.data.publisher;
    if (u && u.uid) openChatWith(u.uid, u.nickname, { type: 'order', id: this.data.orderId });
  },

  // 点头像 → 个人主页
  onTapPublisherAvatar() {
    const u = this.data.publisher;
    if (u && u.uid) uni.navigateTo({ url: '/pages/profile/index?uid=' + u.uid });
  },

  // ---------- 评论 ----------

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


  onClaim() {
    cloud.callFunction({ name: 'krstuast', data: { action: 'claimOrder', orderId: this.data.orderId } }).then((res) => {
      const r = res.result || {};
      if (r.success) {
        uni.showToast({ title: t('claim.claimed'), icon: 'none' });
        return this.load();
      }
      if (r.code === 'NO_RIDER') {
        return uni.showModal({
          title: t('claim.noRiderTitle'),
          content: t('claim.noRiderContent'),
          confirmText: t('claim.goApply'),
          confirmColor: '#D63A73',
          success: (m) => m.confirm && uni.navigateTo({ url: '/pages/rider/rider' }),
        });
      }
      uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
    });
  },

  onConfirmDone() {
    if (this.data.myConfirmed) return;
    uni.showModal({
      title: t('claim.confirmDone'),
      content: t('claim.confirmContent'),
      confirmColor: '#D63A73',
      success: (m) => {
        if (!m.confirm) return;
        cloud.callFunction({ name: 'krstuast', data: { action: 'confirmOrder', orderId: this.data.orderId } }).then((res) => {
          const r = res.result || {};
          if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
          this.load();
        });
      },
    });
  },

  copyText(v) {
    uni.setClipboardData({ data: v });
  },

  previewOne(u) {
    uni.previewImage({ urls: [u] });
  },

  // 拍照上传(相机/相册),返回图片地址
  takePhoto() {
    return new Promise((resolve) => {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['camera', 'album'],
        success: (res) => {
          uni.showLoading({ title: t('common.uploading') });
          cloud.uploadFile({ cloudPath: `handover/${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`, filePath: res.tempFilePaths[0] })
            .then((r) => resolve(r.fileID))
            .catch(() => { uni.showToast({ title: t('common.uploadFailed'), icon: 'none' }); resolve(''); })
            .finally(() => uni.hideLoading());
        },
        fail: () => resolve(''),
      });
    });
  },

  callOrder(data, okMsg) {
    return cloud.callFunction({ name: 'krstuast', data: { orderId: this.data.orderId, ...data } }).then((res) => {
      const r = res.result || {};
      if (!r.success) {
        uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
        return false;
      }
      if (okMsg) uni.showToast({ title: okMsg, icon: 'none' });
      this.load();
      return true;
    });
  },

  onPicked() {
    uni.showActionSheet({
      itemList: [t('claim.pickWithPhoto'), t('claim.pickNoPhoto')],
      success: async (r) => {
        const photo = r.tapIndex === 0 ? await this.takePhoto() : '';
        if (r.tapIndex === 0 && !photo) return;
        this.callOrder({ action: 'markPicked', photo }, t('claim.pickedOk'));
      },
      fail: () => {},
    });
  },

  onDeliver() {
    uni.showActionSheet({
      itemList: [t('claim.byCode'), t('claim.contactless')],
      success: async (r) => {
        if (r.tapIndex === 0) {
          return uni.showModal({
            title: t('claim.byCode'),
            editable: true,
            placeholderText: t('claim.codePh'),
            content: '',
            confirmColor: '#D63A73',
            success: (m) => m.confirm && this.callOrder({ action: 'deliverOrder', code: (m.content || '').trim() }, t('claim.doneOk')),
          });
        }
        uni.showModal({
          title: t('claim.contactless'),
          content: t('claim.contactlessTip'),
          confirmText: t('claim.takePhoto'),
          confirmColor: '#D63A73',
          success: async (m) => {
            if (!m.confirm) return;
            const photo = await this.takePhoto();
            if (photo) this.callOrder({ action: 'deliverOrder', contactless: true, photo }, t('claim.deliveredOk'));
          },
        });
      },
      fail: () => {},
    });
  },

  onRelease() {
    uni.showModal({
      title: t('claim.releaseTitle'),
      content: t('claim.releaseContent'),
      confirmColor: '#E5484D',
      success: (m) => m.confirm && this.callOrder({ action: 'releaseHelper' }, t('claim.released')),
    });
  },

  onAbandon() {
    uni.showModal({
      title: t('claim.abandonTitle'),
      content: t('claim.abandonContent'),
      confirmColor: '#E5484D',
      success: (m) => {
        if (!m.confirm) return;
        cloud.callFunction({ name: 'krstuast', data: { action: 'abandonOrder', orderId: this.data.orderId } }).then((res) => {
          const r = res.result || {};
          if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
          uni.showToast({ title: t('claim.abandoned'), icon: 'none' });
          this.load();
        });
      },
    });
  },

  onContactHelper() {
    const h = this.data.helper;
    if (h && h.uid) openChatWith(h.uid, h.nickname);
  },

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
    const o = this.data.order || {};
    const u = this.data.publisher || {};
    const L = this.data.L || {};
    // 海报信息行:不含联系方式/号码(隐私)
    const rows = []
      .concat(o.from && o.to ? [{ label: '', value: o.from + ' → ' + o.to }] : [])
      .concat((o.payloadRows || []).filter((r) => r && r.value && !/^contact|phone|wechat|qq/i.test(r.key || '')).map((r) => ({ label: r.label, value: String(r.value) })))
      .concat(o.hasReward ? [{ label: L.rewardLabel, value: String(o.reward) }] : [])
      .concat(o.deadlineText ? [{ label: o.deadlineKey, value: o.deadlineText }] : [])
      .concat(o.schoolName ? [{ label: L.schoolLabel, value: o.schoolName }] : []);
    const group = this.data.isJoin ? { text: (L.joinTag || '') + ' ' + (this.data.joinedN + 1) + (this.data.targetN ? '/' + (this.data.targetN + 1) : ''), slots: (this.data.slots || []).map((x) => ({ avatar: x.uid ? x.avatarUrl || '' : '', filled: !!x.uid })) } : null;
    this.$refs.poster.open({ refType: 'order', refId: o._id, title: o.title, content: o.desc || '', rows, group, author: u.nickname, avatar: u.avatarUrl, image: (o.images || [])[0], tag: (o.meta && o.meta.badgeName) || '' });
  },

  switchCtab(k) {
    const all = this.data.allComments || [];
    this.setData({ ctab: k, comments: all.filter((c) => (c.channel || 'public') === k) });
  },

  // ---------- 闲置 ----------
  setupListing(r) {
    const o = r.order || {};
    const isSecondhand = o.functionId === 'secondhand';
    if (!isSecondhand) return this.setData({ isSecondhand: false });
    const myReview = (r.reviews || []).some((x) => x.mine);
    const inDeal = o.status === 'sold' && !!r.buyer && (r.myRole === 'publisher' || r.iAmBuyer);
    this.setData({
      isSecondhand,
      listingOpen: isVisibleOf(o),
      wanterList: (r.wanterList || []).slice().reverse(),
      buyer: r.buyer || null,
      canRate: inDeal && !myReview,
      rated: inDeal && myReview,
      'L.wantN': t('listing.wantN', { n: o.wantCount || 0 }),
      'L.soldTo': r.buyer ? t('listing.soldTo', { name: r.buyer.nickname || '' }) : '',
    });
  },

  onWant() {
    if (!requireLogin()) return;
    const o = this.data.order || {};
    callKrstuast({ action: 'wantOrder', orderId: this.data.orderId }).then((r2) => {
      const r = (r2 && r2.result) || {};
      if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
      uni.showToast({ title: t('listing.wantDone'), icon: 'none' });
      const u = this.data.publisher;
      if (u && u.uid) setTimeout(() => openChatWith(u.uid, u.nickname, { type: 'order', id: this.data.orderId, greet: t('listing.wantGreet', { title: o.title || '' }) }), 500);
    });
  },

  onChatWanter(w) {
    if (w && w.uid) openChatWith(w.uid, w.nickname, { type: 'order', id: this.data.orderId });
  },

  onReserve() {
    const on = !(this.data.order && this.data.order.reserved);
    callKrstuast({ action: 'reserveOrder', orderId: this.data.orderId, on }).then((r2) => {
      const r = (r2 && r2.result) || {};
      if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
      this.fetchDetail();
    });
  },

  onMarkSold() {
    const ws = this.data.wanterList || [];
    const doSold = (buyerUid) => {
      uni.showModal({
        title: t('listing.sold'),
        content: t('listing.soldConfirm'),
        confirmColor: '#d63a73',
        success: (m) => {
          if (!m.confirm) return;
          callKrstuast({ action: 'markSold', orderId: this.data.orderId, buyerUid: buyerUid || '' }).then((r2) => {
            const r = (r2 && r2.result) || {};
            if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
            this.fetchDetail();
          });
        },
      });
    };
    if (!ws.length) return doSold('');
    const pick = ws.slice(0, 5); // showActionSheet 最多 6 项
    uni.showActionSheet({
      title: t('listing.pickBuyer'),
      itemList: pick.map((w) => w.nickname || w.uid).concat([t('listing.offPlatform')]),
      success: (res) => doSold(res.tapIndex < pick.length ? pick[res.tapIndex].uid : ''),
    });
  },

  onRate() {
    const isPub = this.data.myRole === 'publisher';
    const toUid = isPub ? this.data.buyer && this.data.buyer.uid : this.data.publisher && this.data.publisher.uid;
    if (!toUid) return;
    uni.showActionSheet({
      itemList: [5, 4, 3, 2, 1].map((n) => t('listing.star' + n)),
      success: (res) => {
        const score = 5 - res.tapIndex;
        callKrstuast({ action: 'reviewOrder', orderId: this.data.orderId, toUid, score, content: '' }).then((r2) => {
          const r = (r2 && r2.result) || {};
          uni.showToast({ title: r.success ? t('listing.rated') : cloudMsg(r.message), icon: 'none' });
          if (r.success) this.fetchDetail();
        });
      },
    });
  },

  setupJoin(r) {
    const o = r.order || {};
    const isJoin = flowOf(o.functionId) === 'join';
    if (!isJoin) return this.setData({ isJoin: false });
    const pub = r.publisher || {};
    const parts = r.participants || [];
    // 旧攒局没有记录名额:按「期望人数 - 1」换算;仍为 0 表示不限人数
    const targetN = Number(o.targetN) || (['hangout', 'meal'].includes(o.functionId) ? Math.max(0, Math.floor(Number((o.payload || {}).people || 0)) - 1) : 0);
    const slots = [{ key: 'pub', uid: pub.uid, avatarUrl: pub.avatarUrl, nickname: pub.nickname, isPub: true }]
      .concat(parts.map((p, i) => ({ key: 'p' + i, uid: p.uid, avatarUrl: p.avatarUrl, nickname: p.nickname })));
    for (let i = parts.length; i < targetN; i++) slots.push({ key: 'e' + i });
    if (!targetN) slots.push({ key: 'e-any' });
    const isMember = !!r.isMember;
    this.setData({
      isJoin, slots, targetN, joinedN: parts.length, isMember,
      canJoin: !isMember && ['pending', 'active'].includes(o.status) && isVisibleOf(o) && (!targetN || parts.length < targetN),
      canLeave: r.myRole === 'participant' && ['pending', 'active', 'full'].includes(o.status),
      canWait: !isMember && !o.myWaitPos && ['pending', 'active', 'full'].includes(o.status) && isVisibleOf(o) && targetN > 0 && parts.length >= targetN,
      minPeople: Math.floor(Number((o.payload || {}).minPeople || 0)),
    });
    clearInterval(this._cd);
    const end = o.deadline ? new Date(String(o.deadline).replace(' ', 'T') + ':00+09:00').getTime() : 0;
    const tick = () => {
      const left = end - Date.now();
      if (!end || left <= 0) { clearInterval(this._cd); return this.setData({ countdown: '' }); }
      const d = Math.floor(left / 86400000), h = Math.floor((left % 86400000) / 3600000), m = Math.floor((left % 3600000) / 60000), s = Math.floor((left % 60000) / 1000);
      this.setData({ countdown: t('join.cd', { d, h, m, s }) });
    };
    tick();
    if (end) this._cd = setInterval(tick, 1000);
  },

  onTapSlot(s) {
    if (!s.uid) return this.onJoin();
    if (this.data.myRole !== 'publisher' || s.isPub) return this.goUser(s);
    uni.showActionSheet({
      itemList: [t('chat.viewProfile'), t('join.remove')],
      success: (r) => {
        if (r.tapIndex === 0) return this.goUser(s);
        uni.showModal({
          title: t('join.removeTitle', { name: s.nickname || '' }),
          editable: true,
          placeholderText: t('join.removeReasonPh'),
          content: '',
          confirmColor: '#E5484D',
          success: (m) => {
            if (!m.confirm) return;
            callKrstuast({ action: 'removeMember', orderId: this.data.orderId, uid: s.uid, reason: (m.content || '').trim() }).then((x) => {
              const ret = (x && x.result) || {};
              uni.showToast({ title: ret.success ? t('join.removed') : cloudMsg(ret.message), icon: 'none' });
              if (ret.success) this.load();
            });
          },
        });
      },
      fail: () => {},
    });
  },

  onJoin() {
    if ((!this.data.canJoin && !this.data.canWait) || !requireLogin()) return;
    callKrstuast({ action: 'joinOrder', orderId: this.data.orderId }).then((r) => {
      const ret = (r && r.result) || {};
      uni.showToast({ title: ret.success ? (ret.waitlisted ? t('join.waitlisted', { n: ret.pos }) : t('join.joined')) : cloudMsg(ret.message), icon: 'none' });
      if (ret.success) this.load();
    });
  },

  onLeave() {
    uni.showModal({
      title: t('join.leaveConfirm'),
      success: (m) => {
        if (!m.confirm) return;
        const go = (confirmLate) => callKrstuast({ action: 'leaveOrder', orderId: this.data.orderId, confirmLate }).then((r) => {
          const ret = (r && r.result) || {};
          if (ret.code === 'LATE_LEAVE') {
            return uni.showModal({ title: t('join.lateTitle'), content: cloudMsg(ret.message), confirmText: t('join.leaveBtn'), confirmColor: '#E5484D', success: (x) => x.confirm && go(true) });
          }
          if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
          this.load();
        });
        go(false);
      },
    });
  },

  onSendComment() {
    const content = this.data.commentText.trim();
    if (!content) return uni.showToast({ title: t('common.writeSomething'), icon: 'none' });
    if (this.data.acting) return;
    const replyToId = this.data.replyTo ? this.data.replyTo.id : '';
    this.setData({ acting: true });
    cloud
      .callFunction({ name: 'krstuast', data: { action: 'addOrderComment', orderId: this.data.orderId, content, replyToId, channel: this.data.isJoin ? this.data.ctab : 'public' } })
      .then((res) => {
        this.setData({ acting: false });
        const r = res.result || {};
        if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
        this.setData({ commentText: '', replyTo: null });
        this.load();
        // 评论后申请订阅：发布人回复我时能收到微信通知
        if (this.data.myRole !== 'publisher') requestSubscribe(['comment']);
      })
      .catch(() => {
        this.setData({ acting: false });
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
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

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url;
    uni.previewImage({ urls: this.data.order.images, current: url });
  },

  noop() {},
});

</script>

<style scoped>
/* pages/order/detail 订单详情 */
.page {
  min-height: 100vh;
  padding: 24rpx 32rpx 32rpx;
  box-sizing: border-box;
}
.status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 28rpx;
  padding: 24rpx 32rpx;
  margin-bottom: 24rpx;
}
.status-label {
  font-size: 32rpx;
  font-weight: 700;
}
.status-extra {
  font-size: 26rpx;
  font-weight: 600;
}
/* join 进度卡 */
.join-card {
  background: #ffffff;
  border-radius: 28rpx;
  padding: 24rpx 32rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(31, 29, 36, 0.05);
}
.join-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14rpx;
}
.join-count {
  font-size: 26rpx;
  font-weight: 700;
  color: #1f1d24;
}
.join-status {
  font-size: 22rpx;
  color: #d63a73;
  font-weight: 600;
}
.progress-track {
  height: 14rpx;
  border-radius: 999rpx;
  background: #f3f1f5;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 999rpx;
  background: #d63a73;
}
.participant-row {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #f3f1f5;
}
.participant-row:last-child {
  border-bottom: none;
}
.avatar-sm {
  width: 72rpx;
  height: 72rpx;
}
.review-mini {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #d63a73;
  background: #ffeef4;
  border-radius: 999rpx;
  padding: 8rpx 22rpx;
  font-weight: 600;
}
.review-who {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #8a8494;
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
.card-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.card-title {
  flex: 1;
  font-size: 36rpx;
  font-weight: 700;
  color: #1f1d24;
  margin-right: 16rpx;
}
.badges-row {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.rent-badge {
  font-size: 22rpx;
  border-radius: 999rpx;
  padding: 6rpx 18rpx;
  font-weight: 600;
  margin-right: 10rpx;
}
.func-badge {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #d63a73;
  background: #ffeef4;
  border-radius: 999rpx;
  padding: 6rpx 18rpx;
  font-weight: 600;
}
.info-route {
  margin-top: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.route-line {
  display: flex;
  align-items: center;
  max-width: 100%;
}
.route-down {
  color: #d63a73;
  font-weight: 700;
  font-size: 22rpx;
  line-height: 1.5;
  padding-left: 20rpx;
}
.route-text {
  font-size: 28rpx;
  color: #625c6b;
  flex: 1;
  word-break: break-all; /* 地址完整展示，自动换行不缩略 */
}

.route-tag {
  flex-shrink: 0;
  font-size: 20rpx;
  font-weight: 700;
  color: #3e8e6b;
  background: #dff6ec;
  border-radius: 999rpx;
  padding: 4rpx 14rpx;
  margin-right: 10rpx;
}
.route-tag-to {
  color: #d63a73;
  background: #ffeef4;
}
.route-arrow {
  margin: 0 16rpx;
  color: #d63a73;
  font-weight: 700;
}
.info-row {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  font-size: 26rpx;
}
.info-key {
  color: #7a7383;
  width: 150rpx;
}
.info-val {
  color: #1f1d24;
}
.reward {
  color: #d63a73;
  font-weight: 700;
}
.desc {
  margin-top: 20rpx;
  font-size: 26rpx;
  color: #625c6b;
  line-height: 1.7;
  background: #f6f5f7;
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
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
.user-card {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
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
.role-chip {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #b07f2e;
  background: #fff3ce;
  border-radius: 999rpx;
  padding: 6rpx 18rpx;
  font-weight: 600;
}
.right-chips {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12rpx;
}
.delist-chip {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #6e6878;
  background: #f3f0f5;
  border-radius: 999rpx;
  padding: 8rpx 20rpx;
  font-weight: 600;
}
.contact-chip {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #ffffff;
  background: #d63a73;
  border-radius: 999rpx;
  padding: 8rpx 20rpx;
  font-weight: 600;
}
.me-tag {
  font-size: 22rpx;
  color: #7a7383;
  font-weight: 400;
}
.role-helper {
  color: #3e8e6b;
  background: #dff6ec;
}
.review-item {
  padding: 20rpx 0;
  border-bottom: 2rpx solid #f3f1f5;
}
.review-item:last-child {
  border-bottom: none;
}
.review-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.review-stars {
  color: #f7b64b;
  font-size: 28rpx;
  letter-spacing: 4rpx;
}
.review-ago {
  font-size: 22rpx;
  color: #7a7383;
}
.review-tags {
  margin-top: 10rpx;
  display: flex;
  flex-wrap: wrap;
}
.review-tag {
  font-size: 22rpx;
  color: #d63a73;
  background: #ffeef4;
  border-radius: 999rpx;
  padding: 4rpx 16rpx;
  margin-right: 10rpx;
  margin-bottom: 8rpx;
}
.review-content {
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #625c6b;
}
.empty-review {
  text-align: center;
  font-size: 24rpx;
  color: #7a7383;
  padding: 12rpx 0;
}
/* 底部操作条 */
.action-bar {
  position: fixed;
  left: var(--k-side, 0px);
  right: var(--k-side, 0px);
  bottom: 0;
  display: flex;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #ffffff;
  box-shadow: 0 -8rpx 32rpx rgba(31, 29, 36, 0.06);
  border-radius: 32rpx 32rpx 0 0;
  z-index: 50;
}
.bar-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  font-size: 30rpx;
  font-weight: 700;
}
.bar-btn + .bar-btn {
  margin-left: 20rpx;
}
.btn-ghost {
  background: #f3f1f5;
  color: #6e6878;
}
.btn-primary {
  background: #d63a73;
  color: #ffffff;
}
.btn-primary[disabled] {
  opacity: 0.6;
}
.bar-space {
  height: 160rpx;
}
/* 评价面板 */
.panel-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(74, 70, 88, 0.45);
  z-index: 100;
}
.review-panel {
  position: fixed;
  left: var(--k-side, 0px);
  right: var(--k-side, 0px);
  bottom: 0;
  background: #ffffff;
  border-radius: 40rpx 40rpx 0 0;
  padding: 40rpx 40rpx calc(40rpx + env(safe-area-inset-bottom));
  z-index: 101;
  animation: sheet-up 0.26s cubic-bezier(0.22, 0.9, 0.36, 1);
}
.panel-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1f1d24;
  text-align: center;
}
.stars-row {
  margin-top: 28rpx;
  display: flex;
  justify-content: center;
}
.star {
  font-size: 72rpx;
  color: #e3dfe7;
  margin: 0 12rpx;
}
.star-on {
  color: #f7b64b;
}
.tags-row {
  margin-top: 28rpx;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
}
.tag {
  font-size: 24rpx;
  color: #6e6878;
  background: #f3f1f5;
  border-radius: 999rpx;
  padding: 10rpx 24rpx;
  margin: 8rpx;
}
.tag-on {
  color: #ffffff;
  background: #d63a73;
}
.panel-input {
  margin-top: 28rpx;
  width: 100%;
  box-sizing: border-box;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
  font-size: 26rpx;
  color: #1f1d24;
  min-height: 120rpx;
}
.ph {
  color: #8a8494;
}
.panel-btns {
  margin-top: 28rpx;
  display: flex;
}
.panel-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  font-size: 30rpx;
  font-weight: 700;
}
.panel-btn + .panel-btn {
  margin-left: 20rpx;
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

.pub-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
  width: 100%;
}
.pub-action {
  flex: 1;
  text-align: center;
  padding: 14rpx 0;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #6e6878;
  background: #f3f1f5;
}
.pub-edit {
  color: #d63a73;
  background: #ffeef4;
}
.pub-action-hover {
  opacity: 0.8;
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
.join-card { background: #fffbe6; border: 3rpx solid #1f1d24; }
.join-head { display: flex; align-items: center; justify-content: space-between; }
.join-tag { padding: 6rpx 22rpx; border-radius: 12rpx; background: #1f1d24; color: #fff; font-size: 24rpx; font-weight: 700; }
.join-cd { font-size: 24rpx; color: #6e6878; }
.listing-card { display: flex; flex-direction: column; gap: 18rpx; }
.lc-head { display: flex; align-items: center; justify-content: space-between; }
.lc-st { padding: 6rpx 20rpx; border-radius: 12rpx; font-size: 24rpx; font-weight: 700; }
.lc-want { font-size: 24rpx; color: #6e6878; }
.lc-buyer { font-size: 26rpx; color: #3e8e6b; font-weight: 600; }
.lc-sub { font-size: 24rpx; color: #9a93a3; }
.lc-empty { font-size: 24rpx; color: #b5aebd; }
.lc-ws { display: flex; flex-wrap: wrap; gap: 20rpx; }
.lc-w { width: 110rpx; display: flex; flex-direction: column; align-items: center; gap: 6rpx; }
.lc-av { width: 80rpx; height: 80rpx; border-radius: 50%; background: #f1eff3; }
.lc-wn { max-width: 110rpx; font-size: 20rpx; color: #4a4552; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.lc-actions { display: flex; gap: 20rpx; }
.lc-btn { flex: 1; height: 84rpx; line-height: 84rpx; text-align: center; border-radius: 42rpx; background: #d63a73; color: #fff; font-size: 28rpx; font-weight: 700; }
.lc-sec { background: #fff0f5; color: #d63a73; }
.lc-rated { font-size: 24rpx; color: #9a93a3; text-align: center; }
.slots { display: flex; flex-wrap: wrap; gap: 28rpx; margin-top: 28rpx; }
.slot { width: 120rpx; display: flex; flex-direction: column; align-items: center; }
.slot-av { width: 100rpx; height: 100rpx; border-radius: 50%; border: 3rpx solid #1f1d24; background: #fff; box-sizing: border-box; }
.slot-empty { display: flex; align-items: center; justify-content: center; font-size: 44rpx; color: #1f1d24; }
.slot-tag { position: relative; z-index: 2; margin-top: 10rpx; max-width: 120rpx; line-height: 32rpx; padding: 0 12rpx; border-radius: 10rpx; background: #1f1d24; color: #fff; font-size: 18rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; box-sizing: border-box; }
.slot-pub { background: #d63a73; }
.join-actions { display: flex; align-items: center; gap: 20rpx; margin-top: 28rpx; }
.join-btn { flex: 1; height: 84rpx; line-height: 84rpx; text-align: center; border-radius: 42rpx; background: #1f1d24; color: #fff; font-size: 30rpx; font-weight: 700; }
.leave-btn { flex: 1; height: 84rpx; line-height: 84rpx; text-align: center; border-radius: 42rpx; border: 2rpx solid #d9d4de; color: #6e6878; font-size: 28rpx; }
.ctabs { display: inline-flex; margin: 8rpx 0 20rpx; border: 3rpx solid #1f1d24; border-radius: 999rpx; overflow: hidden; }
.ctab { padding: 12rpx 30rpx; font-size: 26rpx; color: #6e6878; background: #fffbe6; }
.ctab-on { background: #ffbe1a; color: #1f1d24; font-weight: 700; }
.fraud { margin: 0 0 24rpx; padding: 22rpx 26rpx; border-radius: 22rpx; background: #fff4e5; border: 2rpx solid #ffd8a8; display: flex; flex-direction: column; gap: 6rpx; }
.fraud-t { font-size: 26rpx; font-weight: 800; color: #b45309; }
.fraud-c { font-size: 24rpx; line-height: 1.6; color: #8a5a1c; }
.claim-head { display: flex; align-items: center; justify-content: space-between; }
.claim-title { font-size: 30rpx; font-weight: 800; color: #1f1d24; }
.claim-st { padding: 6rpx 18rpx; border-radius: 999rpx; font-size: 22rpx; font-weight: 700; background: #f1eff3; color: #6e6878; }
.st-pending { background: #e6f6ee; color: #1e7a4c; }
.st-active { background: #e4efff; color: #1f59a8; }
.st-done { background: #f1eff3; color: #6e6878; }
.claim-helper { display: flex; align-items: center; gap: 18rpx; margin-top: 22rpx; padding: 18rpx; border-radius: 20rpx; background: #f6f5f7; }
.claim-av { width: 80rpx; height: 80rpx; border-radius: 50%; background: #ffeef4; }
.claim-hmain { flex: 1; min-width: 0; }
.claim-hname { font-size: 28rpx; font-weight: 700; }
.claim-hsub { margin-top: 4rpx; font-size: 22rpx; color: #6e6878; }
.claim-actions { display: flex; gap: 20rpx; margin-top: 24rpx; }
.claim-btn { flex: 1; height: 84rpx; line-height: 84rpx; text-align: center; border-radius: 42rpx; background: #1f1d24; color: #fff; font-size: 28rpx; font-weight: 800; }
.claim-off { background: #c9c4cf; }
.abandon-btn { flex: 0 0 auto; height: 84rpx; line-height: 80rpx; padding: 0 32rpx; border-radius: 42rpx; border: 2rpx solid #e5484d; color: #e5484d; font-size: 26rpx; font-weight: 700; box-sizing: border-box; }
.claim-tip { margin-top: 16rpx; font-size: 22rpx; color: #9a6a00; line-height: 1.5; }
.steps { display: flex; margin-top: 22rpx; }
.step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.step-dot { width: 44rpx; height: 44rpx; line-height: 44rpx; text-align: center; border-radius: 50%; background: #f1eff3; color: #9a93a3; font-size: 22rpx; font-weight: 800; }
.step-on .step-dot { background: #1f59a8; color: #fff; }
.step-t { font-size: 22rpx; color: #9a93a3; }
.step-on .step-t { color: #1f59a8; font-weight: 700; }
.st-claimed, .st-picked { background: #e4efff; color: #1f59a8; }
.st-delivered { background: #fff4d6; color: #7a5200; }
.st-cancelled { background: #f1eff3; color: #9a93a3; }
.secret { display: flex; flex-direction: column; gap: 6rpx; margin-top: 20rpx; padding: 18rpx 22rpx; border-radius: 18rpx; background: #f4f1ff; }
.secret-k { font-size: 22rpx; color: #5a3fc0; font-weight: 700; }
.secret-v { font-size: 28rpx; color: #1f1d24; word-break: break-all; }
.code-box { margin-top: 20rpx; padding: 22rpx; border-radius: 20rpx; background: #1f1d24; text-align: center; }
.code-k { display: block; font-size: 22rpx; color: #c9c4cf; }
.code-v { display: block; margin: 6rpx 0; font-size: 64rpx; font-weight: 900; letter-spacing: 16rpx; color: #ffd66b; }
.code-tip { display: block; font-size: 22rpx; color: #c9c4cf; }
.photos { display: flex; gap: 20rpx; margin-top: 20rpx; }
.ph { display: flex; flex-direction: column; align-items: center; gap: 6rpx; }
.ph-img { width: 180rpx; height: 180rpx; border-radius: 16rpx; background: #f1eff3; }
.ph-t { font-size: 22rpx; color: #6e6878; }
.claim-sec { background: #ffffff; color: #1f1d24; border: 2rpx solid #1f1d24; line-height: 80rpx; box-sizing: border-box; }
.claim-actions { flex-wrap: wrap; }
.step { position: relative; }
.step-dot { position: relative; z-index: 1; }
.step-line { position: absolute; top: 18rpx; left: 50%; width: 100%; height: 8rpx; border-radius: 4rpx; background: #e4e1e8; }
.line-on { background: linear-gradient(90deg, #4f7cff, #a35cff); }
.step-on .step-dot { background: linear-gradient(135deg, #4f7cff, #a35cff); color: #fff; box-shadow: 0 4rpx 12rpx rgba(110, 90, 255, 0.35); }
.step-on .step-t { color: #5a4bd6; }
.join-wait { background: #6e6878; }
.join-min { margin-top: 16rpx; font-size: 24rpx; color: #7a5200; }
</style>
