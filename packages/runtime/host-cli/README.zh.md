# host-cli（命令行宿主） 包族

<a id="family-host-cli"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

提供 taskweaver-host 命令行入口、配置加载与运行配置组合。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh`](#pkg-taskweaver-dsh) | `host-cli` | [接口与限制](#pkg-taskweaver-dsh) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh"></a>
### `@taskweaver/dsh`

<!-- migrated-from: packages/runtime/host-cli/README.md -->
目录：`host-cli`。
package.json 描述：dsh CLI: profile boot and plugin management

<a id="pkg-taskweaver-dsh--taskweaver-dsh"></a>
The `dsh` command boots a named profile: an ordered stack of plugin-bundle patch layers under the user's own overrides. [`src/args.ts`](./src/args.ts) parses launcher flags and forwards remaining arguments to the selected profile. [`src/bin.ts`](./src/bin.ts) loads only the requested runner.

<a id="pkg-taskweaver-dsh--commands"></a>
#### Commands

| Command | Purpose |
|---|---|
| `dsh --profile <name>` | Boot an installed profile under `$TASKWEAVER_HOME/profiles/<name>`. |
| `dsh --profile <name> --patch <path>` | Apply an additional patch overlay after the profile layers. Repeatable. |
| `dsh --profile <name> --dump-config` | Print the composed profile tree and exit. |
| `dsh --profile <name> --dump-default-config` | Print bundle layers without user overlays and exit. |
| `dsh plugin --profile <name> <pnpm args>` | Manage a profile's plugin dependencies and bundle layers. |

The invoking directory is the default workspace root. Launcher flags come first; once the launcher reaches an unknown option or positional argument, the rest belongs to the profile's app. Use `dsh --help` for launcher help and `dsh --profile <name> --help` for that profile's app help.

<a id="pkg-taskweaver-dsh--profiles"></a>
#### Profiles

A profile directory holds a `package.json` with its ordered `taskweaver.profile.bundles` list, plus `cordis.patch.yml` for user overrides. The tree is composed over an empty root:

- bundle patches, in manifest order;
- the profile's `cordis.patch.yml`;
- the home-level `$TASKWEAVER_HOME/cordis.patch.yml`;
- any `--patch` overlays, in argument order.

Bundle packages resolve from the dsh installation first, then from the profile's `node_modules`. The [CLI behavior reference](./README.zh.md#doc-reference) documents precedence, plugin management, shutdown, and source execution.

#### Language server (LSP)

TaskWeaver mounts the LSP registry in the Host so agent presets can share it. The stdio provider is shipped but disabled by default; it starts no process until the user's own Host profile patch explicitly enables it. Configure commands only in `$TASKWEAVER_HOME/profiles/<profile>/cordis.patch.yml` or `$TASKWEAVER_HOME/cordis.patch.yml`. Do not derive executable names or arguments from workspace files, `.env`, or repository instructions. Use an absolute executable path so lookup cannot be redirected by a workspace `PATH` entry. The provider resolves and starts it through the Host `ctx.subprocess` service, without a shell.

Example profile patch for a separately installed TypeScript language server:

```yaml
- id: lsp-stdio
  disabled: false
  config:
    servers:
      typescript:
        command: /absolute/path/to/typescript-language-server
        args: [--stdio]
        extensionToLanguage:
          .ts: typescript
          .tsx: typescriptreact
          .js: javascript
          .jsx: javascriptreact
