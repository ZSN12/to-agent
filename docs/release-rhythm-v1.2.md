# TaskWeaver v1.2 发布节奏

| 里程碑 | 内容 | 门禁 |
|--------|------|------|
| **v1.2.0-rc** | A 阶段：32KiB、共用 prompt、多 Agent 门控 | `npm run test:roadmap-gate` |
| **v1.2.0** | B/C：压缩建议、DSH transcript 优先、shadow 对比工具 | + 本机 `npm run test:z-host-deploy`（tag 已发，**不含** ahead 2） |
| **v1.2.1** | A 闭合：push、gate、compact/fork 手工 E2E、安装 smoke | 见 `taskweaver-execution-plan-2026-10.md` §12 |
| **v1.2.x** | D：定时任务、无头 `taskweaver-headless.mjs`（协议见 [taskweaver-headless.md](taskweaver-headless.md)） | `test:scheduled-jobs`（store）+ `test:headless-doc` |
| **v1.3** | E：Hook 文档 + 示例；探索/插件页内容 | 按需扩展 E2E |

## 发版前清单

一键打印下列步骤并跑 roadmap-gate：`npm run release:prepare`（`VERSION=1.2.1` 或 `npm run release:prepare -- 1.2.1` 可改版本号）。

1. `npm run build:z-runtime` 后重装或 `npm run install:app`
2. `node scripts/roadmap-gate.mjs`
3. `npm run test:z-host-deploy`（非 Cursor 沙箱）
4. 更新 `docs/修改与优化日志.md` 与 tag `v1.2.0`

## 分支建议

- `codex/taskweaver-v1.2.0`：功能合并
- tag 后 `main` 仅 cherry-pick 热修
