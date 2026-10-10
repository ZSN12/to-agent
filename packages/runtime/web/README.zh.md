# web 包族

<a id="family-web"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义网页搜索与抓取契约，提供 Provider 和模型可调用工具。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-tool-web`](#pkg-taskweaver-dsh-tool-web) | `web/tool-web` | [接口与限制](#pkg-taskweaver-dsh-tool-web) |
| [`@taskweaver/dsh-web`](#pkg-taskweaver-dsh-web) | `web/web` | [接口与限制](#pkg-taskweaver-dsh-web) |
| [`@taskweaver/dsh-web-fetch-http`](#pkg-taskweaver-dsh-web-fetch-http) | `web/web-fetch-http` | [接口与限制](#pkg-taskweaver-dsh-web-fetch-http) |
| [`@taskweaver/dsh-web-search-deepseek`](#pkg-taskweaver-dsh-web-search-deepseek) | `web/web-search-deepseek` | [接口与限制](#pkg-taskweaver-dsh-web-search-deepseek) |
| [`@taskweaver/dsh-web-search-taskweaver`](#pkg-taskweaver-dsh-web-search-taskweaver) | `web/web-search-taskweaver` | [接口与限制](#pkg-taskweaver-dsh-web-search-taskweaver) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-tool-web"></a>
### `@taskweaver/dsh-tool-web`

<!-- migrated-from: packages/runtime/web/tool-web/README.md -->
目录：`web/tool-web`。
package.json 描述：Model-facing web tools (web_search, web_fetch) over the DeepSeek Harness web capability seam (ctx.web)

<a id="pkg-taskweaver-dsh-tool-web--taskweaver-dsh-tool-web"></a>
The model-facing web tool suite — `web_search` and `web_fetch` — over the [web capability seam](./README.zh.md#pkg-taskweaver-dsh-web) (`ctx.web`). It owns model-facing concerns only: tool names, JSON schemas, snake_case argument names, prompt sections, the result-count bound, result formatting, HTML→markdown presentation, and the UI presentation projection — `presentCall`, `presentResult` (a `card: 'web'` result card discriminated by `kind: 'search' | 'fetch'`), and the `output.presentationMeta` that carries the structured search sources or the fetch summary the lossy render text cannot (see the [web-result-card Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-30-web-result-card.md`）). All web access goes through `ctx.web`; this package never imports a concrete provider. Neither tool exposes a model-facing timeout — each tool's cooperative tool-call budget is declared here via config (`fetchTimeoutMs`/`searchTimeoutMs`, attached as `ToolDefinition.timeoutMs`) and enforced by [`@taskweaver/dsh-tool-call-timeout-policy`](../guard/README.zh.md#pkg-taskweaver-dsh-tool-call-timeout-policy) (a `tools/execute` wrapper). Single operations forward `exec.signal`; a multi-query search fuses it with batch cancellation so a failed query aborts its siblings.

Each tool is registered independently; a product that wants only one disables the other via config (`{ search: false }` / `{ fetch: false }`). Search guidance mentions `web_fetch` only when fetch is also config-enabled; a search-only composition instead tells the model to use returned snippets and cite their URLs.

<a id="pkg-taskweaver-dsh-tool-web--tools"></a>
#### Tools

| Tool | Args | Behavior |
|---|---|---|
| `web_search` | `queries` (required string[]) | Discovery. Returns an optional answer plus source URLs. It runs one to `searchMaxQueries` distinct searches concurrently and merges their sources in round-robin order before applying the combined `searchMaxResults` cap. A one-item array performs one search. Exact duplicate queries run once. Any failed search aborts the remaining batch, which settles before the call returns an error. Neither bound is model-facing. |
| `web_fetch` | `url` (string) | Retrieves a specific URL. HTML bodies are rendered to markdown (turndown with GFM tables/strikethrough); text bodies pass through. A non-2xx status is reported, not an error. The tool-call timeout is deployment policy (`dsh-tool-call-timeout-policy`), not a model argument. |

Both tools opt into concurrent scheduling because provider reads return content without mutating parent-agent state.

The normalized service results are also the canonical tool values: `WebSearchResult` and `WebFetchResult`. Native renderers preserve the answer/source and fetched-body text below; provider search/body caps remain acquisition limits rather than presentation-only truncation.

<a id="pkg-taskweaver-dsh-tool-web--config"></a>
#### Config

