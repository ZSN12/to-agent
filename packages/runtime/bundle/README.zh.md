# bundle 包族

<a id="family-bundle"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

通过 Cordis 补丁清单组合可安装的运行时插件层。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-base`](#pkg-taskweaver-dsh-base) | `bundle/base` | [接口与限制](#pkg-taskweaver-dsh-base) |
| [`@taskweaver/dsh-taskweaver`](#pkg-taskweaver-dsh-taskweaver) | `bundle/taskweaver` | [接口与限制](#pkg-taskweaver-dsh-taskweaver) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-base"></a>
### `@taskweaver/dsh-base`

<!-- migrated-from: packages/runtime/bundle/base/README.md -->
目录：`bundle/base`。
package.json 描述：The shared dsh core as a profile bundle: every profile's first patch layer, inserting the base plugin rows over the empty profile root

<a id="pkg-taskweaver-dsh-base--taskweaver-dsh-base"></a>
The shared dsh core as a profile bundle: [`cordis.patch.yml`](./base/cordis.patch.yml) inserts every base plugin row — model adapters, the shared [`agent-default-model`](../core/README.zh.md#pkg-taskweaver-dsh-agent-default-model) selection, tools, persistence, policy, settings/credentials, and the core spawn/fork subagent providers — over the empty profile root, as the first layer of every profile's `taskweaver.profile.bundles` list. The optional Codex and Claude Code providers stay outside this package and its production dependency closure; a Profile installs either [product provider Bundle](../subagent/README.zh.md#family-subagent) only when needed. The default `@taskweaver/dsh` production closure therefore includes neither product provider, the Claude Agent SDK, nor the Codex wrapper and platform payloads. Later bundle layers (e.g. [`dsh-web-app`]（原文链接目标：`../web-app/README.md`）) and the user's profile `cordis.patch.yml` override these rows by id; a patch replaces a row's whole `config`, so mode-specific values live in mode bundles, not here. The package has no runtime API; the profile composer resolves the patch through the `taskweaver.bundle.patch` manifest field, never through code.

The patch gates both shell stacks by platform on its own rows: `bash-sandbox`/`tool-bash` carry `disabled: !!js process.platform === 'win32'` (bash has no Windows runner), and their twins `pwsh-sandbox`/`tool-pwsh` mount on win32 only with the inverted expression — one shared patch file, exactly one shell stack per host. The permission surface stays exactly as on POSIX: `sandbox`/`sandbox-policy` enforce the file-effect policy through the Windows ACL restricted-token runner (the win32 chain of `dsh-sandbox-local` → `@taskweaver/dsh-sandbox-windows-acl`), the permission switcher and the approval service run unchanged, and `fs-sandbox` keeps fencing `ctx.fs` writes — mounting `dsh-fs-local` alongside it would double-register `ctx.fs` and fail the load. A Windows host that prefers the unconfined local pwsh executor or full access overrides these rows through its profile or home `cordis.patch.yml` (the bash-restore recipe must be complete: disable `pwsh-sandbox`/`tool-pwsh` AND re-enable `bash-sandbox`/`tool-bash` — both executor families register the same `bash` service, so an incomplete recipe fails loud at load). POSIX hosts see the pwsh rows disabled.

The row set and its rationale are documented inline in the patch file; the [generated composition graph]（原文链接目标：`../../../host-cli/composition.md`） renders it.

<a id="pkg-taskweaver-dsh-base--model-experience"></a>
#### Model Experience

Indirectly, through the inserted rows: this bundle selects the shipped persona-less prompt base, tool set, and configured pi-ai adapter that mode bundles specialize, and contributes no model-visible text of its own.

<a id="pkg-taskweaver-dsh-base--kv-cache-effect"></a>
###### KV Cache effect

None directly; each inserted row's package owns its effect.

<a id="pkg-taskweaver-dsh-base--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **A patch replaces whole row configs** — profile overrides must restate every field a row keeps; there is no deep-merge layer.
- **The Windows temp grant is a private per-session subdirectory** — `workspace-write` confines writes to the workspace plus the session's own temp subdirectory (`<temp>\dsh-<hash>`, TMP/TEMP rewritten for confined children); `read-only` grants nothing. See `@taskweaver/dsh-sandbox-windows-acl`.

<a id="pkg-taskweaver-dsh-taskweaver"></a>
### `@taskweaver/dsh-taskweaver`

<!-- migrated-from: packages/runtime/bundle/taskweaver/README.md -->
目录：`bundle/taskweaver`。
package.json 描述：TaskWeaver API-only Host startup, explicit /api trust authorities, and readiness signal

<a id="pkg-taskweaver-dsh-taskweaver--taskweaver-dsh-taskweaver"></a>
`@taskweaver/dsh-taskweaver` supplies the TaskWeaver API Host startup glue over [`dsh-base`](./README.zh.md#pkg-taskweaver-dsh-base). Its bundle patch configures the WebServer bind address and port, forwards explicit trusted authorities to the `/api` connection, and publishes the existing `z web:` readiness line after the Loader tree settles. The Electron Host supervisor uses that line only after the API route has mounted.

The `web-startup` provider ([`src/startup.ts`](./taskweaver/src/startup.ts)) parses the API Host options from `dsh --profile web`:

- `--host <host>` selects the WebServer bind host. The default is `127.0.0.1`; `0.0.0.0` is rejected.
- `--port <port>` selects the WebServer port. The default is `3080`; `0` asks the operating system for a free port.
- `--trusted-host <authority...>` adds explicit authorities accepted by the `/api` trust fence and can be repeated.

The provider exposes those values as `webStartup`. The WebServer row binds only after that service exists. The API Host row forwards `trustedHosts` as `webRuntime` and waits for Loader completion before printing `z web: http://127.0.0.1:<port>`. A `--help` invocation prints the profile options without binding a server.

