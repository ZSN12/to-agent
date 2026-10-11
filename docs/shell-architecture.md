# 桌面 Shell 架构（与 Electron 并行）

## 目标

- **UI 不变**：继续用现有 Vite/React 产物（`src/` → `dist/`），视觉与交互与当前 Electron 窗口一致。
- **Agent 跨平台**：Z Host 与后端逻辑始终在 **Node**（`host-node` / 系统 Node ≥ 22.18），不绑定 macOS。
- **壳很薄**：macOS 用 **Swift + WKWebView**；Windows 后期用 **WebView2**（或 Tauri 等）加载同一 `dist`，连接同一 **Shell HTTP API**。

```
┌─────────────────┐     HTTP invoke + SSE      ┌──────────────────────────┐
│  React UI       │ ◄────────────────────────► │  backend/shell/run.mjs   │
│  (Vite / dist)  │   /shell/v1/invoke|events  │  + compose-services      │
└─────────────────┘                            │  + registerIpc (shim)    │
        ▲                                      └────────────┬─────────────┘
        │ WKWebView / WebView2                               │ spawn
┌───────┴─────────┐                                          ▼
│ 平台 Shell App  │                               Z Host (Node 子进程)
│ macOS / Win     │
└─────────────────┘
```

## Shell HTTP API

| 路径 | 说明 |
|------|------|
| `GET /shell/v1/health` | 健康检查 |
| `GET /shell/v1/events` | SSE，推送原 `webContents.send` 事件 |
| `POST /shell/v1/invoke` | `{ channel, args }` → 与 preload `invoke` 相同 |

渲染进程通过 `src/shell/bootstrap.ts` 安装 `window.taskweaver`（生成于 `scripts/gen-shell-bridge.mjs`）。

开发时打开：`http://127.0.0.1:5173/?shellApi=http://127.0.0.1:<port>`。

## Windows 后期成本

- **不需要**重写 UI。
- **需要**一个 Win 壳（WebView2 + 可选托盘/单实例），启动同一 `run.mjs`（或打包后的 `taskweaver-shell-server`），环境变量与 macOS 一致。
- 文件夹选择等原生对话框在 `backend/platform/shell-platform.mjs` 里按平台扩展（macOS 已用 `osascript`）。
- Shell 后端**不**模拟 Chromium `safeStorage`；凭据统一走 `credential-store` 的 `tw-b64:` 文件编码（与 Electron 钥匙串格式分离）。

## 相关环境变量

- `TASKWEAVER_SHELL_SERVER=1` — 后端以 Shell 模式运行（跳过 Electron sender 校验）。
- `TASKWEAVER_SHELL_HOST` / `TASKWEAVER_SHELL_PORT` — HTTP 监听地址。
- `TASKWEAVER_UI_URL` — 壳加载的页面（开发默认 Vite）。
- `TASKWEAVER_SHELL_API` — 壳传给 UI 的 API 根 URL（也可走 query `shellApi`）。

## 开发命令

```bash
pnpm run dev:shell          # Vite + Shell 后端（见 package.json）
pnpm run dev:shell:mac      # 上述 + 构建并启动 macOS WKWebView 壳（需 Xcode CLI）
```

**默认桌面路径**：`pnpm dev`（Vite + Swift 壳，壳内自启 Node 后端）与 `pnpm run app`（Swift `.app` 打包）。Electron 窗口已弃用，仅保留 `pnpm run app:legacy-electron` 供对照。

桌面 Node 后端源码在 **`desktop/`**（见 `desktop/README.md`）。
