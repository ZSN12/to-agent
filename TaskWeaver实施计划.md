# TaskWeaver 实施计划（供评审）

> 版本：2026-09-24  
> 项目：本科毕设 — 任务感知动态模型路由的多智能体编程编排桌面端  
> 产品归属：**TaskWeaver 自有桌面应用**。模型会话当前由随项目交付的运行时实现承载；Skill 选择/装载、门控、DAG、模型分配与产品交互由 TaskWeaver 控制。运行时不是产品品牌，也不应在界面中作为功能提供方出现。  
> 本文目的：说明「Coding Agent 标配能力」与「毕设贡献（门控 + 分配 + DAG）」如何分阶段落地，便于第三方（如 GPT）评审范围与优先级。

---

## 1. 产品定位（一句话）

**先是一个能正常对话、读改代码、用工具、可选用 Skill 的桌面 Coding Agent；在此基础上，用规则门控决定是否进入多智能体，进入后用 DAG + 子任务级模型分配降低成本并提高可解释性。**

与选题/设计方案对齐：

- **门控（Policy Gate）**：发送前规则特征 → `SINGLE_AGENT` / `ASK_USER` / `MULTI_AGENT`，**不为门控多调 LLM**。
- **分配（Allocator）**：仅多智能体路径上，按子任务类型 + 用户维护的模型价签/能力卡选模型（可选历史反馈升级）。
- **执行（Runtime）**：统一走 pi `createAgentSession`，不另起 Claude Agent SDK / Codex SDK 作为主循环。

---

## 2. 当前基线（仓库已实现）

| 模块 | 路径 | 状态 |
|------|------|------|
| 桌面壳 | `electron/main.cjs`, `preload.cjs` | 可用：`npm start` / `npm run app` |
| 模型目录与凭据 | `electron/backend/model-service.mjs`, `profile-store.mjs`, `credential-store.mjs` | TaskWeaver 自有加密凭据存储；仅显式添加的模型进入主列表；候选目录仍由随项目提供的模型运行时枚举 |
| 单 Agent 对话 | `electron/backend/chat-service.mjs` | 可用：流式文本；默认 pi 内置工具 **未在 UI 暴露** |
| 入口门控 + 编排 | `orchestration-policy.mjs`, `orchestration-service.mjs`, `dag-scheduler.mjs` | 已有：`chat:send` 按门控走单 Agent 或 `planAndExecute` |
| Skill 目录与调用 | `electron/backend/skill-service.mjs`, `skill-prompt.mjs` | 已有：发现内置/应用/受信任工作区 Skill；用户选中后由 TaskWeaver 读取正文并注入当前任务；选中多 Agent Skill 才强制进入 DAG |
| 前端 | `src/App.tsx`, `useAppBackend.ts` | 真实对话与模型设置；`/Skill` 补全、权限档位、模型添加/删除界面；DAG/任务 UI 部分具备 |
| 执行层依赖 | `@earendil-works/pi-coding-agent@0.81.1` | npm 包，仓库内无 pi 源码 |

**已知缺口（相对「完整 Coding Agent」）：**

1. Agent 已能调用运行时内置工具，聊天和 DAG 子任务现会显示脱敏后的工具调用/结果摘要与耗时；DAG 子任务按任务类型配置最小工具集，单 Agent 默认工具集仍需显式收敛。
2. 当前权限档位已接到每次工具调用审批，工作区外路径会解析符号链接后再判断；`on-risk` 的命令识别仍是审批提示策略，**不是操作系统沙箱**，Shell 子进程仍可能通过复杂命令绕过路径启发式；OS 级隔离仍未实现。
3. 内置提供方的凭据/模型添加、加密持久化、显式添加/移除闭环已具备；尚未实现 DSH 式自定义兼容提供方（协议、Base URL、自定义模型 ID、探测/测试连接）。
4. **MCP** 尚未接入 TaskWeaver，也没有服务器配置、工具命名空间、连接状态与失败恢复界面。
5. Skill 已支持输入 `/` 搜索选择并由 TaskWeaver 注入指令；尚无按描述自动推荐、资源文件按需读取、变更刷新等完整生命周期。
6. DAG 子任务已有 `research/review` 只读、`test` 可运行但不可直接写文件、`implementation` 可写的工具 profile；单 Agent 与多 Agent 的 Skill profile 尚未区分，子任务目前共享用户选中的 Skill。
7. 工作区管理、会话恢复/压缩、工具失败重试与长任务取消等产品闭环仍需补齐。

