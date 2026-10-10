# client 包族

<a id="family-client"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

承载浏览器侧运行时、连接协议、UI 插槽和功能插件。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-client-connection`](#pkg-taskweaver-dsh-client-connection) | `client/connection` | [接口与限制](#pkg-taskweaver-dsh-client-connection) |
| [`@taskweaver/dsh-client-runtime`](#pkg-taskweaver-dsh-client-runtime) | `client/runtime` | [接口与限制](#pkg-taskweaver-dsh-client-runtime) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-client-connection"></a>
### `@taskweaver/dsh-client-connection`

<!-- migrated-from: packages/runtime/client/connection/README.md -->
目录：`client/connection`。
package.json 描述：Wire consumer layer: HTTP-up/WebSocket-down client, ConnectionController dual streams with reconnect, and fixture api

<a id="pkg-taskweaver-dsh-client-connection--taskweaver-dsh-client-connection"></a>
Wire consumer layer: the client plugin's apply mounts `ctx.connection` (shared api client + current-page loopback state + observable generation-scoped `hostDescription` + single-consumer stream-loop starter); the export face carries the wire contract types, the `AbstractApiClient` abstraction, and the loop's sink/config types. Each successful readiness handshake publishes the exact `host.describe` value before `onConnected`; generation loss and explicit stop clear it, so native-capability consumers never retain a disconnected answer. The browser carrier uses HTTP POST for unary and respond operations and opens one downlink-only WebSocket each for `events.mux` and `events.host`; the in-process carrier satisfies the same two-stream abstraction. The exported `ClientTransportHooks` names the page global `__TASKWEAVER_TRANSPORT__` that replaces the browser carrier wholesale: the served web app leaves it unset and gets HTTP + WebSocket, while a shell owning a different physical transport (the worker preview's postMessage tunnel) provides `createApiClient` and `fetch` — plus `loadBundle` when it also owns bundle bytes — instead of forking the plugin. The Host half owns the single `/api` route and its Fetch bridge; a registered Typert interceptor claims its Remote endpoints before the API Proxy fallback. Loopback hostname classification stays package-internal: the `/api` Host fence and WebSocket upgrades use it directly, while other client plugins consume the derived `ctx.connection.isLoopback` state. The node half's `/api` route pins the privileged method set (`host.pickDirectory`, `host.openPath`, and the whole configuration plane — `settings.describe`/`openDocument`/`update`/`replace`/`mutate` and `credentials.describe`/`set`/`unset`; reads and native actions included, since describing returns the exposed configuration, opening acts on the Host desktop, and probing an arbitrary reference reports where a credential comes from — and the agent-preset authoring plane, `agentPreset.read`/`copy`/`openDocument`/`remove`, since a composition names the plugins a session runs, so reading one is reconnaissance, and copy/remove/openDocument manage the roster and drive the host desktop (authoring is copy-only, so none of them accepts composition text or a path); `agentPreset.list` and `agentPreset.select` stay out — the roster carries only ids and trust, and choosing a preset grants nothing `session.create`'s own `agentPreset` did not, over a default that already carries bash) to loopback by passing the trust fence with an empty trust list — a declared `trustedHosts` authority reaches every other method, while these stay loopback-local until a real authentication layer exists. The platform carriers and ConnectionController loop are package-internal; apply selects and drives them. The downlink boundary is documented in the [WebSocket downlink carrier Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-08-04-websocket-downlink-carrier.md`）.

<a id="pkg-taskweaver-dsh-client-connection--api-browser-trust-fence"></a>
#### /api browser-trust fence

