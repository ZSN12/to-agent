# DSH 对齐与 TaskWeaver 差异化

对照参考实现：`/Users/zsn/Documents/deepseek/dsh-source`（DeepSeek Host / DSH）。  
本文说明**已对齐**、**刻意保留的个性化能力**，以及**后续可继续收敛**的项。

## 已对齐（行为 / UI）

| 领域 | DSH | TaskWeaver |
|------|-----|------------|
| 多会话并行 | 每 Session 独立 Agent / turn 链 | DSH-backed `dsh-chat-service.mjs` + `orchestration-service.mjs` 按 `conversationId` 隔离流 |
| Worktree 隔离 | （产品层无同等能力） | `worktree-service.mjs` 按 `conversationId/taskId` 路径 + IPC 过滤 |
| 纠偏 / 排队 | Enter 忙时默认 **queue**；纠偏在**会话尾**气泡；QueueDock 仅 follow-up | 默认 `followUp`；`PendingSteeringBubble` + `QueueDock` 只显示排队追问 |
| Think 展示 | ReasoningRow 折叠 | `DshThinkBlock.tsx` + `reasoning-heuristics.ts` |
| Composer 统计 | StatsLine + ContextMeter | `ComposerStatsDock.tsx` + `context-breakdown.mjs` |
| 沙箱 | `dsh-sandbox` | `electron/vendor/dsh-sandbox` + `sandbox-service.mjs` |
| MCP 工具名 | `mcp__<server>__<tool>` | `mcp-service.mjs` 已改为双下划线前缀 |
| 会话 fork 安全 | 仅已完成轮次尾部可分支 | 仅最后一条 assistant、非 streaming、无待处理纠偏时可点分支 |
| steer/followUp 串扰 | 按 session 校验 | `conversationId` 校验 + `scopedWebContents` |
| Git 检查点归属 | — | `list/diff/restore/delete` 按 `conversationId` 校验 |
| 忙时 Enter 快捷切换 | Composer `EnterBehaviorRow` | `ComposerBusyEnterToggle` + 设置 → 对话 |
| 后台运行指示 | 侧栏 running | `chat:listRunningConversations` + `ThreadRunningIndicator` |
| 中断轮次标记 | `interrupted` | `agentEntry.interrupted` + 消息「已中断」样式 |

## TaskWeaver 个性化（保留，不要求与 DSH 一致）

- **成本感知路由与能力作品集**：`routing-portfolio-service.mjs`、`RoutingPortfolioSettingsPanel.tsx`、`pricing/registry.json`
- **DAG 多 Agent 编排**：`orchestration-service.mjs`、`dag-scheduler.mjs`、任务看板 UI（非 DSH subagent 会话树模型）
- **按任务 git worktree 与合并**：`worktree-service.mjs`、`WorktreeMergeActions.tsx`
- **Git 检查点 / 自动快照**：`git-service.mjs`、`autoSnapshotOnTurn`、变更高风险前备份
- **线程列表**：置顶、归档、搜索（含 jsonl 全文）、多工作区线程
- **工作模式**：`goal` / `plan` / `code` 与意图注入（`user-intent.mjs`）
- **权限规则表**：`permission-rules-store.mjs`（超出 DSH preset 的 deny/allow 模式）
- **权限模式 `on-risk`**：启发式审批（DSH 为 ask + preset 组合）
- **自定义 Provider / OAuth**：`custom-provider-service.mjs`
- **MCP 市场与加密 env**：`mcp-marketplace.mjs`（DSH 为通用 Cordis MCP 客户端）
- **插件市场占位**：`PluginsMarketplaceView.tsx`
- **毕设 / 中文产品文案**

## 执行层路线（2026-09 决策）

- **目标**：对话与工具执行迁到 **DSH Host（Cordis + ApiProxy）**，不再以 Pi `createAgentSession` 为长期方案。
- **过渡**：当前仍用 `vendor/runtime` Pi；行为向 DSH 收敛，详见 [DSH运行时迁移方案.md](./DSH运行时迁移方案.md)。
- **保留**：路由作品集、DAG 编排、worktree、Git 检查点、线程 UI。
- **内嵌而非整站**：对话 UI 走 **mux 事件 + projection** 与 `client-runtime` / `ui-conversation`（TaskWeaver 壳层主权），**不**用 Host 整页 WebView。原则见 [DSH内嵌集成原则.md](./DSH内嵌集成原则.md)。

## 架构差异（知情即可）

