# TaskWeaver 桌面架构

## 正式桌面链路

正式 macOS App 使用原生 Swift 窗口与 WKWebView 展示 React 界面。Swift 壳启动随包 Node 后端；React 页面通过只绑定 loopback 的 Shell HTTP/SSE 桥调用后端。后端组合模型、聊天、权限、MCP 与编排服务，再启动 Z Host 运行时。

```text
Swift App + WKWebView
    └─ React UI
       └─ loopback Shell HTTP / SSE
          └─ Node backend/shell/run.mjs
             ├─ Z Host runtime 子进程
             └─ 按需启动的 TaskWeaver OpenCodex 本地代理
```

安装包将 Node、后端、Z Runtime 和仓库内 `vendor/opencodex` 一起打包。用户安装 TaskWeaver 时不需要另行下载或全局安装 OpenCodex。OpenCodex 代理仍由后端按需管理为子进程。

## WebView / 浏览器 UI

正式应用把构建后的 React 页面打包到 `Contents/Resources/app/dist`，由 Swift 壳内的 WKWebView 通过本机 Shell HTTP 服务加载。服务仅绑定 loopback，并校验 Host、Origin 与每次启动随机生成的访问令牌；Swift 健康检查使用 HMAC 挑战验证后端身份，避免把令牌发送给抢占固定端口的进程。界面把令牌放在 URL fragment 中，调用与流式事件请求通过请求头认证。浏览器调试使用 Vite UI 和同一 Shell HTTP 后端；仅 Swift 壳、已打包应用或 `pnpm run dev:browser` 可以启用该入口。

```text
Vite / React UI
    └─ Shell HTTP invoke + SSE
       └─ backend/shell/run.mjs
          └─ Node backend services
```

渲染 UI 使用的 Shell HTTP 桥由 `scripts/gen-shell-bridge.mjs` 生成。Swift 壳负责启动、停止后端和限制 WKWebView 导航到本机应用页面。

## 凭据与平台能力

- 原生后端通过 Swift 平台层提供的 `$platform/secrets` 接口读写 macOS Keychain；配置文件只保存 Keychain 引用。
- 原生凭据读取会把旧 `tw-b64:` 凭据迁入 Keychain；旧 Chromium 密文无法迁移时会改名归档，原文件内容保留。
- 首次启动提示只读扫描凭据状态；关闭提示时才保存已关闭标记。
- WebView 页面经 Shell HTTP 调用 Swift 壳提供的本机平台能力；凭据仍由后端安全存储服务管理，不写入普通配置文件。

## 开发与打包命令

| 命令 | 用途 |
|------|------|
| `pnpm run dev` | 构建 React 页面并运行 Swift WebView 壳与开发版 Node 后端 |
| `pnpm run dev:browser` | 启动 Vite 与本机 Shell HTTP 后端 |
| `pnpm run app` | 构建 Swift 壳、React UI 和内嵌服务并生成 `.app` |
| `pnpm run install:app` | 构建并安装 Swift 壳 + React UI 应用 |
| `pnpm run app:dmg` | 构建 `.app`、ZIP 与 DMG |

桌面 Node 后端源码在 `backend/`，IPC 契约唯一来源为 `contract/channels.mjs`，Z Runtime 源码位于 `packages/runtime/`。
