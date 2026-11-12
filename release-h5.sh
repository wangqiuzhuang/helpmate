#!/bin/bash
# HelpMate 一键发布 H5 网页版:打包 → 上传 → 原子替换(访问不中断)
# 用法:先在 HBuilderX「发行 → 网站-PC或手机H5」,再运行 ./release-h5.sh
#       也可以指定目录:./release-h5.sh unpackage/dist/build/web
set -e
cd "$(dirname "$0")"
HOST=root@46.250.251.251; PORT=51837
DIR="$1"
if [ -z "$DIR" ]; then
  for d in unpackage/dist/build/web unpackage/dist/build/h5 dist/build/h5; do
    [ -f "$d/index.html" ] && { DIR="$d"; break; }
  done
fi
[ -f "$DIR/index.html" ] || { echo "❌ 没找到 H5 打包结果,请先在 HBuilderX 里「发行 → 网站-PC或手机H5」"; exit 1; }
grep -q '/app/' "$DIR/index.html" || { echo "❌ 打包结果的访问路径不是 /app/,请确认 manifest.json 的 h5.publicPath"; exit 1; }
echo "📦 H5: $DIR ($(find "$DIR" -type f | wc -l | tr -d ' ') 个文件)"
read -p "确认发布到 https://helpmate.new-apis.com/app/ ?[y/N] " yn
[ "$yn" = "y" ] || [ "$yn" = "Y" ] || { echo "已取消"; exit 0; }
TGZ=$(mktemp -t h5).tgz
tar czf "$TGZ" -C "$DIR" .
scp -P $PORT "$TGZ" $HOST:/tmp/helpmate-h5.tgz
ssh -p $PORT $HOST 'set -e; rm -rf /opt/krstuast/h5.new && mkdir -p /opt/krstuast/h5.new && tar xzf /tmp/helpmate-h5.tgz -C /opt/krstuast/h5.new && chmod -R a+rX /opt/krstuast/h5.new && rm -rf /opt/krstuast/h5.old && ([ -d /opt/krstuast/h5 ] && mv /opt/krstuast/h5 /opt/krstuast/h5.old || true) && mv /opt/krstuast/h5.new /opt/krstuast/h5 && rm -f /tmp/helpmate-h5.tgz'
rm -f "$TGZ"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" https://helpmate.new-apis.com/app/)
[ "$HTTP" = "200" ] && echo "✅ 发布成功:https://helpmate.new-apis.com/app/(上一版保留在 /opt/krstuast/h5.old,可回滚)" || echo "⚠️ 上传完成但访问返回 $HTTP"
