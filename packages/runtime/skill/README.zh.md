# skill 包族

<a id="family-skill"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

发现可复用的 Agent 指令，并通过 Provider 中立的目录和加载器暴露给模型。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-skill`](#pkg-taskweaver-dsh-skill) | `skill/skill` | [接口与限制](#pkg-taskweaver-dsh-skill) |
| [`@taskweaver/dsh-skill-filesystem`](#pkg-taskweaver-dsh-skill-filesystem) | `skill/skill-filesystem` | [接口与限制](#pkg-taskweaver-dsh-skill-filesystem) |
| [`@taskweaver/dsh-tool-skill`](#pkg-taskweaver-dsh-tool-skill) | `skill/tool-skill` | [接口与限制](#pkg-taskweaver-dsh-tool-skill) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-skill"></a>
### `@taskweaver/dsh-skill`

<!-- migrated-from: packages/runtime/skill/skill/README.md -->
目录：`skill/skill`。
package.json 描述：Agent skill provider registry for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-skill--taskweaver-dsh-skill"></a>
Pure agent skill provider registry.

This package owns the `ctx.skills` interface. It does not know whether skills come from local files, embedded plugin data, HTTP, or another backend; providers register those sources with `ctx.skills.registerProvider(...)`. The shipped local implementation is [`@taskweaver/dsh-skill-filesystem`](./skill-filesystem).

The registry is host+per-scope layered over [`@taskweaver/dsh-scope`](../core/scope), the shape the tools registry established: a registration files into the layer of its calling context's scope — host rows and repository plugins land in the global layer, a plugin mounted by an agent preset's standing composition lands in that preset's layer — and a read merges the global layer with the viewing scope's chain, the nearest layer winning a duplicate name outright while rank decides duplicates only within one layer.

<a id="pkg-taskweaver-dsh-skill--service-skillregistry-ctx-key-skills"></a>
#### Service: `SkillRegistry` (ctx key: `skills`)

<a id="pkg-taskweaver-dsh-skill--public-api"></a>
##### Public API

- `ctx.skills.registerProvider(create): () => void` Calls a synchronous provider factory with `{ signal, invalidate }`, then registers its readonly result by `provider.name`, unique within the calling context's layer. Duplicate names in one layer throw, `runtime` is reserved, and failed registration aborts the signal. The exact Cordis disposer unregisters the provider, aborts the signal, and preserves ordered composite teardown.
- `ctx.skills.snapshot({ cwd?, signal?, scope? })` Returns the invocation-neutral `{ skills, complete }` observation for the viewing scope's merged layers. `complete` is false when any provider rejects or explicitly reports incomplete discovery, or when a second catalog revision races the bounded retry; candidates supplied by that observation remain in this result, which is never cached.
- `ctx.skills.list({ cwd?, signal?, scope? })` Borrows the readonly view options, then returns every winning summary for the current workspace, merged across the global layer and the viewing scope's chain and sorted by name. Consumers apply `isModelInvocable(skill)` or `isUserInvocable(skill)` at their own boundary.
- `ctx.skills.get(name, { cwd?, signal?, scope? })` Uses the same readonly options and winning candidate for discovery and loading, rechecks cancellation after discovery or a cache hit, races provider loading against the signal, validates the loaded definition, then returns it regardless of invocation policy.
- `ctx.skills.register(skill): () => void` Registers a readonly runtime embedded skill into the calling context's layer, adding the all-invocable policy and `provider: "runtime"` when omitted. Same-name runtime registrations in one layer are first-wins: a duplicate logs a warning and gets a no-op disposer. Successful registrations return the exact Cordis disposer for ordered composite teardown.

<a id="pkg-taskweaver-dsh-skill--events"></a>
##### Events

- `skills/change` is an unfiltered invalidation notification emitted after a provider or runtime contribution is registered or disposed and after an active provider's registration control invalidates. It carries no catalog or diff: each consumer refetches `snapshot()` with its own lookup options. Listener throws and rejected promises are logged and cannot veto the registry mutation or starve later listeners.

<a id="pkg-taskweaver-dsh-skill--config"></a>
##### Config

| Field | Default | Meaning |
|---|---|---|
| `collectCacheMaxEntries` | `128` | Maximum completed cwd/provider catalogs kept in memory. |

<a id="pkg-taskweaver-dsh-skill--invocation-policy"></a>
##### Invocation policy

`SkillSummary.invocation` is a required typed policy object whose positive booleans `modelInvocable` and `userInvocable` describe the two surfaces independently. Providers return this resolved shape on every candidate and definition; only the `SkillRegistration` input may omit it, in which case `register()` supplies `{ modelInvocable: true, userInvocable: true }`. The registry keeps all four combinations so one discovery result can serve model-facing tools, human-facing commands, and trusted internal callers without conflating their catalogs.

| Policy | Model | User |
|---|---|---|
| `{ modelInvocable: true, userInvocable: true }` | included | included |
| `{ modelInvocable: true, userInvocable: false }` | included | excluded |
| `{ modelInvocable: false, userInvocable: true }` | excluded | included |
| `{ modelInvocable: false, userInvocable: false }` | excluded | excluded |

<a id="pkg-taskweaver-dsh-skill--shared-model-facing-rendering"></a>
##### Shared model-facing rendering

`renderSkillContent(skill)` renders one loaded skill as the canonical `<skill_content>` block (escaped `name` attribute, resource hints, verbatim body). It is the single truth for both loading paths: `dsh-tool-skill` returns it as the `skill` tool result and injects it at the user-explicit gesture boundary, so the model sees one shape regardless of who initiated the load. `escapeText` is exported beside it for consumers embedding prose in the same markup frame. The package also declares the `skill-invocation` `MessageSource` kind ({ name, form: 'instructions' }) that user-explicit injection stamps on its messages — transcript consumers present the invocation from this metadata instead of re-parsing the body.

`isModelInvocable(skill)` and `isUserInvocable(skill)` read the matching positive field directly. `ctx.skills.get()` remains the trusted, policy-neutral loading primitive, so every user- or model-facing consumer must enforce the predicate that matches its surface before exposing or loading a skill.

<a id="pkg-taskweaver-dsh-skill--provider-contract"></a>
#### Provider Contract

A provider factory runs synchronously and receives one registration-scoped control. `control.signal` aborts when registration fails or is disposed; `control.invalidate()` clears completed catalogs only while that exact registration remains active, so late callbacks cannot affect a replacement with the same name. Immutable providers may ignore the control. Remote setup, authentication, and discovery belong in the provider's awaited `list(options)` call. An array return is shorthand for complete discovery; a provider that collected usable candidates but could not establish an authoritative observation returns `{ candidates, complete: false }`. Provider objects, lookup options, candidates, and definitions are borrowed readonly rather than cloned or rebound. Providers should honor `options.signal`; the registry also stops awaiting uncooperative discovery or loading after cancellation.

The registry validates candidates before caching and definitions before returning them. The winning provider receives the same candidate and opaque `locator` it returned from `list()`, allowing backend-specific file, URL, id, or version handles. Callers and providers must preserve the readonly contract.

Contract violations fail fast. A rejected provider `list()` is treated as a transient source failure and omitted. An explicit incomplete observation still contributes its candidates for `list()` and `get()`, but makes the aggregate snapshot incomplete and uncacheable. A provider or runtime revision change discards an in-flight result and retries once. If the retry is also superseded, its candidates are returned incomplete and uncached so a continuously invalidating provider cannot monopolize the caller. Within one layer, duplicate names resolve by rank, provider registration order, then provider-local order; across layers the nearest scope's entry wins the name. Summaries are sorted by skill name.

Definitions remain progressively loaded. `get()` asks the winning provider for the body on every call rather than caching it in this registry. If the returned definition has a different name from the selected candidate, the stale selection is rejected and the registry internally invalidates that exact provider so the next snapshot rediscovers its catalog.

<a id="pkg-taskweaver-dsh-skill--runtime-skills"></a>
#### Runtime Skills

`ctx.skills.register(...)` is a convenience for embedded runtime skills. Runtime skills use rank `250`: project providers can override them, while they override the shipped local provider's custom and user roots. Runtime definitions and nested resource metadata are borrowed readonly; the service materializes one top-level definition to supply omitted invocation and provider defaults. Registration is first-wins within runtime contributions, so a duplicate contribution cannot remove the active one through its disposer.

<a id="pkg-taskweaver-dsh-skill--consumer-boundary"></a>
#### Consumer boundary

The registry does not render model guidance or register model-facing tools. [`@taskweaver/dsh-tool-skill`](./tool-skill) consumes `ctx.skills` to provide durable session catalogs and the `skill` tool, so providers remain independent of model-facing behavior.

<a id="pkg-taskweaver-dsh-skill--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-tool-skill`, which renders provider summaries into durable initial or replacement catalog messages and loaded instructions into retained tool results.

