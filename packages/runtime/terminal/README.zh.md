# terminal 包族

<a id="family-terminal"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

提供按所有者隔离的持久伪终端会话。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

当前目录没有 workspace package；保留的族级说明仍收录在本页，供后续增量维护时参考。

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="family-terminal"></a>
### 原族级说明（迁移保留）

<a id="family-terminal--terminal-persistent-pty-capability-family"></a>
`PTY` stands for **Pseudo-Terminal**（伪终端）. This capability provides persistent, owner-scoped terminal sessions for workflows that require state across tool calls or interactive stdin. PTY complements the one-shot bash and filesystem tools; it does not replace their stronger per-operation contracts.

| Package | Role | ctx key |
|---|---|---|
| [`pty`]（原文链接目标：`terminal/README.md`） (`@taskweaver/dsh-terminal`) | Backend registry, branded ids, exact-Agent ownership, session operations, and awaited cleanup | `ctx.terminals` |
| `terminal-bash` (`@taskweaver/dsh-terminal-bash`) | Shell backend over `ctx.subprocess.spawnTerminal`: readiness detection, bounded terminal state, sandbox policy, and session operations | registers on `ctx.terminals` |
| `tool-terminal` (`@taskweaver/dsh-tool-terminal`) | Six model-facing tools and generic task integration for background sends | registers on `ctx.tools` |

The design and deferred boundaries live in the [persistent PTY Agent Note]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md`）.

The subsystem reference — ids, backend/session contracts, send readiness, bounded reads — is [docs/subsystems/terminal.md]（原文链接目标：`../../docs/subsystems/terminal.md`）; design and deferred boundaries in the [persistent PTY Agent Note]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md`）.
