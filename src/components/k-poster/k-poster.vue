<template>
<!-- k-poster 分享海报:canvas 绘制 标题/正文/发布人/二维码 → 预览 → 保存相册(无第三方 SDK) -->
<view v-if="show" class="mask" @tap="close">
  <view class="box" @tap.stop>
    <image v-if="img" class="img" :src="img" mode="widthFix" show-menu-by-longpress />
    <view v-else class="loading">{{ L.making }}</view>
    <view class="btns">
      <view class="btn" @tap="close">{{ L.close }}</view>
      <view :class="['btn', 'btn-pri', img ? '' : 'btn-off']" @tap="save">{{ L.save }}</view>
    </view>
    <view class="tip">{{ L.tip }}</view>
  </view>
  <canvas canvas-id="krPoster" id="krPoster" class="cv" :style="{ width: W + 'px', height: H + 'px' }" />
</view>
</template>

<script>
import { callKrstuast } from '@/utils/cloud.js';
import serverCfg from '@/config/server.js';
import { t } from '../../utils/i18n.js';

const W = 375;
const H = 600;
const SITE = serverCfg.base || 'https://helpmate.new-apis.com';
const localImg = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve('');
    uni.getImageInfo({ src, success: (r) => resolve(r.path), fail: () => resolve('') });
  });
function wrap(ctx, text, maxW, maxLines) {
  const lines = [];
  let line = '';
  for (const ch of String(text || '').replace(/\n+/g, ' ')) {
    if (ctx.measureText(line + ch).width > maxW) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else line += ch;
  }
  if (lines.length < maxLines && line) lines.push(line);
  else if (lines.length >= maxLines) lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
  return lines;
}