<a id="pkg-taskweaver-dsh-skill--kv-cache-effect"></a>
###### KV Cache effect

No direct prompt effect. The named consumer owns the durable initial catalog and append-only replacements after invalidation.

<a id="pkg-taskweaver-dsh-skill--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Invalidation is provider-driven** — the registry has no TTL and cannot infer that an arbitrary remote source changed; each mutable provider must retain and call its registration-scoped `invalidate()` capability from its own observation mechanism.
- **Providers are queried sequentially** — one slow cooperative provider delays every provider registered after it; cancellation stops the caller's wait but cannot terminate work an uncooperative provider keeps running.
- **Incomplete observations are not retained** — rejected providers are omitted and explicitly supplied candidates remain available only to the current lookup; the registry owns neither a last-good catalog nor per-provider diagnostics.
- **Duplicate resolution is first-wins** — later lower-priority candidates within a layer are logged and hidden, and a nearer layer shadows a farther one silently; there is no API to inspect all shadowed definitions.

<a id="pkg-taskweaver-dsh-skill-filesystem"></a>
### `@taskweaver/dsh-skill-filesystem`

<!-- migrated-from: packages/runtime/skill/skill-filesystem/README.md -->
目录：`skill/skill-filesystem`。
package.json 描述：Local filesystem skill provider for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-skill-filesystem--taskweaver-dsh-skill-filesystem"></a>
Local filesystem provider for the `ctx.skills` registry.

