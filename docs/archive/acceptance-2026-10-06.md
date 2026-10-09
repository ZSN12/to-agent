# TaskWeaver / Z Runtime 对齐验收记录

日期：2026-10-06  
分支：`refactor/z-runtime-integration`  
基线提交：`780fcb24`  
状态：核心回归、production build、真实 MiMo A/B 单 Agent 样本、生命周期排队 3 轮、真实 MiMo 部分输出取消恢复，以及受控 Host 下“成功工具后取消”和“prompt admission/Stop + 延迟队列快照”均通过；DSH 同句对照、真实工具仍执行中取消及安装版验收待执行。

## 自动化回归与构建

| 检查 | 结果 | 备注 |
|---|---|---|
| `npm run test:user-intent` | 通过 | 32 条意图判定、零注入只读断言与端到端检查 |
| `node scripts/test-conversation-run-lifecycle.mjs` | 通过 | IPC race、排队完成、投影延迟、重复回答、后台隔离 |
| `npm run test:dsh-chat` | 通过 | 会话映射、模型选择、审批、隔离流与取消 |
| `npm run test:orchestration` | 通过 | 显式模式门控、preset 映射、DSH DAG、路由、worktree 与发布 |
| `npm run test:task-profile` | 通过 | 任务类型能力、工具集与只读 preset |
| `npm run test:dag-scheduler` | 通过 | DAG 并发、失败状态和依赖调度 |
| `npm run test:workspace-context` | 通过 | @file/@dir 边界、相关性排序、根目录预加载拒绝 |
| `npm run test:z-host-deploy` | 通过 | 应用 MCP 配置→Host patch→真实 Host/MCP fixture，含主 Agent、DAG implementation 子 Agent、只读拒绝、失败反馈；另含原生命令、队列/失败恢复、历史重启与压缩生命周期 |
| `npm run test:z-runtime-build-atomic` | 通过 | 模拟 `pnpm deploy` 失败；旧 deploy marker 保留且临时 staging 被清理 |
| `npm run build` | 通过 | TypeScript 与 Vite production build |
| `CI=true npm run build:z-runtime` | 通过 | 首次发现 staging 名称校验不一致（外层在 `vendor/` 生成 `.build-*`，pi-ai 同步只允许 `taskweaver-z-runtime-build-*`）；统一专用 staging 前缀并扩充原子构建测试后，全量 Runtime 编译、`pnpm deploy`、依赖修复、Host 启动冒烟与原子发布通过。`pi-ai@0.87.1` 命中锁定版本，未访问 npm registry |
| `git diff --check` | 通过 | 无空白错误 |

## 阶段 2 行为对齐进展

- 只读/代码理解请求不再由 `injectIntentGuidelines` 追加 Host 外 NOTE；原始用户消息与已组装的显式上下文原样进入 Z Host。
- DAG 只由明确选择触发：Goal Composer 模式、用户明确要求多 Agent、选择了多 Agent Skill，或显式执行覆盖。普通 code 模式下，即使任务跨多个领域，也默认单 Agent；Goal 模式是显式选择，读/写任务都按 DAG 执行。
- 普通 Composer 下「看看/检查/审查代码」等只读请求保持单 Agent；用户显式切换到 Goal（多智能体）模式时遵循模式选择，读/写任务都走 DAG，不再用任务内容覆盖用户选择。
- 拒绝 `@dir:.` / `@dir:./` 在 Host 调用前预加载整个工作区，并提示改用具体子目录或由 Agent 按需探索；具体子目录的既有限额和相关度排序不变。
- 空会话提示已改为明确说明“普通请求由单 Agent 直接执行”，并引导用户主动选择多智能体 Skill 或目标模式；不再暗示普通请求会被自动拆成 DAG。
- 既有 Host 会话的 preset 不可原地修改；统计栏显示 Host 实际 preset。新 conversation 独立按首条请求解析 preset，不继承旧对话的 `code`。已由会话绑定冲突与独立 conversation 测试覆盖。
- 对上述修改已重新运行 `test:user-intent`、`test:orchestration`、`test:dsh-chat`、`test:z-host-deploy`、`test:workspace-context` 与 `npm run build`，全部通过；最新源码打包到临时 `.app` 后，Host 部署/MCP/只读工具/DAG mock 验收也通过。
- 本次遇到一次 registry 拉取失败后，`build-z-runtime.mjs` 已改为先在同级 staging 目录完整部署、修复并校验，再原子替换正式 deploy；失败会清理 staging 并保留上一个可用版本。原生 Host 部署、并发 DAG、MCP 与排队生命周期在恢复后的 `vendor/taskweaver-z-runtime` 上全部通过。此原子发布路径尚未经历一次完整联网构建。
- `scripts/run-parity-bench.mjs` schema v2 当前可汇总 read-smoke、生命周期/排队和 DAG 报告；小型 fixture 与真实 DAG 报告回归通过。三份已有 lifecycle 报告都不是源码读取通过：两份 MiMo 是 HTTP 402 计费拒绝、没有文件工具调用；79ms 那份 Host 历史只有 session header，没有 user message/tool event，旧 smoke 没保存可恢复的错误分类，具体原因未知。隐私安全汇总不包含错误正文，也不把它们计为通过；新 runner 改为保存脱敏错误类别、阶段、HTTP 状态及确认工具调用数。read-smoke 现新增 Host step 首 chunk/首文本/结束/retry 时序；`request/header` 单独作为配置快照计数，模型请求尝试数标为 step starts + 已启动 retries 的估算。现有 Host 事件没有 provider dispatch 精确起始事件，不能把该估算写成精确请求数；成功排队生命周期报告仍待补。

### 真实 MiMo 生命周期与排队复验（2026-10-07）

使用隔离的本地 Z Host、`xiaomi/mimo-v2.6-flash`，连续串行执行三轮；每轮包含问候、指定文件读取、追问保留历史、两个独立会话并行、运行中排队追问五个用例。原始脱敏报告：

