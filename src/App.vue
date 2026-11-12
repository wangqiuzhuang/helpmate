<script>
// App.vue —— 应用入口(原 app.js)
import appState from '@/utils/app-state.js';
import cloud from '@/utils/cloud.js';
import realtime from '@/utils/realtime.js';
import { checkUpdate } from '@/utils/update.js';

const GUIDE_KEY = 'krstuast_guide_v1';

export default {
  globalData: appState.globalData,
  onLaunch() {
    appState.launch();
    cloud.init();
    // 底部导航使用自绘的 k-tab-bar,隐藏原生 tabBar
    uni.hideTabBar({ animation: false, fail: () => {} });
    // 首次启动:新手引导(看过后不再出现);游客无需登录即可浏览,发布/评论/私聊时再引导登录
    let seen = false;
    try {
      seen = !!uni.getStorageSync(GUIDE_KEY);
    } catch (e) {}
    if (!seen) uni.reLaunch({ url: '/pages/guide/guide' });
    // 安卓/iOS:启动后静默检查新版本(每天最多一次)
    else setTimeout(() => checkUpdate(true), 3000);
  },
  // 前台时保持实时消息连接,切到后台断开(省电省流量)
  onShow() {
    realtime.connect();
  },
  onHide() {
    realtime.disconnect();
  },
};
</script>

<style>
@import './styles/app.css';
/* #ifndef MP-WEIXIN */
/* App/H5:与小程序一致的 box-sizing 与字体 */
page {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif;
}
/* #endif */
/* 平板/宽屏:内容限制为 540px 居中,两侧留白(手机上不生效) */
page {
  --k-side: 0px;
}
@media (min-width: 600px) {
  body {
    background: #f3e9ef;
  }
  page {
    --k-side: calc((100vw - 540px) / 2);
    max-width: 540px;
    margin: 0 auto;
    min-height: 100vh;
    box-shadow: 0 0 48px rgba(247, 110, 156, 0.12);
  }
}
</style>
