<template>
<!--school-picker 底部弹层选校:韩国 261 所单列表;中国 2919 所按省份浏览 + 搜索-->
<view v-if="visible" class="picker">
  <view class="mask" @tap.stop="onMaskTap" />
  <view class="sheet">
    <view class="grab" />
    <view class="head">
      <view class="head-title">{{ L.title }}</view>
      <view class="head-count">{{ countLabel }}</view>
    </view>

    <view class="searchbar">
      <image class="search-icon" src="/static/icons/search-1f1d24.png" />
      <input class="search-input" :placeholder="L.searchPh" placeholder-class="search-ph" :value="query" @input="onQueryInput" confirm-type="search" cursor-spacing="16" />
      <view v-if="query" class="search-clear" @tap.stop="onClearQuery">✕</view>
    </view>

    <view v-if="loading" class="state">
      <view class="state-text">{{ L.loading }}</view>
    </view>
    <view v-else-if="loadError" class="state">
      <view class="state-text">{{ L.loadFail }}</view>
      <view class="retry" @tap="load">{{ L.retry }}</view>
    </view>

    <scroll-view v-else class="list" scroll-y :scroll-top="scrollTopVal" :show-scrollbar="false">
      <!-- 中国:未搜索、未选省份 → 省份网格 -->
      <view v-if="mode === 'provinces'" class="prov-wrap">
        <view class="sec-title">{{ L.byProvince }}</view>
        <view class="prov-grid">
          <view v-for="p in provinces" :key="p.key" class="prov" hover-class="row-hover" @tap="openProvince(p.key)">
            <text class="prov-name">{{ p.label }}</text>
            <text class="prov-n">{{ p.n }}</text>
          </view>
        </view>
      </view>

      <view v-else>
        <view v-if="mode === 'province'" class="back-row" @tap="closeProvince">
          <text class="back-arrow">‹</text>
          <text>{{ L.allProvinces }}</text>
          <text class="back-cur">· {{ provinceLabel }}</text>
        </view>
        <view v-for="item in list" :key="item.id" class="row" :data-id="item.id" @tap="onSelectSchool" hover-class="row-hover">
          <view class="row-main">
            <view class="row-cn">{{ item.nameMain }}</view>
            <view v-if="item.nameSub" class="row-kr">{{ item.nameSub }}</view>
          </view>
          <view class="row-right">
            <text :class="['row-type', item.hot ? 'row-hot' : '']">{{ item.typeLabel }}</text>
            <text v-if="item.id === selectedId" class="row-tick">✓</text>
          </view>
        </view>
        <view v-if="more" class="more-tip">{{ L.moreTip }}</view>

        <view v-if="query && !list.length" class="empty">
          <view class="empty-text">{{ L.emptyText }}</view>
          <view class="empty-sub">{{ L.emptySub }}</view>
        </view>
      </view>

      <view class="request" @tap="onRequestSchool">{{ L.request }}</view>
      <view class="list-bottom" />
    </scroll-view>

    <view v-if="!forced" class="foot">
      <view class="cancel-btn" hover-class="cancel-hover" @tap="onCancel">{{ L.cancel }}</view>
    </view>
    <view class="safe-bottom" />
  </view>
</view>
</template>

<script>
import { buildIndex, matchSchools, schoolsOfProvince } from '../../utils/school-search.js';
import { t, localizedSchool, cloudMsg } from '../../utils/i18n.js';
import { ensureSchools, getSchools, cnProvinces } from '../../utils/school-data.js';
import { callKrstuast } from '../../utils/cloud.js';

const CN_MAX = 60; // 中国名单搜索结果上限(3000 所全渲染在低端机上会卡)
const INDEX = {}; // country → 搜索索引

const typeLabel = (s) => {
  if (s.tags && s.tags.length) return s.tags[0];
  return t('schools.type.' + s.type);
};
const toRow = (s) => {
  const loc = localizedSchool(s);
  return { id: s.id, nameMain: loc.nameMain, nameSub: loc.nameSub, typeLabel: typeLabel(s), hot: !!(s.tags && s.tags.length) };
};

