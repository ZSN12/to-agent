#!/usr/bin/env bash
# 生成包含 Electron、前端、主进程与生产依赖的独立 TaskWeaver.app。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build
if [[ ! -d packages/pi/node_modules ]]; then
  echo "正在安装 packages/pi 依赖…"
  (cd packages/pi && npm install)
fi
node scripts/runtime-seed-dist.mjs
node scripts/embed-runtime-node-modules.mjs
ELECTRON_BUILDER_REQUEST_TIMEOUT=1800000 ./node_modules/.bin/electron-builder --mac --dir

echo "已生成独立应用: $ROOT/release/mac-arm64/TaskWeaver.app"
