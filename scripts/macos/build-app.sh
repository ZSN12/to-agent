#!/usr/bin/env bash
set -euo pipefail

# scripts/macos/build-app.sh
# 构建 TaskWeaver.app：原生 Swift 壳 + 随包 React UI + 内嵌 Node 后端

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

BUILD_DIR="${ROOT_DIR}/apps/macos/build"
APP_BUNDLE="${TASKWEAVER_APP_BUNDLE:-${BUILD_DIR}/TaskWeaver.app}"
CONTENTS_DIR="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
DIST_DIR="${TASKWEAVER_DIST_DIR:-${ROOT_DIR}/dist}"
NODE_DIR="${TASKWEAVER_NODE_DIR:-${BUILD_DIR}/node}"
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
CREATE_ZIP="${TASKWEAVER_CREATE_ZIP:-0}"
if [ "${CREATE_ZIP}" != "0" ] && [ "${CREATE_ZIP}" != "1" ]; then
    echo "❌ TASKWEAVER_CREATE_ZIP must be 0 or 1." >&2
    exit 1
fi

BUILD_STAMP="$(date +%Y%m%d%H%M%S)-$$"
PACKAGE_STAGE_ROOT=""
if [ -n "${TASKWEAVER_STAGE_DIR:-}" ]; then
    STAGE_BACKEND="${TASKWEAVER_STAGE_DIR}"
else
    # bundle-backend.mjs only removes a validated, dedicated stage directory.
    # Keep each build's staging tree isolated under the workspace build root.
    PACKAGE_STAGE_ROOT="${BUILD_DIR}/taskweaver-macos-package.${BUILD_STAMP//[^[:alnum:]]/}"
    if [ -e "${PACKAGE_STAGE_ROOT}" ]; then
        echo "❌ Package staging directory already exists: ${PACKAGE_STAGE_ROOT}" >&2
        exit 1
    fi
    mkdir -p "${PACKAGE_STAGE_ROOT}/stage"
    STAGE_BACKEND="${PACKAGE_STAGE_ROOT}/stage/backend"
fi
PREVIOUS_APP=""
PREVIOUS_ZIP=""
PREVIOUS_DMG=""
FAILED_APP="${APP_BUNDLE}.failed-${BUILD_STAMP}"
FAILED_ZIP="${ZIP_PATH}.failed-${BUILD_STAMP}"
FAILED_DMG="${DMG_PATH}.failed-${BUILD_STAMP}"

restore_previous_outputs() {
    status=$?
    if [ -n "${PACKAGE_STAGE_ROOT}" ] && [ -e "${PACKAGE_STAGE_ROOT}" ]; then
        rm -rf -- "${PACKAGE_STAGE_ROOT}"
    fi
    if [ "${status}" -eq 0 ]; then return; fi
    trap - EXIT
    if [ -n "${PREVIOUS_APP}" ] && [ -e "${PREVIOUS_APP}" ]; then
        if [ -e "${APP_BUNDLE}" ]; then mv "${APP_BUNDLE}" "${FAILED_APP}"; fi
        mv "${PREVIOUS_APP}" "${APP_BUNDLE}"
        echo "⚠️ Previous app restored; failed build output kept at ${FAILED_APP}" >&2
    fi
    if [ -n "${PREVIOUS_ZIP}" ] && [ -e "${PREVIOUS_ZIP}" ]; then
        if [ -e "${ZIP_PATH}" ]; then mv "${ZIP_PATH}" "${FAILED_ZIP}"; fi
        mv "${PREVIOUS_ZIP}" "${ZIP_PATH}"
    fi
    if [ -n "${PREVIOUS_DMG}" ] && [ -e "${PREVIOUS_DMG}" ]; then
        if [ -e "${DMG_PATH}" ]; then mv "${DMG_PATH}" "${FAILED_DMG}"; fi
        mv "${PREVIOUS_DMG}" "${DMG_PATH}"
    fi
    exit "${status}"
}
trap restore_previous_outputs EXIT

if [ -e "${APP_BUNDLE}" ]; then
    if [ "${TASKWEAVER_REPLACE_EXISTING:-0}" != "1" ] || [ -n "${TASKWEAVER_APP_BUNDLE:-}" ]; then
        echo "❌ Refusing to overwrite existing app bundle: ${APP_BUNDLE}" >&2
        echo "   Set TASKWEAVER_REPLACE_EXISTING=1 to keep it as a timestamped backup." >&2
        exit 1
    fi
    PREVIOUS_APP="${APP_BUNDLE}.previous-${BUILD_STAMP}"
fi

