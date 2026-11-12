<template>
<!-- pages/home 主页(清新社区风):学校切换 + 常用入口 + 分类标签 + 最新动态信息流 -->
<view class="page">
  <view class="header">
    <view class="school-btn" hover-class="tap-hover" @tap="onTapSchool">
      <text class="school-name">{{ schoolDisplay }}</text>
      <image class="ic20" src="/static/icons/chevdown-1f1d24.png" />
    </view>
    <view class="header-actions">
      <view class="icon-btn" hover-class="tap-hover" @tap="onTapAddFriend">
        <image class="ic24" src="/static/icons/user-plus-1f1d24.png" />
        <text v-if="bs.friendRequests" class="hb-num">{{ bs.friendRequests }}</text>
      </view>
      <view class="icon-btn" hover-class="tap-hover" @tap="onTapSearch">
        <image class="ic24" src="/static/icons/search-1f1d24.png" />
      </view>
      <view class="icon-btn" hover-class="tap-hover" @tap="onTapBell">
        <image class="ic24" src="/static/icons/bell-1f1d24.png" />
        <text v-if="bs.notifications" class="hb-num">{{ bs.notifications > 99 ? '99+' : bs.notifications }}</text>
      </view>
    </view>
  </view>

  <!-- 学校圈氛围 + 今日上头 -->
  <view v-if="L.circle" class="circle"><text class="circle-n">{{ L.circle }}</text></view>
  <!-- 头条轮播:今日上头 + 校园群邀请(后台「校园群」配置) -->
  <swiper v-if="slides.length" class="top-swiper" vertical :autoplay="slides.length > 1" :circular="slides.length > 1" :interval="3500" :duration="400">
    <swiper-item v-for="sl in slides" :key="sl.key">
      <view v-if="sl.kind === 'group'" class="top-card top-group" hover-class="tap-hover" @tap="openGroup(sl.g)">
        <view class="top-tag tag-group">👥 {{ L.groupTag }}</view>
        <view class="top-main">
          <view class="top-title">{{ sl.g.headline || L.joinGroupPrefix + sl.g.name }}</view>
          <view class="top-meta meta-group">{{ sl.g.platform ? sl.g.platform + ' · ' : '' }}{{ L.joinGroupSub }}</view>
        </view>
        <view class="top-go">{{ L.joinBtn }}</view>
      </view>
      <view v-else class="top-card" hover-class="tap-hover" @tap="openTop(sl.p)">
        <view class="top-tag">🔥 {{ L.topToday }}</view>
        <view class="top-main">
          <view class="top-title">{{ sl.p.title }}</view>
          <view class="top-meta">👁 {{ sl.p.viewCount }} · 💬 {{ sl.p.commentCount }}</view>
        </view>
      </view>
    </swiper-item>
  </swiper>

  <!-- 校园群弹窗:二维码长按保存/识别,或打开入群链接 -->
  <view v-if="grp" class="g-mask" @tap="grp = null">
    <view class="g-box" @tap.stop>
      <view class="g-name">{{ grp.name }}</view>
      <view v-if="grp.platform" class="g-pf">{{ grp.platform }}</view>
      <view v-if="grp.schoolName" class="g-school">🏫 {{ L.onlyFor }}{{ grp.schoolName }}</view>
      <image v-if="grp.qr" class="g-qr" :src="grp.qr" mode="aspectFit" show-menu-by-longpress @tap="previewQr" />
      <view v-if="grp.qr" class="g-tip">{{ L.qrTip }}</view>
      <view v-if="grp.note" class="g-note">{{ grp.note }}</view>
      <view class="g-btns">
        <view v-if="grp.link" class="g-btn g-pri" @tap="openGroupLink">{{ L.openLink }}</view>
        <view v-if="grp.link" class="g-btn" @tap="copyGroupLink">{{ L.copyLink }}</view>
        <view class="g-btn" @tap="grp = null">{{ L.close }}</view>
      </view>
    </view>
  </view>

  <view class="quick">
    <view v-for="q in quick" :key="q.id" class="quick-item" hover-class="tap-hover" @tap="openFunc(q.id)">
      <view class="quick-icon" :style="{ background: q.bg }"><image class="ic24" :src="q.icon" /></view>
      <text class="quick-label">{{ q.name }}</text>
    </view>
    <view class="quick-item" hover-class="tap-hover" @tap="onTapAll">
      <view class="quick-icon" style="background: #F1EFF3"><image class="ic24" src="/static/icons/grid-4a4552.png" /></view>
      <text class="quick-label">{{ L.quickAll }}</text>
    </view>
  </view>

  <!-- 公告 / 横幅(后台「公告与横幅」配置):有图显示横幅轮播,没图显示一行文字 -->
  <view v-if="annImgs.length || annTexts.length" class="anns">
    <swiper v-if="annImgs.length" class="ann-swiper" :autoplay="annImgs.length > 1" :circular="annImgs.length > 1" :interval="4500" :indicator-dots="annImgs.length > 1" indicator-color="rgba(255,255,255,0.5)" indicator-active-color="#ffffff">
      <swiper-item v-for="a in annImgs" :key="a.id">
        <image class="ann-img" :src="a.image" mode="aspectFill" @tap="openAnn(a)" />
      </swiper-item>
    </swiper>
    <view v-for="a in annTexts" :key="a.id" class="ann-text" hover-class="tap-hover" @tap="openAnn(a)">
      <text class="ann-tag">{{ L.annLabel }}</text>
      <text class="ann-title">{{ a.title }}</text>
      <image class="ic16" src="/static/icons/chevright-9a93a3.png" />
    </view>
  </view>

  <view class="chips-row">
  <view :class="['filter-btn', hideDone ? 'filter-on' : '']" hover-class="tap-hover" @tap="onFilter">{{ hideDone ? L.fHideDone : L.filter }} ▾</view>
  <scroll-view :class="['chips', chipsEnd ? 'chips-end' : '']" scroll-x :show-scrollbar="false" :scroll-into-view="chipInto" scroll-with-animation @scroll="onChipsScroll" @scrolltolower="chipsEnd = true">
    <view class="chips-inner">
      <view v-for="c in chips" :key="c.id" :id="'chip-' + c.id" :class="['chip', c.id === cat ? 'chip-on' : '']" @tap="pickChip(c.id)">{{ c.label }}</view>
    </view>
  </scroll-view>
  </view>

  <k-feed :items="items">
    <view v-if="loaded && !items.length" class="empty">{{ L.feedEmpty }}</view>
    <view v-if="!loaded" class="empty">{{ L.loading }}</view>
    <view v-if="loaded && items.length && cat !== 'all'" class="more" hover-class="tap-hover" @tap="openFunc(cat)">
      {{ L.seeAll }}
      <image class="ic16" src="/static/icons/chevright-9a93a3.png" />
    </view>
  </k-feed>
  <view class="bottom-space" />

  <view class="fab" hover-class="fab-hover" @tap="onTapPublish">
    <image class="ic20" src="/static/icons/plus-ffffff.png" />
    <text>{{ L.publish }}</text>
  </view>
  <!-- #ifdef H5 -->
  <k-a2hs />
  <!-- #endif -->
  <k-tab-bar :selected="0" />
