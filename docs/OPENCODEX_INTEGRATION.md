# OpenCodex 与 TaskWeaver 集成说明

## 架构（不会把整个 Agent 交给 OpenCodex）

- **Z Host**：工具、会话、权限、预设 — 与 MiMo 等模型共用。
- **OpenCodex（ocx）**：仅作本机 **模型 HTTP 网关**（默认 `http://127.0.0.1:10100/v1`），把 Cursor / Antigravity 等订阅模型变成 OpenAI 兼容 API。

## 用户无需单独「装两个 App」时的行为

1. **内置 fork**：`vendor/opencodex` 为 TaskWeaver 维护的 OpenCodex 源码（`@taskweaver/opencodex`，`file:` 链接到 `node_modules`）；`npm install` 后优先使用其中的 `ocx`，**不依赖 npm 上的 `@bitkyc08/opencodex`**。
2. **启动时**：若目录里已有 `opencodex/*` 模型，主进程会执行 `ocx ensure` 并探测 10100 端口。
3. **设置 → 扫描 OpenCodex**：调用 `ocx ensure` + `ocx export --client pi` + 写入 `taskweaver/models.json` + 同步 Host（不再只读陈旧的 `opencodex-export.json`）。
4. **仍须一次 OAuth**：Cursor 等账号在 ocx 侧登录（`ocx login cursor`），与 DSH 相同；TaskWeaver 不保存 Cursor 私有凭据，只保存 ocx 的 loopback 占位 key。

## Cursor 工具名（已写入 vendor fork）

Z Host 工具在 Cursor wire 上为 `ocx_client_*`，Composer 常调裸名 `read` / `grep` / `bash`。改动在 **`vendor/opencodex/src/adapters/cursor/protobuf-events.ts`**（见 `vendor/opencodex/TASKWEAVER_FORK.md`），不再对 `node_modules` 打 postinstall 补丁。

验证：`npm run test:opencodex-fork`。改 vendor 后需 **`ocx restart`** 让守护进程加载新源码。勿用全局 `~/.local/bin/ocx`（多为未 fork 的上游包）跑 Composer。

**自更新**：fork 内 `ocx update` 不会从 npm 安装 `@bitkyc08/opencodex`；升级随 TaskWeaver 发版或仓库内 `npm install`。

## composer-2.5 工具后续轮次空回复 / 卡住

Cursor adapter 在工具结果后续轮次若走 **`resumeAction`**，composer-2.5 会在 Cursor 服务端继续调 **原生 Shell/Grep/Read**（或直接空 `stop`），客户端（DSH / TaskWeaver）只看到卡住或空回复。合入的修复是对 composer-2.5 改为 **`userMessageAction`** 续写（OpenCodex ≥ 2.79）。TaskWeaver 启动代理时执行 `ocx restart`，避免 PATH 上的旧守护进程一直占着 10100。

## 未安装 vendor 链接时

- 回退到 PATH / `~/.local/bin/ocx`（可能是上游 CLI，**无** TaskWeaver Cursor 工具名修复）。
- 推荐始终在仓库根 `npm install`，确保 `node_modules/@taskweaver/opencodex` 指向 `vendor/opencodex`。

## 与「完全内置」的差异

将 ocx **打进 DMG** 会显著增大安装包（含 Bun 运行时）。当前策略是 **npm optional 依赖 + 打包时 asarUnpack**，在发行版 CI 执行 `npm ci` 即可带入；**不把 ocx 源码并入 Agent 循环**。

若产品要求零命令行依赖，可在 `electron-builder` 的 `extraResources` 增加预构建的 `opencodex/` 目录，并由 `opencodex-binary.mjs` 解析。
