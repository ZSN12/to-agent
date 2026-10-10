# hooks 包族

<a id="family-hooks"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

承载生命周期 Hook 桥接适配与共享协议说明。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

当前目录没有 workspace package；保留的族级说明仍收录在本页，供后续增量维护时参考。

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="family-hooks"></a>
### 原族级说明（迁移保留）

<a id="family-hooks--hooks-hook-bridges-shared-protocol"></a>
The hooks subsystem lets users extend the agent at lifecycle points the way Claude Code and Codex do — by pointing a bridge plugin at an existing `hooks.json` (or settings) so those external shell hooks run faithfully. The canonical extension surface itself is the harness's typed interception points ([the interception extension-points Agent Note]（原文链接目标：`../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.md`）); a "native hook" is just an ordinary Cordis plugin on those extension points. These packages are the **bridges** that translate the external shell-hook protocol onto that same surface, plus the shared wire-protocol library they build on.

| Package | Role | Shape |
|---|---|---|
| [`hook-protocol/`]（原文链接目标：`hook-protocol/README.md`） | Shared shell-hook protocol library | library |
| [`hooks-claude-code/`]（原文链接目标：`hooks-claude-code/README.md`） | Claude Code hook bridge | plugin |
| [`hooks-codex/`]（原文链接目标：`hooks-codex/README.md`） | Codex hook bridge | plugin |

The shared library owns common protocol behavior; each bridge owns its dialect-specific event mapping. The child READMEs document those contracts.
