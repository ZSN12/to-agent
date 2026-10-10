# spill 包族

<a id="family-spill"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

持久化过长的工具输出，并以有界预览和检索标识符替代完整内联内容。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-spill`](#pkg-taskweaver-dsh-spill) | `spill/spill` | [接口与限制](#pkg-taskweaver-dsh-spill) |
| [`@taskweaver/dsh-spill-local`](#pkg-taskweaver-dsh-spill-local) | `spill/spill-local` | [接口与限制](#pkg-taskweaver-dsh-spill-local) |
| [`@taskweaver/dsh-spill-policy`](#pkg-taskweaver-dsh-spill-policy) | `spill/spill-policy` | [接口与限制](#pkg-taskweaver-dsh-spill-policy) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-spill"></a>
### `@taskweaver/dsh-spill`

<!-- migrated-from: packages/runtime/spill/spill/README.md -->
目录：`spill/spill`。
package.json 描述：Abstract spill storage seam (ctx.spillStore) for the DeepSeek Harness — save oversized tool text and return a retrieval locator

<a id="pkg-taskweaver-dsh-spill--taskweaver-dsh-spill"></a>
The **`SpillStore`** (`ctx.spillStore`) defines WHAT a spill backend does — persist a tool's oversized text and return a model-facing locator plus retrieval guidance — without saying HOW.

This package is one third of the spill capability, split so each concern evolves (and swaps) independently:

| Package | Role |
|---|---|
| `@taskweaver/dsh-spill` (this) | Service Definition: abstract service + vocabulary types |
| `@taskweaver/dsh-spill-local` | Service Provider: private session-scoped files on the host filesystem |
| `@taskweaver/dsh-spill-policy` | Consumer: the tool-result policy that spills oversized final results |

The split mirrors the shell/fs seams. A future remote or virtual backend (e.g. a `spill://…` URI, a database key, or a backend-specific retrieval tool) implements this Service Definition without touching the policy plugin.

<a id="pkg-taskweaver-dsh-spill--service-api-ctx-spillstore"></a>
#### Service API (`ctx.spillStore`)

| Member | Semantics |
|---|---|
| `saveText(input)` | Persist `input.content` verbatim; resolves with a `SpillRef` (opaque locator, exact bytes written, and retrieval hint). **Rejects on a real storage failure** (permissions, ENOSPC, backend unavailable) — the caller decides how to degrade. |

