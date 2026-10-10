# TaskWeaver Desktop（Node 后端）

本目录是 **桌面端 Node 后端**，不依赖 Electron 运行时。

| 路径 | 职责 |
|------|------|
| `backend/` | 服务装配、IPC handler、聊天/编排/模型/MCP 等 |
| `ipc/channels.mjs` | UI ↔ 后端 invoke 契约（唯一来源） |
| `shell/` | Shell HTTP 服务与 CLI 入口 `run.mjs` |
| `platform/` | Swift/WebView2 壳用的最小 `app`/`dialog`/`ipcMain` 适配 |
| `agent/z-host/` | Z Host 子进程启动、runtime 解析 |
| `vendor/` | 打包用 registry 等静态产物 |

**启动**

- 开发/壳：`node desktop/shell/run.mjs`（或由 Swift `TaskWeaverShell` 拉起）
- 统一 API：`desktop/backend/start-desktop-backend.mjs` → `startDesktopBackend()`

UI 在 `src/`；契约生成见根目录 `pnpm run gen:shell-bridge` 与 `pnpm run check:ipc`。
