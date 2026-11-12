// utils/translate.js —— 按需翻译(帖子 / 评论 / 私聊)。目标语言 = 当前界面语言
// 服务端有全局缓存 + 每人每天限额;本地再缓存一层,同一段文字本次启动内只请求一次
import { callKrstuast } from './cloud.js';
import i18n, { t, cloudMsg } from './i18n.js';

const memo = {};

// 成功 resolve(译文);失败 reject(给用户看的提示,未登录时为空——登录弹窗已出现)
export function translate(text) {
  const target = i18n.getLang();
  const key = target + '\n' + text;
  if (memo[key]) return Promise.resolve(memo[key]);
  return callKrstuast({ action: 'translate', text, target }).then(
    (res) => {
      const r = (res && res.result) || {};
      if (r.success && r.result) {
        memo[key] = r.result;
        return r.result;
      }
      if (r.code === 'NO_AUTH' || r.code === 'NEED_LOGIN') return Promise.reject('');
      return Promise.reject(cloudMsg(r.message) || t('translate.fail'));
    },
    () => Promise.reject(t('common.networkError'))
  );
}

export default { translate };
