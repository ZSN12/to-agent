# DSH 内嵌集成原则（TaskWeaver 主导）

## 目标

- **照搬 DSH 的对话语义**：session 事件日志、`session/projection`、Conversation Node 投影、工具/进行中/request 生命周期——与官方 Web 客户端同一套数据面。
- **不被上游 UI 牵着走**：不嵌入 `dsh web` 整页、不把线程/路由/DAG/作品集交给 DSH 侧栏；TaskWeaver 壳层与产品能力保持主权。
- **不被薄桥接牵着走**：长期不依赖 `dsh-chat-service` 手搓的 `delta/tool/done` 二次编码作为唯一真相（过渡期可并存）。

## 分层

| 层 | 职责 | 归属 |
|----|------|------|
| 执行 | Cordis Host、`dsh web` 子进程、ApiProxy | `packages/runtime` **可改 fork**，deploy 到 `taskweaver-z-runtime` |
| 数据面 | `events.mux` → `session/event` + `session/projection` + queue/jobs | Host 计算；客户端 **消费**，不重演 |
| 投影 | `@z/dsh-client-runtime` Session / ChatSnapshot | 计划在 Electron **main 或独立 bundle** 中实例化 |
| 呈现 | `@z/dsh-client-ui-conversation` 等 | 以 **TaskWeaver 子应用 bundle** 挂到对话区，或逐步替换现有 `Message` 列 |
| 产品壳 | 线程、工作区、DAG、路由、Git、设置 | TaskWeaver `App.tsx` 与现有 IPC |

## 明确不做

- **对话区嵌整站 `dsh web`（WebView/iframe 当主 UI）**：侧栏、路由、Composer 双轨，受 Host 页面牵着走。  
  **可以**的是：把 `packages/runtime` **源码改造成适配层**，对话 **展示仍用 TaskWeaver 前端**，只复用 runtime 投影与 conversation 组件逻辑。见 [DSH源码适配方案.md](./DSH源码适配方案.md)。
- **只追 DeepSeek 上游发版**：行为与包名以本仓库 `packages/runtime` 与 patch 为准（HMR 关闭、embedded 环境变量等已落地）。

## 已落地（数据面第一步）

- `electron/backend/dsh-chat-service.mjs`：对已映射的 DSH `sessionId`，将 mux 上的  
  `session/event`、`session/projection`、`session/queue`、`session/subscribed`、`session/jobs`  
  **原样**经 IPC `chat:mux` 推到订阅的 renderer（`chat:subscribeMux` / `onMux`）。
- Renderer：`useAppBackend` 按当前 `conversationId` 订阅，并在内存保留 tape（供下一阶段接 `client-runtime` / ui-conversation）。

## 下一阶段（建议顺序）

1. **Main 侧 SessionRuntime**（或 headless 等价物）：mux 单消费者 → 每 `conversationId` 一个 `ConversationSnapshot`；IPC 推送 **可序列化 snapshot 摘要**（或增量）。
2. **`scripts/build-dsh-chat-pane.mjs`**：从 `packages/runtime` 打出仅含 `ui-conversation` + runtime 的 Electron 子 bundle（React 18 隔离），由 TaskWeaver 对话区 `import` / `webview` **仅该 bundle**（仍非整站 DSH）。
3. **退役路径**：`chat:stream` 简流仅保留给 DAG 子任务/旧 UI；主对话以 projection 为准；`app-state` 消息列与 DSH log 对齐策略见 [DSH对齐与TaskWeaver差异化.md](./DSH对齐与TaskWeaver差异化.md)。

## 代码索引

- Mux 扇出：`electron/backend/dsh-chat-service.mjs`（`fanoutMuxFrame`、`subscribeMux`）
- IPC：`electron/backend/register-ipc.mjs`（`chat:subscribeMux`）
- 预加载：`electron/preload.cjs`（`chat.onMux`）
- 类型：`src/shared/app-api.ts`（`DshMuxFramePayload`）
- DSH 参考实现：`packages/runtime/client/runtime`、`ui-conversation`、`ui-trajectory`
