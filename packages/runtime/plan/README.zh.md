# plan 包族

<a id="family-plan"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

管理每个 Agent 的计划协作状态和计划模式入口。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-plan-mode`](#pkg-taskweaver-dsh-plan-mode) | `plan/plan-mode` | [接口与限制](#pkg-taskweaver-dsh-plan-mode) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-plan-mode"></a>
### `@taskweaver/dsh-plan-mode`

<!-- migrated-from: packages/runtime/plan/plan-mode/README.md -->
目录：`plan/plan-mode`。
package.json 描述：Logged per-agent plan mode with deployment guidance, a direct slash command, and a user-reviewed exit

<a id="pkg-taskweaver-dsh-plan-mode--taskweaver-dsh-plan-mode"></a>
Logged, per-agent plan collaboration state with deployment-owned guidance, direct `/plan [message]` entry and `/plan off` exit commands, and the reviewed `exit_plan_mode` exit. Plan mode is soft guidance; sandbox mode and approval policy enforce restrictions independently and do not read or write plan state.

<a id="pkg-taskweaver-dsh-plan-mode--durable-state"></a>
#### Durable state

`plan/mode` (`{ active: boolean }`) is a log-only, whole-value-replace `SessionEventMap` member. `foldPlanMode(events)` returns the last logged value or `false`, so resume, fork, and compaction recover plan state directly from the session log. UIs observe committed flips through `session/event`.

`ctx.planMode.set(agent, active)` appends the standalone `plan/mode` event immediately when the agent is idle, because no in-turn pre-step runs before the next prompt. While the agent is running, it holds a pending selection for the next accepted in-turn pre-step. It returns which happened (`committed`/`queued`), a `cancelled` reversal, or a `noop`. `get(agent)` returns `{ active, pending? }`, separating the logged state used to assemble the current step from a user's mid-turn selection. Initial and continuation pre-steps both apply pending selections; a same-step request-recovery retry reuses its frozen assembly and leaves the selection pending for the next pre-step. A changed user selection contributes one plugin-sourced `user/message` notice when the last logged request header described the other state (both commit paths).

<a id="pkg-taskweaver-dsh-plan-mode--model-and-human-interactions"></a>
#### Model and human interactions

While active, `plan:policy` renders the configured `section`. The plugin always registers `exit_plan_mode`, keeping tool schemas stable across the transition; its execute path accepts only active plan mode and leaves it only after an exact user approval through `ctx.userQuestions`.

The review question declares the `plan-review` presentation intent, naming `Approve` as the label that approves it, so a capable UI presents the plan as a decision instead of a generic question; the answer the tool reads is the same either way. A dismissed review — the user closing the request to speak instead — is reported to the model as such, telling it to stay in plan mode and wait for the message; every other review failure keeps the seam's own message.

When `ctx.commands` is composed, the package registers `/plan [message]` and reserves the exact argument `off` for direct exit. Bare `/plan` selects plan mode; any other non-empty argument selects it first and is then submitted through `agent.steer()`, so it becomes the next step's ordinary logged user message under plan guidance. `/plan off` selects inactive without sending model input; it also cancels a pending entry before plan mode reaches a request. The command declares `input.images`: composer image attachments ride the steered message ahead of its text block. Bare `/plan` with images steers an image-only user message, while `/plan off` with images returns a direct error before any mode change so the composer keeps them.

The Web client consumes the plugin-owned `/plan` command; other entry points may drive the same service directly without defining a second mode vocabulary.

<a id="pkg-taskweaver-dsh-plan-mode--session-projection"></a>
#### Session projection

When the composition mounts `ctx.sessionProjections` ([`@taskweaver/dsh-session-projection`](../session/README.zh.md#pkg-taskweaver-dsh-session-projection)), this package registers the `plan` projection unit under an injected child. A `command/run` record named `plan` with recorded `args` starts a candidate target (`off` → inactive, anything else → active); its paired `command/done` retains a successful selection and drops an error; `plan/mode` commits the logged state and clears the retained selection. Every other event returns the same state reference. `view` derives `{ active, pending }`, where `pending` is true only while an unsettled or successful selection differs from the logged state. This remains a pure replay quantity, so host restarts, other tabs, and cold reads recover it from the log alone, and a rejected `/plan off` with images cannot leave a pending exit. The key merges into `SessionProjectionMap` from `src/types.ts` (served to host consumers via `./types` and client aggregates via `./client`); the framework drives the unit and carriers serve the value on the history tail page and the `session/projection` push frame. Compositions without the registry are unaffected.

<a id="pkg-taskweaver-dsh-plan-mode--configuration"></a>
#### Configuration

```yaml
- id: plan-mode
  name: '@taskweaver/dsh-plan-mode'
  config:
    section: |
      You are in plan mode. Explore and design before presenting the complete
      plan through exit_plan_mode.
