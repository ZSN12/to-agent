# Z Host 适配层（Phase 2 脚手架）

TaskWeaver 将把 Agent 后端集成从 **DSH `dsh web`** 迁到 **Z Runtime**（`vendor/z-runtime/`，包名 `@z/*`）。本目录是迁移后的集成代码归属地；**当前仍由 `../dsh-host/` 实际运行**，此处仅文档与 re-export，避免一次性改全仓库 import。

详见 `docs/完整改造.md` 阶段 2。

## 将迁入本目录的模块

| 未来文件 | 来源 / 职责 |
|----------|-------------|
| `resolve-runtime.mjs` | 运行时根目录、`lib/bin.js` / monorepo CLI 启动布局；开发 `vendor/z-runtime`，打包 `Resources/z-runtime` |
| `spawn-host.mjs` | 子进程生命周期、就绪探测；环境变量由 `DSH_*` 逐步改为 `Z_*`（如 `Z_HOME`、`Z_TASKWEAVER_EMBEDDED`） |
| `z-api-client.mjs` | 加载 `@z/dsh-client-connection` 的 `WebApiClient`（现 `dsh-api-client.mjs` + `@deepseek-ai/*`） |

## 运行时解析（已实现，仍在 `dsh-host/resolve-runtime.mjs`）

| 变量 | 作用 |
|------|------|
| `TASKWEAVER_USE_Z_RUNTIME=1` | 新代码请用 `resolveTaskWeaverRuntimeRoot()`，走 Z 路径而非 DSH |
| `TASKWEAVER_Z_RUNTIME` | 开发/测试覆盖 Z runtime 根目录 |
| （默认） | `resolveDshRuntimeRoot()` → `vendor/taskweaver-dsh-runtime` 或 `dsh-source` |

Z 路径候选（无 `dsh-source` 回退）：

- `vendor/z-runtime`
- 打包：`Resources/z-runtime`（需在阶段 3 更新 `electron-builder.yml`）

依赖目录仍为 `runtime-packages/`（与现 DSH deploy 一致）。

## 本阶段未做（避免破坏现有 Host）

- 未把 `electron/`、`src/`、`scripts/` 的 `dsh-host` import 批量改为 `z-host`
- 未改 `electron-builder` 打包产物名（仍为 `taskweaver-dsh-runtime`）
- 未执行 `vendor/z-runtime` 源码提取（阶段 1）

## 开发验证（Z 路径，需本地已有可运行 runtime 目录）

```bash
TASKWEAVER_Z_RUNTIME=/path/to/z-runtime node scripts/test-dsh-runtime-resolution.mjs
# 或将来：TASKWEAVER_USE_Z_RUNTIME=1 npm run dev
```

Re-export 入口：`./resolve-runtime.mjs`（转发至 `../dsh-host/resolve-runtime.mjs`）。
