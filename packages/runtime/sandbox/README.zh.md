# sandbox 包族

<a id="family-sandbox"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义进程执行隔离策略，并提供本机沙箱后端。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-sandbox`](#pkg-taskweaver-dsh-sandbox) | `sandbox/sandbox` | [接口与限制](#pkg-taskweaver-dsh-sandbox) |
| [`@taskweaver/dsh-sandbox-local`](#pkg-taskweaver-dsh-sandbox-local) | `sandbox/sandbox-local` | [接口与限制](#pkg-taskweaver-dsh-sandbox-local) |
| [`@taskweaver/dsh-sandbox-policy`](#pkg-taskweaver-dsh-sandbox-policy) | `sandbox/sandbox-policy` | [接口与限制](#pkg-taskweaver-dsh-sandbox-policy) |
| [`@taskweaver/dsh-sandbox-windows-acl`](#pkg-taskweaver-dsh-sandbox-windows-acl) | `sandbox/sandbox-windows-acl` | [接口与限制](#pkg-taskweaver-dsh-sandbox-windows-acl) |
| [`@taskweaver/node-addon-landlock-run`](#pkg-taskweaver-node-addon-landlock-run) | `sandbox/node-addon-landlock-run` | [接口与限制](#pkg-taskweaver-node-addon-landlock-run) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-node-addon-landlock-run"></a>
### `@taskweaver/node-addon-landlock-run`

目录：`sandbox/node-addon-landlock-run`。

TaskWeaver Host 部署闭包中的 **Landlock 启动器占位包**：满足 `dsh-sandbox-local` 对 `@taskweaver/node-addon-landlock-run` 的依赖解析。在 macOS 与多数 CI 环境中实际走 `PATH` 上的 `landlock-run` / Seatbelt 回退，不捆绑原生 addon。导出为 ESM `index.mjs`，供 pnpm deploy 与打包冒烟使用。

<a id="pkg-taskweaver-dsh-sandbox"></a>
### `@taskweaver/dsh-sandbox`

<!-- migrated-from: packages/runtime/sandbox/sandbox/README.md -->
目录：`sandbox/sandbox`。
package.json 描述：Abstract process-sandbox seam (ctx.sandbox) for the DeepSeek Harness: same-world confinement vocabulary and the SandboxProvider contract

<a id="pkg-taskweaver-dsh-sandbox--taskweaver-dsh-sandbox"></a>
Process-sandbox Service Definition. Owns the `ctx.sandbox` service contract ([`SandboxProvider`](./sandbox/src/index.ts)) and the confinement vocabulary the harness shares: `SandboxMode` (`read-only` / `workspace-write` / `danger-full-access`, file effects only), `SandboxEnforcement` (`full` / `partial`, per kernel ABI), `SandboxExecutionPolicy` (the complete per-call mode + workspace root), `SandboxPolicy` (its confined subset), and the fail-closed `SANDBOX_UNAVAILABLE` error. As the Service Definition role of the [capability-seam split]（原文链接目标：`../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md`）, it depends only on cordis (+ the harness error base), never on a backend.

The contract in one line: `ctx.sandbox.confine(argv, policy)` returns the argv to spawn INSTEAD of your own — wrapped so the process (and everything it spawns) runs confined — plus the selected backend's enforcement completeness, denial dialect (`denialSignatures`), and structured runner-failure evidence (`runnerFailureRules`); when no backend is usable it throws rather than passing the argv through unconfined. The [core type catalog]（原文链接目标：`../../../docs/subsystems/sandbox.md#wrapped-argv-and-classification-dialects`） owns the exact classifier shape.

Policy rides the call, not the provider: two consumers may confine under different policies at the same instant (bash under `read-only` while a confined child agent keeps its state directory writable), and an approved escalated retry is just a new call with a wider policy.

**Same-world confinement only.** A backend shares the host's filesystem and kernel (`bwrap`, Landlock, Seatbelt); `workspaceRoot` names the filesystem-canonical real host directory. Workspace identity is resolved before lexical normalization, so a valid cwd containing `symlink/..` grants the directory where `chdir` actually lands rather than an unrelated lexical parent. Containers, microVMs, and remote executors are NOT backends of this seam — they replace the Service Providers for whole capability seams (`ctx.shell`, `ctx.fs`) as environment-coherent groups. The boundary and its rationale: [the sandbox Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md`）.

Implementations: [`@taskweaver/dsh-sandbox-local`](./sandbox-local) (Linux: `bwrap`, else the per-platform Landlock launcher; macOS: `sandbox-exec`/Seatbelt). Consumers: [`@taskweaver/dsh-bash-sandbox`](../shell/bash-sandbox) (wraps `['bash', '-c', command]`).

<a id="pkg-taskweaver-dsh-sandbox--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-sandbox--confinement-error-indirectly"></a>
##### Confinement error, indirectly

<a id="pkg-taskweaver-dsh-sandbox--what-the-model-sees"></a>
###### What the model sees

