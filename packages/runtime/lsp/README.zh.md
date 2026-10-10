# lsp 包族

<a id="family-lsp"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义语言服务协议能力，提供 stdio 接入和模型可调用工具。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-lsp`](#pkg-taskweaver-dsh-lsp) | `lsp/lsp` | [接口与限制](#pkg-taskweaver-dsh-lsp) |
| [`@taskweaver/dsh-lsp-stdio`](#pkg-taskweaver-dsh-lsp-stdio) | `lsp/lsp-stdio` | [接口与限制](#pkg-taskweaver-dsh-lsp-stdio) |
| [`@taskweaver/dsh-tool-lsp`](#pkg-taskweaver-dsh-tool-lsp) | `lsp/tool-lsp` | [接口与限制](#pkg-taskweaver-dsh-tool-lsp) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-lsp"></a>
### `@taskweaver/dsh-lsp`

<!-- migrated-from: packages/runtime/lsp/lsp/README.md -->
目录：`lsp/lsp`。
package.json 描述：Abstract LSP capability seam (ctx.lsp) for the DeepSeek Harness — language-server provider registry keyed by branded id and extension mapping, order-independent per-query selection, normalized definition/references/implementation/hover requests and results, and the LspError taxonomy

<a id="pkg-taskweaver-dsh-lsp--taskweaver-dsh-lsp"></a>
The **LSP capability seam**: an abstract `LspService` (`ctx.lsp`) defining WHAT semantic code navigation the harness has — go to definition, find references, find implementations, hover — over language-server providers, without binding the model contract to local subprocesses.

This package owns the Service Definition role of the LSP capability:

| Package | Role |
|---|---|
| `@taskweaver/dsh-lsp` (this) | Service Definition: the service, provider registry keyed by branded id + extension mapping, per-query selection, request/result vocabulary, the `LspError` taxonomy |
| `@taskweaver/dsh-lsp-stdio` | Service Provider: a generic local backend that registers configured stdio language-server providers |
| `@taskweaver/dsh-tool-lsp` | Consumer: the model-facing `lsp` tool over `ctx.lsp` |

The seam exposes exactly four semantic operations — `goToDefinition`, `findReferences`, `goToImplementation`, `hover` — and no generic JSON-RPC escape hatch, so no protocol payload or unreviewed command/mutation reaches a provider through `ctx.lsp`.

<a id="pkg-taskweaver-dsh-lsp--service-api-ctx-lsp"></a>
#### Service API (`ctx.lsp`)

| Member | Semantics |
|---|---|
| `registerProvider(provider)` | Register a backend, atomically reserving its branded `id` and every normalized file extension. Any invalid input or conflict publishes nothing and throws `LspError` (`LSP_INVALID_PROVIDER` / `LSP_CONFLICT`). Returns a disposer releasing all reservations. Disposed with the calling fiber. |
| `query(request, signal?)` | Select the provider by the file's final extension, derive the `languageId` from that provider's mapping, and run one query. No match throws `LspError` `LSP_UNAVAILABLE`. |

Selection is per query and order-independent: a provider owns a set of extensions exclusively, so registration and HMR order never change routing. Extension keys normalize to lowercase, leading-dot form; the `languageId` only synchronizes the transient document, never participates in selection. The first version has no glob, language-id, or explicit route selector.

Providers register **capabilities**, not tools. `dsh-tool-lsp` is the only owner of the model-facing name, description, prompt guidance, schema, and presentation.

<a id="pkg-taskweaver-dsh-lsp--vocabulary"></a>
#### Vocabulary

`LspQueryRequest` (`operation`, `filePath`, `position`, `workspaceRoot`) — every field required, so no field needs implementation defaulting and there is no `resolve()` step. Positions and ranges are zero-based UTF-16, matching the protocol; the tool owns the one-based cursor convention. `findReferences` always includes declarations — providers enforce this internally, so callers get no flag. `LspQueryResult` is a CLOSED discriminated union: `{ kind: 'locations'; locations; resolvedWorkspaceUri }` for navigation, `{ kind: 'hover'; hover }` for hover (content or `null`) — consumers `switch` to exhaustiveness so a new arm breaks compilation until handled. `resolvedWorkspaceUri` is the provider's canonical workspace `file:` URI; callers relativize location URIs against it instead of applying host-platform path rules to the possibly symlinked request root. See `src/types.ts` for the full contracts and `src/index.ts` for the `LspError` codes, including `LSP_DISPOSED` and `LSP_MALFORMED_RESPONSE`.

<a id="pkg-taskweaver-dsh-lsp--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-tool-lsp`, which owns the model-facing `lsp` schema, prompt, and rendered results while this registry contributes no prompt or schema itself.

