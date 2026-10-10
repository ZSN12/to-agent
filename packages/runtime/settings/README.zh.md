# settings 包族

<a id="family-settings"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义用户设置命名空间和可替换的设置持久化提供者。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-settings`](#pkg-taskweaver-dsh-settings) | `settings/settings` | [接口与限制](#pkg-taskweaver-dsh-settings) |
| [`@taskweaver/dsh-settings-file`](#pkg-taskweaver-dsh-settings-file) | `settings/settings-file` | [接口与限制](#pkg-taskweaver-dsh-settings-file) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-settings"></a>
### `@taskweaver/dsh-settings`

<!-- migrated-from: packages/runtime/settings/settings/README.md -->
目录：`settings/settings`。
package.json 描述：Abstract user-settings seam (ctx.settings) for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-settings--taskweaver-dsh-settings"></a>
User-settings Service Definition (`ctx.settings`). One provider holds a raw document of per-namespace sections; plugins register a namespace schema and read a resolved value layered as schema defaults, then the registrant's composition `base` (its cordis.yml entry-config subset), then the user document section. Without a mounted provider nothing changes for consumers: they keep resolving entry config alone, so every composition works with or without settings.

<a id="pkg-taskweaver-dsh-settings--service-api"></a>
#### Service API

- `documentPath` — absolute path of the provider's user-editable file when it has one; non-file providers leave it `undefined`. Host configuration adapters derive availability from it, while browser protocols expose only a boolean capability and never a filesystem target.
- `prepareDocument()` — return that path after making the document ready for a native editor. The base implementation returns `documentPath`; a file provider may materialize an absent document first.
- `register(ns, schema, { base?, applies? })` — returns the owner `SettingsScope` (`get`/`watch`/`update`). The registration is an effect on the calling plugin's fiber: disposing that fiber removes the namespace and its observers. A stored section the schema rejects fails the registration itself; a duplicate namespace fails loud.
- `describe(options?)` — one descriptor per namespace (`schema.toJSON()` envelope, resolved value, detached `base`/`user` layers, `applies`) for configuration surfaces; a field's presence in `user` is what marks it user-overridden. `describe({ redactSecrets: true })` strips `role('secret')` fields from every layer and adds the `secrets` slot list (`{ path, set }`); every wire surface MUST pass it, and the pure `redactSecrets(schema, value)` walker is exported for other wires.
- `get(ns)` — resolved value, `undefined` while unregistered.
- `update(ns, patch)` — deep-merges the plain-object patch into the user section only (never the `base`), validates the resolved candidate, persists through the provider, then commits. Patches may contain only JSON-compatible data: a Date, Map, BigInt, non-finite number, or circular reference rejects with its `$`-rooted path before anything persists (YAML/JSON storage would silently change such values on reload). Validation failure rejects before anything is persisted; a read-only provider (`writable: false`) rejects every write. Writes to one namespace are serialized in call order.
- `replace(ns, section)` — sets the user section wholesale: the deliberate reset (`replace({})` re-inherits `base` and schema defaults).
- `mutate(ns, ops)` — applies ordered `{ op: 'set' | 'unset', path }` edits to the section as it stands when the write reaches the front of the queue. This is the removal path for any caller holding an INCOMPLETE view: a configuration UI reads the redacted descriptor, so rebuilding a section from it and replacing wholesale deletes every secret the wire never returned, while an op names the one field it means.
- Every write takes an optional `expectedRevision`. Each descriptor carries the namespace's `revision`, a monotonic counter over its RAW section; a write whose expectation no longer matches rejects with `SettingsConflictError` (`code: 'SETTINGS_CONFLICT'`, both revisions attached) instead of overwriting the writer that landed first. The write queue orders writes but cannot by itself tell a fresh writer from one holding a stale snapshot.
- Resolved values are deep-frozen snapshots. Watchers receive `(next, prev)` after each commit: invocations of one callback run asynchronously, one at a time, in commit order (a slow stale invocation can never apply after a newer one), and failures — sync throws and async rejections alike — are contained. After a watch disposer returns, no further invocation starts (one already queued is skipped); an invocation already started still settles. The `settings/updated` event fans out one listener at a time, so one throwing listener cannot starve the rest; an async listener's rejection is contained and logged, which is why `INVARIANT`-coded failures rethrow only from synchronous listeners.
- Service teardown refuses new writes and watcher starts, then drains every queued write and every started watcher invocation before disposal completes; a write whose registrant fiber was disposed mid-flight still reaches storage but commits and notifies nobody.

<a id="pkg-taskweaver-dsh-settings--provider-contract"></a>
#### Provider contract

Subclasses implement `writable`, `load()`, and `persist(ns, section)`, optionally override `documentPath` and `prepareDocument()` for one local user-editable file, and push externally observed documents through the protected `publish(doc)`. The base service init loads and publishes the document once before the service becomes injectable; a provider with its own init (watcher, connection) delegates first via `yield* super[Service.init]()`. At publish, each registered namespace re-resolves independently: an invalid section keeps that namespace's last good value and warns — a live reload never takes the process down — while boot-time and registration-time validation fail loud.

<a id="pkg-taskweaver-dsh-settings--events"></a>
#### Events

`settings/updated (ns, next, prev, source)` fires after each commit; `source` is `update` (in-process write) or `provider` (external change). It never fires for a deep-equal resolved value — it is the consumer-facing event, and a consumer only cares that its value moved.

`settings/document-updated (ns, revision)` fires whenever the RAW user section changes, whether or not the resolved value did. Configuration surfaces need this one: storing an override equal to the composition base leaves the resolved value alone but changes what the document says (the field is now overridden, not inherited) and moves the revision every open editor is holding. Listener containment matches `settings/updated`.

Both declarations live in the client-safe `./types` subpath export, together with the `SettingsNamespace` and `SettingsUpdateSource` types their signatures name; the package root re-exports those types. A consumer outside the Host compilation face therefore reads the very signature the Host emits instead of restating it.

<a id="pkg-taskweaver-dsh-settings--model-experience"></a>
#### Model Experience

Indirectly, through consumer plugins that resolve model-affecting values (for example a default model route) from their namespaces; each consumer's own surface documents the effect.

<a id="pkg-taskweaver-dsh-settings--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; a consumer that folds a settings value into the request prefix owns that change.

<a id="pkg-taskweaver-dsh-settings--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Single user layer** — resolution knows schema defaults, one composition `base`, and one user document; it does not yet record which layer supplied each resolved value.
- **`redactSecrets` is not a proven wire boundary** — the walker follows `object`/`dict`/`array`, so a `role('secret')` reached only through a union, intersection, or transform is returned VERBATIM with an empty `secrets` list, and `schema.toJSON()` carries a secret field's `.default(...)` to every client. Neither case is rejected; a schema whose secrets are not reachable through the walked containers must not be registered on a wire-exposed namespace. A fail-closed `describeForWire()` — one that refuses a schema it cannot prove safe, and sanitizes the serialized envelope and error text — is the real answer and is deferred.
- **Cross-process concurrency is provider-defined** — the seam serializes writes per namespace in-process only; concurrent processes converge by provider behavior (the local file provider read-modify-writes under a writer lock, so namespaces survive concurrent writers and same-namespace conflicts resolve last-write-wins).

<a id="pkg-taskweaver-dsh-settings-file"></a>
### `@taskweaver/dsh-settings-file`

<!-- migrated-from: packages/runtime/settings/settings-file/README.md -->
目录：`settings/settings-file`。
package.json 描述：File-backed settings provider (settings.yaml) for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-settings-file--taskweaver-dsh-settings-file"></a>
File-backed settings provider. One YAML or JSON document carries every namespace section; external edits hot-publish through `ctx.settings`, and `update()` re-reads the document under a writer lock before writing back atomically, preserving the user's YAML comments, any section owned by a plugin that is not currently loaded, and any on-disk change this process has not observed yet.

<a id="pkg-taskweaver-dsh-settings-file--config"></a>
#### Config

| Field | Meaning | Default |
|---|---|---|
| `path` | Settings document path; extension picks the format (`.yaml`/`.yml`/`.json`) | `settings.yaml` under the harness home |
| `dshHome` | Runtime home used when `path` is omitted | `$TASKWEAVER_HOME` or `~/.taskweaver/runtime` |
| `watch` | Watch the document and hot-publish external edits | `true` |
| `debounceMs` | Watcher write-settle window in milliseconds | `100` |

Defaulting is one explicit `resolveSpec(config)` step; an unsupported extension fails at load.

<a id="pkg-taskweaver-dsh-settings-file--behavior"></a>
#### Behavior

- **Boot fails loud, reload keeps last-good.** An existing-but-invalid document fails plugin load; once live, an unreadable or unparsable edit warns and keeps the last good sections. A missing document resolves every namespace from defaults and `base`; deleting it publishes the same empty state.
- **Every write is a read-modify-write.** A persist first re-reads the document and publishes any difference into the seam — an external edit still inside the watcher debounce window, a change the watcher missed, or another process's write — then renders against that fresh text, so a write can never resurrect a stale document or drop an unobserved sibling section. If the on-disk document turned invalid, the write rejects loud instead of overwriting the user's manual edit.
- **Writes hold a cross-process writer lock.** The read-render-rename cycle runs under a `wx`-created `<file>.lock` sibling with exponential backoff and a 2 s acquisition deadline. A contender times out without removing the existing lock because age cannot distinguish a crashed owner from a paused live writer; orphan recovery is an operator action. Readers never take the lock: the rename commit is atomic, so reloads are always consistent.
- **Write-back is atomic, owner-only, and symlink-proof.** The render exclusive-creates a random-suffix temp sibling with mode `0600` (`wx` refuses to follow a planted symlink) and renames over the target, cleaning the temp up on failure.
- **YAML edits are leaf-level diffs.** A write sets only the values that changed and deletes only the keys that were removed, so comments, anchors, and formatting survive on every untouched node and on the key of every changed pair; a changed array (or other non-map value) replaces wholesale, taking comments inside it along. JSON re-serializes without comments.
- **Reloads and writes share one operation chain.** Watcher refreshes and persists from every namespace queue run one at a time in queue order; each render sees the text the previous operation committed.
- **The watcher's ready signal reconciles once.** The initial load races the watcher's own setup, so a change written in between never fires an event; the reconcile at ready closes that startup gap.
- **The native watcher receives a canonical path.** Before Chokidar opens the target, the provider realpaths its deepest existing ancestor and restores any missing suffix. File access and user-facing diagnostics retain the configured path, while Windows cannot mix an 8.3 alias with long-form event paths inside libuv.
- **Dispose quiesces in every watch mode.** Teardown marks the provider closed, closes the watcher when present, then waits out every queued or in-flight document operation, so nothing publishes after disposal.
- **Self-write suppression by content.** The provider caches the last good text; a watcher event whose content equals the cache (its own write included) is a no-op.
- **Host configuration adapters receive the resolved path.** `ctx.settings.documentPath` is the absolute `resolveSpec()` filename, including a custom YAML/JSON path; `prepareDocument()` preserves an existing file or exclusively creates an absent empty file with owner-only permissions before the Host opens it. The browser receives only an availability flag, never reconstructs `$TASKWEAVER_HOME`, and never submits a filesystem target.

<a id="pkg-taskweaver-dsh-settings-file--model-experience"></a>
#### Model Experience

Indirectly, through consumers of `ctx.settings`: this provider only stores and publishes namespace sections, and each consumer's own surface documents any model effect.

<a id="pkg-taskweaver-dsh-settings-file--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the consuming plugin owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-settings-file--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Same-namespace conflicts stay last-write-wins** — the writer lock and read-modify-write keep concurrent writers from dropping each other's namespaces, but two writers editing one namespace still resolve to the later write; there is no per-value merge or revision check.
- **A missed watcher event stays unseen until the next signal** — reads never re-stat the file, so a change the watcher fails to report is only folded in by the next event, the next write, or a restart.
- **Comment preservation is YAML-only and map-shaped** — JSON documents re-serialize without comments (JSON has none), and comments inside a changed array (or attached inline to a changed scalar value) go with the value they described.
- **No value indirection** — sections hold literal values; `${env:VAR}`-style references for secrets are a deferred seam-level feature.

<a id="family-settings"></a>
### 原族级说明（迁移保留）

<a id="family-settings--settings-user-settings-capability-family"></a>
This family resolves user-editable configuration through registered namespaces and swappable storage providers.

| Package | Role | ctx key |
|---|---|---|
| [`settings/`](./README.zh.md#pkg-taskweaver-dsh-settings) | Defines namespace registration, layered resolution, and commits | `ctx.settings` |
| [`settings-file/`](./README.zh.md#pkg-taskweaver-dsh-settings-file) | Stores settings in a local file and observes external edits | registers on `ctx.settings` |

The subsystem reference — namespaces, owner scopes, resolution order, hot commits — is [docs/subsystems/settings.md]（原文链接目标：`../../docs/subsystems/settings.md`）.
