# workflow 包族

<a id="family-workflow"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

运行模型编写的工作流，并提供通用及固定策略的工作流工具。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-tool-ralph`](#pkg-taskweaver-dsh-tool-ralph) | `workflow/tool-ralph` | [接口与限制](#pkg-taskweaver-dsh-tool-ralph) |
| [`@taskweaver/dsh-tool-workflow`](#pkg-taskweaver-dsh-tool-workflow) | `workflow/tool-workflow` | [接口与限制](#pkg-taskweaver-dsh-tool-workflow) |
| [`@taskweaver/dsh-workflow`](#pkg-taskweaver-dsh-workflow) | `workflow/workflow` | [接口与限制](#pkg-taskweaver-dsh-workflow) |
| [`@taskweaver/dsh-workflow-worker-thread`](#pkg-taskweaver-dsh-workflow-worker-thread) | `workflow/workflow-worker-thread` | [接口与限制](#pkg-taskweaver-dsh-workflow-worker-thread) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-tool-ralph"></a>
### `@taskweaver/dsh-tool-ralph`

<!-- migrated-from: packages/runtime/workflow/tool-ralph/README.md -->
目录：`workflow/tool-ralph`。
package.json 描述：Model-facing fresh-agent Ralph loop over the workflow and subagent seams

<a id="pkg-taskweaver-dsh-tool-ralph--taskweaver-dsh-tool-ralph"></a>
The model-facing `ralph` tool runs a fixed foreground workflow that gives one immutable objective to a sequence of fresh child agents. It demonstrates a specialized orchestration policy as an ordinary plugin over [`ctx.workflowEngine`](./README.zh.md#pkg-taskweaver-dsh-workflow) and [`ctx.subagents`](../subagent/README.zh.md#pkg-taskweaver-dsh-subagent): no Ralph mode or fresh-agent loop is added to `agent-loop`, and the same-session [goal domain](../goal/README.zh.md#pkg-taskweaver-dsh-goal) remains independent. The [Ralph Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-19-fresh-agent-ralph-workflow-tool.md`） owns the policy and deferred work.

<a id="pkg-taskweaver-dsh-tool-ralph--contract"></a>
#### Contract

`ralph({ objective, maxRounds? })` waits for the entire run. The deployment config's `maxRounds` is both the default and a ceiling on a call override. Every Ralph round starts one child through `subagentProvider`; that provider must exist, support structured output, and report `inheritsParentContext: false`. The configured provider is carried as `WorkflowStartRequest.subagentProvider`, so the fixed script cannot inspect or change routing and the ordinary model-written `workflow` tool gains no provider selector. The resolved round cap is also carried as `WorkflowStartRequest.maxTotalAgents`, coordinating the fixed loop with the engine's total-child backstop; the engine rejects a Ralph cap above its deployment ceiling before publishing a run.

Each child receives only the immutable objective, its current Ralph round and cap, a shared-workspace-as-authority instruction, and the previous structured handoff. The workspace is long-term memory; parent conversation and prior child sessions are not seeded. Reports have `status: continue | complete | blocked`, a non-empty summary, evidence, next steps, and blocker text. Status-specific semantics and the serialized `maxHandoffChars` ceiling are validated inside the fixed workflow and again at the consumer boundary. Invalid, missing, or oversized reports fail the workflow instead of being truncated or mistaken for cap exhaustion.

The successful terminal tool result is `complete`, `blocked`, or `budget-limited`, with the last bounded report and number of rounds started. The canonical envelope is `{ runId, agentsStarted, result }`; completion and blocker labels in its Native renderer explicitly say that a worker reported the outcome, not independent certification. `maxResultChars` bounds only that rendered text including its truncation marker, without altering the validated report in the canonical value or the cross-round handoff.

An ordinary child failure produces an error naming the failed round and retaining the last successful handoff when one exists. Ralph does not retry that round. Fatal provider-start, transport, worker, or workflow failures remain workflow errors and may settle before the fixed script can return a handoff. Cancellation is also an error; partial output is never success.

<a id="pkg-taskweaver-dsh-tool-ralph--lifecycle-and-cancellation"></a>
#### Lifecycle and cancellation

