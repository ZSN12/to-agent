#!/usr/bin/env bash
set -euo pipefail

# Fetch the pinned macOS Node distribution and verify it against Node's official
# release checksum manifest before it can replace the embedded build runtime.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_NODE_DIR="${TASKWEAVER_NODE_DIR:-${ROOT_DIR}/apps/macos/build/node}"

NODE_VERSION="${NODE_VERSION:-v22.19.0}"
ARCH="arm64"
PLATFORM="darwin"
DIST_URL="https://nodejs.org/dist/${NODE_VERSION}"
TARBALL_NAME="node-${NODE_VERSION}-${PLATFORM}-${ARCH}.tar.gz"

mkdir -p "$(dirname "${BUILD_NODE_DIR}")"
TEMP_DIR="$(mktemp -d "${BUILD_NODE_DIR}.tmp.XXXXXX")"
BACKUP_DIR=""

cleanup() {
    if [ -n "${BACKUP_DIR}" ] && [ -d "${BACKUP_DIR}" ] && [ ! -e "${BUILD_NODE_DIR}" ]; then
        mv "${BACKUP_DIR}" "${BUILD_NODE_DIR}"
    fi
    rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

fail() {
    echo "❌ ${1}" >&2
    exit 1
}

echo "📦 Fetching Node.js ${NODE_VERSION} for ${PLATFORM}-${ARCH}..."

if ! command -v curl >/dev/null 2>&1; then
    fail "curl is required to download the pinned Node.js distribution."
fi
if ! command -v shasum >/dev/null 2>&1; then
    fail "shasum is required to verify the pinned Node.js distribution."
fi

TARBALL_PATH="${TEMP_DIR}/${TARBALL_NAME}"
SHASUMS_PATH="${TEMP_DIR}/SHASUMS256.txt"
if ! curl --fail --location --silent --show-error --retry 2 --connect-timeout 10 --max-time 300 \
    -o "${TARBALL_PATH}" "${DIST_URL}/${TARBALL_NAME}"; then
    fail "Could not download ${TARBALL_NAME}; no host Node fallback is permitted."
fi
if ! curl --fail --location --silent --show-error --retry 2 --connect-timeout 10 --max-time 60 \
    -o "${SHASUMS_PATH}" "${DIST_URL}/SHASUMS256.txt"; then
    fail "Could not download Node.js ${NODE_VERSION} SHASUMS256.txt; refusing an unverified runtime."
fi

EXPECTED_SHA256="$(awk -v name="${TARBALL_NAME}" '$2 == name || $2 == "*" name { print $1 }' "${SHASUMS_PATH}")"
if [[ ! "${EXPECTED_SHA256}" =~ ^[[:xdigit:]]{64}$ ]]; then
    fail "SHASUMS256.txt has no valid checksum entry for ${TARBALL_NAME}."
fi

if ! (cd "${TEMP_DIR}" && printf '%s  %s\n' "${EXPECTED_SHA256}" "${TARBALL_NAME}" | shasum -a 256 -c -); then
    fail "SHA256 verification failed for ${TARBALL_NAME}."
fi

EXTRACTED_DIR="${TEMP_DIR}/extracted"
mkdir -p "${EXTRACTED_DIR}"
if ! tar -xzf "${TARBALL_PATH}" -C "${EXTRACTED_DIR}" --strip-components=1; then
    fail "Could not extract verified archive ${TARBALL_NAME}."
fi
if [ ! -x "${EXTRACTED_DIR}/bin/node" ]; then
    fail "Verified archive does not contain an executable bin/node."
fi

# Replace only after checksum verification and extraction have both succeeded.
if [ -e "${BUILD_NODE_DIR}" ]; then
    BACKUP_DIR="${BUILD_NODE_DIR}.previous.$$"
    mv "${BUILD_NODE_DIR}" "${BACKUP_DIR}"
fi
if ! mv "${EXTRACTED_DIR}" "${BUILD_NODE_DIR}"; then
    fail "Could not install verified Node.js into ${BUILD_NODE_DIR}."
fi
if [ -n "${BACKUP_DIR}" ]; then
    rm -rf "${BACKUP_DIR}"
    BACKUP_DIR=""
fi

echo "✅ Embedded Node ready: $("${BUILD_NODE_DIR}/bin/node" -v) (SHA256 verified)"
