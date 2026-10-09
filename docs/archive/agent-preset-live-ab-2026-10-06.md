# DSH Agent 预设真实任务对照（2026-10-06）

## 目的与方法

验证是否应在 TaskWeaver 内部按任务自动选择 DSH 的 `standard`、`code`、`minimal`、`cordis`，不向用户显示预设选择器。

通过 `scripts/run-agent-read-smoke.mjs --local` 启动隔离的本地 Z Host，使用已配置的 `xiaomi/mimo-v2.6-flash`，统一 `low` 推理档位，执行同一只读请求：

> 只阅读 `electron/main.cjs`，概括它负责什么，最多五句话。不要读取其他文件，不要搜索，不要修改。

实验依次为 `standard`、`code`、`minimal`；发现 Code Mode 工具误用后，在 `code` 预设补充显式调用协议并重新构建运行时，再重复 `code`。随后发现 `standard` 人格对所有聚焦代码问题都要求先搜索，于是在用户给出准确路径时改为直接读取，并用更新后的临时 Runtime 再测。耗时属于观测值，不是统计基准。

## 观测结果

| 预设 | 总耗时 | 首段文本 | Host 记录的行为 | 结论 |
|---|---:|---:|---|---|
| `standard` | 14.3s | 11.0s | 1 次 `read`，2 steps | 单文件只读正常；适合作通用默认 |
| `standard`（复测） | 11.0s | 7.9s | 1 次 `glob` + 1 次 `read`，3 steps | 模型仍做了一次可省略的精确路径 glob，未满足“不要搜索”；耗时仍约 11 秒，说明同句单样本有波动 |
| `standard`（准确路径直读指令后） | 11.3s | 6.9s | 1 次 `read`，2 steps，无搜索/写入 | 准确文件路径不再触发 discovery；本轮满足单文件验收。仍需多样本复测 |
| `code`（修复前） | 12.5s | 9.3s | 先错误直呼 `read`，收到 Code Mode 拒绝后才以 `run_code` 读取；3 steps | 说明仅有生成 SDK 提示未稳定阻止模型直呼 |
| `minimal` | 24.7s | 21.5s | 连续尝试 3 个错误绝对路径，再 `pwd && ls`，最后才读对路径；6 steps | 该 preset 关闭运行时上下文；模型对工作目录无依据，普通任务自动路由风险高 |
| `code`（修复后） | 11.6s | 8.9s | 首次即 `run_code`，其中嵌套调用 `read`；2 steps | 本样本中无效工具轮次消失，结果符合预期 |

所有试验只读 `electron/main.cjs`，未改工作区文件。隔离 Host 使用项目工作区路径；测试所用凭据文件复制进临时用户目录并在退出时清理。

## 代码改动与验证

- `vendor/z-runtime/apps/cli/config/agent-presets/code/agent.cordis.yml` 增加明确协议：Code Mode 会话只能直接调用 `run_code`，其他能力必须通过生成的 `tools` SDK 在程序内调用。
- `vendor/z-runtime/apps/cli/config/agent-presets/standard/agent.cordis.yml` 增加准确路径优先规则：用户给出文件路径时直接 `read`，只有路径不明确才窄范围搜索；部署 Host 集成测试检查该指令已进入模型请求。
- `scripts/run-agent-read-smoke.mjs` 允许对 DSH 的 `standard`、`code`、`minimal`、`cordis` 做本地真实 Host 对照，也保留 TaskWeaver 内部预设。
- 该脚本支持 `TASKWEAVER_Z_RUNTIME` 指向隔离目录，便于真实模型复测而不覆盖仓库内或已安装的 Runtime。
- `scripts/test-z-host-deploy.mjs` 检查部署后的主 `code` 预设包含该协议，而非仅检查源码模板。
- `npm run build:z-runtime` 成功；部署目录 Host 冒烟成功。
- `node scripts/test-z-host-deploy.mjs` 通过，包含部署预设、只读模型工具和模拟并发 DAG 验收。

## 路由决策

- 常规任务默认 `standard`；明确批量/并行只读请求可走 `code`。
- `minimal` 不自动用于普通任务：本次日志显示其缺少工作目录上下文会导致错误路径探索。只有修正上下文注入并做多样本复测后，才考虑纳入自动路由。
- `cordis` 用于明确的 Agent preset/运行时组合创作，不属于普通代码任务。本次没有用不相关的单文件读取任务冒充对它的性能验收。
- DSH 预设在会话开始后锁定，因此内部路由只能在会话创建/首条消息时确定；不能按同一会话的每条追问任意切换。

## 限制

这组试验只有一个模型和一个单文件任务；每个预设的样本很少，不能推出跨模型或跨任务的平均性能结论。修改准确路径指令后，本次复测消除了 glob 和一个工具往返，但仍需用其他任务重复，并继续对比 Host 工具轨迹，不能据此宣称整体已与 DSH 等价。`cordis` 需要专门的预设创作任务才能评估；`minimal` 的改进也还没有实验验证。时延可能受供应商队列波动影响，应以 Host 工具事件和工具调用路径作为更强的行为证据。
