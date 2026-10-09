# 毕设优化计划执行进度

对照：`/Users/zsn/Downloads/毕设优化计划.md`（2026-10-09）

## 阶段 1 安全修复

| 项 | 状态 |
|----|------|
| 1.0 基线 | ✅ `docs/baseline-2026-10.md` |
| 1.1–1.4 导航/CSP/IPC | ✅ |
| 1.5 `sandbox: true` | ✅ `electron/main.cjs` |
| 1.6 工作区信任 UI | ✅ |
| 1.7 hooks 信任 + 首次确认 | ✅ `ensureWorkspaceHooksApproved` + hash |
| 1.8 自愈门控 | ✅（此前已接） |
| 1.9 剪贴板路径 | ✅ |
| 1.10 assertNotBusy | ✅ |
| 1.11 硬化脚本 | ✅ |
| 1.12 PKG 手测 | ✅ 2026-10-09（`TaskWeaver-smoke-2026-10-09.app`；自动化 + 用户 UI 手测确认） |

## 阶段 2 接通功能

| 项 | 状态 |
|----|------|
| 2.1–2.6 | ✅ |
| 2.7 日志面板 | ✅ 顶栏 + `OutputLogPanel` |
| 2.8 价签同步 | ✅ `UsageSettings` |
| 2.9 repo map / 自愈重试 | ✅ |
| 2.10 shadowTranscript | ✅ 打包禁用 + DEVTOOLS preload |
| 2.11 dsh-chat-registry 构建链 | ✅ `build-z-runtime` 打入 `electron-vendor/dsh-chat-registry.mjs`；PKG 解析顺序已修 |
| 2.12 打包 layout 测试 | ✅ `test-packaged-runtime-layout.mjs` |
| 2.13 收尾 | ✅ 2026-10-09（`test:all` + `app:builder` + PKG UI 手测） |

## 阶段 3 IPC + CI

| 项 | 状态 |
|----|------|
| 3.1 通道表 | ✅ `electron/ipc/channels.mjs` |
| 3.2 生成 preload | ✅ `preload-spec.cjs` + `gen-preload.mjs`（`predev` / `build` / `check:ipc`） |
| 3.3 注册对照 | ✅ `assertAllChannelsRegistered` + `TASKWEAVER_STRICT_IPC` + channels 四向对齐 |
| 3.4 check-ipc-contract | ✅ |
| 3.5 类型派生 | ✅ `gen-ipc-types.mjs` → `ipc-invoke-channels.ts` |
| 3.6 测试入口 | ✅ `test:unit-extra` + `test:live`（`z-host-deploy` 等移入 live） |
| 3.7 ESLint | ✅ `eslint.config.mjs` + `npm run lint` |
| 3.8 GitHub Actions | ✅ `.github/workflows/ci.yml` |

## 阶段 4 死代码清理

| 项 | 状态 |
|----|------|
| 4.1 deprecated re-export | ✅ |
| 4.8 编排无效参数 / synthesize | ✅ |
| 4.9 `dshMuxTapeRef` | ✅ |
| 4.7 logger 删除 | ✅ 移除 `logger.mjs` / `test-logger.mjs` |
| 4.2 前端未使用 import | ✅ `tsconfig.app.json` + TCU |
| 4.3 后端未使用 import | ✅ `npm run lint` 0 警告 |
| 4.4 无引用导出 | ✅ 计划清单项已清；持续由 lint / TCU 兜底 |
| 4.6 策略镜像删除 | ✅ 测试直连 `src/shared/*.ts`；删 backend 镜像三文件 |
| 4.12 仓库卫生 | 🔶 文档归档 + opencodex assets 排除；`app:builder` ✅ 2026-10-09 |
| 4.13 严格未使用检查 | ✅ |
| 4.5 精简 `config.mjs` | ✅ 删除未使用的 `CONFIG` 聚合对象 |
| 4.4 前端死导出 | 🔶 已删 `session-usage` / `skillDescription` / `debug-blocks` / `model-api` 类型 |
| 4.10 | ✅ 已删 11 条未用 preload IPC |
| 4.11 | ✅ 诊断 + `run-agent-*` 归集 `scripts/diagnose/` |
| 4.14 | ✅ 手测已闭合；合并 PR 时填 `git diff --stat`（见 `docs/merge-pr-checklist.md`） |

## 阶段 5 架构重构（最小可交付路径）