| 轮次 | 报告 | 总耗时 | 用例 | 并行会话重叠 | 排队追问耗时 / 首文本 | 排队证据 |
|---|---|---:|---:|---|---:|---|
| 1 | `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-lifecycle-smoke-gZ3sy9/report.json` | 40.078 秒 | 5/5 通过 | 是 | 10.504 / 5.476 秒 | 两个不同 turn；`continuing=[true,false]`；2 次 read；0 错误、0 重试、0 串流 |
| 2 | `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-lifecycle-smoke-Se88SY/report.json` | 41.642 秒 | 5/5 通过 | 是 | 18.153 / 11.371 秒 | 两个不同 turn；`continuing=[true,false]`；2 次 read；0 错误、0 重试、0 串流 |
| 3 | `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-lifecycle-smoke-l80QTz/report.json` | 47.734 秒 | 5/5 通过 | 是 | 23.109 / 11.221 秒 | 两个不同 turn；`continuing=[true,false]`；2 次 read；0 错误、0 重试、0 串流 |

三轮合计 15/15 用例通过、0 观察告警；总耗时中位数 41.642 秒，排队用例耗时中位数 18.153 秒。三轮都确认并行会话真实重叠、排队请求被接受且两个回答和 Host 历史均保留。该结果验证的是当前源码通过本地 Z Host 的真实 MiMo 生命周期路径，不代表已安装桌面版 UI，也不包含取消中断或 DSH 同条件对照；取消仍需单独在受控端点验证。

另用 `--cancel-only` 进行一次真实 MiMo 中断：模型先向 stream 输出 18 个可见字符，随后 Host 接受取消（21ms），终态标记 `interrupted=true`，Host history 原生结束原因是 `aborted`，部分文本 18/18 字符保留；同一会话随后成功完成恢复轮次，Host 终态序列为 `aborted → completed`。报告：`/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-lifecycle-smoke-08sm4c/report.json`。这是生产 Host + 真实 provider 的一次取消样本，不替代计划要求的受控模型端点取消/队列竞态测试，也未覆盖“已有完成工具调用后再取消”。

新增受控取消回归在 `scripts/test-z-host-deploy.mjs`：本地 mock provider 先发送可见部分文本并请求 `read(package.json)`，确认 Z Host 已把成功读取结果带入下一次模型请求后，让 provider stream 保持打开，再通过 `dsh-chat-service.abort()` 停止。真实本地 Host history 确认工具调用和成功结果都已落盘，终态为 `aborted`；前端终态保留已见文本并标记 `interrupted`；停止关闭挂起 stream，没有重放请求，busy 状态释放，同一会话新轮次成功。该测试使用真实本地 Host/文件工具，但模型由 mock endpoint 控制；仅验收“工具成功后、后续模型请求挂起”的取消，不等价于真实 provider 或工具执行中断。

新增停止/排队竞态回归在 `scripts/test-z-queue-lifecycle.mjs`：用真实部署 Host 和 mock provider，在 `sessions.prompt` 入队 RPC 中途暂停后触发 Stop，并故意延迟另一条 mux 上的 `session/queue` 快照。测试确认 IPC 先排空已发出的 prompt admissions，再调用 Host 的 `clearPendingUserInput` 原子清除排队用户输入并停止当前活动；被停止的输入没有进入模型请求或 durable user history；当前轮终止后同一会话可恢复。Host 与 inbox/持久化都是真实部署代码，provider 和传输乱序由本地测试控制。DSH 原生取消不带该选项时仍保留其原有 inbox 语义；真实工具进程执行中断及安装版 UI 仍未验收。

## 装包版 A–E 验收

记录每次测试所用模型、工作区、提示原文、Host step/工具调用数、墙钟时间及结果。与 DSH 对照时保持模型、工作区和提示一致；任何真实模型任务都应使用新对话。

| 用例 | 验收标准 | TaskWeaver 结果 | DSH 对照 | 状态 |
|---|---|---|---|---|
| A 单文件只读 | ≤2 steps、≤1 次 read；不搜索、不修改；耗时接近 DSH | 最新真实 MiMo `standard` 样本：23.987 秒、首段文本 9.427 秒；2 steps、1 次 `read`，无搜索/写入，回答 1,631 字符。前一同类样本为 11.280 秒/6.933 秒，2 steps、1 次 read。两个样本的 provider/排队波动明显；DSH 同句数据尚缺，不能据此判定 ±30% | DSH Web UI 未同环境复测；预设单文件样本见 `agent-preset-live-ab-2026-10-06.md` | 临时隔离 Host 单样本通过；构建包/安装版未测 |
| B 仓库概览 | `standard`；≤6 次 inspection；single-agent、无 DAG | 真实 MiMo 样本：23.422 秒、首段文本 9.933 秒；2 steps、4 次工具调用（根目录 `ls -la` + 3 个指定文件 read），没有递归扫描或写入。提示：“请简要概览当前毕设项目的仓库结构：只查看根目录条目（不要递归扫描），然后仅阅读 package.json、electron/main.cjs、src/main.tsx，概括主要目录/入口及它们如何连接。没有实际读取的模块不要推断细节。只读，不要修改文件、构建或测试。” | DSH 未同环境复测 | 临时隔离 Host 样本通过；与 DSH 的 step/时延差值待测 |
| C 排队追问/取消 | 运行状态持续正确；两轮历史完整；取消形成明确终态并保留部分文本 | 排队：真实 MiMo 3/3 通过，不同 turn ID、`continuing=[true,false]`、两条答案均在 Host 历史。取消：真实 MiMo 1 次通过，21ms 返回、保留首段 18 字符、Host 原生 `aborted` 后同会话恢复成功；受控 Host 另通过成功工具后取消及 prompt admission/Stop+延迟 mux 快照竞态 | 不适用 | 真实排队 3/3、真实取消 1/1、两种受控取消边界通过；真实工具仍执行中取消及安装版 UI 待测 |
| D 多 Agent 不误触 | 仓库概览提示走 single-agent、无 DAG | 精确 B 提示加入 `test:orchestration`；并覆盖“完整平台 + 前后端/测试/安全/部署”等跨域请求仍为 single-agent。B 实际 Host 样本用 `standard` 单会话完成、无 DAG | 不适用 | 自动化门控与真实单 Agent 样本通过；应用 UI 端到端未测 |
| E 装包一致 | `/Applications/TaskWeaver.app` 与当前提交/Runtime 一致；部署测试通过 | 新测试包资源与部署目录一致且 Host 部署测试通过；当前 `/Applications/TaskWeaver.app` 仍为旧包 | 不适用 | 安装后复测 |

