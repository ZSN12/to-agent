# shell 包族

<a id="family-shell"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义 Shell 执行能力，提供本地实现、运行环境和模型可调用工具。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-bash-local`](#pkg-taskweaver-dsh-bash-local) | `shell/bash-local` | [接口与限制](#pkg-taskweaver-dsh-bash-local) |
| [`@taskweaver/dsh-bash-sandbox`](#pkg-taskweaver-dsh-bash-sandbox) | `shell/bash-sandbox` | [接口与限制](#pkg-taskweaver-dsh-bash-sandbox) |
| [`@taskweaver/dsh-pwsh-local`](#pkg-taskweaver-dsh-pwsh-local) | `shell/pwsh-local` | [接口与限制](#pkg-taskweaver-dsh-pwsh-local) |
| [`@taskweaver/dsh-pwsh-sandbox`](#pkg-taskweaver-dsh-pwsh-sandbox) | `shell/pwsh-sandbox` | [接口与限制](#pkg-taskweaver-dsh-pwsh-sandbox) |
| [`@taskweaver/dsh-shell`](#pkg-taskweaver-dsh-shell) | `shell/shell` | [接口与限制](#pkg-taskweaver-dsh-shell) |
| [`@taskweaver/dsh-shell-env`](#pkg-taskweaver-dsh-shell-env) | `shell/shell-env` | [接口与限制](#pkg-taskweaver-dsh-shell-env) |
| [`@taskweaver/dsh-tool-bash`](#pkg-taskweaver-dsh-tool-bash) | `shell/tool-bash` | [接口与限制](#pkg-taskweaver-dsh-tool-bash) |
| [`@taskweaver/dsh-tool-pwsh`](#pkg-taskweaver-dsh-tool-pwsh) | `shell/tool-pwsh` | [接口与限制](#pkg-taskweaver-dsh-tool-pwsh) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-bash-local"></a>
### `@taskweaver/dsh-bash-local`

<!-- migrated-from: packages/runtime/shell/bash-local/README.md -->
目录：`shell/bash-local`。
package.json 描述：Local-subprocess implementation of the DeepSeek Harness bash executor seam

<a id="pkg-taskweaver-dsh-bash-local--taskweaver-dsh-bash-local"></a>
Local Service Provider for the `@taskweaver/dsh-shell` executor seam over the [`@taskweaver/dsh-subprocess`](../subprocess/README.zh.md#pkg-taskweaver-dsh-subprocess) service: `LocalBashExecutor` spawns `bash -c <command>` per call as a managed process group through `ctx.subprocess`, and owns everything bash-shaped — command defaulting and caps, timeout/cancel classification, the model-friendly terminal environment, and the model-facing stdout/stderr merge for background reads. Group mechanics (bounded spill-backed output, credential scrub, kill escalation, disposal) are the subprocess service's.

The package root exports the default and named `LocalBashExecutor` plugin plus its `Config`.

<a id="pkg-taskweaver-dsh-bash-local--config"></a>
#### Config

```yaml
- id: bash
  name: '@taskweaver/dsh-bash-local'
  config:
    cwd: /path/to/workspace   # default: process.cwd()
    timeoutMs: 120000          # default foreground timeout
    maxTimeoutMs: 600000       # cap for per-call overrides
    maxOutputBytes: 64000      # per-stream in-memory cap; overflow spills to disk
    maxSpillBytes: 67108864    # per-stream full-output spill cap
    graceMs: 3000              # kill escalation and post-exit pipe-drain grace
