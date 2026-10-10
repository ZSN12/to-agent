# TaskWeaver Host

TaskWeaver Agent 后端基于 **Z Runtime**（`packages/runtime/`，`@taskweaver/*`）。打包产物在 **`Resources/taskweaver-z-runtime`**（`runtime-packages/@taskweaver/*`），与 `packaging/mac-shell-resources.yml` 一致。

## 模块

| 模块 | 说明 |
|------|------|
| `index.mjs` | 对外统一 import |
| `resolve-runtime.mjs` | `resolveTaskWeaverRuntimeRoot`、`resolveTaskWeaverHostLaunch`、`resolveRuntimeNodePath` |
| `resolve-host-executable.mjs` | 解析 Z Host 子进程用的 Node（打包内置 `Resources/host-node`，开发用 PATH 或 `TASKWEAVER_HOST_NODE`） |
| `spawn-host.mjs` | `createZHostManager`（子进程用 **Node** 跑 `lib/entry.js`，`TASKWEAVER_*` 环境变量；首次启动验证并迁移旧运行时数据；嵌入式 API-only） |
| `z-api-client.mjs` | `createZApiClient`（`@taskweaver/dsh-client-connection`） |

## 解析顺序（开发）

1. `TASKWEAVER_RUNTIME` 覆盖（`TASKWEAVER_DSH_RUNTIME`、`TASKWEAVER_Z_RUNTIME` 仅作兼容别名并告警）
2. `vendor/taskweaver-z-runtime` deploy（仍可读 legacy `taskweaver-dsh-runtime`）
3. `packages/runtime` monorepo（需本地 `build:lib:host` + client）

## 验证

```bash
node scripts/test-z-runtime-resolution.mjs
node scripts/test-z-host.mjs
npm run test:models
```