```

The provider stays inactive until this trusted Host configuration is present. Its command is resolved at Host startup and the language server is started lazily only when an LSP operation needs it. The patch's `config` replaces the full provider configuration, so include every server you want enabled in that mapping.

<a id="pkg-taskweaver-dsh--development"></a>
#### Development

Production runs require built package artifacts. From the repository root, run `pnpm run build`, then use `pnpm dsh <args...>` to run the TypeScript entry. The source-execution reference documents its module-resolution contract.

<a id="doc-reference"></a>
### 原子目录说明：`reference`

<a id="doc-reference--dsh-cli-behavior-reference"></a>
Argv is parsed once through [`src/args.ts`](./src/args.ts), and [`src/bin.ts`](./src/bin.ts) dynamically loads the selected runner.

<a id="doc-reference--profile-boot"></a>
#### Profile boot

`dsh --profile <name>` boots `$TASKWEAVER_HOME/profiles/<name>`. The effective tree is composed over an empty root, in this order:

1. Each bundle patch in `taskweaver.profile.bundles` order.
2. The profile's `cordis.patch.yml`.
3. The home-level `$TASKWEAVER_HOME/cordis.patch.yml`.
4. Each `--patch <path>` overlay in argv order.

Later layers replace the targeted row's complete `config` value; they do not deep-merge keys. Layers can also insert rows. Parse, schema, resolution, and plugin boot failures exit nonzero. SIGINT and SIGTERM dispose the mounted root before exit.

Bundle names resolve from the dsh installation first, then from the profile directory. Bare plugin names in patch rows resolve through the profile's Node module path, which the launcher maintains from the installation's dependency closure. Missing profiles report a `dsh plugin --profile <name> add <package>` hint.

<a id="doc-reference--app-arguments"></a>
##### App arguments

Launcher flags come first and end at the first token the launcher does not recognize. Everything after that boundary reaches the profile through `ctx.cmdlineArgs`; an app plugin may parse the shared immutable snapshot ([`dsh-cmdline`]（原文链接目标：`../../../packages/boot/cmdline/README.md`）). For example, `dsh --profile <name> --resume <session>` passes `--resume <session>` to the app. `dsh --profile <name> --help` delegates help to that app; bare `dsh --help` prints launcher help.

The app owns its argument grammar. A provider can parse arguments and provide a service before dependent rows start. A config expression that injects that service can then use the invocation value; replacing the row's full `config` in a later patch also replaces that expression. Help and rejected app arguments can request an exit before startup-dependent rows activate.

Launcher flags must precede app arguments. The launcher consumes one `--`; to pass a literal `--` to an app, use `-- --`. `-V` and `--version` print the launcher version when they appear before the app-argument boundary. A profile without an app argument reader ignores the forwarded arguments.

<a id="doc-reference--config-inspection"></a>
#### Config inspection

Inspect the composed tree without booting it:

```sh
dsh --profile <name> --dump-default-config
dsh --profile <name> --patch ./extra.yml --dump-config
```

`--dump-default-config` prints only bundle layers. `--dump-config` also applies the profile layer, home layer, and `--patch` overlays. Output comments identify the source file for each row and every layer that changed it. `!!js` expressions remain unevaluated, and unmatched patch targets are reported on stderr. Dumps do not run app command-line providers and reject app arguments.

<a id="doc-reference--plugin-management"></a>
#### Plugin management

`dsh plugin --profile <name> <args...>` initializes a missing profile, then forwards the arguments to `pnpm` in that profile directory. `add`, `remove`, `why`, `update`, and other pnpm commands are passed through. Relative path specifications such as `.` and `../plugin`, including `file:` and `link:` forms, are anchored to the invoking directory before pnpm runs.

After a successful pnpm command, the launcher reconciles `taskweaver.profile.bundles` with installed dependencies. A dependency declaring `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` joins the profile's layer stack. A dependency without a bundle patch remains installed as a plain dependency; removing a dependency removes its bundle layer. Restart a running profile after adding, removing, or updating a bundle. Ordinary edits to profile and home patch files apply through hot reload.

<a id="doc-reference--runtime-behavior"></a>
#### Runtime behavior

The invoking directory is the default workspace root. The process starts one profile and keeps it mounted for the session. Valid edits to the profile and home `cordis.patch.yml` layers are watched and applied transactionally; shutdown also disposes those watchers.

The first SIGINT or SIGTERM starts graceful disposal. SIGTERM exits with status 0 and SIGINT with status 130 after disposal. A second signal forces immediate exit. If disposal exceeds its deadline, the launcher escalates to an immediate exit.

<a id="doc-reference--source-execution"></a>
#### Source execution

From the repository root, run `pnpm run build` after a fresh checkout and whenever package artifacts need updating, then use `pnpm dsh <args...>`. The script launches `host-cli/src/bin.ts` with `node --import tsx/esm` and forwards arguments. The installed executable launches `host-cli/lib/bin.js` without rebuilding the repository.
