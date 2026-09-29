# Z Host

TaskWeaver Agent 后端基于 **Z Runtime**（`vendor/z-runtime/`，`@z/*`）。打包产物在 **`Resources/taskweaver-z-runtime`**（`runtime-packages/@z/*`），与 `electron-builder.yml` 一致。

## 模块

| 模块 | 说明 |
|------|------|
| `index.mjs` | 对外统一 import |
| `resolve-runtime.mjs` | `resolveTaskWeaverRuntimeRoot`、`resolveTaskWeaverHostLaunch`、`resolveRuntimeNodePath` |
| `spawn-host.mjs` | `createZHostManager`（子进程 `dsh web`） |
| `z-api-client.mjs` | `createZApiClient`（`@z/dsh-client-connection`） |

## 解析顺序（开发）

1. `TASKWEAVER_Z_RUNTIME` 覆盖
2. `vendor/taskweaver-z-runtime` deploy（仍可读 legacy `taskweaver-dsh-runtime`）
3. `vendor/z-runtime` monorepo（需本地 `build:lib:host` + client）

## 验证

```bash
node scripts/test-z-runtime-resolution.mjs
node scripts/test-z-host.mjs
npm run test:models
```
