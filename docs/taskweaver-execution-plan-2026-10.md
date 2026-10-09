# TaskWeaver 完整执行计划（2026-10-07 修订版）

> **索引：**阶段状态见 [`taskweaver-roadmap-2026-q4.md`](taskweaver-roadmap-2026-q4.md)；发版节奏见 [`release-rhythm-v1.2.md`](release-rhythm-v1.2.md)；headless 见 [`taskweaver-headless.md`](taskweaver-headless.md)。

初始修订记录（2026-10-07）：**分支 `main`**、**HEAD `80b3e040`**（与 `origin/main` 一致）、**tag `v1.2.1`**。本轮 BCDE 状态以 §15 为准；工作区改动尚未提交。

本版在「12 周总路线图」基础上，把 **已完成 / 进行中 / 未做** 写清楚，并给出 **版本切割、门禁、周计划、验收表**。

---

## 0. 定位与边界

### 0.1 产品定位

- **做**：桌面 Coding Agent（Electron + DSH Host / z-runtime），mux 内嵌 UI，对标 **Claude Code / Cursor Agent / Codex CLI** 的 Agent 闭环。
- **不做**：Tab 补全、全仓 embedding 索引、无上限 `@dir:.` 预载、应用关闭后仍跑的系统 cron（v1.3 再议 LaunchAgent opt-in）。

### 0.2 差异化（长期保留）

| 能力 | 说明 |
|------|------|
| 成本路由 | portfolio / 读便宜写贵（设置 + 文档） |
| DAG / 多 Agent | `orchestration-gate` + orchestration |
| Worktree / Git 检查点 | 已有 git-checkpoints 测试链 |
| 有界注入 + meter | `assemble-and-compose-user-prompt` + `chat:promptBudget` |

### 0.3 成功指标（每两周记录）

| KPI | 目标 |
|-----|------|
| `npm run test:roadmap-gate` | 合入 / 打 tag 前 **0 失败** |
| `npm run test:z-host-deploy` | 发版前本机 **必绿** |
| 单轮注入比 `injectedBytes/userBytes` P90 | < 3（meter utilization < 0.75） |
| 长会话（>15 轮）单步 input | compact 后台阶式下降 |
| P0 报障（发不出、幽灵消息、错模型） | 发版后 2 周内可回滚 |

---

## 1. 当前基线记录（历史快照：`17d53cea`）

本节记录计划最初编写时的历史快照，不代表当前完成状态；当前代码核对结果见 §15。

### 1.1 已交付（可视为 Done）

| 领域 | 证据 |
|------|------|
| **A 双路径 + 管道** | `assemble-and-compose-user-prompt.mjs`；`tasks:sendMessage` 共用 + `emitPromptBudget` |
| **有界注入** | `prompt-pipeline`、默认 **32KiB**（`app-preferences` / `context-assembler`） |
| **上下文** | assembler 限扫、repo-map 按需、compactor、tool-trace 折叠 |
| **OpenCodex** | 集成、短 `cursor-tool-guidance` |
| **v1.2 大块** | `b8e3b08f`：hooks、schedules、PR、tool-cache、explore 等 |
| **Plan / 工具进度 UI** | `aadc450b` |
| **门禁** | `roadmap-gate.mjs`；`f7218cf6`：**`test:all` 含 hooks / scheduled-jobs / transcript-policy / fork** |
| **文档** | `taskweaver-headless.md`、`taskweaver-execution-plan-2026-10.md`、`release-rhythm-v1.2.md` |
| **dsh-chat WIP** | 已收入 `f7218cf6`，工作区无未提交 dsh 改动 |

### 1.2 最近 2 commit 闭合的计划项