| Key | Default | Meaning |
|---|---|---|
| `search` | `true` | Register `web_search`. |
| `fetch` | `true` | Register `web_fetch`. |
| `searchMaxResults` | `8` | Upper bound on sources returned by one `web_search` call (the seam truncates each provider list; the tool also caps a combined multi-query list). |
| `searchMaxQueries` | `4` | Upper bound on queries accepted by one `web_search` call. The configured value appears in its prompt guidance and schema descriptions. |
| `fetchTimeoutMs` | `30000` | Cooperative tool-call timeout budget (ms) for `web_fetch`. |
| `searchTimeoutMs` | `30000` | Cooperative tool-call timeout budget (ms) for `web_search`. |
| `fetchMaxOutputChars` | `200000` | Cap on source characters converted synchronously and on one complete `web_fetch` output (header, rendered body, and footer); a cut body gets the truncation notice when it fits. |

`searchMaxQueries` bounds the accepted array before exact-string deduplication, provider fan-out, and combined provider-answer growth; validation rejects an oversized array before any search starts, then dispatch keeps the first occurrence of each query. Together with each provider's own controls such as `maxUses`, these independent settings are the product's search budgets; the generic seam does not expose provider-internal native-search accounting. `fetchTimeoutMs`/`searchTimeoutMs` declare each tool's cooperative timeout budget (attached as `ToolDefinition.timeoutMs`), enforced by [`@taskweaver/dsh-tool-call-timeout-policy`](../guard/README.zh.md#pkg-taskweaver-dsh-tool-call-timeout-policy); the model-facing schema exposes no timeout argument. `fetchMaxOutputChars` bounds both synchronous conversion work and the complete rendered result: only that many source characters are converted, and the header, converted prefix, and truncation notice are then capped together. The default leaves headroom above the local provider's 100,000-character body cap, but rendered expansion can still make the final bound truncate the result.

```yaml
- id: tool-web
  name: '@taskweaver/dsh-tool-web'
```

<a id="pkg-taskweaver-dsh-tool-web--stable-registration"></a>
#### Stable registration

Tool registration follows product **enablement**, not backend availability. A tool stays visible even when its selected provider is missing, misconfigured, ambiguous, or temporarily unavailable; the seam resolves the provider at execution time and execution fails with a structured `WebError` (e.g. `WEB_PROVIDER_UNAVAILABLE`, `WEB_PROVIDER_AMBIGUOUS`), which `ToolRuntime.execute()` turns into an error tool result the model can read and hooks/UI can route on. This keeps the model schema stable without making plugin load order, credential state, or HMR timing part of the model-facing contract. To remove a web tool entirely, disable it here in config.

The tool never calls a provider's `available()` and never enumerates providers — its only execution path is `ctx.web.search()` / `ctx.web.fetch()`, and provider unavailability reaches it as the structured `WebError` codes selection throws at execution time. Provider selection stays entirely inside the seam, with one owner.

<a id="pkg-taskweaver-dsh-tool-web--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-web--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-tool-web--what-the-model-sees"></a>
###### What the model sees

Search and fetch contribute the web-search and web-fetch guidance below. Search chooses its fetch-enabled or search-only text from config at registration time. A scoped tool restriction does not remove these independently registered sections.

<a id="pkg-taskweaver-dsh-tool-web--web-search-guidance-with-fetch-enabled"></a>
###### Web search guidance with fetch enabled

```markdown
Use the web_search tool to discover current information on the web. The required queries array accepts 1–4 non-empty search queries; use a one-item array for a single search. It returns an optional answer plus a list of source URLs. Follow up with web_fetch when you need the full content of a specific result, and cite the relevant URLs as markdown links.
```

<a id="pkg-taskweaver-dsh-tool-web--web-search-only-guidance"></a>
###### Web search-only guidance

```markdown
Use the web_search tool to discover current information on the web. The required queries array accepts 1–4 non-empty search queries; use a one-item array for a single search. It returns an optional answer plus a list of source URLs. Use the returned source snippets when available, and cite the relevant URLs as markdown links.
```

<a id="pkg-taskweaver-dsh-tool-web--web-fetch-guidance"></a>
###### Web fetch guidance

```markdown
Use the web_fetch tool to retrieve the content of a specific HTTP(S) URL (for example a result from web_search). It returns the page content decoded to text. Cite the URL as a markdown link when you use its content.
```

<a id="pkg-taskweaver-dsh-tool-web--token-effect"></a>
###### Token effect

Fixed guidance cost per request for each config-enabled tool, even when a restriction hides its schema. Toggling fetch or changing `searchMaxQueries` changes the search guidance; toggling fetch also registers or removes the fetch section.

<a id="pkg-taskweaver-dsh-tool-web--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while enabled tools, scope, and guidance text are unchanged. Config enablement—including toggling fetch's search-guidance branch—changing `searchMaxQueries`, or plugin lifecycle may invalidate reuse from the first changed prompt section; scoped schema restrictions do not remove it.

