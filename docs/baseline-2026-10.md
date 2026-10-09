# 测试基线（2026-10-09）

依据《毕设优化计划》阶段 1.0，记录优化前已知状态（`main` @ `7c9a634f` 之后的安全加固批次）。

## 命令

| 简称 | 命令 |
|------|------|
| TC | `npx tsc -b` |
| ALL | `npm run test:all` |

## 已知失败 / 缺口（优化前）

- `test:conversation-single-writer`：与 `register-ipc.mjs` 多写入点清单不一致时需更新测试期望。
- `test:stream-segments`：已从 `package.json` 移除（阶段 3.6）。
- 全量进度见 `docs/optimization-plan-progress.md`。

## 阶段 1 目标

不新增 `test:all` 失败项；新增 `npm run test:security-hardening` 静态检查通过。
