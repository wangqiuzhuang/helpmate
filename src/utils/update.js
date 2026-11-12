// utils/update.js —— 「检查更新」(仅安卓/iOS App;小程序由微信自动更新)
//
// 最新版本信息由服务器 .env 配置(APP_LATEST_VERSION / APP_LATEST_CODE / APP_DOWNLOAD_URL / APP_UPDATE_NOTE / APP_MIN_CODE),
// 发新版时不用改代码:上传 APK 到服务器 → 改 .env → 重启后端,老版本用户打开 App 即收到提示。
import { callKrstuast } from './cloud.js';
import { t } from './i18n.js';

const DAY_KEY = 'krstuast_update_day_v1';

// 当前安装的版本 { version: '1.1.0', code: 110 }
export function currentVersion() {
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    plus.runtime.getProperty(plus.runtime.appid, (info) => resolve({ version: info.version || '', code: Number(info.versionCode) || 0 }));
    return;
    // #endif
    resolve({ version: '', code: 0 });
  });
}

// silent=true:启动时自动检查(每天最多一次,没有新版本不打扰);false:用户手动点击
export async function checkUpdate(silent) {
  // #ifndef APP-PLUS
  if (!silent) uni.showToast({ title: t('update.latest'), icon: 'none' });
  return;
  // #endif
  // #ifdef APP-PLUS
  const today = new Date().toISOString().slice(0, 10);
  if (silent) {
    try {
      if (uni.getStorageSync(DAY_KEY) === today) return;
      uni.setStorageSync(DAY_KEY, today);
    } catch (e) {}
  } else {
    uni.showLoading({ title: '' });
  }
  let ret = {};
  try {
    const res = await callKrstuast({ action: 'getAppVersion' });
    ret = (res && res.result) || {};
  } catch (e) {
    ret = {};
  }
  if (!silent) uni.hideLoading();
  const cur = await currentVersion();
  if (!ret.success || !ret.code || !ret.url || ret.code <= cur.code) {
    if (!silent) uni.showToast({ title: t('update.latest'), icon: 'none' });
    return;
  }
  const force = ret.minCode && cur.code < ret.minCode;
  uni.showModal({
    title: t('update.title', { v: ret.version || '' }),
    content: ret.note || t('update.content'),
    confirmText: t('update.download'),
    cancelText: t('update.later'),
    showCancel: !force,
    confirmColor: '#D63A73',
    success: (r) => {
      if (r.confirm) plus.runtime.openURL(ret.url);
    },
  });
  // #endif
}

export default { currentVersion, checkUpdate };
