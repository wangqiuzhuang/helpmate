#!/bin/sh
# 每日备份 MongoDB(保留 14 天)。crontab: 30 4 * * * /opt/krstuast/app/deploy/backup.sh
set -e
cd "$(dirname "$0")"
. ./.env
DIR=/opt/krstuast/backup
mkdir -p $DIR
docker compose exec -T mongo mongodump --username krstuast --password "$MONGO_PASSWORD" --authenticationDatabase admin --db krstuast --archive --gzip > $DIR/krstuast-$(date +%F).archive.gz
find $DIR -name 'krstuast-*.archive.gz' -mtime +14 -delete
