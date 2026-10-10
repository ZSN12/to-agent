# schedule 包族

<a id="family-schedule"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

在原始会话日志中保存提醒，并在 Agent 活跃时调度后续执行。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

当前目录没有 workspace package；保留的族级说明仍收录在本页，供后续增量维护时参考。

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="family-schedule"></a>
### 原族级说明（迁移保留）

<a id="family-schedule--schedule-session-local-reminders"></a>
The Schedule family owns reminders whose durable state lives in the original Session log. A process-local owner waits only while that Session has a live root Agent; cold Sessions resume overdue work when they become live again and never imply an external notification channel.

| Package | Role | ctx key |
|---|---|---|
| `schedule/` | Versioned Schedule events and fold, model-facing create/list/delete tools, and a live root-Agent timer owner | — |

The package deliberately exposes no public Schedule service or mutable database. Tools and runtime append to the Session stream; due work enters the same conversation through the Agent's ordinary follow-up queue.

See [Session-local Schedule]（原文链接目标：`../../docs/subsystems/schedule.md`） for the durable record, transition, view, and delivery contracts.
