# TaskWeaver 路线图（2026 Q4 → 2027 Q1）

执行版索引；当前版本焦点：**v1.2.0 发版一致性 + 上下文成本 + 编排产品化**。

**可执行计划：**[`taskweaver-execution-plan-2026-10.md`](taskweaver-execution-plan-2026-10.md)（**2026-10-07 修订版**：Done/缺口、v1.2.1→v1.4、本周 Issue 清单）。

**基线（2026-10-07）：**当前 `main` / `80b3e040` 与 `origin/main` 一致，`v1.2.1` tag 已存在。BCDE 本轮工作区改动未提交；详细状态和验证边界见执行计划 §15。

## 阶段与状态

| 阶段 | 目标 | 状态（2026-10-07） |
|------|------|-------------------|
| **A** 发版止血 | 双路径共用 pipeline、32KiB、测试门禁 | **v1.2.1 tag 已有**；本轮未重跑发布门禁或安装包验收 |
| **B** 上下文与成本 | 折叠、compact 产品化、按 step 用量 | **代码增强已落工作区**；工具输出出口、安装版 Compact 和 tool-cache 性能验收未闭 |
| **C** 会话单源 + fork | DSH projection 为准 | **Fork 映射已补强**；单源迁移暂缓，重连/多窗口与 Host E2E 未验收 |
| **D** Agent 对齐 | Plan/Job/headless | **子任务取消和 fixture CI smoke 已补**；按会话 MCP 裁剪等待 Host API，CI 未远端验证 |
| **E** 生态与发布节奏 | Hook、E2E、版本节奏 | **Hook 边界与 IPC 拆分已补**；安装版清单待实际执行 |

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
