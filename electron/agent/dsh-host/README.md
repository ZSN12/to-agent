# DSH Host 适配层

TaskWeaver 主进程通过 **DSH `dsh web` + ApiProxy 客户端** 驱动 Agent 运行时。

## 构建与路径

```bash
npm run build:dsh-runtime   # 产出 vendor/taskweaver-dsh-runtime（不入 git）
npm run test:dsh-host
npm run test:dsh-host-deploy
```

- 开发/打包解析：`resolve-runtime.mjs`（`vendor/taskweaver-dsh-runtime` → `dsh-source` monorepo）。
- 打包：`electron-builder.yml` 将 runtime 放入 `Resources/taskweaver-dsh-runtime`；`DSH_HOME` 在 `userData/dsh`。
- Api 客户端：`dsh-api-client.mjs` 从部署目录 `node_modules/@deepseek-ai/dsh-client-connection/...` 加载。

## 模块

| 文件 | 职责 |
|------|------|
| `resolve-runtime.mjs` | runtime 根目录与 `lib/bin.js` 启动布局 |
| `spawn-host.mjs` | 子进程生命周期、就绪探测 |
| `dsh-api-client.mjs` | 加载 DSH `WebApiClient` |

## 已知限制

- Deploy 闭包冒烟以 **web 启动** 为准；DSH 默认 `standard` preset 可能仍缺可选插件。TaskWeaver 主聊天与子任务使用 `code` / `taskweaver-*` preset。
- 模型 **OAuth/订阅** 不能自动映射到 DSH，仅 API Key 同步（见 `dsh-chat-service`）。
- TaskWeaver MCP 配置当前**未注入 DSH Host**。DSH 已内置 `@deepseek-ai/dsh-mcp-client`，支持通过 `dsh web --patch <Cordis YAML>` 加载 MCP 工具（可参考 `dsh-source/examples/mcp-memory/*.cordis.yml`）；TaskWeaver 仍使用独立 MCP 连接做配置测试，不能据此认为 DSH Agent 已能调用。接入前还需实现安全的加密凭据桥接、受控的 Cordis patch 生命周期/重载，以及实际工具调用和权限策略验证；在此之前设置页应继续显示未接入并禁用“启用 Agent 工具”。

详见 `docs/DSH运行时迁移方案.md`。
