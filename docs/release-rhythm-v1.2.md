# TaskWeaver v1.2 发布节奏

| 里程碑 | 内容 | 门禁 |
|--------|------|------|
| **v1.2.0-rc** | A 阶段：32KiB、共用 prompt、多 Agent 门控 | `npm run test:roadmap-gate` |
| **v1.2.0** | B/C：压缩建议、DSH transcript 优先、shadow 对比工具 | + 本机 `npm run test:z-host-deploy` |
| **v1.2.x** | D：定时任务、无头 `taskweaver-headless.mjs` | `test:scheduled-jobs`（store） |
| **v1.3** | E：Hook 文档 + 示例；探索/插件页内容 | 按需扩展 E2E |

## 发版前清单

1. `npm run build:z-runtime` 后重装或 `npm run install:app`
2. `node scripts/roadmap-gate.mjs`
3. `npm run test:z-host-deploy`（非 Cursor 沙箱）
4. 更新 `docs/修改与优化日志.md` 与 tag `v1.2.0`

## 分支建议

- `codex/taskweaver-v1.2.0`：功能合并
- tag 后 `main` 仅 cherry-pick 热修