```

`section` is required and non-empty. Unknown keys fail at load. The package does not accept arbitrary named modes, tool filters, sandbox settings, or approval policy.

Design: [plan-specific collaboration state]（原文链接目标：`../../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md`）.

<a id="pkg-taskweaver-dsh-plan-mode--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-plan-mode--plan-policy-system-prompt"></a>
##### Plan policy system prompt

<a id="pkg-taskweaver-dsh-plan-mode--what-the-model-sees"></a>
###### What the model sees

While plan mode is active, the model sees the deployment's exact `section` text at prompt order 50; inactive mode contributes no text.

<a id="pkg-taskweaver-dsh-plan-mode--configuration-example"></a>
###### Configuration example

```markdown
You are in plan mode. Explore and design before presenting the complete plan through exit_plan_mode.
```

<a id="pkg-taskweaver-dsh-plan-mode--token-effect"></a>
###### Token effect

Inactive mode adds no tokens; active mode adds the configured section to every request.

<a id="pkg-taskweaver-dsh-plan-mode--kv-cache-effect"></a>
###### KV Cache effect

The section is stable within plan mode, but entering or leaving changes the system prompt from order 50 onward.

<a id="pkg-taskweaver-dsh-plan-mode--human-command"></a>
##### Human command

<a id="pkg-taskweaver-dsh-plan-mode--what-the-model-sees-1"></a>
###### What the model sees

`/plan`, `/plan off`, and their terminal results stay outside model history. A non-empty suffix other than the exact `off` argument becomes one user message through `agent.steer()` after plan mode is selected: any admitted image attachments as leading image blocks, then the trimmed text block. Bare `/plan` with admitted images steers one user message containing only those image blocks. An active `/plan off` selection contributes the standard logged user-switch notice only when the last request header described plan mode; cancelling a pending entry contributes none because no request observed it.

<a id="pkg-taskweaver-dsh-plan-mode--token-effect-1"></a>
###### Token effect

The optional message costs the same history tokens as submitting that content separately. Bare `/plan` without images and `/plan off` add none; bare `/plan` with images has the normal image-prompt cost. A narrated active exit adds the small retained switch notice.

<a id="pkg-taskweaver-dsh-plan-mode--kv-cache-effect-1"></a>
###### KV Cache effect

The user block is append-only conversation growth. Entering or leaving plan mode changes the earlier policy section; a narrated exit notice is appended after the reusable request prefix.

<a id="pkg-taskweaver-dsh-plan-mode--exit-tool-schema-and-review-exchange"></a>
##### Exit tool schema and review exchange

<a id="pkg-taskweaver-dsh-plan-mode--what-the-model-sees-2"></a>
###### What the model sees

The [`exit_plan_mode` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-plan-mode`） remains available in both states; execution outside plan mode fails, while an approved in-mode review returns the canonical `{ approved: true }` value and renders the existing confirmation text. Rejection remains a failed call carrying review feedback, and a dismissed review a failed call naming the user's takeover.

<a id="pkg-taskweaver-dsh-plan-mode--token-effect-2"></a>
###### Token effect

The stable schema is paid according to ToolRuntime mode, and each plan argument and review result remains in conversation history.

<a id="pkg-taskweaver-dsh-plan-mode--kv-cache-effect-2"></a>
###### KV Cache effect

Mode transitions do not change the tool catalog; plan arguments and review results extend the conversation normally.

<a id="pkg-taskweaver-dsh-plan-mode--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- Plan mode guides rather than enforces; deployments that need enforced restrictions must configure sandbox and approval controls independently.
- A selection made after the turn's final accepted pre-step is lost if the process exits before another accepted in-turn pre-step, so the UI must reapply it.
- Forked agents inherit logged plan state, while newly spawned agents begin inactive; there is no creation-time plan option.
- A live child owned by another agent cannot open the `exit_plan_mode` review. The failed call tells the child to include the unresolved decision in its final result; durable fork lineage alone does not prevent a session resumed as a runtime root from opening the review.
- Only the Web UI has a specialized `plan-review` renderer; another interaction provider may present the same request through its generic option flow.

<a id="family-plan"></a>
### 原族级说明（迁移保留）

<a id="family-plan--plan-plan-collaboration-state"></a>
Plan mode is logged, per-agent collaboration state rather than a generic mode registry or capability seam.

| Package | Role | ctx key |
|---|---|---|
| [`plan-mode/`](./README.zh.md#pkg-taskweaver-dsh-plan-mode) | Owns plan-mode state, guidance, commands, and review flow | `ctx.planMode` |

The [plan-specific collaboration state]（原文链接目标：`../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md`） decision records the family design.

The subsystem reference — the `plan/mode` fold, the step-boundary flush, configuration, the exit tool — is [docs/subsystems/plan.md]（原文链接目标：`../../docs/subsystems/plan.md`）; design in [plan-specific collaboration state]（原文链接目标：`../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md`）.
