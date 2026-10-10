# subprocess 包族

<a id="family-subprocess"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

提供进程查找、进程树管理、标准输入输出收集和终端进程底层能力。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-subprocess`](#pkg-taskweaver-dsh-subprocess) | `subprocess/subprocess` | [接口与限制](#pkg-taskweaver-dsh-subprocess) |
| [`@taskweaver/dsh-subprocess-local`](#pkg-taskweaver-dsh-subprocess-local) | `subprocess/subprocess-local` | [接口与限制](#pkg-taskweaver-dsh-subprocess-local) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-subprocess"></a>
### `@taskweaver/dsh-subprocess`

<!-- migrated-from: packages/runtime/subprocess/subprocess/README.md -->
目录：`subprocess/subprocess`。
package.json 描述：Subprocess seam (ctx.subprocess) for the DeepSeek Harness — managed process groups, bounded spill-backed output, and escalated kills behind one abstract service

<a id="pkg-taskweaver-dsh-subprocess--taskweaver-dsh-subprocess"></a>
The subprocess seam (`ctx.subprocess`) is the process half of one execution world. The abstract `SubprocessRuntime` exposes executable lookup, ordinary managed `spawn`, and one terminal-process primitive; its vocabulary covers raw/collected stdio, process and terminal handles, exit facts, tree/session cleanup, and the managed `TASKWEAVER_*` environment namespace. The local implementation lives in [`dsh-subprocess-local`](./README.zh.md#pkg-taskweaver-dsh-subprocess-local).

<a id="pkg-taskweaver-dsh-subprocess--contract"></a>
#### Contract

- `spawn(spec)` returns immediately with a live handle; `done` resolves at process close with exit facts (`SubprocessOutcome` carries no output and no cause classification) and rejects only for spawn-level failures.
- Spawn working directories and executable paths belong to the provider's execution world. `resolveExecutable(command, env?, signal?)` verifies absolute commands or resolves bare names against that world's scrubbed PATH plus explicit overrides.
- The spec is fully explicit — argv, cwd, per-stream stdio dispositions, grace — because deployment-varying defaults belong to the caller's config, not to a hidden subprocess-service default (the `dsh-shell` request/spec split is the owning template). `argv` is never shell-interpreted; a consumer that wants a shell passes `['bash', '-c', command]` itself.
- Stdio is Node-shaped per stream: `'pipe'` hands the caller the raw stream for its own protocol framing (LSP JSON-RPC, ACP ndjson), `'inherit'` passes the parent descriptor through for diagnostics, and collect mode (`{ maxBytes, spill? }`) buffers a bounded tail with an optional full-stream spill file. Collect readers take whole-stream byte offsets and never consume, so independent readers cannot steal one another's deltas; a read whose offset slid out of the in-memory tail is `lossy` and points at the spill file when one exists. Collected output stays readable after settlement.
- Termination is tree-scoped on every platform (POSIX detached groups with direct-child fallback; Windows `taskkill /T`): `terminate()` — the only termination verb — escalates SIGTERM→grace→SIGKILL (idempotent, driven by the spec's abort signal too, a no-op once the tree is gone), and `waitForExit(signal?)` observes whole-tree liveness so a consumer-owned teardown ladder holds each tier on real quiescence — the manager reacts but never classifies why (callers own deadlines, teardown ladders, and cause classification).
- `spawnTerminal(spec)` is the only non-pipe primitive. Its handle owns a real PTY, UTF-8 text I/O, foreground-process-group inspection/signalling, and one awaited `terminate()` operation that reaches quiescence for every session member the provider can still observe and settles in-flight handle calls; providers document substrate-specific observability limits. The spec signal cancels allocation only; the published handle owns its lifetime. The output stream ends after queued output when the top-level process exits, and a live transport failure rejects `done`. These operations remain one substrate primitive because ordinary pipes cannot allocate a controlling terminal or clean terminal-session members; readiness, scrollback, and owner policy remain in the PTY consumer.
- `scrubbedParentEnv()` / `SENSITIVE_ENV_PATTERN` are the one shared scrub definition: ambient credential-shaped and `TASKWEAVER_*` names are dropped, and explicit `env` merges after the scrub. The local ordinary and terminal spawns both apply it; SDK-managed transports that own their spawn may import it directly.
- Disposal of the service terminates all still-running managed processes and awaits their exit.

See the [subprocess subsystem page]（原文链接目标：`../../../docs/subsystems/subprocess.md`） and the [seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-26-subprocess-seam.md`）.

<a id="pkg-taskweaver-dsh-subprocess--model-experience"></a>
#### Model Experience

Indirectly, through Consumers (today the bash executor family behind `dsh-tool-bash`), which own all model-facing rendering of process output and lifecycle.

<a id="pkg-taskweaver-dsh-subprocess--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

