# api 包族

<a id="family-api"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

承载 Host 与 Client 共用的远程 API、BFF 策略和 Typert RPC 网关。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-api-gateway`](#pkg-taskweaver-dsh-api-gateway) | `api/gateway` | [接口与限制](#pkg-taskweaver-dsh-api-gateway) |
| [`@taskweaver/dsh-api-remotes`](#pkg-taskweaver-dsh-api-remotes) | `api/remotes` | [接口与限制](#pkg-taskweaver-dsh-api-remotes) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-api-gateway"></a>
### `@taskweaver/dsh-api-gateway`

<!-- migrated-from: packages/runtime/api/gateway/README.md -->
目录：`api/gateway`。
package.json 描述：Typert Remote Host dispatcher and Client API endpoint

<a id="pkg-taskweaver-dsh-api-gateway--taskweaver-dsh-api-gateway"></a>
Two-sided Typert RPC endpoint for Host and Client Cordis environments. The Host entry provides `ctx.typertGateway`, while `@taskweaver/dsh-api-gateway/client` provides `ctx.remote`; both consume the same generated `InvocationDescriptor` contract and leave business selection to API Remotes and transport, request correlation, trust, and response envelopes to Connection.

<a id="pkg-taskweaver-dsh-api-gateway--host-service-typertgatewayservice-ctx-key-typertgateway"></a>
#### Host service: `TypertGatewayService` (ctx key: `typertGateway`)

`ctx.typertGateway.invoke()` resolves the current descriptor and Cordis Service for each call, validates exact named arguments, resolves registered object or Context identities, invokes the public business method, and validates its result. Business Services extend `TypertRemoteService` and mark methods with `@Remote` or `@RemoteScope` from [`dsh-typert-protocol`](../typert/README.zh.md#pkg-taskweaver-dsh-typert-protocol); `bindTypertRemote()` remains available when another base class owns inheritance.

Strict mode reads generated invocation descriptors from `ctx.typert.local`. Lookup parameters use the currently active resolver in `ctx.typert.lookups`: the business package registers the stable declaration and default policy, while Host composition can override resolution behavior with effect-scoped `configure()`; `@RemoteScope` resolves its receiver through a registered Host Context provider. SRC mode is a development fallback for endpoints that have never had a strict definition; it parses simple parameter names and accepts only JSON-safe values for non-lookup parameters. Withdrawing an observed strict definition fails instead of weakening validation.

The Host entry registers a trusted-host interceptor on Connection's shared `/api` FetchHandler. Connection passes this composite handler through its HTTP bridge; the handler dispatches claimed endpoints to Gateway and unclaimed endpoints to API Proxy. Direct `invoke()` calls preserve business errors; `TypertGatewayError` distinguishes failures owned by dispatch, binding, providers, lookup, Context, arguments, and codecs. A resolver may use `TypertLookupFailure` to carry an existing RPC error, preserving its original error code for policy rejections such as cold-resume failures or ownership fences.

A cancellation-aware Remote method declares `signal: AbortSignal` as its final Host parameter. The signal is descriptor metadata rather than a wire argument: Connection supplies it to the Gateway, and the Gateway injects it after decoded business parameters. SRC recognizes the reserved final name, while strict generation additionally requires the global `AbortSignal` type.

<a id="pkg-taskweaver-dsh-api-gateway--client-service-clientremote-ctx-key-remote"></a>
#### Client service: `ClientRemote` (ctx key: `remote`)

`ctx.remote.$mount()` validates and registers a generated Host-for-Client contribution, then installs concrete direct and scoped methods for the calling Cordis fiber. Each namespace is a traced `remote.<namespace>` child Service and unloads after its last method is withdrawn. Duplicate endpoints, namespace collisions, and descriptors without strict generated codecs fail before methods become callable.

Each call validates positional inputs, constructs the descriptor's exact named `args`, and sends it through `ctx.connection.rpc.call('/api', endpoint, ...)`. Generated cancellation-aware methods accept a final optional `AbortSignal`; the Client combines it with the contribution mount lifetime before calling Connection. The returned value is validated before reaching application code. Withdrawing a contribution removes its descriptors and methods together, aborts in-flight calls, and makes retained method handles reject.

`ctx.remote.$on()` subscribes to one forwarded Host event. Its legal keys are exactly the Host assembly's forwarding selection, and the listener type is the owning package's own Cordis `Events` declaration, so no second signature can drift from it. Each subscription belongs to the calling fiber and disappears with it. Delivery is one-way and follows registration order; a listener that throws is logged and isolated from the remaining listeners, which never affects the frame pump. `ctx.remote.$dispatch()` is the other half of that surface, and it is the carrier's: the Client half owning the Host frame sink hands each decoded frame over, and an event name nobody subscribes to is dropped, since the wire carries whatever the Host selected. A consumer subscribes and never calls it.

Generated declaration merges provide the TypeScript API through the shared `TypertClientRemote` contract. The Client entry contains no Host Service or Host Cordis interface merge, and method lookup and invocation use ordinary objects and functions rather than a JavaScript Proxy.

<a id="pkg-taskweaver-dsh-api-gateway--model-experience"></a>
#### Model Experience

None, as the package dispatches application calls and registers no prompt, tool, or session event.

<a id="pkg-taskweaver-dsh-api-gateway--kv-cache-effect"></a>
###### KV Cache effect

No direct effect; invoked business Services own any model-visible result.

<a id="pkg-taskweaver-dsh-api-gateway--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- The Connection adapter maps ordinary dispatch failures and business exceptions to the RPC `internal` code with empty details; lookup-policy errors carried by `TypertLookupFailure` are returned unchanged. Structured `TypertGatewayError` categories remain available only to same-process callers.
- SRC mode supports unique identifier parameters without destructuring, defaults, or rest parameters. It validates JSON safety rather than generated business types and never infers optional fields.
- Only strict generated contributions can mount on the Client face. SRC markers have no Client codec or type projection.
- The package dispatches unary methods only. Incremental Session data uses a separate named-stream protocol over the same Connection.
- Lookup resolvers are configured per key; an individual Remote parameter or endpoint cannot currently select a live-only policy under the same `agent`/`session` key.
- Forwarded events reach `$on` exactly as the Host emitted them: no payload projection or redaction, no Scope-bound subscription, and no replay after a reconnect.

<a id="pkg-taskweaver-dsh-api-remotes"></a>
### `@taskweaver/dsh-api-remotes`

<!-- migrated-from: packages/runtime/api/remotes/README.md -->
目录：`api/remotes`。
package.json 描述：Remote BFF assembly and Host Agent/Session lookup policy

<a id="pkg-taskweaver-dsh-api-remotes--taskweaver-dsh-api-remotes"></a>
Two-sided BFF for Host Remote capabilities selected by this application. The Host entry owns Agent/Session identity policy; the Client entry imports generated `/remote` artifacts as runtime values, mounts each contribution through `ctx.remote.$mount()`, and re-exports their declaration merges. Client business packages depend on this facade rather than the Gateway implementation or individual Remote runtime entries.

`createApiRemoteAgentResolver()` reuses live Agents, resumes ordinary cold sessions, deduplicates concurrent resumes, preserves the subagent ownership fence, and configures the same resolver for Typert `agent` and `session` lookups. The standard Web API Proxy supplies its Agent defaults and scope setup, then uses the returned resolver for legacy methods, so migrated and unmigrated methods share one policy implementation.

The current Client assembly mounts the Goal Remote contribution and the read-only Host plugin inventory contribution (`pluginInventory/list`). Cordis effect ownership withdraws every contribution when this assembly unloads, while `@taskweaver/dsh-api-gateway/client` owns descriptor validation, traced namespace Services, direct and scoped methods, invocation, and cancellation. The Client entry consumes the shared `TypertClientRemote` interface through Cordis and does not import the concrete Gateway. It re-exports the Gateway Client face's declaration merges type-only, so a consumer reaching the forwarded-event vocabulary through this facade gains no runtime edge to the Gateway implementation.

This package contains no transport or Host service discovery logic. Its Client face can be reused by Web or a future TUI that provides the same React-free `ctx.remote` contract.

<a id="pkg-taskweaver-dsh-api-remotes--forwarded-host-events"></a>
#### Forwarded Host events

`src/remote-events.ts` holds `API_REMOTE_FORWARDED_EVENTS`, the allowlist of Host cordis events this application forwards to consumers verbatim — no projection, no redaction, no renaming — and therefore the legal key set of `ctx.remote.$on`; the type-only `src/types.ts` derives its selection face. Forwarding one more event is an entry in that array and nothing else: the type projection, the consumer key face, and the Host forwarding loop all derive from it.

The listener signature is not restated here. Each allowlisted event's cordis `Events` declaration lives in its owner package's client-safe `./types` export (`dsh-agent-presets`, `dsh-commands`, `dsh-credentials`, `dsh-llm`, `dsh-settings`), and both faces of this package pull those declarations in, so "forwarded verbatim" holds by construction rather than by proof. The Host face additionally asserts the list against `TypertForwardableEvent`, which rejects a name that is not a declared event, one that binds an AgentScope, and one whose shape is not one-way.

<a id="pkg-taskweaver-dsh-api-remotes--build-boundary"></a>
#### Build boundary

An ordinary repository package belongs to one TypeScript face: Host packages are registered in the root `tsconfig.host.json`, and Client packages in the root `tsconfig.client.json`. `api-remotes` is the only deliberate exception because its Host entry must participate in the Host Typert graph, while `src/client/index.ts` cannot compile until Host tsdown has generated the business packages' `/remote` declarations.

This package's root `tsconfig.json` is only a solution that references `tsconfig.host.json` and `tsconfig.client.json`. The Host aggregate and direct Host consumers reference the former, while the Client aggregate and direct Client consumers reference the latter; the package-root solution must not enter either aggregate's dependency graph. The two projects own disjoint source files and `.tsbuildinfo` files but share the `lib/types` output directory, with one deliberate exception: `src/remote-events.ts` and `src/types.ts` are listed in BOTH faces' `files`, because the forwarded-event allowlist is the single control point over what a consumer can receive, and the Host forwarding loop and the Client `ctx.remote.$on` key face must read one declaration rather than two that could drift.

That exception is not just a `files` entry. The root `tsconfig.base.json` maps `@taskweaver/dsh-api-remotes/types` to `src/types.ts` — the source plane, like every other workspace subpath and unlike the generated `/remote` artifacts, which have no `paths` entry and resolve through `exports` to built output. Both faces therefore admit the same allowlist and type projection into their own programs and emit byte-identical `remote-events` and `types` outputs into `lib/types`; the `.tsbuildinfo` files stay independent. No gate enforces the faces' source-file disjointness — `scripts/project-reference-faces.ts` only checks that a reference into a split project names the matching face — so this paragraph records why the double listing is intentional.

The package-local `clientBundle(..., { hostPhase: true })` makes Host tsdown bundle the Host entry and the later Client tsdown bundle only the browser entry. Ordinary Client plugins remain single Client projects and produce both their Node loader entry and browser bundle during Client tsdown; do not copy this package's split merely because a package has both `src/index.ts` and `src/client/index.ts`.

<a id="pkg-taskweaver-dsh-api-remotes--model-experience"></a>
#### Model Experience

None, as this BFF selects Remote application methods and identity policy but registers nothing model-facing.

<a id="pkg-taskweaver-dsh-api-remotes--kv-cache-effect"></a>
###### KV Cache effect

No direct effect; mounted Host capabilities own any model-visible behavior they trigger.

<a id="pkg-taskweaver-dsh-api-remotes--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- The capability set is fixed by explicit build-time value imports; the Client does not discover the Host's active Services or Remote definitions at runtime.
- Additional capabilities require an explicit `/remote` value import and mount in this assembly.
- The standard Web Host supplies resume defaults and Agent-scope setup from the legacy API Proxy until that remaining BFF configuration moves into `api-remotes`.

<a id="family-api"></a>
### 原族级说明（迁移保留）

<a id="family-api--api-remote-api-layers"></a>
The application-facing Remote stack. `remotes` owns BFF policy and the selected business API, while `gateway` implements the Typert unary RPC endpoints shared by Host and Client environments.

| Package | Role | ctx key |
|---|---|---|
| [`remotes/`](./README.zh.md#pkg-taskweaver-dsh-api-remotes) | Host Agent/Session lookup policy and Client Remote contribution assembly | no service; configures `ctx.typert` and consumes `ctx.remote` |
| [`gateway/`](./README.zh.md#pkg-taskweaver-dsh-api-gateway) | Host Typert dispatcher and Client Remote endpoint | `ctx.typertGateway` / `ctx.remote` |

The runtime dependency direction is `remotes → gateway → connection → webserver`: the BFF consumes the shared `TypertClientRemote` contract, Gateway delegates transport to Connection, and Connection mounts on the HTTP server. Cordis service injection and Client module metadata preserve this order without importing the concrete Gateway from the Remotes Client entry.

<a id="family-api--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- Connection and WebServer remain at [`client/connection`](../client/README.zh.md#pkg-taskweaver-dsh-client-connection) and [`host/webserver`](../host/README.zh.md#pkg-taskweaver-dsh-host-webserver); a later package-only move can place them under `api/connection` and `api/webserver` without changing their service contracts.
- The legacy API Proxy remains at [`host/apiproxy`](../host/README.zh.md#pkg-taskweaver-dsh-host-apiproxy) as the fallback for methods not yet migrated to Remote. It consumes the Host resolver owned by `api-remotes` so migrated and legacy methods retain one Agent/Session identity policy.
