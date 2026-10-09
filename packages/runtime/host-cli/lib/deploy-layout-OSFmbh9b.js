import { existsSync, lstatSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
//#region lib/types/deploy-layout.js
/**
* TaskWeaver / pnpm-deploy runtime layout: dependencies live in `runtime-packages/`.
* @module @z/dsh/deploy-layout
*/
/** Bootstrap-only Z/DSH env (no workspace imports — entry loads this before `node_modules` exists). */
function nonBlankEnv(env, key) {
	const value = env[key];
	if (value === void 0 || value.trim() === "") return void 0;
	return value;
}
function expandHomePath(path) {
	if (path === "~") return homedir();
	if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
	return path;
}
function taskweaverEmbedded() {
	const env = process.env;
	return nonBlankEnv(env, "Z_TASKWEAVER_EMBEDDED") !== void 0 || nonBlankEnv(env, "DSH_TASKWEAVER_EMBEDDED") !== void 0;
}
function resolveHarnessHomeDir() {
	const env = process.env;
	return resolve(expandHomePath(nonBlankEnv(env, "Z_HOME") ?? nonBlankEnv(env, "DSH_HOME") ?? join(homedir(), ".dsh")));
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
* TaskWeaver ≤0.1 wrote `authorization` into `$DSH_HOME/cordis.patch.yml`. The
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
