# session-query 包族

<a id="family-session-query"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

对实时和持久化会话日志执行受授权、受限额的检索。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-session-log-export`](#pkg-taskweaver-dsh-session-log-export) | `session-query/session-log-export` | [接口与限制](#pkg-taskweaver-dsh-session-log-export) |
| [`@taskweaver/dsh-session-query`](#pkg-taskweaver-dsh-session-query) | `session-query/session-query` | [接口与限制](#pkg-taskweaver-dsh-session-query) |
| [`@taskweaver/dsh-session-query-sqlite`](#pkg-taskweaver-dsh-session-query-sqlite) | `session-query/session-query-sqlite` | [接口与限制](#pkg-taskweaver-dsh-session-query-sqlite) |
| [`@taskweaver/dsh-tool-session-query`](#pkg-taskweaver-dsh-tool-session-query) | `session-query/tool-session-query` | [接口与限制](#pkg-taskweaver-dsh-tool-session-query) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-session-log-export"></a>
### `@taskweaver/dsh-session-log-export`

<!-- migrated-from: packages/runtime/session-query/session-log-export/README.md -->
目录：`session-query/session-log-export`。
package.json 描述：Host command for exporting a Session log through the ApiProxy endpoint

<a id="pkg-taskweaver-dsh-session-log-export--taskweaver-dsh-session-log-export"></a>
This package registers the Host `/export` command for Session-log downloads. It owns no browser slot, button, dialog, or client bundle. The ZIP stream and `GET /api/session.export?sessionId=<id>&includeDescendants=true` endpoint remain owned by `dsh-host-apiproxy`.

<a id="pkg-taskweaver-dsh-session-log-export--command-contract"></a>
#### Command contract

| Input | Result |
|---|---|
| `/export` | Returns a successful `Session log download requested.` command result. |
| `/export <path>` | Returns an error because the Host command does not accept a filesystem path. |

The command is registered in the command plane and is excluded from model history. Package tests verify command registration, execution, and disposal through a direct Cordis context and a real Loader composition.

<a id="pkg-taskweaver-dsh-session-log-export--composition"></a>
#### Composition

```yaml
- id: session-log-download
  name: '@taskweaver/dsh-session-log-export'
