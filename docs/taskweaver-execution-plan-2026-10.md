# TaskWeaver 完整执行计划（2026-10-07 修订版）

> **索引：**阶段状态见 [`taskweaver-roadmap-2026-q4.md`](taskweaver-roadmap-2026-q4.md)；发版节奏见 [`release-rhythm-v1.2.md`](release-rhythm-v1.2.md)；headless 见 [`taskweaver-headless.md`](taskweaver-headless.md)。

> **当前执行权威（2026-10-13）：**面向顶级 Coding Agent 的可靠性与能力差距，以本文 §16 的 `CA-*` 任务 ID 和状态为唯一执行清单。§0–15 包含 2026-10-07 的计划与历史基线；与 §16 或当前源码冲突时，不要把旧状态当成已验收事实。静态审计参考代码快照为 `0668e6562`；执行基线和后续验证见 §16.6。创建本计划时 `src/features/settings/SettingsPage.tsx`、`src/styles.css` 有未提交修改，执行任务前必须重新检查并保留。

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
| CA-R01 | P0 | Shell/RPC 终端请求的 sender 缺少终端服务要求的整数窗口 ID；注册 owner 时可能直接失败 | [`register-terminal-ipc.mjs`](../backend/register-terminal-ipc.mjs)；Shell sender 定义见 [`shell-platform.mjs`](../backend/platform/shell-platform.mjs) | 已修复并通过 targeted 验证；见 §16.6 |
| CA-R02 | P1 | `apply_patch` 把 CRLF 内容归一成 LF 后写回，可能导致整文件换行格式变化 | [`apply-patch.ts`](../packages/runtime/fs/tool-fs/src/apply-patch.ts)；普通 `editText` 会恢复换行格式 | 已修复：统一 CRLF/LF 保留；混合换行明确拒绝；见 §16.6 |
| CA-R03 | P1 | 首次运行提示读写路径可能回退到 `process.cwd()`，而不是应用 user data 目录 | [`register-app-ipc.mjs`](../backend/ipc/register-app-ipc.mjs) 与 IPC 装配路径 | 已修复：显式注入 userDataPath、移除 cwd 回退，并通过路径隔离专项测试；见 §16.6 |
| CA-R04 | P1 | Planner 输出样例仍含不存在的 `desktop/main.cjs`，配置中也有旧 `desktop/` 路径 | [`plan-and-execute.mjs`](../backend/orchestration/plan-and-execute.mjs)、`.taskweaver/planner-hints.json` | 已修复：示例取当前索引路径；research/review scope 必须匹配索引，索引外路径触发有限修正；见 §16.6 |
| CA-R05 | P1 | MCP 工具缓存身份仅包含 URL；相同 URL 换认证身份时可能短暂复用旧工具 schema | [`remote-tool-cache.ts`](../packages/runtime/mcp/mcp-client/src/remote-tool-cache.ts)、`connection.ts` | 已复现并修复：缓存身份绑定有效 HTTP headers 的摘要；旧缓存仅临时展示，实时 schema 同步成功前不可执行；见 §16.6 |
| CA-R06 | P2 | Python PTY 后备模式的 wrapper 与 shell 进程组清理可能不完整 | [`terminal-service.mjs`](../backend/terminal-service.mjs)、[`pty-shim.py`](../backend/pty-shim.py) | 已复现：关闭后 shell 与后台任务存活；已修复并专项验证，见 §16.6 |
| CA-R07 | P2 | Contract API 类型有失效导入、且与 `src/shared/app-api.ts` 漂移；当前检查范围未覆盖该文件 | `contract/types/app-api.ts`、`contract/types/model-api.ts`、`src/shared/`、`tsconfig.app.json` | 已修复：renderer shared API 是唯一类型定义；contract 类型入口改为 re-export，并纳入 `check:ipc` 的 TypeScript 消费端检查；见 §16.6 |
| CA-R08 | P2 | 两套 macOS Node 获取/打包入口版本和校验策略不一致 | 旧 `scripts/ensure-host-node.mjs` 与当前 `scripts/macos/fetch-node.sh` | 已确定仅支持 `build-app.sh` 路径；旧 builder、下载器和 npm script 已删除，资源映射及文档已同步；见 §16.6 |
| CA-R09 | P2 | 若干重要脚本测试未进入默认回归门禁；CI 与 `test:all` 有重复步骤，README/提示词样例有陈旧命令和路径 | 根 `package.json`、`.github/workflows/ci.yml`、`tests/README.md`、`tests/prompts/cases.json` | 已完成分诊与本地针对性验证；workflow/打包环境仍待 CI 确认，见 §16.6 |
| CA-R10 | P3 | OAuth token cache 未校验 loader 返回的 access token；`undefined`/非字符串可能被缓存。并发冷启动会启动多个 helper，需区分 helper 重复与真实 token refresh 重复 | [`oauth-token-cache.mjs`](../packages/provider-bridge-transport/oauth-token-cache.mjs)、[`bridge-access.ts`](../vendor/opencodex/src/oauth/bridge-access.ts)、[`store.ts`](../vendor/opencodex/src/oauth/store.ts) | 缓存校验已修复并通过专项测试；源码审查确认真实 refresh 有进程内 single-flight 与跨进程锁/锁内重读。重复 helper 启动仍可能，作为轻量性能开销记录；未运行真实 Provider |
| CA-R11 | Triage | 原生 Shell 接受进程环境中的 `TASKWEAVER_UI_URL` loopback override，并把 Shell API bearer token 放进 URL fragment；审查环境来源、页面脚本可控性与 token 能力 | [`TaskWeaverShellApp.swift`](../apps/macos/TaskWeaverShell/Sources/TaskWeaverShell/TaskWeaverShellApp.swift)、[`ShellURLPolicy.swift`](../apps/macos/TaskWeaverShell/Sources/ShellURLPolicy/ShellURLPolicy.swift)、[`bootstrap.ts`](../src/shell/bootstrap.ts) | 已确认是有前提的本机环境风险，不是已证实远程漏洞；token 从地址栏/历史项清除，开发日志不再输出 token；loopback override 的残余风险 deferred，见 §16.6 |
| CA-R12 | P1 | 测试构造 Host 时未把临时 `HOME` 注入 runtime-home migration；一次模型服务测试误把真实 `~/.dsh` 迁移进临时目录，随后源目录与测试临时目录均被清理 | [`spawn-host.mjs`](../backend/agent/z-host/spawn-host.mjs)、[`test-model-service.mjs`](../scripts/test-model-service.mjs)、本次执行记录 | 代码侧隔离缺陷已修复并验证；用户确认不需要恢复数据。真实目录的逐文件清单未留存，不能从 Git 还原 |
| CA-R13 | P1 | Planner 只读 Agent 的词法 `scopePaths` 检查把 POSIX `\\` 当成分隔符、允许 symlink scope/目标指向工作区外，并漏检 `glob` 的 `target_directory` 搜索根别名 | [`repeat-tool-reminder/src/index.ts`](../packages/runtime/guard/repeat-tool-reminder/src/index.ts)、[`fsio.ts`](../packages/runtime/fs/fs-local/src/fsio.ts)、[`read-target.ts`](../packages/runtime/fs/tool-fs/src/read-target.ts)、[`glob.ts`](../packages/runtime/fs/tool-fs-search/src/glob.ts) | 已修复并回归验证：通过 `ctx.fs.resolve/contains` 同时约束工作区根、scope 根和实际请求/搜索根的规范化身份；见 §16.6 |
| CA-R14 | P2 | Repo Map 的 LIFO 扫描在 1000 文件上限处静默截断，本仓库全部 228 个 `backend/` 文件未进入索引；mtime+size 缓存会漏掉同大小且恢复 mtime 的编辑，跨工作区缓存数量无界 | [`repo-map-service.mjs`](../backend/repo-map-service.mjs)、[`test-repo-map-service.mjs`](../scripts/test-repo-map-service.mjs) | 已改为确定性广度优先扫描、标记库存/Token 截断、按 ctimeNs 校验与 schema 迁移、限制内存持久缓存 LRU；默认仍为 1000 文件，完整 5234 候选的冷生成约 6.4 秒，进一步提速留作评估 |
| CA-R15 | P2 | `@` 文件模糊搜索把一次遍历结果缓存至工具结果或 Agent 销毁；外部编辑器新增/删除文件时可无限期返回旧候选 | [`search.ts`](../packages/runtime/context/file-reference-local/src/search.ts)、[`search.spec.ts`](../packages/runtime/context/file-reference-local/tests/search.spec.ts) | 已给完成的索引增加 5 秒 TTL；目录前缀查询仍读取实时目录；见 §16.6 |
| CA-R16 | P1 | `@taskweaver/dsh-file-reference` 发布入口 `lib/index.js` 导入 `./grammar.js`，但通用构建没有产出该文件，包白名单也未包含它；公开包名导入会报 `ERR_MODULE_NOT_FOUND` | [`file-reference/tsdown.config.ts`](../packages/runtime/context/file-reference/tsdown.config.ts)、[`file-reference/package.json`](../packages/runtime/context/file-reference/package.json) | 已增加包级 Host 入口配置，构建 `lib/grammar.js` 并列入发布文件；包名导入与 `pnpm pack --dry-run` 均通过，见 §16.6 |
| CA-R17 | P2 | Python outline 用单一 `currentClass` 归属嵌套 `def`，嵌套函数/类会被错当成外层类方法；嵌套类方法也会错挂 | [`symbol-outline-extractor.mjs`](../backend/symbol-outline-extractor.mjs)、[`test-symbol-outline-extractor.mjs`](../scripts/test-symbol-outline-extractor.mjs) | 已改用按缩进维护的类/函数作用域栈，并覆盖嵌套函数、嵌套类和 tab 缩进；仍是逐行正则解析，不支持多行签名、完整 Python 语法或多行字符串中的伪定义 |
| CA-R18 | CONFIRMED | Repo Map 收集的代码扩展名比符号提取器实际支持范围更广；`.mts/.cts` 曾被收集但返回空符号，Vue/Svelte、Swift、Java、C-family、Ruby、PHP、Lua、Shell、SQL、GraphQL、Proto 当前也没有对应提取器；TS 构造器/accessor、Rust/Go 部分成员和多行签名存在覆盖限制 | [`repo-map-service.mjs`](../backend/repo-map-service.mjs)、[`symbol-outline-extractor.mjs`](../backend/symbol-outline-extractor.mjs) | `.mts/.cts` 已转交现有 TypeScript AST 并增加回归；其余语言/语法缺口保持显式，不把路径发现误称为符号索引。下一步按仓库实际语言与价值确定解析器支持矩阵，优先覆盖本仓库 Swift 源码 |
| CA-R19 | P2 | Planner 路径索引的 `vendor` 忽略规则与排序优先级冲突；遍历计数在刚好到达上限时误报截断，且深度/目录读取失败原因没有传给 Planner | [`planner.mjs`](../backend/orchestration/planner.mjs)、[`plan-and-execute.mjs`](../backend/orchestration/plan-and-execute.mjs)、[`test-planner-hints.mjs`](../scripts/test-planner-hints.mjs) | 已移除不可达的 `vendor` 排序权重；准确区分扫描、深度、不可读目录与展示上限，在真实 Planner prompt 中说明具体不完整原因；隐藏/忽略项仍消耗扫描预算，后续应评估其对候选可发现性的影响 |

