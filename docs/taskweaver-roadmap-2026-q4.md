# TaskWeaver 路线图（2026 Q4 → 2027 Q1）

执行版索引；当前版本焦点：**v1.2.0 发版一致性 + 上下文成本 + 编排产品化**。

**可执行计划：**[`taskweaver-execution-plan-2026-10.md`](taskweaver-execution-plan-2026-10.md)（**2026-10-07 修订版**：Done/缺口、v1.2.1→v1.4、本周 Issue 清单）。

**发布注意：**GitHub Release `v1.2.0` 不含本地 **ahead 2**（`f7218cf6`、`17d53cea`）；下一里程碑建议 **v1.2.1**（见执行计划 §2、§12）。

## 阶段与状态

| 阶段 | 目标 | 状态（2026-10-07） |
|------|------|-------------------|
| **A** 发版止血 | 双路径共用 pipeline、32KiB、测试门禁 | **代码完成** — Release `v1.2.0` 已发；本机 `test:z-host-deploy` + 安装包 smoke 待闭合 |
| **B** 上下文与成本 | 折叠、compact 产品化、按 step 用量 | **基本完成** — 压缩建议条、用量 chip 耗时字段 |
| **C** 会话单源 + fork | DSH projection 为准 | **基本完成** — `preferDshTranscript`、shadow 对比 IPC、`fork` 测试 |
| **D** Agent 对齐 | Plan/Job/headless | **MVP+** — 定时任务 + **macOS LaunchAgent**、`run-scheduled-job-cli` |
| **E** 生态与发布节奏 | Hook、E2E、版本节奏 | **MVP+** — **探索页**、Hook、`npm run release:prepare` |

## 门禁

```bash
npm run test:roadmap-gate    # 核心自动化
npm run test:z-host-deploy   # 本机终端（沙箱外）
```

`npm run test:all` 已纳入 roadmap-gate 中的 v1.2 增量项（hooks、scheduled-jobs、transcript-policy、github-pull-requests、launchd-scheduler、fork-thread-smoke）；全量仍不含 `tsc -b` 与 `test:z-host-deploy`（后者需本机终端）。

## 关键模块

| 模块 | 职责 |
|------|------|
| `assemble-and-compose-user-prompt.mjs` | 工作区 + repo-map + intent/skill/cursor + pipeline 预算 |
| `transcript-display-policy` | C 阶段：何时以 DSH transcript 渲染聊天 |
| `orchestration-gate.mjs` | 多 Agent 灰区规则门控 |
| `scheduled-jobs-*` | D 阶段：应用内定时任务 |
| `taskweaver-hook-runner.mjs` | E 阶段：before/after turn Shell Hook |
| `dsh-snapshot-serialize.mjs` | DSH 工具行投影 |

## 明确不做（v1.2）

- Tab 补全、全仓 embedding、无上限 `@dir:.` 预载。
- 系统 cron / 应用关闭后仍执行的调度（v1.3 再议）。