Through [`dsh-bash-sandbox`](../shell/README.zh.md#pkg-taskweaver-dsh-bash-sandbox) and [`dsh-tool-bash`](../shell/README.zh.md#pkg-taskweaver-dsh-tool-bash), failure to enforce a requested mode produces code `SANDBOX_UNAVAILABLE` and the exact error below. An execution-time runner failure adds ` Runner failure: <detail>`.

<a id="pkg-taskweaver-dsh-sandbox--exact-error"></a>
###### Exact error

```markdown
sandbox mode "<mode>" is requested but no sandbox backend is usable on this host; refusing to run the command unconfined. Install bubblewrap or run a Landlock-enforcing kernel (Linux), ensure sandbox-exec is usable (macOS), or ensure the ACL restricted-token runner can start (Windows) — otherwise switch the consumer to danger-full-access.
```

<a id="pkg-taskweaver-dsh-sandbox--token-effect"></a>
###### Token effect

Conditional error text is visible for that call and retained in history until compaction.

<a id="pkg-taskweaver-dsh-sandbox--kv-cache-effect"></a>
###### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="pkg-taskweaver-dsh-sandbox--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **File effects are the whole policy vocabulary** — the seam expresses no network, process, syscall, device, or credential restrictions.
- **Same-world confinement only** — containers, microVMs, and remote execution require replacing capability implementations rather than adding a provider here.
- **Denial reporting is a stderr dialect** — the seam returns backend signatures instead of a typed runtime denial channel, so consumers that need classification must infer it from the child process's output.
- **Runner diagnostics are in-band** — exit status plus stderr evidence cannot prove which process wrote a matching line, so a confined child that deliberately mimics its runner can cause an availability/diagnostic false attribution. This cannot bypass confinement; an out-of-band runner-status channel is deferred.
- **One provider per context** — composing different sandbox mechanisms simultaneously requires a provider-level ladder or separate Cordis contexts; callers choose policy per call, not backend identity.

<a id="pkg-taskweaver-dsh-sandbox-local"></a>
### `@taskweaver/dsh-sandbox-local`

<!-- migrated-from: packages/runtime/sandbox/sandbox-local/README.md -->
目录：`sandbox/sandbox-local`。
package.json 描述：Local process-sandbox backends for the DeepSeek Harness sandbox seam: Linux bwrap, macOS Seatbelt, or the Windows ACL restricted-token runner — fail-closed

<a id="pkg-taskweaver-dsh-sandbox-local--taskweaver-dsh-sandbox-local"></a>
Local implementation of the [`dsh-sandbox`](./sandbox) seam. It selects and caches one platform runner: Linux uses Bubblewrap (`bwrap`), macOS uses Seatbelt, and Windows uses the ACL restricted-token runner. Each supported platform has one candidate, selected directly.

The package root exports the default and named `LocalSandboxProvider` plugin and `Config`; platform profile builders stay internal.

Unsupported platforms and unusable runners fail closed with `SANDBOX_UNAVAILABLE`; execution never silently falls through unconfined. Each wrap carries structured runner-failure rules so consumers can distinguish a broken sandbox from a command failure.

Policy is per call; the provider stores only the mechanism and cached runner verdict. Each wrap reports enforcement completeness plus backend-specific denial signatures and runner-failure rules. Bubblewrap and Seatbelt use signature-only failure classification because neither public contract reserves a launcher-failure status. Consumers spawn the returned argv directly, so a missing or unexecutable runner is an out-of-band spawn failure while a successfully launched child exit 126 or 127 remains ordinary. `runnerCommand` skips probes and requires one or more non-empty, single-line, case-insensitive `runnerFailureSignatures` entries for the custom runner's own fatal dialect. Because its mechanism is unknown, it carries the common Linux denial signatures. `probeTimeoutMs` bounds functional probes.

The bwrap profile combines a read-only host root, fresh `/dev`, and private-PID `/proc`. Commands manage descendants but cannot see host processes; hiding host `/proc/<pid>` entries prevents magic links such as `root` and `fd` from bypassing its mounts. `workspace-write` adds ephemeral `/tmp` and a writable workspace bind. The [private-PID Agent Note]（原文链接目标：`../../../.agents/notes/implemented/bug-fix/2026-08-06-bwrap-private-pid-namespace.md`） records the boundary.

The Seatbelt profile is allow-default with `(deny file-write*)` plus write allow-lists, so exactly the mode's promised file effects are governed: `read-only` grants the `/dev/null` literal alone; `workspace-write` adds the workspace root, `/tmp`, and the per-user darwin temp dir (`os.tmpdir()` — the platform's real temp area for mkstemp-family tools), every root canonicalized because Seatbelt matches resolved paths (`/tmp` IS `/private/tmp`). Apple marks the `sandbox-exec` CLI deprecated but ships it on every macOS; the functional probe is what fails closed if that ever changes.