已完成的仓库卫生清理：提交 `0668e6562` 删除无调用入口的迁移/打包残留、测试生成文件、旧扩展和临时 `scratch/` 脚本；Swift 壳未接线的导航状态也已删除；Git 不再跟踪 SwiftPM `.build` 缓存。本清理不代表运行时可靠性问题已解决。

### 16.4 阶段与任务

估时按一名熟悉仓库的工程师粗算，只用于排期，不构成自动执行时限。每个阶段完成后记录 commit、改动范围、实际验证命令和结果；未执行的验证明确写 `NOT RUN`，不得把代码已存在描述为已通过。

#### CA-00：冻结基线与任务评测设计（分为 A/B 两个检查点）

- [x] **CA-00A 初始冻结：**复核了 `git status`、分支/HEAD、`AGENTS.md`、pnpm/Node 版本和测试入口；具体快照见本节执行记录。
- [x] CA-00A 基准隔离：建立 detached 干净 worktree，冻结修复前完整提交 `f5624a10880efd2841df4f0a45fb0b8eaed5beba`；SettingsPage/CSS 用户改动未进入基线。
- [x] CA-R01 是 P0：初始冻结后立即处理，已记录修复前代码基线、修复提交与针对性证据；无需等待完整任务集。
- [x] **CA-00B 初始任务集：**在冻结快照上建立 20 项任务，覆盖仓库问答、单点/跨文件修复、重构、测试、权限/文件边界、MCP、DAG/取消/恢复；任务提示、验收、验证命令、风险标签和禁止副作用均版本化在 `eval/coding-agent/tasks.json`。
- [x] **CA-00B 真实工具调用方法：**复用 headless + 本机 Host 历史；新增默认 `ask`、可选 `readonly`/`on-risk`，不开放 `full`，无 UI 的高风险审批会被拒绝并记入 `permissionEvents`。验证脚本仍可通过无模型 fixture 运行。
- [x] 已盘点现有评测：`eval/orchestration/tasks.json` 是 10 个确定性 mock DAG 任务；`eval/prompts` 有 30 个提示行为样例；`parity-bench` 评估 Host 生命周期/队列/DAG。它们都不能单独代表真实工具调用下的端到端编码质量，不能直接当作本计划 baseline。
- [ ] 固定并记录被测 Agent commit、Z Runtime 版本/哈希、模型/Provider、路由、权限、干净任务工作区和重复次数；通过真实 Provider 运行原始快照与候选版本。当前没有执行模型请求。
- [x] 冻结初始评分结构：安全硬失败条件、100 分权重（正确性 50、范围/回归 20、工具与验证证据 20、报告准确性 10），资源指标单独报告；缺失费用记为 null/unavailable。
- [ ] 逐项运行后记录验收、隐藏/针对性测试、回归、scope/权限违规、声明证据、耗时、工具调用和 token/成本；保留失败样本，不从统计中剔除。

