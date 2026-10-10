# subagent 包族

<a id="family-subagent"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义子 Agent 创建和控制接口，并提供可替换的委派 Provider。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-subagent`](#pkg-taskweaver-dsh-subagent) | `subagent/subagent` | [接口与限制](#pkg-taskweaver-dsh-subagent) |
| [`@taskweaver/dsh-subagent-fork-in-process`](#pkg-taskweaver-dsh-subagent-fork-in-process) | `subagent/subagent-fork-in-process` | [接口与限制](#pkg-taskweaver-dsh-subagent-fork-in-process) |
| [`@taskweaver/dsh-subagent-in-process-driver`](#pkg-taskweaver-dsh-subagent-in-process-driver) | `subagent/subagent-in-process-driver` | [接口与限制](#pkg-taskweaver-dsh-subagent-in-process-driver) |
| [`@taskweaver/dsh-subagent-spawn-in-process`](#pkg-taskweaver-dsh-subagent-spawn-in-process) | `subagent/subagent-spawn-in-process` | [接口与限制](#pkg-taskweaver-dsh-subagent-spawn-in-process) |
| [`@taskweaver/dsh-tool-subagent`](#pkg-taskweaver-dsh-tool-subagent) | `subagent/tool-subagent` | [接口与限制](#pkg-taskweaver-dsh-tool-subagent) |
| [`@taskweaver/dsh-tool-subagent-control`](#pkg-taskweaver-dsh-tool-subagent-control) | `subagent/tool-subagent-control` | [接口与限制](#pkg-taskweaver-dsh-tool-subagent-control) |
| [`@taskweaver/dsh-tool-subagent-report`](#pkg-taskweaver-dsh-tool-subagent-report) | `subagent/tool-subagent-report` | [接口与限制](#pkg-taskweaver-dsh-tool-subagent-report) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-subagent"></a>
### `@taskweaver/dsh-subagent`

<!-- migrated-from: packages/runtime/subagent/subagent/README.md -->
目录：`subagent/subagent`。
package.json 描述：Abstract subagent seam (ctx.subagents): named-provider registry for delegating to child agents

<a id="pkg-taskweaver-dsh-subagent--taskweaver-dsh-subagent"></a>
The subagent seam lets one agent delegate work to a child through a named provider. Callers use one service API (`ctx.subagents`); providers decide whether the child runs in this process, in another process, or through a future transport.

The [subagent family overview](./README.zh.md#family-subagent) maps implementations and model-facing consumers. This package owns the provider registry, shared request and result contracts, durable descriptors, and continuable-child orchestration. Multiple named providers may coexist behind that contract.

<a id="pkg-taskweaver-dsh-subagent--service-api"></a>
#### Service API

`SubagentRuntime` has these operations:

| Member | Meaning |
|---|---|
| `registerProvider(provider)` | Register one trusted same-process implementation by name. Registration is effect-scoped; removing it prevents new starts but does not revoke runs already returned to callers. Duplicate names fail loud. |
| `getProvider(name)` | Return the provider, or `undefined` when absent. |
| `list()` | Return provider names in insertion order. |
| `start(name, request)` | Validate an ordinary caller request, resolve its detached `one-shot` descriptor, then await the provider until a real one-shot child is published. Fulfillment returns a holder-owned `SubagentRun`; rejection means the provider has already cleaned every unpublished startup resource, while post-publication turn or infrastructure faults settle through the run. Continuable children never enter through this operation. |
| `startContinuable(spec)` | Establish one durable continuable child and deliver its initial prompt. Resolves with `{ childId, messageId }` when the child's inbox accepts that prompt, without waiting for the turn to start or for the message to reach the Session log; any earlier failure rejects with no ids and rolls the child back entirely. A caller-reserved `childId` is rejected when the live registries or configured persistence already own it. Requires `ctx.agents`, session persistence, and a provider with the `prepareContinuable` capability. |
| `followup(parent, childId, content, { source, signal })` | Deliver one later message from the exact live direct parent as the child's next FIFO turn, matching `Agent.followup()` terminology, and return the accepted `MessageId`. A resident child's inbox accepts it directly (waking a waiting Activation); an absent one cold-resumes from its persisted Session. Requires `ctx.agents`; cold resume also requires session persistence. |
| `interrupt(targetSessionId, authority)` | Interrupt one live continuable child's current turn under a human durable parent address (`{ kind: 'user', parentSessionId }`) or an exact live ancestor Agent (`{ kind: 'ancestor', agent }`). Admission is synchronous and the effect asynchronous: it issues `Agent.cancel(cause, { keepInbox: true })` and returns without waiting for the target to observe the signal. Unclaimed pending inbox work, the Activation, and published descendants are preserved; work already claimed into the interrupted turn is not requeued. An absent target is an accepted no-op; a wrong parent address or a stale, self-targeting, or non-ancestor caller rejects with `UNAUTHORIZED`. |
| `reportFrom(child, content, { delivery, signal })` | Deliver one selected message from the exact live continuable child to its exact live direct parent and return the accepted stable `MessageId`. Quiet delivery injects next-step context without waking; next-step delivery steers and wakes the parent. |
| `registerContinuableSetup(contribution)` | Compose an optional deployment capability into each continuable child's unpublished scope, with immediate revocation from resident children. |
| `drainContinuableDescendants(parents)` | Close admission below exact live host-owned parent Agents, stop only their visible continuable descendants, await materializations admitted below those roots through publication or rollback, then release the selected forests child-first. The cutoff lasts until each exact parent leaves the registry; unrelated parent forests and manager-wide admission remain live. |
| `drainContinuableChildren(parent, childIds)` | Release only the named resident continuable direct children of one exact live parent, recursively and child-first. It does not close admission or touch siblings, accepts absent ids as no-ops, and rejects a resident child owned by another parent. This is teardown, so unlike `interrupt()` it does not preserve pending inbox work. |
| `listChildren(parentSessionId, signal?)` | List direct session-backed subagents with their `one-shot`/`continuable` mode, `running`/`inactive` activity, origin-classified one-level `hasChildren` hint, and per-child diagnostics, ordered by `createdAt` then id, without loading or resuming them. Reads the live session store and optional session persistence directly (live-only enumeration when persistence is absent) and requires the mounted `sessionProjections` registry; it does not require `ctx.agents`, the continuation manager, or any query service. |
| `listDescendants(rootSessionId, signal?)` | Flatten the root's complete session tree in stable pre-order from the same live-preferred corpus, adding each subagent entry's durable `parentId` and root-relative `depth`. Ordinary sessions and one-shot children remain traversal nodes so continuable descendants below them are discovered. Identity, diagnostics, dependencies, and cancellation follow `listChildren()`. |

`SubagentStartRequest.label` is an optional short durable display label for a session-backed one-shot child. Model-facing delegation supplies its existing `description`; lower-level callers need not invent presentation metadata. Continuable starts always carry their own required label. `signal` is required and is the canonical cancellation channel for a one-shot `start`. An abort before publication makes `start()` reject after rollback; an abort after publication cancels the returned run's remaining turn work without hiding its id. The request may also select a model, require structured output, cap delegation depth, restrict child tools, or set a child persona. For a continuable start or follow-up, the caller signal owns lookup, materialization, and admission only until inbox acceptance; afterward the manager owns the Activation independently, so later caller cancellation neither cancels the accepted turn nor disposes the child.

Follow-up authority comes from the exact live direct parent recorded in the child's durable header. Cold resume checks that authority before reconstruction and again in the final no-await inbox-admission span, so a parent unregistered or replaced during materialization cannot authorize delivery. The `source` on a follow-up records who supplied the delivered message and grants no authority.

Same-process requests, descriptors, results, and event payloads are trusted typed values borrowed as immutable. The service does not clone or freeze them; serialization and hostile-input validation belong at actual process, worker, persistence, and model boundaries.

<a id="pkg-taskweaver-dsh-subagent--capabilities"></a>
#### Capabilities

Start-time features are advertised in `provider.capabilities` because the service must reject an unsupported one-shot request before child creation:

- `outputSchema` — enforce a structured final result.
- `depthLimit` — enforce `maxDepth`.
- `toolFilter` — apply the requested child tool restriction.
- `persona` — apply a per-child persona.

Every in-process child is composed by one call, `applyChildComposition(childCtx, parent, composition)`, which joins the parent's agent-preset composition before applying the child's own persona and tool filter. The join is what gives the child its capabilities: with every model-facing row on the agent plane, a child that joined nothing would reach the model with an empty tool registry ([`dsh-agent-presets`](../preset/README.zh.md#pkg-taskweaver-dsh-agent-presets)). Taking the parent as a parameter is deliberate — it makes composing a child WITHOUT that join unrepresentable at the call sites, which is the defect the one call exists to prevent. A deployment composing no preset roster joins nothing and needs nothing: its model-facing rows sit in the host composition, where the child already resolves them through the tool registry's global layer.

`childSessionMeta()` records the joined preset id on the child's durable header for the same reason a top-level session records its own: the preset decides the tool schemas and prompt sections the model saw, so a cold read of the child's history has to rebuild that composition rather than the deployment default. It is read from the parent's live scope chain, not from the parent header, because a parent that switched preset while blank runs on the newer composition while its header still names the older one.

Continuable creation is the optional `SubagentProvider.prepareContinuable?()` method: its presence is the capability check, so the service rejects a configured continuable start on a provider without it, while a provider that has it may still serve ordinary one-shot delegations. The method returns only a detached `ContinuableCreateSpec` (`{ seed? }`) — data, never a capability: it carries no Agent, `AgentHandle`, prompt delivery, result, disposal, or resume operation, because the continuation manager owns identity reservation, composition, Agent creation, prompt delivery, cold resume, ownership, and disposal after preparation. A one-shot `SubagentRun` represents one disposable foreground delegation with one result and no cold-resume operation. The service may invoke one provider concurrently for distinct siblings: each start or preparation owns its mutable state and cancellation path, and one operation's failure, result, or cleanup must not settle or release another. A provider may queue its own capacity internally without changing that independence contract.

<a id="pkg-taskweaver-dsh-subagent--the-durable-descriptor"></a>
#### The durable descriptor

The Service Definition owns the versioned `subagent/descriptor` session event vocabulary (`src/descriptor.ts`): `snapshotSubagentDescriptor()` validates and detaches the record before provider work, and `foldSubagentDescriptor()` validates the complete current-version payload before recovering it from a loaded child log. Every local session-backed start appends one descriptor with the provider name and lifecycle `mode`. A `one-shot` descriptor optionally carries the caller-owned durable display `label`; a `continuable` descriptor requires its durable creation label and additionally records resolved child `agentOptions.provider`/`model` and optional `persona`/`toolFilter` for cold resume. These are explicit fields, never the merge-extensible `AgentOptions` object, so an unrelated extension value cannot break continuation. The descriptor omits `subagentDepth` (the persisted header's `delegationDepth` is the monotone floor) and `outputSchema` (an Activation's result contract). The event is log-only: no `surfaceOp`, absent from model history, and retained by the append-only log across compaction. Malformed current-version payloads are corrupt; unsupported versions cannot be classified by this runtime.

<a id="pkg-taskweaver-dsh-subagent--delegation-depth"></a>
#### Delegation depth

The seam owns the depth vocabulary shared by Service Providers and Consumers: the `AgentOptions.subagentDepth` declaration, `assertSubagentMaxDepth`, and `delegationDepthOf(agent)`. The persisted `SessionHeader.delegationDepth` is authoritative and monotone — runtime options may deepen the count but never lower it, so a resumed child cannot be re-counted as top-level.

`inheritsParentContext` is descriptive rather than enforceable. It says only whether the child sees completed parent conversation history (`fork` does; `spawn` and the out-of-process one-shot providers do not), not whether it inherits tools, services, or authority.

<a id="pkg-taskweaver-dsh-subagent--delegated-policy"></a>
#### Delegated policy

Both in-process delegation paths fix the child's permission scope at the delegation boundary through the shared child-agent helpers. `captureDelegatedPolicyOverrides(parent)` snapshots the parent session's explicit sandbox override (`sandboxPolicy.overrideOf()`) and pins the child's approval policy to `'never'` whenever the approval capability is composed — regardless of the parent's own policy — so a delegated child acts only within its inherited sandbox scope and every ask (for example a `sandbox_permissions` escalation) is rejected deterministically instead of waiting on a prompt no one is watching (both services are optional `ctx.get` consumers). `appendDelegatedPolicyOverrides()` writes each value onto the child's own log as a `source: 'delegation'` `sandbox/mode` or `approval/policy` event during unpublished setup, after any fork seed — so fresh policy wins stale seed state and the child's effective policy stays reconstructable from its log alone. The sandbox deployment default is never copied: an unswitched parent stamps no `sandbox/mode` and its child follows the deployment default dynamically. A continuable start captures before its first await and seeds only fresh materialization; a cold resume replays the persisted delegation events instead of re-capturing the parent, so a parent switch after creation never retroactively changes a durable child. Every in-process child also receives a scoped runtime-context statement (`subagent:delegation`) telling it the scope is fixed and that a task needing wider access ends with a reported limitation, not retries. See the [one-shot]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-25-subagent-policy-inheritance.md`） and [continuable]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-08-10-continuable-subagent-policy-inheritance.md`） delegation-policy Agent Notes.

<a id="pkg-taskweaver-dsh-subagent--one-shot-ownership-and-lifecycle"></a>
#### One-shot ownership and lifecycle

`provider.start(request): Promise<SubagentRun>` is the ownership-transfer boundary; the delegation tool also uses it inside its one-shot Task-backed background path. Before fulfillment, the provider owns setup and must cancel, roll back, and quiesce unpublished resources on every failure. After fulfillment, the caller owns the run and must call `dispose()` on every path; remaining prompt and turn work belongs to `SubagentRun.result`.

`SubagentRun.result` resolves to `{ output, structured?, diagnostic?, stopReason }`. Child-level failures resolve with a non-`completed` reason; only an infrastructure fault that the seam cannot represent may reject. A provider may add a safe `diagnostic` to a non-completed result after removing tool inputs, file contents, environment values, credentials, and raw protocol payloads and limiting the complete text to 4096 UTF-8 bytes. The common result type does not define provider categories or lifecycle stages: an out-of-process provider may derive fixed display text from its version-pinned structured product facts and an observed process outcome, while consumers render that text without parsing it. The field is not assistant output: consumers present it separately, and it does not enter `subagent/end.lastAssistantMessage`. `dispose()` is idempotent, cancels remaining work, and waits for both result settlement and child-resource quiescence. A result rejection remains on `result`; `dispose()` rejects only for an independent resource-release failure. `output` and the `subagent/end` event's `lastAssistantMessage` use the exported `AssistantOutputFold`/`finalAssistantOutput` helpers to select the child's last non-empty assistant message, or its accumulated assistant text when no such message exists. `output` is `[]` and the event field is absent when the child produced neither ([`SubagentResult`]（原文链接目标：`../../../docs/subsystems/subagent.md#the-terminal-result-subagentresult`） owns the terminal result contract).

