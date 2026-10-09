# 合并 PR 核对（计划 4.14 / 阶段 5 最小路径）

## 自动化（CI 同款）

```bash
npm run check:ipc
npm run typecheck
npm run lint
npm run test:security-hardening
npm run test:all
```

## 打包（计划 `PKG` 的自动化部分）

```bash
npm run build:z-runtime   # 改 preset / z-runtime 后必跑
npm run app:builder       # 含 test-opencodex-packaging + test-packaged-runtime-layout
```

产物：`release/mac-arm64/TaskWeaver.app`（`app:builder` 含冷启动 `test-packaged-app-launch`）

当前工作树相对 `main` 规模（合并时重跑）：约 `130 files, +2644 / −16775`（`git diff --stat main`）

## 人工（计划 1.12 / 2.13）

✅ 2026-10-09 已完成（见 `pkg-manual-smoke.md` 记录）。

## PR 描述建议

**Summary（示例）**

- 阶段 1–2 安全与功能接线；阶段 3 IPC 表 + `check:ipc` + GitHub Actions
- 阶段 4 死代码 / 未用 IPC / 脚本与文档归档
- 阶段 5 最小路径：`bootstrap`、IPC 拆分、`chat-turn-pipeline`、`App.tsx` 壳层拆分

**Test plan**

- [ ] CI 绿（或贴本地 `test:all` 通过）
- [ ] `app:builder` 绿（可选贴 layout/opencodex 测试输出）
- [x] PKG 手测清单（`pkg-manual-smoke.md`，2026-10-09）

**规模统计**

```bash
git diff --stat main...HEAD
# 含未提交改动时：
git diff --stat main
```

**Backlog**

- 阶段 5 其余项：[`archive/optimization-plan-phase5-remaining.md`](archive/optimization-plan-phase5-remaining.md)
- 阶段 4 尾项：[`archive/optimization-plan-phase4-remaining.md`](archive/optimization-plan-phase4-remaining.md)
