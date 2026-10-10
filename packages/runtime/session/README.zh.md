# session 包族

<a id="family-session"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

承载会话持久化、投影、检查点、标题和遥测等会话数据能力。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-session-checkpoint-policy`](#pkg-taskweaver-dsh-session-checkpoint-policy) | `session/session-checkpoint-policy` | [接口与限制](#pkg-taskweaver-dsh-session-checkpoint-policy) |
| [`@taskweaver/dsh-session-persistence`](#pkg-taskweaver-dsh-session-persistence) | `session/session-persistence` | [接口与限制](#pkg-taskweaver-dsh-session-persistence) |
| [`@taskweaver/dsh-session-persistence-jsonl`](#pkg-taskweaver-dsh-session-persistence-jsonl) | `session/session-persistence-jsonl` | [接口与限制](#pkg-taskweaver-dsh-session-persistence-jsonl) |
| [`@taskweaver/dsh-session-projection`](#pkg-taskweaver-dsh-session-projection) | `session/session-projection` | [接口与限制](#pkg-taskweaver-dsh-session-projection) |
| [`@taskweaver/dsh-session-projection-cache`](#pkg-taskweaver-dsh-session-projection-cache) | `session/session-projection-cache` | [接口与限制](#pkg-taskweaver-dsh-session-projection-cache) |
| [`@taskweaver/dsh-session-stats`](#pkg-taskweaver-dsh-session-stats) | `session/session-stats` | [接口与限制](#pkg-taskweaver-dsh-session-stats) |
| [`@taskweaver/dsh-session-telemetry`](#pkg-taskweaver-dsh-session-telemetry) | `session/session-telemetry` | [接口与限制](#pkg-taskweaver-dsh-session-telemetry) |
| [`@taskweaver/dsh-session-title`](#pkg-taskweaver-dsh-session-title) | `session/session-title` | [接口与限制](#pkg-taskweaver-dsh-session-title) |
| [`@taskweaver/dsh-session-title-first-prompt-llm`](#pkg-taskweaver-dsh-session-title-first-prompt-llm) | `session/session-title-first-prompt-llm` | [接口与限制](#pkg-taskweaver-dsh-session-title-first-prompt-llm) |
| [`@taskweaver/dsh-session-title-llm`](#pkg-taskweaver-dsh-session-title-llm) | `session/session-title-llm` | [接口与限制](#pkg-taskweaver-dsh-session-title-llm) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-session-checkpoint-policy"></a>
### `@taskweaver/dsh-session-checkpoint-policy`

<!-- migrated-from: packages/runtime/session/session-checkpoint-policy/README.md -->
目录：`session/session-checkpoint-policy`。
package.json 描述：Semantic session durability checkpoints before model requests and tool side effects

<a id="pkg-taskweaver-dsh-session-checkpoint-policy--dsh-session-checkpoint-policy"></a>
Semantic durability policy for persisted agents. It checkpoints the event-sourced session before a model adapter receives a request, before a top-level tool body may produce an external side effect, and at each `agent/pre-step` boundary so the preceding response and ordered tool results are durable before the next request.

<a id="pkg-taskweaver-dsh-session-checkpoint-policy--plugin-namespace-session-checkpoint-policy"></a>
#### Plugin (namespace: `session-checkpoint-policy`)

This zero-config function plugin consumes `ctx.sessions`, `ctx.llm`, `ctx.tools`, and the presence of `ctx.sessionPersistence`. Load it beside one persistence backend:

```yaml
- id: session-persistence
  name: '@taskweaver/dsh-session-persistence-jsonl'

- id: session-checkpoints
  name: '@taskweaver/dsh-session-checkpoint-policy'
```

Persistence and checkpoint scheduling are intentionally separate Cordis plugins. A persistence backend starts bounded background batches for `session/event` appends and makes each requested `session/flush` an immediate quiescence barrier; this policy chooses the request, tool-dispatch, and next-step barriers. Loading a backend without this policy is valid, but a crash may lose events still inside the configured batching window or an outstanding write. First-party persisted apps and runtimes mount both plugins explicitly; a specialized deployment may deliberately omit or replace the policy.

The policy wraps `llm/stream` lazily, so the downstream stream is not constructed until the live session's buffered request events are durable. It wraps `tools/execute` after pre-execute policy and guards; a top-level tool body runs only after its recorded call is durable. If cancellation lands while that flush is pending, the wrapper returns the canonical `ABORTED_BEFORE_DISPATCH` result without entering the tool body. Nested tool dispatches reuse the outer model-visible call's checkpoint. `agent/pre-step` persists the preceding response/result batch before request derivation.

Checkpoint rejection is fail-closed at the model and tool boundaries: neither the adapter nor the top-level tool body runs. A step-boundary rejection fails the turn before another request starts. Concurrent tool checkpoints share the session store's serialized persistence drain and cannot duplicate sequence numbers.

<a id="pkg-taskweaver-dsh-session-checkpoint-policy--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-session-checkpoint-policy--interrupted-calls"></a>
##### Interrupted calls

<a id="pkg-taskweaver-dsh-session-checkpoint-policy--what-the-model-sees"></a>
###### What the model sees

The plugin adds no prompt or tool schema. A hard crash after a tool checkpoint but before its result leaves a durable unmatched call; session recovery supplies the model-visible `TOOL_OUTCOME_UNKNOWN` result owned by `dsh-session`. The message permits retry for read-only or idempotent work and requires state verification or user confirmation for calls that may have side effects.

<a id="pkg-taskweaver-dsh-session-checkpoint-policy--token-effect"></a>
###### Token effect

Successful checkpoints add no tokens and do not change the request. Recovery adds one short tool-result message to balance the interrupted transcript.

<a id="pkg-taskweaver-dsh-session-checkpoint-policy--kv-cache-effect"></a>
###### KV Cache effect

The repair result is appended after the reusable prefix, so it does not invalidate earlier cache entries.

<a id="pkg-taskweaver-dsh-session-checkpoint-policy--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- The policy durably records execution intent, not generic exactly-once effects. Side-effecting tools should forward `exec.callId` as an idempotency key when their provider supports one.
- Streaming `assistant/chunk` events have no per-chunk checkpoint. Bounded background batches normally persist them before the next semantic checkpoint, but a hard crash may lose the current in-memory batch or outstanding write.
- A persisted call without a result cannot prove whether its external effect completed. Recovery therefore records an unknown outcome instead of retrying automatically.

<a id="pkg-taskweaver-dsh-session-persistence"></a>
### `@taskweaver/dsh-session-persistence`

<!-- migrated-from: packages/runtime/session/session-persistence/README.md -->
目录：`session/session-persistence`。
package.json 描述：Abstract durable session persistence seam (ctx.sessionPersistence) for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-session-persistence--taskweaver-dsh-session-persistence"></a>
Session persistence is a capability seam. The abstract `SessionPersistence` service (`ctx.sessionPersistence`) is its Service Definition. It requires a persistence backend to store, reload, and list sessions durably without defining the storage implementation. The seam follows the `dsh-shell` roles ([capability seams]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md`）): this package owns the Service Definition, a sibling package owns the Service Provider, and Consumers inject the service.

The persisted unit IS the existing `SessionEvent` (event-sourced model — the log is the single source of truth), so there is no parallel "persisted message" type. Metadata that is NOT replayable conversation state (format version, cwd, lineage, seed boundary, origin, delegation depth) travels separately as `SessionHeader`, owned by `dsh-session` and re-exported here.

<a id="pkg-taskweaver-dsh-session-persistence--service-api-ctx-sessionpersistence"></a>
#### Service API (`ctx.sessionPersistence`)

