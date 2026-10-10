# boot 包族

<a id="family-boot"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

提供命令行与示例程序共用的启动参数解析和启动阶段基础设施。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-app-boot`](#pkg-taskweaver-dsh-app-boot) | `boot/app-boot` | [接口与限制](#pkg-taskweaver-dsh-app-boot) |
| [`@taskweaver/dsh-cmdline`](#pkg-taskweaver-dsh-cmdline) | `boot/cmdline` | [接口与限制](#pkg-taskweaver-dsh-cmdline) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-app-boot"></a>
### `@taskweaver/dsh-app-boot`

<!-- migrated-from: packages/runtime/boot/app-boot/README.md -->
目录：`boot/app-boot`。
package.json 描述：Shared boot glue for the app bins: .env loading, fail-loud Loader guards, snapshot-aware config resolution, and the Loader boot sequence

<a id="pkg-taskweaver-dsh-app-boot--taskweaver-dsh-app-boot"></a>
Shared boot glue for the app bins ([`dsh`]（原文链接目标：`../../../host-cli/README.md`） and [`dsh-acp-demo`]（原文链接目标：`../../examples/acp-demo/README.md`）): each bin is a thin self-executing composition over these helpers, parameterized by its diagnostic prefix, so loader-failure behavior has one owner instead of drifting between published artifacts.

| Export | Role |
|---|---|
| `resolveConfigPath(path, snapshotMode, cwd?)` | Absolute config path; `snapshotMode === 'replay'` swaps a `cordis.yml`/`.yaml` basename for its sibling `cordis.snapshot.yml` |
| `loadEnv(binName, dir?, warn?)` | Load the gitignored `.env` (Node `process.loadEnvFile`); absent file is fine, an unloadable one warns a single labelled line (default: stderr) |
| `loadLayeredEnv(binName, cwd?, warn?)` | Build the product CLI's frozen inherited > project `.env` > user `.env` snapshot, reject bootstrap-only file variables, and materialize accepted file values without replacing inherited ones |
| `installFailLoud(binName, proc?, release?)` | Turn an unhandled boot or later Loader rejection into one labelled stderr line + `exit(1)`; the optional `release` teardown is awaited between the two (bounded by `FAIL_LOUD_RELEASE_TIMEOUT_MS`) so a terminal-owning surface restores the terminal before exit; returns the uninstaller |
| `FAIL_LOUD_RELEASE_TIMEOUT_MS` | How long `installFailLoud` waits for its `release` hook; a wedged disposer delays the fatal exit, never cancels it |
| `assertEntriesLoaded(ctx, binName)` | Throw when a settled tree holds an enabled entry with no fiber, reporting every unresolved plugin name as a Cordis startup failure |
| `assertEntriesActivated(ctx, binName)` | Include the `assertEntriesLoaded` check, then await every enabled entry after the Loader settles; throw with each failed plugin's original stack or each pending plugin's unresolved services |
| `loadOptionalPatches(binName, file)` | Parse an optional patch-list file (a profile's `cordis.patch.yml`) — a top-level YAML array of include `PatchOptions` (id-targeted config overrides, `insert` lists, `!!js` allowed); absent file → `undefined`, an unreadable/unparsable/non-array file throws |
| `loadOverlayPatches(binName, file)` | Parse a required top-level YAML array containing the same include `PatchOptions` entries described above; a missing file also throws because the caller named it |
| `mountRootInclude(ctx, absoluteConfigPath, patches?, bareModuleBaseUrl?)` | Register the statically imported `cordis:include` and `cordis:group` builtins, mount the include, and retain the exact root entry used by user patch-layer HMR; an optional module base anchors bare package names to the installed host while relative names stay config-relative |
| `watchUserPatches(ctx, options)` | Register the named patch file with the existing Cordis HMR service; each add/change/removal transactionally recomposes the full patch list through the caller's `compose` closure (app-owned layers around the current user layer) and returns an async disposer |
| `resolveProfileDir` / `initProfile` / `loadProfile` / `readProfileManifest` / `writeProfileManifest` / `resolveBundleDir` / `composeEntries` / `healProfilesModuleFallback` / `PROFILE_TEMPLATES` / `DEFAULT_PROFILE_BUNDLES` / `PROFILES_DIR` / `PROFILE_PATCH_FILENAME` | Profile machinery (see [Profiles](README.zh.md#pkg-taskweaver-dsh-app-boot--profiles)) |
| `boot(binName, absoluteConfigPath, patches?, prepare?, bareModuleBaseUrl?)` | Create the root context, expose `runtimeHomePath(...segments)` to Loader `!!js` config expressions, install Loader, run optional host preparation before config-tree entries mount (`prepare` may use Loader and provide launcher-owned context slots), then mount and await the include tree, assert entries loaded and activated, and return the root context — or dispose the partial context and reject a labelled error; the optional module base has the same resolution semantics as `mountRootInclude` |
| `renderConfigDump(binName, absoluteConfigPath, layers, warn?)` | Compose the base config and labeled overlay layers offline with the include's own parser and patch algorithm (`entryListSchema`/`applyEntryPatches`), so the result equals what `boot()` mounts, and render YAML with `!!js` expressions verbatim; each run of rows that shares one source file and the same patch layers is preceded by a `# ==` comment naming that file and those layers, keeping the output one loadable document; a patch matching no row goes to `warn` with its layer label (default: one stderr line), and read, parse, or field validation failures throw |
| `addHarnessSourceSection(ctx, sourceRoot)` | Add a global `harness:source` prompt section (ordered just after the harness identity, before the persona) telling the agent the on-disk path to the DSH implementation checkout while warning it not to infer the current working directory from that path and to use `pwd` instead; a no-op returning `undefined` when the booted tree has no `systemPrompt` service. The section is registered against that service's fiber, so a dev HMR reload of the system prompt drops it until the next boot |
| `HARNESS_SOURCE_SECTION` | The `'harness:source'` section name `addHarnessSourceSection` registers under |