</view>
</template>

<script>
// pages/home —— 主页信息流:「全部」聚合 getExploreData;选中分类时拉该分类的最新内容
import appState from '@/utils/app-state.js';
import cloud, { requireLogin, callKrstuast } from '@/utils/cloud.js';
import { refreshBadges, getBadgeState } from '../../utils/badges.js';
import { t, cloudMsg, localizedSchool } from '../../utils/i18n.js';
import { funcMeta, isVisibleOf } from '../../utils/order-meta.js';
import { decorateOrder, decoratePost } from '../../utils/feed.js';
import { catStyle, QUICK_IDS, CHIP_IDS, isTask, listUrl } from '../../data/ui-categories.js';

export default {
  data() {
    return {
      schoolDisplay: '',
      quick: [],
      bs: getBadgeState(),
      stats: {},
      tops: [],
      groups: [],
      grp: null,
      chips: [],
      chipsEnd: false,
      hideDone: !!uni.getStorageSync('kr_hide_done'),
      annImgs: [],
      annTexts: [],
      chipInto: '',
      cat: 'all',
      items: [],
      loaded: false,
      L: {},
    };
  },

  onShow() {
    this.loadSocial();
    uni.setNavigationBarTitle({ title: t('nav.home') });
    const school = appState.readSchool();
    if (!school) {
      uni.reLaunch({ url: '/pages/index/index' });
      return;
    }
    appState.readLang();
    this.schoolDisplay = localizedSchool(school).nameMain;
    this.quick = QUICK_IDS.map((id) => ({ id, name: funcMeta(id).homeName || funcMeta(id).name, ...catStyle(id) }));
    this.chips = [{ id: 'all', label: t('home.chipAll') }].concat(
      CHIP_IDS.map((id) => ({ id, label: funcMeta(id).badgeName || funcMeta(id).name }))
    );
    this.L = {
      filter: t('home.filter'),
      fHideDone: t('home.fHideDone'),
      quickAll: t('home.quickAll'),
      feedEmpty: t('home.feedEmpty'),
      loading: t('common.loading'),
      seeAll: t('home.seeAll'),
      publish: t('home.publish'),
      annLabel: t('ann.label'),
    };
    this.load();
    this.loadAnns();
  },

  onPullDownRefresh() {
    this.load(() => uni.stopPullDownRefresh());
  },

  computed: {
    // 轮播顺序:第 1 条热帖 → 校园群 → 其余热帖
    slides() {
      const ps = this.tops.map((p) => ({ key: 'p' + p._id, kind: 'post', p }));
      const gs = this.groups.map((g) => ({ key: 'g' + g.id, kind: 'group', g }));
      return ps.slice(0, 1).concat(gs, ps.slice(1));
    },
  },
  methods: {
    loadAnns() {
      cloud
        .callFunction({ name: 'krstuast', data: { action: 'getAppConfig', country: appState.getCountry(), lang: appState.readLang() } })
        .then((res) => {
          const list = ((res.result || {}).announcements || []).filter((a) => a.title || a.image);
          this.annImgs = list.filter((a) => a.image);
          this.annTexts = list.filter((a) => !a.image).slice(0, 2);
        })
        .catch(() => {});
    },

    openAnn(a) {
      if (a.link) {
        // #ifdef APP-PLUS
        plus.runtime.openURL(a.link);
        // #endif
        // #ifdef H5
        window.open(a.link, '_blank');
        // #endif
        // #ifdef H5
        window.open(a.link, '_blank');
        // #endif
        // #ifdef MP-WEIXIN
        uni.setClipboardData({ data: a.link });
        // #endif
        return;
      }
      if (a.content || a.title) uni.showModal({ title: a.title || '', content: a.content || '', showCancel: false, confirmColor: '#D63A73' });
    },

    schoolId() {
      return (appState.readSchool() || {}).id || '';
    },

    load(done) {
      const cat = this.cat;
      const schoolId = this.schoolId();
      let data;
      if (cat === 'all') data = { action: 'getExploreData', schoolId, includeDone: !this.hideDone };
      else if (isTask(cat)) data = { action: 'getOrders', mode: 'hall', functionId: cat, schoolId, includeClosed: false, includeDone: !this.hideDone, skip: 0, limit: 20 };
      else data = { action: 'getPosts', functionId: cat, schoolId, skip: 0, limit: 20 };
      cloud
        .callFunction({ name: 'krstuast', data })
        .then((res) => {
          if (cat !== this.cat) return; // 已切换到别的分类
          const r = res.result || {};
          if (!r.success) {
            uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
            this.loaded = true;
            return;
          }
          let rows;
          if (cat === 'all') {
            const orders = (r.orders || []).filter((o) => this.showOrder(o)).map((o) => decorateOrder(o));
            const posts = (r.posts || []).map((p) => decoratePost(p));
            rows = orders.concat(posts).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || b.createdAt - a.createdAt);
          } else if (isTask(cat)) {
            rows = (r.list || []).filter((o) => this.showOrder(o)).map((o) => decorateOrder(o));
            rows.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || b.createdAt - a.createdAt);
          } else {
            rows = (r.list || []).map((p) => decoratePost(p));
          }
          this.items = rows;
          this.loaded = true;
        })
        .catch(() => {
          uni.showToast({ title: t('common.networkError'), icon: 'none' });
          this.loaded = true;
        })
        .finally(() => done && done());
    },

    // 横向滑回左侧时恢复右侧渐隐
    onChipsScroll(e) {
      const left = e.detail.scrollLeft;
      if (left < (this._chipsLeft || 0) - 4) this.chipsEnd = false;
      this._chipsLeft = left;
    },

    pickChip(id) {
      if (id === this.cat) return;
      // 选中后把下一个标签也滚进视野,让用户看到右边还有分类
      const i = this.chips.findIndex((c) => c.id === id);
      const next = this.chips[Math.min(i + 1, this.chips.length - 1)];
      this.chipInto = '';
      this.$nextTick(() => (this.chipInto = 'chip-' + next.id));
      this.cat = id;
      this.items = [];
      this.loaded = false;
      this.load();
    },

    openFunc(id) {
      uni.navigateTo({ url: listUrl(id) });
    },

    onTapAll() {
      uni.navigateTo({ url: '/pages/features/features' });
    },

    onTapAddFriend() {

      if (!requireLogin()) return;

      uni.navigateTo({ url: '/pages/friends/friends?focus=1' });

    },


    onTapSearch() {
      uni.navigateTo({ url: '/pages/features/features?focus=1' });
    },

    // 展示中的 + (未勾选「忽略已完成」时)已完成的;已完成的排在最后
    showOrder(o) {
      return isVisibleOf(o) || (!this.hideDone && ['done', 'sold', 'full'].includes(o.status));
    },
    onFilter() {
      uni.showActionSheet({
        itemList: [(this.hideDone ? '' : '✓ ') + t('home.fShowAll'), (this.hideDone ? '✓ ' : '') + t('home.fHideDone')],
        success: (r) => {
          const v = r.tapIndex === 1;
          if (v === this.hideDone) return;
          this.hideDone = v;
          uni.setStorageSync('kr_hide_done', v ? 1 : '');
          this.items = [];
          this.load();
        },
        fail: () => {},
      });
    },
    loadSocial() {
      if (!this._onBadges) {
        this._onBadges = (s) => (this.bs = s);
        uni.$on('kr:badges', this._onBadges);
      }
      refreshBadges();
      const school = appState.readSchool() || {};
      callKrstuast({ action: 'getSchoolStats', schoolId: school.id || '' }).then((r) => {
        const s = (r && r.result) || {};
        this.stats = s.success ? s : {};
        const v = { m: s.members || 0, p: s.posts || 0, d: s.today || 0 };
        // 人少时不显示(避免冷清);人多了再展示学校圈数据
        const circle = v.m < 10 || v.p < 5 ? '' : v.d > 0 ? t('circle.stats', v) : t('circle.statsNoToday', v);
        this.L = { ...this.L, circle, topToday: t('home.topToday'), groupTag: t('group.tag'), joinGroupPrefix: t('group.joinPrefix'), joinGroupSub: t('group.joinSub'), joinBtn: t('group.joinBtn'), onlyFor: t('group.onlyFor'), qrTip: t('group.qrTip'), openLink: t('group.openLink'), copyLink: t('group.copyLink'), close: t('poster.close') };
      }).catch(() => {});
      callKrstuast({ action: 'getTopToday', schoolId: school.id || '', country: appState.getCountry() }).then((r) => {
        const ret = (r && r.result) || {};
        this.tops = ret.list || [];
        this.groups = ret.groups || [];
        if (!this.L.groupTag) this.L = { ...this.L, topToday: t('home.topToday'), groupTag: t('group.tag'), joinGroupPrefix: t('group.joinPrefix'), joinGroupSub: t('group.joinSub'), joinBtn: t('group.joinBtn'), onlyFor: t('group.onlyFor'), qrTip: t('group.qrTip'), openLink: t('group.openLink'), copyLink: t('group.copyLink'), close: t('poster.close') };
      }).catch(() => {});
    },
    openGroup(g) {
      this.grp = g;
    },
    previewQr() {
      if (this.grp && this.grp.qr) uni.previewImage({ urls: [this.grp.qr] });
    },
    openGroupLink() {
      const url = this.grp && this.grp.link;
      if (!url) return;
      // #ifdef APP-PLUS
      plus.runtime.openURL(url);
      // #endif
      // #ifdef H5
      window.open(url, '_blank');
      // #endif
      // #ifdef MP
      this.copyGroupLink();
      // #endif
    },
    copyGroupLink() {
      uni.setClipboardData({ data: this.grp.link, success: () => uni.showToast({ title: t('tools.copied'), icon: 'none' }) });
    },
    openTop(p) {
      uni.navigateTo({ url: '/pages/post/detail?id=' + p._id });
    },
    onTapBell() {
      if (!requireLogin()) return;
      uni.navigateTo({ url: '/pages/notice/system' });
    },

    onTapPublish() {
      if (!requireLogin()) return;
      uni.navigateTo({ url: '/pages/features/features?mode=publish' });
    },

    onTapSchool() {
      const name = this.schoolDisplay;
      uni.showModal({
        title: t('home.schoolSwitchTitle'),
        content: t('home.schoolSwitchContent', { school: name }),
        confirmText: t('common.goSelect'),
        cancelText: t('common.lookAround'),
        confirmColor: '#D63A73',
        success: (res) => {
          if (res.confirm) {
            appState.setSchool(null);
            uni.reLaunch({ url: '/pages/index/index' });
          }
        },
      });
    },
  },
};
</script>