A local run publishes an ordinary child agent/session before `start()` fulfills, returns that shared session id as `SubagentRun.id`, exposes the exact child as `SubagentRun.localAgent`, records `request.parent.session.id` in the child's `parentSession` header, and appends the resolved descriptor inside its initial turn. Remote providers instead mint a parent-scoped lifecycle id and return `localAgent: undefined`; without a local child session, their one-shot runs are not part of trace-backed enumeration.

<a id="pkg-taskweaver-dsh-subagent--continuable-children-and-activations"></a>
#### Continuable children and Activations

A continuable child has one durable Session and at most one process-local **Activation** — one residency epoch for a reconstructed child Agent, not a request, result, cancellation, or Task boundary. The Agent inbox is the only turn queue, so the continuation manager owns residency while the Agent loop owns all turn ordering and execution. No continuable path creates a Task or an intermediate result-bearing wrapper.

The manager derives three internal residency conditions from Agent quiescence and the owned-child set rather than maintaining a second state machine: running (an active admission, open turn, or waking inbox work), waiting (quiescent but still owning at least one undisposed child), and settled (quiescent with every owned child disposed, so the manager disposes the `AgentHandle` and removes the Activation). Every continuation message uses `Agent.followup()` and becomes one FIFO turn with no steering of the current turn. Routing depends only on residency: running enqueues, waiting wakes the same Agent, and an absent Activation cold-resumes a new one.

The manager reserves the child identity, resolves the durable descriptor, calls `ctx.agents.create()` (or `ctx.agents.resume()` for cold resume) through a private activation-owner scope, installs the returned `AgentHandle` in the Activation, establishes any continuable-parent ownership, and then submits the prompt. Cold resume never dispatches through a provider because the persisted Session already holds the initial prefix and the folded descriptor is the whole reconstruction input.

<a id="pkg-taskweaver-dsh-subagent--settlement-delivery"></a>
##### Settlement delivery

When a resident Activation settles, the manager tells the child's durable direct parent, in the parent's own turn stream, that the child produced everything it is going to. Delivery is unconditional for every child whose id a caller actually received: it does not consider whether the child called `report`, because the endings that most need an account — a token ceiling, a model failure, cancellation, teardown — are exactly the ones where the child never got to choose. A materialization rolled back before its first accepted message stays silent, since that caller was told the child was not established. The message carries the epoch's stop reason, its final assistant content when it produced any, and durable provenance `{ kind: 'subagent-settled', form: 'notice', senderSessionId: <child-id> }` — a different source kind from a child-authored `subagent-report`, so a transcript never credits the child with words the runtime wrote.