The node half guards every entry under `/api` before bridging or upgrading (`src/api-request-trust.ts`). Every request — browser-marked or not — must present a `Host` that is a loopback authority or matches a `trustedHosts` entry: exact on `host:port` entries, any port on port-less entries, both sides compared through WHATWG normalization (DNS-rebinding defense). There is deliberately no shortcut for unmarked HTTP requests: over plain HTTP a browser attaches neither `Origin` nor Fetch-Metadata to image and navigation reads, so an unmarked request may still be a rebound browser read with a readable response, and Host is the one header rebinding cannot forge; a browser WebSocket handshake carries `Origin` and passes the same comparison. Non-browser clients pass the same fence via loopback, deployment-derived LAN IP literals, or a declared authority. When markers are present, an attached `Origin` must equal the Host authority, and an explicit `sec-fetch-site: cross-site` marker is refused. A `trustedHosts` entry that is not a bare, canonical `host[:port]` authority — one WHATWG parsing reads back exactly as written — fails the plugin load loudly: parsing would otherwise quietly authorize the hostname inside `harness.internal/path`, or broaden a dangling-colon or zero-padded port to an any-port grant. HTTP failures answer plain 403 before any RPC dispatch; upgrade failures reject the handshake before any event stream starts. Non-loopback compositions must trust their serving authorities explicitly: the Web runtime derives LAN IP literals from an all-interfaces server config, while `trustedHosts` in cordis.yml and the CLI's `--trusted-host` flag declare named authorities. `dsh web --host 0.0.0.0` is intentionally unsupported until remote access has an authentication layer. The fence is a reachability policy, not authentication; the Web carrier provides no authentication layer. Decision record: [the api browser-trust boundary Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-28-api-browser-trust-boundary.md`）.

<a id="pkg-taskweaver-dsh-client-connection--api-websocket-downlinks"></a>
#### `/api` WebSocket downlinks

`/api/events.mux` and `/api/events.host` each accept a WebSocket upgrade and send only the corresponding `ServerRequest` text messages to the browser; the client sends no application data over these sockets. If either socket ends, the current connection generation fails and rebuilds both streams; readiness still requires both sockets to be open and the `host.describe` HTTP call to succeed. Host teardown terminates both sockets, aborts their sources, and waits for source cleanup before returning. Ordinary network GETs to these paths return 426 with no SSE fallback; `toFetchHandler`'s SSE codec serves only the isomorphic in-process carrier.

<a id="pkg-taskweaver-dsh-client-connection--model-experience"></a>
#### Model Experience

None, as the wire consumer layer moves already-composed messages between browser and host; nothing here reaches a model request.

<a id="pkg-taskweaver-dsh-client-connection--kv-cache-effect"></a>
###### KV Cache effect

None; this package neither assembles nor sends a provider request.

<a id="pkg-taskweaver-dsh-client-connection--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **History resumes an unattached session** — opening history may create the host-side agent and add latency to the first open; there is no persistence-only read path.
- **The `/api` bridge buffers each request body in memory** — `maxRequestBodyBytes` (default 300 MiB, sized for the default 200 MiB aggregate image limit after base64 expansion plus envelope headroom) is therefore also the per-request resident bound; a streaming body path would be needed to lower it without shrinking the image limits.

<a id="pkg-taskweaver-dsh-client-runtime"></a>
### `@taskweaver/dsh-client-runtime`

<!-- migrated-from: packages/runtime/client/runtime/README.md -->
目录：`client/runtime`。
package.json 描述：Client session and workspace services with a shared Host connection stream

<a id="pkg-taskweaver-dsh-client-runtime--taskweaver-dsh-client-runtime"></a>
Client Cordis boot and React-free object services: `SessionRuntime` owns Session objects, list and scope state, and the shared event window and history paging used by registered conversation view targets. `WorkspaceRuntime` depends on `SessionRuntime` and owns Workspace objects, list/actions, default-target derivation, and the New Session blank-reuse entry (`connectWorkspace`). The runtime fans the shared Host stream into Session and Workspace owners and hands each generic `host/remote-event` frame to `ctx.remote.$dispatch`; domain packages subscribe to their owner events through `ctx.remote.$on` and decide which caches or session rows they invalidate. Client sessions are always Host-born (Session+Agent+cwd in one `session.create`); the client holds no pre-entity session state — a session's Agent scope (the client mirror of host dsh-scope, keyed by the shared agent/session id) is born when its row enters the list mirror and dies with the prune. Contract: api-contracts v3 §4. Each `Session` holds a generic `ProjectionValueStore` seeded from the history-tail `projections` block and updated by `session/projection` frames under higher-seq-wins; domain keys (including `todos`) are read via `projections.faceOf` / `useProjection`, not via `ConversationSnapshot`. The store also publishes one reference-stable whole-value map through `SessionSummary.projectionValues`, allowing global list consumers to reuse the same projections without creating per-session subscriptions.

For each prompt that can reach a local root or continuable child Agent, the runtime samples the browser's current `Intl.DateTimeFormat().resolvedOptions().timeZone` and attaches it to that one Session or subagent prompt RPC. It is neither cached nor included in Session creation or fork state, so travel and concurrent tabs keep message-local provenance. A browser that cannot provide a non-empty zone fails the prompt locally instead of silently substituting deployment state.

