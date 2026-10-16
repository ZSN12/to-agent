# interaction 包族

<a id="family-interaction"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

承载用户提问、审批、权限预设和协作命令等人机交互能力。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-commands`](#pkg-taskweaver-dsh-commands) | `interaction/commands` | [接口与限制](#pkg-taskweaver-dsh-commands) |
| [`@taskweaver/dsh-orchestration`](#pkg-taskweaver-dsh-orchestration) | `interaction/orchestration` | [接口与限制](#pkg-taskweaver-dsh-orchestration) |
| [`@taskweaver/dsh-permission-presets`](#pkg-taskweaver-dsh-permission-presets) | `interaction/permission-presets` | [接口与限制](#pkg-taskweaver-dsh-permission-presets) |
| [`@taskweaver/dsh-tool-ask-user`](#pkg-taskweaver-dsh-tool-ask-user) | `interaction/tool-ask-user` | [接口与限制](#pkg-taskweaver-dsh-tool-ask-user) |
| [`@taskweaver/dsh-tool-orchestrate`](#pkg-taskweaver-dsh-tool-orchestrate) | `interaction/tool-orchestrate` | [接口与限制](#pkg-taskweaver-dsh-tool-orchestrate) |
| [`@taskweaver/tool-ui-verify`](#pkg-taskweaver-tool-ui-verify) | `interaction/tool-ui-verify` | [接口与限制](#pkg-taskweaver-tool-ui-verify) |
| [`@taskweaver/ui-verify`](#pkg-taskweaver-ui-verify) | `interaction/ui-verify` | [接口与限制](#pkg-taskweaver-ui-verify) |
| [`@taskweaver/dsh-user-approval`](#pkg-taskweaver-dsh-user-approval) | `interaction/user-approval` | [接口与限制](#pkg-taskweaver-dsh-user-approval) |
| [`@taskweaver/dsh-user-questions`](#pkg-taskweaver-dsh-user-questions) | `interaction/user-questions` | [接口与限制](#pkg-taskweaver-dsh-user-questions) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-commands"></a>
### `@taskweaver/dsh-commands`

<!-- migrated-from: packages/runtime/interaction/commands/README.md -->
目录：`interaction/commands`。
package.json 描述：Plugin-owned human command registry for DeepSeek Harness UIs

<a id="pkg-taskweaver-dsh-commands--taskweaver-dsh-commands"></a>
Plugin-owned human-command registry consumed by interactive UI adapters. The [plugin command registration Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-19-plugin-command-registration.md`） owns the boundary and dispatch contract.

<a id="pkg-taskweaver-dsh-commands--service-contract"></a>
#### Service contract

`ctx.commands.register(definition)` registers one lowercase command name, description, optional unstructured-input descriptor (`hint` plus an `images` flag declaring whether composer image attachments may accompany an invocation), optional `recordInput` policy, and abortable handler. `recordInput` defaults to true; a command whose authoritative domain event owns the payload sets it to false so `command/run` omits `args` instead of duplicating the input. A registered command is available to every composed command adapter; a plugin that is incompatible with a deployment does not register there. A plain-context registration is global. A command-producing plugin mounted beneath `agent.ctx` declares its own `commands` injection and creates an exact agent-scoped definition; it shadows a global definition with the same name. This child-injection shape preserves the agent scope without making the core agent loop depend on a UI service. Duplicate names within one layer fail during registration. Every disposer is the exact Cordis effect disposer, and registration or removal notifies every `commands/change` observer so live adapters can refresh discovery; observer failures are logged and cannot veto the registry mutation or starve later observers.

