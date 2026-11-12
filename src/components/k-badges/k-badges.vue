<template>
<!-- k-badges 行为徽章:done10 / comment50 / share100 / liked10 ... -->
<view v-if="list.length" class="bs">
  <text v-for="b in list" :key="b.key" class="b">{{ b.text }}</text>
</view>
</template>
<script>
import { t } from '../../utils/i18n.js';
export default {
  props: { items: { type: Array, default: () => [] } },
  computed: {
    list() {
      return (this.items || []).map((k) => {
        const m = /^([a-z]+)(\d+)$/.exec(k) || [];
        return { key: k, text: m[2] + '+' + t('badge.' + m[1]) };
      });
    },
  },
};
</script>
<style scoped>
.bs { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 10rpx; }
.b { padding: 4rpx 16rpx; border-radius: 999rpx; background: #fff6d6; color: #8a6200; font-size: 20rpx; font-weight: 600; }
</style>