| ID | 内容 | 提交 |
|----|------|------|
| **B-07** | Compact UX、compaction-reply / policy 测试 | `17d53cea` |
| **C-05** | `fork-turns.mjs`、thread-store、fork smoke 加强 | `17d53cea` |
| **D-08** | headless 文档 + CLI 扩展 + `test-headless-cli` + gate `test:headless-doc` | `17d53cea` |
| **E-02** | test:all 与 gate 对齐 | `f7218cf6` |
| **A-07 部分** | 执行计划、优化日志、release-prepare | `f7218cf6` |

### 1.3 当时仍属「代码在库 ≠ 已交付」的项目（历史快照）

| 项 | 缺口 |
|----|------|
| **发版** | **v1.2.1** 已 push + tag（`7d462bd2`）；v1.2.0 仍为较早快照 |
| **本机门禁** | `roadmap-gate`、`z-host-deploy`、`tsc` 需本机跑绿 |
| **B-07 E2E** | Banner → Host `/compact` 真压历史：需手工 + 可选自动化 |
| **C-05 产品** | fork 后端在库；**UI「从该轮分叉」** 需点验全链 |
| **C 单源** | `preferDshTranscript` / shadow：路线图写「基本完成」，**停写双份 jsonl + 迁移** 需签字 |
| **tool-cache** | `VERIFICATION-CHECKLIST.md` 功能/性能大量 `[ ]` |
| **D 其余** | Job 子任务 UI、MCP 按会话裁剪、headless **真 CI（有模型）** |
| **卫生** | 未跟踪：`docs/CODE-REVIEW.md`、`docs/TECHNICAL-HIGHLIGHTS.md`、`docs/FINAL-CHECKLIST.md` |

---

## 2. 版本与发布节奏

```
v1.2.0 (tag 已有，不含最新 2 commit)
    → v1.2.1（推荐：push + gate + compact/fork 手工 E2E）
    → v1.2.x（tool-cache 验收、热修）
    → v1.3.0（C 单源写路径 + fork 产品封口）
    → v1.4.0（D headless CI smoke、Job MVP）
    → v2.0.0（仅 Host/API breaking）
```

| 版本 | 必含 | 不含 |
|------|------|------|
| **v1.2.1** | ahead 2、roadmap-gate 绿、z-host-deploy、安装包 smoke | 新大功能 |
| **v1.3.0** | C-01～C-09 验收表全勾 | Tab、embedding |
| **v1.4.0** | D-03、D-09、D-06 最小可用 | 系统 cron 默认开 |

### 发版前固定命令

```bash
cd "/Users/zsn/Documents/毕设"
npm run test:roadmap-gate
npm run test:z-host-deploy    # 非沙箱
npx tsc -b
npm run build:z-runtime       # 若动 vendor
npm run release:prepare       # 或 release:prepare-v1.2.0
npm run install:app
```

---

## 3. 阶段 A — 发版止血（状态：**代码完成，发布未闭**）

**目标**：远端与 tag 与运行行为一致。

| ID | 任务 | 交付物 | 验收 |
|----|------|--------|------|
| A-01 | `git push` ahead 2 | 远端 `codex/taskweaver-v1.2.0` 含 17d53cea | `git log origin/... -1` 一致 |
| A-02 | roadmap-gate + tsc | 日志 | exit 0 |
| A-03 | test:z-host-deploy | 日志 | exit 0 |
| A-04 | 安装包 smoke | 一条 chat、meter、Host 起 | 无 asar 旧 env |
| A-05 | 打 **v1.2.1**（或移 v1.2.0，二选一） | tag + CHANGELOG | 团队共识 |
| A-06 | 处理未跟踪 docs | add 或删 | 干净 `git status` |
| A-07 | 优化日志 | 32KiB、共用模块名、headless/fork 条目 | 与代码一致 |

**时间盒：1～3 天。**

---

## 4. 阶段 B — 上下文、Token、性能

**目标**：未缓存 input 可控；长会话不线性爆炸。

### 4.1 注入与产品（B-01～B-05）

