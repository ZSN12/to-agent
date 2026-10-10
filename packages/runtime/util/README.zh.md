# util 包族

<a id="family-util"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

提供不依赖业务域的路径、超时、原子写入和其他基础工具。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-atomic-write`](#pkg-taskweaver-dsh-atomic-write) | `util/atomic-write` | [接口与限制](#pkg-taskweaver-dsh-atomic-write) |
| [`@taskweaver/dsh-brand`](#pkg-taskweaver-dsh-brand) | `util/brand` | [接口与限制](#pkg-taskweaver-dsh-brand) |
| [`@taskweaver/dsh-home-paths`](#pkg-taskweaver-dsh-home-paths) | `util/home-paths` | [接口与限制](#pkg-taskweaver-dsh-home-paths) |
| [`@taskweaver/dsh-launch-environment`](#pkg-taskweaver-dsh-launch-environment) | `util/launch-environment` | [接口与限制](#pkg-taskweaver-dsh-launch-environment) |
| [`@taskweaver/dsh-native-command`](#pkg-taskweaver-dsh-native-command) | `util/native-command` | [接口与限制](#pkg-taskweaver-dsh-native-command) |
| [`@taskweaver/dsh-output-retention`](#pkg-taskweaver-dsh-output-retention) | `util/output-retention` | [接口与限制](#pkg-taskweaver-dsh-output-retention) |
| [`@taskweaver/dsh-timeout`](#pkg-taskweaver-dsh-timeout) | `util/timeout` | [接口与限制](#pkg-taskweaver-dsh-timeout) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-atomic-write"></a>
### `@taskweaver/dsh-atomic-write`

<!-- migrated-from: packages/runtime/util/atomic-write/README.md -->
目录：`util/atomic-write`。
package.json 描述：Zero-dependency atomic file replacement: exclusive-create random-suffix temp + rename carrying the caller-stated permissions (writeFileAtomic)

<a id="pkg-taskweaver-dsh-atomic-write--dsh-atomic-write"></a>
Zero-dependency atomic file replacement shared by file-backed stores that must never leave partial, symlink-hijacked, or wider-than-intended content on disk — the user-settings document (`dsh-settings-file`) and the credentials store (`dsh-credentials-local`).

<a id="pkg-taskweaver-dsh-atomic-write--surface"></a>
#### Surface

```ts
import { withFileLock, writeFileAtomic } from '@taskweaver/dsh-atomic-write'

declare const text: string
declare const render: (previous: string) => string

await writeFileAtomic('/home/u/.dsh/settings.yaml', text, { mode: 0o600 })