<a id="pkg-taskweaver-dsh-tool-web--tool-schemas"></a>
##### Tool schemas

<a id="pkg-taskweaver-dsh-tool-web--what-the-model-sees-1"></a>
###### What the model sees

The model sees the generated [`web_search` and `web_fetch` schemas]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-web`）. Result-count and timeout budgets are deployment settings, not model arguments.

<a id="pkg-taskweaver-dsh-tool-web--token-effect-1"></a>
###### Token effect

Fixed schema cost per request for a resolved `searchMaxQueries`; config disablement removes both schema and guidance, while a scoped restriction removes only the schema.

<a id="pkg-taskweaver-dsh-tool-web--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while definitions, resolved query cap, and visibility are unchanged. Config enablement, changing `searchMaxQueries`, plugin lifecycle, or scoped restrictions may invalidate reuse from the first changed schema token.

<a id="pkg-taskweaver-dsh-tool-web--search-result"></a>
##### Search result

<a id="pkg-taskweaver-dsh-tool-web--what-the-model-sees-2"></a>
###### What the model sees

The optional provider-owned answer is followed by `Sources:` and data-dependent lines shaped exactly `- [<title-or-url>]（原文链接目标：`url`）`, optionally suffixed ` — <snippet> (<publishedAt>)`. A multi-query call runs each exact query string once, preserving its first position; it labels each provider answer with the originating query as a markdown heading, deduplicates sources by URL, and takes one source at each rank from every query before advancing to the next rank. With neither answer nor sources the result says `No results found.` A capped list adds `(Showing the first <count> sources. Refine the query for more.)`; every result ends `Cite the relevant URLs above as markdown links in your answer.`

<a id="pkg-taskweaver-dsh-tool-web--token-effect-2"></a>
###### Token effect

Data-dependent results are resent until compaction; query fan-out is capped by `searchMaxQueries`, and sources are capped by `searchMaxResults`.

<a id="pkg-taskweaver-dsh-tool-web--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-web--search-failure"></a>
##### Search failure

<a id="pkg-taskweaver-dsh-tool-web--what-the-model-sees-3"></a>
###### What the model sees

If any query in a multi-query call fails, `web_search` aborts the other searches, waits for every started search to settle, discards successful results, and returns `Error: <message>` for the first failure.

<a id="pkg-taskweaver-dsh-tool-web--token-effect-3"></a>
###### Token effect

Only the retained error result adds tokens; discarded successful results do not enter model history.

<a id="pkg-taskweaver-dsh-tool-web--kv-cache-effect-3"></a>
###### KV Cache effect

Append-only; the error follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-web--fetch-result"></a>
##### Fetch result

<a id="pkg-taskweaver-dsh-tool-web--what-the-model-sees-4"></a>
###### What the model sees

A successful fetch is exactly `Fetched <finalUrl> (HTTP <statusCode>)`, a blank line, and the provider-owned decoded body. Truncation adds a blank line and `(Content truncated. Fetch a more specific URL or section for the full text.)`; failures become `Error: <message>`. Queries and URLs remain in call history.

<a id="pkg-taskweaver-dsh-tool-web--token-effect-4"></a>
###### Token effect

Provider caps bound body size; retained call arguments and results are resent until compaction, and timeout policy can replace a late result with a short error.

<a id="pkg-taskweaver-dsh-tool-web--kv-cache-effect-4"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-web--argument-errors"></a>
##### Argument errors

<a id="pkg-taskweaver-dsh-tool-web--what-the-model-sees-5"></a>
###### What the model sees

Schema validation rejects an absent or non-array `queries` field and non-string array elements before execution. Value errors become exactly `Error: queries must contain at least one query`, `Error: queries must contain at most 1 query` when the configured cap is one, `Error: queries must contain at most <count> queries` for larger caps, `Error: each query must be a non-empty string`, or `Error: url must be a non-empty string`.

<a id="pkg-taskweaver-dsh-tool-web--token-effect-5"></a>
###### Token effect

Only the failing call adds these retained tokens.

<a id="pkg-taskweaver-dsh-tool-web--kv-cache-effect-5"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-web--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **There is no batch-wide native-search counter** — `searchMaxQueries` bounds `ctx.web.search` calls, but a provider may perform several native searches inside each call. For example, a model-backed provider configured with `maxUses` can permit up to `searchMaxQueries × maxUses` native searches; `searchMaxResults` limits only the combined sources returned to the caller. Deployments control cost through these independent consumer and provider settings because the generic seam does not know provider-internal search units.
- **HTML→markdown conversion degrades on inputs GFM cannot safely represent** — [turndown](https://github.com/mixmark-io/turndown) (with GFM tables/strikethrough) converts at most `fetchMaxOutputChars` source characters through a real DOM. A conservative 512-level lexical guard passes deeply or ambiguously nested bodies through as raw HTML, conversion exceptions do the same, and table `colspan` is ignored because GFM has no spanning-cell representation; these bounds avoid blocking the event loop or expanding output from an untrusted numeric attribute ([archived dependency decision]（原文链接目标：`../../../.agents/notes/archived/simplification/2026-07-26-turndown-for-tool-web-html-markdown.md`）).
- **The model-facing API is minimal by design, with promotions deferred** — `max_results` stays a config bound (not a model argument), and `web_fetch` takes only `url` (no `format`/`prompt`/LLM-summarization mode); both are named later steps in [the seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md`）.
- **No web-specific permission policy** — both tools execute without requesting `ctx.approval`; a deployment that needs confirmation must add a `tools/pre-execute` policy, and the package does not define persistent URL/domain grants.