```

<a id="pkg-taskweaver-dsh-bash-local--behavior"></a>
#### Behavior

- **Spawn per call, no shell state** — every call is a fresh non-login `bash -c` with no rc files.
- **The composition entry is a layer, not the last word** — when a settings provider is composed, this executor registers the capability's [`bash` namespace](./README.zh.md#pkg-taskweaver-dsh-shell) with the entry above as its base, so a user section in `settings.yaml` layers over it and the next command runs with the new budgets. Values the schema cannot judge (positive and finite, the `graceMs` timer bound) are refused at the write, leaving the running executor on its last good section; without a provider, or after one detaches, the composition entry is what runs.
- **Configured budgets over managed groups** — `resolve()` fills `workdir`/`timeoutMs`/`stdoutMaxBytes` from config, and every spawn hands the service explicit byte caps, spill cap, and `graceMs`. The grace must be positive, finite, and no greater than [`MAX_TIMER_DELAY_MS`](../util/README.zh.md#pkg-taskweaver-dsh-timeout), so Node can represent it with one timer. Process-group kills, post-exit pipe draining, tail retention, and bounded spill files are [`dsh-subprocess-local`](../subprocess/README.zh.md#pkg-taskweaver-dsh-subprocess-local) mechanics. A foreground `ShellExecRequest.stdoutMaxBytes` can raise stdout's capture budget for one trusted caller; stderr and background runs still use `maxOutputBytes`.
- **Timeout and cancel classification** — `run()` fuses its config-clamped timeout with the caller's signal through one deadline; only the executor's own timeout reports `timedOut`, an upstream cancel reports `aborted`, and a self-signaled command reports neither ([timeout-library Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md`）).
- **Model-friendly terminal env** — `NO_COLOR=1 TERM=dumb PAGER=cat GIT_PAGER=cat` prevents pagers and ANSI color from garbling results. These values merge as ordinary env under the service's credential scrub and `TASKWEAVER_*` channel rules; an explicit caller entry still wins. See the [stdin/env Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-api.md`） and [managed environment Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-10-agent-session-identity-and-log-location.md`）.
- **Background processes** — `start()` returns a live `ShellProcess` handle immediately with no timeout, and `readOutput()` merges offset-based stdout/stderr reads into one consuming delta, placing stderr under a `[stderr]` marker when present. A running process belongs to the subprocess service, survives executor reloads, and is killed and joined on service disposal. Job ids, ownership, polling, and notices belong to the generic [`ctx.jobs` runtime](../jobs/README.zh.md#pkg-taskweaver-dsh-jobs), which the tool layer registers the handle with.

<a id="pkg-taskweaver-dsh-bash-local--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-tool-bash`, which renders this executor's bounded stdout/stderr tails, background-process deltas, spill-file paths, and infrastructure failures.

<a id="pkg-taskweaver-dsh-bash-local--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-bash-local--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Unconfined by itself** — this executor always runs commands with the harness process's authority; deployments needing confinement compose [`dsh-bash-sandbox`](./README.zh.md#pkg-taskweaver-dsh-bash-sandbox), while per-call allow/deny/ask policy belongs on `tools/pre-execute`.
- **No persistent shell or PTY** — every call starts a fresh non-login `bash -c`; cwd-only persistence and interactive terminal sessions remain deferred until a real workflow requires them.
- **POSIX-only** — the `bash` binary is hardcoded, and the underlying service's group semantics are POSIX; Windows is unsupported.
- **A background spawn-failure note is single-delivery** — the subprocess service buffers no output for a process that never ran, so the executor injects `spawn failed: …` into exactly one `readOutput()` delta; a reader that discards that delta cannot recover it.

Scrub-heuristic and spill-retention caveats live with [`dsh-subprocess-local`](../subprocess/README.zh.md#pkg-taskweaver-dsh-subprocess-local), which owns those mechanics.

<a id="pkg-taskweaver-dsh-bash-sandbox"></a>
### `@taskweaver/dsh-bash-sandbox`

<!-- migrated-from: packages/runtime/shell/bash-sandbox/README.md -->
目录：`shell/bash-sandbox`。
package.json 描述：Sandbox-consuming implementation of the DeepSeek Harness bash executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts)

<a id="pkg-taskweaver-dsh-bash-sandbox--taskweaver-dsh-bash-sandbox"></a>
Sandbox-consuming Service Provider for the [`@taskweaver/dsh-shell`](./shell) executor seam. Load it **instead of** `@taskweaver/dsh-bash-local`, together with a [`ctx.sandbox`](../sandbox/sandbox) provider (e.g. [`@taskweaver/dsh-sandbox-local`](../sandbox/sandbox-local)) and a [`ctx.sandboxPolicy`](../sandbox/sandbox-policy) (which owns the default mode + workspace root, shared with the sandboxed filesystem) — no alternate tool plugin is needed; `dsh-tool-bash` detects the executor's `sandboxMode` capability and adds the escalation fields.

The package root exports the default and named `SandboxBashExecutor` plugin plus its `Config`; result-classification helpers stay internal.

Every command is confined by handing the provider the exact `['bash', '-c', command]` argv this executor is about to spawn and spawning the returned argv directly. With the shipped native runners, the inner Bash retains shell semantics and evaluates `BASH_ENV` only after the runner establishes confinement. WHICH platform runner confines it — and whether one is usable at all (fail closed with a structured `SANDBOX_UNAVAILABLE` error, never a silent unconfined run) — is the provider's concern; this package owns the bash side only.

| Mode | File effects |
|---|---|
| `read-only` (default) | No writes anywhere (of `/dev`, only the `/dev/null` node is writable, so `>/dev/null` keeps working) |
| `workspace-write` | Writes only under `workspaceRoot` + the backend's temp areas (ephemeral `/tmp` under bwrap; `/private/tmp` plus the per-user temp dir under Seatbelt) |
| `danger-full-access` | No confinement; the provider is never consulted. Foreground results carry `sandbox: { mode, denied: false }`; background process handles carry no sandbox facts. |

Semantics:

- **Denials are result facts.** A failed run whose stderr carries the selected backend's own denial dialect — the signatures the provider stamps on every wrap (EROFS text under bwrap, EPERM under Seatbelt) — is reported as `ShellRunResult.sandbox.denied: true` (conservative classification, read from the collected stderr tail); every CONFINED run also carries the mode it executed under (`result.sandbox.mode`) and the provider's enforcement completeness (`result.sandbox.enforcement`: `full`, or `partial` for the documented Windows ACL boundary).
- **The runner path or syscall must match.** Before a process starts, a rejection is attributed to the runner only when the caller-owned workdir is independently usable and Node reports `ENOENT` or `EACCES` with either an `error.path` equal to provider argv[0] or, when `error.path` is absent, an exact `syscall: 'spawn <runner>'`. A present path also requires `syscall: 'spawn'` or the exact `spawn <runner>`. This covers a missing runner, a non-executable runner, or an executable script whose shebang interpreter is unavailable. A bare `syscall: 'spawn'` without an exact error path, any other code, an invalid or unusable workdir, a resource failure, an unrelated syscall, or an unstructured rejection retains the local executor's command-start failure semantics. Foreground execution throws `SANDBOX_UNAVAILABLE` with the original spawn detail, while asynchronous background settlement stamps `runnerFailed: true` and `denied: false`. If a `SubprocessRuntime` synchronously throws the same runner-identifying `ENOENT`/`EACCES` shape, background start throws `SANDBOX_UNAVAILABLE`; other synchronous errors propagate unchanged. After a process starts, a rule's optional exit-code check and a remaining fatal stderr line must both match after exact informational-line exclusions. A match takes priority over denial; foreground execution throws `SANDBOX_UNAVAILABLE` with the matched fatal line, while a settled background process stamps `process.sandbox.runnerFailed`, which the bash producer renders through generic `job_output`. Confined background handles retain their mode/enforcement facts and release per-process accounting in either path.
- **Deployment fallback, per-call policy.** [`ctx.sandboxPolicy`](../sandbox/sandbox-policy) resolves a complete `SandboxExecutionPolicy` for every tool call: the calling session supplies its mode override and immutable cwd root, while deployment config supplies the fallbacks for agentless calls. An approved escalation changes only that policy's mode; its session root stays attached. `resolve()` carries the policy onto the spec, so overlapping commands from different projects run, classify, and report under their own roots and modes. The capability fact `ctx.shell.sandboxMode` reports the configured default so the tool layer advertises escalation only when this executor is mounted; the static bash tool description separately owns denial and escalation guidance.
- **File effects only.** The mode vocabulary claims only file effects. Network stays unrestricted; process visibility is backend-specific and documented by [`dsh-sandbox-local`](../sandbox/sandbox-local).
- Process mechanics (spawn, process-group kills, output collection/spill, background handles, credential scrub) are inherited from [`dsh-bash-local`](./bash-local); runner selection lives in [`dsh-sandbox-local`](../sandbox/sandbox-local).

Deny-only at the seam: a denial is a reported fact, and this executor never negotiates permissions itself — the approval question lives in the tool layer (`dsh-tool-bash`), which drives the override this package honors.

```yaml
- id: sandbox
  name: '@taskweaver/dsh-sandbox-local'
- id: sandbox-policy
  name: '@taskweaver/dsh-sandbox-policy'
  config:
    mode: read-only
    workspaceRoot: !!js process.cwd() # fallback for calls without a session cwd
- id: bash
  name: '@taskweaver/dsh-bash-sandbox'
```

<a id="pkg-taskweaver-dsh-bash-sandbox--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-bash-sandbox--bash-tool-schema-indirectly"></a>
##### Bash tool schema, indirectly

<a id="pkg-taskweaver-dsh-bash-sandbox--what-the-model-sees"></a>
###### What the model sees

The generated [`dsh-tool-bash` schemas]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-bash`） are the baseline. By advertising a confining `sandboxMode`, this backend augments `bash` with `sandbox_permissions` using enum `workspace-write` | `danger-full-access` and with `justification`. The policy owner separately contributes the current capability-neutral `sandbox:policy` context.

<a id="pkg-taskweaver-dsh-bash-sandbox--token-effect"></a>
###### Token effect

Small fixed schema increment on requests where `bash` is visible, plus the current-policy clause owned by `dsh-sandbox-policy`.

<a id="pkg-taskweaver-dsh-bash-sandbox--kv-cache-effect"></a>
###### KV Cache effect

A standing-policy change appends a complete owner-rendered context snapshot after retained history, preserving the existing system/history prefix byte-for-byte. Changing executor capabilities alters the `bash` schema.

<a id="pkg-taskweaver-dsh-bash-sandbox--bash-tool-result-indirectly"></a>
##### Bash tool result, indirectly

<a id="pkg-taskweaver-dsh-bash-sandbox--what-the-model-sees-1"></a>
###### What the model sees

After ordinary bounded output, a denied call appends exactly `[sandbox: file access denied under <mode> mode]`. When escalation is available it next appends `[sandbox: escalation available — retry this exact command once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`. A settled background runner failure instead appends `[sandbox: the sandbox runner itself failed under <mode> mode — the command did not run; this is a sandbox problem, not a command failure]`.

<a id="pkg-taskweaver-dsh-bash-sandbox--token-effect-1"></a>
###### Token effect

Zero additional tokens on an unremarkable allowed run beyond ordinary output. Denial or failure adds the quoted conditional marker, retained until compaction.

<a id="pkg-taskweaver-dsh-bash-sandbox--kv-cache-effect-1"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-bash-sandbox--bash-tool-error-indirectly"></a>
##### Bash tool error, indirectly

<a id="pkg-taskweaver-dsh-bash-sandbox--what-the-model-sees-2"></a>
###### What the model sees

If no runner can enforce a confined mode, the foreground call propagates the [`SANDBOX_UNAVAILABLE` error owned by `dsh-sandbox`](../sandbox/README.zh.md#pkg-taskweaver-dsh-sandbox--confinement-error-indirectly). A runner-attributable spawn failure supplies the original spawn error as detail; a rejection without `ENOENT`/`EACCES` path or syscall evidence that names argv[0] remains an ordinary command-start error. A settled runner failure supplies the matched fatal stderr line and preserves the original stderr collection. When present, the appended `Runner failure: <detail>` is the authoritative diagnosis; the preceding backend-install text is the generic `SANDBOX_UNAVAILABLE` prefix.

<a id="pkg-taskweaver-dsh-bash-sandbox--token-effect-2"></a>
###### Token effect

Conditional error text is visible for that call and retained in history until compaction.

<a id="pkg-taskweaver-dsh-bash-sandbox--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-bash-sandbox--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Confinement covers file effects only** — network restriction and a uniform process-visibility guarantee are absent, so the modes are not a general-purpose security sandbox.
- **Denials are inferred from failed-command stderr** — backend signatures make the inference portable, but a matching application error can be classified as a denial and a denial omitted from the retained tail can be missed.
- **An asynchronously observed background runner failure has no immediate error channel** — it is recorded on the settled process and surfaces when the caller reads the generic task with `job_output`; a synchronous `SubprocessRuntime` throw that names the runner path instead fails `start()` immediately.
- **`danger-full-access` deliberately bypasses `ctx.sandbox`** — it is an explicit unconfined mode, not a wider sandbox profile.

<a id="pkg-taskweaver-dsh-pwsh-local"></a>
### `@taskweaver/dsh-pwsh-local`

<!-- migrated-from: packages/runtime/shell/pwsh-local/README.md -->
目录：`shell/pwsh-local`。
package.json 描述：Local PowerShell implementation of the DeepSeek Harness bash executor seam

<a id="pkg-taskweaver-dsh-pwsh-local--taskweaver-dsh-pwsh-local"></a>
Local PowerShell Service Provider for the `@taskweaver/dsh-shell` executor seam over the [`@taskweaver/dsh-subprocess`](../subprocess/README.zh.md#pkg-taskweaver-dsh-subprocess) service: `PwshLocalExecutor` spawns `pwsh -NoLogo -NoProfile -NonInteractive -Command <command>` per call as a managed process through `ctx.subprocess`, and owns everything PowerShell-shaped — executable resolution, command defaulting and caps, timeout/cancel classification, the model-friendly terminal environment, and the model-facing stdout/stderr merge for background reads. Group mechanics (bounded spill-backed output, credential scrub, kill escalation, disposal) are the subprocess service's.

The command string rides as ONE argv element to `-Command`: PowerShell itself parses the text, and no intermediate shell exists, so there is no shell-quoting layer to escape (the `bash -c` string domain has no equivalent here). Native Win32 paths (`C:\...`) pass through unchanged.

The package root exports the default and named `PwshLocalExecutor` plugin, its `Config`, the pure `resolvePwshPath`/`candidatePwshPaths` helpers, and the `ENV_OVERRIDES`/`ENCODING_PREAMBLE` constants the executor injects into every spawn.

<a id="pkg-taskweaver-dsh-pwsh-local--config"></a>
#### Config

```yaml
- id: bash
  name: '@taskweaver/dsh-pwsh-local'
  config:
    cwd: C:\path\to\workspace   # default: process.cwd()
    timeoutMs: 120000           # default foreground timeout
    maxTimeoutMs: 600000        # cap for per-call overrides
    maxOutputBytes: 64000       # per-stream in-memory cap; overflow spills to disk
    maxSpillBytes: 67108864     # per-stream full-output spill cap
    graceMs: 3000               # kill escalation and post-exit pipe-drain grace
    pwshPath: C:\Program Files\PowerShell\7\pwsh.exe  # explicit executable; else well-known locations, then PATH
```

<a id="pkg-taskweaver-dsh-pwsh-local--behavior"></a>
#### Behavior

The Windows counterpart of `dsh-bash-local`, deliberately mirroring its semantics call-for-call:

- **Spawn per call, no shell state** — every call is a fresh non-interactive `pwsh -Command` (deterministic; no profile files). The `-NoLogo -NoProfile -NonInteractive` flags disable startup banners, profile loading, and prompts that would garble tool output.
- **The composition entry is a layer, not the last word** — when a settings provider is composed, this executor registers the capability's [`bash` namespace](./README.zh.md#pkg-taskweaver-dsh-shell) with the entry above as its base, so a user section in `settings.yaml` layers over it and the next command runs with the new budgets. The namespace is shared with the POSIX family because a host composes exactly one provider of `ctx.shell`; a document written on either platform keeps resolving on the other. Values the schema cannot judge (positive and finite, the `graceMs` timer bound) are refused at the write, leaving the running executor on its last good section.
- **UTF-8 output pinned** — every command runs with `[Console]::OutputEncoding` and `$OutputEncoding` set to UTF-8 first, so the Windows PowerShell 5.1 fallback (or any host whose console code page is not UTF-8) cannot garble non-ASCII output: the subprocess collector decodes bytes as UTF-8. Input encoding is left at the host default; pwsh 7 defaults to UTF-8 and is unaffected.
- **Executable resolution** — `resolvePwshPath` prefers an explicit `pwshPath`, then on Windows probes PowerShell 7's install location, every PATH entry (Microsoft Store installs; surrounding quotes stripped), and Windows PowerShell 5.1 as a legacy last resort, checking each candidate with an lstat probe that accepts a real file or a link-shaped reparse point (a Store app execution alias stat-fails against its target's ACL, but lstat sees the alias itself); elsewhere it falls back to a bare `pwsh` resolved through PATH. Resolution is a pure function of `(configured, env, platform)`; it runs at construction and again only when a stored `pwshPath` differs from the one the current executable was resolved from, so an unrelated settings change never re-probes the filesystem.
- **Configured budgets over managed groups** — `resolve()` fills `workdir`/`timeoutMs`/`stdoutMaxBytes` from config, and every spawn hands the service explicit byte caps, spill cap, and `graceMs`. The grace must be positive, finite, and no greater than [`MAX_TIMER_DELAY_MS`](../util/README.zh.md#pkg-taskweaver-dsh-timeout), so Node can represent it with one timer. Tree termination (taskkill on Windows, process-group signals on POSIX), the post-exit pipe-drain grace, tail-keep truncation, and bounded spill files are [`dsh-subprocess-local`](../subprocess/README.zh.md#pkg-taskweaver-dsh-subprocess-local) mechanics. A foreground `ShellExecRequest.stdoutMaxBytes` can raise stdout's capture budget for one trusted caller; stderr and background runs still use `maxOutputBytes`.
- **Timeout and cancel classification** — `run()` fuses its config-clamped timeout with the caller's signal through one deadline; only the executor's own timeout reports `timedOut`, an upstream cancel reports `aborted`, and a self-terminated command reports neither ([timeout-library Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md`）). Windows reports forced termination as exit 1 without a signal, so signal-stamped facts (`signal`, `killed` status) are POSIX-only there; the timeout/abort classification is platform-independent.
- **Model-friendly terminal env** — `NO_COLOR=1 PAGER=cat GIT_PAGER=cat` (no `TERM=dumb`: that is a POSIX concept; `NO_COLOR` is honored by modern PowerShell renderers) merged as ordinary env under the service's credential scrub and `TASKWEAVER_*` channel rules; an explicit caller entry still wins.
- **Background processes** — `start()` returns a live `ShellProcess` handle immediately, no timeout applies, and the handle's `readOutput()` merges the service's offset-based stdout/stderr reads into one marked-section delta with a consuming cursor. A still-running process belongs to the subprocess service, so it survives executor reloads and dies (killed and joined) with the service's disposal. Everything task-shaped (ids, ownership, polling, notices) lives in the generic [`ctx.jobs` runtime](../jobs/README.zh.md#pkg-taskweaver-dsh-jobs), which the tool layer registers the handle with — this executor never sees a session or a registry.

<a id="pkg-taskweaver-dsh-pwsh-local--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-tool-pwsh`, which renders this executor's bounded stdout/stderr tails, background-process deltas (through the generic job runtime), spill-file paths, and infrastructure failures.

<a id="pkg-taskweaver-dsh-pwsh-local--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-pwsh-local--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Unconfined by itself** — this executor always runs commands with the harness process's authority; deployments needing confinement compose a sandboxing bash executor or policy instead.
- **No persistent shell or PTY** — every call starts a fresh `pwsh -Command`.
- **The command string is PowerShell text** — the `-Command` domain has no shell-quoting layer, but a model-facing command is parsed by PowerShell itself, so PowerShell syntax errors are command failures, not launch failures.
- **A background spawn-failure note is single-delivery** — the subprocess service buffers no output for a process that never ran, so the executor injects `spawn failed: …` into exactly one `readOutput()` delta; a reader that discards that delta cannot recover it.
- **Windows termination reports no signal** — a force-killed process settles as exit 1 with `signal: null`, so signal-based status classification (POSIX `killed`) does not apply on Windows; `kill()`-initiated stops still stamp `killed` directly.
- **The encoding preamble precedes the command** — PowerShell requires `param(...)`, `#requires`, and `using namespace`/`using assembly` statements at the very top of a script, so a command whose first statement is one of those cannot run under the UTF-8 output preamble. Wrap a `param(...)` script in `& { … }` (a param block legally heads a script block); `using` statements and `#requires` have no in-command workaround (`#requires` is inert inside `-Command` regardless of position) — run such scripts from a file instead.
- **Non-ASCII stdin under Windows PowerShell 5.1 may be mis-decoded** — the preamble pins output encoding only; `[Console]::InputEncoding` stays at the host default because setting it under redirected stdin throws. pwsh 7 defaults to UTF-8 and is unaffected.

Scrub-heuristic and spill-retention caveats live with [`dsh-subprocess-local`](../subprocess/README.zh.md#pkg-taskweaver-dsh-subprocess-local), which owns those mechanics.

<a id="pkg-taskweaver-dsh-pwsh-sandbox"></a>
### `@taskweaver/dsh-pwsh-sandbox`

<!-- migrated-from: packages/runtime/shell/pwsh-sandbox/README.md -->
目录：`shell/pwsh-sandbox`。
package.json 描述：Sandbox-consuming implementation of the DeepSeek Harness PowerShell executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts)

<a id="pkg-taskweaver-dsh-pwsh-sandbox--taskweaver-dsh-pwsh-sandbox"></a>
Sandbox-consuming PowerShell implementation of the [`ctx.shell` executor seam](./shell): every command runs as `pwsh -NoLogo -NoProfile -NonInteractive -Command <command>` **confined through `ctx.sandbox`**, with the selected mode, enforcement, and denial facts stamped on each settled result. The pwsh twin of [`@taskweaver/dsh-bash-sandbox`](./bash-sandbox), a call-for-call mirror per the [pwsh executor and tool decision]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-08-01-pwsh-tool-and-executor.md`） — the confinement substance is platform-neutral: on Windows the sandbox seam resolves to the ACL restricted-token runner chain ([`@taskweaver/dsh-sandbox-windows-acl`](../sandbox/sandbox-windows-acl)), on Linux/macOS to bwrap/Landlock/Seatbelt.

The executor inherits [`@taskweaver/dsh-pwsh-local`](./pwsh-local)'s process mechanics and consumes its argv-level seam (`argv()` / `runArgv()` / `startArgv()` / `onProcessDone()`) to wrap the exact pwsh invocation through the provider. The sandbox policy (mode + workspace root) is NOT this package's config: it rides each call from `ctx.sandboxPolicy` (tool calls pass the calling session's resolved policy; direct calls fall back to deployment policy).

<a id="pkg-taskweaver-dsh-pwsh-sandbox--behavior"></a>
#### Behavior

- `danger-full-access`: commands run through the local executor unchanged; results carry `sandbox: { mode, denied: false }`.
- Confined modes (`read-only`, `workspace-write`): the pwsh argv is wrapped by `ctx.sandbox.confine()`; runner-launch refusal fails closed with `SANDBOX_UNAVAILABLE` (foreground throw, background `runnerFailed` fact), and a denied write classifies against the selected backend's `denialSignatures` into `sandbox.denied`.

<a id="pkg-taskweaver-dsh-pwsh-sandbox--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-pwsh-sandbox--confinement-works-denial-surfaces-as-command-failure"></a>
##### Confinement works, denial surfaces as command failure

<a id="pkg-taskweaver-dsh-pwsh-sandbox--what-the-model-sees"></a>
###### What the model sees

The confined command's own stderr (e.g. `Access to the path '...' is denied.` under the Windows ACL runner); the tool layer converts classified denials into the standard permission-denied surface exactly as it does for the bash tool.

<a id="pkg-taskweaver-dsh-pwsh-sandbox--token-effect"></a>
###### Token effect

No model-visible text beyond the command's stderr and the tool layer's standard denial surface.

<a id="pkg-taskweaver-dsh-pwsh-sandbox--kv-cache-effect"></a>
###### KV Cache effect

None directly; the denial surface belongs to the tool layer.

<a id="pkg-taskweaver-dsh-pwsh-sandbox--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Reads are unrestricted** on Windows (the ACL runner restricts writes only); the read boundary is documented in `@taskweaver/dsh-sandbox-windows-acl`.
- **Windows workspace-write temp authority is private** per live session/workspace pair; agentless calls receive a fresh private directory per invocation. The ambient temp root is never granted, and the runner rewrites TMP/TEMP to the private directory before spawning.
- **Windows read-only grants no explicit writable root but remains partial** because the restricted token must retain Everyone. Objects whose DACL grants Everyone write access — including compatible opens of the NUL device — remain ambient authority; PowerShell's `> $null` redirection still works without opening NUL.

<a id="pkg-taskweaver-dsh-shell"></a>
### `@taskweaver/dsh-shell`

<!-- migrated-from: packages/runtime/shell/shell/README.md -->
目录：`shell/shell`。
package.json 描述：Abstract bash executor seam (ctx.shell) for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-shell--taskweaver-dsh-shell"></a>
The **`ShellExecutor`** (`ctx.shell`) defines WHAT a bash backend does — run foreground commands and start background processes — without saying HOW. Job ids, ownership, collection, cancellation, and notices belong to the generic `ctx.jobs` runtime.

This package owns the Service Definition role of the bash capability, split so each role can evolve (and be swapped) independently:

| Package | Role |
|---|---|
| `@taskweaver/dsh-shell` (this) | Service Definition: abstract service + vocabulary types |
| `@taskweaver/dsh-bash-local` | Service Provider: local subprocesses |
| `@taskweaver/dsh-bash-sandbox` | Service Provider: `dsh-bash-local`'s mechanics with every spawn confined via [`ctx.sandbox`](../sandbox/sandbox), denials reported as result facts |
| `@taskweaver/dsh-tool-bash` | the model-facing tool schemas over `ctx.shell` |

The split is a standard capability seam ([capability-seams Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md`）): `dsh-bash-sandbox` is a sandboxing executor behind the same Service Definition — the Consumer detects its `sandboxMode` capability and adds escalation fields without importing the provider — and a containerized or remote executor slots in the same way.

