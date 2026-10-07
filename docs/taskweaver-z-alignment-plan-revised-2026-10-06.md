# TaskWeaver / Z 对齐与性能改造计划（修订版）

修订日期：2026-10-06  
依据：用户此前提供的六阶段计划、当前源码/测试检查、真实 MiMo Host 运行记录及并行子智能体审阅。本文替代旧计划作为后续执行顺序；旧计划和验收记录保留作历史依据。

## 目标与明确约束

目标是在不牺牲正确性、隔离和 MCP 能力的前提下，让普通单 Agent 请求沿 Z Runtime 的稳定原生路径执行；多智能体只在用户明确选择目标/多智能体模式或明确要求时启动 DAG。优化依据必须是 Host 原生历史与真实任务数据，而不是仅凭 UI 状态或主观推断。

- 产品及自有代码使用 **TaskWeaver / Z** 命名；提到 DSH 时只用于描述上游来源或对照基线，不把它作为产品名称。对 fork 做命名迁移时保留许可证、来源和兼容迁移说明，不以全仓字符串替换代替设计。
- **不新增任务预算**：不因 token、成本、工具总数或墙钟时长到顶而自动截断任务。允许有上限的模型/子任务重试，以及针对相同调用、搜索循环、无效路径的窄范围防循环保护；保护触发时应解释并保留已有结果。
- 普通 Composer 默认单 Agent。DAG 只由明确的多智能体/目标模式选择触发；任务看起来复杂或跨领域不能擅自升级为 DAG。
- MCP 配置、Host 注册、主 Agent 及 DAG 子 Agent 可调用能力均属于保留功能；每个阶段都要有连接/工具发现/调用回归，不能只验证设置页显示“已连接”。
- 不增加 DSH 四种 preset 的用户选择器。Agent 内部根据任务类型选择合适 Host preset；默认行为对齐 `standard`。已经创建的 Host 会话 preset 不假装可热切换。
- 不用 GUI 自动化完成基准。以本地 Host API、服务入口和可审计脚本测试；真实模型实验使用隔离会话/工作区。提交、推送、覆盖已安装的 `/Applications/TaskWeaver.app` 均须另行确认。

## 已有证据与现状

以下是已完成工作，不应在后续计划里重复排期：

> 2026-10-07 更新：排队入队与 Stop 的竞态已用真实本地 Z Host + mock provider 回归；测试暂停 prompt admission、先触发 Stop、再接收入队，并延迟 mux 队列快照。当前 Host 原子清理测试通过。未覆盖真实工具进程执行中取消；详见验收记录与优化日志 OPT-2026-10-07-24。