`list(agent)` returns immutable, name-sorted descriptors after scoped shadowing (the descriptor carries `input.images` so composers can refuse image submissions to non-declaring commands before dispatch). `find(agent, name)` returns the corresponding definition. `execute(agent, line, images, signal)` uses `parseCommand()` and runs only a known command, returning the settled `CommandExecution` (the normalized result plus the lifecycle pairing `commandId`) or `undefined` for invalid syntax or unknown names. `images` carries the submission's base64-encoded composer images (`EncodedImageAttachment` from `@taskweaver/dsh-attachment/types`); the executor enforces the declaration — images sent to a non-declaring command, an absent `attachments` store, or an exceeded batch limit each settle as an error result before the handler runs, and a rejected batch publishes no durable object. An admitted batch is committed through `admitEncodedImages` and handed to the handler as frozen ordered `ImageBlock`s on `invocation.attachments`; the handler owns their model-visible use and returns an error when its grammar cannot use them, so the dispatching composer keeps the originals. A resolved command's lifecycle is logged on the receiving agent's session as the log-only pair `command/run` (before the handler, with a minted `commandId`, the parser's structured name, the issuing `CommandSource`, and `args` unless `recordInput` is false) and `command/done` (at settlement, with the outcome kind and verbatim text; a successful result may also name an earlier non-command authoritative domain event through `sourceEventSeq`; a thrown or aborted handler settles as `kind: 'error'`). Admission misses log nothing. Both are direct standalone appends on the receiving agent's session: no turn wraps them, and persistence drains them through ordinary checkpoints and teardown.

`parseCommand()` recognizes a slash at byte zero, a lowercase name containing letters, digits, `_`, or `-`, and either end-of-input or whitespace. It returns every byte after the name as `rawInput`, including separator whitespace; consumers own their command-specific grammar and may normalize only what that grammar permits.

Handlers return `success` or `error` plus optional UI text. A successful handler may also return `sourceEventSeq` when an earlier domain event owns a richer presentation; the lifecycle invariant requires that reference to be a prior non-command event in the same session. Results are rendered directly by the adapter and never enter model history. The registry never submits `rawInput` to the agent implicitly; a command producer may explicitly schedule model-visible work through the receiving `Agent`, in which case that producer owns the resulting message contract. The registry races handler completion against the supplied abort signal, but an uncooperative handler may continue its own external side effects after the caller stops awaiting it.

<a id="pkg-taskweaver-dsh-commands--composition"></a>
#### Composition

The shipped `dsh` base mounts this service and the Web client dispatches through it. UI-less demo spines and ACP automation do not provide a command adapter. Custom interactive compositions and command producers mount `@taskweaver/dsh-commands` explicitly.

<a id="pkg-taskweaver-dsh-commands--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-commands--direct-human-commands"></a>
##### Direct human commands

<a id="pkg-taskweaver-dsh-commands--what-the-model-sees"></a>
###### What the model sees

