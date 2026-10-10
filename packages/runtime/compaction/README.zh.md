# compaction 包族

<a id="family-compaction"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义上下文压缩能力及其摘要提供者、工具结果裁剪器和手动触发入口。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-command-compact`](#pkg-taskweaver-dsh-command-compact) | `compaction/command-compact` | [接口与限制](#pkg-taskweaver-dsh-command-compact) |
| [`@taskweaver/dsh-compaction`](#pkg-taskweaver-dsh-compaction) | `compaction/compaction` | [接口与限制](#pkg-taskweaver-dsh-compaction) |
| [`@taskweaver/dsh-compaction-basic`](#pkg-taskweaver-dsh-compaction-basic) | `compaction/compaction-basic` | [接口与限制](#pkg-taskweaver-dsh-compaction-basic) |
| [`@taskweaver/dsh-compaction-tool-result-pruner`](#pkg-taskweaver-dsh-compaction-tool-result-pruner) | `compaction/compaction-tool-result-pruner` | [接口与限制](#pkg-taskweaver-dsh-compaction-tool-result-pruner) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-command-compact"></a>
### `@taskweaver/dsh-command-compact`

<!-- migrated-from: packages/runtime/compaction/command-compact/README.md -->
目录：`compaction/command-compact`。
package.json 描述：Human-facing slash command for explicit session compaction

<a id="pkg-taskweaver-dsh-command-compact--taskweaver-dsh-command-compact"></a>
Human-facing `/compact` control over [`ctx.compaction`](./README.zh.md#pkg-taskweaver-dsh-compaction). The plugin registers one global command through [`ctx.commands`](../interaction/README.zh.md#pkg-taskweaver-dsh-commands), so every composed command adapter discovers and executes it without a model turn. The [queued manual compaction Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-30-queued-manual-compaction.md`） owns the admission, lock, and durability decisions.

<a id="pkg-taskweaver-dsh-command-compact--command-contract"></a>
#### Command contract

| Input | Result |
|---|---|
| `/compact` | Summarize one useful balanced older span even below automatic pressure, then report the replaced history-item count and estimated tokens after the standalone bracket is flushed. |
| `/compact` with no compactable history | `No compactable history yet.` — no marker or surface mutation is written. |
| `/compact <anything>` | `Usage: /compact (no arguments)` — the command takes no arguments and calls no compaction backend. |

The command is backend-independent: it depends only on `compactNow(agent, signal)`. The invoking agent is the exact target, and the dispatching UI's cancellation signal is forwarded through the seam. Every resolved invocation records the executor-owned log-only pair `command/run` / `command/done`; neither event joins model history. On success, `command/done.sourceEventSeq` names the transaction's `compaction/summary` event so a presentation can fold the command lifecycle into its checkpoint without parsing result text or assuming adjacent rows.

Expected `ManualCompactionError` codes become stable direct errors:

| Code | Direct result |
|---|---|
| `busy` | `Compaction is unavailable because this process has an active compaction, or the agent is not idle.` |
| `changed` | `The history selected for compaction changed before it could be replaced. The conversation is unchanged; the attempt is recorded in the session log.` |
| `summary` | `Compaction could not produce a useful summary. The conversation is unchanged; the attempt is recorded in the session log.` |
| `commit` | `Compaction did not finish cleanly; some session history may have changed. Inspect the current session state before retrying.` |
| `persistence` | `Compaction finished, but the session could not be saved.` |

The busy result is intentionally process-scoped: a live unmatched marker blocks, while a marker older than the newest `session/end-seed` is stale and does not. Unexpected implementation failures reject dispatch. Cancellation remains authoritative; the backend completes its required close/flush cleanup, and the command settles internally as `Compaction cancelled.` while the command executor stops waiting with its cancellation error. Plugin disposal first unregisters `/compact`, then drains every handler that already started, so root teardown cannot pass an aborted command's close or flush boundary.

Prompts submitted while compaction runs remain accepted in the agent's ordinary FIFO with the same identity and wakeup facts. They start only after the compaction's explicit durability checkpoint and admission release. Idle injected context is not held: it may be logged between `compaction/start` and `compaction/end`, and positional replacement leaves it visible after the checkpoint.

<a id="pkg-taskweaver-dsh-command-compact--composition"></a>
#### Composition

The producer injects `commands` and `compact`. Mount the command registry, one backend, and this plugin:

```yaml
- id: commands
  name: '@taskweaver/dsh-commands'
- id: compaction-basic
  name: '@taskweaver/dsh-compaction-basic'
- id: command-compact
  name: '@taskweaver/dsh-command-compact'
```

The shipped `dsh` base mounts it beside `compaction-basic`, and the Web client provides the command adapter. Automation surfaces that compose no command adapter keep automatic compaction only.

<a id="pkg-taskweaver-dsh-command-compact--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-command-compact--human-compact-control"></a>
##### Human `/compact` control

