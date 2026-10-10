# goal 包族

<a id="family-goal"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

在会话日志中持久化目标状态，并提供目标创建、读取和续跑接口。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-command-goal`](#pkg-taskweaver-dsh-command-goal) | `goal/command-goal` | [接口与限制](#pkg-taskweaver-dsh-command-goal) |
| [`@taskweaver/dsh-goal`](#pkg-taskweaver-dsh-goal) | `goal/goal` | [接口与限制](#pkg-taskweaver-dsh-goal) |
| [`@taskweaver/dsh-goal-round-driver`](#pkg-taskweaver-dsh-goal-round-driver) | `goal/goal-round-driver` | [接口与限制](#pkg-taskweaver-dsh-goal-round-driver) |
| [`@taskweaver/dsh-tool-goal`](#pkg-taskweaver-dsh-tool-goal) | `goal/tool-goal` | [接口与限制](#pkg-taskweaver-dsh-tool-goal) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-command-goal"></a>
### `@taskweaver/dsh-command-goal`

<!-- migrated-from: packages/runtime/goal/command-goal/README.md -->
目录：`goal/command-goal`。
package.json 描述：Human-facing slash command for persisted same-session goals

<a id="pkg-taskweaver-dsh-command-goal--taskweaver-dsh-command-goal"></a>
Human-facing `/goal` control over [`ctx.goals`](./README.zh.md#pkg-taskweaver-dsh-goal). The plugin registers one global command through [`ctx.commands`](../interaction/README.zh.md#pkg-taskweaver-dsh-commands), so every composed command adapter discovers and executes it without a model turn. The [human goal-command Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-19-human-goal-command.md`） owns the UX and composition decisions.

<a id="pkg-taskweaver-dsh-command-goal--command-contract"></a>
#### Command contract

| Input | Result |
|---|---|
| `/goal` | Show the current objective, durable phase, round count/cap, process-local activation, and valid next commands; a blocked goal also shows its policy code and explanation, while no goal shows usage. |
| `/goal <objective>` | Create and arm a goal, or replace a completed goal with a fresh identity. An unfinished goal is never replaced without an explicit clear. |
| `/goal edit <objective>` | Edit the current objective without changing its phase or activation. Editing a completed goal creates a fresh active goal. |
| `/goal pause` | Pause an active goal and disarm continuation. |
| `/goal resume` | Resume a stopped goal or rearm an active goal after session resume/fork, subject to its remaining round cap. |
| `/goal clear` | Clear the current pointer while retaining its durable history and tombstone. |

Control words are case-insensitive only when they occupy the complete input. Every other non-empty suffix is an objective, so `/goal pause after verification` creates that literal objective. The goal domain trims and validates objectives. Because the generic command plane has no modal editor or confirmation primitive, `edit` takes its replacement inline and an unfinished replacement returns a direct error instructing the user to edit or clear.

The command declares `input.images`, so composer image attachments may accompany an invocation. Attachments only accompany an objective: on a successful create or edit the producer submits one user followup carrying the admitted image blocks plus the fixed text `Reference images for the goal objective.`, so later goal rounds read them from ordinary session history without the goal domain storing attachment state. Every other sub-command, and any refused create or edit, returns a direct error and submits nothing, so the dispatching composer keeps the images.

Expected domain rejections become stable direct command errors without exposing branded ids or revisions. Unexpected implementation failures still reject dispatch so adapters can report them as command failures. Generic command text and output remain live UI state; `dsh-goal` persists every accepted mutation through its own durable `goal/change` event.

<a id="pkg-taskweaver-dsh-command-goal--composition"></a>
#### Composition

The producer injects `commands` and `goals`. A custom app mounts their owners plus this plugin; automatic continuation remains an independent choice:

```yaml
- id: commands
  name: '@taskweaver/dsh-commands'
- id: goal
  name: '@taskweaver/dsh-goal'
- id: command-goal
  name: '@taskweaver/dsh-command-goal'
```

The shipped `dsh` base enables the persisted-goal stack and this command; the Web client provides its interactive adapter. The ACP automation app enables the domain and model tools without a command adapter; `goals: false` removes that stack. The UI-less `agent-spine-demo` requires an explicit `goals: {}` so headless one-shot callers do not silently change from one physical turn to a multi-round operation.