---

## 3. 能力分层（架构约定）

```
┌─────────────────────────────────────────────────────────┐
│ TaskWeaver（毕设贡献层）                                   │
│  PolicyGate · Planner/DAG · Allocator · Skill/MCP 策略   │
│  Electron IPC · 状态持久化 · 桌面 UI（工具轨迹、审批）      │
└───────────────────────────┬─────────────────────────────┘
                            │ createAgentSession(options)
┌───────────────────────────▼─────────────────────────────┐
│ @earendil-works/pi-coding-agent（npm 执行骨架）            │
│  内置工具 · Extensions · Skills · SessionManager          │
└───────────────────────────┬─────────────────────────────┘
                            │ pi-ai / pi-agent-core
┌───────────────────────────▼─────────────────────────────┐
│ 多 Provider 模型调用                                       │
└─────────────────────────────────────────────────────────┘
```

**原则：**

- 不重写 Agent 循环；编排层只改 `createAgentSession` 的 `{ model, tools, excludeTools, customTools, resourceLoader }` 与会话级策略。
- Claude Code SDK / Codex SDK：**只借鉴概念**（MCP 总线、权限分层、Tool Search、子 Agent 作专员），**不**作为默认运行时依赖。

---

## 4. 分阶段实施计划

### Phase A — Coding Agent 标配（产品可信度，约 1～2 周）

**目标：** 单 Agent 路径上，行为与观感符合「能写代码的 Agent」。

| 序号 | 任务 | 实现要点 | 验收 |
|------|------|----------|------|
| A1 | 显式工具集 | `chat-service` / 共享 `session-factory.mjs` 中 `tools: ['read','bash','edit','write','grep','find']`（以 pi 实际 ToolName 为准） | 对仓库问「某符号在哪」能触发 grep/read |
| A2 | 事件桥接 | 订阅 `AgentSession` 的 message/tool 事件，IPC `chat:stream` 增加 `tool_start` / `tool_done` / `tool_error` | UI 显示工具名、摘要、耗时 |
| A3 | 工作区 | 设置工作区路径；`cwd` 与 `agentDir` 文档化；信任项目后加载 `.taskweaver/skills` | 换目录后工具作用于新仓库 |
| A4 | Skill 选用 | UI：Skill 列表；TaskWeaver 服务读取所选 Skill 正文、附带资源基准目录并注入当前任务，不依赖运行时斜杠命令 | Skill 正文进入实际任务上下文；选「多智能体编排」Skill 可强制 `MULTI_AGENT` |
| A5 | 基础安全 | TaskWeaver 权限 extension + 主进程弹窗：`ask` 每次命令询问、`on-risk` 已知高风险询问、`full` 不询问；权限提示只覆盖单次工具调用 | 拒绝/批准分支通过测试；不将正则审批冒充 OS 沙箱 |

**当前进度（2026-09-24）：** A4 已有首个闭环（`/Skill` 补全、显式选择、TaskWeaver 注入、Skill 与门控联动）；A5 有主进程审批闭环并通过拒绝/批准/路径符号链接/联网风险/失败关闭测试，但 OS 沙箱仍未实现；模型管理已增加凭据加密持久化、重启读取、候选与已添加列表分离、显式添加/移除；A2 已接入主 Agent 与 DAG 子任务的脱敏工具轨迹，并通过工具轨迹测试；DAG 子任务现按类型应用最小工具集。单 Agent 工具集收敛和 A3（完整工作区选择/信任闭环）仍未完成或未充分验收。  
**非目标：** 本阶段不要求 MCP、不要求完整 DAG 美化。