Settings owners share the React-free `SettingsScopeSpec`, `SettingsScope`, and snapshot types defined here. ui-settings owns `ctx.settingsScope.bind(spec)`, its Host transport, schema validation, and lifecycle; see [its package contract]（原文链接目标：`../ui-settings/README.md`）.

<a id="pkg-taskweaver-dsh-client-runtime--runtime-snapshot-contracts"></a>
#### Runtime snapshot contracts

Session and Workspace services expose `ObservableSnapshot`/`SnapshotStore` data faces with `getSnapshot()` and `subscribe()`. The runtime owns these contracts and the store engine. Session-scoped data providers are materialized by `SessionProvideChannel`; that channel contains no renderer or component-registration API.

<a id="pkg-taskweaver-dsh-client-runtime--workspace-and-session-lists"></a>
#### Workspace and Session lists

Workspace and Session lists have independent monotone `pending` → `ready` baseline phases and separate refresh activity/error state. Incremental upsert/removal/order frames and unary mutation echoes arriving during a list request replay over its response. Every successful Workspace baseline re-establishes Host-durable Workspace order so reconnects adopt changes committed while this client was offline. `WorkspaceRuntime.insertBefore` installs an optimistic order immediately; only the latest unary echo may replace it, a newer Host order frame outranks an older echo, and a latest rejected request restores the last Host-confirmed order rather than an earlier uncommitted drag. Removed Workspace ids retain process-local tombstones so late changed frames cannot resurrect them. Workspace recency is derived only after both baselines are ready and never changes Workspace list order.

`SessionSummary.pendingInteraction` classifies the live user action blocking a Session as `approval`, `plan-review`, or `question`. `SessionManager` tracks answerable requested/resolved mux frames by their stable request identities even before a Session object is instantiated; pre-instantiation buffering retains every live request, replaces replay duplicates, and removes resolved requests so the list status always has a matching answerable `PendingWait` when the Session is opened. The first pending question takes presentation priority over concurrent approvals to match composer routing, while only a request that satisfies the plan-review composer's binary rendering constraints keeps the distinct `plan-review` status. The state is connection-generation scoped: disconnect clears it, and mux-open replay restores only requests that remain pending.

`WorkspaceRuntime.delete(workspaceId)` removes the registration from the client projection after the successful unary response; the matching `host/workspace-removed` frame is idempotent and synchronizes other tabs. Session state and the current Session selection are independent, so accounted Sessions immediately project under Ungrouped after their Workspace disappears.

`WorkspaceListState.archivedSessionIds` mirrors the Host's registry-global archive set (a `readonly SessionId[]` in Host order, replaced only when membership changes; consumers needing O(1) lookups build a transient Set). It is full-snapshot state: the `workspace.list` baseline, the `archiveSession` unary echo, and the `host/archived-sessions-changed` frame each install the complete set. `WorkspaceRuntime.archiveSession(sessionId)` archives over the wire; the projection sweep clears the current selection into the New Session view state whenever it lands in the archive set — one rule covering the local echo, another tab's frame, and a reconnect baseline restoring a selection archived while this client was away. A set installed while a `workspace.list` request is in flight also supersedes that stale baseline's set. Grouping surfaces hide members everywhere while the session rows stay in the list store.

Workspace business state does not enter `SessionListState` or a session snapshot store.

`abbreviateHomePath` is the display-only POSIX home abbreviation used by Web Workspace hover cards and Tool summaries; a Windows drive or UNC path stays verbatim, and a missing, empty, or filesystem-root home leaves the path unchanged.

`indexSubagentDescendants()` derives per-parent total and running descendant counts from the retained list mirror. It follows only uninterrupted `origin: 'subagent'` ancestry, so an ordinary fork starts a separate ownership subtree; cycles stop without throwing, and a missing parent remains a harmless key until its summary arrives.

`SessionListState.jobsBySession` mirrors the Host's `session/jobs` frames last-wins, keyed by session and needing no Session instance. An emptied set is stored as an absent key, so absence and `[]` are one representation and consumers never test a sentinel. Two clears keep it from outliving its truth: `session/subscribed` drops the session's mirror, because a fresh generation sends a baseline only for a non-empty set and a retained list would survive as a phantom, and `host/session-removed` drops it again, because owner disposal removed the records on the mux stream while the removal frame rides the host stream, leaving the two with no relative order.

