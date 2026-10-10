# todo 包族

<a id="family-todo"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

提供单 Agent 会话内的待办状态和 todo_write 工具。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-tool-todo`](#pkg-taskweaver-dsh-tool-todo) | `todo/tool-todo` | [接口与限制](#pkg-taskweaver-dsh-tool-todo) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-tool-todo"></a>
### `@taskweaver/dsh-tool-todo`

<!-- migrated-from: packages/runtime/todo/tool-todo/README.md -->
目录：`todo/tool-todo`。
package.json 描述：Model-facing todo_write tool over the DeepSeek Harness event-sourced session log

<a id="pkg-taskweaver-dsh-tool-todo--taskweaver-dsh-tool-todo"></a>
The model-facing `todo_write` tool: the agent's whole task list, replaced wholesale on each call.

<a id="pkg-taskweaver-dsh-tool-todo--what-it-does"></a>
#### What it does

Registers one tool, `todo_write(todos: [{ content, status }])`, on `ctx.tools`. The model sends the ENTIRE list every call — there are no partial updates or per-item edits. Each call appends a `todo/write` event (the full list snapshot) to the calling agent's session log via `agent.session.append('todo/write', { todos })`; the current list is the most recent such event (last-write-wins on replay).

`status` is one of `pending`, `in_progress`, or `completed`.

<a id="pkg-taskweaver-dsh-tool-todo--single-owner"></a>
#### Single owner

The list belongs to the ONE agent session that called the tool. There is no subagent/shared/swarm scope: a non-agent caller (no `exec.agent`) has nowhere to write the list and is rejected. This is a deliberate scope limit — see the Agent Note.

<a id="pkg-taskweaver-dsh-tool-todo--configuration"></a>
#### Configuration

`allowParallelInProgress` is required: every composition must choose whether several todos may be `in_progress` at once. It is a deployment choice, not a fixed rule: whether concurrent active tasks are legitimate depends on runtime concurrency the tool cannot observe. Use `true` for agents that may fan out work and `false` to enforce the single-active discipline.

The flag moves the model-facing instruction and the accepted input together — `true` asks the model to mark every actively worked task and accepts any number, `false` asks for exactly one and rejects a call marking more with `Error: invalid todos: at most one task may be in_progress (got <n>)`. The durable-log invariant does NOT follow it: a log written while parallel work was allowed must still replay after a deployment tightens the policy, so the invariant stays silent on the active count.

<a id="pkg-taskweaver-dsh-tool-todo--validation"></a>
#### Validation

Beyond the schema's type/required/enum checks, `execute` rejects an empty or duplicate `content`, and any item key beyond `content`/`status` — an extended item shape (ids, nesting) fails loud instead of silently flattening, keeping the logged snapshot equal to what the model believes it wrote. How many tasks may be `in_progress` at once is the deployment's call (§ Configuration): a composition that chooses `true` permits parallel work (concurrent subagents, background commands) to mark several tasks simultaneously. Ordering and the discipline of keeping the list current are left to the model via the tool description.

<a id="pkg-taskweaver-dsh-tool-todo--rendering"></a>
#### Rendering

The canonical result is `{ todos, counts: { pending, inProgress, completed } }`; its Native renderer returns the compact update acknowledgement. The tool also writes the full `todo/write` session event. UIs subscribe to the event stream and render that durable list themselves: the [web client]（原文链接目标：`../../client/ui-conversation`） shows a plan strip plus a dedicated tool row off the standing plan — latest `todo/write` with no later `turn/start` ([display]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-23-web-todo-display.md`）, [lifetime]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-28-todo-plan-clears-on-next-turn.md`）).

<a id="pkg-taskweaver-dsh-tool-todo--session-projection"></a>
#### Session projection

When the composition mounts `ctx.sessionProjections` ([`@taskweaver/dsh-session-projection`](../session/README.zh.md#pkg-taskweaver-dsh-session-projection)), this package registers the `todos` projection unit under an injected child: `init` = `null` (no write yet), `apply` = take the whole list from each `todo/write` and clear to `null` on each `turn/start` (standing plan; `turn/end` keeps the finished checklist; every other event returns the same state reference), `view` = identity, `stateVersion` = 2. The key merges into `SessionProjectionMap` here (via the Service Definition package's `/types` outlet); the framework drives the unit and carriers serve the value on the history tail page and the `session/projection` push frame. Compositions without the registry are unaffected. Lifetime rationale: [todo plan clears on next turn]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-28-todo-plan-clears-on-next-turn.md`）.

<a id="pkg-taskweaver-dsh-tool-todo--export-shape"></a>
#### Export shape

A function/namespace plugin: it exports `name` / `inject` / `apply` and NO default. A stray `export default` would collapse the module via the Loader's `unwrapExports` and drop `inject` (see [docs/postmortem/0001]（原文链接目标：`../../../docs/postmortem/0001-acp-default-export-drops-inject.md`）).

<a id="pkg-taskweaver-dsh-tool-todo--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-todo--tool-schema"></a>
##### Tool schema

<a id="pkg-taskweaver-dsh-tool-todo--what-the-model-sees"></a>
###### What the model sees

The model sees the generated [`todo_write` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-todo`）.

<a id="pkg-taskweaver-dsh-tool-todo--token-effect"></a>
###### Token effect

Fixed schema cost on every request where the tool is visible.

<a id="pkg-taskweaver-dsh-tool-todo--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the definition and visibility are unchanged. Plugin lifecycle or scoped restrictions may invalidate reuse from this schema.

<a id="pkg-taskweaver-dsh-tool-todo--tool-call-history-and-result"></a>
##### Tool-call history and result

<a id="pkg-taskweaver-dsh-tool-todo--what-the-model-sees-1"></a>
###### What the model sees

Each assistant tool call retains the entire replacement list in its arguments. Success returns exactly `Updated todo list: <pending> pending, <inProgress> in progress, <completed> completed.` Stable failures are ``Error: invalid todo: `content` must be a non-empty string``, `Error: invalid todos: duplicate content "<content>"`, `Error: todo_write requires an owning agent session`, and — only where the deployment set `allowParallelInProgress: false` — `Error: invalid todos: at most one task may be in_progress (got <n>)`. The full `todo/write` session event is UI and replay state, not a second model message.

<a id="pkg-taskweaver-dsh-tool-todo--token-effect-1"></a>
###### Token effect

Token growth scales with every full list the model submits, and those call arguments remain until compaction. The result itself is small and fixed-shape.

<a id="pkg-taskweaver-dsh-tool-todo--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-todo--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Single-owner scope only** — the list belongs to the one calling agent session; subagent/shared/swarm scopes are a deliberate cut (see § Single owner), and a non-agent caller is rejected.
- **The item shape is deliberately minimal** — `content` plus three-state `status`; whole-list replacement needs no stable id, priority, or active-form fields.
- **Whole-list replacement is the only operation** — no partial updates, no read-back tool; the model must resend the entire list each call.

<a id="family-todo"></a>
### 原族级说明（迁移保留）

<a id="family-todo--todo-todo-planning-capability-family"></a>
The model-facing todo capability. It is a single **product** package because one agent session owns the list; there is no replaceable provider contract.

| Package | Role | ctx key |
|---|---|---|
| [`tool-todo/`](./README.zh.md#pkg-taskweaver-dsh-tool-todo) | Stores and exposes the session's todo list. | (registers on `ctx.tools`) |

The child README owns the tool, persistence, and rendering contract.

The event payload is documented on [docs/subsystems/session.md]（原文链接目标：`../../docs/subsystems/session.md`）.
