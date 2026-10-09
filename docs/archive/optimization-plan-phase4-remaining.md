# 阶段 4 剩余项

对照 `毕设优化计划.md` 阶段 4，自动化已覆盖部分见 `docs/optimization-plan-progress.md`。

## 4.10 无人调用的 preload API

已删除 11 条 invoke 通道及对应 preload / handler / 类型（`npm run check:ipc`）。后端 `env-service`、`createGitCheckpoint` 仍供 turn / worktree / 脚本使用。

## 4.11 脚本归档

✅ 已删 4 个一次性脚本；诊断与 `run-agent-*-smoke` 均在 `scripts/diagnose/`（见 README）；`package.json` / `taskweaver-headless` 路径已更新。

## 4.12 仓库卫生（续）

- ✅ 根目录计划类 md、agent/acceptance 过程记录迁入 `docs/archive/`；`tsconfig` 已无无效 exclude；根 `pnpm-*` 等此前已删
- ✅ `electron-builder.yml` 打包时排除 `vendor/opencodex/assets/**`
- ✅ `npm run app:builder`（2026-10-09，含 layout/opencodex 测试）
- ⏳ 可选：`npm ci` 洁净机复验；UI 手测见 `docs/pkg-manual-smoke.md`

## 4.14 收尾

- ✅ `npm run test:all`、`npm run app:builder`（2026-10-09）
- ⏳ PKG UI 手测 + 合并时 `git diff --stat main...HEAD`（见 `docs/merge-pr-checklist.md`）