export default {
  data() {
    return { show: false, img: '', W, H, data: null };
  },
  computed: {
    L() {
      return { making: t('poster.making'), close: t('poster.close'), save: t('poster.save'), tip: t('poster.tip') };
    },
  },
  methods: {
    // opts: { refType, refId, title, content, author, avatar, image, tag, rows:[{label,value}], group:{text,slots:[{avatar,filled}]} }
    open(opts) {
      this.data = opts || {};
      this.img = '';
      this.H = H;
      this.show = true;
      setTimeout(() => this.draw(), 60);
    },
    close() {
      this.show = false;
    },
    async draw() {
      const d = this.data;
      const link = `${SITE}/api/download?from=${d.refType || 'app'}_${d.refId || ''}`;
      const slots = (d.group && d.group.slots) || [];
      const [qr, avatar, image, ...slotImgs] = await Promise.all([
        localImg(`${SITE}/api/qrcode?text=${encodeURIComponent(link)}`),
        localImg(d.avatar),
        localImg(d.image),
        ...slots.map((s) => localImg(s.avatar)),
      ]);
      const ctx = uni.createCanvasContext('krPoster', this);
      const X = 36, CW = W - 72;
      // ---- 第一遍:排版,算出内容高度(画布按内容自适应,不再留大片空白) ----
      const ops = [];
      let y = 104;
      ops.push(() => {
        if (avatar) ctx.drawImage(avatar, X, 82, 32, 32);
        ctx.setFillStyle('#1F1D24');
        ctx.setFontSize(14);
        ctx.fillText(d.author || '', avatar ? X + 40 : X, 103);
      });
      y += 34;
      if (d.title) {
        ctx.setFontSize(20);
        const ls = wrap(ctx, d.title, CW, 2);
        const y0 = y;
        ops.push(() => { ctx.setFillStyle('#1F1D24'); ctx.setFontSize(20); ls.forEach((l, i) => ctx.fillText(l, X, y0 + i * 28)); });
        y += ls.length * 28 + 6;
      }
      const rows = (d.rows || []).filter((r) => r && r.value);
      if (rows.length) {
        ctx.setFontSize(13);
        const lw = Math.min(96, Math.max(0, ...rows.map((r) => (r.label ? ctx.measureText(r.label).width : 0))));
        const y0 = y;
        ops.push(() => { ctx.setStrokeStyle('#F1EFF3'); ctx.setLineWidth(1); ctx.beginPath(); ctx.moveTo(X, y0 - 14); ctx.lineTo(X + CW, y0 - 14); ctx.stroke(); });
        y += 6;
        rows.forEach((r) => {
          const vx = r.label ? X + lw + 14 : X;
          ctx.setFontSize(14);
          const ls = wrap(ctx, r.value, X + CW - vx, 2);
          const ry = y;
          ops.push(() => {
            if (r.label) { ctx.setFillStyle('#9A93A3'); ctx.setFontSize(13); ctx.fillText(r.label, X, ry); }
            ctx.setFillStyle('#1F1D24'); ctx.setFontSize(14);
            ls.forEach((l, i) => ctx.fillText(l, vx, ry + i * 20));
          });
          y += ls.length * 20 + 10;
        });
        y += 4;
      }
      if (d.group) {
        const gy = y;
        const n = Math.min(slots.length, 7);
        ops.push(() => {
          ctx.setFillStyle('#FFF8E6');
          ctx.fillRect(X - 8, gy - 6, CW + 16, 92);
          ctx.setFillStyle('#1F1D24'); ctx.setFontSize(14);
          ctx.fillText(d.group.text || '', X, gy + 14);
          for (let i = 0; i < n; i++) {
            const cx = X + 20 + i * 46, cy = gy + 52, r = 18;
            ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.setFillStyle('#FFFFFF'); ctx.fill();
            if (slotImgs[i]) { ctx.clip(); ctx.drawImage(slotImgs[i], cx - r, cy - r, r * 2, r * 2); }
            ctx.restore();
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.setStrokeStyle(slots[i].filled ? '#D63A73' : '#1F1D24'); ctx.setLineWidth(1.5); ctx.stroke();
            if (!slots[i].filled) { ctx.setFillStyle('#1F1D24'); ctx.setFontSize(20); ctx.fillText('+', cx - 6, cy + 7); }
            else if (!slotImgs[i]) { ctx.setFillStyle('#C9C3D1'); ctx.beginPath(); ctx.arc(cx, cy - 4, 6, 0, 2 * Math.PI); ctx.fill(); }
          }
        });
        y += 98;
      }
      if (d.content) {
        ctx.setFontSize(15);
        const ls = wrap(ctx, d.content, CW, image ? 3 : 6);
        const y0 = y + 6;
        ops.push(() => { ctx.setFillStyle('#3B3642'); ctx.setFontSize(15); ls.forEach((l, i) => ctx.fillText(l, X, y0 + i * 24)); });
        y += ls.length * 24 + 8;
      }
      if (image) {
        const iy = y;
        ops.push(() => ctx.drawImage(image, X, iy, CW, 160));
        y += 170;
      }
      const cardBottom = Math.max(y + 6, 300);
      const h = cardBottom + 100;
      this.H = h;
      await new Promise((r) => this.$nextTick(() => setTimeout(r, 80)));
      // ---- 第二遍:绘制 ----
      const grd = ctx.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#FFE3EE');
      grd.addColorStop(1, '#FFF8E6');
      ctx.setFillStyle(grd);
      ctx.fillRect(0, 0, W, h);
      ctx.setFillStyle('#FFFFFF');
      ctx.fillRect(20, 70, W - 40, cardBottom - 70);
      ctx.setFillStyle('#D63A73');
      ctx.setFontSize(22);
      ctx.fillText('HelpMate', 24, 46);
      ctx.setFillStyle('#6E6878');
      ctx.setFontSize(12);
      ctx.fillText(d.tag || t('poster.slogan'), 140, 46);
      ops.forEach((f) => f());
      if (qr) ctx.drawImage(qr, W - 116, h - 92, 84, 84);
      ctx.setFillStyle('#1F1D24');
      ctx.setFontSize(15);
      ctx.fillText(t('poster.scan'), 28, h - 58);
      ctx.setFillStyle('#6E6878');
      ctx.setFontSize(12);
      ctx.fillText(t('poster.scanSub'), 28, h - 34);
      ctx.draw(false, () => {
        setTimeout(() => {
          uni.canvasToTempFilePath({ canvasId: 'krPoster', width: W, height: h, destWidth: W * 2, destHeight: h * 2, success: (r) => (this.img = r.tempFilePath), fail: () => uni.showToast({ title: t('poster.fail'), icon: 'none' }) }, this);
        }, 150);
      });
      if (d.refType) callKrstuast({ action: 'recordShare', refType: d.refType, refId: d.refId }).catch(() => {});
    },
    save() {
      if (!this.img) return;
      // #ifdef H5
      uni.showToast({ title: t('poster.longPress'), icon: 'none' });
      uni.previewImage({ urls: [this.img] });
      return;
      // #endif
      uni.saveImageToPhotosAlbum({
        filePath: this.img,
        success: () => uni.showToast({ title: t('poster.saved'), icon: 'none' }),
        fail: () => uni.previewImage({ urls: [this.img] }),
      });
    },
  },
};
</script>

<style scoped>
.mask { position: fixed; inset: 0; z-index: 2000; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; }
.box { width: 600rpx; background: #fff; border-radius: 28rpx; padding: 24rpx; }
.img { width: 100%; border-radius: 16rpx; }
.loading { height: 800rpx; display: flex; align-items: center; justify-content: center; color: #6e6878; font-size: 28rpx; }
.btns { display: flex; gap: 20rpx; margin-top: 20rpx; }
.btn { flex: 1; height: 80rpx; line-height: 80rpx; text-align: center; border-radius: 40rpx; background: #f1eff3; font-size: 28rpx; }
.btn-pri { background: #d63a73; color: #fff; font-weight: 700; }
.btn-off { opacity: 0.4; }
.tip { margin-top: 14rpx; text-align: center; font-size: 22rpx; color: #9a93a3; }
.cv { position: fixed; left: -2000px; top: 0; }
</style>