Storage is grouped by the request's `owner` session as a save-time namespace; the backend chooses its own private representation and may derive names from — never trust as a path — the caller's `suggestedName`. The seam owns storage only: NO retention policy (that is [`@taskweaver/dsh-output-retention`](../util/output-retention)), NO tool-result replacement (that is `@taskweaver/dsh-spill-policy`), NO retrieval/search API (the backend's `retrievalHint` tells the model what to do with the locator).

<a id="pkg-taskweaver-dsh-spill--vocabulary"></a>
#### Vocabulary

`SaveTextSpill` (owner, source, suggestedName, content) is the request; `SpillRef` (locator, bytes, retrievalHint) is the result. `SpillLocator` is [branded](../util/brand) and rendered to the model as an opaque string — a local path for `dsh-spill-local`, but a future backend may return a URI, key, or command token without changing policy/tool consumers. `SpillOwner.sessionId` is the save-time storage namespace: forked sessions inherit existing locators from the seeded log without copying or re-owning them, and new spills after the fork use the child session id. `SpillSource` records the producing `toolName`, `callId`, and `label` for backend naming and inspection, not access control. See `src/types.ts` for the full contracts.

See the [tool output spill Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md`） for the design rationale, including why creation belongs to the runtime spill seam rather than the model-facing `write` tool.

<a id="pkg-taskweaver-dsh-spill--model-experience"></a>
#### Model Experience

Indirectly, through spill consumers that render a backend locator and retrieval guidance.

<a id="pkg-taskweaver-dsh-spill--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-spill--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **The seam has no retrieval or deletion API** — consumers can only render the backend's locator and guidance; lifecycle and access semantics remain backend-specific.
- **Storage is not access control** — `SpillOwner` namespaces writes but does not authorize reads of a locator; each backend and retrieval consumer must enforce its own boundary.

<a id="pkg-taskweaver-dsh-spill-local"></a>
### `@taskweaver/dsh-spill-local`

<!-- migrated-from: packages/runtime/spill/spill-local/README.md -->
目录：`spill/spill-local`。
package.json 描述：Local-filesystem implementation of the DeepSeek Harness spill storage seam (private session-scoped files)

<a id="pkg-taskweaver-dsh-spill-local--taskweaver-dsh-spill-local"></a>
The **local-filesystem** implementation of the [`@taskweaver/dsh-spill`](./spill) storage seam. Registers as `ctx.spillStore` and persists a tool's oversized text to a private, session-scoped file; its locator is the file path and its retrieval hint tells the model to use `read` or `grep` on that path.

<a id="pkg-taskweaver-dsh-spill-local--storage-layout"></a>
#### Storage layout

Files land at `<root>/session-<hash>/​<random>-<safeName>`:

- **`root`** — the config `root` (resolved to absolute), or a lazily-created private (0700) per-process directory under the OS temp dir when omitted. A predictable, world-readable root would let other local users read spilled tool output or plant symlinks.
- **`session-<hash>`** — a short `sha256(sessionId)` prefix, so a session's spill files group together and a future cleanup can drop them per session.
- **`<random>-<safeName>`** — an unpredictable hex prefix (defeats symlink planting in a shared root) plus the caller's `suggestedName` sanitized to one safe path segment (traversal-proof; mirrors the JSONL persistence backend's `encodeSegment`). The write is exclusive + owner-only (`open(path, 'wx', 0o600)`): it fails on any pre-existing path, symlink or not, so a planted target cannot redirect it.

<a id="pkg-taskweaver-dsh-spill-local--config"></a>
#### Config

| Key | Default | Meaning |
|---|---|---|
| `root` | private 0700 temp dir | Root directory for spill files. Set to keep them under a known location. |

`saveText` rejects on a real storage failure (permissions, ENOSPC); the spill policy treats a rejection as best-effort and keeps the inline result. See the seam README for the vocabulary and the [tool output spill Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md`） for the design.

<a id="pkg-taskweaver-dsh-spill-local--model-experience"></a>
#### Model Experience

Indirectly, through spill consumers that render the local path and `read`/`grep` retrieval guidance.

<a id="pkg-taskweaver-dsh-spill-local--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-spill-local--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Local spill files persist until external cleanup** — the backend has no session-lifecycle deletion or age-based retention policy, because persisted, resumed, and forked sessions may still reference a path.
- **Locators require a co-located filesystem consumer** — a remote or virtual deployment needs another `SpillStore` backend whose locator and retrieval hint are meaningful there.

<a id="pkg-taskweaver-dsh-spill-policy"></a>
### `@taskweaver/dsh-spill-policy`

<!-- migrated-from: packages/runtime/spill/spill-policy/README.md -->
目录：`spill/spill-policy`。
package.json 描述：Tool-result spill policy for the DeepSeek Harness — replaces oversized plain-text tool results with a retained preview plus a spill-file path (no service API)

<a id="pkg-taskweaver-dsh-spill-policy--taskweaver-dsh-spill-policy"></a>
The **tool-result spill policy**: a `tools/post-execute` transformer that keeps oversized plain-text tool results out of the model's context. When a final result exceeds `maxInlineBytes`, it saves the FULL text through [`ctx.spillStore`](./spill) and replaces the model-facing result with a bounded head/tail preview plus the backend's locator and retrieval hint.

This plugin registers **no service** and owns no storage or preview mechanics: preview is [`@taskweaver/dsh-output-retention`](../util/output-retention) (`TextRetainer`), storage is `ctx.spillStore`. It only decides WHEN to spill and composes the notice.

<a id="pkg-taskweaver-dsh-spill-policy--config"></a>
#### Config

| Key | Default | Meaning |
|---|---|---|
| `maxInlineBytes` | *(omitted)* | Model-facing context cap for a plain-text result, in UTF-8 bytes (a non-negative integer; validated at load). **Omitted disables the policy entirely** (the plugin registers nothing). When set, a larger result is spilled and replaced with a preview derived from the same budget (head/tail split). |

<a id="pkg-taskweaver-dsh-spill-policy--behavior"></a>
#### Behavior

1. Let the tool run (delegates via `next()`, so it bounds whatever a downstream hook accepted).
2. Skip nested executions (`exec.parent` is present — their DURABLE copy is bounded by the dispatch-log arm below), accepted value replacements (the registry must revalidate and rerender them), `read` (avoids a `read → spill → read again` loop), and any non-`accept` decision (a `block`'s corrective feedback passes through).
3. Flatten the accepted content only when it is **plain text** (all `text` blocks); a result with any non-text block is left untouched.
4. If its UTF-8 size is `≤ maxInlineBytes`, leave it unchanged.
5. Otherwise save the full text and replace the result with a preview + this notice, sized so the whole replacement (preview + blank line + notice) stays within `maxInlineBytes` — the notice's byte cost is reserved out of the budget, so the preview shrinks to fit and the model-facing result never exceeds the cap:

   ```text
   <retained head/tail preview>

   (Omitted N bytes. Full formatted result stored at: /…/session-…/…-web_fetch.txt. Use read with offset/limit, or grep this path to search within it.)
   ```

   When the notice alone fills the budget (a tiny cap or a long locator) the preview is empty and only the notice is returned. If even that notice-only replacement would exceed `maxInlineBytes`, the policy keeps the inline result — it never emits a replacement over the cap (and a within-cap replacement is always smaller than the original, so this also means spilling never adds bytes).

**Best-effort:** no session owner, no `ctx.spillStore` backend, or a `saveText` rejection ⇒ the policy logs a warning and returns the original result. A spill failure never turns a successful call into an `isError` or hides the inline result. A successful replacement changes only `content`; the canonical programmatic value is preserved.

**The dispatch-log arm:** a second listener on `tools/code-dispatch-log` applies the same cap, replacement pipeline, and best-effort fallbacks to the DURABLE copy of each `run_code` sub-call result (artifact label `dispatch`, keyed by the sub-call id). The program's value is untouched — it already crossed the worker boundary whole — and `read` sub-calls are bounded too: a log copy is not model context, so the read-again loop cannot occur, and `read` is precisely the tool that produces huge logs ([rationale]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-26-code-dispatch-log-spill.md`）).

<a id="pkg-taskweaver-dsh-spill-policy--scope"></a>
#### Scope

The policy sees only the FINAL formatted model-facing result—not a tool's internal resource or canonical value. If a provider already truncated (e.g. `web-fetch-http.maxBodyChars`), the spill artifact holds the full formatted result the tool returned, not the full original source. Provider/resource caps stay mandatory and separate. `glob`/`grep` own item-level presentation spill because their complete acquired values still exist before rendering; bash streams own acquisition-time spill. The generic policy prepends its waterfall listener, then delegates, so ordinary tool-owned asynchronous projections complete before generic byte bounding regardless of plugin load order. See the [tool output spill Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md`）.

<a id="pkg-taskweaver-dsh-spill-policy--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-spill-policy--oversized-plain-text-result"></a>
##### Oversized plain-text result

<a id="pkg-taskweaver-dsh-spill-policy--what-the-model-sees"></a>
###### What the model sees

Results at or below `maxInlineBytes`, nested results, `read` results, blocked decisions, and results containing non-text blocks are unchanged. An oversized plain-text model-facing result becomes a bounded head/tail preview followed by `(Omitted <bytes> bytes. Full formatted result stored at: <locator>. <retrievalHint>)`; storage or ownership failures leave the original result visible.

<a id="pkg-taskweaver-dsh-spill-policy--token-effect"></a>
###### Token effect

A successful replacement is at most `maxInlineBytes` UTF-8 bytes and remains in history until compaction; the full spill text is not resent to the model.

<a id="pkg-taskweaver-dsh-spill-policy--kv-cache-effect"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-spill-policy--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Only final plain-text results are spillable** — mixed-content results, blocked feedback, and `read` pass through; provider truncation or tool-owned retention that happened earlier cannot be recovered here.
- **A notice that cannot fit disables replacement for that call** — a tiny cap or long locator leaves the oversized original inline after the backend has already saved an unreferenced spill.

<a id="family-spill"></a>
### 原族级说明（迁移保留）

<a id="family-spill--spill-tool-output-spill-capability-family"></a>
This family persists oversized tool output and replaces the inline result with a bounded preview and retrieval locator.

| Package | Role | ctx key |
|---|---|---|
| [`spill/`](./README.zh.md#pkg-taskweaver-dsh-spill) | Defines spill storage | `ctx.spillStore` |
| [`spill-local/`](./README.zh.md#pkg-taskweaver-dsh-spill-local) | Stores spilled text in session-scoped local files | registers on `ctx.spillStore` |
| [`spill-policy/`](./README.zh.md#pkg-taskweaver-dsh-spill-policy) | Applies the post-execution spill policy | listens on `ctx.tools` |

See the [tool-output spill decision]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md`） for the boundary between storage, retention, and tool-owned output handling.

The subsystem reference — `SaveTextSpill`, owners/sources, the branded locator — is [docs/subsystems/spill.md]（原文链接目标：`../../docs/subsystems/spill.md`）; rationale in the [tool output spill Agent Note]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md`）.