This package implements one skill source. It scans local project, custom, and user skill roots, parses `SKILL.md` or flat Markdown skill files, and registers the provider on `ctx.skills`. The registry remains in `@taskweaver/dsh-skill`; the durable session catalogs and model-facing loader tool remain in `@taskweaver/dsh-tool-skill`.

<a id="pkg-taskweaver-dsh-skill-filesystem--plugin"></a>
#### Plugin

Requires `ctx.skills` (`inject: ['skills']`).

<a id="pkg-taskweaver-dsh-skill-filesystem--config"></a>
##### Config

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `filesystem` | Unique name used to register this provider on `ctx.skills`. |
| `includeDefaultRoots` | `true` | Include project and user roots around `customSkillDirs`; set false for an isolated custom-root provider. |
| `dshHome` | `$TASKWEAVER_HOME` or `~/.taskweaver/runtime` | TaskWeaver runtime home resolved by [`@taskweaver/dsh-home-paths`](../util/README.zh.md#pkg-taskweaver-dsh-home-paths); scans `skills` under this directory. |
| `agentsHome` | `$TASKWEAVER_AGENTS_HOME` or `~/.agents` | Shared agent config root scanned for compatible skills. |
| `customSkillDirs` | `[]` | Additional local skill roots scanned after project roots and before user roots. |
| `watch` | `true` | Watch host-local roots and invalidate the local provider when catalog membership or frontmatter may have changed. |
| `watchUsePolling` | `false` | Use Chokidar polling instead of native events for existing skill roots. |
| `watchStabilityThresholdMs` | `200` | Stable-write window for Chokidar `add` and `change` events. |
| `watchPollIntervalMs` | `100` | Chokidar polling/stability interval and missing-path probe interval. |
| `watchMaxProjects` | `128` | Maximum distinct project roots retained in the watcher LRU. |
| `watchFollowSymlinks` | `true` | Follow symbolic links while watching existing roots. |

<a id="pkg-taskweaver-dsh-skill-filesystem--discovery"></a>
#### Discovery

Default roots are resolved in this provider's rank order:

| Rank | Source | Path |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |

The project root is the nearest ancestor containing `.git`; without one, the current cwd is used. The user DSH root skips its `.system` child so system-owned directories are not treated as normal user skills. `includeDefaultRoots: false` omits the project and user rows and the `$TASKWEAVER_BUNDLED_SKILL_DIR` environment default while retaining explicitly configured custom and bundled roots, allowing several uniquely named isolated providers to see only their own roots. This provider supplies project and user skills; another provider may supply built-in system skills.

When `ctx.fs` is available, discovery lists roots through `ctx.fs.listDir`, reads skill files through `ctx.fs.readText`, and probes `.git` through the filesystem service. Full skill loads forward the lookup abort signal to filesystem metadata and content reads. Without a filesystem service, the provider falls back to abortable Node filesystem I/O so minimal local contexts can still load skills. Confirmed missing paths are valid empty state, malformed or non-text entries warn and skip, and unexpected discovery/read failures make the registry snapshot incomplete rather than replacing a last-good model catalog with a misleading deletion.

<a id="pkg-taskweaver-dsh-skill-filesystem--catalog-change-detection"></a>
#### Catalog Change Detection

Existing skill roots are watched with Chokidar. Before opening a native watcher, the provider realpaths the existing root or ancestor and restores the next missing segment; when `watchFollowSymlinks` is false and the root itself is a symbolic link, it preserves that final link so Chokidar can enforce the configured boundary. Discovery and diagnostics retain the configured path, while Windows cannot otherwise mix an 8.3 alias with long-form libuv events. The provider observes direct bundle directory additions/removals, flat Markdown additions/removals, and direct `SKILL.md` additions/removals/changes; `change` exists to rediscover catalog frontmatter such as `name` and `description`. Changes below `references`, `scripts`, `assets`, or other bundle resources do not invalidate the catalog. Events delivered in the same microtask batch collapse to one provider invalidation.

A root that does not exist is followed from the nearest existing ancestor one missing path segment at a time. The next segment is probed with `fs.watchFile`; once `.agents`, `skills`, or the configured root appears, observation advances until Chokidar can attach to the real root. Root deletion reverses this process, so deleting and recreating an entire skills directory remains observable. Project-scoped watchers are bounded by `watchMaxProjects`; revisiting an evicted project reattaches observation during discovery.

The first-party filesystem `write` and `edit` tools also synchronously invalidate the provider through `fs/observed` when their target could affect a watched skill entry. This fast path makes the next model step observe its own filesystem mutation without waiting for the host watcher. External IDE, Git, shell, and process changes rely on Chokidar or the missing-path probe. Existing-root watchers remain persistent until effect teardown so Chokidar owns asynchronous native error events; startup/runtime watcher failures are logged and retried. Discovery still scans readable roots and returns their candidates for direct loading, but marks the observation incomplete so it is not cached or published as an authoritative model catalog. Effect teardown closes every watcher and contains late callbacks.

<a id="pkg-taskweaver-dsh-skill-filesystem--skill-format"></a>
#### Skill Format

Skills can be single-level directory bundles (`<name>/SKILL.md`) or flat Markdown files (`<name>.md`). Nested `**/SKILL.md` discovery is deliberately excluded. Frontmatter is parsed as an open YAML object with the `yaml` package; this provider interprets required `name` and `description`, plus optional `whenToUse`, `metadata`, `disable-model-invocation`, and `user-invocable`. Names must be kebab-case.

The two invocation fields accept YAML booleans and the case-insensitive forms `true`/`false`, `yes`/`no`, `on`/`off`, and `1`/`0`. `disable-model-invocation: true` excludes the skill from model-facing catalogs and loaders; `user-invocable: false` excludes it from human-facing commands. Each omitted field defaults to permitting its surface, and the provider always emits both positive internal policy values, including when both keys are absent. A rejected camel-case spelling or a non-boolean invocation value drops the entire skill from discovery with a warning instead of discarding only that field or falling back to a permissive default. Invocation policy fails closed because ignoring invalid data could expose a skill on a disabled surface; wrong-typed optional `whenToUse` and `metadata` values are omitted because neither currently grants invocation.

The catalog and body have separate lifecycles. Discovery parses frontmatter to produce the summary. Every `skill(name)` load rereads and reparses the current file, so body edits need no hash, revision, cache invalidation, or proactive model notification. A frontmatter rename between discovery and loading rejects the stale name and invalidates the provider; the next catalog observation publishes the new name.

<a id="pkg-taskweaver-dsh-skill-filesystem--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-tool-skill`, which renders this provider's invocable names and capped descriptions into the initial or replacement catalog and a selected current instruction body plus resource-base guidance into retained tool history while paths, provider ranks, and disabled skills remain hidden.

<a id="pkg-taskweaver-dsh-skill-filesystem--kv-cache-effect"></a>
###### KV Cache effect

Watcher invalidation can cause the named consumer to append a replacement catalog to the existing request history. Body-only edits leave the catalog digest unchanged.

<a id="pkg-taskweaver-dsh-skill-filesystem--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Discovery is one level deep** — only `<root>/<name>/SKILL.md` and `<root>/<name>.md` are recognized; nested skill trees and package manifests are ignored.
- **Project scope is the nearest `.git` ancestor** — workspaces without that marker fall back to the supplied cwd, with no alternate project-root marker or monorepo subproject selection.
- **Malformed entries disappear with a warning** — the model catalog receives no per-skill diagnostic and cannot distinguish an absent skill from an invalid one; unexpected I/O failures preserve the last-good catalog instead.
- **Missing-root observation polls one path segment** — roots absent at startup use `fs.watchFile` at `watchPollIntervalMs` until Chokidar can attach, trading bounded detection latency for reliable creation detection across IDE, Git, and shell workflows.
- **No body revision protocol** — a loaded body is ordinary retained tool history; later file edits affect later calls but neither rewrite old results nor announce that the body changed.

<a id="pkg-taskweaver-dsh-tool-skill"></a>
### `@taskweaver/dsh-tool-skill`

<!-- migrated-from: packages/runtime/skill/tool-skill/README.md -->
目录：`skill/tool-skill`。
package.json 描述：Model-facing skill loading tool for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-tool-skill--taskweaver-dsh-tool-skill"></a>
The model-facing skill catalog and `skill` tool.

Requires `ctx.agents`, `ctx.tools`, and `ctx.skills` (`inject: ['agents', 'tools', 'skills']`).

<a id="pkg-taskweaver-dsh-tool-skill--catalog-lifecycle"></a>
#### Catalog lifecycle

At every eligible `agent/pre-step`, the plugin calls `ctx.skills.snapshot()` for the calling session's cwd, forwards the pre-step abort signal to discovery, applies exact `skill` tool visibility, and renders the ordered `name` and `description` entries. When no prior catalog exists and that view is non-empty, it adds an initial durable user-role `<system-reminder>` to a downstream `enter` decision. Catalog messages contain only those summaries; skill bodies, paths, sources, providers, and `whenToUse` hints remain outside the catalog.

Every catalog message carries the `skill-catalog` source: a `catalog`-form context whose `entries` record exactly the `name` and `description` pairs it published, plus `update` on a replacement. The digest covers those durable entries, not the rendered prose, so the surrounding `<system-reminder>` framing cannot decide whether a republish is needed and consumers never re-parse the `<available_skills>` block. The plugin scans durable session events backwards without copying them and derives the comparison baseline from the newest visible `skill-catalog` message it can read; unreadable and foreign records are skipped. When the digest changes, the downstream `enter` decision receives a durable user-role message containing the complete replacement catalog; an empty replacement explicitly retires earlier names. If no catalog remains visible but a recognizable historical catalog exists, compaction hid it and the next complete observation re-establishes the current catalog. An incomplete provider snapshot emits nothing and preserves the last-good model view for retry at the next pre-step. If no prior catalog exists and the current view is empty, no tombstone is necessary.

The catalog is omitted when no model-invocable skills are initially available, and also when that agent's tool view restricts away the shipped `skill` tool or resolves a same-name scoped shadow instead. Identity is compared against the definition this plugin registered rather than a lookup of its own name, so the plugin works mounted globally or inside one agent's composition, where `register()` files into that agent's layer alone. Visibility changes participate in the digest, keeping prompt guidance, model-visible schema, and executable dispatch aligned.

`catalogDescriptionMaxLength` controls normalized catalog descriptions; rendering XML-escapes them. Its default is `500` and values must be integers of at least `3`, which reserves room for a truncation ellipsis. The [skill catalog hot-refresh Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-27-skill-catalog-hot-refresh.md`） owns the durable initial catalog and replacement lifecycle.

<a id="pkg-taskweaver-dsh-tool-skill--tool-skill"></a>
#### Tool: `skill`

| Arg | Type | Notes |
|---|---|---|
| `name` | string (required) | Exact kebab-case skill name from the available skills listing. |

Execution uses the calling agent's `session.header.cwd` so workspace-sensitive providers resolve the winning skill. A successful call returns canonical `{ name, provider, resourceBase?, content }`, excluding catalog ranking and provider-internal machinery; its Native renderer produces one text result containing `<skill_content name="...">`, `<skill_resources>`, and `<skill_instructions>`.

Resource guidance resolves only paths or URLs explicitly referenced by the instructions against `resourceBase`; scripts, references, and assets load on demand, and the result does not enumerate a skill directory. Local providers may supply a directory, while remote or embedded providers may supply a URL or opaque loading guidance.

An unresolved name reports that the skill is unknown or no longer available. Invalid names and skills whose `invocation.modelInvocable` is `false` produce distinct error results. `invocation.userInvocable` does not restrict this model-facing tool.

Tool execution does not add a synthetic context message. Its freshly loaded result is already recorded as the tool result and becomes available to the next model step without duplicating the body. Only the catalog projection adds replacement summaries.

<a id="pkg-taskweaver-dsh-tool-skill--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-skill--session-catalog"></a>
##### Session catalog

<a id="pkg-taskweaver-dsh-tool-skill--what-the-model-sees"></a>
###### What the model sees

If model-invocable skills exist and this exact `skill` tool is visible, the agent receives the catalog template below as a durable user-role message before the first request, with one data-dependent entry per sorted skill. Later membership, description, or visibility changes append a complete replacement using the same `<available_skills>` envelope; deleting every skill appends an empty envelope with an explicit instruction not to use older names. The template's closing sentence is the rule against double-loading: the user-explicit gesture boundary (the pre-step listener below) injects the same `renderSkillContent` output (shared from `@taskweaver/dsh-skill`) inline, and the catalog tells the model to follow that block instead of re-loading the skill through the tool; the replacement-catalog template carries the same sentence in both arms, including the emptied catalog.

<a id="pkg-taskweaver-dsh-tool-skill--skill-catalog-template"></a>
###### Skill catalog template

```markdown
<system-reminder>
A skill is a reusable set of task-specific instructions. The following skills are available in this session:

<available_skills>
- `<name>`: <normalized-and-capped-description>
</available_skills>

If the user names a skill, or the task clearly matches a skill's description, call the `skill` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded.
A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool again for that skill.
</system-reminder>
```

<a id="pkg-taskweaver-dsh-tool-skill--token-effect"></a>
###### Token effect

Repeated input cost scales with skill count and `catalogDescriptionMaxLength`; no initial catalog tokens are sent when the list is empty or the tool is hidden or shadowed. Each actual catalog change adds one retained complete replacement message.

<a id="pkg-taskweaver-dsh-tool-skill--kv-cache-effect"></a>
###### KV Cache effect

The initial durable catalog is appended after the existing reusable prefix. Dynamic changes are append-only history after that catalog, so earlier reusable tokens stay intact while each newly appended catalog and later turns form a new suffix. A new or resumed instance with a changed digest may affect cache reuse from the newly appended catalog position.

<a id="pkg-taskweaver-dsh-tool-skill--tool-schema"></a>
##### Tool schema

<a id="pkg-taskweaver-dsh-tool-skill--what-the-model-sees-1"></a>
###### What the model sees

The model sees the generated [`skill` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-skill`）.

<a id="pkg-taskweaver-dsh-tool-skill--token-effect-1"></a>
###### Token effect

Fixed schema cost per request where the tool is visible.

<a id="pkg-taskweaver-dsh-tool-skill--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while the tool definition and visibility are unchanged. Shadowing, restrictions, or plugin lifecycle changes may invalidate reuse from this schema.

<a id="pkg-taskweaver-dsh-tool-skill--tool-result"></a>
##### Tool result

<a id="pkg-taskweaver-dsh-tool-skill--what-the-model-sees-2"></a>
###### What the model sees

A successful call uses the result template and the provider-managed, directory, URL, or opaque resource guidance below.

<a id="pkg-taskweaver-dsh-tool-skill--skill-result-template"></a>
###### Skill result template

```markdown
<skill_content name="<escaped-name>">
<skill_resources>
<resource-guidance>
</skill_resources>

<skill_instructions>
<provider-owned-instruction-body>
</skill_instructions>
</skill_content>
```

<a id="pkg-taskweaver-dsh-tool-skill--provider-managed-resource-guidance"></a>
###### Provider-managed resource guidance

```markdown
Resources for this skill are managed by provider "<provider>".
Load referenced resources only as needed.
```

<a id="pkg-taskweaver-dsh-tool-skill--directory-resource-guidance"></a>
###### Directory resource guidance

```markdown
Base directory for this skill: <path>
Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.
```

<a id="pkg-taskweaver-dsh-tool-skill--url-resource-guidance"></a>
###### URL resource guidance

```markdown
Base URL for this skill: <url>
Resolve relative URLs mentioned by this skill against the base URL before using them. Load referenced resources only as needed.
```

<a id="pkg-taskweaver-dsh-tool-skill--opaque-resource-guidance"></a>
###### Opaque resource guidance

```markdown
Resources for this skill: <description>
Load referenced resources only as needed.
```

<a id="pkg-taskweaver-dsh-tool-skill--token-effect-2"></a>
###### Token effect

Loaded instructions are data-dependent tool-result tokens, resent on later steps until compaction; no duplicate `agent.inject()` copy is made.

<a id="pkg-taskweaver-dsh-tool-skill--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-skill--tool-errors"></a>
##### Tool errors

<a id="pkg-taskweaver-dsh-tool-skill--what-the-model-sees-3"></a>
###### What the model sees

Invalid or stale selections return exactly `Error: invalid skill name "<name>"`, `Error: skill "<name>" is unknown or no longer available`, or `Error: skill "<name>" is not available for model invocation`. Provider-thrown lookup text is data-dependent and receives the same `Error: <message>` wrapper.

<a id="pkg-taskweaver-dsh-tool-skill--token-effect-3"></a>
###### Token effect

Only a failing call adds these retained tokens.

<a id="pkg-taskweaver-dsh-tool-skill--kv-cache-effect-3"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-skill--user-explicit-invocation-injection"></a>
##### User-explicit invocation injection

<a id="pkg-taskweaver-dsh-tool-skill--what-the-model-sees-4"></a>
###### What the model sees

A whitespace-bounded `/name` token anywhere in a claimed user message, naming a user-invocable skill in the workspace catalog, injects that skill's full `<skill_content>` rendering (the exact result-template shape above) as a `user`-role instructions context appended after every other injection of that step — background first, the material to act on last. Only direct user input is scanned, the check runs on the loaded definition, and unknown or user-disabled names stay ordinary prose. This is the sole entry point for `disable-model-invocation` skills, which the catalog and the `skill` tool never expose; the catalog's closing sentence tells the model to follow the injected block instead of re-loading it.

<a id="pkg-taskweaver-dsh-tool-skill--token-effect-4"></a>
###### Token effect

Each gesture adds one rendered skill body to that turn as injected context — the same size as the tool result for the same skill, paid deterministically at the user's request instead of at the model's discretion. Repeated gestures for one skill within one step inject once.

<a id="pkg-taskweaver-dsh-tool-skill--kv-cache-effect-4"></a>
###### KV Cache effect

Append-only; the injection lands after the reusable request prefix inside the step's message batch and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-skill--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **The catalog omits `whenToUse`, source, and provider metadata** — routing is based only on name and a capped description; `whenToUse` remains provider metadata and is not rendered by the loaded wrapper either.
- **Loaded instruction bodies have no size cap** — a provider can return a skill large enough to consume substantial next-step context; only catalog descriptions are truncated.
- **Resources are guidance, not attachments** — the tool reports a base directory/URL/opaque hint but neither enumerates nor fetches referenced files for the model.
- **Loading is one-shot text** — there is no partial, streaming, or cached-content handle when a remote provider is slow or a skill body is large.
- **Catalog replacement is whole-list** — one changed name or description appends every currently visible summary; this keeps stale-name retirement explicit but costs tokens proportional to the catalog.
- **Bodies are not versioned** — body-only edits do not change the catalog digest or notify the model; a later tool call reads the current provider content while earlier tool results remain historical facts.

<a id="family-skill"></a>
### 原族级说明（迁移保留）

<a id="family-skill--skill-skill-capability-family"></a>
This family discovers reusable agent instructions and exposes them to the model through a provider-neutral catalog and loader.

| Package | Role | ctx key |
|---|---|---|
| [`skill/`](./README.zh.md#pkg-taskweaver-dsh-skill) | Defines skill provider registration and lookup | `ctx.skills` |
| [`skill-filesystem/`](./README.zh.md#pkg-taskweaver-dsh-skill-filesystem) | Discovers skills from local filesystems | registers on `ctx.skills` |
| [`tool-skill/`](./README.zh.md#pkg-taskweaver-dsh-tool-skill) | Publishes the skill catalog and model-facing loader | registers on `ctx.tools` |

This capability remains outside the core control spine and can use local, embedded, or remote providers without changing the model-facing contract.

The subsystem reference — discovery priority, catalog snapshots, the `skill` loader — is [docs/subsystems/skills.md]（原文链接目标：`../../docs/subsystems/skills.md`）.
