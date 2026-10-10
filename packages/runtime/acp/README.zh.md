# acp 包族

<a id="family-acp"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

承载 Agent Client Protocol（ACP）互操作入口及自动化客户端说明；协议接入与用户交互层保持分离。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

当前目录没有 workspace package；保留的族级说明仍收录在本页，供后续增量维护时参考。

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="family-acp"></a>
### 原族级说明（迁移保留）

<a id="family-acp--acp-agent-client-protocol-automation"></a>
The ACP group exposes harness agents to programmatic clients over the Agent Client Protocol. It is an interoperability transport, not a presentation or human-interaction layer; the matching out-of-process subagent *client* lives in [`subagent/subagent-acp`]（原文链接目标：`../subagent/subagent-acp/README.md`） because it implements the subagent provider interface.

| Package | Role |
|---|---|
| [`acp/`]（原文链接目标：`acp/README.md`） | Automation-only ACP server. |

The server contract is documented in [`acp/README.md`]（原文链接目标：`acp/README.md`）.
