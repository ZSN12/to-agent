# guard 包族

<a id="family-guard"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

提供 Agent 循环行为提醒及工具调用时限策略。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-repeat-tool-reminder`](#pkg-taskweaver-dsh-repeat-tool-reminder) | `guard/repeat-tool-reminder` | [接口与限制](#pkg-taskweaver-dsh-repeat-tool-reminder) |
| [`@taskweaver/dsh-tool-call-timeout-policy`](#pkg-taskweaver-dsh-tool-call-timeout-policy) | `guard/timeout-policy` | [接口与限制](#pkg-taskweaver-dsh-tool-call-timeout-policy) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-repeat-tool-reminder"></a>
### `@taskweaver/dsh-repeat-tool-reminder`

<!-- migrated-from: packages/runtime/guard/repeat-tool-reminder/README.md -->
目录：`guard/repeat-tool-reminder`。
package.json 描述：Repeat-tool-call guard plugin: reminders plus a per-turn scope latch for repeated filesystem-search cycles

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--taskweaver-dsh-repeat-tool-reminder"></a>
Not a model-facing tool: it never appears in the tool list or rewrites a call. It watches each agent's tool stream, sends escalating reminders for consecutive identical calls and repeated reads of the same file, and detects a repeated `glob`/`grep` sequence of 2–8 calls using the normalized scope and canonical query/options. For TaskWeaver read-only subagents, it nudges after two and four searches without a source read, and gives a stronger progress reminder at six searches in an assigned scope. To prevent endless retries, it allows at most ten search attempts in one assigned scope, eight reads of one file, and three executions of an identical read; the next matching call is denied, with one model recovery response before another retry ends that agent turn. A read clears only the two/four-search nudge counter, not the repeated-search guard. Different paths and scopes remain available; distinct ranges of one file are allowed up to its per-turn read limit. Same-file read counts survive intervening searches and reads of other files; they reset on a new user turn. After an identical search sequence runs twice, it also denies the next matching search and latches that scope for the rest of the agent turn. A new user turn clears these latches. These are narrow loop/retry guards, not a task-wide limit on total calls, duration, or tokens. Decision record: [the repeat-tool-reminder Agent Note]（原文链接目标：`../../../.agents/notes/archived/feature/2026-07-08-repeat-tool-guard.md`）.

When the current user turn carries a TaskWeaver read-only subtask scope marker, the plugin also enforces workspace-relative paths before `read`/`read_image`/`glob`/`grep`/`find`/`ls` execute. Ordinary DSH sessions without the marker are unchanged; a malformed marker fails closed for filesystem reads/searches. An out-of-scope call is denied with guidance to use gathered evidence, continue within scope, or report the evidence gap. Bounded retries for repeated searches/reads apply only inside this TaskWeaver read-only scope; they do not cap the task as a whole.

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--config"></a>
#### Config

```yaml
- id: repeat-tool-reminder
  name: '@taskweaver/dsh-repeat-tool-reminder'
  config:
    thresholds: [3, 5, 8]        # default; repeated-call / same-file-read reminder counts
    include: []                  # tool-name patterns to track; empty ⇒ all tools
    exclude: [todo_write]        # tool-name patterns transparent to the chain
    argumentsPreviewChars: 500   # default; cap on arguments quoted in the detailed reminder