<a id="pkg-taskweaver-dsh-command-goal--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-command-goal--human-goal-control"></a>
##### Human `/goal` control

<a id="pkg-taskweaver-dsh-command-goal--what-the-model-sees"></a>
###### What the model sees

The slash input, mutation, and direct status/error output are absent from model requests. The goal domain records the mutation as `goal/change`; an enabled same-session driver may expose the resulting state in a later continuation prompt. Presentation text is never logged. When a create or edit carries image attachments, the model sees one ordinary user message: the image blocks followed by the text `Reference images for the goal objective.`; it precedes the next goal round in session history.

<a id="pkg-taskweaver-dsh-command-goal--token-effect"></a>
###### Token effect

Reading status, mutating a goal, or receiving a direct command error adds no model tokens. An enabled same-session driver may add later goal-round prompts. An objective's image attachments add one user message billed like any image prompt.

<a id="pkg-taskweaver-dsh-command-goal--kv-cache-effect"></a>
###### KV Cache effect

Command discovery, mutations, and direct output do not affect the cache. Later continuation prompts follow the driver's ordinary request history.

<a id="pkg-taskweaver-dsh-command-goal--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Plain-text interaction only** — the generic command registry has no modal edit form or replacement-confirmation callback; inline edit and explicit clear keep destructive intent deterministic across adapters.
- **No per-command round-cap argument** — `defaultMaxGoalRounds` remains deployment config, while a direct human request may ask the model to edit `max_goal_rounds` through the separately authorized goal tool.
- **No continuous status widget** — bare `/goal` is the portable observation API; adapter-specific badges and reconnectable command output remain future UI work.
- **Web command adapter only in the shipped apps** — headless, ACP automation, and JSON-RPC adapters do not consume `ctx.commands`. Ordinary prompts can still authorize model-facing goal tools when those are composed.

<a id="pkg-taskweaver-dsh-goal"></a>
### `@taskweaver/dsh-goal`

<!-- migrated-from: packages/runtime/goal/goal/README.md -->
目录：`goal/goal`。
package.json 描述：Event-sourced same-session goal state and lifecycle service for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-goal--taskweaver-dsh-goal"></a>
Event-sourced same-session goal state. The service retains one current completion objective in an agent's existing session while keeping permission to continue as process-local activation. The [goal-domain Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.md`） owns the design rationale; the [goal type catalog]（原文链接目标：`../../../docs/subsystems/goal.md`） records the literal data shapes.

<a id="pkg-taskweaver-dsh-goal--config"></a>
#### Config

```yaml
- id: goal
  name: '@taskweaver/dsh-goal'
  config:
    defaultMaxGoalRounds: 256
```

`defaultMaxGoalRounds` must be a positive safe integer. `create()` materializes this deployment default internally before committing a goal; a request-level value overrides it.

<a id="pkg-taskweaver-dsh-goal--service-contract"></a>
#### Service contract

`ctx.goals` accepts only the exact live `Agent` instance registered under its id. `get()` returns a detached `GoalView`; mutations use a `GoalRef { id, revision }` compare-and-set fence and reject stale refs. The service exposes create, edit, pause, resume, complete, block, and clear verbs through the generated region of [goal.md]（原文链接目标：`../../../docs/subsystems/goal.md#cordis-surface`）. Creation default resolution is internal. `disarm()` is the lifecycle-only exception: it removes process-local continuation authority without writing a revision or emitting a mutation.

At most one goal is current. Creation produces an active revision-one goal and arms it. A non-complete goal must be edited, transitioned, or cleared; a completed goal may be replaced by a globally fresh id. Edits retain phase, blocker reason, and activation. Pause, completion, blocking, and clear disarm activation. A block records a policy-owned lower-kebab-case code plus a normalized free-form explanation; provider limits, configured budgets, execution errors, and requests for human input all use this one durable phase rather than multiplying lifecycle states. Resume accepts a stopped phase or a disarmed active goal only while the configured round cap has remaining capacity; it clears any former blocker reason. An active armed goal rejects the redundant operation.

Every mutation appends a durable `goal/change` event carrying the complete post-mutation snapshot; clear uses a revisioned tombstone. Goal state therefore does not depend on inbox placement, claim, admission, or discard. The session log is the only durable authority.