<style>
page {
  background: #f6f5f7;
}
</style>

<style scoped>
.page {
  min-height: 100vh;
  background: #f6f5f7;
  color: #1f1d24;
}
.ic14 { width: 28rpx; height: 28rpx; }
.ic16 { width: 32rpx; height: 32rpx; }
.ic20 { width: 40rpx; height: 40rpx; }
.ic24 { width: 48rpx; height: 48rpx; }
.tap-hover { opacity: 0.6; }

.header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 16rpx 12rpx 32rpx;
  padding-top: calc(var(--status-bar-height, 0px) + 20rpx); /* 自绘顶栏:避开状态栏 */
  background: #ffffff;
}
.school-btn {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 10rpx 0;
}
.school-name {
  font-size: 38rpx;
  font-weight: 700;
  color: #1f1d24;
}
.header-actions {
  display: flex;
  align-items: center;
}
.icon-btn {
  width: 88rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.anns {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 24rpx 24rpx 0;
}
.ann-swiper {
  height: 220rpx;
  border-radius: 28rpx;
  overflow: hidden;
}
.ann-img {
  width: 100%;
  height: 220rpx;
}
.ann-text {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  border-radius: 24rpx;
  background: #ffffff;
}
.ann-tag {
  flex: 0 0 auto;
  padding: 2rpx 14rpx;
  border-radius: 8rpx;
  background: #ffeef4;
  color: #c22f66;
  font-size: 22rpx;
  font-weight: 700;
}
.ann-title {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: #3b3642;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quick {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8rpx;
  padding: 12rpx 16rpx 36rpx;
  background: #ffffff;
  border-radius: 0 0 40rpx 40rpx;
}
.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 8rpx 0;
}
.quick-icon {
  width: 96rpx;
  height: 96rpx;
  border-radius: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.quick-label {
  max-width: 100%;
  font-size: 24rpx;
  color: #3b3642;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.chips {
  white-space: nowrap;
  width: 100%;
  /* 右侧渐隐:提示还能向左滑出更多分类;滑到最右后取消 */
  -webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 96rpx), transparent 100%);
  mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 96rpx), transparent 100%);
}
.chips-end {
  -webkit-mask-image: none;
  mask-image: none;
}
.chips-inner {
  display: inline-flex;
  gap: 16rpx;
  padding: 28rpx 32rpx 20rpx;
}
.chip {
  flex: 0 0 auto;
  height: 68rpx;
  line-height: 66rpx;
  padding: 0 28rpx;
  border-radius: 34rpx;
  border: 2rpx solid #e3dfe7;
  background: #ffffff;
  color: #3b3642;
  font-size: 28rpx;
  box-sizing: border-box;
}
.chip-on {
  border-color: #1f1d24;
  background: #1f1d24;
  color: #ffffff;
  font-weight: 700;
}

