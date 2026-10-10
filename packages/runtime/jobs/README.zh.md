# jobs 包族

<a id="family-jobs"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义后台任务登记、观察、等待、取消和完成通知接口。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-jobs`](#pkg-taskweaver-dsh-jobs) | `jobs/jobs` | [接口与限制](#pkg-taskweaver-dsh-jobs) |
| [`@taskweaver/dsh-jobs-local`](#pkg-taskweaver-dsh-jobs-local) | `jobs/jobs-local` | [接口与限制](#pkg-taskweaver-dsh-jobs-local) |
| [`@taskweaver/dsh-tool-jobs`](#pkg-taskweaver-dsh-tool-jobs) | `jobs/tool-jobs` | [接口与限制](#pkg-taskweaver-dsh-tool-jobs) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-jobs"></a>
### `@taskweaver/dsh-jobs`

<!-- migrated-from: packages/runtime/jobs/jobs/README.md -->
目录：`jobs/jobs`。
package.json 描述：Background job registry (ctx.jobs) for the DeepSeek Harness — shared ids, owner isolation, polling, cancellation, and completion listeners for long-running tool work

<a id="pkg-taskweaver-dsh-jobs--taskweaver-dsh-jobs"></a>
The background job registry contract (`ctx.jobs`). The abstract `JobRegistry` and its vocabulary types give long-running producers shared ids, owner isolation, reads, cancellation, waiting, notices, and cleanup under one contract; the process-local registry lives in [`dsh-jobs-local`](./README.zh.md#pkg-taskweaver-dsh-jobs-local). Producer plugins extend `JobKindMap` with their opaque id namespace.

<a id="pkg-taskweaver-dsh-jobs--service-contract"></a>
#### Service contract

- `start(spec): JobId` validates the attached controller, spec, exact live owner, optional positive `outputLimitBytes`, and any provider-owned admission policy before calling the producer's `run()` once. A preflight rejection or starter throw leaves no job id or registered work; successful return commits without another failable step.
- `get(id, caller?)` and `list(caller?)` return non-consuming snapshots. Listing includes only caller-owned and unowned jobs.
- `read(id, caller?)` consumes the single cursor for stream jobs and reads terminal output idempotently for final-output jobs.
- `kill(id, caller?, reason?)` invokes producer cancellation before changing status. A cancellation throw leaves the job running; success changes it to `stopping` and marks terminal delivery reported.
- `wait(id, timeoutMs, caller?, signal?)` returns a terminal snapshot or the live snapshot at timeout. Aborting stops only the wait; settlement wins once it has committed terminal delivery to that waiter.
- `onJobDone(listener)` observes each terminal record with the exact owner. Listener throws and rejections are contained; listener work is not awaited.
- `onJobsChanged(listener)` observes visible-set changes — registration, every stopping transition (teardown's included, before it awaits a slow producer), settlement, owner-disposal removal, and the emptying service disposal commits — carrying only the owner whose set moved, or `undefined` when an unowned job changed and every caller's set moved with it. It is owner-granular because removal is a change no per-job record can express, and it is not a superset of `onJobDone`: it carries no delivery meaning and marks nothing reported. The registration binds to the calling fiber, so an observer mounted outside the registry still sees the disposal emptying.
- `attachController(name)` declares a job controller for its effect lifetime. `start()` fails before producer execution when no attached controller serves the spec's owner.

All three registrations are owner-relative, because one registry serves every composition in the process. A controller or listener registered from an unscoped context serves every owner; one registered under an agent composition's scope serves exactly the agents composed under it. So a composition that loads no controller cannot start background work on the strength of another composition's controls, and one settlement notifies only the listeners its owner's composition registered.

Owned access compares the job's `SessionId` with the caller's. Ids such as `bash-1` are predictable, so this fence is the boundary. Unowned jobs are open to callers and last until service disposal.

`outputLimitBytes` is producer-owned model-presentation policy carried unchanged into snapshots. A controller applies it after adding status or notice metadata; the registry does not rewrite producer output or invent a default for producers that omit it.

Implementations also owe the lifecycle semantics of the contract: registrations outlive producer and controller fibers, owner and service disposal cancel live work and await compliant producers, and settlement is first-wins — one terminal record, one round of contained listener notification, released waiters.

See the [job type catalog]（原文链接目标：`../../../docs/subsystems/jobs.md`）, the [runtime Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md`）, and the [seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-26-job-registry-seam.md`）.

<a id="pkg-taskweaver-dsh-jobs--model-experience"></a>
#### Model Experience

Indirectly, through producer plugins and [`dsh-tool-jobs`](./README.zh.md#pkg-taskweaver-dsh-tool-jobs), which render job ids, output, status, cancellation, and completion notices.

<a id="pkg-taskweaver-dsh-jobs--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-jobs--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Stream output has one consuming cursor** — independent observers need a cursor or snapshot API.
- **Foreground work cannot be promoted** — producers choose foreground or background before starting.
- **The contract is in-process** — `JobStart.run()` passes callbacks and exact `Agent` objects; a durable or cross-process backend must reshape identity, restart, ownership, and observation semantics before it can implement this seam.

<a id="pkg-taskweaver-dsh-jobs-local"></a>
### `@taskweaver/dsh-jobs-local`

<!-- migrated-from: packages/runtime/jobs/jobs-local/README.md -->
目录：`jobs/jobs-local`。
package.json 描述：Process-local implementation of the DeepSeek Harness background job registry seam

<a id="pkg-taskweaver-dsh-jobs-local--taskweaver-dsh-jobs-local"></a>
Process-local implementation of the [`@taskweaver/dsh-jobs`](./README.zh.md#pkg-taskweaver-dsh-jobs) registry contract: `LocalJobRegistry` keeps every record in memory, issues per-kind `<kind>-N` ids, and hands out fresh snapshots, never live state. Load it as a plugin and it registers as `ctx.jobs`.

<a id="pkg-taskweaver-dsh-jobs-local--admission"></a>
#### Admission

`maxConcurrentJobsPerOwner` is a positive safe integer and defaults to `10`. Before invoking a producer, `start()` counts the exact owner's `running` and `stopping` records; all unowned jobs share one separate service bucket. Terminal history does not occupy capacity, and only producer `done` settlement releases a stopping job's place.

At capacity, `start()` fails before producer execution and id allocation with an error that names the limit and tells the model to use `job_kill`, wait for the job to finish stopping, and retry. The registry does not queue, preempt, or maintain a second mutable counter.

<a id="pkg-taskweaver-dsh-jobs-local--lifecycle"></a>
#### Lifecycle

Jobs belong to their owner and backend, not the producer tool fiber, so producer and controller reloads do not stop them. The first job for an owner attaches one awaited effect to the exact `Agent` scope. Owner disposal cancels that object's jobs, awaits producer quiescence, and removes their snapshots; reused agent or session ids cannot redirect an old cleanup.

Service disposal closes listeners, cancels all live jobs, awaits their records, and detaches effects from surviving owner scopes. If teardown cancellation throws, the service force-fails the record and warns that work may be orphaned instead of deadlocking. A cancellation that returns but never settles `done` remains indistinguishable from a slow stop and can stall teardown.

Settlement is first-wins: the earliest terminal outcome — producer settlement, a rejected `done` contained as `failed`, or a teardown force-failure — records once, releases waiters, and notifies listeners once with per-listener containment. Pending waits mark the job reported before listeners run so completion reporters do not duplicate notices, and a teardown cancel marks it for the same reason: nothing will read a notice addressed to an owner being destroyed. Completion is the last thing a settlement announces, after the record is committed and the visible-set change is published, because a reporter may open a model turn synchronously and every other observer must already have seen the settled record.

Controllers and listeners are layered by the scope that registered them, in the tools-registry shape: a registration files into its registering context's scope, and a read unions the global layer with the owner's scope chain. One process-wide registry therefore answers per-owner questions per owner — `start()` refuses `background jobs unavailable: no job controller serves this agent (load @taskweaver/dsh-tool-jobs in its composition)` for an owner whose own composition attaches none, however many other compositions attach theirs, and a settlement reaches only the listeners its owner's composition registered.

<a id="pkg-taskweaver-dsh-jobs-local--model-experience"></a>
#### Model Experience

Indirectly, through producer plugins and [`dsh-tool-jobs`](./README.zh.md#pkg-taskweaver-dsh-tool-jobs), which render job ids, output, status, cancellation, and completion notices.

<a id="pkg-taskweaver-dsh-jobs-local--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-jobs-local--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Jobs are process-local** — records die with the harness process; durable or cross-restart execution needs a separate backend implementing the seam.
- **A silently ineffective cancel can stall teardown and hold capacity** — if `cancel` returns without settling `done`, the registry cannot distinguish it from a slow stop; the job keeps one bucket slot for the rest of the service lifetime, and only an explicit throw can be force-failed safely.

<a id="pkg-taskweaver-dsh-tool-jobs"></a>
### `@taskweaver/dsh-tool-jobs`

<!-- migrated-from: packages/runtime/jobs/tool-jobs/README.md -->
目录：`jobs/tool-jobs`。
package.json 描述：Model-facing background job control tools (job_output, job_list, job_kill) over the ctx.jobs registry

<a id="pkg-taskweaver-dsh-tool-jobs--taskweaver-dsh-tool-jobs"></a>
The model-facing controller for `ctx.jobs`: three kind-independent tools, completion notices, and one background-work prompt section. Loading the plugin attaches the controller required by `ctx.jobs.start()`.

<a id="pkg-taskweaver-dsh-tool-jobs--tools"></a>
#### Tools

- `job_output(job_id, wait?, timeout_ms?)` reads without blocking by default. Stream jobs return only the next delta; final-output jobs return their result after settlement. Every response ends with `[status: ...]`. `wait: true` waits up to the configured cap and leaves a still-running job alive on timeout.
- `job_list()` returns caller-visible jobs as `<id> [<kind>] <status> — <label>`.
- `job_kill(job_id, reason?)` requests cancellation immediately and forwards the logged reason. Terminal jobs return a non-consuming snapshot.

All three use generic UI cards: `read` for output and list, `execute` for kill.

Their canonical values are `{ text, job }`, `PublicJobSnapshot[]`, and `{ outcome: 'cancellation-requested' | 'already-finished', job }`. A public snapshot carries id, kind, label, status/detail, and start/finish times; it deliberately omits `ownerSession` and the internal `reported` notice bit. Native renderers preserve the status and acknowledgement text above.

When a producer supplies `outputLimitBytes`, `job_output`, terminal `job_kill`, and completion notices cap the complete Native UTF-8 result after adding status or notice text. Reads retain the output tail and control suffix when they fit; a bounded completion notice instead reserves `background job <id>` and the `job_output` collection instruction before spending remaining bytes on its variable kind, label, status, detail, and truncation marker. A prepended pre-execute listener captures the caller-visible job before policy, and each job-control definition's final-content callback applies its producer cap to single-text denials, short-circuits, normalized tool or pipeline failures, replacements, and blocks; structured multi-block policy results retain their shape. An existing producer truncation marker is reused rather than duplicated. Producers that omit the field retain the existing unbounded controller behavior.

<a id="pkg-taskweaver-dsh-tool-jobs--completion-notices"></a>
#### Completion notices

An unreported completion delivers `background job <id> (<kind>: <label>) finished [status: ...]. Read its output with job_output.` to the exact owner. When bounded, the stable id prefix and collection command outrank variable label/detail so the notice remains actionable at PTY's supported 64-byte minimum. A kill or terminal read/wait marks delivery reported and suppresses the redundant notice, as does the teardown cancel that drains an owner or the service.

Which lane carries it depends on what the owner is doing. A busy owner is injected: the notice joins the next-step inbox, and the turn cannot close while that inbox holds it, so several jobs settling together cost one step rather than one turn each. An idle owner is instead woken with a follow-up turn, because a pending notice nothing claims is a completion the model never learns about. `completionDelivery: quiet` keeps the injection lane for idle owners too, which is what a deterministic transcript needs.

Waking is bounded. Each owner may open `maxConsecutiveWakes` turns this way before further notices degrade to injection, and claiming any user-authored message restores the budget. The bound exists because the chain is self-exciting: a woken turn may start the background job whose completion wakes it again. Notices this plugin queued never refill the budget they spent.

One host registry may carry several mounts of this plugin — one per agent preset. The registry routes each settlement to the listeners the owner's scope chain reaches, so a mount under one preset never sees another preset's agents and an agent reads exactly one notice per completion however many presets are mounted. The same routing decides which agents this mount's controller serves: an agent whose composition loads no `tool-jobs` cannot start background work at all.

<a id="pkg-taskweaver-dsh-tool-jobs--config"></a>
#### Config

| key | default | meaning |
|---|---|---|
| `waitTimeoutMs` | `30000` | wait used when `wait: true` omits `timeout_ms` |
| `maxWaitTimeoutMs` | `600000` | cap for model-supplied waits |
| `completionDelivery` | `wakeup` | `wakeup` opens a turn on an idle owner; `quiet` leaves the notice pending |
| `maxConsecutiveWakes` | `3` | turns one owner may open by wake before notices degrade to injection |

A default above the cap fails at load.

<a id="pkg-taskweaver-dsh-tool-jobs--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-jobs--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-tool-jobs--what-the-model-sees"></a>
###### What the model sees

Every request in this plugin's registration scope contains this guidance. Agent-scoped tool filtering may hide the tools without removing the independently registered prompt section.

<a id="pkg-taskweaver-dsh-tool-jobs--background-job-guidance"></a>
###### Background-job guidance

```markdown
Track every background job id you start. You are notified in-session when a job finishes — do not busy-poll or sleep on one; keep working on independent steps and do not duplicate a running job's work. Before giving a final answer, collect every still-relevant job with job_output (set wait: true only when you are genuinely blocked on it), and job_kill jobs that stopped mattering.
```

<a id="pkg-taskweaver-dsh-tool-jobs--token-effect"></a>
###### Token effect

Small fixed input cost per request while active.

<a id="pkg-taskweaver-dsh-tool-jobs--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the plugin scope and guidance text are unchanged. Activation or disposal may invalidate reuse from this prompt section.

<a id="pkg-taskweaver-dsh-tool-jobs--tool-schemas"></a>
##### Tool schemas

<a id="pkg-taskweaver-dsh-tool-jobs--what-the-model-sees-1"></a>
###### What the model sees

The generated [`job_output`, `job_list`, and `job_kill` schemas]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-jobs`） while this tool set is visible.

<a id="pkg-taskweaver-dsh-tool-jobs--token-effect-1"></a>
###### Token effect

Fixed schema cost on each request where the tools are visible.

<a id="pkg-taskweaver-dsh-tool-jobs--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while tool definitions and visibility are unchanged. Registration lifecycle or scoped restrictions may invalidate reuse from the first changed schema token.

<a id="pkg-taskweaver-dsh-tool-jobs--results-and-notices"></a>
##### Results and notices

<a id="pkg-taskweaver-dsh-tool-jobs--what-the-model-sees-2"></a>
###### What the model sees

Reads return output or `(no new output)` followed by `[status: <status>]` and optional detail. An empty list returns `(no background jobs)`. Kill returns `requested cancellation of job <id>` or the existing terminal status. Unreported owned completion uses the notice above.

<a id="pkg-taskweaver-dsh-tool-jobs--token-effect-2"></a>
###### Token effect

Results and notices remain in parent history until compaction. Stream reads do not repeat consumed output; a producer-supplied `outputLimitBytes` bounds each complete read or notice. Under `wakeup`, a notice reaching an idle owner also buys a model request the user did not ask for, capped per owner by `maxConsecutiveWakes`; a notice reaching a busy owner adds a step to the turn it is already paying for.

<a id="pkg-taskweaver-dsh-tool-jobs--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-jobs--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **A settlement inside the driver's retirement window still strands its notice** — between the turn loop's last inbox check and the driver committing its idle phase the owner still reads as busy, so the notice is injected and nothing wakes. Steering has the same hole; closing it belongs to `agent-loop`.
- **A spent wake budget is not restored by time** — only user-authored input refills it, so an unattended agent whose budget ran out collects its remaining notices on the next turn something else opens.
- **A notice pending on an idle owner does not survive that owner's disposal** — the disposal cancel clears the unclaimed inbox, and the log keeps the insert/cancel pair as the record.
- **Stream reads are single-consumer** — independent observers need another runtime API.
- **Unowned jobs have no session fence** — external callers must supply policy or avoid them.

<a id="family-jobs"></a>
### 原族级说明（迁移保留）

<a id="family-jobs--jobs-background-job-capability-family"></a>
This family gives long-running tools one owner-isolated background-job protocol for observation, cancellation, waiting, and completion notices.

| Package | Role | ctx key |
|---|---|---|
| [`jobs/`](./README.zh.md#pkg-taskweaver-dsh-jobs) | Defines the job registry and lifecycle contract | `ctx.jobs` |
| [`jobs-local/`](./README.zh.md#pkg-taskweaver-dsh-jobs-local) | Implements the process-local job registry | registers on `ctx.jobs` |
| [`tool-jobs/`](./README.zh.md#pkg-taskweaver-dsh-tool-jobs) | Exposes job control and completion notices to the model | registers on `ctx.tools` |

See the [background-job runtime]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md`） and [job-registry]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-26-job-registry-seam.md`） decisions.

The subsystem reference — the id scheme, the owner-fenced contract, snapshots — is [docs/subsystems/jobs.md]（原文链接目标：`../../docs/subsystems/jobs.md`）; design in the [background-job runtime]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md`） and [job-registry contract]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-26-job-registry-seam.md`） Agent Notes.