for archive_path in "${ZIP_PATH}" "${DMG_PATH}"; do
    if [ "${archive_path}" = "${ZIP_PATH}" ] && [ "${CREATE_ZIP}" = "0" ]; then
        continue
    fi
    if [ -e "${archive_path}" ]; then
        if [ "${TASKWEAVER_REPLACE_EXISTING:-0}" != "1" ] || [ -n "${TASKWEAVER_DIST_DIR:-}" ]; then
            echo "❌ Refusing to overwrite existing distribution archive: ${archive_path}" >&2
            echo "   Set TASKWEAVER_REPLACE_EXISTING=1 with the default dist directory to keep a timestamped backup." >&2
            exit 1
        fi
        if [ "${archive_path}" = "${ZIP_PATH}" ]; then PREVIOUS_ZIP="${ZIP_PATH}.previous-${BUILD_STAMP}"; fi
        if [ "${archive_path}" = "${DMG_PATH}" ]; then PREVIOUS_DMG="${DMG_PATH}.previous-${BUILD_STAMP}"; fi
    fi
done

for backup_path in "${PREVIOUS_APP}" "${PREVIOUS_ZIP}" "${PREVIOUS_DMG}"; do
    if [ -n "${backup_path}" ] && [ -e "${backup_path}" ]; then
        echo "❌ Previous-output backup path already exists: ${backup_path}" >&2
        exit 1
    fi
done

if [ -n "${PREVIOUS_APP}" ]; then mv "${APP_BUNDLE}" "${PREVIOUS_APP}"; fi
if [ -n "${PREVIOUS_ZIP}" ]; then mv "${ZIP_PATH}" "${PREVIOUS_ZIP}"; fi
if [ -n "${PREVIOUS_DMG}" ]; then mv "${DMG_PATH}" "${PREVIOUS_DMG}"; fi

echo "🚀 Building TaskWeaver macOS Application..."

# 1. Fetch Node
TASKWEAVER_NODE_DIR="${NODE_DIR}" bash "${SCRIPT_DIR}/fetch-node.sh"

# 2. Build the native WebView shell (Release mode)
echo "🛠️ Compiling Swift WebView shell (Release)..."
SHELL_PACKAGE_PATH="${ROOT_DIR}/apps/macos/TaskWeaverShell"
swift_build -c release --package-path "${SHELL_PACKAGE_PATH}" --product TaskWeaverShell
swift_build -c release --package-path "${SHELL_PACKAGE_PATH}" --product TaskWeaverKeychain

SWIFT_BIN_DIR="$(swift_build --configuration release --show-bin-path --package-path "${SHELL_PACKAGE_PATH}")"
SWIFT_BIN="${SWIFT_BIN_DIR}/TaskWeaverShell"
KEYCHAIN_BIN="${SWIFT_BIN_DIR}/TaskWeaverKeychain"

if [ ! -f "${SWIFT_BIN}" ]; then
    echo "❌ Error: Could not locate compiled TaskWeaver binary." >&2
    exit 1
fi
echo "✅ Swift binary ready: ${SWIFT_BIN}"
if [ ! -f "${KEYCHAIN_BIN}" ]; then
    echo "❌ Error: Could not locate the compiled macOS Keychain helper." >&2
    exit 1
fi
echo "✅ Keychain helper ready: ${KEYCHAIN_BIN}"

# 3. Bundle Backend
echo "📦 Bundling Node backend..."
TASKWEAVER_STAGE_DIR="${STAGE_BACKEND}" TASKWEAVER_NODE_PATH="${NODE_DIR}/bin/node" \
    TASKWEAVER_RUNTIME_DIR="${TASKWEAVER_RUNTIME_DIR:-}" node "${SCRIPT_DIR}/bundle-backend.mjs"

# 4. Construct App Bundle
echo "🏗️ Assembling .app bundle layout..."
mkdir -p "$(dirname "${APP_BUNDLE}")" "${MACOS_DIR}" "${RESOURCES_DIR}"
HELPERS_DIR="${CONTENTS_DIR}/Helpers"
mkdir -p "${HELPERS_DIR}"

# Copy binary
cp "${SWIFT_BIN}" "${MACOS_DIR}/TaskWeaver"
chmod +x "${MACOS_DIR}/TaskWeaver"
cp "${KEYCHAIN_BIN}" "${HELPERS_DIR}/TaskWeaverKeychain"
chmod +x "${HELPERS_DIR}/TaskWeaverKeychain"

# Copy Info.plist
cp "${ROOT_DIR}/apps/macos/TaskWeaver/Info.plist" "${CONTENTS_DIR}/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleExecutable TaskWeaver' "${CONTENTS_DIR}/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier com.taskweaver.desktop' "${CONTENTS_DIR}/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleName TaskWeaver' "${CONTENTS_DIR}/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :LSMinimumSystemVersion 14.4' "${CONTENTS_DIR}/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :CFBundleIconFile string AppIcon.icns' "${CONTENTS_DIR}/Info.plist"
plutil -lint "${CONTENTS_DIR}/Info.plist"

# Bundle the selected orange nested-triangle application icon and WebView UI.
cp "${ROOT_DIR}/apps/macos/TaskWeaverShell/Resources/AppIcon.icns" "${RESOURCES_DIR}/AppIcon.icns"

