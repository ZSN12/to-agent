# 阶段 5 剩余项（未纳入本轮最小路径）

**可合并子集（2026-10-09）**：5.1 bootstrap、5.2 IPC 拆分、5.3 `chat-turn-pipeline`、5.7 `App.tsx` 壳层 — 见 `docs/optimization-plan-progress.md` 核对表与 `npm run test:all`。

对照 `毕设优化计划.md` 阶段 5，以下仍在 backlog：

- **5.2（续）**：✅ `electron/backend/ipc/context.mjs`（`createIpcRuntimeContext`）
- **5.3（续）**：✅ steer/followUp → `runQueuedBehavior`；`tasks:sendMessage` → `runTaskMessage`
- **5.4**：✅ 按会话 `getConversationRuntimeContext`；UI 快照 `refreshUiSnapshot` / `getUi*`
- **5.6**：✅ `thread-store` → `json-store.update`（`test-thread-store-concurrency`）
- **5.7（续）**：`Composer`、`MainConversation`、`ModelSelect` 等；已拆：`AppSidebar`、`SettingsPage`、`UsageSettings`、`Message`/`DiffReviewCard`、`DagPanel`/`TaskConversation`、`shared/ui-utils.ts`
- **5.8**：✅ `useConversationRun` 等 hooks；`useAppBackend` 组合层
- **5.5 续**：✅ `src/shared/time-label.ts`
- **5.9**：✅ `dsh-chat-service.mjs` ~385 行；`dsh-chat/` 子模块齐全
- **5.10–5.14**：model-orchestration 拆分、CSS、checkJs、5.14 回归与 v1.3.0

建议每个子项独立分支 + `npm run test:all` 绿后再合并。