The caller's agent is the parent of every fresh child, preserving cwd and lineage without copying its conversation. `exec.signal` enters the workflow engine and is also bridged to `run.cancel()` for implementation independence. The tool awaits `run.result` and calls `run.dispose()` in `finally`, so a cancelled parent step waits for the engine's bounded termination and child quiescence before returning.

<a id="pkg-taskweaver-dsh-tool-ralph--render-intent"></a>
#### Render intent

The pending call is a `generic` card titled `ralph`; the immutable objective is its `rawInput`. The result keeps the generic card. Both presentation functions depend only on tool arguments and the settled tool envelope.

<a id="pkg-taskweaver-dsh-tool-ralph--config"></a>
#### Config

| Key | Default | Meaning |
|---|---|---|
| `subagentProvider` | `spawn` | Fresh structured-output provider used for every round. |
| `maxRounds` | `256` | Default and deployment ceiling for one Ralph run. |
| `maxHandoffChars` | `16384` | Maximum serialized characters in one round report. |
| `maxResultChars` | `16384` | Maximum characters in the complete successful parent result. |

All config values are normalized and validated when the plugin applies, including direct application outside Loader schema normalization. Provider capabilities are resolved immediately before each call because provider registration can change under plugin lifecycle and HMR.

<a id="pkg-taskweaver-dsh-tool-ralph--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-ralph--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-tool-ralph--what-the-model-sees"></a>
###### What the model sees

Every parent request in this plugin's registration scope receives the fixed routing guidance below.

<a id="pkg-taskweaver-dsh-tool-ralph--ralph-guidance"></a>
###### Ralph guidance

```markdown
Use the ralph tool ONLY when the direct human explicitly asks for a Ralph loop or fresh-agent iterative execution. Each Ralph round starts a fresh child with no conversation seed and uses the shared workspace as durable memory. Completion and blockers are worker reports, not independent evaluation. Use same-session goal tools for ordinary long-running objectives, and plain subagents or workflowEngine for bounded delegation and fan-out.
```

<a id="pkg-taskweaver-dsh-tool-ralph--token-effect"></a>
###### Token effect

Small fixed guidance cost per request while the plugin is active.

<a id="pkg-taskweaver-dsh-tool-ralph--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the plugin scope and guidance text are unchanged. Activation or disposal may invalidate reuse from this prompt section.

<a id="pkg-taskweaver-dsh-tool-ralph--tool-schema"></a>
##### Tool schema

<a id="pkg-taskweaver-dsh-tool-ralph--what-the-model-sees-1"></a>
###### What the model sees

