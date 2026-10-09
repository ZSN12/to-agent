# 读取项目源码：真实 Agent 实测（2026-10-02）

## 方法与边界

- 直接调用 Z Host 和 TaskWeaver 聊天桥接，不操作桌面界面。
- 使用用户当前选定的 `xiaomi/mimo-v2.5-pro`，项目工作目录为本仓库。
- 每轮新建隔离会话和测试数据目录，不带入旧对话历史；只读预设不开放写入工具。
- 输入保持一致：“读一下当前毕设文件夹里的代码，简要说明这个项目做什么、主要模块怎么连接，并列出你实际读取的文件。只阅读，不要修改文件。”
- 原安装版与优化后的本地部署运行时分别测试，未覆盖 `/Applications/TaskWeaver.app`。
- 临时凭据文件不打印，测试结束后清理；最终测试脚本也清理复制的 settings 文件。

## 结果

| 版本 | 完成耗时 | 首段文字 | 工具调用 | 工具失败 |
| --- | --- | --- | --- | --- |
| 安装版基线 | 223 秒 | 43 秒 | 23 | 两次全目录 glob 超过 20MB 原始输出上限 |
| 搜索插件正确重编译后 | 117 秒 | 88 秒 | 15 | 无 |
| 加上简要概览探索指引 | 82 秒 | 10 秒 | 23 | 一次将目录误传给 read |

首段文字可能只是进度说明，不等于最终答案。每个版本只有一轮上述观测，模型决策、并行工具批次和服务时延会波动；不能把时间差解释为严格的算法加速比或速度保证。中途还发现一次“配置新、插件旧”的部署，所以该轮不作为搜索优化后的验收。

## 已验证并修复的缺陷

1. Z 原生工具结果包在 `tool-result.content` 内；旧桥接只读取外层，导致成功结果显示 0 字符、嵌套错误误判或仅显示泛化错误。现在展开已知包装并保留错误状态，错误摘要仍做凭据脱敏。
2. glob 默认忽略忽略规则并递归整个树，依赖和打包目录产生超大输出、挤占候选路径。TaskWeaver 预设现在默认排除依赖/构建目录，并对过量候选跨顶层采样；保留 `packages/runtime` 源码。需要调查依赖时可显式设置 `includeExcluded=true` 并缩小路径，直接 read 不受发现过滤影响。
3. 精简 Host 编译配置漏掉动态预设使用的搜索插件，导致 tsdown 打包旧 `lib/types`。现在显式编译该插件，并在部署测试中验证实际包的配置能力，防止“源码改了、产物没改”。
4. 简要概览增加按代表入口、局部行范围阅读的指引；这不是硬超时或全局工具次数限制，不禁止长任务和完整审计。

## 验证与复现

```sh
npm run build:z-runtime
node scripts/test-tool-trace.mjs
node scripts/test-dsh-chat-service.mjs
node scripts/test-z-host-deploy.mjs
node scripts/test-z-runtime-resolution.mjs
cd packages/runtime
./node_modules/.bin/vitest run packages/fs/tool-fs-search/tests
```

搜索测试 153 项通过，部署测试验证真实 Host、原生 MCP、只读工具与并发 DAG；应用构建和多会话/重连回归也通过。

在仓库根目录执行 `node scripts/run-agent-read-smoke.mjs --local` 可测试本地部署运行时；`--installed` 测试当前安装的运行时。两者都会实际请求所选模型，可能产生费用。脚本输出测试目录和最终 `report.json`，包含耗时、工具事件和最终答案。

## 2026-10-04 追测：长时间 thinking 与流空闲

使用 `opencodex/cursor/composer-2.5` 再次运行同一只读概览任务，并通过隔离副本同步应用实际使用的 `models.json` 配置（先移除副本中的明文 `apiKey`；不读写原配置）。

| 策略 | 总耗时 | 首段输出 | reasoning | 工具调用 | 结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| 原 profile：120 秒 idle、超时可重试 1 次 | 254 秒 | 2.8 秒 | 843 字符 | 0 | 两次流分别空闲超时，第二次重放后仍未完成 |
| 新 profile：60 秒 idle、TIMEOUT 不自动重放 | 68.6 秒 | 2.8 秒 | 616 字符 | 0 | 一次流空闲超时后明确失败，没有重复请求 |

