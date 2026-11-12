<template>
<!-- k-lv 用户等级小标签 -->
<text v-if="lv" :class="['lv', 'lv' + tier]">Lv{{ lv }}</text>
</template>
<script>
export default {
  props: { lv: { type: Number, default: 0 } },
  computed: {
    tier() {
      return this.lv >= 8 ? 4 : this.lv >= 5 ? 3 : this.lv >= 3 ? 2 : 1;
    },
  },
};
</script>
<style scoped>
.lv { display: inline-block; margin-left: 10rpx; padding: 0 12rpx; height: 32rpx; line-height: 32rpx; border-radius: 16rpx; font-size: 20rpx; font-weight: 700; vertical-align: middle; font-style: italic; }
.lv1 { background: #eef1f6; color: #6b7a90; }
.lv2 { background: #e3f4ec; color: #23845b; }
.lv3 { background: #e8e4ff; color: #5b45c2; }
.lv4 { background: linear-gradient(90deg, #ffd66b, #ff9f5a); color: #7a3a00; }
</style>