| ID | 任务 | 验收 |
|----|------|------|
| B-01 | 设置页 **16 / 32 / 48 KiB** 预设 | 切换后下一轮 meter 变 |
| B-02 | Repo map 保持按需 + plan/goal token 档 | 纯闲聊无 map |
| B-03 | Cursor 引导仅 OpenCodex | 已短 XML，回归测试 |
| B-04 | Skill 仅选中/启用 | 无 skill 无大块 |
| B-05 | Composer 帮助：`@dir` 风险提示 | 文案上线 |

### 4.2 历史与 Compact（B-06～B-09）

| ID | 任务 | 验收 |
|----|------|------|
| B-06 | 工具输出 **唯一写回出口** 审计 | Host 桥接无旁路大 stdout |
| B-07 | **Compact 闭环**（UX 已进 17d53cea） | 手工：建议 → 确认 → 历史变短；`test-compaction-reply` 绿 |
| B-08 | `compaction-reply` 与 `CompactionRow` 一致 | UI 与后端字段对齐 |
| B-09 | Host preset `compaction-basic` 默认 | 文档写 `/compact` 时机 |

### 4.3 可观测（B-10～B-12）

| ID | 任务 | 验收 |
|----|------|------|
| B-10 | `MessageTurnUsageChip`：**本轮 vs 累计** 标注 | 与 usage-store 口径一致 |
| B-11 | utilization ≥0.9 → UI 提示新开/compact | 与 console.warn 一致 |
| B-12 | tasks 路径 `scope: tasks:sendMessage` 日志 | 已有，抽查 |

### 4.4 Tool-cache（v1.2.2 候选，B-13～B-15）

| ID | 任务 | 验收 |
|----|------|------|
| B-13 | 填 `VERIFICATION-CHECKLIST` 功能项 | 命中率/延迟有数 |
| B-14 | `taskweaver-optimized` preset 文档 + 默认策略 | `test:tool-cache` 绿 |
| B-15 | 会话 4MB 上限无 OOM | 长会话压测 |

**里程碑：v1.2.1（A）+ v1.2.2（B 产品项可选）。**  
**时间盒：2～3 周（与 A 重叠）。**

---

## 5. 阶段 C — 会话单源 + Fork

**目标**：无幽灵消息；fork 可测可点；多会话可审计。

### 5.1 Transcript 单源（C-01～C-04）

| ID | 任务 | 验收 |
|----|------|------|
| C-01 | 生产默认 `preferDshTranscript` | shadow IPC 无长期 divergence |
| C-02 | **停写** UI threads 双份消息体 | 新会话仅 DSH 为正文源 |
| C-03 | 旧 jsonl **一次性迁移** + 备份 | 回滚方案文档 |
| C-04 | `projectionStream` 重连/多窗口 | `test:projection-stream` 绿 |

### 5.2 Fork（C-05～C-07）

| ID | 任务 | 验收 |
|----|------|------|
| C-05 | UI「从该轮分叉」→ IPC → `fork-turns` → 新 thread | 历史止于该轮；**17d53cea 后端已有，封 UI 链** |
| C-06 | `fork-thread-smoke.test.mjs` | 已在 test:all / gate |
| C-07 | Fork 与 Git 检查点说明图 | `docs` 一页 |

### 5.3 多会话（C-08～C-10）

| ID | 任务 | 验收 |
|----|------|------|
| C-08 | `getConversationRuntimeContext` 审计 | model/workspace/permission 按 conversationId |
| C-09 | 更新 `docs/多会话隔离审计.md` | 用例表 + 结论 |
| C-10 | `test:integration:multi-session` | CI 或 gate 可选纳入 |

**里程碑：v1.3.0。**  
**时间盒：3～5 周。**

---

## 6. 阶段 D — Agent 对齐（CC / Cursor / Codex）

**目标**：Plan、Job、headless、调度、PR「默认可演示、可关」。

### 6.1 Claude Code 向