**验收：**CA-00A 有可恢复的基线标识与用户改动清单；P0 不被 benchmark 排期阻塞。CA-00B 的样本能回溯到代码快照与工具/测试记录；候选比较前冻结评分规则和阈值。

#### CA-10：修复阻断执行与数据完整性的缺陷（3–5 天）

- [x] **CA-R01 终端身份：**Electron 继续用真实 `sender.id`；Shell/RPC 使用稳定的 sender 对象身份，不伪造 Electron sender。专项测试覆盖实际 ShellPlatform 无 ID 创建、data/exit 推送、owner stop、sender 销毁、跨 owner 拒绝和创建异常清理。提交见 §16.6。
- [x] **CA-R02 换行：**`apply_patch` 保留 CRLF/LF 和无末尾换行；混合换行明确拒绝，避免静默重写整文件。专项结果见 §16.6。
- [x] **CA-R03 用户数据路径：**从应用 IPC 装配层显式注入唯一 user data 路径；移除生产回退到 cwd 的路径；覆盖配置路径读取、dismiss 写入、缺失路径与写入失败。
- [x] **CA-R04 Planner 路径：**提示样例动态取当前索引路径；hints 更新为当前 Shell/Backend 调用链；路径索引扫描深度扩至四层、默认上限调至 2000 项；research/review 的每项 `scopePaths` 必须匹配本轮展示索引，索引外路径触发有限修正，不会进入 DAG 执行。
- [x] **CA-R05 MCP 缓存：**缓存身份绑定 endpoint 与规范化有效 HTTP headers 的 SHA-256 摘要，不落盘/日志明文凭据；每代连接复用同一份已解析 headers；缓存 schema 只临时展示，旧定义捕获到的调用在实时列表同步后失败；缓存注册和实时同步共用串行队列，旧代同步在提交前复核 generation。覆盖同 URL 换 header/token、刷新失败、并发写入与重连旧代竞态。
- [x] **CA-R06 PTY：**真实复现 Python fallback 关闭后 shell 与后台任务仍存活；wrapper 收到 SIGTERM 后清理 shell 私有 session 的全部进程组，先发 SIGTERM、短暂等待后 SIGKILL，并 wait/reap shell。fork 期间屏蔽 SIGTERM 以保留 child PID，父进程初始化也纳入 finally；Node 的 SIGKILL 兜底放宽到 5 秒，避免中断 shim 的进程扫描与回收。专项覆盖忽略 SIGTERM 的后台任务，见 §16.6。
- [x] **CA-R07 API 类型：**`contract/channels.mjs` 继续唯一维护 channel、handler 与 bridge 映射；renderer API 类型只在 `src/shared/app-api.ts` / `model-api.ts` 定义，`contract/types/` 改为薄 re-export 入口，不再保存漂移副本。将 `contract/types/**/*.ts` 加入 app TS 项目，并让 `check:ipc` 调用 `tsc --project tsconfig.app.json`，使生成的 IPC bridge 和真实 renderer 消费端进入检查。
- [x] **CA-R08 Node 供应：**清点每条受支持的打包入口，统一版本来源；下载时校验官方摘要，失败需 fail closed。淘汰的旧 builder 应删除或标成不支持入口。
- [x] **CA-R12 测试隔离：**`createZHostManager` 显式接收 `home` 并传入迁移/清理逻辑；触发 Host 的测试与手工诊断统一提供临时 `home` 和 `TASKWEAVER_HOME`。针对性验证通过。数据恢复不再执行，按用户答复结案；实际目录内容不作猜测。
- [x] **CA-R11 Shell URL/token（分诊）：**确认 `TASKWEAVER_UI_URL` 仅由壳进程环境读取，仓库没有其他设置入口；默认打包版加载内置 UI，打包 CORS 拒绝任意本机端口；fragment token 对初始页面脚本可见且可调用已注册 Shell IPC。移除 query token fallback，bootstrap 清除 fragment/query 中的 token；开发模式改用无凭据入口 URL + no-store 重定向，避免终端打印 bearer token。剩余“非可信启动环境注入任意 loopback UI”的条件性风险记为 deferred，不按远程漏洞定级。

**验收：**CA-R01–CA-R04 的回归门禁通过；CA-R05/06 的安全语义与复现结论有记录；CA-R11 有明确威胁前提与处置结论；关键失败路径可以在不调用真实外部服务的 fixture/mock 中验证。P0/P1 未关闭不得进入发布验收。

#### CA-20：把正确性验证变成默认闭环（3–5 天，可与 CA-10 后半并行）

- [x] 为 `scripts/` 下已有测试建立清单：默认 CI、PR 必跑、发行必跑、nightly/真实模型、人工诊断、废弃；每项给出责任包和理由。见 [`taskweaver-test-inventory-2026-10.md`](./taskweaver-test-inventory-2026-10.md)。
- [x] 将 P0/P1 边界回归接入适当门禁：默认集新增 startup、Shell static entry、model/bridge/chat/usage/MCP 覆盖；Host deploy/runtime build 与 app bundle 检查保留在 CI/发行专用入口。专项人工检查不强塞进每次运行。
- [x] 移除 CI 中重复执行的等价步骤，修正集成测试 README 命令与遗漏列表、prompt eval 旧路径；生成文件的检查以生成脚本和 `check:ipc` 为准。
- [x] 核心 P0/P1 收敛后分诊 **CA-R10 OAuth cache（P3）**：验证 loader 返回 `undefined`、非字符串 `accessToken`、异常 expiry 和并发冷启动；空值/非字符串误缓存已复现并修复。并发冷启动会重复启动 Bun helper；OpenCodex 的 refresh coordinator 通过进程内 flight map、跨进程 account lock 和锁内重读凭据避免重复 refresh。未做真实 Provider 调用，见 §16.6。
- [x] 统一测试结果证据：Agent 只可报告实际执行且成功的命令；跳过、未运行、失败、部分通过需分别显示，不能从自然语言推断“测试通过”。Shell 输出缺少退出码时改为未确认；DAG 合并 Host 与后端验证器结果，并显示通过、失败、部分通过、未运行、跳过和未完成状态。
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

Node 构建唯一支持入口：根 `package.json` 的 `app`/`app:dmg` → `scripts/macos/build-app.sh` → `scripts/macos/fetch-node.sh`，默认获取 Node `v22.19.0` arm64 并校验官方 SHA256。已删除旧 `make-mac-app.sh`、`build-macos-shell-app.mjs`、`ensure-host-node.mjs` 与 `ensure:host-node` script；`packaging/mac-shell-resources.yml` 现映射实际构建源 `apps/macos/build/node`，布局测试会阻止旧入口复活。

### 16.6 当前状态表

