# 阶段 5 剩余项（未纳入本轮最小路径）

**可合并子集（2026-10-09）**：5.1 bootstrap、5.2 IPC 拆分、5.3 `chat-turn-pipeline`、5.7 `App.tsx` 壳层 — 见 `docs/optimization-plan-progress.md` 核对表与 `npm run test:all`。

对照 `毕设优化计划.md` 阶段 5，以下仍在 backlog：

- **5.2（续）**：`ipc/context.mjs`（会话 runtime 缓存抽离）；已有：`wire-backend-ipc.mjs`、`compose-services.mjs`、`scheduled-job-run.mjs`、薄 `register-ipc.mjs`
- **5.3（续）**：✅ steer/followUp → `runQueuedBehavior`；`tasks:sendMessage` → `runTaskMessage`
- **5.4**：去掉 `cached*`，按会话 `getConversationRuntimeContext`
- **5.6**：`thread-store` → `json-store.update`
- **5.7（续）**：`Composer`、`MainConversation`、`ModelSelect` 等；已拆：`AppSidebar`、`SettingsPage`、`UsageSettings`、`Message`/`DiffReviewCard`、`DagPanel`/`TaskConversation`、`shared/ui-utils.ts`
- **5.8**：拆 `useAppBackend.ts`
- **5.9–5.14**：DSH / model-orchestration 拆分、CSS、checkJs 等

建议每个子项独立分支 + `npm run test:all` 绿后再合并。