```

`thresholds` fails loud at plugin load: an empty list, a non-integer, a value below 2, or a duplicate throws, never a silent fall-back to defaults; `argumentsPreviewChars` equally rejects anything but an integer >= 1. The list is normalized to ascending order; the FIRST threshold delivers a short generic nudge, later thresholds deliver the detailed form naming the tool, the run length, and the canonical arguments. Past the highest threshold, reminders recur at the spacing between the last two thresholds (or at the sole threshold's spacing when only one is configured), so a long loop does not go silent after a few nudges. Arguments are head-truncated at `argumentsPreviewChars` with an omitted-count marker, so a looping `write`/`edit` payload cannot ride into the next request unbounded (the chain key always compares the FULL canonical string; the cap bounds the reminder, never the detection).

`include`/`exclude` entries support `*` wildcards and are predicates over whatever tools exist at call time, not references to registry entries — a pattern matching no currently registered tool is NOT an error (`exclude: [mcp_*]` stays valid in a deployment that loads no MCP tools), unlike `toolOrder`'s referent check.

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--chain-semantics"></a>
#### Chain semantics

The exact-call chain key is `(tool name, canonical arguments)` — canonicalization is a deep key-sort plus `JSON.stringify`, so argument objects differing only in property order count as identical. A call identical to the previous tracked call increments the agent's consecutive counter; a different tracked call resets it to 1. Separately, reads are counted by normalized file path for the current user turn, regardless of searches or reads of other paths between them; these counters are advisory only and do not block reading another needed range.

- **Untracked calls are transparent to the chain.** A call excluded by `include`/`exclude` neither increments nor resets the counter, so `grep X → todo_write → grep X` still counts as two consecutive `grep X` when `todo_write` is excluded. This is what makes exclusion useful: bookkeeping tools interleaved into a loop must not launder it.
- **Denied calls count.** Detection sits on `tools/post-execute`, which also runs for calls a `tools/pre-execute` listener denied — a model hammering a denied call is exactly the loop worth breaking.
- **Calls without an agent are ignored.** A direct `ctx.tools.execute()` caller has no model to remind and no live agent object to key on.
- **Per-agent keying.** The tool registry is context-level and subagents interleave through the same waterfall, so `WeakMap<Agent, …>` keys exact-call and per-file read counts by the live agent object; one agent's repetition never trips another's reminder. A user prompt (`agent/pre-step`) resets the submitting agent's counters, and object lifetime bounds the weak entries without a disposal listener.
- **Repeated search-cycle breaker.** The guard remembers only the recent suffix of tracked `glob`/`grep` calls as tool, normalized scope, and canonical query/options triples; different patterns at the same directory do not count as the same call. A non-search call resets that suffix. If the same 2–8 triple sequence repeats twice, the next matching call is denied before filesystem search runs, and that scope is latched for the remainder of the agent turn. The denial directs the one recovery response to use gathered evidence and answer rather than restart broad discovery; direct reads of already-known paths remain available. Retrying the blocked scope ends the turn at the next step boundary, before another LLM request. A new user turn clears the latch. This is a bounded recovery for a detected exact cycle, not a cumulative per-task call limit.
- **TaskWeaver read-only loop guard.** Within each literal assigned search scope, ten varied `glob`/`grep`/`find`/`ls` attempts are allowed; a progress reminder arrives at six. Reads do not reset this counter. The next search is denied, one model recovery response may switch to reading, another scope, or a final answer, and retrying that denied scope ends the turn before another LLM request. An identical `read`/`read_image` call can execute three times; the fourth is denied. Reads of one file are capped at eight per agent turn even when the model keeps varying line ranges; after the first denial, one recovery response may use a different authorized file or finish, while retrying the blocked file ends the turn before another LLM request. Other authorized files and scopes, and remaining task work stay available. These counters reset on a new user-authored turn; they are not task-wide call, duration, or token budgets.
- **TaskWeaver read-only path scope.** It activates only when the current user turn contains `<taskweaver-readonly-scope-v1>{"paths":[...]}</taskweaver-readonly-scope-v1>`. Each entry must be a literal workspace-relative path; absolute paths, the workspace root, wildcards, and `..` are rejected. Listed files/directories and descendant paths are accessible; other reads/searches are denied before execution. A `glob` call rooted at `.` is allowed only when its pattern is itself a literal path inside the assigned scope; wildcard/root-wide searches remain denied. A new user turn without a marker does not inherit the previous turn's scope. For marked TaskWeaver subagents, valid in-scope reads are additionally limited to eight attempts per file per agent turn, with one recovery response; ordinary Host sessions without the marker have no per-file read cap.
- **In-memory only.** A session resumed from persistence starts with a fresh chain — the guard is a heuristic nudge, not a logged invariant, later reminders are the accepted cost.

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--reminder-delivery"></a>
#### Reminder delivery

Reminders ride the post-execute decision's `additionalContexts` (source `{kind: 'plugin', plugin: 'repeat-tool-reminder'}`), never a `content` replacement: the `tool/result` event stays the tool's own output for audit. The loop buffers the context and appends it as an injected `user/message` after the step's tool results, which the session renders as a plain synthetic user message — so the reminder is model-visible, source-attributed, and reconstructable from the session log with no new session event. The reminder listener delegates via `next()` and prepends its context to the downstream decision's context array (both variants — a blocked call still gets the nudge); the separate search-cycle breaker denies before dispatch and explains why in the tool result.

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--first-threshold-context-message"></a>
##### First-threshold context message

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--what-the-model-sees"></a>
###### What the model sees

At the first configured consecutive-repeat threshold, that agent receives the reminder below. No tool schema or normal-call text is added.

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--first-threshold-reminder"></a>
###### First-threshold reminder

```markdown
You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again: if the task is not complete, try a different approach or different arguments instead of repeating the call.
```

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--token-effect"></a>
###### Token effect

Zero tokens before the threshold. The reminder is retained history for that agent.

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--kv-cache-effect"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--later-threshold-context-message"></a>
##### Later-threshold context message

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--what-the-model-sees-1"></a>
###### What the model sees

A later threshold receives the detailed reminder template below. A capped argument preview ends exactly `… (+<omitted> more chars)`.

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--later-threshold-reminder"></a>
###### Later-threshold reminder

```markdown
Repeated tool call detected:
- tool: <toolName>
- consecutive_calls: <count>
- arguments: <canonicalArguments>
The repeated calls are not making progress. Do not call this tool with these exact arguments again. Inspect the latest result and choose a different action, different arguments, or finish the task if enough evidence has been gathered.
```

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--token-effect-1"></a>
###### Token effect

Each reminder is retained history; `argumentsPreviewChars` bounds its data-dependent argument text, while agents keep independent counters.

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-repeat-tool-reminder--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Exact-cycle trigger** — cycle activation requires an exact canonical sequence, so changed queries or options may delay the initial latch; once triggered, all `glob`/`grep` calls at that scope are denied for the rest of the turn.
- **Compaction does not reset chains** — a chain spanning a compaction checkpoint keeps counting.
- **No cross-turn persistence** — repeat chains reset for a new user-authored task and are not persisted across process restart.
- **No subagent chain-sharing** — chains stay isolated per agent; a parent and its subagent repeating the same call never combine.
- **Legitimate idempotent polling still draws nudges** past the thresholds — the pressure valves are `thresholds`/`exclude` config.

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy"></a>
### `@taskweaver/dsh-tool-call-timeout-policy`

<!-- migrated-from: packages/runtime/guard/timeout-policy/README.md -->
目录：`guard/timeout-policy`。
package.json 描述：Tool-call timeout policy: a tools/execute wrapper that arms a per-tool deadline on exec.signal and returns TOOL_TIMEOUT when it wins

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy--dsh-tool-call-timeout-policy"></a>
Tool-call timeout enforcer: a single `tools/execute` around-dispatch listener that arms a per-call cooperative deadline on `exec.signal` for a tool declaring `timeoutMs` on its `ToolDefinition` and returns a structured `TOOL_TIMEOUT` result when that deadline wins. The budget is read from the tool's own declaration (`ToolDefinition.timeoutMs`, set by the owning tool plugin), so this plugin is **zero-config**. It is the reference `tools/execute` wrapper and the enforcement home for model-facing tool-call budgets ([timeout-library Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md`）).

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy--plugin-namespace-timeout-policy"></a>
#### Plugin (namespace: `timeout-policy`)