Strict replay derives lifecycle mutations only from `goal/change` and rejects malformed shapes, discontinuous revisions, illegal lifecycle transitions, non-monotonic per-goal timestamps, and non-sequential admitted goal rounds. Positive rounds advance only on admitted goal-sourced `user/message` events. Mutation timestamps clamp against the preceding goal update when wall time moves backward. Incremental replay retains its cursor at the first corrupt event, and `goal/changed` fires after the durable event commits with listener failures contained.

Activation is never persisted. A fresh cache and every `agent/session-start` edge disarm it even when replay finds an active durable phase. A continuation driver also calls `disarm()` before unload or after durability uncertainty. Session resume, fork, and driver replacement therefore retain the objective, phase, revisions, and admitted-round count without initiating work; a later explicit resume mutation must arm continuation.

The separately published `./invariant` companion maintains an independent fold of each attached session. It rejects malformed goal changes, discontinuous revisions, illegal lifecycle transitions, timestamp regressions, and non-sequential admitted rounds before the candidate event enters the durable log.

<a id="pkg-taskweaver-dsh-goal--extension-points"></a>
#### Extension points

Policy plugins call the service verbs and react to the scoped `goal/changed` event. A continuation consumer admits rounds as `user/message` events with `GoalMessageSource`; ordinary human turns never increment `roundsStarted`. Consumers use the `Agent` interface and events rather than importing `dsh-agent-loop`.

<a id="pkg-taskweaver-dsh-goal--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-goal--goal-state-mutation"></a>
##### Goal-state mutation

<a id="pkg-taskweaver-dsh-goal--what-the-model-sees"></a>
###### What the model sees

Goal mutations do not inject model context. Tools such as `get_goal` return the current state, and a continuation consumer may render the objective and round state when it schedules model work. A future always-visible goal context belongs in a separate context plugin rather than the persistence path.

<a id="pkg-taskweaver-dsh-goal--token-effect"></a>
###### Token effect

Goal mutation events add no model tokens by themselves. Tool results and scheduled continuation prompts account for their own visible state.

<a id="pkg-taskweaver-dsh-goal--kv-cache-effect"></a>
###### KV Cache effect

There is no KV-cache effect until another component exposes goal state in model-visible input.

<a id="pkg-taskweaver-dsh-goal--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **State, not scheduling** — this package does not decide when an armed goal continues, retry abnormal failures, or cancel an active turn; those policies belong to agent-seam consumers.
- **Round-count budget only** — `maxGoalRounds` does not meter tokens, currency, wall time, or provider quotas.
- **No independent evaluator** — the caller that records completion or blocking is authoritative; evaluator-backed certification is deferred to a separate policy layer.
- **One current goal** — parallel objectives and a separate goal database are intentionally absent; history remains available in the session log after replacement or clear.
- **Trusted in-process producers** — a plugin with direct `Session` access can append counterfeit `goal/change` data. Strict replay detects malformed or inconsistent records and leaves goal access failed at that record until the log is repaired; this is integrity detection, not plugin isolation.

<a id="pkg-taskweaver-dsh-goal-round-driver"></a>
### `@taskweaver/dsh-goal-round-driver`

<!-- migrated-from: packages/runtime/goal/goal-round-driver/README.md -->
目录：`goal/goal-round-driver`。
package.json 描述：Race-fenced same-session goal-round driver

