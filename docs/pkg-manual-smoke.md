# PKG 安装版手测清单（计划 1.12 / 2.13）

构建：

```bash
npm run build:z-runtime   # 会将 dsh-chat-registry 打入 taskweaver-z-runtime/electron-vendor
npm run app:builder
```

打包后 `test-packaged-runtime-layout` 会校验 `electron-vendor/dsh-chat-registry.mjs`（对话投影 registry）。

将 `release/mac-arm64/TaskWeaver.app` 拷到独立路径（**不要**在 `release/` 里直接测）后启动：

```bash
npm run pkg:prepare-smoke   # 复制到 ~/Desktop/TaskWeaver-smoke-<日期>.app
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

**手测记录**：2026-10-09，产物 `~/Desktop/TaskWeaver-smoke-2026-10-09.app`（维护者口头确认全部通过）。

自动化已覆盖（不等同于本清单）：

- `npm run app:builder` 末尾：`test-opencodex-packaging`、`test-packaged-runtime-layout`、`test-packaged-app-launch`（隔离 `user-data-dir` 冷启动 ≥4s 不崩溃）
- 单独跑：`npm run test:packaged-app-launch`
- 2026-10-09 本地：`app:builder` 全绿（`test:all` 同日前亦全绿）

手测完成后在 `docs/optimization-plan-progress.md` 将 1.12 / 2.13 标为 ✅ 并注明日期。合并 PR 模板见 [`merge-pr-checklist.md`](merge-pr-checklist.md)。