<a id="pkg-taskweaver-dsh-subprocess--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **SDK-managed spawns remain outside** — an SDK transport that owns its internal spawn cannot route that call through this service; it can still import `scrubbedParentEnv` so environment policy stays single-sourced.
- **Teardown ladders are consumer-owned** — the seam ships signalling verbs and the tree-liveness wait, not a canned quiesce sequence; each out-of-process consumer encodes its child's cooperation shape itself (the ACP backend's stdin-EOF-first ladder is the in-repo template).

<a id="pkg-taskweaver-dsh-subprocess-local"></a>
### `@taskweaver/dsh-subprocess-local`

<!-- migrated-from: packages/runtime/subprocess/subprocess-local/README.md -->
目录：`subprocess/subprocess-local`。
package.json 描述：Local-subprocess implementation of the DeepSeek Harness subprocess seam

<a id="pkg-taskweaver-dsh-subprocess-local--taskweaver-dsh-subprocess-local"></a>
Local Service Provider for the [`@taskweaver/dsh-subprocess`](./README.zh.md#pkg-taskweaver-dsh-subprocess) seam. `LocalSubprocessRuntime` resolves local executables, spawns ordinary detached process trees with explicit stdio, and implements terminal processes through `node-pty` plus platform process inspection. It has no config: every disposition, limit, terminal dimension, grace, and directory arrives from the calling capability seams ([`dsh-bash-local`](../shell/README.zh.md#pkg-taskweaver-dsh-bash-local), [`dsh-lsp-stdio`](../lsp/README.zh.md#pkg-taskweaver-dsh-lsp-stdio), and [`dsh-terminal-bash`]（原文链接目标：`../../terminal/terminal-bash/README.md`）).

<a id="pkg-taskweaver-dsh-subprocess-local--behavior"></a>
#### Behavior

- **Detached process trees with platform-correct signalling** — POSIX children are spawned `detached` (own process group) and signalled by negative pgid with a direct-child fallback; Windows terminates the tree via `taskkill /PID <pid> /T /F`. `terminate()` — the handle's only termination verb — sends SIGTERM then SIGKILL after the spec's grace (OpenCode's escalation; pipelines and subshells die with the parent) and is a no-op once the tree is gone; `waitForExit()` polls whole-tree liveness so consumer teardown confirms real quiescence. After the leader exits, still-open pipes receive the same bounded drain grace so a surviving descendant cannot hold the outcome open indefinitely. ESRCH is tolerated; daemons that re-parent away from the group can still survive.
- **Per-stream dispositions** — `'pipe'` hands the raw stream to the caller untouched (protocol framing stays consumer-owned); `'inherit'` passes the parent descriptor through; collect mode keeps the in-memory TAIL beyond its cap (errors and results cluster at the end — pi/OpenCode rationale) while the FULL stream is appended to a private temp file when a spill cap is configured — omitting `spill` keeps only the tail, the diagnostic shape. A stream larger than the spill cap discards its now-incomplete spill and returns only the marked truncated tail; spill fds are sealed at settlement, and a failed final close withholds the path rather than advertising an incomplete file. Spill files are `0600` with random names under a lazily-created `0700` per-process directory.
- **Credential scrub + explicit merge** — `process.env` minus credential-shaped vars (`*KEY*`/`*PASSWORD*`/`*SECRET*`/`*TOKEN*`) and all ambient `TASKWEAVER_*` names; the spec's explicit `env` merges after that scrub with no namespace validation, so a deliberately supplied credential or current `TASKWEAVER_*` fact wins while stale nested-harness identity cannot leak in ambiently. Supplied stdin is written and closed; otherwise fd 0 is `/dev/null`. See the [stdin/env Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-api.md`） and [managed environment Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-10-agent-session-identity-and-log-location.md`）.
- **Offset-based reads** — collect-mode readers return deltas in whole-stream byte coordinates; the service never holds a cursor, so consumer-owned cursors (the bash background read path) and full-stream re-reads coexist, before and after settlement.
- **Executable lookup** — `resolveExecutable` checks absolute files or searches the scrubbed effective PATH with platform-aware executable extensions; relative paths containing separators are rejected at the seam, and relative PATH entries resolve from the host process cwd.
- **Terminal-process ownership** — `spawnTerminal` allocates `node-pty`, bridges UTF-8 terminal text, inspects and signals the current foreground process group, and exposes one awaited termination operation that sweeps descendants before and after terminating the top-level shell. Each foreground inspection retains exact identities from the rooted tree; Linux also enumerates the POSIX session after its leader exits. A previously observed macOS descendant and any same-session Linux member therefore remain fenced after reparenting, while pid/start identity prevents cleanup from following PID reuse. On Windows the koffi-backed inspector enumerates the process table through Toolhelp32, combines GetProcessTimes start identities with zero-time process-handle waits for liveness, reports the shell pid as the pseudo foreground group (Windows has no POSIX groups), and teardown verifies the shell's termination because externally taskkilled shells may never fire node-pty's exit notification. The higher PTY backend owns prompt readiness, buffers, and model-facing operations.
- **Terminate-and-join disposal** — the service retains live handles so its own disposal can escalate every running tree and await its exit; quiescent and spawn-failed handles leave the live set after whole-tree or terminal-session cleanup finishes.
- **Synchronous host-exit finalization** — while the service effect is active, a Node `exit` listener force-terminates every ordinary tree and observable terminal session still in the same live sets. The local-only operations send POSIX SIGKILL to the managed group, run Windows `taskkill /T /F`, and synchronously signal captured/current terminal identities around the PTY root kill; they create no promise or timer, preserve the host's exit code and diagnostic, contain each target's failure, and do not claim quiescence. Normal disposal keeps the awaited graceful path above. See the [host-exit cleanup decision]（原文链接目标：`../../../.agents/notes/implemented/bug-fix/2026-08-11-synchronous-subprocess-exit-cleanup.md`）.

<a id="pkg-taskweaver-dsh-subprocess-local--model-experience"></a>
#### Model Experience

Indirectly, through Consumers (today the bash executor family behind `dsh-tool-bash`), which own all model-facing rendering of process output and lifecycle.

<a id="pkg-taskweaver-dsh-subprocess-local--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

<a id="pkg-taskweaver-dsh-subprocess-local--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Windows tree support is best-effort** — termination routes through `taskkill /PID <pid> /T /F` with all outcomes contained (absent tree, races, missing binary), and liveness falls back to the direct-child boundary.
- **Windows terminal signalling is console-wide** — SIGINT is delivered as a `\x03` Ctrl-C input write that conhost turns into a console-wide CTRL_C event; SIGTSTP and SIGHUP are rejected as unavailable; a `taskkill` without `/F` does not terminate console processes, so the teardown TERM tier is a grace wait before the `/F` escalation. Windows readiness has no exact stdin-wait tier: the prompt-marker fast path compares the shell pid as the pseudo foreground group, and silence/timing tiers cover the rest.
- **A daemonized terminal descendant can still escape the observable boundary** — on macOS, a child that reparents before any foreground-inspection snapshot is no longer discoverable from the `node-pty` root; on Linux, a child that calls `setsid` leaves both the tree and owned terminal session. The local provider does not add a continuous process-table monitor.
- **In-process cleanup requires a JavaScript-observable exit** — direct `process.exit()`, default uncaught exceptions, and default unhandled rejections emit Node's synchronous `exit` event. The default OS disposition for an unhandled `SIGTERM`, `SIGINT`, or `SIGHUP` bypasses that event; an application covers those signals only by installing a handler that performs normal disposal or calls `process.exit()`. `SIGKILL`, fatal OOM, `process.abort()`, native crashes, power loss, and any failure that cannot run JavaScript require an external supervisor, container init, or equivalent OS owner.
- **The credential scrub is a name heuristic** — `*KEY*`/`*PASSWORD*`/`*SECRET*`/`*TOKEN*` only; differently-named secrets (e.g. `*PASSPHRASE*`) pass through, and a whitelist for over-scrubbed vars is noted future work.
- **Completed spill files are not deleted** — bounded full-output recovery files (and the private per-process spill dir) accumulate under the OS tmpdir until something external cleans them; oversize incomplete spills are discarded and deletion is attempted immediately, but a cleanup failure can leave a bounded file behind.

The raw process handling lives in `src/spawn.ts`; `src/index.ts` is the service wiring.

<a id="family-subprocess"></a>
### 原族级说明（迁移保留）

<a id="family-subprocess--subprocess-subprocess-capability-family"></a>
The shared process substrate for one execution world: executable lookup, fully-specified managed child-process trees with raw or collected stdio, and one deep terminal-process primitive that owns PTY allocation, foreground groups, and provider-observable session cleanup. Command defaulting, shell semantics, deadlines, protocol framing, readiness, and presentation stay with consumers — the [bash executors](../shell/README.zh.md#family-shell), [LSP host](../lsp/README.zh.md#family-lsp), [PTY shell backend](../terminal/README.zh.md#family-terminal), and [ACP subagent backend](../subagent/README.zh.md#family-subagent). See the [subprocess seam Agent Note]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-26-subprocess-seam.md`）.

| Package | ctx key | Role |
|---|---|---|
| [`subprocess`](./README.zh.md#pkg-taskweaver-dsh-subprocess) (`@taskweaver/dsh-subprocess`) | `ctx.subprocess` | Service Definition: executable lookup, ordinary managed spawns, the terminal-process primitive, handle lifecycles, and shared environment/output vocabulary |
| [`subprocess-local`](./README.zh.md#pkg-taskweaver-dsh-subprocess-local) (`@taskweaver/dsh-subprocess-local`) | — | Local Service Provider: detached process trees, bounded collection/spill, `node-pty`, foreground/session inspection, tree signalling, and terminate-and-join disposal |

The service owns process lifetime across consumer reloads; consumers own what a process means (a bash command, a future non-shell runner) and every default that shapes one.

The subsystem reference — spawn specs, output readers, outcomes, the `TASKWEAVER_*` environment — is [docs/subsystems/subprocess.md]（原文链接目标：`../../docs/subsystems/subprocess.md`）; the seam decision in the [subprocess seam Agent Note]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-26-subprocess-seam.md`）.