<a id="pkg-taskweaver-dsh-shell--service-api-ctx-shell"></a>
#### Service API (`ctx.shell`)

| Member | Semantics |
|---|---|
| `run(spec)` | Foreground execution. Resolves when the command finishes. **Rejects only for infrastructure failures** (unusable workdir, missing shell, pre-aborted signal); nonzero exits, timeout kills, and abort kills resolve with a descriptive `ShellRunResult`. |
| `start(spec)` | Background execution. Returns a task-free `ShellProcess` handle immediately; **no timeout applies**. The caller may adapt it into `ctx.jobs`. |
| `sandboxMode` | The capability fact for the tool layer: the default mode a SANDBOXING executor confines under (`undefined` in the base class — "this executor does not sandbox"). `dsh-tool-bash` reads it at registration to advertise the escalation fields only when the composition honors them. |
| `ShellProcess.readOutput()` | **Incremental** output read — consecutive reads never re-deliver. Reads that lost data to buffer bounds flag `lossy` and point at full-stream spill files. |
| `ShellProcess.kill()` | Kill the process group. Returns `false` when it already finished. |

Implementations subclass `ShellExecutor` and implement the abstract methods. Disposal must kill every running process and await its exit.

`SHELL_SETTINGS_NAMESPACE` (`bash`) is exported here rather than by a provider because it names the capability, not an implementation. A host composes exactly one provider of `ctx.shell` — the win32 layer swaps the POSIX rows for the pwsh ones, and mounting both fails loud on a duplicate service registration — so every provider can register this one namespace with its own schema and composition entry without two of them ever colliding, and a `settings.yaml` carried between platforms keeps resolving on both.