The registry itself submits nothing. Known slash commands execute in the UI command plane, and their `CommandResult` text is not submitted as a user message. Unknown slash-command input is rejected by shipped adapters instead of becoming a model prompt. A command producer may explicitly use the receiving `Agent`; for example, [`dsh-plan-mode`](../plan/README.zh.md#pkg-taskweaver-dsh-plan-mode--model-and-human-interactions) submits the optional message in `/plan [message]` after selecting plan mode. Image attachments follow the same rule: the executor only admits them into durable attachment objects, and a declaring producer decides whether and how they become model-visible message content.

<a id="pkg-taskweaver-dsh-commands--token-effect"></a>
###### Token effect

Command discovery, execution, and UI output add no model tokens. Explicit agent work scheduled by a command producer has the same token effect as the corresponding agent input.

<a id="pkg-taskweaver-dsh-commands--kv-cache-effect"></a>
###### KV Cache effect

Registry metadata, command input, and direct output never enter a model request and do not affect its cache. A mutated domain owns any later cache effect.

<a id="pkg-taskweaver-dsh-commands--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Only unstructured text input** — forms, completion schemas, and typed arguments remain command-owned parsing concerns.
- **Cooperative side-effect cancellation** — dispatch stops awaiting on abort; handlers must honor the signal to stop work that has already escaped into external systems.

<a id="pkg-taskweaver-dsh-permission-presets"></a>
### `@taskweaver/dsh-permission-presets`

<!-- migrated-from: packages/runtime/interaction/permission-presets/README.md -->
目录：`interaction/permission-presets`。
package.json 描述：User-facing permission presets (ctx.permissionPresets) for the DeepSeek Harness: one product-level Permissions select bundling the sandbox-mode and approval-policy knobs, written through to their own session events

<a id="pkg-taskweaver-dsh-permission-presets--taskweaver-dsh-permission-presets"></a>
User-facing permission presets through `ctx.permissionPresets` ([`PermissionPresetService`](./permission-presets/src/index.ts)). Each configured name bundles `sandbox/mode` with `approval/policy`; the defaults are `workspace-write` (`workspace-write` + `ask`) and `danger-full-access` (`danger-full-access` + `never`). UI adapters may expose the table as one selector, while sandbox execution and approval continue to consume their own knobs.

`set(session, name)` records a changed selection in a log-only `permissionPresets/preset` event, then calls each knob's setter only when its effective value changes. The selection event precedes the knob events and preserves user intent when presets share a bundle; a net-zero selection appends nothing. `current(events)` prefers a still-matching recorded selection, then the first matching table entry, and otherwise returns `custom`. Clients may display `custom` as the current value, but cannot select it.

The service owns the `permissionPresets` Settings namespace. Its `defaultPreset` is the default for future sessions: the composition entry uses `Config.defaultPreset`, or infers the preset matching the composed sandbox and approval defaults when omitted. A committed Settings change is read when the next session is created; creation pins `permissionPresets/preset`, `sandbox/mode`, and `approval/policy` into that session, so later changes never alter an existing session. A resumed seed, including an explicitly empty one marked by `session/end-seed`, preserves its effective permission and receives only missing durable facts rather than the latest user default. Mounting the service also sweeps already-live sessions, so an HMR replacement pins any session created while the plugin was absent.

The service requires a confining `ctx.shell` executor and `ctx.approval`. A table entry named `custom` throws at load. When composition defaults match no preset, the plugin requires an explicit `defaultPreset`; an independently constructed zero-event session may still derive `custom`. See the [sandbox switching design]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md`）.

Two optional children ship the product surfaces over the same service: a `permissions` session-projection unit (`src/types.ts` declares the key; the unit folds the three whole-value knob events and views the select — table options plus a current-only `custom` — over the composition defaults) and the `/permissionPresets` command (bare invocation reports the current preset and the table; a preset argument switches through `set`). Each child activates only when its registry (`ctx.sessionProjections` / `ctx.commands`) is composed.

<a id="pkg-taskweaver-dsh-permission-presets--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-user-approval` and `dsh-tool-bash`, which render the approval-policy prompt, switch notice, and sandboxed tool outcomes selected by this service's knob events; `permissionPresets/preset` itself is log-only.

<a id="pkg-taskweaver-dsh-permission-presets--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-permission-presets--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Only two mechanism knobs are bundled** — presets select sandbox mode and approval policy; an agent/profile choice is not part of `PresetSpec` yet.
- **`custom` is derived-only** — callers can switch away from an unmatched knob combination but cannot target or persist a named custom preset through this service.
- **The preset table is process-level** — configuration is fixed for the plugin lifetime; changing available presets requires reloading the plugin.
- **Stored defaults must remain in the preset table** — removing the referenced preset makes Permission settings registration fail until the `permissionPresets` section in `settings.yaml` is updated or reset.

<a id="pkg-taskweaver-dsh-tool-ask-user"></a>
### `@taskweaver/dsh-tool-ask-user`

<!-- migrated-from: packages/runtime/interaction/tool-ask-user/README.md -->
目录：`interaction/tool-ask-user`。
package.json 描述：Model-facing ask_user_question tool over the ctx.userQuestions seam

<a id="pkg-taskweaver-dsh-tool-ask-user--taskweaver-dsh-tool-ask-user"></a>
Model-facing `ask_user_question` tool over `ctx.userQuestions`. It lets the model ask the human a concise question when it needs confirmation, a choice, or missing information before continuing.

<a id="pkg-taskweaver-dsh-tool-ask-user--tool"></a>
#### Tool

`ask_user_question` accepts:

- `questions` — required non-empty array of question objects.
- `id` — required stable id on each question, echoed in the answer.
- `question` — required question text for each question.
- `header` — optional short heading.
- `options` — optional choices with `label` and `description`. If recommending a choice, put it first and append `(Recommended)` to that label.
- `multi_select` — whether that question may return more than one selected option.

The tool calls `ctx.userQuestions.ask()` and returns canonical `{ answers: [{ id, selected, custom? }] }`. `selected` contains option labels; `custom` carries a free-form answer, supplementing `selected` for a multi-select question and overriding it for a single-select question. The Native renderer preserves the compact JSON text shape `{ "answers": [{ "id": "...", "selected": ["..."], "custom": "..." }] }`.

<a id="pkg-taskweaver-dsh-tool-ask-user--role"></a>
#### Role

This is the Consumer package for the user-questions seam. It does not render UI and does not know how input is collected; it only translates model arguments into `AskUserQuestionRequest` and returns the human answer to the agent loop.

<a id="pkg-taskweaver-dsh-tool-ask-user--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-ask-user--tool-schema"></a>
##### Tool schema

<a id="pkg-taskweaver-dsh-tool-ask-user--what-the-model-sees"></a>
###### What the model sees

The model sees the generated [`ask_user_question` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-ask-user`）, including question ids, prompts, headings, options, and multi-select flags.

<a id="pkg-taskweaver-dsh-tool-ask-user--token-effect"></a>
###### Token effect

Fixed schema cost on every request where the tool is visible.

<a id="pkg-taskweaver-dsh-tool-ask-user--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the definition and visibility are unchanged. Plugin lifecycle or scoped restrictions may invalidate reuse from this schema.

<a id="pkg-taskweaver-dsh-tool-ask-user--tool-call-history-and-result"></a>
##### Tool-call history and result

<a id="pkg-taskweaver-dsh-tool-ask-user--what-the-model-sees-1"></a>
###### What the model sees

The model's full questions remain in the assistant tool-call arguments. After the human answers, the next step sees compact JSON in the exact shape `{"answers":[{"id":"<id>","selected":["<label>"],"custom":"<text>"}]}`; `custom` is omitted when unused and `selected` can contain zero, one, or several labels. UI interaction while the call is pending is not model context.

<a id="pkg-taskweaver-dsh-tool-ask-user--token-effect-1"></a>
###### Token effect

Arguments and answer JSON are data-dependent retained tokens; there is no token cost while waiting for the human.

<a id="pkg-taskweaver-dsh-tool-ask-user--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-ask-user--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **A pending question blocks the tool call until the human answers** — the tool declares no `timeout-policy` budget; cancellation rides the turn's `exec.signal` only.
- **Runtime-owned subagents cannot ask the user** — `ask_user_question` rejects a live child owned by another agent with `DELEGATED_CALLER`; the child must include the unresolved question or decision in its final result. Durable lineage does not decide this boundary, so a lineage-bearing session resumed as a runtime root may ask normally.
- **Native answers render as JSON text** — the canonical value remains structured, but the model-facing result uses compact JSON rather than a richer content-block vocabulary.

<a id="pkg-taskweaver-tool-ui-verify"></a>
### `@taskweaver/tool-ui-verify`

<!-- original-readme-missing: packages/runtime/interaction/tool-ui-verify/README.md -->
目录：`interaction/tool-ui-verify`。
package.json 描述：TaskWeaver-only approved UI self-verification tools

当前工作树未提供原逐包 README；这里保留包名和目录，具体契约以包源码及测试为准。

<a id="pkg-taskweaver-ui-verify"></a>
### `@taskweaver/ui-verify`

<!-- original-readme-missing: packages/runtime/interaction/ui-verify/README.md -->
目录：`interaction/ui-verify`。
package.json 描述：Isolated Playwright driver for TaskWeaver Electron UI self-verification

当前工作树未提供原逐包 README；这里保留包名和目录，具体契约以包源码及测试为准。

<a id="pkg-taskweaver-dsh-user-approval"></a>
### `@taskweaver/dsh-user-approval`

<!-- migrated-from: packages/runtime/interaction/user-approval/README.md -->
目录：`interaction/user-approval`。
package.json 描述：User-approval seam (ctx.approval) for the DeepSeek Harness: one-shot permission decisions dispatched to composed answerers over the approval/request waterfall, fail-closed by default

<a id="pkg-taskweaver-dsh-user-approval--taskweaver-dsh-user-approval"></a>
Channel-neutral one-shot approval seam. `ctx.approval.request(req)` returns `allowed-once`, `rejected`, `cancelled`, or `unavailable`; missing or failing answerers fail closed, and a grant applies only to the requested action. Exact event signatures live in the generated region of [approval.md]（原文链接目标：`../../../docs/subsystems/approval.md#cordis-surface`）.

Each request must belong to an open agent turn. The service appends a paired `approval/asked` and `approval/decided` audit record, while the model sees only the resulting logged tool outcome. An aborted request resolves `cancelled`; an audit append that fails before commit rejects rather than returning an unlogged decision.

Answerers are `approval/request` waterfall listeners. Return an outcome to answer for an owned agent or call `next()` to delegate. Agent-scoped listeners receive only that agent's requests; compose one terminal answerer per deployment because sibling listener order is not a policy priority mechanism. The ACP automation bridge supplies one-shot machine decisions for sessions it owns.

`ApprovalPolicy` is `'ask'` or `'never'`. The effective value is the last `approval/policy` event, falling back to config; `setApprovalPolicy()` is the write path. `'never'` rejects before interactive dispatch. Both policies contribute their complete current meaning to the cache-safe runtime-context snapshot.

The tools pipeline routes `ask` decisions through this seam and fails closed when it is absent; the sandboxed bash tool also uses it for escalated retries. The ACP automation bridge answers calls for its own agents through the client's machine policy. Audit events remain log-only, so the model sees only the asking consumer's result. See the [approval-seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-06-approval-seam.md`） and [sandbox Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md`）.

<a id="pkg-taskweaver-dsh-user-approval--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-user-approval--current-approval-policy-context"></a>
##### Current approval policy context

<a id="pkg-taskweaver-dsh-user-approval--what-the-model-sees"></a>
###### What the model sees

The first request and each effective policy change append a full runtime-context snapshot after retained history. Under `ask`, the approval contribution states that configured answerers may be consulted and absence fails closed. Under `never`, it states the deterministic rejection and non-escalation consequence. Unchanged requests retain the earlier snapshot without adding another message.

<a id="pkg-taskweaver-dsh-user-approval--ask-policy-contribution"></a>
###### Ask-policy contribution

```markdown
Approval policy: ask. Operations that require approval may ask through the configured answerers; without an available answerer, the request fails closed.
```

<a id="pkg-taskweaver-dsh-user-approval--never-policy-contribution"></a>
###### Never-policy contribution

```markdown
Approval prompts are disabled in this session: actions that require approval are rejected automatically — do not request sandbox escalation (do not set `sandbox_permissions`).
```

<a id="pkg-taskweaver-dsh-user-approval--token-effect"></a>
###### Token effect

One concise context message on the first request and on an effective change; unchanged requests add no duplicate policy tokens.

<a id="pkg-taskweaver-dsh-user-approval--kv-cache-effect"></a>
###### KV Cache effect

Append-only after retained history. An `ask`/`never` switch preserves the stable system and conversation prefix instead of rewriting the first wire message.

<a id="pkg-taskweaver-dsh-user-approval--tool-outcome"></a>
##### Tool outcome

<a id="pkg-taskweaver-dsh-user-approval--what-the-model-sees-1"></a>
###### What the model sees

`approval/asked` and `approval/decided` are log-only. The model sees only the asking consumer's eventual allowed, rejected, cancelled, or unavailable tool outcome; the human permission UI is not context.

<a id="pkg-taskweaver-dsh-user-approval--token-effect-1"></a>
###### Token effect

Zero duplicate audit tokens. A rejection may replace a normal tool result with a small retained error, while an allowance leaves the consumer's ordinary result.

<a id="pkg-taskweaver-dsh-user-approval--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-user-approval--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Requests are valid only inside an open turn** — an idle or between-turn caller throws before auditing; a durable out-of-turn approval workflow is deferred.
- **Only one-shot grants exist** — the outcome vocabulary has `allowed-once` but no `allow-always`, remembered rule, revocation, or grant store; session policy is only `ask` / `never`.
- **The request carries no tool arguments** — an answerer sees the tool name, reason, and optional call id; the ACP machine channel requires a call id and delegates requests without one.
- **No built-in answerer** — headless or incompletely composed deployments resolve `unavailable` and fail closed; the service itself never prompts a human.

<a id="pkg-taskweaver-dsh-user-questions"></a>
### `@taskweaver/dsh-user-questions`

<!-- migrated-from: packages/runtime/interaction/user-questions/README.md -->
目录：`interaction/user-questions`。
package.json 描述：Abstract user-questions seam (ctx.userQuestions) for asking the human during agent runs

<a id="pkg-taskweaver-dsh-user-questions--taskweaver-dsh-user-questions"></a>
User-interaction Service Definition. It owns `ctx.userQuestions`, the service a model-facing tool or permission plugin uses when it needs to pause work and ask the human for a decision.

<a id="pkg-taskweaver-dsh-user-questions--service-userquestionservice-ctx-key-userquestions"></a>
#### Service: `UserQuestionService` (ctx key: `userQuestions`)

<a id="pkg-taskweaver-dsh-user-questions--public-api"></a>
##### Public API

- `ctx.userQuestions.registerProvider(provider): () => void` Register the UI-side provider. Only one provider may be active in a context; disposal unregisters it.
- `ctx.userQuestions.ask(request): Promise<AskUserQuestionAnswer>` Ask the active provider and wait for the answer.

<a id="pkg-taskweaver-dsh-user-questions--key-types"></a>
##### Key Types

- `AskUserQuestionRequest` — `{ questions: [{ id, question, detail?, header?, options?, multiSelect?, intent? }], agent?, signal? }`; `detail` supplies supporting text that providers render with the question without turning it into an option label. When present, `agent` must be the registry's exact live runtime root.
- `AskUserQuestionOption` — `{ label, description? }`.
- `AskUserQuestionIntent` — `{ kind: 'plan-review', approve }`; the tagged presentation intent below.
- `AskUserQuestionAnswer` — `{ answers: [{ id, selected, custom? }] }`.
- `UserQuestionProvider` — UI implementation with `ask(request)`.
- `UserQuestionError` — `HarnessError` subclass with codes such as `EMPTY_QUESTIONS`, `BAD_INTENT`, `NO_PROVIDER`, `DUPLICATE_PROVIDER`, `ASK_ABORTED`, `CALLER_NOT_LIVE`, and `DELEGATED_CALLER`.

For a single-select question, `custom` overrides the selected choice and `selected` is empty. For a multi-select question, `custom` may supplement the labels in `selected`. A UI may preserve a skipped item as `{ id, selected: [] }`, keeping the existing answer shape while retaining other answers in the batch.

When a request carries an agent, `ask()` authenticates its exact identity through the live `AgentRegistry` and admits only a runtime root. Durable lineage is not authority: a session with historical delegation depth may ask after it is resumed as a new runtime root, while a live child owned by another agent is rejected even if its durable depth is zero. Agentless programmatic requests retain the existing provider path.

<a id="pkg-taskweaver-dsh-user-questions--presentation-intent"></a>
##### Presentation intent

`intent` declares that a question IS a known kind of decision, so a UI that recognises the tag may present it as such — `plan-review` says `detail` is a plan under review, and `dsh-plan-mode` sets it on the `exit_plan_mode` question. An intent changes presentation only: a UI honouring it answers with the same option labels a generic UI would send, and a UI that does not know the tag renders the generic option list, so callers read the same answer fields either way. `approve` names the label that approves rather than relying on option order. `ask()` rejects with `BAD_INTENT` the two assertions no type can carry: an `approve` naming none of that question's own options, and an intent on a question with no `detail` — the thing it declares itself a review of.

<a id="pkg-taskweaver-dsh-user-questions--role"></a>
#### Role

This is the Service Definition package. Consumers such as `@taskweaver/dsh-tool-ask-user` depend on this service; the Web host runtime supplies the shipped Service Provider. The loop stays unchanged: a tool call awaits a promise, and the tool result resumes the normal agent loop.

<a id="pkg-taskweaver-dsh-user-questions--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-tool-ask-user`, which retains a successful provider answer as compact JSON or one of these failures: `Error: ask_user_question was aborted before the user answered`, `Error: ask_user_question requires at least one question`, `Error: human interaction requires the exact live calling agent when an agent is supplied`, `Error: human interaction is unavailable while the calling agent is owned by another live agent; include the unresolved question or decision in the child agent's final result`, `Error: no user-questions provider is registered`, or `Error: <message>`. Waiting for the human adds no tokens.

<a id="pkg-taskweaver-dsh-user-questions--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-user-questions--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **One provider per context** — there is no routing or fan-out to multiple UIs; a second registration throws `DUPLICATE_PROVIDER`, and with none registered `ask()` throws `NO_PROVIDER` rather than degrading.
- **The vocabulary is the question-form shape only** — selectable options plus optional custom text; richer interaction shapes (file pickers, diff-preview confirmations) have no seam vocabulary yet.

<a id="pkg-taskweaver-dsh-orchestration"></a>
### `@taskweaver/dsh-orchestration`

目录：`interaction/orchestration`。

<a id="pkg-taskweaver-dsh-orchestration--service-contract"></a>
#### Service contract

`ctx.orchestration` is the Host-provided seam for model-requested DAG execution. The desktop Host registers one provider with `registerProvider()`; duplicate providers fail with `DUPLICATE_PROVIDER`, and `run()` without a provider fails with `NO_PROVIDER`. Requests must come from a live root agent and include a tool-call id. Nested orchestration from child agents is rejected. Goals and optional context are trimmed and limited to 20,000 characters; `readOnly` is normalized to `false` when omitted. The request `AbortSignal` is forwarded to the provider so stopping the active turn can cancel the DAG. Results contain a summary, task counts and statuses, cancellation state, and changed file paths.

<a id="pkg-taskweaver-dsh-tool-orchestrate"></a>
### `@taskweaver/dsh-tool-orchestrate`

目录：`interaction/tool-orchestrate`。

<a id="pkg-taskweaver-dsh-tool-orchestrate--tool-contract"></a>
#### Tool contract

Registers the model-facing `orchestrate` tool on `ctx.tools`. The required `goal` carries the complete objective and constraints; optional `context` carries facts already gathered by the main agent, and `readOnly` marks work that must not modify files. The tool delegates to `ctx.orchestration`, then returns the DAG summary, per-task states, cancellation status, and changed-file list. Its description directs simple tasks to regular tools and recommends DAG execution for independent parallel work. It does not start a nested DAG from child agents.

<a id="family-interaction"></a>
### 原族级说明（迁移保留）

<a id="family-interaction--interaction-the-human-collaboration-plane"></a>
The services and plugins through which a human collaborates with a running agent — questions, approvals, permission presets, commands. These are **product** packages: real interfaces a person drives.

| Package | Role | ctx key |
|---|---|---|
| [`commands/`](./README.zh.md#pkg-taskweaver-dsh-commands) | Registers and dispatches human commands for interactive adapters. | `ctx.commands` |
| [`user-approval/`](./README.zh.md#pkg-taskweaver-dsh-user-approval) | Coordinates one-shot approval decisions. | `ctx.approval` |
| [`permission/`](./README.zh.md#pkg-taskweaver-dsh-permission-presets) | Presents and persists user-facing permission presets. | `ctx.permissionPresets` |
| [`user-questions/`](./README.zh.md#pkg-taskweaver-dsh-user-questions) | Defines the provider-neutral human question/answer seam. | `ctx.userQuestions` |
| [`tool-ask-user/`](./README.zh.md#pkg-taskweaver-dsh-tool-ask-user) | Exposes human questions to the model. | (registers on `ctx.tools`) |

These packages integrate through existing agent and session contracts rather than changing the loop. Interactive applications provide the concrete command, approval, and question adapters; automation uses [`acp/`](../acp/README.zh.md#family-acp), and runnable demo bundles live under [`examples/`](../examples/README.zh.md#family-examples). The product [`dsh`]（原文链接目标：`../../host-cli/README.md`） CLI composes these packages directly.

The subsystem references: [approval.md]（原文链接目标：`../../docs/subsystems/approval.md`）, [permission-presets.md]（原文链接目标：`../../docs/subsystems/permission-presets.md`）, [user-questions.md]（原文链接目标：`../../docs/subsystems/user-questions.md`）, and [commands.md]（原文链接目标：`../../docs/subsystems/commands.md`）. The automation-only ACP transport is [`acp/`](../acp/README.zh.md#family-acp), the SDK's JSON-RPC server half is [`sdk/server`](../sdk/README.zh.md#family-sdk), and the shared bin boot glue is [`boot/`](../boot/README.zh.md#family-boot).
