<template>
<!-- pages/mine/blocked 黑名单:查看并解除拉黑 -->
<view class="page">
  <view v-if="loaded && !list.length" class="empty">{{ L.empty }}</view>
  <view v-if="list.length" class="card">
    <view v-for="u in list" :key="u.uid" class="row">
      <image v-if="u.avatarUrl" class="avatar" :src="u.avatarUrl" mode="aspectFill" />
      <view v-else class="avatar avatar-text">{{ (u.nickname || '?').slice(0, 1) }}</view>
      <view class="main">
        <view class="nick">{{ u.nickname }}</view>
        <view class="uid">ID {{ u.uid }}</view>
      </view>
      <view class="btn" hover-class="btn-hover" @tap="unblock(u)">{{ L.unblock }}</view>
    </view>
  </view>
</view>
</template>

<script>
import { callKrstuast } from '@/utils/cloud.js';
import { t, cloudMsg } from '../../utils/i18n.js';

export default {
  data() {
    return { list: [], loaded: false, L: {} };
  },
  onShow() {
    uni.setNavigationBarTitle({ title: t('nav.blocked') });
    this.L = { empty: t('blocked.empty'), unblock: t('blocked.unblock') };
    this.load();
  },
  methods: {
    load() {
      callKrstuast({ action: 'getBlockedUsers' })
        .then((r) => {
          const ret = (r && r.result) || {};
          this.list = ret.list || [];
          this.loaded = true;
        })
        .catch(() => {
          this.loaded = true;
          uni.showToast({ title: t('common.networkError'), icon: 'none' });
        });
    },
    unblock(u) {
      callKrstuast({ action: 'unblockUser', uid: u.uid }).then((r) => {
        const ret = (r && r.result) || {};
        if (!ret.success) return uni.showToast({ title: cloudMsg(ret.message), icon: 'none' });
        uni.showToast({ title: t('blocked.unblocked'), icon: 'none' });
        this.list = this.list.filter((x) => x.uid !== u.uid);
      });
    },
  },
};
</script>

<style>
page { background: #f6f5f7; }
</style>

<style scoped>
.page { min-height: 100vh; padding: 24rpx; box-sizing: border-box; background: #f6f5f7; color: #1f1d24; }
.empty { padding: 160rpx 0; text-align: center; font-size: 28rpx; color: #6e6878; }
.card { background: #ffffff; border-radius: 32rpx; overflow: hidden; }
.row { display: flex; align-items: center; gap: 24rpx; padding: 24rpx 32rpx; border-bottom: 2rpx solid #f0edf2; }
.row:last-child { border-bottom: 0; }
.avatar { flex: 0 0 88rpx; width: 88rpx; height: 88rpx; border-radius: 50%; background: #ffeef4; }
.avatar-text { display: flex; align-items: center; justify-content: center; color: #c22f66; font-size: 36rpx; font-weight: 700; }
.main { flex: 1; min-width: 0; }
.nick { font-size: 30rpx; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uid { margin-top: 4rpx; font-size: 24rpx; color: #6e6878; }
.btn { flex: 0 0 auto; height: 60rpx; line-height: 56rpx; padding: 0 28rpx; border: 2rpx solid #e3dfe7; border-radius: 30rpx; font-size: 26rpx; color: #3b3642; box-sizing: border-box; }
.btn-hover { opacity: 0.6; }
</style>
