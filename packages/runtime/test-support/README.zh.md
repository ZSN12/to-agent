# test-support 包族

<a id="family-test-support"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

提供运行时测试工具、模拟 LLM 服务和会话回放基础设施。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-agent-loop-testkit`](#pkg-taskweaver-dsh-agent-loop-testkit) | `test-support/agent-loop-testkit` | [接口与限制](#pkg-taskweaver-dsh-agent-loop-testkit) |
| [`@taskweaver/dsh-llm-mock-server`](#pkg-taskweaver-dsh-llm-mock-server) | `test-support/llm-mock-server` | [接口与限制](#pkg-taskweaver-dsh-llm-mock-server) |
| [`@taskweaver/dsh-llm-replay`](#pkg-taskweaver-dsh-llm-replay) | `test-support/llm-replay` | [接口与限制](#pkg-taskweaver-dsh-llm-replay) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-agent-loop-testkit"></a>
### `@taskweaver/dsh-agent-loop-testkit`

<!-- migrated-from: packages/runtime/test-support/agent-loop-testkit/README.md -->
目录：`test-support/agent-loop-testkit`。
package.json 描述：Shared prerequisite mounting for tests that exercise the concrete agent loop

<a id="pkg-taskweaver-dsh-agent-loop-testkit--taskweaver-dsh-agent-loop-testkit"></a>
Shared prerequisite mounting for tests that exercise the concrete `AgentLoop`. `mountAgentLoopTestDependencies(ctx, options?)` installs the LLM, session, system-prompt, tool, and agent services in dependency order, then returns before the loop is mounted.

The caller registers adapters and optional plugins, mounts `AgentLoop` with the configuration under test, and disposes its own Context. System-prompt and tool-registry configuration can be forwarded through `options`; the helper does not provide test defaults beyond those owned by the services. A plugin-load failure rejects the helper call, while services activated earlier in the sequence remain owned by the caller's Context.

```ts
import { Context } from '@taskweaver/cordis'
import AgentLoop from '@taskweaver/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@taskweaver/dsh-agent-loop-testkit'

const ctx = new Context()

await mountAgentLoopTestDependencies(ctx)
// Register the test adapter and any optional plugins here.
await ctx.plugin(AgentLoop, { agents: [] })
```

Tests of injection failures, partial topology, service load order, or service teardown mount their dependencies directly instead of using this helper.

<a id="pkg-taskweaver-dsh-agent-loop-testkit--model-experience"></a>
#### Model Experience

None, as this test-only composition helper neither drives nor modifies model requests.

<a id="pkg-taskweaver-dsh-agent-loop-testkit--kv-cache-effect"></a>
###### KV Cache effect

None; this package neither assembles nor sends a provider request.

<a id="pkg-taskweaver-dsh-agent-loop-testkit--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Only the mandatory prerequisite spine is shared** — adapters, optional plugins, `AgentLoop`, agents, and Context teardown remain caller-owned so scenario-specific ordering stays visible.

<a id="pkg-taskweaver-dsh-llm-mock-server"></a>
### `@taskweaver/dsh-llm-mock-server`

<!-- migrated-from: packages/runtime/test-support/llm-mock-server/README.md -->
目录：`test-support/llm-mock-server`。
package.json 描述：Scriptable OpenAI-compatible HTTP/SSE fault server for LLM recovery tests

<a id="pkg-taskweaver-dsh-llm-mock-server--taskweaver-dsh-llm-mock-server"></a>
A scriptable OpenAI-compatible HTTP/SSE server for exercising real LLM adapters, the agent loop, and recovery policy without a provider key. It accepts `POST /chat/completions` and `POST /v1/chat/completions`; each accepted request consumes one configured behavior in arrival order. Invalid methods, paths, bearer tokens, and JSON do not consume the script.

The library entry exports `startMockLlmServer(options)`, behavior and telemetry types, the default random stress weights, the accepted Node timer bound, and a running handle with the bound `baseURL`, generated or configured `randomSeed`, captured requests, and idempotent `close()`. Closing force-terminates stalled connections.

<a id="pkg-taskweaver-dsh-llm-mock-server--standalone-use"></a>
#### Standalone use

Run the source entry from this repository:

```sh
pnpm run mock:llm -- \
  --port 8000 \
  --api-key mock-key \
  --sequence partial_disconnect,success \
  --partial-text "discard this half"
