# e2b 包族

<a id="family-e2b"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

保留 E2B 远程执行环境的实验性组合说明。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

当前目录没有 workspace package；保留的族级说明仍收录在本页，供后续增量维护时参考。

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="family-e2b"></a>
### 原族级说明（迁移保留）

<a id="family-e2b--e2b-e2b-remote-runtime-family"></a>
An experimental provider-composition POC that places one filesystem/process execution world in an E2B Linux sandbox. E2B supplies only sandbox lifecycle and the two fundamental OS adapters; provider-neutral consumers build higher capabilities above them.

| Package | ctx key | Role |
|---|---|---|
| [`e2b`]（原文链接目标：`e2b/README.md`） (`@taskweaver/dsh-e2b`) | `ctx.e2b` | Create one sandbox, prepare its working/runtime directories, expose the shared SDK handle, and delete it on timeout or disposal |
| [`fs-e2b`]（原文链接目标：`fs-e2b/README.md`） (`@taskweaver/dsh-fs-e2b`) | `ctx.fs` | Implement the filesystem seam over E2B Filesystem APIs |
| [`subprocess-e2b`]（原文链接目标：`subprocess-e2b/README.md`） (`@taskweaver/dsh-subprocess-e2b`) | `ctx.subprocess` | Implement executable lookup, managed process groups and stdio, remote spill files, and terminal sessions over E2B Commands and PTY APIs |

The existing [`dsh-bash-local`](../shell/README.zh.md#pkg-taskweaver-dsh-bash-local), [`dsh-terminal-bash`]（原文链接目标：`../terminal/terminal-bash/README.md`）, and [`dsh-lsp-stdio`](../lsp/README.zh.md#pkg-taskweaver-dsh-lsp-stdio) need no E2B-specific forks. They delegate every execution-world operation to `ctx.fs` and `ctx.subprocess`, so mounting the two E2B adapters places their mutable work in the same sandbox.

This boundary does not move the harness process, Cordis objects, model calls, agent/session state, session persistence, skills, higher-level protocol state, or E2B SDK buffers. The [portable execution-world decision]（原文链接目标：`../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.md`） owns both the generic composition and this POC boundary.
