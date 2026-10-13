# TaskWeaver Node 后端

`backend/` 是桌面应用的 Node 服务端，不依赖 Electron。正式 macOS App 由原生 Swift WebView 壳启动 `backend/shell/run.mjs`；React 界面通过只监听本机 loopback 的 Shell HTTP / SSE 桥通信。`app-server.mjs` 的 stdio JSON-RPC 是独立协议实现，不再承载桌面 UI。

| 路径 | 职责 |
|------|------|
| `app-server.mjs`、`rpc/` | 独立 JSON-RPC 服务与 stdio 生命周期 |
| `compose-services.mjs`、`ipc/` | 服务装配与 IPC handler |
| `agent/z-host/` | Z Host 运行时解析和生命周期 |
| `platform/` | Swift Keychain、网络与桌面能力的后端适配 |
| `shell/` | 正式桌面和浏览器开发共用的 Shell HTTP / SSE 桥；HTTP 默认关闭 |
| `../contract/channels.mjs` | UI 与后端之间的唯一通道契约 |

## 开发

- `pnpm run dev`：Swift WebView 壳、React UI 与开发版 Node 后端。
- `pnpm run dev:browser`：浏览器调试 React UI；该脚本显式启用受限的 loopback Shell HTTP 服务。
- 直接运行 `backend/shell/run.mjs` 会因 HTTP 默认关闭而退出；本地浏览器调试请使用 `dev:browser`。

## 打包

`pnpm run app` 构建原生 `.app`，`pnpm run install:app` 安装该原生包，`pnpm run app:dmg` 生成 ZIP 与 DMG。打包过程会把嵌入式 Node、后端、契约、Z Runtime 和 `vendor/opencodex` 放入应用资源目录；安装用户不需要单独下载 OpenCodex。

OpenCodex 本地代理按需由 TaskWeaver 管理为子进程。它与 Z Host 的独立运行时进程均由应用后端启动；进程拆分不代表需要额外安装第三方运行时。
