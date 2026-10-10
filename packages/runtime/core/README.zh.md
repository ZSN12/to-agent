# core 包族

<a id="family-core"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

提供 Session、Agent、工具注册、系统提示词与默认执行循环等核心契约。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-agent`](#pkg-taskweaver-dsh-agent) | `core/agent` | [接口与限制](#pkg-taskweaver-dsh-agent) |
| [`@taskweaver/dsh-agent-default-model`](#pkg-taskweaver-dsh-agent-default-model) | `core/agent-default-model` | [接口与限制](#pkg-taskweaver-dsh-agent-default-model) |
| [`@taskweaver/dsh-agent-loop`](#pkg-taskweaver-dsh-agent-loop) | `core/agent-loop` | [接口与限制](#pkg-taskweaver-dsh-agent-loop) |
| [`@taskweaver/dsh-agent-tool-presentation`](#pkg-taskweaver-dsh-agent-tool-presentation) | `core/agent-tool-presentation` | [接口与限制](#pkg-taskweaver-dsh-agent-tool-presentation) |
| [`@taskweaver/dsh-scope`](#pkg-taskweaver-dsh-scope) | `core/scope` | [接口与限制](#pkg-taskweaver-dsh-scope) |
| [`@taskweaver/dsh-session`](#pkg-taskweaver-dsh-session) | `core/session` | [接口与限制](#pkg-taskweaver-dsh-session) |
| [`@taskweaver/dsh-system-prompt`](#pkg-taskweaver-dsh-system-prompt) | `core/system-prompt` | [接口与限制](#pkg-taskweaver-dsh-system-prompt) |
| [`@taskweaver/dsh-tools`](#pkg-taskweaver-dsh-tools) | `core/tools` | [接口与限制](#pkg-taskweaver-dsh-tools) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-agent"></a>
### `@taskweaver/dsh-agent`

<!-- migrated-from: packages/runtime/core/agent/README.md -->
目录：`core/agent`。
package.json 描述：Agent interface, registry, initiator scope, and event vocabulary for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-agent--dsh-agent"></a>
Agent interface, registry, process-local initiator scope, and `agent/*` event vocabulary. Every plugin (UI, hooks, orchestrators) programs against the `Agent` handle defined here — it has zero loop dependency, so the loop is swappable.

The optional `@taskweaver/dsh-agent/invariant` companion registers this package's agent-status transition checks with `ctx.invariants`. The root agent service does not load diagnostics implicitly.

<a id="pkg-taskweaver-dsh-agent--service-agentregistry-ctx-key-agents"></a>
#### Service: `AgentRegistry` (ctx key: `agents`)

Tracks live agents and carries the initiating Agent through asynchronous driver work without importing the concrete loop package.

<a id="pkg-taskweaver-dsh-agent--public-api"></a>
##### Public API

The scoped-registration surface: `Agent.ctx` is the agent's scope context (`dsh-scope`, key = the agent) — register tools/sections/variables/listeners through it for that agent alone, all unwound on disposal. `agentEvents(ctx, agent)` is the fused dispatcher for ordinary agent-subject operations (carrier + injected subject in one move); its notification mode invokes every listener and contains both synchronous throws and returned-promise rejections. The registry lifecycle pair reuses one stable routing carrier. `assembleContextFor(agent)` builds the per-agent assembly context (`agent` + `scope` together). `installModelSelection(agentCtx, selection)` snapshots a mutable provider/model/reasoning-effort selection during prompt assembly, applies its provider and model to prompt variables, and applies the complete selection to request routing for one step; an absent selected effort clears an inherited effort so adapter/provider defaults apply. `CreateAgentOptions.setup(agentCtx)` and `ResumeAgentOptions.setup(agentCtx)` compose a fresh or resumed agent's scoped world while both objects remain unpublished. Setup is trusted, composition-only same-process code: drive the agent only after creation resolves.

`AgentOptions` supplies the initial provider/model route and an optional positive `maxTokens` output cap. The concrete loop resolves any exact-model adapter default, records the effective cap in the request header, and applies it to each conversation-model request; an explicit Agent option wins, while omission leaves the adapter or provider route default in control.

- `ctx.agents.register(agent: Agent): () => void` — record an **already-constructed** agent. Disposed with the calling fiber.
- Advanced ordered lifecycle: `enter(agent, owner): () => void` enforces `agent.id === agent.session.id`, performs the authoritative ID collision check, and inserts without announcing; `owner` explicitly records the live creator-agent relation (or `undefined` for a root), independently of durable session lineage. `announce(agent)` emits `agent/created` exactly once. A detach requested synchronously by a creation listener is deferred until that dispatch unwinds, and every detach checks the captured entry object, so a stale capability cannot delete a later same-ID replacement. The async factory uses this split; ordinary plugins use `register()`.
- `ctx.agents.get(id: SessionId): Agent | undefined`
- `ctx.agents.isOwnedBy(id: SessionId, owner: Agent): boolean` — whether the exact live entry was created through that parent agent's scoped context; runtime ownership is independent of durable session lineage.
- `ctx.agents.list(): Agent[]`
- `ctx.agents.roots(): Agent[]` — live agents created without an owning agent context; a resumed lineage-bearing session can still be a runtime root.

<a id="pkg-taskweaver-dsh-agent--initiating-agent-scope"></a>
###### Initiating Agent scope

`AgentLoop` runs each concrete driver's complete lifetime inside an initiator boundary. Concurrent drivers remain isolated: a child driver's continuations carry the child, while the parent continuation regains the parent as soon as `withInitiator()` returns; drain tracking continues until the child driver's Promise settles. Creation, persistence load, and unpublished setup remain outside the child's boundary, so setup initiated by a parent inherits the parent while `agentCtx.agent` identifies the child explicitly.

- `ctx.agents.currentInitiator(): Agent | undefined` — read the inherited initiator without requiring one.
- `ctx.agents.requireInitiator(): Agent` — read it or throw `no initiating agent is active`.
- `ctx.agents.withInitiator(agent, operation)` — run with one exact Agent and preserve the operation's exact synchronous value or Promise.
- `ctx.agents.withoutInitiator(operation)` — hide an inherited initiator for unrelated process-local work.

The scope carries the `Agent` itself and is process-local. Ambient presence is neither liveness proof nor authorization; explicit Agent fields remain authoritative at service, worker, process, persistence, and wire boundaries. Teardown rejects new boundaries, lets injected dependents and returned-Promise boundaries drain, then disables the underlying `AsyncLocalStorage`; unreturned work remains owned by the subsystem that detached it. If a boundary's inherited async chain starts an owning Cordis fiber's unload, that nested boundary chain is released from the drain so the unload cannot wait on itself; its continuations observe the disposed service after teardown. The [initiator-scope decision]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.md`） owns the detailed boundary and teardown contract.

<a id="pkg-taskweaver-dsh-agent--factory-api-creation"></a>
###### Factory API (creation)

Agent *creation* is provided by the plugin implementing `AgentFactory` (`dsh-agent-loop`), registered via `setFactory`. This keeps creation on the `dsh-agent` interface so consumers (UI, the ACP bridge) program against `ctx.agents` without depending on the concrete loop package. The registry canonicalizes an already traced Service to its concrete target and re-traces each call through the caller's context; this avoids nested Cordis shadows while passing an explicit caller-bound `ownerCtx` to plain factories.

- `ctx.agents.setFactory(factory: AgentFactory): () => void` — register the creation factory (the loop calls this on construction). Throws on a second factory; the slot clears on dispose.
- `ctx.agents.create(options: CreateAgentOptions): Promise<AgentHandle>` — create a session and agent, await optional setup while unpublished, then publish through final `SessionStore.enter()` and `AgentRegistry.enter()` checks. Concurrent same-ID creation is unsupported: more than one operation may prepare, but only one can enter; every loser rolls its private scope/session/driver back. An optional creation-only `signal` cancels unpublished setup and is detached before the handle is returned; later cancellation uses `handle.dispose()` or `agent.cancel()`. Publication is rollback-covered and every delivered creation edge is paired during rollback. Rejects if no factory is registered.
- `ctx.agents.resume(options: ResumeAgentOptions): Promise<AgentHandle>` — load a persisted session ([session persistence]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md`）), mint a fresh unpublished agent scope, await optional setup, and use the same final-entry publication sequence. Its optional `signal` is likewise creation-only. Rejects if no factory is registered or session persistence is unconfigured.

`AgentHandle = { agent: Agent; dispose(): Promise<void> }`. The disposer is a **consumer capability** — no observer holding the bare registry entry can tear the agent down. The caller fiber and the registered factory provider are structural co-owners: caller unload enforces structured ownership, while factory unload must stop old instances because their scoped dependency surface belongs to that provider. `dispose()` from any owner reaches one memoized quiescence boundary: it stops the loop, awaits its exit, unregisters the agent, removes its session from the store, and finally unwinds its scoped world. `ctx.agents.get(id)` still returns a bare `Agent`; the ACP bridge and in-process subagent backends hold consumer handles, while config-created agents are already owned by the loop fiber.

<a id="pkg-taskweaver-dsh-agent--live-events"></a>
##### Live events

`dsh-agent` declares the live `agent/*` coordination vocabulary so plugins do not depend on the concrete loop. Exact signatures, dispatch modes, scope-filtering rules, and payload contracts live in the generated region of [core.md]（原文链接目标：`../../../docs/subsystems/core.md#cordis-surface`）; the [architecture turn flow]（原文链接目标：`../../../docs/architecture.md#turn-flow`） shows their order relative to durable session events.

The lifecycle edges have two important local caveats. `agent/created` runs after scoped setup and after both session and agent registry entries exist. Setup is trusted composition-only code; the immediately following non-vetoing `agent/session-start` notification is the first supported startup injection point. `agent/disposed` always means the exact agent has left the registry. AgentLoop emits it after its driver is quiescent, while ordered teardown may still be detaching the session and unwinding the scope; custom agents registered directly own any stronger driver-ordering contract themselves.

Most interception points are cooperative waterfalls. `agent/pre-step` receives a payload carrying the subject `agent`, the exclusive claimed `UserMessage[]`, and the proposed `turn`, `step`, and cancellation `signal`; its batch may be empty when tools already require another request. Agent-scoped turn extension points carry their explicit `AbortSignal` in the payload; the remaining turn-scoped extension points receive it through their request value. Listeners may cooperate with a signal but must not retain it as authority over another turn. `agent/request-error` is the failed-model-request recovery waterfall: it receives request coordinates, normalized failure facts, the serving registration's retry policy when available, and the signal. A listener returns `{ kind: 'retry' }` without calling `next()` when it owns recovery. `agent/turn-stopping` runs before an otherwise completed turn closes. The [explicit-cancellation decision]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-16-explicit-turn-cancellation.md`） owns signal lifetime; the [agent-scope runtime-design Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-12-agent-scope-runtime-design.md#three-execution-boundaries-are-deliberately-one-way`） owns scoped dispatch and terminal settlement.

`PreStepDecision` is either `{ kind: 'reject' }` or `{ kind: 'enter', messages }`. The enter branch is the complete identified, frozen batch for the proposed step. A listener that wraps downstream entry preserves that batch unless it intentionally replaces it; additions follow the waterfall's natural return order. Claiming already removed the offered messages from the inbox, so rejection does not retain them. Messages inserted after the claim remain pending for a later boundary.

Inbox live notifications are deliberately per-message and minimal: `agent/inbox/inserted { message }`, `agent/inbox/claimed { message, turn }`, and `agent/inbox/discarded { message }`. They complement the durable `agent/inbox/spliced` projection without adding another lifecycle envelope.

Turn and step boundaries and the model token stream are durable `session/event` facts rather than mirrored `agent/*` notifications. Consumers read `turn/*`, `step/*`, and `assistant/chunk` from the session feed; tool policy and outcome observation belong to the complete pipeline documented by [`dsh-tools`](./README.zh.md#pkg-taskweaver-dsh-tools).

`foldConsumedWork(events)` reads that feed back for the one question the turn sequence cannot answer alone: what became of the work a log consumed. It returns the latest `turn/end` that accounts for consumed work — a turn that entered a model step, or one that claimed inbox input and then failed, was stopped, or was rejected before reaching one — plus whether accepted work was later cancelled out of the inbox unrun. Both facts come from the log, so a cancellation reads the same whichever owner issued it. A no-step turn that took nothing, or emptied its claim and completed, describes no work and is skipped; a `blocked` end over claimed input is an account, because rejection discarded that input.

<a id="pkg-taskweaver-dsh-agent--agent-interface-types-ts"></a>
##### Agent interface (`types.ts`)

The handle every plugin programs against:

- `agent.inbox` — the agent-owned projection of durable `agent/inbox/spliced` events. `nextTurn` and `nextStep` expose pending `UserMessage` values. `append`, `prepend`, `replace`, `remove`, `clear`, `splice`, and `claim` mutate them; `replace(messageId, newMessage)` and `remove(messageId)` locate the pending message across both lists. Replacement may change identity and publishes the old message as discarded followed by the new message as inserted. Ordinary removals and `clear()` are durable cancellations and emit `agent/inbox/discarded`. `claim(target)` removes the next proposed batch with pure deletion splices; the loop then emits `agent/inbox/claimed`. `MessageId` is the only occurrence identity and must remain unique while pending.
- `agent.followup(message)` — queue an ordinary `next-turn` message and wake the driver. It returns no completion handle; the message id identifies inbox insertion, claim, and discard facts, not a later output or `turn/end`.
- `agent.steer(message)` — queue waking `next-step` input. An idle agent starts a turn synchronously; a running driver consumes later steering at its next step boundary.
- `agent.inject(message)` — queue non-waking `next-step` context. A running driver claims it at the nearest later pre-step boundary; an idle driver leaves it pending until `followup()` or `steer()` wakes the driver. It may miss a request whose pre-step already claimed its batch.
- `agent.cancel(cause, options?)` — cancel the active driver and, unless `options.keepInbox`, durably cancel all pending inbox work. Idle cancellation is a no-op.
- `agent.whenIdle()` — observe whole-agent quiescence, including replacement work scheduled before the current driver retires. It does not settle any particular message.
- `agent.session`, `agent.status`, `agent.options`, `agent.id`, `agent.ctx`

`running` describes a driver-wide drain interval, not proof that a turn is still open; it can cover turn close, the durability checkpoint, and consecutive queued turns. Only a caller that owns a complete interval may summarize it as a run result ([decision]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-30-followup-enqueue-and-owned-runs.md`）).

<a id="pkg-taskweaver-dsh-agent--extension-points"></a>
##### Extension points

- Agent creation: `AgentLoop.create()` is the concrete config-path implementation (in `dsh-agent-loop`), while programmatic consumers create/resume owned agents through `ctx.agents.create()` / `ctx.agents.resume()`. Replace the loop by implementing `Agent` and registering via `ctx.agents.register()`.
- Event listeners: all `agent/*` events are declared here — no dependency on the loop package needed.
- Subagent delegation is not an `Agent` method; providers create or drive ordinary handles through the factory API, so delegation transports stay outside the core agent interface.

<a id="pkg-taskweaver-dsh-agent--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-agent--user-steering-and-injected-messages"></a>
##### User, steering, and injected messages

<a id="pkg-taskweaver-dsh-agent--what-the-model-sees"></a>
###### What the model sees

`send`, `steer`, and `inject` feed the owning session. `agent/pre-step` and other declared events let plugins reject a proposed step or add durable request material; this interface contributes no fixed prose itself.

<a id="pkg-taskweaver-dsh-agent--token-effect"></a>
###### Token effect

Accepted content becomes retained history or a repeated session prefix; blocked content contributes no request tokens. Size is caller- and plugin-dependent.

<a id="pkg-taskweaver-dsh-agent--kv-cache-effect"></a>
###### KV Cache effect

Accepted history and steering are append-only; a blocked submission sends no request. A session prefix remains stable within its loop instance, while a new or resumed instance may establish a different prefix.

<a id="pkg-taskweaver-dsh-agent--agent-scoped-request-composition"></a>
##### Agent-scoped request composition

<a id="pkg-taskweaver-dsh-agent--what-the-model-sees-1"></a>
###### What the model sees

Registrations through `agent.ctx` can shadow prompt sections or tools and can install agent-only interceptors during unpublished setup.

<a id="pkg-taskweaver-dsh-agent--token-effect-1"></a>
###### Token effect

The package adds zero tokens itself; scoped contributions affect only that agent and disappear on disposal.

<a id="pkg-taskweaver-dsh-agent--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while an agent's scoped registrations are unchanged. Setup or reload that changes prompt sections, tool definitions, or request listeners may invalidate reuse from the first affected request token.

<a id="pkg-taskweaver-dsh-agent--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Initiator scope is process-local** — workers, child processes, HTTP, durable queues, and restarts materialize any required identity explicitly.
- **Ambient identity may outlive liveness** — consumers still check `agent.status`, cancellation, and the owning capability contract before lifecycle-sensitive work.
- **Inter-agent channels beyond delegation** — shared state, streaming child output, and background/poll semantics remain outside the current synchronous `ctx.subagents` seam.
- **`agent/session-start` cannot gate startup** — it remains a synchronous, veto-less notification; async composition that must finish before publication belongs in the factory's `setup(agentCtx)` transaction instead.
- **`cancel()` clears the inbox by default** — it aborts the in-flight turn plus queued and steering work; `cancel(cause, { keepInbox: true })` aborts only the turn and preserves pending items. There is still no step-only abort that keeps the in-flight turn running ([stop API Agent Note]（原文链接目标：`../../../.agents/notes/implemented/simplification/2026-06-20-public-agent-stop-api.md`）).
- **Each additional `UserMessage` carries exactly one `MessageSource`** — contributions from several plugins merged onto one tool call collapse under one source, so the message cannot name several producers.
- **`SessionStartSource` reserves `'clear'`/`'compact'` with no emitter yet** — only `'startup'`/`'resume'` occur until the driving subsystems land (`TODO(compaction)`).

<a id="pkg-taskweaver-dsh-agent-default-model"></a>
### `@taskweaver/dsh-agent-default-model`

<!-- migrated-from: packages/runtime/core/agent-default-model/README.md -->
目录：`core/agent-default-model`。
package.json 描述：Default model selection shared by Agent entry points

<a id="pkg-taskweaver-dsh-agent-default-model--taskweaver-dsh-agent-default-model"></a>
The deployment default used when an entry point creates an Agent that has no session-local model selection. `AgentDefaultModelConfig` provides `ctx.agentDefaultModel`; direct entry points such as `dsh --profile headless` and Host-backed entry points such as ApiProxy read the same service instead of owning parallel provider/model defaults.

The plugin config requires `{ provider, model }`. That composition entry is the base of the `agent-default-model` Settings section; a mounted settings provider layers the user's choice over it and changes are visible on the next `currentSelection()` read. `reasoningEffort` belongs to the Settings section but deliberately not to plugin config: a complete saved selection can clear an effort when the next selected model has none, while a composition value would be inherited again.

- `ctx.agentDefaultModel.currentSelection()` returns a detached `{ provider, model, reasoningEffort? }` selection for a newly created Agent.
- `ctx.agentDefaultModel.saveSelection(selection)` saves the complete user selection. Without a settings provider it is a no-op and the composition entry remains current.

The service does not validate catalog membership. A provider route may serve an unadvertised model, and the consumer that actually opens a model request owns availability diagnostics.

<a id="pkg-taskweaver-dsh-agent-default-model--model-experience"></a>
#### Model Experience

Indirectly, through the provider/model selection supplied to an entry point; request assembly and adapters own the model-visible request.

<a id="pkg-taskweaver-dsh-agent-default-model--kv-cache-effect"></a>
###### KV Cache effect

Changing the default affects only Agents that subsequently resolve from it. An existing session whose request log already names a selection keeps that selection, so this service does not invalidate its established prefix.

<a id="pkg-taskweaver-dsh-agent-default-model--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- The service owns one process-wide default; per-session selection remains the entry point's responsibility.
- Without a settings provider, `saveSelection()` cannot retain a selection for a later Agent.

<a id="pkg-taskweaver-dsh-agent-loop"></a>
### `@taskweaver/dsh-agent-loop`

<!-- migrated-from: packages/runtime/core/agent-loop/README.md -->
目录：`core/agent-loop`。
package.json 描述：The concrete agent loop plugin for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-agent-loop--dsh-agent-loop"></a>
THE concrete agent plugin and loop driver. Its package-internal implementation satisfies the `Agent` interface and drives the session/turn/step lifecycle.

This is the only package in the harness that contains concrete loop logic. Everything else is an abstract service or a plugin against extension points — new behavior goes into plugins, not here.

<a id="pkg-taskweaver-dsh-agent-loop--service-agentloop-ctx-key-agentloop"></a>
#### Service: `AgentLoop` (ctx key: `agentLoop`)

<a id="pkg-taskweaver-dsh-agent-loop--public-api"></a>
##### Public API

Creation and resume are one rollback-covered transaction: construct a private session, concrete agent, and scoped context; await optional setup; enter both registries; announce `session/created` then `agent/created`; emit `agent/session-start`; and only then start the driver. Setup receives the full scoped `Context` as trusted same-process composition code and must not drive the unpublished agent. Ordinary typed identity and option inputs are borrowed under their readonly contract, while seed events and session metadata are validated and snapshotted because they cross the durable session boundary. An optional `AbortSignal` cancels only load/setup/publication and is detached before the returned handle becomes visible.

The caller fiber and the AgentLoop provider are co-owners. `AgentFactory.createAgent(ownerCtx, options)` and `resume(ownerCtx, options)` receive caller ownership explicitly, while the factory keeps its own dependency context for `sessions`/`llm`/`tools`/`systemPrompt`; this lets a caller inject only `agents` without shrinking the new agent's service set. Caller unload, handle disposal, or provider unload converge on one memoized quiescence boundary. Provider shutdown waits both resource teardown and the public create/resume wrapper that observed deactivation, so no continuation can publish after dependencies disappear.

Each agent and its session share one caller-chosen `SessionId`, assumed globally unique; accidental UUID collisions are outside the supported model. Two concurrent operations with the same id may both prepare, but the final `enter()` calls arbitrate publication and every loser rolls its private resources back. Each detach is bound to the exact entered object, so a stale disposer cannot remove a later same-id replacement. A detach requested during a synchronous creation notification waits for that dispatch to unwind, preserving created/disposed pairing. Teardown runs stop and drain → unwind scope → detach agent → detach session; the id becomes reusable after private scope cleanup. Ordinary non-vetoing `agent/*` notifications go through `agentEvents(ctx, agent)`, and per-step assembly goes through `assembleContextFor(agent)`.

- `ctx.agentLoop.create(id: SessionId, options?: AgentOptions, meta?: { cwd?: string }): Agent` — synchronous no-setup create under the exact shared agent/session id, disposed with the calling fiber. Declarative config treats `agents[].id` as a stable label and normally mints `${label}-session-<uuid>` before calling this boundary. An app may instead supply a stable exact `sessionId`: first use creates it, while a remount with persistence already present resumes its materialized history. `resumeSessionId` requires and loads an existing persisted id and is mutually exclusive with `sessionId`. This keeps default fresh restarts collision-free without retaining a second live routing identity.

`AgentLoop` also implements the `AgentFactory` contract and registers itself via `ctx.agents.setFactory(this)`, so plugins create/resume agents through `ctx.agents`:

- `ctx.agents.create({ sessionId, meta?, seed?, agentOptions?, setup?, signal? }): Promise<AgentHandle>` — programmatic create under the caller-supplied shared id. It awaits the unpublished setup transaction before returning; `meta` carries cwd/lineage/seed-boundary metadata and `seed` reconstructs a forked child prefix after the session boundary validates and snapshots the durable values. `signal` applies only until this promise settles. The resolved [`AgentHandle`](./README.zh.md#pkg-taskweaver-dsh-agent) owns exact teardown.
- `ctx.agents.resume({ resumeSessionId, agentOptions?, setup?, signal? }): Promise<AgentHandle>` — load a persisted session via `ctx.sessionPersistence` ([session persistence]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md`）), register the agent under that same id, reconstruct its history, then await setup against a fresh unpublished agent scope before rollback-covered publication. Turn numbering and derived history continue from the loaded log. Requires a session-persistence backend (NOT hard-injected — non-persistent demos still work; `resume` rejects with a clear error when persistence is absent). `signal` is creation-only. Returns an `AgentHandle`.

The config-driven `ctx.agentLoop.create()` path keeps its agent owned by the loop fiber (it discards the handle). For a programmatic agent, the handle holder is the only consumer-facing teardown capability; AgentLoop provider unload is the independent structural teardown edge, not another handle exposed to application code.

<a id="pkg-taskweaver-dsh-agent-loop--injected-services"></a>
##### Injected services

`agents`, `sessions`, `llm`, `tools`, `systemPrompt` — all five interface services.

<a id="pkg-taskweaver-dsh-agent-loop--invariant-companion"></a>
##### Invariant companion

The optional `@taskweaver/dsh-agent-loop/invariant` companion registers request reconstruction with `ctx.invariants`. The loop records each exact frozen request in the process-local identity set owned by `dsh-llm`; the companion then requires a live session and independently rebuilds the message boundary and folded request header from the log. Direct one-shot calls remain outside this contract even when callers freeze them or attach a session id.

<a id="pkg-taskweaver-dsh-agent-loop--configuration-schemastery"></a>
##### Configuration (schemastery)

```ts
interface Config {
  maxParallelToolCalls?: number // default 10; 1 is serial
  agents: Array<{
    id: string                 // required
    provider?: string
    model?: string
    maxTokens?: number         // positive per-request output-token cap
    resumeSessionId?: string   // load this persisted session instead of creating one
    cwd?: string               // optional workspace cwd for the fresh session
  }>
}
```

Configured agents start automatically. A model call requires both `provider` and `model`; `agent/request` may supply a missing pair before dispatch. An optional positive `maxTokens` seeds each conversation request's output cap and is logged in its request header. `maxParallelToolCalls` bounds every agent's rolling pool for parallel-safe calls and defaults to `10`; it is also the whole of the `agent-loop` Settings section, so a user layer over this entry caps the next tool group without a restart, and a value that is not a positive integer is refused at the write rather than at that group. `agents` is deliberately absent from that section — it is consumed once when the service starts, so a stored change could only look like it had an effect. `cwd` applies only to fresh sessions, while `resumeSessionId` retains persisted metadata. Configured agents use the deployment persona, and programmatic setup can shadow it per agent. This plugin supplies the per-agent `provider`, `model`, and `cwd` prompt variables; harness identity and deployment persona belong to `dsh-system-prompt`.

<a id="pkg-taskweaver-dsh-agent-loop--internal-concrete-driver"></a>
##### Internal concrete driver

The concrete `ReactLoopAgent`, its inbox, and run controls are package-internal. The package root exports only the plugin/service/config contract, and the package exports map exposes no `./src/*` escape hatch; lifecycle owners create agents through `ctx.agents` rather than naming, constructing, or starting driver internals. One prepared session can be claimed by only one concrete driver, and everything observable happens through session events and the `agent/*` event taxonomy.

The unified `send()` primitive routes content and source by (`target` × `wakeup`); `followup`/`steer`/`inject` are its fixed-preset aliases. `followup()` appends to the `next-turn` FIFO and wakes the driver, `steer()` appends to the `next-step` inbox and wakes it, and `inject()` appends to that same `next-step` inbox without waking it. At a turn boundary the driver opens the durable turn, then atomically claims pending next-step input plus one queued prompt; between steps it claims only next-step input. Claiming removes the batch through pure deletion splices and emits `agent/inbox/claimed { message, turn }` once per message. `agent/pre-step` then returns either rejection or the complete messages entering the proposed step. Rejection leaves the claimed batch removed and closes the turn without a step; input inserted after the claim remains pending, and idle injection waits until follow-up or steering wakes the driver.

Every inbox mutation publishes one normalized `agent/inbox/spliced` event before changing the live projection. Insertions, edits, removals, claiming, and cancellation replay through the same standard splice coordinates. Ordinary removals carry `outcome: 'canceled'` and emit `agent/inbox/discarded { message }`; claiming uses pure deletions with no outcome, after which the loop emits `agent/inbox/claimed`. Every insertion emits `agent/inbox/inserted { message }`. `MessageId` stays unique across both pending lists, and synchronous durable-event observers can reconstruct removed values from the pre-splice projection.

<a id="pkg-taskweaver-dsh-agent-loop--loop-lifecycle-agent-ts"></a>
##### Loop lifecycle (`agent.ts`)

The driver owns one agent for its lifetime and runs inside `ctx.agents.withInitiator(agent, ...)`. Package-private orchestration entry points recover the exact Agent, derive `agent.session` once, and let operation-local helpers capture it instead of forwarding the concrete driver or per-operation `Session` through shallow interfaces. A helper keeps an explicit `Session` when that is its actual interface, while creation, persistence load, unpublished setup, services, workers, processes, persistence, and wire protocols retain their explicit identities. The [agent service](./README.zh.md#pkg-taskweaver-dsh-agent--initiating-agent-scope) owns propagation, teardown, and detached-work rules.

Every provider call that reaches a successful finish appends exactly one `assistant/message` completion anchor, including content-less calls and `max-tokens` finishes. The anchor records the assembled content as-is, lists the exact chunk seqs in `sourceEventSeqs` (`[]` for a stream with no chunks), and includes usage when available; empty content stays out of derived message history. A turn cancellation that interrupts streaming also appends an `interrupted: true` anchor when non-empty text or reasoning has reached the user. The anchor cites those chunk seqs and places the rendered prefix in derived message history, so the next request contains what the user saw. Undispatched tool calls are omitted, and an empty or tool-only stream produces no anchor; provider failures still commit no assistant content ([decision]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-08-10-cancelled-stream-prefix-finalize.md`）).

After `agent/request` returns a provider/model call config, the loop asks `ctx.llm.prepareCall()` to validate adapter-owned fields and materialize configured reasoning-effort and output-token defaults under the active turn signal. The prepared call retains the exact adapter registration across this asynchronous resolution, `request/header` logging, and terminal dispatch, so HMR cannot mix one adapter's capability result with another adapter's request. The header records the effective config and which fields came from the adapter. Before the next waterfall, the loop removes those marked fields from the proposal so the current exact route rematerializes its own defaults; unmarked explicit settings persist across steps and route changes. A route with no registered adapter preserves the proposed config so an `llm/stream` listener can own and short-circuit it; unhandled terminal dispatch still fails with `NO_ADAPTER`. A new loop instance follows the same adapter-default marker rule when resuming.

Plugin failure ends the current turn, not the loop. Final adapter selection, dispatch, and iteration failures arrive from `ctx.llm` as terminal error or aborted finishes and enter `agent/request-error`; middleware, result processing, tools, and other extension failures remain thrown and close directly. Recovery receives request coordinates, immutable provider facts, the immutable retry policy captured by the prepared adapter registration, and the turn signal; the policy is absent when middleware owns an unprepared route. A handling listener returns `{ kind: 'retry' }`; an unhandled failure is terminal. AgentLoop owns one cancellation signal for the current admission or turn. An effective `cancel(cause)` clears pending work unless `keepInbox` is set and cooperatively aborts that signal; idle cancellation is a no-op. Waking input that lands after the abort fires but before the activity converges to idle is latched (`wakeRequested`) and replayed at the driver's own convergence boundary, so it runs without a further waking send; a `disposed` cancel never latches, and a wake submitted while already idle always opens its turn boundary (status shows a transient `idle → running → idle` pair even when the message was cleared). Durable `turn/end` records `aborted` for `user` and `parent`, while disposal records `disposed`; undispatched model tool calls receive synthetic `tool/call` and `ABORTED_BEFORE_DISPATCH` result pairs. The cancellation cause changes reporting, not how result context finalized after cancellation is handled. Disposal waits for signal-ignoring work before registry removal. The [explicit-cancellation decision]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-16-explicit-turn-cancellation.md`） and the [cancel-convergence wake latch]（原文链接目标：`../../../.agents/notes/implemented/bug-fix/2026-08-07-cancel-convergence-wake-latch.md`） own the lifecycle and race contract.

Within a step, exclusive calls form barriers; parallel-safe calls use a bounded rolling pool and are reclassified before start. Only dispatch/body overlaps. Policy, durable results, and result context remain model-ordered. Abort stops new calls, drains started results, and retains their finalized result context without distinguishing the cancellation cause. An internal scheduler failure stops new dispatches, waits for already-started dispatches, and reaches the turn error boundary without fabricating tool results.

<a id="pkg-taskweaver-dsh-agent-loop--what-belongs-to-plugins"></a>
##### What belongs to plugins

Everything that goes beyond "call the model, run the tools, repeat" belongs to plugins listening on the event taxonomy:
- Hooks and policy: the relevant `agent/*` checkpoints plus the guarded `tools/pre-execute` → `tools/execute` → `tools/post-execute` → definition-owned `finalizeContent` → `tools/result` pipeline; exact event signatures and modes live in the generated regions of [core.md]（原文链接目标：`../../../docs/subsystems/core.md#cordis-surface`） and [tools.md]（原文链接目标：`../../../docs/subsystems/tools.md#cordis-surface`）
- Compaction: pressure on `agent/pre-step`; canonical overflow repair on `agent/request-error`
- Model-request recovery: `dsh-llm-retry` records and waits exact-provider normal or unbounded backoff on `agent/request-error`, emits non-surface `llm/retry` status, then returns a retry action
- Sandbox, permission, plan mode: `tools/pre-execute` for extensible deny/ask, `tools.guard()` for monotonic owner policy, `tools/post-execute` for result decisions, and `tools/result` for final observation
- Sub-agents: implemented outside the loop as `ctx.subagents` providers; in-process providers use `ctx.agents.create()` and owned `AgentHandle` teardown, while generic [`ctx.jobs`](../jobs/jobs) plus [`dsh-tool-subagent`](../subagent/tool-subagent) own background collection.
- Persistence: eager write-behind from `session/event`; `session/flush` is an explicit observation barrier
- UI: `session/event` (assistant token stream, boundaries, tool activity) + `agent/*` control events (`agent/status`, `agent/created`/`agent/disposed`)

<a id="pkg-taskweaver-dsh-agent-loop--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-agent-loop--complete-conversation-request"></a>
##### Complete conversation request

<a id="pkg-taskweaver-dsh-agent-loop--what-the-model-sees"></a>
###### What the model sees

For each step, the loop sends the rendered per-agent system prompt, visible tool schemas, and the session's derived messages. It supplies `provider`, `model`, and `cwd` variable values but no additional fixed prose.

<a id="pkg-taskweaver-dsh-agent-loop--token-effect"></a>
###### Token effect

System text and schemas are paid again on every step. Per-agent scoping chooses the contributions, while the authoritative assembly waterfall can alter the final request and makes its listener responsible for protocol coherence.

<a id="pkg-taskweaver-dsh-agent-loop--kv-cache-effect"></a>
###### KV Cache effect

Append-only only while system text, schemas, and earlier history remain byte-identical under the same provider and model route. A token-bearing assembly rewrite or composition change may invalidate reuse from the first altered request token.

<a id="pkg-taskweaver-dsh-agent-loop--retained-message-history"></a>
##### Retained message history

<a id="pkg-taskweaver-dsh-agent-loop--what-the-model-sees-1"></a>
###### What the model sees

Accepted user messages, assistant messages, tool calls and results, injected context, and steering are logged and sent on later steps. Raw stream chunks, lifecycle boundaries, and other log-only events are excluded.

<a id="pkg-taskweaver-dsh-agent-loop--token-effect-1"></a>
###### Token effect

Input grows with every surface message until a compaction replacement shadows older nodes; a multi-step tool turn resends the accumulated history each step.

<a id="pkg-taskweaver-dsh-agent-loop--kv-cache-effect-1"></a>
###### KV Cache effect

Ordinary history growth is append-only and preserves reusable entries. A surface replacement or compaction invalidates reuse from the first shadowed history token.

<a id="pkg-taskweaver-dsh-agent-loop--undispatched-calls-after-cancellation"></a>
##### Undispatched calls after cancellation

<a id="pkg-taskweaver-dsh-agent-loop--what-the-model-sees-2"></a>
###### What the model sees

If a later request replays an aborted step, each tool call that cancellation prevented from dispatching has error code `ABORTED_BEFORE_DISPATCH` and result text `Error: tool call aborted before dispatch`.

<a id="pkg-taskweaver-dsh-agent-loop--token-effect-2"></a>
###### Token effect

One fixed error result per skipped call remains in history until compaction shadows it.

<a id="pkg-taskweaver-dsh-agent-loop--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; each synthetic result follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-agent-loop--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Classification is unary** — calls whose safety depends on comparing siblings or resources must remain exclusive ([rationale]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md`）).
- **Config labels are fresh by default** — omitting `sessionId` creates a fresh `${id}-session-<uuid>` on every startup; exact resume-or-create behavior requires an explicit stable `sessionId`, while `resumeSessionId` requires existing persisted history.
- **Config agents have no per-agent persona field or setup hook** — they use the deployment persona; scoped persona/tool composition is available only through the programmatic `ctx.agents.create()` / `resume()` factory options.
- **No built-in turn budget** — tool calls or steering continue the current turn; a policy that bounds runaway turns must cancel from an existing lifecycle extension point such as `agent/turn-stopping`.

<a id="pkg-taskweaver-dsh-agent-tool-presentation"></a>
### `@taskweaver/dsh-agent-tool-presentation`

<!-- migrated-from: packages/runtime/core/agent-tool-presentation/README.md -->
目录：`core/agent-tool-presentation`。
package.json 描述：Agent-plane presentation selector: composes one agent's tools as Code Mode, native, or both

<a id="pkg-taskweaver-dsh-agent-tool-presentation--dsh-agent-tool-presentation"></a>
The row an [agent preset](../preset/README.zh.md#pkg-taskweaver-dsh-agent-presets) carries to say which form of its tools the model sees: `native` (every schema), `code` (only `run_code` plus a generated TypeScript SDK), or `both`.

<a id="pkg-taskweaver-dsh-agent-tool-presentation--why-a-row-rather-than-a-registry"></a>
#### Why a row rather than a registry

The tool registry cannot move into a preset. Its consumers are all host-plane — [`dsh-agent-loop`](./README.zh.md#pkg-taskweaver-dsh-agent-loop) reads its scheduler, [`dsh-apiproxy`](../host/README.zh.md#pkg-taskweaver-dsh-host-apiproxy) reads its presenters to render tool cards, and every tool plugin registers into it — and a service only moves down when all of its consumers move with it.

What a preset can own is the **presentation** of that registry. `ctx.tools.presentAs()` declares it for the mounting agent alone, so a Code Mode session runs beside native ones in one process, each seeing its own catalog. The deployment's `mode` on the [`dsh-tools`](./README.zh.md#pkg-taskweaver-dsh-tools) row remains the default that agents declaring nothing get.

<a id="pkg-taskweaver-dsh-agent-tool-presentation--what-it-does"></a>
#### What it does

`native` applies immediately. A code mode instead waits for `ctx.codeRuntime`, which is a host-plane service ([`dsh-code-runtime-worker-thread`](../code-runtime/README.zh.md#pkg-taskweaver-dsh-code-runtime-worker-thread)): a preset selecting Code Mode against a deployment composing no runtime then holds this row pending, and `dsh-agent-presets` refuses the mount naming this id. The alternative — applying optimistically — moves the failure to the session's first request, where the operator can act on neither the preset nor the composition.

`mode` is required rather than defaulted, because a preset without this row already gets the deployment default; an omitted value would mean the row was composed for nothing.

One agent declares one presentation. A second declaration in the same composition is refused rather than merged: two answers to "which form does the model see" is a contradiction, not an override.

<a id="pkg-taskweaver-dsh-agent-tool-presentation--model-experience"></a>
#### Model Experience

Indirectly, through the projection it selects in `dsh-tools`: `code` presents `run_code` plus a generated SDK section and the rule that only `run_code` may be called directly, `native` presents every tool schema. The selection also decides what may EXECUTE: under `code` the registry resolves a model-direct call naming any other tool to `UNKNOWN_TOOL`, so this row is what keeps the announced surface and the callable surface the same for every agent it covers ([executor-collapse note]（原文链接目标：`../../../.agents/notes/implemented/bug-fix/2026-08-07-code-mode-executor-collapse.md`）).

<a id="pkg-taskweaver-dsh-agent-tool-presentation--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the presentation is fixed when the agent is composed, so its request prefix is stable for the session's life.

<a id="pkg-taskweaver-dsh-agent-tool-presentation--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **The runtime stays host-plane** — a preset can select Code Mode but cannot supply the TypeScript runtime it needs; a deployment that composes none can compose no code-mode preset.

<a id="pkg-taskweaver-dsh-scope"></a>
### `@taskweaver/dsh-scope`

<!-- migrated-from: packages/runtime/core/scope/README.md -->
目录：`core/scope`。
package.json 描述：Scoped-context registration primitive (scope tags, scope-filtered event dispatch) for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-scope--dsh-scope"></a>
Scoped registration primitive. `createScope(ctx, key)` creates a tagged Cordis context whose backing fiber owns every registration made through it. `scopeOf(ctx)` reads the tag, and `scopeTarget(base, key)` routes scoped events to listeners with the same key while leaving unscoped listeners global. Keys form an optional parent chain (`bindScopeParent`): registration views inherit DOWN it — a child scope sees its ancestors' layers, nearest shadowing farthest — and event admission extends UP it — a listener tagged with an ancestor receives a descendant key's events, never the reverse. The agent loop creates one scope per live agent and an agent preset's standing mount is a parent scope over its agents, but the mechanism is key-agnostic so lower-level packages can use it without depending on either.

<a id="pkg-taskweaver-dsh-scope--public-api"></a>
#### Public API

- `createScope(ctx: Context, key: ScopeKey, options?): Scope` Mint a scope under `ctx`'s fiber. Usable synchronously (effect collection is uid-gated; service resolution falls through to the minting plugin's dependency surface). The typed, same-process key is trusted; an inactive minting context still fails through Cordis (`INACTIVE_EFFECT`). `options.parent` binds the enclosing scope via `bindScopeParent` before the scope is usable; the binding stays internal.
- `bindScopeParent(key, parent): ScopeParentBinding` / `scopeParentOf(key)` / `scopeChainOf(key)` The parent relation behind both chain directions. Binding is once: a key that already has a parent throws, and only the returned binding's `rebind(parent)` may re-link it — the blank-session recompose operation, valid only while nothing produced under the old parent is retained (the holder's contract — this relation cannot see what a session logged). Both the bind and every rebind reject a link closing a cycle. `scopeChainOf` returns `[key, parent, …]` nearest-first.
- `Scope.ctx` The tagged context: registrations through it are scope-visible AND scope-lifetime. Derived contexts (an `extend`, a fiber mounted under it) inherit the tag; nested scopes shadow (nearest tag wins).
- `Scope.rawDispose` The EXACT Cordis disposer for the backing fiber — a composite (generator) effect yields THIS function to nest the scope's teardown at that yield position (Cordis dedupes nested effects by function identity; yielding a wrapper leaves the scope disposing as a concurrent sibling).
- `Scope.dispose(): Promise<void>` Idempotent, shared quiescence boundary for every registration made through the scope. Racing/repeat calls await the same teardown, including when `rawDispose` invoked the underlying single-shot Cordis disposer first.
- `scopeOf(ctx: Context): ScopeKey | undefined` The tag a context (or any context derived from it) carries; `undefined` = context-global.
- `scopeTarget(base: T, key: ScopeKey | undefined): Scoped<T>` Build the opaque dispatch `thisArg` for a scope-filtered event. It composes `base`'s existing `Context.filter` with the scope predicate (untagged listener ⇒ admitted; tagged ⇒ admitted iff its tag is the key or an ancestor of it; `key === undefined` ⇒ untagged only). The carrier contains routing state only; the real subject is carried by the event arguments. `{ global: true }` listeners bypass filtering (Cordis semantics).
- `Scoped<T>` The compile-time opaque carrier brand: scope-filtered events demand it as their `this` type, so dispatching with a bare subject is a compile error. The type parameter records the subject type but does not expose its properties.
- `isScopeCarrier(value)` / `carrierKeyOf(value)` Runtime carrier marks, used by the dev invariants to assert every scope-filtered dispatch carries a carrier keyed to the subject its arguments name.
- `ScopeLayer` Aggregate contract for one registry's complete global or exact-scope contribution; `isEmpty()` controls scoped-layer reclamation.
- `ScopedLayers<L>` Own one eager global layer and lazy exact-scope layers. `peek()` never creates and stays chain-blind (a scope's OWN contributions — restrictions, guards — must not silently pick up an ancestor's), `chainLayers()` returns existing overlays farthest-ancestor-first, `merge()` materializes insertion-ordered named shadows along the chain, and `effect()` derives visibility and ownership from the same context while returning the exact Cordis disposer.
- `NamedEntries<V>` Insertion-ordered named storage with caller-owned duplicate diagnostics, lookup, and live iteration within one nonempty table generation; draining the table detaches existing iterators from later insertions, and `insert()` returns an idempotent exact-entry undo.
- `AnonymousEntries<V>` Insertion-ordered anonymous storage whose unique internal keys keep equal values as independent registrations; it uses the same drained-generation iterator boundary, and `append()` returns an idempotent exact-entry undo.

The optional `@taskweaver/dsh-scope/invariant` companion owns that runtime assertion. It uses the generated `scoped-events.generated.ts` resolver map to require a carrier for every declared scoped event and, when the payload exposes its routing subject, require identity with the carrier key. The Program-backed generator derives the map from event declarations and real `scopeTarget(base, key)` calls.

<a id="pkg-taskweaver-dsh-scope--design-contract"></a>
#### Design contract

The registration context determines both visibility and ownership, preventing a registration from being visible in one scope but disposed with another. Scopes route trusted same-process plugins; they are not sandboxes or authority boundaries. See the [agent-scope Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.md#security-and-authority-are-non-goals`） for rationale and security non-goals.

Scope-aware services define a concrete `ScopeLayer` that aggregates their heterogeneous tables and domain helpers. `ScopedLayers.effect()` accepts one synchronous action returning one synchronous undo, installs that undo before optional notification, and reclaims an exact-scope layer only when the complete aggregate is empty. `notify` defaults to `true`; the supplied callback owns whether observer failures throw or are contained. `EntryValues` remains internal, the storage classes are imported from the package root rather than a `/store` subpath, and the shared storage does not define registry-specific filtering or iteration policy. See the [shared scoped-layer storage Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-12-scoped-layers-store.md`）.

Handing out a scoped context hands out the minting plugin's service-resolution API (resolution walks the minting fiber's dependency chain, not the holder's) — mint it from the plugin whose dependencies the scoped registrations need to resolve.

<a id="pkg-taskweaver-dsh-scope--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Only scope-aware APIs isolate state** — registries must file by `scopeOf()` and events must dispatch through `scopeTarget()`; an arbitrary Cordis service remains context-global merely because it is called through a scoped context.
- **A context carries one nearest scope key** — the hierarchy lives in the key-level parent relation, not in context tags; nested scope CONTEXTS still shadow to a single tag, and multi-membership policy sets remain unsupported.
- **Service reachability comes from the scope minter** — handing out `Scope.ctx` also hands out the minting plugin's injected services, so a broader minter cannot later be narrowed by the holder.

<a id="pkg-taskweaver-dsh-session"></a>
### `@taskweaver/dsh-session`

<!-- migrated-from: packages/runtime/core/session/README.md -->
目录：`core/session`。
package.json 描述：Event-sourced session store for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-session--dsh-session"></a>
Event-sourced session log and in-memory store. A `Session` is the append-only source of truth for an agent's whole interaction history — the LLM message history is *derived* from it. A **surface** layer (an ordered projection of message-producing events) is maintained on top of the raw log for efficient derivation and compaction.

The optional `@taskweaver/dsh-session/invariant` companion registers this package's relational trace checks with `ctx.invariants`: monotonic sequence numbers, turn/step enclosure, and same-step tool call/result pairing. It replays existing sessions when loaded or reloaded; storage validation, snapshotting, freezing, cited source-event validation, and surface acceptance remain always-on responsibilities of the root session package.

<a id="pkg-taskweaver-dsh-session--service-sessionstore-ctx-key-sessions"></a>
#### Service: `SessionStore` (ctx key: `sessions`)

Creates and holds event-sourced `Session` instances. Persistence is intentionally not implemented here — plugins subscribe to `session/event`, flush on `session/flush`, and may mirror the paired `session/created`/`session/disposed` lifecycle.

<a id="pkg-taskweaver-dsh-session--public-api"></a>
##### Public API

- `ctx.sessions.create(id?, { seed?, meta? }?)` validates and detaches durable seed/header data, fills the version and id, defaults `createdAt` to now, publishes the session, and binds it to the calling fiber. Persisted reconstruction supplies its original `createdAt`, `seedLength`, and `delegationDepth`.
- `ctx.sessions.flush(session)` dispatches the awaited parallel durability checkpoint through the session's captured scope. Every listener starts and the call waits for all to settle before reporting failure; unpublished, detached, and stale objects reject.
- `ctx.sessions.fork(source, boundary?, childSessionId?): Session` — Resolve a live session object or id, select a seed through the inclusive `boundary` event seq (default: current last event), require that prefix to end outside an open turn, and create a live child session with lineage metadata.
- `ctx.sessions.get(id: SessionId): Session | undefined`
- `ctx.sessions.list(): Session[]`

<a id="pkg-taskweaver-dsh-session--advanced-ordered-teardown-lifecycle-primitives"></a>
###### Advanced: ordered-teardown lifecycle primitives

Use the split lifecycle only when teardown must be ordered with another resource:

- `prepare(id?, options?)` validates and constructs without publication.
- `enter(session)` performs the collision check, publishes without announcing, and returns an entry-bound idempotent detach. Concurrent same-id preparations are allowed, but only one entry succeeds; a stale detach cannot remove its replacement.
- `announce(session)` emits the single creation edge and rejects repeat or reentrant announcements. Detach during that dispatch is deferred and later emits the paired disposal edge; an unannounced entry emits neither lifecycle edge.

`dsh-agent-loop` uses this split so final loop flush precedes session detach; see the [ownership Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-18-agent-lifecycle-and-ownership-contracts.md`）.

<a id="pkg-taskweaver-dsh-session--live-service-events"></a>
##### Live service events

The store pairs announced creation with disposal, publishes post-commit append notifications with per-listener containment, and provides an awaited durability checkpoint. Exact signatures and scope behavior live in the generated region of [session.md]（原文链接目标：`../../../docs/subsystems/session.md#cordis-surface`）; payloads live in the [persistence catalog]（原文链接目标：`../../../docs/persistence-catalog.md`）.

<a id="pkg-taskweaver-dsh-session--class-session"></a>
##### Class: `Session`

Plain class (not a Cordis Service). Create live sessions through `ctx.sessions.create()` and detached replay or inspection sessions through `Session.create()`; the detached factory does not publish lifecycle events or bind the session to a fiber.

- `session.append(type, data, opts?)` snapshots and freezes durable data and surface metadata, validates marker shape, cited source-event seqs, complete replacement coverage, and content-only single-result `tool/result` rewrites, commits synchronously, then notifies observers with independent failure containment. Reentrant attached-session appends reject, and runtime checks cover widened unions and loaded logs.
- `session.deriveMessages()` incrementally projects each new surface entry once and returns a fresh array over the complete identified, frozen messages stored by those entries. Assistant messages preserve the provider and model that produced them plus adapter-private replay state in their model source. A surface rewrite rebuilds the projection; there is no raw-log fallback.
- `session.deriveEventMessage(event)` is the canonical per-event projection used by reconstruction and request checks.
- `session.surface` exposes the readonly `SessionSurface` view owned by the session's single incremental surface manager; `replaceGeneration` changes on every committed rewrite.
- `session.events` is a cached frozen snapshot invalidated by append; accepted events remain deeply frozen.
- `session.seq`, `session.id` — current sequence and readonly typed identity.
- `session.header: SessionHeader` — detached, deep-frozen creation metadata (`version`, `id`, `createdAt`, optional `cwd`/`parentSession`/`seedLength`/`delegationDepth`). Construction validates the durable record and requires its id to match `session.id`.

<a id="pkg-taskweaver-dsh-session--lossless-json-utilities"></a>
##### Lossless JSON utilities

Durable values need one accepted representation, not a check followed by a second read. `isJsonValue(value)` is the boolean predicate; `snapshotJsonValue(value)` iteratively validates and copies a plain value in one pass, returning `undefined` for invalid input and propagating a throwing getter. The snapshot helper accepts finite JSON numbers except `-0` (JSON rewrites it to `0`), dense ordinary arrays, and plain or null-prototype objects; it rejects cycles, unsupported scalars, and exotic prototypes before normalization without imposing a call-stack depth limit.

Session-event import separates ownership from message validation. `snapshotSessionEvent(event)` clones a borrowed event before validating and freezing its identified message. `adoptSessionEvent(event)` performs the same message work in place and returns the original event; callers may use it only when they transfer an exclusively owned object graph with no mutable child shared with another event.

<a id="pkg-taskweaver-dsh-session--chunk-row-storage-codec-chunk-rows-ts"></a>
##### Chunk-row storage codec (`chunk-rows.ts`)

The shared [storage codec](./session/src/chunk-rows.ts) losslessly converts event sequences to compact rows and back. It preserves unrecognized events verbatim and rejects malformed encoded rows; persistence backends decide whether to enable packed writes.

<a id="pkg-taskweaver-dsh-session--surface-types"></a>
##### Surface types

This package owns ordered surface projection, replacement validation, replay, and the type guards that distinguish append-origin from replacement events. The [surface type catalog]（原文链接目标：`../../../docs/subsystems/session.md#surface-types`） owns the exact shapes and field semantics. A human transcript must project append-origin events rather than `session.surface`, because landed replacements shadow history the reader already saw; model-facing consumers continue to read `session.surface`.

<a id="pkg-taskweaver-dsh-session--request-header-reconstruction-request-header-ts"></a>
##### Request-header reconstruction (`request-header.ts`)

`request/header` records a full canonical snapshot of the non-history request envelope with reason `initial`, `resume`, or `change`. Its optional `adapterDefaults` map marks effective `reasoningEffort` or `maxTokens` values materialized by exact-model resolution, allowing the next request proposal to distinguish them from explicit conversation settings. `foldRequestHeader()` selects the latest snapshot; legacy delta events and the removed `fallback` reason are rejected. See the [reconstructable-requests Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md`）.

A `user/message` stores the complete `UserMessage` directly, including the identity created before inbox routing or step entry. It renders its `content` verbatim whether it is a direct human prompt, a synthetic injection, or an entered goal round; its typed `source` is the only channel that tells them apart and carries any domain-specific durable facts. `assistant/message` and `tool/result` likewise store complete message values. Turn execution remains enclosed by `turn/start` and `turn/end`; `agent.inject()` queues input until a later pre-step claims it and returns it in an enter decision.

`tool/result` persists one identified user-role tool-result message, optional internal failure identity, and optional presentation metadata. A tool's successful canonical `value` and human-readable canonical failure message remain execution-local; rendered error content is the replay-authoritative message.

<a id="pkg-taskweaver-dsh-session--session-event-vocabulary-types-ts"></a>
##### Session event vocabulary (`types.ts`)

The generated [persistence log event catalog]（原文链接目标：`../../../docs/persistence-catalog.md`） enumerates each append-only event type with its payload, surface badge, and declaration site. Token accounting reads per-step `assistant/chunk { type: 'usage' }` records and treats `assistant/message.usage` as the committed-step fallback when no usage chunk exists; failed model-request attempts have no assistant message. Each `assistant/message` records the provider, model, and optional replay state.

Merge-extensible via `SessionEventMap` — a plugin declaration-merges its own types (the compaction seam's `compaction/*`, bounded recovery's non-surface `llm/retry`, the hook bridges' `hook/*`); merged members appear in the same catalog. A plugin owns the relational invariant for its merged events, including whether a log-only event may appear between turns. A producer that requires durability appends through `Session` and then awaits `ctx.sessions.flush(session)` without fabricating an execution turn.

Also defines `TurnEndReasonMap`, the merge-extensible `kind`-tagged sum type for turn endings. `turn/start` carries only the turn number; the following entered `user/message` batch records its input, while `llm/retry` records request recovery.

An interrupted live turn ends with `{ kind: 'aborted', reason: AgentCancelCause }`, preserving the typed cancellation cause in the durable transcript. Persistence imports the coarse aborted outcome from the supported older format as `{ kind: 'aborted', reason: { kind: 'legacy' } }`, because that record did not retain its caller. A turn failure carries `{ kind: 'error', error }`; crash recovery alone synthesizes `{ kind: 'interrupted' }`.

Every `SessionEvent` carries three optional top-level fields (structural metadata):

- `sourceEventSeqs?: number[]` — seq numbers of earlier events cited as sources (e.g., the `assistant/chunk` seqs behind an `assistant/message`, or the shadowed entries behind a compaction replacement entry). On `assistant/message`, a present `[]` records a known empty provider stream, while omission means a legacy or foreign event did not record the source stream; other surface events require a non-empty list when this field is present.
- `surfaceOp?: SurfaceOp` — how this event entered the surface. Absent for non-surface events (boundaries, chunks, usage, errors).
- `ignorable?: true` — marks an event a reader may safely skip when it does not recognize the type; absent means required, so an unknown-type event refuses session reconstruction ([mechanism]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md`）).

<a id="pkg-taskweaver-dsh-session--metadata-types-types-ts"></a>
##### Metadata types (`types.ts`)

- `SessionHeader` — session metadata written once when published as `Session.header`, where detachment and deep-freezing enforce immutability at runtime: `{ version, id, createdAt, cwd?, parentSession?, seedLength?, delegationDepth? }`. Persistence loaders may return mutable detached copies of the same data type. Owned here (beside `SessionId`) because `Session.header` is typed by it; persistence backends re-export it rather than own it (which would force a package cycle).

<a id="pkg-taskweaver-dsh-session--extension-points"></a>
##### Extension points

- Persistence plugins: subscribe to `session/event` (write-behind) and drain on `session/flush` (awaited) and fiber dispose. A durable backend reads the log and reloads it into a live session; the metadata contract (`SessionHeader`, `session.header`) is what such a backend stores beside the log.
- Replay/fork: `create(id, { seed })` validates and freezes a contiguous current-format log and rebuilds its surface; request headers require provider/model, and assistant messages require provider/model provenance. Persistence owns read compatibility before constructing this current-format seed. `fork(source, boundary?, childSessionId?)` selects a completed-turn prefix and records lineage.
- Compaction: `dsh-compaction-basic` appends a `user/message` replacement for summary checkpoints, while `dsh-compaction-tool-result-pruner` appends a content-only `tool/result` replacement. Tool-pairing boundary policy and its cache belong to the [`dsh-compaction` seam](../compaction/README.zh.md#pkg-taskweaver-dsh-compaction), while this package owns ordered surface membership, replacement validation, and `replaceGeneration`.

<a id="pkg-taskweaver-dsh-session--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-session--derived-message-history"></a>
##### Derived message history

<a id="pkg-taskweaver-dsh-session--what-the-model-sees"></a>
###### What the model sees

The model receives the complete messages from `user/message`, `assistant/message`, and `tool/result` surface entries verbatim. Their identities, roles, sources, and content blocks are the same values established at creation; projections do not mint identities. Direct prompts and injected context remain separate `user/message` events whose sources preserve their provenance. A prompt envelope changes only human presentation; its prefix context and request delimiter are already present in the event content. Tool calls live inside assistant messages. Chunks, boundaries, usage, hook records, todo records, and other log-only events add no message.

<a id="pkg-taskweaver-dsh-session--token-effect"></a>
###### Token effect

Appended surface entries are resent on later steps. A `replace` surface operation removes the shadowed entries from future inputs without deleting their raw log records.

<a id="pkg-taskweaver-dsh-session--kv-cache-effect"></a>
###### KV Cache effect

Appended surface entries preserve reusable prefixes. A `replace` operation invalidates reuse from the first shadowed message even though the underlying event log stays append-only.

<a id="pkg-taskweaver-dsh-session--crash-repair-result"></a>
##### Crash-repair result

<a id="pkg-taskweaver-dsh-session--what-the-model-sees-1"></a>
###### What the model sees

If recovery finds an assistant tool request with no durable `tool/call`, its synthetic `TOOL_NOT_STARTED` result says `The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.` If a durable `tool/call` has no result, its `TOOL_OUTCOME_UNKNOWN` result says `The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly.`

<a id="pkg-taskweaver-dsh-session--token-effect-1"></a>
###### Token effect

Zero tokens in an intact session. Each repaired call adds its retained risk-specific error text on resume.

<a id="pkg-taskweaver-dsh-session--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-session--logged-request-header"></a>
##### Logged request header

<a id="pkg-taskweaver-dsh-session--what-the-model-sees-2"></a>
###### What the model sees

The session reconstructs the system prompt, tool schemas, call config, and session prefix that the loop actually sent. Header events do not add a second copy to message history; the prefix is prepended outside `deriveMessages()`.

<a id="pkg-taskweaver-dsh-session--token-effect-2"></a>
###### Token effect

Zero duplicate tokens from logging. The reconstructed prefix, system text, and schemas still incur their normal per-request cost.

<a id="pkg-taskweaver-dsh-session--kv-cache-effect-2"></a>
###### KV Cache effect

Logging causes no invalidation, and exact reconstruction preserves request-prefix identity. A later header with changed prefix, prompt, or schemas may invalidate reuse from its first difference.

<a id="pkg-taskweaver-dsh-session--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Session branching/tree** (pi-style entry tree) — deferred unless needed beyond boundary-based `fork()`.
- **`fork()` cuts only at stable boundaries of live sessions** — the selected prefix must end outside an open turn and the source must be in the store; forking a persisted-but-unloaded session is excluded from the [fork API]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-06-30-session-store-fork-api.md`）.
- **`SESSION_FORMAT_VERSION` stays pinned at `0`** — pre-release, no broad compatibility implied: `Session` accepts only current seed shapes, and a backend refuses any other version naming the direction (newer: "written by a newer harness — upgrade"; older: no upgrade path ships yet). Unknown event types refuse the same way unless marked `ignorable` in the envelope; the versioning mechanism is the [session-log-version-mechanism note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md`）. Narrow storage import upgrades belong to the persistence boundary ([policy]（原文链接目标：`../../../AGENTS.md`）, [pre-identity message recovery]（原文链接目标：`../../../.agents/notes/implemented/bug-fix/2026-07-28-load-pre-identity-session-messages.md`）).
- **`TurnEndReasonMap` omits the ACP-named `refusal` / `max_turn_requests` variants** — producer-gated: they land when an adapter or the loop first emits them.

<a id="pkg-taskweaver-dsh-system-prompt"></a>
### `@taskweaver/dsh-system-prompt`

<!-- migrated-from: packages/runtime/core/system-prompt/README.md -->
目录：`core/system-prompt`。
package.json 描述：System prompt assembly registry for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-system-prompt--dsh-system-prompt"></a>
System prompt assembly registry. Plugins contribute ordered sections, tool schemas, and named variables. The loop assembles once per step and renders the result as the complete model prompt. This plugin owns the static harness identity and global deployment persona; an agent-scoped persona shadows the global default.

<a id="pkg-taskweaver-dsh-system-prompt--config"></a>
#### Config

| Key | Default | Meaning |
|---|---|---|
| `includeHarnessIdentity` | `true` | Include the fixed `You are an AI agent powered by DeepSeek Harness.` order-−100 opener. Set false only when a compatibility deployment owns the complete system prompt. |
| `includeRuntimeContext` | `true` | Include ordered dynamic contexts in assembly. When false, context providers are not evaluated and contexts added by `system-prompt/assemble` listeners are discarded after the waterfall; other services and their enforcement remain active. |
| `persona` | `''` | The global deployment-persona default: the ONE config-authored prompt fragment, rendered as the order-0 `deployment:persona` section unless an agent-scoped contribution shadows it. A template — complete `{{…}}` groups are interpreted strictly against the registered variables (the shipped loop registers `{{model}}`/`{{cwd}}`), with no escape syntax for literal braces yet. Empty ⇒ the section is dropped at render. |
| `toolOrder` | — | Explicit model-facing tool order, as a list of `ToolSchema.name`s with one `'<unlisted-tools>'` rest entry (`TOOL_ORDER_REST`): listed tools take their listed position, unlisted tools land at the rest entry in lexicographic name order. Absent ⇒ plain lexicographic name order. Applied to the collected tools BEFORE the `system-prompt/assemble` waterfall — like the sections' `order` sort, it canonicalizes what the registry contributed (registration order is a plugin-load artifact), and a waterfall listener that mutates the list owns the determinism of what it emits. Misconfiguration fails loud: a list without exactly one rest entry, or with duplicates, throws at load; a listed name with no registered tool rejects every `assemble()`; a tool provider returning the reserved rest-entry name also rejects. Under the shipped loop the turn fails before any model request. Why a central list and not per-plugin weights: [Explicit model-facing tool order]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-06-explicit-tool-order.md`）. |

<a id="pkg-taskweaver-dsh-system-prompt--service-systemprompt-ctx-key-systemprompt"></a>
#### Service: `SystemPrompt` (ctx key: `systemPrompt`)

<a id="pkg-taskweaver-dsh-system-prompt--public-api"></a>
##### Public API

- `ctx.systemPrompt.section(section: PromptSection): () => void` Contribute a section. The layer is the calling context's scope: `agent.ctx` contributes to that agent alone, shadowing a same-named global section there. A `complete: true` section becomes the exact complete prompt after the assembly waterfall; more than one effective complete section rejects assembly. Duplicate names within one layer and non-finite orders throw. Disposed with the calling fiber.
- `ctx.systemPrompt.context(context: PromptContext): () => void` Contribute ordered dynamic context for the calling scope. Providers are evaluated for each eligible assembly and become a sourced runtime-context snapshot in model history under the shipped loop.
- `ctx.systemPrompt.suppressRuntimeContext(): () => void` Suppress every dynamic-context contribution for the calling scope. Multiple registrations compose independently; disposing the returned effect restores context when no suppressor remains.
- `ctx.systemPrompt.tools(provider: (context: AssembleContext) => ToolProviderResult): () => void` Contribute tool schemas, evaluated at each assembly with that assembly's context. `ToolProviderResult` = `{ schemas, knownNames? }`: `schemas` is the post-restriction visible set; `knownNames` is the pre-restriction universe used by `toolOrder`. A provider must not return a schema named `TOOL_ORDER_REST`. Scoped providers are consulted only for their scope's assemblies. Disposed with the calling fiber.
- `ctx.systemPrompt.variable(name: string, provider: (context) => string | undefined): () => void` Contribute a prompt variable, referenced from section text as `{{name}}`. Scoped variables shadow a same-named global for that agent. Duplicate-in-layer or unreferenceable names throw; `undefined` means "no value for this assembly". Disposed with the calling fiber.
- `ctx.systemPrompt.assemble(context?: AssembleContext): Promise<PromptAssembly>` Assemble the prompt for one caller: the global layer merged with `context.scope`'s layer, with tool schemas detached before the transform waterfall. Runs through the scope-filtered `system-prompt/assemble` waterfall, then restores an effective complete section as the sole prompt section and enforces any active runtime-context suppressor. An optional `context.signal` explicitly controls this assembly request; providers and listeners may cooperate with it but must not retain it for another turn. Rejects for multiple complete sections, when a configured `toolOrder` names a tool outside the providers' `knownNames` universe, or when a provider returns the reserved rest-entry name.

<a id="pkg-taskweaver-dsh-system-prompt--live-events"></a>
##### Live events

`system-prompt/assemble` is authoritative for ordinary sections; a complete section is the final prompt constraint applied after the waterfall. Listeners that replace entries must preserve any active Code Mode or structured-output protocol. Use [`ToolRuntime.restrict()`](./README.zh.md#pkg-taskweaver-dsh-tools) when filtering must stay aligned across presentation, lookup, and execution. Registry-change notifications are unfiltered. The generated region of [system-prompt.md]（原文链接目标：`../../../docs/subsystems/system-prompt.md#cordis-surface`） owns signatures and dispatch contracts.

<a id="pkg-taskweaver-dsh-system-prompt--key-types"></a>
##### Key types

- `AssembleContext` — what one `assemble()` call is FOR. Merge-extensible; declares `scope?: ScopeKey` (the layer selector) and `signal?: AbortSignal` (the explicit request control capability) here, while `dsh-agent` declares `agent?: Agent` (the typed DX field — never set without `scope`; use `assembleContextFor(agent, signal)`). Providers must tolerate absent fields because a bare `assemble()` carries an empty, scope-less, signal-less context. `signal` is a request value, not part of the ambient Agent execution frame.
- `PromptSection` — `{ name, order, text, complete? }`. Sections are concatenated in ascending `order`. Order bands: `-100` is the harness identity, `0` the deployment persona, tool guidance uses `100–199`. One effective `complete` section suppresses all other sections after cooperative assembly.
- `PromptAssembly` — `{ sections: AssembledSection[], tools: ToolSchema[], variables: Record<string, string | undefined> }`. Section texts arrive resolved but not yet interpolated; `variables` holds every registered variable resolved against the context. Tool schemas are part of the assembly by design: "what the model is told it can do" is one coherent thing, even though adapters transmit schemas as a separate wire field.
- `renderPrompt(assembly)` — interpolates `{{variable}}` references in each section, drops empty sections, joins with blank lines. STRICT: an unknown reference (`Object.hasOwn` lookup — prototype names like `{{constructor}}` are unknown), a registered-but-valueless reference, a malformed complete `{{…}}` group, or a `{{` that opens no complete group while a `}}` still follows (`{{{model}}}`) throws — fail loud beats shipping a malformed prompt. A lone `{{` with no `}}` anywhere after it passes through verbatim; substituted values are never re-scanned.

Merge-extensible: plugins can declare extra fields on `PromptAssembly` and `AssembleContext` via declaration merging.

<a id="pkg-taskweaver-dsh-system-prompt--extension-points"></a>
##### Extension points

- Section providers: tool packages own their cross-call guidance (`tool:bash`, `tool:read`, …); this plugin owns `harness:identity` and `deployment:persona`.
- Variable providers: the agent loop registers `model` and `cwd`; any plugin can register the facts it owns (a future `date`, git state, …).
- Tool schema providers: `ToolRuntime` registers itself as a tool provider automatically.
- The [`system-prompt/assemble` waterfall](README.zh.md#pkg-taskweaver-dsh-system-prompt--live-events): cooperatively mutate or replace the assembly per caller before any complete-section constraint is enforced.

Design rationale: [the prompt-variables Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.md`）.

<a id="pkg-taskweaver-dsh-system-prompt--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-system-prompt--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-system-prompt--what-the-model-sees"></a>
###### What the model sees

By default every assembly starts with the harness identity below, then the configured persona and ordered plugin sections after strict variable interpolation. `includeHarnessIdentity: false` omits only that fixed opener. Empty sections disappear; scoped sections and variables can shadow globals for one agent. The `system-prompt/assemble` waterfall determines the delivered prompt and tool schemas unless one effective section declares itself complete; that exact section then becomes the whole system prompt while the waterfall's contexts, tools, and variables remain. Ordered dynamic contexts are separate from system-prompt sections and become sourced user-role snapshots only when present. `includeRuntimeContext: false` or a scoped suppressor removes all such contexts, including listener additions, without disabling the services that own the underlying policy or state.

<a id="pkg-taskweaver-dsh-system-prompt--harness-identity"></a>
###### Harness identity

```markdown
You are an AI agent powered by DeepSeek Harness.
```

<a id="pkg-taskweaver-dsh-system-prompt--token-effect"></a>
###### Token effect

Identity is a fixed per-request cost when enabled. Persona and plugin text are repeated per request and scale with their rendered content.

<a id="pkg-taskweaver-dsh-system-prompt--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while identity, persona, variables, section text, and order render identically. Any change may invalidate reuse from the first changed system-prompt token.

<a id="pkg-taskweaver-dsh-system-prompt--tool-schemas"></a>
##### Tool schemas

<a id="pkg-taskweaver-dsh-system-prompt--what-the-model-sees-1"></a>
###### What the model sees

For shipped tools, the model receives the per-agent-visible subset of the [generated tool schemas]（原文链接目标：`../../../docs/tool-catalog.md#tool-package-map`）, ordered by configuration or lexicographically after restrictions and assembly interception. Extensions can contribute additional definitions through the same registry. Sections and schema providers are separate assembly inputs, so a tool restriction does not remove independently registered guidance.

<a id="pkg-taskweaver-dsh-system-prompt--token-effect-1"></a>
###### Token effect

Schema tokens repeat on every request. Restricting a tool removes its entire schema cost for that agent but not a separate prompt section; reordering changes cache shape but not semantic content.

<a id="pkg-taskweaver-dsh-system-prompt--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while the visible schema set, rendering, and order are unchanged. Registration, restriction, or reordering may invalidate reuse from the first changed schema token.

<a id="pkg-taskweaver-dsh-system-prompt--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Deployment-authored prompt text is config/composition only** — this plugin owns the global persona default, creator plugins may register agent-scoped shadows, and other sections come from the plugin that owns the fact; there is no end-user prompt-editing API.
- **No escape syntax for literal `{{…}}` braces** — every complete group is interpolated against registered variables; an escape is deferred until a real prompt needs one.
- **`toolOrder` misconfiguration surfaces at prompt assembly (the first turn), not at boot** — only shape violations throw at config load.
- **Sections sharing an `order` value tie-break by registration order** — a plugin-load artifact; determinism relies on the distinct-order band convention, unlike the canonicalized tool order.

<a id="pkg-taskweaver-dsh-tools"></a>
### `@taskweaver/dsh-tools`

<!-- migrated-from: packages/runtime/core/tools/README.md -->
目录：`core/tools`。
package.json 描述：Tool registry and execution pipeline for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-tools--dsh-tools"></a>
Tool registry and execution pipeline. Tool plugins register their schemas and executors; the agent loop executes each call through `tools/pre-execute` (the extensible allow/deny gate) → monotonic registered guards → `tools/execute` (an around-dispatch wrapper for timeout/retry/metrics plugins) → `tools/post-execute` (inspect/replace the result, attach context) → the definition-owned `finalizeContent` boundary → the observe-only `tools/result` notification. The registry also owns HOW its tools are presented to the model — its `mode` config selects native function calling, [Code Mode](README.zh.md#pkg-taskweaver-dsh-tools--code-mode), or both, and one agent shadows that default for itself with `presentAs`.

<a id="pkg-taskweaver-dsh-tools--service-toolruntime-ctx-key-tools"></a>
#### Service: `ToolRuntime` (ctx key: `tools`)

<a id="pkg-taskweaver-dsh-tools--config"></a>
##### Config

```yaml
tools:
  mode: native   # native (default) | code | both
```

`native` contributes visible tools as function definitions. `code` contributes the reserved `run_code` transport, the generated `tools:sdk` section, and the `tools:code-only` rule stating that only `run_code` may be called directly — which the executor then enforces, resolving a model-direct call naming any other tool to `UNKNOWN_TOOL` before policy runs; `both` contributes both forms and states no such rule, because its native calls do execute. This is the default for agents that declare none of their own — an agent preset selects its own with [`dsh-agent-tool-presentation`](./README.zh.md#pkg-taskweaver-dsh-agent-tool-presentation). The reserved transport cannot be registered, shadowed, restricted, or removed, and its name is reserved whatever the configured mode, because any agent may select a code mode. Non-native modes require a `ctx.codeRuntime` whose `language` has a registered SDK renderer — TypeScript ships via [`dsh-code-runtime-worker-thread`](../code-runtime/README.zh.md#pkg-taskweaver-dsh-code-runtime-worker-thread); a Python renderer is built in and drives any runtime that reports `language: 'python'` (a first-party `dsh-code-runtime-python` backend is delivered separately). A runtime language with no renderer fails prompt assembly loudly, and a `systemPrompt.toolOrder` entry for a tool the mode does not contribute rejects prompt assembly. A `system-prompt/assemble` listener may replace the registry's contributions; its returned assembly is authoritative, so that listener owns preserving a usable Code Mode protocol.

<a id="pkg-taskweaver-dsh-tools--public-api"></a>
##### Public API

- `ctx.tools.register(definition: ToolDefinition): () => void` Register a trusted typed same-process definition with a mandatory canonical `output` declaration. The layer is the calling context's scope: a plain plugin context registers globally; an agent's `agent.ctx` registers for that agent alone, shadowing a same-named global tool there. Duplicate names within one layer throw; non-native modes also reject the reserved `run_code` transport name. Missing or unsupported output declarations and a non-positive or non-finite `timeoutMs` fail at registration. The optional synchronous `finalizeContent` callback is snapshotted when a call starts and may replace only final model-facing content after every pipeline outcome is normalized, including an error discovered while materializing another result field. Disposed with the calling fiber.
- `ctx.tools.presentAs(mode: ToolPresentationMode): () => void` selects this agent's model-facing presentation, shadowing the `mode` config for that agent alone; it throws from a plain context (a process-wide presentation is the config field) and from a second declaration in the same scope. A code mode also registers that agent's own `tools:sdk` section. The catalog is unchanged — `schemas(agent)` still reports the agent's capabilities; only the assembly's tools collapse. Disposed with the calling fiber.
- `ctx.tools.restrict(filter)` applies an agent-scoped allow/deny mask to global tools and throws from a plain context. The filter is snapshotted at registration; multiple masks intersect and scope-local tools merge afterwards. Deny masks admit later unnamed globals, while allow masks exclude later names. Unknown, local, or reserved names and empty filters reject. This is live visibility composition, not an authority boundary; see the [scope security non-goal]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.md#security-and-authority-are-non-goals`）.
- `ctx.tools.get(name: string, scope?: ScopeKey): ToolDefinition | undefined` Resolution as one scope sees it (shadowing applied; a restricted-away global reads as absent) — presenters pass the calling agent so the card matches what executed.
- `ctx.tools.schemas(scope?: ScopeKey): ToolSchema[]` Schemas of everything the scope can see (without the `execute` functions). The shipped tools' schemas are catalogued in [docs/tool-catalog.md]（原文链接目标：`../../../docs/tool-catalog.md`）, generated by booting each tool plugin and harvesting this method (see [the tool-schema-catalog Agent Note]（原文链接目标：`../../../.agents/notes/implemented/process/2026-07-02-tool-schema-catalog.md`）).
- `ctx.tools.guard(guard: ToolGuard): () => void` Register a monotonic synchronous execution guard after `tools/pre-execute`: returning a reason denies the call, while `undefined` leaves it unchanged. A plain-context guard applies globally; an `agent.ctx` guard applies only to that agent. Later waterfall listeners cannot turn a guard denial back into permission. Disposed with the calling fiber.
- `ctx.tools.execute(exec)` losslessly snapshots and freezes arguments, assigns an opaque token, runs the complete policy/dispatch/result pipeline, then independently snapshots the authoritative outcome before final observation. Invalid arguments use the same result path without reaching policy or the body. Around wrappers may replace only `signal`; the registry re-fuses the original caller signal immediately before the body.
- `ctx.tools.executionMode(exec)` returns `parallel` only when the visible definition's `isConcurrencySafe(exec.arguments)` classifier returns exactly `true`; unknown, hidden, undeclared, invalid, or throwing classifications are exclusive.

<a id="pkg-taskweaver-dsh-tools--injected-services"></a>
##### Injected services

`SystemPrompt` — the registry automatically feeds its tool schemas into the system-prompt assembly via `ctx.systemPrompt.tools()`. The approval seam is consumed opportunistically instead (`ctx.get('approval')`, no static inject): a deployment without it keeps the ask→deny degrade, and the registry stays active either way.

<a id="pkg-taskweaver-dsh-tools--cancellation"></a>
##### Cancellation

Cancellation is cooperative and quiescent. Every typed invocation supplies a caller-owned `AbortSignal`; tool bodies receive it as required readonly `exec.signal`, while only `tools/execute` wrappers may temporarily replace the required signal. The registry preserves caller cancellation through replacement and never races away from a started same-process promise. Cancellation before body invocation is `ABORTED_BEFORE_DISPATCH`; cancellation after invocation can replace only a successful outcome with `ABORTED`. A denial, wrapper failure, tool failure, post-policy failure, or timeout-owned `TOOL_TIMEOUT` remains more specific. A pre-aborted entry materializes and freezes arguments, then skips every policy and dispatch phase and publishes one result. Every async tool must observe or forward the signal and settle only after owned work stops. The [tool-cancellation Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-19-cooperative-tool-cancellation.md`） owns the full contract and hard-termination limit.

<a id="pkg-taskweaver-dsh-tools--live-events"></a>
##### Live events

The live registry pipeline has three transformable waterfalls, then the definition-owned content finalizer, then the observe-only `tools/result` event; registry changes are deliberately unfiltered shared-state notifications. Exact signatures, dispatch modes, scope filtering, and failure containment contracts live in the generated region of [tools.md]（原文链接目标：`../../../docs/subsystems/tools.md#cordis-surface`）, while the complete ordering is visualized in the generated [tool execution pipeline]（原文链接目标：`../../../docs/tool-execution-pipeline.md`）. `tools/result` is live; the similarly named `tool/result` is the durable session event the agent loop appends afterwards.

<a id="pkg-taskweaver-dsh-tools--key-types"></a>
##### Key types

- `ToolDefinition` — `ToolSchema` + mandatory `output { schema, render, presentationMeta? }` + `execute(args, exec)`, optional final-content and presentation callbacks, cooperative `timeoutMs`, and optional per-call `isConcurrencySafe(args)` classification. A body returns only the canonical JSON value declared by the output schema and cooperatively stops through `exec.signal`. `finalizeContent(exec, result)` runs exactly once for every normalized result, including failures that bypass post-policy, and can replace only `content`; it must be synchronous and total.
- `ToolExecutionInput` — the caller-supplied call description: `{ callId, name, arguments, signal, agent?, parent? }`; `signal` is required and readonly, callers may pass an enclosing execution's opaque token as `parent`, and callers never choose the new execution's own token.
- `ToolExecutionToken` — a fresh branded `Symbol` assigned by the registry. It supports equality correlation only and never crosses a model, log, or worker boundary.
- `ToolExecution` — the readonly pipeline view: immutable `{ token, callId, name, arguments, signal, agent?, parent? }`; the registry separately retains and re-fuses the original caller signal. `ToolDispatchExecution` is the `tools/execute`-only view whose required signal is mutable, so a wrapper may replace and restore it but cannot delete it. A nested call's `parent` is a `ToolExecutionToken`, not an execution object.
- `ToolRunContext` — the execution passed to a tool body, extending `ToolExecution` with `deferContext(context)`. It defers one context until the tool's final result reaches the loop — typically a nested-dispatch context ferried by a composite tool, or a fresh plugin-sourced instruction minted by a leaf tool (`tool-goal`'s wrap-up) — even when the tool later throws or cancellation wins; it never injects immediately.
- `ToolExecutionResult` — discriminated execution-local outcome. Success is `{ isError:false, value:JsonValue, content, meta?, additionalContexts? }`; failure is `{ isError:true, error:{ message, info? }, content, meta?, additionalContexts? }` and has no value. Call identity stays on the immutable `ToolExecution`. The registry snapshots, validates, and freezes the canonical value before rendering, then materializes the durable presentation fields before final observation. `ToolFailure.info` carries an internal `{ name, code }` for a `HarnessError`; `additionalContexts` preserves every deferred or post-execute identified `UserMessage` for the loop's post-result FIFO.
- `PreToolDecision` — `{kind:'allow'}` | `{kind:'deny', reason}` | `{kind:'ask', reason?}`. Input rewrite is deliberately not offered; `ask` is serviced by [`ctx.approval`](../interaction/README.zh.md#pkg-taskweaver-dsh-user-approval) when mounted and otherwise degrades to deny.
- `PostToolDecision` — accept may replace `content` or `value`, never both, and may attach `additionalContexts`; block turns feedback into a valueless failure. Content replacement preserves the canonical value and metadata. Value replacement is revalidated and rerenders content/metadata. Accept preserves tool-deferred contexts before decision contexts; block discards tool-deferred contexts and exposes only contexts explicitly supplied by the blocking decision.
- `ToolGuard` — `(execution) => string | undefined`; the returned string is a final monotonic denial reason evaluated after the reorderable pre-execute waterfall and before dispatch.
- `ToolCallView` / `ToolResultView` — provider-neutral `card`-tagged render intents a tool returns from `presentCall` / `presentResult` to own how a UI renders ITS calls (see "Tool-owned UI presentation").

<a id="pkg-taskweaver-dsh-tools--extension-points"></a>
##### Extension points

- Tool plugins call `ctx.tools.register()` — schemas flow into the assembly automatically.
- `tools/pre-execute` is the reorderable allow/deny/ask gate; `ctx.tools.guard()` adds monotonic owner policy after it.
- `tools/execute` wraps normalized canonical dispatch for timeout, retry, or metrics. Wrappers may replace only the operational signal; a wrapper-authored success is normalized through the resolved tool's output declaration. Each canonical result belongs to one immutable dispatch token, so a cached result from another call or tool is revalidated under the active declaration.
- `tools/post-execute` may replace presentation content, replace the canonical value, block with feedback, or attach ordered contexts. A definition's optional `finalizeContent` then owns its last content-only invariant across normal results and outer pipeline failures; `tools/result` observes the immutable final outcome. Content replacement is not a confidentiality boundary: block or replace the value when programmatic consumers must not receive it.
- Exact signatures and ordering live in the generated region of [tools.md]（原文链接目标：`../../../docs/subsystems/tools.md#cordis-surface`） and [pipeline]（原文链接目标：`../../../docs/tool-execution-pipeline.md`）.
- MCP servers: one plugin per server, discover tools, call `ctx.tools.register()` with the server's schemas.

<a id="pkg-taskweaver-dsh-tools--typed-tool-parameter-schemas"></a>
##### Typed tool parameter schemas

First-party plugin authors can use the `defineTool()` helper (exported from this package) for typed tool parameter schemas:

```ts
import { readFile } from 'node:fs/promises'
import type { Context } from '@taskweaver/cordis'
import { defineTool } from '@taskweaver/dsh-tools'

declare const ctx: Context

ctx.tools.register(defineTool({
  name: 'read_file',
  description: 'Read a file from disk.',
  parameters: {
    path: { type: 'string', required: true, description: 'Absolute file path' },
    offset: { type: 'number' },
    limit: { type: 'number' },
  },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute(args, exec) {
    // args is typed: { path: string; offset?: number; limit?: number }
    return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
  },
}))
```

The unified schema DSL uses `ParameterSchemaSpec` for the implicit open parameter object and `ValueSchemaSpec` for any JSON-value root. It supports `string`, `number`, `integer`, `boolean`, `null`, `array`, `object`, author-only `json`, and exact-one `oneOf`; scalar `enum`/`const` values are type-correct. Every explicit DSL object declares `additionalProperties: true | false`, while the implicit parameter root and raw JSON Schema keep the standard open default. Schema records accept only own enumerable string keys, and schema arrays must be dense ordinary arrays. Compilation, validation, registry detachment, and schema-to-TypeScript rendering use explicit work stacks, so runtime processing of valid deep schemas is memory-bounded rather than call-stack-bounded; `InferValue` preserves exact types through 16 container levels and then falls back to `JsonValue` so TypeScript itself remains stack-safe.

A `defineTool` definition validates model arguments before execution and turns missing required values, wrong primitives, invalid enum members, and nested violations into `ToolArgsError` (`INVALID_ARGS`) for the normal error-result path. It also infers the body return and pure output projectors from `output.schema`; the registry snapshots and validates the returned lossless JSON before presentation. The implicit parameter root is open; an explicit object accepts extra keys only with `additionalProperties: true`, and a closed object with no declared properties accepts only `{}`. Raw JSON Schema objects remain open unless they explicitly set `additionalProperties: false`. Defaults are not applied; open objects without `properties` and arrays without `items` receive only a container type check. Raw-registered tools own input validation but still declare and receive registry-enforced output.

See `defineTool`, `validateArgs`, `ToolArgsError`, `ValueSchemaSpec`, `ParameterSchemaSpec`, `InferValue`, `InferArgs`, `valueSchemaSpecToJsonSchema`, and `parameterSchemaSpecToJsonSchema` in the public API for details.

Optional `timeoutMs` must be positive and finite; it is policy metadata, not model-visible schema.

Optional `isConcurrencySafe(args)` receives typed, softly validated arguments. Exact `true` permits concurrent dispatch/body execution; invalid input and all other outcomes remain exclusive. Opted-in bodies do not mutate parent-owned state, and shared-state races must commute or fail closed. The [parallel tool-call Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md`） owns the full safety contract.

<a id="pkg-taskweaver-dsh-tools--enforced-raw-json-schema-subset"></a>
##### Enforced raw JSON Schema subset

`JsonSchemaNode` is the raw counterpart shared by tool outputs, Code Mode generation, subagents, and workflows. It permits any JSON root, an annotation-only unconstrained JSON node, and exact-one `oneOf`; annotations must remain lossless JSON. `assertSupportedJsonSchema()` rejects unsupported constructs, while `validateJsonSchemaValue()` returns path-qualified violations. Subagents and workflows retain their caller-defined object-root requirement through `assertObjectJsonSchema()` and `ObjectJsonSchema`, not through a limitation in the shared vocabulary.

<a id="pkg-taskweaver-dsh-tools--tool-owned-ui-presentation"></a>
##### Tool-owned UI presentation

Tools optionally own pure `presentCall()` and `presentResult()` render intents, so UIs do not special-case tool names:

- Call views are `{ card: 'generic', title, kind?, rawInput?, content?, locations? }`, `{ card: 'terminal', title, description?, cwd? }`, or `{ card: 'diff', title, diffs, locations? }`.
- Result views are `{ card: 'generic', title?, content? }`, `{ card: 'terminal', title?, output?, exitCode?, signal? }`, `{ card: 'diff', title?, diffs }`, `{ card: 'search', shape, title?, truncated, total, … }` (a completed discovery search — grouped-by-file matches for `shape: 'matches'` (grep) or a flat path list for `shape: 'paths'` (glob), with `truncated`/`total` so a UI never presents a capped result as complete; the view carries no result text and a search has no `card: 'search'` call-time analogue), `{ card: 'read', title?, path, offset, lines, totalLines, lang?, content? }` (a completed file read → a line-numbered, optionally syntax-highlighted code view; `offset` is the 1-based first line the window requested, kept even when `lines` is empty; `lines` is `{ number, text }[]` keeping each file line number, and `content` is the envelope-stripped text a UI without read support falls back to), or `{ card: 'web', kind: 'search' | 'fetch', title?, … }` (a completed web retrieval; the `kind` arms carry the structured search sources or the fetch summary, and a UI without the `web` capability falls back to the raw result content).

Returning `undefined` selects generic fallback. Presenters depend only on their arguments and the durable result because UIs call them during live streaming and log replay. `output.presentationMeta(args, value)` derives JSON metadata for direct top-level calls; that metadata persists with `tool/result` and returns to `presentResult`, while the canonical value itself remains execution-local and is never replayed. Nested Code dispatches do not compute metadata. `defineTool` soft-validates older logged arguments and falls back instead of crashing replay. `dsh-tool-bash` and `dsh-tool-fs` are the reference implementations; the [canonical-output Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-20-canonical-tool-output-contract.md`） owns the value/presentation split and the [render-intent Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.md`） owns card vocabulary.

<a id="pkg-taskweaver-dsh-tools--code-mode"></a>
##### Code Mode

Under `code` or `both`, the registry exposes the reserved `run_code` transport and a deterministic SDK for the current scope, generated in the loaded runtime's language — the registry selects the renderer by `ctx.codeRuntime.language` (`typescript` → the TypeScript SDK below, `python` → the Python SDK). The SDK declares exact per-tool argument and canonical-output types for every visible tool (`ToolArgsMap`/`ToolOutputMap` in TypeScript, named `TypedDict`s in Python), and each binding resolves to the tool's canonical JSON value. Each lossless-JSON binding call re-enters the complete tool pipeline under the native scheduling contract (concurrency-safe calls may overlap up to `maxParallelSubCalls`; exclusive calls run alone as ordering barriers) with logged correlation to the outer call. Denials and other failed results reject with the real program-visible `ToolCallError` carrying only `toolName` and `message`; Native content and internal error codes stay outside the Code contract. The program's outer logs and return value re-enter model context; when a successfully settled sub-call's final Native content contains an image, the bridge also defers that complete ordered content through the parent result so the image is not lost behind the JSON-only binding. Final post-execute blocking or content replacement is authoritative. Ordinary side effects are not rolled back, and sub-call `additionalContexts` are deferred through the parent result to preserve call/result adjacency. Run settlement aborts and drains outstanding bindings; runtime failures surface as `CodeRunFailedError`.

Under `code` — not `both` — the transport is also the only entry the model may use: a model-direct call naming any other visible tool resolves to `UNKNOWN_TOOL` at execution creation, before `tools/pre-execute`, approval `ask`, and guards, so nothing observes or approves a call that can only fail. The denial names the route back (`only \`run_code\` is callable directly — call \`<name>\` from inside a \`run_code\` program instead`), because the same prompt declares that tool and a bare `unknown tool` reads as a broken deployment. SDK sub-dispatches carry the outer execution's `parent` token and are exempt, so programs keep every binding the SDK declared. See the [executor-collapse note]（原文链接目标：`../../../.agents/notes/implemented/bug-fix/2026-08-07-code-mode-executor-collapse.md`）, the [Code Mode foundation]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-06-15-code-mode.md`）, [typed-return contract]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-20-code-mode-typed-tool-returns.md`）, and [code-runtime seam](../code-runtime/README.zh.md#family-code-runtime). Try `pnpm run demo:code-mode`.

- **The SDK section** (`tools:sdk`, order 150): a lazy prompt section regenerating the language-appropriate SDK text at each assembly. In the TypeScript flavor it emits `JsonValue`, exact `ToolArgsMap` / `ToolOutputMap`, `ToolName`, the `ToolCallError` declaration, and a mapped `tools` namespace for the calling scope's visible end capabilities (exotic names via quoted keys), plus fixed usage instructions; the Python flavor (`ctx.codeRuntime.language === 'python'`) emits the equivalent named `TypedDict`s and a `tools` object with matching usage instructions. Deterministic — lexicographic tool order, byte-identical text for an unchanged tool set (prefix-cache-friendly). Both codegens are exported and never throw during prompt assembly: `jsonSchemaToTs` handles every unified schema construct and degrades unsupported raw constructs to `unknown`; `jsonSchemaToPy` does the same, degrading to `Any` (and a whole object to `dict[str, Any]` when a field name is not a legal `TypedDict` attribute, or whenever it is called outside the SDK render, which supplies the naming context a `TypedDict` declaration needs).
- **The dispatch bridge** (`run_code`'s execute): every binding call is snapshotted as lossless JSON before dispatch (`undefined`, `BigInt`, cycles, sparse arrays, `-0`, and exotic objects reject that one call), scheduled through a per-run pool that reuses the native concurrency contract — calls start strictly in submission order, consecutive `isConcurrencySafe` calls overlap up to the validated `maxParallelSubCalls` config (default 10; `1` restores serial dispatch), and an exclusive-classified call drains the pool, runs alone, and bars later calls — given the outer execution's opaque token as `parent`, and run through the complete pre-execute → guards → execute → post-execute → result pipeline. A success returns the final canonical value after policy; a failure reaches the worker as one message and becomes `ToolCallError(toolName, message)`. Each started sub-call logs a `tool/code-dispatch-start` event (deterministic id `<parent>:code:<n>`, numbered by submission) at pipeline entry and settles with one `tool/code-dispatch` event carrying the complete model-facing `content`/`isError` outcome (the `tool/result` vocabulary, so UIs render sub-calls through the native path — the pair's `time` fields carry per-sub-call timing); a queued call abandoned by run settlement logs neither. `deriveMessages()` surfaces neither event nor persists the canonical value. Token correlation lets commit-style observers defer an inner success until the final `run_code` result without exposing the live outer execution; ordinary tool side effects are not rolled back. Every sub-call `additionalContexts` entry and every successful final content sequence containing an image is deferred through the outer `ToolRunContext` in dispatch order; the loop appends those contexts only after the parent `run_code` result, preserving adjacency and source attribution even when the program later fails.
- **Settlement discipline**: the bridge owns a run-scoped abort that follows the outer signal in and fires when the run settles for any reason, so a budget expiry aborts an in-flight sub-tool instead of orphaning it; the bridge then drains its queue BEFORE returning, so every `tool/code-dispatch` lands inside the open turn. A failed run throws `CodeRunFailedError` (`code: 'CODE_RUN_FAILED'`, message = the failure kind + captured logs), which the pipeline converts to a structured `isError` the model self-corrects from.
- **Result size**: intermediate binding values cross the worker process whole and have no per-binding byte cap. `run_code` returns canonical `{ logs: string[], result?: JsonValue }`; strings render raw, every other present JSON root renders through a stack-safe pretty JSON traversal whose total indentation is capped at ten characters (deeper subtrees stay compact), `null` remains explicit, and absent `result` means the program returned `undefined`. The worker's configurable `maxOutputBytes` (default 64 MiB) applies only to the combined serialized outer log-array, completion-value, or failure-message payloads; fixed result-envelope syntax and presentation whitespace are outside that limit. Invalid and over-limit completions fail explicitly, and only this outer result is eligible for ordinary spill.

<a id="pkg-taskweaver-dsh-tools--parallel-execution"></a>
##### Parallel execution

The agent loop groups consecutive `parallel` calls into a bounded rolling pool and treats each `exclusive` call as an ordering barrier. Only dispatch/body overlaps; policy, durable results, and context retain model order. Code Mode bindings reuse the same classification through the bridge's own pool. The [parallel tool-call Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md`） owns the shipped declarations and rationale.

<a id="pkg-taskweaver-dsh-tools--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tools--normal-tool-schemas"></a>
##### Normal tool schemas

<a id="pkg-taskweaver-dsh-tools--what-the-model-sees"></a>
###### What the model sees

In normal mode the model sees each visible definition's exact name, description, and JSON schema; the shipped definitions are recorded in the generated [tool package map and schema sections]（原文链接目标：`../../../docs/tool-catalog.md#tool-package-map`）. Agent-scoped restrictions, shadows, and extension registrations change that agent's end-tool set.

<a id="pkg-taskweaver-dsh-tools--token-effect"></a>
###### Token effect

Fixed per-request cost proportional to the visible definitions. Restrictions that hide tools remove their entire schema cost for that agent.

<a id="pkg-taskweaver-dsh-tools--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while visible definitions and their order are unchanged. Registration, disposal, or scoped restriction may invalidate reuse from the first changed schema token.

<a id="pkg-taskweaver-dsh-tools--code-mode-schema-and-system-prompt"></a>
##### Code Mode schema and system prompt

<a id="pkg-taskweaver-dsh-tools--what-the-model-sees-1"></a>
###### What the model sees

Code Mode exposes the generated [`run_code` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tools`）, the SDK instructions below, and the generated exact SDK block for the loaded runtime's language (the TypeScript `declare const tools` block, or the Python `tools` declaration). `both` exposes normal schemas and this Code Mode API. Under `code` the prompt also carries the `tools:code-only` rule, ordered ahead of the per-tool guidance band so the model reads which tools it may call before it reads what each one is for; `both` renders it empty. The instructions and SDK block match the loaded runtime's language; the TypeScript version (via [`dsh-code-runtime-worker-thread`](../code-runtime/README.zh.md#pkg-taskweaver-dsh-code-runtime-worker-thread)) is shown below, and the Python version (for any runtime reporting `language: 'python'`) has the same operations and types in Python syntax (`await tools.name(args)`, subscript access for exotic names, `print(...)` and top-level `return`).

<a id="pkg-taskweaver-dsh-tools--code-mode-sdk-instructions"></a>
###### Code Mode SDK instructions

```markdown
## Writing code for run_code

`run_code` takes two required arguments: `code` — the body of an async TypeScript function (erasable syntax only — no `enum` or namespaces; type annotations are advisory, the code runs type-stripped) — and `description`, a short summary of what the program does. Inside the program:

- Call tools as `await tools.name(args)` — quoted access for exotic names: `tools["my-tool"](args)`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.
- A FAILED tool call rejects with `ToolCallError`, whose `toolName` identifies the failed tool and whose `message` is human-readable — `try/catch` it to handle and continue.
- Independent read-only calls MAY overlap under `Promise.all` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with `await`.
- Emit results with `return` and/or `console.log(...)`. ONLY what you print or return comes back to you — intermediate tool results never enter the conversation, so extract just what you need.

The available tools:
```

<a id="pkg-taskweaver-dsh-tools--token-effect-1"></a>
###### Token effect

Fixed per-request cost proportional to the visible definitions. Code Mode trades end-tool schemas for generated SDK text plus one transport schema rather than promising a universal reduction.

<a id="pkg-taskweaver-dsh-tools--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while the Code Mode selection, generated SDK, transport schema, and visible tool set are unchanged. Mode or filter changes may invalidate reuse from the first changed prompt or schema token.

<a id="pkg-taskweaver-dsh-tools--tool-call-history-and-results"></a>
##### Tool-call history and results

<a id="pkg-taskweaver-dsh-tools--what-the-model-sees-2"></a>
###### What the model sees

The loop retains model-emitted arguments and the registry's final content. Any thrown or denied call becomes exactly `Error: <message>`. Code Mode renders the outer program's printed lines and return value, `(run_code completed with no output)` when both are empty, or `Error: code run failed (<kind>): <message>` followed conditionally by `Captured output:` and the captured lines. Inner dispatch events stay log-only, while a successful image-bearing sub-result is appended after the outer result as source-attributed context; post-execute listeners may append other source-attributed context at the same boundary.

<a id="pkg-taskweaver-dsh-tools--token-effect-2"></a>
###### Token effect

Arguments, results, and additional context are data-dependent and resent until compaction. Restrictions that hide tools also remove their schemas before the model can call them.

<a id="pkg-taskweaver-dsh-tools--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tools--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Concurrency policy is not an event gate** — `executionMode()` reads the resolved tool definition directly; plugins can only declare a classifier on definitions they own.
- **`tools/pre-execute` deliberately cannot rewrite `exec.arguments`** — logged and rendered args would desync from what ran; the rewrite design is [a proposed Agent Note]（原文链接目标：`../../../.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.md`）.
- **Caller-defined subagent and workflow structured outputs remain object-rooted** — this is a consumer-level guard; the shared schema vocabulary and tool outputs support every JSON root.
- **`timeoutMs` on a definition is declarative only** — the registry never enforces deadlines; enforcement requires the `@taskweaver/dsh-tool-call-timeout-policy` wrapper.
- **Code Mode's SDK language follows the one loaded runtime, and a presentation is per agent rather than per tool** — `mode: code`/`both` rejects prompt assembly unless `ctx.codeRuntime.language` has a registered SDK renderer (TypeScript or Python); scoped restrictions/shadows and `presentAs` choose each agent's visible bindings and their form, but within one agent no tool can be native-only while another is code-only.
- **Code Mode intermediate values are execution-local and unbounded by bytes** — the canonical typed values cannot be reconstructed from session replay and may exhaust process or worker memory; only the outer `run_code` output has the worker's configurable hard cap. The durable log copy of each sub-call IS bounded: the `tools/code-dispatch-log` waterfall lets the spill policy replace an oversized `tool/code-dispatch` content with a preview + locator ([rationale]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-26-code-dispatch-log-spill.md`）).
- **`run_code` state is fresh per run** — a persistent REPL-style kernel is rejected for the MVP (cross-call state would be invisible to the log); see [the Code Mode Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-06-15-code-mode.md`）.

<a id="family-core"></a>
### 原族级说明（迁移保留）

<a id="family-core--core-product-api-spine"></a>
The session log, system-prompt assembly, tool registry, agent vocabulary, deployment-default model selection, and concrete loop that form the harness's default control spine. These are **product** packages — the stable surface plugins and consumers build against.

| Package | Role | ctx key |
|---|---|---|
| [`scope/`](./README.zh.md#pkg-taskweaver-dsh-scope) | Scoped-context registration primitive | library — no ctx key |
| [`session/`](./README.zh.md#pkg-taskweaver-dsh-session) | Event-sourced session log and in-memory store | `ctx.sessions` |
| [`system-prompt/`](./README.zh.md#pkg-taskweaver-dsh-system-prompt) | Prompt and tool-schema assembly registry | `ctx.systemPrompt` |
| [`tools/`](./README.zh.md#pkg-taskweaver-dsh-tools) | Scoped tool registry and execution pipeline | `ctx.tools` |
| [`agent/`](./README.zh.md#pkg-taskweaver-dsh-agent) | Agent interface, registry, and event vocabulary | `ctx.agents` |
| [`agent-default-model/`](./README.zh.md#pkg-taskweaver-dsh-agent-default-model) | Default model selection shared by Agent entry points | `ctx.agentDefaultModel` |
| [`agent-loop/`](./README.zh.md#pkg-taskweaver-dsh-agent-loop) | Default concrete agent driver | `ctx.agentLoop` |

`scope` supplies the shared scoping primitive. `agent` owns the public contract, while `agent-loop` is its default implementation; extension plugins depend on the seam so the driver remains swappable. `agent-default-model` owns the deployment selection an Agent entry point uses only when a session has no selection of its own.

Runnable compositions belong to [`examples/agent-spine-demo`]（原文链接目标：`../examples/agent-spine-demo/README.md`）; this group owns only the swappable spine pieces.

The subsystem reference — the package-by-package loop map, the `Agent` handle and its delivery/interception contracts — is [docs/subsystems/core.md]（原文链接目标：`../../docs/subsystems/core.md`）; the default runnable composition is [`examples/agent-spine-demo`]（原文链接目标：`../examples/agent-spine-demo/README.md`）.