Two ordering rules make the delivery reliable rather than lucky, and both are why this belongs to the manager instead of an external `subagent/end` listener. First, the send happens **before** the child's ownership release, while the parent still counts the child and is therefore structurally unable to be judged settled. Second, a parent that is itself a resident Activation receives the message through the same waking-admission accounting as a report, so the window between the synchronous send and the microtask that admits it is not mistaken for quiescence — `Agent.status` folds context maintenance into `idle`, and a waking send behind maintenance only arms a deferred wake. Without either rule the parent can be disposed with the notice still in an inbox that `cancel()` clears, which loses it silently.

An idle parent receives the notice as one ordinary later turn. A busy parent is steered into its nearest step boundary instead, so several children settling together cost one step rather than one turn each; steering rather than injecting also means a driver that retires between the status read and the send still claims the message. A parent whose own lineage is already draining receives the notice by injection, with no wake at all: `Agent.followup()` on a quiescent parent starts a turn and `cancel()` does not arm against a later one, so waking during teardown would spend a model request on an Agent its host is about to dispose — once per tree layer, since each layer's notice then wakes the layer above it. The injected message reaches a parent that is still reading its inbox, and the log records the account either way, but it does not outlive that parent's own disposal: `AgentHandle.dispose()` is a `keepInbox: false` cancel, which durably cancels an unclaimed notice. A resumed parent therefore has no pending notice to read: `list_agents` tells it which children exist and whether each is live or stored, while the outcome itself stays in the child's own Session, which a `send_message` reaches by resuming that child. A parent that has left the registry is not an error: the notice is dropped and the child's own Session remains the durable record. Delivery never blocks or fails teardown — a rejected send is logged, because retaining a child to retry a notice would pin its whole ancestry in `waiting` forever.

A continuation-managed parent Activation records each child Session id in an `ownedChildren` set before the child can run and disposes only after every owned child Activation completes `AgentHandle` disposal (child-first). Teardown propagates Agent cancellation top-down before awaiting slow descendants, while handle release remains child-first. Top-level and other non-continuation Agents have no Activation and stay outside this waiting graph. Final settlement awaits a best-effort `ctx.sessions.flush(child.session)` before handle disposal. A listener rejection is logged without failing the Activation because listener participation does not identify a persistence backend; the persisted state may therefore be missing or stale on resume.

<a id="pkg-taskweaver-dsh-subagent--lifecycle-events"></a>
#### Lifecycle events

The service emits a `subagent/start`/`subagent/end` pair for each one-shot run and each resident continuable Activation epoch, so continuable children are observable with the same vocabulary as one-shot runs without exposing whether the manager materialized, woke, or cold-resumed them. For a one-shot start it attaches the result observer before the synchronous `subagent/start`, so even an already-settled child still produces `subagent/start` before `subagent/end`; a continuable epoch that fails before residency emits neither edge. The pair shares a service-minted `runId`; the `local` flag is snapshotted from the provider's exact `localAgent` (always true for a continuable child), so observers never infer run identity or locality from reusable provider/session names. The `provider` field contains the provider name recorded when the child was first created rather than claiming current registration: an accepted one-shot run may settle after provider removal, and a cold-resumed epoch reads the initial provider name from its descriptor without calling or registering that provider.

Run events are scoped to the delegating parent. Every listener is independently contained: a synchronous throw or rejected returned promise is logged without starving peer listeners or changing the run.

Provider additions and removals also emit `subagent/provider-added` and `subagent/provider-removed`. Consumers such as the model-facing tool use those events because Cordis may load sibling plugins concurrently; configuration order does not prove registration order.

Continuable children do not create `SubagentRun` or Jobs. The continuation manager directly owns one process-local Activation and retained `AgentHandle` per resident child Session, uses the Agent inbox as the only FIFO, and cold-resumes from the durable descriptor. Exact live direct-parent identity authorizes parent-to-child delivery. Exact live child identity authorizes reports; the manager derives the recipient from durable `parentSession`, and `MessageSource` records the sender without granting authority. Interrupt authority is deliberately wider than delivery authority: a human presents the durable direct-parent address so a live child stays stoppable while its parent Agent is offline, and any exact live ancestor recorded in the Activation's materialization lineage may stop its descendant, because stopping a turn is idempotent and delivers no content.

When `ctx.sessionProjections` is available, the service registers two projection units. `subagentTiming` resets at each descriptor so a fork seed's ancestor work cannot enter the child's total, then accumulates `turn/start` → `turn/end` active time and retains same-cut `active.since` and `active.through` bounds for an open turn; while that turn remains open, `active.through` follows the latest folded event, giving an inactive consumer a conservative crash bound without mixing in newer session metadata. `subagent` folds the durable identity — mode plus creation label — from `subagent/descriptor` events with the same last-wins reset discipline, so a fork seed's ancestor descriptor stands only until the child's own overrides it; a malformed or unrecognized-version payload folds to the serializable `null` sentinel — indistinguishable from a log with no descriptor, and surviving every JSON push frame so a consumer replaces a stale identity instead of keeping it — and never throws.

`registerContinuableSetup()` lets optional packages add child-scoped capabilities without teaching the continuation manager their names. Contributions install synchronously before Activation publication, roll back with failed setup, and are released with the child scope. New grants wait for the next Activation, while contribution removal revokes every resident installation immediately.

<a id="pkg-taskweaver-dsh-subagent--collection-model"></a>
#### Collection model

The model-facing tool collects synchronously by default: it awaits the child result and disposes the run before returning. One-shot background delegation registers a plain Task in the tool, whose generic status, collection, and cancellation tools own later interaction, and persists its model-supplied `description` as the optional display label. Continuable background delegation calls `ctx.subagents.startContinuable()` and returns only the durable child id; the child owns its own turns from inbox acceptance, so there is no Task and no result promise — a caller sends later work with the `send_message` follow-up tool, and `interrupt()` stops only the current turn without disposing the child, and the durable child Session remains the source of the child's detailed output. The continuation manager exists only while `ctx.agents` is available, and session persistence is resolved per continuation operation. Independently, `listChildren()` enumerates the live-preferred merge of the live session store and optional session persistence — live-only when persistence is absent, since a cold child cannot be resumed then either — and serves each child's durable mode/label from the registered `subagent` projection unit: the registry's watermark snapshot for a live child; for a cold one, a durable projection-cache row when it serves an own-suffix identity — its `seq` gate proves the value postdates the fork seed, where a child's own descriptor is immutable once appended — else one bounded-concurrency persistence inspection folded through the registry, whose result must still name the enumerated lifecycle (a re-published id degrades to a `corrupt` diagnostic). A throwing cache read renders no verdict — the cache is derived data — and silently falls through to that authoritative re-fold. The projection fold is the single classification authority; listing parses no descriptor itself. A served identity produces a child row; a settled candidate whose fold served no identity is a `corrupt` diagnostic, a failed inspection is a transient `unavailable` retried on the next listing, and a running candidate without an identity yet is omitted (the creation window before its descriptor is appended). It never consults the continuation manager, Agent registrations, Activations, or providers. Each child row derives its read-time `hasChildren` hint from merged headers carrying durable `origin: 'subagent'`; it does not read descendant event logs, and the descriptor-backed child catalog remains authoritative when expanded. Service consumers such as a UI can retain both modes and choose a fallback for an unlabeled one-shot child; the model-facing `list_agents` tool projects only `continuable` entries and refines status through the live Agent registry and maps storage-only to its resumable-not-terminal `ready` (`running`/`idle`/`ready`) and walks `listDescendants()` for its `descendants` scope. The listing forwards the caller's signal to every persistence read, checks cancellation around each of those awaits, and reports every observed abort as `SubagentError` code `CANCELLED`; an unmounted projection registry fails loud with `SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE`, and a missing session store with `SUBAGENT_CONTROL_SESSION_STORE_UNAVAILABLE`. See the [background subagent tasks Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-08-background-subagent-tasks.md`）, the [continuable background subagents Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-21-continuable-background-subagents.md`）, the [durable catalog Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-22-durable-subagent-catalog-and-list-agents.md`）, the [merged-service Agent Note]（原文链接目标：`../../../.agents/notes/implemented/simplification/2026-07-26-merge-subagent-control-service.md`）, the [capability-seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.md`）, and `src/types.ts` for the complete contracts.

Continuable Activations await a best-effort final session flush without treating listener participation as durability confirmation. One-shot runs retain best-effort session checkpointing, so a completed one-shot child is discoverable after disposal only when its session actually reached persistence; the service does not invent a catalog entry from Task history when that checkpoint is absent.

<a id="pkg-taskweaver-dsh-subagent--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-subagent--settlement-notice"></a>
##### Settlement notice

<a id="pkg-taskweaver-dsh-subagent--what-the-model-sees"></a>
###### What the model sees

