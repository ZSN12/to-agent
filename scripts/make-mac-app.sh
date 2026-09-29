#!/usr/bin/env bash
# 生成包含 Electron、前端、主进程与生产依赖的独立 TaskWeaver.app。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build
node scripts/validate-model-registry.mjs
if [[ -f vendor/z-runtime/apps/cli/lib/bin.js && "${TASKWEAVER_USE_Z_RUNTIME:-}" != "0" ]]; then
  export TASKWEAVER_USE_Z_RUNTIME=1
  echo "make-mac-app: 使用已构建的 vendor/z-runtime"
elif [[ -d vendor/z-runtime && "${TASKWEAVER_USE_Z_RUNTIME:-}" == "1" ]]; then
  echo "make-mac-app: vendor/z-runtime 尚未构建 CLI，回退 dsh-source（可先 npm run build:z-runtime）"
  export TASKWEAVER_USE_Z_RUNTIME=0
fi
if ! node scripts/build-dsh-runtime.mjs; then
  if [[ -f vendor/taskweaver-dsh-runtime/lib/entry.js || -f vendor/taskweaver-dsh-runtime/lib/bin.js ]]; then
    echo "dsh-source 全量构建失败，回退: node scripts/build-dsh-runtime.mjs --skip-build"
    node scripts/build-dsh-runtime.mjs --skip-build
  else
    echo "缺少 vendor/taskweaver-dsh-runtime，无法回退。请先在本机成功构建一次 dsh-source 或修复其 pnpm build。"
    exit 1
  fi
fi
node scripts/sync-dsh-sandbox.mjs
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
ELECTRON_BUILDER_REQUEST_TIMEOUT=1800000 ./node_modules/.bin/electron-builder --mac --dir

echo "已生成独立应用: $ROOT/release/mac-arm64/TaskWeaver.app"