---

### Phase B — 门控与多智能体闭环（论文主线，约 2 周）

**目标：** 设计方案 § 入口门控 + DAG + 分配 可演示、可写进论文。

| 序号 | 任务 | 实现要点 | 验收 |
|------|------|----------|------|
| B1 | 门控完善 | `decideExecutionMode`：特征（并行子句、路径簇、用户显式 skill/关键词）；灰区 `ASK_USER` 前端确认 | 固定 3 条输入 → 预期 mode 一致 |
| B2 | Planner | 强模型一次输出 JSON DAG（已有 `parsePlan`）；失败重试与降级单 Agent | 生成 3～5 节点 DAG |
| B3 | 调度 | `dag-scheduler` 拓扑执行；节点状态推前端 | DAG 面板随状态更新 |
| B4 | 分配器 | `selectModelForTask(taskType, profiles)`：research→便宜、review→强等；记录每节点 `modelKey` 与估算 cost | 同 DAG 不同节点不同模型 |
| B5 | 子任务执行 | 每节点独立 `createAgentSession` 或复用 session 但换 model/tools；prompt 带依赖结果 | 实现→测试→审查 链式可跑通 |
| B6 | 合成回复 | 多 Agent 结束后主模型或模板合成用户可见总结（已有 `synthesize` 钩子） | 用户看到一条清晰总结 + 可展开 DAG |

---

### Phase C — 任务感知的工具与 Skill 策略（论文加分，约 1 周）

**目标：** 「任务感知」不仅指模型，也指 **工具/MCP/Skill 集**。

| 序号 | 任务 | 实现要点 | 验收 |
|------|------|----------|------|
| C1 | Task Profile | 定义 `TaskProfile { modelKey, tools[], skills[], sandbox? }` 映射表 | research 节点无 write；test 含 bash |
| C2 | 按需工具 schema | 借鉴 Tool Search：Planner 标注节点所需工具，会话创建时只注册子集 | 长会话 context 更稳（定性说明即可） |
| C3 | 失败升级 | test/review 失败 → 分配器升 tier 或换模型重试 1 次 | 演示「弱模型失败→强模型补救」 |

---

### Phase D — MCP 与外部集成（可选 / 演示级，约 1 周）

**目标：** 证明可接开放生态，不替代 pi 核心。

| 序号 | 任务 | 实现要点 | 验收 |
|------|------|----------|------|
| D1 | MCP 配置 | `userData/mcp.json`：stdio 服务器列表 | 配置一个可启动、可停止的 MCP 服务 |
| D2 | 桥接 | TaskWeaver 自有 MCP bridge：`tools/list` → 当前 Agent 可用工具定义 | Agent 能调 1 个 MCP 工具，UI 有调用轨迹 |
| D3 | 权限 | 与 A5 共用审批；MCP 工具默认需允许 | 论文一节「与 Claude SDK MCP 分层对照」 |

**Codex SDK：** 仅作 **可选 DAG 节点**（本机安装 Codex 时「实现专员」）；本科默认 **不做** 必交项。

---

## 5. 产品补齐计划（2026-09-24，新纳入当前目标）

此计划补足日常使用 Coding Agent 的产品闭环，不替代毕设主线「门控 + DAG + 子任务模型路由」。按依赖和演示价值执行；先做 P0，再按时间进入 P1/P2。