| ID | 状态 | 当前结论/下一步 |
|---|---|---|
| CA-00 | IN PROGRESS | 冻结 worktree、20 项任务集和 headless Host 调用方法已就绪；塔罗任务独立于 20 项集。选定 `openai-codex/gpt-6-luna`，拟将有效评测限制为最多 280 次 provider 尝试、每会话最多 5 个 step、每请求 2048 output tokens，名义 token-equivalent 上限约 $9.81。预检发现 Codex 默认走 WebSocket，绕过了最初的 fetch 守卫；运行中出现模型工具事件但没有额度槽，可能已产生一项或多项未计数请求，精确次数无法恢复；已停止预检，不作为评分样本。修复后须强制 SSE 并拒绝外部 WebSocket，先确认真实 Host 请求产生额度槽再继续。OAuth 请求使用账户额度，名义金额不是账单保证 |
| CA-10 | COMPLETE | CA-R01–CA-R13 已完成代码验证或威胁分诊；CA-R11 的启动环境条件性风险留在 deferred 跟踪，不作为已证实远程漏洞 |
| CA-20 | IN PROGRESS | 测试清单、默认接线、去重、证据状态策略、本机 macOS `.app`/DMG 构建和包布局检查已完成；GitHub Actions 与固定任务集 benchmark 仍待执行 |
| CA-30 | IN PROGRESS | CA-R13–R16 已修复并提交；CA-R17 Python 归属修复、CA-R19 Planner 截断/提示修复已完成定向验证，待提交。CA-R18 确认收集扩展名与符号提取语言不匹配，`.mts/.cts` 已补齐，Swift 与其他语言/语法仍有缺口。1000 项默认 Repo Map 覆盖全部 228 个 `backend/` 文件与 13 个可见根级目录，完整 5234 候选冷生成约 6.4 秒；继续完成符号矩阵、Planner scope 可发现性与清理候选审查 |
| CA-40 | TODO | 审计 DAG 证据、取消、恢复和隔离路径 |
| CA-50 | TODO | 验证 Plan→改码→测试→Diff/PR 的端到端体验 |
| CA-60 | TODO | CA-00 baseline 后按单一变量做模型/路由比较 |
| CA-70 | TODO | 其他阶段验收后完成发布与文档门禁 |

#### 风险证据台账（逐项更新）

状态限定为 `TODO / CONFIRMED / REPRODUCED / FIXED / VERIFIED / DEFERRED`。静态确认与运行复现分开记录；没有验证命令或可检查证据时不得写 `VERIFIED`。

