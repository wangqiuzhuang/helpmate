
// functions.js —— 主页功能按钮配置（含稳定业务 ID）
//
// ID 约定：语义化英文短横线命名，一旦上线不可更改（业务数据通过 functionId 关联，
// 例如任务表 tasks 的 category 字段）。改名/换图标时保持 id 不变。
// homeName 为首页九宫格的短标签（可选，缺省用 name）。
// 新增功能：在数组末尾追加新条目；下架功能：保留条目并加 enabled: false（历史数据仍可追溯）。
export default [
  { id: 'pickup', name: '帮取/送', badgeName: '帮取', icon: '📦' },
  { id: 'delivery', name: '帮送', badgeName: '帮送', icon: '🛵', hidden: true }, // 已并入帮取帮送，仅历史数据徽章
  { id: 'carpool', name: '拼车', homeName: '拼车', icon: '🚗' },
  { id: 'groupbuy', name: '拆单凑单', icon: '🧺' },
  { id: 'rant', name: '吐槽避雷', icon: '💬' },
  // 已并入其他按钮的旧功能：hidden 不进主页九宫格，仅用于历史数据的徽章展示
  { id: 'help', name: '求助', icon: '🙏', hidden: true },
  { id: 'warning', name: '避雷', icon: '🙅', hidden: true },
  { id: 'qa', name: '互助问答', icon: '🙏' },
  { id: 'hangout', name: '攒局', icon: '🎉' },
  { id: 'secondhand', name: '闲置', homeName: '闲', icon: '🧸' },
  { id: 'friends', name: '交友扩列', icon: '💕' },
  { id: 'housing', name: '租房', homeName: '住', icon: '🏠' },
  { id: 'parttime', name: '兼职', homeName: '工', icon: '💼' },
  { id: 'companion', name: '陪玩陪练陪聊', homeName: '玩/练/聊', icon: '🎮' },
  { id: 'food', name: '美食推荐', icon: '🍜' },
  { id: 'lostfound', name: '失物招领', homeName: 'Lost&Found', icon: '🔍' },
  { id: 'treehole', name: '匿名树洞', icon: '🎭' },
  { id: 'confession', name: '情感树洞', icon: '💌', hidden: true }, // 已并入匿名树洞，仅历史数据徽章
  { id: 'freshman', name: '新生FAQ', icon: '🎓' },
  { id: 'meal', name: '饭搭子', icon: '🍱' },
  { id: 'homecook', name: '私厨点菜', icon: '🍳' },
  { id: 'game', name: '游戏专区', homeName: '游戏', icon: '🎮' },
  { id: 'deals', name: '专属折扣', homeName: '折扣', icon: '🎁' },
  { id: 'more', name: '更多功能', icon: '⋯' },
];
