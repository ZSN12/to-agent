# TaskWeaver 产品补齐计划（对标 Claude Code 体验缺口）

> 版本：2026-09-24  
> 范围：终端与输出、@ 上下文、多会话与工作区、联网搜索、Git 检查点、Worktree 隔离、细粒度权限、长对话与上下文可见性。  
> 原则：**不替代毕设主线**（门控 + DAG + 子任务模型路由）；本计划分 **P0 毕设演示必需**、**P1 开源可用**、**P2 长期**。

---

## 与毕设设计文档的衔接

外置项目记忆（L0～L4）、多执行会话与异构模型下的上下文装配，已写入《毕设选题思路.md》**§五**与《毕设设计方案-多智能体编程系统.md》**§5.6**。本计划中的 **§2 @ 上下文** 与 **§8 长对话压缩** 分别对应记忆中的 L3 与 L1 维护，实现时应优先落地 `memory-store.mjs` + `context-assembler.mjs`（见设计方案流程图）。

---

## 总览：依赖关系

```mermaid
flowchart LR
  W[工作区选择 P0] --> C[@上下文 P0]
  W --> T[终端面板 P1]
  W --> G[Git 检查点 P1]
  W --> WT[Worktree P2]
  C --> COMP[上下文计量 P1]
  PERM[细粒度权限 P1] --> T
  PERM --> WEB[WebSearch P1]
  SESS[多会话 P1] --> COMP
```

| 编号 | 主题 | 优先级 | 预估工期 | 毕设是否必做 |
|------|------|--------|----------|--------------|
| 1 | 工作区 + 多会话/项目 | P0 | 1～1.5 周 | **建议必做**（demo 可信度） |
| 2 | @文件 / @文件夹 / 拖拽上下文 | P0 | 1～1.5 周 | **建议必做** |
| 3 | 内置终端 + 输出面板 | P1 | 1.5～2 周 | 选做（可简化） |
| 4 | WebSearch / 扩展内置工具 | P1 | 0.5～1 周 | 选做（1 个 demo 即可） |
| 5 | Git 检查点与回滚叙事 | P1 | 1 周 | 选做 |
| 6 | Worktree / 并行分支隔离 | P2 | 1.5～2 周 | 论文可写设计，实现可降级 |
| 7 | 细粒度 allowlist / 权限规则 | P1 | 1 周 | 选做（与现有三档衔接） |
| 8 | 长对话压缩 + 上下文管理 UI | P1 | 1 周 | 选做 |

---

## 1. 工作区 + 多会话 / 项目切换

### 1.1 现状

- 后端：`app:setWorkspace`、`app-state` 单文件存 **一个** `conversationId` + `messages` + `tasks`。
- 前端：侧栏仅展示 `threadTitle` / 工作区文件夹名，**无选目录、无会话列表**。

### 1.2 目标

- 用户可在设置或侧栏 **选择本地项目目录**（`dialog.showOpenDialog`），切换后重置 Agent session。
- **多会话**：同一工作区下多个 thread；或「最近项目 + 每项目多对话」二选一（建议先做 **单工作区多对话**，数据结构简单）。

### 1.3 数据模型（建议）

```text
userData/
  workspaces.json          # 最近打开的路径列表
  threads/
    {threadId}.json        # { id, workspacePath, title, updatedAt, permissionMode }
  conversations/           # 已有 pi jsonl，按 threadId 命名
  taskweaver-app-state.json  # 可改为仅存 currentThreadId + ui 状态，或逐步废弃
```

### 1.4 任务拆解