| ID | 状态 | 责任人 | 相关提交 | 验证命令与结果 | 下一步 / 未决问题 |
|---|---|---|---|---|---|
| CA-R01 | VERIFIED | Codex 主 Agent | `94a47fbb0`, `2d659932e` | `node scripts/test-terminal-service.mjs` PASS；`node scripts/test-terminal-output-throttle.mjs` PASS；`pnpm run test:terminal` 在 pnpm 自动依赖检查阶段因无 TTY 中止，未启动测试 | Shell/RPC sender object identity；测试覆盖 actual ShellPlatform 生命周期、隔离、数据推送、stop 与失败清理 |
| CA-R02 | VERIFIED | Codex 主 Agent | `3b29300a3`, `a4d069b37` | `vitest run fs/tool-fs/tests/apply-patch.spec.ts --config vitest.config.ts` PASS（7/7，含发布入口回归） | CRLF/LF 与无末尾换行保留；混合换行失败关闭且磁盘文件不变；发布入口 `lib/index.js` 与源代码保持一致 |
| CA-R03 | VERIFIED | Codex 主 Agent | `7c7bdaf74` | `node scripts/test-legacy-secrets.mjs` PASS；覆盖显式 userDataPath、cwd 诱饵目录、缺失路径拒绝与写入失败不回退 | `wireBackendIpc` 显式注入 `userDataPath`；移除 `process.cwd()` 兜底；测试验证只读与 dismiss 标记写入都命中应用目录 |
| CA-R04 | VERIFIED | Codex 主 Agent | `01594efea` | `node scripts/test-orchestration.mjs` PASS；`node scripts/test-planner-route.mjs` PASS；`node scripts/test-planner-hints.mjs` PASS；`node scripts/test-eval-prompts.mjs` PASS；`node scripts/eval-prompts.mjs` PASS；针对性 ESLint PASS；`pnpm run test:orchestration` 在依赖状态检查阶段因无 TTY 中止，脚本未启动 | 旧 `desktop/` scope 通过有限修正回归确认会被拒绝；当前调用链的 11 个 hints 路径均存在且进入索引；CA-R06/07 已验证，当前继续处理 CA-R08 |
| CA-R05 | VERIFIED | Codex 主 Agent | `ccd479bd7` | 在 `packages/runtime` 执行 `./node_modules/.bin/vitest run mcp/mcp-client/tests --config vitest.config.ts` PASS（7 files / 116 tests）；定向 ESLint PASS；`tsc -b mcp/mcp-client` PASS；package-only tsdown Host bundle PASS；`node --check packages/runtime/mcp/mcp-client/lib/index.js` 与 `git diff --check` PASS | 缓存身份含 endpoint 与规范化有效 headers 摘要；摘要不含原凭据；缓存定义仅展示且不能在 live `tools/list` 成功前执行；缓存注册与同步串行，旧 generation 不能提交结果 |
| CA-R06 | VERIFIED | Codex 主 Agent | `af4c84570` | 先以 forced Python fallback 复现：`killSession()` 后 shell 与后台 child 均存活；修复后 `node scripts/test-terminal-service.mjs` PASS（覆盖忽略 SIGTERM 的后台 child，shell、child、wrapper 均退出）；`node_modules/.bin/eslint backend/terminal-service.mjs scripts/test-terminal-service.mjs --max-warnings 0` PASS；Node `--check`、Python AST parse、`git diff --check` PASS。`pnpm exec eslint ...` 因 pnpm 自动依赖状态检查在无 TTY 环境中止，随后直接运行仓库本地 ESLint 二进制通过 | Python shim 在 SIGTERM 时扫描 shell 私有 session 的 process groups，TERM 后 100ms 再 KILL，wait/reap shell；fork PID 竞态由 pthread signal mask 关闭；Node wrapper 5 秒强杀仅作兜底。复现和验证记录见下方 |
| CA-R07 | VERIFIED | Codex 主 Agent | `68a996a02` | 修复前直接编译 `contract/types/app-api.ts` 失败：找不到 `../types` 与 `./ipc-invoke-channels`；修复后 `node scripts/gen-contract-schema.mjs --check` PASS；`node scripts/gen-ipc-types.mjs --check` PASS；`node scripts/gen-shell-bridge.mjs --check` PASS；`node scripts/check-ipc-contract.mjs` PASS（158 routes / registrations、79 renderer API paths）；`node_modules/.bin/tsc --project tsconfig.app.json` PASS（含 renderer 与 contract types）；`node scripts/test-ipc-contract.mjs` PASS（158 invoke channels、14 events、1 local method）；`git diff --check` PASS | `src/shared/app-api.ts` 与 `src/shared/model-api.ts` 是唯一声明来源；`contract/types/` 只 re-export。`check:ipc` 现在包含 app TypeScript 项目检查，生成类型和 renderer API 的实际消费端均被验证 |
| CA-R08 | VERIFIED | Codex 主 Agent | `0d29da2ff` | `node scripts/test-macos-bundle-layout.mjs` PASS；`node scripts/test-host-node-executable.mjs` PASS；`node scripts/test-launchd-scheduler.mjs` PASS；`node scripts/check-package-scripts.mjs` PASS（134 root scripts）；Node `--check` 与 `git diff --check` PASS。未下载 Node 或运行 macOS 打包 | 唯一支持路径为 `app`/`app:dmg` → `build-app.sh` → `fetch-node.sh`；旧 builder/下载器及入口已删除；资源清单与历史文档已同步标注 |
| CA-R09 | VERIFIED | Codex 主 Agent | `49d9e5aec` | `node scripts/check-package-scripts.mjs` PASS（140 scripts）；新增接线的 model/startup/bridge/chat/shell-entry/usage/MCP/UI/headless/runtime 定向测试通过；`node scripts/test-eval-prompts.mjs` 与 `node scripts/eval-prompts.mjs` PASS | 清单覆盖 173 个 `scripts/test-*.mjs` 与 8 个 `tests/*.test.mjs`；GitHub Actions 和 macOS app rebuild 未在本机运行 |
| CA-R12 | VERIFIED（代码预防）；数据不恢复 | Codex 主 Agent | `49d9e5aec` | `node scripts/test-host-lifecycle.mjs` PASS；修复后 `node scripts/test-model-service.mjs` PASS，迁移落在测试临时 `HOME` | `spawn-host` 注入 `home`；测试和诊断脚本显式隔离 `HOME`/`TASKWEAVER_HOME`。用户确认不恢复；实际被删文件名未记录 |
| CA-R10 | VERIFIED（缓存）；refresh 并发源码审查 | Codex 主 Agent | `50c1a6e5a` | 修复前内联 Node 复现：loader 返回 `undefined` 后缓存 `undefined`，第二次 get 未再调用 loader；4 个并发 cold get 调用 loader 4 次。修复后 `node scripts/test-provider-bridge-p12.mjs` PASS，覆盖 undefined/非字符串/空白 token、坏 expiry、过期 token；`node scripts/test-bridge-token-reuse.mjs` PASS；Node `--check` 与 `git diff --check` PASS | 实际 bridge 每次 loader 调用会启动 Bun helper；OpenCodex `bridge-access.ts#refreshAccount` 用 provider/account flight map，且 `createOAuthRefreshIntentLock` 跨进程串行、锁内重读有效 credential，源码路径不会重复 refresh。多个 cold helper 仍有启动开销；未运行真实 OAuth Provider 或跨进程集成实验 |
| CA-R11 | DEFERRED（分诊完成） | Codex 主 Agent；两位只读审查 Agent | `324d78353` | `node scripts/test-shell-entry.mjs` PASS；`node scripts/test-shell-http-guard.mjs` PASS；`node scripts/test-shell-ui-static-serving.mjs` PASS；`node scripts/test-shell-webcontents-lifecycle.mjs` PASS；`node scripts/check-desktop-hardening.mjs` PASS；定向 ESLint 与 `tsc --project tsconfig.app.json --noEmit` PASS；独立 `swiftc` ShellURLPolicy smoke PASS。Swift XCTest 未能运行：本机 Swift 工具链缺少 XCTest 模块 | 默认打包路径未发现远程可达利用链；未受信任的启动环境若指定攻击者控制的 loopback UI，该页面可在 bootstrap 前读取 fragment 并外传 token。打包 CORS 阻止任意端口页面直接调用 API，但不能阻止页面外传 token；未来可将 release 环境变量 override 限制到内置 UI，或改为原生安全通道传递 token |
| CA-R13 | VERIFIED | Codex 主 Agent；CA-R04 只读审查 Agent | `a6c391ecc` | `./node_modules/.bin/vitest run guard/repeat-tool-reminder/tests/repeat-tool-reminder.spec.ts --config vitest.config.ts` PASS（33/33；含 POSIX 反斜杠、scope 内 symlink、目录/文件 symlink scope 根、合法及越界 `target_directory`）；`tsc -b guard/repeat-tool-reminder` PASS；定向 ESLint、Host bundle、`node --check` 与 `git diff --check` PASS | pre-execute guard 使用同一个 `ctx.fs` provider 验证 workspace root、scope root 与实际请求/搜索根；Package Host 入口已同步。并发替换 symlink 的 TOCTOU 仍不由此 in-process 检查消除；Planner scope 覆盖继续由 CA-30 跟踪 |
| CA-R14 | VERIFIED（默认库存仍有界） | Codex 主 Agent；CA-30 Repo Map 审查 Agent | `3f9b5fac4` | `node scripts/test-repo-map-service.mjs` PASS；定向 ESLint 与 `git diff --check` PASS；实际仓库扫描 1000 项、含全部 228 个 backend 文件、13 个可见根级目录，55ms；`maxFiles:6000` 全图冷生成 6427ms / 1993 tokens | BFS 先覆盖浅层目录；库存上限 1000、遍历上限 50000，输出分别提示库存不全和 Token 预算截断；空库存但扫描截断也返回部分结果说明。mtime 恢复后的同大小编辑由 ctimeNs 触发内存/磁盘缓存刷新；磁盘 cache 文件仍按每工作区保存，未做总量清理 |
| CA-R15 | VERIFIED | Codex 主 Agent；CA-30 缓存审查 Agent | `3f9b5fac4` | `./node_modules/.bin/vitest run context/file-reference-local/tests/search.spec.ts --config vitest.config.ts` PASS（7/7；Fake clock 验证外部新增文件在 TTL 后出现）；`tsc -b context/file-reference-local` PASS；定向 ESLint、Host bundle、`node --check` 与 `git diff --check` PASS | 完成的全局模糊搜索索引在 5 秒后过期；目录前缀查询保持实时读取；工具结果仍会立即失效当前缓存 |
| CA-R16 | VERIFIED | Codex 主 Agent；只读包入口审查 Agent | `3f9b5fac4` | `tsdown --env.TASKWEAVER_BUILD_FACE host` PASS；`node --input-type=module` 以包名导入并检查公开导出 PASS；`pnpm pack --dry-run` 清单包含 `lib/grammar.js`；定向 ESLint 与 `git diff --check` PASS | 包级构建将 grammar 作为根级运行时入口产物生成，并保留 `./grammar` 子路径原导出；实际发布与消费者安装尚未执行 |
| CA-R17 | VERIFIED（本地改动待提交） | Codex 主 Agent；Python 符号修复 Agent | — | `node scripts/test-symbol-outline-extractor.mjs` PASS（嵌套函数、嵌套类、类方法归属、顶层嵌套定义、tab、`.mts/.cts`）；定向 ESLint 与 `git diff --check` PASS | 逐行正则仍不解析多行签名和完整 Python 语法；更复杂语法进入 CA-R18 支持矩阵 |
| CA-R18 | CONFIRMED（部分修复） | Codex 主 Agent；CA-30 符号审查 Agent | — | `.mts/.cts` 的统一入口测试 PASS；审查 `CODE_EXTENSIONS`、实际 dispatch 和 Repo Map 调用链 | `.vue/.svelte` 与 Swift/Java/C-family/Ruby/PHP/Lua/Shell/SQL/GraphQL/Proto 未做符号提取；TS 构造器/accessor、Rust/Go 类型成员与多行定义也不完整。先确定有用语言集合，再决定 parser，而非默默返回空列表 |
| CA-R19 | VERIFIED（本地改动待提交） | Codex 主 Agent；Planner 路径索引 Agent | — | `node scripts/test-planner-hints.mjs`、`node scripts/test-orchestration.mjs` PASS；针对性 ESLint、`git diff --check` PASS。覆盖忽略的 `vendor`、精确/超过扫描上限、待扫目录、深度上限、展示上限及真实 Planner prompt 提示 | 隐藏/忽略项仍消耗目录项预算；read-only 候选最多 90 条、scope 最多 12 条，较大仓库的长调用链仍需更多可发现性评估 |