// Read-modify-write against the same file from several processes.
await withFileLock('/home/u/.dsh/settings.yaml', async () => {
  await writeFileAtomic('/home/u/.dsh/settings.yaml', render(text), { mode: 0o600 })
})
```

`writeFileAtomic` commits one already-rendered string. The contract, in the order failures would exploit it:

- **Exclusive-create temp** (`wx`, random suffix): the open refuses to follow a symlink planted at a guessable temp path.
- **The fresh inode carries `mode` through the rename**: replacing a wider-permission file narrows it without a chmod race. `mode` is required so the permission decision stays visible at every call site (subject to the process umask, like every fresh inode).
- **`rename` replaces a symlinked target itself**, never writing through to its referent.
- **Same-directory sibling** keeps the rename on one filesystem, so the swap stays atomic.
- Parent directories are created; on any failure the temp is removed and the failure rethrown; readers observe either the old or the new complete content.

`withFileLock` serializes the writers of one file across processes, for the read-render-commit cycles a bare atomic commit cannot make safe on its own. The lock is a `wx`-created `<filename>.lock` sibling, so readers never contend; waiters back off exponentially and fail with a timeout rather than block forever. `EEXIST` identifies contention directly; `EPERM` does so only when a fresh `lstat` confirms that the lock path exists, covering Windows exclusive-create behavior without hiding an unrelated permission failure. A contender never removes the existing lock: age cannot distinguish a crashed owner from a paused live writer.

How long a contender waits is a property of the operation the holder runs, so it is stated per call through `waitMs`. The default is sized for file work alone; a holder whose cycle includes a network round trip — a credential mutation that refreshes an expired token — states a longer one, because leaving the default would fail every other writer of that file for the duration. The retry cadence stays fixed: it governs how often a contender asks, which no caller has a reason to vary.

<a id="pkg-taskweaver-dsh-atomic-write--model-experience"></a>
#### Model Experience

None, as this is a pure filesystem primitive; nothing here reaches a model request.

<a id="pkg-taskweaver-dsh-atomic-write--kv-cache-effect"></a>
###### KV Cache effect

None; nothing here enters a request prefix.

<a id="pkg-taskweaver-dsh-atomic-write--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Atomic, not durable** — no `fsync` of the file or its directory, so after a crash the rename may be observed unwound. The file-backed stores here re-read and republish on boot, keeping durability the caller's policy.
- **String content only** — no `Buffer` or stream form until a consumer needs one.
- **Orphaned locks require operator recovery** — a process that exits while holding the lock can leave the sibling behind. Later writers time out without deleting it; an operator removes it only after verifying that no writer still owns it. File age alone is not safe evidence of abandonment.

<a id="pkg-taskweaver-dsh-brand"></a>
### `@taskweaver/dsh-brand`

<!-- migrated-from: packages/runtime/util/brand/README.md -->
目录：`util/brand`。
package.json 描述：Type-only Branded<B> nominal-typing primitive for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-brand--dsh-brand"></a>
The `Branded<B>` nominal-typing primitive — a tiny, **type-only** package (no runtime code, no harness-package dependency) shared by every package that owns a cross-boundary id.

<a id="pkg-taskweaver-dsh-brand--what-branded-is"></a>
#### What `Branded` is

A brand makes structurally-identical strings non-interchangeable at the type level: a `SessionId` cannot be passed where a `CallId` is expected, even though both are plain `string`s at runtime.

```ts
import type { Branded } from '@taskweaver/dsh-brand'

export type SessionId = Branded<'SessionId'>

