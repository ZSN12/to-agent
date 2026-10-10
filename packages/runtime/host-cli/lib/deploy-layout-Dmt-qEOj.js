import { existsSync, lstatSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { homedir } from "node:os";
//#region lib/types/deploy-layout.js
/**
* TaskWeaver / pnpm-deploy runtime layout: dependencies live in `runtime-packages/`.
* @module @taskweaver/dsh/deploy-layout
*/
/** Bootstrap-only env reader (no workspace imports — entry loads before `node_modules` exists). */
const warnedLegacyEnvironment = /* @__PURE__ */ new Set();
function nonBlankEnv(env, key) {
	const value = env[key];
	if (value === void 0 || value.trim() === "") return void 0;
	return value;
}
function readEnvironment(canonical, legacy = []) {
	const current = nonBlankEnv(process.env, canonical);
	for (const name of legacy) {
		const value = nonBlankEnv(process.env, name);
		if (value === void 0) continue;
		if (!warnedLegacyEnvironment.has(name)) {
			warnedLegacyEnvironment.add(name);
			process.stderr.write(`[TaskWeaver] ${name} 已弃用，请改用 ${canonical}。旧名称将在一个版本后移除。\n`);
		}
		if (current === void 0) return value;
	}
	return current;
}
function expandHomePath(path) {
	if (path === "~") return homedir();
	if (path.startsWith("~/") || path.startsWith("~\\")) {
		const suffix = sep === "/" ? path.slice(2).replaceAll("\\", "/") : path.slice(2).replaceAll("/", "\\");
		return join(homedir(), suffix);
	}
	return path;
}
function taskweaverEmbedded() {
	return readEnvironment("TASKWEAVER_EMBEDDED", ["Z_TASKWEAVER_EMBEDDED", "DSH_TASKWEAVER_EMBEDDED"]) !== void 0;
}
function resolveHarnessHomeDir() {
	const selected = readEnvironment("TASKWEAVER_HOME", ["Z_HOME", "DSH_HOME"]) ?? join(homedir(), ".taskweaver", "runtime");
	return resolve(expandHomePath(selected));
}
const RUNTIME_PACKAGES_DIR = "runtime-packages";
function deployPackagesDir(runtimeRoot) {
	return join(runtimeRoot, RUNTIME_PACKAGES_DIR);
}
function nodeModulesLink(runtimeRoot) {
	return join(runtimeRoot, "node_modules");
}
function linkPointsAtPackages(runtimeRoot, linkPath) {
	try {
		if (!lstatSync(linkPath).isSymbolicLink()) return false;
		const target = readlinkSync(linkPath);
		if (target === "runtime-packages") return true;
		return resolve(runtimeRoot, target) === deployPackagesDir(runtimeRoot);
	} catch {
		return false;
	}
}
/** Ensure `<runtime-root>/node_modules` resolves the deploy closure when present. */
function ensureDeployNodeModules(runtimeRoot) {
	const packagesDir = deployPackagesDir(runtimeRoot);
	if (!existsSync(packagesDir)) return;
	const linkPath = nodeModulesLink(runtimeRoot);
	if (existsSync(linkPath)) {
		if (linkPointsAtPackages(runtimeRoot, linkPath)) return;
		try {
			if (lstatSync(linkPath).isDirectory() && !lstatSync(linkPath).isSymbolicLink()) return;
		} catch {}
	}
	try {
		symlinkSync(RUNTIME_PACKAGES_DIR, linkPath, "dir");
		return;
	} catch {}
	try {
		symlinkSync(packagesDir, linkPath, "dir");
	} catch {}
}
/**
* TaskWeaver ≤0.1 wrote `authorization` into `$TASKWEAVER_HOME/cordis.patch.yml`. The
* TaskWeaver bundle now owns that row — drop the legacy home overlay before Cordis loads.
*/
function migrateLegacyTaskWeaverHomePatch() {
	if (!taskweaverEmbedded()) return;
	const patchPath = join(resolveHarnessHomeDir(), "cordis.patch.yml");
	if (!existsSync(patchPath)) return;
	const text = readFileSync(patchPath, "utf8");
	if (!/dsh-authorization/.test(text) && !/\bid:\s*authorization\b/.test(text)) return;
	writeFileSync(patchPath, "[]\n", "utf8");
}
//#endregion
export { migrateLegacyTaskWeaverHomePatch as n, ensureDeployNodeModules as t };
