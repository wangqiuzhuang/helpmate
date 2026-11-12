// utils/badges.js —— 全局角标(好友申请 / 系统通知 / 私聊未读 / 新动态),各页面与底栏共用
import { callKrstuast, isGuest } from './cloud.js';
import appState from './app-state.js';

const SEEN_KEY = 'kr_moments_seen';
let state = { friendRequests: 0, notifications: 0, messages: 0, newMoments: 0 };
let last = 0;
let pending = null;

export const getBadgeState = () => state;
export const markMomentsSeen = () => {
  uni.setStorageSync(SEEN_KEY, Date.now());
  state = { ...state, newMoments: 0 };
  uni.$emit('kr:badges', state);
};
export function refreshBadges(force) {
  if (isGuest()) return Promise.resolve(state);
  if (!force && Date.now() - last < 8000) return Promise.resolve(state);
  if (pending) return pending;
  let since = Number(uni.getStorageSync(SEEN_KEY)) || 0;
  if (!since) {
    since = Date.now();
    uni.setStorageSync(SEEN_KEY, since);
  }
  pending = callKrstuast({ action: 'getBadges', momentsSince: since, country: appState.getCountry() })
    .then((r) => {
      const ret = (r && r.result) || {};
      if (ret.success) {
        state = { friendRequests: ret.friendRequests || 0, notifications: ret.notifications || 0, messages: ret.messages || 0, newMoments: ret.newMoments || 0 };
        last = Date.now();
        uni.$emit('kr:badges', state);
      }
      return state;
    })
    .catch(() => state)
    .finally(() => (pending = null));
  return pending;
}
uni.$on('kr:message', () => refreshBadges(true));
uni.$on('kr:unread-changed', () => refreshBadges(true));
export default { refreshBadges, getBadgeState, markMomentsSeen };
