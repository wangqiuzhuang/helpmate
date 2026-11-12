// utils/realtime.js —— 实时消息(WebSocket):收到新私聊时广播 uni.$emit('kr:message', { convId, message })
//
// 仅在使用自建后端(config/server.js 填了 base)且已登录时连接;
// 断线自动重连(指数退避,最长 30 秒),25 秒一次应用层心跳。连接不上时,聊天页仍有低频轮询兜底。
import SERVER from '../config/server.js';
import { getAppToken } from './cloud.js';

const BASE = (SERVER.base || '').replace(/\/$/, '');
let task = null;
let connected = false;
let retry = 0;
let retryTimer = null;
let beatTimer = null;
let wanted = false;

const wsUrl = (token) => BASE.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(token);

function cleanup() {
  connected = false;
  if (beatTimer) clearInterval(beatTimer);
  beatTimer = null;
  task = null;
}

function scheduleReconnect() {
  if (!wanted || retryTimer) return;
  const delay = Math.min(30000, 1000 * Math.pow(2, retry++));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
}

export function connect() {
  wanted = true;
  if (!BASE || task) return;
  const token = getAppToken();
  if (!token) return; // 游客不连接
  const t = uni.connectSocket({ url: wsUrl(token), complete: () => {} });
  task = t;
  t.onOpen(() => {
    connected = true;
    retry = 0;
    beatTimer = setInterval(() => {
      try {
        t.send({ data: 'ping' });
      } catch (e) {}
    }, 25000);
    uni.$emit('kr:realtime', { connected: true });
  });
  t.onMessage((res) => {
    if (res.data === 'pong') return;
    let msg = null;
    try {
      msg = JSON.parse(res.data);
    } catch (e) {
      return;
    }
    if (msg && msg.type === 'message') uni.$emit('kr:message', msg);
  });
  t.onClose(() => {
    cleanup();
    uni.$emit('kr:realtime', { connected: false });
    scheduleReconnect();
  });
  t.onError(() => {
    // onClose 随后触发,由它负责重连
  });
}

export function disconnect() {
  wanted = false;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (task) {
    try {
      task.close({});
    } catch (e) {}
  }
  cleanup();
}

export const isConnected = () => connected;

export default { connect, disconnect, isConnected };