| ID | 任务 | 验收 |
|----|------|------|
| D-01 | Plan review **门禁**（`aadc450b` UI + Host plan） | 拒绝不执行 mutation |
| D-02 | `autoVerifyAfterMutation` + 自愈上限 | 开时 typecheck/lint；关时零注入 |
| D-03 | **Job 子任务 MVP**（列表/取消/进度） | orchestration 单入口 |
| D-04 | 权限按 repo 规则 | permission 面板 E2E |

### 6.2 Cursor Agent 向

| ID | 任务 | 验收 |
|----|------|------|
| D-05 | 工具树 + live progress | 长任务不卡 UI |
| D-06 | **MCP 按会话启用** | schema 体积下降可测 |
| D-07 | Explore 页边界 | 与 MCP 市场不重复 |

### 6.3 Codex CLI 向

| ID | 任务 | 验收 |
|----|------|------|
| D-08 | headless 协议（**doc + CLI 已有**） | `test-headless-doc` + `test-headless-cli` 绿 |
| D-09 | **CI job**：fixture 无真模型或 nightly 真模型 | 文档写清哪条 |
| D-10 | `run-agent-read-smoke` 扩展 | 非交互 smoke |

### 6.4 编排与成本

| ID | 任务 | 验收 |
|----|------|------|
| D-11 | `orchestration-gate` 可配置默认 | 灰区多 Agent 可关 |
| D-12 | 成本路由默认策略文档 + 设置 | portfolio 可读 |
| D-13 | OpenCodex ≥2.79 健康卡 | 失败降级文案 |

### 6.5 定时与 PR（v1.2.x～v1.3）

| ID | 任务 | 验收 |
|----|------|------|
| D-14 | `scheduled-jobs` 应用内 | 关应用行为明确；`test:scheduled-jobs` |
| D-15 | LaunchAgent opt-in + 文档 | `test-launchd-scheduler` |
| D-16 | GitHub PR UI | 失败不阻塞主聊天 |

**里程碑：v1.4.0 ≈ D-03 + D-09 必达。**  
**时间盒：4～8 周（与 C 后期并行）。**

---

## 7. 阶段 E — 生态与工程化

| ID | 任务 | 验收 |
|----|------|------|
| E-01 | Hook 示例 + `docs/taskweaver-hooks.md` | before/after turn；超时杀进程 |
| E-02 | test:all ≡ gate 核心集 | **f7218cf6 已做**；发版前再 diff 一次 |
| E-03 | 拆分 `register-ipc.mjs` | prompt / git / terminal / schedules 分模块 |
| E-04 | 安装版 E2E 清单 | 发消息、read、bash、权限一次 |
| E-05 | `release-prepare` 版本参数化 | **f7218cf6 已做** |

**时间盒：6～12 周滚动。**

---

## 8. 测试矩阵（谁跑、何时跑）

| 层级 | 命令 | 时机 |
|------|------|------|
| **PR / 日常** | `npm run test:roadmap-gate` + `npx tsc -b` | 每次合入 |
| **发版** | + `test:z-host-deploy` + `test:all` + `install:app` smoke | tag 前 |
| **领域** | `test:prompt-pipeline`、`test:usage`、`test:dsh-chat`、`test:tool-cache`、`test:hooks`、`test:scheduled-jobs` | 改对应目录必跑 |
| **集成** | `npm run test:integration`（含 fork smoke） | 动 transcript/fork 必跑 |

`roadmap-gate` 当前覆盖（摘要）：prompt-pipeline、workspace-context、orchestration、dsh-lifecycle、usage、transcript-policy、scheduled-jobs、hooks、launchd、github-pr、fork smoke、headless-doc 等。

---

## 9. Token / 成本专项（贯穿 B + 用户教育）

### 9.1 用户习惯（零代码）

1. 新任务 **新线程**；>10 轮 **compact 或新开**。  
2. 只读：**readonly preset** + 非 OpenCodex。  
3. 设置 **16KiB** 省钱档；看 **注入仪表**。  
4. 不用大 `@dir`；改码写清文件路径。

