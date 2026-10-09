# DSH 源码适配 TaskWeaver（前端仍是我们的）

## 你要的模式（一句话）

**DSH 当引擎 + 投影库，TaskWeaver 当壳。**  
从 `packages/runtime` **拷逻辑、接数据面**，对话区 **继续用我们的布局/线程/Composer/DAG**；**不**在面板里嵌整站 `dsh web`，也**不**长期靠 `dsh-chat-service` 手搓 `delta/tool/done` 当唯一真相。

## 三层分工

```mermaid
flowchart TB
  subgraph tw [TaskWeaver 我们拥有]
    Shell[App 壳：线程 / 工作区 / 设置 / DAG]
    Composer[Composer / QueueDock / Approval 嵌入位]
    Transcript[对话区容器：我们的 CSS 与信息架构]
  end
  subgraph adapt [适配层 本仓库新增]
    Bridge[IPC chat:mux + 可选 snapshot]
    Hook[useDshConversationProjection]
    Map[conversationId ↔ sessionId / cwd / preset]
  end
  subgraph dsh [packages/runtime 可改 fork]
    Host[dsh web 子进程 执行]
    RT[@z/dsh-client-runtime Session 投影]
    UI[@z/dsh-client-ui-conversation 等 组件源码]
  end
  Shell --> Transcript
  Transcript --> Hook
  Composer --> Bridge
  Bridge --> Host
  Hook --> RT
  Transcript --> UI
  RT --> UI
```

| 层 | 做什么 | 不做什么 |
|----|--------|----------|
| **Host** | Cordis 执行、session 日志、`session/projection` | 不管 TaskWeaver 线程列表 |
| **适配层** | mux 订阅、Session 实例（main 或 renderer bundle）、ID 映射 | 不重写 Trajectory 折叠算法 |
| **TaskWeaver UI** | 消息列、工具卡、进行中、统计条 **外观与交互** | 不 iframe 整站；不双轨侧栏 |

## 和「嵌 Web」的区别

| | 嵌整站 Web | 源码适配（目标） |
|--|------------|------------------|
| 对话区 DOM | Host 的 `AppFrame` + 侧栏 | **我们的** `MainConversation` / `Message` 或 TW 样式包装的 DSH 组件 |
| 路由 | DSH `current` session | **我们的** `conversationId`；适配层 `selectSession(tw-xxx)` |
| 升级 | 跟 Host 页面走 | **跟 fork 走**；上游仅作参考 |

## 落地顺序（建议）

1. **数据面（已起步）**  
   `chat:mux` 推送 `session/event`、`session/projection` 等 → `useDshMuxTape`（见 `src/features/dsh-runtime/`）。

2. **投影消费（下一步）**  
   - 在 **Electron main** 或 **独立 Vite 子构建**（React 18 与 TW 19 隔离）加载 `@z/dsh-client-runtime` 的 `Session` + 已注册的 Conversation Definitions（与 web 相同注册表，可从 `ui-conversation` apply 路径抽出）。  
   - IPC 向 renderer 推 **可序列化的** `ConversationSnapshot` 摘要（或增量），避免在 TW 里重写 Node 折叠。

3. **UI 适配（逐步替换）**  
   - 从 `ui-conversation` / `ui-tool` **复制或 re-export 组件**，用我们的 CSS Modules / `--dsw-*` 包一层（或只替换 className 映射表）。  
   - 先替换：**工具 trace、进行中、reasoning 行、compaction 行**；再替换整列 transcript。  
   - **Composer** 可继续用现有 `ComposerStatsDock` + IPC `chat:send`，行为与 DSH 对齐即可。

4. **退役**  
   `chat:stream` 简流仅保留 DAG 子 lane / 旧路径；主对话以 projection 为准。

## Fork 改造约定

- 改动优先在 **`packages/runtime`** + 本仓库 **`src/features/dsh-runtime`**，不等待上游合并。
- 需要 Host 行为时改 **`packages/host/apiproxy`**（已有 TaskWeaver 授权事件先例）。  
- 不为桌面端开 HMR；嵌入式用 `DSH_TASKWEAVER_EMBEDDED=1`（已用）。

## 代码索引

- 原则：[DSH内嵌集成原则.md](./DSH内嵌集成原则.md)  
- mux 扇出：`electron/backend/dsh-chat-service.mjs`  
- 适配 hook 骨架：`src/features/dsh-runtime/useDshMuxTape.ts`  
- DSH 参考：`packages/runtime/client/runtime`、`ui-conversation`、`ui-trajectory`
