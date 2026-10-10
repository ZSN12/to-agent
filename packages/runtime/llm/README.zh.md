# llm 包族

<a id="family-llm"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义模型调用契约、内容块与流式组装，并提供具体 Provider 适配。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-llm`](#pkg-taskweaver-dsh-llm) | `llm/llm` | [接口与限制](#pkg-taskweaver-dsh-llm) |
| [`@taskweaver/dsh-llm-pi-ai`](#pkg-taskweaver-dsh-llm-pi-ai) | `llm/llm-pi-ai` | [接口与限制](#pkg-taskweaver-dsh-llm-pi-ai) |
| [`@taskweaver/dsh-llm-retry`](#pkg-taskweaver-dsh-llm-retry) | `llm/llm-retry` | [接口与限制](#pkg-taskweaver-dsh-llm-retry) |
| [`@taskweaver/dsh-llm-taskweaver-bridge`](#pkg-taskweaver-dsh-llm-taskweaver-bridge) | `llm/llm-taskweaver-bridge` | [接口与限制](#pkg-taskweaver-dsh-llm-taskweaver-bridge) |
| [`@taskweaver/dsh-token-meter`](#pkg-taskweaver-dsh-token-meter) | `llm/token-meter` | [接口与限制](#pkg-taskweaver-dsh-token-meter) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-llm"></a>
### `@taskweaver/dsh-llm`

<!-- migrated-from: packages/runtime/llm/llm/README.md -->
目录：`llm/llm`。
package.json 描述：Provider-neutral LLM service interface for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-llm--dsh-llm"></a>
Provider-neutral LLM vocabulary and abstract service. This package defines the canonical language spoken by the agent loop, session logs, and every plugin.

<a id="pkg-taskweaver-dsh-llm--service-llmruntime-ctx-key-llm"></a>
#### Service: `LlmRuntime` (ctx key: `llm`)

An adapter registry plus a single streaming call API, interceptable via a waterfall event.

<a id="pkg-taskweaver-dsh-llm--retry-policy"></a>
##### Retry policy

Each provider adapter supplies its resolved route policy. Omitting provider configuration uses bounded normal mode with five retries after the first request. Layered configuration may retain `maxRetries` or `retryableCodes` after changing `mode` to `always`; resolution ignores those inactive normal-mode fields and captures a pure always policy. This service stores the effective policy but does not execute retries.

<a id="pkg-taskweaver-dsh-llm--public-api"></a>
##### Public API

- `ctx.llm.registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle` Register one adapter instance for the given provider routes. Registration is all-or-nothing, and is disposed with the calling fiber. The returned disposer also carries `replace(providers)`: the candidate route set is validated in full before anything moves, so a conflict with another adapter leaves the current routes registered and serving, and the swap itself is one synchronous section with no observable gap. `replace([])` is legal — a registration holding zero routes — unlike an empty initial registration.
- `ctx.llm.listProviders(): LlmProviderInfo[]` Describe registered provider routes in registration order.
- `ctx.llm.registerConfigurableProviders(entries: readonly LlmConfigurableProvider[]): DirectoryRegistrationHandle` Declare provider routes an adapter plugin can activate through configuration — registered or dormant — each naming its owning settings namespace and the path to its profile inside that section. All-or-nothing (`INVALID_DIRECTORY`/`DUPLICATE_DIRECTORY`), disposed with the calling fiber. The handle also carries `replace(entries)`: the candidate set is validated in full before anything moves, so an entry another registration already declares leaves the current set intact, and an empty array is legal there. A plugin whose declared set follows its configuration must use `replace` rather than disposing and re-registering — the latter strands the directory empty whenever the new set is refused.
- `ctx.llm.listConfigurableProviders(): LlmConfigurableProvider[]` List the declared directory in declaration order; configuration surfaces merge it with `listProviders()` to mark each entry live or dormant. An entry may carry `declared` — whether the owning adapter knows that route only because configuration named it. Only the adapter can answer, so absence means "this adapter draws no such distinction", never "shipped".
- `ctx.llm.registerModelDiscovery(settingsNs: string, discover): () => void` Offer to interrogate provider endpoints for the settings namespace this plugin owns. One offer per namespace (`INVALID_DISCOVERY`/`DUPLICATE_DISCOVERY`), disposed with the calling fiber.
- `ctx.llm.listModelDiscoveryNamespaces(): string[]` List the namespaces that can interrogate an endpoint, so a surface offers the action only where it works.
- `ctx.llm.discoverModels(settingsNs: string, request: LlmModelDiscoveryRequest): Promise<LlmDiscoveredModel[]>` Ask one endpoint which models it advertises.
- `ctx.llm.providerRetryPolicy(provider: string): ResolvedRetryPolicy` Return the provider-owned retry policy captured during registration, with normal defaults resolved.
- `ctx.llm.listModels(provider: string): Promise<LlmModelInfo[]>` Discover the models one registered provider currently advertises.
- `ctx.llm.resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>` Resolve validated exact-model identity plus available context, output-default, and reasoning metadata from the owning adapter, with optional cancellation for asynchronous adapters.
- `ctx.llm.resolveCallConfig(config: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig>` Validate an explicit effort and materialize adapter-configured call defaults without clamping.
- `ctx.llm.prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<PreparedLlmCall>` Resolve a config plus detached context and modality metadata and markers for fields supplied by adapter defaults in one exact-model lookup, then capture the adapter's matching dispatch generation and immutable retry policy as one cancellable, one-shot call.
- `ctx.llm.stream(options: GenerateOptions): AsyncIterable<StreamChunk>` Stream one model call as raw chunks (token-level deltas). Consumers assemble the chunks into blocks/messages with `BlockAssembler`.

`LlmRuntime` normalizes failures from final adapter selection, synchronous dispatch, iterator construction, and iteration into the stream protocol's single terminal form: `finish { kind: 'error' | 'aborted', failure }`. A failure after partial deltas may leave content blocks open; consumers discard that incomplete output. Errors from `llm/stream` middleware, nested calls, adapter cleanup, and downstream consumers remain thrown because they are plugin or consumer failures rather than model-request outcomes. A prepared call exposes the immutable retry policy captured with its exact adapter registration; a route handled entirely by middleware has no serving policy.

Interrogating an endpoint is configuration-time work over a *draft*, keyed by settings namespace rather than by provider route — the provider a surface is adding does not exist yet, so there is no route to name. The request may still *name* a route it is editing, and an adapter that already describes that route answers from its own knowledge without a network call; `baseURL` is optional and one of the two is required. The request otherwise carries the endpoint, the protocol, and a credential the harness uses for that one interrogation and never stores — nothing here reads or writes settings or credentials, and the reply is candidate metadata a surface may offer for adoption, never a registered catalog. `LlmDiscoveredModel` makes every field but `id` optional because most provider listings disclose an id and nothing else; a surface adopting one still owes the capacities its adapter requires. Duplicate and unusable ids are dropped, an unserved namespace fails with `NO_DISCOVERY`, and a request naming neither a route nor an endpoint fails with `INVALID_DISCOVERY`.

Provider and model metadata is a discovery surface, not a routing whitelist. `registerAdapter()` still owns provider exclusivity and captures the adapter's retry policy for each route, while an adapter may accept model ids absent from `listModels()`; consumers must not reject a request because its model is unlisted. Returned selector metadata is detached and invalid or duplicate adapter entries fail with `INVALID_ADAPTER` or `INVALID_CATALOG`.

Every topology commit point — adapter routes registering or disposing, directory entries appearing or withdrawing — emits the payload-free `llm/adapters-updated` event after the mutation, so consumers re-read `listProviders()`/`listModels()`/`listConfigurableProviders()` instead of polling. Observer failures are contained (logged, non-vetoing); only `INVARIANT`-coded failures rethrow after the fan-out.

Exact-model metadata is a separate correctness query, not a catalog decoration or global LLM setting. `resolveModelInfo()` asks the adapter that owns the exact provider/model route once; an adapter can describe an unlisted dynamic model, and absent `context`, `defaultMaxTokens`, or `reasoning` fields preserve unknown capacity, provider-owned output defaults, or unavailable reasoning capability. Invalid identity, context, output default, or reasoning metadata fails with `INVALID_MODEL_INFO`, `INVALID_MODEL_CONTEXT`, `INVALID_MODEL_MAX_TOKENS`, or `INVALID_MODEL_REASONING`.

`defaultMaxTokens` is an adapter-configured per-request output cap, not a model hard limit. `resolveCallConfig()` materializes it only when the request omits `maxTokens`; an explicit cap wins. Reasoning identifiers are opaque adapter-owned strings rather than a core enum: the same resolution accepts only an exact advertised identifier, materializes `defaultEffort` when present, and otherwise preserves the provider default. Asynchronous model resolvers receive the caller's signal and must settle promptly after cancellation. `prepareCall()` additionally exposes detached context and input-modality metadata, reports which `maxTokens` and `reasoningEffort` fields it materialized in `adapterDefaults`, and binds those facts to the adapter generation that performs terminal dispatch. HMR or dynamic settings therefore cannot combine one generation's image capability with another generation's endpoint; reusing the one-shot handle or changing its call-config fields fails with `INVALID_PREPARED_CALL`. An unsupported explicit or configured effort fails with `UNSUPPORTED_REASONING_EFFORT` before provider I/O.

<a id="pkg-taskweaver-dsh-llm--events"></a>
##### Events

| Event | Mode | Purpose |
|---|---|---|
| `llm/stream` | waterfall | Intercept/wrap every streaming model call for caching, logging, or routing |

<a id="pkg-taskweaver-dsh-llm--extension-points"></a>
##### Extension points

- Subclass `LlmAdapter` and call `ctx.llm.registerAdapter(providers, adapter)` to add one or more provider routes. `GenerateOptions.provider` selects the adapter; `GenerateOptions.model` is adapter-owned and may be resolved dynamically. Override `providerRetryPolicy()` to supply provider-owned recovery configuration, `providerInfo()` and asynchronous `listModels()` to expose selector metadata, then implement `resolveModel()` when exact identity, capacity, an output default, or selectable reasoning efforts are available; an asynchronous resolver must honor its optional cancellation signal. The defaults use bounded normal retry policy, use the route and model ids as names, advertise no models, and return no capacity, output default, or reasoning metadata.
- Wrap `llm/stream` via `ctx.on()` waterfall listeners for caching, logging, or routing. A wrapper that retries after emitting a chunk has no durable attempt boundary; shipped agent retry policy therefore uses `agent/request-error` instead.

<a id="pkg-taskweaver-dsh-llm--messages-message-ts-and-content-blocks-types-ts"></a>
##### Messages (`message.ts`) and content blocks (`types.ts`)

`Message` is the shared immutable value used by delivery, durable history, and model requests. Every message has a required `MessageId`, role, content, and typed source from creation onward. `createMessage(input)` mints the identity and returns a detached deep-frozen value; `createUserMessage({ content, source })` fixes the user role; `createAssistantMessage({ content, source })` fixes the assistant role and model source kind; `createToolResultMessage({ callId, content, isError })` fixes the user role and couples the tool source to its result block; `freezeMessage(message)` imports an identity that already exists and never replaces it. Message rewrites preserve the identity and produce another frozen value. Browser code imports these value constructors from the dependency-minimal `@taskweaver/dsh-llm/message` entry instead of the service-bearing package root.

Message content is an array of typed blocks: `text`, `reasoning`, `image`, `tool-call`, `tool-result`. An `ImageBlock` carries only a durable `ImageAttachmentRef`; provider bytes and request dimensions are resolved later. The union remains merge-extensible through `ContentBlockMap`, so plugins can add further block types via declaration merging. Assistant messages use a model source carrying the provider and model that produced them plus optional adapter-private replay state. Before dispatch, `LlmRuntime` retains that state only when the historical provider route and target provider route are currently owned by the exact same adapter instance; the adapter then decides whether it can restore or convert the state across models/providers.

Every dispatch uses the exact model modalities captured with its adapter generation. An image-capable adapter projects durable image references into route-specific request versions. A text-only route instead receives deterministic attachment placeholders, including nested tool-result images, without changing append-only session history. `offloadRequestImagesWithPolicy()` provides deterministic oldest-first image removal with raw or base64 accounting and count or byte quanta; adapters supply the exact derived-version byte length.

Streaming is a raw chunk protocol (`block-start`, `text-delta`, `reasoning-delta`, `tool-call-delta`, `block-end`, `usage`, `finish`). Every adapter outcome reaches consumers as one terminal `finish`; operational failure uses its `error` or `aborted` reason rather than throwing across the stream API. `BlockAssembler` is the single shared implementation that assembles chunks into blocks/messages. A successful `finish` may carry a `ReplayEnvelope` — opaque response-level replay metadata plus optional per-block entries aligned with the emitted block sequence. Assembly makes one keep/drop decision for content and metadata together: a `max-tokens` finish drops tool calls that may have been truncated, and the envelope loses the entry at each dropped position, so stored metadata always describes stored content.

<a id="pkg-taskweaver-dsh-llm--call-configuration-call-config-ts"></a>
##### Call configuration (`call-config.ts`)

`LlmCallConfig` is the provider, model, optional adapter-owned reasoning effort, and sampling scalars of one conversation's requests (`provider`, `model`, `reasoningEffort`, `temperature`, `maxTokens`, `stop` — each mapping 1:1 onto the same-named `GenerateOptions` field). It is per-conversation state recorded in the session log as part of the request header (see the dsh-session `request/header` events), never a silently-adjustable per-call knob: the `agent/request` waterfall proposes a replacement, `prepareCall()` validates it and materializes adapter defaults under the turn signal, and the loop logs the effective value plus markers for fields supplied by adapter defaults before using the prepared call's registration-bound stream. The next proposal omits marked defaults so a changed route resolves its own values; unmarked explicit fields persist. `callConfigEquals(a, b)` is the field-wise real-change detector; `deepFreeze(value)` is the ownership helper the loop applies to every built request before dispatch (`llm/stream` listeners and adapters read, never rewrite). `markAgentLoopRequest()` marks that exact object as created by the process-local agent loop, and `isAgentLoopRequest()` lets observers distinguish it from independently logged auxiliary calls that may also be frozen and session-associated. `GenerateOptions.purpose` classifies logged auxiliary compaction and session-title calls so adapters can apply purpose-specific transport policy without changing ordinary conversation requests.

<a id="pkg-taskweaver-dsh-llm--app-attribution-attribution-ts"></a>
##### App attribution (`attribution.ts`)

Every product adapter sends application identity on provider HTTP requests. `attributionHeaders(identity?)` builds the standard `User-Agent`, defaulting to public `APP_IDENTITY`; white-label deployments may replace but not suppress it. Adapters verify the wire header directly or through their library hook. See [the attribution Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md`）.

<a id="pkg-taskweaver-dsh-llm--api-key-validation-api-key-ts"></a>
##### API key validation (`api-key.ts`)

Every adapter that puts a credential in an HTTP header judges it the same way before use. `normalizeApiKey(raw)` trims surrounding whitespace, then accepts any non-empty printable-ASCII value (`/^[\x21-\x7E]+$/`, space excluded) or reports why not as an `ApiKeyRejection` (`'empty'` | `'illegalCharacters'`), both carried in the `ApiKeyCheck` result. Absence is never judged: a caller decides whether a value was supplied before asking, since a profile naming no credential authenticates through the provider's own ambient discovery or OAuth.

<a id="pkg-taskweaver-dsh-llm--classes"></a>
##### Classes

- `LlmAdapter` — abstract base class for provider adapters. The only required method is `stream()`.
- `BlockAssembler` — incrementally assembles raw chunks into complete content blocks and can create an identified, frozen assistant message from them. The agent loop feeds it raw chunks (logging them for replay) while reading the assembled blocks for history.
- `HarnessError` — base class for the harness error taxonomy: a stable `code` string (distinct from the human `message`) plus `cause` chaining. Lives here, in the leaf package every other imports, so a single base is shared without a new dependency edge. Per-package errors (`LlmError`, `ToolArgsError`, `InvariantError`, …) extend it. `isHarnessError(value)` narrows at process boundaries.
- `LlmError` — extends `HarnessError`; its stable `code` string (`NO_ADAPTER`, `DUPLICATE_ADAPTER`, and adapter codes like `AUTH`/`RATE_LIMIT`) matches its frozen serializable `failure.code`. The payload may also retain validated status, `Retry-After`, and branded provider request id facts; policy remains outside the error.
- `errorChain(value)` — renders a thrown value with its full `cause` chain and AggregateError members for diagnostic outputs (UI notices, logger lines, durable `turn/end` messages), so transport wrappers like undici's `TypeError: fetch failed` surface the underlying `ECONNREFUSED`/DNS/TLS detail instead of masking it. Rendering only — route on `code`, never by parsing the result.
- `CONTEXT_WINDOW_EXCEEDED_CODE` — the provider-neutral code both DeepSeek adapters use when a request exceeds the model context window, regardless of thrown-HTTP versus in-band finish delivery. `isContextWindowExceededError(detail)` is their shared conservative classifier for OpenAI-compatible provider detail.
- `QUOTA_EXCEEDED_CODE` — the non-transient provider-neutral code for exhausted account quota, balance, credits, budget, or usage limits. `isQuotaExceededError(detail)` keeps those failures distinct from request-rate limits.
- `EMPTY_RESPONSE_CODE` — the provider-neutral code both adapters use for a degenerate provider completion: a terminal `stop` that carried no content blocks at all. Classified as an error finish (not a successful empty message) because the attempt produced nothing durable; `dsh-llm-retry` retries it by default.
- `INVALID_CREDENTIAL_CODE` — the provider-neutral code for a credential that was supplied but cannot be used: malformed rather than absent, so the fix is to correct the stored value rather than supply one — the distinction from `MISSING_CREDENTIAL`. Deliberately excluded from the default retryable set, since a malformed credential fails identically on every attempt. `assertUsableApiKey(raw, pkg, ref)` throws `LlmError` with this code, the one shared diagnosis every adapter uses for an unusable stored credential.

<a id="pkg-taskweaver-dsh-llm--real-adapters"></a>
##### Real adapters

[`@taskweaver/dsh-llm-pi-ai`](./llm-pi-ai) implements the provider adapter through `@earendil-works/pi-ai`; configured route profiles select the provider, catalog, credentials, and endpoint. The adapter follows the `StreamChunk` conventions in `types.ts`: usage precedes finish and tool arguments remain raw strings. Adapter implementations may throw or emit a failure finish internally; `LlmRuntime` exposes both as a terminal failure finish. See [the terminal-failure decision]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-29-terminal-llm-stream-failures.md`） for the service boundary.

<a id="pkg-taskweaver-dsh-llm--model-experience"></a>
#### Model Experience

None, as the service adds no model-bound text, schema, or message; it only materializes and logs an adapter-configured reasoning effort.

<a id="pkg-taskweaver-dsh-llm--kv-cache-effect"></a>
###### KV Cache effect

Pass-through; the registry preserves the assembled request prefix, while the selected adapter and provider own cache reuse and routing boundaries.

<a id="pkg-taskweaver-dsh-llm--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No retry execution, caching, or rate limiting ships in this service** — provider registration stores retry policy, but `llm/stream` remains a single-attempt call wrapper. The agent loop separately offers proven model-request failures to `agent/request-error`, whose default preserves the original failure; `@taskweaver/dsh-llm-retry` is the optional executor loaded by the shared example spine.
- **`GenerateOptions` sampling is `temperature`/`maxTokens`/`stop` only** — no `tool_choice`, `top_p`, or penalty fields; the vocabulary grows when a producer lands ([dropped inert knobs]（原文链接目标：`../../../.agents/notes/archived/simplification/2026-07-04-drop-inert-request-knobs.md`）).
- **Producer-gated variants stay out until produced** — `prefill`, per-tool `strict`, block `cache` hints, and the `agent` message-source variant were pruned as producerless ([Agent Note]（原文链接目标：`../../../.agents/notes/archived/simplification/2026-07-04-prune-producerless-vocabulary-variants.md`）).
- **`BlockAssembler` handles core block kinds only** — a plugin-added block type whose stream is never closed by `block-end` makes `blocks()` throw.
- **`APP_IDENTITY.url` names a repository that does not exist yet** — the public home must be reachable before release.
- **`GenerateOptions.sessionId` is a locally-declared brand** — importing dsh-session's `SessionId` would cycle; a future ids-owning package would dissolve the workaround.

<a id="pkg-taskweaver-dsh-llm-pi-ai"></a>
### `@taskweaver/dsh-llm-pi-ai`

<!-- migrated-from: packages/runtime/llm/llm-pi-ai/README.md -->
目录：`llm/llm-pi-ai`。
package.json 描述：pi-ai-backed multi-provider adapter for the DeepSeek Harness LLM seam

<a id="pkg-taskweaver-dsh-llm-pi-ai--taskweaver-dsh-llm-pi-ai"></a>
Generic multi-provider adapter for the harness LLM seam backed by [`@earendil-works/pi-ai`](https://www.npmjs.com/package/@earendil-works/pi-ai). One plugin instance owns a dict of provider profiles keyed by route; every request selects a profile with `GenerateOptions.provider` and resolves `GenerateOptions.model` against that route's configured catalog. A route naming an installed pi-ai provider inherits its endpoint, wire protocol, and model catalog as defaults and overrides them field by field; a route pi-ai does not ship is declared outright, so an OpenAI-compatible gateway, a self-hosted server, or a provider newer than the installed catalog is configuration rather than a code change.

The package root exposes the Cordis plugin contract, `PiAiAdapter`, and `supportedProtocols()`; profile resolution, catalog materialization, provider construction, replay conversion, and stream conversion remain package-internal.

<a id="pkg-taskweaver-dsh-llm-pi-ai--config"></a>
#### Config

Configure credentials, the model catalog, and deployment-specific transport settings per provider, keyed by the provider route itself. Each profile may set a `retryPolicy`; omission uses normal mode with five retries. `apiKeyEnv` is a credential *reference* resolved per request, so no secret enters this file. Omitting it leaves the route unauthenticated, which for an installed catalog route means pi-ai's provider-native ambient discovery; a configured reference that resolves to nothing fails the request with `MISSING_CREDENTIAL` instead, because falling through would authenticate with whatever unrelated key the environment happens to hold. One credential serves every model on its route.

```yaml
- id: llm
  name: '@taskweaver/dsh-llm-pi-ai'
  config:
    providers:
      # Catalog route: endpoint, protocol, and models all come from pi-ai.
      openai:
        apiKeyEnv: OPENAI_API_KEY
        baseURL: https://proxy.example.com:8443
        reasoning: high
        requestImagePixelBudget: 4194304 # total pixels; 2048 by 2048 default
        requestImageMaxBytes: 1048576    # raw bytes before base64 expansion
        maxRequestImageBytes: 20971520   # accumulated base64 payload
        retryPolicy:
          mode: normal
          maxRetries: 3
          backoff:
            initialDelayMs: 500
            maxDelayMs: 10000
            jitterRatio: 0.1
      # Catalog route with its catalog narrowed to one model and that model's
      # capacity corrected; every unset field still comes from the catalog.
      anthropic:
        apiKeyEnv: ANTHROPIC_API_KEY
        streamIdleTimeoutMs: 300000
        models:
          - id: claude-sonnet-4-5
            contextWindow: 200000
      # Catalog route with one model reshaped in place; the rest of the
      # catalog keeps serving (a models list would replace it instead).
      deepseek:
        apiKeyEnv: DEEPSEEK_API_KEY
        modelOverrides:
          deepseek-v4-pro:
            reasoningEfforts:
              off:
              high: high
      # Hand-declared route: pi-ai ships nothing under this key, so the profile
      # supplies the whole provider.
      acme-gateway:
        displayName: Acme Gateway
        apiKeyEnv: ACME_GATEWAY_API_KEY
        api: openai-completions
        baseURL: https://gateway.acme.example/v1
        # Request shape for an endpoint whose URL pi-ai cannot recognize; it
        # would otherwise be addressed as though it were OpenAI itself.
        compat:
          thinkingFormat: deepseek
          supportsDeveloperRole: false
          maxTokensField: max_tokens
        models:
          - id: acme-large
            name: Acme Large
            contextWindow: 65536
            maxTokens: 4096
          - id: acme-think
            name: Acme Think
            contextWindow: 262144
            maxTokens: 32768
            # key = selectable level, value = its wire spelling; only off may
            # leave the value empty (supported, send nothing).
            reasoningEfforts:
              off:
              high: high
              max: ultra
```

The dict shape makes duplicate routes unrepresentable, and the pre-release array shape (with per-profile `provider` fields) fails load with migration directions. `providers` may also be empty or omitted entirely: the adapter then mounts **dormant** — zero routes, no extra catalog entries — and registers routes the moment the `llm-pi-ai:` settings section supplies profiles, dropping them again when it empties. Dormant or not, the plugin declares every installed catalog provider in the configurable-provider directory (`ctx.llm.listConfigurableProviders()`, settings path `providers.<provider>`), joined with every route the current profiles declare, so configuration surfaces can offer the full catalog before any route exists and can still address a hand-declared one. Each entry carries `declared`: whether pi-ai ships nothing under that key. It follows the installed catalog, never the settings document, because narrowing a shipped provider's models stores a profile too and that route is still one pi-ai knows — only the adapter can tell the two apart, which is why the directory answers rather than leaving a surface to infer it. Which adapters exist is composition; which providers run can be entirely the user's settings document. Registration with `ctx.llm` is atomic: a collision with any provider route already owned by another adapter fails plugin loading without registering the remaining routes. Model ids are not lifecycle config; a model the route does not configure fails before any provider request with `LlmError('UNKNOWN_MODEL')`.

<a id="pkg-taskweaver-dsh-llm-pi-ai--catalog-resolution"></a>
#### Catalog resolution

A profile's `models` list *replaces* the route's installed catalog rather than extending it; omitting it (or leaving it empty) serves that catalog unchanged. Each entry defaults its unset fields from the installed model of the same `id`, so narrowing a catalog route to two models, correcting one capacity, or adding a model newer than the installed catalog are all one-line edits — but declaring any `models` list means every model the route should keep serving must appear in it, an entry of nothing but `id` being enough. The configurable entry fields are `id`, `name`, `contextWindow`, `maxTokens`, `reasoningEfforts`, and `compat`. Pricing and input modalities have no harness consumer and ride the installed entry or are absent.

`modelOverrides` reshapes individual installed-catalog models without that cost: each key is a catalog model id, each value the same fields a `models` entry takes with the id living in the key, and the rest of the catalog keeps serving untouched — "correct one model, keep the other thirty-seven" as a three-line edit. An override becomes that catalog entry's configuration, so capacities, efforts, and compat resolve through the same path with the same diagnostics and the same request-default semantics as a `models` entry. Overrides are only meaningful on a catalog route serving its catalog: one set beside a `models` list (which already replaces the catalog), on a hand-declared route (whose models are fully spelled in `models`), or naming a model the catalog does not describe is refused rather than skipped, because a silently unchanged model is a typo someone would otherwise hunt for.

<a id="pkg-taskweaver-dsh-llm-pi-ai--per-model-reasoning-efforts"></a>
##### Per-model reasoning efforts

`reasoningEfforts` declares a model's selectable thinking levels: each key is a level selectors offer, its value the spelling dispatch sends on the wire, so `high: high` passes the canonical name through while `max: ultra` renames it for a gateway with its own vocabulary. Keys come from pi-ai's level set (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`); a level not declared is not offered. Omitting the field keeps the installed catalog entry's capability (a hand-declared model has none and does not reason); `false` declares a non-reasoning model, which is how a profile strips reasoning from a catalog model its gateway cannot serve; an empty declaration is refused rather than guessing between those two meanings.

