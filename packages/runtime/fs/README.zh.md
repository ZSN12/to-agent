# fs 包族

<a id="family-fs"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义文件系统能力、沙箱与观察策略，并提供模型可调用的读写和搜索工具。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-fs`](#pkg-taskweaver-dsh-fs) | `fs/fs` | [接口与限制](#pkg-taskweaver-dsh-fs) |
| [`@taskweaver/dsh-fs-local`](#pkg-taskweaver-dsh-fs-local) | `fs/fs-local` | [接口与限制](#pkg-taskweaver-dsh-fs-local) |
| [`@taskweaver/dsh-fs-observation-policy`](#pkg-taskweaver-dsh-fs-observation-policy) | `fs/fs-observation-policy` | [接口与限制](#pkg-taskweaver-dsh-fs-observation-policy) |
| [`@taskweaver/dsh-fs-sandbox`](#pkg-taskweaver-dsh-fs-sandbox) | `fs/fs-sandbox` | [接口与限制](#pkg-taskweaver-dsh-fs-sandbox) |
| [`@taskweaver/dsh-tool-document`](#pkg-taskweaver-dsh-tool-document) | `fs/tool-document` | [接口与限制](#pkg-taskweaver-dsh-tool-document) |
| [`@taskweaver/dsh-tool-fs`](#pkg-taskweaver-dsh-tool-fs) | `fs/tool-fs` | [接口与限制](#pkg-taskweaver-dsh-tool-fs) |
| [`@taskweaver/dsh-tool-fs-inline-edit`](#pkg-taskweaver-dsh-tool-fs-inline-edit) | `fs/tool-fs-inline-edit` | [接口与限制](#pkg-taskweaver-dsh-tool-fs-inline-edit) |
| [`@taskweaver/dsh-tool-fs-search`](#pkg-taskweaver-dsh-tool-fs-search) | `fs/tool-fs-search` | [接口与限制](#pkg-taskweaver-dsh-tool-fs-search) |
| [`@taskweaver/dsh-tool-fs-semantic-search`](#pkg-taskweaver-dsh-tool-fs-semantic-search) | `fs/tool-fs-semantic-search` | [接口与限制](#pkg-taskweaver-dsh-tool-fs-semantic-search) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-fs"></a>
### `@taskweaver/dsh-fs`

<!-- migrated-from: packages/runtime/fs/fs/README.md -->
目录：`fs/fs`。
package.json 描述：Abstract filesystem capability seam (ctx.fs) for the DeepSeek Harness — vocabulary types, the FileSystem service (text IO + optional version-guarded atomic mutations), and the fs/* policy event vocabulary

<a id="pkg-taskweaver-dsh-fs--taskweaver-dsh-fs"></a>
The **`FileSystem`** (`ctx.fs`) defines the storage primitives in one execution world — resolve paths, expose canonical process paths and file URIs, test containment, read whole or streaming text, read bounded raw bytes, inspect/list metadata, write atomically, and apply a literal edit — without saying HOW. Both mutations take their version guard **optionally**, so `ctx.fs` on its own is a complete, unconstrained storage seam. This package also owns the `fs/*` policy event vocabulary the tool dispatches and the policy plugin listens for.

This package owns the Service Definition and provider contract layer of the four-layer filesystem stack, split so each concern can evolve (and be swapped) independently (see [the capability-seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md`）, [the filesystem capability-seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-17-filesystem-capability-seam.md`）, [the split-the-filesystem-seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/simplification/2026-06-26-fsspec-style-fs-seam.md`）, and [the file-context event-gate Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-26-file-context-as-event-gate.md`）):

| Layer | Package | Role |
|---|---|---|
| tool / executor | `@taskweaver/dsh-tool-fs` | model-facing `read`/`write`/`edit` schemas + read windowing + text rendering; reads/writes/edits via `ctx.fs`, dispatches the `fs/*` events |
| policy | `@taskweaver/dsh-fs-observation-policy` | observed-state + read-before-edit + version-guarded write/edit, contributed through the `fs/*` event gate (no service) |
| provider contract | `@taskweaver/dsh-fs` (this) | `ctx.fs`: execution-world paths, text IO, and atomic mutation primitives (optional version guard); owns the `fs/*` event vocabulary |
| provider | `@taskweaver/dsh-fs-local` | the host-filesystem implementation |

`fs-sandbox` and `fs-e2b` implement this interface without touching the policy/tool layers.

<a id="pkg-taskweaver-dsh-fs--service-api-ctx-fs"></a>
#### Service API (`ctx.fs`)

A backend subclasses `FileSystem` and implements twelve primitives.

| Member | Semantics |
|---|---|
| `resolve(path, opts?)` | Resolve a path into a stable `FsTarget` (opaque `targetKey`, `displayPath`). `opts.cwd` is the base a relative `path` resolves against (a caller supplies its session workspace; absolute paths ignore it; omitted ⇒ the backend default), while `opts.signal` aborts a backend round-trip. Async — a remote backend may need I/O. The same file via different paths must yield the same `targetKey`. |
| `processPath(target)` | Return the canonical absolute path that a subprocess in this provider's execution world can open. This is intentionally distinct from opaque `targetKey`. |
| `fileUrl(target)` | Return the canonical `file:` URI in the execution world's platform syntax. The backend, not the host process, owns encoding. |
| `contains(parent, child)` | Test canonical identity/descendant containment without exposing or parsing target keys. Both targets come from this provider. |
| `stat(target, signal?)` | Return `FsInfo` metadata (`version`, `type`, optional `size`), or `undefined` when the target is absent. Never content. |
| `lstat(path, opts?, signal?)` | Return `FsPathInfo` metadata without following the final path component when it is a symlink. This is path-shaped so consumers can reject repository-owned symlinks before `resolve` follows them into a target. |
| `readText(target, signal?)` | Read the whole regular text file as one decoded string. Owns regular-file checks, UTF-8 decoding, binary/NUL rejection (`FS_NOT_TEXT`). |
| `streamText(target, signal?)` | Stream the same text as decoded chunks for large files (cross-chunk UTF-8 decoding stays here); consumers that need a byte ceiling enforce it while consuming the stream. |
| `readBytes(target, signal, maxBytes)` | Read a complete regular file as raw bytes with no decoding or binary rejection. `maxBytes` is required and bounds the complete content at this seam: a known or discovered overflow fails with `FS_TOO_LARGE` instead of truncating or buffering without a bound. |
| `listDir(target, signal?)` | List direct directory children in stable name order. Returns entry names, entry types, resolved child targets, and cheap metadata (`version`/file `size` when available); never reads file contents. Missing targets throw `FS_NOT_FOUND`, non-directories throw `FS_NOT_DIRECTORY`, permission failures throw `FS_PERMISSION_DENIED`, and other backend I/O failures throw `FS_IO_ERROR`. Broken/disappeared children may be returned as `other` without metadata; child permission/IO failures fail the whole listing with the same structured codes. |
| `writeText(target, content, expected?, signal?)` | Atomic create/replace. `expected` is OPTIONAL: omit ⇒ unconditional create-or-overwrite; supply an `FsWriteIntent` (`createIfAbsent`/`replaceIfVersion`) to guard. `createIfAbsent` must perform a no-replace publication so a creator racing the initial probe is preserved. |
| `editText(target, edit, expected?, signal?)` | Literal edit. `expected` is OPTIONAL: omit ⇒ unconditional edit of the current content; supply `{ version }` to guard (verified BEFORE matching). A missing target reports `FS_STALE_VERSION` either way. Applies and writes atomically — one mutation critical section. |

The mutation runs inside the backend's per-target lock either way, so an unconditional write/edit is still atomic — "unconditional" drops the *version* precondition, not the atomicity.

<a id="pkg-taskweaver-dsh-fs--the-fs-policy-events"></a>
#### The `fs/*` policy events

This package declares three events (see the generated region of [filesystem.md]（原文链接目标：`../../../docs/subsystems/filesystem.md#cordis-surface`）) so the emitter (`@taskweaver/dsh-tool-fs`) and the policy listener (`@taskweaver/dsh-fs-observation-policy`) share a vocabulary without the emitter depending on the policy plugin. `fs/write-intent` and `fs/edit-intent` are single-slot decision waterfalls (the listener fully decides, never calling `next()`); `fs/observed` is a fire-and-forget recording event carrying an `FsObservation` discriminated union: present with a version or confirmed absent. They carry only `dsh-fs` vocabulary plus an opaque `object` actor — no model-facing concepts and no agent/session owner structure.

<a id="pkg-taskweaver-dsh-fs--a-provider-contract-not-the-policy-layer"></a>
#### A provider contract, not the policy layer

`ctx.fs` is deliberately close to fsspec-style storage primitives — half a level above byte-level `cat`/`open`, because it decodes text and rejects binaries so the policy layer never touches raw bytes. It owns UTF-8 decoding, binary rejection, atomic writes, and the literal-edit critical section. It does **not** own line windows, numbered lines, rendered footers, or observed-state. Observed-state, read-before-edit, and version-guarded write/edit are policy a plugin (`@taskweaver/dsh-fs-observation-policy`) ADDS by supplying the optional guard — not provider behavior — so a sandboxed/remote backend inherits no model-facing observation policy.

`editText` stays on this seam (not composed in the policy layer from a read plus a write) because version guard + literal match + atomic rewrite must stay inside one critical section for correct error attribution and one-wins/one-stale concurrency, and a remote backend may implement it as a native compare-and-edit.

<a id="pkg-taskweaver-dsh-fs--vocabulary"></a>
#### Vocabulary

`FsTargetKey` / `FsVersion` are branded opaque ids ([the branded-ids Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-20-branded-ids.md`）) — consumers must not parse `targetKey` or interpret `version`; only `displayPath` is for model/UI output. `FsObservation` distinguishes `{ kind: 'present', version }` from `{ kind: 'absent' }`, so a policy can separate an unseen target from confirmed absence without performing I/O. `FsWriteIntent` is the explicit GUARDED write intent (`createIfAbsent` creates a missing target and rejects an existing one with `FS_NOT_OBSERVED`; `replaceIfVersion` replaces only at the observed version, else `FS_STALE_VERSION`); omitting it from `writeText` is the third, unconditional state. `FsPathInfo` is the no-follow metadata shape that can report `symlink`, unlike target-level `FsInfo`. Failures throw `FsError` (extends `HarnessError`, [the structured error taxonomy Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-11-structured-error-taxonomy.md`）) carrying a stable `FsErrorCode` (`FS_NOT_FOUND`, `FS_NOT_DIRECTORY`, `FS_NOT_TEXT`, `FS_NOT_REGULAR_FILE`, `FS_TOO_LARGE`, `FS_PERMISSION_DENIED`, `FS_IO_ERROR`, `FS_STALE_VERSION`, `FS_NOT_OBSERVED`, `FS_AMBIGUOUS_EDIT`, `FS_EDIT_NOT_FOUND`, `FS_ABORTED`); the tool registry exposes `{ name, code }` on `isError` results. See `src/types.ts` for the full contracts.

<a id="pkg-taskweaver-dsh-fs--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-tool-fs`, which renders provider text and errors as bounded, retained filesystem tool results.

<a id="pkg-taskweaver-dsh-fs--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-fs--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Text-only mutations by contract** — text reads and both mutations reject binary/non-UTF-8 content with `FS_NOT_TEXT`; `readBytes` is the one raw-byte primitive, and binary-safe mutations remain a deliberate deferral of [the tool-schemas Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-06-17-filesystem-tool-schemas.md`）.
- **Twelve primitives only** — no delete, rename/move, copy, or watch; `listDir` is single-level, with recursion, globbing, pagination, and search out of scope per [the directory-listing Agent Note]（原文链接目标：`../../../.agents/notes/archived/architecture/2026-07-03-filesystem-directory-listing-seam.md`）.
- **No IO deadline** — the seam arms no timeout; cancellation is a best-effort optional `AbortSignal` per primitive (the deliberate [fs-family stance](./README.zh.md#family-fs)).
- **Resolve-then-operate costs a remote backend two round-trips per tool call** — folding or caching resolution is left to such a backend.

<a id="pkg-taskweaver-dsh-fs-local"></a>
### `@taskweaver/dsh-fs-local`

<!-- migrated-from: packages/runtime/fs/fs-local/README.md -->
目录：`fs/fs-local`。
package.json 描述：Local-filesystem implementation of the DeepSeek Harness filesystem seam (ctx.fs)

<a id="pkg-taskweaver-dsh-fs-local--taskweaver-dsh-fs-local"></a>
The **local-filesystem implementation** of the `ctx.fs` provider contract ([`@taskweaver/dsh-fs`](./fs)). Backs the twelve `FileSystem` primitives with the host filesystem; loading it as a plugin populates `ctx.fs`.

```ts ignore-check
import { LocalFileSystem } from '@taskweaver/dsh-fs-local'

await ctx.plugin(LocalFileSystem, { cwd: process.cwd() })
// ctx.fs uses the local backend; load @taskweaver/dsh-fs-observation-policy for the
// freshness policy gate and @taskweaver/dsh-tool-fs to expose read/write/edit.
```

<a id="pkg-taskweaver-dsh-fs-local--behavior"></a>
#### Behavior

- **`resolve(path, opts?)`** — a relative `path` resolves against `opts.cwd` when the caller supplies one (the model-facing tools pass the calling agent's session cwd — see [the per-session cwd Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-02-fs-per-session-cwd.md`）), else `config.cwd` (default `process.cwd()`); an absolute `path` ignores both. `opts.signal` is checked before and after local resolution, while a remote sibling backend may use it to abort its round-trip. The `targetKey` is the file's `realpath`, so two input paths reaching the same file through symlinks share one identity, and writes/edits land on the link target (preserving the link). A not-yet-existing path uses the realpathed parent directory plus basename when the parent exists; only an unresolvable parent falls back to the absolute path. `displayPath` is the absolute (un-resolved) path.
- **Execution-world coordinates** — `processPath` exposes the target's canonical host path, `fileUrl` encodes that path through Node's platform-aware URL conversion, and `contains` uses platform path semantics to test identity or descendant containment without consumers parsing `targetKey`.
- **`stat` / `lstat`** — return target metadata or `undefined` when absent. `stat` reports `FsInfo` for an already resolved target (`version` = an opaque token derived from bigint `dev:ino:size:mtimeNs:ctimeNs`, `type` of `file`/`directory`/`other`, byte `size`); path-shaped `lstat` reports `FsPathInfo` without following the final symlink and can therefore return `symlink`. Both check cancellation before and after their asynchronous metadata probe, so an abort that lands in flight reports `FS_ABORTED` rather than stale absence.
- **`readText` / `streamText`** — UTF-8 only. `readText` reads the whole file; `streamText` decodes chunks so a huge file need not be held whole in memory and consumers can enforce their own retention bounds. Both reject invalid UTF-8 and NUL-byte binary samples (`FS_NOT_TEXT`) and non-regular targets. The `read` tool (`@taskweaver/dsh-tool-fs`) owns line windowing.
- **`readBytes`** — raw whole-file bytes with no decoding or binary rejection (the `read_image` tool validates content through the attachment service). The required byte cap short-circuits on the stat size before any content I/O; the subsequent stream reads at most one byte beyond the cap, so a file growing after stat still fails `FS_TOO_LARGE` without unbounded buffering.
- **`listDir`** — lists one directory level in stable `name.localeCompare()` order. Each entry carries the child basename, type, resolved child target (`displayPath` under the listed directory, `targetKey` as the realpath identity), and cheap stat metadata (`version`, plus `size` for regular files). It never opens or decodes file contents. Missing targets report `FS_NOT_FOUND`, file/special-file targets report `FS_NOT_DIRECTORY`, aborted calls report `FS_ABORTED`, permission failures report `FS_PERMISSION_DENIED`, and other listing or child metadata I/O failures report `FS_IO_ERROR`. Broken/disappeared children are returned as `other` without metadata, but permission/IO failures while resolving a child fail the whole listing with a structured `FsError`.
- **`writeText`** — atomic: writes to a temp file opened exclusively (`wx`, `0o600`) inside a randomly-named private staging dir (`0o700`) next to the target, then fsyncs and publishes. An existing file's mode is preserved, while new files default to `0o600`; on Windows a new file inherits the destination directory's DACL, while replacement copies the target DACL onto the empty temp before writing and publishes through `ReplaceFileW` so the original access policy survives ([Windows DACL preservation Agent Note]（原文链接目标：`../../../.agents/notes/implemented/bug-fix/2026-07-19-windows-atomic-write-dacl-preservation.md`）). The `expected` guard is OPTIONAL: omitting it unconditionally creates-or-overwrites; `createIfAbsent` hard-links the staged file into place as an atomic no-replace publication, so a regular file created after the initial probe is preserved and rejected with `FS_NOT_OBSERVED`, while a non-regular path entry is preserved and rejected with `FS_NOT_REGULAR_FILE`; `replaceIfVersion` replaces only at the observed version (a missing target or mismatch is `FS_STALE_VERSION`). An overwrite returns the prior text as its contextual diff basis only when both the opened prior file and UTF-8 replacement are strictly below `config.diffBasisMaxBytes` (default 10 MiB). The descriptor read enforces that limit even if an external writer replaces or changes the file size after the initial probe. Otherwise the provider returns `before: null`, so presentation uses its whole-file fallback.
- **`editText`** — atomic literal read-modify-write over the same primitive, serialized per target by a mutation lock. The `expected` guard is OPTIONAL: when supplied it verifies the version BEFORE literal matching (a stale edit reports `FS_STALE_VERSION`, never `FS_EDIT_NOT_FOUND`/`FS_AMBIGUOUS_EDIT` against newer content); omitting it edits the current content unconditionally. A missing target reports `FS_STALE_VERSION` either way. LF-normalizes for matching, restores the file's dominant CRLF/LF style, and rejects empty `oldString` / zero matches (`FS_EDIT_NOT_FOUND`) or ambiguous multi-matches without `replace_all` (`FS_AMBIGUOUS_EDIT`).

The package-root SDK API is the default/named `LocalFileSystem` class plus `Config`. Raw I/O lives in `src/fsio.ts` (Cordis-free, independently unit-tested); `src/index.ts` is the thin service wiring.

<a id="pkg-taskweaver-dsh-fs-local--model-experience"></a>
#### Model Experience

Indirectly, through [`dsh-tool-fs`](./README.zh.md#pkg-taskweaver-dsh-tool-fs), which renders this provider's line-windowed UTF-8 content, mutation acknowledgements, and exact provider messages in capped retained results while versions, atomic-write mechanics, and directory metadata remain internal.

<a id="pkg-taskweaver-dsh-fs-local--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-fs-local--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **`config.cwd` is not a sandbox** — it is a resolution default, not containment: absolute paths and `..` escape it. Enforce containment with a stricter `ctx.fs` backend or a permission plugin on the `tools/execute` waterfall ([capability-seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-17-filesystem-capability-seam.md#consequences`）).
- **Version tokens depend on filesystem metadata** — they combine device, inode, size, nanosecond mtime, and nanosecond ctime; a storage layer that cannot update any of those facts for a rewrite can still defeat the stale guard.
- **`editText` holds the whole file (plus the edited copy) in memory** — streaming exists only on the read path.
- **A sub-limit overwrite still buffers a contextual basis** — `writeText` may retain up to just below `config.diffBasisMaxBytes` of prior text in addition to the caller-owned replacement; the bound does not cap the returned `after` value or presentation's whole-file fallback.
- **Binary detection is asymmetric** — reads NUL-sample only the first 8192 bytes while edits scan the whole buffer, so a file with a late NUL reads fine but rejects edits.
- **The per-target mutation lock is in-process only** — guarded create still uses an atomic no-replace publication across processes, but replacement writers in another process are caught only when the optional version guard observes their metadata change; they are never serialized.
- **Guarded creation requires hard-link support** — filesystems or mounts that reject hard-link publication cannot serve `createIfAbsent`; the provider preserves the missing target and reports `FS_IO_ERROR`.
- **Post-commit cleanup is best effort** — a successful publication remains successful if removal of its owner-only staging directory fails, leaving private residue for later operator cleanup.

<a id="pkg-taskweaver-dsh-fs-observation-policy"></a>
### `@taskweaver/dsh-fs-observation-policy`

<!-- migrated-from: packages/runtime/fs/fs-observation-policy/README.md -->
目录：`fs/fs-observation-policy`。
package.json 描述：File-context policy plugin for the DeepSeek Harness — observed-state, read-before-edit, and version-guarded write/edit added over the ctx.fs provider seam through the fs/* event gate (no service API)

<a id="pkg-taskweaver-dsh-fs-observation-policy--taskweaver-dsh-fs-observation-policy"></a>
The **fs-observation-policy plugin**: it records observed presence or absence and adds read-before-edit plus guarded write/edit on top of the `ctx.fs` provider contract ([`@taskweaver/dsh-fs`](./fs)) — through the `fs/*` event gate, **NOT** through a method service. This plugin registers **no** `ctx.fsPolicy` service and has no public `read`/`write`/`edit`/`resolve` methods. It is the policy third of the filesystem stack: not a swappable seam, but the policy that does not belong on the `FileSystem` provider base class.

```ts
import type { Context } from '@taskweaver/cordis'
import * as FsPolicy from '@taskweaver/dsh-fs-observation-policy'

declare const ctx: Context

// No service to inject — this plugin only registers the three fs/* listeners.
// Load it alongside a ctx.fs provider (e.g. @taskweaver/dsh-fs-local) and the
// @taskweaver/dsh-tool-fs tools; the tools dispatch the fs/* events this plugin
// decides. Order does not matter for resolution (no inject), but the policy
// listener should be the first decider registered for the fs/*-intent slots.
await ctx.plugin(FsPolicy)
```

<a id="pkg-taskweaver-dsh-fs-observation-policy--the-four-layer-split"></a>
#### The four-layer split

| Layer | Package | Role |
|---|---|---|
| tool / executor | `@taskweaver/dsh-tool-fs` | model-facing schemas + read windowing + text rendering; reads/writes/edits via `ctx.fs`, dispatches the `fs/*` events |
| policy | `@taskweaver/dsh-fs-observation-policy` (this) | observed-state + read-before-edit + version-guarded write/edit, contributed through the `fs/*` event gate (no service) |
| provider contract | `@taskweaver/dsh-fs` | `ctx.fs`: text IO + atomic mutation primitives (optional version guard); owns the `fs/*` event vocabulary |
| provider | `@taskweaver/dsh-fs-local` | local implementation of `ctx.fs` |

<a id="pkg-taskweaver-dsh-fs-observation-policy--how-the-gate-participates"></a>
#### How the gate participates

Three `fs/*` events (declared by `@taskweaver/dsh-fs`, dispatched by `@taskweaver/dsh-tool-fs`):

| Event | This plugin's listener |
|---|---|
| `fs/write-intent` | Unseen or observed absent → `{ kind: 'createIfAbsent' }`; observed present → `{ kind: 'replaceIfVersion', version: vObserved }`. Single-slot decision; does NOT call `next()`. |
| `fs/edit-intent` | Unseen → `FS_NOT_OBSERVED`; observed absent → `FS_NOT_FOUND`; observed present → `{ version: vObserved }` as the CAS basis. Single-slot decision; does NOT call `next()`. |
| `fs/observed` | Records `{ kind: 'present', version }` or `{ kind: 'absent' }` for this owner+target. Synchronous, side-effect-only `WeakMap.set`. |

<a id="pkg-taskweaver-dsh-fs-observation-policy--observed-state-is-the-prior-observation-record-freshness-is-provider-cas"></a>
#### Observed state is the prior-observation record; freshness is provider CAS

Observed state is a weak owner-to-target map with three logical states: unseen, confirmed absent, or present at a version. A successful file read or mutation records presence; a metadata miss from `read` or the `str_replace_editor` `view`, `str_replace`, or `insert` command records absence before returning `FS_NOT_FOUND`. The plugin performs no filesystem I/O: it converts that state into a provider guard. Presence supplies the observed version, while absence lets only a `createIfAbsent` write proceed; edit has no version basis and returns `FS_NOT_FOUND`. A windowed read observes the whole file version, so a later targeted edit is allowed only while that file remains unchanged. State is discarded on plugin disposal and is not persisted across sessions.

<a id="pkg-taskweaver-dsh-fs-observation-policy--single-slot-first-wins"></a>
#### Single-slot, first-wins

The `fs/write-intent`/`fs/edit-intent` slots hold exactly one decider — this plugin fully decides and does not call `next()`. The slot is first-wins by registration order; this plugin owning it is the default-deployment convention, not an event-enforced invariant (a decider registered before / `prepend`ed would win instead). This is not a composable authorization chain — layered permission/audit/sandbox interception belongs on `tools/execute`.

<a id="pkg-taskweaver-dsh-fs-observation-policy--no-method-coupling"></a>
#### No method coupling

Because the plugin influences the world only through events, removing it does not break `@taskweaver/dsh-tool-fs` at a service-injection boundary: the tool falls through to the bare `ctx.fs` provider (unconditional write/edit, no observed-state). Loading it back layers the policy on. That graceful add/remove is the whole point of the event gate over a mandatory method service.

<a id="pkg-taskweaver-dsh-fs-observation-policy--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-fs-observation-policy--filesystem-tool-outcome"></a>
##### Filesystem tool outcome

<a id="pkg-taskweaver-dsh-fs-observation-policy--what-the-model-sees"></a>
###### What the model sees

This plugin adds no prompt or schema. It rejects an edit without a prior observation with code `FS_NOT_OBSERVED` and exact message `edit requires reading "<path>" first`; editing a target just observed absent returns `FS_NOT_FOUND`. Guarded mutations whose positive observation is stale propagate the provider-owned `FS_STALE_VERSION` error. [`dsh-tool-fs`](./README.zh.md#pkg-taskweaver-dsh-tool-fs) owns the model-facing error wrapper, which appends the recovery instruction to `FS_STALE_VERSION` (`— re-read the file, then retry`) and `FS_NOT_OBSERVED` (`— read the file, then retry`) messages while preserving the code. Following the stale remedy on an externally deleted target now records absence: the next guarded write may recreate it with `createIfAbsent`, while the provider atomically preserves any concurrent creator.

<a id="pkg-taskweaver-dsh-fs-observation-policy--token-effect"></a>
###### Token effect

Zero tokens on allowed operations beyond the ordinary tool result. A denial adds the small retained error result and avoids any success payload.

<a id="pkg-taskweaver-dsh-fs-observation-policy--kv-cache-effect"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-fs-observation-policy--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Observed state does not survive a session resume** — persistence of the `WeakMap` record is deferred, so a resumed session must re-read files before guarded writes/edits.
- **Actors without an agent session can never satisfy the policy** — their edits throw `FS_NOT_OBSERVED` and their writes always resolve `createIfAbsent`, so a non-agent caller cannot overwrite an existing file through the gate.
- **Direct `ctx.fs` reads emit no `fs/observed`** — a file read outside the `read` tool stays unobserved, and a later guarded edit rejects with `FS_NOT_OBSERVED` until the tool reads it.
- **Authorization is version freshness, not view completeness** — any windowed read authorizes a full-file overwrite of an unchanged file, deliberately weaker than a full-view rule ([seam-split Agent Note]（原文链接目标：`../../../.agents/notes/implemented/simplification/2026-06-26-fsspec-style-fs-seam.md`）).

<a id="pkg-taskweaver-dsh-fs-sandbox"></a>
### `@taskweaver/dsh-fs-sandbox`

<!-- migrated-from: packages/runtime/fs/fs-sandbox/README.md -->
目录：`fs/fs-sandbox`。
package.json 描述：Sandbox-enforcing implementation of the DeepSeek Harness filesystem seam: fences write/edit by the per-call sandbox mode (read-only denies mutation, workspace-write contains it to the workspace + temp roots) while reads pass through

<a id="pkg-taskweaver-dsh-fs-sandbox--dsh-fs-sandbox-the-sandbox-enforcing-filesystem-backend"></a>
`SandboxedFileSystem` extends [`LocalFileSystem`](./README.zh.md#pkg-taskweaver-dsh-fs-local) and registers as `ctx.fs`. It inherits every text-storage mechanic verbatim (resolve, stat, read/stream, list, the atomic write, the read-match-write edit critical section) and adds only a per-call MODE fence on `writeText`/`editText`. Reads always pass through — every mode permits reading.

Its plugin config is the local backend config unchanged: `cwd` remains the relative-path resolution default, and `diffBasisMaxBytes` bounds the optional overwrite contextual-diff basis.

Loading it INSTEAD OF `dsh-fs-local`, together with a [`ctx.sandboxPolicy`](../sandbox/README.zh.md#pkg-taskweaver-dsh-sandbox-policy), is the whole swap; the model-facing tools (`dsh-tool-fs`) are untouched. The tool layer resolves the calling session's mode and cwd into the SAME per-call policy bash receives, so the two families never confine to different roots.

<a id="pkg-taskweaver-dsh-fs-sandbox--the-fence"></a>
#### The fence

The per-call policy carries the effective mode (session override or escalation grant) together with the calling session's immutable cwd root, falling back to deployment policy only for calls without one:

- `read-only` — denies every mutation with the structured `FS_SANDBOX_DENIED`.
- `workspace-write` — allows a mutation only when the target canonicalizes under a writable root: the workspace root plus the platform temp areas (`/tmp`, `os.tmpdir()`), the SAME set the Seatbelt profile grants, derived from the one [`writableRoots`](../sandbox/README.zh.md#family-sandbox) function so the fs fence and the bash runner cannot drift. Canonical spellings use a lexical fast path; an identity-based ancestor fallback recognizes alias-equivalent roots such as Windows long names and 8.3 names without treating unrelated prefixes as contained. The target is re-canonicalized immediately before delegating, so an ancestor symlink swapped since the tool resolved it is caught.
- `danger-full-access` — delegates unfenced.

<a id="pkg-taskweaver-dsh-fs-sandbox--threat-model-a-policy-fence-not-a-kernel-boundary"></a>
#### Threat model: a policy fence, not a kernel boundary

The fence is a check in TRUSTED code over a MODEL-CONTROLLED path — the operations are the seam's own (open, rename), only the target path is untrusted, so canonicalize-then-contain is the complete answer to this surface. This mirrors the `code-runtime` stance: containment, not a security boundary. Kernel-grade isolation of untrusted CODE stays `ctx.shell`'s job ([`dsh-bash-sandbox`](../shell/README.zh.md#pkg-taskweaver-dsh-bash-sandbox)). The residual TOCTOU (an ancestor symlink swapped between the containment re-check and the syscall) is narrowed by re-canonicalizing immediately before the write and is accepted for this threat model; a kernel-tight boundary needs `openat2`-class primitives not worth their portability cost here.

A denial is a structured `FsError` (`FS_SANDBOX_DENIED`, carrying the effective mode) — no stderr text inference (unlike bash's kernel denials), because an in-process fence knows exactly what it refused. The model-facing `[sandbox: file access denied under <mode> mode]` marker and the one-approved-wider retry live in the tool layer (`dsh-tool-fs`), exactly as bash's do. See [the cross-family fs sandbox Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md`）.

<a id="pkg-taskweaver-dsh-fs-sandbox--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-fs-sandbox--filesystem-policy-and-refusals"></a>
##### Filesystem policy and refusals

<a id="pkg-taskweaver-dsh-fs-sandbox--what-the-model-sees"></a>
###### What the model sees

The policy owner contributes capability-neutral `sandbox:policy` context. Indirectly, `dsh-tool-fs` renders this backend's `FS_SANDBOX_DENIED` refusals as the `[sandbox: file access denied under <mode> mode]` marker plus the same-turn escalation hint.

<a id="pkg-taskweaver-dsh-fs-sandbox--token-effect"></a>
###### Token effect

The current-policy clause adds a small runtime-context message while this backend is mounted; a denial adds the bounded marker and escalation hint to conversation history.

<a id="pkg-taskweaver-dsh-fs-sandbox--kv-cache-effect"></a>
###### KV Cache effect

A standing-policy change appends an owner-rendered superseding runtime-context snapshot after retained history; operation results remain append-only.

<a id="pkg-taskweaver-dsh-fs-sandbox--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **A policy fence, not a kernel boundary** — the check is trusted code over a model-controlled path, so the residual resolve-to-syscall TOCTOU is narrowed (by the in-place re-canonicalization) but not eliminated; adversarial host processes are out of scope. Kernel-grade isolation of untrusted code stays `ctx.shell`'s.
- **Fence-vs-runner parity is derived from one owner** — the writable set comes from `writableRoots`, shared with the Seatbelt profile; a runner profile that defines its writable set elsewhere would drift.
- **Requires `ctx.sandboxPolicy`** — tools use it to resolve each session policy and the backend uses it for agentless-call fallbacks; the backend does not confine without it composed.

<a id="pkg-taskweaver-dsh-tool-document"></a>
### `@taskweaver/dsh-tool-document`

<!-- migrated-from: packages/runtime/fs/tool-document/README.md -->
目录：`fs/tool-document`。
package.json 描述：Bounded, sandboxed document reading tool for PDF and Office Open XML, with approval-gated legacy Office conversion

<a id="pkg-taskweaver-dsh-tool-document--taskweaver-dsh-tool-document"></a>
`read_document` reads PDF, PPTX, DOCX, and XLSX files through the same `ctx.fs` path resolution used by `read`. It dispatches by file header, parses in a bounded worker pool, returns an outline before large documents, and limits each call to 20 pages/slides, one worksheet range, or selected DOCX sections. TaskWeaver mounts it in the default, code, implementation, read-only, and pi-lite agent presets.

Legacy `.doc`, `.ppt`, and `.xls` files require LibreOffice. When it is available on `PATH` or at the macOS application path, `read_document` asks the user before converting. The converter receives a private temporary copy, an isolated LibreOffice profile, a filtered environment, and a 60-second limit; it never receives the original workspace path and cannot overwrite the source. The parsed result is cached by source-content hash, so a cached conversion does not prompt again. Deployments can configure an explicit executable path with `sofficePath`.

<a id="pkg-taskweaver-dsh-tool-document--limits"></a>
#### Limits

- PDF: 100 MB and 2,000 pages; Office Open XML: 50 MB.
- ZIP archives: 10,000 entries, 500 MB total expanded size, and 100:1 maximum per-entry compression ratio.
- XML parts: 50 MB and one million nodes. DTDs and entity declarations are rejected.
- Parser workers: 2 concurrent workers, 512 MB old-generation heap each, and a 30 second timeout.
- Parsed request results are cached under `$TASKWEAVER_HOME/document-cache`, keyed by the document SHA-256, parser version, and options; the private LRU is capped at 200 MB. Set `cacheMaxBytes: 0` to disable it.
- Inline text is capped by `readMaxBytes` (default 50 KiB). Larger extracted segments are saved with the optional `ctx.spillStore`; the parser retains at most 16 MiB per segment by default (configurable up to 32 MiB) and asks for a narrower range beyond that cap.
- Host upload adapters can call `storeDocumentSnapshot(bytes, { name, sessionId })` to place a verified, content-addressed snapshot in `$TASKWEAVER_HOME/documents/` and include its `@doc:<sha256>` reference in the session. The helper creates a private per-session hard link; the reference reader rejects missing, mismatched, or cross-session references and never opens the filesystem path supplied in the reference.
- Output defaults to 50 KiB. XLSX reads at most 200 rows × 50 columns per call; DOCX untitled text is split into about 20,000-character sections.

#### Config

| Key | Default | Meaning |
|---|---:|---|
| `readMaxBytes` | `51200` | Maximum inline UTF-8 text bytes returned to the model. Overflow is saved through `ctx.spillStore` when available. |
| `maxSegmentBytes` | `16777216` | Maximum text extracted for one selected segment before the tool asks for a narrower range; maximum configurable value is 32 MiB. |
| `maxPdfBytes` | `104857600` | Maximum source PDF size; cannot exceed 100 MiB. |
| `maxOfficeBytes` | `52428800` | Maximum source Office file size; cannot exceed 50 MiB. |
| `maxFileReadBytes` | `104857600` | Maximum source bytes read before format-specific parsing. |
| `cacheDirectory` | `$TASKWEAVER_HOME/document-cache` | Private result-cache directory. |
| `documentsDirectory` | `$TASKWEAVER_HOME/documents` | Private directory for content-addressed `@doc:` snapshots. |
| `cacheMaxBytes` | `209715200` | Persistent result-cache LRU ceiling; `0` disables it. |
| `sofficePath` | auto-detected | Optional LibreOffice executable override; otherwise checks `PATH` and the macOS application location. |

<a id="pkg-taskweaver-dsh-tool-document--parser-support"></a>
#### Parser support

- PDF.js extracts searchable text and identifies image-only pages. It does not perform OCR. When requested on a route that declares image input, the worker tries `pdftoppm`, then the bundled `@napi-rs/canvas`, to render scanned pages at a bounded size; if both are unavailable, it returns a screenshot fallback hint.
- PPTX reads slide order, titles, body text, tables, notes, and supported PNG/JPEG/GIF/WebP images.
- DOCX reads headings, paragraphs, lists, tables, and supported embedded PNG/JPEG/GIF/WebP images; tracked insertions/deletions and comment markers are omitted.
- XLSX scans worksheet XML without materializing a cell object tree, reads dimensions, merged ranges, formulas with cached values, shared strings, and common date styles. `next` advances across row and column windows.

Document images are saved through the mounted DSH attachment store and included only when the exact active model route declares image input. Without that capability, the tool returns text and an explanation. OLE `.doc`, `.ppt`, and `.xls` files are converted only after an approval card is accepted; the user can also save them as a modern Office format. Conversion runs on a private temporary copy with a separate LibreOffice profile, filtered environment, and 60-second timeout. The upload adapter remains responsible for copying external source bytes into the private document snapshot store before sending `@doc:` references.

Copyright-free parser fixtures can be regenerated with `pnpm --filter @taskweaver/dsh-tool-document run fixtures:documents`. This writes a 50-page PDF, scanned and encrypted PDFs, Office samples, security fixtures, and a streaming-generated 50,000 × 60 XLSX into `tests/fixtures/documents/`; generated binaries are ignored by Git.

<a id="pkg-taskweaver-dsh-tool-fs"></a>
### `@taskweaver/dsh-tool-fs`

<!-- migrated-from: packages/runtime/fs/tool-fs/README.md -->
目录：`fs/tool-fs`。
package.json 描述：Model-facing filesystem tools (read, write, edit) over the DeepSeek Harness filesystem seam (ctx.fs)

<a id="pkg-taskweaver-dsh-tool-fs--taskweaver-dsh-tool-fs"></a>
The **model-facing filesystem tools** — `read`, `read_image`, `write`, `edit` — and their **executor**. This is the consumer layer of the filesystem stack: it owns tool names, JSON schemas, argument validation, prompt sections, **read windowing**, and result formatting. It reads/writes/edits through the `ctx.fs` provider contract ([`@taskweaver/dsh-fs`](./fs)) **directly**. The freshness/observation policy is contributed by a separate plugin ([`@taskweaver/dsh-fs-observation-policy`](./fs-observation-policy)) through the `fs/*` event gate; the tool is not method-coupled to it. Under a confining provider, the shared sandbox-policy service is required for per-session execution and the tool exposes escalation for filesystem mutations.

```ts ignore-check
// Default deployment: a ctx.fs provider, the policy plugin, then the tools.
await ctx.plugin(LocalFileSystem, { cwd: process.cwd() }) // @taskweaver/dsh-fs-local
await ctx.plugin(FsPolicy)                             // @taskweaver/dsh-fs-observation-policy (policy gate)
await ctx.plugin(LocalAttachmentStore, { dshHome })       // optional — enables durable read_image results
await ctx.plugin(ToolFs)                                  // this package — read/write/edit, plus read_image with attachments
```

`@taskweaver/dsh-fs-observation-policy` is **optional**: omit it and the tools run against the bare provider (unconditional write/overwrite/edit, no observed-state). A deployment that loads these tools is expected to also load it, so the behavior is read-before-write/edit.

`read_image` registers only while a durable `ctx.attachments` service is mounted. Execution additionally requires the exact routed model to declare `image` input, resolved through `ctx.llm.resolveModelInfo` from the session's latest request header and then from agent options.

<a id="pkg-taskweaver-dsh-tool-fs--config"></a>
#### Config

All keys are optional; the defaults are the shipped read caps.

| Key | Default | Meaning |
|---|---|---|
| `readLimit` | `2000` | Default and maximum lines returned by one `read` call (the tool schema advertises it as the `limit` default). |
| `readMaxLineLength` | `2000` | Characters kept per line before truncation (the suffix names the cap). |
| `readMaxBytes` | `51200` | Byte cap on one `read` call's selected lines; overflow ends the window with a "capped" footer. |
| `readStreamMinSize` | `10485760` | Files at or above this size (or with unknown size) stream instead of loading whole into memory. |

<a id="pkg-taskweaver-dsh-tool-fs--tools-schemas-per-1"></a>
#### Tools (schemas per [the filesystem tool schemas Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-06-17-filesystem-tool-schemas.md`）)

| Tool | Arguments | Behavior |
|---|---|---|
| `read` | `file_path` (or compatibility alias `path`), `offset?`, `limit?` | Line-numbered UTF-8 content with a pagination footer. `file_path` is canonical; `path` is accepted for clients that emit that common alias. If both are present they must match. `offset` is 1-based; `limit` defaults to and caps at the configured `readLimit` (2000). |
| `read_image` | `file_path` | Reads a PNG/JPEG/WebP/GIF file through the bounded byte seam, persists it through `ctx.attachments.saveImage`, and returns an image block beside a small metadata envelope. Harness validates and downscales large supported images before the next model request, so the model can read the source directly without first creating a thumbnail. It succeeds only when the exact routed model declares image input. |
| `write` | `file_path`, `content` | Create or fully replace a file. With the policy plugin: overwriting an existing file requires a prior `read` at the unchanged version; creating a new file does not. Without it: unconditional. |
| `edit` | `file_path`, non-empty `old_string`, `new_string`, `replace_all?` | Literal replacement; unique match required unless `replace_all` is true. With the policy plugin: requires a prior `read` (any window) and the file unchanged since. Without it: unconditional. |

Field names are snake_case to match Claude Code and existing harness tool schemas.

Structured successes are `read` → `{ path, offset, lines: [{ number, text }], totalLines }`, `read_image` → `{ path, image: { attachmentId, mediaType, bytes, width, height, name?, originalDimensions?: { width, height } } }`, `write` → `{ path, operation: 'create' | 'update', before: string | null, after }`, and `edit` → `{ path, before, after }`. `originalDimensions` appears only when normalization downscaled the submitted raster and records its orientation-applied input size. Native renderers preserve the line-numbered read and mutation acknowledgements below. `write`/`edit` derive replayable diff-card metadata, and `read` derives a replayable read-card window `{ path, offset, lines, totalLines, lang? }`; execution-local structured values are not added to `tool/result`, while image renderers emit the durable image blocks that the result logs.

<a id="pkg-taskweaver-dsh-tool-fs--the-tool-is-the-executor-policy-is-an-event-gate"></a>
#### The tool is the executor; policy is an event gate

The tools do **not** inject a policy service or inspect any cache. Each tool resolves the path via `ctx.fs.resolve(path, { cwd, signal })` — passing the calling agent's session cwd (`exec.agent.session.header.cwd`) so a relative path resolves against the session's workspace, matching `dsh-tool-bash`, and forwarding tool cancellation through resolution (see [the per-session cwd Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-02-fs-per-session-cwd.md`）) — then:

- **read** — one `ctx.fs.stat` (type + size routing + version), then `readText`/`streamText`, then builds the line window, then emits `fs/observed` with a plain `ctx.emit`. (1 stat.)
- **read_image** — validates the argument, extension, attachment availability, deployment media types, and the image-capable route before any I/O; then one `ctx.fs.stat` (recording an `absent` observation for a missing target, like `read`), a bounded `ctx.fs.readBytes` capped at the smaller of `imageLimits.maxImageBytes` and `imageLimits.maxMessageImageBytes` (the result is one message carrying one image), `attachments.saveImage` (content-addressed, so the image block references a durably committed object by the time `tool/result` is appended), and finally `fs/observed`. (1 stat.)
- **write** — `ctx.waterfall('fs/write-intent', target, exec, () => undefined)` for the optional guard, then `ctx.fs.writeText(target, content, intent)`, then `fs/observed`. (0 stat.)
- **edit** — `ctx.waterfall('fs/edit-intent', target, exec, () => undefined)` for the optional guard, then `ctx.fs.editText(target, edit, intent)`, then `fs/observed`. (0 stat.)

The tool passes `exec` (the tool-execution context) as the opaque `actor` on every dispatch. The default thunks return `undefined` (the unconstrained bare provider). When `@taskweaver/dsh-fs-observation-policy` is loaded it occupies the single decision slot — returning `createIfAbsent`/`replaceIfVersion`/`{ version }` or throwing `FS_NOT_OBSERVED` — and records on `fs/observed`. Backend errors (`FsError`) and a thrown `FS_NOT_OBSERVED` flow through `ToolRuntime.execute()` and become `isError` tool results with their `{ name, code }` attached.

When `ctx.fs.sandboxMode` reports confinement, write/edit advertise `sandbox_permissions` and `justification` and resolve approved retries through `ctx.approval`. The policy owner contributes capability-neutral standing policy; the tool results retain operation-specific denial and retry guidance.

<a id="pkg-taskweaver-dsh-tool-fs--fs-observed-is-fire-and-forget"></a>
#### `fs/observed` is fire-and-forget

`fs/observed` fires AFTER the read/read_image/write/edit already succeeded, via a plain `ctx.emit`. A listener is contractually a synchronous, side-effect-only recorder (`@taskweaver/dsh-fs-observation-policy`'s is a `WeakMap.set`); the tool does not guard the emit, so a listener that throws would surface as the tool's `isError` result — async or fallible observation does not belong on this event.

`read` opts into concurrent scheduling because its only mutation is the synchronous version recorder. Recorder races fail closed when a later `write` or `edit` re-checks the version under its target lock; both mutation tools remain exclusive. See the [parallel tool-call Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md`）.

The package root exports only the Cordis plugin contract (`name`, `inject`, `Config`, and `apply`). Read rendering (line windowing + output formatting) lives in `src/read-render.ts` (Cordis-free, independently unit-tested); `src/read.ts`/`read-image.ts`/`write.ts`/`edit.ts` are the tool executors and `src/index.ts` composes them.

<a id="pkg-taskweaver-dsh-tool-fs--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-fs--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-tool-fs--what-the-model-sees"></a>
###### What the model sees

Every request in this plugin's registration scope receives the independently registered read, write, and edit guidance below. Scoped tool restrictions can hide schemas without removing these sections.

<a id="pkg-taskweaver-dsh-tool-fs--read-guidance"></a>
###### Read guidance

```markdown
Use the read tool — not shell commands like cat — to inspect text files. Results include line numbers. Use offset and limit to continue reading large files.
```

<a id="pkg-taskweaver-dsh-tool-fs--write-guidance"></a>
###### Write guidance

```markdown
Use the write tool to create files or completely replace file contents. Existing files are overwritten, so read an existing file first (the default fs-observation-policy requires it) and prefer edit for targeted changes.
```

<a id="pkg-taskweaver-dsh-tool-fs--edit-guidance"></a>
###### Edit guidance

```markdown
Use the edit tool for targeted changes to existing UTF-8 text files. It replaces literal old_string with new_string; by default old_string must appear exactly once. If old_string appears multiple times, provide a more specific old_string or set replace_all to true. Read the file first (the default fs-observation-policy requires it), unless you just created or edited it in this session.
```

<a id="pkg-taskweaver-dsh-tool-fs--token-effect"></a>
###### Token effect

Fixed guidance cost per request while the plugin is active, even when a restriction hides one or more tools.

<a id="pkg-taskweaver-dsh-tool-fs--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the plugin scope and guidance text are unchanged. Tool restrictions do not remove this section, but plugin activation or disposal may invalidate reuse from it.

<a id="pkg-taskweaver-dsh-tool-fs--tool-schemas"></a>
##### Tool schemas

<a id="pkg-taskweaver-dsh-tool-fs--what-the-model-sees-1"></a>
###### What the model sees

The model sees the generated [`read`, `read_image`, `write`, and `edit` schemas]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-fs`）, with snake_case arguments. The image tool appears only while a durable attachment store is mounted; its schema is route-independent, and the strict gate refuses at execution. Scoped tool restrictions can remove any definition for one agent.

<a id="pkg-taskweaver-dsh-tool-fs--token-effect-1"></a>
###### Token effect

Fixed schema cost on every request in that tool view.

<a id="pkg-taskweaver-dsh-tool-fs--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while the visible tool definitions and order are unchanged. Registration lifecycle or scoped restrictions may invalidate reuse from the first changed schema token.

<a id="pkg-taskweaver-dsh-tool-fs--read-result"></a>
##### Read result

<a id="pkg-taskweaver-dsh-tool-fs--what-the-model-sees-2"></a>
###### What the model sees

A successful read is exactly `<path><displayPath></path>`, newline, `<type>file</type>`, newline, `<content>`, numbered lines as `<lineNumber>: <text>`, a blank line, one footer, and `</content>`. The footer is exactly `(Output capped. Showing lines <start>-<end>. Use offset=<next> to continue.)`, `(Showing lines <start>-<end> of <total>. Use offset=<next> to continue.)`, or `(End of file - total <total> lines)`. A long line ends exactly `... (line truncated to <max> chars)`. A missing read still returns `FS_NOT_FOUND`, but it records confirmed absence for the calling session; after an externally deleted file is re-read, a retried `write` can safely recreate it through the provider's no-replace guard.

<a id="pkg-taskweaver-dsh-tool-fs--token-effect-2"></a>
###### Token effect

Read output is capped by `readLimit`, `readMaxLineLength`, and `readMaxBytes`; the retained call and result are resent until compaction.

<a id="pkg-taskweaver-dsh-tool-fs--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-fs--image-read-result"></a>
##### Image read result

<a id="pkg-taskweaver-dsh-tool-fs--what-the-model-sees-3"></a>
###### What the model sees

A successful `read_image` returns `<path><displayPath></path>`, `<type>image</type>`, and a `<content>` envelope naming the media type, normalized dimensions, and byte size, followed by the image itself as a native image block. The result is logged with its durable reference before the next model request.

<a id="pkg-taskweaver-dsh-tool-fs--token-effect-3"></a>
###### Token effect

The image is billed on every later request until compaction. Each call is independently bounded by the attachment store's `maxImageBytes`/`maxImagePixels`/`maxImageDimension`; repeated successful calls accumulate history, and content addressing deduplicates only the stored bytes, not the per-request token cost.

<a id="pkg-taskweaver-dsh-tool-fs--kv-cache-effect-3"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-fs--write-and-edit-results"></a>
##### Write and edit results

<a id="pkg-taskweaver-dsh-tool-fs--what-the-model-sees-4"></a>
###### What the model sees

Write returns the exact five-line envelope `<path><displayPath></path>`, `<type>file</type>`, `<content>`, `Created file` or `Updated file`, then `</content>`. Edit returns exactly `The file <displayPath> has been updated successfully.` or, for `replace_all`, `The file <displayPath> has been updated. All occurrences were successfully replaced.` The full write or replacement text remains in the assistant tool-call arguments.

<a id="pkg-taskweaver-dsh-tool-fs--token-effect-4"></a>
###### Token effect

Success text is small, but large mutation arguments and any result are resent until compaction.

<a id="pkg-taskweaver-dsh-tool-fs--kv-cache-effect-4"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-fs--tool-errors"></a>
##### Tool errors

<a id="pkg-taskweaver-dsh-tool-fs--what-the-model-sees-5"></a>
###### What the model sees

Failures are normalized as `Error: <message>`. This package's stable validation and read messages are `file_path must be a non-empty string`, `limit must be less than or equal to <max>`, `old_string must be a non-empty string`, `old_string and new_string must differ`, `cannot read "<path>": not found`, `cannot read "<path>": not a regular file`, `offset <offset> is out of range for "<path>" (<total> lines)`, `cannot read "<path>": read_image only accepts PNG/JPEG/WebP/GIF paths`, `cannot read "<path>" as an image: model "<model>" does not declare image input; switch to an image-capable model to read images`, and the mismatch repair `cannot read "<path>": the <ext> extension declares <type>, but the bytes use a different image format; rename the file to match its actual format if it is PNG/JPEG/WebP/GIF, or convert it to one of those formats`. A failed 16-bit conversion reports `cannot read "<path>": the 16-bit PNG could not be converted to the normalized 8-bit sRGB form; convert it to an 8-bit PNG/JPEG/WebP and retry`. Provider and policy templates are quoted in their package READMEs. Guarded-mutation failures additionally carry their recovery instruction in the message, appended by this package's model-facing error wrapper: `FS_STALE_VERSION` gets `— re-read the file, then retry`, and `FS_NOT_OBSERVED` gets `— read the file, then retry`; the structured code is preserved. After that reread confirms absence, edit reports `FS_NOT_FOUND` instead of repeating a stale remedy, while write uses guarded creation.

<a id="pkg-taskweaver-dsh-tool-fs--token-effect-5"></a>
###### Token effect

Only a failing call adds these retained tokens.

<a id="pkg-taskweaver-dsh-tool-fs--kv-cache-effect-5"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-fs--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No model-facing directory listing ships** — `ctx.fs.listDir` serves provider code such as skill discovery, while the sibling [`dsh-tool-fs-search`](./tool-fs-search) package supplies ripgrep-backed `glob` and `grep` rather than extending the filesystem seam.
- **`read` handles UTF-8 text files only** — images use the separate extension-routed `read_image` tool; PDF, audio, and video remain deferred. A directory target is `FS_NOT_REGULAR_FILE`.
- **Extension-declared media type** — the extension selects the declared type and the attachment store's magic-byte validation stays authoritative; a correctly formatted image under a wrong extension is refused with the rename remedy rather than sniffed.
- **No inline image preview on the tool-result card** — UI surfaces render the image result generically (the durable reference, not pixels); inline rendering is deferred to the UI packages.
- **No attachment-region tool** — an agent may crop an image through other available tools when it has a filesystem path. A pasted or dragged image without a path cannot be re-read at a higher resolution.
- **No timeout surface** — `read`/`write`/`edit` take no timeout argument and declare no `timeout-policy` budget; cancellation rides `exec.signal` only ([provider rationale](./README.zh.md#family-fs--no-timeouts-on-file-io)).

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit"></a>
### `@taskweaver/dsh-tool-fs-inline-edit`

<!-- migrated-from: packages/runtime/fs/tool-fs-inline-edit/README.md -->
目录：`fs/tool-fs-inline-edit`。
package.json 描述：Inline file editing with diff preview and validation

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--taskweaver-dsh-tool-fs-inline-edit"></a>
内联文件编辑工具，提供带预览的 diff 编辑体验，优于传统的 Edit 工具。

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--功能特性"></a>
#### 功能特性

- 📝 **内联 Diff 预览**：在应用更改前查看完整的 diff
- 🔍 **上下文显示**：显示更改周围的代码上下文
- ✅ **语法验证**：应用更改前验证语法错误
- 💾 **自动备份**：自动创建备份，支持撤销
- 📊 **统计信息**：显示添加/删除的行数和字节数
- 🔄 **批量编辑**：一次编辑多个文件
- ⚡ **智能格式化**：自动格式化编辑后的代码

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--安装"></a>
#### 安装

```bash
pnpm install
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--配置"></a>
#### 配置

在 Cordis 配置文件中添加：

```yaml
- id: inline-edit
  name: '@taskweaver/dsh-tool-fs-inline-edit'
  config:
    enabled: true
    previewMode: inline  # 或 full
    autoFormat: true
    validateBeforeApply: true
    backupEnabled: true
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--配置项说明"></a>
##### 配置项说明

- `enabled`: 是否启用内联编辑（默认 `true`）
- `previewMode`: 预览模式
  - `inline`: 只显示变化和上下文（推荐）
  - `full`: 显示完整 diff
- `autoFormat`: 编辑后自动格式化代码（默认 `true`）
- `validateBeforeApply`: 应用前验证语法（默认 `true`）
- `backupEnabled`: 启用自动备份（默认 `true`）

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--使用方法"></a>
#### 使用方法

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--1-基本编辑-带预览"></a>
##### 1. 基本编辑（带预览）

```typescript
// Agent 调用
edit_file_inline({
  file_path: "/path/to/file.ts",
  old_string: "const x = 1",
  new_string: "const x = 2",
  preview: true,  // 先预览
  context_lines: 3  // 显示 3 行上下文
})

// 返回预览
{
  success: false,  // 尚未应用
  preview: true,
  file: "/path/to/file.ts",
  diff: {
    hunks: [...],
    inline_preview: {
      context_before: ["function foo() {", "  // 一些代码"],
      old_content: ["const x = 1"],
      new_content: ["const x = 2"],
      context_after: ["  return x", "}"]
    },
    unified: "--- /path/to/file.ts\n+++ /path/to/file.ts\n..."
  },
  stats: {
    additions: 1,
    deletions: 1,
    bytes_changed: 1
  },
  message: "Preview generated. Review the diff above..."
}
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--2-应用编辑"></a>
##### 2. 应用编辑

查看预览满意后，设置 `preview: false` 应用：

```typescript
edit_file_inline({
  file_path: "/path/to/file.ts",
  old_string: "const x = 1",
  new_string: "const x = 2",
  preview: false  // 应用更改
})

// 返回
{
  success: true,
  file: "/path/to/file.ts",
  stats: {
    additions: 1,
    deletions: 1,
    bytes_changed: 1
  },
  backup: "/path/to/file.ts.backup",
  message: "File edited successfully."
}
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--3-批量编辑多个文件"></a>
##### 3. 批量编辑多个文件

```typescript
edit_multiple_files({
  edits: [
    {
      file_path: "/path/to/file1.ts",
      old_string: "import { A } from './a'",
      new_string: "import { A } from './lib/a'"
    },
    {
      file_path: "/path/to/file2.ts",
      old_string: "import { A } from './a'",
      new_string: "import { A } from './lib/a'"
    }
  ],
  preview: true,  // 先预览所有更改
  context_lines: 3
})

// 返回所有文件的预览
{
  success: false,
  preview: true,
  edits: [
    {
      file: "/path/to/file1.ts",
      success: true,
      diff: { hunks: [...], inline_preview: {...} }
    },
    {
      file: "/path/to/file2.ts",
      success: true,
      diff: { hunks: [...], inline_preview: {...} }
    }
  ],
  total: 2,
  message: "Preview generated for all files..."
}
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--4-撤销编辑"></a>
##### 4. 撤销编辑

如果编辑有误，可以从备份恢复：

```typescript
undo_edit({
  file_path: "/path/to/file.ts"
})

// 返回
{
  success: true,
  file: "/path/to/file.ts",
  message: "Edit undone successfully. Backup removed."
}
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--使用场景"></a>
#### 使用场景

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--场景-1-重构导入路径"></a>
##### 场景 1：重构导入路径

```
用户：把所有 './utils' 的导入改成 './lib/utils'

Agent 步骤：
1. 先用 semantic_search_code 找到所有相关文件
2. 使用 edit_multiple_files 批量预览更改
3. 用户确认后，应用更改
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--场景-2-重命名函数"></a>
##### 场景 2：重命名函数

```
用户：把 getUserData 函数改名为 fetchUserData

Agent 步骤：
1. 搜索所有使用该函数的地方
2. 逐个预览更改（带上下文）
3. 确认后批量应用
4. 如果有问题，使用 undo_edit 撤销
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--场景-3-修复类型错误"></a>
##### 场景 3：修复类型错误

```
用户：把 User 接口的 age 字段从 string 改成 number

Agent 步骤：
1. 预览接口定义的更改
2. 搜索所有使用 age 的地方
3. 预览每处需要修改的代码
4. 语法验证通过后应用
5. 自动格式化
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--与传统-edit-工具的对比"></a>
#### 与传统 Edit 工具的对比

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--传统-edit-工具"></a>
##### 传统 Edit 工具

```typescript
Edit({
  file_path: "/path/to/file.ts",
  old_string: "const x = 1",
  new_string: "const x = 2"
})
// ❌ 没有预览
// ❌ 看不到上下文
// ❌ 无法撤销
// ❌ 不验证语法
// ❌ 直接应用，风险高
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--内联-edit-工具"></a>
##### 内联 Edit 工具

```typescript
edit_file_inline({
  file_path: "/path/to/file.ts",
  old_string: "const x = 1",
  new_string: "const x = 2",
  preview: true,
  context_lines: 3
})
// ✅ 完整的 diff 预览
// ✅ 显示上下文代码
// ✅ 自动备份，可撤销
// ✅ 语法验证
// ✅ 分步骤：预览 → 确认 → 应用
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--diff-预览格式"></a>
#### Diff 预览格式

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--inline-模式-推荐"></a>
##### Inline 模式（推荐）

只显示变化和周围上下文，简洁清晰：

```
📄 src/utils.ts  +1 -1

上下文:
  function foo() {
    // 一些代码

旧内容:
- const x = 1

新内容:
+ const x = 2

上下文:
    return x
  }
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--full-模式"></a>
##### Full 模式

完整的 unified diff 格式：

```
--- src/utils.ts
+++ src/utils.ts
@@ -10,7 +10,7 @@
 function foo() {
   // 一些代码
-  const x = 1
+  const x = 2
   return x
 }
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--语法验证"></a>
#### 语法验证

支持的语言：
- TypeScript / JavaScript：括号匹配、语法检查
- Python：缩进检查、语法检查
- JSON：JSON 格式验证

验证失败示例：

```typescript
edit_file_inline({
  file_path: "config.json",
  old_string: '{"key": "value"}',
  new_string: '{"key": "value"',  // 缺少右括号
  preview: false
})

// 返回
{
  success: false,
  error: "Syntax validation failed",
  validation_errors: ["1 unclosed brackets"],
  message: "The changes would introduce syntax errors. Fix them first."
}
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--自动备份"></a>
#### 自动备份

每次编辑都会自动创建 `.backup` 文件：

```
src/utils.ts          # 原文件
src/utils.ts.backup   # 备份文件
```

撤销时会恢复备份并删除它：

```typescript
undo_edit({ file_path: "src/utils.ts" })
// src/utils.ts 恢复为备份内容
// src/utils.ts.backup 被删除
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--性能优化"></a>
#### 性能优化

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--批量编辑优化"></a>
##### 批量编辑优化

- 并行读取多个文件
- 统一生成所有 diff
- 一次性应用所有更改
- 减少磁盘 I/O

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--大文件优化"></a>
##### 大文件优化

- 流式读取
- 增量 diff 计算
- 内存高效的 LCS 算法

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--上下文行数建议"></a>
##### 上下文行数建议

- 小改动：3 行（默认）
- 中等改动：5 行
- 大改动：10 行
- 完整文件：0 行（显示全部）

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--故障排除"></a>
#### 故障排除

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--找不到-old-string"></a>
##### 找不到 old_string

```
Error: old_string not found in file
```

解决方法：
1. 先用 Read 工具读取文件当前内容
2. 确保 old_string 完全匹配，包括空格和换行
3. 使用多行字符串时注意缩进

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--语法验证失败"></a>
##### 语法验证失败

```
Error: Syntax validation failed
```

解决方法：
1. 检查 new_string 的语法
2. 确保括号、引号成对
3. 使用编辑器的语法检查
4. 临时禁用验证：`validateBeforeApply: false`

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--备份不存在"></a>
##### 备份不存在

```
Error: No backup found for this file
```

解决方法：
1. 确保 `backupEnabled: true`
2. 只能撤销本次会话的编辑
3. 跨会话需要使用 git 等版本控制

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--开发"></a>
#### 开发

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--构建"></a>
##### 构建

```bash
pnpm build
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--测试"></a>
##### 测试

```bash
pnpm test
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--开发模式"></a>
##### 开发模式

```bash
pnpm dev
```

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--路线图"></a>
#### 路线图

- [ ] 集成 Prettier 自动格式化
- [ ] 支持 Tree-sitter 精确语法验证
- [ ] 支持正则表达式替换
- [ ] 支持多光标编辑
- [ ] 支持 AI 辅助的智能重构
- [ ] 支持增量 diff（只重新计算变化部分）

<a id="pkg-taskweaver-dsh-tool-fs-inline-edit--许可证"></a>
#### 许可证

MIT

<a id="pkg-taskweaver-dsh-tool-fs-search"></a>
### `@taskweaver/dsh-tool-fs-search`

<!-- migrated-from: packages/runtime/fs/tool-fs-search/README.md -->
目录：`fs/tool-fs-search`。
package.json 描述：Model-facing filesystem discovery tools (glob, grep) backed by the packaged ripgrep binary (@vscode/ripgrep)

<a id="pkg-taskweaver-dsh-tool-fs-search--taskweaver-dsh-tool-fs-search"></a>
The **model-facing filesystem discovery tools**—`glob`, `grep`—are backed by a packaged ripgrep binary, not by `ctx.fs` provider methods and not by a system `rg` install. Ordinary Node deployments resolve the platform binary from `@vscode/ripgrep`; a pkg single-file runtime resolves the executable's co-located `-rg` sidecar and falls back to the dependency binary when that sidecar is absent. Registration is unconditional because both carriers package ripgrep, so there is no load-time availability probe. Each call spawns the resolved binary through the `ctx.subprocess` seam with a fixed argv vector (`--no-config` prepended so a host `RIPGREP_CONFIG_PATH` cannot inject a `--pre` preprocessor into the unconfined spawn; model-controlled values are plain argv elements — no shell layer exists, so no quoting applies), parses the raw `rg` output, and returns a workdir-relative canonical value. The package injects `tools`, `systemPrompt`, and `subprocess`—deliberately **not** `fs`; `ctx.spillStore` is read opportunistically with `ctx.get()` because formatted-result spill is optional.

```ts ignore-check
// A deployment chooses how over-cap glob pages are selected.
await ctx.plugin(LocalSubprocessRuntime)                     // @taskweaver/dsh-subprocess-local
await ctx.plugin(ToolFsSearch, { sampleOverCapGlobResults: false })
// Optional: a spill backend makes capped results fully recoverable.
await ctx.plugin(LocalSpillStore)                           // @taskweaver/dsh-spill-local
```

Why spawn-backed: local workspace discovery is naturally a process-backed `rg` workflow, and putting search on `ctx.fs` would force every filesystem backend to grow a search API. The subprocess seam owns spawn execution, process-tree termination, environment scrubbing, and bounded output capture; this package owns schemas, argument validation, argv construction, parsing, retention, formatted-result spill, and timeout declaration. The tools never expose a background job — the call returns only after `rg` exits, is terminated by the cooperative timeout, is aborted, or fails.

<a id="pkg-taskweaver-dsh-tool-fs-search--deployment-requirement-no-host-rg-co-located-workdir-filesystem"></a>
#### Deployment requirement: no host rg, co-located workdir/filesystem

Node deployments receive the `@vscode/ripgrep` platform package on supported macOS, Linux, and Windows x64/arm64 targets. Python SDK Linux and macOS wheels copy the target-native binary beside the single-file runtime as `<runtime>-rg`; `deepseek_harness_runtime.bundled_runtime_path()` rejects an incomplete wheel before launch. No carrier requires a host `rg` install. Returned paths are displayed relative to the resolved workdir (the calling agent's session cwd when present, else `process.cwd()`) and are follow-up-readable with `read` only when that workdir and the filesystem root are the same workspace. That co-location requirement carries no runtime cross-service validation; remote or virtual filesystem search waits for a shared workspace contract or a provider-specific search backend.

<a id="pkg-taskweaver-dsh-tool-fs-search--config"></a>
#### Config

`sampleOverCapGlobResults` is required and has no fallback; deployments choose the over-cap ordering contract explicitly. The remaining keys are optional search caps with the defaults below.

| Key | Default | Meaning |
|---|---|---|
| `sampleOverCapGlobResults` | none (required) | `true` samples an over-cap `glob` page across top-level entries; `false` keeps the modification-time-ordered head. When formatted spill succeeds, both modes preserve the complete sorted list in that artifact. |
| `globMaxResults` | `100` | Max paths one `glob` call shows inline (matches Claude Code's `GlobTool` limit). A result within the cap remains complete and modification-time ordered. |
| `grepMaxMatches` | `250` | Max flat matches one `grep` call retains inline (matches Claude Code's `GrepTool` `head_limit`); later matches go to the formatted spill artifact. |
| `grepMaxLineBytes` | `2000` | Byte cap per matched-line preview; the cut preserves UTF-8 boundaries and is marked `(line truncated)`. |
| `rawOutputMaxBytes` | `20000000` | Max complete raw `rg` stdout a search will parse (matches Claude Code's ripgrep raw buffer); larger raw output fails with `SEARCH_RAW_OUTPUT_OVERFLOW`. |
| `timeoutMs` | `30000` | Cooperative tool-call budget attached to both tool definitions, enforced by `@taskweaver/dsh-tool-call-timeout-policy` through `exec.signal`; the subprocess seam's terminate escalation is the hard kill. |
| `graceMs` | `3000` | Positive terminate-escalation grace the subprocess seam grants past `timeoutMs` before the search fails as `SEARCH_ABORTED`; it cannot exceed [`MAX_TIMER_DELAY_MS`](../util/README.zh.md#pkg-taskweaver-dsh-timeout). |
| `stderrMaxBytes` | `65536` | Diagnostic-tail budget for `rg` stderr, captured through the subprocess seam's collect disposition; a lossy read keeps only the tail (marked `[stderr truncated]`). |

<a id="pkg-taskweaver-dsh-tool-fs-search--tools"></a>
#### Tools

| Tool | Arguments | Behavior |
|---|---|---|
| `glob` | `pattern` (or `glob_pattern`), `path?` (or `target_directory`) | `rg --files --glob <pattern> --sort=modified --no-ignore --hidden` plus VCS metadata excludes (`.git`, `.svn`, `.hg`, `.bzr`, `.jj`, `.sl`). `path` or its `target_directory` alias is an optional **directory** search root; omitted means the resolved workdir. `glob_pattern` is an alias for `pattern`. If both names in one pair are supplied, their values must match. Returns one FILE path per line; `rg --files` never emits directory entries. The pattern keeps ripgrep semantics: without a `/` it matches the basename at any depth, so `*` matches the whole tree. Complete results stay modification-time ordered; over-cap presentation follows `sampleOverCapGlobResults`. |
| `grep` | `pattern`, `path?`, `include?` | Line-oriented `rg --json` parse (no colon-splitting ambiguity). `pattern` is a ripgrep regex; `path` is an optional **file or directory** target; `include` is ONE positive glob filter — a comma-separated list or a negated (`!…`) value is rejected up front (brace alternation like `*.{ts,tsx}` is fine). Returns matches grouped by file as `Line N: <preview>`. |

Routine budgets stay out of the model-facing schema (no `head_limit`/`offset`/`case_insensitive`/output modes): a model that needs surrounding context reads the matched file with `read`; one that needs later results follows the returned spill locator's retrieval hint.

<a id="pkg-taskweaver-dsh-tool-fs-search--two-budgets-two-artifacts"></a>
#### Two budgets, two artifacts

Raw `rg` stdout and stderr are internal transport details. Each search requests collect-mode budgets from the subprocess seam — complete stdout within `rawOutputMaxBytes` and a `stderrMaxBytes` diagnostic tail — with no spill files on either stream (the tool never reads a raw spill path). If the seam still reports a lossy stdout read, the search fails with `SEARCH_RAW_OUTPUT_OVERFLOW` and tells the model to narrow the query; a lossy stderr read only marks the diagnostic excerpt `[stderr truncated]`. A successful `glob` keeps the displayed search root and every acquired path in `{ root, paths }`; when sampling is enabled, `root` lets the Native renderer group an explicit relative or absolute search path by entries beneath that root rather than by its workdir prefix. `grep` keeps every acquired `{ path, lineNumber, line }` in `{ matches }`. Inline item and per-line preview caps apply only in the Native renderer. For a direct surface call with more logical results than the inline cap, post-policy best-effort saves the complete formatted preview through `ctx.spillStore.saveText()` and replaces only presentation with the configured page plus locator. Nested Code dispatches skip that spill because their full canonical value does not enter model context. Missing/failed spill keeps the inline page and reports that the complete result could not be saved—never an `isError`.

<a id="pkg-taskweaver-dsh-tool-fs-search--errors"></a>
#### Errors

Search failures carry the package-owned `SearchError` (a `HarnessError` subclass), surfaced as `{ name, code }` on `isError` results: `SEARCH_INVALID_PATTERN` (ripgrep rejected the regex/glob), `SEARCH_FAILED` (a failed `rg` launch, inaccessible target, signal kill, malformed `--json` output), `SEARCH_RAW_OUTPUT_OVERFLOW` (raw output over `rawOutputMaxBytes`, or still lossy after the requested stdout capture budget), and `SEARCH_ABORTED` (cooperative tool timeout or caller cancellation). ripgrep exit semantics are tool-owned: exit 0 is success with results, exit 1 is a successful empty search (`No files found` / `No matches found`), and only other exits are failures. Model argument mistakes (blank pattern, a list-valued `include`) stay ordinary tool argument errors.

<a id="pkg-taskweaver-dsh-tool-fs-search--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-fs-search--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-tool-fs-search--what-the-model-sees"></a>
###### What the model sees

Every request in this plugin's registration scope contains the independently registered glob and grep guidance below. Agent-scoped tool restrictions can hide either schema without removing its prompt section.

<a id="pkg-taskweaver-dsh-tool-fs-search--glob-guidance-with-sampleovercapglobresults-true"></a>
###### Glob guidance with `sampleOverCapGlobResults: true`

```markdown
Use the glob tool — not shell find — to discover files by path pattern. A pattern with no "/" matches basenames at any depth, so "*" matches every file in the tree rather than its top level. Results are files only, never directories, and include hidden and ignored files: a result that fits comes back in modification-time order, while a larger one is sampled across top-level entries, so it spans the tree instead of one subtree.
```

<a id="pkg-taskweaver-dsh-tool-fs-search--glob-guidance-with-sampleovercapglobresults-false"></a>
###### Glob guidance with `sampleOverCapGlobResults: false`

```markdown
Use the glob tool — not shell find — to discover files by path pattern. A pattern with no "/" matches basenames at any depth, so "*" matches every file in the tree rather than its top level. Results are files only, never directories, and include hidden and ignored files: a result that fits comes back in modification-time order, while a larger one keeps the modification-time-ordered head.
```

<a id="pkg-taskweaver-dsh-tool-fs-search--grep-guidance"></a>
###### Grep guidance

```markdown
Use the grep tool — not shell grep or rg — to search file contents. Use read on a matched file when you need surrounding context.
```

<a id="pkg-taskweaver-dsh-tool-fs-search--token-effect"></a>
###### Token effect

Fixed guidance cost per request while the tools are registered; the required sampling choice selects one glob variant.

<a id="pkg-taskweaver-dsh-tool-fs-search--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the plugin scope, sampling choice, and guidance text are unchanged. Activation, disposal, or changing the choice may invalidate reuse from this prompt section.

<a id="pkg-taskweaver-dsh-tool-fs-search--tool-schemas"></a>
##### Tool schemas

<a id="pkg-taskweaver-dsh-tool-fs-search--what-the-model-sees-1"></a>
###### What the model sees

The glob description states the configured over-cap ordering. The generated [`glob` and `grep` schemas]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-fs-search`） use `sampleOverCapGlobResults: true`; the tools are registered unconditionally.

<a id="pkg-taskweaver-dsh-tool-fs-search--token-effect-1"></a>
###### Token effect

Fixed schema cost on every request where the tools are visible.

<a id="pkg-taskweaver-dsh-tool-fs-search--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while tool visibility and definitions are unchanged. Registration lifecycle or scoped restrictions may invalidate reuse from the first changed schema token.

<a id="pkg-taskweaver-dsh-tool-fs-search--results-and-spill-notices"></a>
##### Results and spill notices

<a id="pkg-taskweaver-dsh-tool-fs-search--what-the-model-sees-2"></a>
###### What the model sees

`glob` returns one path per line; `grep` groups `Line <line>: <preview>` matches beneath each path. Empty searches return `No files found` or `No matches found`. A capped result ends with its omission count plus the spill locator and backend retrieval hint, or says the complete result could not be saved. With `sampleOverCapGlobResults: true`, an over-cap `glob` page takes paths round-robin across entries immediately beneath the actual search root, and the footer states the sampled basis and how many top-level entries it reached; when it cannot reach them all, the footer tells the model to narrow `path`. With `false`, the page is the modification-time-ordered head and keeps the plain capped-result footer. A result that fits inline is untouched, and a flat sampled result also keeps the plain footer because its sample equals the modification-time head. The spill artifact always holds the complete list in modification-time order.

<a id="pkg-taskweaver-dsh-tool-fs-search--token-effect-2"></a>
###### Token effect

Inline paths and matches are bounded by `globMaxResults`, `grepMaxMatches`, and `grepMaxLineBytes`; the call and retained result remain in history until compaction.

<a id="pkg-taskweaver-dsh-tool-fs-search--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-fs-search--tool-errors"></a>
##### Tool errors

<a id="pkg-taskweaver-dsh-tool-fs-search--what-the-model-sees-3"></a>
###### What the model sees

Failures are normalized as `Error: <message>` with structured `SEARCH_INVALID_PATTERN`, `SEARCH_FAILED`, `SEARCH_RAW_OUTPUT_OVERFLOW`, or `SEARCH_ABORTED` metadata for callers.

<a id="pkg-taskweaver-dsh-tool-fs-search--token-effect-3"></a>
###### Token effect

Only a failing call adds these retained tokens.

<a id="pkg-taskweaver-dsh-tool-fs-search--kv-cache-effect-3"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-fs-search--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Search and file access have no shared-workspace proof** — returned paths are follow-up-readable only when the workdir and filesystem root denote the same workspace; the package performs no runtime cross-service validation.
- **The packaged binary is fixed at dependency version** — Node deployments use the version selected by `@vscode/ripgrep`; Python single-file runtimes copy that target-native version into the required `-rg` sidecar. An unsupported platform or a corrupted installation fails with `SEARCH_FAILED`, while the Python runtime package rejects a missing sidecar before launch. Remote or virtual filesystems need a co-located workspace or another search consumer.
- **The schemas expose one bounded page** — offset pagination, case-mode switches, alternate output modes, and provider-backed discovery remain outside this package; capped complete output requires a spill backend.
- **Sampling, when enabled, groups by first path segment beneath the search root only** — an over-cap `glob` page balances across those top-level entries, so a result concentrated deeper (one busy directory inside an otherwise even tree) is still shown unevenly below that level; recursive balancing is deferred.

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search"></a>
### `@taskweaver/dsh-tool-fs-semantic-search`

<!-- migrated-from: packages/runtime/fs/tool-fs-semantic-search/README.md -->
目录：`fs/tool-fs-semantic-search`。
package.json 描述：Semantic code search tool using vector embeddings

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--taskweaver-dsh-tool-fs-semantic-search"></a>
语义代码搜索工具，使用向量嵌入实现基于自然语言的代码搜索。

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--功能特性"></a>
#### 功能特性

- 🔍 **语义搜索**：使用自然语言查询代码，理解代码含义而非仅匹配文本
- 🎯 **精确过滤**：支持按语言、类型、文件路径过滤结果
- 📦 **智能分块**：自动识别函数、类、方法等代码单元
- ⚡ **性能优化**：嵌入缓存和批量处理
- 🔌 **多后端支持**：支持 ChromaDB 和内存存储

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--安装"></a>
#### 安装

```bash
pnpm install
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--配置"></a>
#### 配置

在 Cordis 配置文件中添加：

```yaml
- id: semantic-search
  name: '@taskweaver/dsh-tool-fs-semantic-search'
  config:
    enabled: true
    embeddingProvider: jina  # 或 openai
    jinaApiKey: !env JINA_API_KEY  # 或 openaiApiKey
    vectorStore: memory  # 或 chroma
    chromaHost: localhost
    chromaPort: 8000
    cacheEmbeddings: true
    autoIndex: false
    indexOnStartup: false
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--配置项说明"></a>
##### 配置项说明

- `enabled`: 是否启用语义搜索（默认 `true`）
- `embeddingProvider`: 嵌入服务提供商，`jina` 或 `openai`
- `jinaApiKey`: Jina AI API 密钥（使用 Jina 时必需）
- `openaiApiKey`: OpenAI API 密钥（使用 OpenAI 时必需）
- `vectorStore`: 向量存储后端，`memory`（内存）或 `chroma`（ChromaDB）
- `chromaHost`: ChromaDB 主机地址（使用 chroma 时）
- `chromaPort`: ChromaDB 端口（使用 chroma 时）
- `cacheEmbeddings`: 是否缓存嵌入结果（默认 `true`）
- `autoIndex`: 是否自动索引当前项目（默认 `false`）
- `indexOnStartup`: 是否在启动时索引项目（默认 `false`）

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--使用方法"></a>
#### 使用方法

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--1-索引项目"></a>
##### 1. 索引项目

在使用语义搜索之前，需要先索引项目：

```typescript
// Agent 调用
index_project_for_semantic_search({
  path: "/path/to/project",  // 可选，默认当前目录
  force: false  // 可选，强制重建索引
})

// 返回
{
  indexed: true,
  path: "/path/to/project",
  totalChunks: 1250,
  cacheSize: 42,
  message: "Project indexed successfully. Found 1250 code blocks."
}
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--2-语义搜索"></a>
##### 2. 语义搜索

使用自然语言查询代码：

```typescript
// Agent 调用
semantic_search_code({
  query: "functions that handle user authentication",
  language: "typescript",  // 可选：typescript, javascript, python, java, cpp, all
  type: "function",  // 可选：function, class, method, interface, all
  file: "auth",  // 可选：文件路径子串
  top_k: 10  // 可选：返回结果数量（1-50）
})

// 返回
{
  results: [
    {
      file: "src/auth/login.ts",
      name: "authenticateUser",
      type: "function",
      language: "typescript",
      location: "src/auth/login.ts:15-42",
      score: "0.923",
      preview: "export async function authenticateUser(username: string, password: string) {\n  // Authenticate user with credentials\n  const user = await db.findUser(username)...",
      comments: "// Authenticates a user with username and password..."
    },
    // ... 更多结果
  ],
  total: 10,
  query: "functions that handle user authentication"
}
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--3-查看统计信息"></a>
##### 3. 查看统计信息

```typescript
// Agent 调用
semantic_search_stats({})

// 返回
{
  initialized: true,
  totalChunks: 1250,
  cacheSize: 42,
  embeddingProvider: "jina",
  vectorStore: "memory"
}
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--使用场景"></a>
#### 使用场景

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--场景-1-查找认证相关代码"></a>
##### 场景 1：查找认证相关代码

```
用户：帮我找到所有处理用户认证的函数

Agent 调用：
semantic_search_code({
  query: "functions that handle user authentication",
  type: "function"
})

结果：
- src/auth/login.ts:authenticateUser (score: 0.92)
- src/auth/token.ts:verifyToken (score: 0.89)
- src/middleware/auth.ts:checkAuth (score: 0.85)
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--场景-2-查找-react-hooks-使用"></a>
##### 场景 2：查找 React Hooks 使用

```
用户：项目中哪些组件使用了 useState 和 useEffect？

Agent 调用：
semantic_search_code({
  query: "React components that use useState and useEffect hooks",
  language: "typescript",
  type: "function"
})

结果：
- src/components/UserProfile.tsx:UserProfile (score: 0.94)
- src/components/Dashboard.tsx:Dashboard (score: 0.91)
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--场景-3-查找-http-请求代码"></a>
##### 场景 3：查找 HTTP 请求代码

```
用户：哪些代码在发 HTTP 请求？

Agent 调用：
semantic_search_code({
  query: "code that makes HTTP requests or API calls",
  top_k: 15
})

结果：
- src/api/client.ts:fetchUser (score: 0.93)
- src/services/data.ts:getData (score: 0.90)
- src/utils/request.ts:makeRequest (score: 0.88)
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--chromadb-设置"></a>
#### ChromaDB 设置

如果使用 ChromaDB 作为向量存储：

1. 安装 ChromaDB：
```bash
pip install chromadb
```

2. 启动 ChromaDB 服务器：
```bash
chroma run --host localhost --port 8000
```

3. 在配置中设置：
```yaml
vectorStore: chroma
chromaHost: localhost
chromaPort: 8000
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--获取-api-密钥"></a>
#### 获取 API 密钥

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--jina-ai-推荐"></a>
##### Jina AI（推荐）

1. 访问 https://jina.ai/
2. 注册账号
3. 获取 API 密钥
4. 设置环境变量：`export JINA_API_KEY=your_key`

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--openai"></a>
##### OpenAI

1. 访问 https://platform.openai.com/
2. 注册账号
3. 获取 API 密钥
4. 设置环境变量：`export OPENAI_API_KEY=your_key`

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--性能优化"></a>
#### 性能优化

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--嵌入缓存"></a>
##### 嵌入缓存

启用 `cacheEmbeddings: true` 可以缓存嵌入结果，避免重复计算：
- 相同文本的嵌入会被缓存
- 显著减少 API 调用次数
- 加快重复查询速度

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--批量处理"></a>
##### 批量处理

索引时自动使用批量处理：
- 每批最多 100 个文本
- 并行处理多个批次
- 减少网络往返次数

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--增量索引"></a>
##### 增量索引

使用 `force: false`（默认）时：
- 只索引新文件或修改过的文件
- 避免重复索引未变更的代码
- 节省时间和 API 调用

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--支持的语言"></a>
#### 支持的语言

目前支持以下编程语言：
- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)
- Python (`.py`)
- Java (`.java`)
- C++ (`.cpp`)
- C (`.c`)
- Go (`.go`)
- Rust (`.rs`)

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--排除的目录"></a>
#### 排除的目录

索引时会自动排除以下目录：
- `node_modules`
- `.git`
- `dist`
- `build`
- `out`
- `target`
- `vendor`
- `__pycache__`

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--限制"></a>
#### 限制

- 单次搜索最多返回 50 个结果
- 索引大型项目（10k+ 文件）可能需要几分钟
- 嵌入 API 有速率限制（取决于提供商）
- 内存存储模式下，索引会在重启后丢失

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--故障排除"></a>
#### 故障排除

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--chromadb-连接失败"></a>
##### ChromaDB 连接失败

```
Error: ChromaDB initialization failed
```

解决方法：
1. 确保 ChromaDB 服务器正在运行
2. 检查主机和端口配置是否正确
3. 尝试使用内存存储：`vectorStore: memory`

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--api-密钥错误"></a>
##### API 密钥错误

```
Error: Jina API key is required
```

解决方法：
1. 确保设置了正确的环境变量
2. 检查配置文件中的 API 密钥设置
3. 验证 API 密钥是否有效

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--搜索结果为空"></a>
##### 搜索结果为空

```
No results found. You may need to index the project first.
```

解决方法：
1. 运行 `index_project_for_semantic_search`
2. 检查索引是否成功完成
3. 使用 `semantic_search_stats` 查看索引状态

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--开发"></a>
#### 开发

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--构建"></a>
##### 构建

```bash
pnpm build
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--测试"></a>
##### 测试

```bash
pnpm test
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--开发模式"></a>
##### 开发模式

```bash
pnpm dev
```

<a id="pkg-taskweaver-dsh-tool-fs-semantic-search--许可证"></a>
#### 许可证

MIT

<a id="family-fs"></a>
### 原族级说明（迁移保留）

<a id="family-fs--fs-filesystem-capability-family"></a>
The filesystem stack: a provider contract (execution-world paths, bounded text IO, and atomic mutation with an optional version guard), a local implementation, a policy gate plugin (observed-state + read-before-edit + version-guarded write/edit), the model-facing file tools + executor, and the ripgrep-backed discovery tools. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| `fs/` | Service Definition: canonical process paths/file URIs/containment, text IO, and atomic mutation primitives; owns the `fs/*` policy events | `ctx.fs` |
| `fs-local/` | Local-filesystem `FileSystem` implementation | (registers `ctx.fs`) |
| [`e2b/fs-e2b`]（原文链接目标：`../e2b/fs-e2b/README.md`） | E2B-backed `FileSystem` implementation sharing the remote runtime owned by `ctx.e2b` | (registers `ctx.fs`) |
| `fs-sandbox/` | Sandbox-enforcing `FileSystem`: extends `fs-local` and fences write/edit by the per-call mode + workspace root policy (read-only denies, workspace-write contains to the session workspace + temp roots), reads pass through | (registers `ctx.fs`) |
| `fs-observation-policy/` | Policy gate plugin: observed-state + read-before-edit + version-guarded write/edit, via the `fs/*` event gate | (no service — `fs/*` listeners) |
| `tool-fs/` | Model-facing `read`/`write`/`edit` tools AND the executor (reads via `ctx.fs`, owns read windowing, dispatches `fs/*`); preserves filesystem semantics for session-cwd-relative paths and advertises sandbox escalation fields when the mounted `ctx.fs` confines | (registers on `ctx.tools`) |
| `tool-fs-search/` | Model-facing `glob`/`grep` discovery tools backed by the packaged `@vscode/ripgrep` binary spawned through `ctx.subprocess`, NOT by `ctx.fs` provider methods | (registers on `ctx.tools`) |

The Service Definition lives at `fs/fs/`. A sandboxed, remote, or project-scoped filesystem backend can replace `fs-local` without touching the Service Definition, policy gate, or model-facing tool schemas: `fs-sandbox` provides an in-process path fence over the shared sandbox mode ([decision]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md`）), while `fs-e2b` places file state in the remote execution world shared with the E2B subprocess provider ([decision]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.md`）). The policy (`fs-observation-policy/`) is a plugin that participates only through the `fs/*` event gate, not a service the tool injects — so dropping it gracefully loses the policy and leaves the unconstrained bare provider rather than breaking the tool. A deployment that loads `tool-fs/` is expected to also load it. The mode fence and the read-before-edit gate are orthogonal and compose. Discovery (`tool-fs-search/`) deliberately does NOT extend the provider contract: search is a process-backed `rg` workflow (the packaged `@vscode/ripgrep` binary spawned through `ctx.subprocess`), so filesystem backends stay free of a universal search contract; its tools register unconditionally, and its results are follow-up-readable when the search workdir and the `read` root are the same workspace (the co-located deployment its README documents).

<a id="family-fs--no-timeouts-on-file-io"></a>
#### No timeouts on file IO

`read`/`write`/`edit` take **no** `timeoutMs` and the provider contract arms no deadline: file IO here runs untimed because a deadline would kill work the OS will still finish — see [the filesystem subsystem page]（原文链接目标：`../../docs/subsystems/filesystem.md`）. Cancellation still propagates through the tool-execution signal for best-effort abort at syscall boundaries.

The subsystem reference — targets, outcomes, guards, policy events, the error taxonomy, and why file IO takes no timeout — is [docs/subsystems/filesystem.md]（原文链接目标：`../../docs/subsystems/filesystem.md`）; the sandbox fence in the [cross-family fs sandbox Agent Note]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md`）.