- `test:user-intent`、`test:orchestration`、`test:dsh-chat`、`test:task-profile`、`test:dag-scheduler`、`test:workspace-context`、`test:z-host-deploy`、`test:z-runtime-build-atomic` 与 `npm run build` 已通过。
- `CI=true npm run build:z-runtime` 已在修复 staging 命名前缀校验后通过；fresh deploy 的 Host/MCP/只读工具/DAG/排队生命周期测试通过。安装版没有被覆盖。
- 最近单 Agent 样本：MiMo V2.6 Flash、`standard`，单文件读 11–24 秒、2 steps/1 次 read；受样本数与服务波动影响，尚没有足够数据判定与 DSH 的相对时延。
- 最新固定计划的真实并发 DAG 烟测：报告 `taskweaver-live-dag-dqhlRy/report.json`，两个只读子任务均完成，零失败、越界、写入；T1 用 3 次 read 耗时 46.270 秒，T2 用 8 次 read + 4 次 grep 耗时 108.358 秒；Agent turn 重叠 46.167 秒，总耗时 141.235 秒。底层工具各约 11–31ms，因此 Host 文件系统/RPC 不是主要时延来源；模型生成与多轮检查仍是主要疑点。此测试使用固定 DAG 计划（非真实 Planner），只能证明并行与执行/证据链路，不能证明真实规划质量。
- 新增真实 Planner 样本 `taskweaver-live-dag-yNyfA9/report.json`：总耗时 135.605 秒、Planner runtime 报告时间 16.984 秒；两个子 Agent 真实 turn 重叠 78.744 秒，均完成。T1 有 28 次工具调用（7 glob、12 grep、9 read），T2 有 36 次（19 grep、17 read），64 次文件工具共 789ms。部署 preset/Planner 描述加入“大源码窄搜后范围读取”后，本样本没有整文件读取，但调用量仍高，不能据单次较快结果声称优化有效；`taskHistories` 保留 36 项而摘要 evidence 缺 6 项，报告需同时显示两种口径。
- 2026-10-07 最新真实 Planner 窄任务样本 `taskweaver-live-dag-44xsBe/report.json`：Planner Host 原生请求证据 verified（1 turn/1 step），计划进度 10.233 秒可见；T1/T2 两个独立只读会话均完成，route 与工具审计 verified，实际 Agent turn 重叠 13.798 秒，总墙钟 41.404 秒。更新后的结果明确标记固定 fixture/fixed-T2 检查为 `not-applicable`。该单样本闭合实时规划与并发执行链路，不构成 5 次 Planner 质量复验或串/并行配对提速结论。
- 先前真实 Planner 样本约 91.5–260.8 秒；有样本显示 Planner 约 76.9 秒、较慢子任务约 138.7 秒、汇总约 45 秒。范围门槛曾正确阻止缺证据任务误报完成，但真实规划和汇总仍需优化。
- `scripts/run-parity-bench.mjs` 已有 schema v2 的 read-smoke、生命周期/排队与 DAG 汇总；仅导出白名单聚合字段，fixture 覆盖缺失值、终态、continuing/队列标志和隐私脱敏。只读 runner 已记录每个 Host step 的首 chunk、首文本、结束和 retry 时序；真实 provider dispatch 起点没有 Host 事件，因此请求尝试数明确标为 `step starts + 已启动 retries` 估算，不能冒充精确网络请求数。2026-10-07 已用真实 MiMo/Z Host 串行完成 3 轮生命周期验收，每轮 5/5 通过，覆盖两个独立会话并行及运行中排队追问；另有 1 次真实 MiMo 取消样本保留了 18/18 可见字符、形成 Host `aborted` 并在同会话恢复成功。另有受控 mock endpoint + 真实本地 Host 的取消用例：成功读取文件后挂起下一次 provider stream，再 Stop；验证 Host `aborted`、工具结果与可见文本保留、provider stream 关闭、无重放、busy 释放及同会话恢复。排队与停止同时竞态、真实工具仍运行中的取消仍待验证，详见验收记录。

详细逐次数据见 [acceptance-2026-10-06.md](acceptance-2026-10-06.md) 和 [agent-preset-live-ab-2026-10-06.md](agent-preset-live-ab-2026-10-06.md)。

## 阶段 1：建立可信的单 Agent 对照基线（P0）

**目的：先回答“慢在哪里、是否比 Host 原生路径多走了步骤”，再决定要不要改执行链。** 不以安装桌面应用或操作 GUI 作为前置条件。

1. 为本地 Host 与 TaskWeaver 包装路径提供同一套 headless runner；固定模型（MiMo V2.6 Flash）、推理档位、preset、权限、工作区快照、提示词及重试策略。DSH 基线通过对应本地 Host API/服务调用，不通过 Web UI；若无法保证相同路径，就把结果标为“非严格对照”。两端尽量连接同一个 Host 进程的独立新会话；做不到时，使用配置和构建哈希一致的 Host 实例，并明确报告口径。验证实际生效的 provider/model/reasoning/preset/权限，不只比较 UI 标签。
2. 冻结用例 A（准确路径单文件只读）、B（明确限定文件集的仓库入口概览）、C（运行中排队追问/取消及历史终态）和 F（计划原文中定义的单点小改动）。提示、正确性标准和工作区快照均固定；F 在临时副本中执行，绝不修改真实工作区。提示写入时记录哈希。
3. A、B、F 每个用例做 **5 个配对轮次**，TaskWeaver/Host 基线轮次交错执行、彼此不并发。报告每侧 P50、配对耗时差中位数、离散范围、有效样本数和失败数；失败、拒绝、取消与质量不合格单独保留，不可用重试样本替换原始失败。供应商瞬时错误最多重试一次，并记录首次失败。C 至少重复 3 轮；另用受控本地模型端点测队列/取消，不混入真实模型时延样本。
4. 每样本记录：模型/推理档/preset/权限、Runtime/Host/preset 哈希、工作区快照标识、首 Host 输出/首可见文本、完成耗时、模型请求数与逐请求首 chunk/结束时间、Host steps、顶层与嵌套工具计数及逐项耗时、排队/审批/取消延迟、重试/拒绝/失败、终态及预先定义的质量检查。并行请求按实际时间区间计算关键路径/重叠，不能把各请求时长相加称为墙钟耗时。供应商不提供内部排队数据时，只称请求往返耗时，不推断为模型纯推理时长。报告不含密钥、完整私有提示或敏感工具参数。
5. 修订 `scripts/run-parity-bench.mjs`：输入 schema 明确区分 read-smoke、生命周期/队列和 DAG 报告；缺失值显示“未采集”，不把 null/0 混为一谈；只读汇总白名单字段。当前 schema v2 已覆盖三类报告，有 privacy fixtures、一份真实 DAG、三份历史 lifecycle 失败报告和三份真实成功 lifecycle 报告回归。read-smoke runner 记录 Host step 首 chunk/首文本/step end/重试排程及启动；精确 provider dispatch 时刻在现有 Host 历史中不可得，故只报告 step starts + 已启动 retries 推算的尝试数，并明确标记为估算。生命周期成功排队/并发已有 3 轮真实样本，另有一次真实 MiMo 中断后同会话恢复样本；受控 queue/cancel 竞态仍待测，不能将 Runtime usage 的累计模型时间称为阶段墙钟时长。

