# experimental 包族

<a id="family-experimental"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

收纳尚未进入正式支持面的实验插件与原型。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

当前目录没有 workspace package；保留的族级说明仍收录在本页，供后续增量维护时参考。

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="family-experimental"></a>
### 原族级说明（迁移保留）

<a id="family-experimental--experimental-private-experimental-packages"></a>
This group contains prototypes and internal-only Cordis plugins that use the repository's real runtime without joining an official release. Its packages are private, carry no stability or support promise, and retain the same engineering, security, documentation, lifecycle, testing, and snapshot requirements as release packages.

| Package | Role | ctx key |
|---|---|---|
| `agent-team/` | Implicit-root Agent Teams roster, durable peer mailbox, shared task DAG, and runtime coordination | `ctx.agentTeams` |
| `tool-agent-team/` | Scoped model-facing Agent Teams tools and collaboration guidance | — |

The [subtree rules]（原文链接目标：`AGENTS.md`） define dependency isolation, release exclusion, and promotion.
