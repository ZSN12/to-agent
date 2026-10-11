---
name: multi-agent-orchestration
description: Use TaskWeaver's DAG workflow to split a genuinely cross-cutting coding task into independent, model-routed subtasks.
---

# TaskWeaver 多 Agent 编排

仅在用户主动选择本 Skill 时启用多 Agent。先理解用户目标，再把确实可以独立执行的工作拆成 2–6 个子任务；不要为了展示 DAG 或凑数量拆分。任务之间存在共享文件写入风险时，声明依赖并由调度器顺序执行。

规划阶段只输出符合 TaskWeaver 任务计划 schema 的 JSON，不执行代码、不调用工具。每项任务都要给出明确目标、范围、验收条件、任务类型和必要依赖。研究、实现、测试、审查任务按真实需要创建；实现与验证尽量形成有依赖的闭环。

每个子 Agent 只负责被分配的目标，并应查看当前工作区中的真实代码和约定。完成后报告改动文件、实际运行的验证及未解决问题；禁止声称未运行的测试已通过。最终主控汇总任务状态、模型分配理由、验证和阻塞项，不重复执行子任务。
