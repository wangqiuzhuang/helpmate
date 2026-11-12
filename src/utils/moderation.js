// utils/moderation.js —— 举报与拉黑(帖子 / 订单 / 评论 / 用户 / 私聊)
// 应用商店审核要求:用户生成内容的 App 必须能举报内容、拉黑用户,并由开发者处理(后台「举报处理」)
import { callKrstuast, requireLogin } from './cloud.js';
import { t, cloudMsg } from './i18n.js';

const REASONS = ['spam', 'scam', 'abuse', 'sexual', 'illegal', 'privacy', 'other'];

// targetType: post | order | comment | user | message;user 时 targetId 传对方 uid,私聊里再带 convId
export function openReport(targetType, targetId, extra) {
  if (!targetId || !requireLogin()) return;
  uni.showActionSheet({
    itemList: REASONS.map((r) => t('report.reason.' + r)),
    success: (res) => {
      const reason = REASONS[res.tapIndex];
      if (!reason) return;
      uni.showModal({
        title: t('report.title'),
        editable: true,
        placeholderText: t('report.detailPh'),
        content: '',
        confirmText: t('report.submit'),
        cancelText: t('common.cancel'),
        confirmColor: '#D63A73',
        success: (m) => {
          if (!m.confirm) return;
          callKrstuast({ action: 'report', targetType, targetId, reason, detail: (m.content || '').slice(0, 300), ...(extra || {}) })
            .then((r) => {
              const ret = (r && r.result) || {};
              uni.showToast({ title: ret.success ? t('report.done') : cloudMsg(ret.message), icon: 'none' });
            })
            .catch(() => uni.showToast({ title: t('common.networkError'), icon: 'none' }));
        },
      });
    },
    fail: () => {},
  });
}

// 拉黑:对方的帖子/评论不再出现,双方不能私聊;可在「我的 → 黑名单」解除
export function confirmBlock(uid, name, done) {
  if (!uid || !requireLogin()) return;
  uni.showModal({
    title: t('block.title', { name: name || '' }),
    content: t('block.content'),
    confirmText: t('block.confirm'),
    cancelText: t('common.cancel'),
    confirmColor: '#E5484D',
    success: (m) => {
      if (!m.confirm) return;
      callKrstuast({ action: 'blockUser', uid })
        .then((r) => {
          const ret = (r && r.result) || {};
          uni.showToast({ title: ret.success ? t('block.done') : cloudMsg(ret.message), icon: 'none' });
          if (ret.success && done) done();
        })
        .catch(() => uni.showToast({ title: t('common.networkError'), icon: 'none' }));
    },
  });
}

// 「举报 / 拉黑」二选一菜单(个人主页、私聊页右上角)
export function userActions(uid, name, extra, onBlocked) {
  uni.showActionSheet({
    itemList: [t('report.reportUser'), t('block.action')],
    success: (res) => {
      if (res.tapIndex === 0) openReport('user', uid, extra);
      if (res.tapIndex === 1) confirmBlock(uid, name, onBlocked);
    },
    fail: () => {},
  });
}

export default { openReport, confirmBlock, userActions };