APP_RESOURCES_DIR="${RESOURCES_DIR}/app"
BACKEND_RESOURCES_DIR="${RESOURCES_DIR}/backend"
mkdir -p "${APP_RESOURCES_DIR}/dist" "${BACKEND_RESOURCES_DIR}" "${RESOURCES_DIR}/host-node"
cp -R "${STAGE_BACKEND}/app/." "${APP_RESOURCES_DIR}/"
cp -R "${STAGE_BACKEND}/runtime" "${BACKEND_RESOURCES_DIR}/runtime"
cp -R "${NODE_DIR}/." "${RESOURCES_DIR}/host-node/"
cp -R "${ROOT_DIR}/dist/." "${APP_RESOURCES_DIR}/dist/"
cp "${ROOT_DIR}/scripts/run-scheduled-job-cli.mjs" "${RESOURCES_DIR}/taskweaver-scheduled-runner.mjs"

# OpenCodex launches as a separate CLI process and needs a real Bun executable.
# The `bun` npm package normalizes its platform binary to bun.exe on every host.
BUN_SOURCE=""
for candidate in "${ROOT_DIR}/node_modules/bun/bin/bun" "${ROOT_DIR}/node_modules/bun/bin/bun.exe"; do
    if [ -x "${candidate}" ]; then
        BUN_SOURCE="${candidate}"
        break
    fi
done
if [ -z "${BUN_SOURCE}" ]; then
    echo "❌ Bun runtime is missing; install the OpenCodex dependencies before packaging." >&2
    exit 1
fi
if ! BUN_VERSION="$("${BUN_SOURCE}" --version 2>/dev/null)" || [ -z "${BUN_VERSION}" ]; then
    echo "❌ The installed Bun runtime cannot execute on this build host: ${BUN_SOURCE}" >&2
    exit 1
fi
mkdir -p "${RESOURCES_DIR}/opencodex-runtime"
cp "${BUN_SOURCE}" "${RESOURCES_DIR}/opencodex-runtime/bun"
chmod +x "${RESOURCES_DIR}/opencodex-runtime/bun"
if [ "$(stat -f%z "${RESOURCES_DIR}/opencodex-runtime/bun" 2>/dev/null || stat -c%s "${RESOURCES_DIR}/opencodex-runtime/bun")" -lt 1000000 ]; then
    echo "❌ Bundled Bun runtime is unexpectedly small." >&2
    exit 1
fi

if [ ! -f "${APP_RESOURCES_DIR}/backend/shell/run.mjs" ] \
    || [ ! -f "${APP_RESOURCES_DIR}/dist/index.html" ] \
    || [ ! -x "${RESOURCES_DIR}/host-node/bin/node" ] \
    || [ ! -f "${RESOURCES_DIR}/taskweaver-scheduled-runner.mjs" ] \
    || [ ! -x "${RESOURCES_DIR}/opencodex-runtime/bun" ] \
    || [ ! -x "${HELPERS_DIR}/TaskWeaverKeychain" ] \
    || [ ! -f "${BACKEND_RESOURCES_DIR}/runtime/lib/entry.js" ]; then
    echo "❌ WebView app bundle is incomplete (backend, UI, Node, Bun, Keychain helper, or runtime is missing)." >&2
    exit 1
fi

echo "  - Bundled React UI, Node backend, Z runtime, embedded Node, and Bun ${BUN_VERSION}."

# 5. Codesign
echo "🔏 Executing signing pipeline..."
bash "${SCRIPT_DIR}/sign.sh" "${APP_BUNDLE}"

# 6. Archive and create distribution packages
mkdir -p "${DIST_DIR}"

if [ "${CREATE_ZIP}" = "1" ]; then
    echo "📦 Creating ZIP archive: ${ZIP_PATH}..."
    ditto -c -k --keepParent "${APP_BUNDLE}" "${ZIP_PATH}"
fi

echo "📦 Creating DMG volume: ${DMG_PATH}..."
hdiutil create -volname "TaskWeaver" -srcfolder "${APP_BUNDLE}" -format UDZO "${DMG_PATH}" >/dev/null

APP_SIZE=$(du -sh "${APP_BUNDLE}" | cut -f1)
DMG_SIZE=$(du -sh "${DMG_PATH}" | cut -f1)
if [ "${CREATE_ZIP}" = "1" ]; then ZIP_SIZE=$(du -sh "${ZIP_PATH}" | cut -f1); fi

echo ""
echo "=================================================="
echo "🎉 TaskWeaver macOS App Build Completed!"
echo "   App Bundle: ${APP_BUNDLE} (${APP_SIZE})"
if [ "${CREATE_ZIP}" = "1" ]; then
    echo "   ZIP Archive: ${ZIP_PATH} (${ZIP_SIZE})"
else
    echo "   ZIP Archive: skipped"
fi
echo "   DMG Disk Image: ${DMG_PATH} (${DMG_SIZE})"
echo "=================================================="
