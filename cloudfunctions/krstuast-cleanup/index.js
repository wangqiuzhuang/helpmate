// krstuast-cleanup —— 一次性数据清理云函数（上线前清空开发环境业务数据）
//
// 用完即删：
//   1. 右键本函数 → 上传并部署：云端安装依赖 → 务必选【开发环境】cloud1-d0gqil538c98c573e
//   2. 右键 → 云端测试 → 参数 {"confirm":"CLEAN-ALL-DEV-2026-09-18"}
//   3. 检查返回的 summary 各集合删除数量
//   4. 云开发控制台 → 云函数 → 删除 krstuast-cleanup（避免清库函数留在线上）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 要清空的业务集合；schools 是学校配置数据，不在清理范围
const COLLECTIONS = ['orders', 'users', 'reviews', 'posts', 'comments', 'conversations', 'messages', 'feedback'];

// 确认口令：云端测试参数必须带上，防止误触发
const CONFIRM = 'CLEAN-ALL-DEV-2026-09-18';

exports.main = async (event) => {
  if (!event || event.confirm !== CONFIRM) {
    return { success: false, message: '拒绝执行：缺少正确确认口令，未做任何删除' };
  }
  const summary = [];
  for (const name of COLLECTIONS) {
    try {
      const before = (await db.collection(name).count()).total;
      let deleted = 0;
      // remove 不接受空查询（-501007），改为：分批取 _id → 按 _id 批量删 → 循环到空
      while (true) {
        const res = await db.collection(name).where({ _id: _.exists(true) }).limit(100).get();
        const ids = (res.data || []).map((d) => d._id);
        if (!ids.length) break;
        await db.collection(name).where({ _id: _.in(ids) }).remove();
        deleted += ids.length;
      }
      summary.push({ collection: name, before, deleted, status: 'ok' });
    } catch (e) {
      summary.push({ collection: name, status: 'error: ' + (e.errMsg || e.message || String(e)) });
    }
  }
  return { success: true, summary };
};
