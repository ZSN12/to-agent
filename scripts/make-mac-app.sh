#!/usr/bin/env bash
# 生成包含 Electron、前端、主进程与生产依赖的独立 TaskWeaver.app。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build
node scripts/validate-model-registry.mjs
if [[ ! -f vendor/z-runtime/apps/cli/lib/bin.js ]]; then
  echo "make-mac-app: 需要先构建 Z 运行时 CLI：npm run build:z-runtime"
  exit 1
fi
if ! node scripts/build-z-runtime.mjs; then
  if [[ -f vendor/taskweaver-z-runtime/lib/entry.js || -f vendor/taskweaver-z-runtime/lib/bin.js ]]; then
    echo "build-z-runtime 全量构建失败，尝试仅打包已有 deploy: node scripts/build-z-runtime.mjs --skip-build"
    node scripts/build-z-runtime.mjs --skip-build
  else
    echo "缺少 vendor/taskweaver-z-runtime。请先成功运行 npm run build:z-runtime。"
    exit 1
  fi
fi
node scripts/sync-dsh-sandbox.mjs
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
ELECTRON_BUILDER_REQUEST_TIMEOUT=1800000 ./node_modules/.bin/electron-builder --mac --dir

echo "已生成独立应用: $ROOT/release/mac-arm64/TaskWeaver.app"
