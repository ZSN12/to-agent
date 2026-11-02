# 本地 Agent 集成

## 产品目标

用户在本机已配置的 Agent / 订阅客户端（如 Cursor Composer、Google Antigravity、WorkBuddy）应能被 TaskWeaver 发现，模型进入模型目录并可在对话中使用。

用户不应感知「OpenCodex 产品」或 10100 本地代理；那是实现细节。

Cursor Composer 和 Antigravity 通过内置桥接入；WorkBuddy 使用独立的 OpenAI 兼容提供方路由，读取其本机模型配置中的地址，不依赖 Cursor 或 Antigravity。

## 架构分层

```text
┌─────────────────────────────────────────────────────────┐
│ UI：扫描本地官方 Agent / 登录 / 勾选模型加入目录          │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC models:scanLocal / bridge:*
┌───────────────────────────▼─────────────────────────────┐
│ model-sync（TaskWeaver 自有）                              │
│  · WorkBuddy models.json → llm-pi-ai OpenAI 兼容路由       │
│  · Cursor / Antigravity → bridge-catalog → 内置桥          │
│  · local-agent-registry / discover-local-agents 管理发现态  │
│  · ocx-cli 是 Cursor / Antigravity 的可替换发现适配器       │
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

在 `backend/model-sync/local-agent-registry.mjs` 注册：

| agentId | 用户可见 | Host 路由 | bridgeKind | 发现（今日） | 登录 |
|---------|----------|-----------|------------|--------------|------|
| `cursor-composer` | Cursor（Composer 订阅） | `bridge-composer` | `cursor` | ocx export → `opencodex` 块 | `ocx login cursor` |
| `google-antigravity` | Google Antigravity | `bridge-antigravity` | `google-antigravity` | ocx export → `google-antigravity` 块 | `ocx login google-antigravity` |
| `workbuddy` | WorkBuddy | `workbuddy` | OpenAI 兼容直连 | 启动时读取 WorkBuddy 本机 `models.json` | 使用 WorkBuddy 已保存的 API Key |

新增一种官方 Agent = **在 registry 加一行** + **transport 实现 bridgeKind**（或复用 `openai-compat-relay`）。

## WorkBuddy 自动接入

- TaskWeaver 启动时独立查找 `~/.workbuddy/models.json`，并兼容旧路径 `~/.codebuddy/models.json`。发现有效配置后，会注册提供方、刷新模型候选目录；用户可在模型设置中添加并选择需要的 WorkBuddy 模型，无需先扫描 Cursor / Antigravity。
- WorkBuddy 模型可以分别使用不同的本机地址；TaskWeaver 保留每个模型的地址。自动发现只读取配置文件，不向模型地址发请求。
- API Key 写入 TaskWeaver 的加密凭据存储，不复制进 TaskWeaver 的 `models.json`，也不写入日志。多个 WorkBuddy 模型若配置不同 API Key，当前单凭据提供方模型会跳过自动导入并显示原因。
- 若 TaskWeaver 已有用户自定义的 `workbuddy` 提供方或不同凭据，自动接入会保留现有配置并跳过冲突导入。由 TaskWeaver 自动导入的配置会记录来源，后续启动可安全更新模型和轮换凭据。
- 手动扫描时只探测 loopback 地址；探测不会跟随重定向，也不会访问配置中的远程地址。
- 上游： [WorkBuddy 模型配置文档](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Model)；[WorkBuddy Open API](https://open.workbuddy.cn/docs/openapi)。

## 与 OpenCodex 的关系

- **vendor/opencodex + ocx**：本机「订阅凭据 + 模型目录导出」的**适配器**，类似可选驱动，不是 TaskWeaver 的功能品牌。
- **不再**默认：10100 代理、OpenCodex 设置卡片、扫描写 `opencodex` loopback 进 `llm-pi-ai`。
- 长期可替换：按 Agent 实现原生发现（读 Cursor 配置、AG CLI 等），只要产出同样的 `bridge-catalog` 结构。

## IPC

- `models:scanLocal`：发现 → 合并 models.json → 同步 Host → 返回可添加模型列表（含可选 `localAgents` 摘要）。
- `bridge:getStatus`：`localAgents` + 登录状态 + `discoveryAdapter: 'ocx-export'`。
- `bridge:login`：`cursor` | `google-antigravity`（内部仍调 ocx login）。
- Antigravity OAuth Client ID / Client Secret 由模型设置页保存到 macOS Keychain；登录子进程仅在 Antigravity 授权时读取并注入。开发者环境变量可作为已配置凭据的备用来源。
- `models:migrateLegacyOpenCodexRoutes`：`opencodex/*` → `bridge-composer/*`（已添加列表、profile、当前模型）；应用启动时自动尝试一次。

## UI

「模型与来源」页顶部的 **本地官方 Agent** 状态条展示各 Agent 的登录/发现情况，并可一键登录或迁移遗留 OpenCodex 路由。

## 相关文档

- 桥接契约与 transport：`docs/TaskWeaver-Bridge.md`