<a id="pkg-taskweaver-dsh-lsp--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; `dsh-tool-lsp` owns request-prefix changes.

<a id="pkg-taskweaver-dsh-lsp--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Exclusive extension ownership within one runtime** — two providers cannot both claim `.ts`, even with different language ids; overlaps fail registration. The intended extension is a deployment-configured selector above registrations, which can relax exclusive reservation without adding provider choice to model input ([seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md`）).
- **Four operations only** — symbols and call hierarchy are deferred (they need different schemas); diagnostics need separate freshness/accumulation rules; mutations (rename, code actions, formatting) require separate tools with preview, permission, and write-policy integration.
- **No observation API** — availability is observed only by running `query()` and routing the thrown `LspError` codes; there is no provider-change event or capability-status query.

<a id="pkg-taskweaver-dsh-lsp-stdio"></a>
### `@taskweaver/dsh-lsp-stdio`

<!-- migrated-from: packages/runtime/lsp/lsp-stdio/README.md -->
目录：`lsp/lsp-stdio`。
package.json 描述：Generic stdio language-server provider for the DeepSeek Harness LSP capability seam (ctx.lsp) — spawns configured servers, translates JSON-RPC, and serves transient-open goToDefinition/findReferences/goToImplementation/hover queries in the host filesystem namespace

<a id="pkg-taskweaver-dsh-lsp-stdio--taskweaver-dsh-lsp-stdio"></a>
A **generic stdio language-server backend** for `ctx.lsp`. One plugin instance accepts a named server table and registers one isolated provider per entry. It reads through `ctx.fs` and launches through `ctx.subprocess`, so the server and source always inhabit the mounted execution world. This is a generic host, not a language-server catalog or installer — deployments configure commands and mappings explicitly; presets belong in `cordis.yml` overlays.

Namespace plugin (`name` / `inject` / `Config` / `apply`, no default export).

<a id="pkg-taskweaver-dsh-lsp-stdio--what-it-does"></a>
#### What it does

- Resolves every server-local setting before registration; an invalid mapping or registration conflict rolls back earlier entries, so a failed load leaves no provider routes.
- Lazily single-flights one server process per `(server id, canonical workspace target)`. A live server error is not replayed; if the selected pooled transport fails before or during a read-only query, the provider awaits its disposal and retries that query once on a fresh process.
- Uses a compatibility-first **transient-open** sequence per query: resolve and byte-bound the source while streaming it through `ctx.fs`, `textDocument/didOpen` (version 1, full text), the requested request, then `textDocument/didClose` in `finally`. A failed or canceled `didOpen` write terminates the instance before the pool can reuse it. Documents close after each call, so the first version needs no `didChange`, content cache, or document LRU.
- Serializes each source-read/open/query/close lifecycle through one abortable per-workspace queue so queued calls read current source only when their turn starts; distinct workspaces run in parallel. Provider disposal aborts filesystem and protocol work, awaits workspace lookups that have not entered a queue, then drains every queue and server.
- After protocol shutdown fails, terminates the server's descendant tree through the subprocess seam (POSIX process-group signaling; Windows `taskkill /T /F`). Tree-kill delivery is contained like every group signal — it races server exit — and quiescence is confirmed by the handle's tree-liveness wait rather than by the kill's own outcome.
- Resolves the server executable, cwd, process, and protocol streams through `ctx.subprocess`; `initialize.processId` is `null` because another machine or PID namespace must not monitor the harness process.
- Uses `ctx.fs` canonical containment, file URIs, and streamed text validation, but emits no `fs/observed`: only the LSP result is model-visible, so a query does not satisfy read-before-write policy.

<a id="pkg-taskweaver-dsh-lsp-stdio--configuration"></a>
#### Configuration