<a id="pkg-taskweaver-dsh-goal-round-driver--taskweaver-dsh-goal-round-driver"></a>
Same-session continuation driver for [`ctx.goals`](./README.zh.md#pkg-taskweaver-dsh-goal). It turns an active, armed goal into sequential [goal rounds]（原文链接目标：`../../../docs/glossary.md#goal-round`） through the public `Agent` and session services; the [same-session driver Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-19-same-session-goal-round-driver.md`） owns the race and lifecycle rationale.

<a id="pkg-taskweaver-dsh-goal-round-driver--composition"></a>
#### Composition

```yaml
- id: goal
  name: '@taskweaver/dsh-goal'

- id: tool-goal
  name: '@taskweaver/dsh-tool-goal'

- id: goal-round-driver
  name: '@taskweaver/dsh-goal-round-driver'
```

The plugin has no tunable configuration. `maxGoalRounds` belongs to the goal definition, while the model-facing blocked threshold belongs to [`dsh-tool-goal`](./README.zh.md#pkg-taskweaver-dsh-tool-goal); duplicating either value in the driver could produce divergent policy.

<a id="pkg-taskweaver-dsh-goal-round-driver--round-contract"></a>
#### Round contract

When an exact live agent is idle with an active, armed goal and remaining capacity, the driver first checkpoints pending goal mutations, then reserves `roundsStarted + 1` for the current `{ goalId, revision }`. It queues one `<goal_round>` prompt with `GoalMessageSource`. The `agent/pre-step` listener verifies the complete claimed record and current goal both before and after downstream listeners; only an entered `user/message` increments `roundsStarted`. A reservation rejected as stale does not consume the round number.

`MessageId` identifies the reserved message through durable inbox insertion and claim; it does not identify a turn result. Human messages do not consume the goal cap. If human work enters the inbox before a reservation or joins its pending batch, automatic work yields until the agent becomes idle; a pending automatic prompt in a mixed batch is rejected and re-reserved only after that checkpoint.

The retained prompt names the JSON-quoted objective and `round/maxGoalRounds`, treats the current workspace, tool results, and durable session state as authoritative, requires evidence before completion, and tells the model to leave the goal active when work remains. Quoting preserves multiline or tag-like objective text as data. Goal lifecycle mutations still require the independent authority checks in `dsh-tool-goal`.

<a id="pkg-taskweaver-dsh-goal-round-driver--idle-checkpoint"></a>
#### Idle checkpoint

At whole-agent idle, durable goal phase and revision are authoritative. An active, armed goal with capacity reserves its next round; completion, pause, blocking, and edits suppress continuation. The driver does not classify the preceding activity by correlating the goal message with `turn/end`, so provider errors and token limits are not prompt-level goal outcomes.

<a id="pkg-taskweaver-dsh-goal-round-driver--lifecycle-and-durability"></a>
#### Lifecycle and durability

`goal/changed` creates a durability obligation. Before queuing work, the driver awaits `ctx.sessions.flush()` and rechecks both the goal revision and competing input after the await. A flush failure arriving through `agent/error` disarms continuation before another round can start.

Activation is never inherited when this plugin loads over an existing agent. `GoalService.disarm()` removes process-local authority without changing durable phase, revision, or history; explicit human-authorized resume records the later reactivation. The same rule applies after session resume and fork through the goal domain's `agent/session-start` handling.

Cancellation removes pending inbox work or leaves an agent-wide aborted state. At the next idle checkpoint the driver pauses a goal with a reserved or admitted attempt so cancellation cannot auto-restart it; cancellation unrelated to a goal attempt only disarms process-local continuation. If the pause mutation fails, the driver falls back to disarming. Plugin teardown closes admission, disarms every live goal, cancels active work with the `parent` cause, and awaits the driver plus agent quiescence while its event fence remains installed.

<a id="pkg-taskweaver-dsh-goal-round-driver--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-goal-round-driver--goal-round-prompt"></a>
##### Goal-round prompt

<a id="pkg-taskweaver-dsh-goal-round-driver--what-the-model-sees"></a>
###### What the model sees

Each admitted round is one retained user-role `<goal_round>` block naming the full objective and positive round number. Earlier human messages, goal-state snapshots, assistant output, and tool records remain in the same session history.

<a id="pkg-taskweaver-dsh-goal-round-driver--token-effect"></a>
###### Token effect

One fixed instruction block plus the objective is added per admitted round. Later requests resend retained rounds until compaction shadows them; no fresh agent or copied conversation prefix is created.

<a id="pkg-taskweaver-dsh-goal-round-driver--kv-cache-effect"></a>
###### KV Cache effect

Append-only within an epoch: each admitted round extends the existing conversation after its reusable prefix. Compaction may replace the derived-history suffix and move the reusable boundary.

<a id="pkg-taskweaver-dsh-goal-round-driver--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No independent evaluator** — the model-facing goal policy decides when evidence is sufficient for completion and whether a blocker is semantically unchanged; evaluator-backed certification remains deferred.
- **Same-session execution only** — this package deliberately does not spawn a fresh agent, fork a session prefix, or implement Ralph-style independent attempts; that workflow belongs to its own plugin layer.
- **Accepted-queue unload race** — Cordis plugin unload is asynchronous. A goal prompt already accepted by the agent inbox can begin and consume its round before unload starts; teardown then cancels the request, disarms the goal, and awaits quiescence. No later round starts.
- **Round cap, not resource budget** — token, currency, time, and provider quota policies remain independent. Their session events are not attributed to the goal message or mapped into goal blocker codes.
- **No abnormal auto-retry** — transient provider and persistence failures require a later human-authorized resume rather than an implicit retry policy.

<a id="pkg-taskweaver-dsh-tool-goal"></a>
### `@taskweaver/dsh-tool-goal`

<!-- migrated-from: packages/runtime/goal/tool-goal/README.md -->
目录：`goal/tool-goal`。
package.json 描述：Model-facing same-session goal tools with execution-time authority checks

<a id="pkg-taskweaver-dsh-tool-goal--taskweaver-dsh-tool-goal"></a>
The model-facing control tools for [`ctx.goals`](./README.zh.md#pkg-taskweaver-dsh-goal): `get_goal`, `create_goal`, and `update_goal`. The [goal-tool Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-19-model-facing-goal-tools.md`） owns the authority split and Codex-shaped UX.

<a id="pkg-taskweaver-dsh-tool-goal--tools"></a>
#### Tools

- `get_goal()` returns the current goal or `null`, including the compare-and-set id/revision, durable phase, admitted/capped goal rounds, any blocker reason, and current process-local activation.
- `create_goal(objective, max_goal_rounds?)` creates one goal from a direct top-level human turn. The model may infer long-running goal intent without an exact command phrase; non-human turns and subagents are rejected at execution.
- `update_goal(goal_id, revision, action, objective?, max_goal_rounds?, blocked_reason?)` supports `edit`, `pause`, `resume`, `complete`, and `blocked`. Replacements belong only to `edit`; `blocked_reason` is required only for `blocked` and is persisted with the stable code `model-reported`. Strict-schema empty-string and zero fillers count as omitted, while meaningful values remain limited to their action.

All calls are exclusive, so a model-ordered batch observes earlier mutations and their new revisions. UI clients receive pure generic cards: read for `get_goal`, other for mutations. Mutation cards select the first meaningful action value and otherwise show the goal id, so accepted fillers never produce blank input.

All three canonical values match the compact JSON already rendered to Native callers: `{ goal: null }` or `{ goal: { id, revision, objective, phase, roundsStarted, maxGoalRounds, blockedReason? }, activation }`. Programmatic consumers therefore receive the same domain structure without parsing the rendered JSON.

An autonomous goal round that successfully reports `complete` or `blocked` marks that tool execution with `concludeTurn()` so the physical turn stops after the step. Direct-human mutations never contribute this stop: the assistant may acknowledge the change and concurrent human steering remains available to the loop.

<a id="pkg-taskweaver-dsh-tool-goal--authority"></a>
#### Authority

Execution requires the exact live `exec.agent`, its inherited `AgentRegistry` initiator, running status, and an open turn. Create, edit, pause, and resume additionally require an accepted `{ kind: 'user' }` message or steering event in a runtime-root agent's current turn. Durable fork lineage does not demote a resumed root; live subagent ownership does.

`{ kind: 'user' }` is a host attestation. `Agent.followup()` and `steer()` assign it when their caller omits a source, so plugins, schedulers, and other non-human producers must pass their own source rather than inheriting human authority.

Complete and blocked also accept the exact current goal round: a goal-sourced `user/message` whose id, revision, and round equal the folded current goal. A goal-round blocked call is mechanically rejected until `blockedAfterConsecutiveRounds`; the model judges whether the same condition actually persisted and must describe it in `blocked_reason`. Direct human authority may stop a goal immediately.

<a id="pkg-taskweaver-dsh-tool-goal--config"></a>
#### Config

```yaml
- id: tool-goal
  name: '@taskweaver/dsh-tool-goal'
  config:
    blockedAfterConsecutiveRounds: 3
```

The value must be a positive safe integer. It supplies both the hard lower bound on model self-blocking and the number named in model guidance.

<a id="pkg-taskweaver-dsh-tool-goal--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-goal--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-tool-goal--what-the-model-sees"></a>
###### What the model sees

A fixed goal policy says when semantic human intent warrants creation, requires exact read-before-update refs, explains rearming after resume/fork, and limits completion/blocking claims. The configured threshold is interpolated into that guidance.

<a id="pkg-taskweaver-dsh-tool-goal--goal-policy"></a>
###### Goal policy

```markdown
Use goal tools for one long-running completion objective in the current session. create_goal may infer goal intent from a direct human request in any language; do not create a goal for routine single-turn work. Call get_goal before update_goal and copy its exact goal_id and revision. After session resume or fork, an active goal is disarmed: when a human asks to continue or resume in any wording or language, use update_goal action resume to rearm it. Mark complete only when the objective is actually achieved. Mark blocked only after the same blocking condition persists for at least 3 consecutive goal rounds, and report that concrete condition in blocked_reason; difficulty, uncertainty, or useful remaining work is not blocked.
```

<a id="pkg-taskweaver-dsh-tool-goal--token-effect"></a>
###### Token effect

Small fixed input cost on every request where this plugin's prompt registration is in scope.

<a id="pkg-taskweaver-dsh-tool-goal--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the plugin scope, configured threshold, and guidance text are unchanged. Activation, disposal, or configuration changes may invalidate reuse from this prompt section.

<a id="pkg-taskweaver-dsh-tool-goal--tool-schemas-and-results"></a>
##### Tool schemas and results

<a id="pkg-taskweaver-dsh-tool-goal--what-the-model-sees-1"></a>
###### What the model sees

The generated [`get_goal`, `create_goal`, and `update_goal` schemas]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-goal`）. Successful results are compact JSON. A mutation appends the goal domain's durable `goal/change` event without queuing model context. `activation` in a result is a live observation and never becomes replay authority.

<a id="pkg-taskweaver-dsh-tool-goal--token-effect-1"></a>
###### Token effect

Fixed schema cost plus one compact result per call. The durable mutation adds no separate model-visible context.

<a id="pkg-taskweaver-dsh-tool-goal--kv-cache-effect-1"></a>
###### KV Cache effect

Schemas are prefix-stable while their definitions and visibility are unchanged. Calls and results append after the reusable request prefix without invalidating earlier entries.

<a id="pkg-taskweaver-dsh-tool-goal--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Semantic intent remains model judgment** — execution can prove that the current turn contains a direct human message, not whether the request is substantial enough to merit a goal.
- **Same-condition blocking remains model judgment** — the runtime enforces distinct admitted-round count, not semantic equivalence of obstacles; an independent evaluator is deferred.
- **No scheduling or direct human rendering** — these tools mutate state only; the same-session driver and [`dsh-command-goal`](./README.zh.md#pkg-taskweaver-dsh-command-goal) are independent consumers of the same domain.
- **Goal-round authority requires a driver** — the autonomous `complete`/`blocked` path is dormant unless a continuation driver admits goal-sourced user turns; mounting this tool package alone does not create them.
- **Prompt registration is independent of filtering** — a scope may hide the tools while retaining their guidance unless the deployment scopes both registrations together.

<a id="family-goal"></a>
### 原族级说明（迁移保留）

<a id="family-goal--goal-persisted-same-session-goals"></a>
Durable objective state for an agent session, owned independently of the model-facing tools and continuation policy that consume it. Goal state is part of the owning session log; consumers depend on `dsh-goal`, never on the concrete agent loop.

| Package | Role | ctx key |
|---|---|---|
| [`goal/`](./README.zh.md#pkg-taskweaver-dsh-goal) | Goal state and lifecycle | `ctx.goals` |
| [`goal-round-driver/`](./README.zh.md#pkg-taskweaver-dsh-goal-round-driver) | Same-session goal continuation | — |
| [`tool-goal/`](./README.zh.md#pkg-taskweaver-dsh-tool-goal) | Model-facing goal tools | — |
| [`command-goal/`](./README.zh.md#pkg-taskweaver-dsh-command-goal) | Human-facing goal command | — |

The subsystem reference — goal identity, lifecycle snapshots, activation, change records — is [docs/subsystems/goal.md]（原文链接目标：`../../docs/subsystems/goal.md`）.