`SessionRuntime.search(query, signal)` is a stateless one-shot action over the `session.search` RPC. It returns ranked session/snippet pairs without putting query, loading, or error state into the shared Session list, so each UI owner controls debounce, cancellation, stale-response suppression, and fallback presentation. `searchResultLimit` re-exposes `SESSION_SEARCH_RESULT_LIMIT` — the bound the response schema itself enforces — as injected presentation data, so client plugins do not duplicate it. It is a protocol constant rather than per-connection state, so the connection handle does not carry it.

<a id="pkg-taskweaver-dsh-client-runtime--new-session-and-the-blank-mirror"></a>
#### New Session and the blank mirror

`WorkspaceRuntime.connectWorkspace(workspaceId)` resolves the session a New Session flow lands in: it reuses the workspace's existing blank session from the list mirror (`blank && cwd == workspace.path && sessionIds.includes(id)` — the host's own membership rule, never cwd alone, so a cwd-matching unaccounted blank session is never hijacked) or calls `session.create({workspaceId})`, returning the session id for the caller to open. The shared `startSession` action targets an explicit Workspace first, then the current Session's Workspace, then the derived recent Workspace; with no Workspace it clears into the blank New Session page. `SessionSummary.blank` mirrors the host's derived empty-log bit and only ever lowers on the client: seeded by `session.list` / the `host/session-added` frame, flipped false by the first ACCEPTED local `prompt()` (on the RPC success response — acceptance proves the user message is in the host log; a rejected first prompt keeps the session blank and reusable) and by any `running: true` status frame, re-aligned by every list re-pull. List surfaces hide blank rows; the store carries every row. `SessionRuntime.create` accepts an optional caller-preallocated SessionId and throws `SessionCreateError` (carrying `requestedSessionId`) on failure.

`Session.composerPhase` treats any visible non-command Chat Node as conversation content, so a client plugin can project durable human input without opening a turn while a window containing only generic command rows retains the Host blank posture. List hiding and blank-session reuse still follow the Host blank bit. A history window that lacks the plugin-owned input Node returns to that blank posture until an older page restores it.

<a id="pkg-taskweaver-dsh-client-runtime--pending-queue-projection"></a>
#### Pending queue projection

`ConversationSnapshot.queue` is the Host's authoritative transient snapshot of `agent.inbox.nextTurn`; pending next-step steering stays outside this projection. Each row carries its `MessageId`, complete editable text when every content block is text, and a flattened preview. The Host derives whole `session/queue` snapshots from durable `agent/inbox/spliced` mutations and sends a baseline on reconnect; the message-local `agent/inbox/inserted`, `claimed`, and `discarded` notifications are not used to reconstruct this projection. `Session.updateQueue()` sends edit/remove operations through Host-side `Inbox.splice()` without optimistic client mutation, so the next Host snapshot is the sole visible commit and a claim race can surface `queue-item-not-found`.

<a id="pkg-taskweaver-dsh-client-runtime--conversation-assembly"></a>
#### Conversation assembly

Each `Session` gives its contiguous event window to a `ConversationNodeAssembler`. Plugins register business Definitions that map one event to a stable `{kind, id}`, create State at the unique start event, fold correlated updates, and build final nodes for registered view targets. The assembler owns the Context index, read-only predecessor lookup, and a reference-stable Turn/Step Location index. A live append evaluates each Definition once and updates only the matched Context; loading an older page preserves existing Context and node identities, matches only the newly prepended events, and replays Contexts whose predecessor or Location facts changed. Full replacement is reserved for open, resync, and gap repair.

Definition authors keep matching local to the current event, give every correlated event a stable business id, and make updates replayable by log `seq`; renderers consume final Node data and constrained Location values rather than scanning Session or Chat collections. The [Conversation Node cookbook]（原文链接目标：`../../../docs/cookbook/adding-a-conversation-node.md`） gives the complete registration and pagination path.

`ui-conversation` registers the built-in Chat Definitions and the keyed Chat snapshot builder. Append-origin user, assistant, and Tool results remain the human record; model-only replacement copies stay out, except that a compaction checkpoint becomes its own marker and resolves missing summary provenance when an older page supplies it. Durable inbox splice Contexts classify next-step user messages as steering without making inbox state a Session special case. Context messages retain producer provenance and form. StatsLine reads `ConversationSnapshot.chat.legacy.nodes`, while Session mirrors that legacy slice into the top-level `nodes`, `partial`, and `runningCalls` public compatibility fields without running a second business fold. `ui-trajectory` registers independent Definitions and a target builder over the same Session window; it preserves the existing stage-oriented view model without consuming the Chat compatibility fields or running another history fold.