The `servers` record key is the stable provider id reserved on `ctx.lsp`; each value has this shape:

| Server key | Default | Meaning |
|---|---|---|
| `command` | (required) | Executable to spawn — absolute, or resolved on the child PATH at load. Launch uses no shell. |
| `args` | `[]` | Arguments passed to the executable. |
| `env` | `{}` | Extra env merged on top of the credential-scrubbed ambient env (vars matching `KEY`/`PASSWORD`/`SECRET`/`TOKEN` are not forwarded); an explicit `TASKWEAVER_*` entry merges after the seam's scrub of ambient ones. |
| `extensionToLanguage` | (required) | Lowercase leading-dot extension → LSP language id (e.g. `{ '.ts': 'typescript' }`). |
| `initializationOptions` | `null` | Static `initialize` options forwarded to the server. |
| `configuration` | `null` | Static answer to every `workspace/configuration` item. |
| `maxMessageBytes` | `16000000` | Largest single framed message accepted from the server. |
| `maxStderrBytes` | `1000000` | Largest stderr tail retained for diagnostics. |
| `maxDocumentBytes` | `4000000` | Largest source file this host will open. |
| `shutdownTimeoutMs` | `5000` | Graceful `shutdown`/`exit` budget before escalation. |
| `killGraceMs` | `2000` | Grace for request cancellation and for SIGTERM→SIGKILL escalation. |

`servers` must contain at least one entry, and every id must be non-empty. Timer budgets must be positive integers no greater than Node's `2_147_483_647` ms timer limit. All executables resolve at load after credential scrubbing; a bad later entry prevents every provider from registering. Processes launch lazily on the first matching query.

<a id="pkg-taskweaver-dsh-lsp-stdio--protocol-behavior"></a>
#### Protocol behavior

Initialization advertises `general.positionEncodings: ['utf-16']`, `workspace: { workspaceFolders: true, configuration: true }`, `textDocument.hover.contentFormat: ['markdown', 'plaintext']`, and `linkSupport: true` for definition and implementation, with no dynamic registration. The server's returned capabilities are authoritative: an unsupported operation, or synchronization without transient open/close, fails the query. An omitted server `positionEncoding` defaults to `utf-16`; any other value is a protocol error. The client answers `workspace/configuration` from static config, accepts lifecycle bookkeeping requests, and rejects `workspace/applyEdit` — it never applies edits or runs commands. Navigation maps `Location` directly and `LocationLink` from `targetUri` + `targetSelectionRange`; hover normalization takes valid `MarkupContent.value`, preserves string `MarkedString`s, renders language-tagged values as fenced code, and joins arrays with one blank line. Missing results, malformed ranges or positions, and malformed hover encodings fail as structured `LSP_MALFORMED_RESPONSE` errors.

<a id="pkg-taskweaver-dsh-lsp-stdio--security-boundary"></a>
#### Security boundary

The provider trusts its configured server and claims no sandbox confinement. It delegates canonical identity, containment, regular-file streaming, UTF-8 validation, and file-URI encoding to `ctx.fs`; it rejects missing, non-regular, non-UTF-8, oversized, or canonically out-of-workspace query sources before server startup. Containment is evaluated before the stream opens and does not promise stable-handle identity across concurrent path replacement. Result locations may be external, but an external path cannot become a query source. A deployment must mount filesystem and subprocess providers for the same execution world; split-world composition is invalid.

<a id="pkg-taskweaver-dsh-lsp-stdio--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-tool-lsp`, which surfaces this provider's normalized results; this host contributes no prompt or schema itself.

<a id="pkg-taskweaver-dsh-lsp-stdio--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; `dsh-tool-lsp` owns request-prefix changes.

<a id="pkg-taskweaver-dsh-lsp-stdio--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No confinement policy** — this package trusts the configured server and does not sandbox its process; a restricted deployment must supply appropriate process/filesystem providers or a same-world sandbox wrapper.
- **Transient-open compatibility floor** — servers whose synchronization omits open/close (or advertise `None`) are unsupported even if closed-document queries would work; the pinned TypeScript e2e establishes one compatibility floor, not a cross-language claim.
- **Per-server/workspace serialization latency** — parallel agents sharing one server and workspace queue behind one process; long-lived workspace processes consume memory until disposal.
- **A hard-killed harness orphans language servers** — `initialize.processId: null` removes server-side client-PID monitoring, so servers are cleaned only by graceful service disposal; a SIGKILL'd harness leaves them running until they exit on their own.

