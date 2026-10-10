# code-runtime 包族

<a id="family-code-runtime"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义模型生成代码的执行边界，并组合工作线程与语言后端。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-code-runtime`](#pkg-taskweaver-dsh-code-runtime) | `code-runtime/code-runtime` | [接口与限制](#pkg-taskweaver-dsh-code-runtime) |
| [`@taskweaver/dsh-code-runtime-python`](#pkg-taskweaver-dsh-code-runtime-python) | `code-runtime/code-runtime-python` | [接口与限制](#pkg-taskweaver-dsh-code-runtime-python) |
| [`@taskweaver/dsh-code-runtime-worker-thread`](#pkg-taskweaver-dsh-code-runtime-worker-thread) | `code-runtime/code-runtime-worker-thread` | [接口与限制](#pkg-taskweaver-dsh-code-runtime-worker-thread) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-code-runtime"></a>
### `@taskweaver/dsh-code-runtime`

<!-- migrated-from: packages/runtime/code-runtime/code-runtime/README.md -->
目录：`code-runtime/code-runtime`。
package.json 描述：Abstract code-execution seam (ctx.codeRuntime) for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-code-runtime--taskweaver-dsh-code-runtime"></a>
The **`CodeRuntime`** (`ctx.codeRuntime`) defines WHAT a code runtime does — run one model-written program against a set of host-provided async bindings and report `{ value, logs, error? }` — without saying HOW.

This package owns the Service Definition role of the capability (the bash trio is the template — see [capability seams]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md`）): providers subclass `CodeRuntime` and register the service; the Consumer is the tool registry's Code Mode, which generates the model-facing SDK and bridges tool dispatch — both specified in the [Code Mode Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-06-15-code-mode.md`）, whose first provider is a Node worker-thread backend. The runtime knows nothing about tools or sessions: it is handed named async functions and a program string, and everything tool-shaped stays with the Consumer.

<a id="pkg-taskweaver-dsh-code-runtime--service-api-ctx-coderuntime"></a>
#### Service API (`ctx.codeRuntime`)

| Member | Semantics |
|---|---|
| `run(request)` | Execute one program against the request's bindings. **Resolves with an error FIELD for every program outcome** — parse/transform failure, thrown exception, invalid completion, output overflow, budget expiry, abort, or substrate death (`CodeRunFailure`'s orthogonal `kind` taxonomy); it rejects only for caller misuse of the Service Definition contract (e.g. a run submitted after disposal). The program runs as the body of an async function: top-level `await`/`return` work, and a lossless JSON completion becomes `result.value`. |
| `language` | Readonly descriptor: the source language `run` expects. `'typescript'` and `'python'` are the well-known values — those `dsh-tools` presents; only `'typescript'` has a published backend. Informational, not gating — a consumer that generates language-specific presentation switches on it and fails loud on a language it cannot present. |
| `isolation` | Readonly descriptor: the execution substrate (`'worker-thread'`, `'process'`, `'container'`). A label for deployments and diagnostics, **not a security claim**. |

Semantics every implementation must honor (contract details in the class JSDoc): binding calls bridge complete lossless-JSON arguments and resolutions with no seam-level byte cap; the program is treated as a hostile peer (arbitrary binding names are own properties, malformed traffic never crashes the host); no state survives between runs; disposal terminates in-flight runs AND awaits their exit before completing.

<a id="pkg-taskweaver-dsh-code-runtime--vocabulary"></a>
#### Vocabulary

`CodeRunRequest` (`program`, `bindings`, `signal?`) carries everything the runtime acts on — defaulting (time budgets and outer-output cap) is the provider's validated config, never a hidden `??` inside `run()`. `bindings` is a list of `CodeBindingNamespace`s (`global` + `functions` + optional `errorClass`), each exposed to the program as one global object of async callables returning `CodeJsonValue`, the service-local structural equivalent of canonical `JsonValue` that keeps this Service Definition package independent of sessions. An `errorClass` descriptor names a real program-global constructor and the own property that receives the rejected member name; runtimes remain independent of Consumer terms such as `ToolCallError`. `CodeRunResult` reports the lossless JSON completion `value?`, ordered `logs: string[]`, and the `error?` (`CodeRunFailure`: `kind` + model-feedable `message`). See `src/types.ts` for the full contracts.

