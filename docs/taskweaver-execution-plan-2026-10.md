# TaskWeaver 完整执行计划（2026-10-07 修订版）

> **索引：**阶段状态见 [`taskweaver-roadmap-2026-q4.md`](taskweaver-roadmap-2026-q4.md)；发版节奏见 [`release-rhythm-v1.2.md`](release-rhythm-v1.2.md)；headless 见 [`taskweaver-headless.md`](taskweaver-headless.md)。

> **当前执行权威（2026-10-13）：**面向顶级 Coding Agent 的可靠性与能力差距，以本文 §16 的 `CA-*` 任务 ID 和状态为唯一执行清单。§0–15 包含 2026-10-07 的计划与历史基线；与 §16 或当前源码冲突时，不要把旧状态当成已验收事实。当前审计基线为 `0668e6562`；审计未运行测试或构建。创建本计划时 `src/features/settings/SettingsPage.tsx`、`src/styles.css` 有未提交修改，执行任务前必须重新检查并保留。

初始修订记录（2026-10-07）：**分支 `main`**、**HEAD `80b3e040`**（与 `origin/main` 一致）、**tag `v1.2.1`**。本轮 BCDE 状态以 §15 为准；工作区改动尚未提交。

> **历史内容提示：**§0–15 的 shell 命令、包管理器和测试入口均属于 2026-10-07 计划快照，可能已过时，不要直接照抄。当前仓库固定使用 `pnpm@11.7.0`；执行命令前先核对当前 `package.json` 与 `AGENTS.md`。

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

---

## 16. Coding Agent 质量提升计划（2026-10-13 当前执行）

### 16.1 目标与产品边界

目标不是堆出更多功能，也不承诺和某个竞品“功能完全一样”。目标是让用户把有明确验收条件的真实仓库任务交给 TaskWeaver 后，Agent 能理解仓库、在正确边界内修改、运行与任务匹配的验证、如实报告证据；失败时保留现场并可恢复。

TaskWeaver 当前是 **macOS 优先的本地桌面 Coding Agent**。本计划遵守仓库约束：不把 Windows 作为支持目标；不默认启用云端执行；不自动推送、合并、发布、覆盖已安装应用或进行真实模型计费调用。云端/团队托管能力是后续产品决策，不阻塞本地 Agent 质量提升。

### 16.2 现有基础与审计边界

仓库已有多智能体与 DAG、会话持久化/恢复、Worktree 与 Git 检查点、任务路由、Repo Map/符号工具、Shell/文件/MCP/Web 工具、Hooks、计划任务和 GitHub PR 能力；根 `test:all` 也覆盖了大量服务与生命周期场景。这些属于已有能力，不应重复造一套。

本计划基于源码和静态引用/调用链审查，不代表所有能力都完成了安装版或真实任务验收。2026-10-13 审计没有运行测试、构建或真实模型实验。以下缺陷分为源码已确认和需要运行场景复现两类；进入执行阶段后应先复核当前代码，再写测试并修复。

### 16.3 已知差距与风险登记