<a id="pkg-taskweaver-dsh-tool-lsp"></a>
### `@taskweaver/dsh-tool-lsp`

<!-- migrated-from: packages/runtime/lsp/tool-lsp/README.md -->
目录：`lsp/tool-lsp`。
package.json 描述：Model-facing lsp tool over the DeepSeek Harness LSP capability seam (ctx.lsp) — one read-only tool with goToDefinition/findReferences/goToImplementation/hover operations, one-based UTF-16 cursor coordinates, bounded location rendering, and hover normalization

<a id="pkg-taskweaver-dsh-tool-lsp--taskweaver-dsh-tool-lsp"></a>
The model-facing **`lsp` tool** over `ctx.lsp`: one read-only tool with four operations for precise code navigation. It owns the model schema, prompt guidance, coordinate conversion, result limits and formatting, and UI presentation; it imports no provider.

Namespace plugin (`name` / `inject` / `Config` / `apply`, no default export). Injects `tools`, `lsp`, and `systemPrompt`.

<a id="pkg-taskweaver-dsh-tool-lsp--the-tool"></a>
#### The tool

`lsp` accepts `operation` (`goToDefinition` | `findReferences` | `goToImplementation` | `hover`), `file_path`, `line`, and `character`. `line` and `character` are positive, one-based UTF-16 cursor coordinates; the tool converts them to the seam's zero-based positions and converts rendered locations back. `findReferences` includes declarations so impact analysis does not omit the defining site. Provider, language id, workspace root, limits, timeout, initialization, and executable stay outside model input.

The tool requires the workspace root from the session `header.cwd`, with no fallback: absence fails as `LSP_WORKSPACE_REQUIRED` before querying. Its canonical result is the complete normalized Service Definition union: `{ kind: "locations", locations, resolvedWorkspaceUri }` or `{ kind: "hover", hover }`; Code Mode can inspect every acquired location and zero-based range directly. Native rendering projects stable, file-grouped `path:line:character` entries against the provider's canonical workspace URI rather than applying host-platform path rules to the session cwd. A `file:` URI becomes a workspace-relative path inside that URI or a URI-derived absolute path outside it; malformed and non-`file:` URIs stay verbatim. Empty locations and `null` hover are successful no-result responses; malformed provider payloads remain structured errors.

<a id="pkg-taskweaver-dsh-tool-lsp--configuration"></a>
#### Configuration

| Key | Default | Meaning |
|---|---|---|
| `maxLocations` | `100` | Largest number of rendered locations before an omission marker. |
| `maxResultChars` | `16000` | Largest complete rendered result, including truncation metadata. |
| `timeoutMs` | `60000` | Tool-call timeout budget, enforced by `dsh-tool-call-timeout-policy`; covers the complete queued open/query/close lifecycle and is not model-configurable. |

<a id="pkg-taskweaver-dsh-tool-lsp--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-lsp--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-tool-lsp--what-the-model-sees"></a>
###### What the model sees

One system-prompt section (order 112) positions LSP as a precision aid with the following text:

<a id="pkg-taskweaver-dsh-tool-lsp--verbatim-guidance"></a>
###### Verbatim guidance

```markdown
Use search/read for ordinary navigation. Use lsp when textual matches are ambiguous or before a change requires precise definitions, implementations, or references. Positions are one-based line and character (UTF-16) at the cursor; an off-symbol position may return no results. findReferences always includes the declaration.
```

<a id="pkg-taskweaver-dsh-tool-lsp--token-effect"></a>
###### Token effect

Fixed guidance cost on every request while the plugin is active.

<a id="pkg-taskweaver-dsh-tool-lsp--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the plugin scope and guidance text are unchanged; activation or disposal may invalidate reuse from this section.

<a id="pkg-taskweaver-dsh-tool-lsp--tool-schema"></a>
##### Tool schema

<a id="pkg-taskweaver-dsh-tool-lsp--what-the-model-sees-1"></a>
###### What the model sees

