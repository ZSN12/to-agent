# 本地官方 Agent 集成（自有化设想）

## 产品目标

用户在本机已登录的**官方 Agent / 订阅客户端**（如 Cursor Composer、Google Antigravity）应能被 TaskWeaver **发现**，其模型列表进入我们的模型目录，并在对话时经 **内置桥（taskweaver-bridge）** 反代到 **Z Host（DSH）**，与自建 API Key 模型并列使用。

用户不应感知「OpenCodex 产品」或 10100 本地代理；那是实现细节。

## 架构分层

```text
┌─────────────────────────────────────────────────────────┐
│ UI：扫描本地官方 Agent / 登录 / 勾选模型加入目录          │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC models:scanLocal / bridge:*
┌───────────────────────────▼─────────────────────────────┐
│ model-sync（TaskWeaver 自有）                              │
│  · local-agent-registry — 支持哪些 Agent、路由 id、桥类型  │
│  · discover-local-agents — 从发现结果生成 Agent 状态        │
│  · ocx-cli — 当前 discovery+OAuth 适配器（可替换）         │
│  · bridge-catalog — 写入 models.json（taskweaver-bridge）  │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ Z Host：llm-taskweaver-bridge + Agent 工具链              │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ taskweaver-bridge-transport：进程内反代（cursor / AG / relay）│
└─────────────────────────────────────────────────────────┘
```

## 当前已支持的本地 Agent

在 `electron/backend/model-sync/local-agent-registry.mjs` 注册：

| agentId | 用户可见 | Host 路由 | bridgeKind | 发现（今日） | 登录 |
|---------|----------|-----------|------------|--------------|------|
| `cursor-composer` | Cursor（Composer 订阅） | `bridge-composer` | `cursor` | ocx export → `opencodex` 块 | `ocx login cursor` |
| `google-antigravity` | Google Antigravity | `bridge-antigravity` | `google-antigravity` | ocx export → `google-antigravity` 块 | `ocx login google-antigravity` |

新增一种官方 Agent = **在 registry 加一行** + **transport 实现 bridgeKind**（或复用 `openai-compat-relay`）。

## 与 OpenCodex 的关系

- **vendor/opencodex + ocx**：本机「订阅凭据 + 模型目录导出」的**适配器**，类似可选驱动，不是 TaskWeaver 的功能品牌。
- **不再**默认：10100 代理、OpenCodex 设置卡片、扫描写 `opencodex` loopback 进 `llm-pi-ai`。
- 长期可替换：按 Agent 实现原生发现（读 Cursor 配置、AG CLI 等），只要产出同样的 `bridge-catalog` 结构。

## IPC

- `models:scanLocal` / `bridge:refreshCatalog`：发现 → 合并 models.json → 同步 Host → 返回可添加模型列表（含可选 `localAgents` 摘要）。
- `bridge:getStatus`：`localAgents` + 登录状态 + `discoveryAdapter: 'ocx-export'`。
- `bridge:login`：`cursor` | `google-antigravity`（内部仍调 ocx login）。
- `models:migrateLegacyOpenCodexRoutes`：`opencodex/*` → `bridge-composer/*`（已添加列表、profile、当前模型）；应用启动时自动尝试一次。

## UI

「模型与来源」页顶部的 **本地官方 Agent** 状态条展示各 Agent 的登录/发现情况，并可一键登录或迁移遗留 OpenCodex 路由。

## 相关文档

- 桥接契约与 transport：`docs/TaskWeaver-Bridge.md`
