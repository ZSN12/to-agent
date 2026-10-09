# TaskWeaver 无头单轮（headless）

终端里跑**一轮**只读/编码 Agent，与桌面应用共用同一套 DSH Chat + Z Host 管线。入口脚本为 [`scripts/taskweaver-headless.mjs`](../scripts/taskweaver-headless.mjs)，内部固定调用 `run-agent-read-smoke.mjs --local` 并透传 CLI 参数。

## 用途

- 本机 smoke：验证模型、Host、preset 是否可用。
- 定时任务：[`run-scheduled-job-cli.mjs`](../scripts/run-scheduled-job-cli.mjs) 按任务配置调用本入口。
- 未来 CI：按本文 **NDJSON 流**约定解析 stdout（部分事件已实现，见下表）。

## 前置条件

| 项 | 说明 |
|----|------|
| **Node** | 与仓库 `package.json` engines 一致（建议 22+）。 |
| **模型** | macOS 用户数据目录 `~/Library/Application Support/taskweaver-desktop` 内已配置 `models.json` 与活动模型（与桌面端相同）。 |
| **DSH 凭据** | 同上目录下 `dsh/settings.yaml`、`.credentials.yaml`（smoke 会复制到临时 report 目录，不打印明文密钥）。 |
| **Z Host 运行时** | 环境变量 `TASKWEAVER_Z_RUNTIME` 指向已构建的 taskweaver-z-runtime；未设置时默认 `vendor/taskweaver-z-runtime`（开发树）或安装包内路径（`--installed` 时由 smoke 脚本处理，headless 始终 `--local`）。 |
| **工作区** | 仓库根目录作为 `cwd` 与 Agent 工作区。 |

无模型/无凭据时，子进程会在启动 Host 或选模型阶段失败，退出码 `1`，stderr 一行 JSON：`{ "status": "failed", ... }`。

## CLI

```bash
npm run headless -- --text "<用户提示>" [选项…]
# 等价
node scripts/taskweaver-headless.mjs --text "<用户提示>" [选项…]
```

### `taskweaver-headless.mjs` 自有选项

| 标志 | 必填 | 说明 |
|------|------|------|
| `--text <prompt>` | 是* | 本轮用户消息（*`--help` 时不需要）。 |
| `--help` | 否 | 打印用法到 stderr，退出 `0`。 |
| `--json-summary` | 否 | 运行结束后在 **stdout 额外** 打印一行 JSON 摘要（见下文）；不影响 smoke 原有 JSON 行。 |

### 透传给 `run-agent-read-smoke.mjs` 的选项

headless 会注入 `--local`（隔离临时 userData + 本机起 Host）。下列标志由 smoke 解析（与直接跑 smoke 一致，但不要重复传 `--local`）：