The model sees the generated [`lsp` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-lsp`）.

<a id="pkg-taskweaver-dsh-tool-lsp--token-effect-1"></a>
###### Token effect

Fixed schema cost on every request while enabled; the `timeoutMs` budget is never sent to the model.

<a id="pkg-taskweaver-dsh-tool-lsp--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while the visible tool definition and order are unchanged; registration lifecycle or scoped restrictions may invalidate reuse from the first changed schema token.

<a id="pkg-taskweaver-dsh-tool-lsp--results"></a>
##### Results

<a id="pkg-taskweaver-dsh-tool-lsp--what-the-model-sees-2"></a>
###### What the model sees

File-grouped `path:line:character` location lines or normalized hover text, capped first by `maxLocations` and then by `maxResultChars`; omission and truncation markers are included inside the complete character cap. These caps affect only Native/model presentation, not the canonical value. Empty results use distinct `No results.` / `No hover information.` lines.

<a id="pkg-taskweaver-dsh-tool-lsp--token-effect-2"></a>
###### Token effect

Capped per tool result by `maxResultChars`, with `maxLocations` additionally bounding navigation item count.

<a id="pkg-taskweaver-dsh-tool-lsp--kv-cache-effect-2"></a>
###### KV Cache effect

Tool results append after the cached request prefix and do not directly invalidate it.

<a id="pkg-taskweaver-dsh-tool-lsp--ui-presentation"></a>
##### UI presentation

<a id="pkg-taskweaver-dsh-tool-lsp--what-the-model-sees-3"></a>
###### What the model sees

Nothing. The client renders a generic search card — `{ card: 'generic', kind: 'search', title, locations: [{ path, line }] }` — whose args-derived title carries the operation and one-based cursor; follow-along focuses the queried line while the title preserves the column.

<a id="pkg-taskweaver-dsh-tool-lsp--token-effect-3"></a>
###### Token effect

Zero direct token effect because rendering is client-side only.

<a id="pkg-taskweaver-dsh-tool-lsp--kv-cache-effect-3"></a>
###### KV Cache effect

None; UI presentation is outside the model request.

<a id="pkg-taskweaver-dsh-tool-lsp--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **UTF-16 cursor coordinates** — columns are exact for the protocol but hard for a model to count around non-BMP characters; an off-symbol position may return empty results, so the prompt explains the convention without encouraging broad LSP use ([seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md`）).
- **No cross-server completeness promise** — supported servers may return empty or partial results depending on indexing readiness; the tool promises no completeness across languages or servers.

<a id="family-lsp"></a>
### 原族级说明（迁移保留）

<a id="family-lsp--lsp-lsp-capability-family"></a>
The language-server capability seam: an LSP Service Definition, a generic stdio provider, and the model-facing `lsp` tool. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| `lsp/` | Service Definition (provider registry by branded id + extension mapping, per-query selection, vocabulary, `LspError`) | `ctx.lsp` |
| `lsp-stdio/` | Generic multi-server stdio backend over `ctx.fs` and `ctx.subprocess` (JSON-RPC, transient-open queries) | (registers providers on `ctx.lsp`) |
| `tool-lsp/` | Model-facing `lsp` tool (four operations, one-based UTF-16 cursor coordinates) | (registers on `ctx.tools`) |

The Service Definition lives at `lsp/lsp/`. The seam exposes exactly four semantic operations — `goToDefinition`, `findReferences`, `goToImplementation`, `hover` — and no generic JSON-RPC escape hatch, so a provider swap does not change how the model asks for navigation and no protocol payload or unreviewed mutation reaches the model contract. Providers register **capabilities**, not tools; `tool-lsp` is the only owner of the model-facing name, schema, prompt guidance, and presentation.

See the [LSP capability seam Agent Note]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md`） for the design rationale, including why documents open transiently per query, why the stdio host consumes the shared filesystem/subprocess execution world, and why extension ownership is exclusive within one runtime.

The subsystem reference — operations, coordinates, requests/results, `LspError` — is [docs/subsystems/lsp.md]（原文链接目标：`../../docs/subsystems/lsp.md`）; design rationale in the [LSP capability seam Agent Note]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md`）.