**通过条件：**同配置可复现，报告可由原始 Host 历史重算；A/B/F 的 Host 路径差异可解释。±30% 时延/step 目标仅作为观察指标，先收集基线再决定是否作为发布门槛，不因单样本波动宣称对齐或退化。端到端差异应归因于完整客户端/wrapper 路径；同源 Host 的对照不能表述为 Host 性能差异。若两端送入模型的完整系统/上下文内容不同，应作为路径差异记录。

## 阶段 2：锁定默认单 Agent 路径与流式会话可靠性（P0）

1. 默认选择 Host `standard` 路径；按任务内部选择 preset，不暴露 DSH preset 菜单。准确文件路径优先直读，路径不明确时才做窄范围发现；只读消息和普通提问不追加无关长 prompt。
2. 普通消息逐字进入 Host（除用户主动引用文件/Skill/命令外）；只读任务不得被自动追加 build/test 要求。单测覆盖完整 `chat.send` 到 `user/message` 的文本、上下文和模式。
3. 默认单 Agent、显式 DAG 的门控继续由用户选择决定；补充 UI/IPC/后端一致性测试，确保切会话、排队、后台运行、追问不会把旧 conversationId 或投影写到当前会话，也不会清空前一轮输出。
4. 对模型/Agent 的重试设有限次数，分别记录 provider transient retry 与 Agent 修正 retry；相同输入/路径/查询循环用定点 guard，而非全局工具总数或时间上限。取消、超时和达到 retry cap 都必须形成明确终态并保留已生成文本/工具历史。
5. 修复/扩展 parity runner 后，用阶段 1 的相同样本做前后对照；不要在本阶段同时大规模拆分文件或更换模型路由，以便归因。

**通过条件：**重复运行无失联/空白丢历史；普通请求确实单 Agent；重试次数有上界；没有任务预算式截断；既有 Host 会话 preset 被准确展示。

## 阶段 3：Host 原生 Plan 与 Todo 投影接入（P1）

先按 Host 当前源码/API 做小型接口验证，再实现；不复制一套 TaskWeaver 本地状态来模拟 Host 状态。

1. 将 `/plan`、`/plan off` 作为 Host 原生命令透传，接入 Host `plan` projection；移除手工中文计划前缀/重复本地状态。Plan 状态是引导还是安全边界必须分清：如果 Host plan mode 本身仍允许写工具，只有在权限确实切换为只读并可恢复时，才能向用户承诺“计划期间不改文件”。
2. `exit_plan_mode` 继续复用已有审阅问题 UI；Approve 后按 Host 支持的协议退出计划并执行，Reject/修改则保持计划态。验证切会话后 plan 状态不会串线。
3. 完整贯通 Host `todos` projection：Host 快照序列化、类型定义、IPC store、当前会话 hook、TodoPanel UI；空 todos、清空、多个会话并发和历史恢复都要覆盖。不要误把 Host 内部 todo panel 当成桌面应用已完成。
4. Host 命令清单只开放已核实且适合 Composer 的命令；未知 slash 命令原样交 Host 或清晰提示，不静默吞掉。

**通过条件：**原生 projection 是单一事实来源；plan 审阅/恢复/会话切换与权限语义可测；todo 创建、更新、完成和重载 UI 与 Host 状态一致。

## 阶段 4：如实表达权限与项目上下文（P1）