/** Brand a string as a SessionId (a plain cast — zero runtime cost). */
export function SessionId(id: string): SessionId {
  return id as SessionId
}
```

Construction goes through the per-id factory in the owning package. Comparison, logging, JSON serialization, and the wire format behave as for an ordinary string; the brand is erased at compile time.

<a id="pkg-taskweaver-dsh-brand--policy-brand-ids-that-cross-package-boundaries"></a>
#### Policy: brand ids that cross package boundaries

A package brands the ids it owns — `CallId` in `dsh-llm`, the shared agent/session `SessionId` in `dsh-session`, and `JobId` in `dsh-jobs`. Brand cross-package ids that could plausibly be confused; not every string needs one.

This package owns only the primitive. Keeping it dependency-free lets `dsh-jobs`, for example, brand `JobId` without importing an unrelated capability package merely to reach `Branded`.

<a id="pkg-taskweaver-dsh-home-paths"></a>
### `@taskweaver/dsh-home-paths`

<!-- migrated-from: packages/runtime/util/home-paths/README.md -->
目录：`util/home-paths`。
package.json 描述：Shared filesystem path helpers for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-home-paths--dsh-home-paths"></a>
Shared filesystem path helpers for DeepSeek Harness user data.

<a id="pkg-taskweaver-dsh-home-paths--dsh-home"></a>
#### DSH home

`resolveRuntimeHome()` resolves the single TaskWeaver runtime home. Precedence, highest first: an explicit configured path, `$TASKWEAVER_HOME`, then `~/.taskweaver/runtime`. During the compatibility release, it can also read `Z_HOME` and `DSH_HOME`; consuming either old variable prints a deprecation warning. The harness keeps all user data under one root.

`runtimeHomePath(...segments)` joins child segments onto that resolved home with Node's platform path rules. With no segments it returns the home itself. The former `dshHomePath` export remains as a deprecated alias for compatibility.

`runtimeHomeDisplay()` names an active root symbolically for user-facing paths: `~/.taskweaver/runtime` for the default home, `$TASKWEAVER_HOME` for any configured home. It never leaks an absolute machine path.

`RUNTIME_HOME_DIR_NAME` owns the default runtime directory name: `runtime`.

`defaultRuntimeHome()` returns the default TaskWeaver runtime home by joining the operating-system home directory, `.taskweaver`, and `runtime`, using Node's platform path rules. The old `resolveDshHome`, `dshHomeDisplay`, and `defaultDshHome` names remain deprecated aliases for one compatibility release.

`expandHomePath()` expands `~`, `~/...`, and Windows-style `~\...` prefixes against the operating-system home directory. It leaves non-tilde paths and `~user/...` untouched.

<a id="pkg-taskweaver-dsh-home-paths--watch-paths"></a>
#### Watch paths

`canonicalizeWatchPath()` gives a native filesystem watcher one stable spelling of its target. It resolves the deepest existing ancestor through `fs.realpath()` and restores any missing suffix, so a file or directory may still be watched before it is created. In particular, Windows 8.3 aliases cannot be mixed with the long paths emitted by the native watcher backend.

This package is intentionally small and harness-dep-free so product packages can share user-data path conventions without depending on one another.

<a id="pkg-taskweaver-dsh-home-paths--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Expansion is deliberately narrow** — only bare `~`, `~/...`, and `~\...` use the current operating-system home; named-user forms such as `~alice/...`, environment variables, and shell expressions remain unchanged.
- **Canonicalization reads but never mutates** — `canonicalizeWatchPath()` performs `realpath` probes and propagates errors other than absence; callers still own directory creation, permissions, and trust policy for the resulting path.

<a id="pkg-taskweaver-dsh-launch-environment"></a>
### `@taskweaver/dsh-launch-environment`

<!-- migrated-from: packages/runtime/util/launch-environment/README.md -->
目录：`util/launch-environment`。
package.json 描述：Immutable DeepSeek Harness launch environment that records which layer supplied each value

<a id="pkg-taskweaver-dsh-launch-environment--dsh-launch-environment"></a>
This run's environment as one immutable snapshot that remembers **which layer supplied each value**. Consumers resolve user-facing values against it instead of `process.env`, because the layers are not equally trusted and a flattened view cannot tell them apart.

| Layer | Source id | What it is |
|---|---|---|
| Inherited process environment | `process` | What the launching shell, CI job, or container passed in — this run's explicit intent |
| `<invocation cwd>/.env` | `project-env` | The project the harness was launched in, which the product trusts to configure its own agent |
| `$TASKWEAVER_HOME/.env` | `user-env` | The user's own machine-level defaults |

Values do also reach `process.env` — a user's `--config` tree and third-party libraries read it — but that flattened view is not the authority for anything the harness resolves.

<a id="pkg-taskweaver-dsh-launch-environment--resolving"></a>
#### Resolving

`get(name)` searches every layer, most trusted first. `getFrom(name, sources)` searches only the named layers without changing that trust order.

**Omitting a layer is a refusal, not a demotion** — a caller that must never accept a layer leaves it out of the list, so no future reordering can let it back in. The provider adapters name all three, because the product trusts the project it runs in; the mechanism exists for the decisions where that is not true.

Names match the way the platform matches them: exactly on POSIX, case-insensitively on Windows. A case-sensitive lookup there would rank the wrong layer — a shell's `deepseek_api_key` and a project `.env`'s `DEEPSEEK_API_KEY` are one variable to the OS, and treating them as two would let the project win.

```ts
import type { Context } from '@taskweaver/cordis'
import { launchEnvironmentOf } from '@taskweaver/dsh-launch-environment'

