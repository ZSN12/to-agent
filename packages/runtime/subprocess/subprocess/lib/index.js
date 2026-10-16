/**
 * Service Definition for the subprocess capability seam (`ctx.subprocess`): execution-world executable lookup,
 * fully specified managed process trees with raw or
 * collected stdio, and one terminal-process primitive. Command defaulting,
 * shell semantics, deadlines, protocol framing, terminal readiness, and
 * presentation belong to consumers. The local implementation lives in
 * `@taskweaver/dsh-subprocess-local`.
 * @module @taskweaver/dsh-subprocess
 */
import { Service } from '@taskweaver/cordis';
import { LEGACY_TASKWEAVER_ENV_PREFIXES, TASKWEAVER_ENV_PREFIX } from "./types.js";
export { DSH_ENV_PREFIX, LEGACY_TASKWEAVER_ENV_PREFIXES, TASKWEAVER_ENV_PREFIX, Z_ENV_PREFIX, } from "./types.js";
/**
 * Credential-shaped environment names are NOT forwarded to children (the
 * harness's own `DEEPSEEK_API_KEY`/secrets must not leak into a spawned
 * process implicitly). One heuristic for every in-repo spawner; a
 * deliberately supplied entry survives because explicit env layers merge
 * after the scrub.
 */
export const SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i;
const warnedLegacyPrefixes = new Set();
/**
 * The ambient parent environment minus credential-shaped names and all
 * TaskWeaver-managed names (including legacy aliases) — the canonical base every child starts from. `PATH`,
 * `HOME`, locale, and proxy variables survive, so child CLIs run normally;
 * harness identity never leaks implicitly (a deliberately forwarded
 * credential or current `TASKWEAVER_*` fact goes through the spec's explicit `env`,
 * which merges after this scrub). Prefix scrubbing matches case-insensitively
 * because Windows environment names are case-insensitive. Exported as a plain function so spawners
 * that cannot route through the service (node-pty backends, SDK-managed
 * transports) share the one scrub definition.
 * @returns a fresh environment object safe to hand to a child spawn.
 */
export function scrubbedParentEnv() {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        const upper = key.toUpperCase();
        const legacyPrefix = LEGACY_TASKWEAVER_ENV_PREFIXES.find((prefix) => upper.startsWith(prefix));
        if (legacyPrefix !== undefined) {
            if (!warnedLegacyPrefixes.has(legacyPrefix)) {
                warnedLegacyPrefixes.add(legacyPrefix);
                console.warn(`[TaskWeaver] ${legacyPrefix} 子进程环境变量前缀已弃用，请改用 ${TASKWEAVER_ENV_PREFIX}。`);
            }
            continue;
        }
        if (value !== undefined && !SENSITIVE_ENV_PATTERN.test(key)
            && !upper.startsWith(TASKWEAVER_ENV_PREFIX))
            env[key] = value;
    }
    return env;
}
/**
 * Abstract subprocess service. Subclass, implement {@link spawn}, and load the
 * subclass as a plugin — it registers as `ctx.subprocess` (one implementation
 * per context; loading a second throws, which is cordis' standard
 * duplicate-service behavior).
 *
 * Implementations must honor these semantics:
 * - Executable paths belong to one execution world shared with the mounted
 *   filesystem provider.
 * - {@link spawn} returns immediately with a live handle; `done` resolves at
 *   process close with exit facts and rejects only for spawn-level failures.
 * - Collect-mode readers are offset-based and non-consuming, so independent
 *   readers never consume one another's output; lossy reads report truncation
 *   and the spill file holding the complete stream when one exists. Piped
 *   streams are handed to the caller raw and never buffered here.
 * - {@link SubprocessHandle.terminate} (and the spec's abort signal) escalates
 *   SIGTERM→grace→SIGKILL — the only termination verb — tree-scoped on every
 *   platform. {@link SubprocessHandle.waitForExit} observes whole-tree
 *   liveness, so a consumer-owned teardown ladder can hold each tier on real
 *   quiescence.
 * - Disposal of the service terminates all still-running managed processes
 *   and awaits their exit.
 * - {@link spawnTerminal} owns terminal allocation, text transport,
 *   foreground groups, signalling, and whole-session quiescence behind one
 *   awaited termination method; readiness and persistent-shell policy stay
 *   in the PTY consumer. Its output stream ends after queued terminal output
 *   when the top-level process exits.
 */
export class SubprocessRuntime extends Service {
    constructor(ctx) {
        super(ctx, 'subprocess');
    }
}
export default SubprocessRuntime;
//# sourceMappingURL=index.js.map