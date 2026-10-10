# workspace 包族

<a id="family-workspace"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

维护工作区目录、标题和有序会话成员关系。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-workspace`](#pkg-taskweaver-dsh-workspace) | `workspace/workspace` | [接口与限制](#pkg-taskweaver-dsh-workspace) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-workspace"></a>
### `@taskweaver/dsh-workspace`

<!-- migrated-from: packages/runtime/workspace/workspace/README.md -->
目录：`workspace/workspace`。
package.json 描述：Workspace entity registry (ctx.workspaceRegistry): durable workspace records with validated session attachment over the domain data form for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-workspace--taskweaver-dsh-workspace"></a>
Workspace entity registry (`ctx.workspaceRegistry`) for the DeepSeek Harness: durable workspace records, stable workspace order, and a newest-first candidate session index stored through the domain data form. Consumers see the `Workspace` interface; the entity implementation stays package-private.

The entity/storage rationale lives in the [domain Agent Note]（原文链接目标：`../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md`）; header-only bootstrap and GUI ordering live in the [Workspace UI product-flow Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-25-workspace-ui-product-flow.md`）.

<a id="pkg-taskweaver-dsh-workspace--shape"></a>
#### Shape

- `ctx.workspaceRegistry.create(path, title?)` — canonicalizes `path` via `fs.realpath`, rejects a nonexistent or non-directory path, creates at most one record per canonical path, and prepends a new record to durable workspace order. Repeated calls for that path return the existing workspace without changing its title; different paths may share a display title.
- `ctx.workspaceRegistry.get(id)` / `list()` / `resolveByPath(path)` — cache-served lookups. `list()` is synchronous and follows durable registry order; `resolveByPath` is async because it applies the same `realpath` canon and rejects a missing path rather than creating it.
- `ctx.workspaceRegistry.insertBefore(id, before?)` — moves a registered Workspace within durable registry order, DOM-insertBefore-like: before the anchor, or appended when the anchor is omitted. A source or anchor absent from the registry rejects without writing; a self-anchor or move to the current position resolves without writing. The returned id list is the complete committed order.
- `ctx.workspaceRegistry.delete(id)` — removes only the Workspace registration, its durable order entry, and its session account. Unknown ids return `false`; a removed record returns `true`. The directory, user files, live Sessions, and persisted session logs are never touched, so those Sessions become Ungrouped. A table-write failure restores the prior order and published entity.
- `Workspace.attachSession(id)` — validates a live or persisted session header cwd against the workspace path and prepends a new id. Unknown sessions, absent/unresolvable/non-directory cwd values, and mismatches reject without writing. `detachSession` removes only the candidate index entry.
- `Workspace.insertSessionBefore(id, before?)` — moves an accounted session within the manual order, DOM-insertBefore-like: before the anchor, or appended when the anchor is omitted. A session or anchor absent from the account rejects without writing; a move to the current position resolves without writing. Registry Workspace order never changes.
- `ctx.workspaceRegistry.archiveSession(id)` / `archivedSessionIds` — the registry-global archive set, layered over workspace accounting: an archived session disappears from grouping surfaces but keeps its session log and its `sessionIds` slot, so a future unarchive restores its position. Archiving accepts any live or persisted session (accounted or Ungrouped), resolves without writing for an already archived id, and rejects an unknown id. State written before the field existed parses with an empty set.
- `Workspace.sessionIds` — synchronous id-plus-canonical-cwd membership projection in durable candidate order. Missing headers, invalid cwd values, and mismatches are filtered; the next workspace mutation prunes them. A medium indexing one session under two workspaces, claiming one path from two records, or diverging from durable workspace order rejects at startup.
- `Workspace.status()` — uncached directory check, `'ok' | 'missing-dir'`; a missing directory never mutates the record.

`storageDomain` and `sessionPersistence` are required startup dependencies. An unavailable peer leaves the plugin pending and cannot commit an empty initialized marker. On the first successful start, the registry calls `SessionPersistence.list()` and uses only header `id`, `cwd`, and `createdAt` to group valid historical directories and persist initial order; it never reads event bodies. The initialized marker is written last, so partial bootstrap writes are reused safely after restart. Later cwd-only sessions remain Ungrouped until an explicit `attachSession`, `session.create` with a workspace, or an import path that attaches them.

Create and delete persist an explicit pending-mutation marker before their record and order can diverge. Startup completes only the marked mutation, then clears the marker; an unmarked order/table mismatch remains unexplained corruption and fails loud. Deleting and re-registering the same path creates a fresh Workspace id and does not automatically re-adopt the retained Sessions.

<a id="pkg-taskweaver-dsh-workspace--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-workspace--workspace-records-and-session-accounts"></a>
##### Workspace records and session accounts

<a id="pkg-taskweaver-dsh-workspace--what-the-model-sees"></a>
###### What the model sees

Nothing. `ctx.workspaceRegistry` serves workspace records to host-side consumers only: the package registers no tools, injects no prompts, and writes no session events, so no request field ever carries this package's data.

<a id="pkg-taskweaver-dsh-workspace--token-effect"></a>
###### Token effect

Zero direct tokens on every request.

<a id="pkg-taskweaver-dsh-workspace--kv-cache-effect"></a>
###### KV Cache effect

Independent of live requests: the package never touches a request prefix, so it cannot invalidate provider cache reuse.

<a id="pkg-taskweaver-dsh-workspace--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- Session deletion and destructive folder removal are separate, absent capabilities; Workspace registration deletion never substitutes for either ([decision]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.md`）).
- The header index refreshes at startup and when attach must resolve an uncached persisted id; deletion or cwd damage performed by another process is observed after the next refresh or restart.

<a id="family-workspace"></a>
### 原族级说明（迁移保留）

<a id="family-workspace--workspace-workspace-entity-family"></a>
This family owns persistent workspaces: user directories with titles and ordered session membership.

| Package | Role | ctx key |
|---|---|---|
| [`workspace/`](./README.zh.md#pkg-taskweaver-dsh-workspace) | Registers workspaces and accounts for their sessions | `ctx.workspaceRegistry` |

The [workspace package reference](./README.zh.md#pkg-taskweaver-dsh-workspace) owns lifecycle, persistence, and deletion semantics.

The subsystem reference — the entity, realpath canon, registration/resolution — is [docs/subsystems/workspace.md]（原文链接目标：`../../docs/subsystems/workspace.md`）; storage design in the [domain KV storage Agent Note]（原文链接目标：`../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md`）.