### 9.2 工程联动（按周）

| 周 | 工程 |
|----|------|
| 1 | A 发版 + B-07 手工 E2E |
| 2 | B-06 出口审计 + B-10 用量口径 |
| 3 | B-01 预设 + B-11 高 utilization 提示 |
| 4 | B-13 tool-cache 数据回 checklist |

**说明**：OpenCodex **缓存常 0%** — 不依赖 prompt cache，靠 **减 input + 少轮次 + compact**。

---

## 10. 12 周甘特（一人 / 小团队）

| 周 | 焦点 | 目标版本 |
|----|------|----------|
| 1 | **阶段 A 全闭**（push、gate、v1.2.1、安装 smoke） | v1.2.1 |
| 2 | B-07 E2E、B-06、B-10/11 | v1.2.1 patch |
| 3～4 | B-01、B-13～15（tool-cache 可选） | v1.2.2 |
| 5～7 | C-01～C-05（单源写 + fork UI 封口） | v1.3.0-rc |
| 8 | C-08～C-10 + 隔离审计 | v1.3.0 |
| 9～10 | D-01、D-03、D-09 | v1.4.0-rc |
| 11～12 | E-03、E-04、D-06 | v1.4.0 |

**4 周极简路径**：只做 **A + B-07 E2E + C-05 UI 链 + E-04 手工清单**。

---

## 11. 风险登记册

| 风险 | 缓解 |
|------|------|
| tag v1.2.0 与 HEAD 不一致 | 打 v1.2.1，文档写清 |
| 路线图写「C 基本完成」但未停双写 | v1.3.0 硬门禁：C-02 未勾不发版 |
| OpenCodex 账单偏高 | 16KiB、compact、新线程 |
| register-ipc 膨胀 | E-03 拆分 |
| headless 无模型 CI | D-09 分 doc 测试 + nightly 真跑 |
| tool-cache 内存 | 4MB/session + checklist |

---

## 12. 本周执行包（复制到 Issue）

- [x] `git push origin codex/taskweaver-v1.2.0`  
- [x] `npm run test:roadmap-gate` && `npx tsc -b`  
- [x] `npm run test:z-host-deploy`  
- [x] `git tag v1.2.1` + GitHub Release  
- [ ] 手工：**CompactSuggestBanner** → compact 一条会话  
- [ ] 手工：**从某轮 fork** 新线程，核对历史截断  
- [ ] `git tag v1.2.1`（或更新 CHANGELOG 后打 tag）  
- [ ] 处理 `docs/CODE-REVIEW.md`、`TECHNICAL-HIGHLIGHTS.md`（入库或删）  
- [ ] 更新 `docs/修改与优化日志.md`（含 17d53cea / f7218cf6）

---

## 13. 与竞品差距 — 本计划覆盖映射

| 能力 | 阶段 | 版本 |
|------|------|------|
| 有界注入 + meter | A/B | v1.2.1 |
| 强 compaction 产品化 | B | v1.2.1～1.2.2 |
| 单源会话 | C | v1.3.0 |
| Fork at turn | C | v1.3.0（后端 v1.2.1 已有） |
| Headless 文档 + CLI 测试 | D | v1.2.1 已有；CI v1.4.0 |
| Job / 子 agent UI | D | v1.4.0 |
| Hook 生态 | E | v1.4.0+ |

---

## 14. 仓库内文档索引（执行时以代码为准）

| 文档 | 用途 |
|------|------|
| `docs/taskweaver-execution-plan-2026-10.md` | 本文（任务 ID 真源） |
| `docs/taskweaver-roadmap-2026-q4.md` | 阶段状态表 |
| `docs/release-rhythm-v1.2.md` | 里程碑与发版清单 |
| `docs/taskweaver-headless.md` | D-08 协议与前置条件 |
| `docs/VERIFICATION-CHECKLIST.md` | tool-cache 实测 |
| `scripts/roadmap-gate.mjs` | 自动化门禁真源 |

