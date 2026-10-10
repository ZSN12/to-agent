#!/usr/bin/env bash
# Swift WKWebView + Node 后端（无 Electron 运行时）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node scripts/build-macos-shell-app.mjs