Binding-global and error-class names are **language-portable**: they must match the identifier subset `[A-Za-z_][A-Za-z0-9_]*` (no JS-only `$`) and clear the seam-exported exclusion sets, so one `bindings` list is valid against every backend regardless of its `language`. The package exports the contract every backend enforces — `PORTABLE_RESERVED_WORDS` (ECMAScript ∪ Python reserved words), `RESERVED_BINDING_GLOBALS` (backend-owned globals such as `console`), `RESERVED_ERROR_MEMBERS` and `DUNDER_MEMBER` (error-member exclusions) — so a name like `$tools`, `lambda`, or `__dsh_main__` makes `run()` reject as seam misuse on any backend, not just some. See `src/index.ts` for the exact sets and rationale.

<a id="pkg-taskweaver-dsh-code-runtime--model-experience"></a>
#### Model Experience

Indirectly, through Code Mode in `dsh-tools`, which exposes `run_code` and returns program logs, values, or failures as retained tool-result tokens.

<a id="pkg-taskweaver-dsh-code-runtime--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-code-runtime--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **`run()` is one-shot** — `logs` arrive only on the resolved `CodeRunResult`; the seam exposes no streaming-log or progress API for a live program's output.
- **A persistent REPL-style kernel is recorded future work** — the no-state-between-runs contract stands until a persistent-kernel backend brings its own logging story ([Code Mode Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-06-15-code-mode.md`）).
- **Only the worker-thread backend ships** — `'process'`/`'container'` are declared well-known `isolation` values with no implementation; a hard security boundary awaits a container backend.
- **Intermediate binding values have no byte cap** — implementations remain subject to structured-clone cost and process memory, while a provider or executor may already have imposed its own acquisition bound.

<a id="pkg-taskweaver-dsh-code-runtime-python"></a>
### `@taskweaver/dsh-code-runtime-python`

<!-- migrated-from: packages/runtime/code-runtime/code-runtime-python/README.md -->
目录：`code-runtime/code-runtime-python`。
package.json 描述：CPython subprocess implementation of the DeepSeek Harness code-execution seam

<a id="pkg-taskweaver-dsh-code-runtime-python--taskweaver-dsh-code-runtime-python"></a>
CPython-subprocess implementation of the [`@taskweaver/dsh-code-runtime`](./README.zh.md#pkg-taskweaver-dsh-code-runtime) seam. Companion to [`@taskweaver/dsh-code-runtime-worker-thread`](./README.zh.md#pkg-taskweaver-dsh-code-runtime-worker-thread); trades the Node worker thread for a fresh `python3` subprocess so model code is Python instead of TypeScript.

The package owns the wire protocol for that seam: the host-side frame codec and the Python-side mirror of the same message vocabulary.

<a id="pkg-taskweaver-dsh-code-runtime-python--wire-protocol"></a>
#### Wire protocol

The host and the CPython subprocess exchange a versionless, JSON-lines protocol on the child's fd 3 — one JSON object per line, leaving stdout/stderr free for the program's own output. `src/protocol.ts` is the host side; `py/protocol.py` mirrors its message shapes and the shared truncation-marker text on the Python side.

- **fd 3, not stdout** — Node pins the channel positionally with `stdio: ['pipe','pipe','pipe','pipe']`; the Python bootstrap reads the same `PROTOCOL_FD` constant. JSON-lines framing.
- **Host treats every inbound frame as hostile** — model code has full access to fd 3 and can post anything through it, so `validateChildFrame` shape-validates and REBUILDS each frame before the host reads it: forged extra fields never ride along, a non-number call id can never be echoed into a reply, and junk drops to `undefined` rather than throwing in the host's message handler. The Python side trusts host replies (the host is not model-controlled).
- **Lossless-JSON crossing** — completion values and binding arguments cross as exact JSON. `encodeJsonPlain` serializes a `JSON.parse`-produced value without recursion, so a deep value below the byte budget crosses intact instead of dying on `JSON.stringify`'s stack limit; `checkDoneValue` meters a forged completion value's byte length AND number losslessness in one traversal that rejects an over-budget payload before the incremental work it would add (the enqueued children; strings and keys are metered by a non-allocating escaped-size scan, so the escaped copy is never materialized) — the frame's own width is already parsed and capped upstream by the host's fd-3 receive buffer, not re-bounded here; `hasUnsafeIntegerToken` reads the raw frame text to catch an integer token that `JSON.parse` would silently round; `hasNonLosslessNumber` rejects a non-finite or negative-zero number in unbounded `call.args`. Beyond-safe-range integral doubles serialize through `BigInt` digits so the exact integer crosses, not the rounded `String()` form.
- **Shared truncation marker** — `logTruncationMarker(maxBytes)` produces byte-identical text on both sides, so a truncated log run reads the same however the cap was hit. The `log` frame's `truncated` flag distinguishes the child ledger's own marker from program output.

<a id="pkg-taskweaver-dsh-code-runtime-python--python-process-runner"></a>
#### Python process runner

`py/runner.py` is the child-process entrypoint. The host sends a `boot` frame, waits for `boot-ack`, then sends the Python program in a `run` frame. The runner executes the body inside an async function, so top-level `await` and `return` work like the TypeScript code runtime. Declared namespace calls are sent over fd 3 and resume when the host returns the matching `reply` frame.

The runner merges Python-level `stdout` and `stderr` writes into ordered `log` frames. `maxLogBytes` caps their combined UTF-8 text, and overflow emits one truncation marker before returning an `output-limit` failure. Completion values must be lossless JSON and fit `maxValueBytes`. CPU time is limited with `RLIMIT_CPU`; `RLIMIT_AS` is applied on Linux only. macOS skips the address-space limit; the host must enforce the wall deadline and abort by terminating the child process. Raw writes directly to file descriptors 1 or 2 bypass Python's stream redirect, so the host must keep draining both pipes under its own output cap.

`PythonCodeRuntime` is the Host provider. It discovers a usable CPython 3.9+ `python3` on the user's PATH on first use, rejects the inactive macOS Command Line Tools placeholder, and returns install guidance when discovery fails. It starts a fresh process per run, applies the current agent's resolved sandbox policy with `ctx.sandbox.confine()`, sends boot/run/reply frames over fd 3, caps inbound frames and output, and kills the process group on wall timeout, abort, completion, or Host teardown. The child gets a minimal environment with no Host credentials. `danger-full-access` follows the shared sandbox policy contract and bypasses the confinement wrapper.

The package-level runner tests use only the Python standard library:

```sh
python3 -B -m unittest discover -s tests -p 'runner_test.py' -v
```

For local protocol smoke checks the runner can be started as `python3 -I -B py/runner.py`, provided the host supplies a duplex pipe at fd 3 and sends the boot/run frames in order.

<a id="pkg-taskweaver-dsh-code-runtime-python--model-experience"></a>
#### Model Experience

Indirectly, through Code Mode in [`dsh-tools`](../core/README.zh.md#pkg-taskweaver-dsh-tools), which renders this backend's exact completion value when it fits (or an explicit `invalid-output` / `output-limit` failure), plus the exact `[dsh-code-runtime-python] log capture truncated at <maxLogBytes> bytes` log marker, into a retained `run_code` result.

<a id="pkg-taskweaver-dsh-code-runtime-python--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-code-runtime-python--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **The cross-language guard covers the runtime-executed surfaces and the frame field shapes** — `tests/protocol-mirror.e2e.ts` spawns a real `python3` and asserts, against `src/protocol.ts`, both `PROTOCOL_FD` / the log truncation marker text AND each `TypedDict`'s required/optional wire field set in `py/protocol.py`. What it does not compare is the field *types* (e.g. that `cpuSeconds` is an `int` on both sides): comparing type declarations across TypeScript and Python has no mechanical equivalent here, so a type-level drift is still caught by review plus the backend's real-subprocess suite rather than this package's tests.
- **The TaskWeaver Host chooses one Code Mode language per process** — `TASKWEAVER_CODE_LANGUAGE=python` selects Python; unset or `typescript` retains the WorkerThread provider. Per-preset runtime shadowing is not used because the shared `dsh-tools` registry reads one Host `ctx.codeRuntime` service.
- **UI-specific Python result cards remain deferred** — `run_code` currently renders the provider's bounded logs and JSON completion using the shared Code Mode result surface. Python image-bearing content is not yet a dedicated card, and real Seatbelt/bundle acceptance still needs a macOS Host run.

<a id="pkg-taskweaver-dsh-code-runtime-worker-thread"></a>
### `@taskweaver/dsh-code-runtime-worker-thread`

<!-- migrated-from: packages/runtime/code-runtime/code-runtime-worker-thread/README.md -->
目录：`code-runtime/code-runtime-worker-thread`。
package.json 描述：Worker-thread implementation of the DeepSeek Harness code-execution seam

<a id="pkg-taskweaver-dsh-code-runtime-worker-thread--taskweaver-dsh-code-runtime-worker-thread"></a>
Worker-thread implementation of the [`@taskweaver/dsh-code-runtime`](./README.zh.md#pkg-taskweaver-dsh-code-runtime) seam: `WorkerThreadCodeRuntime` runs each program in ONE fresh Node `worker_threads.Worker` — TypeScript in, type-stripped host-side, bindings bridged over the message port, `{ value, logs, error? }` out. **Containment, not a security boundary**: trust posture is bash-equivalent by design (the [Code Mode Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-06-15-code-mode.md`） § Trust posture), with containment bash does not have — separate isolate, empty environment, heap cap, hard termination.

<a id="pkg-taskweaver-dsh-code-runtime-worker-thread--config"></a>
#### Config

```yaml
- id: code-runtime
  name: '@taskweaver/dsh-code-runtime-worker-thread'
  config:
    computeMs: 60000              # busy-time budget (measured event-loop active time)
    maxWallMs: 600000             # wall-clock ceiling; never pauses for anything
    maxOutputBytes: 67108864      # combined serialized outer-output cap (64 MiB)
    maxOldGenerationSizeMb: 512   # worker heap cap (resourceLimits)
```

Every field is validated and defaulted; `maxOutputBytes` is a safe integer of at least four bytes, the remaining fields are positive finite numbers, `maxWallMs` is additionally at most `2147483647` (Node's maximum `setTimeout` delay), and there are no other tunables.

<a id="pkg-taskweaver-dsh-code-runtime-worker-thread--design"></a>
#### Design

- **One fresh worker per run, no pooling** — a program's world dies with its worker: no cross-run state to log, state bleed unrepresentable, runs reconstructable from the session log alone.
- **Type-strip host-side, in execution context** — the program is wrapped in an async-function shell, stripped with `node:module`'s `stripTypeScriptTypes` (erasable syntax only — `enum`/namespaces are rejected as a program `exception` and no worker spawns), and sliced back out byte-positioned; it then executes as the body of an `AsyncFunction`, so top-level `await`/`return` work.
- **The port assumes a hostile peer** — model code can reach `parentPort` and forge traffic, so every inbound message is shape-validated and REBUILT before anything reads it (`null`, primitives, junk types, and malformed payloads drop without a throw; forged extra fields never ride along), the host answers each call id at most once, resolves binding names as OWN properties only (a forged `constructor` cannot walk a prototype chain), drops post-settlement replies, and validates every binding resolution and completion as lossless JSON. Forged `log`/`done` messages cannot bypass the outer cap: the host repeats validation and accounts every admitted log plus the completion or diagnostic. Worker-side namespaces are null-prototype with `defineProperty`, so `__proto__`-shaped binding names are ordinary keys.
- **Binding rejection classes are request data** — an optional namespace descriptor names the constructor global and the own property that receives the failed member name. The worker materializes and injects that real class, so `instanceof` works without hardcoding `tools` or `ToolCallError`; declarations with invalid or colliding globals fail before a worker spawns. Failures use module-captured error and property-definition intrinsics plus null-prototype descriptors, so later model mutations cannot turn a rejected binding into a worker crash.
- **Two independent budgets, because the peer is hostile** — `computeMs` meters the worker's MEASURED busy time (`worker.performance.eventLoopUtilization()` polling): a hot loop cannot hide behind a pending decoy dispatch, and a program awaiting a slow tool accrues nothing. `maxWallMs` backstops what busy time cannot see (awaiting a promise nobody resolves). Both funnel into `worker.terminate()`, which ends hot synchronous loops too; heap overflow surfaces as the worker's OOM exit (`kind: 'worker-exit'`). `maxWallMs` is range-checked at load against `MAX_TIMER_DELAY_MS`: `setTimeout` clamps a longer delay to 1 ms, so a positivity check alone would accept a ceiling that expires on the first tick. `computeMs` needs no such bound, being compared against measured utilization rather than fed to a timer.
- **Intermediate binding values are complete JSON** — binding arguments and resolutions undergo iterative lossless-JSON validation. Before program execution, the worker captures its own realm's plain-container prototype identities plus the native function-source check used only for foreign realms, so constructor-slot mutation and user-authored impostors cannot change container classification. It also captures every structural and metering intrinsic used by this JSON boundary, creates property descriptors without a prototype, and bypasses mutable collection prototypes for private traversal state; model mutations of globals, prototype methods, or descriptor-shaped `Object.prototype` fields therefore cannot alter validation, wire transport, or byte accounting. Values flatten into a bounded-depth pre-order wire value for structured clone and rebuild iteratively on the other side. They have no byte, JavaScript call-stack, or nested structured-clone depth cap. They never enter the outer-output ledger or model context; provider/executor acquisition bounds and process/worker memory remain the limits.
- **Logs stream eagerly into one outer ledger** — console/stdout/stderr text crosses the port in emission order, so a timed-out or killed program still shows what it printed. The worker charges exact JSON-string bytes and preflights completion values and exception diagnostics against the remaining combined budget before posting them; a thrown million-byte stack therefore becomes the fixed `output-limit` diagnostic at the worker boundary. Native writes that bypass the patched stream slots arrive on pipes independent of the completion port, so the host repeats the ledger for those bytes and hostile forged traffic; settlement continues bounded pipe capture until worker termination completes before materializing the result. `maxOutputBytes` accounts the JSON serialization of the outer `logs` array plus the completion value or failure-message payload; fixed `CodeRunResult` field names, braces, the bounded error-kind tag, and later presentation whitespace are outside that variable-payload ledger. At or below the cap the exact value returns; a lossy completion is `invalid-output`, and a combined overflow is `output-limit` rather than a substituted inspected string. The failure retains the fitting captured prefix and later follows the normal outer `run_code` spill policy.
- **Empty environment** — the worker gets `env: {}` and `execArgv: []`: no ambient credentials (stronger than the scrubbed-env rule for spawned commands) and no inherited loader flags.
- **Dispose to quiescence** — teardown fails in-flight runs as `abort` and AWAITS each worker's exit before resolving.

<a id="pkg-taskweaver-dsh-code-runtime-worker-thread--the-worker-entry-unbuilt-and-built"></a>
#### The worker entry, unbuilt and built

Source mode loads erasable-only `src/worker.ts` through Node's native type stripping. Its transitive runtime closure contains only Node built-ins and relative source modules, so a fresh checkout never requires a sibling workspace package's unbuilt `lib/` export. The worker-local and session-owned JSON boundaries both flatten and rebuild validated values around the message port so application nesting never reaches structured clone. Built mode passes the sibling `lib/worker.cjs` as a filesystem path because pkg's VFS Worker hook expects CommonJS; the same path works under ordinary Node. The repository-wide requirement to exercise this published entry path belongs to the [testing policy]（原文链接目标：`../../../docs/testing.md`）.

The SDK API is the default/named `WorkerThreadCodeRuntime` class plus `Config`. The operational `./worker` subpath exists only as the packaged spawn entry; the wire protocol and bootstrap helpers are source-private implementation details.

<a id="pkg-taskweaver-dsh-code-runtime-worker-thread--model-experience"></a>
#### Model Experience

Indirectly, through Code Mode in [`dsh-tools`](../core/README.zh.md#pkg-taskweaver-dsh-tools), which renders the exact outer value when it fits or an explicit `invalid-output` / `output-limit` failure. Only the outer `run_code` result enters model context and its ordinary spill policy; binding traffic and intermediate values remain execution-local.

<a id="pkg-taskweaver-dsh-code-runtime-worker-thread--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-code-runtime-worker-thread--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **OS processes a program spawns survive termination** — `worker.terminate()` ends the thread only, weaker than bash-local's process-group kill; orphan cleanup is a deployment concern until a container backend exists.
- **Type-strip rides Node's experimental `stripTypeScriptTypes` API** — amaro or sucrase are the named drop-in replacements if the relied-on behavior shifts.
- **`computeMs` expiry can overshoot by up to one poll interval** — busy time is sampled every 25 ms (an internal constant, deliberately not config).
- **Programs get a five-method `console` shim** (`log`/`info`/`warn`/`error`/`debug`) — deliberately not Node's full console API.
- **Intermediate binding values have no byte cap** — a program can exhaust process or worker memory with a value that never becomes outer output.
- **The 64 MiB default is a rejection boundary, not recoverable storage** — outer spill can save only the bounded logs and diagnostic returned after `output-limit`; bytes rejected beyond the runtime cap never reach the spill layer.

<a id="family-code-runtime"></a>
### 原族级说明（迁移保留）

<a id="family-code-runtime--code-runtime-code-execution-capability-family"></a>
The code-execution capability seam (see [capability seams]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md`）): a runtime Service Definition for executing one model-written program against host-provided async bindings, capturing what it printed and returned; replaceable providers; and the tool registry's [Code Mode](../core/README.zh.md#pkg-taskweaver-dsh-tools) Consumer (`tools: { mode: code }` — the `run_code` tool and the SDK generated in the loaded runtime's `language`). Design is in the [Code Mode Agent Note]（原文链接目标：`../../.agents/notes/implemented/feature/2026-06-15-code-mode.md`）. **Product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`code-runtime/`](./README.zh.md#pkg-taskweaver-dsh-code-runtime) | Service Definition and shared vocabulary | `ctx.codeRuntime` |
| [`code-runtime-worker/`](./README.zh.md#pkg-taskweaver-dsh-code-runtime-worker-thread) | Worker-thread backend | registers `ctx.codeRuntime` |

Providers register the service without changing its Consumer. The child READMEs own language, isolation, and execution-budget details.

The subsystem reference — run requests/results, binding namespaces, the failure taxonomy — is [docs/subsystems/code-runtime.md]（原文链接目标：`../../docs/subsystems/code-runtime.md`）.