The generated [`ralph` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-ralph`） exposes one required `objective` string and one optional `maxRounds` number. Provider choice, handoff size, report schema, workflow script, and orchestration behavior are deployment-owned and absent from the call schema.

<a id="pkg-taskweaver-dsh-tool-ralph--token-effect-1"></a>
###### Token effect

Small fixed schema cost on each request where the tool is visible.

<a id="pkg-taskweaver-dsh-tool-ralph--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while the definition and visibility are unchanged.

<a id="pkg-taskweaver-dsh-tool-ralph--child-requests-and-parent-result"></a>
##### Child requests and parent result

<a id="pkg-taskweaver-dsh-tool-ralph--what-the-model-sees-2"></a>
###### What the model sees

Each child sees the standalone fixed round prompt plus the structured-output capture contract. The parent sees only the original call and one terminal result containing a worker-reported status, round count, and pretty-printed final report; intermediate child messages and reports do not enter the parent conversation. A failed ordinary child instead yields an error with its round number and, after round one, the last successful handoff.

<a id="pkg-taskweaver-dsh-tool-ralph--token-effect-2"></a>
###### Token effect

Every round pays for a fresh child context. `maxHandoffChars` bounds cross-round state and `maxResultChars` independently bounds the complete successful parent text; child work remains outside the parent context.

<a id="pkg-taskweaver-dsh-tool-ralph--kv-cache-effect-2"></a>
###### KV Cache effect

Each fresh child has an independent request cache. The parent result appends after the reusable request prefix.

<a id="pkg-taskweaver-dsh-tool-ralph--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Completion is worker self-declaration** — there is no independent evaluator or verifier deciding whether the objective is actually complete; evaluator policy and evaluator-driven continuation are deferred.
- **Foreground only** — there is no job id, background collection, process-resume checkpoint, scheduler, or wall-clock start policy.
- **The workspace is the only cross-round long-term memory** — one bounded report is the explicit handoff, and uncommitted conversational reasoning disappears with each child.
- **One round is one fresh child** — there is no within-round fan-out, model/provider switching, fork context, or model-call-selected provider.
- **Ordinary child failure is terminal for the run** — the fixed script reports the failed round and last successful handoff but does not retry; fatal workflow infrastructure failures can end before that state is returned.
- **Only round count bounds aggregate effort** — token, price, and elapsed-time budgets are deferred.

<a id="pkg-taskweaver-dsh-tool-workflow"></a>
### `@taskweaver/dsh-tool-workflow`

<!-- migrated-from: packages/runtime/workflow/tool-workflow/README.md -->
目录：`workflow/tool-workflow`。
package.json 描述：Model-facing workflow tool: run a JavaScript orchestration script over ctx.workflowEngine

<a id="pkg-taskweaver-dsh-tool-workflow--taskweaver-dsh-tool-workflow"></a>
The model-facing **`workflow` tool**: run a JavaScript orchestration script that fans out subagents, and return the script's final value. This package owns the model-facing schema and run lifecycle over [`ctx.workflowEngine`](./README.zh.md#pkg-taskweaver-dsh-workflow); script parsing, execution, caps, and cancellation live behind the seam, while the consumer retains ownership of the parent-facing schema and result envelope.

<a id="pkg-taskweaver-dsh-tool-workflow--what-the-model-sees"></a>
#### What the model sees

Three parameters: `meta` (required identity data: `name`, `description`, and optional progress annotations), `script` (required plain JavaScript body — no `export const meta` statement; the tool description carries the complete authoring contract), and `args` (optional JSON object exposed to the script as the `args` global; wrap a bare list in a field so the wire schema stays honest). The plugin also contributes a `tool:<toolName>` system-prompt section carrying the usage policy — use the tool only on an explicit user ask for a workflow / large orchestration; prefer plain subagent calls for one or two delegations — per the convention that tool guidance ships with the tool plugin, never in the deployment persona.

<a id="pkg-taskweaver-dsh-tool-workflow--lifecycle"></a>
#### Lifecycle

Collection is synchronous (like [`dsh-tool-subagent`](../subagent/README.zh.md#pkg-taskweaver-dsh-tool-subagent)): `execute` starts a run and awaits `run.result` inside a `try/finally` that always disposes the run, so the script and its children reach quiescence on every path. `exec.signal` is bridged to `run.cancel()` (including the already-aborted-before-start case). A non-`completed` stop reason maps to an `isError` result reporting the reason—never partial output as success; a parse/meta failure thrown synchronously by `start()` becomes an `isError` the model can correct from. Completion returns canonical `{ runId, agentsStarted, result }`; the Native renderer preserves the meta name, agent count, and JSON value, truncating only that projection at `maxResultChars`.

For a root transport execution (`exec.parent` absent), the tool also projects the run into the calling Agent's Session: run-start after `start()` returns, matching member starts and endings filtered by `run.id`, then run-end only after `run.result` is available and `dispose()` has reached quiescence. Nested transport calls execute normally but write no workflow record. The first failed Session append disables later recording for that run, emits one warning, and leaves either no record or a legal continuous prefix without changing the tool result or cleanup.

The browser-safe `@taskweaver/dsh-tool-workflow/types` subpath owns these four log-only event payloads and their `SessionEventMap` declaration. The package invariant rejects duplicate starts, unpaired members, terminal events with open members, and updates after run-end on both cold load and live append while accepting missing terminal suffixes.

<a id="pkg-taskweaver-dsh-tool-workflow--render-intent"></a>
#### Render intent

Decided up front (per the [render-intent Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.md`）): a `generic` card titled `workflow: <meta.name>`, read directly from `args.meta.name` (presentation is a pure function of args and does not ask the engine to parse); the script text rides as `rawInput`. The result keeps the generic card.

