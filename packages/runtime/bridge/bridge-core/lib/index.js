import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { LlmError } from "@z/dsh-llm";
//#region lib/types/types.js
/**
* TaskWeaver model bridge — shared types for in-process provider backends.
* @module @z/dsh-bridge-core/types
*/
const BUILTIN_BRIDGE_KINDS = Object.freeze({
	CURSOR: "cursor",
	GOOGLE_ANTIGRAVITY: "google-antigravity",
	OPENAI_COMPAT_RELAY: "openai-compat-relay"
});
//#endregion
//#region lib/types/backends/pending.js
/**
* Placeholder backend until opencodex transport is wired in-process per kind.
* @module @z/dsh-bridge-core/backends/pending
*/
function createPendingBridgeBackend(kind) {
	return {
		kind,
		async *stream(_context) {
			throw new LlmError(`TaskWeaver 模型桥「${kind}」的内置传输尚未接入（方案 C 进行中）。 过渡期请继续使用 models.json 中的 loopback 提供方（如 opencodex + baseUrl）， 或配置 api: "openai-compat" 的直连 API。`, "BRIDGE_BACKEND_PENDING");
		}
	};
}
//#endregion
//#region lib/types/registry.js
/**
* @module @z/dsh-bridge-core/registry
*/
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
	if (typeof path === "string" && /^\.\.?\//.test(path)) return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
		return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
	});
	return path;
};
const backends = /* @__PURE__ */ new Map();
function registerBridgeBackend(backend) {
	backends.set(backend.kind, backend);
}
function getBridgeBackend(kind) {
	const hit = backends.get(kind);
	if (hit) return hit;
	return createPendingBridgeBackend(kind);
}
async function* streamThroughBridge(context) {
	yield* getBridgeBackend(context.profile.bridgeKind).stream(context);
}
function installDefaultBridgeBackends() {
	for (const kind of [
		"cursor",
		"google-antigravity",
		"openai-compat-relay"
	]) if (!backends.has(kind)) registerBridgeBackend(createPendingBridgeBackend(kind));
}
function transportModuleCandidates() {
	const fromEnv = process.env.TASKWEAVER_BRIDGE_TRANSPORT?.trim();
	if (fromEnv) return [fromEnv];
	const zRuntime = process.env.TASKWEAVER_Z_RUNTIME?.trim();
	if (zRuntime) return [pathToFileURL(join(zRuntime, "electron-vendor", "taskweaver-bridge-transport", "index.mjs")).href];
	return [
		"../../../../../../packages/provider-bridge-transport/index.mjs",
		"../../../../../../../packages/provider-bridge-transport/index.mjs",
		"../../../../../electron-vendor/taskweaver-bridge-transport/index.mjs",
		"../../../../electron-vendor/taskweaver-bridge-transport/index.mjs"
	];
}
/** Best-effort load of repo-root transport package; returns false when absent. */
async function installTaskWeaverTransportBackends() {
	for (const rel of transportModuleCandidates()) try {
		const mod = await import(__rewriteRelativeImportExtension(new URL(rel, import.meta.url).href));
		if (typeof mod.installBridgeTransportBackends === "function") {
			mod.installBridgeTransportBackends({ registerBridgeBackend });
			return true;
		}
	} catch {}
	return false;
}
//#endregion
export { BUILTIN_BRIDGE_KINDS, createPendingBridgeBackend, getBridgeBackend, installDefaultBridgeBackends, installTaskWeaverTransportBackends, registerBridgeBackend, streamThroughBridge };