| 优先级 | 模块 | 交付范围 | 状态 |
|------|------|------|------|
| P0 | 工作区与多会话 | 原生选目录；线程按工作区保存；新建/切换/重命名/删除会话；切换后会话与 DAG 不串 | 后端已落地并通过持久化回归；会话侧栏 UI / 实际桌面验收待做 |
| P0 | `@` 上下文 | 工作区内文件/目录搜索、拖拽引用、受限文本装配、越界拒绝 | 后端索引 API、`@file`/`@dir` 装配及越界/体积限制已测；输入框选择器与拖拽 UI 待做 |
| P0 | 工作区 + 多会话/项目 | 线程存储、原生目录选择 IPC、会话切换/隔离 | **已完成**：侧栏UI、新建/切换/Pin/删除/Fork、工作区绑定隔离均已闭环 |
| P0 | @ 上下文 | @file / @dir 候选、拖拽引用、大小限制 | **已完成**：模糊匹配菜单、拖拽生成Token、上下文配额限制（单文件32KB/总量120KB）已闭环 |
| P0 | 安全路径与边界 | 拒绝目录穿越、符号链接逃逸、相邻前缀目录攻击 | **已完成 (Phase 1.1)**：独立 `security-path.mjs`，`workspace:revertDiff` 与协议彻底阻断逃逸 |
| P1 | 上下文可见性 | 消息 usage 与会话 context meter；接近阈值提示 | **已完成**：DSH 风格用量仪表盘、实时 Token 与耗时统计、/compact 手动与自动压缩已落地 |
| P1 | 输出面板 | 最近工具/Bash/编排输出的有界日志、筛选、错误状态 | **已完成 (Phase 2)**：后端 150 条有界日志，右侧抽屉面板支持状态筛选、关键词搜索与一键复制 |
| P1 | 细粒度权限 | 可持久化的 tool/路径/Bash 规则、会话批准、始终允许/拒绝管理 | **已完成 (Phase 1.2~1.4)**：Deny 优先拦截、模式通配、弹窗“总是允许”持久化、设置面板管理 |
| P1 | MCP 服务与UI | TaskWeaver 自有配置/连接/工具桥接/错误状态/安全凭据 | **已完成 (Phase 7.1 & 1.4)**：safeStorage 敏感加密、设置面板 Stdio 服务管理、启停开关与错误显示 |
| P1 | Git 检查点 | 回合前记录快照、差异对比、二次确认安全还原 | **已完成 (Phase 6)**：原生 `git stash create` 零污染快照、差异对比预览、还原前自动安全备份 |
| P1 | WebSearch | 默认关闭、需配置凭据、纳入权限审批的单个联网搜索工具 | 待评估落地 |
| P2 | Worktree | 多 Agent 的隔离工作区、差异报告；不自动合并 | 未开始；当前 DAG 按拓扑序串行执行，避免无隔离写冲突 |

### 实施顺序与安全约束

1. P0 基础完成：线程存储、原生目录选择 IPC、会话切换/隔离；会话侧栏 UI、新建、重命名、置顶、删除、分支 Fork 均已完成桌面实际验收。
2. `@` 上下文完成：主进程索引只遍历工作区、忽略依赖/构建目录、不跟随符号链接；`@file`/`@dir` 解析真实路径并拒绝越界；单文件 32 KiB、单次总量 120 KiB、目录最多 40 个文本文件，输入框候选与拖拽生成已全闭环。
3. **Phase 1.1 安全路径与边界已落地**：实现 `security-path.mjs`，以 `path.relative` 严格防止相邻前缀目录碰撞逃逸；向上逐级解析符号链接真实路径；修复 `workspace:revertDiff` 与自定义协议 `resolvePackagedFile` 的路径校验缺陷。
4. **Phase 1.2~1.4 细粒度权限规则与 MCP 安全存储已落地**：实现 `permission-rules-store.mjs`，支持 allow/deny 优先匹配，弹窗持久化“总是允许”；MCP 环境变量使用系统 `safeStorage` 加密落盘；前端设置面板增加权限与 MCP 两个独立页面。
5. **Phase 6 Git 检查点与 Phase 2 输出面板已落地**：基于原生 Git 游离 commit 的零污染快照机制，提供安全二次确认与自动前置备份；右侧新增执行日志抽屉面板与 Git 快照面板。

**实现记录（2026-09-25 更新）：**
经过系统性重构与推进，全仓已具备 17 项全自动化测试套件（`npm run test:all` 全量通过），TypeScript 严格检查与 Vite 打包通过。单 Agent 闭环、多 Agent 门控与 DAG 拓扑调度、细粒度权限安全、MCP 工具生态、Git 检查点快照与日志聚合面板全部真实接通。

