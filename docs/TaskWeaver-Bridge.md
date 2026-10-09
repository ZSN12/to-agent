# TaskWeaver 模型桥（bridgeKind）

## 契约

`taskweaver/models.json` 中 `api: "taskweaver-bridge"` 的提供方经 Electron 同步写入 Host `llm-taskweaver-bridge` 命名空间；其余提供方仍写入 `llm-pi-ai`。

| bridgeKind | 说明 |
|---|---|
| `cursor` | Composer / Cursor 进程内传输（`packages/taskweaver-bridge-transport`） |
| `google-antigravity` | 进程内 Google CCA（`ocx export` 写入 `baseUrl` / `project`） |
| `openai-compat-relay` | `relayBaseURL` + `TASKWEAVER_BRIDGE_RELAY_API_KEY`（OpenAI Chat Completions SSE） |

产品名：**扫描本地官方 Agent**（见 `docs/Local-Agent-Integration.md`）。实现上走 `ocx export`（**不**拉起 10100），经 `local-agent-registry` 映射为 `bridge-composer` / `bridge-antigravity` 并同步 Host；成功后会移除 `models.json` 中的 `opencodex` 块。代码在 `electron/backend/model-sync/`。

### 默认提供方

首次启动（或缺少条目时）会从 `registry/taskweaver-models.defaults.json` **追加** `bridge-composer`（不覆盖用户已有块）：

```json
{
  "providers": {
    "bridge-composer": {
      "api": "taskweaver-bridge",
      "bridgeKind": "cursor",
      "models": [{ "id": "cursor/composer-2.5-fast", "name": "Composer Fast" }]
    }
  }
}
```

模型 key 形如 `bridge-composer/cursor/composer-2.5-fast`（provider 路由 id + 模型 id）。

## API-only Z Host（无 DSH 浏览器 UI）

Electron 以 `Z_TASKWEAVER_EMBEDDED=1`（兼容 `DSH_TASKWEAVER_EMBEDDED`）拉起 `dsh web`，Host 就绪日志为 `z web:`：`web` profile 使用自有组合包 **`@z/dsh-taskweaver`**（不再叠 `@z/dsh-web-app`）。嵌入式 **不**挂载 `@z/dsh-web-frontend` / `app:web-surface`；Cordis 上 **关闭** base 的 `web` / `web-search-taskweaver` / `tool-web`，deploy **不**再强依赖 `@z/dsh-web`。Host 只保留 webserver + `/api`（`connection` / `api-remotes` / `client-runtime`），**不挂** `modules` / `ui-*` / `client-hmr`。

`build-z-runtime`：host tsdown + 最小 client 编译（SessionManager / `web-api-client`，保留 `ui-slots`）；冒烟后 prune `dsh-web-frontend` 与 UI roster 包。自检：`pnpm run test:taskweaver-api-only-host`（需先 `node scripts/build-z-runtime.mjs`）。

fork 已从 `vendor/z-runtime` 删除 DSH 浏览器源码（`apps/web`、`packages/client/ui-*` 除 `ui-slots`、`hmr`/`modules`/`locale`/`web` 壳等）。**保留** `packages/web/*` 工具（web_search 等）以及 `packages/client/connection` + `runtime`。

## 方案 C 完成度（摘要）

| 阶段 | 状态 |
|------|------|
| 0 骨架 + 双写 sync + 默认 bridge-composer | 已交付 |
| 1 transport（cursor + antigravity + relay mock/实装） | 已交付（relay 需配置 URL；antigravity 需 export 元数据） |
| 2 聊天闭环、扫描 IPC、`bridge:*`、无 10100 默认扫描 | 已交付 |
| 3 反代 backend、默认去 10100 扫描路径 | 已交付（启动时仅 bridge 用户不再 autostart ocx） |
| 4 完全移除主路径 `spawnOcxProxy` / 预设迁移 | 已完成（10100 health/自动拉起已删；聊天仅 `bridge-composer/*`） |
| model-sync 单入口（`electron/backend/model-sync/`） | 已交付；ocx 仅 CLI export/login |

## 验收脚本

- `node scripts/test-taskweaver-bridge-models.mjs` — JSON → bridge profile 形状
- `npm run test:taskweaver-bridge-sync` — 默认 models.json + Host `settings.yaml` 双写（需 `build:z-runtime`）
- `node scripts/bridge-smoke.mjs --kind cursor` — 单轮无工具 mock stream（`BRIDGE_SMOKE_MOCK=1`）
- `npm run build:z-runtime` — 含 bridge 包与 transport 打入 staging

## 阶段 0 验收说明

- 选 `bridge-composer/*` 且 transport 未加载时：应得到 `BRIDGE_BACKEND_PENDING`（**不会**误走 10100）。
- transport 加载且 `BRIDGE_SMOKE_MOCK=1` 时：cursor backend 可返回 mock stream。
- `llm-pi-ai` 中**不应**出现 `bridge-composer` 路由（见 `test-taskweaver-bridge-sync-e2e.mjs`）。