| ID | 优先级 | 发现 | 证据与当前判断 | 状态 |
|---|---|---|---|---|
| CA-R01 | P0 | Shell/RPC 终端请求的 sender 缺少终端服务要求的整数窗口 ID；注册 owner 时可能直接失败 | [`register-terminal-ipc.mjs`](../backend/register-terminal-ipc.mjs) 要求 `event.sender.id`；Shell sender 定义见 [`shell-platform.mjs`](../backend/platform/shell-platform.mjs) | 源码确认；待复现与修复 |
| CA-R02 | P1 | `apply_patch` 把 CRLF 内容归一成 LF 后写回，可能导致整文件换行格式变化 | [`apply-patch.ts`](../packages/runtime/fs/tool-fs/src/apply-patch.ts)；普通 `editText` 会恢复换行格式 | 源码确认；待回归测试 |
| CA-R03 | P1 | 首次运行提示读写路径可能回退到 `process.cwd()`，而不是应用 user data 目录 | [`register-app-ipc.mjs`](../backend/ipc/register-app-ipc.mjs) 与 IPC 装配路径 | 静态调用链确认；待针对路径修复 |
| CA-R04 | P1 | Planner 输出样例仍含不存在的 `desktop/main.cjs`，配置中也有旧 `desktop/` 路径 | [`plan-and-execute.mjs`](../backend/orchestration/plan-and-execute.mjs)、`.taskweaver/planner-hints.json` | 源码确认；待改为从当前索引选路径并校验 |
| CA-R05 | P1 | MCP 工具缓存身份仅包含 URL；相同 URL 换认证身份时可能短暂复用旧工具 schema | [`remote-tool-cache.ts`](../packages/runtime/mcp/mcp-client/src/remote-tool-cache.ts)、`connection.ts` | 风险成立；不是已确认的权限绕过；待定义安全缓存语义 |
| CA-R06 | P2 | Python PTY 后备模式的 wrapper 与 shell 进程组清理可能不完整 | [`terminal-service.mjs`](../backend/terminal-service.mjs)、[`pty-shim.py`](../backend/pty-shim.py) | 静态推断；必须先复现，不按既定 Bug 修复 |
| CA-R07 | P2 | Contract API 类型有失效导入、且与 `src/shared/app-api.ts` 漂移；当前检查范围未覆盖该文件 | `contract/types/app-api.ts`、`scripts/gen-ipc-types.mjs`、`tsconfig.app.json` | 源码确认；待决定生成/校验的唯一来源 |
| CA-R08 | P2 | Node 获取路径默认版本和校验方式不一致 | `scripts/ensure-host-node.mjs` 与 `scripts/macos/fetch-node.sh` | 源码确认；先确认两条构建入口是否都受支持 |
| CA-R09 | P2 | 若干重要脚本测试未进入默认回归门禁；CI 与 `test:all` 有重复步骤，README/提示词样例有陈旧命令和路径 | 根 `package.json`、`.github/workflows/ci.yml`、`tests/README.md`、`tests/prompts/cases.json` | 源码确认；待梳理后修改 |
| CA-R10 | P3 | OAuth token cache 对 loader 返回对象的 token 字段缺少完整结构校验；并发冷启动也需确认是否会重复刷新 | [`oauth-token-cache.mjs`](../packages/provider-bridge-transport/oauth-token-cache.mjs)；当前内部调用链会提供 token 字符串 | 待分诊；不是已确认的任务阻断问题 |
| CA-R11 | Triage | 原生 Shell 可从 `TASKWEAVER_UI_URL` 选择受信任的 loopback 页面，再把 Shell API bearer token 放进 URL fragment；需要核清环境来源、页面脚本可控性与 token 能力 | [`TaskWeaverShellApp.swift`](../apps/macos/TaskWeaverShell/Sources/TaskWeaverShell/TaskWeaverShellApp.swift)、[`ShellURLPolicy.swift`](../apps/macos/TaskWeaverShell/Sources/ShellURLPolicy/ShellURLPolicy.swift)、[`bootstrap.ts`](../src/shell/bootstrap.ts) | 条件性风险；未确认漏洞，不得按已证实问题描述 |

已完成的仓库卫生清理：提交 `0668e6562` 删除无调用入口的迁移/打包残留、测试生成文件、旧扩展和临时 `scratch/` 脚本；Swift 壳未接线的导航状态也已删除；Git 不再跟踪 SwiftPM `.build` 缓存。本清理不代表运行时可靠性问题已解决。

### 16.4 阶段与任务

估时按一名熟悉仓库的工程师粗算，只用于排期，不构成自动执行时限。每个阶段完成后记录 commit、改动范围、实际验证命令和结果；未执行的验证明确写 `NOT RUN`，不得把代码已存在描述为已通过。

#### CA-00：冻结基线与任务评测设计（分为 A/B 两个检查点）

