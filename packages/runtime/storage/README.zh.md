# storage 包族

<a id="family-storage"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

为非会话数据提供具名存储后端和领域化数据形式。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-storage`](#pkg-taskweaver-dsh-storage) | `storage/storage` | [接口与限制](#pkg-taskweaver-dsh-storage) |
| [`@taskweaver/dsh-storage-domain`](#pkg-taskweaver-dsh-storage-domain) | `storage/storage-domain` | [接口与限制](#pkg-taskweaver-dsh-storage-domain) |
| [`@taskweaver/dsh-storage-json`](#pkg-taskweaver-dsh-storage-json) | `storage/storage-json` | [接口与限制](#pkg-taskweaver-dsh-storage-json) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-storage"></a>
### `@taskweaver/dsh-storage`

<!-- migrated-from: packages/runtime/storage/storage/README.md -->
目录：`storage/storage`。
package.json 描述：Storage hub (ctx.storage): named backend registry plus mounted data-form facilities for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-storage--taskweaver-dsh-storage"></a>
Storage hub (`ctx.storage`) for non-session data: a named backend registry plus mounted data-form facilities. The hub performs no IO itself — backends own media, and data forms own semantics. The [storage family overview](./README.zh.md#family-storage) maps those packages; the [domain KV storage Agent Note]（原文链接目标：`../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md`） records the design rationale.

<a id="pkg-taskweaver-dsh-storage--shape"></a>
#### Shape

- `ctx.storage.backend` — name → backend table. Multiple backends stay mounted side by side (`json`, `sqlite`); which backend serves a consumer is that consumer's configuration (the domain layer's route table), never a hub-global choice. `register()` returns the disposer; duplicate names and unknown lookups fail loud.
- `ctx.storage.mount(form, facility)` / `ctx.storage.form(form)` — data-form mounting. `StorageForms` is merge-extensible; the domain layer merges `domain` and is reached as `ctx.storage.domain`.
- A backend owns one medium and exposes the data-shape facets it supports. `kv` is the current facet; `src/backend.ts` owns its exact contract.

<a id="pkg-taskweaver-dsh-storage--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-storage--backend-and-form-registrations"></a>
##### Backend and form registrations

<a id="pkg-taskweaver-dsh-storage--what-the-model-sees"></a>
###### What the model sees

Nothing. `ctx.storage` is a host-side registration table; the hub registers no tools, injects no prompts, and writes no session events.

<a id="pkg-taskweaver-dsh-storage--token-effect"></a>
###### Token effect

Zero direct tokens on every request.

<a id="pkg-taskweaver-dsh-storage--kv-cache-effect"></a>
###### KV Cache effect

Independent of live requests: the hub never touches a request prefix, so it cannot invalidate provider cache reuse.

<a id="pkg-taskweaver-dsh-storage--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **`kv` is the only data shape** — backends currently have one facet to implement.
- **Forms resolve lazily** — reading `ctx.storage.domain` before the domain plugin mounts throws `form-not-mounted`; assemblies order plugins accordingly (misconfiguration fails loud rather than silently deferring).

<a id="pkg-taskweaver-dsh-storage-domain"></a>
### `@taskweaver/dsh-storage-domain`

<!-- migrated-from: packages/runtime/storage/storage-domain/README.md -->
目录：`storage/storage-domain`。
package.json 描述：Domain data form (ctx.storage.domain): schema-validated, event-emitting KV domains over storage backends for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-storage-domain--taskweaver-dsh-storage-domain"></a>
Domain data form for the DeepSeek Harness storage hub: exposes the injectable `ctx.storageDomain` service and the matching `ctx.storage.domain` projection after every configured backend is registered. A domain is declared once with `defineDomain` (zod record schemas, `z.infer`-derived types), opened through `DomainFacility.open`, and served from authoritative in-memory state — reads are synchronous, writes serialize on one per-domain chain, reach durability on the routed backend first, then update memory and emit `domain/changed`. The opening consumer owns the handle's lifecycle and releases it with `Domain.close()` (idempotent; typically its own `ctx.effect` disposer); domains still open when the plugin unmounts are closed by the facility.

Design rationale, open semantics, and the storage/domain layer split live in the [Agent Note]（原文链接目标：`../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md`）.

<a id="pkg-taskweaver-dsh-storage-domain--configuration"></a>
#### Configuration

| key | meaning |
| --- | --- |
| `backend` | Default backend name for every domain (required; no universally correct medium exists). |
| `routes` | Per-domain overrides: domain name → backend name. |

<a id="pkg-taskweaver-dsh-storage-domain--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-storage-domain--durable-domain-state"></a>
##### Durable domain state

<a id="pkg-taskweaver-dsh-storage-domain--what-the-model-sees"></a>
###### What the model sees

Nothing. The package registers no tools, injects no prompts, and appends no session events; it stores non-session data (workspace records, future session sidecars) behind `ctx.storageDomain` and emits only the in-process `domain/changed` event, which reaches a model only if a Consumer package renders it through its own documented surface.

<a id="pkg-taskweaver-dsh-storage-domain--token-effect"></a>
###### Token effect

Zero. No text from this package enters any model request.

<a id="pkg-taskweaver-dsh-storage-domain--kv-cache-effect"></a>
###### KV Cache effect

Independent: domain reads and writes never touch request prefixes, so nothing here can invalidate provider cache reuse.

<a id="pkg-taskweaver-dsh-storage-domain--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Single-process change visibility** — `domain/changed` is an in-process event; a second host process or a reconnecting GUI observes no changes until the cross-process revision pattern deferred in the Agent Note lands.
- **No cross-table transactions, secondary indexes, or multi-segment keys** — each write touches one record; triggers and rework points for these extensions are tabled in the Agent Note's deferred-work list.

<a id="pkg-taskweaver-dsh-storage-json"></a>
### `@taskweaver/dsh-storage-json`

<!-- migrated-from: packages/runtime/storage/storage-json/README.md -->
目录：`storage/storage-json`。
package.json 描述：JSON file KV storage backend for the DeepSeek Harness storage hub

<a id="pkg-taskweaver-dsh-storage-json--taskweaver-dsh-storage-json"></a>
JSON backend for the [storage hub](./README.zh.md#pkg-taskweaver-dsh-storage): one human-readable `<unit>.json` file per unit under a configured root, registered as backend `json`. Design: [domain KV storage Agent Note]（原文链接目标：`../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md`）.

<a id="pkg-taskweaver-dsh-storage-json--model"></a>
#### Model

- The in-memory unit state is authoritative; every write primitive republishes the whole file via temp-write + fsync + atomic `rename()` replace. A unit file is always the complete current net state — legibility is this backend's reason to exist; scale is the SQLite backend's job.
- A missing file opens as an empty unit and materializes on the first write. A foreign or unparsable file rejects with `malformed-medium`; a stored version differing from the descriptor rejects with `version-mismatch` (no migration, pre-release stance).
- Write ordering across calls belongs to the caller (the domain layer's write chain); each single call is atomic and durable once resolved.

<a id="pkg-taskweaver-dsh-storage-json--config"></a>
#### Config

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `root` | string | required — no default (a cwd fallback would scatter files) | Directory holding unit files; created `0o700` on demand |

<a id="pkg-taskweaver-dsh-storage-json--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-storage-json--stored-domain-records"></a>
##### Stored domain records

<a id="pkg-taskweaver-dsh-storage-json--what-the-model-sees"></a>
###### What the model sees

Nothing. This backend contributes no prompt, tool, or schema; it persists non-session domain data behind `ctx.storage` for host-side consumers only.

<a id="pkg-taskweaver-dsh-storage-json--token-effect"></a>
###### Token effect

Zero live-request tokens.

<a id="pkg-taskweaver-dsh-storage-json--kv-cache-effect"></a>
###### KV Cache effect

None — the backend never touches live request prefixes.

<a id="pkg-taskweaver-dsh-storage-json--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- Windows durability relies on libuv's `rename()` (`MoveFileExW` with replacement) without an explicit write-through flag; the session-log backend's stricter Win32 write-through publish helper is planned to move down here when the append-log facet lands (see the Agent Note's migration section).
- No cross-process write locking: two processes writing the same root can interleave whole-file replacements (last write wins). Single-host-process deployments are the current consumer; the multi-process story is deferred per the Agent Note's out-of-scope table.

<a id="family-storage"></a>
### 原族级说明（迁移保留）

<a id="family-storage--storage-non-session-storage-family"></a>
This family persists application data other than session event logs through named backends and typed data forms.

| Package | Role | ctx key |
|---|---|---|
| [`storage/`](./README.zh.md#pkg-taskweaver-dsh-storage) | Connects registered backends with typed data forms | `ctx.storage` |
| [`storage-json/`](./README.zh.md#pkg-taskweaver-dsh-storage-json) | Stores data in JSON files | registers backend `json` |
| [`storage-sqlite/`]（原文链接目标：`storage-sqlite/README.md`） | Stores data in SQLite | registers backend `sqlite` |
| [`storage-domain/`](./README.zh.md#pkg-taskweaver-dsh-storage-domain) | Provides validated domain-record storage | `ctx.storageDomain` |

Consumers use a data form rather than accessing a backend directly. The [domain storage decision]（原文链接目标：`../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md`） records the family design.

The subsystem reference — the backend contract, `StorageForms`, `DomainSpec`/`Domain`, `domain/changed` — is [docs/subsystems/storage.md]（原文链接目标：`../../docs/subsystems/storage.md`）.