---

### Phase E — 论文与交付（与开发并行）

| 交付物 | 内容 |
|--------|------|
| 设计与实现章节 | 门控 vs 分配、DAG、TaskProfile、与 pi 边界 |
| 对比讨论 | 单模型全强 vs 动态分配（固定案例 + 估算 token/价签） |
| 演示脚本 | ① 单 Agent 改 bug ② 门控进多 Agent ③ 分配降成本 ④（可选）MCP |
| 测试 | 门控单元测试；DAG 拓扑测试；手工功能清单 |

---

## 6. 里程碑时间表（建议）

| 里程碑 | 内容 | 建议完成 |
|--------|------|----------|
| M1 | Phase A 完成，demo 像 Coding Agent | 第 1 周末 |
| M2 | Phase B 门控+DAG+分配端到端 | 第 3 周末 |
| M3 | Phase C + 论文初稿 | 第 4 周末 |
| M4 | Phase D（可选）+ 答辩材料 | 截止前 1 周 |

---

## 7. 关键文件（实施时优先改）

```
electron/agent/agent-runtime.mjs       # 执行层适配出口
electron/agent/session-factory.mjs     # 建议新增：统一 createAgentSession 参数
electron/backend/chat-service.mjs      # 单 Agent + 事件流
electron/backend/orchestration-*.mjs   # 门控、规划、分配、DAG
electron/backend/skill-service.mjs     # Skill 目录
electron/extensions/taskweaver-guard.mjs  # 建议新增：工具审批/拦截
src/features/chat/                     # 建议：工具轨迹、Skill 选择组件
electron/extensions/                 # TaskWeaver 自有 extension（如权限）
```

---

## 8. 与 Claude / Codex SDK 的概念对照（借鉴而非依赖）

| 概念 | Claude Agent SDK | Codex | TaskWeaver 落地 |
|------|------------------|-------|-----------------|
| 工具定义 | 进程内 MCP `@tool` | App Server + 工具 | pi Extension / MCP→ToolDefinition 桥接 |
| 工具可见性 | `tools` / Tool Search | 会话配置 | TaskProfile + 按节点注册 |
| 权限 | `allowedTools` / `CanUseTool` | approval 流 | Extension 拦截 + Electron 确认 |
| Skill | Skill 工具 + 目录 | 较少强调 | pi Skills + `skill-service` + 门控联动 |
| 多 Agent | `Agent` 工具 | 编排用 Agents SDK（历史 MCP） | 自研 DAG + pi 多 session |

---

## 9. 风险与裁剪

| 风险 | 缓解 |
|------|------|
| 执行层版本升级 | 锁定 `package.json` 中 `@earendil-works/pi-coding-agent` 版本并回归测试 |
| npm workspace / electron 安装失败 | `npm install --legacy-peer-deps`；单独重装 electron |
| 多 Agent token 爆炸 | 门控保守；子任务 prompt 压缩；演示用中小仓库 |
| 范围过大 | Phase D、Codex 节点、大规模实验 **明确为非必交** |

---

## 10. 请评审人（GPT）重点看的 5 个问题

1. Phase 顺序是否合理：**先 A（标配 Agent 观感）再 B（论文主线）** 是否比先做 DAG 更稳？
2. **门控零 LLM** 与 **Planner 一次 LLM** 的职责边界是否清晰、有无漏洞？
3. **TaskProfile（Phase C）** 是否足够支撑「任务感知」表述，还是应并入 Phase B？
4. MCP 桥接放在 Phase D 作为可选，对本科毕设是否合适？
5. 有无明显重复建设（例如不应再引入 Claude Agent SDK 作为主运行时）？

---

## 11. 本地命令速查

```bash
npm install --legacy-peer-deps
npm run test:models    # 模型服务冒烟
npm start              # 构建 UI + 启动 Electron
npm run app            # 生成 TaskWeaver.app
```

---

*文档结束。可根据评审意见改优先级，但建议保持「pi 执行 + TaskWeaver 编排」边界不变。*