A function/namespace plugin (`name` / `inject` / `apply`), not a service. It registers no tool and takes no config — it consumes `ctx.tools`'s `tools/execute` waterfall (which the `dsh-tools` registry always provides) and reads each dispatched tool's declared `timeoutMs` from the registry (`ctx.tools.get(exec.name)`).

```yaml
- id: timeout-policy
  name: '@taskweaver/dsh-tool-call-timeout-policy'
```

The per-tool budget is declared by the tool plugin (e.g. `dsh-tool-web`'s `fetchTimeoutMs`/`searchTimeoutMs` config, attached as `ToolDefinition.timeoutMs`); this plugin only enforces it, so a mistyped tool name is not possible.

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy--behavior"></a>
##### Behavior

For a tool that **declares a `timeoutMs`** the listener:

1. Reads the budget from the tool's own declaration in the registry (`ctx.tools.get(exec.name)?.timeoutMs`) and arms `deadline(exec.signal, timeoutMs, 'TOOL_TIMEOUT')` — one signal fusing the caller's abort with this plugin's timer (`@taskweaver/dsh-timeout`).
2. Swaps that derived signal onto `exec` for the downstream dispatch, then restores the caller's own signal afterward (cordis `next()` ignores passed arguments, so the wrapper mutates the shared `exec` in place; restoring keeps `tools/post-execute` seeing the caller's signal).
3. After dispatch, if `timeoutOf(d.signal, 'TOOL_TIMEOUT')` matches — this plugin's own timer fired — replaces the result with a structured `TOOL_TIMEOUT` tool result: `{ isError: true, error: { message, info: { name: 'ToolTimeoutError', code: 'TOOL_TIMEOUT' } }, content: 'Error: tool call timed out after <ms>ms' }`.

