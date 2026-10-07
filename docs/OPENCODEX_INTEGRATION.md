# OpenCodex 与 TaskWeaver 集成说明

## 架构（不会把整个 Agent 交给 OpenCodex）

- **Z Host**：工具、会话、权限、预设 — 与 MiMo 等模型共用。
- **OpenCodex（ocx）**：仅作本机 **模型 HTTP 网关**（默认 `http://127.0.0.1:10100/v1`），把 Cursor / Antigravity 等订阅模型变成 OpenAI 兼容 API。

## 用户无需单独「装两个 App」时的行为

1. **可选内置**：`package.json` 的 `optionalDependencies` 含 `@bitkyc08/opencodex`；`npm install` 后 TaskWeaver 优先使用 `node_modules` 里的 `ocx`。
2. **启动时**：若目录里已有 `opencodex/*` 模型，主进程会执行 `ocx ensure` 并探测 10100 端口。
3. **设置 → 扫描 OpenCodex**：调用 `ocx ensure` + `ocx export --client pi` + 写入 `taskweaver/models.json` + 同步 Host（不再只读陈旧的 `opencodex-export.json`）。
4. **仍须一次 OAuth**：Cursor 等账号在 ocx 侧登录（`ocx login cursor`），与 DSH 相同；TaskWeaver 不保存 Cursor 私有凭据，只保存 ocx 的 loopback 占位 key。

## composer-2.5 工具后续轮次空回复 / 卡住

Cursor adapter 在工具结果后续轮次若走 **`resumeAction`**，composer-2.5 会在 Cursor 服务端继续调 **原生 Shell/Grep/Read**（或直接空 `stop`），客户端（DSH / TaskWeaver）只看到卡住或空回复。合入的修复是对 composer-2.5 改为 **`userMessageAction`** 续写（OpenCodex ≥ 2.79）。TaskWeaver 启动代理时执行 `ocx restart`，避免 PATH 上的旧守护进程一直占着 10100。

## 未打包 ocx 时

- 回退到 PATH / `~/.local/bin/ocx`（用户自行安装的 OpenCodex CLI）。
- 若都不可用，扫描与 Composer 调用会报错并提示安装或执行 `npm install` 拉取 optional 依赖。

## 与「完全内置」的差异

将 ocx **打进 DMG** 会显著增大安装包（含 Bun 运行时）。当前策略是 **npm optional 依赖 + 打包时 asarUnpack**，在发行版 CI 执行 `npm ci` 即可带入；**不把 ocx 源码并入 Agent 循环**。

若产品要求零命令行依赖，可在 `electron-builder` 的 `extraResources` 增加预构建的 `opencodex/` 目录，并由 `opencodex-binary.mjs` 解析。
