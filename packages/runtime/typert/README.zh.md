# typert 包族

<a id="family-typert"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

分离类型图生成、工件加载、协议定义和运行时类型注册。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-typert-generator`](#pkg-taskweaver-dsh-typert-generator) | `typert/generator` | [接口与限制](#pkg-taskweaver-dsh-typert-generator) |
| [`@taskweaver/dsh-typert-loader`](#pkg-taskweaver-dsh-typert-loader) | `typert/loader` | [接口与限制](#pkg-taskweaver-dsh-typert-loader) |
| [`@taskweaver/dsh-typert-protocol`](#pkg-taskweaver-dsh-typert-protocol) | `typert/protocol` | [接口与限制](#pkg-taskweaver-dsh-typert-protocol) |
| [`@taskweaver/dsh-typert-registry`](#pkg-taskweaver-dsh-typert-registry) | `typert/registry` | [接口与限制](#pkg-taskweaver-dsh-typert-registry) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-typert-generator"></a>
### `@taskweaver/dsh-typert-generator`

<!-- migrated-from: packages/runtime/typert/generator/README.md -->
目录：`typert/generator`。
package.json 描述：TypeScript project analyzer and model-driven Typert artifact generator

<a id="pkg-taskweaver-dsh-typert-generator--taskweaver-dsh-typert-generator"></a>
TypeScript project analyzer and model-driven Typert generator. It converts the developer-authored source type tree into compiler-independent `FaceModel` and `TypeGraph` data before any artifact is rendered. Static analysis can consume that model without Cordis; emitters never receive TypeScript AST or checker objects.

The analyzer can use independent `ts.Program` instances seeded from `tsconfig.host.json` or `tsconfig.client.json`. Direct project references establish compiler-face membership, while package subpaths establish Typert runtime-face contributions: an ordinary single-project package declaring `dsh.client` may contribute both Host and Client runtime models, and only a split project explicitly referenced through `tsconfig.host.json` or `tsconfig.client.json` is restricted to that corresponding face. `package.json#exports` establishes every cross-package public boundary, and source imports or re-exports are the only allowed cross-face edges. Types owned by NPM dependencies, including global declarations from `@types` packages, remain `external` references instead of being expanded.

<a id="pkg-taskweaver-dsh-typert-generator--analysis-model"></a>
#### Analysis Model

Each face contains package exports, Cordis services and events, explicitly tagged objects and schemas, and a type graph for their reachable declarations. The graph preserves declaration identity, generic parameters and applications, explicit inheritance, conditional and mapped types, import attributes, abstract modifiers, and source JSDoc. Service and `@typert object` APIs expose public instance members only; constructors, static members, and non-public members are excluded.

`WorkspaceAnalyzer` defaults to `check` mode and fails on TypeScript syntax or semantic diagnostics, missing reachable public annotations, private cross-package references, and reachable declaration merges that the model cannot retain losslessly. `write` mode inserts checker-derived annotations, rebuilds the program, and returns a clean check-mode model.

<a id="pkg-taskweaver-dsh-typert-generator--emission-and-opt-in-publication"></a>
#### Emission and Opt-in Publication

`FaceModelEmitter` consumes only the model. It emits executable JavaScript containing supported Zod schemas and a `TYPERT` contribution, plus a declaration file whose schemas are typed as `z.ZodType<SourceType>` through the package's public export. Unsupported Zod projections fail instead of flattening or weakening the source type.

`WorkspaceTypertGenerator` discovers contributors by walking package public exports reachable from Cordis `Context` or `Events` augmentations and explicit `@typert` declarations. When invoked for artifact publication, it requires host artifacts at `lib/typert.host.{js,d.ts}` exposed as `package/typert`, and client artifacts at `lib/typert.client.{js,d.ts}` exposed as `package/client/typert`. Generated declarations expose `TYPERT` as `unknown`, so contributing business packages do not depend on the runtime registry.