Z 会话历史给出了 `TIMEOUT` 和 `pi-ai stream idle timeout`；不是上下文窗口耗尽，也不是工具在运行。`opencodex` provider 首先输出少量 thinking/text，随后长时间没有 SSE 活动。对应调整是把 TaskWeaver 自动同步 profile 的默认 idle timeout 从 120 秒降到 60 秒，并从默认自动重试码中移除 `TIMEOUT`，避免把整个已部分生成的请求再跑一遍。`models.json` 中显式配置的 timeout/retry policy 仍优先。部署 Host 的本地悬挂 SSE 测试还验证了实际只读 turn 超时后不重放。此举限制的是一次无活动等待，不是总任务时长；真正持续产出事件的长任务不受总时长上限约束。

其他接入探测：当前 `xiaomi/mimo-v2.5-pro` 返回 402 余额不足；`openai-codex` provider 在隔离 Host 目录中未启用，因此不能用来做这次对照。这些失败都发生在只读代码任务工具执行之前。

此外，追查到 TaskWeaver Host 精简构建引用此前漏掉 repeat-tool-reminder，导致普通增量构建保留旧 JS。已把该包加进 `tsconfig.host.taskweaver.json`，重建部署包并通过实际 Host 提醒测试；之后的常规 runtime build 现在能沿正确引用图编译它。

## 仍未解决

- Composer 2.5 的实际流在发出少量 thinking/text 后持续空闲，任务仍会失败；本次改动只消除了额外的 120 秒等待和自动重放，不能修复提供方本身的流停顿。
- 提示/提醒能劝模型少探索，但这是 advisory，不是强制调用限额；仍需在真实任务中观察是否减少无效工具调用。
- 仍有误用 read 读取目录的情况；本轮错误正确显示且自行恢复。
- 本实验没有验证旧会话恢复、追问排队或安装应用中原有会话的生命周期，不能据此宣称这些问题已经消失。

## 2026-10-04 追测：安装包、推理档位与对照条件

### 安装包上的真实模型请求

使用 `/Applications/TaskWeaver.app/Contents/Resources/taskweaver-z-runtime`，新建隔离 Host/会话，模型为 `opencodex/cursor/composer-2.5`：

| 请求 | 耗时 | reasoning | 首段文字 | 工具调用 | 终态 |
| --- | ---: | ---: | ---: | ---: | --- |
| 只读项目概览，用户配置的 high | 67.3 秒 | 467 字符 | 2.96 秒 | 0 | 60 秒流空闲 `TIMEOUT` |
| 只读 `package.json` 窄任务，临时覆盖为 low | 67.3 秒 | 376 字符 | 无 | 0 | 60 秒流空闲 `TIMEOUT` |

第二轮的 Host 历史确认请求实际使用 `reasoningEffort=low`，所以“只是 high 推理太慢”不足以解释停流。低档会话历史中，19 个真实 `assistant/chunk` 集中在首个 chunk 后 4.45 秒内，之后 60 秒没有模型 chunk，末尾记录 `TIMEOUT`；没有工具调用。这确认不是 UI 隐藏了持续到达的模型输出。两轮都在开始生成后停止，尚未调用工具。安装版报告分别保存在临时目录 `taskweaver-live-read-kMkt2C`、`taskweaver-live-read-Lz502k`（只含本次隔离会话；复制的设置与凭据文件已由脚本清除）。

该模型配置的 `baseUrl` 是本机 `http://127.0.0.1:10100/v1`，由 OpenCodex 本地服务提供；本次 `/healthz` 返回 HTTP 200、约 1.7ms。它只能证明本地服务在线，不能证明上游生成流正常。服务日志文件修改时间仍为 2026-09-30，未提供本次请求的可关联上游证据，因此**目前只能定位到“本地 OpenCodex 路由上的流停顿”，不能断言具体是代理还是其上游**。

### 与原生运行时的基线不等价

- 当前 TaskWeaver 模型 profile 对 Composer 2.5 设置的是 `high`；安装包在 `low` 覆盖下也复现停流。
- 本机原生 headless profile 默认配置是 `deepseek-official / deepseek-flash`，不是 Composer 2.5；直接运行很快以认证错误退出。因此它既没有复现用户截图里的成功任务，也不能作为同模型性能对照。
- 两边对照必须同时固定 provider、model、推理档位、任务文本和工具集；否则“原生更快”只说明配置/路径不同，不能归因到 Agent Runtime。

### 部署验收