declare const ctx: Context
const endpoint = launchEnvironmentOf(ctx).get('DEEPSEEK_BASE_URL')?.value
```

`launchEnvironmentOf(ctx)` returns the launcher's snapshot when the product CLI booted the tree, and otherwise the inherited environment as the only layer. That fallback does not weaken the rules: an SDK host or a bare `cordis.yml` discovered no files, so everything it has really is the environment it was launched with.

<a id="pkg-taskweaver-dsh-launch-environment--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **The snapshot is not a subprocess boundary** — every layer is also materialized into `process.env`, so ordinary project variables reach child processes under [`dsh-subprocess`](../subprocess/README.zh.md#pkg-taskweaver-dsh-subprocess)'s scrub. The product launcher's [`.env` contract](../boot/README.zh.md#pkg-taskweaver-dsh-app-boot--profiles) rejects bootstrap variables before materialization.
- **No per-workspace layer** — the project layer is the *invoking* directory, fixed at launch. A workspace selected later in the Web UI contributes nothing, deliberately: following it would let a model's own workspace change the harness environment mid-session.

<a id="pkg-taskweaver-dsh-native-command"></a>
### `@taskweaver/dsh-native-command`

<!-- migrated-from: packages/runtime/util/native-command/README.md -->
目录：`util/native-command`。
package.json 描述：Zero-dependency no-shell execFile runner for host-native OS integrations: utf8 stdio capture, abort propagation, Windows hide

<a id="pkg-taskweaver-dsh-native-command--dsh-native-command"></a>
A **zero-dependency no-shell `execFile` runner** shared by host-native OS integrations: one `runNativeCommand(command, args, signal)` call spawns the executable directly (never a shell string), captures utf8 stdout/stderr, propagates the caller's abort into child termination, and hides the transient console window on Windows. Failures reject with the exit `code` and both captured streams attached, so callers classify (missing tool, cancelled, real failure) without re-running anything.

Its two consumers are the host-side native integrations: the [`directory-picker-native`](../host/README.zh.md#pkg-taskweaver-dsh-host-directory-picker-native) backend's OS chooser commands and the gateway's open-with-default-application hand-off ([`dsh-host-apiproxy`](../host/README.zh.md#pkg-taskweaver-dsh-host-apiproxy) `host.openPath`). The `NativeCommandRunner` type is their injectable command boundary.

It is a **library, not a service or plugin**: no `ctx`, registers nothing, holds no state, emits no events.

<a id="pkg-taskweaver-dsh-native-command--surface"></a>
#### Surface

```ts
import { runNativeCommand, type NativeCommandRunner } from '@taskweaver/dsh-native-command'
```

<a id="pkg-taskweaver-dsh-native-command--model-experience"></a>
#### Model Experience

None, as this is host-side subprocess plumbing; nothing here reaches a model request.

<a id="pkg-taskweaver-dsh-native-command--kv-cache-effect"></a>
###### KV Cache effect

None; this package neither assembles nor sends a provider request.

<a id="pkg-taskweaver-dsh-native-command--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No output bounding** — both streams buffer unbounded in memory; every current caller invokes small native tools whose output is a path or an error line. Adopt `dsh-output-retention` bounding before pointing this at commands with meaningful output volume.

<a id="pkg-taskweaver-dsh-output-retention"></a>
### `@taskweaver/dsh-output-retention`

<!-- migrated-from: packages/runtime/util/output-retention/README.md -->
目录：`util/output-retention`。
package.json 描述：Zero-dependency bounded-retention primitive: ItemRetainer/TextRetainer + neutral notice helpers (what did we keep, what did we omit)

<a id="pkg-taskweaver-dsh-output-retention--dsh-output-retention"></a>
A dependency-light **retention** library: bounded model-facing output for tools that must cap how much context they return. A caller feeds items or text chunks into a bounded object, then gets the retained content plus exact omission metadata.

The library owns **only** the mechanical question *"what did we keep, and what did we omit?"*. Tool-specific code keeps its business semantics: file grouping, line numbering, exit codes, provider error states, per-line preview truncation, spill files, and the model-facing prose. This is the boundary the [Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-06-tool-result-retention-library.md`） draws.

It is a **library, not a service or plugin**: no `ctx`, registers nothing, emits no events. The only state is per-retainer (one accumulation), never cross-call. Tool packages import it directly.

<a id="pkg-taskweaver-dsh-output-retention--api"></a>
#### API

```ts
import {
  ItemRetainer, TextRetainer,
  describeOmitted, formatRetentionNotice,
} from '@taskweaver/dsh-output-retention'
import type {
  Omitted, PushDecision, RetainedItems, RetainedText,
  ItemRetentionStrategy, TextRetentionStrategy, RetentionNotice,
} from '@taskweaver/dsh-output-retention'
```

| Export | Role |
|---|---|
| `ItemRetainer<T>` | Bounds ordered logical units (paths, grep matches, sources). `head` only. `push()` → `PushDecision`; `finish()` → `RetainedItems<T>`. |
| `TextRetainer` | Bounds a byte-oriented text stream. `head` / `tail` / `headTail`, UTF-8 boundaries preserved at `finish()`. `push()` → `PushDecision`; `finish()` → `RetainedText`. |
| `describeOmitted(omitted, unit)` | Standardized omission clause (`exact` prints a count; `unknown` does not). |
| `formatRetentionNotice(notice, recovery)` | Joins the standardized omission clause with the tool's own recovery guidance. |
| `Omitted` | `none` / `exact` / `unknown` — how much was omitted. |
| `PushDecision` | `{ kept, truncated }` — the per-push retention result. |