The declaration translates to pi-ai's `Model.reasoning` + `thinkingLevelMap` with every level decided explicitly — undeclared levels are pinned unsupported rather than left to pi-ai's own defaulting, which is asymmetric (an absent key means "supported" for the five base levels but "unsupported" for `xhigh`/`max`) and which a profile author should not need to know. `off` is the one three-state key: left out, selectors offer no Off and an explicit Off request is refused — a request naming no effort still goes out without the parameter, so what the provider then does is its own default; declared with no value (`off:`), Off is offered and selecting it sends nothing — for the `deepseek` dialect an explicit `thinking: {type: "disabled"}` — which also covers a request naming no effort at all; declared with a value (`off: none`), that value goes on the wire as the effort parameter. There is no spelling for restoring a catalog map key to "unset": the declaration is the whole offer, so restate the catalog levels you keep.

<a id="pkg-taskweaver-dsh-llm-pi-ai--wire-compatibility-switches"></a>
##### Wire-compatibility switches

pi-ai shapes each request from the provider id and baseURL: which role carries the system prompt, which field caps output, how a thinking level travels. A private gateway's URL says nothing, and for an endpoint pi-ai does not recognize the detection answers as though it were OpenAI itself — a reasoning model's system prompt goes out as `developer`, the output cap as `max_completion_tokens`, the thinking level as a bare `reasoning_effort` — and most OpenAI-compatible gateways reject at least one of those. `compat` is therefore configurable on the route (its models' default) and per model (winning per field), resolving model → route → installed catalog entry → pi-ai's own detection; a route-level switch shadows the catalog entry's value for every model that reads it, and there is no spelling for handing a field back to the catalog short of restating its value.

Each switch belongs to the protocols whose pi-ai compat type declares it, and grouping follows the compat *type* rather than the protocol name: the three Responses protocols (`openai-responses`, `azure-openai-responses`, `openai-codex-responses`) share one compat type, so a switch settable on one is settable on all three. `supportsDeveloperRole` is settable on `openai-completions` and on those three; `thinkingFormat` only on `openai-completions`; `supportsTemperature` only on `anthropic-messages`; `supportsStrictMode` also reaches `bedrock-converse-stream`. A model-level switch its protocol does not take fails resolution naming what that protocol does offer; a route-level one lands on the models that read it and skips the rest, and is refused only when no model on the route could read it at all.

Three kinds of key are refused rather than dropped: one no protocol declares (a misspelling), one pi-ai's installed catalog owns for a named vendor (`openRouterRouting`, `zaiToolStream`, `deferredToolsMode`, `sessionAffinityFormat`, `supportsOpenAIGrammarTools`, `supportsToolSearch`, `supportsExplicitPromptCacheMode`, `supportsToolReferences`, `vercelGatewayRouting`, `sendSessionAffinityHeaders`) — a route needing a vendor's own switch is a catalog route that should be named as such — and one written with no value at all (`supportsDeveloperRole:`), which schemastery passes through as null and which would otherwise replace the installed catalog's value with nothing. The offered set is pinned to pi-ai's four compat types by drift gates, the protocols carrying them are derived from `Model.compat` itself, and each field's type is derived from upstream rather than restated, so an upgrade that adds a field, gives a further protocol a compat type, or widens a value union fails the build until someone classifies it.

A model neither the entry nor the installed catalog sizes takes the route's `defaultContextWindow` (262,144) and `defaultMaxTokens` (32,768), so a listing that discloses nothing but ids still yields a serviceable route. Both fallbacks are guesses by construction, which is why they are route fields a deployment whose gateway serves smaller models corrects once rather than constants buried in the adapter; the fallback sizes the model and never becomes a per-request cap.

Request modalities resolve entry `input` → installed catalog entry → route `defaultInput` (default `[text]`), the same order and the same fallback role the capacities above use. So a catalog model keeps the modalities the catalog records for it, and a narrower route default never strips them; a gateway whose *undescribed* models all take images declares `[text, image]` once at the route instead of on every entry. An entry's empty list means the same as an absent one — it describes a model accepting nothing, so it states no answer and resolution continues past it, which is what keeps a catalog model's own modalities when a `models` entry names it without declaring any. The route's may not be empty, since nothing sits below it to answer instead.

`[text]` is the absence of a declaration rather than a guess at the endpoint, which is why the fallback here is conservative where the capacity fallbacks are merely plausible. Nothing interrogates a gateway for what it accepts, and the two wrong answers do not cost the same: the harness refuses an image before it is attached when a model's modalities omit one, so under-claiming costs a refusal naming the model, while over-claiming admits an image the provider then rejects mid-turn — after the message is durable, which leaves the session repeating a request that cannot succeed.

Resolution still fails loud, naming the offending route and model, when a route cannot be served at all: a route the catalog does not ship needs `api`, `baseURL`, and a non-empty `models` list of uniquely-identified models. That resolution runs inside the section schema, so an unserviceable profile is refused **where it is written** — `settings.mutate` answers `settings-rejected` naming the route and model — rather than being stored and then quietly disabling every route in the namespace. The settings seam keeps a namespace's last good value for an already-stored section that fails, so this cannot strand a deployment. `api` accepts the protocols in `supportedProtocols()` and is only needed when the catalog cannot supply one: a model absent from the catalog inherits the protocol its shipped siblings agree on, so adding a model to a single-protocol catalog route restates nothing.

`baseURL` sets the endpoint of every model on the route, so private proxies such as `https://proxy.example.com:8443` remain supported; a catalog route that omits it keeps each catalog model's own endpoint. Naming `api` on a catalog route repoints the whole route at that protocol, which is how a deployment moves a provider between, say, Responses and Chat Completions.

`supportedProtocols()` is deliberately narrower than pi-ai's full streaming API set: it holds only the protocols a profile can *completely* describe with a key, an endpoint, and headers. Bedrock signs with SigV4 over AWS credentials and a region, Vertex needs a project, a location, and application-default credentials, Azure needs provider environment plus an api-version, and Codex authenticates through OAuth — offering those would hand back a route that cannot authenticate. Catalog routes still reach them through their own provider; only an explicit override is refused.

<a id="pkg-taskweaver-dsh-llm-pi-ai--dynamic-configuration-settings-credentials"></a>
#### Dynamic configuration (settings + credentials)

The adapter reads its profiles through a thunk **once per operation** instead of freezing them at construction. The plugin registers the `llm-pi-ai` namespace on the optional `ctx.settings` seam with this same `Config` schema and its `cordis.yml` entry as the composition `base`, and because `providers` is a dict, the base and the user's `llm-pi-ai:` settings section merge **per provider**: a user can add a route, override one field of a composition route, or point a route at another proxy, all effective on the next request with no restart. Without a mounted settings service the entry config alone drives the adapter, unchanged.

Credentials resolve per stream call through `apiKeyEnv` and the optional `ctx.credentials` seam; without that seam, the adapter reads exactly the referenced environment variable. A profile naming no credential at all — and only that case — defers to pi-ai's ambient discovery. Every resolved key is trimmed and format-checked before use, so a value no HTTP header can carry is refused instead of surfacing as an opaque `fetch` `TypeError`; the refusal throws `LlmError('INVALID_CREDENTIAL')` naming the failing route and credential reference but never any part of the key. The route set and each route's captured retry policy are the registration-level facts: when either changes, the plugin replaces its registration atomically (same adapter instance, candidate set validated first), so a route another adapter already owns leaves the previous routes serving and reverting to a working configuration re-applies. Provider key order never counts as a change. A section this adapter could not serve is refused where it is written — the registered `validate` resolves the whole profile set, so `ctx.settings.mutate` rejects with the resolver's own error (the wire surface reports it as `settings-rejected`) and nothing is stored. A stored section that becomes unserviceable some other way — an external edit of `settings.yaml` — keeps the namespace's last good value at the settings seam and warns. The entry config itself still fails plugin load, and a route the llm registry refuses (one another adapter family already owns) is logged while the previously registered routes keep serving.

The adapter exposes each configured route's models through `ctx.llm.listModels(provider)`. This is provider-neutral selector metadata read from the same pi-ai `Models` collection the request path uses, so discovery does not create a second model registry. `ctx.llm.resolveModelInfo(provider, model)` performs that exact descriptor lookup once and returns its identity, context window, configured output cap, and selectable thinking levels, keeping authoritative metadata on the route-owning adapter rather than its consumers. A model's **configured** `maxTokens` becomes the seam's `defaultMaxTokens`, so a request that names no output cap carries the one the deployment chose; a value inherited from the installed catalog is the model's output *capability* and never becomes a request default on its own.

A model that carries reasoning metadata — from the installed catalog or from its entry's `reasoningEfforts` — exposes pi-ai's ordered `getSupportedThinkingLevels(model)` result without filtering or normalization, including `off` and the model-specific availability of `xhigh` or `max`. The Harness exposes each canonical pi-ai level as an opaque ID; provider/model wire spellings remain inside pi-ai's `thinkingLevelMap`.

A model **without** that metadata — a hand-declared one whose entry declares no `reasoningEfforts`, and a catalog model pi-ai marks as non-reasoning — exposes no `reasoning` at all. pi-ai reports such a model as supporting the single level `off`, but `off` is translated to *omitting* the reasoning option, which is byte-for-byte the request that naming no effort already produces: selecting it could not disable anything, so a provider whose own default is to think would keep thinking with `off` shown as selected. Reporting the capability as unavailable leaves a surface offering the provider's default and nothing that misrepresents it. The profile `reasoning` value, including `off`, is the deployment default when configured; omitting it preserves the provider default. Per-request `GenerateOptions.reasoningEffort` takes precedence, and a level absent from the exact model capability fails the REQUEST with `UNSUPPORTED_REASONING_EFFORT` before network I/O instead of being clamped. Describing a model never fails that way: the models under one provider disagree about which levels they accept, so `resolveModel` reports a profile level the exact model cannot take as no default at all rather than throwing. A throw there would take the whole provider out of every model catalog built over it — one mis-set profile field hiding even the models that do support the level — so a bad configuration surfaces where it is acted on, not where it is described. pi-ai's common stream options represent `off` by omitting `reasoning`.

Supported profile fields are `apiKeyEnv`, `displayName`, `api`, `baseURL`, `models`, `modelOverrides`, `compat`, `defaultContextWindow`, `defaultMaxTokens`, `defaultInput`, `headers`, `reasoning`, `thinkingBudgets`, `cacheRetention`, `transport`, `timeoutMs`, `websocketConnectTimeoutMs`, `streamIdleTimeoutMs`, `maxRequestImageBytes`, `requestImagePixelBudget`, `requestImageMaxBytes`, and `retryPolicy`. Each resolved profile retry policy is captured with that provider route; omission uses the shared bounded normal default of five retries. The stream-idle interval is a positive finite Node timer delay, defaults to five minutes, and covers only an outstanding provider read, not consumer think time. Every image route derives a deterministic request version from the provider-independent normalized attachment under `requestImagePixelBudget` (default 2048 by 2048 total pixels) and `requestImageMaxBytes` (default 1MiB raw bytes). Before reading attachments, `maxRequestImageBytes` applies to conservative request-version upper bounds and replaces the oldest over-budget images with fixed text; exact base64 lengths are checked again after retained versions are generated. The 20MiB default can retain fifteen maximum-size 1MiB versions after base64 expansion while leaving request-body headroom. The same version feeds inline base64, and its stable descriptor exposes the attachment id and actual request-image dimensions. Harness app attribution wins a conflicting configured header name.

The adapter forces pi-ai's SDK `maxRetries` to zero so one `stream()` call makes one provider request. The removed profile fields `maxRetries` and `maxRetryDelayMs` fail load instead of silently multiplying or hiding the separately composed agent-level retry budget. Idle expiry aborts the SDK's stable request signal and surfaces `TIMEOUT`; an earlier caller abort remains `ABORTED`.

<a id="pkg-taskweaver-dsh-llm-pi-ai--endpoint-interrogation"></a>
#### Endpoint interrogation

The plugin offers `ctx.llm.registerModelDiscovery('llm-pi-ai', …)`, which answers "which models can this provider serve?" for a route a configuration surface is editing or drafting. It is deliberately *not* a catalog refresh: nothing is stored, and the reply is candidates the surface offers for adoption. `settings.yaml` remains the only thing that decides what a route serves.

A request naming a route the **installed catalog ships is answered from that catalog**, with no network call: pi-ai's registry is the authoritative list for its own providers, and it carries the context windows and output caps a listing endpoint would not disclose. Such a route needs no `baseURL` at all. Only a route the catalog does not describe — a gateway, a self-hosted server — is interrogated over the wire, and one that names no endpoint is told to set one or enter its models by hand.

A draft carries the credential the user typed, if any; a route that already stored one shows a configuration surface only a redacted descriptor, so the interrogation resolves that route's `apiKeyEnv` rather than going out unauthenticated and reporting the endpoint's 401 as a wrong key. A typed key wins, being the one under test. Resolution happens only on the path that reaches the network, so a catalog route answers without touching credentials at all. A supplied or stored probe key is trimmed and format-checked the same way, so a value no HTTP header can carry is refused immediately as `LlmError('INVALID_CREDENTIAL')` instead of reaching `fetch`, where it would surface as an opaque `ByteString` failure indistinguishable from an unreachable endpoint.

Interrogation reads `openai-completions` and `openai-responses`, whose `GET /models` shape with bearer auth is the one a gateway, a self-hosted server, and the official endpoints all agree on. Azure is excluded despite its OpenAI lineage — it authenticates with an `api-key` header and requires an `api-version` query — and Codex uses OAuth; every other protocol answers `DISCOVERY_UNSUPPORTED` so the surface falls back to hand-entry instead of an authentication failure being reported as a provider with no models. The `baseURL` is treated as a prefix rather than a URL to resolve against, so a deployment path such as `https://gateway.example/openai/v1` keeps its segments.

Most listings disclose an id and nothing else; `context_window`/`context_length` and `max_output_tokens`/`max_tokens` are read when a gateway supplies them, entries without a usable id are skipped rather than failing the whole listing, and everything else the adopting surface still owes. The reply is read under a four-megabyte ceiling enforced on the bytes actually received — the endpoint is a URL the user typed, so a declared length is checked first but never trusted as the bound. An unreachable endpoint, a refused credential, a non-JSON body, and a body with no `data` array all fail with `DISCOVERY_FAILED` and a message naming the endpoint and, for a 401 or 403 alone, the credential. Cancellation during the body read surfaces as `ABORTED`, like a cancellation before the request went out.

<a id="pkg-taskweaver-dsh-llm-pi-ai--provider-model-routing-and-replay"></a>
#### Provider/model routing and replay

Each resolution produces one **immutable** snapshot — the profiles plus a `createModels()` collection holding the `Provider` each route built — and every operation captures a whole snapshot before its first `await`. A configuration change builds a *new* collection rather than mutating the one in use: `Models.streamSimple()` resolves its provider lazily, when the stream is first consumed, which is after the credential await, so a mutated collection would let a request that started under one configuration finish under another or fail on a provider that no longer exists. This is what makes the seam's per-step call freeze (`llm.prepareCall()`) hold end to end — switching models mid-reply takes effect on the next step, never inside the one in flight. Requests reach their provider through `Models.streamSimple()`. A catalog route that keeps its catalog protocol **reuses** the installed provider with its model list replaced, because that provider owns API implementations this package cannot reconstruct — Bedrock loads its Smithy module through a separate entry point — so rebuilding it from parts would silently narrow which providers work. Every other route is built by `createProvider()` over the protocol table behind `supportedProtocols()`, whose entries are the same factories pi-ai's own provider factories use.

A route's `apiKeyEnv` key still resolves through the harness seam before the request reaches pi-ai and rides as the request's `apiKey` option, which pi-ai treats as the highest-priority auth override — the fail-loud reference semantics stay the harness's. Beneath that override the collection carries this plugin's credential store and ambient auth context: a stored sign-in (an OAuth grant, or a key typed into pi-ai's own login prompt) authenticates its route through them and refreshes itself under the store's cross-process lock. The store addresses records as `llm-pi-ai/<provider id>`, and a hand-declared route key outside that record grammar (uppercase, dots, underscores) reads as holding nothing stored rather than as an addressing error; such a route cannot be signed into — a record write for it refuses with `LlmError('UNSTORABLE_PROVIDER_ID')` — and authenticates through `apiKeyEnv` or ambient provider settings. A route naming no credential at all resolves as configured-but-keyless and leaves the requirement to the protocol, which is where it actually lives.

The selected model descriptor supplies the protocol implementation. This includes native API differences such as OpenAI models whose descriptor uses the Responses API rather than Chat Completions; the harness adapter does not hardcode endpoint selection by model name.

Successful assistant responses store a versioned, lossless-JSON replay state beside the provider and model that produced them, as a `ReplayEnvelope`: a response-level half (kind, version, API, route, response ids, native stop reason) plus one per-block entry per streamed block carrying that block's signatures. The per-block alignment is what `BlockAssembler` prunes when assembly drops a block (a `max-tokens` tool call), so the stored entries always describe the stored content — the retained blocks keep their signatures. At request time, `LlmRuntime` passes replay state only when the historical provider route and target provider route are currently owned by this same `PiAiAdapter` instance. The adapter validates the state and restores pi-ai response ids and provider signatures even when the target provider or model changes; pi-ai then decides which metadata its target API can reuse. History without replay state is translated as foreign provider-neutral content and never impersonates a native pi-ai response.

Durable content is the authoritative record; replay state only restores native fidelity. A stored state this build cannot use — another adapter's kind, another version (including the flat pre-envelope form older logs carry), malformed metadata, provider/model mismatches between the message and replay state, or content/block mismatches — degrades that one assistant message to the same foreign provider-neutral conversion instead of failing the request, and the plugin logs the `INVALID_REPLAY_STATE` diagnostic through its `onReplayDegrade` hook.

<a id="pkg-taskweaver-dsh-llm-pi-ai--vocabulary-differences"></a>
#### Vocabulary differences

- pi-ai tool-call arguments are parsed objects; the harness stores raw JSON strings. The adapter parses input and re-stringifies output.
- pi-ai reports failures as in-stream error events; these map to `finish {kind:'error'|'aborted', failure}` chunks. Provider-specific error text distinguishes terminal `QUOTA` from transient `RATE_LIMIT`, while text and usage signals evaluated against the resolved model's context window normalize overflow to `CONTEXT_WINDOW_EXCEEDED`. A terminal `stop` whose message carries no content blocks maps to a `finish {kind:'error'}` with code `EMPTY_RESPONSE` (retried by default policy) instead of a successful empty message.
- pi-ai folds reasoning tokens into output usage; there is no separate reasoning count to map.
- pi-ai's `off` thinking level crosses the Harness capability seam unchanged and becomes an omitted pi-ai common `reasoning` option at dispatch.
- `GenerateOptions.stop` is rejected with `UNSUPPORTED_OPTION` because pi-ai's common streaming UI cannot guarantee it across providers.

<a id="pkg-taskweaver-dsh-llm-pi-ai--app-attribution"></a>
#### App attribution

Every request carries the shared attribution header from dsh-llm's `attributionHeaders()`, merged through pi-ai's `headers` stream option. Provider-specific app-attribution headers are not synthesized. See [dsh-llm § App attribution](./README.zh.md#pkg-taskweaver-dsh-llm--app-attribution-attribution-ts).

<a id="pkg-taskweaver-dsh-llm-pi-ai--dependency-weight"></a>
#### Dependency weight

pi-ai installs several provider SDKs and lazy-loads the one selected by the catalog model. The dependency weight is isolated to this opt-in adapter package.

<a id="pkg-taskweaver-dsh-llm-pi-ai--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-llm-pi-ai--provider-request-through-pi-ai"></a>
##### Provider request through pi-ai

<a id="pkg-taskweaver-dsh-llm-pi-ai--what-the-model-sees"></a>
###### What the model sees

The selected catalog model receives `GenerateOptions.system`, history, tools, and sampling fields supported by pi-ai's common streaming API. Each retained image is preceded by stable text naming its complete attachment id and actual request dimensions. When accumulated base64 image payload exceeds the route's `maxRequestImageBytes`, each offloaded image (oldest first) is replaced by fixed text that tells the model to read the file again when a path is available or ask the user to attach it again. Offloaded normalized attachments are not read or transformed. Provider-native replay metadata is restored only when the adapter validates it for the historical content.

<a id="pkg-taskweaver-dsh-llm-pi-ai--token-effect"></a>
###### Token effect

Provider tokenization governs exact input. Retained images add the stable attachment and coordinate descriptor; the offload placeholder replaces an omitted image's visual tokens. Replay metadata may let a native API reuse provider-side state.

<a id="pkg-taskweaver-dsh-llm-pi-ai--kv-cache-effect"></a>
###### KV Cache effect

Conversion preserves logical request order without adding text, while the selected provider's serialization and replay state determine reuse. Changing adapter instance, provider, model, or any upstream request token may prevent reuse from the first difference. Crossing the image bound rewrites an early message (the newly offloaded image becomes placeholder text), so reuse ends at that message until the offloaded prefix stabilizes.

<a id="pkg-taskweaver-dsh-llm-pi-ai--provider-response"></a>
##### Provider response

<a id="pkg-taskweaver-dsh-llm-pi-ai--what-the-model-sees-1"></a>
###### What the model sees

pi-ai events become harness reasoning, text, tool-call, usage, and finish chunks. The adapter passes parsed tool arguments to the harness as raw JSON strings.

<a id="pkg-taskweaver-dsh-llm-pi-ai--token-effect-1"></a>
###### Token effect

Generated content affects later inputs only after the loop records it. pi-ai folds reasoning tokens into output usage when the provider does not report them separately.

<a id="pkg-taskweaver-dsh-llm-pi-ai--kv-cache-effect-1"></a>
###### KV Cache effect

Recorded response content appends to the next request and does not invalidate its earlier reusable prefix. Unrecorded transport metadata and usage accounting do not affect cache identity.

<a id="pkg-taskweaver-dsh-llm-pi-ai--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **`maxRequestImageBytes` counts base64 image payload only** — text, tools, descriptors, and JSON structure ride outside the bound, so it must sit below the gateway's request-body cap with headroom. Offload is a deterministic request projection and is not recorded as a session event.
- **A sign-in lives only in the process that started it** — an authorization attempt is not durable, so reloading the page mid-login abandons it and the human starts over. Signing out is `deleteRecord` on the stored record, which forgets it locally without telling the issuer.
- **Provider-native discovery answers through this plugin's ambient context** — a route naming no credential defers to the catalog provider's own resolution, which asks for environment values (`AZURE_OPENAI_API_KEY`, `AWS_PROFILE`, and each provider's own set) and for local credential files. Both questions are answered here: the credential seam is consulted before the process environment, and file existence is checked against the host process's filesystem with `~` expanded. What it cannot do is *read* a credential file's contents — a provider that parses `~/.aws/credentials` itself does so directly, outside the seam.
- **Settings can add or override routes, not remove composition routes** — the user layer merges over the composition `base`, so deleting a `cordis.yml`-provided provider is a composition change; `replace` on the namespace only resets the user layer.
- **The layered merge has no delete for dict keys** — the settings seam merges the composition `base` and the user layer per key, recursively, so a `reasoningEfforts` level, `modelOverrides` entry, or `compat` field the base declares cannot be removed by the user layer, only overridden — and for `reasoningEfforts` absence *is* the meaning ("not offered"), so a base-declared level stays offered. This only triggers when a `cordis.yml` entry config declares per-model reasoning fields for the same model the user layer edits; the supported posture is to leave those to the settings document (the shipped composition mounts the adapter dormant), and a `models` list is an array replacing wholesale, which is the in-band escape.
- **`headers` can carry a credential the redactor never sees** — the profile's `headers` dict is plain strings, so `Authorization` or `api-key` set there is returned verbatim by a redacted `describe()` and rendered by any configuration UI. Store credentials as `apiKeyEnv` references; making the dict write-only is deferred with the rest of the [wire-boundary work](./README.zh.md#pkg-taskweaver-dsh-llm--known-limitations-and-deferred-work).
- **A route's catalog never refreshes itself** — the catalog is whatever `settings.yaml` says, so a model list is only as current as its last edit. Nothing here queries a provider for the models it serves; a route gains a model when someone writes one.
- **One wire protocol per route** — `api` applies to the whole route, so a mixed-protocol catalog route (an OpenAI-style catalog spanning Responses and Chat Completions) cannot host a model of the other protocol, and adding a model such a route does not describe requires naming `api` and moving every model onto it. Splitting the provider across two route keys is the workaround.
- **A modality declaration is not verified** — nothing interrogates an endpoint for what it accepts, so a model declaring `image` its gateway does not serve is refused by the provider after prompt admission. The durable image remains in history and the same misdeclared model can fail again. Switching to a text-only model remains possible because the shared LLM runtime projects image references into stable text for that exact request.
- **An unauthenticated route depends on its protocol** — naming no credential resolves the route as configured-but-keyless, but pi-ai's OpenAI-compatible implementation still requires an API key or an `Authorization` header, so a keyless local server needs a placeholder credential referenced by `apiKeyEnv` or an `Authorization` entry in `headers`.
- **`GenerateOptions.stop` is unsupported** — pi-ai's common stream options cannot guarantee stop-sequence behavior across providers, so the adapter rejects the field.
- **In-history `system` messages use pi-ai's common context conversion** — provider-specific placement follows pi-ai rather than a harness-owned wire override.
- **Provider HTTP status is unavailable** — pi-ai error events do not expose a stable HTTP status across providers; failures expose only stable harness error codes.
- **Retry policy is provider-owned, not an SDK retry** — each provider profile may supply nested `retryPolicy`; omission resolves to normal mode with five retries, and the effective route policy is what `dsh-llm-retry` executes at the agent failed-step extension point. pi-ai SDK retries stay disabled so durable agent steps and `llm/retry` events own every visible attempt, and direct `ctx.llm.stream()` calls remain single-attempt.

<a id="pkg-taskweaver-dsh-llm-retry"></a>
### `@taskweaver/dsh-llm-retry`

<!-- migrated-from: packages/runtime/llm/llm-retry/README.md -->
目录：`llm/llm-retry`。
package.json 描述：Provider-routed LLM request retry policy for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-llm-retry--taskweaver-dsh-llm-retry"></a>
Function plugin that applies exact-provider retry policy through the agent loop's closed-step `agent/request-error` waterfall. It does not wrap `ctx.llm.stream()`: every adapter call remains one provider attempt, and every retry opens a fresh numbered turn.

Each provider adapter owns an optional nested `retryPolicy`, captured when its route registers on `ctx.llm` and carried with each call that reaches that registration's final adapter boundary. An in-flight failure retains that serving policy if the route is later disposed or replaced; a failure before any final adapter is selected has no provider policy and delegates. Omission uses normal mode: five retries for `EMPTY_RESPONSE`, `RATE_LIMIT`, `SERVER`, `TIMEOUT`, and `TRANSPORT`, with bounded exponential backoff from 500 ms to 10 seconds and 10 percent jitter. `EMPTY_RESPONSE` is the adapters' classification of a degenerate provider completion that produced no durable content, so repeating it is safe. A normal policy can change its finite budget, eligible codes, and backoff. Always mode asks downstream recovery first, then retries every model-request failure without an attempt limit; success, cancellation, or plugin disposal stops it after active delegated recovery reaches quiescence.

Both modes use bounded exponential backoff with symmetric jitter. A valid `providerRetryAfterMs` at or below `maxDelayMs` replaces local backoff without jitter. An over-cap provider delay makes normal mode delegate, while always mode uses its configured local backoff so it cannot terminate on that instruction.

Before waiting, the plugin appends a non-surface `llm/retry` event with the shared `retryId`, provider, mode, canonical resolved-policy key, failure, and scheduled delay. Its payload is available from the browser-safe `@taskweaver/dsh-llm-retry/types` subpath, so remote renderers can consume the durable status without loading the policy runtime. The key includes every behavior-affecting field and sorts normal-mode codes because eligibility uses set membership. Retry numbers continue only across events with the same provider and complete policy key, so a route replacement with different limits, code membership, or backoff starts its own history. Normal events include the finite maximum; always events omit it, and UIs render `∞`. When the wait completes, the plugin appends `llm/retry-started` with the same `retryId`, turn, step, and retry number immediately before returning `{ kind: 'retry' }`; cancellation during backoff writes no started event. The loop then closes the failed turn and opens a retry turn over the same durable history. Cancellation and plugin disposal abort active backoff, drain active delegated recovery before applying the abort, and make a callback captured before disposal fail closed.

The separately published `./invariant` companion checks that every scheduled retry names the current open turn and latest closed step, matches the failed request's durable provider, carries non-empty provider and policy identities, has mode-specific bounds, a unique step record, the correct provider-policy retry number, and a bounded timer delay. It also requires each `llm/retry-started` event to name one prior scheduled attempt with the same `retryId`, turn, step, and retry number, and rejects repeated started events. Full jitter may schedule zero milliseconds at its lower boundary.

```yaml
- name: '@taskweaver/dsh-llm-pi-ai'
  config:
    providers:
      deepseek:
        apiKeyEnv: DEEPSEEK_API_KEY
        retryPolicy:
          mode: always
          backoff:
            initialDelayMs: 1000
            maxDelayMs: 30000
            jitterRatio: 0.2

- name: '@taskweaver/dsh-llm-retry'
```

The executor has no policy config. Multi-provider adapters such as `dsh-llm-pi-ai` place `retryPolicy` inside each provider profile, avoiding a second provider-name list.

<a id="pkg-taskweaver-dsh-llm-retry--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-llm-retry--model-request-recovery"></a>
##### Model-request recovery

<a id="pkg-taskweaver-dsh-llm-retry--what-the-model-sees"></a>
###### What the model sees

No retry event, delay, provider error, or failed partial output is model-visible. The retry turn reconstructs the same explicit provider/model request from durable surface history unless a downstream recovery policy deliberately changes that surface; failed chunks never enter derived messages.

<a id="pkg-taskweaver-dsh-llm-retry--token-effect"></a>
###### Token effect

Each retry is a new provider request and may repeat input-token billing. Normal mode has a finite budget; always mode can consume unbounded requests until success or cancellation. `llm/retry` itself contributes no tokens.

<a id="pkg-taskweaver-dsh-llm-retry--kv-cache-effect"></a>
###### KV Cache effect

The reconstructed request preserves the prior prefix and is eligible for provider cache reuse under that provider's rules. The non-surface retry event does not change cache identity.

<a id="pkg-taskweaver-dsh-llm-retry--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Agent turns are the only retry boundary** — direct `ctx.llm.stream()` consumers remain single-attempt because a raw stream cannot separate already-emitted chunks durably.
- **Always mode retries permanent failures** — authentication, quota, invalid-request, protocol, and unrecoverable context errors continue until success, cancellation, or disposal; deployments own provider-specific cost and latency controls.
- **Finite plugin budgets add** — normal mode counts only its configured codes and exact provider policy, while context-overflow compaction owns a separate budget. Any overlapping policy must define registration-order behavior.
- **Recovery policies compose by waterfall order** — always mode accepts a downstream retry before applying its fallback. A later policy that ignores cancellation and never settles also prevents fallback, turn quiescence, and plugin disposal from completing.
- **`llm/retry` records scheduling, not completion** — later step and turn events establish success, exhaustion, or cancellation.

<a id="pkg-taskweaver-dsh-llm-taskweaver-bridge"></a>
### `@taskweaver/dsh-llm-taskweaver-bridge`

<!-- original-readme-missing: packages/runtime/llm/llm-taskweaver-bridge/README.md -->
目录：`llm/llm-taskweaver-bridge`。
package.json 描述：TaskWeaver in-process model bridge LLM adapter (Cursor, Antigravity, custom relays)

当前工作树未提供原逐包 README；这里保留包名和目录，具体契约以包源码及测试为准。

<a id="pkg-taskweaver-dsh-token-meter"></a>
### `@taskweaver/dsh-token-meter`

<!-- migrated-from: packages/runtime/llm/token-meter/README.md -->
目录：`llm/token-meter`。
package.json 描述：Replay-aware token measurement service (ctx.tokenMeter) for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-token-meter--taskweaver-dsh-token-meter"></a>
Replay-aware token measurement through the singleton `ctx.tokenMeter` service. It advances one isolated fold per session from the durable log, so compaction and other pressure-sensitive plugins can share accounting without depending on `CompactionEngine`.

<a id="pkg-taskweaver-dsh-token-meter--configuration"></a>
#### Configuration

The estimator has no settings. It intentionally uses one fixed heuristic: four characters per token plus structural overhead for roles, blocks, and request-envelope fields. Any key is rejected; model capacity belongs to the adapter that owns an exact provider/model route and is available through `ctx.llm.resolveModelInfo().context`.

<a id="pkg-taskweaver-dsh-token-meter--measurement-contract"></a>
#### Measurement contract

`ctx.tokenMeter` directly exposes two operations:

- `measure(session, requestHeader?)` returns request pressure and the current priced surface at one consumed-log revision.
- `estimateMessage(message)` prices one message with the fixed heuristic.

`measure()` synchronizes once and returns one detached, deeply immutable snapshot. `totalTokens` is request-and-response pressure, while `surfaceTokens` is the surface-only heuristic total and equals the sum of `nodes[].tokens`. A `requestHeader` override affects pressure fields only; the surface fields still describe the current session. Every call clones the positional nodes, so measurement is O(surface).

The fold tracks full request-header snapshots, step boundaries, surface appends and replacements, successful assistant messages, provider usage, and the chunk seqs cited by each assistant message. Provider usage is reused only when the latest successful call's canonical request envelope matches the measured envelope and its total is no lower than that call's full heuristic anchor; a later success replaces the earlier anchor. Otherwise the complete current envelope and surface are estimated. Surface changes remain signed relative to a matching anchor, including negative deltas after shrinking replacements.

Usage accounting sums disjoint input, cache-read, cache-write, and output buckets; reasoning is not added again. Every successful call records an assistant anchor, including content-less calls. An explicit empty `sourceEventSeqs` list means a known empty provider stream, while an absent legacy list conservatively treats the durable assistant output as provider output.

<a id="pkg-taskweaver-dsh-token-meter--session-projections"></a>
#### Session projections

When the composition provides `ctx.sessionProjections`, token-meter registers three units through an optional child fiber.

`tokenUsage` carries the complete durable log's `uncachedInputTokens`, `outputTokens`, `cacheReadTokens`, and `cacheWriteTokens`. Usage chunks are counted even when a request later fails; a final assistant-message usage for the same `(turn, step)` replaces that sample instead of double-counting it. Reasoning remains an output subdivision. The single last-sample slot relies on a session-log ordering property: once a later step reports usage, a legal log never reports usage for an earlier step again.

`contextPressure` carries optional `pressureTokens` — the newest provider-reported prompt size, summing uncached input plus cache reads and writes — optional `projectedTokens`, and optional `contextWindow` from the newest `request/context` record. Both figures stay absent until a provider reports usage; capacity stays absent for a route whose adapter advertises none. Output is excluded, so `pressureTokens` holds still while a turn streams and steps forward when the next request reports its usage.

`projectedTokens` is what the NEXT request's prompt would cost: the sample plus the heuristic repricing of everything the surface gained or lost since it was taken, clamped at zero and folded through the same `surface-fold.ts` the measurement service replays. Only the delta is estimated, so the figure stays anchored to the provider while reacting the moment content lands — or a compaction shadows a span. That last case is why the field exists: compaction summarizes through a direct `ctx.llm.stream()` call and appends no usage of its own, so `pressureTokens` alone reports the pre-compaction prompt until an entire further turn completes. Occupancy displays read `projectedTokens`.

`contextBreakdown` carries heuristic `systemTokens`, `toolsTokens`, and `messageTokens` — the context's composition rather than its provider-billed size. The envelope figures reprice last-wins on every `request/header`; the message figure replays `surface-fold.ts` — the same positional fold `measure()` runs — so it equals `measure().surfaceTokens` at every event boundary and compaction shrinks it the way it shrinks the next request. All three figures use the measurement service's fixed heuristic and are estimates: they will not sum to `projectedTokens`, whose provider anchor carries exactly the error — CJK text and JSON schemas underprice badly at four characters per token — that the composition rows still contain. Present them as an approximate composition, never as a total.

All three units use the standard projection baseline, live frame, higher-seq-wins store, and JSON checkpoint paths. Unloading token-meter removes all three keys. A composition without the projection seam keeps the measurement service's existing behavior.

<a id="pkg-taskweaver-dsh-token-meter--context-occupancy-is-an-approximation-by-design"></a>
##### Context occupancy is an approximation, by design

The occupancy fields are independent last-wins records and are **not** one atomic observation of a single request. Switching models pairs the fresh capacity with the previous route's sample until the next request reports usage, and `pressureTokens` describes the last request rather than the surface as it stands right now — `projectedTokens` carries that sample forward over the surface's movement, but its anchor is still the older request.

This is deliberate. An occupancy percentage is a user-facing reference figure, not a billing record or a gating input — nothing in the harness makes decisions from it, and compaction reads `measure()` instead. A UI computes occupancy by dividing measured pressure by the separately resolved capacity for the selected model.

The [Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-29-projected-token-usage-and-request-context.md`） records the rejected atomic-pair comparison. Consumers that need an exact same-boundary figure should call `measure()` at their own request boundary rather than read this projection.

<a id="pkg-taskweaver-dsh-token-meter--composition"></a>
#### Composition

```yaml
- name: '@taskweaver/dsh-token-meter'
- name: '@taskweaver/dsh-compaction-basic'
```

Both plugins have usable defaults. The meter remains independent of model routing and optional compaction. A deployment configures capacity on its LLM adapter and compaction policy on `dsh-compaction-basic`.

<a id="pkg-taskweaver-dsh-token-meter--model-experience"></a>
#### Model Experience

Indirectly, through consumers such as `dsh-compaction-basic`; the service itself adds no prompt, message, schema, tool, or model call.

<a id="pkg-taskweaver-dsh-token-meter--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-token-meter--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **The fixed heuristic is approximate** — content without reusable provider usage is priced by character count plus structural overhead, not an exact provider tokenizer or request serializer.
- **Every measurement clones the current surface** — coherent immutable snapshots make reads O(surface), including below-threshold pressure checks.
- **Provider usage is only reusable for an identical canonical envelope** — prompt, prefix, tools, provider, model, or call-config changes deliberately fall back to full heuristic estimation.
- **Missing legacy source seqs are handled conservatively** — assistant messages without `sourceEventSeqs` cannot distinguish provider output from listener rewrites, so the fold avoids claiming a known empty or exact chunk stream.

<a id="family-llm"></a>
### 原族级说明（迁移保留）

<a id="family-llm--llm-llm-capability-family"></a>
The LLM seam and its provider adapters. The `llm` package owns both the Service Definition and Consumer roles: the abstract service, content-block vocabulary, and stream-chunk assembler. Provider adapters register on `ctx.llm`. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`llm/`](./README.zh.md#pkg-taskweaver-dsh-llm) | LLM service and shared streaming vocabulary | `ctx.llm` |
| [`token-meter/`](./README.zh.md#pkg-taskweaver-dsh-token-meter) | Replay-aware token measurement | `ctx.tokenMeter` |
| [`llm-retry/`](./README.zh.md#pkg-taskweaver-dsh-llm-retry) | Provider-scoped retry policy | listens to `agent/request-error` |
| [`llm-pi-ai/`](./README.zh.md#pkg-taskweaver-dsh-llm-pi-ai) | Multi-provider pi-ai adapter | registers on `ctx.llm` |

Adapters register provider routes on the seam; retry and token measurement remain separate consumers. The child READMEs own routing, metadata, replay, and provider-wire details; the [LLM architecture decisions]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.md`） own the rationale.

The subsystem reference — messages and blocks, the model request, the `StreamChunk` protocol, the adapter contract — is [docs/subsystems/llm-streaming.md]（原文链接目标：`../../docs/subsystems/llm-streaming.md`） (token measurement: [token-meter.md]（原文链接目标：`../../docs/subsystems/token-meter.md`）); see the [twin adapters]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.md`）, [replay token meter]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-15-replay-token-meter-service.md`）, and [routed model context]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.md`） Agent Notes.