<a id="pkg-taskweaver-dsh-tool-workflow--config"></a>
#### Config

| Key | Default | Meaning |
|---|---|---|
| `toolName` | `workflow` | The model-facing tool name to register. |
| `maxResultChars` | `50000` | Rendered-result ceiling; longer JSON is truncated with a notice. |

<a id="pkg-taskweaver-dsh-tool-workflow--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-workflow--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-tool-workflow--what-the-model-sees-1"></a>
###### What the model sees

Every parent request in this plugin's registration scope receives the workflow guidance below. A scoped tool restriction can hide the schema without removing this independently registered guidance.

<a id="pkg-taskweaver-dsh-tool-workflow--workflow-guidance"></a>
###### Workflow guidance

```markdown
Use the <toolName> tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration: you write a JavaScript script (the tool description documents the exact format) that fans work out across many subagents with phases and structured results. For one or two delegations, prefer plain subagent calls.
```

<a id="pkg-taskweaver-dsh-tool-workflow--token-effect"></a>
###### Token effect

Small fixed guidance cost per request while the plugin is active.

<a id="pkg-taskweaver-dsh-tool-workflow--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the plugin scope and guidance text are unchanged. Activation or disposal may invalidate reuse from this prompt section.

<a id="pkg-taskweaver-dsh-tool-workflow--tool-schema"></a>
##### Tool schema

<a id="pkg-taskweaver-dsh-tool-workflow--what-the-model-sees-2"></a>
###### What the model sees