本轮重新运行 `scripts/test-z-host-deploy.mjs`、`npm run test:task-profile`、`npm run test:orchestration` 均通过。部署测试用真实 Host + 本地可控 OpenAI-compatible SSE endpoint 验证只读请求只暴露 `read/glob/grep/skill/web` 等只读工具、不暴露 `write/edit/bash/run_code`，并验证两个独立只读 DAG 子任务同时到达模型端点（观测并发数为 2），依赖汇总任务等待两者完成。它证明本地部署与调度的并发语义，不证明真实第三方 provider 也会稳定并发生成。

### 2026-10-04 追测：完整只读并发 DAG 链路

为避免仅用 `executeDag` 单测代替端到端编排，本次将部署回归提升为调用生产 `createOrchestrationService.planAndExecute`：真实部署 Host 负责 Planner、两个独立 research 子会话、依赖 review 子会话和最终 synthesis；模型请求由测试内本地 SSE 端点确定性响应。验收观察到 T1/T2 两个主 Agent 请求在端点同时挂起后才被放行（并发数 2），T3 只在两项依赖结果都完成后发起；三个任务最终均为 `done`，各自拥有不同的 Host session，research/review 实际发给模型的工具表包含 `read` 且不包含 `write/edit/bash/run_code`。测试对 Runtime 自动生成的会话标题请求单独响应，不把标题副请求误计为 Agent 主请求。

这证明了 TaskWeaver 生产编排服务 → 只读预设 → Z Host → 模型协议端点这一链路在并发与依赖语义上的集成行为；模型端点是本地可控替身，因此不构成任何真实第三方模型路由可用性或生成质量的证明。

`scripts/run-agent-read-smoke.mjs` 新增了 `--thinking <level>` 与 `--text <prompt>`，只在测试进程内覆盖推理档位/任务文本，不改用户模型配置，可复现上面的窄范围 A/B。

### 2026-10-04 新鲜 A/B：纯文本可用，工具型请求在首个分片前停流

使用本地部署 Z Host 和同一模型 `opencodex/cursor/gemini-3-flash`，清除推理档位并把隔离 profile 的 idle timeout 临时设为 60 秒：

| 请求 | 结果 |
| --- | --- |
| 只回复 `READY`，不带文件操作要求 | 3.34 秒完成，首段正文 2.74 秒到达，1 个模型请求，turn 正常完成。 |
| 只读 `package.json` 并回答两个字段 | 60 秒 idle timeout；没有正文/可见 reasoning、没有 tool call。 |

两轮 Host 持久历史还显示，它们发出的工具目录完全相同：7 个工具，JSON schema 合计 4,723 字节。READY 请求有 5 个模型分片并正常结束；读文件请求只有 1 个无可见正文/思考的分片、0 次工具调用，随后以 `TIMEOUT` 结束。因此 Host 确实组装并发出了含文件工具的模型请求，但模型没有开始调用 `read`；此次失败不是读取工具执行变慢、schema 膨胀或读取窗口限额造成的。这个同路由纯文本/工具型 A/B 将故障边界收窄到“相同工具目录下，任务要求实际使用工具时”的 provider/gateway 流路径，仍不能只凭客户端证据区分本地 OpenCodex、上游服务或两者交互。

脚本默认选择的 `xiaomi/mimo-v2.5-pro` 本轮另行直接返回 `402 insufficient_balance`，未形成 Agent 请求，不能作为读取性能数据。测试命令为 `node scripts/run-agent-read-smoke.mjs --local --model opencodex/cursor/gemini-3-flash --thinking default --idle-timeout 60000 --text <prompt>`；凭据只在隔离进程中读取，原配置未修改。

### 120 秒复测与 idle 默认值校准

为确认停流是否只是 60 秒过短，用安装版 Host、同一个 OpenCodex Composer 2.5、`low` 推理档位和只读取 `package.json` 前 40 行的窄任务，临时将隔离配置的 idle timeout 提高到 120 秒。约 2 秒收到首段 thinking，随后 120 秒无新模型分片、无正文、无工具调用，最终仍以 `pi-ai stream idle timeout after 120000ms` 失败。因此延长等待没有解决该路由的停流，只延长了失败时间；没有证据表明是上下文窗口耗尽，也没有证据能将责任进一步归因到 OpenCodex 本地代理或其上游。

复核 Z Runtime 源码后发现，pi-ai 自身默认 `streamIdleTimeoutMs` 是 300,000 毫秒；TaskWeaver 的 profile 转换器此前在 provider 未显式设置时却注入了 60,000 毫秒，覆盖了运行时默认值。这是 TaskWeaver 适配层与所借用运行时之间的行为偏差。现已将转换器的缺省值恢复为 300,000 毫秒，显式 provider timeout 仍优先；默认自动重试码不包含 `TIMEOUT`，避免默认情况下重放已部分生成的计费请求。部署测试断言了新默认值及显式覆盖行为，并用悬挂 SSE 验证超时只发出一次模型请求。