| ID | 任务 | 模块 | 验收 |
|----|------|------|------|
| 1.1 | IPC `app:pickWorkspace` / `app:setWorkspace` 接原生目录选择 | `register-ipc.mjs`, `main.cjs` | 选目录后 `cwd` 与工具作用路径一致 |
| 1.2 | 设置页「工作区」区块：当前路径、更改、最近列表 | `App.tsx` 或 `WorkspaceSettings.tsx` | 切换后 `chat.resetSession` |
| 1.3 | `createThread` / `listThreads` / `switchThread` / `deleteThread` | `thread-store.mjs`（新） | 侧栏列出对话，切换加载 messages |
| 1.4 | 新建对话、重命名标题（首条用户消息摘要或手动） | `app-state` + UI | 与 `conversationId`、jsonl 对齐 |
| 1.5 | 切换 thread 时清理 `tasks`、orchestration 进行中锁 | `orchestration-service` | 无串会话 |

### 1.5 与 Claude Code 差距（完成后）

- 仍有差距：无「项目级索引」、无云端同步。  
- 达到：**可用的本地项目 + 多对话**，满足开源用户最低预期。

---

## 2. @文件 / @文件夹 / 拖拽上下文

### 2.1 现状

- 用户输入纯文本；Skill 用 XML 信封注入。

### 2.2 目标

- 输入框支持 `@` 触发：**文件 / 文件夹** 补全（工作区内）。
- 拖拽文件/文件夹到输入区 → 插入 `@path` 或附件 chip。
- 发送前由主进程 **解析引用**，将内容注入 prompt（带 token 预算）。

### 2.3 设计要点

**引用语法（内部）**

```text
@file:src/App.tsx
@dir:electron/backend
```

**注入策略（`context-assembler.mjs`）**

1. 解析 composer 中的 `@file` / `@dir`（及拖拽生成的引用）。  
2. `dir`：默认 `glob` 列表 + 可选 `tree` 深度 2（不递归读全文）。  
3. `file`：`read` 文本文件，单文件上限（如 32KB），总量上限（如 120KB）。  
4. 二进制 / 过大：只注入路径 + 大小，不塞内容。  
5. 拼入固定模板：

```text
<attached_context>
...
</attached_context>
<user_task>...</user_task>
```

（与现有 `skill-prompt.mjs` 风格一致。）

### 2.4 任务拆解

| ID | 任务 | 模块 | 验收 |
|----|------|------|------|
| 2.1 | 主进程 `workspace:searchPaths(query)` 模糊搜文件 | `workspace-index.mjs`（轻量：rg 或 readdir 缓存） | @ 后 200ms 内出候选 |
| 2.2 | 前端 `@` 补全 UI（复用 Skill 菜单模式） | `Composer` | 选文件插入 chip |
| 2.3 | `onDrop` 处理 + Electron `webUtils.getPathForFile` | `App.tsx` / preload | 拖入显示为 chip |
| 2.4 | `context-assembler` + `chat:send` 前组装 | `register-ipc` 或 `chat-service` | 模型能看到文件片段 |
| 2.5 | 越界路径拒绝（非工作区） | 与 `permission-service` 一致 | 弹错或忽略 |

### 2.5 毕设关联

- 论文可写：**上下文装配层**与编排分离；多 Agent 时可规定「Planner 不看全文，子任务带 @ 范围」。

---

## 3. 内置终端 + 输出面板

### 3.1 现状

- Agent 通过 pi `bash` 工具执行；UI 仅 **工具轨迹摘要**（`tool-trace.mjs`）。

### 3.2 目标

- **终端面板**：用户可手动敲命令（可选）；Agent 的 bash **同步流式输出**到面板。  
- **输出面板**：聚合 bash stdout/stderr、工具错误、编排 `progress` 为时间线。

### 3.3 架构（推荐）

**不要**先嵌完整 xterm + node-pty（复杂度高）。分阶段：

| 阶段 | 方案 | 说明 |
|------|------|------|
| 3a（P1 最小） | **只读输出面板** | 订阅 `tool_execution_*`，bash 结果全文写入 `output-log-store`，UI 滚动查看 |
| 3b（P1+） | **xterm.js + node-pty** | 主进程 PTY，`terminal:write` / `terminal:data` IPC；与 Agent bash **分离**（避免抢 shell） |
| 3c（P2） | **Agent bash 重定向** | extension 拦截 bash，duplicate 输出到面板（需 pi extension） |