<a id="pkg-taskweaver-dsh-shell--vocabulary"></a>
#### Vocabulary

`ShellExecRequest` (command, workdir?, timeoutMs?, stdoutMaxBytes?, signal?, stdin?, env?, dshEnv?, sandboxPolicy?) resolves to `ShellExecSpec` (command, workdir, timeoutMs, stdoutMaxBytes, signal?, stdin?, env?, dshEnv?, sandboxPolicy) before execution. `stdoutMaxBytes` is a trusted foreground-run capture budget for consumers that must parse complete bounded stdout; the model-facing bash tool does not expose it. `sandboxPolicy` is optional on the request and required-but-nullable on the resolved spec: it carries the complete per-call mode and workspace root. The sandbox tool path resolves it from the calling session through `ctx.sandboxPolicy`; a direct sandbox-executor caller falls back to deployment policy, while a non-sandboxing executor carries the field and confines nothing.

The per-session sandbox-mode override vocabulary (the `'sandbox/mode'` event, the `effectiveSandboxMode(events)` fold, and the `setSandboxMode(session, mode)` write path) is NOT here — it is policy state shared by every enforcing family, owned by [`@taskweaver/dsh-sandbox-policy`](../sandbox/sandbox-policy). `run()` returns `ShellRunResult`; `start()` returns `ShellProcess`, whose incremental read and kill methods are adapted by `dsh-tool-bash` into a generic task registration. A sandboxing executor stamps `ShellSandboxInfo` on foreground results and settled process handles. See `src/types.ts` and [subsystems/shell.md]（原文链接目标：`../../../docs/subsystems/shell.md`）.

