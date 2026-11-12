# krstuast 自建后端镜像(构建上下文为 deploy 包根目录)
FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/index.js server/admin.js server/admin-cli.js server/download.html ./
COPY server/admin-ui ./admin-ui
COPY server/lib ./lib
COPY server/data ./data
COPY cloudfunctions/krstuast ./cloudfunctions/krstuast
ENV PORT=8095 UPLOAD_DIR=/data/uploads FUNC_DIR=/app/cloudfunctions/krstuast NODE_ENV=production
EXPOSE 8095
USER node
CMD ["node", "index.js"]