.empty {
  padding: 80rpx 32rpx;
  text-align: center;
  font-size: 28rpx;
  color: #6e6878;
}
.more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  padding: 28rpx;
  font-size: 26rpx;
  color: #6e6878;
}
.bottom-space {
  height: calc(260rpx + env(safe-area-inset-bottom));
}

.fab {
  position: fixed;
  right: calc(32rpx + var(--k-side, 0px));
  bottom: calc(164rpx + env(safe-area-inset-bottom));
  height: 96rpx;
  padding: 0 40rpx 0 32rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  border-radius: 48rpx;
  background: #d63a73;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 700;
  box-shadow: 0 16rpx 40rpx rgba(214, 58, 115, 0.32);
  z-index: 50;
}
.fab-hover {
  opacity: 0.85;
}
.icon-btn { position: relative; }
.hb-num { position: absolute; top: 0; right: 0; min-width: 30rpx; height: 30rpx; line-height: 30rpx; padding: 0 6rpx; border-radius: 15rpx; background: #e5484d; color: #fff; font-size: 18rpx; text-align: center; box-sizing: border-box; }
.circle { margin: 4rpx 32rpx 16rpx; }
.circle-n { font-size: 24rpx; color: #6e6878; }
.top-swiper { height: 124rpx; margin: 0 24rpx 24rpx; }
.top-card { display: flex; align-items: center; gap: 20rpx; height: 124rpx; box-sizing: border-box; padding: 22rpx 24rpx; border-radius: 28rpx; background: linear-gradient(90deg, #fff4c2, #fffaf0); }
.top-tag { flex: 0 0 auto; padding: 8rpx 16rpx; border-radius: 12rpx; background: #ffcf3f; color: #6b4300; font-size: 24rpx; font-weight: 800; font-style: italic; }
.top-main { flex: 1; min-width: 0; }
.top-title { font-size: 28rpx; font-weight: 700; color: #1f1d24; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.top-meta { margin-top: 4rpx; font-size: 22rpx; color: #9a8a5a; }
.top-group { background: linear-gradient(90deg, #dff6ec, #f4fbf7); }
.tag-group { background: #3e8e6b; color: #fff; font-style: normal; }
.meta-group { color: #5f8f78; }
.top-go { flex: 0 0 auto; padding: 10rpx 22rpx; border-radius: 999rpx; background: #3e8e6b; color: #fff; font-size: 24rpx; font-weight: 700; }
.g-mask { position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, 0.55); display: flex; align-items: center; justify-content: center; }
.g-box { width: 600rpx; padding: 40rpx 32rpx 32rpx; border-radius: 32rpx; background: #fff; text-align: center; }
.g-name { font-size: 32rpx; font-weight: 800; color: #1f1d24; }
.g-pf { display: inline-block; margin-top: 10rpx; padding: 4rpx 16rpx; border-radius: 10rpx; background: #dff6ec; color: #3e8e6b; font-size: 22rpx; font-weight: 700; }
.g-qr { width: 400rpx; height: 400rpx; margin: 24rpx auto 0; display: block; border-radius: 16rpx; }
.g-school { margin-top: 12rpx; font-size: 24rpx; color: #d63a73; font-weight: 700; }
.g-tip { margin-top: 10rpx; font-size: 22rpx; color: #9a93a3; }
.g-note { margin-top: 16rpx; font-size: 26rpx; color: #3b3642; line-height: 1.5; }
.g-btns { display: flex; gap: 16rpx; margin-top: 28rpx; }
.g-btn { flex: 1; height: 80rpx; line-height: 80rpx; border-radius: 40rpx; background: #f1eff3; font-size: 26rpx; }
.g-pri { background: #3e8e6b; color: #fff; font-weight: 700; }
.chips-row { display: flex; align-items: center; }
.chips-row .chips { flex: 1; min-width: 0; }
.filter-btn { flex: 0 0 auto; margin-left: 24rpx; height: 60rpx; line-height: 60rpx; padding: 0 20rpx; border-radius: 30rpx; background: #ffffff; font-size: 24rpx; color: #3b3642; white-space: nowrap; }
.filter-on { background: #1f1d24; color: #fff; }
</style>