---

**历史总结**：v1.2 能力已基本进库；后续重心转到 v1.2.1 发布闭合、compact/fork E2E、单源迁移与 headless/Job。

---

## 15. BCDE 当前代码复核（2026-10-07）

当前基线为 `main` / `80b3e040`，与 `origin/main` 一致，版本 tag 为 `v1.2.1`。本轮完成的变更仍在工作区，未提交、未推送。本节覆盖前文的历史状态。

### B — 上下文、Token、性能

- **已实现/已有**：工作区 `@` 文件索引 5 秒快照缓存；相关性与 Repo Map 缓存增加过期和容量限制；Skill 解析按目标会话的 workspace/trust 取值；OpenCodex Cursor 工具名引导与错误说明；本轮工具活动摘要（编辑/查看/搜索/命令及可确认的增删行数）接入消息持久化与展示；16/32/48 KiB 预算预设、meter 与 Compact 提示已在基线。
- **未闭合**：B-06 工具输出写回出口审计；B-07 安装版 Compact 真压历史验收；B-09 Host compaction preset 的实际运行验收；B-13～B-15 tool-cache 命中率、性能及 4 MB 会话压力数据。当前未宣称性能提升数值。
- **验证**：本轮执行了 `npm run build` 和改动 `.mjs` 文件的 `node --check`；未运行测试套件或性能压测。

### C — 会话单源与 Fork

- **已实现/已有**：`preferDshTranscript` 为默认；Fork UI 行 ID 到本地消息 ID 的映射和失败关闭；多会话运行时上下文包含 model/workspace/permission 与 workspace trust；Fork 与 Git 检查点说明见 `docs/fork-and-git-checkpoints.md`；多会话审计已更新。
- **未闭合**：C-02/C-03 停写双份正文及旧数据迁移暂缓，原因是本地正文还承担标题、搜索、错误提示及回退职责，需先设计 provenance、备份和回滚；C-04/C-06/C-10 的重连、多窗口及集成测试未运行；Fork 的真实 Host 安装版链路仍待手工验收。

### D — Agent 对齐

- **已实现/已有**：D-03 增加 DAG 单子任务取消；D-09 在 runtime workflow 增加无模型 fixture CLI smoke；D-10 扩展 read smoke；D-13 健康检查优先只读，并补充 OpenCodex 故障提示；其余 Plan、权限、进度、headless、调度能力以现有实现为准。
- **未闭合**：D-06 需要 Host 提供 session-scoped MCP tools 筛选与持久化 API；当前 Host 公开接口无法可靠地按会话改写全局 MCP catalog。本轮未加入静态伪配置。CI fixture workflow 变更尚未在远端执行。

### E — 生态与工程化

- **已实现/已有**：Hook runner 增加 30 秒超时、进程树终止与每路 64 KiB 输出上限；Git 检查点、定时任务、终端/诊断 IPC 拆分为独立注册模块，公共 IPC 结果封装抽到 `ipc-utils.mjs`；prompt 组装仍由既有独立模块承担；新增安装版 E2E 清单。
- **未闭合**：安装包 E2E 清单尚未实际执行；Hook 的 workspace 命令以当前用户权限运行，只应对可信 workspace 启用。

### 本轮验证边界

- `npm run build`：早先一次通过；最新一次在 `tsc -b` 失败，错误集中于新增未跟踪的 `src/components/DiffViewer.tsx`（缺少 `diff-match-patch` 依赖、类型定义和 JSX `style` 类型）。该文件归属尚未确认，未擅自改动。
- `node --check`：已核查的 Electron backend / smoke 脚本通过；`git diff --check` 通过。
- 未运行任何测试套件、未运行安装版/真实模型 E2E、未做性能压测；CI 尚未验证。
- 未清理分析文档，也未删除 vendor 下出现的未跟踪 semantic-search / inline-edit 包；它们未纳入本轮 BCDE 交付验收。
