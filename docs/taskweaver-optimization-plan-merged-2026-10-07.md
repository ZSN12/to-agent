# TaskWeaver 优化合并计划（DSH / Claude Code / 修订版七阶段）

> 合并来源：`docs/性能差异诊断-DSH对比.md`、`docs/DSH对齐与TaskWeaver差异化.md`、用户会话中的对标计划、`docs/taskweaver-z-alignment-plan-revised-2026-10-06.md`。  
> 勘误日期：2026-10-07

## 执行主线（推荐顺序）

1. **阶段 0**：重打包安装版 + parity 基线（`run-parity-bench.mjs`、acceptance A–F）
2. **阶段 1（性能）**：流式单通道 / 去掉 `delta.full`、滚动 RAF 合并、核对模型与推理档位
3. **修订版阶段 3**：Plan/Todo Host 投影（ largely 已接）、`/plan` 全文、权限三档
4. **阶段 2（CC）**：权限规则 + always allow、Hooks（可延期）、auto-review 路线图
5. **阶段 3（架构）**：单源持久化、`atSeq` fork、子会话——中长期，不挡 1/0

## 已落地（源码，以 git 为准）

| 项 | 说明 |
|----|------|
| Legacy history 注入 | 仓库已删除 `formatLegacyHistoryContext`；**安装版须重打包** |
| 注入预算与拼装 | `prompt-pipeline.mjs` 在 UTF-8 字节口径下组合 sandbox/workspace/可选验证层；主聊天与 DAG 子任务共用 32 KiB 暂定注入上限及回归测试 |
| 意图兜底 | 无法判断 → `CONVERSATION`，不注入构建 |
| 验证注入 | 默认关闭；`autoVerifyAfterMutation` 偏好 |
| 单 Agent 默认 | `orchestration-policy` 仅显式多 Agent / goal |
| 只读 prompt | 不追加 Host 外 NOTE |
| Hub 16ms 合并 | `z-conversation-hub` `PUBLISH_COALESCE_MS` |
| 模型目录 TTL | `model-service` 5s + in-flight |
| Markdown memo | `AgentMessageMarkdown` `memo()` |
| 权限 | `readonly` / `ask`→workspace / `full`；Host `/permission` 命令应用 |
| Plan/Todo 投影 | `hostPlanTodoProjection`、`HostTodoProjection` |

## 阶段 0（最高优先）

| # | 任务 | 验收 |
|---|------|------|
| 0.1 | `npm run app` + 安装；grep asar 无 `TASKWEAVER_LEGACY_HISTORY_CONTEXT` | 与源码 preset SHA 一致 |
| 0.2 | parity A/B/F 固定 model/effort；填 `acceptance-2026-10-06.md` | 可复算报告 |

## 阶段 1（性能收尾）

| # | 任务 | 状态 |
|---|------|------|
| 1.1 | 主对话：`chat:dshView` 为主；`delta` 仅增量；有 hub 时跳过 delta/thinking stream | **已落地（2026-10-07）** |
| 1.2 | 滚动：RAF 合并 + `streamFollowKey`（非整段 `messages`） | **已落地（2026-10-07）** |
| 1.3 | 回归 `sessionModelMatches`、意外 model change | **已落地**（`dsh-session-model.mjs` + `test:session-model-matches` + dsh-chat 集成） |
| 1.4 | 推理档位：已有 per-thread `thinkingLevel` → 核对 UI/默认 | 核对项 |
| 1.5 | DAG 显式触发 | **已完成** |
| 1.6 | Prompt 注入层 UTF-8 总预算；可选验证层超限时优先移除 | **已落地并过构建/单测**；32 KiB 仍需第二类真实任务复测 |

验证：`npm run build`、`test:dsh-chat`、`test:stream-buffer`、`test:conversation-run-lifecycle`（或 `test:stream-segments` 脚本集）。

## 阶段 2（Claude Code 对标）

| # | 任务 | 备注 |
|---|------|------|
| 2.1 | 路径级 allow/deny + 会话 always allow | **已落地**（`permission-service` 会话 grant + 路径持久规则 + `ApprovalPanel`） |
| 2.2 | `full` 语义 | 已用 `/permission` + 投影核对；非「完全无效」 |
| 2.3 | Hooks | `hooks-claude-code`；进程级配置限制 |
| 2.4 | `dsh-auto-review` 全链 | 中长期 |
| 2.5 | 按 diff 选验证命令 | 增强 `verification-policy` |

## 阶段 3（架构）

UI json + Host 事件双源 → 单源事件日志；fork `atSeq`；子任务 DSH 子会话；compaction 字段对齐。**迁移前置条件：**Host user payload 目前会包含 TaskWeaver 追加的 prompt 层，而 UI transcript 保存人类原文；本轮统一了拼装和计量，但尚未解耦。必须先把原文与模型上下文分开（例如来源化的 Host context event 或显式 display-text 元数据），再定义可重建的 UI 投影，不能把 Host 的注入文本直接作为用户可见消息。

## 阶段 4（纪律）

每次打包 grep asar；性能对比锁 provider/model/effort；更新 `DSH对齐与TaskWeaver差异化.md`（权限、`standard`、z-runtime、Enter 行为）。

## 文档引用原则

- **根因与实验设计**：性能差异诊断  
- **产品边界**：DSH 对齐差异化（需勘误旧 Pi/permission 表）  
- **执行与验收**：本文件 + 修订版七阶段 + acceptance
