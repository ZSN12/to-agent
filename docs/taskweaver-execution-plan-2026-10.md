# TaskWeaver 详细执行计划（2026-10-07 版）

> **索引：**路线图摘要见 [`taskweaver-roadmap-2026-q4.md`](taskweaver-roadmap-2026-q4.md)；发版节奏见 [`release-rhythm-v1.2.md`](release-rhythm-v1.2.md)。

基于仓库现状：**分支 `codex/taskweaver-v1.2.0`**、**HEAD `b8e3b08f`（及后续热修）**、**GitHub Release [`v1.2.0`](https://github.com/ZSN12/to-agent/releases/tag/v1.2.0)**、`npm run test:roadmap-gate` 已定义、`assemble-and-compose-user-prompt.mjs` 已跟踪。

本计划把 **路线图文档里的「状态」** 与 **仍需人工闭合的验收** 分开写，避免「代码在库 = 已交付」的错觉。

---

## 0. 目标与原则

### 0.1 产品目标（12 周内）

| 维度 | 目标 |
|------|------|
| **可用性** | 读仓 → 改码 → 轻量验证 → Git 检查点，主路径不丢消息、不错模型 |
| **成本** | 同等任务 **注入层可控**（默认 32KiB + meter）；长会话靠 compact + 折叠，不靠盲目加大预载 |
| **对标** | Agent 层对齐 **Claude Code / Cursor Agent / Codex CLI** 的「闭环」，不做 Tab |
| **差异化** | 成本路由、DAG/多 Agent、worktree、检查点、桌面 mux |

### 0.2 工程原则

1. **单源真相**：消息以 **DSH session / projection** 为准；本地 JSON 只做元数据。
2. **一条组装链**：所有「用户可见发送」走 **`assembleAndComposeUserPrompt`**（主聊天、tasks、headless）。
3. **门禁先行**：`roadmap-gate` 绿 + 本机 `test:z-host-deploy` 再打安装包。
4. **默认保守**：`autoVerifyAfterMutation` 默认关；intent 默认非 `CODE_MUTATION`；无 `@` 不全仓扫。

### 0.3 成功指标（建议每两周记录）

| KPI | 目标 |
|-----|------|
| `roadmap-gate` | 每次合 main / 打 tag 前 100% 绿 |
| 单轮 `injectedBytes / userBytes` P90 | < 3（meter utilization < 0.75） |
| 长会话（>15 轮）单步 input | compaction 后台阶式下降，非单调爆炸 |
| Fork smoke | `fork-thread-smoke.test.mjs` 稳定绿 |
| P0 报障（发不出、幽灵消息、错模型） | 发版后两周内可追踪、可回滚 |

---

## 1. 当前基线快照

### 1.1 已入库能力（按模块）

| 模块 | 文件/能力 | 阶段 |
|------|-----------|------|
| Prompt 管道 | `prompt-pipeline.mjs`、`assemble-and-compose-user-prompt.mjs` | A ✅ |
| 上下文 | `context-assembler`、`context-compactor`、`repo-map-service` | A/B ✅ |
| 双路径 | `tasks:sendMessage` → 共用组装 + `chat:promptBudget` | A ✅ |
| Transcript | `transcript-display-policy`、`preferDshTranscript` | C 🟡 |
| Compaction 产品 | `context-compaction-policy`、`CompactSuggestBanner`、`compaction-reply` | B 🟡 |
| 多 Agent | `orchestration-gate`、orchestration 测试 | D 🟡 |
| 定时任务 | `scheduled-jobs-*`、`launchd-scheduler`、`run-scheduled-job-cli` | D 🟡 |
| Hook | `taskweaver-hook-runner.mjs` | E 🟡 |
| Headless | `scripts/taskweaver-headless.mjs` | D/E 🟡 |
| PR | `github-pull-requests` + UI | D 🟡 |
| Tool-cache | `vendor/.../tool-cache` + `test:tool-cache` | B/D 🟡 |
| Plan UI | plan review + 工具进度 | D 🟡 |
| 门禁 | `scripts/roadmap-gate.mjs` | A ✅ |
| 发版脚本 | `scripts/release-prepare.mjs`、`npm run release:prepare` | E 🟡 |

### 1.2 文档 vs 现实（必须闭合的差距）

| 文档声称 | 仍需验收 |
|----------|----------|
| A 完成 | 本机 `test:z-host-deploy`、安装包 asar 与 tag 行为一致 |
| B 基本完成 | Compact 建议 → Host `/compact` 端到端；`VERIFICATION-CHECKLIST.md` 功能项 |
| C 基本完成 | 双源停写、fork **UI + atSeq**、多会话审计文档更新 |
| D/E MVP+ | headless 协议文档、Hook 默认 preset、定时任务生命周期与权限 |
| **v1.2.0 已发布** | 对外试用 ≠ 验收闭合；按本计划 A/B 手工项继续 |

### 1.3 已知技术债（优先级）

| 优先级 | 项 | 状态 |
|--------|-----|------|
| P0 | Composer + code preset 迁移：`alignLegacyComposerPreset`（非删 session） | **已实现，待合入** |
| P0 | `test:all` 与 `roadmap-gate` v1.2 项对齐 | **已对齐（2026-10-07）** |
| P1 | `register-ipc.mjs` 体积大，IPC 与自愈循环耦合 | 待 E-03 |
| P1 | 16KiB vs 32KiB 文档不一致 | 以 **32KiB 默认** 为准，设置页保留 16 省钱档 |
| P2 | OpenCodex 缓存命中低 | 产品说明 + 省钱预设 |

---

## 2. 版本与发布节奏

```
v1.2.0（GitHub Release） → v1.2.1（验收闭合 + tool-cache 可选默认）
  → v1.3.0（单源写 + fork 产品化）
  → v1.4.0（headless CI + Job 子任务 MVP）
  → v2.0.0（仅 Host/API breaking 时）
```

| 版本 | 范围 | 禁止夹带 |
|------|------|----------|
| **v1.2.0 / v1.2.1** | A+B+C 验收闭合、`test:all` 对齐 gate、tool-cache 可选 preset | 全仓 embedding、非 macOS 系统 cron |
| **v1.3.0** | C 单源写路径、fork UI、jsonl 迁移 | 大规模 Hook 生态 |
| **v1.4.0** | headless 稳定、DAG Job UI、按会话 MCP 裁剪 | Tab 补全 |

发版命令：`npm run release:prepare`（或 `VERSION=1.2.1 npm run release:prepare`）。

---

## 3. 阶段 A — 发版止血（代码完成，验收未全闭）

| ID | 任务 | 验收标准 |
|----|------|----------|
| A-01 | 合入 Composer preset 对齐 | `test-dsh-chat-service` 绿 |
| A-02 | `npm run test:roadmap-gate` | 0 failed |
| A-03 | 本机 `npm run test:z-host-deploy` | 沙箱外通过 |
| A-04 | `npx tsc -b` | 无错误 |
| A-05 | `release:prepare` + `install:app` | 启动 Host、发一条消息 |
| A-06 | `tasks:sendMessage` 审查 | 共用组装 + `emitPromptBudget` |
| A-07 | 优化日志 | 32KiB 默认、双路径模块名 |

**时间盒：** 第 1 天 A-01/02/04；第 2–3 天 A-03/05/07 → **v1.2.0 可对外试用（已发布，继续闭合）**。

---

## 4. 阶段 B — 上下文、Token 与性能

（B-01～B-15 同原表：注入预设、repo-map、工具折叠、compact 闭环、meter、tool-cache checklist。）

**时间盒：** 约 2–3 周；**v1.2.1** 候选 = B-07 + B-13～B-15。

---

## 5. 阶段 C — 会话单源 + Fork

（C-01～C-10：单源读/写、fork UI、多会话审计。）

**里程碑 v1.3.0** = C-01～C-09 + gate 绿；预估 3–5 周。

---

## 6. 阶段 D — Agent 对齐

（D-01～D-16：Plan、Job、headless、MCP 裁剪、定时任务、PR。）

**里程碑 v1.4.0** ≈ D-03、D-08、D-09 必达。

---

## 7. 阶段 E — 生态、工程化

| ID | 任务 | 状态 |
|----|------|------|
| E-01 | Hook 文档 + 示例 | MVP |
| E-02 | `test:all` 与 gate 对齐 | ✅ |
| E-03 | 拆分 `register-ipc` | 待办 |
| E-04 | 安装版 E2E | 待办 |
| E-05 | `release:prepare` 参数化 | ✅ |

---

## 8. 测试与 CI 矩阵

**每次 PR：** `npm run test:roadmap-gate` + `npx tsc -b`

**发版前（本机）：** `build:z-runtime` → `test:z-host-deploy` → `npm run test:all` → `npm run release:prepare` → `install:app`

---

## 9. Token / 成本（用户 + 工程）

用户：新线程、>10 轮 compact、16KiB 实验、避免大 `@dir`。

工程：B-06 折叠 → B-07 compact → B-11 高 utilization 提示 → B-13 tool-cache 数据回 checklist。

---

## 10. 风险登记册

OpenCodex 缓存≈0、路线图标「基本完成」未 E2E、`register-ipc` 膨胀、vendor 漂移、LaunchAgent 安全、tool-cache 内存 — 缓解措施见原表。

---

## 11. 12 周甘特（建议）

| 周 | 焦点 | 版本 |
|----|------|------|
| 1 | 阶段 A 闭合 + dsh-chat 热修 | v1.2.0 试用（已发布） |
| 2–3 | 阶段 B | v1.2.1 |
| 4–8 | 阶段 C + D 开头 | v1.3.0 |
| 9–12 | D headless + E | v1.4.0 |

**1 人 4 周最小包：** A 全量 + B-06/07/10/11 + C-06 + E-02（E-02 已完成）。

---

## 12. 本周最小可执行包

- [x] `test:all` 追加 hooks / scheduled-jobs / transcript-policy / PR / launchd / fork smoke
- [x] `release:prepare` 参数化
- [x] 本执行计划落盘
- [ ] 合入：`dsh-chat-service.mjs`、`test-dsh-chat-service.mjs`（Composer preset 对齐）
- [ ] `npm run test:roadmap-gate` + `npx tsc -b`
- [ ] `npm run test:z-host-deploy`（本机）
- [ ] 手工：CompactSuggestBanner → compact 一条链路
- [ ] 手工：tasks 发消息，DevTools 看 `chat:promptBudget`
- [ ] 优化日志：32KiB 默认、共用组装模块

---

## 13. 竞品差距对照

| 能力 | 阶段 | 版本 |
|------|------|------|
| 有界注入 + 观测 | A/B | v1.2.0–1.2.1 |
| 强 compaction 产品化 | B | v1.2.1 |
| 单源会话 / Fork atSeq | C | v1.3.0 |
| Headless CI / Job UI | D | v1.4.0 |
| Tab / 全仓 embedding | **不做** | — |

---

*维护：每完成一个带 ID 的任务，在 §12 勾选或在 `修改与优化日志.md` 追加 OPT 记录。*