**CA-00A 执行记录（2026-10-13）：**分支 `main`；冻结前 HEAD `f5624a108`；Node `v22.23.1`；pnpm `11.7.0`；已读取根 `AGENTS.md`。当时存在未提交的 `src/features/settings/SettingsPage.tsx` 与 `src/styles.css` 修改，已保留且未纳入 CA-R01 提交。CA-R01 修复提交 `94a47fbb0`，补充专项覆盖提交 `2d659932e`。

**CA-00A 基准隔离执行记录（2026-10-13）：**Codex managed detached worktree `ca00-baseline` 指向完整提交 `f5624a10880efd2841df4f0a45fb0b8eaed5beba`；`git status --short` 为空。worktree 不包含主工作树的 SettingsPage/CSS 修改。依赖和 `vendor/taskweaver-z-runtime` 属忽略/本机产物，基线 worktree 未复制它们。

**CA-R03 执行记录（2026-10-13）：**首次运行提示 IPC 现在只使用 `wireBackendIpc` 注入的应用 user data 路径，缺失配置在注册期失败；读取提示、dismiss 持久化与写入错误均增加 cwd 隔离覆盖。提交 `7c7bdaf74`；`node scripts/test-legacy-secrets.mjs` PASS。

**CA-R04 执行记录（2026-10-13）：**移除 Planner 样例与 hints 中的旧 `desktop/` 路径；JSON 示例动态引用当前索引项，`.taskweaver/planner-hints.json` 的请求链路覆盖当前 renderer hook、Shell HTTP bridge、IPC、聊天与编排路径。路径索引现在向下扫描四层、默认最多访问 2000 个目录项；模型生成的 research/review `scopePaths` 在有限重试前与实际展示索引做精确比对，索引外路径无法进入 DAG。提交 `01594efea`。`node scripts/test-orchestration.mjs`、`node scripts/test-planner-route.mjs`、`node scripts/test-planner-hints.mjs`、`node scripts/test-eval-prompts.mjs`、`node scripts/eval-prompts.mjs` 与定向 ESLint PASS；`pnpm run test:orchestration` 因 pnpm 在无 TTY 环境尝试依赖状态清理而未启动测试，直接 Node 入口已通过。静态路径核验显示 11 个请求链路 required paths 全部存在且进入索引。

**CA-R05 执行记录（2026-10-13）：**缓存 schema 版本升至 2；缓存身份包含 URL 与实际送入每代 Streamable HTTP transport 的规范化 headers 摘要，token/header 原文不落盘或日志。缓存工具只临时提供 schema；执行会等待实时 `tools/list` 完整同步，已捕获的 provisional 定义同步后失败关闭。缓存注册与 live sync 统一串行，旧代等待中的 tools/list 返回后会在提交前再次核验 generation。新增鉴权变化、刷新失败、并发原子写、慢连接及旧代通知同步重连覆盖。提交 `ccd479bd7`；MCP Client 全目录 116 项测试通过，定向 ESLint、TypeScript 项目构建、package-only Host bundle、bundle 语法检查与 diff 检查通过。

**CA-R06 执行记录（2026-10-13）：**先强制 `createTerminalService({ nodePty: null })` 走真实 Python PTY fallback，启动 shell 与后台 sleep 后调用 `killSession()`；修复前实测 `shellAliveAfterKillSession=true`、`childAliveAfterKillSession=true`。原因是旧实现向 Python wrapper 的进程组发信号，而 shim 中 shell 调用 `setsid()` 进入独立 session；Node 终止 wrapper 后没有执行 Python 的 shell 清理逻辑。现在 wrapper 捕获 SIGTERM 并统一清理 shell session 中所有 process groups；TERM 后等待 100ms 再 KILL，并 wait/reap shell。fork 周围屏蔽 SIGTERM、父进程设置纳入 finally，避免启动期间退出丢失 child PID；Node 侧 5 秒 SIGKILL 仅作为兜底。回归用忽略 SIGTERM 的后台 Python 进程验证 shell、后台进程与 wrapper 均退出。提交 `af4c84570`。`node scripts/test-terminal-service.mjs`、本地 ESLint、Node 语法检查、Python AST parse、`git diff --check` 全部 PASS。独立只读审查确认 Darwin `/bin/ps -axo pid=` 可运行、无明显 macOS 兼容 blocker；审查建议的启动窗口和兜底超时已在提交前处理。

**CA-R07 执行记录（2026-10-13）：**修复前 `contract/types/app-api.ts` 单独 TypeScript 编译会报两个不存在模块；默认 `tsconfig.app.json` 又只包含 `src/`，所以 `check:ipc` 尽管通过静态路由检查也漏掉了该文件。与 `src/shared/app-api.ts` 对照还发现 API 漂移：缺少 `block_delta` 与 error `code`，首次运行提示结果仍是旧结构，DSH turn metadata 缺失，且 `getToolOutput` 可选性不一致。将 `contract/types/app-api.ts`、`model-api.ts` 改为指向 renderer shared API 的薄 re-export；`tsconfig.app.json` 纳入 contract type entrypoints；`check:ipc` 增加 app TypeScript 检查。生成器运行后无未预期生成 diff。提交 `68a996a02`；schema、IPC 静态检查、生成文件检查、全 app/contract TypeScript、IPC 专项测试均 PASS。

**CA-R08 执行记录（2026-10-13）：**只保留根 `package.json` 的 `app`/`app:dmg` → `scripts/macos/build-app.sh` → `scripts/macos/fetch-node.sh` 路径；移除旧 `ensure-host-node.mjs`、`build-macos-shell-app.mjs`、`make-mac-app.sh` 和 `ensure:host-node` script。`packaging/mac-shell-resources.yml` 从已不存在的 `vendor/host-node` 改为真实 fetch/stage 目录 `apps/macos/build/node`，包布局测试校验映射与实际复制路径。同步当前构建说明，并给旧迁移/优化文档加历史标记；Windows runner 项明确为不支持范围。提交 `0d29da2ff`。`node scripts/test-macos-bundle-layout.mjs`、`node scripts/test-host-node-executable.mjs`、`node scripts/test-launchd-scheduler.mjs`、`node scripts/check-package-scripts.mjs`（134 scripts）、Node `--check` 与 `git diff --check` PASS。没有下载 Node、运行 Swift 构建或覆盖已安装 App。

