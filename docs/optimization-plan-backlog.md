# 毕设优化计划 — Backlog（已闭合）

主目标与 backlog 于 **2026-10-09** 闭合，见 [`optimization-plan-progress.md`](optimization-plan-progress.md)。

## 本轮追加闭合

| 项 | 状态 |
|----|------|
| **3.2** gen-preload | ✅ `electron/ipc/preload-spec.cjs` + `scripts/gen-preload.mjs` |
| **3.5** 通道类型 | ✅ `scripts/gen-ipc-types.mjs` → `src/shared/ipc-invoke-channels.ts` |
| **3.6** test 分层 | ✅ `test:unit-extra`、`test:live`（CI 跑 `test:all` + `test:live`） |
| **3.3** channels 对齐 | ✅ `check-ipc-contract` 四向校验 |
| **5.3/5.5 续** | ✅ steer/followUp、`tasks:sendMessage` → `chat-turn-pipeline` |
| **4.12** 根目录 | ✅ 仅保留 README / 毕设设计文档；过程文档在 `docs/archive/` |

## 合并

按 [`merge-pr-checklist.md`](merge-pr-checklist.md) 开 PR；`git diff --stat main` 写入描述。

## 明确 defer（v1.4+ 架构线，非阻塞发版）

见 [`archive/optimization-plan-phase5-remaining.md`](archive/optimization-plan-phase5-remaining.md)：

- **5.4** 去掉 `cached*`
- **5.6** thread-store 串行写
- **5.8–5.14** 大文件拆分、CSS、checkJs、统一 logger 等

上述项单独立项、每步 `test:all` + `test:live` 绿后再合并。