```

Point the shipping DeepSeek adapter at the server; it appends `/chat/completions` to the configured base:

```sh
DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1 \
DEEPSEEK_API_KEY=mock-key \
pnpm dsh --profile headless "test provider recovery"
```

The repository script writes JSONL to stdout: a `ready` record carries the `/v1` base URL and random seed, followed by request/result records that name both the scripted behavior and the concrete selected behavior. The private support package exposes no installable binary.

<a id="pkg-taskweaver-dsh-llm-mock-server--behavior-script"></a>
#### Behavior script

`--sequence` is a comma-separated FIFO. Exhaustion returns a structured HTTP 500; `--repeat-last` explicitly reuses the last entry.

| Behavior | Wire result |
|---|---|
| `connection_reset` | Destroy the socket before HTTP headers |
| `stream_disconnect` | Send SSE headers, then reset before the first event |
| `partial_disconnect` | Send text deltas, then reset the socket |
| `stall` | Send SSE headers and remain idle until client/server cancellation |
| `empty` | Send a valid content-less stop and `[DONE]` |
| `empty_body` / `stream_eof` / `partial_eof` | End cleanly without the required `[DONE]` boundary |
| `malformed_json` / `malformed_event` | Send invalid SSE JSON or an invalid provider chunk shape |
| `rate_limit` / `server_error` / `service_unavailable` | Return retry-oriented 429/500/503 JSON errors |
| `auth_error` / `invalid_request` / `context_overflow` / `quota_exceeded` | Return terminal or separately recovered provider errors |
| `success` / `slow_success` / `reasoning_success` | Stream a complete text response, optionally delayed or preceded by reasoning |
| `tool_call_success` / `max_tokens` | Complete with a tool call or `length` finish |
| `wrong_content_type` | Send a valid SSE body under `application/json` |
| `random` | Select a concrete request behavior from weighted seeded randomness |

`connection_refused` is CLI-only and must be the first entry. It delays binding a caller-specified nonzero port, so requests during `--listen-delay-ms` receive a real TCP refusal; the remaining entries begin after the listener starts.

<a id="pkg-taskweaver-dsh-llm-mock-server--random-mode"></a>
#### Random mode

Use a repeating `random` entry for an open-ended mixed run:

```sh
pnpm run mock:llm -- \
  --port 8000 \
  --sequence random \
  --repeat-last \
  --seed 42 \
  --random-weights 'success=60,slow_success=10,connection_reset=5,stream_disconnect=5,partial_disconnect=10,empty=5,server_error=5'
