import __m0_i18n from './i18n.js';
import cloud, { requireLogin } from '@/utils/cloud.js';
// chat.js —— 私聊入口工具：通过对方 uid 发起会话并跳转聊天室
const { t, cloudMsg } = __m0_i18n;

const openChatWith = (uid, name, ref) => {
  if (!requireLogin()) return;
  cloud
    .callFunction({ name: 'krstuast', data: { action: 'startConversation', targetUid: uid, refType: ref && ref.type, refId: ref && ref.id, greet: (ref && ref.greet) || '' } })
    .then((res) => {
      const r = res.result || {};
      if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
      uni.navigateTo({
        url: `/pages/chat/room?convId=${r.convId}&name=${encodeURIComponent(name || '')}`,
      });
    })
    .catch(() => uni.showToast({ title: t('common.networkError'), icon: 'none' }));
};

const __exports = { openChatWith };
export { openChatWith };
export default __exports;