**CA-R09/CA-20 执行记录（2026-10-13）：**先静态分类 174 个 `test-*.mjs`、根 package scripts、CI 与 README，随后修正入口/文档/prompt 路径并更新 [`taskweaver-test-inventory-2026-10.md`](./taskweaver-test-inventory-2026-10.md)，当前计数为 173 个根脚本测试与 8 个 `tests/*.test.mjs`。补入此前缺失的默认或专项接线，并从 `test:all`/CI 移除等价重复步骤。`node scripts/check-package-scripts.mjs`、prompt eval、model/startup/bridge/chat/shell-entry/usage/MCP/UI/headless 和 runtime 定向测试通过；GitHub Actions 与 macOS app rebuild 未运行。`backend/application-menu.cjs` 及其唯一孤立测试确认无调用入口后删除。没有调用模型或外部服务。

**CA-R12 数据事故记录（2026-10-13；恢复核查 2026-10-14）：**运行 `node scripts/test-model-service.mjs` 时，测试创建的 Host manager 设置了临时 `TASKWEAVER_HOME`，但旧代码仍用真实 `os.homedir()` 搜索迁移源；因此把 `/Users/zsn/.dsh` 复制到测试临时运行目录，校验后删除源目录，随后测试清理又删除临时目录。迁移器只输出源/目标路径，不生成逐文件清单。已将 `home` 从 Host manager 显式传入迁移和旧目录清理，并给自动化测试/手工诊断提供隔离 home；修复后 `node scripts/test-host-lifecycle.mjs`、`node scripts/test-model-service.mjs` 均 PASS。用户确认无需恢复，后续允许必要时从 Git 拉回代码文件；核查时 `/Users/zsn/.dsh` 不存在，仓库当前索引无该路径，Git 历史中搜到的 `.dsh` 仅是 `vendor/z-runtime`/`dsh-source` 下的三种测试快照技能文件（`model-only-skill`、`snapshot-skill`、`user-only-skill`），不能据此还原用户 home 数据。真实目录逐文件清单未留存，不对其内容作推测。

**CA-R10 OAuth token cache 分诊（2026-10-13）：**修复前用临时内联 Node 复现：loader 返回 `undefined` 时，cache 会把 `undefined` 缓存到 fallback TTL，下一次 get 直接命中且不再运行 loader；4 个并发 cold get 各自运行 loader。缓存现在只接受非空字符串 access token，拒绝已过期 token；expiry 仅接受有限正数，否则尝试 JWT exp，仍缺失时按 5 分钟短 TTL 处理。`node scripts/test-provider-bridge-p12.mjs` 与 `node scripts/test-bridge-token-reuse.mjs` PASS，覆盖失效结果不会污染后续缓存、异常 expiry fallback、过期 token 拒绝及 401 invalidation。并发 loader 确有重复 helper 启动；源码中 OpenCodex `bridge-access.ts` 对同 account 有进程内 promise map，`store.ts` 用 create-exclusive-file lock 跨进程串行 refresh，并在锁内重新读取有效 credential，因此没有发现重复 OAuth refresh 的代码路径。没有运行真实 Provider、网络 OAuth 或多进程集成实验；helper 启动开销保留为待优化观察项。

**CA-R11 Shell URL/token 分诊（2026-10-14）：**两位只读审查 Agent 与主 Agent 分别沿 Swift 启动、URL policy、Renderer bootstrap、HTTP/CORS 和 IPC 调用链核对。`TASKWEAVER_UI_URL` 只由 Swift 读取，仓库内未找到设置代码；`BackendLauncher` 向 backend 子进程传入受限环境，token 不进入 Host 环境。默认打包路径通过自身 loopback HTTP 服务提供随包 UI；Shell token 是随机 bearer，健康检查用 HMAC challenge，events/invoke 用 constant-time token 校验，而 invoke 可调所有已注册 IPC。fragment 不随普通 HTTP request 或 Referer 发送，但初始页面 JS 可读；打包 CORS 只允许 backend 自身 loopback origin，不允许任意端口页面直接 fetch。若非可信启动者设置 `TASKWEAVER_UI_URL` 并控制本机页面，该页面仍可在 bootstrap 前读取 fragment 并外传 token，因此记为有明确本机前提的 deferred 风险，不认定为远程利用。

提交 `324d78353` 修复 token 的可见持久化路径：bootstrap 读取 fragment 后移除 fragment/query 中的 token 并 `history.replaceState`，删除无生产写入者的 query/meta token fallback；`dev:browser` 改为打印无凭据 `/__taskweaver/dev-ui` 入口，由仅在显式开发模式开放的 no-store 302 将 token 交付到 Vite fragment。新增测试覆盖 token 清理、header 仍携带 token、开发跳转、打包默认拒绝 Vite Origin 及打包时禁止启用开发跳转。`node scripts/test-shell-entry.mjs`、`node scripts/test-shell-http-guard.mjs`、`node scripts/test-shell-ui-static-serving.mjs`、`node scripts/test-shell-webcontents-lifecycle.mjs`、`node scripts/check-desktop-hardening.mjs`、定向 ESLint 和 app TypeScript 检查均 PASS。独立 `swiftc` policy smoke PASS；`swift test --package-path apps/macos/TaskWeaverShell --filter ShellURLPolicyTests` 因本机 Swift 工具链无 XCTest 模块不可运行，且未做 macOS App rebuild。后续如需关闭残余风险，应限制 release 模式的任意 loopback override，或通过 WebKit 原生安全通道提供 token。

