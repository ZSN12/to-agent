import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** TaskWeaver vendored package name (see vendor/opencodex/package.json). */
export const TASKWEAVER_PACKAGE = "@taskweaver/opencodex";

/** Upstream npm scope — still recognized in paths for migration / legacy global installs. */
export const LEGACY_UPSTREAM_PACKAGE = "@bitkyc08/opencodex";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const NODE_MODULES_SEGMENTS = [
  `/node_modules/${TASKWEAVER_PACKAGE}`,
  `/node_modules/${LEGACY_UPSTREAM_PACKAGE}`,
];

/** Path markers for TaskWeaver-owned trees (file: vendor link or monorepo vendor/). */
export const TASKWEAVER_DISTRIBUTION_PATH_MARKERS = [
  ...NODE_MODULES_SEGMENTS,
  "/vendor/opencodex",
];

let cachedDistributionName;

export function distributionPackageName() {
  if (!cachedDistributionName) {
    try {
      const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
      cachedDistributionName = typeof manifest.name === "string" ? manifest.name : LEGACY_UPSTREAM_PACKAGE;
    } catch {
      cachedDistributionName = LEGACY_UPSTREAM_PACKAGE;
    }
  }
  return cachedDistributionName;
}

/** True when this running package is the TaskWeaver fork (not stock @bitkyc08/opencodex). */
export function isTaskWeaverDistribution() {
  return distributionPackageName() === TASKWEAVER_PACKAGE;
}

/**
 * @param {string} packagePath
 */
export function isTaskWeaverDistributionPath(packagePath) {
  const normalized = String(packagePath).replace(/\\/g, "/").toLowerCase();
  return TASKWEAVER_DISTRIBUTION_PATH_MARKERS.some(marker => normalized.includes(marker.toLowerCase()));
}

export function taskweaverDistributionUpdateMessage() {
  return [
    "OpenCodex is bundled with TaskWeaver (@taskweaver/opencodex).",
    "It is not updated from the public npm registry.",
    "Update TaskWeaver (app release) or, from the project repo: git pull && npm install, then ocx restart.",
  ].join("\n");
}

/** Shown when Bun bootstrap fails — reinstall via TaskWeaver, not upstream npm. */
export function taskweaverDistributionReinstallHint() {
  if (isTaskWeaverDistribution()) {
    return "Reinstall TaskWeaver dependencies from the project root: npm install (then ocx restart).";
  }
  const pkg = distributionPackageName();
  return `npm install -g --allow-scripts=bun ${pkg}`;
}