- [ ] **CA-00A（数小时）：**重新核对 `git status`、当前分支/HEAD、当前 `AGENTS.md`、pnpm/Node 版本和测试入口；记录未提交用户改动，并使用隔离副本或 worktree 做基线工作，不覆盖、不纳入用户文件。
- [ ] CA-R01 是 P0：完成 CA-00A 后立即复现并推进 CA-10 中的 CA-R01，不等待完整任务集；记录修复前后代码快照与针对性证据。
- [ ] **CA-00B（1–2 天）：**在固定仓库快照上建初始任务集，覆盖仓库问答、单点 Bug、跨文件功能、重构、测试修复、权限/文件边界、MCP、DAG/取消/恢复。至少 20 个不同任务作为 smoke/eval 开始集；20 项本身不构成发布统计门槛。
- [ ] 固定并记录 repo commit、模型/Provider、路由策略、权限、干净工作区副本、提示和验证命令；用相同设置比较原始快照与候选版本，避免把已有用户工作区修改混入结果。
- [ ] 每个任务评分：验收通过、隐藏/针对性测试、回归、scope/权限违规、完成声明是否有执行证据、耗时、工具调用、token/成本。保留失败样本，不从统计中剔除。

**验收：**CA-00A 有可恢复的基线标识与用户改动清单；P0 不被 benchmark 排期阻塞。CA-00B 的样本能回溯到代码快照与工具/测试记录；候选比较前冻结评分规则和阈值。

#### CA-10：修复阻断执行与数据完整性的缺陷（3–5 天）

- [ ] **CA-R01 终端身份：**为 Shell 与 RPC 路径定义稳定、隔离的 owner 身份，不伪造 Electron sender。验证创建、数据事件、停止、sender 销毁、跨 owner 拒绝及异常清理。
- [ ] **CA-R02 换行：**`apply_patch` 保留 CRLF/LF、无末尾换行和混合换行输入的约定；若混合换行不支持，要明确拒绝或采取有据可依的策略，不能静默重写整文件。
- [ ] **CA-R03 用户数据路径：**从应用平台层显式注入唯一 user data 路径；移除生产回退到 cwd 的路径；覆盖读取旧标记、写入新标记和目录不可写等失败场景。
- [ ] **CA-R04 Planner 路径：**提示样例和 planner hints 不写死迁移前路径；规划结果必须根据当前工作区索引验证存在性。无效路径应要求修正或报告失败，不得悄悄作为有效 scope 执行。
- [ ] **CA-R05 MCP 缓存：**制定缓存身份、工具禁用/替换时序及旧 schema 失效规则。身份指纹不得保存或写日志明文凭据；同 URL 换账号、header/token 变化、刷新失败、并发连接均须可测。新权限工具同步完成前不得把旧 schema 当成新身份的可执行能力。
- [ ] **CA-R06 PTY：**先通过取消/关闭测试复现是否遗留 shell；如复现，再定义 macOS 支持范围内的进程组信号、超时和清理语义。
- [ ] **CA-R07 API 类型：**以 `contract/channels.mjs` 为契约真源，明确 TS API 类型是生成物还是由契约导出；修正无效导入，并让 IPC 检查实际覆盖其类型消费端。
- [ ] **CA-R08 Node 供应：**清点每条受支持的打包入口，统一版本来源；下载时校验官方摘要，失败需 fail closed。淘汰的旧 builder 应删除或标成不支持入口。
- [ ] **CA-R11 Shell URL/token（分诊）：**确认 `TASKWEAVER_UI_URL` 是否可由非可信来源注入、loopback 页面由谁控制、fragment token 可被哪些脚本读取、token 可调用哪些 IPC/API；按威胁模型和可达性定优先级，不预设为漏洞。

**验收：**CA-R01–CA-R04 的回归门禁通过；CA-R05/06 的安全语义与复现结论有记录；CA-R11 有明确威胁前提与处置结论；关键失败路径可以在不调用真实外部服务的 fixture/mock 中验证。P0/P1 未关闭不得进入发布验收。

#### CA-20：把正确性验证变成默认闭环（3–5 天，可与 CA-10 后半并行）