```

Compose it with `dsh-commands` and `dsh-host-apiproxy`. The package contributes only the Host command. The Host endpoint flushes a live root Session before reading its persisted event artifact, then streams the ZIP without buffering it in the Host command package.

<a id="pkg-taskweaver-dsh-session-log-export--model-experience"></a>
#### Model experience

The command is a human control, creates no model turn, and has no token or KV-cache effect.

<a id="pkg-taskweaver-dsh-session-log-export--limitations"></a>
#### Limitations

- Export requires a persistence backend that exposes a raw Session artifact. The shipped JSONL backend supports plaintext and zstd artifacts; SQLite export is not included.
- The command does not write to a Host path. It reports that a download was requested; transport and destination handling belong to the endpoint consumer.
- Errors discovered after ZIP streaming begins are handled by the HTTP consumer.

<a id="pkg-taskweaver-dsh-session-query"></a>
### `@taskweaver/dsh-session-query`

<!-- migrated-from: packages/runtime/session-query/session-query/README.md -->
目录：`session-query/session-query`。
package.json 描述：Combined session query service contract with concrete reads, traces, and filters

<a id="pkg-taskweaver-dsh-session-query--taskweaver-dsh-session-query"></a>
`SessionQueryEngine` is the combined abstract `ctx.sessionQuery` contract. It implements exact session-history retrieval, relationship tracing, and provider-independent filtering over live `ctx.sessions` plus optional dynamically mounted `ctx.sessionPersistence`; concrete backends implement its two full-text methods. Matching ids produce one record: live events win, while `live` and `persisted` report both source availabilities. Conflicting immutable headers fail with `SESSION_QUERY_SOURCE_CONFLICT`.

<a id="pkg-taskweaver-dsh-session-query--reads"></a>
#### Reads

- `listSessions(signal?)` reads current persistence metadata, merges live records with live precedence, and returns cloned records in deterministic newest-first order.
- `readSession(sessionId)` returns one complete detached raw log after the same core replay validation used by resume; it never enters the session into the live store.
- `filterSessions(filters, signal?)` applies provider-independent session metadata and availability predicates to that same cloned logical corpus.
- `filterEvents(sessionId, filters)` extracts first-party semantic documents and applies provider-independent metadata and literal-text predicates in ascending seq order.
- `readTitleSnapshots(sessionIds, signal?)` resolves unique ids from one live-preferred corpus observation, passes cancellation through persisted listing and inspection, and returns ordered per-session settlements so one missing or malformed title source does not discard its peers. Each live source is folded directly, and each persisted worker folds to a detached header/title result and releases the full log before dequeuing another id. Cancellation rejects the whole batch. `readTitleSnapshot(sessionId, signal?)` is the one-observation view; `readTitle(sessionId, signal?)` returns only its optional folded `session/title`.
- `listEvents(sessionId)` loads the live-preferred raw log and classifies each event as `current`, `shadowed`, or `log-only` with the shared `dsh-session` surface fold.
- `readSurface(sessionId)` returns one cloned header, raw-log capture boundary, and the complete folded current surface in model-history order. A live session wins over persistence; compaction is observed before or after its replacement append, never as a synthetic mixture.
- `readEvent(request, signal?)` returns a cloned header, the full target event, and a bounded raw-seq window. `before` and `after` default to zero and may not exceed `readWindowMax`.
- `traceSession(sessionId, signal?)` reads the corpus once and returns immediate-to-outward ancestors plus deterministic recursive descendant trees. `complete: false` identifies the first missing parent; a target-connected cycle fails with `SESSION_QUERY_INVALID_LINEAGE`.
- `traceEvent(request, signal?)` loads the logical log once and returns its cloned source header with direct positional replacements and direct cited source-event links. `replacementChain` follows positional replacers to the final replacement; source-event links remain non-transitive.

Persistence is optional and may mount or unmount dynamically. Cross-corpus listing and lineage tracing fail with `SESSION_QUERY_PERSISTENCE_FAILED` while mounted persistence is unreadable; a successfully read durable record that fails Session validation reports `SESSION_QUERY_CORRUPT_SESSION` instead. A title read, event trace, or event read targeting a known live session does not consult persistence, so durable backend health cannot make current in-memory state unreadable. Persisted title and event operations list before loading and reject a metadata mismatch rather than combining inconsistent observations. Lineage-trace cancellation is passed to persisted listing; event-trace and event-read cancellation is passed to persisted listing and inspection. Each waits for the started backend call to settle, then rejects with the signal's exact reason even when the backend ignored that signal. A pre-aborted known-live title read, event trace, or event read rejects before folding or snapshotting without consulting persistence. A batch title observation performs one metadata listing, inspects its unique persisted ids with at most `persistedInspectConcurrency` workers, and preserves each title's own observed header for downstream authorization. Cancellation starts no queued inspections and rejects only after already-started workers settle. `listSessions()` remains lightweight and does not load logs or index titles.

<a id="pkg-taskweaver-dsh-session-query--filtering-and-extraction"></a>
#### Filtering and extraction

`SessionResultFilter` covers id, nullable cwd, created-at range, nullable parent, and source availability. `SessionEventResultFilter` covers seq/time ranges, event type, surface, and semantic text. Filter arrays are ANDed; values within one list clause are ORed. Empty list values match nothing, ranges are inclusive, and malformed ranges or closed-union values fail with `SESSION_QUERY_INVALID_FILTER`.

The text clause is deliberately independent of FTS providers: caller text is escaped into a Unicode, case-insensitive regular expression, and each whitespace run matches one or more whitespace characters. It is a literal semantic-text scan, not a full-text query. `extractSessionEventText()` and `buildSessionEventSearchDocuments()` define the shared first-party document projection; reasoning blocks, structural boundaries, stream chunks, request headers, and unknown declaration-merged variants produce no document.

<a id="pkg-taskweaver-dsh-session-query--full-text-methods"></a>
#### Full-text methods

`SessionQueryEngine.searchSessions(request, exec?)` groups the logical corpus by strongest matching event; `searchEvents(request, exec?)` searches one logical session. These are the service's only abstract methods. Both return pages whose continuation is an owned branded `SessionSearchCursor`, accept optional cancellation, and expose snippets without provider-specific numeric scores. An event-search page also carries the cloned target header from the same indexed generation as its hits, allowing authorization consumers to bind policy to the payload observation. Search requests accept only metadata event filters, because literal-text filtering is the scan path described above.

The package has no provider coordinator, fallback implementation, or standalone concrete plugin. A concrete service backend inherits the implemented reads, filters, and traces while owning full-text observation, reconciliation, ranking, cursor generations, and query execution; the first implementation is [`@taskweaver/dsh-session-query-sqlite`](./README.zh.md#pkg-taskweaver-dsh-session-query-sqlite).

`SessionQueryError.code` is a closed union covering request validation, missing targets, malformed surfaces, source conflicts, persistence/index failures, cancellation, and invalid or stale cursors; the exact literals are defined in [`src/config.ts`](./session-query/src/config.ts).

`listEvents()`, `readSurface()`, and `traceEvent()` run the same one-pass `dsh-session` surface fold. A loaded log is valid only when event seqs are zero-based and contiguous, surface markers obey event-type eligibility, source-event arrays are nonempty and duplicate-free, references name earlier events, and each positional replacement names and cites every surface node it removes; every violation fails with `SESSION_QUERY_INVALID_SURFACE`.

<a id="pkg-taskweaver-dsh-session-query--configuration"></a>
#### Configuration

| Key | Default | Contract |
|---|---:|---|
| `readWindowMax` | `50` | Maximum `before` or `after` raw-event count. |
| `persistedInspectConcurrency` | `4` | Maximum concurrent persisted-log inspections in one batch read; must be a positive safe integer. |

<a id="pkg-taskweaver-dsh-session-query--model-experience"></a>
#### Model Experience

None, as this trusted query service returns cloned session records only to its callers and registers no model-facing prompt, schema, tool, or message.

<a id="pkg-taskweaver-dsh-session-query--kv-cache-effect"></a>
###### KV Cache effect

None; this package neither assembles nor sends a provider request.

<a id="pkg-taskweaver-dsh-session-query--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No caller authorization** — this is trusted context-wide infrastructure; a future model tool or UI must constrain which sessions its caller may inspect.
- **No registries or model-facing tool** — extractor and search-provider registries, recursive traversal through cited source events, and a model-facing tool are absent. The [tracing decision]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-13-session-query-tracing.md`） owns relationship semantics; SQLite ownership and tokenizer decisions live in the [implemented search note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-10-sqlite-session-query-provider.md`）.

<a id="pkg-taskweaver-dsh-session-query-sqlite"></a>
### `@taskweaver/dsh-session-query-sqlite`

<!-- migrated-from: packages/runtime/session-query/session-query-sqlite/README.md -->
目录：`session-query/session-query-sqlite`。
package.json 描述：Concrete ctx.sessionQuery backend with SQLite FTS5 search

<a id="pkg-taskweaver-dsh-session-query-sqlite--taskweaver-dsh-session-query-sqlite"></a>
Concrete `ctx.sessionQuery` provider. `SqliteSessionQueryEngine` inherits exact reads, traces, and provider-independent filters from the Service Definition package and implements its two full-text methods with SQLite FTS5. Search uses the live-preferred logical session corpus and groups cross-session results by their strongest event.

<a id="pkg-taskweaver-dsh-session-query-sqlite--search-contract"></a>
#### Search contract

`searchSessions(request, exec?)` returns `SessionSearchHit` pages across the corpus; `searchEvents(request, exec?)` returns `SessionEventSearchHit` pages within one session. Queries are required, trimmed, whitespace-normalized literal phrases. FTS5 syntax such as quotes, `OR`, `NEAR`, and `*` is treated as data rather than executable MATCH syntax. Queries of fewer than three Unicode code points use an escaped literal `LIKE` search because the trigram tokenizer has no shorter token. Metadata filters are parameterized SQL predicates applied before ranking. To keep SQLite FTS5 MATCH in a supported outer-predicate context, cross-session requests may compile at most 14 combined session and event filter predicates; within-session requests may compile at most 13 filter predicates because the fixed target-session predicate consumes one slot. Each range endpoint compiles as one predicate. A request exceeding either predicate budget or SQLite's portable limit of 32,766 total bindings, including fixed query and pagination values, fails with `SESSION_QUERY_INVALID_FILTER` before statement preparation.

Relevance is source-comparable across persistent and TEMP tables: actual FTS5 highlighted-match span count descending, then stored document code-point length ascending. Event time, session id where applicable, and seq break remaining ties. Cross-session results expose the selected event as `bestMatch`; both scopes derive whitespace-normalized plain text from FTS5 highlight positions and bound it in Unicode code points. Cursors are opaque branded values, bind to the normalized request and service instance, and fail when the relevant generation changes. A within-session cursor survives unrelated-session changes; a cross-session cursor does not.

All three surfaces (`current`, `shadowed`, and `log-only`) are searchable by default. Pass a surface filter to narrow them.

<a id="pkg-taskweaver-dsh-session-query-sqlite--source-and-index-lifecycle"></a>
#### Source and index lifecycle

The service requires `ctx.sessions` and observes optional `ctx.sessionPersistence` dynamically. One serialized state machine compares source-qualified lightweight durable snapshot revisions, non-mutatingly inspects only new or changed logs, extracts shared semantic documents, reconciles changes transactionally, and runs the query. Session queries never invoke the persistence backend's crash-repairing `load()`; an owner attaching during inspection cannot mutate its log, and the stable-observation retry makes the result live-preferred. The TEMP live row still records persisted availability, and the durable base refreshes after that live owner detaches. Repeated queries and an unchanged same-store reopen perform no full durable-log inspection; switching stores, or observing new, changed, deleted, or externally load-repaired sources, reconciles on the next stable observation. Source or transaction failure commits nothing, and the next search retries.

`openAt: startup` is the default: service activation imports `node:sqlite`, opens the handle, and fails before publication when the index is invalid. `openAt: first-search` publishes the service as ACTIVE without importing the SQLite module or opening a handle; the first concurrent searches share one readiness promise, and disposal before any search opens nothing. This mode supports compositions that need clean Node 22 startup output by deferring SQLite's experimental warning until the first actual search; it does not suppress a warning at that point. An invalid database likewise fails the first search instead of service activation. `openAt: never` turns full-text search off for the deployment: `searchSessions` and `searchEvents` fail with `SESSION_QUERY_SEARCH_DISABLED` before any request normalization, node:sqlite is never imported or opened, and no source observation or reconciliation runs, while every inherited exact read, filter, and trace on `ctx.sessionQuery` keeps working.

Persisted FTS rows live in a dedicated derived database. Connection-local TEMP tables hold live rows, which shadow the durable base for the same session and reveal it when the live owner disappears. Unmounting persistence hides durable rows without discarding the cache; remounting reconciles it. Closing or reopening the database drops every live overlay while retaining persisted rows.

The database is disposable but reset is guarded: every recognized schema version rejects unknown user tables before mutating journal mode, and only a recognized incompatible schema containing derived tables rebuilds in place. An unrelated or canonical database is refused. Never point `path` at the session-persistence database. On filesystems with POSIX modes, missing directories and databases are created owner-only (`0700` and `0600` before the process umask), and SQLite sidecars inherit the database mode; existing modes are preserved. Exactly one service in one process owns a derived-index path; external writers or a second process are unsupported because generations and TEMP shadow state are connection-owned.

<a id="pkg-taskweaver-dsh-session-query-sqlite--configuration"></a>
#### Configuration

| Key | Default | Contract |
|---|---:|---|
| `path` | required | Dedicated derived-index SQLite path; `:memory:` is supported. Missing filesystem paths are created owner-only on POSIX filesystems. |
| `openAt` | `startup` | `startup` opens before service activation completes; `first-search` defers the SQLite module and handle until search; `never` disables full-text search (typed `SESSION_QUERY_SEARCH_DISABLED` failures) while inherited reads stay available. |
| `journalMode` | `wal` | `wal`, `delete`, `truncate`, or `persist`. |
| `defaultLimit` | `20` | Page size when a request omits `limit`; at most `Number.MAX_SAFE_INTEGER - 1`. |
| `maxLimit` | `100` | Largest accepted request page size; at most `Number.MAX_SAFE_INTEGER - 1`. |
| `snippetChars` | `240` | Maximum snippet length in Unicode code points. |
| `readWindowMax` | `50` | Maximum `before` or `after` raw-event count for inherited `readEvent()`. |
| `persistedInspectConcurrency` | `4` | Maximum concurrent persisted-log inspections for inherited batch reads; must be a positive safe integer. |

<a id="pkg-taskweaver-dsh-session-query-sqlite--tokenizer-and-limits"></a>
#### Tokenizer and limits

The index uses FTS5 `trigram remove_diacritics 1`, which supports Chinese, English, and mixed-language substring phrases while preserving the previous accent-insensitive match behavior. Queries under three Unicode code points use escaped literal `LIKE`. NUL is rejected in queries; reserved highlight markers and NUL in documents are normalized before indexing so presentation markers cannot collide with source text.

Abort signals stop queued work and flow unchanged through snapshot listing and non-mutating inspection. Once source work starts, the serialized state machine awaits that backend promise itself—even when a backend ignores cancellation—then checks the signal before starting any further listing, inspection, reconciliation, or query work. The caller therefore observes cancellation only after started backend work is quiescent, and a later search cannot enter the serializer while that cleanup is pending. Node's synchronous `DatabaseSync` API cannot interrupt a metadata or MATCH statement already executing on the JavaScript thread; signals are checked immediately before and after those non-preemptible calls.

<a id="pkg-taskweaver-dsh-session-query-sqlite--model-experience"></a>
#### Model Experience

None, as this trusted search backend returns hits only to callers and registers no model-facing prompt, schema, tool, or message.

<a id="pkg-taskweaver-dsh-session-query-sqlite--kv-cache-effect"></a>
###### KV Cache effect

None; this package neither assembles nor sends a provider request.

<a id="pkg-taskweaver-dsh-session-query-sqlite--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No caller authorization** — this is a trusted context-wide service; a model tool or UI must enforce its own access policy.
- **Synchronous query execution** — `DatabaseSync` blocks the JavaScript thread during MATCH execution and cannot interrupt a statement already running.
- **Short-query fallback cost** — one- and two-code-point queries use `LIKE` and scan the matching corpus; longer queries use the trigram index.
- **Single-owner derived index** — one service in one process must own each index path; external writers and multi-process sharing are unsupported.

<a id="pkg-taskweaver-dsh-tool-session-query"></a>
### `@taskweaver/dsh-tool-session-query`

<!-- migrated-from: packages/runtime/session-query/tool-session-query/README.md -->
目录：`session-query/tool-session-query`。
package.json 描述：Workspace-authorized model-facing session history search, trace, and event read tools

<a id="pkg-taskweaver-dsh-tool-session-query--taskweaver-dsh-tool-session-query"></a>
Workspace-authorized model tools over `ctx.sessionQuery`. The preset-scoped package depends only on the unified interface and registers `session_search`, `session_event_search`, `session_trace`, `session_event_trace`, and `session_event_read`; it is available to the shipped standard, code, and TaskWeaver presets without entering the global host tool registry.

<a id="pkg-taskweaver-dsh-tool-session-query--configuration"></a>
#### Configuration

| Key | Default | Meaning |
|---|---:|---|
| `maxSearchResults` | `30` | Maximum authorized non-self hits collected across internal provider pages |
| `searchTimeoutMs` | `30000` | Cooperative deadline attached to both full-text search tools |

The caller comes exclusively from `ToolExecution.exec.agent`. Cross-session access requires the same physical Git common directory, including linked worktrees. Outside Git, it requires the same physical workspace directory; a caller without `cwd` can inspect only itself. Search never exposes provider cursors, offsets, page sizes, or a model-controlled limit. Because one search consumes generation-bound provider cursors internally, both search tools execute exclusively with sibling tool calls; the three exact trace/read tools opt into parallel execution. Every exact executor passes its unchanged execution signal through authorization and the service trace/read, so cancellation waits for cooperative persistence cleanup and retains the signal's exact reason. Timestamps at the tool boundary require an explicit `Z` or numeric offset and become inclusive epoch-millisecond filters.

`session_search` always omits the caller session. Requested parent ids are deduplicated and checked against caller-workspace authority before FTS; only authorized ids reach the provider, while missing and cross-workspace guesses behave identically and the root marker remains independently ORed. A current-session `session_event_search` stops immediately before the step that invoked it, so the active assistant output and logged tool call cannot match themselves. Direct targets are authorized before trace, event, or title reads. Lineage output replaces unauthorized ancestor and descendant boundaries with markers that contain no hidden session id.

Every trusted `ctx.sessionQuery` call crosses one model-boundary sanitizer. Caller cancellation is checked first and preserved exactly. Available corpus and provider diagnostics, including safely inspectable nested causes, are logged internally on a best-effort basis; unprintable failures use a fixed log placeholder. Diagnostic formatting and error classification are independently guarded, so an unprintable cause cannot escape or prevent a safely classified outer error, while unsafe classification or logging falls back to the fixed `SESSION_QUERY_TOOL_FAILED` code and message. Local argument-validation and authorization errors retain their precise tool-owned messages.

The package deliberately performs no byte or character truncation and does not import a spill backend. Deployments that need bounded inline output mount `@taskweaver/dsh-spill-policy`, which can replace the rendered text after execution while retaining the complete result.

<a id="pkg-taskweaver-dsh-tool-session-query--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-session-query--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-tool-session-query--what-the-model-sees"></a>
###### What the model sees

The model receives one fixed prior-history guidance section.

<a id="pkg-taskweaver-dsh-tool-session-query--prior-history-guidance"></a>
###### Prior-history guidance

```markdown
Use session_search to find relevant work from prior sessions, or session_event_search to search earlier events in one session. Search results are cursor-free and workspace-scoped. Follow a useful hit with session_trace, session_event_trace, or session_event_read when you need lineage, relationships, or exact data.
```

<a id="pkg-taskweaver-dsh-tool-session-query--token-effect"></a>
###### Token effect

One fixed concise section is present on each request while the plugin is mounted.

<a id="pkg-taskweaver-dsh-tool-session-query--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the plugin and guidance text are unchanged.

<a id="pkg-taskweaver-dsh-tool-session-query--tool-schemas"></a>
##### Tool schemas

<a id="pkg-taskweaver-dsh-tool-session-query--what-the-model-sees-1"></a>
###### What the model sees

The model sees the generated [`session_search`, `session_event_search`, `session_trace`, `session_event_trace`, and `session_event_read` schemas]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-session-query`）. Search filters add fixed schema tokens, while cursors, workspace paths, output pagination, and model-controlled result limits remain absent.

<a id="pkg-taskweaver-dsh-tool-session-query--token-effect-1"></a>
###### Token effect

Five fixed read-only schemas are sent on each request while visible.

<a id="pkg-taskweaver-dsh-tool-session-query--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while tool visibility and definitions are unchanged.

<a id="pkg-taskweaver-dsh-tool-session-query--tool-results"></a>
##### Tool results

<a id="pkg-taskweaver-dsh-tool-session-query--what-the-model-sees-2"></a>
###### What the model sees

Each successful call emits one plain-text block. Search results include titles and best-match excerpts; traces include all authorized relationships; event reads include unabridged target JSON. The generic spill policy may replace oversized inline text with its preview, opaque locator, and retrieval hint.

<a id="pkg-taskweaver-dsh-tool-session-query--token-effect-2"></a>
###### Token effect

Results are data-dependent and remain in logged tool history until compaction; `maxSearchResults` bounds search-hit count.

<a id="pkg-taskweaver-dsh-tool-session-query--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only result text follows the reusable request prefix and does not invalidate earlier cache entries.

<a id="pkg-taskweaver-dsh-tool-session-query--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- Search returns at most the deployment cap and asks the model to narrow its query when more matches exist; it offers no continuation token.
- Repository identity is resolved by Git with a bounded subprocess; if Git is unavailable or times out, access falls back to the caller's physical workspace directory.
- Custom compositions without the generic spill policy accept complete trace and event payloads inline.

<a id="family-session-query"></a>
### 原族级说明（迁移保留）

<a id="family-session-query--session-query-session-retrieval-capability-family"></a>
This family provides authorized retrieval over live and durable session logs, independently of compaction.

| Package | Role | ctx key |
|---|---|---|
| [`session-query/`](./README.zh.md#pkg-taskweaver-dsh-session-query) | Defines trusted reads, relationship queries, and search operations | `ctx.sessionQuery` |
| [`session-query-sqlite/`](./README.zh.md#pkg-taskweaver-dsh-session-query-sqlite) | Implements session queries with SQLite full-text search | `ctx.sessionQuery` |
| [`session-log-export/`](./README.zh.md#pkg-taskweaver-dsh-session-log-export) | Registers the Host `/export` command over the Host ZIP endpoint | `ctx.commands` |
| [`tool-session-query/`](./README.zh.md#pkg-taskweaver-dsh-tool-session-query) | Exposes workspace-authorized session queries to the model | registers on `ctx.tools` |

The subsystem reference — logical records, bounded reads, traces, filters, result pages — is [docs/subsystems/session-query.md]（原文链接目标：`../../docs/subsystems/session-query.md`）.
