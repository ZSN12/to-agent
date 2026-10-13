# PKG 安装版手测清单（计划 1.12 / 2.13）

构建：

```bash
pnpm run build:z-runtime   # 改 preset / runtime 后需要重建部署树
pnpm run app:builder
```

默认产物位于 `apps/macos/build/TaskWeaver.app`；也可以通过 `TASKWEAVER_APP_BUNDLE` 指定隔离输出路径。`app:builder` 会检查 Swift `.app` 布局、runtime、OpenCodex/Bun，以及本地 mock 对话和工作区文件读取。

将构建产物拷到独立路径（**不要**在 build / release 目录直接手测）后启动：

```bash
pnpm run pkg:prepare-smoke   # 复制到 ~/Desktop/TaskWeaver-smoke-<日期>.app
open ~/Desktop/TaskWeaver-smoke-*.app
```

逐项勾选：

- [x] 选工作区 → 信任工作区 → Skills/hooks 行为符合预期
- [x] 主对话：单 Agent 发消息、工具调用与审批
- [x] 多 Agent 任务与 DAG 侧栏
- [x] 终端抽屉
- [x] MCP / 模型设置页可打开无 CSP 报错
- [x] PR 面板外链在系统浏览器打开（应用内不跳转）
- [x] 日志面板（若已接入顶栏入口）
- [x] 退出再开：会话与模型配置仍可用

**历史手测记录**：2026-10-09，产物 `~/Desktop/TaskWeaver-smoke-2026-10-09.app`（维护者口头确认当时通过）。本轮未重建 `.app`，该记录不代表当前源码版本的安装包验收。

自动化已覆盖（不等同于本清单）：

- `pnpm run app:builder` 末尾：`test-opencodex-packaging`、`test-packaged-runtime-layout`、`test-packaged-app-launch`（隔离 user data，本地 mock provider 完成对话与文件读取）
- 单独跑：`pnpm run test:packaged-app-launch`
- 2026-10-09 的 `app:builder` 结果只适用于当时构建的 `.app`；当前源码版本待重建验证。

手测完成后在 `docs/optimization-plan-progress.md` 将 1.12 / 2.13 标为 ✅ 并注明日期。合并 PR 模板见 [`merge-pr-checklist.md`](merge-pr-checklist.md)。