When visible, the generated default [`workflow` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-workflow`） carries the complete JavaScript hook and metadata contract; `toolName` can rename the definition, and the model submits script, metadata, and optional args.

<a id="pkg-taskweaver-dsh-tool-workflow--token-effect-1"></a>
###### Token effect

Substantial fixed schema cost on each request where the tool is visible.

<a id="pkg-taskweaver-dsh-tool-workflow--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while `toolName`, definition, and visibility are unchanged. Renaming, plugin lifecycle, or scoped restrictions may invalidate reuse from this schema.

<a id="pkg-taskweaver-dsh-tool-workflow--tool-call-history-and-result"></a>
##### Tool-call history and result

<a id="pkg-taskweaver-dsh-tool-workflow--what-the-model-sees-3"></a>
###### What the model sees

The full model-written script, metadata, and args remain in the assistant tool call. Success is exactly `workflow "<name>" completed (<count> agent<optional-s>).`, newline, `Return value:`, newline, and pretty-printed data-dependent JSON; a cap adds `… [truncated: <omitted> more characters]` on a new line. Failures are exactly `Error: workflow run was cancelled`, optionally suffixed ` (<error>)`, `Error: workflow run failed: <error-or-unknown error>`, or defensively `Error: workflow run ended abnormally (<reason>)`; a call without an owning agent becomes `Error: workflow tool requires a calling agent (exec.agent was undefined)`. Intermediate child messages are omitted.

<a id="pkg-taskweaver-dsh-tool-workflow--token-effect-2"></a>
###### Token effect

Call tokens can be large and remain until compaction. Result rendering is capped by `maxResultChars`; child-model tokens are separate from the parent's retained context.

<a id="pkg-taskweaver-dsh-tool-workflow--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-workflow--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **The parent turn blocks until the whole workflow settles** — there is no background start/poll API, and cancellation discards partial output as an error.
- **`args` must be an object and Native result text is bounded** — callers wrap top-level arrays/scalars in a field; the canonical workflow result remains complete, while JSON beyond `maxResultChars` is truncated in the model-facing projection rather than stored behind a retrieval handle.
- **Workflow policy is fixed per tool registration** — provider selection, caps, and tool name are deployment config, not model-call arguments.
- **Durable records are top-level and observational** — nested Code Mode dispatches are not recorded, and a recording failure intentionally degrades to an incomplete prefix rather than changing execution.

<a id="pkg-taskweaver-dsh-workflow"></a>
### `@taskweaver/dsh-workflow`

<!-- migrated-from: packages/runtime/workflow/workflow/README.md -->
目录：`workflow/workflow`。
package.json 描述：Workflow capability seam: ctx.workflowEngine service, run vocabulary, and workflow/* events

<a id="pkg-taskweaver-dsh-workflow--taskweaver-dsh-workflow"></a>
The workflow seam (`ctx.workflowEngine`) executes a model-written orchestration script that can fan out subagents. The seam defines the script, run, result, error, and event contracts; an engine decides how to isolate and execute the script.

`@taskweaver/dsh-workflow-worker-thread` is the current engine and `@taskweaver/dsh-tool-workflow` is the model-facing consumer. A future process or sandbox engine can replace the implementation without changing the tool.

The package root is the Host face. The browser-safe `@taskweaver/dsh-workflow/types` subpath contains run identities, metadata, results, and observe-only lifecycle payloads without importing `Agent`, Cordis services, or Host context declarations; Host-only `WorkflowStartRequest` and `WorkflowRun` live behind the package root.

<a id="pkg-taskweaver-dsh-workflow--service-and-run-contract"></a>
#### Service and run contract

`WorkflowEngine.start(request): WorkflowRun` validates enough synchronously to reject a malformed meta block, unparseable script, unavailable provider route, or unsupported per-run limit before a run exists. Once returned, `WorkflowRun.result` never rejects: execution failures resolve with `stopReason: 'error'`, and cancellation resolves with `cancelled` within the engine's bounded grace.

A run is holder-owned. Engine-plugin unload prevents new starts but does not revoke accepted runs. The holder must call `dispose()` on every path; disposal cancels remaining work and reaches or abandons quiescence within the documented bound.

`WorkflowStartRequest` contains `{ meta, script, args?, subagentProvider?, maxTotalAgents?, parent, signal? }`. `parent` attributes every child agent to the invoking agent. `subagentProvider` optionally routes every child in that run without exposing provider choice to the script; omission uses the engine's configured provider. `maxTotalAgents` optionally lowers the engine's deployment ceiling for one run and is likewise invisible to the script. An implementation rejects invalid routes and limits synchronously. `meta` and `args` are plain data, not script fragments.

`WorkflowRun` exposes `{ id, meta, result, cancel(reason?), dispose() }`. `WorkflowResult` contains `{ value, stopReason, error?, agentsStarted }`; `value` is plain JSON data or `null`.

<a id="pkg-taskweaver-dsh-workflow--events"></a>
#### Events

Workflow events are observe-only. They carry `WorkflowRunInfo` (`id` plus `meta`) rather than the live run, so listeners cannot acquire cancellation or disposal authority.

- `workflow/start` / `workflow/end` pair the run.
- `workflow/phase` and `workflow/log` expose script narration.
- `workflow/agent-start` / `workflow/agent-end` pair each child call by `seq`; a child whose async provider start rejects emits neither.

Same-process event payloads are borrowed immutable values. Every listener is independently contained: a synchronous throw or rejected returned promise is logged without starving peers or changing execution.

<a id="pkg-taskweaver-dsh-workflow--failure-discipline"></a>
#### Failure discipline

`WorkflowError` carries a code and a `fatal` flag. Fatal errors always escape `parallel()` and `pipeline()` instead of becoming an ordinary per-item `null`:

- `SCRIPT_PARSE` / `META_INVALID` — the workflow cannot start.
- `INVALID_ARGUMENT` / `UNSUPPORTED_OPTION` / `UNSUPPORTED_SCHEMA` — a hook call violates the engine contract.
- `AGENT_CAP` / `ITEM_CAP` — configured safety limits were exceeded.
- `AGENT_START` — the provider's async start rejected.
- `AGENT_RESULT` — a published child's result rejected with an infrastructure fault.
- `RESULT_UNSERIALIZABLE` — a script/worker value is not plain JSON data.
- `CANCELLED` — cancellation owns the run and pending/future hooks reject.

A child that resolves normally with a non-completed stop reason is not an infrastructure exception: `agent()` returns `null`, allowing the script to handle an ordinary child failure.

<a id="pkg-taskweaver-dsh-workflow--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-tool-workflow` and a workflow engine, which create child-agent requests and return a retained parent tool result.

<a id="pkg-taskweaver-dsh-workflow--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-workflow--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Foreground collection only** — the caller owns one live run and awaits it; background start/poll, spill handles, and detached collection are deferred.
- **No journaling or resume** — scripts, child progress, and intermediate values are not checkpointed, so a process restart cannot continue a run.
- **No saved or nested workflows** — the seam starts caller-supplied scripts only, and a workflow script receives no `workflow()` hook for recursive orchestration.
- **No token-budget vocabulary** — engines cap concurrency, items, and children, but neither the request nor result accounts for model tokens across children.
- **Runs are holder-owned, not service-tracked** — unloading the engine does not discover independent live handles; every consumer must dispose the run it started.

See the [dynamic-workflows Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md`） for the deferred workflow API.

<a id="pkg-taskweaver-dsh-workflow-worker-thread"></a>
### `@taskweaver/dsh-workflow-worker-thread`

<!-- migrated-from: packages/runtime/workflow/workflow-worker-thread/README.md -->
目录：`workflow/workflow-worker-thread`。
package.json 描述：worker-thread workflow engine: executes model-written orchestration scripts off the host event loop, bridging agent() calls back to ctx.subagents

<a id="pkg-taskweaver-dsh-workflow-worker-thread--taskweaver-dsh-workflow-worker-thread"></a>
This package implements `WorkflowEngine` with one Node worker thread per run. The worker executes the orchestration script; child agents remain on the host and are reached through `ctx.subagents` over a typed host/worker protocol.

The package root exports the default engine plugin and its `Config`; the worker protocol, runtime, and session modules stay private to the implementation. The operational `./worker` entry remains the engine's spawn target.

The split has one primary purpose: a synchronous script loop cannot block the harness event loop, and a script that ignores cancellation can be terminated with its worker. It is not a security sandbox.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--trust-and-isolation-boundary"></a>
#### Trust and isolation boundary

Workflow scripts are model-written and have the same trust premise as the model's existing bash access. `node:vm` inside a worker is an API-shaping mechanism, not a security boundary: an escaped script can recover Node capabilities with the host process's privileges.

The worker still provides useful containment:

- Script CPU work and synchronous spins stay off the host event loop.
- `worker.terminate()` gives disposal a real final stop.
- The worker starts with an empty environment, except unbuilt loader plumbing, so ambient credentials do not cross through `process.env`.
- Host/worker messages use structured-clone data, with plain-JSON validation at the script boundary.

A genuinely untrusted-script sandbox would require a different engine behind the same workflow seam.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--script-contract"></a>
#### Script contract

The workflow's `meta` is host-provided data, not evaluated script text. The engine validates its required `name` and `description`, rejects unknown fields, and parse-checks the body before returning a run.

Inside the worker, the script receives `args` and these hooks:

- `agent(prompt, { label, phase, schema, model })` starts one host-side subagent. With a schema it returns the structured value; otherwise it returns final text. An ordinary failed child yields `null`.
- `parallel(thunks)` runs thunks under the configured concurrency limit.
- `pipeline(items, ...stages)` passes `(previous, item, index)` without a cross-stage barrier.
- `phase(title)` and `log(message)` emit observer narration.

Unknown options, malformed arguments, unsupported schemas, tripped caps, provider-start failures, and infrastructure result failures are fatal workflow errors. No timers, filesystem API, or Node globals are intentionally injected, though the trust caveat above still applies.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--run-sequence"></a>
#### Run sequence

`start()` validates meta, parses the body, resolves a registered normalized provider route, and resolves any per-run total-child cap before creating a worker or publishing `workflow/start`. A requested `maxTotalAgents` must be a positive safe integer no greater than the engine's configured deployment ceiling. Source mode installs TypeScript transforms through a data-URL bootstrap; built mode passes sibling `lib/worker.cjs` as a filesystem path because pkg's VFS hook expects CommonJS. Both work under ordinary Node. A ready/go handshake prevents a start-signal cancellation racing worker boot from executing the script's initial synchronous slice.

For each `agent()` call:

1. The worker sends `child-start` with a plain-data prompt and options.
2. The host calls the start request's provider override, or otherwise the configured provider, through async `SubagentRuntime.start`, passing the workflow's parent and one canonical per-run abort signal. Provider choice applies to every child in that run and is not visible to the script.
3. If start rejects, the host sends `child-start-error`; provider startup has already reached quiescence and no child lifecycle event is emitted.
4. If start fulfills while the workflow still admits work, the host records the run, observes `result`, then sends `child-started`. Even an already-settled result is forwarded afterward, preserving start-before-result order.
5. The worker emits paired `workflow/agent-start` and `workflow/agent-end` narration and requests child disposal after collection.

Provider starts are tracked separately from published children. If cancellation, worker death, or normal workflow settlement closes admission while a start is pending, the shared signal aborts it. A provider that nevertheless fulfills after closure is disposed by the host and never announced to the worker.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--value-boundary"></a>
#### Value boundary

Values leaving the script pass through `materializeFromRealm`, which accepts plain, lossless JSON data and rejects exotic prototypes, functions, symbols, cycles, sparse arrays, non-finite numbers, and nested `undefined`. The walk runs in the worker, and defines object keys as data properties so `__proto__` cannot mutate a prototype.

Child results are projected and snapshotted before crossing from the host to the worker. This is a real process-like serialization boundary; it is deliberately different from trusted same-process workflow and subagent event payloads, which are borrowed immutable values.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--cancellation-and-disposal"></a>
#### Cancellation and disposal

`WorkflowRun.cancel()` records the first reason, tells the worker to cancel, aborts the one signal shared by every pending and published child, and arms the `disposeGraceMs` timer. Worker hooks then throw `CANCELLED` at their next await. If the run remains unsettled at the deadline, the host resolves it as cancelled, pairs stranded child lifecycle events, and terminates the worker.

The subagent seam has one cancellation channel: the request signal. There is no separate child-cancel RPC. Published child teardown uses `run.dispose()`; pending provider starts remain provider-owned until their promise rejects or fulfills.

Normal settlement also aborts pending starts and begins disposing any published fire-and-forget children before the result becomes externally settled. The host's quiescence condition includes both pending starts and published child disposals, so cleanup does not forget an async startup transaction.

`dispose()` is idempotent. It cancels the run, starts host-driven disposal immediately, waits for result plus child quiescence up to the same grace, terminates the worker unconditionally, and performs a final survivor sweep. Per-child disposal is memoized so worker RPC, host cancellation, death cleanup, and public disposal all join one operation.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--outcome-and-event-guarantees"></a>
#### Outcome and event guarantees

Terminal outcome is first-wins at host claim points. An accepted external cancellation overrides a later non-cancelled worker result; a result or worker death that claims first cannot be rewritten by reentrant cleanup callbacks.

Worker error, message failure, or premature exit closes message admission before cleanup, then resolves `error` unless cancellation already owns the run. Late queued messages cannot create children or narrate after that logical boundary.

The host keeps a ledger of forwarded child starts. A graceful worker supplies their ends; death or force termination synthesizes any missing end as cancelled. Every forwarded `workflow/agent-start` is therefore paired exactly once, although cleanup after an already-arrived workflow result may complete afterward.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--config"></a>
#### Config

| Key | Default | Meaning |
|---|---|---|
| `provider` | `spawn` | Host-side subagent provider used by `agent()`. |
| `maxConcurrentAgents` | `0` | Concurrent `agent()` ceiling; `0` resolves from available CPU parallelism. |
| `maxTotalAgents` | `1000` | Total `agent()` calls in one run. |
| `maxItemsPerCall` | `4096` | Items accepted by one `parallel()` or `pipeline()` call. |
| `syncTimeoutMs` | `5000` | VM timeout for the script's initial synchronous slice. |
| `disposeGraceMs` | `5000` | Bound before force-settlement/termination and for public disposal. |

An owning consumer may set `WorkflowStartRequest.subagentProvider` and `WorkflowStartRequest.maxTotalAgents` for one run. These are engine-level policy, not script hooks or model-facing options; the ordinary `workflow` tool leaves both unset. A per-run total-child cap may lower but never raise the configured `maxTotalAgents` ceiling.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-workflow-worker-thread--child-agent-requests"></a>
##### Child-agent requests

<a id="pkg-taskweaver-dsh-workflow-worker-thread--what-the-model-sees"></a>
###### What the model sees

Every script `agent()` call sends its prompt verbatim and optional model or structured-output schema to a subagent provider. Each child sees that provider's own context; phase and log narration stays on observer events.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--token-effect"></a>
###### Token effect

Potentially many independent child contexts are paid, bounded by `maxConcurrentAgents`, `maxTotalAgents`, and `maxItemsPerCall`; they never join the parent history directly.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--kv-cache-effect"></a>
###### KV Cache effect

Independent of the parent request cache and of sibling children. Each child can reuse only a byte-identical prefix under its own provider, model, prompt, and schema; its later history grows append-only.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--parent-tool-result-indirectly"></a>
##### Parent tool result, indirectly

<a id="pkg-taskweaver-dsh-workflow-worker-thread--what-the-model-sees-1"></a>
###### What the model sees

Through [`dsh-tool-workflow`](./README.zh.md#pkg-taskweaver-dsh-tool-workflow), success exposes only the materialized final JSON value and child count in that consumer's wrapper. This engine supplies stable errors including `workflow script does not parse: <error>`, `invalid meta: <violations>`, `agent() requires a non-empty prompt string`, `agent() could not start a child: <error>`, `child agent run failed: <error>`, and its exact `parallel()`, `pipeline()`, `phase()`, option, schema, and JSON-boundary validation messages. Intermediate child outputs are available to the script but not the parent model.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--token-effect-1"></a>
###### Token effect

Zero direct parent tokens from this engine. Final result size is capped by the tool consumer and retained until compaction.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-workflow-worker-thread--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **The worker/vm is not a security boundary** — model-written code can escape `node:vm` and reach the worker's process authority; a hostile-code deployment needs a separate-process or container engine.
- **One worker thread is paid per run** — there is no pool, warm runtime, or cross-run script cache.
- **No ambient timers, filesystem, or network are injected, but escaped code can still reach Node** — the missing globals are portability API, not containment.
- **Termination can only report host-observed starts** — `agentsStarted` excludes worker-side calls still queued behind concurrency when a forced termination makes them unknowable.
- **Cross-realm errors fail `instanceof Error` inside scripts** — workflow authors must branch on stable fields such as `name` and `code`.

<a id="family-workflow"></a>
### 原族级说明（迁移保留）

<a id="family-workflow--workflow-dynamic-workflow-capability-family"></a>
This family runs model-authored orchestration workflows over subagents and exposes general and fixed-policy tools to the model.

| Package | Role | ctx key |
|---|---|---|
| [`workflow/`](./README.zh.md#pkg-taskweaver-dsh-workflow) | Defines workflow execution and lifecycle events | `ctx.workflowEngine` |
| [`workflow-worker-thread/`](./README.zh.md#pkg-taskweaver-dsh-workflow-worker-thread) | Runs workflow scripts in worker threads | registers on `ctx.workflowEngine` |
| [`tool-workflow/`](./README.zh.md#pkg-taskweaver-dsh-tool-workflow) | Exposes general workflow execution to the model | registers on `ctx.tools` |
| [`tool-ralph/`](./README.zh.md#pkg-taskweaver-dsh-tool-ralph) | Exposes the fixed fresh-agent Ralph workflow | registers on `ctx.tools` |

Worker threads isolate workflow execution from the host event loop but are not a security boundary. See the [dynamic-workflow]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md`） and [Ralph tool]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-19-fresh-agent-ralph-workflow-tool.md`） decisions.

The subsystem reference — start requests, `WorkflowMeta`, results, live runs, `workflow/*` events — is [docs/subsystems/workflow.md]（原文链接目标：`../../docs/subsystems/workflow.md`）; decisions in the [dynamic-workflows]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md`） and [Ralph consumer]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-19-fresh-agent-ralph-workflow-tool.md`） Agent Notes.