### 显式工作区上下文上限：同提示 MiMo 真实 Agent 复测（2026-10-07）

在同一毕设工作区，用同一 455 字节提示追踪 `@dir:electron/backend` 中普通 `chat:send → sessions.prompt` 调用链；模型为 `xiaomi/mimo-v2.6-flash`、Medium、`taskweaver-readonly`，每档使用隔离本地 Z Host。预算顺序为 32→16→64 KiB，每档一个真实模型样本；三档均完成、无重试，只观察到只读工具。

| 显式注入上限 | 预载文件 | 首段文字 | 总耗时 | Host steps / 工具调用 | 输入 / 输出 tokens | 缓存读取 tokens | 验收覆盖 |
|---:|---:|---:|---:|---:|---:|---:|---|
| 16 KiB | 5 | 102.7 秒 | 121.5 秒 | 16 / 20 | 36,290 / 8,082 | 299,392 | 完成 IPC→Host 调用链及函数/路径/行号 |
| 32 KiB | 11 | 111.5 秒 | 127.1 秒 | 15 / 20 | 36,061 / 7,848 | 338,560 | 完成同一验收范围 |
| 64 KiB | 15 | 165.6 秒 | 181.2 秒 | 15 / 28 | 45,756 / 10,329 | 398,272 | 完成同一验收范围 |

本组中 16 KiB 最快，且 16/32 KiB 工具调用数相同；64 KiB 未减少检索调用。三档都是单次运行，8.8 秒首字差和 5.7 秒总耗时差不能归因于预算；结合此前同提示组最快档互有变化，**16 KiB 仅暂作为显式工作区注入保护上限，不是已证实最优值**。三个样本首个 Think 约 4.3–5.5 秒，但正文首段在 102.7–165.6 秒才出现，显示此任务中上下文上限不是延迟长时间无正文的充分解释。报告：`/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-read-{DJn0Ud,EyPaQV,yC8i8k}/report.json`。未修改预算、未安装应用。

## 真实并发 DAG 证据

以下来自 `scripts/run-agent-dag-live-smoke.mjs` 留存的 Z Host 原生历史与报告；子任务由 `xiaomi/mimo-v2.6-flash` 实际执行，非 mock LLM。`realPlanner=false` 表示 DAG 计划使用固定安全夹具，Planner 不消耗真实模型调用；子 Agent 和最终汇总仍走真实模型。