建议毕设 demo：**3a 必做**；3b 有时间再做。

### 3.4 任务拆解（3a）

| ID | 任务 | 验收 |
|----|------|------|
| 3.1 | `output-store.mjs` 环形缓冲（如最近 500 条） | 每条含 source: bash/tool/orchestration |
| 3.2 | `chat-service` / orchestration 在 bash 工具 end 时推送 `output:append` 流 | 面板实时更新 |
| 3.3 | 右侧或底部 `OutputPanel` + 过滤（全部 / 仅错误 / 仅 bash） | 可折叠 |
| 3.4 | （可选）从输出跳转到对应 `tool-trace` | 同一 `toolCallId` |

### 3.5 任务拆解（3b，可选）

| ID | 任务 | 验收 |
|----|------|------|
| 3.5 | 依赖 `node-pty` + `xterm` | `npm` 与 electron rebuild |
| 3.6 | `terminal:create` / `terminal:input` IPC | 用户可 `ls` |
| 3.7 | 文档说明：与 Agent bash 隔离，避免状态污染 | README |

---

## 4. WebSearch / 产品级内置工具

### 4.1 现状

- pi 默认 `read/bash/edit/write`（及运行时可能有的 grep 等），**无联网搜索产品入口**。

### 4.2 目标

- 提供 **可选** 联网能力：搜索摘要进上下文（不替代用户浏览器）。
- 实现路径二选一（建议 **B** 毕设工作量小）：

| 路径 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| A | pi **extension** 注册 `web_search` 工具，调 Brave/SerpAPI 等 | 与 Agent 循环一致 | 要 API Key、要审批 |
| B | **仅编排层**：用户 `@web` 或设置开关，发送前主进程 fetch + 注入 | 不改 pi 核心 | 非模型自主调工具 |

**推荐**：A 为 P1 完整体验；毕设 demo 可用 B + 后续 extension 化。

### 4.3 任务拆解（路径 A）

| ID | 任务 | 验收 |
|----|------|------|
| 4.1 | `electron/extensions/taskweaver-web-search.ts` + env `TASKWEAVER_SEARCH_API_KEY` | 设置页配置 |
| 4.2 | 工具 schema：query, maxResults | Agent 可调用 |
| 4.3 | 纳入 `permission-service`：联网需 `on-risk` 或单次批准 | 与 bash 网络规则一致 |
| 4.4 | 设置页开关「允许 Web 搜索工具」 | 默认关 |

### 4.4 任务拆解（路径 B，快速 demo）

| ID | 任务 | 验收 |
|----|------|------|
| 4.5 | Composer 勾选「附带网页检索」→ 主进程 search → 注入 `<web_context>` | 固定 3 条结果摘要 |

---

## 5. Git 检查点与回滚叙事

### 5.1 现状

- 无；Agent 直接改工作区文件。

### 5.2 目标

- **检查点**：每次用户发送前（或每次多 Agent 编排开始前）记录 `git rev-parse HEAD` + 可选 `git stash push -u` 或 **轻量 snapshot**（未 git 仓库时只提示）。  
- **回滚叙事**：UI 提供「恢复到本轮开始前」→ `git reset --hard` 或 `stash pop`（需二次确认 + permission）。  
- **展示**：侧栏或消息时间线显示「检查点 abc1234」。

### 5.3 任务拆解

| ID | 任务 | 模块 | 验收 |
|----|------|------|------|
| 5.1 | `git-service.mjs`：isRepo、head、createCheckpoint、restore | 仅在工作区内 | 非 git 仓库友好提示 |
| 5.2 | `chat:send` 前 `checkpoint`（可设置关闭） | `register-ipc` | state 存 `lastCheckpoint` |
| 5.3 | 消息气泡「还原到此检查点」 | UI + IPC `git:restore` | 与 permission `destructive` 联动 |
| 5.4 | 多 Agent：`planAndExecute` 开始前一次检查点 | orchestration | 失败可整轮回滚 |

