// admin-cli.js —— 在服务器上管理后台账号(只能在服务器上执行,App 里无法创建管理员)
//
//   docker compose exec api node admin-cli.js create <用户名>     新建管理员:生成随机密码 + 验证器二维码
//   docker compose exec api node admin-cli.js reset <用户名>      重置密码和验证器
//   docker compose exec api node admin-cli.js disable <用户名>    停用
//   docker compose exec api node admin-cli.js list                列出管理员
//
// 命令行创建的是「超级管理员」;学校管理员请登录后台,在「管理员」页面创建。
// 验证器:手机装 Google Authenticator / Microsoft Authenticator,扫描终端里的二维码,
// 或手动输入「密钥」。登录后台时填 App 里显示的 6 位动态码。
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const qrcode = require('qrcode-terminal');
const { hashPassword, base32Encode } = require('./admin');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MONGO_DB = process.env.MONGO_DB || 'krstuast';
const ISSUER = 'HelpMate Admin';

async function main() {
  const [cmd, name] = process.argv.slice(2);
  const client = await MongoClient.connect(MONGO_URI);
  const admins = client.db(MONGO_DB).collection('admins');
  try {
    if (cmd === 'list') {
      const list = await admins.find({}).toArray();
      if (!list.length) console.log('还没有管理员。运行: node admin-cli.js create <用户名>');
      list.forEach((a) => console.log(`${a._id}\t${a.disabled ? '已停用' : '正常'}\t上次登录 ${a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString('zh-CN', { timeZone: 'Asia/Seoul' }) : '-'}`));
      return;
    }
    if (!['create', 'reset', 'disable'].includes(cmd) || !/^[a-zA-Z0-9_]{3,20}$/.test(name || '')) {
      console.log('用法: node admin-cli.js create|reset|disable <用户名(3~20 位字母数字下划线)> | list');
      process.exitCode = 1;
      return;
    }
    const exists = await admins.findOne({ _id: name });
    if (cmd === 'disable') {
      if (!exists) return console.log('没有这个管理员');
      await admins.updateOne({ _id: name }, { $set: { disabled: true } });
      return console.log('已停用 ' + name);
    }
    if (cmd === 'create' && exists) return console.log('已存在,要重置请用: node admin-cli.js reset ' + name);
    if (cmd === 'reset' && !exists) return console.log('没有这个管理员,要新建请用: node admin-cli.js create ' + name);

    const password = crypto.randomBytes(9).toString('base64url'); // 12 位随机密码
    const salt = crypto.randomBytes(16).toString('hex');
    const totpSecret = base32Encode(crypto.randomBytes(20));
    await admins.updateOne(
      { _id: name },
      { $set: { salt, hash: hashPassword(password, salt), totpSecret, disabled: false, tokenAfter: Date.now(), updatedAt: Date.now() }, $setOnInsert: { createdAt: Date.now(), role: 'super', schools: [] } },
      { upsert: true }
    );
    const uri = `otpauth://totp/${encodeURIComponent(ISSUER + ':' + name)}?secret=${totpSecret}&issuer=${encodeURIComponent(ISSUER)}&digits=6&period=30`;
    console.log('\n========== HelpMate 后台账号 ==========');
    console.log('用户名: ' + name);
    console.log('密码:   ' + password + '   (只显示这一次,请立刻保存到密码管理器)');
    console.log('\n用手机验证器 App 扫描下面的二维码(或手动输入密钥):');
    qrcode.generate(uri, { small: true });
    console.log('密钥:   ' + totpSecret.replace(/(.{4})/g, '$1 ').trim());
    console.log('\n后台地址: ' + (process.env.PUBLIC_BASE || 'https://你的域名') + '/api/admin/');
    console.log('========================================\n');
  } finally {
    await client.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