- [ ] 为 `scripts/` 下已有测试建立清单：默认 CI、PR 必跑、发行必跑、nightly/真实模型、人工诊断、废弃；每项给出责任包和理由。CA-00B 期间可先做只读清点，与 CA-10 后半并行。
- [ ] 将 P0/P1 边界回归接入适当的 `pnpm` 门禁；评估 `test:z-runtime-build-atomic`、GitHub OAuth、Shell 静态服务等未接线项。专项人工检查不强塞进每次运行。
- [ ] 移除 CI 中重复执行的等价步骤，修正集成测试 README 命令与遗漏列表、prompt eval 旧路径；生成文件的检查以生成脚本和 `check:ipc` 为准。
- [ ] 核心 P0/P1 收敛后分诊 **CA-R10 OAuth cache（P3）**：验证 loader 返回 `undefined`、非字符串 `accessToken`、异常 expiry 和并发冷启动；只有复现无效缓存或重复刷新后才修复。
- [ ] 统一测试结果证据：Agent 只可报告实际执行且成功的命令；跳过、未运行、失败、部分通过需分别显示，不能从自然语言推断“测试通过”。
- [ ] 等 CA-10 修复范围和接口稳定后，把针对性回归接入门禁；CA-10 完成后再用固定任务集跑修复前后版本，分层比较 correctness、回归、权限、安全、耗时、工具数、成本。不允许只优化平均耗时而牺牲任务成功率或安全边界。

**验收：**每个 P0/P1 生产路径均有针对性自动验证；默认 CI 对关键路径无重复且无缺口；benchmark 报告包含失败样本、置信限制和真实命令记录。测试清点可提前完成，但修复后比较不得早于 CA-10 完成。

#### CA-30：让代码库理解更精确、更省上下文（1–2 周）

- [ ] 审计 Repo Map、文件索引、符号提取和 LSP 的默认组合。对已支持语言启用可用的符号/诊断入口；未支持语言明确降级到 grep/read。
- [ ] 评估索引新鲜度与大仓开销：增量更新、Git 变更失效、忽略 vendor/generated/build、按需读取。不要因为竞品有 embedding 就默认添加全仓向量库。
- [ ] Planner scope 必须由当前工作区路径索引生成和验证；跨文件问题的只读 scope 覆盖完整调用链，写 scope 按任务最小化。
- [ ] 用 CA-00 的仓库问答和跨文件定位题衡量路径准确率、引用完整度、工具调用数与上下文 token。

**验收：**支持语言的符号查找可从 Planner/Agent 常规路径使用；增量变更后索引不返回旧路径；benchmark 的定位/证据质量不得比 baseline 下降。

#### CA-40：提升长任务、DAG 和恢复的正确性（1–2 周）

- [ ] 保持产品约束：普通 Composer 走单 Agent；只有用户明确选择多智能体/Goal 时才启动 DAG，不因复杂度自动升级。
- [ ] 每个 DAG 节点具有具体输入、scope、验收点、依赖和停止条件；下游只依赖已完成且通过证据检查的上游结果。
- [ ] 审计取消、失败、重试、进程重启、会话恢复、worktree 清理与重复执行；清理失效任务不能丢失用户改动。
- [ ] 结果汇总必须基于执行历史和测试证据，不以 Agent 的“我完成了”作为唯一终态。证据不足时输出未完成与下一步。
- [ ] 并行改动按文件/职责分区，主 Agent 负责集成；禁止多个 worker 同时改同一接口而无契约协调。

**验收：**固定任务集至少覆盖取消、失败恢复和真实 turn 并发；任务状态与 Host/tool 历史一致；无未授权写入、越界或幽灵成功。

#### CA-50：打磨从需求到可审阅交付的产品流程（1–2 周）

- [ ] 把 Plan → 修改 → targeted tests → Diff/Worktree review → 汇总证据串成单一任务流程，确保用户能看到进行中状态、失败原因和最终改动。
- [ ] 验收 GitHub PR 能力的权限、草稿/审阅、失败重试与离线降级；发布、push、merge、安装等高影响动作仍需明确用户授权。
- [ ] 验证长任务离开/关闭 UI 后的真实语义：支持的恢复行为、后台任务生命周期和通知必须与界面一致；不能把 LaunchAgent 定时运行等同任意任务云端持续执行。
- [ ] 保持 macOS 原生壳与浏览器开发入口契约一致；优先修复跨 Shell/RPC 差异，不以新增平台目标稀释稳定性工作。

**验收：**从新建任务到审阅 diff 的端到端 smoke 覆盖成功、失败、取消和恢复；所有外部副作用均在正确授权边界内。