The Chat builder keeps one mutable keyed store per Session. Content updates notify only the affected node key, structural changes rebuild order and Location membership, and a prepend adds rows without replacing existing keyed values. Assistant chunks update Definition State for every event but request at most one materialization per animation frame; final messages and Turn/Step closure publish immediately. See the [client Tool presentation decision]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-08-08-client-tool-presentation-ownership.md`）.

<a id="pkg-taskweaver-dsh-client-runtime--trajectory-request-data"></a>
#### Trajectory request data

Trajectory Definitions assemble one chronological, purpose-discriminated provider-request stream. Assistant requests always carry their numeric `turn` and `step`; compaction requests carry `step: 0` and a `turn` owner that may be `null`. That null owner means a manual compaction ran standalone between turns, not that it belongs to either adjacent turn. A cancellation-finalized `assistant/message` retains its durable result seq and provider provenance but does not complete the request; `step/end` classifies that request as an error. A `session/end-seed` boundary closes an unmatched compaction request as an error at the boundary time with `Compaction was interrupted before completion.`; a later start projects as an independent request instead of overwriting the orphan.

<a id="pkg-taskweaver-dsh-client-runtime--code-mode-child-call-tree"></a>
#### Code Mode child-call tree

Every `ToolCallBlock` recursively owns its children through `subCalls`, in start order. Chat's Tool Definition correlates root calls and results by call id, folds Code Dispatch start/settlement records into that root Context, and projects one keyed recursive tree; child calls never become independent Chat roots. When a start falls outside the loaded window, its settlement remains renderable with `callTime: null`. A child update copies only its ancestor path, so unchanged siblings retain object identity. Edges that introduce a cycle or exceed the fixed 256-call depth limit are consumed without mutating the tree. Trajectory's Tool Definition independently assembles the same nested data contract for its target.

<a id="pkg-taskweaver-dsh-client-runtime--session-title-projection"></a>
#### Session title projection

`SessionManager` retains the latest validated `session/title` control snapshot independently of list and session-instance arrival. Newer event seqs replace older snapshots, title timestamps contribute to list recency, and a subscription baseline discards any retained title beyond its `lastSeq` before the optional folded title arrives. Explicit session removal also clears the retained title. The client-facing `SessionSummary.title` is therefore only the actual durable title; `displayTitle` is always present and falls back through the cwd basename and session id. A cold persisted session keeps that fallback until opening or resuming it causes the host to fold and project its log-backed title. `ISession.rename` settles the `title` projection cell directly from the unary response's `{title, seq}` under the same higher-seq-wins rule — the list row and every `useProjection('title')` reader update ahead of the push frame, whose later replay of the same seq is a no-op.

<a id="pkg-taskweaver-dsh-client-runtime--model-retry-projection"></a>
#### Model retry projection

The Host-owned LLM retry invariant validates provider-routed `llm/retry` and `llm/retry-started` records at the durable append boundary, including their identity, ordering, timer, integer, status, provider-delay, and non-empty diagnostic contracts. In the client, the Retry, Assistant, and Turn Error Definitions fold those records with Assistant and Turn/Step events: a failed attempt's streaming partial is removed and a durable retry notice appears at the retry event's sequence position. The notice is `scheduled` until the matching started record arrives; closing its owning Step or Turn first marks it `cancelled`, while the started record marks it `started`. Normal-mode notices carry their finite maximum; always-mode notices remain explicitly unbounded. A terminal `turn/end` error projects one `turn-error` node from its durable message and optional code — after exhausted retries it renders beside the settled retry notice; AUTH projections replace provider copy that may echo credential fragments with `API key is invalid`, while the raw diagnostic remains in the session log. An intermediate failure that scheduled another retry keeps only the retry notice for that attempt. Window rebuild and history replay use the same Definitions, so refresh neither resurrects discarded chunks nor loses terminal failure feedback. Visible unfinalized output is frozen as an interrupted Assistant node beside the terminal error.

A `turn/end` whose reason is `max-tokens` projects one `turn-max-tokens` node at the turn position: a warning-styled localized notice that the reply stopped at the per-request output cap, with the truncated output kept in the flow and guidance that sending "continue" resumes in a new turn. The notice carries no token counts because the event reports none. The same Definition rebuilds it on window rebuild and history replay, so the reason survives refresh and restore.

<a id="pkg-taskweaver-dsh-client-runtime--session-forking"></a>
#### Session forking

`ISessions.fork({sessionId, atSeq?, increaseTitle?})` resolves only after the child summary is locally addressable, carrying source lineage and cwd with `blank: false`; callers choose whether to open it. With `increaseTitle: true`, the client renames the child from the source session's persisted title: a trailing `(N)` or `（N）` is incremented without changing bracket style, while any other title gets ` (1)` appended; the rename is skipped when the source has no persisted title, and a rename failure rejects the promise but leaves the created child in place. This option is not sent in the Host fork request. A `workspace-attach-failed` response still identifies a child already published by the Host, so `SessionManager` reconciles that partial success before `SessionForkError` reaches the caller instead of making a retry create a duplicate child.

<a id="pkg-taskweaver-dsh-client-runtime--session-model-selection"></a>
#### Session model selection

Each resident `Session` owns a `modelSelection` snapshot containing the current `ModelSelection`, provider-grouped directory, provider-local failures, and the `idle`/`loading`/`ready`/`selecting`/`error` state. History establishes or refreshes the current selection, opening a selector refreshes the directory, and selection failures preserve the last selection and usable groups. Directory and selection operations share a monotonically increasing generation so an older response cannot overwrite a newer selection. A reconnect rebuild restores the selection reported by the Host without replacing unchanged selection substructure.

<a id="pkg-taskweaver-dsh-client-runtime--model-experience"></a>
#### Model Experience

None, as the session object layer selects the provider/model route used by a later Host request but adds no model-visible content.

<a id="pkg-taskweaver-dsh-client-runtime--kv-cache-effect"></a>
###### KV Cache effect

Changing the model selection can change or invalidate provider-side cache reuse; this package does not alter the prompt prefix itself.

<a id="pkg-taskweaver-dsh-client-runtime--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **`loader.unload` is a stub** — it throws not-implemented; the client has no unload chain from fiber disposal through registration and style removal.
- **Scope teardown is stage-driven, single-occupant today** — the staged session follows `list.current` exactly (staging is the open signal: the event window opens ⟺ the session is on stage); a removed-while-staged session's scope survives frozen until the stage moves on, not until true observer count reaches zero. Resolution (`binding()`/`scope()`) is pure addressing; `currentProvideInfo` publishes the selected session's data bundle. The staged state can widen to a multi-pane list when concurrent panes land.
- **Value imports of this package from plugin bundles must use the `/client` subpath** — the bare package name is not in the loader externals table and inlines a second module instance, whose private scope-tag Symbol never matches.

<a id="family-client"></a>
### 原族级说明（迁移保留）

<a id="family-client--client-web-gui-browser-half"></a>
The browser side of the dsh web GUI: shell boot, browser-host communication, shared UI services, and feature plugins. Authoring rules live in [AGENTS.md]（原文链接目标：`AGENTS.md`）; the host half is [`host/`](../host/README.zh.md#family-host). All except `test-runtime` are **product** packages named `@taskweaver/dsh-client-<name>`.

| Package | Purpose |
|---|---|
| [`web/`]（原文链接目标：`web/README.md`） | Boots the browser shell from the client entry graph. |
| [`ui-renderer/`]（原文链接目标：`ui-renderer/README.md`） | Binds slot data to React and mounts the assembled application after client boot settles. |
| [`modules/`]（原文链接目标：`modules/README.md`） | Loads browser-side client modules. |
| [`connection/`](./README.zh.md#pkg-taskweaver-dsh-client-connection) | Maintains browser-host RPC communication and event delivery. |
| [`runtime/`](./README.zh.md#pkg-taskweaver-dsh-client-runtime) | Provides shared client services for sessions, workspaces, and UI composition. |
| [`hmr/`]（原文链接目标：`hmr/README.md`） | Refreshes client plugins during development. |
| [`locale/`]（原文链接目标：`locale/README.md`） | Provides localization preferences and message dictionaries. |
| [`test-runtime/`]（原文链接目标：`../test-support/client-runtime/README.md`） | Provides shared repository test support for client feature packages. |
| [`ui-slots/`]（原文链接目标：`ui-slots/README.md`） | Defines how UI features register and compose extension slots. |
| [`ui-theme/`]（原文链接目标：`ui-theme/README.md`） | Applies the selected color theme. |
| [`ui-primitives/`]（原文链接目标：`ui-primitives/README.md`） | Provides shared React controls, icons, and content renderers. |
| [`ui-attachment/`]（原文链接目标：`ui-attachment/README.md`） | Registers composer and message-image attachment presentation. |
| [`ui-layout/`]（原文链接目标：`ui-layout/README.md`） | Arranges the main application regions. |
| [`ui-sidebar/`]（原文链接目标：`ui-sidebar/README.md`） | Presents workspace and session navigation. |
| [`ui-brand-official/`]（原文链接目标：`ui-brand-official/README.md`） | Fills the generic browser-brand slots with the official name and marks. |
| [`ui-workspace/`]（原文链接目标：`ui-workspace/README.md`） | Provides workspace selection and creation surfaces. |
| [`ui-conversation/`]（原文链接目标：`ui-conversation/README.md`） | Presents the active conversation and its input surface. |
| [`ui-tool/`]（原文链接目标：`ui-tool/README.md`） | Composes Tool call trees and keyed per-Tool views. |
| [`ui-workflow-run/`]（原文链接目标：`ui-workflow-run/README.md`） | Replays durable workflow runs as nested Chat disclosures with live-only child navigation. |
| [`ui-goal/`]（原文链接目标：`ui-goal/README.md`） | Presents and manages the current goal. |
| [`ui-trajectory/`]（原文链接目标：`ui-trajectory/README.md`） | Presents alternate views of agent activity. |
| [`ui-commands/`]（原文链接目标：`ui-commands/README.md`） | Provides session-aware command discovery and dispatch. |
| [`ui-input-trigger/`]（原文链接目标：`ui-input-trigger/README.md`） | Coordinates inline command and reference suggestions. |
| [`ui-skill/`]（原文链接目标：`ui-skill/README.md`） | Adds skill references to inline suggestions. |
| [`ui-reference/`]（原文链接目标：`ui-reference/README.md`） | Unified Web `@file` / `@session` reference source. |
| [`ui-subagent/`]（原文链接目标：`ui-subagent/README.md`） | Provides subagent navigation, child transcript states, and inline references. |
| [`ui-jobs/`]（原文链接目标：`ui-jobs/README.md`） | Lists this session's background jobs in the conversation header. |
| [`ui-model-selection/`]（原文链接目标：`ui-model-selection/README.md`） | Provides model selection in conversation surfaces. |
| [`ui-permission/`]（原文链接目标：`ui-permission-presets/README.md`） | Configures default permissions and switches the current session's access. |
| [`ui-plan/`]（原文链接目标：`ui-plan/README.md`） | Presents active plan-mode status and its exit control. |
| [`ui-settings-plugins/`]（原文链接目标：`ui-settings-plugins/README.md`） | Owns the Plugins settings section, its tab extension point, and configurable host-plane plugin cards. |
| [`ui-user-questions/`]（原文链接目标：`ui-user-questions/README.md`） | Presents interactive questions requested by the agent. |
| [`ui-agent-preset/`]（原文链接目标：`ui-agent-preset/README.md`） | Selects a session's agent preset and authors preset compositions. |
| [`ui-settings/`]（原文链接目标：`ui-settings/README.md`） | Hosts the settings interface and its extension areas. |
| [`ui-settings-general/`]（原文链接目标：`ui-settings-general/README.md`） | Provides the general settings section. |
| [`ui-settings-models/`]（原文链接目标：`ui-settings-models/README.md`） | Provides model-provider configuration and DeepSeek onboarding. |
| [`ui-settings-plugin-inventory/`]（原文链接目标：`ui-settings-plugin-inventory/README.md`） | Contributes the read-only Host Loader inventory tab to Plugins settings. |

Each child reference owns its contract and detailed behavior. The [slot system standard]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md`） and [web client architecture note]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md`） own the cross-package composition and loading decisions.

The subsystem reference is [client-modules.md]（原文链接目标：`../../docs/subsystems/client-modules.md`）; the [slot system standard]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md`） is the definitive slot model, and the [web client architecture note]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md`） owns the loading chain and object layer.