Loader settlement rejects import and lifecycle failures with the failing entry and stage; `boot()` disposes the partial context and wraps that failure with the bin name. Entries settlement leaves behind are audited separately: `assertEntriesLoaded` turns an enabled fiber-less entry into a rejection naming every unresolved plugin, and `assertEntriesActivated` awaits each failed fiber to include its original stack in the startup rejection and names each pending entry's unresolved services. Before throwing, the audit marks those exact rejection reasons through one process checkpoint so `installFailLoud` coalesces Loader's duplicate notification while every unrelated unhandled rejection remains fatal.

The Loader mounts entries concurrently, so a surface can already own the terminal when something else fails: exiting without the tree's own teardown would leave raw mode, bracketed paste, and the keyboard protocol set on the user's shell, and an in-flight terminal query's reply would land as literal text at the next prompt. A config-tree failure settles through `boot()`, whose disposal of the partial context runs the surface's own shutdown before the labelled rejection. For the rejections `boot()` cannot see — a plugin's detached async work rejecting during or after mounting — a terminal-owning bin passes `release` to dispose the tree before the exit commits; `dsh` captures the root context in `boot()`'s `prepare` hook rather than from its return value so the hook covers the whole mounting window. While a release is in flight the handler stays installed and latched: the first rejection is the reported one, and later rejections (teardown's own included) are swallowed rather than becoming uncaught and killing the process mid-teardown.

`cordis:group` is registered beside `cordis:include` so a composition can give one `isolate` realm to a provider and its consumers together. Both load through the ambient module pipeline rather than the included tree's own specifier resolution, which is what lets a composition outside this workspace — an agent preset under the Harness home — use a group row at all.

Bare plugin specifiers in a config (`@taskweaver/dsh-*`, npm packages) resolve through the Cordis Loader's internal module loader. They resolve from the config directory by default; a closed runtime passes `bareModuleBaseUrl` to `boot` or `mountRootInclude` so its installed package tree remains authoritative even when the config lives inside another Node project. Relative specifiers always resolve against the config directory. Repository bins install Loader's optional `node-addon-require-builtin` peer; external callers must supply it or install plugins where plain Node import resolution can find them. The built `dsh-app-boot` artifact embeds the statically mounted Include implementation while leaving Loader external, so the include tree and host bind to one Loader peer. The `pnpm dsh` source path additionally maps manifest-declared workspace packages to their TypeScript source; its configuration gate requires every shipped raw/Web bare plugin to appear in the resolver manifest's `dependencies`.

This package carries no loader hooks and no dev-mode surface. The [`dsh` app]（原文链接目标：`../../../host-cli/README.md`） owns its Node source-launch hook and consumes these helpers for the boot sequence; built consumers continue to use plain Node package resolution.

<a id="pkg-taskweaver-dsh-app-boot--profiles"></a>
#### Profiles

A profile is a directory under `$TASKWEAVER_HOME/profiles/<name>` (the runtime home resolves through [`resolveRuntimeHome`](../util/README.zh.md#pkg-taskweaver-dsh-home-paths): `$TASKWEAVER_HOME`, else `~/.taskweaver/runtime`) holding a `package.json` — out-of-tree plugin `dependencies` plus the profile manifest `taskweaver.profile` with its ordered `bundles` layer list — and the user's own `cordis.patch.yml`. A bundle is an npm package whose manifest declares `"taskweaver": { "bundle": { "patch": "./cordis.patch.yml" } }`; old `dsh` manifest sections are read and migrated on startup. `loadProfile` resolves each `taskweaver.profile.bundles` name two-anchored (the installed Host first, then the profile directory) and fails loud on a listed package without a bundle declaration. `composeEntries` applies patch layers over an empty entry list through the include's own `applyEntryPatches`, so composition, flag derivation, and config dumps cannot drift from what boots. `healProfilesModuleFallback` maintains the flat `$TASKWEAVER_HOME/profiles/node_modules` directory — one symlink per package the installation's app and bundles depend on — so bare plugin names in any profile resolve through Node's ordinary parent-walk without pnpm managing in-box packages. `PROFILE_TEMPLATES` (`web`, `headless`) auto-initialize on first use; other names fail loud until `initProfile` creates them (`taskweaver-host plugin`). `loadProfile` normalizes an exact installation-owned bundle tuple to its shipped template while preserving every other manifest field; any extra, missing, or reordered entry makes the list user-owned and leaves it unchanged.

User-level machine-local preferences also live in the Harness home:

- **`.env`** — the product CLI's ordinary environment layers: the invoking directory's file outranks the Harness-home file, and both sit below the inherited environment. `loadLayeredEnv` snapshots each value's source, rejects [bootstrap-only file variables]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-08-04-configuration-source-ownership.md#decision`） case-insensitively, and materializes accepted values into `process.env` for Loader expressions and third-party libraries. Managed credentials live separately in [`.credentials.yaml`](../credentials/README.zh.md#pkg-taskweaver-dsh-credentials-local); a credential left in either `.env` remains a lower-priority fallback.
- **`cordis.patch.yml`** (home level) and **`profiles/<name>/cordis.patch.yml`** — the user patch layers, applied after every bundle layer (per-profile first, then the home-level file, which therefore outranks it): an id-targeted patch replaces the named entry's whole `config` (restate unchanged fields), `insert` adds entries, and `!!js` expressions interpolate at mount. A patch naming an entry id absent from the composed tree is a stderr warning. An empty or comments-only file throws (it parses to nothing, not to a list); disable the layer with `[]`.

Every profile boot keeps `cordis.patch.yml` live through `watchUserPatches` (a one-shot surface disposes the watcher through its bounded shutdown). The watcher targets the exact path even when the file or immediate parent does not exist, serializes bursts, and recomposes the user patches inside the caller's layer order (bundle layers below, overlays above). A rejected read, parse, or Loader candidate leaves the last good tree running and the HMR service broadcasts `hmr/config-update-failed(filename, Error)` after logging it; observer failures are contained. Disposing the context closes the watcher and drains an active refresh.

<a id="pkg-taskweaver-dsh-app-boot--model-experience"></a>
#### Model Experience

Indirectly, through the plugin tree it loads, which determines the prompts, schemas, messages, and model adapter in the resulting application; the one export that contributes model-visible text, `addHarnessSourceSection`, does so only when a consumer calls it after boot.

<a id="pkg-taskweaver-dsh-app-boot--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation from `boot()`; a consumer that calls `addHarnessSourceSection` places one short line near the system prompt's head, before per-request content, so it does not invalidate the cache across turns, and any other request-prefix change is owned by the named consumer.

<a id="pkg-taskweaver-dsh-app-boot--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Bare package specifiers depend on Loader internals** — production bins need Loader's optional native helper; an in-process caller without it must use resolvable relative/file specifiers or provide its own module-resolution hook.
- **Snapshot replay swapping is basename-specific** — only a config ending in `cordis.yml` or `cordis.yaml` maps to the sibling `cordis.snapshot.yml`; custom config names require caller-managed selection.
- **Environment discovery is launch-scoped** — `loadLayeredEnv` reads only the invocation directory and Harness home once; it does not search parents or follow a workspace selected later. `loadEnv` remains the one-directory helper for non-product bins.
- **A user patch replaces the whole matched config** — an id-targeted patch does not deep-merge, so a profile override restates the bundle fields it keeps.

<a id="pkg-taskweaver-dsh-cmdline"></a>
### `@taskweaver/dsh-cmdline`

<!-- migrated-from: packages/runtime/boot/cmdline/README.md -->
目录：`boot/cmdline`。
package.json 描述：Immutable command-line handoff from a dsh launcher to any app plugin that injects cmdlineArgs

<a id="pkg-taskweaver-dsh-cmdline--taskweaver-dsh-cmdline"></a>
The command line a dsh launcher hands to the app it boots. The launcher parses only its own flags (`--profile`, `--patch`, the config dumps) and hands **everything after them** to the tree verbatim, so an app owns its flag family, its `--help` text, and its parse errors instead of the launcher knowing them.

<a id="pkg-taskweaver-dsh-cmdline--the-launcher-values"></a>
#### The launcher values

A launcher calls `provideCmdline(ctx, host)` before any tree entry mounts, which provides:

- `ctx.cmdlineArgs` — the invocation's inner arguments. `get()` is the whole interface, and it returns a snapshot: `dsh --profile tui --resume abc` yields `['--resume', 'abc']`.
- `ctx.appExit` — a bounded process-exit request, wired to the launcher's shutdown controller.

An embedding host with no command line provides an empty list; that is the honest answer, not a missing value.

<a id="pkg-taskweaver-dsh-cmdline--ordinary-providers-and-injected-config"></a>
#### Ordinary providers and injected config

Any app plugin may inject `cmdlineArgs`, parse it, and publish an ordinary app-owned service. `parseCmdline(ctx, program)` is only a commander adapter; the program's own action owns validation and the published service:

```ts ignore
export const name = 'web-startup'
export const inject = ['cmdlineArgs']

export function apply(ctx: Context): void {
  const program = webCommand()
  program.action(() => ctx.provide('webStartup', webValuesFrom(program)))
  parseCmdline(ctx, program)
}
```

Its Loader row carries no launcher marker or special kind:

```yaml
- id: web-startup
  name: '@taskweaver/dsh-taskweaver/startup'
```

Every row configured from those values uses ordinary service injection and direct lazy config access:

```yaml
- id: webserver
  name: '@taskweaver/dsh-host-webserver'
  inject: [webStartup]
  config:
    host: !!js ctx.webStartup.host ?? '127.0.0.1'
    port: !!js ctx.webStartup.port ?? 3080
```

`parseCmdline` refuses at load a program in which no command declares an action, routes every command's exit and output through the launcher (commander copies those settings into subcommands only at registration), and parses the immutable arguments; commander runs the invoked command's synchronous action on success. An action rejects an invalid invocation with `program.error(...)` — before publishing, since statements ahead of the rejection have already run. On `--help`, `--version`, a parse error, or that rejection, the helper writes commander's text and requests exit; the provider publishes nothing, so dependent rows never activate.

<a id="pkg-taskweaver-dsh-cmdline--how-injection-orders-config"></a>
##### How injection orders config

Loader defers a row's `!!js` interpolation until that row's declared injections are active, then evaluates against the row's plugin context. The example above can therefore read `ctx.webStartup` directly: Cordis has already populated that injected service before Loader asks for `webserver`'s config. Include trees preserve nested expression nodes until each target row reaches this point. Provider replacement and live patch reload repeat interpolation against the current injected services, so a launch flag cannot be silently reset.

<a id="pkg-taskweaver-dsh-cmdline--shared-immutable-arguments"></a>
##### Shared immutable arguments

`get()` does not consume or mutate argv. Multiple plugins can parse the same snapshot and independently provide services. The launcher does not inspect the composition for a command-line owner; a profile with no reader simply ignores its app arguments.

An out-of-tree plugin brings its own commander copy, so commander's control-flow errors are detected structurally rather than by class identity; an identity check would rethrow a printed help as a fatal load failure.

<a id="pkg-taskweaver-dsh-cmdline--model-experience"></a>
#### Model Experience

None, as this package resolves the process's own command line before any session exists.

<a id="pkg-taskweaver-dsh-cmdline--kv-cache-effect"></a>
###### KV Cache effect

None; this package neither assembles nor sends a provider request.

<a id="pkg-taskweaver-dsh-cmdline--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Launcher flags must precede app arguments.** The split is positional: the first token the launcher does not recognize starts the inner arguments, so `--patch` placed after an app flag belongs to the app. The launcher's parser consumes one `--`, so an app argument that must survive as a literal `--` needs `-- --`.
- **An app-owned service has no statically declared provider.** Consumer rows name it through ordinary injection; a bundle that omits its provider fails at settlement with pending entries naming the service rather than at load.
- **A user patch that replaces a row's whole `config` drops its expressions.** A flag beats the value written beside it, not a literal a user wrote in place of the expression; keeping the expression is what keeps the flag winning.

<a id="family-boot"></a>
### 原族级说明（迁移保留）

<a id="family-boot--boot-shared-app-bin-boot-glue"></a>
The channel-neutral boot library shared by `host-cli` and the [`examples/`](../examples/README.zh.md#family-examples) demo bins.

| Package | Role | ctx key |
|---|---|---|
| `app-boot/` | Shared boot glue for the app bins: `.env` loading, fail-loud Loader guards, snapshot-aware config resolution, the settle-the-tree boot sequence | (library for the bins) |
| `cmdline/` | Launcher-to-app command-line handoff and app-owned startup parsing | `cmdlineArgs`, `appExit` |

The boot sequence and personal-config contract are documented in [`app-boot/README.md`](./README.zh.md#pkg-taskweaver-dsh-app-boot); app-owned command lines are documented in [`cmdline/README.md`](./README.zh.md#pkg-taskweaver-dsh-cmdline).
