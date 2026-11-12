// initSchools —— 学校数据初始化云函数
// 用法：部署后在小程序端调用 wx.cloud.callFunction({ name: 'initSchools' })
// 或在云开发控制台「云函数 → 测试」直接触发。
// 行为：将 cloudfunctions/initSchools/schools.json 中的 261 所学校
//       按 id 幂等 upsert 到集合 `schools`（已存在则更新，可反复执行）。
const cloud = require('wx-server-sdk');
const schools = require('./schools.json');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  // 集合不存在则自动创建（幂等）
  try {
    await db.createCollection('schools');
  } catch (e) {
    // 已存在则忽略
  }
  const coll = db.collection('schools');
  const results = { total: schools.length, added: 0, updated: 0, failed: [] };

  // 云数据库单次最多插入 100 条 & 逐条查重太慢，直接整批 upsert：
  // 先查已存在的 id，再按需 add / update。
  try {
    await coll.get().catch(() => null); // 触发集合不存在时报错则创建
  } catch (e) {
    // 集合不存在 → 创建并写入第一条以建集合
    const first = schools[0];
    await coll.add({ data: { _id: first.id, ...first } });
    results.added += 1;
  }

  const MAX = 100;
  for (let i = 0; i < schools.length; i += MAX) {
    const batch = schools.slice(i, i + MAX);
    const ids = batch.map((s) => s.id);
    const existing = await coll.where({ _id: db.command.in(ids) }).field({ _id: true }).get();
    const existingIds = new Set(existing.data.map((d) => d._id));

    const tasks = batch.map(async (s) => {
      const doc = { ...s };
      delete doc.id;
      if (existingIds.has(s.id)) {
        await coll.doc(s.id).update({ data: doc });
        results.updated += 1;
      } else {
        await coll.add({ data: { _id: s.id, ...doc } });
        results.added += 1;
      }
    });
    await Promise.all(tasks.map((t) => t.catch((err) => results.failed.push(String(err)))));
  }

  return results;
};