<a id="pkg-taskweaver-dsh-web"></a>
### `@taskweaver/dsh-web`

<!-- migrated-from: packages/runtime/web/web/README.md -->
目录：`web/web`。
package.json 描述：Abstract web access capability seam (ctx.web) for the DeepSeek Harness — search/fetch provider registry, registration-order-independent selection, request/result vocabulary, and the WebError taxonomy

<a id="pkg-taskweaver-dsh-web--taskweaver-dsh-web"></a>
The **`WebRuntime`** (`ctx.web`) defines WHAT web access the harness has — search the web, fetch a URL — over multiple providers, without binding the model contract to one vendor's API shape.

This package owns the Service Definition role of the web capability. Unlike shell/fs it spans two operations (search and fetch) on one seam, with potentially multiple providers each:

| Package | Role |
|---|---|
| `@taskweaver/dsh-web` (this) | Service Definition: the service, provider registries, selection policy, request/result vocabulary, the `WebError` taxonomy |
| `@taskweaver/dsh-web-fetch-http` | Fetch provider: anonymous public HTTP(S) |
| `@taskweaver/dsh-tool-web` | Consumer: the model-facing `web_search` / `web_fetch` tool schemas over `ctx.web` |

Search and fetch share no request schema and no business logic, but they are deliberately one seam: `ctx.web` is a single web-access middle layer with one provider-selection policy owner, one abort/error vocabulary, and one product-facing "how this harness reaches the web" config surface. The `Search`/`Fetch` method pairs are deliberately parallel.

<a id="pkg-taskweaver-dsh-web--service-api-ctx-web"></a>
#### Service API (`ctx.web`)

| Member | Semantics |
|---|---|
| `registerSearchProvider(provider)` / `registerFetchProvider(provider)` | Register a backend. Throws `WebError` `WEB_DUPLICATE_PROVIDER` on a duplicate id within that capability kind. Returns a disposer. Disposed with the calling fiber. |
| `search(request, signal?)` | Resolve the search provider and run one search. Enforces `request.maxResults` on the result (truncates `sources[]`, sets `truncated`). Throws `WebError` when the capability cannot run. |
| `fetch(request, signal?)` | Resolve the fetch provider and retrieve one URL. A non-2xx response is a result, not a throw. Throws `WebError` for failures to safely retrieve or represent the resource. |

Providers register **capabilities**, not tools. `dsh-tool-web` is the only owner of model-facing names, descriptions, prompt guidance, JSON schemas, and presentation.

<a id="pkg-taskweaver-dsh-web--selection"></a>
#### Selection

Selection never depends on registration, config, or HMR order. A capability has an explicit provider id (config `searchProvider`/`fetchProvider`, or env `$TASKWEAVER_WEB_SEARCH_PROVIDER`/`$TASKWEAVER_WEB_FETCH_PROVIDER` feeding the same fields), or auto-selects when exactly one usable provider is registered. `search()`/`fetch()` resolve the provider at execution time:

| Situation | Execution |
|---|---|
| configured id registered and `available()` | runs that provider |
| configured id not registered | `WEB_PROVIDER_CONFIGURED_MISSING` |
| configured id registered but unavailable | `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` |
| no id, exactly one registered usable provider | runs it |
| no id, no usable provider | `WEB_PROVIDER_UNAVAILABLE` |
| no id, multiple usable providers | `WEB_PROVIDER_AMBIGUOUS` |