1. 先审计 Host 实际 permission command/preset，按真实语义命名“只读 / 工作区可写 / 完全访问”。当前若 `ask` 与 `on-risk` 都映射到 `workspace-write`，不得再显示成两种不同保护等级；配置迁移要可逆且不得改用户数据目录。
2. Plan 临时只读必须经 Host 回传的 permission 状态确认；退出计划后恢复此前设置，失败时明确告警，不能 UI 先乐观显示成功。
3. 项目指令可见性（AGENTS/CLAUDE 等）只展示 Host 实际加载结果；若 Host 没有可用 projection，先补 Host 证据接口，不在前端另行扫描后假装是 Host 结果。
4. MCP 继续通过 Host 工具注册给主 Agent 和 DAG 子 Agent。新增回归：配置/密钥脱敏、服务发现、工具 schema 进入模型请求、成功/失败调用和子 Agent 权限边界。测试连接成功不得仅以 HTTP 200 判定，应识别 API 错误 payload。

**通过条件：**UI 表述与 Host 回报完全一致；MCP 可被模型实际调用，主 Agent 与子 Agent 都有测试证据；没有泄露凭据或扩大沙箱权限。

## 阶段 5：编辑审阅、Hooks 与命令体验（P2，逐项验收）

1. 每轮变更卡片复用 Git checkpoint/diff；不重造文件追踪。撤销前展示目标和影响，先在临时仓库覆盖未提交改动、删除/重命名和失败恢复。
2. Hooks 先判定上游 `@z/dsh-hooks-claude-code` 是否支持按会话/工作区配置。已知配置若是进程级，不采用“切工作区必须重启”的体验作为默认产品方案；可暂缓该项，或先实现隔离配置后再开。Stop hook 自动验证默认关闭；启用时只用与修改范围相关的轻量命令。
3. Slash 菜单把 Skill 与已确认可用的 Host 命令分组；Skill 启动仍直接由用户选择，不额外增加慢速的全量扫描步骤。

**通过条件：**diff 与 checkpoint 可追溯/可恢复；Hooks 不串工作区；MCP 与既有命令不回归。未满足配置隔离前，Hooks 阶段可延期而不阻塞核心 Agent。

## 阶段 6：显式 DAG 的质量与性能（P1，独立于默认单 Agent）

1. 先修 Planner/子任务范围：提供轻量路径索引（仅路径/大小/类型），分配精确文件范围、依赖与交付证据，避免用泛化 glob 代替计划。T1/T2 类链路任务须显式覆盖入口、IPC、服务和 Host 边界，并避免重复读取同一大文件。
2. 固定计划和真实 Planner 分成两种实验，不互相代替：
   - 固定计划需标为 `plannerMode=fixture`、`realPlanner=false`、Planner 模型请求数为 0；只验证调度、并发重叠、状态、隔离、取消和证据采集。若子 Agent/synthesis 用真模型，要明确写“固定计划 + 真实子 Agent/汇总”。
   - 真实 Planner 需标为 `plannerMode=live`、`realPlanner=true`，并以 Host 历史中的实际 Planner 模型请求、session/request 记录和输出为证据。只有配置字段而无请求证据不得算真实规划。
3. 为量化 DAG 并行收益，每个配对轮次让真实 Planner 只规划一次并冻结计划哈希，再从相同代码快照分别用并发度 1 的串行组和目标并行度组执行。两组保持子任务提示、模型、preset、thinking、权限、路由和工具策略一致；轮次次序交替/随机，使用独立新会话及工作区副本。模型路由是否省成本另设实验，不和调度器并发混为一个变量。每类 DAG 至少 5 个配对轮次。
4. 分别报告串行/并行 P50 总耗时、Planner、子任务、synthesis、首文本、逐模型请求首 chunk/结束时间、Host steps、顶层/嵌套工具数和耗时、并发区间/重叠、队列、重试、失败和取消。复放组归一化端到端耗时等额加入同一次 Planner 耗时，并单列子任务调度/执行数据，不能把复放称作两次独立实时规划。保存逐轮样本，失败/不完整不得从统计里抹去。
5. 为子 Agent 提供最小必要工具与 evidence contract。循环保护瞄准完全重复调用、同一无效路径/查询及明确失败循环；模型修正重试有明确上限。**不设 DAG 总工具数、token、成本或墙钟执行预算**，也不因性能目标强停任务。
6. 缩短最终汇总：传递结论、证据引用、未解决点，而不是整段长轨迹；仍保留用户可查看的完整子 Agent 记录。终态须检查 Host 工具历史、证据覆盖和未解决范围，不能只相信模型自称完成。
7. DAG UI 显示计划、子任务状态、运行 spinner、终态、调用计数/耗时和复核原因；取消/失败/后台运行不能被伪装为仍在执行或成功。该 UI 工作不代替后端正确性。