The bundle has no frontend dist resolver, static UI fallback, browser opener, UI prompt injection, or UI shell environment variables. Those concerns belong to the Electron application. The Host still composes the API gateway, `/api` connection, API remotes, and host services required by Electron.

<a id="pkg-taskweaver-dsh-taskweaver--code-runtime-language"></a>
#### Code runtime language

TaskWeaver has one Host `ctx.codeRuntime` service, so the bundled Host selects one Code Mode language per process. `TASKWEAVER_CODE_LANGUAGE` accepts `typescript` or `python`; it defaults to `typescript`. Python mode uses the user's `python3` from `PATH`, requires CPython 3.9 or newer, and reports install guidance when no usable interpreter is available. It does not bundle Python. Each run resolves the current agent's sandbox policy and confines the interpreter before sending the program over fd 3. `danger-full-access` follows the sandbox policy contract and runs without a confinement wrapper.

Python runtime limits are configurable on the `code-runtime` row (`maxWallMs`, `cpuSeconds`, `addressSpaceBytes`, `maxLogBytes`, `maxValueBytes`, `maxOutputBytes`, and `maxFrameBytes`). macOS does not apply the runner's Linux-only `RLIMIT_AS`; wall time and output caps remain active.

The focused startup suite covers flag parsing, invalid bind options, lazy service ordering, and help. The API Host suite checks that the `/api` route answers before the readiness line is released.

<a id="family-bundle"></a>
### 原族级说明（迁移保留）

<a id="family-bundle--bundle-profile-plugin-bundles"></a>
Profile bundles: npm packages whose manifest declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, making them installable patch layers for `dsh --profile` compositions ([profile contract](../boot/README.zh.md#pkg-taskweaver-dsh-app-boot--profiles)). A bundle's substance is its patch list; some also ship runtime glue plugins their patch mounts.

The manifest declaration, not this directory, defines Bundle identity. Domain packages can carry their own optional Profile layer; the [Codex and Claude Code subagent packages](../subagent/README.zh.md#family-subagent) are directly installable examples.

| Package | Role | ctx key |
|---|---|---|
| [`base/`](./README.zh.md#pkg-taskweaver-dsh-base) | The shared dsh core every profile applies first | — (patch only) |
| [`web-app/`]（原文链接目标：`web-app/README.md`） | Browser surface: web patch layer + runtime glue plugin | mounts rows |
| [`headless/`]（原文链接目标：`headless/README.md`） | Direct one-shot task mode over base, with no Host or Web layer | mounts `headless-runner` |

In-box bundles resolve from the dsh installation; out-of-tree bundles install into a profile through `dsh plugin --profile <name> add <package>`.