One user-role parent message opening with the outcome — `Background subagent <child-id> finished and will do no further work unless you send it more.`, or the matching line for a child that was stopped, ran out of room, declined, or failed — followed by `Its closing message:` and the child's final assistant content, or `It left no closing message.` when it produced none. This is the service's only direct parent-side contribution; delegation schemas, parent continuation and discovery, and the child-scoped `report` belong to `dsh-tool-subagent`, `dsh-tool-subagent-control`, and `dsh-tool-subagent-report`.

<a id="pkg-taskweaver-dsh-subagent--token-effect"></a>
###### Token effect

One notice per settled Activation in the parent's request, sized by the child's final message. A child that both reports and settles costs the parent both.

<a id="pkg-taskweaver-dsh-subagent--kv-cache-effect"></a>
###### KV Cache effect

Append-only in the parent: the notice follows its reusable request prefix. Reaching an idle parent starts one independent model request; reaching a busy one does not.

<a id="pkg-taskweaver-dsh-subagent--child-delegation-scope-statement"></a>
##### Child delegation-scope statement

<a id="pkg-taskweaver-dsh-subagent--what-the-model-sees-1"></a>
###### What the model sees

Every in-process child's runtime-context snapshot carries the `subagent:delegation` statement below, after the sandbox-policy and approval-policy sentences.

<a id="pkg-taskweaver-dsh-subagent--the-delegation-scope-statement"></a>
###### The delegation-scope statement

```markdown
You are a delegated subagent: your permission scope was fixed when you were started and cannot be widened from inside this session — operations that require approval are rejected automatically. When the job needs access beyond that scope, do not retry the denied operation; state the limitation in your reply so the delegating agent can handle it.
```

<a id="pkg-taskweaver-dsh-subagent--token-effect-1"></a>
###### Token effect

One fixed statement in each child's runtime-context snapshot; none in the parent's requests.

<a id="pkg-taskweaver-dsh-subagent--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable within a child: the statement never changes during the child's lifetime, so it is written once into the first runtime-context snapshot. Parent-side, no direct invalidation; the named tool consumers own any request-prefix changes.

<a id="pkg-taskweaver-dsh-subagent--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **ACP children remain one-shot and are not trace-enumerable** — an ACP run has no local child session in the parent's session corpus. An ACP `prepareContinuable` requires persisting the remote session id in provider-specific descriptor data and a per-child continuation advertisement, since ACP `loadSession` support is negotiated per child rather than established by the method's presence. Remote providers also require a separate Activation ownership contract with equivalent authenticated control and child-first quiescence before they support continuable children.
- **No host-user continuation** — `followup()` requires the exact live direct parent. Only `interrupt()` accepts a durable parent-address user authority, because stopping a turn is idempotent and delivers no content; a future host adapter needs a concrete authenticated interaction before the seam gains a user delivery capability.
- **Continuation messages never steer** — parent-to-child continuation messages enqueue later child turns. Child-to-parent reports are independent next-step input and may extend the parent's open turn.
- **Wake gap during cancellation convergence** — a waking follow-up accepted after the interrupt signal is issued but before the active driver becomes idle remains queued until another waking send. Issue #1838 owns the agent-loop wake latch, which also affects ordinary session cancellation.
- **Process-local residency** — the Activation inbox and ownership graph do not coordinate two harness processes; concurrent access to one persistence store still requires a durable mailbox and cross-process lease protocol.
- **No replay of accepted-but-unlogged messages** — only messages written to the child Session log are reconstructable with the source that supplied them. A crash may lose an accepted initial prompt or follow-up that never reached the log; a later authorized message can cold-resume the child, but the lost message is not replayed automatically.
- **No durable report mailbox** — reports require a live direct parent and provide acceptance identity rather than exactly-once delivery or a read receipt.
- **Lifecycle events are observe-only** — a run-affecting `subagent/end` continuation or decision API waits for a concrete consumer.

<a id="pkg-taskweaver-dsh-subagent-fork-in-process"></a>
### `@taskweaver/dsh-subagent-fork-in-process`

<!-- migrated-from: packages/runtime/subagent/subagent-fork-in-process/README.md -->
目录：`subagent/subagent-fork-in-process`。
package.json 描述：In-process fork subagent backend: runs a child agent seeded with a prefix of the parent's log

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--taskweaver-dsh-subagent-fork-in-process"></a>
The fork provider creates an in-process child seeded with the parent's completed conversation turns. It shares all run mechanics with spawn; the session seed is the only behavioral difference.

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--seed-boundary"></a>
#### Seed boundary

The parent's current tool-calling turn is still open when a subagent starts: its log contains the assistant tool call but not the matching tool result or `turn/end`. Copying that raw log would give the child an invalid, unbalanced session.

Fork therefore computes the contiguous prefix ending at the last `turn/end`. The child sees all completed parent turns and none of the in-flight turn. If the parent has not completed a turn yet, the seed is empty and the child behaves like a fresh spawn.

The seed transfers conversation history only. The child still receives a fresh flat registration scope; it does not inherit the parent's tool restrictions or authority.

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--start-and-capabilities"></a>
#### Start and capabilities