Publication is package opt-in, and business packages without the corresponding public entry do not need Typert artifacts. The repository's Host tsdown runs workspace Typert generation with `tsconfig.host.json` as its only program seed; it produces both Host reflection artifacts and the `typert.remote-client.*` projection of Host Remote contracts for the Client. The subsequent Client tsdown neither starts Typert nor analyzes `tsconfig.client.json`. Static consumers can still call `WorkspaceAnalyzer` directly, explicitly select a face and package subset, and process packages in batches without publishing or loading runtime artifacts.

<a id="pkg-taskweaver-dsh-typert-generator--repository-specific-cordis-projection"></a>
#### Repository-specific Cordis projection

The package analyzes workspace TypeScript contracts and emits deterministic Typert registry artifacts. Repository consumers supply the package roots and faces they want to analyze; the generator contains no product-specific API catalog or documentation taxonomy.

<a id="pkg-taskweaver-dsh-typert-generator--model-experience"></a>
#### Model Experience

None, as this package runs at build or test time and never contributes to a model request.

<a id="pkg-taskweaver-dsh-typert-generator--kv-cache-effect"></a>
###### KV Cache effect

None.

<a id="pkg-taskweaver-dsh-typert-generator--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- Package export patterns are skipped; contributing packages need concrete export targets.
- Cross-face named and star re-exports produce links; namespace re-exports fail until `TypeTargetModel` can represent a module namespace without flattening it.
- The Zod emitter supports a deliberate subset of the modeled TypeScript graph. Generic schema declarations and computed constructs such as conditional or mapped schema roots fail until a concrete schema-factory policy exists.
- Cross-face links are represented for analysis, but no generated schema currently requires a runtime cross-face Zod import.
- Discovery follows source files reachable from concrete public exports; declarations that are neither exported nor imported by that graph are intentionally outside the package model.

<a id="pkg-taskweaver-dsh-typert-loader"></a>
### `@taskweaver/dsh-typert-loader`

<!-- migrated-from: packages/runtime/typert/loader/README.md -->
目录：`typert/loader`。
package.json 描述：Loader integration for generated Typert package contributions

<a id="pkg-taskweaver-dsh-typert-loader--taskweaver-dsh-typert-loader"></a>
Node-only Loader integration for generated Typert artifacts. The plugin requires `ctx.loader` and `ctx.typert`; it does not provide the registry itself.

During activation it scans existing Loader entries. It then follows Cordis `internal/plugin` lifecycle notifications, resolves each entry package's `package.json`, imports `./typert` when exported, validates its `TYPERT` manifest, and registers the contribution until the entry or this plugin unmounts. An import that settles after either owner is gone is discarded.

`packages` lists additional package artifacts to register for plugins nested behind another Loader entry. Cordis fibers do not retain those nested plugins' npm specifiers, so this boundary is explicit; every configured package must resolve from the config tree and export `./typert`.

Packages without the export are skipped. Package resolution and imported manifests are cached for the process lifetime, so adding an export requires a restart. A malformed artifact fails activation when already mounted; a later failure is logged without preventing unrelated packages from registering.

<a id="pkg-taskweaver-dsh-typert-loader--model-experience"></a>
#### Model Experience