The Windows rung keeps one deterministic write SID and standing ACE per workspace, but gives every live session/workspace pair a random private temp directory with a distinct SID and revocable ACE. Sessions sharing a workspace therefore share its intended write authority without inheriting one another's temp authority. A fresh provider always chooses a new temp path and SID, so crash residue cannot block or authorize a resumed session; agentless calls receive the same per-invocation isolation from the runner. A workspace equal to or containing the platform temp root fails before any ACL mutation because its inheritable workspace ACE would otherwise reach every private temp child.

```yaml
- id: sandbox
  name: '@taskweaver/dsh-sandbox-local'
```

Consumers: [`@taskweaver/dsh-bash-sandbox`](../shell/bash-sandbox); see [the acp-agent example]（原文链接目标：`../../../examples/acp-agent/`） for the runnable default composition.

<a id="pkg-taskweaver-dsh-sandbox-local--model-experience"></a>
#### Model Experience

Indirectly, through [`dsh-bash-sandbox`](../shell/README.zh.md#pkg-taskweaver-dsh-bash-sandbox) and [`dsh-tool-bash`](../shell/README.zh.md#pkg-taskweaver-dsh-tool-bash), which render this provider's enforcement and denial facts while the [`dsh-sandbox`](./README.zh.md#pkg-taskweaver-dsh-sandbox) seam owns the `SANDBOX_UNAVAILABLE` text and runner selection and profiles stay outside context.

<a id="pkg-taskweaver-dsh-sandbox-local--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

<a id="pkg-taskweaver-dsh-sandbox-local--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Windows ACL enforcement is partial** — the restricted token must retain Everyone for process initialization, so external objects granting Everyone write access remain writable; NTFS hard links also alias one file object across workspace and external paths. The provider reports `enforcement: 'partial'` rather than overstating that boundary as full.
- **Seatbelt depends on deprecated `sandbox-exec`** — macOS still ships it, but this provider cannot replace or probe that private policy engine if Apple removes it.
- **Runner selection is cached for the provider lifetime** — installing, removing, or repairing a runner requires reloading the plugin before selection changes.
- **`runnerCommand` is an operator assertion** — a configured custom runner skips functional probes and is assumed to implement the bwrap-compatible profile honestly; if it is itself a Bash script, its interpreter startup runs before that script applies confinement.

<a id="pkg-taskweaver-dsh-sandbox-policy"></a>
### `@taskweaver/dsh-sandbox-policy`

<!-- migrated-from: packages/runtime/sandbox/sandbox-policy/README.md -->
目录：`sandbox/sandbox-policy`。
package.json 描述：Per-call sandbox policy resolver and current model context: deployment fallbacks plus each session's mode and workspace root, shared by every enforcing capability family

<a id="pkg-taskweaver-dsh-sandbox-policy--dsh-sandbox-policy-the-sandbox-policy-home-ctx-sandboxpolicy"></a>
The single owner of sandbox-policy resolution: the deployment's default [`SandboxMode`](./README.zh.md#pkg-taskweaver-dsh-sandbox) and fallback root, plus each session's durable mode override and immutable workspace root. Every enforcing capability receives one resolved mode-and-root policy per call; before each request, the model receives the current policy without a separate capability inventory.

<a id="pkg-taskweaver-dsh-sandbox-policy--why-a-shared-home"></a>
#### Why a shared home

Filesystem tools, one-shot bash commands, and terminal sessions may enforce the same mode vocabulary in different combinations. If each resolved its own `mode` + `workspaceRoot`, they could drift into a split world, exactly what [the sandbox Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md`） warns against. Each enforcing backend consumes the complete owner-resolved policy, while the current context describes only what that policy means for any available operation the DSH file sandbox enforces. The [cross-family fs sandbox Agent Note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md`） records the shared-policy decision.

<a id="pkg-taskweaver-dsh-sandbox-policy--config"></a>
#### Config

- `mode` — the deployment default `SandboxMode` (`read-only` / `workspace-write` / `danger-full-access`), validated at load. Default `read-only` (fail-safe).
- `workspaceRoot` — the fallback directory `workspace-write` may write under for agentless calls or sessions without a cwd. Default `process.cwd()`, resolved to its absolute filesystem identity either way. A normal agent call uses its session header's immutable `cwd` instead.

<a id="pkg-taskweaver-dsh-sandbox-policy--api"></a>
#### API

- `ctx.sandboxPolicy.resolve({ session?, mode? })` — resolves one complete per-call policy. An explicit approved mode outranks the session's last `sandbox/mode` event, which outranks `defaultMode`; the session's immutable `cwd` is canonicalized with filesystem semantics before becoming `workspaceRoot`, otherwise the configured fallback applies. Canonicalization precedes lexical normalization so `symlink/..` agrees with process working-directory resolution.
- `ctx.sandboxPolicy.defaultMode` / `ctx.sandboxPolicy.workspaceRoot` — the deployment default and fallback root used by `resolve()`.
- `sandbox:policy` — a request-time cache-safe context contribution derived directly from `resolve({ session })`. It states the mode's capability-neutral file-effect contract and the canonical session workspace under `workspace-write`; tool owners retain operation-specific denial and escalation guidance.
- `effectiveSandboxMode(events)` — the pure fold of a session's `sandbox/mode` events (the last switch wins, or `undefined`), used inside `resolve()`.
- `setSandboxMode(session, mode)` — THE write path for a per-session override: appends exactly one `sandbox/mode` event. The switch IS its event; nothing mutates the mode out of band.
- `SANDBOX_MODES` — every mode, for option advertisement and runtime validation.

The optional `./invariant` companion rejects a forged durable `sandbox/mode` event whose value falls outside that closed vocabulary; Session and its companion own the surrounding storage and core execution-enclosure rules. The agent loop logs the assembled full runtime-context snapshot as a sourced `user/message`, so exact policy input remains reconstructable without an in-memory “last told” mirror.

<a id="pkg-taskweaver-dsh-sandbox-policy--the-per-session-store"></a>
#### The per-session store

A runtime switch is one log-only `sandbox/mode` event on the session it applies to. `effective = explicit grant ?? fold(events) ?? deployment default`, so an override survives restart by replay and two sessions never see each other's state. Workspace identity does not need another event: the immutable `SessionHeader.cwd` recorded at creation is the root for every call in that session. The event stays log-only; before the next request, the owner contributes the current fact to the full runtime-context snapshot.

<a id="pkg-taskweaver-dsh-sandbox-policy--model-experience"></a>
#### Model Experience

<a id="pkg-taskweaver-dsh-sandbox-policy--current-file-sandbox-policy"></a>
##### Current file sandbox policy

<a id="pkg-taskweaver-dsh-sandbox-policy--what-the-model-sees"></a>
###### What the model sees

One `sandbox:policy` contribution in the current runtime-context snapshot for every agent session. It does not enumerate mounted capabilities. Tool plugins retain operation and escalation guidance, approval policy contributes separately to the same snapshot, and plan guidance remains `dsh-plan-mode`'s system section.

<a id="pkg-taskweaver-dsh-sandbox-policy--read-only"></a>
###### Read-only

```markdown
Current Z file policy: read-only. Any available operation enforced by the Z file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.
```

<a id="pkg-taskweaver-dsh-sandbox-policy--workspace-write"></a>
###### Workspace-write

```markdown
Current Z file policy: workspace-write. Any available operation enforced by the Z file sandbox may modify files under the session workspace: "<workspace root>". Some platform temporary areas may also be writable.
```

<a id="pkg-taskweaver-dsh-sandbox-policy--danger-full-access"></a>
###### Danger-full-access

```markdown
Current Z file policy: danger-full-access. The Z file sandbox does not restrict file modifications by available operations.
```

<a id="pkg-taskweaver-dsh-sandbox-policy--token-effect"></a>
###### Token effect

One concise durable context message on the first request and each effective policy change; unchanged requests add nothing. `workspace-write` carries only the canonical session workspace path; platform-specific temporary paths are summarized without adding host-dependent bytes.

<a id="pkg-taskweaver-dsh-sandbox-policy--kv-cache-effect"></a>
###### KV Cache effect

The stable system prompt remains byte-identical across mode changes. A changed full context snapshot is appended after retained history, preserving the prior cached prefix; subsequent unchanged requests reuse that retained snapshot.

<a id="pkg-taskweaver-dsh-sandbox-policy--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **One primary workspace root per session** — policy resolves `SessionHeader.cwd`; extra writable roots are not part of `SandboxExecutionPolicy`.
- **File-effect modes only** — `SandboxMode` governs file effects; network and process policy are outside its vocabulary, so no knob here restricts them.
- **Temporary areas are deliberately summarized** — enforcing backends grant different platform temporary areas, which are selected after policy resolution and therefore cannot be enumerated truthfully in the current context.

<a id="pkg-taskweaver-dsh-sandbox-windows-acl"></a>
### `@taskweaver/dsh-sandbox-windows-acl`

<!-- migrated-from: packages/runtime/sandbox/sandbox-windows-acl/README.md -->
目录：`sandbox/sandbox-windows-acl`。
package.json 描述：Windows ACL write-restriction sandbox backend (restricted-token spawn with capability-SID write allowlist) for the DeepSeek Harness sandbox seam

<a id="pkg-taskweaver-dsh-sandbox-windows-acl--taskweaver-dsh-sandbox-windows-acl"></a>
Windows write-restriction sandbox backend for the [harness sandbox seam](./sandbox): a Node.js/[koffi](https://koffi.dev/) port of the mechanism in [huoyaoyuan/windows-acl-restrict-poc](https://github.com/huoyaoyuan/windows-acl-restrict-poc) (`10e4dfb`, the fixed revision), mounted as the `enforcement: 'partial'` win32 rung of the [`@taskweaver/dsh-sandbox-local`](./sandbox-local) chain (`workspace-write` / `read-only` modes); the same package carries the Linux/macOS backends.

Mechanism in one line: the caller's token is duplicated into a `WRITE_RESTRICTED` token whose restricting SIDs carry separate workspace and private-temp capabilities. The workspace SID is derived deterministically from the canonical workspace path (`workspaceWriteSid`), so the workspace-root ACE materializes once per workspace per machine and every later session, call, or restart hits the exact-ACE skip. Each live session/workspace pair instead receives a random temp directory and a SID derived from that path (`tempWriteSid`), so sessions share the intended workspace authority without inheriting one another's temp authority. Windows grants a write only where BOTH the caller's normal access AND the restricting-SID intersection allow it. These SIDs are the primary allowlists and grant nothing elsewhere, but the check also inherits ambient write ACEs of the OTHER restricting SIDs (the keep-alive group logon SID + Everyone), and NTFS ACLs belong to file objects rather than paths; the Everyone and hard-link boundaries are why the rung reports partial rather than full enforcement.

Building directly on the raw ACL mechanism is the recorded design choice: it implements both confinement modes without the problems the rejected container options carry — see the [design note]（原文链接目标：`../../../.agents/notes/implemented/feature/2026-08-08-windows-acl-restricted-token-sandbox.md`） ([mxc](https://github.com/microsoft/mxc/blob/main/docs/process-container/os-version-support.md) needs an OS floor of Windows 11 24H2 and wholesale host DACL writes for arbitrary-path reads; AppContainer cannot do arbitrary-path reads at all).

<a id="pkg-taskweaver-dsh-sandbox-windows-acl--usage"></a>
#### Usage

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AclSandbox, tempWriteSid, workspaceWriteSid } from '@taskweaver/dsh-sandbox-windows-acl'

const workspaceRoot = process.cwd()
const tempDir = mkdtempSync(join(tmpdir(), 'dsh-'))

// mode selects the token's restricting-SID list (see Modes below) and must
// match the grant shape. workspace-write requires distinct workspace and
// private-temp identities; pass tempDir: null to disable temp writes.
const sandbox = new AclSandbox({
  writableDirs: [workspaceRoot],
  tempDir,
  writeSid: workspaceWriteSid(workspaceRoot),
  tempWriteSid: tempWriteSid(tempDir),
  mode: 'workspace-write',
})
await sandbox.init() // throws on ANY Win32 failure — never spawns unrestricted

const child = sandbox.spawn({ command: 'pwsh', args: ['-NoProfile', '-Command', '...'], cwd: workspaceRoot })
const { stdout, stderr, exitCode } = await child.wait()

sandbox.dispose() // revokes the revocable (temp) grant, keeps the standing workspace ACE; reports every cleanup failure
rmSync(tempDir, { recursive: true, force: true })
```

A direct `AclSandbox` requires an explicit private temp directory (or `tempDir: null`; the ambient temp root is never an implicit grant), grants the workspace ACEs STANDING (dispose() leaves them — they are the cross-instance reuse cache), and grants the distinct temp SID revocably. The server-side reuse is the `AclWriteGrant` class: `add(path, standing)` per directory, `dispose()` revokes the revocable paths and frees the SID — see the runner contract below. Every Win32 API call in this package is checked; failures throw `Win32Error` carrying the API name, the exact Win32 code, the `FormatMessageW` system text, and the failing path/context. This is deliberate: the POC ignored every return value and, when `CreateRestrictedToken` failed, silently ran the child with the FULL unrestricted token (fail-open). This port fails closed by construction.

<a id="pkg-taskweaver-dsh-sandbox-windows-acl--the-confinement-runner"></a>
#### The confinement runner

The seam-facing shape is the **runner entry** (`./runner`), the argv-prefix wrapper `@taskweaver/dsh-sandbox-local` spawns in place of the caller's command — the same architecture as bwrap/landlock-run/sandbox-exec, so the sandbox seam's `confine()` contract needs no change. Stable argv contract:

```sh
node runner.js --workspace <dir> --temp <dir> --mode <read-only|workspace-write> [--write-sid <S-1-4-…> --temp-write-sid <S-1-4-…>] -- <argv...>
```

The runner creates the restricted token, spawns the wrapped argv under it with the caller's stdio passed straight through (the caller's pipes, made inheritable around the spawn — Node clears stdio inheritability at startup, which raw spawns must compensate for), wraps the child in a `KILL_ON_JOB_CLOSE` job (a dead runner kills the child), ignores its own console Ctrl+C so the child handles its own, mirrors the child's exit code, and revokes its self-managed temp grant on exit (workspace ACEs stand). Every runner-side failure prints `windows-acl-run: <detail>` to stderr and exits 127 — the seam's `RUNNER_FAILURE_RULES` match that signature, so a runner refusal is never mistaken for a denial.

**Workspace reuse and temp isolation**: the seam materializes the deterministic workspace SID's ACE STANDING (once per workspace per server lifetime, never revoked — it is the reuse cache), then creates a random private temp directory and distinct revocable SID for each live session/workspace pair. It passes both identities as the required `--write-sid`/`--temp-write-sid` pair; the runner verifies each against its owning path and neither grants nor revokes (`manageDacls: false`). A fork receives a different temp capability, and a fresh provider gives even the same resumed session a new path and SID, so crash residue is inert litter rather than a collision or inherited capability. Without the pair, `--temp` names a root: an agentless/standalone workspace-write runner creates a random private child, self-manages its temp SID, rewrites TMP/TEMP, and removes the child on exit. A workspace equal to or containing that root is rejected before any grant because its inheritable workspace ACE would otherwise authorize every private child; the direct API likewise rejects overlap between any writable root and the actual private temp directory. Re-granting the standing workspace ACE after a restart is idempotent: `grantWrite` reads the current DACL and skips `SetNamedSecurityInfoW` when the exact ACE already stands (that apply eagerly re-propagates the identical ACE across the whole tree — minutes on large workspaces). Known cost: the first grant on a big workspace tree blocks for that eager propagation once per workspace per machine.

Modes (the token's restricting-SID list follows the mode; the keep-alive group is logon SID + Everyone in BOTH modes — early DLL init dies with `0xC0000142` and CNG crashes pwsh with `0xE0434352` without them):
- `workspace-write` (logon SID, Everyone, workspace SID, temp SID): the workspace and the session's PRIVATE temp subdirectory carry separate Write grants; other ACL-addressable writes are denied except for the documented Everyone and hard-link boundaries.
- `read-only` (logon SID, Everyone — NO write SID): no explicit write-SID grants. The write SID stays OUT of the list on purpose: the standing workspace grant ACE from an earlier workspace-write period (a `/permission` downgrade, or a crash-resumed session) remains INERT under read-only because the write-restricted pass-2 check grants only what the restricting list carries — while the standing ACE keeps the re-upgrade free of re-propagation. Everyone's ambient rights remain the documented partial boundary. NUL writes are AMBIENT, not granted: the device DACL grants Everyone read+write+execute (`0x1201BF`), so openers whose mask fits it (cmd `> NUL`, node `\\.\NUL`) can write it in BOTH modes — the sandbox cannot zero-grant the NUL device while Everyone stays in the keep-alive group. `Set-Content NUL` fails in both modes (a PowerShell/.NET-layer effect, pinned by the read-only suite — the device DACL is not the denying party); PowerShell's `> $null` redirection keeps working (it discards without opening NUL).

Authenticated Users is absent from BOTH lists — the WMI namespace security check fails (`0x80041003`), so CIM cmdlets and `Get-ComputerInfo` (which silently returns incomplete results rather than an error) are unavailable in EVERY confined mode, and the C:\-root tree-creation escape (standing `AU:(AD)` + `AU:(OI)(CI)(IO)(M)` ACEs) is closed in both — the model-facing documentation states that contract, not a prompt promise. INTERACTIVE/LOCAL are absent from BOTH lists too: the host's Public tree grants write to INTERACTIVE, so Public writes are denied — pinned by the runner's ambient-writable Public-probe regression (see the design note).

The `AclSandbox` class (explicit private `tempDir` + `tempWriteSid`, or `tempDir: null` to disable temp writes) remains the programmatic API for direct spawns; `AclWriteGrant` is the server-side materialization half of the grant lifecycle.

<a id="pkg-taskweaver-dsh-sandbox-windows-acl--header-verification"></a>
#### Header verification

All constants, signatures, and struct layouts were verified against the Windows headers on the development machine (MinGW `winnt.h` / `accctrl.h` / `aclapi.h` / `securitybaseapi.h` / `sddl.h` / `processthreadsapi.h` / `fileapi.h` / `namedpipeapi.h` / `synchapi.h` / `winbase.h`) and are cross-checked at runtime by [`verify/abi-probe.cpp`](./sandbox-windows-acl/verify/abi-probe.cpp) (sizes, offsets, enum values, static asserts):

```sh
g++ -std=c++20 -municode -O2 -o abi-probe.exe verify/abi-probe.cpp -ladvapi32 && ./abi-probe.exe
```

The koffi struct definitions assert their sizes against the probe at module load, so a header/koffi layout drift fails loudly instead of corrupting memory.

<a id="pkg-taskweaver-dsh-sandbox-windows-acl--verified-boundaries-inherent-to-restricted-tokens-not-this-port"></a>
#### Verified boundaries (inherent to restricted tokens, not this port)

- **Everyone grants remain ambient write authority.** Everyone must stay in both restricting lists: removing it breaks early DLL initialization and CNG. An external NTFS object whose normal DACL grants Everyone a requested write right therefore clears both access checks and stays writable under both modes. The real runner suite provisions an external `Everyone:Modify` directory and pins that behavior; the provider reports `enforcement: 'partial'` so callers can reject or surface the weaker boundary.
- **Hard links are file-object aliases, not path aliases.** An inheritable workspace ACE propagated onto an existing NTFS hard link changes the one underlying file security descriptor, so the same object is writable through an external alias. Rejecting every multiply-linked workspace file is not viable for ordinary pnpm installations, which use hard links into their content-addressable store; the native runner suite pins the gap and the provider's partial report names its consequence.
- **Writes are restricted; reads, network, and process visibility are not.** `WRITE_RESTRICTED` intersects write accesses only, so a confined child can read any caller-readable file and open sockets. `read-only` mode therefore cannot be expressed by this mechanism alone; pair it with a read-side policy or an AppContainer/`S-1-15-2` capability token for stronger confinement.
- **Console isolation is unavailable.** Under the restricted token, children created with `CREATE_NO_WINDOW` / `CREATE_NEW_CONSOLE` die during DLL initialization with `STATUS_DLL_INIT_FAILED` (`0xC0000142`). The POC tried to fix this by adding the console logon SID (`S-1-2-1`) to the restricting list; on Windows 11 26200 `CreateWellKnownSid(WinLocalLogonSid)` fails with `ERROR_INVALID_PARAMETER` (87), the correct `WinConsoleLogonSid` yields a valid `S-1-2-1` but the child still dies, and the POC's final revision removed both the SID and console isolation. Children therefore share the host console; stdio redirection is pipe-based and unaffected.
- **ACL grants are standing directory mutations.** They persist if the process dies mid-run; workspace ACEs are standing BY DESIGN (never revoked — the reuse cache), temp ACEs are revoked by `dispose()` (`init()` also revokes an already-applied temp grant when a later step fails). The POC's documented manual cleanup (`icacls <dir> /remove '*S-1-4-…'`) fails on this platform with `ERROR_NONE_MAPPED` (1332) — revoke through this module instead. An unclean shutdown needs no self-healing for the workspace ACE: the derived SID re-hits the standing ACE on the next provision (skipping the apply); the write-SID ACE never accumulates a second identity per restart because the identity IS the workspace.
- **Granted directories must be caller-owned.** The owner's implicit `WRITE_DAC` is what lets the sandbox edit the DACL without elevation.
- **The ambient temp root is never granted implicitly.** A direct `AclSandbox` workspace-write caller must supply an existing private `tempDir` plus its distinct `tempWriteSid`, or explicitly disable temp writes with `tempDir: null`. The actual temp directory must be disjoint from every writable root. The seam creates a random private directory; agentless runner calls treat `--temp` as the parent root and create their own random child, but reject a workspace equal to or containing that parent before any ACL mutation.
- **The confined child's temp capability is private per live session/workspace pair.** The runner rewrites TMP/TEMP via `SetEnvironmentVariableW` to that private directory before the spawn and the child inherits the rewritten block (bwrap `--tmpfs /tmp` semantics). The temp ACE and directory are removed on provider disposal, or after each agentless invocation. A crash can leave inert `%TEMP%` litter, but a resumed provider chooses a new random path and SID instead of colliding with or reauthorizing the residue. The native runner suite proves that two tokens sharing the same workspace SID cannot write one another's temp directories.
- **`whoami` and token-inspection cmdlets fail under the restricted token.** `GetTokenInformation` on the duplicate is partially unavailable to the child, so `whoami /all` reports errors — diagnostic noise of the restriction scheme, not an operational failure; the denial surfaces that matter (file writes) are unaffected.

<a id="pkg-taskweaver-dsh-sandbox-windows-acl--model-experience"></a>
#### Model Experience

Indirectly, through [`dsh-bash-sandbox`](../shell/README.zh.md#pkg-taskweaver-dsh-bash-sandbox), [`dsh-pwsh-sandbox`](../shell/README.zh.md#pkg-taskweaver-dsh-pwsh-sandbox), and their tools, which render this backend's partial-enforcement and denial facts (the confined stderr the tool layer classifies through `denialSignatures`) while the [`dsh-sandbox`](./README.zh.md#pkg-taskweaver-dsh-sandbox) seam owns the `SANDBOX_UNAVAILABLE` text and runner selection.

<a id="pkg-taskweaver-dsh-sandbox-windows-acl--kv-cache-effect"></a>
###### KV Cache effect

None directly; the denial surface belongs to the tool layer.

<a id="pkg-taskweaver-dsh-sandbox-windows-acl--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **One write allowlist per workspace** — the write SID is the unit of the allowlist and IS the workspace identity; reusing one sandbox instance across two workspaces widens both grants to both roots (the same SID would then name two roots). Create one instance per workspace root — the seam does exactly this, keyed by the workspace path.
- **Cleanup is best-effort by design** — `dispose()` attempts every temp revocation and aggregates failures into an `AggregateError`; a cleanup failure can leave the random directory and its temp-SID-only ACE behind. Once the process exits no future token carries that SID, so the residue is inert until OS temp hygiene or manual directory removal reclaims it.
- **Standing workspace ACEs are invisible residue.** Renaming a workspace derives a new SID; the old ACEs on the old path stay (inert, write-SID-only). A future cleanup command may reap them; nothing re-propagates because of them.
- **NULL-DACL directories are not identity-preserving under grant+revoke.** A directory with a NULL DACL (rare — Windows-created directories carry real DACLs) means "everyone full control"; `grantWrite` builds the new ACL from that null, and the revoke round-trip leaves an EMPTY (deny-all) DACL rather than the original NULL DACL. The POC shares the behavior; real workspace and temp directories carry real DACLs, so this stays a documented edge rather than a guarded path.
- **Piped stdio capture is impossible for confined grandchildren (the named-pipe default SD template).** libuv's pipe stdio uses NAMED pipes; `CreateNamedPipeW` without security attributes installs the Win32 layer's user-mode default SD template (built by KernelBase — owner/SYSTEM/Admins full, Everyone/ANONYMOUS read-only, the fixed template [MS documents](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)) — NOT the token default DACL, which is what the kernel applies to a raw SD-null create — so the client-end open requests write access no restricting SID is granted: `spawn(..., { stdio: 'pipe' })` inside a confined process fails with EPERM, the POC-documented "no output redirection" boundary of WRITE_RESTRICTED tokens. Inherited (`inherit`/fd) and ignored (`ignore`) stdio spawns work, and anonymous pipes (CreatePipe — a token-default-DACL consumer, e.g. PowerShell pipelines) work because the restricted token's default DACL carries a full-access restricting-SID ACE (set at init). A confined process therefore cannot capture a grandchild's output through a pipe; tools that must capture output cannot run confined.
- **Grant materialization is an eager full-tree propagation.** `SetNamedSecurityInfoW` on a directory with inheritable ACEs walks every descendant immediately (NOT lazily per access — measured at tens of seconds on large workspace trees). The per-workspace identity pays it once per workspace per machine (lazily at the first confined execution ever, skipped entirely on every later provision when the exact ACE stands). Private temp directories start empty, so their distinct grant is cheap. If a workspace is huge, the first confined write on this host is correspondingly slow.
- **Read-side confinement and network policy are out of scope** — `WRITE_RESTRICTED` intersects write accesses only; pair this backend with a read-side policy for stronger confinement.
- **Wide-directory and FAT-volume warnings are deferred; FAT-class targets stay writable.** The UI-side warnings for granting unusually wide directories or FAT-class (non-ACL) volumes are not yet implemented, and a FAT volume as a grant ROOT simply fails the grant loudly (no ACL support). A FAT-class target OUTSIDE the granted roots is different: it has no security descriptors, so the restricted token's write check passes (Everyone sits in both lists) and such targets are writable under BOTH confined modes. FAT is treated as a legacy residue — unsupported and not engineered around; this warn-only posture is documented here rather than mitigated.
- **PowerShell language mode differs by confined mode.** Under `read-only`, PowerShell cannot create its AppLocker probe files in temp and conservatively starts in ConstrainedLanguage: `Add-Type` (C# compile, P/Invoke), non-core .NET static calls (`[System.IO.*]::`, `[math]::`, `[Environment]::`), COM objects, and reflection fail with `Cannot create type` / `Cannot invoke method` ("only core types") errors, and `$ExecutionContext.SessionState.LanguageMode = 'FullLanguage'` is refused. Under the shipped `workspace-write` path, the private-temp capability lets that probe complete, so pwsh stays in FullLanguage unless host-wide WDAC/AppLocker policy says otherwise; a direct `AclSandbox` configured with `tempDir: null` has no such guarantee and can fail the probe closed like read-only. This split is PowerShell startup behavior, not part of the ACL write boundary. The `pwsh` tool description teaches the shipped modes to the model; `danger-full-access` calls run unconfined at FullLanguage.

<a id="family-sandbox"></a>
### 原族级说明（迁移保留）

<a id="family-sandbox--sandbox-process-sandbox-capability-family"></a>
This family applies per-session confinement policy to process execution. It covers same-world subprocesses; isolated environments replace complete capability implementations instead of registering here.

| Package | Role | ctx key |
|---|---|---|
| [`sandbox/`](./README.zh.md#pkg-taskweaver-dsh-sandbox) | Defines the process-sandbox service and shared escalation vocabulary | `ctx.sandbox` |
| [`sandbox-local/`](./README.zh.md#pkg-taskweaver-dsh-sandbox-local) | Provides local platform confinement backends | registers on `ctx.sandbox` |
| [`sandbox-policy/`](./README.zh.md#pkg-taskweaver-dsh-sandbox-policy) | Resolves durable per-session sandbox policy | `ctx.sandboxPolicy` |

See the [sandbox decision]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-06-sandbox.md`） for the capability boundary and the [filesystem integration decision]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md`） for cross-family policy use.

The subsystem reference — modes and enforcement, per-call policy, wrapped-argv dialects, fail-closed errors — is [docs/subsystems/sandbox.md]（原文链接目标：`../../docs/subsystems/sandbox.md`）; the boundary and the cross-family phase live in the [sandbox]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-06-sandbox.md`） and [cross-family fs sandbox]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md`） Agent Notes.
