# 诊断与离线/真实 Agent 实验脚本

本目录存放**不进入**日常 `npm run dev` 的手动诊断、Host 对拍与性能探针。在仓库根目录执行。

## TaskWeaver / DSH 会话（`tw-*`）

| 脚本 | 用途 |
|------|------|
| `tw-*.mjs` | 会话时间线、工具耗时、推理档位、隔离审计等（见 `docs/性能差异诊断-DSH对比.md`） |
| `dsh-host.mjs` | Z Host 启动与 runtime 路径诊断 |
| `namespace-timing.mjs` | 命名空间注册时机 |
| `verify-dsh-backend.mjs` | DSH 后端迁移静态检查 |
| `run-conversation-shadow-compare.mjs` | UI transcript 与 Host 投影对拍 |
| `bridge-smoke.mjs` | Bridge transport mock 单轮 |
| `verify-tool-cache.sh` | tool-cache 基准辅助 |

## Agent smoke（真实/隔离 Host，可能产生模型费用）

| 脚本 | 用途 |
|------|------|
| `run-agent-read-smoke.mjs` | 单轮只读；`taskweaver-headless.mjs` 包装 `--local` |
| `run-agent-lifecycle-smoke.mjs` | 多轮生命周期（问候/读文件/并行/排队） |
| `run-agent-history-smoke.mjs` | 历史 fork / compact |
| `run-agent-dag-live-smoke.mjs` | DAG 固定计划 + 工具纪律；`npm run test:dag-live-evidence` |
| `run-agent-path-pair-smoke.mjs` | chat.send 服务层 vs 原生 Host API 配对 |

一次性迁移脚本（`rename-z-packages`、`bootstrap-model-registry-key` 等）已删除；凭据清理保留 `scripts/purge-kimi-credentials.mjs`。