`start(request)` passes the completed-turn seed to [`startInProcessRun`](./README.zh.md#pkg-taskweaver-dsh-subagent-in-process-driver) and awaits child publication. The shared driver owns cancellation, depth, customization, result reading, and disposal.

Fork advertises `{ outputSchema: true, depthLimit: true, toolFilter: true, persona: true }`, identical to spawn.

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--config"></a>
#### Config

| Key | Meaning |
|---|---|
| `providerName` | Registry name on `ctx.subagents` (default `fork`). |
See [`dsh-subagent-spawn-in-process`](./README.zh.md#pkg-taskweaver-dsh-subagent-spawn-in-process) for the run lifecycle, model inheritance, and depth tracking — all shared.

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--child-agent-history-and-envelope"></a>
##### Child-agent history and envelope

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--what-the-model-sees"></a>
###### What the model sees

The child receives the parent's balanced completed-turn surface prefix, then the new task content verbatim. A configured persona shadows prompt text in the child's fresh scope; a tool restriction filters its global wire schemas, executable lookup, and Code Mode SDK bindings but not standalone guidance. The parent's tool view and authority are not inherited. An optional structured-output request adds its child-only contract. The parent's current in-flight turn is excluded.

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--token-effect"></a>
###### Token effect

Forking duplicates retained completed history into separate child requests; the child then accumulates its own tokens independently. Persona changes repeated prompt cost, filtering changes schema or generated SDK cost, and a first-turn fork has no inherited history.

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--kv-cache-effect"></a>
###### KV Cache effect

The child may reuse the inherited byte-identical prefix under the same provider and model. Persona, tool-filter, generated-SDK, or route changes may invalidate reuse before inherited history; later child history is append-only. Shipped compositions therefore bind this provider to `backgroundMode: one-shot`, because a continuable child additionally carries the child-scoped `report` tool and its prompt section — deltas that precede the inherited history and so invalidate all of it ([the fork-one-shot Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.md`）).

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--parent-tool-result-indirectly"></a>
##### Parent tool result, indirectly

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--what-the-model-sees-1"></a>
###### What the model sees

The parent receives only the child's own final output through `dsh-tool-subagent`, not the inherited prefix or intermediate work.

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--token-effect-1"></a>
###### Token effect

Parent input grows by one data-dependent final result retained until compaction.

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-subagent-fork-in-process--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **The seed is a one-time snapshot** — the child sees the parent's completed turns as of the fork and nothing the parent logs afterwards; there is no live context sharing.
- **No shipped composition creates a continuable fork child** — `prepareContinuable` remains implemented and the seam accepts it, but every shipped `cordis.yml` sets `backgroundMode: one-shot` on the fork delegation tool, so the provider's continuable path has no production caller. Reopening it requires the child's system prompt and tool schemas to match the parent's byte for byte, which the [`report` return channel](./README.zh.md#pkg-taskweaver-dsh-tool-subagent-report) currently prevents. Rationale and the reintroduction condition: [the fork-one-shot Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.md`）.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver"></a>
### `@taskweaver/dsh-subagent-in-process-driver`

<!-- migrated-from: packages/runtime/subagent/subagent-in-process-driver/README.md -->
目录：`subagent/subagent-in-process-driver`。
package.json 描述：Shared in-process subagent run driver: drives a child agent on ctx.agents (used by the spawn and fork backends)

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--taskweaver-dsh-subagent-in-process-driver"></a>
This package is the shared run driver for the two in-process providers. Spawn passes no session seed; fork passes the parent's completed-turn prefix. Everything else—depth, child creation, optional child customization, result reading, cancellation, and disposal—has one implementation here.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--start-contract"></a>
#### Start contract

`startInProcessRun(request, options): Promise<SubagentRun>` fulfills only after the child is published in `ctx.agents`. A rejected start has already quiesced the agent factory's unpublished creation transaction, so the caller never receives a half-created handle.

The driver follows this sequence:

1. Validate the parent depth and optional absolute `maxDepth`, then derive child depth as parent depth plus one and persist it in the child session header.
2. Call `parent.ctx.agents.create` directly, passing the required request signal into the factory's creation transaction.
3. During that transaction's unpublished setup window, install the requested persona, tool restriction, and structured-output runtime.
4. Publish the child, retain the returned `AgentHandle`, and drive one task with `child.followup(prompt)` followed by `child.whenIdle()`.
5. Read the child's own output — its last non-empty assistant message (an empty-content message that records usage is skipped), or its accumulated assistant text when no such message exists — and the final durable turn reason from the complete owned child run, excluding any fork seed.

The child gets the parent's working-directory/session lineage and inherits the parent provider, model, and output-token cap unless `request.agentOptions` overrides them. It gets a fresh flat registration scope: parent ownership does not import parent tool restrictions or establish an authority subset.

This result boundary is valid because the provider owns an isolated child lifecycle from publication through quiescence. Steering submitted during that lifecycle belongs to the child run; the provider does not pretend the initial follow-up alone owns its output.

The driver applies the seam's [delegated policy](./README.zh.md#pkg-taskweaver-dsh-subagent--delegated-policy) through the shared child-agent helpers: it captures the parent's explicit sandbox override and the `'never'` approval pin before child creation and appends the source-tagged events during unpublished setup, after any fork history and before session publication. See the [delegation-policy decision]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-25-subagent-policy-inheritance.md`）.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--cancellation-and-ownership"></a>
#### Cancellation and ownership

The required request signal covers both startup and the live run. Before publication, `AgentCreationTransaction` observes it, rolls back, and rejects. The factory detaches that creation-only listener before returning; the driver immediately checks the signal once more before installing a minimal live-run listener, closing the handoff race. After publication, abort cancels the child.

After fulfillment, the caller owns the run. Provider-plugin unload does not revoke it. `dispose()` removes the live abort listener, records cancellation, and delegates to the returned `AgentHandle.dispose()`, whose memoized quiescence transaction stops the loop, removes the agent and session, and unwinds scoped registrations. Cancellation owns every non-completed in-flight outcome and reports `aborted`; an already-completed turn remains completed.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--spawn-and-fork-inputs"></a>
#### Spawn and fork inputs

`InProcessRunOptions` is `{ seed?: SessionEvent[] }`. Spawn omits it. Fork supplies a balanced completed-turn prefix and records its length so the result reader never mistakes a seeded parent message for child output.

Depth enforcement is internal to `startInProcessRun`: it reads the parent depth via `delegationDepthOf` (the persisted `SessionHeader.delegationDepth` is authoritative; runtime `AgentOptions.subagentDepth` may deepen but never lower it, so a resumed child keeps its budget), treats absence as top-level depth zero, rejects malformed stored values, and reports an attempted child depth above `maxDepth`. An unrepresentable depth above the safe-integer domain is a `RangeError`. The child depth is written to the child header, so it survives persistence and resume.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--structured-output"></a>
#### Structured output

`attachStructuredRuntime(childCtx, schema)` installs the whole contract in the child's scope:

- A `structured_output` tool registered with the requested schema validates and stages the model's value.
- An order-190 system-prompt section tells the child that the tool call is the terminal answer.
- Both contributions are ordinary child-scoped registrations. An expert `system-prompt/assemble` listener may replace them and therefore owns preserving the structured-output protocol for that child.
- A `tools/result` observer commits a staged value only after that execution's authoritative final tool result succeeds, including the enclosing `run_code` result for Code Mode sub-dispatch.
- A monotonic tool guard blocks later calls after capture, and the structured-output execution's `concludeTurn()` marker ends the turn after the result commits.

A clean turn that never commits the required structured value reports `error`; the driver does not re-prompt. All registrations ride the child fiber and disappear with it.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--child-agent-request"></a>
##### Child-agent request

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--what-the-model-sees"></a>
###### What the model sees

The shared driver sends the task verbatim as the child's user message and, when requested, shadows the persona and restricts global tool schemas, lookup, execution, and Code Mode SDK bindings in the unpublished child's fresh scope; parent restrictions are not inherited, and standalone tool-guidance sections remain. Spawn supplies no history; fork supplies its balanced seed.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--token-effect"></a>
###### Token effect

Child input is isolated from the parent and grows through the child's own steps. A persona changes repeated prompt text; filtering changes schema or generated SDK cost but not independently registered guidance.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--kv-cache-effect"></a>
###### KV Cache effect

Independent of the parent request cache. The child's later history is append-only, while persona, tool-filter, generated-SDK, provider, or model changes establish a different child prefix.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--structured-output-system-prompt-schema-and-results"></a>
##### Structured-output system prompt, schema, and results

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--what-the-model-sees-1"></a>
###### What the model sees

A structured run adds the structured-output instruction below. It also adds a child-scoped `structured_output` definition with exact description `Report your final structured result. Call this exactly once, when your answer is complete; the arguments must match this tool's parameter schema exactly.` and the requested schema. This runtime-only definition is outside the generated shipped [tool package map]（原文链接目标：`../../../docs/tool-catalog.md#tool-package-map`）. Its canonical acknowledgement is `{ recorded: true }`, rendered as `Structured output recorded.`; a later call becomes ``Error: structured output already recorded: the run is complete, so `<tool>` is not executed``.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--structured-output-instruction"></a>
###### Structured-output instruction

```markdown
When you have your final answer, you MUST report it by calling the `structured_output` tool with arguments matching its parameter schema exactly. Do not finish with a plain text answer: only the tool call counts as your result.
```

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--token-effect-1"></a>
###### Token effect

Fixed instruction and capability tokens are paid only by that child. Result text enters the child history, while the captured value alone becomes the parent result.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable inside the child while the structured-output instruction and schema are unchanged. Changing the schema or capability may invalidate the child's cache from that early segment; results append in child and parent histories.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--parent-start-error-indirectly"></a>
##### Parent start error, indirectly

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--what-the-model-sees-2"></a>
###### What the model sees

Through `dsh-tool-subagent`, invalid depth state becomes exactly `Error: agent subagentDepth must be a non-negative safe integer`, `Error: subagent child depth exceeds the safe-integer range`, or `Error: subagent depth <attempted> exceeds maxDepth <max>`. A pre-publication cancellation passes its abort reason through the registry's `Error: <message>` wrapper.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--token-effect-2"></a>
###### Token effect

Zero tokens on a successful start; only the failed parent tool call retains this text.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--parent-result-indirectly"></a>
##### Parent result, indirectly

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--what-the-model-sees-3"></a>
###### What the model sees

The driver extracts only the child's own last assistant output or captured structured value; seeded parent messages and intermediate child work do not become the result.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--token-effect-3"></a>
###### Token effect

The parent receives one data-dependent result through the consumer; all other child tokens stay in the child session.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--kv-cache-effect-3"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-subagent-in-process-driver--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Runs expose no `sendMessage`/`resume`** — the optional runtime capabilities are absent on in-process runs.
- **Structured capture accepts the `defineTool` schema subset only** — unsupported JSON Schema constructs fail before the child is created; a provider needing a broader schema vocabulary requires a different runtime.

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process"></a>
### `@taskweaver/dsh-subagent-spawn-in-process`

<!-- migrated-from: packages/runtime/subagent/subagent-spawn-in-process/README.md -->
目录：`subagent/subagent-spawn-in-process`。
package.json 描述：In-process spawn subagent backend: runs a fresh child agent on ctx.agents

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--taskweaver-dsh-subagent-spawn-in-process"></a>
The spawn provider creates a fresh child `Agent` in the current process. The child has its own session, sees no parent conversation history, and reuses the host's agent factory and LLM/tool services.

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--behavior"></a>
#### Behavior

`start(request)` delegates to [`startInProcessRun`](./README.zh.md#pkg-taskweaver-dsh-subagent-in-process-driver) with no seed and awaits publication before returning. The child receives parent working-directory/session lineage and inherits the parent model unless overridden, but starts with an empty conversation.

The shared driver owns depth checking, persona and tool-filter setup, structured output, required-signal cancellation, one-shot execution, result reading, and quiescent disposal. A startup rejection leaves no published child; provider unload after fulfillment does not revoke the holder-owned run.

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--capabilities"></a>
#### Capabilities

Spawn advertises `{ outputSchema: true, depthLimit: true, toolFilter: true, persona: true }` because it controls the child's creation window and can enforce all four features.

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--config"></a>
#### Config

| Key | Meaning |
|---|---|
| `providerName` | Registry name on `ctx.subagents` (default `spawn`). |

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--child-agent-request"></a>
##### Child-agent request

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--what-the-model-sees"></a>
###### What the model sees

The fresh child receives the standalone task content verbatim, inherits the parent model and workspace by default, and sees the global prompt with any configured child-scoped persona shadow. A tool filter removes global wire schemas, executable lookup, and Code Mode SDK bindings for that child but leaves independently registered guidance. It receives zero parent conversation messages; the filter is visibility/composition, not an authority grant inherited from the parent.

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--token-effect"></a>
###### Token effect

The child pays for a new independent context and history; no parent-history tokens are duplicated. Persona changes this child's repeated prompt cost, while filtering changes its schema or generated SDK cost.

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--kv-cache-effect"></a>
###### KV Cache effect

Independent of the parent request cache. Child history grows append-only, while persona, tool-filter, generated-SDK, provider, or model changes establish a different child prefix.

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--parent-tool-result-indirectly"></a>
##### Parent tool result, indirectly

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--what-the-model-sees-1"></a>
###### What the model sees

Through `dsh-tool-subagent`, the parent receives only the child's final output or stop-reason error.

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--token-effect-1"></a>
###### Token effect

Parent input grows by one data-dependent result retained until compaction.

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-subagent-spawn-in-process--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Fresh means no parent transcript** — the child inherits cwd, lineage, model, and explicitly configured persona/tool restrictions, but none of the parent's conversation; use the fork provider when completed-turn context is required.

<a id="pkg-taskweaver-dsh-tool-subagent"></a>
### `@taskweaver/dsh-tool-subagent`

<!-- migrated-from: packages/runtime/subagent/tool-subagent/README.md -->
目录：`subagent/tool-subagent`。
package.json 描述：Model-facing subagent delegation tool over the ctx.subagents seam

<a id="pkg-taskweaver-dsh-tool-subagent--taskweaver-dsh-tool-subagent"></a>
The model-facing delegation tool over one configured `ctx.subagents` provider. Changing the provider changes transport without changing the execution contract.

<a id="pkg-taskweaver-dsh-tool-subagent--provider-selection-and-lifecycle"></a>
#### Provider selection and lifecycle

Each plugin instance binds one `provider` to one `toolName`; the model receives no provider selector. Load another distinctly named instance to expose another transport. The tool registers only while its provider exists, avoiding sibling load-order and provider-reload dependencies. Its description follows `provider.inheritsParentContext`: fresh children require standalone prompts, while forked children already see completed parent turns.

A foreground call passes the execution signal through startup and execution, awaits `run.result`, and always awaits `run.dispose()` before returning. Only `completed` returns the canonical `{ kind: 'foreground', runId, output: JsonValue[] }`, rendered as the same final text. Abort, refusal, token limit, and other failures become errored tool results whose message contains the stop-reason headline, an optional provider-authored `SubagentResult.diagnostic`, and then any preserved partial assistant text. The diagnostic remains separate from `SubagentResult.output`, so a truncated answer is never reported as success or confused with infrastructure detail. If result collection and disposal both reject, the errored result preserves both failures.

`backgroundMode` selects both the background route and the omitted `run_in_background` default. `one-shot` waits in the foreground by default; an explicit `true` registers a plain parent-owned Task and returns canonical `{ kind: 'background', jobId }`, rendered as `started background subagent job <id>`, even when the provider supports continuable children. Generic task tools own its later status, collection, cancellation, and notices; a failed Task keeps the stop reason and the same optional provider diagnostic in its detail. `continuable` runs in the background when the argument is omitted or `true`; an explicit `false` waits for the result in the foreground. Its background route requires a provider with the `prepareContinuable` capability, calls `ctx.subagents.startContinuable()`, and returns `{ kind: 'continuable', subagentId }`, rendered as `started subagent <childId>`. The route resolves at inbox acceptance: the child owns its own turns from there, so this call neither waits for nor collects a result. The child's transcript by that id remains the source of its detailed output, and the optional global `send_message` tool sends it more work. The continuation service delivers one settlement notice whenever the child's Activation ends, containing its outcome and any final assistant message independently of `report`. Starting continuable work does not require `send_message` to be loaded. See the [background subagent Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-08-background-subagent-tasks.md`）, the [continuable subagents Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.md`）, and the [background-first delegation Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-08-11-background-first-continuable-delegation.md`）.

`toolFilter` changes the child's global tool layer but is not a parent-derived authority ceiling. See the [agent-scope security non-goal]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.md#security-and-authority-are-non-goals`）.

<a id="pkg-taskweaver-dsh-tool-subagent--config"></a>
#### Config

| Key | Meaning |
|---|---|
| `provider` (required) | Provider name (`spawn`, `fork`, `acp`, ...). |
| `toolName` | Model-facing name, default `subagent`; distinct for every loaded instance. |
| `enableRunInBackground` | Exposes background mode, default `true`; disabling also rejects forced background calls. |
| `backgroundMode` | Background lifecycle policy, default `one-shot`. `one-shot` defaults calls to foreground; `continuable` defaults them to background, requires the provider's `prepareContinuable` capability, and returns a durable child id without requiring the follow-up tool. |
| `agentOptions` | Provider-specific child `provider`, `model`, and positive `maxTokens`; the in-process provider treats explicit values as overrides of inherited parent options. |
| `persona` | Per-child persona; requires provider `persona` capability. |
| `toolFilter` | Per-child global-tool restriction; requires `toolFilter` capability. |
| `maxDepth` | Absolute delegation-depth cap, default `3` (`0` forbids delegation); a numeric cap requires the `depthLimit` capability and fails the mount without it. `'provider-managed'` sends no cap for an out-of-process provider whose budget belongs to the child harness. The tool stays visible at the cap; each attempted start checks the calling agent's current depth and returns an errored tool result when rejected. |

<a id="pkg-taskweaver-dsh-tool-subagent--concurrency"></a>
#### Concurrency

Foreground and background calls are concurrency-safe: sibling delegations in one assistant message overlap under the loop's rolling pool (`maxParallelToolCalls`), and results still commit in model order. Children work in their own sessions and a run never mutates the parent session; the one-shot background form's one parent-owned write — registering a Task — is a synchronous, commutative insertion that tolerates concurrent dispatch, so overlapping background calls acquire their job ids in dispatch-race order. Coordinating sibling workspace effects belongs to the model, exactly as it already does for background and continuable children. See the [parallel subagent Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-08-09-parallel-subagent-delegations.md`） and the [parallel tool-call Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md`）.

<a id="pkg-taskweaver-dsh-tool-subagent--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-subagent--tool-schema"></a>
##### Tool schema

<a id="pkg-taskweaver-dsh-tool-subagent--what-the-model-sees"></a>
###### What the model sees

The generated default [`subagent` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-subagent`） under this instance's configured name while its provider exists. Provider context inheritance changes the tool and prompt descriptions. Enabled background mode adds `run_in_background`: continuable mode documents its `true` default, runtime settlement notice, and explicit foreground override, while one-shot mode documents its `false` default and the job id collected with `job_output` or stopped with `job_kill`. While the tool is visible in an assembly's scope, a `tool:<toolName>` system-prompt section tells the model to start independent continuable delegations together, keep working while they run, and choose foreground only when its next action depends on the result; a tool restriction removes both its schema and this guidance.

<a id="pkg-taskweaver-dsh-tool-subagent--token-effect"></a>
###### Token effect

Fixed schema cost per parent request; each provider instance adds one schema, and each continuable instance adds one short system-prompt section.

<a id="pkg-taskweaver-dsh-tool-subagent--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while provider instances, names, descriptions, and schemas are unchanged. Provider registration lifecycle may invalidate parent reuse from the first changed tool definition.

<a id="pkg-taskweaver-dsh-tool-subagent--foreground-result"></a>
##### Foreground result

<a id="pkg-taskweaver-dsh-tool-subagent--what-the-model-sees-1"></a>
###### What the model sees

The call retains the description and prompt. Success contains only the child's final text; other outcomes become `Error: <stop reason>`, followed by a safe provider diagnostic when present and then any partial assistant text. Intermediate child steps stay out of the parent.

<a id="pkg-taskweaver-dsh-tool-subagent--token-effect-1"></a>
###### Token effect

The prompt and result remain in parent history until compaction; child working context remains in the child.

<a id="pkg-taskweaver-dsh-tool-subagent--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-subagent--background-result"></a>
##### Background result

<a id="pkg-taskweaver-dsh-tool-subagent--what-the-model-sees-2"></a>
###### What the model sees

Start returns exactly `started subagent <childId>` in configured continuable mode, or `started background subagent job <id>` in configured one-shot mode. In one-shot mode the generic task surface provides later status, final output, cancellation responses, and notices; failed status detail includes the provider diagnostic when the result supplied one. In continuable mode this tool returns no result of its own; the child's settlement reaches the parent as a [service-owned notice](./README.zh.md#pkg-taskweaver-dsh-subagent--settlement-notice), an independently loaded `send_message` tool delivers follow-ups, and the child's transcript by its id is the source of its detailed output.

<a id="pkg-taskweaver-dsh-tool-subagent--token-effect-2"></a>
###### Token effect

The acknowledgement is retained; a one-shot final output enters parent history only when collected or injected, while a continuable child's output never returns through this tool — its settlement notice arrives independently of any tool result.

<a id="pkg-taskweaver-dsh-tool-subagent--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-subagent--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Background runs expose no result through this tool** — a one-shot task's final output is collected through the generic task surface, and a continuable child's output stays in its own session, read by its subagent id. The settlement notice states how that child ended and carries any final assistant message, but it is not this call's return value and cannot be awaited here.
- **Duplicate names across waiting one-shot instances are detected late** (`TODO(subagent-dup-toolname)`) — continuable instances reserve their prompt-section name during plugin application, but preventing provider-registration rollback for waiting one-shot instances requires a registry of intended names.
- **Child policy is fixed per instance** — another model, persona, tool filter, or depth cap requires another distinctly named tool.

<a id="pkg-taskweaver-dsh-tool-subagent-control"></a>
### `@taskweaver/dsh-tool-subagent-control`

<!-- migrated-from: packages/runtime/subagent/tool-subagent-control/README.md -->
目录：`subagent/tool-subagent-control`。
package.json 描述：Globally named send_message, interrupt_agent, and list_agents tools over ctx.subagents continuations

<a id="pkg-taskweaver-dsh-tool-subagent-control--taskweaver-dsh-tool-subagent-control"></a>
The optional, globally named `send_message`, `interrupt_agent`, and `list_agents` tools are thin adapters over `ctx.subagents`. Provider-bound `@taskweaver/dsh-tool-subagent` instances register distinct delegation tools per transport; this separately loaded package registers shared control tools once, so multiple delegation tools never register duplicate global controls. The root plugin registers `send_message` and `interrupt_agent` and requires only `subagents`; the separately loadable `./list-agents` plugin registers `list_agents` and declares `subagents` plus `agents` as load-time dependencies. Its catalog reads additionally require the session store and projection registry at call time, but no query service. A deployment can keep the root tools while omitting the list tool. No tool's presence determines whether a delegation tool starts continuable work. These tools own only the parent-to-child direction; the independently installed [`@taskweaver/dsh-tool-subagent-report`](./README.zh.md#pkg-taskweaver-dsh-tool-subagent-report) owns the child-to-parent direction.

The tool performs no lifecycle routing — residency and cold resume belong to the subagent service. It passes `exec.agent` as the exact live parent that authorizes delivery and records every message source as `{ kind: 'coordinator', senderSessionId: parent.id }`, which the service retains but never treats as authority. Every message becomes the subagent's next FIFO turn through `Agent.followup()`: if the child is still working, the message waits until its current turn finishes, so it cannot redirect work already underway. The tool forwards its execution signal, which owns admission only until inbox acceptance; once the child accepts the message the accepted turn cannot be cancelled through this tool. This call returns no child reply — its transcript by that id is the source of what it did — and a child with `report` sends content on its own initiative as a separate parent message. A delivery failure becomes an errored tool result stating the message was not delivered.

`interrupt_agent(agent_id)` passes `exec.agent` as the exact live ancestor authority for `ctx.subagents.interrupt()`: the target may be a direct child or a deeper descendant, and the service — never this tool — verifies the caller against the target Activation's recorded lineage. Only the target's current turn stops (`keepInbox`): queued messages stay parked until a later `send_message`, published descendants keep running, and the child stays available for follow-ups. The call returns as soon as the stop request is accepted, without waiting for target quiescence; an absent or already-settled target is an accepted no-op, while self, sibling, stale, and non-ancestor callers become errored results.

`list_agents` takes one optional `scope` argument, derives the root id from the calling agent, and projects the service catalog to continuable children without a cursor. The default `children` scope reads `ctx.subagents.listChildren()`; `descendants` reads `ctx.subagents.listDescendants()`, whose one-corpus walk crosses ordinary sessions and one-shot children and renders surviving rows in stable pre-order with `parent=<id> depth=<n>`. The `parent` annotation is the durable direct-parent session id and may name an ordinary session omitted from the output. For the calling agent, only depth-1 child entries are `send_message` candidates; deeper child entries are `interrupt_agent` candidates only. Status comes from the live Agent registry: `running` (active driver), `idle` (resident between turns, possibly waiting on agents it started), or `ready` (storage only and resumable rather than terminal). The service result also contains one-shot session-backed subagents for consumers such as a UI, but those entries are omitted from this model tool because they cannot accept `send_message`. Diagnostics remain visible, with positions in the descendants scope. Durable identity and mode come from each child's descriptor, while delivery-time authority and Activation ownership checks remain the service's.

<a id="pkg-taskweaver-dsh-tool-subagent-control--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-subagent-control--tool-schema"></a>
##### Tool schema

<a id="pkg-taskweaver-dsh-tool-subagent-control--what-the-model-sees"></a>
###### What the model sees

The generated [schemas]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-subagent-control`）: `send_message` takes `subagent_id` and `message`, describing that the message becomes the subagent's next turn, that this call returns no answer from the subagent, and that a failure means the message was not delivered; `interrupt_agent` takes `agent_id`, describing that only the current turn stops, queued messages park, descendants keep running, and acceptance precedes the actual stop; `list_agents` takes the optional `scope` enum.

<a id="pkg-taskweaver-dsh-tool-subagent-control--token-effect"></a>
###### Token effect

Fixed schema cost per parent request.

<a id="pkg-taskweaver-dsh-tool-subagent-control--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable; the schema does not change at runtime.

<a id="pkg-taskweaver-dsh-tool-subagent-control--interrupt-result"></a>
##### Interrupt result

<a id="pkg-taskweaver-dsh-tool-subagent-control--what-the-model-sees-1"></a>
###### What the model sees

`interrupt requested for agent <agent_id>` on acceptance. An unauthorized caller — self, sibling, stale, or non-ancestor — is an errored result naming the rejection; an absent or settled target still renders the acceptance line.

<a id="pkg-taskweaver-dsh-tool-subagent-control--token-effect-1"></a>
###### Token effect

One short acknowledgement per call; the interrupted turn's abort is visible only in the child's own transcript.

<a id="pkg-taskweaver-dsh-tool-subagent-control--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; each result follows the reusable request prefix.

<a id="pkg-taskweaver-dsh-tool-subagent-control--delivery-result"></a>
##### Delivery result

<a id="pkg-taskweaver-dsh-tool-subagent-control--what-the-model-sees-2"></a>
###### What the model sees

`message queued as the next turn for subagent <subagent_id>` on acceptance; the canonical output carries the accepted `messageId`. A failure — an unauthorized or unknown child, a descriptor-less child that cannot be resumed, or admission rejected — is an errored result whose message states the message was not delivered.

<a id="pkg-taskweaver-dsh-tool-subagent-control--token-effect-2"></a>
###### Token effect

One short acknowledgement per call; the child's response never returns through this call. A separately granted `report` may append selected content to parent history.

<a id="pkg-taskweaver-dsh-tool-subagent-control--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-subagent-control--listing-result"></a>
##### Listing result

<a id="pkg-taskweaver-dsh-tool-subagent-control--what-the-model-sees-3"></a>
###### What the model sees

One line per continuable child in stable catalog order: `<id> [<status>] — <label>` (`running` = active driver, `idle` = resident between turns, `ready` = storage only; resumable rather than terminal, not a result waiting to be collected — a direct child in that state can be resumed by `send_message`), plus `<id> [diagnostic: <reason>]` for a candidate that could not be read (`corrupt`, `unsupported`, or `unavailable`). The `descendants` scope inserts ` parent=<id> depth=<n>` before the label dash on every line, in pre-order. One-shot children are intentionally absent; `(no subagents)` means no continuable child or diagnostic survived the projection. Diagnostics never expose descriptor contents.

<a id="pkg-taskweaver-dsh-tool-subagent-control--token-effect-3"></a>
###### Token effect

Grows linearly with the listed continuable children — the whole tree under the `descendants` scope; there is no cursor or cap, so long-lived parents with many persisted children pay the full list each call.

<a id="pkg-taskweaver-dsh-tool-subagent-control--kv-cache-effect-3"></a>
###### KV Cache effect

Append-only; each result follows the reusable request prefix.

<a id="pkg-taskweaver-dsh-tool-subagent-control--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **A queued message has no independent result** — acceptance returns only its inbox `messageId`; the child's work lands in the durable child Session and is never collected through this tool. A child granted `report` may send selected content back separately, but that message is not this call's result.
- **No steering of the current turn** — every message opens a later FIFO turn, so a message sent while the child is working runs only after its current turn finishes and cannot redirect it.
- **Listing is a snapshot, not a delivery promise** — it may race publication, disposal, or a later message, and another process may activate a child this process reports as `ready`; cross-process accuracy requires a shared lease. `interrupt_agent` performs the authoritative live-lineage check itself, so discovery staleness cannot grant authority.
- **No pagination or deletion** — the complete stably ordered set is returned, and persisted children remain listed for as long as their sessions remain in persistence; a service-level bound or delete operation is a later product decision.

<a id="pkg-taskweaver-dsh-tool-subagent-report"></a>
### `@taskweaver/dsh-tool-subagent-report`

<!-- migrated-from: packages/runtime/subagent/tool-subagent-report/README.md -->
目录：`subagent/tool-subagent-report`。
package.json 描述：Child-scoped report tool over ctx.subagents continuations

<a id="pkg-taskweaver-dsh-tool-subagent-report--taskweaver-dsh-tool-subagent-report"></a>
The optional child-scoped `report` tool is a thin adapter over `ctx.subagents.reportFrom()`. It gives every continuable in-process child a return channel to the Agent that started it, and installs the prompt section that instructs the child to use it. The package registers a continuable-child setup contribution instead of a global tool, so the tool and its guidance exist only inside those children. Roots, one-shot subagents, remote subagent providers, sibling scopes, and agentless tool execution never present or execute it. Installing this package grants only that child-scoped capability; the parent-to-child direction remains the independent [`@taskweaver/dsh-tool-subagent-control`](./README.zh.md#pkg-taskweaver-dsh-tool-subagent-control), and continuable mode depends on neither package.

The child-scoped `tool:report` prompt section instructs the child to call `report` once before finishing, with a self-contained answer, and earlier whenever a partial finding changes what the parent should do next. The instruction is guidance, not enforcement: the mechanism still accepts zero or many calls in one turn, and no runtime path rejects a child that never reports. A successful call neither concludes the turn, settles the Activation, nor prevents later parent follow-ups, and finishing a turn never reports automatically. The tool accepts no recipient: `exec.agent` is the sender's exact live Agent and the authority credential, and the service derives the sole recipient from that child's durable `parentSession`. Success returns the stable `MessageId` of the parent-accepted message, not a read receipt, an inbox-occurrence id, a parent-log acknowledgement, a turn-completion receipt, or a persistence flush. A parent absent from the registry fails the call with `direct parent is not live; report was not delivered` — registry presence governs parent resolution, and a registered parent already in host-owned disposal still accepts while its log admits appends. The service performs no injection, parent cold resume, or offline mailbox write; the durable child transcript remains the recovery source, and a failed tool call does not prove non-delivery (a later `tools/post-execute` veto can fail a call whose report was already accepted).

`reportDelivery` selects parent scheduling for every accepted report. `next-step` (the default) uses `parent.steer()`: a running parent receives the report at its nearest safe step boundary, while an idle parent starts a turn. Reports accepted in sequence share the next-step FIFO, including the later manager-authored settlement notice, so the parent cannot observe settlement before an earlier report; reports waiting together enter one claimed batch. `quiet` uses `parent.inject()`, adding the same next-step context without waking a parked parent. This is deployment scheduling policy, so the model-facing schema cannot select or override it per call.

Scope-local registration deliberately survives the child's global `toolFilter`, so a delegation allow-list cannot remove the only return channel. A deployment that requires a child with no return channel omits this package.

The contribution body is exported as `installReportTool(childCtx, ctx, delivery)` so inspection consumers can install `report` and its guidance into a minted child scope, and returns the one disposer revoking both. The generated tool catalog uses that path because the global registry cannot expose a scope-local schema. Production composition still enters through `apply()`; the subagent seam's contribution registry remains private.

<a id="pkg-taskweaver-dsh-tool-subagent-report--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-subagent-report--tool-schema"></a>
##### Tool schema

<a id="pkg-taskweaver-dsh-tool-subagent-report--what-the-model-sees"></a>
###### What the model sees

The generated [`report` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-subagent-report`）: one required `output` string. Its description states that the child must report once before finishing, that reporting reaches only the Agent that started the child, and that it does not end the turn. It carries no recipient or delivery-mode parameter. The separate `tool:report` prompt section repeats the obligation outside the schema, where a child that ignores tool descriptions still reads it.

<a id="pkg-taskweaver-dsh-tool-subagent-report--token-effect"></a>
###### Token effect

Fixed schema and prompt-section cost per continuable-child request, and none in any other Agent's requests.

<a id="pkg-taskweaver-dsh-tool-subagent-report--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable within a child; neither the schema nor the section changes at runtime. Removing the package revokes both from resident children, which changes their next request prefix.

<a id="pkg-taskweaver-dsh-tool-subagent-report--report-result"></a>
##### Report result

<a id="pkg-taskweaver-dsh-tool-subagent-report--what-the-model-sees-1"></a>
###### What the model sees

`report accepted by the agent that started you as message <messageId>` on acceptance; the canonical output carries the stable `messageId`. A failure from an unauthorized sender, an unavailable parent, or a closing lifecycle is an errored result. The description says a failed call may still have arrived because a later `tools/post-execute` failure can replace the result after `reportFrom()` accepted the message.

<a id="pkg-taskweaver-dsh-tool-subagent-report--token-effect-1"></a>
###### Token effect

One short acknowledgement per call in the reporting child. The reported content is additionally billed to the parent: next-step delivery joins the next request in an open parent turn or starts a turn for an idle parent, while quiet delivery waits for another input to wake the parent.

<a id="pkg-taskweaver-dsh-tool-subagent-report--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only in the child. In the parent, the framed report follows existing history and preserves the reusable prefix.

<a id="pkg-taskweaver-dsh-tool-subagent-report--parent-visible-report"></a>
##### Parent-visible report

<a id="pkg-taskweaver-dsh-tool-subagent-report--what-the-model-sees-2"></a>
###### What the model sees

One user-role parent message framed as `Background subagent <child-id> reported:` followed by the child's exact `output`, with a durable source `{ kind: 'subagent-report', senderSessionId: <child-id> }` that names the child.

<a id="pkg-taskweaver-dsh-tool-subagent-report--token-effect-2"></a>
###### Token effect

The child's complete `output` plus the one-line frame, uncapped by this package.

<a id="pkg-taskweaver-dsh-tool-subagent-report--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; the report follows the parent's reusable request prefix. Next-step delivery wakes the parent and may extend its open turn, while quiet delivery does not wake it.

<a id="pkg-taskweaver-dsh-tool-subagent-report--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **A parent whose host-owned disposal already started can still accept** — `AgentHandle.dispose()` cancels, awaits quiescence, and only then unwinds the scope and leaves the registry; it exposes no signal for "disposal started." A report accepted in that window is appended to the parent's transcript, but that parent will not act on it in this process. A continuation-manager-owned parent rejects forest teardown through the manager's admission boundary.
- **Acceptance is weaker than durable delivery** — there is no durable mailbox, idempotency key, delivery receipt, retry protocol, or exactly-once claim. A process failure after one side recorded acceptance leaves the outcome ambiguous, and an external retry may duplicate the report.
- **A staged quiet report is not immediately reconstructable** — acceptance returns its stable `MessageId`, but the parent Session reconstructs the framed content only after pending context reaches its ordinary log boundary.
- **Granting waits for the next Activation; revocation is immediate** — installing this package after a child becomes resident grants `report` and its guidance only on that child's next Activation, while removing the package revokes both from resident children immediately.
- **Nested reporting reaches exactly one edge upward** — a grandchild reports to its direct child parent, never to the top-level coordinator, which must explicitly report a derived update later.
- **No rate limiting** — the default `next-step` mode can amplify model work when nested children report frequently, although reports waiting together share one step; a deployment that accepts unread reports over that amplification selects `quiet`.

<a id="family-subagent"></a>
### 原族级说明（迁移保留）

<a id="family-subagent--subagent-subagent-capability-family"></a>
This family lets an agent delegate work to child agents. Multiple named providers may coexist in one context.

| Package | Role | ctx key |
|---|---|---|
| [`subagent/`](./README.zh.md#pkg-taskweaver-dsh-subagent) | Defines provider registration, delegation, and continuation | `ctx.subagents` |
| [`subagent-inprocess/`](./README.zh.md#pkg-taskweaver-dsh-subagent-in-process-driver) | Provides the shared in-process run driver | — |
| [`subagent-spawn-in-process/`](./README.zh.md#pkg-taskweaver-dsh-subagent-spawn-in-process) | Starts a fresh in-process child | registers on `ctx.subagents` |
| [`subagent-fork-in-process/`](./README.zh.md#pkg-taskweaver-dsh-subagent-fork-in-process) | Starts an in-process child from the parent's completed history | registers on `ctx.subagents` |
| [`tool-subagent/`](./README.zh.md#pkg-taskweaver-dsh-tool-subagent) | Exposes delegation to the model | registers on `ctx.tools` |
| [`tool-subagent-control/`](./README.zh.md#pkg-taskweaver-dsh-tool-subagent-control) | Exposes child messaging and listing to the model | registers on `ctx.tools` |
| [`tool-subagent-report/`](./README.zh.md#pkg-taskweaver-dsh-tool-subagent-report) | Provides the child-to-parent report channel | registers in child scopes |

TaskWeaver provides its own in-process child-agent providers. External Agent SDK integrations are outside the supported runtime and are not installed by the application.