None, as the loader only feeds [`ctx.typert`](./README.zh.md#pkg-taskweaver-dsh-typert-registry); consumers own any model-visible projection.

<a id="pkg-taskweaver-dsh-typert-loader--kv-cache-effect"></a>
###### KV Cache effect

No direct effect.

<a id="pkg-taskweaver-dsh-typert-loader--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- Discovery imports only the host face; client runtimes need a separate composition owner before equivalent discovery is added.
- Loader entries are discovered automatically. Nested or non-Loader plugins require an explicit `packages` entry or direct `ctx.typert.register()` ownership.

<a id="pkg-taskweaver-dsh-typert-protocol"></a>
### `@taskweaver/dsh-typert-protocol`

<!-- migrated-from: packages/runtime/typert/protocol/README.md -->
目录：`typert/protocol`。
package.json 描述：Compiler-independent Remote metadata and Typert provider protocols

<a id="pkg-taskweaver-dsh-typert-protocol--taskweaver-dsh-typert-protocol"></a>
Compiler-independent declarations shared by business packages, generated Typert artifacts, the Host Gateway, and Client API. This package owns the Remote Service base, decorators, explicit binding fallback, merge-extensible protocol maps, invocation descriptors, codecs, and provider contracts; it does not run TypeScript analysis or register a concrete Cordis service.

<a id="pkg-taskweaver-dsh-typert-protocol--remote-declarations"></a>
#### Remote declarations

- `@Remote` marks a public instance method for direct invocation on its registered Cordis Service.
- `@RemoteScope(key)` marks a method whose receiver is selected from a merge-declared scoped Context kind.
- `TypertRemoteService` binds the Cordis key passed to `super(ctx, serviceKey, options?)` to the same default wire namespace.
- `bindTypertRemote(this, serviceKey, options?)` provides the same visible, frozen binding for a Service that cannot inherit from `TypertRemoteService`.
- `remoteMethods(service)` returns a detached declaration-order snapshot used by the Gateway's SRC fallback.

A Host method opts into cooperative cancellation by declaring `signal: AbortSignal` as its final parameter. `InvocationDescriptor.cancellation` records that reserved injection point; the signal never becomes a JSON parameter or lookup field. SRC recognizes the final parameter name, while strict generation also verifies the global `AbortSignal` type.

Decorator initializers retain markers in a module-private `WeakMap` keyed by the Service prototype. They do not add constructor symbols, prototype properties, parameter metadata, or runtime reflection fields. A `TypertRemoteService` exposes the same public readonly `typertRemote` binding that the explicit helper returns.

<a id="pkg-taskweaver-dsh-typert-protocol--typert-protocol"></a>
#### Typert protocol

Business packages extend `TypertLookupMap` and `TypertContextMap` to associate Host objects or scoped Contexts with their wire identities. Generated artifacts extend `TypertRemoteMap`, `TypertRemoteScopeMap`, and `TypertRemoteNamespaceMap` so Client imports expose only selected Remote methods. `InvocationDescriptor` is the shared runtime form consumed by the registry, Gateway, and Client Remote.

The Host assembly extends `TypertRemoteEventSelection` with the Host events it forwards to consumers, which narrows the `ctx.remote.$on` key face; `TypertForwardableEvent` states the shapes a one-way delivery can carry at all, excluding Scope-bound and answered events. `TypertClientRemote` carries both roles of that surface: consumers subscribe through `$on`, and the Client half owning the host frame sink hands frames over through `$dispatch`.

Lookup and Context packages own both sides of their contract: declaration merging supplies the static association, while runtime providers register identity resolution with `ctx.typert`. A lookup or Host Context provider supplies the stable declaration and default resolver, while Host composition may separately configure a synchronous or asynchronous resolver; policy rejections may use `TypertLookupFailure` to carry a failure value owned by the boundary adapter. Strict codecs carry generated schemas; `src-json` codecs identify the weaker source-launch path.

<a id="pkg-taskweaver-dsh-typert-protocol--model-experience"></a>
#### Model Experience

None, as this protocol package declares application reflection and registers nothing model-facing.

<a id="pkg-taskweaver-dsh-typert-protocol--kv-cache-effect"></a>
###### KV Cache effect

No direct effect.

<a id="pkg-taskweaver-dsh-typert-protocol--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- Decorator markers contain only the method name and direct or Context invocation mode. Parameter, result, lookup, and schema reflection require the Typert build pipeline.
- Remote decorators accept only public, non-static instance methods with string names. SRC execution cannot represent overloaded, destructured, defaulted, or rest-parameter signatures.

<a id="pkg-taskweaver-dsh-typert-registry"></a>
### `@taskweaver/dsh-typert-registry`

<!-- migrated-from: packages/runtime/typert/registry/README.md -->
目录：`typert/registry`。
package.json 描述：Runtime registry for generated package reflection and Zod schemas

<a id="pkg-taskweaver-dsh-typert-registry--taskweaver-dsh-typert-registry"></a>
Runtime registry for generated Typert artifacts. A contribution carries one package face's business reflection and optional live Zod schemas; `ctx.typert` registers both atomically and withdraws them with the calling Cordis fiber. TypeScript analysis and code generation live in [`dsh-typert-generator`](./README.zh.md#pkg-taskweaver-dsh-typert-generator).

Package reflection is keyed by `<package>#<face>`. Schemas are keyed by `<package>#<name>` and retain the producer's Zod instance. JSON Schema is computed on demand at the consumer edge.

<a id="pkg-taskweaver-dsh-typert-registry--public-api"></a>
#### Public API

- `TypertRegistry` is the default plugin and provides `ctx.typert`.
- `ctx.typert.lookups.register()` registers the wire declaration and default resolver owned by the business package; `configure()` registers a resolver owned by Host composition that may run asynchronously. Their lifetimes are independent: configuration may precede the provider, and unloading the configuration restores the default policy.
- `ctx.typert.contexts.registerHost()` and `configureHost()` apply the same ownership split to scoped Context identity; `registerClient()` supplies the corresponding Client Context binder.
- `register(contribution)` rejects malformed identities and duplicate package-face or schema keys before committing anything, then returns the exact Cordis effect disposer.
- `get(key)`, `resolve(key)`, and `list(filter?)` query live schemas. `resolve()` distinguishes a malformed key, an absent package, and a package that contributes no schema under that name.
- `getPackage(packageName, face?)` and `listPackages(filter?)` query generated service, event, and object reflection; the default face is `host`.
- `toJSONSchema(key, params?)` projects a live schema with `z.toJSONSchema()` without caching the result.
- `typertKey()` and `typertPackageKey()` compose the two stable identity forms.

The `@taskweaver/dsh-typert-registry/types` subpath contains the pure contribution and record contracts. [`dsh-typert-loader`](./README.zh.md#pkg-taskweaver-dsh-typert-loader) discovers and registers generated host artifacts in Loader compositions; direct `ctx.typert.register()` supports other composition owners.

<a id="pkg-taskweaver-dsh-typert-registry--model-experience"></a>
#### Model Experience

None, as the registry contributes no prompt, tool, or session event; consumers such as `cordis_inspect` own any model-visible projection.

<a id="pkg-taskweaver-dsh-typert-registry--kv-cache-effect"></a>
###### KV Cache effect

No direct effect. A consumer that places reflection in a request owns the resulting prefix change.

<a id="pkg-taskweaver-dsh-typert-registry--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- The registry stores generated reflection but does not merge host and client graphs or resolve TypeScript references. Those are analyzer and emitter concerns.
- Schema keys omit the face because host and client run in separate contexts. Registering same-named schemas from both faces into one context is rejected as a duplicate.

<a id="family-typert"></a>
### 原族级说明（迁移保留）

<a id="family-typert--typert"></a>
Typert separates source analysis, runtime storage, and Loader discovery.

| Package | Role | Cordis key |
|---|---|---|
| [`registry/`](./README.zh.md#pkg-taskweaver-dsh-typert-registry) | Stores runtime package reflection and schemas | `ctx.typert` |
| [`loader/`](./README.zh.md#pkg-taskweaver-dsh-typert-loader) | Discovers Loader entries and registers generated host artifacts | consumes `ctx.loader` and `ctx.typert` |
| [`generator/`](./README.zh.md#pkg-taskweaver-dsh-typert-generator) | Generates runtime artifacts from source types | build-time library |