A tool that **declares no budget** delegates untouched (no deadline).

The base `next()` of `tools/execute` is the registry's dispatch-with-normalization thunk, so when the timeout signal reaches a provider that throws its own upstream-abort error, dispatch first turns it into a normal error result, and this wrapper then replaces that with `TOOL_TIMEOUT`. That ordering is why the replacement is keyed off the signal (`timeoutOf`), not off the dispatched result's shape.

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy--cooperative-not-a-hard-kill"></a>
##### Cooperative, not a hard kill

The derived signal only **notifies**; termination stays with the tool and the capability it forwards `exec.signal` to (the `dsh-timeout` library owns no kill). **Declaring `timeoutMs` therefore means "cooperative with `exec.signal`"**: a tool that ignores the signal will not stop on timeout. Only signal-forwarding tools should declare it — the shipped `web_fetch`/`web_search` (which forward through `ctx.web` to providers) are the reference. `TOOL_TIMEOUT` needs no session event for reconstructability: it is the final model-facing `tool/result`, already logged by the loop.

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy--composing-with-other-tools-execute-wrappers"></a>
##### Composing with other `tools/execute` wrappers

Multiple `tools/execute` listeners compose by cordis registration order. Combined with a future retry/sandbox/metrics wrapper, registration order chooses the semantics — "timeout covers the whole retry operation" (timeout registered outer) versus "timeout covers each attempt" (timeout registered inner).

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy--conditional-tool-result"></a>
##### Conditional tool result

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy--what-the-model-sees"></a>
###### What the model sees

This plugin adds no prompt or schema. If a declared deadline wins, it replaces the provider's outcome with `Error: tool call timed out after <ms>ms` plus structured `TOOL_TIMEOUT`; otherwise the original result passes through unchanged.

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy--token-effect"></a>
###### Token effect

Zero tokens on non-timeout calls. A timeout adds one small retained error result and can prevent a larger late provider result from entering context.

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy--kv-cache-effect"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-call-timeout-policy--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Cooperative, never a hard kill** — the deadline only notifies via `exec.signal`; a tool that ignores the signal does not stop on timeout (see § Cooperative, not a hard kill).
- **No blanket budget** — only tools that declare `timeoutMs` on their `ToolDefinition` get a deadline; there is no registry-wide default for undeclared tools (the shipped `bash`/`read`/`write`/`edit` deliberately declare none).

<a id="family-guard"></a>
### 原族级说明（迁移保留）

<a id="family-guard--guard-loop-hygiene-guard-family"></a>
Behavioral guard plugins watch the agent loop for unproductive patterns and enforce per-call budgets. A guard is a self-contained consumer of core services and extension points, not a swappable capability.

| Package | Role | ctx key |
|---|---|---|
| [`repeat-tool-reminder/`](./README.zh.md#pkg-taskweaver-dsh-repeat-tool-reminder) | Advisory reminders for repeated tool calls | listens on tool and agent events |
| [`timeout-policy/`](./README.zh.md#pkg-taskweaver-dsh-tool-call-timeout-policy) | Arms per-call tool deadlines as deployment policy | registers a `tools/execute` listener |

Reminders travel as `additionalContexts` on the `tools/post-execute` decision and are appended as logged plugin-sourced `user/message` events ([tools]（原文链接目标：`../../docs/subsystems/tools.md`）); the timeout split across `dsh-timeout`, capability termination, and this policy layer is recorded in the [timeout-library Agent Note]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md`）.