| Method | Contract |
|---|---|
| `locate(meta): SessionLocation \| undefined` | Resolve an absolute per-session artifact target without I/O or materialization. Backends without an independent local artifact return `undefined`. |
| `supportsRawArtifacts: boolean` | State explicitly whether this backend exposes one verbatim artifact per session. Consumers check this capability before calling `readRaw`; `false` is not session absence. |
| `readRaw(id, signal?): Promise<SessionRawArtifact \| undefined>` | Read a supported backend's own artifact text verbatim, decoded from its physical encoding but never reconstructed from events. `undefined` means only that the requested artifact is absent; an unsupported backend rejects. |
| `create(meta): Promise<void>` | Register a new session's metadata. MAY defer the physical write until the first `append` (lazy materialization). |
| `append(id, events): Promise<void>` | Durably persist a batch. Append-only; first event `seq` == stored next-seq after any repair; rejects non-JSON-serializable data naming the offending type. |
| `prepare(id, signal?): Promise<SessionPreparation>` | Reserve the exact unpublished Session used by resume. A coordinator reuses an earlier inspection when available, commits pending recovery, and releases an unpublished reservation back to its bounded cache on disposal. |
| `load(id): Promise<{ meta; events }>` | Return an immutable balanced logical log after converting supported older records from the same format version and committing cold recovery. A live load first flushes its snapshot and rejects while its turn is open; a cold load preserves an interrupted final turn and durably closes it with synthetic `tool/result`/`step/end?`/`turn/end {interrupted}` events. Only a torn tail fragment is dropped; committed corruption and malformed records reject as `SessionPersistenceCorruptionError`, while an unsupported format `version` or an event type unknown to this build (without the envelope's `ignorable` marker) refuses as `SessionFormatUnsupportedError`, naming the refusal direction and the raw log path when the backend keeps one artifact per session. |
| `inspect(id, signal?): Promise<{ meta; events }>` | Return an upgraded, validated, deeply frozen logical view without committing recovery or publishing a Session. A cold view receives in-memory synthetic recovery closers while its physical torn tail remains untouched; an already-live view is its current immutable snapshot and may contain an open turn. Coordinator-backed implementations retain the exact cold unpublished Session in a bounded LRU for later `prepare`, but discard and reload it when the stored revision changes. Same-id inspections share an in-flight read. |
| `readFrom(id, fromSeq, signal?): Promise<{ meta; events }>` | Return valid stored events with `seq >= fromSeq` without preparation caching, truncation, closers, or coordinator state. A `fromSeq` at or past the stored end returns an empty event list; a negative or non-safe-integer `fromSeq` rejects. Seek-capable backends (SQLite) read only the suffix unless converting a supported older record requires earlier records; sequential backends (JSONL) parse the whole artifact and skip forward. Unknown-type refusal follows that access pattern: a seek read checks only the returned suffix, while the sequential fallback also refuses on an unknown required event below the window. Intended for checkpoint consumers that apply only events after a stored sequence number. |
| `list(signal?): Promise<SessionHeader[]>` | Lightweight listing from metadata, no full-log parse. The optional signal cancels backend listing work. A zero-event lazily-materialized session is absent from `list`. |
| `listSnapshots(signal?): Promise<SessionPersistenceSnapshot[]>` | Lightweight metadata plus an opaque branded per-log revision, without loading event logs. A revision stays equal while that log and its backing store are unchanged, changes after append or mutating load repair, and cannot collide solely because two stores use the same local counter. The optional signal requests cancellation of backend discovery work; first-party backends settle any started listing work before rejecting so an awaited call is quiescent. |

<a id="pkg-taskweaver-dsh-session-persistence--invariants-every-backend-must-honor"></a>
#### Invariants every backend must honor

- **Append-only; a crashed turn is closed, not truncated.** Flushed events are never rewritten. A crash can leave an unclosed final turn whose events are real and possibly large; `load` preserves them and durably appends synthetic closers (a risk-classified error `tool/result` per unanswered assistant call, then `step/end?`+`turn/end {interrupted}`) to balance the log and keep the rehydrated history a valid provider transcript. Only a never-fully-written torn tail fragment is discarded.
- **Contiguous seq.** `load` rejects a `seq` gap/parse error in the MIDDLE of the log; `append`'s first `seq` must equal the stored next-seq.
- **JSON-serializable data.** `append` materializes each direct/replay batch through the shared one-pass lossless-JSON boundary. Live `Session` events are already deep-frozen, but the write coordinator still copies each event into a persistence-owned buffer.
- **Durability.** `append` returns only once the batch is durable.

<a id="pkg-taskweaver-dsh-session-persistence--the-write-coordinator"></a>
#### The write coordinator

`PersistenceCoordinator` owns per-id state and serialization, one bounded write controller per live session, lazy materialization, crash-tail repair, session adoption, and quiescent disposal. A first-party backend composes one, implements the small `PersistenceBackend` storage hook interface, and delegates its stateful methods. JSONL and SQLite therefore share lifecycle correctness while retaining different storage primitives; see the [coordinator Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-18-shared-persistence-write-coordinator.md`）, [flush-controller simplification]（原文链接目标：`../../../.agents/notes/implemented/simplification/2026-07-23-collapse-persistence-flush-state.md`）, and [bounded batching decision]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-08-08-bounded-session-persistence-write-batching.md`）.

Each `session/event` copies its event into the session controller. The first pending event starts a fixed batching window; later events join without resetting its deadline. The configured `writeBatchMaxDelayMs` bounds this intentional wait, not event-loop, initialization, serialized-operation, or backend latency. Events admitted during a write form a new bounded batch. `session/flush` cancels the wait and is a shared quiescence barrier that drains events admitted while it runs. A background failure is logged once, retains the ordered batch, and pauses automatic retry; a new event starts a fresh window, while explicit flush or backend teardown retries immediately and surfaces a repeated failure.

Crash repair is cold-only. For a live id, `load(id)` snapshots the authoritative in-memory log, waits for that snapshot to become durable, and returns it only when balanced; an open live turn rejects instead of receiving synthetic interruption closers. For a cold id, inspection reads, validates, freezes, and constructs one unpublished Session; repeated inspection reuses that object graph only while its source revision remains current. `prepare(id)` performs the same check before repair, reserves the exact Session, commits any pending torn-tail/interrupted-turn repair, and returns it for publication. HMR adoption reads through `loadStored`, applies the coordinator's cwd check, and never closes the active turn.

Backend reads convert the exact supported older records from the same format version before validating current records. Pre-identity messages receive the deterministic id `legacy-message:<session-id>:<event-seq>`; a tool-result content replacement inherits its target's imported id. A pre-react-loop `turn/start` loses its obsolete trigger, a removed `steering/message` becomes the same identified `user/message`, and an older `turn/end` maps its terminal reason without inventing a caller that the old record did not name. The coordinator uses the same converted view for `load`, `inspect`, `readFrom`, ownerless-state claims, and HMR prefix adoption. Storage remains append-only: reads do not rewrite old records, and later appends use the current format. These are narrow import exceptions from the [pre-identity message]（原文链接目标：`../../../.agents/notes/implemented/bug-fix/2026-07-28-load-pre-identity-session-messages.md`） and [pre-react-loop session]（原文链接目标：`../../../.agents/notes/implemented/bug-fix/2026-08-04-load-pre-react-loop-sessions.md`） decisions, not a general v0 migration promise.

When a live session emits `session/disposed`, the coordinator waits for its controller, serializes a final drain, then releases state owned by that exact `Session` object. Failed retirement leaves the controller in the live-session map, so backend teardown can retry it. Backend teardown stops event admission first, flushes every remaining controller, awaits per-id operations, and only then closes the storage handle.

The side-effect-free `locate`, lightweight `listSnapshots`, and per-id `readStoredRevision` queries remain backend-owned because they describe storage topology and revision identity rather than write orchestration. `listSnapshots(signal?)` passes the caller's exact signal into backend discovery so observers can cancel that work without detaching it.

The `PersistenceBackend<TornMarker>` hooks (the only contract between the coordinator and storage):

| Hook | Role |
|---|---|
| `name` | Backend label for the dispose-failure `AggregateError`. |
| `loadStored(id, signal?)` | Read a stored prefix by id across every storage scope. Used by resume/load, non-mutating inspect, live adoption, and the create-collision probe. The optional signal belongs to observation-only reads. Returned metadata identifies `id`; `revision` identifies exactly the returned header and events; an opaque `tornMarker` is present iff a torn tail must be truncated. |
| `readStoredRevision(id, signal?)` | Read the current source-qualified revision for one id without loading its event log. It uses the same revision representation as `loadStored` and returns `undefined` when the id is absent. |
| `loadStoredFrom?(id, fromSeq, signal?)` | Optional seek-capable suffix read behind the service's `readFrom`: the header plus stored events with `seq >= fromSeq`, non-mutating, no torn marker. SQLite implements it (`WHERE seq >= ?`); a backend that omits it gets the coordinator's fallback — `loadStored` plus a forward skip. |
| `appendBatch(meta, events, isMaterialized)` | Durably append a contiguous batch, lazily materializing ATOMICALLY when not yet materialized. |
| `commitRepair(meta, tornMarker, closers)` | Make a crash repair durable: truncate the torn tail (iff `tornMarker !== undefined` — a marker may be falsy, e.g. seq/offset `0`) and append `closers`. NOT required to be atomic. Used by load (truncate + closers) and live-adoption (truncate only). |
| `list(signal?)` | List all stored metadata, observing optional cancellation. |
| `close?()` | Optional lifecycle teardown (e.g. close a db handle), awaited after the dispose drain. |

The coordinator asserts the stored id and compares stored/live cwd before repair or live adoption. Its `inspect()` path takes ownership of fresh backend values, validates and freezes them once, and retains at most the configured number of unpublished Sessions without calling `commitRepair`. A retained source is reused or repaired only when its revision still equals `readStoredRevision`; otherwise the coordinator reloads it. This freshness check does not add cross-process writer exclusion. Revision retries converge when the durable log remains unchanged for one read/check round trip; continuous external writers can delay `load`, `inspect`, or `prepare`. The `tornMarker` is fully OPAQUE: the coordinator only tests `!== undefined` and round-trips it to `commitRepair`, never inspecting its value (the JSONL backend uses the byte offset to truncate to, the SQLite backend the seq to delete from). A third-party backend MAY implement the abstract service directly without the coordinator, but it must provide the same non-mutating inspection and trustworthy lightweight snapshot revisions. See [the write-coordinator Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-18-shared-persistence-write-coordinator.md`）.

<a id="pkg-taskweaver-dsh-session-persistence--metadata-and-location-types"></a>
#### Metadata and location types

Re-exported from `dsh-session`: `SessionHeader` (immutable session metadata: `version`, `id`, `createdAt`, `cwd?`, `parentSession?`, `seedLength?`, `origin?`, `delegationDepth?`). `SessionLocation` is `{ readonly kind: string; readonly path: string }`; its path is an absolute backend target, not proof that the artifact exists or contains an unflushed turn.

<a id="pkg-taskweaver-dsh-session-persistence--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-session-persistence--resumed-conversation-history"></a>
##### Resumed conversation history

<a id="pkg-taskweaver-dsh-session-persistence--what-the-model-sees"></a>
###### What the model sees

This seam adds no prompt or schema. Resume restores stored surface events as message history; stored request headers reconstruct earlier calls, while the new loop composes the current system prompt, tools, and session prefix for its next request. Crash repair marks an assistant request without a durable call as `TOOL_NOT_STARTED`; a durable call without a result becomes `TOOL_OUTCOME_UNKNOWN`, whose text lets the model retry read-only or idempotent work but directs it to verify side effects or ask the user instead of retrying blindly.

<a id="pkg-taskweaver-dsh-session-persistence--token-effect"></a>
###### Token effect

Zero tokens during ordinary persistence. Resume restores retained history cost and pays the current request envelope normally; each repaired call adds the quoted retained error text.

<a id="pkg-taskweaver-dsh-session-persistence--kv-cache-effect"></a>
###### KV Cache effect

Persistence does not mutate live request prefixes. A resumed loop can reuse provider cache only when its reconstructed history, current envelope, and model route match; crash-repair results append without rewriting earlier history.

<a id="pkg-taskweaver-dsh-session-persistence--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No deletion or retention API** — pruning stored sessions is out-of-band backend maintenance.
- **`list()` is unpaginated and unfiltered** — it returns every stored session's header; fine for local stores, unindexed at scale.
- **Repair-time synthetic closers are the only crash story** — a backend must synthesize `tool/result`/`step/end`/`turn/end` closers on load; there is no partial-turn resume that continues an interrupted turn instead of closing it.

<a id="pkg-taskweaver-dsh-session-persistence-jsonl"></a>
### `@taskweaver/dsh-session-persistence-jsonl`

<!-- migrated-from: packages/runtime/session/session-persistence-jsonl/README.md -->
目录：`session/session-persistence-jsonl`。
package.json 描述：JSONL durable session persistence backend for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--taskweaver-dsh-session-persistence-jsonl"></a>
The JSONL durable session-persistence backend — a concrete `SessionPersistence` (the `dsh-session-persistence` seam). Each session has one append-only logical JSONL log, stored as `.jsonl.zstd` by default or raw `.jsonl` when compression is disabled.

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--on-disk-layout"></a>
#### On-disk layout

```
<root>/
  --<normalized-cwd>--/          # readable project directory (or _no-cwd/)
    <encoded-id>/                # session-owned directory
      session.jsonl.zstd         # default: checksummed header frame + append frames
      session.jsonl              # only with compression: 'none'
```

- The first logical line is the immutable `SessionHeader` tagged `{ type: 'session', version, id, cwd?, createdAt, parentSession?, seedLength?, origin?, delegationDepth, agentPreset? }`. `delegationDepth` is required on disk and is `0` for a top-level session; a missing or invalid value rejects the log. `agentPreset` is durable because it decides the resumed session's tools and prompt — restoring a different composition would replay history the model can no longer act on. Every subsequent logical line is one storage record; `assistant/chunk` events are never dropped, and `seq` stays contiguous across the decoded log (`events[i].seq === i`).
- A storage record is a `SessionEvent` JSON verbatim, or — for an eligible run when `packChunks` is enabled — a **packed chunk row** (`text-chunks` / `reasoning-chunks` / `tool-call-chunks`; bare slash-less tags like the header's `session`, so row tags cannot be confused with event types): one line holding a run of ≥3 consecutive same-block `assistant/chunk` delta events, `seq0`/`time0` plus per-member `dt` gaps reconstructing every member's `seq`/`time` exactly. The lossless codec lives in `@taskweaver/dsh-session` (`packChunkRuns`/`decodeStorageRecord`) and whitelists exact shapes — anything unrecognized stores verbatim. Reading is layout-blind: `load` always decodes rows, so packed, unpacked, and mixed files load identically.
- The project directory keeps the normalized cwd readable for navigation and is bounded for filesystem component limits. Separator replacement and truncation are intentionally lossy, so cwd strings that normalize alike share a project directory; session ids still select distinct session directories. On a case-insensitive filesystem, identity validation accepts an alternate path spelling only when filesystem canonicalization resolves both spellings to the same transcript. The configured root remains deployment-controlled: it may be project-local, shared, temporary, or centralized. The [project-session directory decision]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-24-project-session-directories.md`） records this tradeoff.
- Session ids are unvalidated branded strings, so they are injectively escaped to a single safe path segment before use (no traversal, no collision). The resulting directory is reserved for additional session-owned artifacts; discovery reads only the fixed transcript filename.

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--config"></a>
#### Config

| Key | Type | Notes |
|---|---|---|
| `root` | `string` (required) | Root directory for all session files. **No default** — a `process.cwd()` default would scatter files as the process's cwd changes (bash calls, subprocesses). An existing root must be a readable directory; an absent root is created on first materialization. |
| `packChunks` | `boolean` (default `true`) | Write eligible delta-chunk runs as packed rows (~60% smaller logical logs measured on a real coding session). Set `false` for one-event-per-line diagnostics; reading packed rows works regardless of this write-side switch. |
| `compression` | `'zstd' \| 'none'` | Defaults to `'zstd'`; `'none'` retains newline-delimited UTF-8 text. |
| `preparedSessionCacheSize` | positive integer (default `5`) | Maximum unpublished Sessions retained after cold history inspection for reuse by resume. |
| `writeBatchMaxDelayMs` | positive integer (default `200`) | Fixed coalescing window after an idle live-event queue receives work. Later events do not reset it; flush and teardown bypass it. It does not bound event-loop, serialized-operation, or backend latency. At most Node's `2_147_483_647` ms timer limit. |

`locate(meta)` returns `{ kind: 'jsonl', path }` for the fixed transcript inside the resolved project/session directories. It performs no filesystem I/O: the target can be returned before the directory or file exists, and an existing file contains only the last flushed prefix.

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--physical-encoding"></a>
#### Physical encoding

The default artifact is a standard concatenation of independent [Zstandard frames]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-19-zstandard-jsonl-session-logs.md`）: one checksummed frame containing only the header line, followed by one checksummed frame per durable append batch. The backend uses Node's built-in Zstandard API with its default compression level and exposes no level knob. Listing reads and validates only the header frame. `compression: 'none'` keeps the same logical lines in the original raw representation.

A root belongs to one encoding. Startup discovery and targeted lookup reject the opposite suffix with an error naming the incompatible artifact and instructing the caller to select the matching mode or a separate root. Flat `<project>/<id>.jsonl*` artifacts are also rejected instead of ignored. There is no migration, mixed-root fallback, or dual write.

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--durability-and-crash-semantics"></a>
#### Durability and crash semantics

- **Bound storage identity.** Lookup requires one matching session directory across the readable project directories, then verifies that the header id equals the requested id and that the header's id/cwd derive the selected transcript path. Listing applies the same path check and rejects duplicate ids. Identity failures occur before repair or append.
- **Lazy materialization.** `create(meta)` writes nothing; on the first `append`, the backend writes and `fsync`s the encoded header and first batch in a temporary file. POSIX publishes it without overwrite via a hard link and `fsync`s the parent directory. Windows publishes it without overwrite via `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)` and creates missing directories through the same write-through pattern. A created-but-never-appended session leaves nothing on disk and is absent from `list`.
- **Append-only.** Flushed events are never rewritten. Subsequent raw batches append lines; compressed batches append one frame. Both paths `fsync`, and a caught write or sync failure rolls the file back to its prior byte length.
- **Crash recovery — preserve valid tail work.** `load` validates every complete compressed frame and scans their decompressed JSONL. If the last frame is structurally incomplete, the reader keeps its complete decoded records, truncates from that frame's start, and re-encodes those records with the synthetic tool, step, and turn closers required by the shared [persistence contract]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md`）. Raw mode truncates from its first incomplete line. An existing compressed artifact with no complete header frame, a checksum/decompression failure in a complete frame, or a defect at or before the last committed `turn/end` is corruption and rejects.
- **Non-mutating inspection.** `inspect()` returns an immutable balanced logical view and may synthesize recovery closers in memory, without truncating an incomplete tail or changing the lightweight revision.
- **Contiguous-seq.** `append` rejects a batch whose first `seq` does not continue the stored log, and rejects non-JSON-serializable `event.data` naming the offending event type.
- **Lightweight revisions.** `listSnapshots(signal?)` identifies a log by its device, inode, size, and nanosecond timestamps, avoiding a full-log parse while changing after append, repair, replacement, or store changes. A full-prefix read requires the same identity before and after reading the bytes, and `readStoredRevision()` uses that identity to validate retained preparations without loading the log. Snapshot listing forwards the exact signal through artifact discovery and checks cancellation around every `stat`; because filesystem `stat` is not interruptible, cancellation waits for the active call to settle, then rejects without starting another.

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--write-path"></a>
#### Write path

The plugin copies frozen session events into one controller per live session. The first pending event starts the configured fixed batching window, and later events join without resetting it. Expiry starts one durable append; events admitted during that write form a separately bounded follow-up batch. `session/flush` cancels the wait and drains current and pending batches. A per-session cursor prevents resumed sessions from re-appending stored events, and live sessions are seeded when the plugin loads. The owning backend instance serializes operations for one session; disposal drains every retained controller before teardown. Every logical event remains present: batching only lets one compressed frame or raw fsync carry more records.

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--resumed-conversation-history"></a>
##### Resumed conversation history

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--what-the-model-sees"></a>
###### What the model sees

JSONL storage contributes no live prompt or schema. Loading restores stored surface history and preserves prior request headers for reconstruction; the new loop composes its current envelope. Recovery balances an assistant request without a durable call with `TOOL_NOT_STARTED`; a durable call without a result becomes `TOOL_OUTCOME_UNKNOWN`, which tells the model to retry only read-only or idempotent work and to verify possible side effects or ask the user. Raw `assistant/chunk` records do not duplicate messages.

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--token-effect"></a>
###### Token effect

Zero live-request tokens. A resumed agent pays for retained history and its current envelope, plus the quoted repair result for each interrupted call.

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--kv-cache-effect"></a>
###### KV Cache effect

JSONL storage does not mutate live request prefixes. A resumed loop can reuse provider cache only when its reconstructed history, current envelope, and model route match; crash-repair results append.

<a id="pkg-taskweaver-dsh-session-persistence-jsonl--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Only the configured encoding and current `SESSION_FORMAT_VERSION` (v0) load** — changing compression requires a separate/fresh root or selecting the legacy raw mode; the pre-release format has no migration.
- **The flat-file storage layout does not load** — use a separate root or move pre-release artifacts into the project/session directory layout before loading.
- **Compressed files are not directly line-readable** — use the backend to load them, or select `compression: 'none'` before writing a fresh root when external line readers are required.
- **Nothing deletes session files** — logs accumulate under `root` until removed externally (the seam has no deletion API).
- **One live writer per session** — append and repair are coordinated only inside the owning backend instance. Another backend instance or process must not write the same session until that owner reaches quiescent disposal; initial same-id publication remains collision-safe through the POSIX no-overwrite hard link or Windows write-through rename without replacement.
- **POSIX materialization requires hard-link support** — first append uses `link()` so same-id races fail instead of overwriting a committed log; Windows uses write-through rename without replacement.

<a id="pkg-taskweaver-dsh-session-projection"></a>
### `@taskweaver/dsh-session-projection`

<!-- migrated-from: packages/runtime/session/session-projection/README.md -->
目录：`session/session-projection`。
package.json 描述：Session-projection seam: the merge-extensible projection type table, the provider contract, and the ctx.sessionProjections registry serving whole current values of log-derived per-session state

<a id="pkg-taskweaver-dsh-session-projection--taskweaver-dsh-session-projection"></a>
Session-projection Service Definition and drive registry. It owns `ctx.sessionProjections`, the registry that drives every registered projection unit over committed session events and serves finished whole values to carriers, currently the api-proxy history tail page and `session/projection` push frame. A domain registers pure mathematics; the framework owns the drive. The [session-projection RFC]（原文链接目标：`../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md`） records the design rationale.

<a id="pkg-taskweaver-dsh-session-projection--service-sessionprojectionregistry-ctx-key-sessionprojections"></a>
#### Service: `SessionProjectionRegistry` (ctx key: `sessionProjections`)

<a id="pkg-taskweaver-dsh-session-projection--public-api"></a>
##### Public API

- `ctx.sessionProjections.register(definition): () => void` Register one domain's unit. Duplicate keys and invalid `stateVersion` throw; the registration is an effect on the calling fiber, so an unloaded domain plugin's key (with its cached cells) disappears from subsequent drives and snapshots — clients read that as capability absence.
- `ctx.sessionProjections.onChanged(listener): () => void` Subscribe to the change feed: one call per client-visible unit whose state reference changed, per committed event, carrying the schema-validated view and the causing seq. Effect-tied like `register`.
- `ctx.sessionProjections.stateOf(session, key)` Read one registered unit's current host state without computing unrelated views. The returned value is a live read-only reference; callers must not mutate it.
- `ctx.sessionProjections.snapshot(session): ProjectionSnapshot` One consistent synchronous cut over every registered client-visible unit — `{ asOfSeq, values }` with `asOfSeq` = the seq of the last event every value reflects (`-1` for an empty log). Host-only state is available only through `stateOf`.

<a id="pkg-taskweaver-dsh-session-projection--key-types"></a>
##### Key Types

- `SessionProjectionMap` — the merge-extensible client-view table shared by wire blocks and client hooks. Values are wire-JSON whole values; rendering belongs to the slot system, never this layer.
- `SessionProjectionStateMap` — the merge-extensible host fold-state table. Every client-visible key appears in both tables; host-only keys appear only here.
- `ProjectionDefinition<K, S>` — `{ key, stateSchema, init(), apply(state, event), wire?, stateVersion }`: a synchronous state-driven computation unit. `wire` supplies `viewSchema` and `view`; omitting it makes the unit host-only.

<a id="pkg-taskweaver-dsh-session-projection--contract"></a>
#### Contract

- **The framework drives, the domain computes.** The registry subscribes to `session/event` once; every committed event passes every unit's `apply` eagerly. Domains hold no subscriptions. Cells (`{state, observedSeq}` per unit per session, WeakMap-keyed) build lazily — a unit registered after events flowed, or a read of a session predating the registration, folds `init` over the in-memory log on first touch.
- **Same-reference means no work.** `apply` MUST return the same state reference for events that do not concern the unit; the drive gates the change feed on `Object.is`, so non-matching events cost one call and nothing downstream.
- **Whole-value event rule (load-bearing).** A state-carrying log event MUST carry the complete post-change state, never a bare delta — it keeps every transition trivially cheap and every served value self-describing (last-wins for consumers).
- **Synchronous unit discipline.** `init`/`apply`/`wire.view` MUST be synchronous; carriers read `snapshot()` in the same tick as their page slice, which is what makes `asOfSeq` one consistent cut. An accidentally async view returns a Promise, which fails `wire.viewSchema.parse`.
- **State is validated plain JSON, `stateVersion` is its invalidation anchor.** The persisted projection cache stores `(sessionId, key, ver, seq, val)` rows and validates `val` with `stateSchema` before use; bump `stateVersion` whenever the state fields or fold semantics change. Every unit's state is checkpointed — client-visible and host-only alike.
- **No wire vocabulary here.** The registry exposes only the change feed and the snapshot read face; carriers (api-proxy) mint their own frames (`session/projection`) and blocks from them.
- **Optional capability.** Domain plugins register under `ctx.inject(['sessionProjections'], …)` so headless assemblies without the registry stay unaffected; carriers use `ctx.get('sessionProjections')` and omit their block/frames entirely when the registry is absent.

<a id="pkg-taskweaver-dsh-session-projection--role"></a>
#### Role

This package owns the Service Definition and drive roles of the capability seam: domain host plugins (e.g. `dsh-tool-todo`) contribute units, carriers (`dsh-host-apiproxy`) consume the snapshot and change feed, and neither knows the other.

<a id="pkg-taskweaver-dsh-session-projection--model-experience"></a>
#### Model Experience

None, as the registry only computes client-facing read models of already-logged session state and touches no prompt, message, schema, stream, or tool result.

<a id="pkg-taskweaver-dsh-session-projection--kv-cache-effect"></a>
###### KV Cache effect

None; projections never assemble or send provider requests.

<a id="pkg-taskweaver-dsh-session-projection--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Every tail page carries every client-visible key** — there is no per-key opt-out or lazy-key request shape yet; acceptable while values are UI-scale whole states (a todo list, a goal snapshot), revisit if a domain's value grows large.
- **The unit table is process-wide, so key presence is not a per-session capability signal** — a key registered by ANY agent preset appears in every session's snapshot, including sessions whose own composition mounts nothing that produces it. A client must read the VALUE (`plan.active`, an empty todo list) rather than treat an absent key as absence of the feature; a unit whose empty value is indistinguishable from a real one belongs on the host plane instead, which is why `dsh-token-meter` sits there.
- **Eager drive touches every unit per event** — cheap by construction (whole-value rule, same-reference gate), but a hot path would justify per-unit event-type prefilters, addable without contract change.
- **Registry cells live in memory only** — a restart rebuilds by folding the log on first touch; compositions that mount `dsh-session-projection-cache` seed that fold from persisted rows instead.
- **Synchronous unit discipline is only partially mechanical** — `wire.viewSchema.parse` rejects a Promise-returning view, but an `apply` that blocks or reads torn non-session state is a review concern; the invariant companion documents why no runtime check exists.

<a id="pkg-taskweaver-dsh-session-projection-cache"></a>
### `@taskweaver/dsh-session-projection-cache`

<!-- migrated-from: packages/runtime/session/session-projection-cache/README.md -->
目录：`session/session-projection-cache`。
package.json 描述：Persisted projection cache (ctx.sessionProjectionCache): durable per-session projection checkpoints over the domain data form, throttled write-behind, and the cold-read ladder (cache row + persistence tail replay)

<a id="pkg-taskweaver-dsh-session-projection-cache--taskweaver-dsh-session-projection-cache"></a>
The persisted projection cache (`ctx.sessionProjectionCache`): durable checkpoints of every projection unit's state, one record per session on the domain data form (`session_projcache` domain — the shipped json backend lands it beside `workspace.json` under the configured storage root). Design authority: the [session-projection RFC]（原文链接目标：`../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md`） (persisted projection cache section).

A stored row `(key → {ver, seq, val})` is a fold shortcut, never an authority: possibly stale (`seq` says exactly how stale) but never wrong. Consequences the implementation commits to:

- **Every background write is fail-soft.** A failed durable write logs a warning and keeps the cache stale; the next write or cold read self-heals. A crash between writes costs a longer tail replay, never a wrong value.
- **A `ver` mismatch against the live unit's `stateVersion` discards, never migrates.** A unit bump invalidates its rows at read time; the key refolds from the log.
- **A row must pass the live unit's `stateSchema`.** A malformed row is omitted from the zero-I/O view and rejected by restore so the cold-read ladder refolds it from the log.
- **Whole-record writes.** Each write replaces the session's full checkpoint (the registry cut is always complete), snapshotted through the lossless-JSON boundary — a unit state violating the plain-JSON contract fails loud.
- **Records are bound to a log lifecycle, not just an id.** Each record stores the header identity (`createdAt`, `cwd`) it was folded from; every read validates it (the live or stored header is the witness) before accepting a row, so a deleted-then-recreated id or a persistence store swapped under a surviving cache discards the unrelated record instead of seeding phantom values.
- **The log leads, the cache follows.** A live checkpoint flushes the session's buffered events durably BEFORE the cache row lands, so a crash can leave the cache behind the log (a longer tail replay) but never ahead of it.

<a id="pkg-taskweaver-dsh-session-projection-cache--write-policy"></a>
#### Write policy

Two mandatory points, throttled in between:

| Trigger | Nature |
|---|---|
| `turn/end` | Mandatory — the turn-final value is what cold reads want. |
| Session disposal (detach) | Mandatory — the live-to-cold moment; after it the cold ladder serves this session. |
| `writeEveryEvents` committed events | Config throttle (count). |
| `writeIntervalMs` since the first dirty event | Config throttle (interval). |

Both `Config` fields are required (no defaults): flush cadence is a deployment choice with no universally correct value, stated in cordis.yml.

<a id="pkg-taskweaver-dsh-session-projection-cache--listing-read-cachedsnapshot-meta"></a>
#### Listing read (`cachedSnapshot(meta)`)

The zero-I/O rung: client values viewed straight from the identity-matching stored record (version- and state-schema-matching keys only), returned as a `{asOfSeq, values}` cut — `asOfSeq` is the lowest served-row watermark, so a client seeding its per-session value store under higher-seq-wins can never let a stale list block overwrite a newer push frame. Host-only rows are never returned. `undefined` when no usable client row exists (unknown id, unrelated lifecycle, or no usable rows); the api-proxy list carrier turns that into an absent column.

<a id="pkg-taskweaver-dsh-session-projection-cache--cold-read-coldsnapshot-id-signal"></a>
#### Cold read (`coldSnapshot(id, signal?)`)

The read ladder, zero full-log load on the happy path: cached rows → `sessionProjections.restoreFloor` (anchored one event below the lowest usable watermark) → persistence `readFrom(id, floor)` → `sessionProjections.restore` → fail-soft write-back of the refreshed rows. The anchor makes a shrunk log (crash-repair truncation) provable: an overreaching row triggers exactly one full re-read from seq 0 instead of serving a ghost value. No registered units serve `{asOfSeq: -1, values: {}}` without touching persistence; a session with no persisted log rejects with the seam's `not found`.

`write(session)` is the synchronous-cut checkpoint both mandatory points use; carriers may call it directly (not fail-soft — the fail-soft wrappers own containment).

<a id="pkg-taskweaver-dsh-session-projection-cache--composition"></a>
#### Composition

```yaml
- id: session-projection-cache
  name: '@taskweaver/dsh-session-projection-cache'
  config:
    writeEveryEvents: 200
    writeIntervalMs: 5000
```

Injects `storageDomain`, `sessionProjections`, `sessionPersistence`, `sessions`. Without this row the projection system runs live-only (watermark cache; cold reads fall back to full log loads wherever a carrier implements them).

<a id="pkg-taskweaver-dsh-session-projection-cache--model-experience"></a>
#### Model Experience

None, as the cache only persists and restores host-side read models of already-logged session state and touches no prompt, message, schema, stream, or tool result.

<a id="pkg-taskweaver-dsh-session-projection-cache--kv-cache-effect"></a>
###### KV Cache effect

None; the cache never assembles or sends provider requests.

<a id="pkg-taskweaver-dsh-session-projection-cache--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No eviction or retention surface** — records accumulate per session; pruning stored checkpoints is out-of-band maintenance, same stance as session persistence itself.
- **Interval throttle is per-session coarse** — the timer arms at the first dirty event after a clean write; a steady sub-threshold trickle writes once per interval, not a sliding window.
- **`coldSnapshot` reads are not deduplicated** — two concurrent cold reads of one session each run the ladder; last write-back wins (rows are equivalent), acceptable for listing-scale call rates.

<a id="pkg-taskweaver-dsh-session-stats"></a>
### `@taskweaver/dsh-session-stats`

<!-- migrated-from: packages/runtime/session/session-stats/README.md -->
目录：`session/session-stats`。
package.json 描述：Whole-log conversation counts and wall times projection (sessionStats) for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-session-stats--taskweaver-dsh-session-stats"></a>
Function plugin registering the `sessionStats` projection unit: whole-log conversation figures — turn/step/tool-call counts and the LLM, tool, first-token, and decode wall times — folded from step boundaries, stream chunks, tool pairs, and assembled assistant messages, and served through the session-projection seam (registry snapshot, change feed, and every projection carrier: history tail page, `session/projection` push frames, session list rows). Clients render full-session figures that paging and compaction cannot change; the reference consumer is the web chat stats strip, whose window fold mirrors these field names as its no-unit fallback.

<a id="pkg-taskweaver-dsh-session-stats--fold-semantics"></a>
#### Fold semantics

- `steps` counts `step/end` events. The agent loop appends exactly one per entered step, in a `finally`, so completed, failed, cancelled, and max-tokens steps all count. Counting assembled assistant messages instead would overcount max-tokens usage-host messages (empty content, excluded from the surface) and undercount cancelled steps (aborted before the message assembles).
- `turns` counts distinct turns carrying at least one closed step; rejected or empty turns (closed with no step) are uncounted. Turn numbers are host-assigned and monotonic per session, so the fold keeps only the last counted turn.
- `toolCalls` counts both top-level `tool/call` events and nested `tool/code-dispatch-start` events. The settled `tool/code-dispatch` event does not add another call.
- `llmMs` sums `step/start` → `assistant/message` per step that assembled a message (retry waits inside the step are model time, as in the window fold).
- `ttftMs`/`ttftSteps` sum and count `step/start` → first non-empty delta chunk; the first attempt's boundary survives an in-step `llm/retry` (window `resetForRetry` parity).
- `decodeMs`/`decodeTokens` sum first token → assembled message and the provider-reported output tokens, only over steps carrying both.
- `toolMs` sums `tool/call` → `tool/result` pairs matched by callId; unresolved calls are dropped at `turn/end` (results land within their turn).
- Every field is 0 until its first contributing event. A composed registry always serves the key, so clients read the value, never key presence.

<a id="pkg-taskweaver-dsh-session-stats--composition"></a>
#### Composition

```yaml
- id: session-stats
  name: '@taskweaver/dsh-session-stats'
```

Injects `sessionProjections` — the plugin's whole purpose; in assemblies without the registry the fiber stays pending and nothing registers.

<a id="pkg-taskweaver-dsh-session-stats--model-experience"></a>
#### Model Experience

None, as the plugin only computes a client-facing read model of already-logged session events and touches no prompt, message, schema, stream, or tool result.

<a id="pkg-taskweaver-dsh-session-stats--kv-cache-effect"></a>
###### KV Cache effect

None; the plugin never assembles or sends provider requests.

<a id="pkg-taskweaver-dsh-session-stats--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Steps count work attempted, not visible output** — a step that failed before producing any visible content still closed with `step/end` and counts; a step interrupted by a crash counts after the session reloads, when crash recovery appends its synthetic `step/end` (`interruptedTurnClosers` in dsh-session).
- **A cancelled step is counted but untimed** — no assistant message assembles, so its partial stream time enters no wall-time figure, matching the window fold's untimed interrupted node; a max-tokens usage-host message conversely contributes model time the surface does not show.
- **Counts are log-scoped, not surface-scoped** — steps whose messages were later compacted away stay counted; the figures describe the whole session, not the current model-visible surface.
- **Mounted only in the web-app bundle** — other assemblies serve no `sessionStats` key, and their consumers fall back to window-scoped counting (the web stats strip's fallback path).

<a id="pkg-taskweaver-dsh-session-telemetry"></a>
### `@taskweaver/dsh-session-telemetry`

<!-- migrated-from: packages/runtime/session/session-telemetry/README.md -->
目录：`session/session-telemetry`。
package.json 描述：SessionTelemetryBackend seam for the DeepSeek Harness: session-event capture, projection, redaction, and handoff to a reporting backend

<a id="pkg-taskweaver-dsh-session-telemetry--taskweaver-dsh-session-telemetry"></a>
The telemetry Service Definition declares the `SessionTelemetrySink` contract, and its capture coordinator passes session records to any reporting SDK backend that implements it. Capture can follow live session events or replay a canonical session-log prefix on demand. This package stops after it calls `emit()`: batching, retry, queueing, and loss policy belong to the backend's SDK and are neither specified nor wrapped. Rationale and rejected alternatives: [the revival Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md`）, [feedback-gated delivery]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-08-05-feedback-gated-session-telemetry.md`）, and [buffer-free feedback replay]（原文链接目标：`../../../.agents/notes/implemented/simplification/2026-08-06-buffer-free-feedback-telemetry.md`）.

<a id="pkg-taskweaver-dsh-session-telemetry--the-backend-contract"></a>
#### The backend contract

`SessionTelemetrySink` has three members: `emit(record)` MUST enqueue without blocking because it runs synchronously during `session/event` or explicit canonical-log replay; optional `flush()` is a fire-and-forget hint after a turn ends, and most backends omit it and use their SDK's normal batching schedule; `shutdown()` drains queued records and resolves when the SDK stops, and disposal awaits it. An implementation that provides `flush()` must order concurrent flushes with the final `shutdown()` drain. `SessionTelemetryBackend` registers this API under the `sessionTelemetry` context key; each context accepts one implementation, and a duplicate load throws. A backend constructs `SessionTelemetryCoordinator` with `live` or `on-demand` capture and calls `captureSession(session, throughSeq?)` at its chosen trigger.

<a id="pkg-taskweaver-dsh-session-telemetry--capture-points"></a>
#### Capture points

In `live` mode the coordinator registers, all through the composing fiber's effects: `session/created` (adopt: record the header, read the log back through the projection from the construction boundary — constructor seeds from fork/resume never re-emit on the firehose and never re-export), `session/event` (project, deep-copy, redact, then hand off; zero I/O), `session/flush` (forward the optional `flush()` hint and return void — the loop's awaited parallel must never wait on telemetry), `session/disposed` (capture the session's `shutdown` operational record at its termination edge, then retire it), `agent/error` (the one live-bus relay; the session event vocabulary intentionally has no operational-error record), a dispose effect (capture shutdown for each still-live session, then await the backend's `shutdown()`; failures warn instead of throwing), and an adoption sweep of `ctx.sessions.list()` (a hot reload does not replay `session/created`). In `on-demand` mode it registers only the dispose effect: `captureSession()` reads the canonical log through an optional inclusive sequence boundary, while flush hints and operational events remain local.

<a id="pkg-taskweaver-dsh-session-telemetry--the-redact-waterfall"></a>
#### The redact waterfall

Every record passes the `sessionTelemetry/record` waterfall immediately after projection — the Service Definition's scrubbing extension point. This package ships NO rules of its own: the innermost `next()` passes the record through unchanged, so with no listener mounted records reach the backend exactly as captured, and exported data is precisely as clean as the rules a deployment mounts. Listeners stack by transforming `next()`'s return value; returning without `next()` replaces everything beneath, and a throwing listener withholds that one record fail-closed inside the coordinator's containment. Live capture runs the waterfall at append time; on-demand capture runs it while replaying the canonical log, using the rules mounted at that time. Redaction applies to the outbound copy only; the canonical session log is never rewritten.

<a id="pkg-taskweaver-dsh-session-telemetry--the-handoff-cursor"></a>
#### The handoff cursor

A module-scope `WeakMap<Session, seq>` marks the highest seq HANDED OFF (not delivered) per session. Live capture advances it at append time; on-demand capture advances it only while `captureSession()` hands a requested prefix to the backend. An uncaptured prefix remains solely in the canonical log, so a coordinator reload adds no telemetry-owned recovery state. On replay the coordinator re-hands only events past the cursor (events at or below it still rebuild the chunk-projection state); a missing cursor safely degrades to a re-hand from the session's construction boundary (`Session.firstLiveSeq` — seq 0 for a session born in this process), absorbed by receiver-side dedupe on `(session.id, event.seq)`. Constructor seeds never re-export: a resumed session's history shipped from the previous process under the same id, and a fork's inherited prefix lives in the parent's stream (receivers stitch on `session.parent_id` + `session.seed_length`). The accepted cost, consistent with at-most-once delivery: a resume does not backfill records a previous process failed to deliver — a deployment with a backfill requirement needs the deferred outbox, not replay. This is a deliberate, narrow exception to the registrations-are-effects discipline: entries die with their sessions, the value is a monotonic watermark, and losing it is never an error.

<a id="pkg-taskweaver-dsh-session-telemetry--the-fixed-chunk-projection"></a>
#### The fixed chunk projection

Only the first `assistant/chunk` of each `(turn, step)` ships; the rest are dropped at capture and never advance the cursor. That one chunk is the stream-started signal: `step/start` + first-chunk presence + `assistant/message` presence + the `turn/end` reason distinguish "the request never started" from "the stream died midway" without chunk volume, and time-to-first-token stays computable. Chunk elision makes `seq` gaps routine on the wire — a gap is never a loss signal. Every other event type, including ones merged by plugins this package never heard of, passes through whole.

<a id="pkg-taskweaver-dsh-session-telemetry--the-logical-record"></a>
#### The logical record

`SessionTelemetryRecord`: `channel` (`ledger` | `ops`), `time` (epoch ms), `severity` (pre-mapped: ERROR for `tool/result.isError`, `turn/end` error reasons, and `agent-error`; INFO for other captured records, while `sessionTelemetry/record` policies may assign WARN), identity-only `attributes` (`session.id`, `event.type`, `event.seq`, plus `session.cwd`/`session.parent_id`/`session.seed_length` when the header has them), and the complete deep-copied `event.data` as `body` — post-redaction. Operational records carry `sessionTelemetry.op` (`agent-error` | `shutdown`) and `session.id`, and deliberately NO `event.seq`/`event.type` — signals to alert on, not entries to sum; `agent-error` normalizes its arbitrary thrown value into a stable `{ name, message }` body. Delivery downstream of the handoff is the backend SDK's; duplicates remain possible (cursor-less re-adoption, SDK retries), so receivers dedupe on `(session.id, event.seq)`.

<a id="pkg-taskweaver-dsh-session-telemetry--model-experience"></a>
#### Model Experience

None, as this package only observes the session stream and hands redacted copies to a reporting backend; it never contributes to a model request.

<a id="pkg-taskweaver-dsh-session-telemetry--kv-cache-effect"></a>
###### KV Cache effect

None; this package neither assembles nor sends a provider request.

<a id="pkg-taskweaver-dsh-session-telemetry--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Best-effort delivery** — the cursor marks handed-off, not delivered; a session torn down inside a reload window cannot be re-adopted; whatever sits in a backend queue at crash time is lost. A durable outbox (spool, per-sink cursors, at-least-once) is deferred until a deployment states a crash-loss requirement — see [the revival Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md`）.
- **No built-in redaction rules** — with no `sessionTelemetry/record` listener mounted, records leave the process exactly as captured, including any credentials embedded in file contents or command output; a deployment exporting to a shared collector owns its rule set.
- **On-demand redaction uses current state** — uncaptured events exist only in the canonical session log. A later `captureSession()` deep-copies and redacts their current values with the policy mounted at that time; there is no capture-time telemetry snapshot or durable pre-capture spool.

<a id="pkg-taskweaver-dsh-session-title"></a>
### `@taskweaver/dsh-session-title`

<!-- migrated-from: packages/runtime/session/session-title/README.md -->
目录：`session/session-title`。
package.json 描述：Log-backed session title service and provider registry for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-session-title--taskweaver-dsh-session-title"></a>
Log-backed session titles with an immediate deterministic fallback and one optional asynchronous provider. Every accepted revision is a log-only `session/title` event; `foldSessionTitle()` and `ctx.sessionTitle.get()` select the latest event and return its event seq and timestamp.

Only text blocks from human `user/message` events are eligible. The first eligible prompt schedules a fallback from its first words within the configured UTF-8 byte limit. Whitespace is normalized, terminal control sequences are removed, and truncation never splits a code point. Empty and non-text prompts wait for later eligible input.

<a id="pkg-taskweaver-dsh-session-title--service-sessiontitleservice-ctx-key-sessiontitle"></a>
#### Service: `SessionTitleService` (ctx key: `sessionTitle`)

- `get(session)` folds the latest accepted title from a live or replayed log.
- `refresh(session, signal?)` materializes the fallback when needed, then explicitly runs the registered provider over the current eligible messages. Provider errors and caller cancellation reject; cancellation does not roll back an already accepted fallback event.
- `rename(session, title)` accepts an explicit user title synchronously: it normalizes the text, supersedes in-flight automatic work, and appends a `session/title` event with the `user` source. A user-sourced latest title pins the session — later user messages schedule no automatic revision; an explicit `refresh` remains the deliberate unpin.
- `register(provider)` installs the sole optional provider and returns its awaitable Cordis effect disposer. A second registration throws immediately; disposal aborts pending and active calls, waits for their settlement, and only then permits another provider to register.

Automatic work never delays the main agent response. A provider starts only after a marked loop-built request's exact route matches the current logged `request/header`, including when the unchanged header needs no new snapshot. Its late completion appends a standalone log-only event directly through `Session` without opening a turn. Persistence observes that event eagerly and drains on ordinary lifecycle checkpoints; title publication itself does not force a flush. Automatic failures warn and retain the latest title. New all-message revisions, provider disposal, session disposal, and explicit refresh abort older work, and a stale completion cannot append. Concurrent explicit refreshes reserve their revision before provider work, while overlapping automatic and explicit fallback requests share one session-local in-flight append. The service and bundled model provider each append their own literal event type, so no generic title-write marker, cast, or settlement queue is needed. Service teardown cancels queued work and drains calls that ignore cancellation before unloading completes.

Forks inherit title events in their seed unchanged. The first-prompt cadence does not automatically retitle a child; the all-messages cadence may append a new revision after the child receives a later human prompt.

<a id="pkg-taskweaver-dsh-session-title--configuration"></a>
#### Configuration

All limits are required; the library supplies no defaults.

| Key | Contract |
|---|---|
| `fallbackMaxWords` | Positive maximum whitespace-delimited words in the deterministic fallback. |
| `fallbackMaxBytes` | Positive maximum UTF-8 bytes in the fallback; must not exceed `maxTitleBytes`. |
| `maxTitleBytes` | Positive maximum UTF-8 bytes accepted from any source. |

<a id="pkg-taskweaver-dsh-session-title--provider-contract"></a>
#### Provider contract

A provider supplies a branded stable id, automatic mode (`first-prompt` or `all-prompts`), and `generate(request)`. The request carries the live session, all eligible messages through one fixed revision, the current logged main-request route when available, and cancellation. The result identifies a non-empty title, unique ordered source-message seqs from that request, and the optional provider/model route used to generate it. The service normalizes and validates the result before it becomes durable.

See the [session-title data structures]（原文链接目标：`../../../docs/subsystems/session-title.md`） and [implemented decision]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-21-log-backed-session-titles.md`）.

<a id="pkg-taskweaver-dsh-session-title--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-session-title--session-title-state"></a>
##### Session title state

<a id="pkg-taskweaver-dsh-session-title--what-the-model-sees"></a>
###### What the model sees

Nothing. `session/title` is log-only and never enters the session surface, `deriveMessages()`, system prompt, tool schemas, or request prefix.

<a id="pkg-taskweaver-dsh-session-title--token-effect"></a>
###### Token effect

The fallback and accepted provider revisions add zero tokens to the main agent request. An optional provider's separate auxiliary request is documented by that provider package.

<a id="pkg-taskweaver-dsh-session-title--kv-cache-effect"></a>
###### KV Cache effect

None for the main request; title events do not change its reconstructed content or cache key.

<a id="pkg-taskweaver-dsh-session-title--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- Title deletion (unpinning back to automatic titles without an explicit `refresh`), search, and list indexing are outside this service.
- The provider registry deliberately accepts at most one implementation, so a deployment cannot compose competing title strategies without writing one provider that owns their precedence.

<a id="pkg-taskweaver-dsh-session-title-first-prompt-llm"></a>
### `@taskweaver/dsh-session-title-first-prompt-llm`

<!-- migrated-from: packages/runtime/session/session-title-first-prompt-llm/README.md -->
目录：`session/session-title-first-prompt-llm`。
package.json 描述：First-message LLM provider plugin for DeepSeek Harness session titles

<a id="pkg-taskweaver-dsh-session-title-first-prompt-llm--taskweaver-dsh-session-title-first-prompt-llm"></a>
Optional `ctx.sessionTitle` provider that summarizes the first eligible human message through `ctx.llm`. It registers the `first-prompt` cadence, runs automatically only when a fresh non-fork session first creates its fallback, and attributes the result to that message's exact seq. An automatic failure retains the fallback and is retried only through `ctx.sessionTitle.refresh()`.

The plugin uses the complete required [shared LLM configuration](./README.zh.md#pkg-taskweaver-dsh-session-title-llm--configuration). Omit both `provider` and `model` to inherit the exact route from the current logged main request, or set both to route title generation independently.

<a id="pkg-taskweaver-dsh-session-title-first-prompt-llm--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-session-title-first-prompt-llm--first-message-title-request"></a>
##### First-message title request

<a id="pkg-taskweaver-dsh-session-title-first-prompt-llm--what-the-model-sees"></a>
###### What the model sees

The title model receives the shared title instruction and a JSON array containing only the first eligible human message. Later prompts and inherited fork history do not trigger another automatic call.

<a id="pkg-taskweaver-dsh-session-title-first-prompt-llm--token-effect"></a>
###### Token effect

At most one automatic auxiliary request is made for a fresh session, bounded by `maxInputBytes` and `maxOutputTokens`; explicit refreshes may make additional calls. The main agent request gains zero tokens.

<a id="pkg-taskweaver-dsh-session-title-first-prompt-llm--kv-cache-effect"></a>
###### KV Cache effect

No main-request invalidation. The auxiliary request uses the configured or logged route and has provider-specific cache behavior.

<a id="pkg-taskweaver-dsh-session-title-first-prompt-llm--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- The first message alone may cease to represent a long-running session; use the all-messages provider when later prompts should retitle it.
- A fork keeps its inherited title and never runs this provider automatically, even when its seeded first message came from the parent.

<a id="pkg-taskweaver-dsh-session-title-llm"></a>
### `@taskweaver/dsh-session-title-llm`

<!-- migrated-from: packages/runtime/session/session-title-llm/README.md -->
目录：`session/session-title-llm`。
package.json 描述：Shared LLM generation policy for DeepSeek Harness session-title providers

<a id="pkg-taskweaver-dsh-session-title-llm--taskweaver-dsh-session-title-llm"></a>
Shared implementation policy for model-backed session-title providers. It resolves the auxiliary route, frames exact selected human messages as JSON, records the exact dispatchable request, applies a language-aware title instruction, enforces input and output budgets, composes timeout and caller cancellation, assembles the stream, and returns normalized text with exact source seqs plus the provider/model route used to generate it.

This package is a library, not a Cordis plugin. The provider plugins call `registerSessionTitleLlmProvider()` with their cadence and message selector; it validates shared config and delegates each revision to `generateSessionTitleWithLlm()`, so registration, route, prompt, cancellation, and validation behavior cannot drift between them.

<a id="pkg-taskweaver-dsh-session-title-llm--route-and-failure-contract"></a>
#### Route and failure contract

`provider` and `model` overrides are optional but must be supplied together as non-empty strings. Without that pair, the helper uses the exact provider/model route captured from the current session's logged `request/header`; an explicit refresh before any route exists therefore needs overrides. The helper measures the final JSON-framed user prompt, including seq fields, wrappers, and JSON escaping, against `maxInputBytes` before logging or dispatch instead of truncating it. Timeout and caller cancellation are rechecked while consuming the stream and after it completes, so a late successful result cannot be accepted even if an interceptor or adapter ignores abort. Malformed or empty output, tool calls, and non-stop finish reasons also reject; the session-title service decides whether that rejection is an automatic warning or an explicit caller failure.

After route and input validation, the helper appends a log-only `session/title-llm-request` event directly through `Session` before model dispatch. It contains the title-provider id, exact source seqs, route, system prompt, message list, and output-token cap used by the call. Persistence observes the record eagerly; the append does not need a title-specific marker, cast, settlement queue, or flush. The dispatched envelope is deep-frozen, carries `purpose: 'session-title'`, and deliberately lacks dsh-agent-loop's process-local request identity. Interceptors stay aligned with the record while loop-only reconstruction observers do not compare it with the conversation header. The DeepSeek adapter maps that purpose to thinking-disabled so the small output budget is reserved for visible title text; other adapters own their purpose-specific behavior. A later model failure leaves the request record intact; validation failures that never become dispatchable requests do not create one. The event stays outside derived model history.

<a id="pkg-taskweaver-dsh-session-title-llm--configuration"></a>
#### Configuration

Every field is required except the paired route override; there are no library defaults.

| Key | Contract |
|---|---|
| `targetWords` | Positive target word count for non-CJK titles. |
| `targetCjkCharacters` | Positive target character count for Chinese, Japanese, or Korean titles. |
| `maxInputBytes` | Positive UTF-8 byte ceiling for the final JSON-framed user prompt. |
| `maxOutputTokens` | Positive auxiliary generation token cap. |
| `timeoutMs` | Positive end-to-end deadline within the runtime timer limit. |
| `provider`, `model` | Optional explicit route; both or neither. |

<a id="pkg-taskweaver-dsh-session-title-llm--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-session-title-llm--auxiliary-title-request"></a>
##### Auxiliary title request

<a id="pkg-taskweaver-dsh-session-title-llm--what-the-model-sees"></a>
###### What the model sees

The title model receives a fixed system instruction to return one concise unadorned title in the input language, including the configured word and CJK-character targets. Its one user message contains a JSON array of the exact selected human messages and their seqs.

<a id="pkg-taskweaver-dsh-session-title-llm--token-effect"></a>
###### Token effect

The auxiliary request consumes tokens according to selected input size and `maxOutputTokens`. It is separate from the main agent request and does not add title text or framing to agent history. DeepSeek title calls disable thinking; the main conversation retains its configured thinking mode.

<a id="pkg-taskweaver-dsh-session-title-llm--kv-cache-effect"></a>
###### KV Cache effect

No main-request invalidation. Auxiliary cache reuse is provider-specific; the fixed instruction is reusable while the JSON message array changes with each revision.

<a id="pkg-taskweaver-dsh-session-title-llm--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- The helper accepts text output only and rejects tool calls; structured-output adapters and provider-specific prompt variants are not exposed.
- It enforces a byte ceiling for the whole framed user prompt rather than clipping individual messages or applying a retention policy.

<a id="family-session"></a>
### 原族级说明（迁移保留）

<a id="family-session--session-durable-session-data-plane"></a>
The durable family around `core/session`'s live in-memory service: the persistence seam with its storage backends and checkpoint policy, the projection seam that serves whole log-derived values, log-backed titles, and outbound session telemetry. All **product** packages. `session-query/` remains a sibling group: the read/tool surface is consumed independently of persistence internals.

<a id="family-session--persistence"></a>
#### Persistence

Durable session persistence, semantic checkpoint policy, and the shipped storage backends.

| Package | Role | ctx key |
|---|---|---|
| [`session-persistence/`](./README.zh.md#pkg-taskweaver-dsh-session-persistence) | Defines the persistence service and shared write coordination | `ctx.sessionPersistence` |
| [`session-checkpoint-policy/`](./README.zh.md#pkg-taskweaver-dsh-session-checkpoint-policy) | Applies semantic durability checkpoints | wraps `ctx.llm` and `ctx.tools` |
| [`session-persistence-jsonl/`](./README.zh.md#pkg-taskweaver-dsh-session-persistence-jsonl) | Persists sessions in JSONL files | registers on `ctx.sessionPersistence` |
| [`session-persistence-sqlite/`]（原文链接目标：`session-persistence-sqlite/README.md`） | Opt-in SQLite backend with packed physical chunk rows | registers on `ctx.sessionPersistence` |

The [session-persistence decision]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md`） records the persistence design.

<a id="family-session--projection"></a>
#### Projection

Serves current, log-derived per-session state to client carriers.

| Package | Role | ctx key |
|---|---|---|
| [`session-projection/`](./README.zh.md#pkg-taskweaver-dsh-session-projection) | Defines and drives session projection units | `ctx.sessionProjections` |
| [`session-projection-cache/`](./README.zh.md#pkg-taskweaver-dsh-session-projection-cache) | Persists and restores projection checkpoints | `ctx.sessionProjectionCache` |
| [`session-stats/`](./README.zh.md#pkg-taskweaver-dsh-session-stats) | Serves whole-log conversation counts and wall times (`sessionStats` unit) | registers on `ctx.sessionProjections` |

<a id="family-session--titles"></a>
#### Titles

Derives durable session titles from the session log, with an optional model-backed provider.

| Package | Role | ctx key |
|---|---|---|
| [`session-title/`](./README.zh.md#pkg-taskweaver-dsh-session-title) | Owns title state, fallback behavior, provider registration, and refresh | `ctx.sessionTitle` |
| [`session-title-llm/`](./README.zh.md#pkg-taskweaver-dsh-session-title-llm) | Provides shared model-backed title generation | — |
| [`session-title-first-prompt-llm/`](./README.zh.md#pkg-taskweaver-dsh-session-title-first-prompt-llm) | Titles a session from its first eligible human message | registers on `ctx.sessionTitle` |
| [`session-title-all-prompts-llm/`]（原文链接目标：`session-title-all-prompts-llm/README.md`） | Titles a session from all eligible human messages | registers on `ctx.sessionTitle` |

Deployments may register one model-backed provider; the service retains a deterministic fallback when none is present.

<a id="family-session--sessiontelemetrybackend"></a>
#### SessionTelemetryBackend

Projects session activity into outbound telemetry and delegates delivery to a configured reporting backend. The [telemetry decision]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md`） records the reporting boundary and delivery responsibilities.

| Package | Role |
|---|---|
| [`session-telemetry/`](./README.zh.md#pkg-taskweaver-dsh-session-telemetry) | Defines capture, redaction, projection, and live or on-demand backend delivery. |

The subsystem references: [persistence.md]（原文链接目标：`../../docs/subsystems/persistence.md`）, [session-projection.md]（原文链接目标：`../../docs/subsystems/session-projection.md`）, [session-title.md]（原文链接目标：`../../docs/subsystems/session-title.md`）, and [session-telemetry.md]（原文链接目标：`../../docs/subsystems/session-telemetry.md`）. Only one title provider may register at a time; the demo spine mounts the fallback service and leaves both model providers out of default composition.
