#!/bin/bash
# HelpMate 一键发布 APK:找最新 APK → 校验签名 → 上传服务器 → 更新后台版本信息
# 用法:  ./release-apk.sh            (自动找 6 小时内最新的 APK)
#        ./release-apk.sh 路径.apk    (指定文件)
#        NOTE="修复了xx" ./release-apk.sh   (带更新说明)
set -e
cd "$(dirname "$0")"
HOST=root@46.250.251.251; PORT=51837
SITE=https://helpmate.new-apis.com
MY_SHA1="F1:95:BD:BE:93:19:AE:9B:83:A8:8A:83:1B:68:BF:14:F9:8E:43:B5"

# 1. 版本号从 manifest.json 读
VER=$(grep -m1 '"versionName"' src/manifest.json | sed -E 's/.*: *"([^"]+)".*/\1/')
CODE=$(grep -m1 '"versionCode"' src/manifest.json | sed -E 's/[^0-9]*([0-9]+).*/\1/')
[ -z "$VER" ] || [ -z "$CODE" ] && { echo "❌ manifest.json 里读不到版本号"; exit 1; }

# 2. 找 APK
APK="$1"
if [ -z "$APK" ]; then
  APK=$(find ~/WeChatProjects ~/Downloads ~/Desktop ~/Documents -name "*.apk" -type f -mmin -360 -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
fi
[ -f "$APK" ] || { echo "❌ 没找到 6 小时内打包的 APK,可以手动指定: ./release-apk.sh 路径.apk"; exit 1; }
echo "📦 APK:  $APK"
echo "🏷  版本: $VER ($CODE)"

# 3. 校验签名(必须是自有证书)
SHA1=$(keytool -printcert -jarfile "$APK" 2>/dev/null | grep -m1 SHA1 | awk '{print $2}')
if [ "$SHA1" != "$MY_SHA1" ]; then
  echo "❌ 签名不对:$SHA1"; echo "   请在 HBuilderX 云打包里选「使用自有证书」重新打包"; exit 1
fi
echo "🔐 签名: 自有证书 ✓"

read -p "确认发布 $VER ($CODE)?[y/N] " yn
[ "$yn" = "y" ] || [ "$yn" = "Y" ] || { echo "已取消"; exit 0; }

# 4. 上传
NAME="helpmate-$VER.apk"
URL="$SITE/uploads/app/$NAME"
scp -P $PORT "$APK" $HOST:/tmp/$NAME
ssh -p $PORT $HOST "mkdir -p /opt/krstuast/uploads/app && mv /tmp/$NAME /opt/krstuast/uploads/app/$NAME && chown -R 1000:1000 /opt/krstuast/uploads/app"

# 5. 更新后台「版本」配置(保留强制更新、iOS 地址等其他字段)
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
JS=$(mktemp)
cat > "$JS" <<JSEOF
var s = { "value.version": "$VER", "value.code": $CODE, "value.url": "$URL", updatedAt: Date.now(), updatedBy: "release-apk.sh" };
var note = "$(esc "${NOTE:-}")";
if (note) s["value.note"] = note;
db.getSiblingDB("krstuast").app_config.updateOne({ _id: "cfg_version" }, { \$set: s }, { upsert: true });
printjson(db.getSiblingDB("krstuast").app_config.findOne({ _id: "cfg_version" }).value);
JSEOF
ssh -p $PORT $HOST "docker exec -i krstuast-mongo-1 sh -c 'mongosh --quiet -u \"\$MONGO_INITDB_ROOT_USERNAME\" -p \"\$MONGO_INITDB_ROOT_PASSWORD\" --authenticationDatabase admin'" < "$JS"
rm -f "$JS"

# 6. 验证
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -I "$URL")
if [ "$HTTP" = "200" ]; then
  echo "✅ 发布成功:$URL"
  echo "   App 内「检查更新」最多 1 分钟后生效"
else
  echo "⚠️  上传完成但下载地址返回 $HTTP,请检查 Nginx 是否代理了 /uploads/"
fi