#### CA-60：用实测提升模型路由与工具策略（持续，CA-00 后开始）

- [ ] 分开测模型能力、Provider 延迟、路由策略、上下文构成、工具策略和 DAG 并发；一次实验只改变一个主要变量。
- [ ] 对分类器/路由决策保留解释、候选与实际 Provider；故障 fallback 对用户可见，不默默改变权限或任务目标。
- [ ] 使用固定与 holdout 任务对比不同可用模型/路由；同时报告成功率、质量、P50/P90 时延和成本，不用单样本宣称提速。20 项初始集仅用于 smoke；进入 CA-70 前扩到至少 50 个不同任务，随机性明显的任务至少跑 3 次，并按任务做 paired bootstrap 或同等方法报告 95% 置信区间。
- [ ] 对依赖真实模型或收费 Provider 的实验设置独立显式命令，CI 默认使用 mock/fixture。

**验收：**任何默认路由变化都以冻结任务集数据支持；关键确定性任务无回归，安全/权限违规为零。当前计划建议把总体正确率的非劣界值预登记为 `-5` 个百分点：候选与 baseline 的配对差值点估计不得下降，且 95% 区间下界不得越过该界值。CA-00B 首次候选比较前冻结或书面调整此门槛；区间过宽或跨过门槛时标记“证据不足”，扩充样本后再判，不得按通过处理。结果可复跑。

#### CA-70：发布门禁与维护收尾（2–4 天）

- [ ] 只保留被支持的构建路径，统一 Node 与 pnpm 来源；验证生成的 deploy/app 内容与源码来源一致。
- [ ] 发布门禁涵盖 IPC、TypeScript、runtime 构建、P0/P1 集成回归和独立 `.app` smoke；每个门禁列明命令、环境和跳过条件。
- [ ] 更新 README、roadmap、Agent instructions 和测试清单，删除完成后已失效的路径/说明；所有 plan 状态标注日期与 commit。
- [ ] 形成一次端到端质量报告：与 CA-00 baseline 的质量/回归/成本/延迟差异；发布或推送仍需用户单独授权。

**总验收门槛：**没有未关闭的 P0/P1；所有关键用户任务都有可重跑验证；完成声明与运行证据一致；同一固定任务集的正确率点估计不低于 baseline，且 95% 区间下界不越过 CA-00B 冻结的非劣界值；安全/权限违规为零；成本与耗时有数据且没有通过降低质量换取表面提速。未满足或证据不足时标记未完成，不以功能已合入代替验收。

### 16.5 顺序、并行分工与交接规则

依赖顺序：**CA-00A → CA-R01 P0 快速通道 → CA-00B → CA-10 其余问题 → CA-20 → CA-30/CA-40 → CA-50 → CA-60 复测 → CA-70**。CA-20 的只读测试目录清点可与 CA-10 后半并行；CI 回归接线待接口/修复方案稳定；修复前后 benchmark 在 CA-10 完成后执行。CA-30 与 CA-40 可在接口冻结后分人执行。CA-10 的终端、文件换行、MCP 任务应由不同责任人处理，不并行编辑同一文件。

建议子任务边界：

1. Shell/RPC owner、PTY 生命周期：`backend/register-terminal-ipc.mjs`、`backend/platform/`、`backend/terminal-service.mjs`、`backend/pty-shim.py`。
2. Runtime 文件工具与 MCP cache：`packages/runtime/fs/` 与 `packages/runtime/mcp/`，互相不改共享数据结构。
3. CI、测试清单、固定任务集：根 `package.json`、`.github/workflows/`、`scripts/`、`eval/`。
4. Planner、API contract、UI 展示和最终集成由主负责人串行整合；每个 worker 返回文件范围、证据、未解决点，不直接扩大任务范围。

每次继续本计划前，先读本节和 `git status`；只推进一个 `CA-*` 主任务，完成时更新状态与证据；提交只包含本任务文件，检查点不得混入用户改动。每个 CA-R 风险记录 `状态 / 责任人 / 相关提交 / 验证命令与结果 / 下一步或未决问题`；`fixed` 只表示代码已修改，只有有命令输出或等价可复核证据时才可改为 `verified`。上下文切换只传递当前 ID、下一步、阻塞项和未提交用户改动，不重做已完成审计。最新状态以本节状态表和风险证据台账为准。