export default {
  props: {
    visible: { type: Boolean, default: false },
    selectedId: { type: String, default: '' },
    forced: { type: Boolean, default: false }, // 首次启动不可关闭
    country: { type: String, default: 'kr' },
  },
  emits: ['select', 'close'],
  data() {
    return {
      query: '',
      list: [],
      more: false,
      mode: 'list', // list | provinces | province
      province: '',
      provinces: [],
      loading: false,
      loadError: false,
      total: 0,
      scrollTopVal: 0,
      L: {},
    };
  },
  computed: {
    countLabel() {
      return this.total ? t('schoolPicker.count', { n: this.total }) : '';
    },
    provinceLabel() {
      return this.province ? t('province.' + this.province) : '';
    },
  },
  created() {
    this.buildL();
    if (this.visible) this.load();
  },
  watch: {
    visible(v) {
      if (v) {
        this.buildL();
        this.query = '';
        this.province = '';
        this.load();
      }
    },
    country() {
      if (this.visible) this.load();
    },
  },
  methods: {
    buildL() {
      this.L = {
        title: t('schoolPicker.title'),
        searchPh: t(this.country === 'cn' ? 'schoolPicker.searchPhCn' : 'schoolPicker.searchPh'),
        emptyText: t('schoolPicker.emptyText'),
        emptySub: t('schoolPicker.emptySub'),
        cancel: t('common.cancel'),
        loading: t('schoolPicker.loading'),
        loadFail: t('schoolPicker.loadFail'),
        retry: t('schoolPicker.retry'),
        byProvince: t('schoolPicker.byProvince'),
        allProvinces: t('schoolPicker.allProvinces'),
        moreTip: t('schoolPicker.moreTip'),
        request: t('schoolPicker.request'),
      };
    },
    load() {
      const c = this.country;
      this.loadError = false;
      const ready = (list) => {
        if (c !== this.country) return;
        if (!INDEX[c]) INDEX[c] = buildIndex(list);
        this.total = list.length;
        if (c === 'cn') {
          const counts = {};
          list.forEach((s) => (counts[s.region] = (counts[s.region] || 0) + 1));
          this.provinces = cnProvinces().map((p) => ({ key: p, label: t('province.' + p), n: counts[p] || 0 }));
        }
        this.loading = false;
        this.refresh();
      };
      const sync = getSchools(c);
      if (sync.length) return ready(sync);
      this.loading = true;
      ensureSchools(c)
        .then(ready)
        .catch(() => {
          this.loading = false;
          this.loadError = true;
        });
    },
    scrollTop() {
      this.scrollTopVal = 1;
      setTimeout(() => (this.scrollTopVal = 0), 0);
    },
    refresh() {
      const c = this.country;
      const idx = INDEX[c];
      if (!idx) return;
      const q = (this.query || '').trim();
      this.more = false;
      if (c === 'cn' && !q) {
        if (this.province) {
          this.mode = 'province';
          this.list = schoolsOfProvince(getSchools('cn'), this.province).map(toRow);
        } else {
          this.mode = 'provinces';
          this.list = [];
        }
      } else {
        this.mode = 'list';
        const rows = matchSchools(idx, q, c === 'cn' ? CN_MAX + 1 : 0);
        if (c === 'cn' && rows.length > CN_MAX) {
          rows.length = CN_MAX;
          this.more = true;
        }
        this.list = rows.map((r) => toRow(r.school));
      }
      this.scrollTop();
    },
    openProvince(p) {
      this.province = p;
      this.refresh();
    },
    closeProvince() {
      this.province = '';
      this.refresh();
    },
    onQueryInput(e) {
      this.query = e.detail.value;
      this.refresh();
    },
    onClearQuery() {
      this.query = '';
      this.refresh();
    },
    onSelectSchool(e) {
      const { id } = e.currentTarget.dataset;
      this.$emit('select', { detail: { id } });
    },
    // 找不到学校:提交名称,后台人工审核后加入名单
    onRequestSchool() {
      uni.showModal({
        title: t('schoolPicker.requestTitle'),
        editable: true,
        placeholderText: t('schoolPicker.requestPh'),
        content: this.query || '',
        confirmText: t('schoolPicker.requestSubmit'),
        cancelText: t('common.cancel'),
        confirmColor: '#D63A73',
        success: (res) => {
          if (!res.confirm) return;
          const name = (res.content || '').trim();
          if (name.length < 2) return uni.showToast({ title: t('schoolPicker.requestShort'), icon: 'none' });
          callKrstuast({ action: 'requestSchool', name, country: this.country })
            .then((r) => {
              const ret = (r && r.result) || {};
              uni.showToast({ title: ret.success ? t('schoolPicker.requestDone') : cloudMsg(ret.message), icon: 'none' });
            })
            .catch(() => uni.showToast({ title: t('common.networkError'), icon: 'none' }));
        },
      });
    },
    onMaskTap() {
      if (this.forced) {
        uni.showToast({ title: t('schoolPicker.forceSelect'), icon: 'none' });
        return;
      }
      this.$emit('close', { detail: {} });
    },
    onCancel() {
      this.onMaskTap();
    },
  },
};
</script>