| 报告 | 计划器 | 总耗时 | 子任务结果 | 原生 Host 证据 | 判定 |
|---|---|---:|---|---|---|
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-VlktVW/report.json` | 固定只读计划，临时 Runtime 含当前源码 Guard | 73.928 秒 | T1/T2 均转入 review | 两个独立只读 Host 会话；Agent turn 重叠 34.335 秒；T1 3 次 read 成功、3 次范围拒绝；T2 7 次 read + 5 次 grep 成功、4 次无效绝对路径拒绝；零写入 | 比此前 8–16 分钟样本明显缩短；目标文件定位与链路汇总均在一轮内结束，未触发单文件 8 次读取上限。由于 T1 白名单只含 3 个文件而其目标实际需要更多入口文件，加上 T2 起初用绝对路径搜索，两项被证据门槛正确转 review；这是测试夹具/路径提示问题，不算端到端通过 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-xqLmZj/report.json` | 固定只读计划 | 70.078 秒 | T1/T2 均完成 | 两个独立 `taskweaver-readonly` 会话；真实 Agent turn 重叠 34.331 秒；T1 读取 3 次，T2 读取 5 次、搜索 7 次；无写入工具 | 并发 DAG 通过 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-TJLAIE/report.json` | 固定只读计划 | 58.112 秒 | T1/T2 均完成 | 两个独立 `taskweaver-readonly` 会话；真实 Agent turn 重叠 13.421 秒；均有 Host 读取证据；无写入工具 | 并发 DAG 通过 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-kePVHO/report.json` | MiMo 真实规划 | 113.734 秒 | T2 完成；T1 被搜索循环 guard 安全转入 review | 两个独立 `taskweaver-readonly` 会话；真实 Agent turn 重叠 63.141 秒；无写入工具；T1 有 30 条工具调用明细、另 1 条未纳入明细后触发循环保护 | 并发已证实，但端到端完成未通过；真实 Planner 的搜索循环仍需优化 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-G7caug/report.json` | MiMo 真实规划 | 153.702 秒 | T1/T2 当时均被标为完成 | 两个独立只读会话；Agent turn 重叠 26.420 秒；T1 读取 4 次，T2 读取 7 次、成功搜索 17 次、6 次越界 glob 被拒；零写入工具；T2 有 38 次工具调用未保留逐条明细 | 实验暴露完成状态误报：T2 的最终答案承认关键调用边界未闭合，仍被标为完成；随后增加 scope 拒绝完成门槛 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-P8Jaek/report.json` | MiMo 真实规划 | 122.774 秒 | T1/T2 均安全转入 review | 两个独立只读会话；Agent turn 重叠 78.128 秒；T1 读取 6 次/搜索 2 次，T2 读取 8 次/搜索 19 次；各 1 次越界拒绝；零写入工具；最终答案分别明确承认未核实范围外关键文件 | 并发及证据采集通过；规划范围没有覆盖完整调用链，故不能算端到端完成 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-fi56fk/report.json` | MiMo 真实规划 | 173.423 秒 | T1/T2 均待复核 | 并发重叠 59.717 秒；T1 读取 6 次/搜索 3 次/越界拒绝 3 次，T2 读取 14 次/搜索 11 次/越界拒绝 1 次；零写入工具 | Planner 范围改进后仍遗漏入口/IPC/RPC 文件；原始答案承认缺口，当前完成门槛正确转入 review |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-kqULxA/report.json` | MiMo 真实规划 | 173.877 秒 | T1/T2 均待复核 | 并发重叠 85.606 秒；T1 读取 8 次/搜索 10 次/越界拒绝 1 次，T2 读取 8 次/搜索 6 次/越界拒绝 1 次；34 次检查调用；零写入工具 | 只读 glob 精确路径修复后拒绝数从 4 降至 2，但墙钟时间基本不变；重复检查和最终长汇总仍是耗时来源，T1 漏 `preload.cjs`、T2 漏 IPC 注册文件 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-ho0PyS/report.json` | MiMo 真实规划 | 91.535 秒 | T2 完成；T1 待复核 | 两个独立 `taskweaver-readonly` Host 会话；实际 Agent turn 重叠 41.626 秒；T1 读取 5 次/搜索 3 次/越界拒绝 1 次，T2 读取 17 次/搜索 12 次/越界拒绝 0；零写入工具 | 任务范围没有再跨任务类型扩张；T1 仍尝试 `electron/*` 宽泛 glob，被护栏拒绝并如实转 review；T2 闭合请求链路。比前一轮约 8 分钟显著缩短，但 Planner 子任务仍有重复读取/搜索，DAG 端到端未全通过 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-bXAJds/report.json` | MiMo 真实规划（只读边界提示更新后） | 260.813 秒 | T1/T2 均完成 | 两个独立 `taskweaver-readonly` Host 会话；实际 Agent turn 重叠 38.687 秒；T1 8 次工具（7 read、1 grep），T2 24 次（13 read、11 grep）；无失败、越界或写入 | 只读边界提示生效，两任务均按验收完成；但总耗时偏长，拆分为 Planner 76.855 秒、T1 38.807 秒、T2 138.679 秒、最终汇总约 45 秒。工具自身均在毫秒级，主要时间消耗在模型生成/多轮工具决策，不是文件系统或 Host RPC |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-dqhlRy/report.json` | 固定只读计划（`realPlanner=false`） | 141.235 秒 | T1/T2 均完成 | 两个独立只读 Host 会话；turn 重叠 46.167 秒；T1 3 次 read（任务 46.270 秒），T2 8 次 read + 4 次 grep（任务 108.358 秒）；工具耗时约 11–31ms；零失败、越界或写入 | 固定计划下的并发和证据回传通过；T2 工具量仍偏多，墙钟主要耗在模型多轮生成而非工具/RPC。此结果不是 Planner 验收，也不是相对串行的提速证明 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-PzjlvD/report.json` | 固定只读计划（`realPlanner=false`） | 89.173 秒 | T1 31.579 秒/3 read；T2 62.465 秒/7 read+2 grep；均完成 | 两个独立 `taskweaver-readonly` Host 会话；turn 重叠 31.474 秒；工具耗时 12–30ms；无失败、越界或写入 | 再次确认并发和只读证据链正常；时延较 dqhlRy 低，但仍是不同模型采样波动，不能直接当作优化提速证据。此次由不支持 `--help` 的旧 runner 参数意外触发，事后已为 runner 增加安全的 `--help` 解析，避免帮助查询启动真实模型任务 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-6HORhO/report.json` | MiMo 真实 Planner（`realPlanner=true`） | 183.311 秒 | Planner 10.767 秒；T1 77.308 秒/8 read+3 grep；T2 150.692 秒/15 read+11 grep；均完成 | 两个独立 `taskweaver-readonly` Host 会话；turn 重叠 77.202 秒；所有 37 个底层工具调用耗时 10–34ms；无失败、越界或写入；T2 Host 逐条证据保留 26 次调用 | 实际 Planner 的 DAG 计划与并发执行均闭合。但真实链路调研的 T2 从 2 次整文件读取开始，随后对已知目标重复搜索/读取；主要时间在模型多轮决策，不是文件/Host 工具。已据此在只读 preset 与 Planner 子任务要求中加入“大文件先窄搜、仅读相关行段、禁止整文件起步/无具体问题重读”，待重新构建部署并进行同一冻结任务验证 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-yNyfA9/report.json` | MiMo 真实 Planner（加入大文件窄读工作流后） | 135.605 秒 | Planner 16.984 秒；T1 78.865 秒/28 工具（7 glob+12 grep+9 read）；T2 94.253 秒/36 工具（19 grep+17 read）；均完成 | 两个独立 `taskweaver-readonly` Host 会话；turn 重叠 78.744 秒；64 次文件工具均成功，无范围拒绝/写入；工具耗时合计 789ms。T2 的历史列全 36 次，但执行证据摘要仅保留 30 次、标注另 6 次 omitted | 大源码的实际读取改为窄行段，未再整文件读入；但工具调用数未下降，T1 有 7 次对已知路径的冗余 glob，T2 仍有同文件多轮定位/读取。相较 6HORhO 耗时下降不能归因于本次指令（不同 Planner 输出/范围、单样本波动）。提示改动只证明读法收窄，尚未证明更快或更省调用 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-jNGTYf/report.json` | MiMo 真实 Planner | 171.062 秒 | T1 转 review；T2 完成；汇总安全停止 | 两个独立 `taskweaver-readonly` 会话，实际 turn 重叠 58.789 秒；T1 14 次调用（6 read、4 次成功 grep、4 次绝对路径拒绝），T2 31 次（17 read、14 grep，证据摘要少记 1 次）；仅观测到 read/grep，无写入或 shell | 并发和只读会话成立，但 DAG 未全完成。T1 后续相对路径读取已成功，回答里未核实的是相邻 UI/运行时假设，暴露完成判定过度敏感；T2 调用量和耗时仍高。此报告发生在提示/判定器修正之前；后续 LVqdko 虽消除了范围拒绝并完成两项任务，但 Planner 输出不同且总耗时更长，不构成配对提速证据 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-LVqdko/report.json` | MiMo 真实 Planner（相对路径/完成判定修正后） | 217.350 秒 | T1/T2 均完成 | 两个独立 `taskweaver-readonly` 会话，实际 turn 重叠 63.296 秒；T1 9 次调用（6 read、3 grep），T2 31 次（17 read、14 grep，另 1 次未纳入摘要）；只观测到 read/grep，0 失败/越界/写入 | 实际执行确认本轮没有绝对路径拒绝，T1 不再因相邻 UI 的非验收不确定项转 review。相比前一轮，T1 调用数减少 5、T2 不变，但总耗时增加约 46 秒；Planner 计划/输出有差异，不能把调用减少归因到提示改动，也不能宣称提速。两个 DAG 都证明了真实 Host turns 并发 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-GupY6T/report.json` | MiMo 真实 Planner（安全阶段进度修复后） | 43.546 秒 | T1/T2 均完成 | Planner Host 用时 14.048 秒，首个“整理任务计划”阶段在 9.944 秒可见；两个独立只读子 Agent 的 Host turn 重叠 10.512 秒；各自 Host route 与 read-only tool audit 均 verified，无写入 | 首次用真实 MiMo + Z Host 验证 Planner 阶段事件从服务层到 UI stream；总时长仅为本轮样本，不与不同 DAG 任务比较成提速结论 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-6Xww85/report.json` | MiMo 固定只读计划（符号定位版） | 137.768 秒 | T1/T2 均完成；T1 30.948 秒/3 read，T2 126.938 秒/8 read+5 grep；两个独立 `taskweaver-readonly` Host turns 重叠 30.831 秒，路由/只读审计 verified，零失败、越权或写入 | 去掉过期行号后按符号定位、结论完整，但 T2 总调用仍为 13（旧样本 13），时延高于上一轮 75.339 秒。单样本波动不能归因，故只确认避免错行，不宣称提速；仍有重复检索/读取 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-SYZJbo/report.json` | MiMo 固定只读计划（合并读取+绑定证据版） | 115.642 秒 | T1/T2 均完成；T1 33.368 秒/3 read，T2 98.966 秒/6 read+4 grep；独立只读 Host turns 重叠 33.258 秒，route/tool audit verified，零失败、越权或写入 | T2 补齐 `createDshChatService → chat` 绑定，调用由前轮 13 降至 10；但一条泛搜 `invoke(` 的 grep 返回约 10K 字符。时延变化只有单样本，不能宣称优化导致提速；下一轮已把 pattern 收窄，尚待真实模型验证 |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-TkzbjV/report.json` | MiMo 固定计划 + 真实只读子 Agent/汇总（不是实时 Planner） | 44.494 秒 | T1/T2 均完成；T2 为 4 grep + 6 read；独立 Agent turns 重叠 13.193 秒；Host route/只读审计 verified，零失败、越权或写入 | 新的窄搜索 pattern 生效，preload 只搜 `chat:send`，没有泛搜 `invoke(`；完整链路与 `createDshChatService → chat` 绑定有证据。固定夹具的工具调用优化项仍未要求单次服务 read |
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-9C1Byp/report.json` | MiMo 固定计划 + 真实只读子 Agent/汇总（不是实时 Planner） | 59.336 秒 | T1/T2 均完成；T2 为 4 grep + 6 read；独立 Agent turns 重叠 14.308 秒；只读审计 verified，零失败、越权或写入 | 强制单次服务 read 的任务文字仍被模型拆成相邻两次 read（1437+70、1507+104）；答案完整不代表工具纪律达标。现已把窄搜索与单次服务 read 加入固定夹具的显式审计门槛；两轮墙钟差异不能归因于提示变化 |

近几次样本耗时与 Planner 输出波动显著；真实 Planner 的调用耗时必须区分 Host 工具时延和模型整体输出。LVqdko 两个并行子 Agent 的 40 次文件工具调用均为只读，单次工具通常仅 6–33ms；T2 仍有 31 次调用且在工具完成后继续长时间生成，主要时延仍在模型规划/生成与重复探索。提示修正消除了本次绝对路径拒绝并避免 T1 的非关键不确定项误判，但两轮不是冻结计划配对 A/B，不能宣称提速。此前上下文上限只有单样本；最新同题交错实验已对 16/32/64 KiB 各跑三次，生产值暂调整为 32 KiB，依据和波动范围见下文及优化日志 OPT-2026-10-07-33；这仍是单一任务/模型上的暂定值。基准汇总器已扩展为 schema v2，支持 read-smoke、生命周期/队列和 DAG 报告；生命周期原生请求/首 chunk 分段时序与真实生命周期报告回归尚缺。DAG `usage.elapsedMs` 可能合计并发模型时间、超过墙钟总耗时，因此只标为 Runtime 报告的模型时间，不得冒充阶段墙钟时长。之前的真实标准模式单 Agent 样本约 23–24 秒/2 steps，与并行 DAG 工作量不同；未获得 DSH 同环境同提示数据，仍不能判定“整体等速”。

2026-10-07 提示预算边界复验：`assembleWorkspaceContext()` 现要求强制沙箱说明也计入同一 UTF-8 字节上限；若说明本身大于预算则 fail-closed 阻止发送，不截断安全边界。`npm run test:workspace-context` 覆盖无 `@` 引用时刚好达到预算与多字节超限场景。此上限仍不包含 Host 自身 system/tool/preset 及 Host 侧 Skill 注入。

同日新增 Host `sessions.prompt` 用户消息字节观测：`dsh-chat-service` 在真正提交边界仅记录 UTF-8 字节数、投递类型和 Skill envelope 增量，不记录消息正文。普通轮次、排队、steer 与子任务共用该边界；mock 回归核对记录值等于实际提交字符串。它可观察 TaskWeaver 提交的完整用户消息（包括本地 Skill 包装），但 DSH 原生 Skill 正文和 Host system/tool/preset 仍不在其统计范围；该数值不是 token 数或完整模型上下文大小。`npm run test:dsh-chat`、`npm run test:skills`、`npm run test:workspace-context`、`npm run test:user-intent` 与 `npm run build` 均通过。

只读路径边界的部署验证：将更新后的 `repeat-tool-reminder` 编译到 `/tmp/taskweaver-z-runtime-scope.Q1fBXI` 的临时 APFS 克隆中，再运行 `TASKWEAVER_Z_RUNTIME=/tmp/taskweaver-z-runtime-scope.Q1fBXI node scripts/test-z-host-deploy.mjs`，通过。测试让只读 Agent 请求读取未分配的 `electron/main.cjs`，部署 Host 在文件系统工具执行前拒绝；同一测试中的范围内读取及并发 DAG 仍通过。另对模型常见的 `glob(path=".", pattern="electron/main.cjs")` 增加窄例外：仅无通配符且字面目标已授权时映射到该目标；宽泛 root glob 仍拒绝。Guard 27 项 Vitest 与其 TypeScript 检查通过。原 `vendor/taskweaver-z-runtime` 和已安装应用均未覆盖。

针对上述误报，当前源码仅在同时满足“Host 拒绝了越界工具调用”且“最终回答明确承认关键证据缺口”时，才将只读子任务转为“待复核”；越界次数始终单独记录。若 Agent 最终依据范围内证据给出完整结论，单次被拒的探索不会单独判失败。它不限制总工具调用次数或运行时间。P8Jaek、fi56fk、kqULxA 均有真实 MiMo DAG 记录；用当前判定器重新检查 kqULxA 的两份原始回答，因它们明确承认范围外证据缺口而继续待复核。最新一轮还验证精确字面 glob 修复把拒绝数从 4 次降为 2 次，但没有降低总耗时（约 174 秒）。

常规 Composer 默认是单 Agent；只有用户切换到“目标模式（多智能体）”、选择带多智能体门控的 Skill，或明确指定多 Agent 执行时才创建 DAG。任务复杂度、跨领域内容或只读仓库走读本身都不会触发 DAG。相关门控由 `test:orchestration` 覆盖；装包版 A–E 仍待真实 UI 验收。

## MCP 配置到代码子 Agent 的 Host 闭环

- `scripts/test-z-host-deploy.mjs` 不再手写 MCP patch：通过真实 `createMcpService → saveServer → prepareRuntimeIntegration` 生成配置，再注入真实 Z Host 进程；MCP server 使用本地 fixture，模型 API 使用本地 mock endpoint。
- 主 Agent 的 MCP schema 与成功调用通过；只读子 Agent 的调用被 Host 拒绝；MCP `isError` 返回模型；显式 DAG 中 `implementation` 子 Agent 使用已部署 `taskweaver-code` preset，模型请求包含 `mcp__smoke__echo` schema，并通过 Host 实际调用本地 fixture。fixture 日志验证该 DAG 子 Agent 恰好执行一次指定调用。
- UI 将状态明确标为“设置探测成功”，并说明设置页探测不等于本轮 Z Host 已加载或模型已调用；应以对话里的 Host 工具调用记录为准。
- **边界：**Host 与 MCP 子进程为真实本地进程，配置生成/工具执行路径来自当前源码；模型 endpoint 是 mock，不代表真实模型会主动选择调用；未使用用户密钥/线上 MCP，也未验收已安装 GUI。

## Host 原生历史与 UI transcript 对照

- 诊断来源：当前工作区绑定的真实 Host session archive，13,050 个原生事件、完整读取 8 轮；使用隔离临时 Z Host 投影，未复制凭据、未发送 prompt/模型请求。报告只保留计数、usage 和长度元数据。
- 初始差异：assistant 文本 8/8 精确匹配；UI usage 比原生 assistant events 少 29,375 input tokens、530 output tokens、80,896 cache-read tokens。事件层显示前两轮存在 4/3 个 assistant model steps，而可见 chat order 各只有最终可见 step。
- 修复后：仅当 `chat.timeline.turns[*]` 同时具有 start/end 边界时，transcript 序列化才从其全部 step-scoped `assistant-step` data 汇总 usage 与 reasoning；分页边界缺失或旧 snapshot 回退到可见节点/closing。对同一 archive 重跑后，UI/Host 的 input 221,821、output 34,837、cache-read 4,559,872、cache-write 0 全部一致；assistant 文本 8/8、非空 Think 6/6 精确匹配。`npm run test:dsh-chat`、snapshot/transcript serializer 和 shadow-compare 测试通过。
- 仍有已知投影差异：前三条旧 user prompt 在 Host archive 中带有额外 envelope 文本；本次没有改写既有历史记录。后续以只输出结构布尔值的 envelope 诊断复核，8 条中 5 条 UI/Host 原文一致；另 2 条 Host 各多 158 字符并命中自动验证指引。当前工作区的 `injectIntentGuidelines()` 在命令为 `npx tsc -b` 时会生成恰好 158 字符/376 UTF‑8 字节尾缀，和历史长度吻合，但无当时逐轮配置记录，不能认定为同一条历史请求。第 3 条多 72 字符，来源仍未识别。三条均没有命中 workspace/skill envelope 标记。归档为 2026-10-06 的旧会话，不能泛化到当前每一轮。
- Z Runtime `session.prompt` 当前仅接受文本/图片 content，没有分离的 display-text 字段；但 Host 内存在来源标记的插件上下文 `user/message` 机制。UI 原文与模型注入层必须先拆分，才可安全从 Host 投影重建可见 transcript。此处仍是架构缺口，未删除 UI 持久化。

## 安装版 Runtime 差异

- `/Applications/TaskWeaver.app` 当前版本为 `1.0.0`，应用与内置只读 preset 文件时间为 `2026-10-04`。
- 2026-10-06 检查快照中的源码/deploy preset SHA-256 为 `21059026a4426a44463a5d7558a56bd7a7deaa55ec34a330c82202df971ac84e`；安装版为 `ae731f4bc94e4343f3a7bb2a084df18a3bbd10557ccad0d65996f14dfbf471de`。该源码哈希已被之后的 preset 改动取代，不能作为当前哈希。
- 用 `TASKWEAVER_Z_RUNTIME=/Applications/TaskWeaver.app/Contents/Resources/taskweaver-z-runtime node scripts/test-z-host-deploy.mjs` 对安装版做隔离 mock 验收，在 Host 启动前失败：安装 preset 没有默认排除 `vendor`。对比文件还显示它缺少 native tool presentation，保留了每任务五次检查的硬限制。
- **2026-10-07 复验：**源码与 `vendor/taskweaver-z-runtime` 的只读 preset SHA-256 均为 `08c551d55ca5a45b00817506f92f3a6f64ad040dca79a2bc8faaf8b65c522c2a`；重新以 `npm run app:builder -- --config.directories.output=/tmp/taskweaver-app-current-gThQRv/out` 构建独立测试 `.app`，包内 preset 哈希也相同。仓库 deploy 与新 `.app` Runtime 的 `scripts/test-z-host-deploy.mjs` 均通过，覆盖真实 Host 进程、MCP、只读模型工具和并发 DAG（模型端为 mock）。
- **2026-10-07 当前源码包复验：**`npm run build` 通过；使用独立 `/tmp/taskweaver-app-verify-jq0qKD` 输出目录打包，未触碰 `release/` 或 `/Applications`。包内 `app.asar` 扫描 109 个 Electron/前端 JS 文件，未发现 `TASKWEAVER_LEGACY_HISTORY_CONTEXT` 或 `formatLegacyHistoryContext`；打包代码中的 `dshAgentPresetForPermissionMode` 返回 `standard`。canonical source、`vendor/taskweaver-z-runtime` deploy 和该 `.app` extraResources 中的只读 preset SHA-256 均为 `7e1eb673b0ec30b0cc29025ed8229281444fe20c23fca980b35bfe74dc62be40`。再以 `TASKWEAVER_Z_RUNTIME=<临时 .app 内 Runtime> node scripts/test-z-host-deploy.mjs` 启动该包内 Runtime 的真实 Host 进程，部署、只读工具、MCP、并发 DAG mock 和历史重启 smoke 全通过。没有调用真实 LLM；这是 bundle/Host 验收，不代表应用已安装或完成 GUI/真实模型验收。
- 当前 `/Applications/TaskWeaver.app` 仍为旧哈希 `ae731f4bc94e4343f3a7bb2a084df18a3bbd10557ccad0d65996f14dfbf471de`。新测试包已验证，但没有安装或覆盖现有应用。

## 每次实测记录

### 2026-10-07 实时 Planner 小样本复验

| 报告 | Planner 模式 / 请求证据 | 子 Agent 结果 | Host turn 重叠 | 总墙钟 | 验收 |
|---|---|---|---:|---:|---|
| `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-44xsBe/report.json` | `realPlanner=true`，Host 原生历史 1 次 Planner turn/model step；模型 Xiaomi Mimo V2.6 Flash，medium；计划阶段 10.233 秒可见、Planner Host 用时 15.966 秒 | T1/T2 均 done，独立 `taskweaver-readonly` sessions；T1 1 read，T2 1 grep + 1 read；路由与只读工具审计 verified | 13.798 秒 | 41.404 秒 | 真实 Planner 和并发子 Agent 链路通过；Planner、fixture 与固定 T2 工具纪律状态分别为 verified / not-applicable / not-applicable。仅 1 次，不代表多轮质量或串并行提速结论 |

原始脱敏报告保留 Planner request/header、两条 Host task session、实际路由、工具参数、turn 区间和判定器状态；无需依赖 UI 标签推断。该测试没有修改文件、运行构建或由子 Agent 执行 shell。

### 2026-10-07 只读子 Agent 与真实 Planner 五轮验收

- source preset `vendor/z-runtime/apps/cli/config/agent-presets/taskweaver-readonly/agent.cordis.yml` 与当前 deploy preset SHA-256 均为 `b0ced271694b60bfca6ae0332a802a8d674e4f7b9e70df0dd5795a1bd31218b3`。每轮实时 Planner 的两条 research 子任务都有独立 Host session，Host session 元数据均为 `taskweaver-readonly`；Host 原生请求头确认 MiMo V2.6 Flash / Medium，工具历史每轮均为 T1 `read(package.json)` 一次、T2 `grep + read(electron/backend/dsh-session-model.mjs)`，无写入、shell、失败或越权调用。
- **质量核对：**5/5 轮两项任务都完成且返回文本；T1 均给出 `electron/main.cjs` 及入口行号，T2 均解释 `sessionModelMatches`、`reasoningEffort` 缺失与 `lastAppliedSelection` 回退判定。每份 Host route、preset、文件工具审计均 verified。

  | 报告 | 总墙钟 | Planner 首阶段进度 | Host 子 Agent turn 重叠 | 验收 |
  |---|---:|---:|---:|---|
  | `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-44xsBe/report.json` | 41.404 秒 | 10.233 秒 | 13.798 秒 | 完成；路由/preset/只读审计通过 |
  | `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-ucN0mF/report.json` | 61.871 秒 | 2.622 秒 | 44.556 秒 | 完成；路由/preset/只读审计通过 |
  | `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-xAArYX/report.json` | 67.965 秒 | 2.320 秒 | 27.866 秒 | 完成；路由/preset/只读审计通过 |
  | `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-mTktOs/report.json` | 39.095 秒 | 2.792 秒 | 7.700 秒 | 完成；路由/preset/只读审计通过 |
  | `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-Sc1Yhu/report.json` | 49.969 秒 | 4.090 秒 | 9.514 秒 | 完成；路由/preset/只读审计通过 |

- 五轮总耗时中位数 49.969 秒，turn 重叠中位数 13.798 秒。全部 turn 区间确实重叠，证明这个固定 live-Planner 场景能实际并发；耗时范围很宽，未做串行配对，不证明 DAG 提速或其他任务类型的普遍规划质量。
- **门禁改进及新回归：**`scripts/run-agent-dag-live-smoke.mjs` 现在在模型调用前核验 source/deploy preset hash，并在 Host session history 阶段核验所有 research/review session 实际加载 `taskweaver-readonly`。该门禁启用后的真实 smoke `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-live-dag-yKxVri/report.json` 再次通过：preset bundle/session evidence、并发 turn 均 verified，总墙钟 38.750 秒、重叠 19.784 秒。
- `npm run test:task-profile`、`npm run test:dag-live-evidence`（含 6 个 preset integrity/session 正反例）与 `node scripts/test-z-host-deploy.mjs` 均通过。此结果仅完成只读 preset 部署及固定场景的 live Planner/并发验收；不替代 DSH 同条件性能实验或串行/并行五轮配对。

### 2026-10-07 16 KiB 单样本复核与服务层/Host 原生配对试跑（历史状态）

- **16/32/64 KiB 实测仍是单样本：**详见 `OPT-2026-10-07-27`。16 KiB 相对 32 KiB 仅观察到总耗时短 5.7 秒、首段文字早 8.8 秒；当前证据不足以证明 16 KiB 最优，也不足以支持改动默认值。继续将其视为显式工作区注入的暂定安全上限。
- **单轮路径试跑：**同一隔离 Z Host、MiMo-V2.6-Flash Medium、同一 242 字节提示/工作区/临时只读 preset，分别走 TaskWeaver `chat.send` 服务适配层和 Host 原生 API。两边路由与权限均核实一致，均以 2 个 Host steps 完成一次 `read(package.json)`，无 shell、网络、写入或重试。

  | 路径 | 总耗时 | 首段文字 | Host turn | 输入 / 输出 tokens |
  |---|---:|---:|---:|---:|
  | TaskWeaver `chat.send` 服务适配层 | 22.350 秒 | 13.604 秒 | 22.259 秒 | 4,948 / 841 |
  | Z Host 原生 API | 19.897 秒 | 8.273 秒 | 19.591 秒 | 3,969 / 792 |

- 该单配对的观察差值为 2.453 秒总耗时、5.331 秒首段文字，不能推断稳定开销或因果。比较范围**不包括**完整 `register-ipc` prompt pipeline，也不是 DSH Web 对照。
- 原始报告 `/var/folders/y2/8tky9bh97pn991dp9g6gv1_00000gn/T/taskweaver-agent-path-pair-wenxk6/report.json` 保留 `verification-failed` 原始状态：首轮 runner 忘记允许 Host 附带的只读 `read_image`。对原生 Host 历史离线复核后确认该工具两侧均未调用、实际只读调用均为 `read(package.json)`；把白名单修正为 `read`/`read_image` 后，其余验收项全部通过。没有改写原报告或再次调用模型。
- runner 的隔离 Host home/凭据副本已清理；目前只有一组配对样本，阶段 1 的可信性能对照仍未完成。

### 2026-10-07 16/32/64 KiB 三轮交错真实 Agent 复测

同一模型、工作区、284 字节只读提示、`taskweaver-readonly` 和隔离 Z Host；三组交错顺序共 9 次真实调用，全部完成且只使用 `read/grep/glob`。结构化验收检查确认九个答案都覆盖 IPC、上下文组装、Host 提交和文件证据，0 重试；未做独立逐行质量评分，也未经过完整 UI→IPC 路径。

| 工作区注入上限 | 首段文字中位数 | 总耗时中位数（范围） | steps / 工具调用中位数 | input/output/cache-read tokens 中位数 |
|---:|---:|---:|---:|---:|
| 16 KiB | 81.5 秒 | 101.0 秒（67.0–169.2） | 11 / 17 | 30,849 / 5,642 / 153,728 |
| 32 KiB | 71.4 秒 | 93.7 秒（77.2–204.0） | 9 / 13 | 30,124 / 5,618 / 139,136 |
| 64 KiB | 162.3 秒 | 191.9 秒（123.1–208.3） | 11 / 16 | 38,489 / 7,827 / 262,592 |

32 KiB 在三组同任务配对里两次快于 16 KiB，且把本任务直接相关的 `context-assembler.mjs` 预载进来；与 16 KiB 相比中位数略早输出、较少 steps/工具和较低总 token 中位数。64 KiB 三组均慢于同组 32 KiB，未增加答案覆盖。鉴于 16/32 KiB 耗时区间大幅重叠且这里只有一个任务/模型，不能据此宣称跨任务最优；当前默认**暂用 32 KiB**，64 KiB 不采用，后续需在另一种代表性任务复核。它只限制 TaskWeaver 单轮显式上下文注入，不等于模型上下文窗口或任务预算。原始报告及完整边界见 `docs/修改与优化日志.md` OPT-2026-10-07-33。

### 2026-10-07 注入层拼装与字节预算回归

九轮报告显示首次 Think 中位数 4.6 秒（2.7–8.3 秒），首次正文中位数 102.9 秒（51.9–173.0 秒），step 中位数 11（8–17）。这说明用户看到 Think 后长时间无正文的主要观察区间发生在多轮工具/模型步骤中，不能单归因于工作区注入字节数。

为使最终发送文本可审计，新增 `composePromptPipeline` 统一在 UTF-8 字节口径下组合必需的沙箱策略、用户原文、显式上下文与可选验证层；仅可选后缀可以因预算不足而移除，必需层超限则 fail-closed。`chat:send` 和 DAG 子任务 `tasks:sendMessage` 都使用该拼装器，日志给出分层字节与移除层。`npm run test:prompt-pipeline`、`npm run test:workspace-context`、`npm run test:user-intent`、`npm run test:dsh-chat`、`npm run test:single-writer`、`node scripts/test-native-chat-command.mjs`、`npm run test:chat-route` 及 `npm run build` 通过。

本改动**没有**把工作区文件或 Skill 改成 DSH 的来源化 context event：它们当前仍可能属于 Host 用户消息内容。完整的用户原文/模型上下文解耦需要单独的 Host API/事件与 transcript 迁移；本次未打包安装应用，也未重跑真实模型。

| 时间 | 用例 | 应用版本/提交 | 模型 | 工作区 | 提示原文 | Host steps | 工具调用 | TaskWeaver 耗时 | DSH 耗时 | 结果/备注 |
|---|---|---|---|---|---|---:|---:|---:|---:|---|
| — | — | — | — | — | — | — | — | — | — | — |

## 发布状态

- 双 commit：待处理。
- Push：待确认。
- 安装 `/Applications/TaskWeaver.app`：待确认。
- A–E 装包版验收：待安装后执行。
