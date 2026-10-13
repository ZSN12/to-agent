#!/usr/bin/env bash
set -euo pipefail

# scripts/macos/sign.sh
# 对打包产物实施深度代码签名与 Hardened Runtime 校验

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

APP_PATH="${1:-${ROOT_DIR}/apps/macos/build/TaskWeaver.app}"
NODE_ENTITLEMENTS="${ROOT_DIR}/apps/macos/TaskWeaver/Node.entitlements"
APP_ENTITLEMENTS="${ROOT_DIR}/apps/macos/TaskWeaver/TaskWeaver.entitlements"

if [ ! -d "${APP_PATH}" ]; then
    echo "❌ Error: App bundle not found at ${APP_PATH}" >&2
    exit 1
fi

echo "🔏 Signing TaskWeaver bundle at: ${APP_PATH}"

# Clean any broken symlinks or .DS_Store that prevent code signing
find "${APP_PATH}" -name '.DS_Store' -delete || true
find "${APP_PATH}" -type l ! -exec test -e {} \; -delete || true

RESOURCES_DIR="${APP_PATH}/Contents/Resources"
for RESOURCE_ROOT in "${RESOURCES_DIR}/app" "${RESOURCES_DIR}/backend"; do
    if [ -d "${RESOURCE_ROOT}" ]; then
        echo "  - Signing bundled native binaries under ${RESOURCE_ROOT}..."
        find "${RESOURCE_ROOT}" \( -name '*.node' -o -name '*.dylib' -o -name 'spawn-helper' \) -print0 | while IFS= read -r -d '' binary; do
            echo "    * signing: ${binary}"
            codesign --force --options runtime -s - "${binary}"
        done
    fi
done

NODE_BIN="${RESOURCES_DIR}/host-node/bin/node"
if [ -f "${NODE_BIN}" ]; then
    echo "  - Signing embedded node binary with entitlements..."
    codesign --force --options runtime --entitlements "${NODE_ENTITLEMENTS}" -s - "${NODE_BIN}"
fi

MAIN_BIN="${APP_PATH}/Contents/MacOS/TaskWeaver"
if [ -f "${MAIN_BIN}" ]; then
    echo "  - Signing main executable..."
    codesign --force --options runtime -s - "${MAIN_BIN}"
fi

KEYCHAIN_HELPER="${APP_PATH}/Contents/Helpers/TaskWeaverKeychain"
if [ -f "${KEYCHAIN_HELPER}" ]; then
    echo "  - Signing native Keychain helper..."
    codesign --force --options runtime -s - "${KEYCHAIN_HELPER}"
fi

echo "  - Signing overall app bundle..."
codesign --force --options runtime --entitlements "${APP_ENTITLEMENTS}" -s - "${APP_PATH}"

echo "🔍 Verifying code signature..."
codesign --verify --deep --strict --verbose=2 "${APP_PATH}"

echo "✅ App bundle successfully signed and verified!"