```

Omitting `--seed` generates one and prints it in the `ready` record. `--random-weights` accepts non-negative relative `behavior=weight` entries and requires at least one positive concrete behavior. The exported default is a success-heavy stress profile containing reset, disconnect, partial output, empty completion, stall, 429/5xx, clean truncation, and malformed JSON; it is test pressure, not an estimate of production incident frequency. `connection_refused` is excluded because a bound request handler cannot produce a true refusal.

When random weights include `stall`, configure the client under test with a short stream-idle timeout so the scenario terminates promptly.

<a id="pkg-taskweaver-dsh-llm-mock-server--timing-and-content-controls"></a>
#### Timing and content controls

The CLI exposes `--success-text`, `--partial-text`, `--reasoning-text`, `--chunk-size`, `--chunk-delay-ms`, `--disconnect-delay-ms`, `--retry-after-ms`, `--request-id`, `--tool-name`, and `--tool-arguments`. Millisecond delays are bounded integers within Node's timer range; `retryAfterMs` must also be positive. The library accepts the same camel-case options. An optional exact `apiKey` validates `Authorization: Bearer <token>`; omission accepts any token.

<a id="pkg-taskweaver-dsh-llm-mock-server--model-experience"></a>
#### Model Experience

None, as this test server substitutes provider wire behavior without invoking a real model.

<a id="pkg-taskweaver-dsh-llm-mock-server--kv-cache-effect"></a>
###### KV Cache effect

None; requests terminate locally and never reach a provider cache.

<a id="pkg-taskweaver-dsh-llm-mock-server--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Random weights model test pressure, not production incidence** — callers that want an environment-specific distribution must provide measured weights and record the emitted seed.
- **Request scripts are arrival-ordered** — concurrent callers share one cursor, so deterministic per-session fault assignment requires separate server instances.
- **True connection refusal is a listener lifecycle phase** — the CLI delay must overlap the client attempt; request-level random selection can only reset an accepted connection.

<a id="pkg-taskweaver-dsh-llm-replay"></a>
### `@taskweaver/dsh-llm-replay`

<!-- migrated-from: packages/runtime/test-support/llm-replay/README.md -->
目录：`test-support/llm-replay`。
package.json 描述：Replay LLM plugin: short-circuits llm/stream with model chunks reconstructed from a recorded session JSONL (keyless snapshot tests)

<a id="pkg-taskweaver-dsh-llm-replay--taskweaver-dsh-llm-replay"></a>
A replay LLM plugin for keyless snapshot tests. It yields model streams reconstructed from a recorded **session JSONL** fixture, so a test can boot the real agent against a fixed model transcript with no API key. With `providers` configured it registers a replay-only adapter whose catalog is available to scenarios that exercise model discovery; without `providers` it installs the catch-all `llm/stream` waterfall used by tests that do not need discovery.

Its consumers are the ACP and headless `stream-json` snapshot suites plus the Web browser e2e lane. Loader-driven suites mount this plugin in place of a real LLM adapter; the Web lane installs it directly to retain the teardown consumption handle.

<a id="pkg-taskweaver-dsh-llm-replay--how-the-fixture-works"></a>
#### How the fixture works

The fixture is a projection of a persisted session log (`<scenario>/session.jsonl`): it keeps the header and every event payload, but omits body `seq`/`time` envelopes (`seq0`/`time0` for packed rows). Replay restores contiguous synthetic envelopes while parsing; one file must contain either projected body rows or complete persisted body rows, never both. Runtime persistence still writes the complete log. The fixture's `assistant/chunk` events carry every `StreamChunk`, so grouping them by `(turn, step)` reconstructs each agent-loop `stream()` call's chunk sequence. A successful compaction summarizer is logged differently: when `compaction/summary` carries `llmStreamCall: true` and its complete `rawOutput`, replay reconstructs a canonical successful stream at that event's position using one `block-start`/`block-end` pair per block, the recorded usage when present, and a terminal `stop`. Exact provider delta partitioning is not part of the durable compaction result. `rawOutput` without the marker does not imply a local LLM call because template and remote summarizers may retain complete output without using this context's adapter.

Recording is therefore "run the real agent once and harvest the `.jsonl`", done by the snapshot harness — this plugin does not record. A fixture may carry its `request/header` content tokenized to `{{system}}`/`{{tools}}` (the harness pins that content in one scenario and scrubs the rest); replay is indifferent — derivation reads only `assistant/chunk` and `compaction/summary` events plus the line-0 session header.

Two failure modes are not reconstructable from `assistant/chunk` alone — a pure throw before any chunk (e.g. an HTTP 401, where the log holds only a `turn/end {error}` and no chunks) and a cancel/hang (timing, not chunk content). A scenario that needs those supplies an optional sidecar (`<scenario>/replay.override.json`) that either replaces the derived script (a bare `ReplayEntry[]`) or augments it (`{ patches: [{ at, entry }] }`: keep every JSONL-derived call and swap the named 0-based call indexes; `at` equal to the derived length appends the retry attempt after an injected transient throw). Patch indexes must be unique. The override document, each patch and entry, and every chunk discriminant are validated when the file loads. A `hang` entry may name `readyFile`; replay writes that empty marker after its prefix chunks reach the loop and before it waits for cancellation, so an external driver can cancel deterministically without observing a presentation update.

A scripted string may embed `{{fromRequest:<regex>}}` to fill a value no static sidecar can know — for example a randomly minted goal id the model must echo back into `update_goal`. At stream time every placeholder resolves against the live request: the corpus is every string leaf of the request messages joined by newlines, the pattern's LAST corpus match wins, and its first capture group (or the whole match without one) substitutes in place. A pattern that matches nothing, an invalid pattern, and an unterminated placeholder each fail loud. The last two braces of a consecutive `}` run terminate the placeholder, so a pattern may end with a brace quantifier (`[0-9a-f]{4}`) but cannot contain `}}` followed by further pattern content. Resolution applies to every scripted entry, including ones derived from the recorded JSONL — a recorded fixture whose text legitimately contains the literal marker must be expressed through a sidecar without it.

<a id="pkg-taskweaver-dsh-llm-replay--nested-agents-per-session-keying"></a>
#### Nested agents: per-session keying

A scenario where a parent agent delegates to in-process subagents records more than one log: the parent (`session.jsonl`) plus one per child (`session.1.jsonl`, …). Each agent runs as its own `Session` on the same context, so replay must serve each one its own script.

Replay keys every call by its calling session id (`GenerateOptions.sessionId`, stamped by the agent loop). Live session ids are freshly random each run and never equal the recorded ones, so a live session binds to a recorded script by **first-call order**: scripts are ordered by header `createdAt` (parent first — it streams before it can delegate), and the first live session to make any call claims the first script, the next new session the next, and so on. Each session then advances its own cursor. A call with no `sessionId` is one anonymous session bound to the primary script. More distinct live sessions than recorded scripts fails loud.

<a id="pkg-taskweaver-dsh-llm-replay--config"></a>
#### Config

| Key | Type | Default | Notes |
|---|---|---|---|
| `file` | string | `$TASKWEAVER_SNAPSHOT_FILE` | Path to the primary (parent) `session.jsonl` fixture. Required (config or env). |
| `overrideFile` | string | `$TASKWEAVER_SNAPSHOT_OVERRIDE` | Optional `ReplayOverrideDoc` sidecar for the primary session: a bare `ReplayEntry[]` replaces its derived script, while `{ patches }` augments it by call index. |
| `childFiles` | string[] | `$TASKWEAVER_SNAPSHOT_CHILD_FILES` (path-delimited) | Recorded subagent child-session logs for a nested scenario; empty for a single-session scenario. |
| `providers` | `ReplayProviderConfig[]` | — | Optional replay-only provider and model catalog. Each provider may set `retryPolicy`, and each model may publish `contextWindow` and an `inputModalities` array containing only `text` and `image`; invalid modalities fail during plugin loading. Configured routes dispatch through the replay adapter and never perform provider I/O. |
| `paceMs` | number | — (burst) | Optional per-chunk delay in ms so downstream transports (e.g. the web SSE mux observed by a real browser) see genuinely incremental delivery. A realism knob only — tests must not depend on it for correctness. Non-negative integer; abort during a pace wait cancels the stream promptly. |

```yaml
- id: llm-replay
  name: '@taskweaver/dsh-llm-replay'
  config:
    providers:
      - id: deepseek-official
        name: DeepSeek
        retryPolicy:
          mode: normal
          backoff:
            initialDelayMs: 1
            maxDelayMs: 1
            jitterRatio: 0
        models:
          - id: deepseek-v4-flash
            contextWindow: 128000
          - id: deepseek-v4-pro
  # file/overrideFile/childFiles default to $TASKWEAVER_SNAPSHOT_FILE /
  # $TASKWEAVER_SNAPSHOT_OVERRIDE / $TASKWEAVER_SNAPSHOT_CHILD_FILES, set by the snapshot
  # harness per scenario.