<a id="pkg-taskweaver-dsh-command-compact--what-the-model-sees"></a>
###### What the model sees

The slash input and direct result never enter a model request. An accepted compaction separately replaces an older span with the backend's user-role checkpoint inside a standalone `compaction/* { turn: null }` bracket.

<a id="pkg-taskweaver-dsh-command-compact--token-effect"></a>
###### Token effect

The command lifecycle adds no model tokens. A successful compaction reduces later requests by replacing the selected span with one framed summary; summarization itself is one auxiliary request.

<a id="pkg-taskweaver-dsh-command-compact--kv-cache-effect"></a>
###### KV Cache effect

Discovery and command bookkeeping do not affect the cache. The accepted surface replacement invalidates reuse from the first shadowed history token.

<a id="pkg-taskweaver-dsh-command-compact--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Idle-only** — `/compact` reports `busy` when a turn or already accepted waking prompt has right of way; the command itself is not queued.
- **No range or policy arguments** — the argument-free form keeps behavior stable across command adapters. Explicit ranges remain the programmatic `compactRegion()` path.
- **Command adapters only** — surfaces without `ctx.commands` cannot invoke it and rely on automatic pressure compaction.

<a id="pkg-taskweaver-dsh-compaction"></a>
### `@taskweaver/dsh-compaction`

<!-- migrated-from: packages/runtime/compaction/compaction/README.md -->
目录：`compaction/compaction`。
package.json 描述：Abstract compaction service seam (ctx.compaction) for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-compaction--taskweaver-dsh-compaction"></a>
The **`CompactionEngine`** (`ctx.compaction`) defines WHAT compaction does — decide when history is too large and summarize an older range into a single surface node — without saying HOW.

This package owns the Service Definition role of the compaction capability, split so each role evolves (and swaps) independently:

| Package | Role |
|---|---|
| `@taskweaver/dsh-compaction` (this) | Service Definition: abstract service + `compaction/*` events + `CompactionResult` + correlated checkpoint-source constructor + tool-pairing boundary helpers |
| `@taskweaver/dsh-compaction-basic` | Service Provider: `ctx.tokenMeter` pressure + token-budget retention + `llm.stream()` summarization |
| `@taskweaver/dsh-command-compact` | Consumer: the human `/compact` command over `ctx.compaction.compactNow()` |

Unlike the bash seam, this Service Definition depends on `@taskweaver/dsh-session` and `@taskweaver/dsh-llm` — the contract's verbs are defined over a `Session` and its output is the `ContentBlock` vocabulary, so they cannot be expressed without naming those packages. That deviation from the "Service Definition depends only on cordis" guidance is intentional and recorded in the [compaction capability-seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md`）.

<a id="pkg-taskweaver-dsh-compaction--service-api-ctx-compaction"></a>
#### Service API (`ctx.compaction`)