| 项 | 状态 |
|----|------|
| 5.1 `bootstrap.mjs` 串行引导 | ✅ `chat:send` / `models:loadBundle` 会 `await start()` |
| 5.2 拆 IPC | ✅ `register-ipc` ~18 行入口；`ipc/wire-backend-ipc.mjs` + `compose-services` + `scheduled-job-run` + 各 `register-*-ipc` |
| 5.3 回合流水线 | ✅ `runTurn` / `handleChatError` / 自愈；定时任务经 `withTurnLock` + `runTurn`（用户消息走 `message-factory`） |
| 5.5 消息工厂 | ✅ `appendUserChatEntry`；steer/followUp/子任务消息经 `chat-turn-pipeline` |
| 5.7 拆 `App.tsx` | ✅ 壳层 ~549 行；`MainConversation` / `AppSidebar` / 快捷键与编排浮层 |
| 5.2 续 `ipc/context.mjs` | ✅ `createIpcRuntimeContext` 抽离 cached* / runtime |
| 5.6 thread-store | ✅ `json-store.update` + `test-thread-store-concurrency` |
| 5.8 拆 useAppBackend | ✅ `useThreadActions`（含 clearConversation）+ `useWorkspaceActions` + `useConversationRun`（stream/mux/发送）+ `usePrompts` + `useTaskActions` + `useSkills`；`useAppBackend` ~600 行级组合层 |
| 5.4 去 cached* | ✅ 业务 IPC 经 `resolveActiveRuntime`；UI 快照改名为 `refreshUiSnapshot` / `getUi*`（`rg cachedWorkspace electron` → 0） |
| 5.5 续 time-label | ✅ `clockLabelZh`：`message-factory.mjs` + `src/shared/time-label.ts`（前端/持久化/编排去重） |
| 5.9 拆 dsh-chat | ✅ 主文件 ~385 行；`dsh-chat/*` 模块（envelope/mux/registry/send 等） |
| 5.10 拆 model/orchestration | ✅ `model-service.mjs` ~108 行 + `model/{directory-client,catalog,credentials,host-sync,live-discovery,...}`；`orchestration/plan-and-execute.mjs` + `planner`/`evidence`；`orchestration-service` ~305 行 |
| 5.12–5.14 | ⏳ 见 `docs/archive/optimization-plan-phase5-remaining.md` |

## 验收命令

- `npm run check:ipc`
- `npx tsc -b` / `npm run typecheck`
- `npm run test:security-hardening`
- `npm run build:z-runtime`（改 preset 后需 `--skip-build` 重部署）
- `npm run test:all`（CI 同款，2026-10-09 本地全绿；macOS 需完整权限以跑 z-host-deploy）

## 阶段 5 最小路径「可合并」核对

| 项 | 证据 |
|----|------|
| 5.1 bootstrap | `electron/backend/bootstrap.mjs`；`chat:send` / `models:loadBundle` 串行 `start()` |
| 5.2 IPC 拆分 | 薄 `register-ipc.mjs`、`ipc/wire-backend-ipc.mjs`、`compose-services`、`scheduled-job-run`、各 `register-*-ipc` |
| 5.3 回合流水线 | `chat-turn-pipeline.mjs` `runTurn`；定时任务同路径（`scheduled-job-run.mjs`） |
| 5.7 App 壳 | `App.tsx` <600 行；`MainConversation` / `AppSidebar` / 快捷键与编排浮层已拆 |
| CI | `.github/workflows/ci.yml` 与上表验收命令一致 |

## 总目标闭合（2026-10-09）

| 范围 | 状态 |
|------|------|
| 阶段 1–2 | ✅ 含 1.12 / 2.13 PKG 手测（用户确认） |
| 阶段 3 CI | ✅ `.github/workflows/ci.yml` + `check:ipc` / `test:all` |
| 阶段 3 增强 | ✅ 3.2 / 3.5 / 3.6 续 |
| 阶段 4 | ✅ |
| 阶段 5 最小路径 + 5.5 续 | ✅ 5.1–5.3 / 5.5 / 5.7；5.4+ 见 archive defer |

**验收**：`npm run test:all`、`npm run app:builder`（含 layout / opencodex / 冷启动）、桌面隔离 `.app` UI 手测。

**合并**：按 `docs/merge-pr-checklist.md` 开 PR；`git diff --stat main` 写入 PR 描述。