The failure branches throw `WebError`, whose structured code (plus message detail — the missing id, the ambiguous candidate set) is the direct callers route on. A provider's own `available()` is a cheap local check (credential presence, parseable config) that feeds this execution-time selection and **must not make network calls**; `dsh-tool-web` never calls it — the tool executes through `ctx.web.search()`/`fetch()` and routes on the thrown codes, so provider selection has one owner.

<a id="pkg-taskweaver-dsh-web--vocabulary"></a>
#### Vocabulary

`WebSearchRequest` (`query`, `maxResults?`) → `WebSearchResult` (`content?`, `sources[]`, `truncated`); each `WebSearchSource` has a required `url` and optional `title`/`snippet`/`publishedAt` (Perplexity citations may be URL-only). `WebFetchRequest` (`url`) → `WebFetchResult` (final `url`, `statusCode`, `body`, `truncated`); cancellation is a direct optional `AbortSignal` argument to `search()`/`fetch()`. `WebFetchBody` is a CLOSED discriminated union (`html` | `text`) owned here — consumers `switch` to exhaustiveness so a new kind breaks their compilation until handled. See `src/types.ts` for the full contracts and the `WebError` code taxonomy.

<a id="pkg-taskweaver-dsh-web--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-tool-web`, which retains bounded normalized provider data or the exact configured-provider, unavailable-provider, no-provider, multiple-provider, and `Error: <message>` failures while this registry contributes no prompt or schema itself.

<a id="pkg-taskweaver-dsh-web--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-web--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No observation surface** — no provider-change event and no capability-status query; availability is observed only by executing `search()`/`fetch()` and routing the thrown `WebError` codes.
- **`WebSearchRequest` carries only `query` + `maxResults`** — provider-neutral controls (recency, domain filters, regional hints, search depth) are deferred until a selected provider can honor them honestly.
- **`WebFetchBody` has no `pdf` arm** — text-extractable PDF support is named deferred work; the closed union makes adding it a compile-enforced change across the three web packages.
- **Provider-backed page extraction is out of scope of `fetch()`** — a Firecrawl/Tavily-style `web_extract` capability is deferred rather than widening the fetch operation.

<a id="pkg-taskweaver-dsh-web-fetch-http"></a>
### `@taskweaver/dsh-web-fetch-http`

<!-- migrated-from: packages/runtime/web/web-fetch-http/README.md -->
目录：`web/web-fetch-http`。
package.json 描述：Anonymous public HTTP(S) fetch provider for the DeepSeek Harness web capability seam (ctx.web)

