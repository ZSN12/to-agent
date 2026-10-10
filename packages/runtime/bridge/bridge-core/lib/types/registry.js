/**
 * @module @taskweaver/dsh-bridge-core/registry
 */
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPendingBridgeBackend } from "./backends/pending.js";
const backends = new Map();
const warnedLegacyRuntimeEnv = new Set();
/** Resolve the runtime root while keeping the former env spellings read-only for one release. */
export function resolveBridgeRuntimeRoot(env = process.env, warn = (message) => console.warn(message)) {
    const canonical = env.TASKWEAVER_RUNTIME?.trim();
    let fallback;
    for (const legacyName of ['TASKWEAVER_Z_RUNTIME', 'TASKWEAVER_DSH_RUNTIME']) {
        const value = env[legacyName]?.trim();
        if (!value)
            continue;
        if (!warnedLegacyRuntimeEnv.has(legacyName)) {
            warnedLegacyRuntimeEnv.add(legacyName);
            warn(`[TaskWeaver] ${legacyName} 已弃用，请改用 TASKWEAVER_RUNTIME。`);
        }
        fallback ??= value;
    }
    return canonical || fallback;
}
export function registerBridgeBackend(backend) {
    backends.set(backend.kind, backend);
}
export function getBridgeBackend(kind) {
    const hit = backends.get(kind);
    if (hit)
        return hit;
    return createPendingBridgeBackend(kind);
}
export async function* streamThroughBridge(context) {
    const backend = getBridgeBackend(context.profile.bridgeKind);
    yield* backend.stream(context);
}
export function installDefaultBridgeBackends() {
    for (const kind of [
        'cursor',
        'google-antigravity',
        'openai-compat-relay',
    ]) {
        if (!backends.has(kind)) {
            registerBridgeBackend(createPendingBridgeBackend(kind));
        }
    }
}
function transportModuleCandidates() {
    const fromEnv = process.env.TASKWEAVER_BRIDGE_TRANSPORT?.trim();
    if (fromEnv)
        return [fromEnv];
    const runtimeRoot = resolveBridgeRuntimeRoot();
    if (runtimeRoot) {
        const staged = join(runtimeRoot, 'electron-vendor', 'taskweaver-bridge-transport', 'index.mjs');
        return [pathToFileURL(staged).href];
    }
    return [
        '../../../../../../packages/provider-bridge-transport/index.mjs',
        '../../../../../../../packages/provider-bridge-transport/index.mjs',
        '../../../../../electron-vendor/taskweaver-bridge-transport/index.mjs',
        '../../../../electron-vendor/taskweaver-bridge-transport/index.mjs',
    ];
}
/** Best-effort load of repo-root transport package; returns false when absent. */
export async function installTaskWeaverTransportBackends() {
    for (const rel of transportModuleCandidates()) {
        try {
            const url = new URL(rel, import.meta.url);
            const mod = await import(__rewriteRelativeImportExtension(url.href));
            if (typeof mod.installBridgeTransportBackends === 'function') {
                mod.installBridgeTransportBackends({ registerBridgeBackend });
                return true;
            }
        }
        catch {
            /* try next candidate */
        }
    }
    return false;
}
//# sourceMappingURL=registry.js.map