<style scoped>
.picker { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1000; }
.mask { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(31, 29, 36, 0.45); animation: fade-in 0.22s ease-out; }
.sheet { position: absolute; left: var(--k-side, 0); right: var(--k-side, 0); bottom: 0; height: 82vh; display: flex; flex-direction: column; background: #ffffff; border-radius: 40rpx 40rpx 0 0; box-shadow: 0 -12rpx 48rpx rgba(31, 29, 36, 0.07); animation: sheet-up 0.26s cubic-bezier(0.22, 0.9, 0.36, 1); }
.grab { width: 72rpx; height: 8rpx; border-radius: 999rpx; background: #e3dfe7; margin: 16rpx auto 0; }
.head { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 40rpx 12rpx; }
.head-title { font-size: 36rpx; font-weight: 700; color: #1f1d24; }
.head-count { font-size: 24rpx; color: #6e6878; background: #f3f1f5; border-radius: 999rpx; padding: 8rpx 20rpx; }
.searchbar { display: flex; align-items: center; margin: 8rpx 32rpx 16rpx; padding: 0 24rpx; height: 84rpx; background: #f3f1f5; border-radius: 999rpx; }
.search-icon { width: 34rpx; height: 34rpx; margin-right: 14rpx; opacity: 0.45; }
.search-input { flex: 1; height: 100%; font-size: 28rpx; color: #1f1d24; }
.search-ph { color: #8a8494; }
.search-clear { width: 44rpx; height: 44rpx; line-height: 44rpx; text-align: center; border-radius: 50%; background: #e3dfe7; color: #6e6878; font-size: 24rpx; }
.state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24rpx; }
.state-text { font-size: 28rpx; color: #6e6878; }
.retry { padding: 16rpx 48rpx; border-radius: 999rpx; background: #d63a73; color: #ffffff; font-size: 28rpx; font-weight: 700; }
.list { flex: 1; min-height: 0; }
.sec-title { padding: 12rpx 40rpx 16rpx; font-size: 26rpx; color: #6e6878; }
.prov-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16rpx; padding: 0 32rpx; }
.prov { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 112rpx; border-radius: 24rpx; background: #f7f5f8; }
.prov-name { font-size: 28rpx; font-weight: 600; color: #1f1d24; text-align: center; padding: 0 8rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; box-sizing: border-box; }
.prov-n { margin-top: 4rpx; font-size: 22rpx; color: #8a8494; }
.back-row { display: flex; align-items: center; gap: 8rpx; padding: 12rpx 40rpx 16rpx; font-size: 28rpx; color: #c22f66; font-weight: 600; }
.back-arrow { font-size: 40rpx; line-height: 1; }
.back-cur { color: #6e6878; font-weight: 400; }
.row { display: flex; align-items: center; margin: 4rpx 24rpx; padding: 20rpx 24rpx; border-radius: 24rpx; }
.row-hover { background: #faf9fb; }
.row-main { flex: 1; min-width: 0; }
.row-cn { font-size: 30rpx; font-weight: 600; color: #1f1d24; }
.row-kr { font-size: 22rpx; color: #6e6878; margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-right { display: flex; align-items: center; margin-left: 16rpx; }
.row-type { font-size: 22rpx; color: #6e6878; background: #f3f1f5; border-radius: 999rpx; padding: 4rpx 16rpx; white-space: nowrap; }
.row-hot { color: #c22f66; background: #ffeef4; }
.row-tick { margin-left: 12rpx; width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; border-radius: 50%; background: #d63a73; color: #ffffff; font-size: 24rpx; font-weight: 700; }
.more-tip { padding: 16rpx 40rpx; font-size: 24rpx; color: #8a8494; text-align: center; }
.empty { padding: 80rpx 60rpx 24rpx; display: flex; flex-direction: column; align-items: center; }
.empty-text { font-size: 30rpx; font-weight: 600; color: #1f1d24; }
.empty-sub { font-size: 24rpx; color: #6e6878; margin-top: 12rpx; }
.request { margin: 32rpx auto 0; padding: 16rpx 32rpx; text-align: center; font-size: 26rpx; color: #c22f66; }
.list-bottom { height: 24rpx; }
.foot { padding: 16rpx 32rpx 0; }
.cancel-btn { height: 88rpx; line-height: 88rpx; text-align: center; border-radius: 999rpx; background: #f3f1f5; color: #3b3642; font-size: 30rpx; font-weight: 600; }
.cancel-hover { background: #ebe8ee; }
.safe-bottom { height: calc(env(safe-area-inset-bottom) + 12rpx); }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
</style>