```

<a id="pkg-taskweaver-dsh-llm-replay--exports"></a>
#### Exports

- `installLlmReplay(ctx, config)` — install the configured replay adapter or catch-all `llm/stream` listener; returns a `ReplayHandle` (`dispose()` for HMR safety plus `assertConsumed()`, the teardown check that every recorded script bound to a live session and every bound cursor drained — turning a scenario that silently drove fewer model calls than recorded into a crisp diagnostic). Use this in tests to drive replay without the Loader or env vars.
- `loadSessionScripts(config)` — resolve the ordered `SessionScript[]` (primary + children) for a scenario, ready to bind to live sessions in first-call order.
- `loadReplayScript(config)` — resolve the `ReplayEntry[]` for the primary session only (validated sidecar replacement/patches if present, else derived from the JSONL; fail-loud if the fixture is missing).
- `deriveReplayScript(events)` / `parseSessionLog(text)` / `parseSessionHeader(text)` / `resolveScriptedEntry(entry, messages)` — the pure helpers that turn ordinary loop chunks and explicitly marked local compaction outputs in a persisted or projected session log into a script, read its header `id`/`createdAt`, and resolve `{{fromRequest:...}}` placeholders against one live request. A derived assistant group must end in a `finish` chunk; a group without one is the fingerprint of a thrown `stream()` and must instead be expressed via an override sidecar.
- Types `ReplayEntry` / `ReplayOverrideDoc` / `ReplayOverridePatch` / `SessionScript` / `ReplayConfig` / `ReplayProviderConfig` / `ReplayModelConfig` / `ReplayHandle` / `Config`.

<a id="pkg-taskweaver-dsh-llm-replay--plugin-export-shape"></a>
#### Plugin export shape

Named `name` / `inject` / `Config` / `apply`, with **no default export**: the cordis Loader's `unwrapExports` does `exports.default ?? exports`, so a stray default would collapse the module to the bare function and drop the `inject` namespace (see [docs/postmortem/0001]（原文链接目标：`../../../docs/postmortem/0001-acp-default-export-drops-inject.md`）).

<a id="pkg-taskweaver-dsh-llm-replay--model-experience"></a>
#### Model Experience

None, as this keyless test adapter sends no request to a provider model; it only replays recorded assistant chunks into the test loop.

<a id="pkg-taskweaver-dsh-llm-replay--kv-cache-effect"></a>
###### KV Cache effect

None; this package neither assembles nor sends a provider request.

<a id="pkg-taskweaver-dsh-llm-replay--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **First-call-order script binding assumes sequential delegation** — a cut that runs sibling subagents concurrently would bind live sessions to recorded scripts non-deterministically; a stronger keying is deferred until such a scenario exists (`XXX(concurrent-subagents)`).
- **Only ordinary loop chunks and marked local compaction outputs are derivable** — a pure pre-chunk throw, a cancel/hang, or an unmarked external summarizer call needs the `replay.override.json` sidecar. Replacement and patch forms affect only the primary session; child scripts still derive from their logs.

<a id="family-test-support"></a>
### 原族级说明（迁移保留）

<a id="family-test-support--test-support-development-and-test-infrastructure"></a>
These packages support repository development, tests, and examples rather than product APIs. Their compatibility follows the development need they serve.

| Package | Role |
|---|---|
| [`acp-snapshot/`]（原文链接目标：`acp-snapshot/README.md`） | Provides the ACP snapshot-test toolkit |
| [`agent-loop-testkit/`](./README.zh.md#pkg-taskweaver-dsh-agent-loop-testkit) | Mounts shared prerequisites for AgentLoop tests |
| [`invariants/`](../runtime-diagnostics/README.zh.md#pkg-taskweaver-dsh-invariants) | Runs development-time runtime-contract assertions |
| [`llm-mock-server/`](./README.zh.md#pkg-taskweaver-dsh-llm-mock-server) | Provides a deterministic OpenAI-compatible fault server |
| [`llm-replay/`](./README.zh.md#pkg-taskweaver-dsh-llm-replay) | Replays recorded model responses for keyless tests and demos |

A package moves out of `test-support/` when it gains a product contract and product consumers.

The invariants contract is documented in [docs/subsystems/invariants.md]（原文链接目标：`../../docs/subsystems/invariants.md`）.