| 项 | DSH | TaskWeaver（现状 → 目标） |
|----|-----|---------------------------|
| 持久化 | 版本化 Session 事件日志 + coordinator | 现状：UI json + Pi jsonl → **目标：DSH session 事件** |
| Fork 模型 | `atSeq` 事件边界 | UI 切片 + `session-fork.mjs` 按 UI 消息条数截断 jsonl |
| 扩展 | Cordis 插件 | Pi `DefaultResourceLoader` + `electron/extensions` |
| 多 Agent | Subagent 子会话、interrupt、树形 UI | Planner + DAG + 子任务 jsonl |
| Auto-review | `dsh-auto-review` | 轻量版 + `autoReviewReads` 偏好（非完整审计事件） |

## P1 已落地（2026-09）

1. **Fork**：`session-fork.mjs` 按 UI assistant 轮次对齐 `getBranch(cutLeafId)`；`scripts/test-session-fork.mjs`。
2. **中断轮次修复**：`session-repair.mjs` 修剪末尾空 assistant；启动时 `repairAllConversationSessions` + `ensureSession` 单次修复。
3. **审批 UX**：`ApprovalPanel` 嵌入 Composer（`composer-approval-slot`），去掉全屏遮罩。
4. **Auto-review 轻量**：`permission-service.mjs` 工作区内 `read/grep/find/ls` 在 ask 模式免弹窗。
5. **Windows 沙箱**：`electron/vendor/dsh-sandbox/WINDOWS.md` 说明；probe 返回 `note`。
6. **Enter 行为**：设置 → **对话** → `ChatBehaviorSettingsPanel`（busyEnter 持久化）。
7. **P2 对齐（2026-09）**：Composer 忙时 Enter 芯片、侧栏后台运行点、`interrupted` 持久化、只读 auto-review 开关。

## permissionMode ↔ DSH 审批（阶段 D）

| TaskWeaver | DSH `sessions.create` preset | `approval/requested` | TaskWeaver 桥接 |
|------------|------------------------------|----------------------|-----------------|
| `ask` | `code` | Host 照常发起 | `permission:prompt`；5 分钟无响应 → `rejected` |
| `on-risk` | `code` | Host 照常发起 | 启发式自动 `allowed-once`；高风险仍弹窗 |
| `full` | `code`（见下） | Host 仍可能发起 | 桥接自动 `allowed-once`，不弹窗 |

**已知限制**：ApiProxy 暂无对存活会话追加 `permission/preset` / `approval/policy` 的 RPC；`full` 不能把 DSH agent 重挂为 `danger-full-access`（`approval: never`）。完整访问在 TaskWeaver 侧由 `sandbox-policy`（`permissionMode === 'full'`）与 DSH 桥接自动批准共同体现。实现：`electron/backend/dsh-permission-map.mjs`、`dsh-chat-service.mjs`。

**生命周期**：切换线程、删除线程、应用退出时 `rejectPendingApprovals` 拒绝悬挂审批（`register-ipc.mjs` + `chat.stop()`）。

## P3 已落地（2026-09，本轮「全部开始」）

1. **Compaction 持久化**：`compaction_end` 与 `/compact` 写入 `taskweaver-threads` 消息（`compaction` 行）；流事件带 `id` 防重复。
2. **审批审计**：`approval-audit.mjs` → `conversations/<id>.approval.jsonl`（`approval/asked`、`approval/decided`、`approval/review`）；IPC `permission:listApprovalAudit`。
3. **MCP 旧名**：`mcp_<server>_<tool>` 与 `mcp__<server>__<tool>` 双注册。
4. **Git 检查点忙检查**：`assertNotBusy(conversationId)`；restore/delete 可传 `conversationId`（仅阻塞该会话 lane）。
5. **Windows ACL**：`windows-acl.mjs` + `npm run sync:dsh-windows-acl`；`sandbox-service` 在 win32 探测到 runner 时启用。
6. **Subagent 树 UI**：`SubagentSessionTree` 在 DAG 侧栏展示依赖树（与 DSH 独立 subagent jsonl 差异化并存）。

## 仍可继续（非阻塞）

- Pi jsonl 与 UI 消息的完全双向单源（compaction 摘要字段级对齐 Pi branch_summary）
- DSH 完整 `dsh-auto-review` 模型审查链（非规则/轻量 auto-review）
- Windows runner 纳入 `make-mac-app` / CI 预同步（当前需本机 sync）
- 子任务独立 jsonl 子会话（与 DAG 编排二选一或混合）

## 代码索引（TaskWeaver）

- 聊天 / IPC：`electron/backend/dsh-chat-service.mjs`、`register-ipc.mjs`
- 前端会话：`src/features/app/useAppBackend.ts`、`src/App.tsx`
- DSH 样式：`src/styles-dsh-parity.css`
- 对齐说明维护：本文件