### 5.4 风险

- `reset --hard` 危险 → 必须 **默认关闭**，开启需明确文案；毕设演示用 **独立分支** 仓库。

---

## 6. Worktree / 并行分支隔离

### 6.1 现状

- 设计方案提及，**无代码**。

### 6.2 目标

- 多 Agent **并行且可能写同一仓库** 时，子任务在 **独立 git worktree** 执行，合并由「实现」或用户触发。  
- 本科可 **降级**：仅 **串行 DAG** + 单 worktree，或仅文档 + 单任务 worktree demo。

### 6.3 任务拆解

| ID | 任务 | 优先级 | 验收 |
|----|------|--------|------|
| 6.1 | `worktree-service.mjs`：create、remove、list，路径 `userData/worktrees/{taskId}` | P2 | CLI 等价 `git worktree add` |
| 6.2 | DAG 调度：并行节点若 `writesCode` 则分配 worktree | P2 | 两实现任务不共享 cwd |
| 6.3 | 合并策略：仅报告 diff 路径，不自动 merge（安全） | P2 | 用户手动 merge |
| 6.4 | 论文：**设计章节**写清与 Claude 隔离对比；实现可只做 6.1 手动按钮 | P0 文档 | 答辩可讲 |

---

## 7. 细粒度 allowlist / 权限规则

### 7.1 现状

- 三档：`ask` | `on-risk` | `full` + `taskweaver-permissions` extension + 系统对话框。

### 7.2 目标

- 持久化 **规则表**（类 Claude `/permissions` 简化版）：
  - 允许/拒绝：`bash` 模式、`read`/`write` 路径 glob、特定工具名。
  - 「本会话批准」「始终允许此类」写入 `permissions.json`。
- UI：设置页 **权限规则** 列表 + 从拦截弹窗「添加规则」。

### 7.3 规则模型（示例）

```json
{
  "rules": [
    { "id": "1", "effect": "allow", "tool": "read", "pathGlob": "src/**" },
    { "id": "2", "effect": "deny", "tool": "bash", "pattern": "rm -rf*" },
    { "id": "3", "effect": "ask", "tool": "bash", "pattern": "curl *" }
  ],
  "defaultMode": "ask"
}
```

### 7.4 任务拆解

| ID | 任务 | 验收 |
|----|------|------|
| 7.1 | `permission-rules-store.mjs` CRUD | 与 appState 或独立文件 |
| 7.2 | `permission-service.authorize` 先匹配 rules 再 fallback 三档 | 单元测试 10 条 |
| 7.3 | 弹窗第三按钮「始终允许此类」 | 写入 rule |
| 7.4 | 设置页编辑规则 | 启用/禁用单条 |
| 7.5 | （可选）Composer `/permissions` 只读展示 | 对标 Claude |

---

## 8. 长对话压缩 + 上下文管理可见

### 8.1 现状

- pi `SessionManager` jsonl 持久化；**无产品级「上下文占用」展示与压缩触发**。

### 8.2 目标

- **可见**：头部或设置显示 `contextTokens / contextWindow / contextPercent`（`getSessionStats` 已有字段，需在 UI 暴露）。  
- **压缩**：接近阈值（如 85%）时提示；用户点击或自动触发 **摘要压缩**（调用便宜模型或规则截断旧 tool 结果）。  
- **实现**：优先 hook pi 的 compaction / extension `session_compact`；若无稳定 API，则 **主进程截断**：将旧消息摘要写回 session（需读 pi 文档与测试）。

### 8.3 任务拆解