`stdin` and ordinary `env` are set by in-process plugins (the hooks bridges, native plugins) to feed a hook command its JSON payload and `CLAUDE_PROJECT_DIR`/`CLAUDE_PLUGIN_ROOT` values. `dshEnv` is a separate trusted overlay restricted by type to managed keys; the exported `TASKWEAVER_ENV_PREFIX` is the single source for that namespace, its `DshEnvironmentKey` template type, executor scrubbing, registry validation, derived built-in names, and model guidance. Model bash uses the current snapshot collected by `ctx.shellEnv`. Implementations remove inherited managed keys, then merge `dshEnv` after ordinary `env`, so an omitted current fact cannot fall back to stale ambient state and an `env` entry cannot displace a managed value. The model-facing tool exposes none of these as parameters. All three remain optional on the resolved spec; absent means no input/overlay. See [the bash-stdin-env Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-api.md`） and [the session environment Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-10-agent-session-identity-and-log-location.md`）.

The exported `parseExitStatus` (with `ParsedExitStatus`) is the shared rendering contract half of the shell tools: the inverse of the `[exit code: N]` / `[killed by signal: X]` markers `dsh-tool-bash`'s `renderResult` and `dsh-tool-pwsh`'s `renderPwshResult` append. Both tools' `presentResult` use it to split the rendered text into the terminal card's output body and its exit-status pill; it lives with the Service Definition so the two tools never drift on the marker contract.

<a id="pkg-taskweaver-dsh-shell--model-experience"></a>
#### Model Experience

Indirectly, through `dsh-tool-bash`, which turns executor output and sandbox facts into guidance and retained tool-result tokens.

<a id="pkg-taskweaver-dsh-shell--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-shell--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No interactive-input vocabulary** — `stdin` is written once at spawn and closed; the seam has no channel to feed a running task and no PTY session concept.
- **Foreground timeouts are always executor-owned** — a caller-owned-deadline mode on the seam is explicitly deferred by [the tool-call timeout-policy Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-07-tool-call-timeout-policy.md`）.

<a id="pkg-taskweaver-dsh-shell-env"></a>
### `@taskweaver/dsh-shell-env`

<!-- migrated-from: packages/runtime/shell/shell-env/README.md -->
目录：`shell/shell-env`。
package.json 描述：Tool-independent managed TASKWEAVER_* shell environment registry

<a id="pkg-taskweaver-dsh-shell-env--taskweaver-dsh-shell-env"></a>
The tool-independent shell environment plugin: owns the `ctx.shellEnv` registry of trusted, per-execution `TASKWEAVER_*` variables that the model-facing shell tools (`dsh-tool-bash`, `dsh-tool-pwsh`) collect into every shell call's environment. Built-in shell facts (`TASKWEAVER_HOME`, `TASKWEAVER_SHELL=1`, `TASKWEAVER_SESSION_ID`) are owned by the registry itself; other plugins register additional enumerable facts with effect-scoped disposal, and duplicate ownership or undeclared runtime keys fail loudly.

The package root exports the Cordis plugin contract (`name`, `inject`, `Config`, `apply`) plus the `ShellEnvRegistry` service class and its contributor types; consumers use `ctx.shellEnv` after loading this plugin.

<a id="pkg-taskweaver-dsh-shell-env--config"></a>
#### Config

```yaml
- id: shell-env
  name: '@taskweaver/dsh-shell-env'
  config:
    dshHome: C:\Users\me\.taskweaver\runtime   # default: $TASKWEAVER_HOME, then ~/.taskweaver/runtime
```

<a id="pkg-taskweaver-dsh-shell-env--managed-environment"></a>
#### Managed environment

Every foreground and background model shell call receives a newly collected trusted `TASKWEAVER_*` environment. `TASKWEAVER_HOME` is the absolute TaskWeaver runtime home resolved by [`@taskweaver/dsh-home-paths`](../util/README.zh.md#pkg-taskweaver-dsh-home-paths) (`dshHome` config, then ambient `$TASKWEAVER_HOME`, then `~/.taskweaver/runtime`) and `TASKWEAVER_SHELL=1` identifies the managed child. Agent calls additionally receive `TASKWEAVER_SESSION_ID=agent.session.header.id`; when the active persistence seam locates a JSONL artifact they also receive `TASKWEAVER_SESSION_JSONL=<absolute target path>`. The JSONL path is a location hint: it may not exist before the first flush or contain the current buffered turn, and it is not an authorization credential.

`ctx.shellEnv` owns collection. Other plugins can register an effect-scoped contributor with a stable name, declared keys/descriptions, and `resolve(execution: ToolExecution)`; duplicate ownership and undeclared runtime keys fail loudly, while `list()` enumerates declarations without executing providers. Harness built-ins reserve `TASKWEAVER_HOME`, `TASKWEAVER_SHELL`, and `TASKWEAVER_SESSION_ID`; this plugin's persistence translator owns `TASKWEAVER_SESSION_JSONL` by reading the backend-neutral `sessionPersistence.locate()` seam.

```ts
import type { Context } from '@taskweaver/cordis'
import type {} from '@taskweaver/dsh-shell-env'

export const inject = ['shellEnv']

export function apply(ctx: Context): void {
  ctx.shellEnv.register({
    name: 'deployment-region',
    variables: { TASKWEAVER_DEPLOYMENT_REGION: { description: 'Current deployment region.' } },
    resolve: execution => execution.agent === undefined ? {} : { TASKWEAVER_DEPLOYMENT_REGION: 'cn-north' },
  })
}
```

The overlay is computed from the current `ToolExecution` and passed through the dedicated `ShellExecRequest.dshEnv` channel. The local executors remove all inherited `TASKWEAVER_*` before merging that snapshot, so nested harnesses and concurrent parent/child agents cannot leak stale identities. `process.env` is never modified. The shell tools' descriptions teach the generic `$TASKWEAVER_*` convention rather than naming persistence-specific variables or adding a permanent system-prompt section.

<a id="pkg-taskweaver-dsh-shell-env--model-experience"></a>
#### Model Experience

Indirectly, through the shell tools (`dsh-tool-bash`, `dsh-tool-pwsh`), which collect this registry's managed `TASKWEAVER_*` snapshot into every shell-tool call.

<a id="pkg-taskweaver-dsh-shell-env--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

<a id="pkg-taskweaver-dsh-shell-env--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **`list()` enumerates contributor-declared variables only** — registry-owned built-ins (`TASKWEAVER_HOME`, `TASKWEAVER_SHELL`, `TASKWEAVER_SESSION_ID`) are not included, so diagnostics, prompt, or UI code must not treat `list()` as an exhaustive environment catalog.

<a id="pkg-taskweaver-dsh-tool-bash"></a>
### `@taskweaver/dsh-tool-bash`

<!-- migrated-from: packages/runtime/shell/tool-bash/README.md -->
目录：`shell/tool-bash`。
package.json 描述：Model-facing bash tool with optional generic background-job and sandbox-escalation support

<a id="pkg-taskweaver-dsh-tool-bash--taskweaver-dsh-tool-bash"></a>
The model-facing `bash` tool registered over the `ctx.shell` executor seam. Foreground execution stays behind that seam; a background process handle is registered with the generic `ctx.jobs` runtime and controlled through `job_output`, `job_list`, and `job_kill` from `@taskweaver/dsh-tool-jobs`.

Requires a loaded executor Service Provider (e.g. `@taskweaver/dsh-bash-local`) and the [`@taskweaver/dsh-shell-env`](./README.zh.md#pkg-taskweaver-dsh-shell-env) registry; the plugin stays pending until every injected service exists (`inject: ['tools', 'bash', 'systemPrompt', 'bashEnv']`). The tool contract is bash-dialect — mount a bash-parsing executor.

The package root exposes only the Cordis plugin contract (`name`, `inject`, `Config`, `apply`); result rendering and background-process adaptation remain package-internal.

The plugin also contributes the `tool:bash` prompt section (order 105): check the `[exit code: N]` marker on every result and investigate failures before moving on.

<a id="pkg-taskweaver-dsh-tool-bash--tools"></a>
#### Tools

<a id="pkg-taskweaver-dsh-tool-bash--bash"></a>
##### `bash`

| Arg | Type | Notes |
|---|---|---|
| `command` | string (required) | Run via `bash -c`. No state persists between calls — use `workdir`, not `cd`. |
| `description` | string (required) | One-line, active-voice summary of the command (5-10 words), for UI/log display only — no effect on execution. |
| `timeoutMs` | number | Timeout override in milliseconds. The executor applies its configured default and cap. |
| `workdir` | string | Working directory for this call. Defaults to the filesystem identity of the calling agent's session cwd (`session.header.cwd`) so each session runs in its own workspace; a relative `workdir` is resolved against that same identity. |
| `run_in_background` | boolean | Return a job id immediately; no timeout applies. |
| `sandbox_permissions` | string enum | ADVERTISED ONLY when the mounted executor sandboxes (`ctx.shell.sandboxMode` reports a confining default): the wider mode a denied command needs, from the closed target vocabulary `workspace-write`/`danger-full-access` (never cut down to the executor's default — the effective mode is per-session; strict widening is checked at execution against it, and a non-widening request fails without prompting anyone). |
| `justification` | string | Required together with `sandbox_permissions` (each without the other is a validation error): one sentence for the user explaining why this exact command needs the wider access. |

`command`, `workdir`, and `timeoutMs` are resolved against the executor's config defaults via `ctx.shell.resolve()` before execution, so the Service Definition (`ShellExecSpec`) receives explicit `workdir`/`timeoutMs` values. The workdir default is applied in the tool layer from the calling agent's `session.header.cwd` BEFORE `resolve()` — the per-session cwd must come from `exec.agent`, since N sessions share one executor; only when no session cwd is available does the executor fall back to its own config / `process.cwd()`. When sandbox policy is present, the tool reuses its already-canonical `workspaceRoot` as the workdir base so confinement and process launch cannot resolve the same session spelling differently.

<a id="pkg-taskweaver-dsh-tool-bash--managed-shell-environment"></a>
##### Managed shell environment

Every foreground and background model bash call receives a freshly collected trusted `TASKWEAVER_*` environment through the shared [`dsh-shell-env`](./README.zh.md#pkg-taskweaver-dsh-shell-env) registry: `TASKWEAVER_HOME` (the absolute Harness home), `TASKWEAVER_SHELL=1`, the agent's `TASKWEAVER_SESSION_ID`, and `TASKWEAVER_SESSION_JSONL` when the active persistence backend locates one. The registry contract — contributor registration, loud duplicate/undeclared-key failure, the built-in reservations, and the contributor example — lives in that package's README. The snapshot passes through the dedicated `ShellExecRequest.dshEnv` channel; the local executor removes all inherited `TASKWEAVER_*` before merging it, so nested harnesses and concurrent parent/child agents cannot leak stale identities, and `process.env` is never modified. The tool description teaches the generic `$TASKWEAVER_*` convention rather than naming persistence-specific variables or adding a permanent system-prompt section.

Result text contains stdout, an optional `[stderr]` section, then applicable sandbox-denial, timeout, signal, exit-code, and truncation markers. Timeout is reported independently of final exit status; nonzero exit remains a model-interpreted result rather than `isError`. Truncation links a safe complete spill file or reports it unavailable. Only infrastructure failures such as spawn errors and aborts produce `isError`.

The canonical success is `{ kind: 'foreground', ...ShellRunResult }` for a completed foreground process or `{ kind: 'background', jobId }` for a published task. The Native renderer preserves the text above, including exactly `started background job <id>`; programmatic consumers use the typed fields without parsing those strings. Executor stream caps remain acquisition limits on `ShellRunResult` and carry their spill paths.

When `run_in_background` is true, this plugin preflights `ctx.jobs.start()` before spawning, registers the calling agent as owner, and adapts the returned `ShellProcess` handle into generic cancel/done/incremental-output hooks. The job runtime owns ids, cross-session isolation, completion notices, waiting, and disposal cleanup; this plugin only maps bash exit/sandbox facts into job output and outcome detail. `enableRunInBackground: false` removes the parameter and rejects a forced background call at execution time.

<a id="pkg-taskweaver-dsh-tool-bash--ui-presentation"></a>
#### UI presentation

The tool owns its `presentCall`/`presentResult` render intent. A foreground call is a terminal card carrying command, description, cwd, output, and parsed exit status. Because the card shows the exit as its own pill, the `[exit code: N]` / `[killed by signal: …]` marker the parse consumes leaves the output; every other marker (truncation, timeout, sandbox) stays in it. A background start is a generic execute card because it returns only a job id; the generic `job_*` tools own their own cards. These presenters are pure and replay-safe.

<a id="pkg-taskweaver-dsh-tool-bash--the-tool-builds-its-request-from-named-args-only"></a>
#### The tool builds its request from named args only

`ShellExecRequest` carries optional `stdoutMaxBytes`, `stdin`, ordinary `env`, and managed `dshEnv`, used by trusted in-process plugins and this tool's environment registry. The model-facing tool exposes none of `stdoutMaxBytes`, `stdin`, or `env`: it builds requests from named command/workdir/timeout/signal/sandbox fields plus the registry-collected `dshEnv`. Extra model keys are ignored and cannot replace managed values. Shell syntax provides equivalent command-level behavior, while the local executor scrubs ambient credentials and stale `TASKWEAVER_*` values. See the [stdin/env Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-api.md`）.

<a id="pkg-taskweaver-dsh-tool-bash--permissions-and-escalation"></a>
#### Permissions and escalation

Commands run with the executor's full authority unless a sandboxing executor ([`dsh-bash-sandbox`](./bash-sandbox)) confines them — the deny-only sandbox reports denials as result facts, rendered here as the denial marker; per-call allow/deny/ask policy is the `tools/pre-execute` waterfall (see docs/architecture.md).

Escalating bash calls resolve `ctx.approval` before execution. `allowed-once` applies the requested mode only to that call; rejection, cancellation, unavailability, or missing approval context executes nothing and returns a distinct error. On a real denial, the model may retry the same command once in the same turn with the narrowest sufficient mode and justification; the approval prompt itself is the consent step. Escalation is never speculative, and a disabled or rejected approval is final. The [sandbox Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md`） owns the rationale.

<a id="pkg-taskweaver-dsh-tool-bash--per-session-mode-switching"></a>
#### Per-session mode switching

For sandboxing executors, each call resolves mode as one-shot escalation, then session override, then executor default. Non-sandboxing and agent-less calls carry no session override. The policy owner contributes the current capability-neutral standing mode; denial results still own the operation-specific effective mode and retry guidance. See the [`dsh-shell` fold](./README.zh.md#pkg-taskweaver-dsh-shell) and [sandbox switching contract]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md`）.

<a id="pkg-taskweaver-dsh-tool-bash--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-bash--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-tool-bash--what-the-model-sees"></a>
###### What the model sees

Every request in this plugin's registration scope contains the bash guidance below. The policy owner contributes current sandbox state through its cache-safe runtime context rather than changing this section. Scoped tool restrictions can hide the schemas without removing this independently registered section.

<a id="pkg-taskweaver-dsh-tool-bash--bash-guidance"></a>
###### Bash guidance

```markdown
Check the [exit code: N] marker on every bash result; investigate failures before moving on.
```

<a id="pkg-taskweaver-dsh-tool-bash--token-effect"></a>
###### Token effect

Small fixed input cost per request while the plugin is active, unchanged by sandbox mode or mode switches.

<a id="pkg-taskweaver-dsh-tool-bash--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the registration scope and prompt text are unchanged. Plugin activation or disposal may invalidate reuse from this prompt section; sandbox mode switches do not.

<a id="pkg-taskweaver-dsh-tool-bash--tool-schemas"></a>
##### Tool schemas

<a id="pkg-taskweaver-dsh-tool-bash--what-the-model-sees-1"></a>
###### What the model sees

The model sees the generated [`bash` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-bash`）. `run_in_background` appears only when this producer enables it; `sandbox_permissions` and `justification` appear only when the mounted executor advertises sandboxing. Agent-scoped tool restrictions can remove the definition for that agent.

<a id="pkg-taskweaver-dsh-tool-bash--token-effect-1"></a>
###### Token effect

Fixed schema cost on every request where the tools are visible; sandbox support adds the escalation fields and its conditional description paragraph.

<a id="pkg-taskweaver-dsh-tool-bash--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while visibility, background support, and executor sandbox capabilities are unchanged. A restriction, config change, or executor change may invalidate reuse from the first changed tool definition.

<a id="pkg-taskweaver-dsh-tool-bash--foreground-result"></a>
##### Foreground result

<a id="pkg-taskweaver-dsh-tool-bash--what-the-model-sees-2"></a>
###### What the model sees

The renderer emits the data-dependent stdout tail, then optional `[stderr]` and the stderr tail. With no output it emits exactly `(no output)`. Conditional lines are exactly `[output truncated; full output: <path-or-(unavailable)>]`, `[sandbox: file access denied under <mode> mode]`, `[timed out after <timeoutMs>ms]`, `[killed by signal: <signal>]`, and `[exit code: <exitCode>]`; the sandbox escalation and runner-failure lines are quoted in [`dsh-bash-sandbox`](./README.zh.md#pkg-taskweaver-dsh-bash-sandbox).

<a id="pkg-taskweaver-dsh-tool-bash--token-effect-2"></a>
###### Token effect

Zero result tokens before a call. Output is bounded per stream, while each emitted line remains in history until compaction.

<a id="pkg-taskweaver-dsh-tool-bash--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-bash--background-job-context-and-results"></a>
##### Background job context and results

<a id="pkg-taskweaver-dsh-tool-bash--what-the-model-sees-3"></a>
###### What the model sees

Start returns exactly `started background job <jobId>`. This producer supplies incremental process output, optional `[some output was dropped from memory; full output: <paths-or-(unavailable)>]`, sandbox facts, and terminal detail such as `exit code: <exitCode>` or `signal: <signal>` to the generic job runtime. [`dsh-tool-jobs`](../jobs/README.zh.md#pkg-taskweaver-dsh-tool-jobs) owns the visible status line, completion notice, listing, and cancellation response.

<a id="pkg-taskweaver-dsh-tool-bash--token-effect-3"></a>
###### Token effect

The start acknowledgement is small and retained; collected output is data-dependent and bounded by the executor's stream buffers. Consuming reads do not repeat prior output.

<a id="pkg-taskweaver-dsh-tool-bash--kv-cache-effect-3"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-bash--tool-errors"></a>
##### Tool errors

<a id="pkg-taskweaver-dsh-tool-bash--what-the-model-sees-4"></a>
###### What the model sees

Validation and policy failures are normalized as `Error: <message>`. This package's stable messages are `invalid command: expected a non-empty string`, `invalid description: expected a non-empty string`, `invalid timeoutMs: expected a positive number, got <value>`, `invalid escalation: sandbox_permissions requires a justification`, `invalid escalation: justification is only valid together with sandbox_permissions`, `invalid justification: expected a non-empty sentence`, `background execution is disabled for this bash tool`, `background jobs unavailable: load @taskweaver/dsh-jobs and @taskweaver/dsh-tool-jobs`, `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`, `sandbox escalation to "<mode>" is not strictly wider than this call's current "<mode>" mode`, the approval-availability/rejection/cancellation variants, and `tool call aborted`.

<a id="pkg-taskweaver-dsh-tool-bash--token-effect-4"></a>
###### Token effect

Only the failing call adds these retained tokens; a rejected escalation does not add command output because the command does not run.

<a id="pkg-taskweaver-dsh-tool-bash--kv-cache-effect-4"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-bash--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Replay exit pills parse from result text** — output whose final line happens to be exactly `[exit code: N]` / `[killed by signal: …]` shows a wrong pill on session replay and loses that line from the card body, because the parse treats it as the marker it consumes; a display-only known residual.
- **The `bash` tool opts out of `timeout-policy` budgets** — it keeps the executor-owned `BASH_TIMEOUT` path, per [the tool-call timeout-policy Agent Note]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-07-07-tool-call-timeout-policy.md`）.
- **Background processes have no executor timeout** — callers must use `job_kill`, or rely on owner/service disposal, when work no longer matters.

<a id="pkg-taskweaver-dsh-tool-pwsh"></a>
### `@taskweaver/dsh-tool-pwsh`

<!-- migrated-from: packages/runtime/shell/tool-pwsh/README.md -->
目录：`shell/tool-pwsh`。
package.json 描述：Model-facing pwsh tool over the bash executor seam

<a id="pkg-taskweaver-dsh-tool-pwsh--taskweaver-dsh-tool-pwsh"></a>
The model-facing `pwsh` tool registered over the `ctx.shell` executor seam. Intended for Windows compositions where a PowerShell executor (e.g. `@taskweaver/dsh-pwsh-local`) backs `ctx.shell`; the tool contract is PowerShell-dialect: native `C:\...` paths and `$env:NAME` variables. Behavior mirrors `dsh-tool-bash` call-for-call — foreground and `run_in_background` execution through the generic job runtime, the managed `TASKWEAVER_*` environment through the shared `shell-env` registry, the sandbox denial rendering with the same-turn `sandbox_permissions` escalation surface, and the bash marker/truncation rendering story (a clean exit produces no marker).

Requires a loaded executor implementation and the `shell-env` plugin; the tool stays pending until both exist (`inject: ['tools', 'bash', 'systemPrompt', 'bashEnv']`).

The package root exposes only the Cordis plugin contract (`name`, `inject`, `Config`, `apply`); result rendering (`src/render.ts`) and background-job adaptation (`src/background.ts`) mirror the bash tool's structure and stay reachable through the package's `./src/*` export.

The plugin also contributes the `tool:pwsh` prompt section (order 105): non-zero exits are reported as `[exit code: N]` markers, and Windows interruption settles as exit 1 without a signal marker.

<a id="pkg-taskweaver-dsh-tool-pwsh--tools"></a>
#### Tools

<a id="pkg-taskweaver-dsh-tool-pwsh--pwsh"></a>
##### `pwsh`

| Arg | Type | Notes |
|---|---|---|
| `command` | string (required) | Run via `pwsh -Command`. No state persists between calls — use `workdir`, not `cd`. |
| `description` | string (required) | One-line, active-voice summary of the command (5-10 words), for UI/log display only — no effect on execution. |
| `timeoutMs` | number | Timeout override in milliseconds. The executor applies its configured default and cap. |
| `workdir` | string | Working directory for this call. Defaults to the calling agent's session cwd (`session.header.cwd`) so each session runs in its own workspace; a relative `workdir` is resolved against that same identity. |
| `run_in_background` | boolean | Return a job id immediately; no timeout applies. |
| `sandbox_permissions` | string enum | Advertised only when a sandboxing executor is mounted (`ctx.shell.sandboxMode` defined). The wider sandbox mode for a one-shot retry of a command the sandbox just denied — the narrowest wider mode that suffices, requiring `justification` and user approval through `ctx.approval` BEFORE execution. A non-widening or unapprovable request fails closed without running anything. |
| `justification` | string | Required with `sandbox_permissions`: one sentence for the user explaining why this exact command needs the wider access. |

`command`, `workdir`, and `timeoutMs` are resolved against the executor's config defaults via `ctx.shell.resolve()` before execution. The workdir default is applied in the tool layer from the calling agent's `session.header.cwd` BEFORE `resolve()` — the per-session cwd must come from `exec.agent`, since N sessions share one executor; only when no session cwd is available does the executor fall back to its own config / `process.cwd()`.

<a id="pkg-taskweaver-dsh-tool-pwsh--managed-shell-environment"></a>
##### Managed shell environment

Every foreground and background model pwsh call receives a freshly collected trusted `TASKWEAVER_*` environment through the shared [`dsh-shell-env`](./shell-env) registry: `TASKWEAVER_HOME` (the absolute Harness home), `TASKWEAVER_SHELL=1`, the agent's `TASKWEAVER_SESSION_ID`, and `TASKWEAVER_SESSION_JSONL` when the active persistence backend locates one. Plugins contributing `TASKWEAVER_*` facts to `ctx.shellEnv` apply to pwsh calls exactly as they do to bash calls. The snapshot passes through the dedicated `ShellExecRequest.dshEnv` channel; `process.env` is never modified. The description teaches the generic `$env:TASKWEAVER_*` convention rather than naming persistence-specific variables.

Result text contains stdout, an optional `[stderr]` section, then applicable truncation, sandbox-denial (with the same-turn escalation hint when the composition advertises escalation), timeout, signal, and exit markers. A clean exit (0, no signal) produces no marker; an empty body renders as `(no output)`. Truncation links a safe complete spill file or reports it unavailable. Timeout is reported independently of final exit status; nonzero exit remains a model-interpreted result rather than `isError`. Windows reports forced termination as exit 1 without a signal, so `[killed by signal: …]` is POSIX-only there. Only infrastructure failures — spawn errors and aborts (`tool call aborted`) — produce `isError`.

The canonical success is `{ kind: 'foreground', ...ShellRunResult }` for a completed foreground process (with the executor's `sandbox` facts — `mode`/`denied`, optional `enforcement`/`runnerFailed` — projected when present) or `{ kind: 'background', jobId }` for a published task. The renderer preserves exactly `started background job <id>` for background acks; programmatic consumers use the typed fields without parsing the rendered text.

When `run_in_background` is true, this plugin preflights `ctx.jobs.start()` before spawning, registers the calling agent as owner, and adapts the returned `ShellProcess` handle into generic cancel/done/incremental-output hooks. The job runtime owns ids, cross-session isolation, completion notices, waiting, and disposal cleanup; this plugin only maps pwsh exit facts into job output and outcome detail. `enableRunInBackground: false` removes the parameter and rejects a forced background call at execution time.

<a id="pkg-taskweaver-dsh-tool-pwsh--ui-presentation"></a>
#### UI presentation

The tool owns its `presentCall`/`presentResult` render intent. A foreground call is a `terminal` card carrying command, description, and optional cwd; a `run_in_background` call is a `generic` card with the raw command, mirroring the bash tool's background presentation. A completed foreground result is a `terminal` card too: the exit marker becomes the card's exit-status pill (`exitCode`/`signal`), and the marker-free body is the card's output — exactly the bash tool's terminal-card story, via the shared exit-status parse from `@taskweaver/dsh-shell`. Background acks and execution errors stay `generic` cards with the rendered output in a `console` fence. These presenters are pure and replay-safe.

<a id="pkg-taskweaver-dsh-tool-pwsh--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-tool-pwsh--system-prompt"></a>
##### System prompt

<a id="pkg-taskweaver-dsh-tool-pwsh--what-the-model-sees"></a>
###### What the model sees

Every request in this plugin's registration scope contains the pwsh guidance below. Scoped tool restrictions can hide the schema without removing this independently registered section.

<a id="pkg-taskweaver-dsh-tool-pwsh--pwsh-guidance"></a>
###### Pwsh guidance

```markdown
Non-zero exits are reported as `[exit code: N]` markers; investigate failures before moving on. On Windows a killed process settles as `[exit code: 1]` without a signal marker; treat a bare exit 1 after an interruption as a termination, not a command failure.
```

<a id="pkg-taskweaver-dsh-tool-pwsh--token-effect"></a>
###### Token effect

Small fixed input cost per request while the plugin is active.

<a id="pkg-taskweaver-dsh-tool-pwsh--kv-cache-effect"></a>
###### KV Cache effect

Prefix-stable while the registration scope and prompt text are unchanged. Plugin activation or disposal may invalidate reuse from this prompt section.

<a id="pkg-taskweaver-dsh-tool-pwsh--tool-schemas"></a>
##### Tool schemas

<a id="pkg-taskweaver-dsh-tool-pwsh--what-the-model-sees-1"></a>
###### What the model sees

The model sees the generated [`pwsh` schema]（原文链接目标：`../../../docs/tool-catalog.md#deepseek-aidsh-tool-pwsh`）. Agent-scoped tool restrictions can remove the definition for that agent.

<a id="pkg-taskweaver-dsh-tool-pwsh--token-effect-1"></a>
###### Token effect

Fixed schema cost on every request where the tool is visible.

<a id="pkg-taskweaver-dsh-tool-pwsh--kv-cache-effect-1"></a>
###### KV Cache effect

Prefix-stable while visibility and the tool definition are unchanged. A restriction or config change may invalidate reuse from the first changed token.

<a id="pkg-taskweaver-dsh-tool-pwsh--foreground-result"></a>
##### Foreground result

<a id="pkg-taskweaver-dsh-tool-pwsh--what-the-model-sees-2"></a>
###### What the model sees

The renderer emits the data-dependent stdout tail, then optional `[stderr]` and the stderr tail. Conditional lines are exactly `[output truncated; full output: <path>]`, `[sandbox: file access denied under <mode> mode]` plus the escalation hint `[sandbox: escalation available — …]` (only when the composition advertises escalation), `[timed out after <timeoutMs>ms]`, `[killed by signal: <signal>]`, and `[exit code: <exitCode>]` (nonzero exits only); an empty body renders as `(no output)`.

<a id="pkg-taskweaver-dsh-tool-pwsh--token-effect-2"></a>
###### Token effect

Zero result tokens before a call. Output is bounded per stream, while each emitted line remains in history until compaction.

<a id="pkg-taskweaver-dsh-tool-pwsh--kv-cache-effect-2"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-pwsh--background-result"></a>
##### Background result

<a id="pkg-taskweaver-dsh-tool-pwsh--what-the-model-sees-3"></a>
###### What the model sees

A background start renders exactly `started background job <id>`; subsequent reads and status flow through the generic `job_output`/`job_kill` tools, including the lossy-read spill notice when in-memory truncation dropped unread bytes.

<a id="pkg-taskweaver-dsh-tool-pwsh--token-effect-3"></a>
###### Token effect

The ack is a fixed short line; job output is bounded per read.

<a id="pkg-taskweaver-dsh-tool-pwsh--kv-cache-effect-3"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-pwsh--tool-errors"></a>
##### Tool errors

<a id="pkg-taskweaver-dsh-tool-pwsh--what-the-model-sees-4"></a>
###### What the model sees

Validation and infrastructure failures are normalized as `Error: <message>`. This package's stable messages are `invalid command: expected a non-empty string`, `invalid description: expected a non-empty string`, `invalid timeoutMs: expected a positive number, got <value>`, `invalid escalation: sandbox_permissions requires a justification`, `invalid escalation: justification is only valid together with sandbox_permissions`, `invalid justification: expected a non-empty sentence`, `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`, the shared escalation failures (not strictly wider / no approval service / no agent to route / no approval channel / user rejected / was cancelled), `run_in_background is disabled for this deployment (enableRunInBackground: false)`, `background jobs unavailable: load @taskweaver/dsh-jobs and @taskweaver/dsh-tool-jobs`, and `tool call aborted`.

<a id="pkg-taskweaver-dsh-tool-pwsh--token-effect-4"></a>
###### Token effect

Only the failing call adds these retained tokens; an aborted call adds no command output.

<a id="pkg-taskweaver-dsh-tool-pwsh--kv-cache-effect-4"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-tool-pwsh--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Language mode and named-pipe capture under the Windows sandbox** — under the [Windows ACL sandbox](../sandbox/README.zh.md#pkg-taskweaver-dsh-sandbox-windows-acl), read-only pwsh starts in ConstrainedLanguage because its temp write denial makes PowerShell's AppLocker probe fail closed: `Add-Type`, non-core .NET statics (`[System.IO.*]::`, `[math]::`), COM objects, and reflection fail with "only core types" errors, and the mode cannot be lifted from inside. Workspace-write's private temp lets the probe complete, so it stays in FullLanguage unless host policy says otherwise. Both confined modes deny named-pipe opens, so a piped-stdio spawn inside a confined command fails with EPERM. The tool description teaches both contracts to the model; the backend README owns the full limitations.
- **No persistent shell** — every call starts a fresh `pwsh -Command`; the persistent-shell counterpart is [`@taskweaver/dsh-tool-pwsh-persistent`]（原文链接目标：`../tool-pwsh-persistent/README.md`）, which keeps one owner-scoped pwsh alive across calls on Windows (ConPTY) and POSIX hosts with pwsh.
- **PowerShell-dialect contract** — the model must write PowerShell (native paths, `$env:` variables), not bash; there is no dialect translation.
- **Session-cwd identity is not canonicalized** — the workdir base is the session header cwd as-is, unlike the bash tool's sandbox-root-canonicalized identity. Under a confining executor the policy's workspace root IS canonicalized (by the shared policy service), so the workdir and the confinement root can diverge when the raw session cwd differs from its canonical form — a parity gap deferred to the shared shell-tool base extraction.

<a id="family-shell"></a>
### 原族级说明（迁移保留）

<a id="family-shell--shell-bash-capability-family"></a>
The capability family spans the canonical executor seam, its implementations, the shared shell environment, and the model-facing tools. All are **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`shell/`](./README.zh.md#pkg-taskweaver-dsh-shell) | Defines the executor contract shared by Service Providers and Consumers. | `ctx.shell` |
| [`bash-local/`](./README.zh.md#pkg-taskweaver-dsh-bash-local) | Executes commands through the local [`subprocess`](../subprocess/README.zh.md#family-subprocess) service. | (registers `ctx.shell`) |
| [`bash-sandbox/`](./README.zh.md#pkg-taskweaver-dsh-bash-sandbox) | Applies the configured [`sandbox`](../sandbox/README.zh.md#family-sandbox) backend before local execution. | (registers `ctx.shell`) |
| [`pwsh-local/`](./README.zh.md#pkg-taskweaver-dsh-pwsh-local) | Executes PowerShell commands with Windows-specific process behavior. | (registers `ctx.shell`) |
| [`shell-env/`](./README.zh.md#pkg-taskweaver-dsh-shell-env) | Provides the managed `TASKWEAVER_*` environment shared by shell tools. | `ctx.shellEnv` |
| [`tool-bash/`](./README.zh.md#pkg-taskweaver-dsh-tool-bash) | Exposes Bash execution and background-job integration to the model. | (registers on `ctx.tools`) |
| [`tool-pwsh/`](./README.zh.md#pkg-taskweaver-dsh-tool-pwsh) | Exposes PowerShell execution to the model. | (registers on `ctx.tools`) |

A leaf `cordis.yml` selects one executor implementation and the model-facing tools it needs. A sandboxed composition also selects a `ctx.sandbox` provider; the [ACP example]（原文链接目标：`../../examples/acp-agent/`） shows one complete wiring.

The subsystem reference — request/spec vocabulary, results, background processes, the service, and events — is [docs/subsystems/shell.md]（原文链接目标：`../../docs/subsystems/shell.md`）.