**CA-20 测试结果证据策略（2026-10-14，代码提交 `7d3aecdc5`）：**修正 Shell command evidence 在缺少 `[exit code: N]` 终止标记时默认推断退出码 0 的问题；仅自然语言输出 `tests passed` 现在会得到未知退出码，不能通过验收。工作区验证器增加 `passed / failed / not_run` 状态；DAG 将 Host 工具事件和后端最终验证结果按命令合并，同命令以后一次结果为准，汇总为 `passed / failed / partial / not_run / skipped / incomplete`，并在子任务面板显示实际命令、退出码和来源。`node scripts/test-tool-trace.mjs`、`node scripts/test-verification-policy.mjs`、`node scripts/test-dag-acceptance.mjs`、`node scripts/test-orchestration.mjs`、`node scripts/test-dag-run-replay.mjs`、`node_modules/.bin/tsc --project tsconfig.app.json --noEmit`、定向 ESLint 和 `git diff --check` 均 PASS。`pnpm run test:tool-trace`、`pnpm run test:verification`、`pnpm run test:orchestration` 均在 pnpm workspace 依赖状态检查阶段因无 TTY 而中止（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`），对应 Node 测试入口已直接运行通过。该记录形成时 GitHub Actions 与 CA-00 固定任务集 benchmark 未运行；macOS App 重建见下条记录。没有调用模型或外部服务。

**CA-20 本机 macOS 打包门禁（2026-10-14）：**根 `build:app`、`build:host`、`build:z-runtime`、`build:dsh-chat-registry` 与 `check:ipc` 均通过。首次隔离打包使用 `/tmp` staging path，被 `bundle-backend.mjs` 按 `os.tmpdir()` 边界拒绝；改用系统临时目录后，`scripts/macos/build-app.sh` 成功构建并签名验证隔离 `.app`（1.4 GB）和 DMG（692 MB）。Node v22.19.0 下载后通过官方 SHA256 校验；Swift Shell 与 Keychain helper Release 编译通过。`node scripts/test-macos-bundle-layout.mjs`、`node scripts/test-packaged-runtime-layout.mjs <temp-app>`、`node scripts/test-opencodex-packaging.mjs <temp-app>` 均 PASS。包入口审计还发现 CA-R02 修复已进入 `src`，但发布 `main` 指向的 `lib/index.js` 曾停留在旧实现；本轮同步发布产物并新增直接加载包入口的 CRLF 回归，apply-patch suite 7/7 PASS。原有 `dist/` 已恢复；没有启动 `.app`，也未运行 GitHub Actions 或 CA-00 benchmark。

**CA-20 本机全量回归（2026-10-14）：**`test:all` 首轮揭示三处过时基线：Task Profile 测试仍断言旧的进度话术；conversation single-writer 清单期望两次 upsert，而终端投影和错误路径现已共用一次；安装脚本保留了不再使用的 `releaseDir` 与递归 `findAppBundle()`。已将断言改为当前语义、同步调用清单并删除无引用代码。`7d3aecdc5` 有意加强了 DAG 最终汇总对 `verification.status` 的约束；更新 planner synthesis 快照并将 1476 字节的前一版保留为 legacy 后，提示词 1734 字节、低于 4096 字节目标且无新静态违规。`node scripts/test-eval-prompts.mjs`、`pnpm run lint` 与完整 `pnpm run test:all` 均 PASS。pnpm 输出本机 `enableGlobalVirtualStore` 配置与 lockfile 状态不同的提示，但完整命令退出码为 0。`src/features/settings/SettingsPage.tsx` 和 `src/styles.css` 的用户改动继续保持未暂存、未提交。

**CA-20 CI 专项补验（2026-10-14）：**`pnpm run test:parity-bench` PASS；Runtime Vitest 472 个测试文件中 472 PASS、6 个按配置跳过，8540 个用例 PASS、82 个跳过。UI fixture PASS，但 `pnpm run test:ui` 在启动浏览器前失败：Playwright 1.64 所需的 `chromium_headless_shell-1248` 未安装。本机有系统 Chrome，但 UI driver 调用的是 Playwright-managed Chromium；CI workflow 原先也没有安装浏览器的步骤。已在 UI job 增加 `playwright-core install --only-shell chromium`，`--dry-run` 已确认解析为 pinned headless shell v156.0.8078.4；没有下载浏览器或访问真实 Provider。UI 场景、GitHub Actions 与 Provider E2E 仍待对应运行环境和用户提供的模型/预算授权。

**CA-00B 执行记录（2026-10-13）：**增加 20 项固定任务集、评分结构与 Host 工具调用运行规程；数据集 SHA-256 `17f2c99fe1cdf0c6fbec0b8009a54ae1143b1077f1e9cbf17e8836bd21f0210f`。headless `on-risk` 与权限审计记录提交 `ff400e532`；任务集/评测规程提交 `0cc724af4`。`node scripts/test-headless-cli.mjs` PASS；JSON 字段、20 个唯一任务、权限模式和 100 分权重通过结构检查。没有调用模型或外部服务；Runtime 哈希、Provider/model 固定与真实运行仍未执行。基线目标仍为冻结提交 `f5624a108`。

**当前续接点（2026-10-15）：CA-30 符号覆盖与 Planner scope。**CA-10 已完成，CA-R11 的本机环境条件性风险记为 deferred；CA-20 测试清单、默认接线、去重、证据状态策略、本机 `.app`/DMG、`test:all`、parity fixture 与 Runtime Vitest 已完成。CI UI job 已补入 pinned Playwright headless shell 安装步骤，但本机未下载该浏览器，GitHub Actions 与 UI 场景仍待执行。CA-30 的 CA-R13–R16 已由提交 `a6c391ecc`、`3f9b5fac4` 修复：只读文件 scope、Repo Map 公平扫描/截断与缓存新鲜度、文件搜索 TTL、文件引用包入口。默认 Repo Map 保留 1000 文件上限以控制首轮延迟，并标明不完整；下一步审计 Python 符号归属、扫描扩展名与提取语言不匹配、Planner scope 候选完整性及无引用清理项，然后转 CA-40。CA-00 冻结的 20 项分数口径保持不变；按用户要求另加相同条件下的“实现塔罗牌应用”补充比较任务。用户授权由我选择 Provider/model；真实调用前先核对本机可用配置、速率/费用限制和评测脚本的最大请求边界，不改动用户凭据。CA-R10 修复提交 `50c1a6e5a`；未运行真实 Provider。CA-R12 隔离缺陷已修复；`/Users/zsn/.dsh` 文件清单未记录，Git 中只有独立测试快照。`src/features/settings/SettingsPage.tsx` 与 `src/styles.css` 的用户改动仍保留、未暂存、未提交。

**本轮续接补记（2026-10-15）：**CA-R17 Python outline 已用缩进作用域栈修复嵌套定义归属；CA-R18 已确认 Repo Map 扩展名与符号提取器不一致，并为 `.mts/.cts` 补上 TypeScript AST dispatch，但 Swift 与其余列举语言仍没有符号索引；CA-R19 已修正 Planner 精确扫描上限误报、`vendor` 死排序项和不具体的截断提示。定向测试、ESLint 与 diff 检查通过。塔罗应用任务已写入独立补充任务文件，`tasks.json` 原 20 项与哈希未改。CA-00 选择 `openai-codex/gpt-6-luna`，共享 280 个传输前额度槽；请求输出封顶 2048，按 272k 输入预留的费率表上界约 $9.81。首版守卫仅包裹 `fetch`，漏掉 Codex 默认 WebSocket。第二轮预检出现模型工具事件而额度槽仍为零，说明可能已有未计数 OAuth 请求；请求数无法从该运行恢复，已终止且不纳入评测分数。守卫已补充拒绝外部 WebSocket；后续评测配置必须将 Codex provider `transport` 固定为 `sse`，由全局 fetch 守卫限制具体 host/path、model、output tokens 和共享槽。还需在无网络 fixture 中验证 Host 子进程加载 WebSocket 拒绝器，再先运行一组受控配对并确认槽数与工具报告相符。此协议不能拦截任意子进程的原始 socket，报告必须检查 Host 轨迹中的网络/MCP 工具调用；OAuth 走 Codex 账户额度，费率表名义值不等于账单费用。`node scripts/diagnose/test-benchmark-fetch-guard.mjs`、直接 ESLint 与 `git diff --check` 通过；`pnpm exec eslint` 在依赖状态检查阶段因无 TTY 中止，直接运行本地 ESLint 二进制通过。
