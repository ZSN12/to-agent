# TaskWeaver 执行层：从 Pi 迁到 DSH Host

## 结论（产品决策）

**目标态**：桌面端对话与工具执行 **只走 DSH**（Cordis 组合 + Session 事件日志 + Host ApiProxy），不再维护「Pi `createAgentSession` + 零散 DSH 沙箱/vendor 补丁」双栈。

**保留在 TaskWeaver 自有层**（不要求与 DSH 一致）：

- 成本感知路由、能力作品集（`routing-portfolio-service`）
- DAG 多 Agent 编排（与 DSH subagent 树并存；编排仍可调 DSH 子会话）
- Git worktree / 检查点、线程 UI、毕设中文产品

**由 DSH 接管**（当前由 Pi 承担）：

| 能力 | 现在（Pi） | 目标（DSH） |
|------|------------|-------------|
| Agent 循环 / 工具 | `pi-agent-core` + coding-agent tools | `agent-loop` + Cordis 插件行 |
| 会话持久化 | `conversations/<uuid>.jsonl` | Session 版本化事件流 + coordinator |
| 权限 / 审批 | `permission-service` + Pi extension | `permission-presets` + `user-approval` + `dsh-auto-review` |
| Bash / 文件沙箱 | `taskweaver-dsh-sandbox` 包在 Pi bash 外 | `dsh-sandbox` + `fs-sandbox` + preset（与 CLI/Web 一致） |
| 队列 steer/followUp | Pi `AgentSession` 队列 | Host `session/queue` + `SessionQueueMirror` 语义 |
| Compaction | Pi `session.compact` | DSH `compaction` 包 + Pre/Post 钩子 |
| MCP | Pi custom tools | Cordis MCP 客户端（`mcp__` 命名已对齐） |

参考实现路径：`/Users/zsn/Documents/deepseek/dsh-source`（`host-cli` + `packages/host/apiproxy` + `apps/web` 测例）。

---

## 为什么不能「明天删掉 Pi」

1. **DSH 不是单个 npm 函数**，而是一套 **Host 进程 + Cordis 组合 + ApiProxy RPC**。Electron 里需要常驻 **DSH Host**（类似 CLI 的 `dsh serve` / apiproxy 网关），TaskWeaver 渲染进程通过 **Mux RPC** 发 `session.prompt`，而不是 `createAgentSession().prompt()`。
2. **会话 ID 与存储格式不同**。现有 `taskweaver-threads.json` + Pi jsonl 需 **迁移器**（或一次性弃用旧 jsonl，仅保留 UI 摘要）。
3. **TaskWeaver 独有 IPC**（DAG、worktree、git checkpoint、路由作品集）仍留在 `electron/backend`，只把 **`chat-service` / `orchestration` 的 runPrompt** 换成 DSH 客户端。
4. **打包体积与依赖**：DSH Host 是完整 Cordis 图，需评估与当前 `vendor/runtime`（~150MB pi）的取舍；可 **外置 `dsh` 二进制** 或 **内嵌 host 子集**（二选一，见阶段 2）。

---

## 分阶段实施（建议）

### 阶段 0 — 冻结 Pi 扩散（当前）

- 新能力优先 **DSH 对齐文档 + 行为**，不再在 Pi extension 里堆逻辑。
- 构建：**先 `packages/pi` build，再 embed**；禁止单独 `runtime-seed-dist` 覆盖新 dist（已在 `make-mac-app.sh` 调整）。
- 模型目录：`builtin-model-data.mjs` 合并 `pi-ai` data（过渡）；迁 DSH 后改为 **ApiProxy `llm` / models 域**。

### 阶段 1 — 并行 Host（验证）

- 新增 `electron/agent/dsh-host/`：
  - 启动子进程：本机 `dsh` CLI（或 vendored host 入口）+ preset **`code`**（与 DSH 桌面一致）。
  - `dsh-chat-adapter.mjs`：实现与现有 `chat-service.send` 相同的 **事件映射**（`chat:stream` ← Mux `session/*` 帧）。
- Feature flag：`TASKWEAVER_AGENT_RUNTIME=dsh|pi`（默认 `pi`），仅 **单 Agent 主对话** 走 DSH。
- 验收：同一工作区、同一模型 key，对比 bash/read 拒绝率、队列删除、compaction、审批审计。

### 阶段 2 — 默认 DSH + 数据迁移

- 默认 `dsh`；Pi 仅作 orchestration 子任务回退（可选）。
- 迁移工具：`pi-jsonl` → DSH session import（按 turn 边界映射 user/assistant；无法精确处打 `legacy` 标记）。
- 删除：`electron/extensions/taskweaver-dsh-sandbox.ts`、Pi `taskweaver-permissions` 对 bash 的包裹（改由 Host preset 承担）。
- `permission-service` 缩为 **DSH 审批 UI 桥**（`approval/asked` 由 Host 写日志）。

### 阶段 3 — 去掉 vendor/runtime Pi

- `agent-runtime.mjs` 仅 re-export DSH 客户端类型。
- `packages/pi` 降为可选（仅价签/模型生成脚本）或移除。
- 论文表述：**编排与路由为自有；执行与沙箱与 DeepSeek Host 同源。**

---

## Electron 接线草图

```text
Renderer (React)
    │ IPC chat:send / chat:stream
    ▼
chat-service (adapter)
    │ 阶段1+: DshSessionClient.prompt()
    ▼
DSH Host (Cordis, preset=code)
    ├─ agent-loop
    ├─ terminal-bash + dsh-sandbox
    ├─ fs + fs-sandbox
    ├─ user-approval + auto-review
    └─ session store (events)
```

TaskWeaver 继续负责：`register-ipc`、`app-state-store`（线程列表）、`orchestration-service`（DAG）、`model-service`（在阶段 1 仍可把 model key 传给 DSH `llm` 配置）。

---

## 与你当前痛点的对应关系

| 现象 | Pi 栈原因 | DSH 全量后 |
|------|-----------|------------|
| Think 显示 5 分钟 | 工具时间误计入（已修）+ 长会话多步 | 队列/阶段 UI 与 Host 一致；事件源单一 |
| 「Shell 被拦」但完整访问 | Pi 工具失败写入上下文 + 双轨沙箱/权限 | 单一 preset；审批与 bash 同源 |
| 模型列表缺 v2.6 | 旧 vendor dist | Host `llm` 目录 + 刷新 |
| 队列删不掉 | 旧 dist 无 `removeQueuedMessage` | Host `session/queue` RPC |

---

## 进度（2026-09）

| 阶段 | 状态 | 验收 |
|------|------|------|
| A runtime 部署 | 完成 | `npm run build:dsh-runtime`、`test:dsh-host`、`test:dsh-host-deploy` |
| B 主聊天 + 历史迁移 | 完成 | `npm run test:dsh-chat` |
| C Skill / MCP | 完成（MCP 未进 DSH） | `npm run test:skills`、`test:mcp` |
| D 权限桥接 | 完成（full 无 danger preset） | `npm run test:dsh-permission-map` |
| E DAG 子任务 | 完成（仅 DSH） | `npm run test:orchestration` |
| F macOS 打包 | 接线完成 | `make-mac-app.sh` 含 `build-dsh-runtime` + `extraResources` |
| G 删 Pi 主链 | 进行中 | 主聊天已走 `dsh-chat-service`；Pi 仍被模型目录、Skill 装载、会话维护等兼容层引用 |

**未删 Pi 前**：`npm run build` + 上表测试 + 打包应用在无外部 `DSH_HOME` 下试开聊天。
