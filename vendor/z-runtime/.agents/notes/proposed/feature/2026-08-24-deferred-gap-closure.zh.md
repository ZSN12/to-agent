# Agent Note: 延后的 DSH-vs-Codex 差距补齐设计

Status: proposed

[English](2026-08-24-deferred-gap-closure.md) | 中文

## 问题

DSH-vs-Codex 差距评审在 `research/design/` 下产生了五份设计文档。其中两份已作为已实现功能随本变更落地：`03-hooks-codex`（全部 P0 与 P2 钩子点）与 `02-auto-review`（新的 `@z/dsh-auto-review` 审批请求应答者）。其余三份设计——compaction-seam 的 PreCompact/PostCompact 扩展、SOCKS5 网络访问控制能力、持久化记忆包——每份都是跨包、影响面大的改造。在本变更内把其中任一项做到仓库的实现与验证纪律是不可行的，而交付残缺或未验证的版本会悄悄削弱 invariant 与覆盖门本来要保护的保证。

## 提案

把 `research/design/` 下三份跨包设计如实记录为延后的后续项。两份同级设计已作为已实现功能随本变更落地：`03-hooks-codex`（全部 P0 与 P2 钩子点：Stop 循环保护、`permission_mode`、`PermissionRequest` 应答者、`SubagentStart`/`SubagentStop`）与 `02-auto-review`（新的 `@z/dsh-auto-review` 审批请求应答者）。其余三项每项都是影响面大的改造，无法在可行轮次内按 repo 纪律——每文件 100% 覆盖、REAL-composition 测试、配套运行时不变量、双语 README、doc-sync——完成。它们在此如实记录而不是谎称已完成，且每项都以各自的设计文档为权威规格。

### PreCompact / PostCompact 钩子（compaction-seam 扩展）

Codex 的 `PreCompact`/`PostCompact` 钩子点映射到 `dsh-compaction` seam。`PreCompact` 必须在一次压缩开始之前运行，并能通过 `continue: false` 否决；`PostCompact` 必须在压缩完成后运行，并向后续请求注入 `additionalContext`。当前 compaction Service Definition 会追加 `compaction/start`/`compaction/end` 会话事件，但没有暴露可以否决或注入的前/后 interception 点。完成它需要给 `dsh-compaction` seam 增加两个扩展点（一个可在压缩前取消的 before-compact waterfall，以及一个可在压缩后提供后续上下文的 after-compact 通知），并在 `hooks-codex` 中把它们桥接为 `PreCompact`/`PostCompact` 钩子事件。这会触及每个部署都依赖的核心会话行为包。

### 01-network-access-control（SOCKS5 代理能力）

`01-network-access-control.md` 提出一项可选的网络出口能力：一个 SOCKS5 代理 consumer，把工具的出站连接经可配置代理路由，使部署能强制出口策略。这是一个位于 web/网络工具之上的新能力 seam（Service Definition + provider + consumer），外加策略与 REAL-composition 覆盖。范围与 `auto-review` 相当，但需要一个新的网络传输边界。

### 04-memory（持久化记忆包）

`04-memory.md` 提出一项持久化 agent 记忆能力（跨会话事实、召回与存储策略）。这是一个新的产品级包，带有自己的 Service Definition、provider 与 consumers，还需要满足持久化与投影要求，需要 REAL-composition 测试与配套运行时不变量。其影响面与会话持久化以及 workspace/持久化存储 seam 重叠。

## 考虑过的备选方案

**现在交付延后项之一的部分版本。** 残缺的 compaction-seam 扩展或网络能力要么不可用，要么会悄悄削弱 invariant 与覆盖门本来要保护的保证，因此被拒绝。让每项设计完整保留，才能为日后遵循纪律的实现保留连贯的规格。

**把延后项从记录中删除。** 删除会隐藏已知工作。proposed 笔记与目标目标都显式携带这些项，以便后续项保持可执行。

## 验收标准

- 每项延后项都指明其权威设计文档（`research/design/01-network-access-control.md`、`research/design/04-memory.md` 以及 `research/design/03-hooks-codex.md` 的 PreCompact/PostCompact 小节）。
- 没有一项延后项被报告为实现；本笔记说明每项均未开工及原因。
- 本笔记通过 Agent Note 格式门与双语翻译配对门。
- 任一项被着手时，都会按本笔记列出的完整 repo 纪律交付，并随之更新或归档本笔记。

## 风险

- **范围蔓延** —— 延后项可能被误读为"已决定不做"。本笔记的提案小节将每项标明为待办并给出规格，而非拒绝。
- **静默完成** —— 某个 agent 可能在未完成完整验证的情况下把延后项标记为完成。验收标准要求先达到完整 repo 纪律，才把本笔记更新为已交付。
- **漂移** —— 设计文档可能过时。本笔记以它们为当前权威，因此后续着手时从最新规格出发。