All three operations are **abstract** — the backend owns trigger policy, retention, event sequencing, and summarization. Reusable request measurement is a separate service, [`ctx.tokenMeter`](../llm/README.zh.md#pkg-taskweaver-dsh-token-meter), rather than part of this Service Definition.

| Member | Semantics |
|---|---|
| `compactIfNeeded(agent, trigger, signal)` | Consider automatic compaction for `trigger: 'pressure' \| 'context-overflow'`. A pressure trigger may apply the backend's threshold and retained-tail policy; a confirmed overflow may force a useful balanced reduction. Returns the `CompactionResult`, or `null` when no safe range exists. A backend's summarization request is a direct `ctx.llm.stream()` call (not a loop step), so per-call interception happens at `llm/stream`. |
| `compactNow(agent, signal)` | Explicitly compact one useful balanced older span even below automatic pressure. It synchronously reserves idle turn admission before yielding, writes nothing when no useful span exists, records a standalone `compaction/* { turn: null }` attempt before summarization, and awaits its durability checkpoint before release. Expected operational failures use `ManualCompactionError`; cancellation rethrows the exact abort reason. |
| `compactRegion(start, end, agent, signal?)` | Forcibly summarize surface nodes `[start, end]` (inclusive seqs) from `agent.session` into a single replacement node whose source comes from `compactCheckpointSource(compactionId)`. **Throws** if a compaction is already in progress, if `start`/`end` aren't surface nodes, or if `start` is positioned after `end` on the surface. The range is a SURFACE-POSITION span, not a numeric seq interval — after a prior replace lands a fresh high-seq summary node at the shadowed range's position, surface order no longer tracks seq order. |

`CompactionResult` keeps the raw summary and bookkeeping-event seqs available to callers alongside the shadowed range and token accounting; its drift-checked shape lives in the [compaction data-structure reference]（原文链接目标：`../../../docs/subsystems/compaction.md#compactionresult`）.

`compactIfNeeded` and `compactNow` take a required `signal`; `compactRegion`'s is optional. A backend that summarizes via `ctx.llm.stream()` **must** forward it into the call's `GenerateOptions.signal`, so an abort or fiber dispose tears down the in-flight summarization. Automatic and explicit-region brackets recover their numeric owner from the currently open turn. Manual brackets require no open turn and stamp `turn: null`.

`ManualCompactionError.code` is the closed set `busy | changed | summary | commit | persistence`. `changed` and `summary` mean the selected conversation surface was not replaced, but their failed attempt is still recorded in the session log. `commit` is deliberately neutral about partial mutation, and `persistence` means the in-memory bracket closed but its explicit flush failed.

<a id="pkg-taskweaver-dsh-compaction--tool-pairing-boundaries"></a>
#### Tool-pairing boundaries

The Service Definition exports `toolPairingBalancedBefore(session, seq)` and `toolPairingBalancedAfter(session, seq)` for snapping and validating compaction edges. A safe edge has no unanswered assistant tool call crossing it. Each helper validates that the event sequence is in the current surface and answers from balances cached per cut in surface order.

The private per-session cache is keyed by `session.surface.replaceGeneration` and the processed surface-entry count. An unchanged generation extends the fold with unseen tail entries only; a log-only append with no new surface entry does no event reads, while a replacement generation rebuilds current membership and balances. Missing event seqs and a `tool/result` without a preceding open call reject as corrupt surface state.

<a id="pkg-taskweaver-dsh-compaction--surface-contract"></a>
#### Surface contract

`SurfaceEventType` is a closed union — only `user/message`, `assistant/message`, and `tool/result` may carry `surfaceOp`. A `compaction/*` event therefore **cannot** appear on the surface. A successful compaction instead:

1. appends `compaction/start` (log-only) — acquires the lock,
2. summarizes the range,
3. appends `compaction/summary` (log-only) with the summary, range, shadowed seqs, token count, and provider/model call envelope,
4. appends a single `user/message` with `source: compactCheckpointSource(compactionId, sourceCommandId?)` and `surfaceOp: { op: 'replace', start, end }` carrying the summary — **the only surface mutation in this operation**,
5. appends `compaction/end` (log-only) — releases the lock.

The surface mutation (step 4) sits **inside** the lock bracket: `compaction/end` is the last event, so the lock is never released before the mutation lands. A crash between `compaction/start` and `compaction/end` therefore leaves a detectable orphaned lock (a `compaction/start` with no matching `compaction/end`) rather than a `compaction/end` that falsely claims compaction finished while the surface was never shadowed.

The marker pair names lock acquisition and release, not an exclusive event container. An idle `inject()` may append unrelated context between a manual start and end while summarization is pending. Manual stability therefore revalidates the selected span rather than demanding whole-surface equality; the positional replacement leaves that injected context visible after the checkpoint. Automatic compaction keeps whole-surface equality inside its active turn.

`deriveMessages()` then renders the summary as a user-role message followed by the retained nodes. The shadowed events remain in the raw log, so replay is deterministic.

<a id="pkg-taskweaver-dsh-compaction--blocking"></a>
#### Blocking

Compaction is serialized by one log-recorded lock shared by all entry points. Tail inspection independently finds the latest unmatched `compaction/start` and the newest `session/end-seed`. An unmatched start after that boundary is live and reports `busy`; an older unmatched start is stale evidence from a prior process lifecycle and does not block. The same end-seed transition clears the invariant companion's replay trace. A live bracket cannot cross a `turn/start` or `turn/end`; during adoption, repair boundaries in the inherited prefix remain replayable when the later end-seed proves their open bracket stale.

The lock is the durable bracket, not a `WeakSet`, wrapper mutex, or client-side anchor. `compaction/start` is appended synchronously before summarization yields. Every later failure makes exactly one `compaction/end { error }` attempt; if that close append itself fails, the unmatched start remains the intentional busy signal and no flush is attempted. A successfully closed manual attempt is flushed even when it reports `changed` or `summary`, preserving the recorded attempt before turn admission is released.

<a id="pkg-taskweaver-dsh-compaction--events"></a>
#### Events

The `compaction/*` events extend `SessionEventMap` (merge-extensible) via declaration merging — they are session events, not cordis `Events`, and all three are log-only (no `surfaceOp`). Per-event payloads and semantics are in the generated [persistence log event catalog]（原文链接目标：`../../../docs/persistence-catalog.md`）.

<a id="pkg-taskweaver-dsh-compaction--implementing-a-backend"></a>
#### Implementing a backend

Subclass `CompactionEngine`, implement `compactIfNeeded`, `compactNow`, and `compactRegion`, and load the subclass as a plugin — it registers as `ctx.compaction`. Every successful backend creates its replacement user message source with `compactCheckpointSource(compactionId, sourceCommandId?)`; the required `compactionId` correlates the checkpoint with its `compaction/*` transaction, while `isCompactCheckpointSource()` recognizes the marker after persistence or cloning without depending on backend identity. A template- or model-backed implementation can live as a sibling package without changing callers or the shared token meter.

<a id="pkg-taskweaver-dsh-compaction--recognizing-a-checkpoint-outside-the-host-program-checkpoint"></a>
#### Recognizing a checkpoint outside the host program (`./checkpoint`)

`compactCheckpointSource()`, `CompactionCheckpointSource`, and `isCompactCheckpointSource()` are declared on the `@taskweaver/dsh-compaction/checkpoint` subpath and re-exported from the root, so host-side consumers keep reading them from the root. The constructor requires the owning `CompactionId`, preventing backends from writing an uncorrelated marker that the package invariant must reject. The leaf imports no cordis and declares no module augmentation (the [`dsh-commands/brand`](../interaction/README.zh.md#pkg-taskweaver-dsh-commands) shape), which is what lets a client or wire program name the checkpoint source: the package **root** cannot enter such a program at all, because it reaches `dsh-session`'s root and that `Context` merge declares the host `sessions` service against the client's own (`TS2717` — one program per side, per [development.md]（原文链接目标：`../../../docs/development.md#typescript-project-layout`）). The web client's transcript adapter pins its plugin literal to the leaf's source type, so renaming the plugin id there is a compile error here.

<a id="pkg-taskweaver-dsh-compaction--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-compaction--conversation-history-when-a-backend-is-invoked"></a>
##### Conversation history, when a backend is invoked

<a id="pkg-taskweaver-dsh-compaction--what-the-model-sees"></a>
###### What the model sees

A successful implementation replaces an older surface range with one user-role summary checkpoint — a `user/message` carrying `surfaceOp: { op: 'replace', start, end }`; the raw events stay logged but stop appearing in derived model messages. The seam itself performs no rewrite.

<a id="pkg-taskweaver-dsh-compaction--token-effect"></a>
###### Token effect

Zero direct tokens from this Service Definition. A backend trades many retained history tokens for one summary and leaves the recent tail unchanged.

<a id="pkg-taskweaver-dsh-compaction--kv-cache-effect"></a>
###### KV Cache effect

A successful backend replacement invalidates reuse from the first shadowed history token; the seam itself does not alter a request.

<a id="pkg-taskweaver-dsh-compaction--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Human command, not a model tool** — `@taskweaver/dsh-command-compact` exposes argument-free `/compact` through `ctx.commands`; no model-facing compaction tool is registered.
- **Some single-unit overflow is out of contract** — balanced summary compaction cannot split one indivisible unit. The optional pruning companion can still repair a closed tool pair when text-bearing tool-result bulk is removable; a large non-tool node or a tool unit whose non-prunable remainder is oversized cannot be compacted.
- **An envelope that alone approaches the window is not surface-compaction work** — compaction shrinks derived history, never the system prompt, tools, or session prefix.

<a id="pkg-taskweaver-dsh-compaction-basic"></a>
### `@taskweaver/dsh-compaction-basic`

<!-- migrated-from: packages/runtime/compaction/compaction-basic/README.md -->
目录：`compaction/compaction-basic`。
package.json 描述：Token-meter-driven compaction policy and LLM summarization backend for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-compaction-basic--taskweaver-dsh-compaction-basic"></a>
The **basic compaction backend**: a `BasicCompactionEngine` implementing the `@taskweaver/dsh-compaction` Service Definition with reusable `ctx.tokenMeter` pressure, token-budget retention, and summarization as a direct one-shot `ctx.llm.stream()` call that replays the conversation prefix to reuse the provider's KV cache (interceptable at `llm/stream`).

This package owns the Service Provider role of the compaction capability — see the [Service Definition package](./README.zh.md#pkg-taskweaver-dsh-compaction) for its contract and the [capability-seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md`） for the design.

<a id="pkg-taskweaver-dsh-compaction-basic--what-it-owns"></a>
#### What it owns

This backend owns the compaction policy:

- **Measurement** — the singleton `ctx.tokenMeter` prices the latest canonical logged envelope and current surface at one consumed-log revision. Step-boundary pressure therefore includes the actual system prompt, tools, routing, assistant completion, tool results, buffered context, and steering.
- **Routed policy** — proactive pressure resolves capacity from the adapter that owns the latest durable provider/model route, then scales the default policy plus an optional exact-target override into concrete token budgets. Model discovery remains advisory and is not consulted.
- **Model-free pruning** — after pressure or canonical overflow qualifies, the optional [`ctx.toolResultPruner`](./README.zh.md#pkg-taskweaver-dsh-compaction-tool-result-pruner) service rewrites oversized tool results before range selection. Compact-basic remeasures through `ctx.tokenMeter`, skips summarization when pressure becomes safe, and otherwise summarizes the pruned surface. Below-pressure step checks never prune.
- **Retention** — compact the oldest whole surface units while preserving a recent tail and balanced tool-call/result cuts through the [`dsh-compaction` boundary helpers](./README.zh.md#pkg-taskweaver-dsh-compaction--tool-pairing-boundaries). Turn boundaries do not protect old steps inside a runaway turn. An open indivisible tail declines until it closes. The optional pruner can repair an oversized closed tool unit when its text-bearing result is the removable bulk; indivisible non-tool units and non-prunable tool remainders remain out of scope.
- **Convergence** — retry head-checkpoint compaction up to `compactionRetries`; reject a summary that does not shrink its source, and throw if retries cannot return below threshold.
- **Summarization** — a direct `llm/stream` call uses the configured provider/model pair and cap, falling back to the latest logged request target and then the agent target, without running the loop-only `agent/request` extension point. The call replays the conversation's own system prompt, tools, and shadowed-region messages verbatim, including image references, and appends the compaction instruction as the final user message, so it reuses the provider's warm prefix cache instead of invalidating it. The selected adapter must resolve or explicitly reject those images. It sets `GenerateOptions.purpose` to `compaction`, which adapters may forward as request attribution (the DeepSeek adapter sends `x-deepseek-harness-compact: 1`) without touching the model-visible body. Only returned text enters the checkpoint, excluding reasoning and tool calls that would leak private reasoning or create an orphaned call; image output fails with `UNSUPPORTED_CONTENT` rather than disappearing.
- **Framing** — the replacement user message marks established checkpoint context with `<compacted-summary>` tags. The raw summary remains on the `compaction/summary` event, and later automatic cycles merge the prior checkpoint.
- **Lifecycle** — all entry points share one bracket-first region transaction. It validates the range and live lock, appends `compaction/start` synchronously, prepares and awaits the summary, revalidates, appends `compaction/summary` plus the replacement, and makes exactly one closing attempt. Automatic and explicit-region calls require a numeric open-turn owner and whole-surface stability; the serial `agent/pre-step` listener checks pressure before request derivation, while canonical provider overflow enters through `agent/request-error` and authorizes retry only after durable surface progress. `compactNow()` reserves idle admission, uses `turn: null`, accepts append-only context outside its selected span, flushes every closed attempt, and releases admission in `finally`.
- **Overflow recovery** — provider-confirmed overflow needs no capacity metadata: it bypasses normal pressure and retention, prunes, then attempts one maximal balanced head reduction while leaving the newest indivisible unit. Retry is authorized whenever `surface.replaceGeneration` advances, including when pruning lands before later summary work throws. No replacement, an exhausted target-specific cap, cancellation, or an unknown/noncanonical error preserves the original provider failure.
- **Failure handling** — a live unmatched `compaction/start` is the durable lock. An unmatched marker before a newer `session/end-seed` is stale evidence from a prior lifecycle and does not block; one after that boundary reports `busy`. Summary and changed-span failures close with an error and leave the conversation surface untouched, though the attempt remains in the log. A failed close deliberately leaves a blocking orphan. Operational pressure failures warn and continue, while overflow-recovery failure preserves the original provider error only when no earlier replacement advanced the surface. Cancellation remains authoritative after cleanup and durability.

The protected `summarize()` method is the sole subclass hook. A template- or remote-summarizer subclass can override it while pressure, retention, cited source events, shrink validation, and shadowed-token accounting stay on `ctx.tokenMeter`. The hook returns the safe summary plus the complete provider output, call envelope, and usage when available (`{ summary, rawOutput?, llmStreamCall?, provider, model, maxTokens?, usage? }`); `llmStreamCall: true` means producing that result consumed exactly one call through this context's `ctx.llm.stream()` and requires complete `rawOutput`, while unmarked `rawOutput` does not identify the call path. The transaction preserves those fields on `compaction/summary`.

<a id="pkg-taskweaver-dsh-compaction-basic--config-basiccompactionconfig"></a>
#### Config (`BasicCompactionConfig`)

Every setting is optional. Top-level policy fields are defaults for every routed model; `modelPolicies` applies partial overrides to exact provider/model pairs. At pressure time, compaction-basic asks the owning LLM adapter for that route's context capacity and resolves absolute budgets. Unrecognized keys, duplicate targets, mutually exclusive retention forms, and a merged `retainRatio` that is not below `thresholdRatio` fail plugin load. An absolute `retainTokens` budget that is not below its scaled threshold fails on the first resolvable target because that comparison requires model capacity.

| Key | Required | Meaning |
|---|---|---|
| `thresholdRatio` | no (default `0.8`) | Compact at `floor(routedContextWindow × ratio)`. |
| `retainRatio` | no (default `0.16`) | Recent surface budget kept verbatim as a fraction of the routed context window; mutually exclusive with `retainTokens`. |
| `retainTokens` | no | Absolute recent surface budget kept verbatim; mutually exclusive with `retainRatio` and must be below the resolved threshold. |
| `summarizationProvider` | no (default `''`) | Set together with `summarizationModel`; an empty pair resolves the latest logged request target, then the `AgentOptions` pair. |
| `summarizationModel` | no (default `''`) | Set together with `summarizationProvider`; an empty pair resolves the latest logged request target, then the `AgentOptions` pair. |
| `maxTokens` | no (default `8192`) | Provider generation cap for the summarization call; may include reasoning tokens. |
| `compactionRetries` | no (default `1`) | Extra attempts after the first when pressure remains above threshold. |
| `maxOverflowRetries` | no (default `1`) | Maximum retries after canonical context-window overflow; `0` disables recovery only. |
| `modelPolicies` | no (default `[]`) | Exact `{ provider, model, ...partialPolicy }` overrides; matching uses both fields and does not depend on `listModels()`. |
| `auto` | no (default `true`) | Register step-boundary pressure and overflow-recovery listeners. Set `false` for manual-only. |

Every `modelPolicies` entry accepts the policy fields above except `auto` and `modelPolicies` itself. If an entry supplies either retention field, it replaces the default policy's retention choice; otherwise retention is inherited. Summarization provider/model remain a pair inside each entry.

An adapter may return no capacity for a valid dynamic route, and resolved capacity may expose an invalid absolute retention budget. Manual pressure checks then throw a target-specific configuration error; the automatic listener warns once for that exact target and continues with full history. Unrelated operational failures remain independently visible. Canonical provider overflow still attempts recovery because the provider has already established that compaction is necessary.

<a id="pkg-taskweaver-dsh-compaction-basic--usage"></a>
#### Usage

`BasicCompactionEngine` requires `ctx.llm`, `ctx.tokenMeter`, and `ctx.sessions`. The composition below receives `ctx.llm` from its host and installs the other two services:

```ts
import type { Context } from '@taskweaver/cordis'
import { BasicCompactionEngine } from '@taskweaver/dsh-compaction-basic'
import SessionStore from '@taskweaver/dsh-session'
import TokenMeter from '@taskweaver/dsh-token-meter'

export const name = 'compaction-basic'
export const inject = ['llm']

export function apply(ctx: Context): void {
  ctx.plugin(SessionStore)
  ctx.plugin(TokenMeter)
  ctx.plugin(BasicCompactionEngine)
}
```

Loading the plugin registers `ctx.compaction`. Add [`dsh-compaction-tool-result-pruner`](./README.zh.md#pkg-taskweaver-dsh-compaction-tool-result-pruner) as a sibling before this plugin to enable the optional model-free pass. With `auto: true` (the default) it compacts automatically under token pressure. The sibling [`dsh-command-compact`](./README.zh.md#pkg-taskweaver-dsh-command-compact) calls `ctx.compaction.compactNow(...)`; programmatic callers may also use any seam operation directly.

For example, the same compact plugin can safely serve models with different capacities and one target-specific policy:

```yaml
- name: '@taskweaver/dsh-compaction-basic'
  config:
    thresholdRatio: 0.8
    retainRatio: 0.16
    modelPolicies:
      - provider: local
        model: small-context
        thresholdRatio: 0.7
        retainTokens: 2048
```

<a id="pkg-taskweaver-dsh-compaction-basic--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-compaction-basic--conversation-history"></a>
##### Conversation history

<a id="pkg-taskweaver-dsh-compaction-basic--what-the-model-sees"></a>
###### What the model sees

After a successful step crosses the threshold, oversized tool results are first rewritten when the optional pruner is loaded. If summarization remains necessary, the next request receives the checkpoint preamble below, a blank line, `<compacted-summary>`, the data-dependent summary, and `</compacted-summary>`. Overflow recovery rebuilds the immediate retry from whatever replacement advanced the surface. A checkpoint replaces the selected older range and is followed by the retained recent units.

<a id="pkg-taskweaver-dsh-compaction-basic--conversation-checkpoint-preamble"></a>
###### Conversation checkpoint preamble

```markdown
This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.
```

<a id="pkg-taskweaver-dsh-compaction-basic--token-effect"></a>
###### Token effect

Model-free pruning can avoid the auxiliary call entirely; otherwise it reduces that call's transcript before the summary replaces an older range. The replacement reduces future input history rather than appending a second copy. A summary remains until a later compaction replaces it, while an indivisible non-tool unit can still exceed the budget.

<a id="pkg-taskweaver-dsh-compaction-basic--kv-cache-effect"></a>
###### KV Cache effect

Replacing rather than append-only. Each checkpoint invalidates reuse from the first replaced history token; the unchanged request prefix before that range remains reusable.

<a id="pkg-taskweaver-dsh-compaction-basic--auxiliary-summarizer-request"></a>
##### Auxiliary summarizer request

<a id="pkg-taskweaver-dsh-compaction-basic--what-the-model-sees-1"></a>
###### What the model sees

The summarization model receives the conversation replayed verbatim — the same system prompt, tool schemas, and messages the last routed request sent for the shadowed region — followed by one final user message: the compaction instruction below. The conversation model never sees this private request or its reasoning; only returned text is stored.

<a id="pkg-taskweaver-dsh-compaction-basic--compaction-instruction-final-user-message"></a>
###### Compaction instruction (final user message)

```markdown
You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.

Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section.

## Primary Request and Intent
- [the user's original and evolving goals; quote verbatim where the exact wording matters]

## Key Technical Concepts
- [technologies, frameworks, patterns, and conventions in play]

## Files and Code
- [exact path: why it matters, key changes or snippets]

## Errors and Fixes
- [error: how it was resolved, plus any related user feedback]

## Pending Jobs
- [explicitly requested work not yet completed]

## Current Work
- [precisely what was in progress at this checkpoint]

## Next Step
- [the single next action, directly in line with the most recent request, or "(none)"]

## Critical Context
- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]

Rules:
- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.
- Capture user feedback and explicit instructions faithfully, especially corrections.
- Do NOT mention this summarization request or that the context was compacted.
- Output only the checkpoint text: do not call any tool or take any other action.
- If the conversation already contains a <compacted-summary> block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.
```

<a id="pkg-taskweaver-dsh-compaction-basic--token-effect-1"></a>
###### Token effect

This is a separate model call: the replayed conversation prefix plus the fixed instruction as input, with `maxTokens`-capped output. Convergence retries can pay this cost more than once.

<a id="pkg-taskweaver-dsh-compaction-basic--kv-cache-effect-1"></a>
###### KV Cache effect

The replayed system prompt, tools, and shadowed-region messages match the conversation's last routed request byte-for-byte, so the provider's warm prefix cache is reused up to the trailing instruction; only that instruction, and the summary output, is uncached. Routing the summarizer to a different provider/model, or compacting a non-head range, forgoes this reuse.

<a id="pkg-taskweaver-dsh-compaction-basic--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Meter accuracy follows the fixed heuristic** — missing reusable provider usage falls back to character count plus structural overhead rather than exact tokenization.
- **Overflow classification is adapter-maintained** — provider wording can change; both DeepSeek adapters normalize currently recognized context-limit failures to `CONTEXT_WINDOW_EXCEEDED`.
- **Some indivisible-unit and envelope-only overflow remains outside surface compaction** — recovery cannot shrink system/tools/prefix, split an indivisible non-tool node, or repair a tool unit whose non-prunable remainder still exceeds the window. The optional pruner can shrink text-bearing tool-result bulk inside an otherwise indivisible pair.
- **`compactRegion` requires an open turn** — a manual call on a fully-closed session throws ("no open turn") rather than compacting.
- **Summarization failure preserves the latest durable surface** — before any replacement, the auto path logs a warning and proceeds with full over-budget history. If pruning already landed, a later summarization failure proceeds from that durable pruned surface. Summarization truncation at `maxTokens`, which hidden reasoning tokens can consume, follows the same rule.

<a id="pkg-taskweaver-dsh-compaction-tool-result-pruner"></a>
### `@taskweaver/dsh-compaction-tool-result-pruner`

<!-- migrated-from: packages/runtime/compaction/compaction-tool-result-pruner/README.md -->
目录：`compaction/compaction-tool-result-pruner`。
package.json 描述：Replay-safe model-free head/middle/tail pruning for tool-result surface nodes

<a id="pkg-taskweaver-dsh-compaction-tool-result-pruner--taskweaver-dsh-compaction-tool-result-pruner"></a>
The replay-safe model-free pruning service (`ctx.toolResultPruner`). It rewrites over-budget `tool/result` surface nodes to a bounded head, a fixed omission marker, and a bounded tail while retaining the full original event in the append-only session log.

This is a concrete companion to [`dsh-compaction-basic`](./README.zh.md#pkg-taskweaver-dsh-compaction-basic), not a compaction backend or model-facing tool. Compact-basic reads it through optional `ctx.get('toolResultPruner')`, so either package remains independently composable.

<a id="pkg-taskweaver-dsh-compaction-tool-result-pruner--service-api"></a>
#### Service API

`pruneSession(session)` scans one stable snapshot of the current surface. Every over-budget tool result is replaced by one newly appended `tool/result` carrying `{ surfaceOp: { op: 'replace', start: originalSeq, end: originalSeq }, sourceEventSeqs: [originalSeq] }`. The replacement spreads the complete original data and changes only `content`, preserving `turn`, `step`, `callId`, error fields, `meta`, and later data additions. The original event remains available for persistence, replay, and exact-log inspection.

The method throws synchronously when the session rejects a replacement. Replacements committed earlier in the pass remain durable.

`measureContent(blocks)` counts Unicode code points in `text` blocks. `pruneContent(blocks)` returns the bounded replacement or `null` when content is already within the threshold. Non-text blocks are retained at their original relative positions; text slicing never splits a UTF-16 surrogate pair, though it can split a multi-code-point grapheme cluster.

Every emitted result has exactly the configured head budget, fixed marker, and tail budget in text code points, is no larger than `thresholdChars`, and is strictly smaller than the triggering input. A second pass therefore emits no replacement.

<a id="pkg-taskweaver-dsh-compaction-tool-result-pruner--config"></a>
#### Config

Unrecognized keys fail at plugin construction. Resolved config is detached and deeply immutable.

| Key | Required | Meaning |
|---|---|---|
| `thresholdChars` | no (default `8192`) | Prune when combined text exceeds this many Unicode code points. |
| `headChars` | no (default `4096`) | Leading Unicode code points retained. |
| `tailChars` | no (default `1024`) | Trailing Unicode code points retained. |

All values are integers; the threshold is positive and head/tail are non-negative. `headChars + marker + tailChars` must fit within `thresholdChars`, so a valid configuration can prune every over-budget result without growth or repeated rewriting.

<a id="pkg-taskweaver-dsh-compaction-tool-result-pruner--usage"></a>
#### Usage

```ts
import type { Context } from '@taskweaver/cordis'
import ToolResultPruner from '@taskweaver/dsh-compaction-tool-result-pruner'

export function apply(ctx: Context): void {
  ctx.plugin(ToolResultPruner)
}
```

<a id="pkg-taskweaver-dsh-compaction-tool-result-pruner--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-compaction-tool-result-pruner--pruned-tool-result"></a>
##### Pruned tool result

<a id="pkg-taskweaver-dsh-compaction-tool-result-pruner--what-the-model-sees"></a>
###### What the model sees

Once a compaction trigger qualifies, future requests see the retained head, `\n\n[... tool result middle pruned ...]\n\n`, and retained tail in place of the removed text. Rich blocks keep their order. The model does not see a second copy of the original.

<a id="pkg-taskweaver-dsh-compaction-tool-result-pruner--token-effect"></a>
###### Token effect

Each rewritten tool result has at most `thresholdChars` text code points. Pruning itself makes no model call; compaction-basic skips summarization when the remeasured request falls below pressure, otherwise the summarizer reads the pruned surface.

<a id="pkg-taskweaver-dsh-compaction-tool-result-pruner--kv-cache-effect"></a>
###### KV Cache effect

Replacing an earlier result invalidates reuse from the first changed token. The pruned prefix is eligible for reuse while its route, envelope, and preceding history remain identical.

<a id="pkg-taskweaver-dsh-compaction-tool-result-pruner--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Character budgets are not token budgets** — provider token density varies, so `ctx.tokenMeter` remains the authority for deciding whether pruning relieved request pressure.
- **Pruning is syntactic** — it retains the beginning and end without interpreting which middle lines are semantically important.
- **Grapheme clusters can split** — code-point slicing protects surrogate pairs but does not perform locale-aware grapheme segmentation.

<a id="family-compaction"></a>
### 原族级说明（迁移保留）

<a id="family-compaction--compaction-compaction-capability-family"></a>
A compaction capability family (see [capability seams]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md`）): a Service Definition, a summarizing provider, a model-free tool-result pruning companion, and a human command Consumer. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`compaction/`](./README.zh.md#pkg-taskweaver-dsh-compaction) | Compaction seam and event vocabulary | `ctx.compaction` |
| [`compaction-basic/`](./README.zh.md#pkg-taskweaver-dsh-compaction-basic) | Token-pressure and summarization backend | registers `ctx.compaction` |
| [`compaction-tool-result-pruner/`](./README.zh.md#pkg-taskweaver-dsh-compaction-tool-result-pruner) | Optional model-free tool-result pruning | `ctx.toolResultPruner` |
| [`command-compact/`](./README.zh.md#pkg-taskweaver-dsh-command-compact) | Human compaction command | registers on `ctx.commands` |

The backend, optional pruner, and human command compose through the seam; token measurement remains a separate LLM-family service. The [compaction capability-seam Agent Note]（原文链接目标：`../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md`） owns the dependency rationale.

The subsystem reference — the `compaction/*` events, `CompactionResult`, the service, pruning outcomes — is [docs/subsystems/compaction.md]（原文链接目标：`../../docs/subsystems/compaction.md`）; the seam's deliberate `dsh-session`/`dsh-llm` dependency is recorded in the [compaction capability-seam Agent Note]（原文链接目标：`../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md`）.
