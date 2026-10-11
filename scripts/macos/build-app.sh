#!/usr/bin/env bash
set -euo pipefail

# scripts/macos/build-app.sh
# 完整构建 TaskWeaver.app macOS 原生桌面包、签名并打包产物

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

BUILD_DIR="${ROOT_DIR}/apps/macos/build"
APP_BUNDLE="${TASKWEAVER_APP_BUNDLE:-${BUILD_DIR}/TaskWeaver.app}"
CONTENTS_DIR="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
DIST_DIR="${TASKWEAVER_DIST_DIR:-${ROOT_DIR}/dist}"
NODE_DIR="${TASKWEAVER_NODE_DIR:-${BUILD_DIR}/node}"
STAGE_BACKEND="${TASKWEAVER_STAGE_DIR:-${BUILD_DIR}/stage/backend}"
swift_build() {
    if [ -n "${TASKWEAVER_SWIFT_SCRATCH_PATH:-}" ]; then
        mkdir -p "${TASKWEAVER_SWIFT_SCRATCH_PATH}"
        swift build --scratch-path "${TASKWEAVER_SWIFT_SCRATCH_PATH}" "$@"
    else
        swift build "$@"
    fi
}

ZIP_PATH="${DIST_DIR}/TaskWeaver-macOS-arm64.zip"
DMG_PATH="${DIST_DIR}/TaskWeaver-macOS-arm64.dmg"
if [ -e "${APP_BUNDLE}" ]; then
    echo "❌ Refusing to overwrite existing app bundle: ${APP_BUNDLE}" >&2
    exit 1
fi
if [ -e "${ZIP_PATH}" ] || [ -e "${DMG_PATH}" ]; then
    echo "❌ Refusing to overwrite an existing distribution archive in ${DIST_DIR}" >&2
    exit 1
fi

echo "🚀 Building TaskWeaver macOS Native Application..."

# 1. Fetch Node
TASKWEAVER_NODE_DIR="${NODE_DIR}" bash "${SCRIPT_DIR}/fetch-node.sh"

# 2. Build Swift App (Release mode)
echo "🛠️ Compiling Swift binaries (Release)..."
swift_build -c release --package-path "${ROOT_DIR}/apps/macos/Packages/TaskWeaverKit" --product TaskWeaver

SWIFT_BIN_DIR="$(swift_build --configuration release --show-bin-path --package-path "${ROOT_DIR}/apps/macos/Packages/TaskWeaverKit")"
SWIFT_BIN="${SWIFT_BIN_DIR}/TaskWeaver"

if [ ! -f "${SWIFT_BIN}" ]; then
    echo "❌ Error: Could not locate compiled TaskWeaver binary." >&2
    exit 1
fi
echo "✅ Swift binary ready: ${SWIFT_BIN}"

# 3. Bundle Backend
echo "📦 Bundling Node backend..."
TASKWEAVER_STAGE_DIR="${STAGE_BACKEND}" TASKWEAVER_NODE_PATH="${NODE_DIR}/bin/node" \
    TASKWEAVER_RUNTIME_DIR="${TASKWEAVER_RUNTIME_DIR:-}" node "${SCRIPT_DIR}/bundle-backend.mjs"

# 4. Construct App Bundle
echo "🏗️ Assembling .app bundle layout..."
mkdir -p "$(dirname "${APP_BUNDLE}")" "${MACOS_DIR}" "${RESOURCES_DIR}"

# Copy binary
cp "${SWIFT_BIN}" "${MACOS_DIR}/TaskWeaver"
chmod +x "${MACOS_DIR}/TaskWeaver"

# Copy Info.plist
cp "${ROOT_DIR}/apps/macos/TaskWeaver/Info.plist" "${CONTENTS_DIR}/Info.plist"

# Copy Backend to Contents/Resources/backend
echo "  - Copying backend into Resources..."
cp -R "${STAGE_BACKEND}" "${RESOURCES_DIR}/backend"

# 5. Codesign
echo "🔏 Executing signing pipeline..."
bash "${SCRIPT_DIR}/sign.sh" "${APP_BUNDLE}"

# 6. Archive and create distribution packages
mkdir -p "${DIST_DIR}"

echo "📦 Creating ZIP archive: ${ZIP_PATH}..."
ditto -c -k --keepParent "${APP_BUNDLE}" "${ZIP_PATH}"

echo "📦 Creating DMG volume: ${DMG_PATH}..."
hdiutil create -volname "TaskWeaver" -srcfolder "${APP_BUNDLE}" -format UDZO "${DMG_PATH}" >/dev/null

APP_SIZE=$(du -sh "${APP_BUNDLE}" | cut -f1)
ZIP_SIZE=$(du -sh "${ZIP_PATH}" | cut -f1)
DMG_SIZE=$(du -sh "${DMG_PATH}" | cut -f1)

echo ""
echo "=================================================="
echo "🎉 TaskWeaver Native App Build Completed!"
echo "   App Bundle: ${APP_BUNDLE} (${APP_SIZE})"
echo "   ZIP Archive: ${ZIP_PATH} (${ZIP_SIZE})"
echo "   DMG Disk Image: ${DMG_PATH} (${DMG_SIZE})"
echo "=================================================="