**通过条件：**只有 Goal/明确多智能体选择触发 DAG；串行/并行组依赖与终态正确且 Host 历史证明并行组实际发生 Agent turn 重叠；5 个配对轮次至少 4 轮并行组更快，P50 墙钟耗时比串行低至少 20%，且质量/证据不下降。该 20% 是预先登记的工程验收门槛，不代表统计显著性。未达到则报告为“并发已证实，端到端提速未证实”。真实 Planner 质量须另跑至少 5 次；只有真实 Planner 请求证据齐全、至少 4 次输出证据完整可用结果，才可声称规划验收通过。固定夹具通过不能代替真实 Planner 结论；90 秒只作观测目标，不作运行硬截止。

## 阶段 7：代码维护、Z 命名和发布/论文材料（P2）

1. 不把 App.tsx/styles.css 拆到“每个源文件小于 1500 行”当成目标。先用依赖图和改动频率划清组件边界，分批纯重构并保留行为测试；只拆能降低真实冲突/维护成本的部分。
2. 按兼容面推进自有代码的 DSH→Z 命名：TaskWeaver 自有 API/变量/测试/部署目录先统一；上游 `vendor/z-runtime` 包名、数据目录、环境变量涉及迁移，先做引用与许可证审计，保留旧值读取兼容和恢复路径，不全量机械替换。MCP 保持不变。
3. 增加 `TASKWEAVER_Z_RUNTIME_PATCHES.md`，登记 fork 的包、差异、上游 commit、许可证、测试和回合并方法；保留第三方归属说明。
4. CI/`npm run check` 只纳入稳定、可重复的 mock/单测；真实模型集成测试作为显式命令单独运行，不能让普通 CI 调用产生模型费用。
5. 发布步骤改为“生成独立测试 `.app` → 核对源码/deploy/app 的版本和 hash → Host/MCP/文件权限/队列冒烟 → 展示差异及风险 → 用户确认后再安装”。不提交、不推送、不覆盖已安装应用，除非用户另行授权。
6. 论文材料只使用可复现实验原始数据和明确限制；对比 TaskWeaver/Z Host 与 DSH Web 时标出 Host 版本、执行入口差异，避免将同一 Host 的差异误称底层模型速度或因果结论。

## 推荐顺序与停止条件

当前继续顺序：**阶段 1 基线 → 阶段 2 单 Agent/会话可靠性 → 阶段 3 Plan/Todo → 阶段 4 权限/MCP/上下文 → 阶段 6 DAG → 阶段 5 Hooks/审阅 → 阶段 7 维护发布与论文**。若阶段 1 证明主要耗时在模型服务生成，不再把 RPC/文件系统重构列为性能优化；若工具调用路径明显多于 Host 基线，优先针对具体多余 prompt、搜索或重试修正。

**2026-10-07 基线进展：**已完成一次同 Host 的 TaskWeaver `chat.send` 服务适配层 vs Host 原生 API 真实 MiMo 配对试跑，两侧均完成同一只读文件任务，路由/preset/权限/工作区和实际工具调用有 Host 原生记录；但 `n=1`，且不覆盖 `register-ipc` 完整 prompt pipeline，也不是 DSH Web 对照，因此只算 runner pilot，不能视为阶段 1 验收。工作区上限随后对 16/32/64 KiB 各完成三次交错真实 MiMo Agent 样本；基于同一任务覆盖相同、32 KiB 的调用/Token 中位数较低，当前暂用 32 KiB，但样本仅一个任务且耗时波动大，不能称为普遍最优。完整记录见 `docs/acceptance-2026-10-06.md` 与 `docs/修改与优化日志.md` OPT-2026-10-07-33。

**2026-10-07 只读子 Agent / DAG 进展：**同一真实 Planner 请求、MiMo Medium 的 5 轮中，5/5 两项 research 均完成；每轮两个 Host session 独立且实际加载 `taskweaver-readonly`，路由/工具历史校验通过，Host turn overlap 为 7.700–44.556 秒。同步强化了 DAG smoke：调用模型前核验只读 preset 源码/deploy SHA-256，完成后再按 Host session 元数据核对每个只读子任务的 preset。门禁开启后的真实复跑亦通过。该结果满足固定用例的实时 Planner 与并发执行功能验收，但耗时没有串行配对，不能声称 DAG 提速；详细报告见验收记录及 OPT-2026-10-07-31。阶段 1 的 DSH 同条件基线和阶段 6 的串行/并行配对门槛仍未通过。

每阶段只改一个主要变量，保留前后真实样本、Host 历史和回归测试。性能下降或证据不足就回退该阶段，不以提交/发布倒逼验收。时间估算不作为自动执行预算，也不限制 Agent 执行。