| 标志 | 默认 | 说明 |
|------|------|------|
| `--preset` | `taskweaver-readonly` | `standard` \| `code` \| `minimal` \| `cordis` \| `taskweaver-code` \| `taskweaver-readonly` \| `taskweaver-optimized` \| `taskweaver-pi-lite` |
| `--workspace` | TaskWeaver 仓库目录 | 绑定会话的工作区；必须是已存在的非根目录。定时任务会显式传入保存的工作区。 |
| `--model` | 活动模型 | 覆盖 profile 中的模型 key |
| `--thinking` | profile | `default` \| `off` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` \| `max` |
| `--idle-timeout` | 提供商默认 | 流空闲超时（ms），1000–300000 |
| `--context-budget` | 无 | 工作区上下文注入上限（字节），1024–1048576 |
| `--base-url` | — | headless **不**使用（仅 smoke 在未 `--local` 时连接已有 Host） |
| `--installed` | — | headless **不**注入；若手动透传会改变 runtime 解析路径 |

定时任务常用：`--preset taskweaver-readonly`（只读）。应用内打开时，定时任务可以调用 DAG 编排；关闭应用后的 LaunchAgent 目前只支持单 Agent headless，不会执行 DAG。
`TASKWEAVER_USER_DATA` 可覆盖默认的用户数据目录，供 LaunchAgent 指向桌面应用实际使用的数据与凭证。

## stdout / stderr 行为（当前实现）

子进程 **stdio 继承**（除非使用 `--json-summary`，此时仍转发 stdout，并在末尾追加摘要行）。

`run-agent-read-smoke.mjs` 在运行过程中向 **stdout** 打印 **单行 JSON**（非严格 NDJSON 类型字段，用 `status` 区分）：

| 语义 | 实现状态 | 示例字段 |
|------|----------|----------|
| 开始 | **已实现** | `{ "status": "starting", "reportDir", "modelKey", "agentPreset", "conversationId", … }` |
| 心跳 | **已实现** | `{ "status": "running", "elapsedMs", "reasoningChars", "toolCalls", "firstTextMs" }`（约每 20s） |
| 工具事件 | **已实现** | `{ "elapsedMs", "tool", "status", "input", "result" }` |
| 完成 | **已实现** | `{ "status": "completed", "reportPath", "elapsedMs", "text", "toolCalls", … }` |
| 失败 | **已实现**（stderr） | `{ "status": "failed", "reportDir", "error" }` |

完整指标与历史片段写入临时目录 `reportDir` 下的 `report.json`（成功）或 `failure.json`（失败）。`reportDir` 形如 `${TMPDIR}/taskweaver-live-read-*`。

### `--json-summary` 输出（headless 包装层）

最后一行（仅当传入 `--json-summary`）：

```json
{"wrapper":"taskweaver-headless","ok":true,"exitCode":0,"elapsedMs":12345,"agentPreset":"taskweaver-readonly","reportPath":"/var/folders/.../report.json","text":"…","error":null}
```

失败时 `ok: false`，`error` 为 smoke 失败消息（若可解析）。

## 提议：CI 用 NDJSON 流（`type` 字段）

未来 headless/smoke 可统一为 **每行一个事件**，`type` 固定枚举，便于 `jq`/测试断言。下表为**目标契约**；与上表映射关系一并列出。

| `type` | 状态 | 载荷（示意） |
|--------|------|----------------|
| `start` | **已实现**（现为 `status:"starting"`） | `runId`, `modelKey`, `preset`, `reportDir` |
| `chunk` | **计划中** | 助手正文增量 `delta`（今日无独立行，仅在最终 `completed.text`） |
| `thinking` | **计划中** | 推理增量（今日仅累计于 metrics / `reasoningChars`） |
| `tool` | **已实现**（无 `type` 字段） | `name`, `status`, `inputSummary`, `resultSummary`, `elapsedMs` |
| `heartbeat` | **已实现**（`status:"running"`） | `elapsedMs`, `reasoningChars`, … |
| `done` | **已实现**（`status:"completed"`） | `reportPath`, `text`, `elapsedMs`, 工具统计 |
| `error` | **已实现**（`status:"failed"`） | `message`, `reportDir` |

迁移时建议：新字段并行一期，CI 同时接受旧 `status` 与新 `type`。

## 示例

```bash
# 只读列举（默认 preset）
npm run headless -- --text "只读列出仓库根目录下的顶层文件"

# 指定 preset
npm run headless -- --text "简述 README 要点" --preset taskweaver-readonly

# CI 友好：末尾一行摘要
npm run headless -- --text "ping" --json-summary

# 查看用法（无需 Host）
node scripts/taskweaver-headless.mjs --help
```

## 退出码

| 码 | 含义 |
|----|------|
| `0` | 本轮 Agent 正常结束（`chat.send` 成功且 smoke 未设 `exitCode`）。 |
| `1` | 缺少 `--text`（headless 用法错误）；或 smoke 异常（`failure.json` 已写）；或子进程非零退出。 |
| 其他 | 来自 Node/子进程信号等，按 shell 惯例传递。 |

`run-scheduled-job-cli` 在 headless 非零退出时会 `markRun` 错误并退出 `1`；任务被禁用时 CLI 退出 `0` 且不调用 headless。

## 相关脚本与测试

- 门禁（无需 Host）：`npm run test:headless-doc` → [`scripts/test-headless-cli.mjs`](../scripts/test-headless-cli.mjs)
- 完整 smoke（需本机模型 + Host）：`node scripts/run-agent-read-smoke.mjs --local --text "…"`

## 文档索引

- 执行计划 D-08：[`taskweaver-execution-plan-2026-10.md`](taskweaver-execution-plan-2026-10.md) §6
- 发布节奏：[`release-rhythm-v1.2.md`](release-rhythm-v1.2.md)