Node 构建入口已知分为两条：根 `package.json` 的 `app`/`app:dmg` → `scripts/macos/build-app.sh` → `scripts/macos/fetch-node.sh`（当前默认 Node `v22.19.0`、arm64、校验官方 SHA256）；以及 `scripts/make-mac-app.sh` → `scripts/build-macos-shell-app.mjs` → `scripts/ensure-host-node.mjs`（当前默认 `22.18.0`、允许 arm64/x64、未校验 SHA256）。CA-R08 必须明确第二条是否受支持；若保留，两条均统一版本与校验/失败语义；若废弃，删除或明确阻断其入口，并更新引用和布局检查。

### 16.6 当前状态表

| ID | 状态 | 当前结论/下一步 |
|---|---|---|
| CA-00 | TODO | CA-00A 冻结工作区并保护用户改动；CA-R01 P0 后完成 CA-00B 任务集和 baseline |
| CA-10 | TODO | 优先处理终端身份、换行与用户数据路径 |
| CA-20 | TODO | 建立测试入口清单并闭合关键回归门禁 |
| CA-30 | TODO | 先测 Repo Map/LSP/符号入口，再决定索引改造 |
| CA-40 | TODO | 审计 DAG 证据、取消、恢复和隔离路径 |
| CA-50 | TODO | 验证 Plan→改码→测试→Diff/PR 的端到端体验 |
| CA-60 | TODO | CA-00 baseline 后按单一变量做模型/路由比较 |
| CA-70 | TODO | 其他阶段验收后完成发布与文档门禁 |

#### 风险证据台账（逐项更新）

状态限定为 `TODO / CONFIRMED / REPRODUCED / FIXED / VERIFIED / DEFERRED`。静态确认与运行复现分开记录；没有验证命令或可检查证据时不得写 `VERIFIED`。

| ID | 状态 | 责任人 | 相关提交 | 验证命令与结果 | 下一步 / 未决问题 |
|---|---|---|---|---|---|
| CA-R01 | CONFIRMED（静态） | 未分配 | — | NOT RUN | P0：最小化复现 Shell/RPC owner 注册失败并修复 |
| CA-R02 | CONFIRMED（静态） | 未分配 | — | NOT RUN | 覆盖 CRLF/LF、无末尾换行和混合换行约定 |
| CA-R03 | CONFIRMED（调用链） | 未分配 | — | NOT RUN | 确认 userDataPath 注入并覆盖写入失败 |
| CA-R04 | CONFIRMED（静态） | 未分配 | — | NOT RUN | 校验 Planner 输出路径存在且属于当前 workspace |
| CA-R05 | CONFIRMED（风险） | 未分配 | — | NOT RUN | 设计换身份/换凭据/刷新失败与并发失效测试 |
| CA-R06 | TODO（静态推断） | 未分配 | — | NOT RUN | 先复现 PTY 取消/关闭后是否遗留进程 |
| CA-R07 | CONFIRMED（静态） | 未分配 | — | NOT RUN | 定义 contract 类型单一来源并扩大真实消费端检查 |
| CA-R08 | CONFIRMED（静态） | 未分配 | — | NOT RUN | 由 CA-10 决定第二条 builder 的支持状态与统一方案 |
| CA-R09 | CONFIRMED（静态） | 未分配 | — | NOT RUN | 清点默认 CI、专项、人工诊断与废弃入口 |
| CA-R10 | TODO（待分诊） | 未分配 | — | NOT RUN | 校验异常 loader 结果与并发冷启动，不假定已复现 |
| CA-R11 | TODO（威胁建模） | 未分配 | — | NOT RUN | 明确环境变量来源、loopback 页面控制和 token 能力 |

**当前续接点：CA-00A，然后快速处理 CA-R01 P0。**首次执行时重新检查 SettingsPage/CSS 工作区修改；这些改动不属于本计划，不得覆盖或纳入本计划提交。