| ID | 任务 | 验收 |
|----|------|------|
| 8.1 | 每条 assistant 消息展示 usage 芯片（已有 data 可接） | 消息 footer |
| 8.2 | 会话级 Context _meter_ 组件 | 发送前可见 |
| 8.3 | `compaction-service.mjs`：阈值检测 + 用户确认 | 压缩后仍能对话 |
| 8.4 | 压缩后保留：最近 N 轮全文 + 更早的 summary 一条 | jsonl 可续读 |
| 8.5 | 多会话与压缩联动：每 thread 独立 session 文件 | 与 §1 一致 |

---

## 实施路线图（建议顺序）

### 阶段 I — 毕设答辩前（约 3 周，并行论文）

1. **§1 工作区 + 多会话**（P0）  
2. **§2 @ 上下文**（P0）  
3. **§8.1～8.2 上下文可见**（轻量，1～2 天）  
4. **§5 检查点** 仅「发送前记录 HEAD + 手动恢复」（砍 stash，降风险）  
5. **§6** 论文设计 + 可选按钮 demo  

### 阶段 II — 开源首发（约 3～4 周）

6. **§3a 输出面板**  
7. **§7 细粒度权限**  
8. **§4 WebSearch**（extension 或附带检索）  
9. **§8.3～8.4 压缩**  

### 阶段 III — 差异化加深

10. **§3b 真终端**  
11. **§6 worktree 与 DAG 并行**  
12. MCP 桥接（见《TaskWeaver实施计划》Phase D）  

---

## 文件与模块规划（新增/改动）

```text
electron/backend/
  thread-store.mjs          # §1
  workspace-index.mjs       # §2
  context-assembler.mjs     # §2
  output-store.mjs          # §3
  git-service.mjs           # §5
  worktree-service.mjs      # §6
  permission-rules-store.mjs # §7
  compaction-service.mjs    # §8
electron/extensions/
  taskweaver-web-search.ts  # §4（可选）
src/features/
  workspace/                # 工作区、会话列表
  context/                  # @ 补全、chips
  output/OutputPanel.tsx    # §3
  permissions/RulesPanel.tsx # §7
  context/ContextMeter.tsx  # §8
```

`register-ipc.mjs` / `preload.cjs` / `app-api.ts` 随 IPC 增量扩展。

---

## 测试清单

| 场景 | 通过标准 |
|------|----------|
| 换工作区后 read 路径 | 读到新仓库文件 |
| @file 超大小 | 截断提示，不撑爆上下文 |
| 多会话切换 | 消息与 jsonl 不串 |
| bash 输出 | 输出面板可见完整 stderr |
| git 非仓库 | 检查点禁用，不崩溃 |
| 规则 allow read src/** | 不再弹窗 |
| 上下文 90% | _meter_ 变红，可触发压缩 |

脚本：为 `git-service`、`permission-rules`、`context-assembler` 增加 `npm run test:*`（node 单测，无 Electron）。

---

## 与 Claude Code 的预期差距（本计划全部完成后）

| 仍落后 | 原因 |
|--------|------|
| IDE 内联 diff | 未在本计划；需 Monaco + diff 编辑器专项 |
| MCP 生态规模 | 需社区与时间 |
| 云端/团队 | 非目标 |
| Agent Teams 级并行社交 | 非目标 |

| 可接近 | 条件 |
|--------|------|
| 日常仓库问答 + 改代码 | §1+§2+pi 工具 |
| 可解释的自动化 | §3a+§7 |
| **子任务异构路由** | 已具备，继续打磨 DAG |

---

## 答辩叙事建议（一句话）

> TaskWeaver 不追求复刻 Claude Code 的 IDE 全家桶，而是在 **可配置的桌面 Agent** 上补齐 **项目上下文与工作区**，并把创新点放在 **多 Agent 场景下的子任务级模型路由与可观测编排**；终端、Git、权限、压缩等按本计划分阶段达到「可信开源产品」而非「100% 功能对等」。

---

*文档结束。实施时可与《TaskWeaver实施计划.md》合并排期，避免与 DAG/分配主线抢时间。*