### 2026-10-06 重试次数安全边界

后续复核发现，Z Runtime 还支持 `mode: always`，会对模型请求失败无限重试；此前 profile 转换器会原样透传显式策略。现已在 TaskWeaver 嵌入 Host 的重试执行器中收紧：`always` 改为最多重试 1 次，普通模型请求最多重试 3 次，`TIMEOUT` 不自动重放。上下文溢出恢复最多重试 1 次；压缩摘要因仍高于阈值而追加的模型尝试也最多 1 次。子任务升级重试独立计数（默认 1 次，硬上限 3 次）。这些仅是失败恢复/模型重试的上限，不限制整项任务的工具调用、运行时长或总预算；普通 DSH Host 的 provider 重试配置不受 TaskWeaver 收紧影响。

这项修正让持续推理但暂时没有 SSE 活动的任务不再被 TaskWeaver 额外的 60 秒上限提前打断；它不代表 Composer 2.5 停流已修复。120 秒复测是隔离副本的覆盖实验，并未等待当前应用配置的完整 300 秒；后续仍需用同一路由完成一轮 300 秒上限的真实观察，或取得代理/上游对应请求日志，才能进一步定位提供方流停顿。

## 2026-10-04 追测：跨模型、工具请求与推理档位

| 安装版 Host / route | 请求 | 推理设置 | 结果 |
| --- | --- | --- | --- |
| `opencodex/cursor/gpt-5.4-mini` | 只读 `package.json` 窄任务 | `low` | 约 3 秒有正文分片，随后无新分片或工具调用；300 秒后 `TIMEOUT`。Host 历史终态时间约 300.0 秒，确认为 idle timeout，而非桥接漏收正常 `turn/end`。 |
| `opencodex/cursor/gemini-3-flash` | 只回复 `READY`，不要求读文件 | 清除推理档位 | 约 3.4 秒完成。修复后保留用户原 profile 的同一短请求约 3.2 秒完成。 |
| `opencodex/cursor/gemini-3-flash` | 只读 `package.json` 并报告 scripts 数量 | 清除推理档位 | 60 秒内没有 Host 可见的模型分片或工具调用，最终 idle timeout。 |
| `custom-gateway/default` | 短回复 | 隔离设置 | 隔离 Host 未取得该 provider 授权，任务未发出；不作为模型性能结果。 |

OpenCodex `usage.jsonl` 中，gpt-5.4-mini 主任务的记录为约 307.5 秒后 HTTP 502 / `incomplete`，与 Host 300 秒取消相符；同一时间窗内约 3.45 秒的 HTTP 200 是另一条短请求，不能拿它证明主任务完成。Gemini 的工具型请求也在 Host idle timeout 后留下 incomplete 记录，而同路由的短回复正常完成。当前证据表明停顿与这条 OpenCodex 路由上的工具型长请求有关，但不足以断言是请求工具格式、模型工具调用、代理还是上游哪一层；已通过本地 mock endpoint 验证 Z Host 本身能完成 OpenAI-compatible tool-call → 只读工具 → 最终答案循环。

真实对照还发现：用户全局 `medium` 推理偏好会被传给声明 `reasoning:false` 的模型，Gemini 在模型选择时明确报“不支持 reasoning effort medium”。桥接现已读取 Host 模型目录中的 `reasoning.efforts/defaultEffort`：不支持推理的模型不传 effort；支持推理但不支持用户所选档位时，回退到模型声明的默认档位。`test-dsh-chat-service.mjs` 覆盖两种情形，模型目录测试也断言 effort 元数据；安装版 Host + 原 profile 的 Gemini 短回复约 3.2 秒完成。此修复只处理能力不匹配，不会解决上表中的工具型流停顿。

`run-agent-read-smoke.mjs` 现在允许 `--thinking default`，用于临时清除 smoke 进程中的推理偏好，不改用户模型设置；隔离实验仍支持 `--idle-timeout` 覆盖。

### 2026-10-04 直连 OpenCodex 协议探针

为区分 Host/pi-ai 与本地代理，在不经过 Z Host 的情况下，使用当前已配置的 OpenCodex 本地地址做了小请求（凭据只在进程内读取，输出不含密钥或正文，单次最多 64 个输出 token，15 秒主动截止）：