<a id="pkg-taskweaver-dsh-web-fetch-http--taskweaver-dsh-web-fetch-http"></a>
An anonymous public HTTP(S) `WebFetchProvider` for the harness [web capability seam](./README.zh.md#pkg-taskweaver-dsh-web) (`ctx.web`). It retrieves a concrete URL and returns a status code plus bounded decoded content.

This is an **implementation** package: it registers a provider into `ctx.web`, it does not own the key and it does not register a model-facing tool. It is a function/namespace plugin (`inject: ['web']`).

<a id="pkg-taskweaver-dsh-web-fetch-http--responsibility-split"></a>
#### Responsibility split

The provider owns **safe resource retrieval**: URL validation, HTTP transport, redirect policy, a resource-backstop timeout, abort propagation, byte caps, charset decoding, content-type classification, and binary rejection. `@taskweaver/dsh-tool-web` owns **presentation** (HTML→markdown, truncation formatting). A non-2xx HTTP response is a *result* (status code + decoded body), not an error; `WebError` is reserved for failures to safely retrieve or represent the resource.

The provider's `timeoutMs` is a resource backstop for direct `ctx.web.fetch()` callers and misconfigured deployments, not the model-facing tool-call budget. [`dsh-tool-call-timeout-policy`](../guard/README.zh.md#pkg-taskweaver-dsh-tool-call-timeout-policy) owns the `web_fetch` tool-call budget by arming `exec.signal`.

A shipping web-tool deployment sets the provider backstop above the tool budget, so model calls normally return `TOOL_TIMEOUT`. If the outer deadline reaches the provider first, the provider reports `WEB_ABORTED` and the outer policy replaces it with `TOOL_TIMEOUT`. `WEB_FETCH_TIMEOUT` therefore identifies a direct service caller whose provider budget elapsed.

<a id="pkg-taskweaver-dsh-web-fetch-http--transport-hygiene"></a>
#### Transport hygiene

- Accepts only `http:` and `https:` URLs; rejects credentials in URLs (`WEB_BLOCKED_URL`) and over-long/malformed URLs (`WEB_INVALID_URL`).
- Enforces a max URL length, response byte cap (`WEB_FETCH_TOO_LARGE`), decoded body character cap, timeout (`WEB_FETCH_TIMEOUT`), and redirect hop cap.
- Propagates the caller's abort signal (`WEB_ABORTED`) into the network request and the streaming read.
- Follows only **same-origin** redirects; a cross-origin redirect fails with `WEB_REDIRECT_BLOCKED`, requiring a fresh tool call (the model of Claude Code's WebFetch).
- Sends an explicit product `User-Agent`, never a browser disguise.
- Rejects unsupported (e.g. binary) content types with `WEB_UNSUPPORTED_CONTENT_TYPE`.

<a id="pkg-taskweaver-dsh-web-fetch-http--config"></a>
#### Config

| Key | Default | Meaning |
|---|---|---|
| `maxUrlLength` | `2048` | Maximum accepted request URL length. |
| `maxResponseBytes` | `5_000_000` | Maximum response body size in bytes. |
| `maxBodyChars` | `100_000` | Maximum decoded body length in characters. |
| `timeoutMs` | `30_000` | Fetch timeout within Node's timer range — a resource backstop for direct `ctx.web.fetch()` callers, not the model-facing tool-call budget (that is `dsh-tool-call-timeout-policy`). |
| `maxRedirects` | `5` | Maximum same-origin redirect hops (`0` follows none). |
| `userAgent` | `deepseek-harness/…` | `User-Agent` header. |

The numeric limits are validated at plugin construction: every cap except `maxRedirects` must be a positive finite number, and `maxRedirects` must be a non-negative integer. An invalid value throws rather than silently constructing a provider with nonsensical limits.

<a id="pkg-taskweaver-dsh-web-fetch-http--model-experience"></a>
#### Model Experience

Indirectly, through [`dsh-tool-web`](./README.zh.md#pkg-taskweaver-dsh-tool-web), which places this provider's `maxBodyChars`-bounded decoded text or markdown-shaped HTML under its fetch-result wrapper and retains provider failures while redirects, headers, and transport mechanics remain hidden.

<a id="pkg-taskweaver-dsh-web-fetch-http--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-web-fetch-http--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **SSRF / private-network protection is deferred** — no blocking of private, loopback, link-local, multicast, or otherwise non-public destinations, no DNS-resolve-then-validate, no per-hop re-validation (see [the web capability seam Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md`）). Until it lands, this provider is an SSRF primitive and **must not be enabled** in a deployment that can reach sensitive internal network targets.
- **Only textual content decodes** — html/xhtml and `text/*`-plus-JSON/XML families; a missing `Content-Type` or any binary type throws `WEB_UNSUPPORTED_CONTENT_TYPE`, and text-extractable PDF decoding is named deferred work.
- **Charset comes only from the `Content-Type` header** (UTF-8 default) — an HTML `<meta charset>` declaration is ignored, and a declared-but-unrecognized charset label throws rather than falling back.

<a id="pkg-taskweaver-dsh-web-search-deepseek"></a>
### `@taskweaver/dsh-web-search-deepseek`

<!-- migrated-from: packages/runtime/web/web-search-deepseek/README.md -->
目录：`web/web-search-deepseek`。
package.json 描述：DeepSeek-backed search provider (native web_search via the Anthropic-compatible API) for the DeepSeek Harness web capability seam (ctx.web)

<a id="pkg-taskweaver-dsh-web-search-deepseek--taskweaver-dsh-web-search-deepseek"></a>
A [DeepSeek](https://deepseek.com)-backed `WebSearchProvider` for the harness [web capability seam](./README.zh.md#pkg-taskweaver-dsh-web) (`ctx.web`). It calls DeepSeek's **Anthropic-compatible Messages API** (`POST {baseURL}/messages`) with the native `web_search_20250305` server tool enabled, and maps the structured `web_search_tool_result` blocks DeepSeek returns into the seam's normalized `WebSearchResult`.

This is an **implementation** package: it registers a provider into `ctx.web`, resolves its credential for each search through the optional `ctx.credentials` seam, records the auxiliary request in the initiating Agent session when one exists, and does not register a model-facing tool. Like `@taskweaver/dsh-llm-deepseek`, it is a function/namespace plugin (`inject: ['web']`). The Anthropic wire shape is a provider-private detail — it does **not** make this provider depend on `ctx.llm`.

<a id="pkg-taskweaver-dsh-web-search-deepseek--how-it-differs-from-a-dedicated-search-endpoint"></a>
#### How it differs from a dedicated search endpoint

Exa and Perplexity expose dedicated search endpoints; DeepSeek does not. Instead this provider issues a **full Messages model call** carrying the `web_search` server tool, so one search costs a complete model turn in latency and tokens — heavier than a pure retrieval endpoint. DeepSeek runs the search server-side and returns **structured** `web_search_tool_result` blocks; the provider parses those blocks and **never scrapes URLs out of model prose**.

**Strict mode**: if the response carries no `web_search_tool_result` block (native search did not trigger), the provider throws `WebError` `WEB_PROVIDER_ERROR` rather than degrading to prose-scraping.

It reuses the `DEEPSEEK_API_KEY` credential reference (no new secret) but **not** `$DEEPSEEK_BASE_URL`: the search endpoint is the Anthropic-compatible base (`https://api.deepseek.com/anthropic/v1`), distinct from the chat-completions base (`https://api.deepseek.com`) the LLM adapter uses. A mounted credentials service is authoritative; without one, the provider falls back to the launching process environment. The reference is resolved for each search, so a key stored or rotated by the Web Models page reaches the next call without a restart.

<a id="pkg-taskweaver-dsh-web-search-deepseek--config"></a>
#### Config

| Key | Default | Meaning |
|---|---|---|
| `apiKey` | omitted | Literal DeepSeek API key. Prefer `apiKeyEnv` so no secret enters configuration; a non-empty literal wins. |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Credential reference resolved for each search through `ctx.credentials`, or from the process environment when that seam is absent. A missing value fails the call as `WEB_PROVIDER_CREDENTIAL_MISSING`. |
| `baseURL` | `https://api.deepseek.com/anthropic/v1` | Anthropic-compatible endpoint base; `/messages` is appended. Falls back to `$DEEPSEEK_SEARCH_BASE_URL` from any environment layer; do not reuse `$DEEPSEEK_BASE_URL`, which belongs to the chat-completions LLM adapter. An unparseable value makes the provider unavailable. |
| `model` | `deepseek-v4-flash` | Anthropic-format model name. |
| `apiVersion` | `2023-06-01` | `anthropic-version` header value. |
| `maxTokens` | `4096` | Positive-integer upper bound on generated tokens for the Messages request. |
| `maxUses` | `5` | Positive-integer maximum `web_search` server-tool uses per request. |

```yaml
- id: web-search-deepseek
  name: '@taskweaver/dsh-web-search-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    baseURL: https://gateway.internal/anthropic/v1
```

The entry above is the base layer of the `web-search-deepseek` Settings section: a user layer over it reaches the NEXT search, because the provider projects the section per call rather than capturing it at registration. The seam's provider selection therefore never flickers when an endpoint or model changes. `apiKey` carries `role('secret')`, so it never rides a `describe()` response in any layer — a configuration surface learns only whether the credentials domain holds a value for the reference `apiKeyEnv` names, never whether a layer carries a literal key.

<a id="pkg-taskweaver-dsh-web-search-deepseek--mapping"></a>
#### Mapping

DeepSeek returns no provider-generated answer content this provider trusts as `content`, so `content` is omitted. `sources[]` comes from `web_search_result` items inside `web_search_tool_result` blocks: `url` ← `url`, `title` ← `title`, and `publishedAt` ← `page_age`. Snippets live separately as URL-keyed `cited_text` entries in a text block's `citations[]`; the provider joins them, leaving `snippet` absent when no excerpt exists.

Results are deduplicated by URL because one request may surface the same page across searches. DeepSeek exposes `maxUses`, not a result-count knob, so the seam enforces `maxResults` by truncating `sources[]` and setting `truncated`.

Provider failures become `WEB_PROVIDER_ERROR`; caller cancellation becomes `WEB_ABORTED`. HTTP redirects are rejected before the `Location` target is contacted and surface as `WEB_PROVIDER_ERROR`.

<a id="pkg-taskweaver-dsh-web-search-deepseek--request-logging"></a>
#### Request logging

Immediately before dispatch, a search running under an initiating Agent appends the log-only `web/deepseek-search-llm-request` session event. It contains the resolved endpoint, API version, and exact secret-free JSON body sent to DeepSeek; headers and credentials are excluded. Credential failures and cancellations before dispatch create no event, while later HTTP or response failures leave the attempted request durable. Direct programmatic provider calls outside an Agent have no initiating session to log.

<a id="pkg-taskweaver-dsh-web-search-deepseek--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-web-search-deepseek--auxiliary-deepseek-search-request"></a>
##### Auxiliary DeepSeek search request

<a id="pkg-taskweaver-dsh-web-search-deepseek--what-the-model-sees"></a>
###### What the model sees

A separate DeepSeek model receives exactly `Perform a web search for the query: <query>` as its user text and one native `web_search` server-tool definition. This request is not part of the conversation model's context.

<a id="pkg-taskweaver-dsh-web-search-deepseek--token-effect"></a>
###### Token effect

Separate provider input and output tokens are incurred for each search; `maxTokens` caps generated output and `maxUses` caps native search uses.

<a id="pkg-taskweaver-dsh-web-search-deepseek--kv-cache-effect"></a>
###### KV Cache effect

Independent of the conversation request cache. The auxiliary instruction and native tool definition can form a stable prefix, but each changed query or model route prevents reuse from its first difference.

<a id="pkg-taskweaver-dsh-web-search-deepseek--conversation-tool-result-indirectly"></a>
##### Conversation tool result, indirectly

<a id="pkg-taskweaver-dsh-web-search-deepseek--what-the-model-sees-1"></a>
###### What the model sees

Through [`dsh-tool-web`](./README.zh.md#pkg-taskweaver-dsh-tool-web), the conversation model sees deduplicated URLs, titles, dates, and citation snippets from structured search blocks; provider prose is not trusted as an answer. This provider's exact failures include the actionable missing-credential message, `DeepSeek search credential resolution failed: <error>`, `DeepSeek search aborted`, `DeepSeek search request failed: <error>`, `DeepSeek returned no web_search_tool_result blocks; the request may not have triggered native web search`, and `DeepSeek returned an unprocessable response body: <error>`; HTTP failures preserve the provider message. The consumer owns the error wrapper.

<a id="pkg-taskweaver-dsh-web-search-deepseek--token-effect-1"></a>
###### Token effect

Zero direct conversation tokens from registration. Result tokens scale with returned sources and snippets, then the seam enforces the requested source bound.

<a id="pkg-taskweaver-dsh-web-search-deepseek--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-web-search-deepseek--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **One search costs a full Messages model turn** — latency plus generated tokens, with up to `maxUses` server-side searches; DeepSeek exposes no dedicated retrieval endpoint.
- **Dynamic credential availability resolves inside the operation** — the synchronous `available()` contract can establish that a resolver exists but cannot query an asynchronous credential store. A selected keyless provider therefore fails the search with `WEB_PROVIDER_CREDENTIAL_MISSING`; the stable `web_search` schema remains registered. Caller cancellation races this preflight locally, but cannot force an arbitrary credential backend itself to stop work.
- **Over-returned sources still cost tokens** — with no result-count knob on the wire, `maxResults` is enforced only post-hoc by seam truncation.
- **Uncited results carry no `snippet`** — a source gains one only when a `text` block citation (`cited_text`) matches its URL.

<a id="pkg-taskweaver-dsh-web-search-taskweaver"></a>
### `@taskweaver/dsh-web-search-taskweaver`

<!-- original-readme-missing: packages/runtime/web/web-search-taskweaver/README.md -->
目录：`web/web-search-taskweaver`。
package.json 描述：TaskWeaver-configured web search provider for the DSH web capability seam

当前工作树未提供原逐包 README；这里保留包名和目录，具体契约以包源码及测试为准。

<a id="family-web"></a>
### 原族级说明（迁移保留）

<a id="family-web--web-web-capability-family"></a>
This family provides provider-neutral web search and fetch operations plus the model-facing tools that consume them.

| Package | Role | ctx key |
|---|---|---|
| [`web/`](./README.zh.md#pkg-taskweaver-dsh-web) | Defines web provider registration, selection, and shared errors | `ctx.web` |
| [`web-search-exa/`]（原文链接目标：`web-search-exa/README.md`） | Provides web search through Exa | registers on `ctx.web` |
| [`web-search-perplexity/`]（原文链接目标：`web-search-perplexity/README.md`） | Provides web search through Perplexity | registers on `ctx.web` |
| [`web-search-deepseek/`](./README.zh.md#pkg-taskweaver-dsh-web-search-deepseek) | Provides native DeepSeek web search | registers on `ctx.web` |
| [`web-fetch-http/`](./README.zh.md#pkg-taskweaver-dsh-web-fetch-http) | Fetches public HTTP and HTTPS resources | registers on `ctx.web` |
| [`tool-web/`](./README.zh.md#pkg-taskweaver-dsh-tool-web) | Exposes web search and fetch to the model | registers on `ctx.tools` |

The [web capability decision]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md`） records why search and fetch share one provider-selection service.

The subsystem reference — search/fetch requests and results, availability, `WebError` — is [docs/subsystems/web.md]（原文链接目标：`../../docs/subsystems/web.md`）; rationale (including deferred SSRF protection) in the [web capability seam Agent Note]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md`）.