<a id="pkg-taskweaver-dsh-output-retention--resource-modes"></a>
#### Resource Modes

The two retainers are separate names, not one generic collector, because they differ in **resource model**.

- **`ItemRetainer` bounds ordered logical units.** A search tool can collect a full result set for spill-file recovery while retaining only the first `maxItems` for the model-facing preview. The omission count is exact because the caller keeps feeding every observed item.
- **`TextRetainer` bounds byte-oriented text.** `head`, `tail`, and `headTail` preserve UTF-8 boundaries at `finish()`; `headTail` is the shape `dsh-spill-policy` uses to build a bounded preview around a spill-file notice.

<a id="pkg-taskweaver-dsh-output-retention--truncated-is-a-budget-fact-never-incomplete"></a>
#### `truncated` is a budget fact, never "incomplete"

`truncated` means *the retainer omitted otherwise-available content because of a budget*. It does **not** mean the upstream was incomplete. Permission failures, skipped binary files, provider partial failures, unreadable candidates, and invalid UTF-8 stay in tool-domain fields — never folded into `truncated`. Conflating the two is the bug this library's naming most invites; keep them separate.

<a id="pkg-taskweaver-dsh-output-retention--bytes-not-characters"></a>
#### Bytes, not characters

Text caps and `omittedBytes` count **bytes**, for process/body safety (a child's pipe and an HTTP body are byte streams). A chunk that straddles a codepoint is handled: `finish()` trims a partial codepoint at each cut so the returned text never introduces a replacement char at the boundary, and the two sides are decoded separately so a codepoint is never reconstructed across the omitted middle. Character- or line-level preview budgets are a separate, tool-owned concern.

<a id="pkg-taskweaver-dsh-output-retention--tool-mappings"></a>
#### Tool mappings

Current retention consumers use these mappings:

| Tool | Retainer & strategy | Notes |
|---|---|---|
| `glob` | `ItemRetainer<FsGlobEntry>`, `head` | Collect the full sorted path list for a spill file while retaining the first page inline. Path mapping, skipped candidates, and `incomplete` stay outside. |
| `grep` | `ItemRetainer<FlatGrepMatch>`, `head` | Collect matches for a spill file while retaining the first page inline. Per-match preview truncation, grouping, sorting, and `incomplete` stay outside. |
| `bash` | `TextRetainer`, `tail` or `headTail` | Executor still owns spill files, exit status, signal, timeout, and background jobs. |
| `web_fetch` | `TextRetainer`, `head` or `headTail` | Provider/resource caps stay provider facts; the retainer supplies only retained text and omission metadata. |
| `web_search` | `ItemRetainer<WebSearchSource>`, `head` | Standardizes the "sources capped" notice when providers return more sources than the model-facing result should include. |

`read` remains outside this generic library. Its `read-render` helper owns a file-specific pagination contract — `offset`/`limit`, line numbers, `totalLines`, offset-out-of-range errors, per-line preview truncation, and a byte cap over the selected window — which is a line-window renderer. A single `Omitted` count cannot represent both sides of that window.

<a id="pkg-taskweaver-dsh-output-retention--usage-shape"></a>
#### Usage shape

```ts ignore-check
// glob: keep the first page inline while still collecting the full list for spill.
const retainer = new ItemRetainer<FsGlobEntry>({ kind: 'head', maxItems: globMaxResults })
const allEntries: FsGlobEntry[] = []
for await (const entry of candidates) {
  allEntries.push(entry)
  retainer.push(entry)
}
const { items, truncated, omitted } = retainer.finish()

// bash: keep a head + tail, read to process exit.
const out = new TextRetainer({ kind: 'headTail', headBytes: headCap, tailBytes: tailCap })
child.stdout.on('data', (chunk: Buffer) => { out.push(chunk) })
const { text, omittedBytes } = out.finish()

// A footer: the library standardizes the omission clause; the tool owns recovery words.
const footer = formatRetentionNotice(
  { scope: 'grep', strategy: 'head', unit: 'items', limit: grepMaxMatches, kept: items.length, omitted },
  ({ kept }) => `Results capped at ${kept}. Narrow the pattern, path, or include to see more.`,
)
```

<a id="pkg-taskweaver-dsh-output-retention--model-experience"></a>
#### Model Experience

Indirectly, through tool consumers that render retained content and omission metadata.

<a id="pkg-taskweaver-dsh-output-retention--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-output-retention--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Item retention supports `head` only** — tail, head/tail, pagination, grouping, and provider-completeness semantics remain tool-owned.
- **Text retention is byte-oriented** — line and character windows such as `read` pagination require a separate renderer, and a cut may discard partial UTF-8 boundary bytes to keep returned text valid.

<a id="pkg-taskweaver-dsh-timeout"></a>
### `@taskweaver/dsh-timeout`

<!-- migrated-from: packages/runtime/util/timeout/README.md -->
目录：`util/timeout`。
package.json 描述：Zero-dependency timeout/deadline primitive: clampTimeout, deadline, timeoutOf, TimeoutReason (timing + classification only, no termination)

<a id="pkg-taskweaver-dsh-timeout--dsh-timeout"></a>
The **timing-and-classification** half of a timeout — a zero-dependency library of pure functions (no runtime harness deps) shared by every capability that clamps a caller's timeout hint, arms a deadline, and later has to tell "timed out" apart from "cancelled".

It owns **no termination**. The signal it hands out only *notifies*; actually stopping the work stays in each capability, because that mechanism differs — bash SIGKILLs an OS process group, web tears down a `fetch` socket — and no shared layer can own all of them. This is the boundary the [Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md`） draws: share the timing/classification, keep the hard kill local.

It is a **library, not a service or plugin**: no `ctx`, registers nothing, holds no state, emits no events. A "timeout service" would have to understand how to stop every capability's work — exactly the knowledge a microkernel keeps out of shared layers.

<a id="pkg-taskweaver-dsh-timeout--api"></a>
#### API

```ts
import { clampTimeout, deadline, idleWatchdog, MAX_TIMER_DELAY_MS, timeoutOf, TimeoutReason } from '@taskweaver/dsh-timeout'
```

| Export | Role |
|---|---|
| `clampTimeout(requested, def, max, name?)` | Validate the caller's optional positive-finite hint, fill from `def`, cap at `max`. Throws (with `name`) on a non-positive/non-finite hint. |
| `deadline(upstream, timeoutMs, code)` | Fuse `upstream` cancellation with a timeout into one `AbortSignal` (`AbortSignal.any`); the timeout carries a `TimeoutReason`. `[Symbol.dispose]` clears the timer. |
| `idleWatchdog(upstream, timeoutMs, code)` | Keep one stable fused signal and arm only while its guarded async-iterator `next()` is outstanding. Resolution disarms; later demand or `pulse()` activity rearms; disposal clears; concurrent demand rejects. |
| `MAX_TIMER_DELAY_MS` | Largest delay Node schedules without clamping it to one millisecond (`2_147_483_647`). Timer-owning config must not exceed it. |
| `timeoutOf(signal \| { reason }, code?)` | Recover the `TimeoutReason` from an aborted signal/error, else `undefined` — the timeout-vs-cancel classifier. Pass `code` to match only THIS deadline's timer (see nesting below). |
| `TimeoutReason` | The internal reason (`code` + `timeoutMs`) stamped on a timeout abort. Not a public error — providers translate it into their own error/field. |

<a id="pkg-taskweaver-dsh-timeout--the-timeoutms-0-sentinel"></a>
#### The `timeoutMs <= 0` sentinel

`0` is the **internal** "no timeout" value for backend-owned background work (bash `start()`): `deadline()` arms no timer and forwards only `upstream`; with no upstream either, it returns a never-aborting signal plus a no-op disposer, so every caller keeps one call shape. External request hints validate as **positive finite** via `clampTimeout` before they reach `deadline`, so `0` is never a model-/plugin-facing "disable timeout" value.

<a id="pkg-taskweaver-dsh-timeout--usage-shape"></a>
#### Usage shape

```ts
import { deadline, timeoutOf } from '@taskweaver/dsh-timeout'

declare function runWork(options: { signal: AbortSignal }): Promise<unknown>

// Scope-lifetime consumer (foreground bash, one fetch): `using` disposes the timer.
export async function runWithDeadline(upstream: AbortSignal | undefined, timeoutMs: number): Promise<unknown> {
  using d = deadline(upstream, timeoutMs, 'BASH_TIMEOUT')
  const outcome = await runWork({ signal: d.signal })               // work listens on d.signal and terminates itself
  const timedOut = timeoutOf(d.signal, 'BASH_TIMEOUT') !== undefined // classify the first abort, scoped to OUR code
  const aborted = d.signal.aborted && !timedOut                     // mutually exclusive: timeout won, or cancel did
  return { outcome, timedOut, aborted }
}
```

The signal only *notifies* — the caller MUST attach its own termination (`d.signal.addEventListener('abort', kill)`, or hand `d.signal` to `fetch`). Racing a promise against a timer would resolve the tool-call while the child process or socket leaks on; handing out a signal forces a real termination path to exist.

Pass your own `code` to `timeoutOf` so classification composes under nesting. When `upstream` is itself a deadline signal, `AbortSignal.any` preserves its `TimeoutReason` if that timer fires first. Scoping to your code makes a foreign timeout read as an ordinary upstream cancel instead of claiming that the local timer expired.

For a streamed transport, create one `idleWatchdog`, pass its stable `signal` into the transport, and call `watchdog.next(iterator)` for each provider read. Call `watchdog.pulse()` when transport activity does not yield an iterator value. The interval must be positive, finite, and no greater than `MAX_TIMER_DELAY_MS`; Node otherwise clamps it to one millisecond. It measures only outstanding demand, so no timer runs while downstream code renders or otherwise waits before asking for the next chunk. The primitive still only notifies, so the transport must observe the stable signal; the DeepSeek and pi-ai adapters prove that timeout closes their real response body or SDK request.

<a id="pkg-taskweaver-dsh-timeout--what-does-not-get-a-timeout"></a>
#### What does NOT get a timeout

Local file `read`/`write`/`edit` take no `timeoutMs`: file IO runs untimed because a deadline would kill work the OS will still finish. See [the filesystem subsystem page]（原文链接目标：`../../../docs/subsystems/filesystem.md`）.

<a id="pkg-taskweaver-dsh-timeout--model-experience"></a>
#### Model Experience

Indirectly, through consumers such as `dsh-tool-call-timeout-policy`, which may replace a provider result with a retained timeout error or suppress a late result.

<a id="pkg-taskweaver-dsh-timeout--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-timeout--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Notification only** — a deadline cannot stop work that ignores its signal; every capability still needs its own socket/process/task termination path.
- **`timeoutMs <= 0` is internal vocabulary** — it disables the local timer only after an owning backend has resolved policy, never as a public model/plugin knob.
- **The first abort reason wins classification** — when an upstream cancellation beats the local timer, this layer cannot later report that its own timeout would also have elapsed.
- **An idle watchdog is not a total deadline** — it rearms per outstanding iterator demand and deliberately excludes consumer think time.

<a id="family-util"></a>
### 原族级说明（迁移保留）

<a id="family-util--util-low-level-shared-utilities"></a>
These zero-dependency packages provide small primitives shared by multiple capability families. Business semantics remain with each consuming capability.

| Package | Role |
|---|---|
| [`brand/`](./README.zh.md#pkg-taskweaver-dsh-brand) | Provides nominally branded types |
| [`paths/`](./README.zh.md#pkg-taskweaver-dsh-home-paths) | Resolves the Harness data root and shared paths |
| [`timeout/`](./README.zh.md#pkg-taskweaver-dsh-timeout) | Provides deadline and timeout classification primitives |
| [`retention/`](./README.zh.md#pkg-taskweaver-dsh-output-retention) | Bounds retained text and item collections |
| [`atomic-write/`](./README.zh.md#pkg-taskweaver-dsh-atomic-write) | Replaces files atomically |
| [`native-command/`](./README.zh.md#pkg-taskweaver-dsh-native-command) | Runs host-native commands without a shell |