- 同一路由 `cursor/gemini-3-flash`、无工具的 `READY` 短回复：HTTP 200，约 3.1 秒收到 3 个 SSE 数据事件，正常以 `finish_reason=stop` 和 `[DONE]` 结束。
- 同一路由、带标准 `read` function tool 的工具型请求：HTTP 200，但 15 秒内没有 SSE 数据事件；探针主动取消。
- `cursor/gpt-5.4-mini` 带相同 function schema 且要求必须调用工具：HTTP 200，但 15 秒内同样没有 SSE 数据事件；探针主动取消。使用 `tool_choice=auto` 的短请求则有 SSE 并正常 `stop`，但模型选择了文本回答，没有产生工具调用，因此不算工具调用通过。

这组绕过 Z Host/pi-ai 的 A/B 明确证明：至少 Gemini 路由的“工具型请求无 SSE”可以在本地 OpenCodex API 层复现；TaskWeaver UI/桥接没有机会吞掉一个本来已到达的工具分片。它还不能证明是 OpenCodex 自身、下游模型服务还是工具路由策略的具体缺陷；需要 OpenCodex 侧提供请求级上游日志或修复后重测。Z Host 本地 mock 的工具调用循环仍通过，故当前高优先级阻塞点在真实 provider/gateway 工具调用路径。

### 2026-10-04 修复：DAG 子会话沿用 Planner lineage

真实部署 DAG 的请求记录里，除 Planner、三个子任务和 synthesis 主请求外，每个新子会话还可能触发一次 `session-title-first-prompt-llm` 标题请求。运行时的自动首轮标题策略只针对根 session；TaskWeaver 虽然把 DAG 子任务作为独立 Agent 执行，却没有把它们标记为 Planner 的子会话，因此白白增加模型请求和等待。

现为 `session.create` 增加可选 `parentSessionId`，只在新建时持久化为普通会话 lineage；恢复既有 session 时不会改写它，也不授予受管 subagent 的工具/所有权语义。TaskWeaver 的 DAG 子任务、升级重试会话及 synthesis 都使用 Planner session 作为父会话。Z Host 部署端到端测试现在同时检查两个只读任务确实在模型端点并发、只读工具预设仍生效、Host `session.list` 暴露持久化 lineage，并断言三个 DAG 子任务没有发起自动标题请求。

验证：`npm run build:z-runtime` 成功；`node scripts/test-z-host-deploy.mjs` 成功；Host API `rpc-schemas.spec.ts` 与 `api-proxy-agent-preset.spec.ts` 共 71 项通过；`npm run test:orchestration`、`npm run test:dsh-chat` 及完整 `npm run test:z-host-deploy` 生命周期套件通过。这是本地确定性 SSE 模型端点上的运行时/编排验收，不代表已重打包或安装桌面应用，也不证明真实第三方路由的吞吐。

### 2026-10-04 优化：TaskWeaver 文件读取窗口

源码核对发现，Z Runtime 的 `tool-fs` 默认允许一次 `read` 返回最多 2,000 行和 50 KiB；工具结果会进入会话历史并随后续轮次再次提供给模型。TaskWeaver 的长文件提示虽然要求分段读取，但预设没有覆盖这个通用默认值。现在仅把 TaskWeaver 使用的 `code`、`taskweaver-code` 和 `taskweaver-readonly` 预设单次默认/最大读取行数设为 600，通用 Runtime 默认与 50 KiB 字节上限不变；仍可通过 `offset` 分段继续读取。

验证：重建并部署 Z Runtime 后，真实 Host 加本地可控 SSE 模型端点读取 1,000 行夹具文件，结果精确为第 1–600 行，且未包含第 601 行；只读预设的实际模型 schema 也公布 `Defaults to 600.`。`tool-fs` 底层工具测试 75 项通过，部署集成测试与 `git diff --check` 通过。这验证了窗口上限确实执行，但还没有量化真实模型上的 token/耗时收益，也不意味着已重打包或安装桌面应用。

### 2026-10-04 真实 Agent 跨 Runtime / 模型复测

用隔离会话、已安装应用 Runtime 与本地构建 Runtime 分别执行只读 `package.json` 问题，不改项目文件：

| Runtime / 模型 | 任务 | 结果 |
| --- | --- | --- |
| 本地构建 / `opencodex/cursor/gemini-3-flash` | 只回复 `READY` | 3.4 秒完成，首段正文约 2.8 秒。 |
| 本地构建 / 同模型 | 读取 `package.json` 并回答项目名与 build 命令 | 60 秒无正文、reasoning 或工具调用，`pi-ai stream idle timeout`。 |
| 当前安装版 / 同模型 | 同一读取任务 | 同样 60 秒无正文、reasoning 或工具调用后超时。 |
| 当前安装版 / `opencodex/cursor/gemini-3.5-flash` | 同一读取任务 | 同样 60 秒无输出或工具调用后超时。 |
| 当前安装版 / `xiaomi/mimo-v2.5-pro` | 同一读取任务 | Provider 立即返回 HTTP 402 `insufficient_balance`；未进入模型生成或工具执行。 |

这说明纯文本路径可用与 Agent 工具路径不可用在当前 OpenCodex 账户下并存；跨安装/本地 Runtime 和两个 Gemini 型号复现，且工具事件为零。不能据此判定 Gemini 服务自身、OpenCodex 本地代理或上游哪一方有缺陷；此前绕过 Host 的协议探针已在 OpenCodex API 层复现“带 function tool 无 SSE”，下一步需用成功的模型额度重测或取得网关请求级日志。

同时修正自定义网关能力验证：原“测试连接”在 `/models` 返回 200 时直接报成功，没有生成文本，更没有测试 tools。现在它要求完成一次短文本生成；新增“测试工具调用”，通过 `tool_choice=required` 请求一个不会被执行的无副作用测试函数，并分别支持 Chat Completions / Responses。`scripts/test-custom-provider.mjs` 覆盖正常生成、两类接口工具调用，以及 HTTP 200 但未返回工具调用的反例。

验证：`npm run test:custom-provider`、`node scripts/test-probe-models.mjs`、`npm run test:models`、完整 `npm run test:z-host-deploy`、`npm run build`、Electron 主进程/预加载语法检查及 `git diff --check` 均通过。MiMo 的 402 属于账户额度阻塞，不是 Agent Runtime 能力测试。

### MiMo v2.6 Flash 已安装版真实任务 A/B（2026-10-04）

用户指出可用型号为 MiMo v2.6 Flash 后，改用 `xiaomi/mimo-v2.6-flash` 在当前安装版 Runtime 新建隔离会话执行，不修改项目文件或全局档位：

| 任务 | 推理档位 | 总耗时 | 首段文字 | 工具调用 | 结果 |
| --- | --- | ---: | ---: | ---: | --- |
| 读取 `package.json`，回答项目名与 build 命令 | 模型默认 | 6.8 秒 | 6.0 秒 | 1 次 `read` | 正确完成。 |
| 追踪 `testCustomProviderToolCall` 的前端→preload→IPC→服务调用链 | 模型默认 | 74.4 秒 | 56.9 秒 | 9 次 | 正确完成；中途分段读取同一服务文件两次。 |
| 同一调用链追踪任务 | 临时 `low` | 35.5 秒 | 16.5 秒 | 7 次 | 正确完成；结论与默认档一致。 |

此单组 A/B 显示该窄范围代码追踪任务在 `low` 下更快、工具调用更少，结果正确；不构成普遍质量/延迟统计，也未改变用户的模型或全局推理档位。默认档读代码任务仍可完成，之前 OpenCodex 的工具型请求停流结论不适用于 MiMo v2.6 Flash。

### 2026-10-04 回归清理与全量测试

首次 `npm run test:all` 在 `test:workspace-trust` 失败：脚本仍导入已不存在的 `electron/agent/taskweaver-resources.mjs`。继续检查还发现 Skill 测试断言了过时的 `DSH` 展示标签，而 `test:credentials` 指向的 `scripts/test-credential-store.mjs` 缺失。按当前代码边界修正了这些回归：工作区信任测试只验证现存的持久化服务（项目 Skill 信任隔离仍由 Skill service 测试覆盖）；Skill 展示标签改断言为 `Z`；补充凭据存储测试，覆盖加密落盘、并发更新不丢数据、provider 隔离、文件权限和系统安全存储不可用时 fail-closed。

修正后 `npm run test:all` 从头到尾退出码 0。覆盖已部署 Z Host 的并发 DAG、队列/取消/失败与 mux 恢复、模型目录、工作区上下文/信任、编排、Skill、凭据、MCP、用量持久化及 25 项多会话/权限集成测试。另有单独的 MiMo v2.6 Flash 安装版真实请求记录如上。该结果只证明当前源码与本机本地 Runtime 测试通过；没有重打包或安装新的桌面应用。
