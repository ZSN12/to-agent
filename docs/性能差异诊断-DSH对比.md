# TaskWeaver 与 DSH 行为差异诊断报告

> 诊断对象：`/Users/zsn/Documents/毕设`（TaskWeaver）vs `dsh-source` / `vendor/taskweaver-z-runtime`（DSH）
> 诊断方法：源码对照 + 实测 DSH Host RPC 延迟 + 解析你本机真实会话事件日志
> 日期：2026-09-29

---

## 0. 结论速览

**是的，逻辑和 DSH 不一样，而且差异集中在「每轮对话送给模型的东西」和「每帧事件送回渲染层的方式」两处。**
不是 DSH 内部被改慢了——DSH Host 本体（`vendor/taskweaver-z-runtime`）表现正常，实测 RPC 都是毫秒级。
慢的是 TaskWeaver 在 Host **外面**套的那一层：它在每次提问前后额外改写 prompt、注入历史。

| # | 差异 | 对速度的影响 | 证据强度 |
|---|------|-------------|---------|
| 1 | 首轮把 61KB 旧 UI 历史当**用户消息**塞进 DSH 会话 | 该会话此后每轮输入都带这 ~2 万 token | 真实日志实测 |
| 2 | 给**每条**用户消息追加"必须跑 `pnpm run build` 自测"等指令 | 把"你好"变成工程任务，触发 19~20 步长链 | 真实日志实测 |
| 3 | 推理档位被固化成全局配置项（**DSH 也有档位，且默认同为 `high`**） | 每个 step 的思考时间被拉长，而一轮有 19~20 个 step | 真实请求头 + 探针实测（**已修正，见差异 3**） |
| 4 | 会话中途模型在 `composer-2.5` ↔ `mimo-v2.6-flash` 之间来回跳 | 每次换模型丢失上游 prompt cache | 真实请求头（**需你确认是否手动切的，见差异 4**） |
| 5 | 每帧事件做「整份快照序列化 + IPC」，且无节流 | 长回答时 O(n²) 的 IPC 与 Markdown 重解析 | 源码 + 事件计数 |
| 6 | 走本地 OpenCodex 代理（`127.0.0.1:10100`），出现 LLM 重试 | 单次失败等了 5 分 34 秒才重试 | 真实日志实测 |
| 7 | 每轮对话前 7~9 次多余 RPC 预检，模型目录无缓存 | **实测仅 ~12ms，不是瓶颈** | 实测排除 |

---

## 1. 实测数据

### 1.1 DSH Host RPC 延迟（实测，可复现）

用 `vendor/taskweaver-z-runtime` 直接拉起 Host 测量：

```
Host 启动耗时: 4673 ms

host.describe          中位  1.7 ms
llm.providers          中位  1.6 ms
llm.models             中位  1.0 ms
settings.describe      中位  1.5 ms
模型目录三元组(并行)    中位  2.9 ms
sessions.create(新会话) 中位  6.7 ms
sessions.create(恢复)   中位  0.8 ms
sessions.models        中位  0.8 ms
```

TaskWeaver 每轮 `chat:send` 在真正 `prompt` 之前的固定往返合计 **≈ 11.6 ms**。

> 结论：**额外 RPC 往返不是慢的原因**。这部分可以不管。
> 唯一值得记的是 Host 启动要 4.7s —— `hostManager.restart()`（换自定义 provider 时会触发）每次约 5 秒。

### 1.2 你本机真实会话（`tw-c5a494d2-…`，2026-09-29 12:05–12:16）

```
Turn  1  总耗时   10.91s   首块延迟    8.84s   分片事件    10   step  1   工具  0   completed
Turn  2  总耗时    6.30s   首块延迟    4.57s   分片事件    10   step  1   工具  0   completed
Turn  3  总耗时  184.49s   首块延迟    3.08s   分片事件   663   step 19   工具 18   aborted
Turn  4  总耗时   25.70s   首块延迟    9.49s   分片事件    72   step  1   工具  0   interrupted
Turn  5  总耗时   19.52s   首块延迟   16.98s   分片事件     9   step  1   工具  0   completed
Turn  6  总耗时  345.98s   首块延迟    7.55s   分片事件   973   step 20   工具 19   interrupted
Turn  7  总耗时  700.91s   首块延迟   22.07s   分片事件    29   step  1   工具  0   aborted
```

- 7 轮累计 **1293.8 秒**，单轮最长 **700.91 秒**
- 分片事件总数 **1766**（平均 252/轮）
- 工具耗时本身极短（最长 1.72s），**时间几乎全花在 LLM 往返上**

---

## 2. 逐项差异详解

### 差异 1：首轮注入 61KB「旧 UI 历史」——DSH 完全没有这个机制

**真实证据**（会话日志第一条用户消息，长度 **60,938 字符**）：

```
<<<TASKWEAVER_LEGACY_HISTORY_CONTEXT>>>

【历史上下文 — TaskWeaver 线程存档，仅供模型理解背景】

[用户 @ 23:32] 你好
[编排器 @ 23:32] 你好！有什么我可以帮你的吗？
…（省略 6 万字，末尾甚至夹带了一段 Node 栈追踪）
[用户 @ 10:29] 你好

【系统说明：以上为 TaskWeaver 旧版 UI 存档的历史对话摘要，不是 DSH 原生会话事件，也不代表已执行的工具调用。】
请静默吸收上述上下文；本条仅为一次性迁移注入，不要基于其发起工具调用或长回复。

<<<END_TASKWEAVER_LEGACY_HISTORY_CONTEXT>>>
```

**代码位置**：`dsh-chat-service.mjs` 的 `formatLegacyHistoryContext()` / `LEGACY_CONTEXT_BEGIN`。
（注意：这段逻辑存在于**已安装的打包版**里，见第 4 节。）

**为什么这很致命**：它是以 **user message** 的形式写进 DSH 会话日志的。
DSH 的会话日志**就是**对话上下文，所以这条 6 万字消息在**该会话之后每一轮请求里都会被重新发送**，
每轮凭空多出约 1.5~2 万输入 token 的 prefill。

DSH 本身不需要这个机制——它的 session 事件日志天然就是历史，不存在"把 UI 存档再喂回去"的步骤。
**这是 TaskWeaver 独有、且代价最大的一处逻辑差异。**

---

### 差异 2：每条用户消息都被改写成「工程任务」

**真实证据**——你在 12:29 输入的是"你好"，实际发给模型的是：

```
你好

> [!IMPORTANT]
> **自主闭环要求**：完成上述代码修改后，你必须调用 `bash` 工具运行工作区验证命令 `pnpm run build` 自测。
> 若验证失败，请根据错误日志自行修正；验证通过后，请在最终回复末尾附带自检结果总结。
```

"读下最新的代码" 被改写成：

```
读下最新的代码

> [!IMPORTANT]
> **自主闭环要求**：…运行工作区验证命令 `pnpm run build` 自测…
```

（只有 "看看现在的代码呢" 这类被识别成 READ_ONLY 的，才换成一句 `[!NOTE]` 说明。）

**代码路径**：
- `register-ipc.mjs:1042` → `analyzeUserIntent(text, workMode)`
- `register-ipc.mjs:1043` → `detectVerificationCommands(cachedWorkspace)` → 检出 `pnpm run build`
- `user-intent.mjs:70 injectIntentGuidelines()` 拼接指令
- `verification-policy.mjs:8` 从 `package.json` 的 `scripts.build` 推导命令

**两个问题**：

1. **意图判定默认落到 CODE_MUTATION**。`analyzeUserIntent` 只有在命中只读句式或修改动词时才分流；
   "你好"、"读下最新的代码" 都不匹配任何规则，最后落到 `return USER_INTENTS.CODE_MUTATION`。
   于是**闲聊也被当成改代码**，被要求跑构建。
2. **推导出的命令是最重的一个**。`package.json` 里 `"build": "node scripts/verify-index-html.mjs && tsc -b && vite build"`，
   在 2 万文件的仓库上跑一次是分钟级。模型被"必须自测"约束住，就倾向于真的去跑、或者在长链里反复验证。

这解释了 turn 3（19 step / 18 工具）和 turn 6（20 step / 19 工具）为什么那么长。
**在 DSH 里，"你好" 就是 "你好"，不会有后半段。**

---

### 差异 3：推理档位被固化成全局配置（DSH 是「会话里可选 + 有默认」）

> ⚠️ **本节已修正。** 初版写的是「DSH 客户端不主动覆盖推理档位，走模型自身默认」——这是错的。
> DSH **有**推理等级（`reasoningEffort`），而且**你这台机器的 DSH 默认就是 `high`**。

**真实请求头**（会话日志 `request/header`）：

```json
{"provider":"opencodex","model":"cursor/composer-2.5","reasoningEffort":"high","maxTokens":32000}
{"provider":"xiaomi","model":"mimo-v2.6-flash","reasoningEffort":"high"}
```

**DSH 的推理等级机制**（`scripts/diagnose/tw-reasoning-probe.mjs` 实测，读的是你真实 `settings.yaml`）：

| 层次 | 位置 | 你这台机器的实际值 |
|------|------|-------------------|
| 全局默认 | `settings.yaml` → `agent-default-model` | `{provider: opencodex, model: cursor/composer-2.5, reasoningEffort: high}` |
| 模型可选档位 | 各 provider 的 `models[].reasoningEfforts` | 例：`cursor/composer-2.5` → `[off, low, medium, high, xhigh]` |
| 适配器默认档 | Host 计算出的 `model.reasoning.defaultEffort` | `deepseek-v4-flash` → `high`；`cursor/*` 多为 `undefined` |
| 界面入口 | DSH 模型选择器第二行「**推理等级**」（`menu.effort`，`/model` 弹窗） | 有，可选，含一个「Default」项 |

会话内 `current` 的解析优先级（`apiproxy/lib/index.js:1693 selectionFor()`，**每次读都重算**）：

```
本次进程内的选择(selectModel) → 会话日志里最后一次 request/header.config → 全局默认 agent-default-model
```

所以 DSH 不是「不覆盖档位」，而是**档位是一个用户可见、可改、有默认值的会话级选择**；
`selectModel` 不带 `reasoningEffort` 时，Host 会用 `defaultEffort` 自己解析出一个值（实测 `deepseek-v4-flash` → `high`）。

**代码路径（TaskWeaver 侧）**：
- `taskweaver-model-profiles.json` → `"thinkingLevel": "high"`（全局），且 `opencodex/cursor/composer-2.5` 单独又设了 `"high"`
- `dsh-chat-service.mjs:745` → `profileStore.getThinkingLevel(modelKey)`
- `dsh-chat-service.mjs:671` → `ensureSessionModelSelection` 把它作为 `reasoningEffort` 参与「是否需要 `selectModel`」的判断

**结论修正**：TaskWeaver 的 `high` **和 DSH 的默认是一致的**，所以
「TaskWeaver 强制高、DSH 走低」这个说法不成立。差异只在**表达方式**：
DSH 把它做成 UI 里可改的会话选择，TaskWeaver 把它做成配置文件里的全局项。

因此「降到 `medium`」不再是一条「对齐 DSH」的修复，而是一个**纯粹的提速取舍**：
一轮 agentic 任务有 19~20 个 step，每个 step 都按 `high` 跑，乘上去很可观；
要不要降取决于你对质量的容忍度。**这一条我没有动，留给你决定。**


---

### 差异 4：会话中途模型来回跳（需要你确认是不是你手动切的）

> ⚠️ **本节已修正。** 初版说「`reason` 出现 `change`/`resume` 交替就说明 `selectModel` 被反复调用」——
> 这个推断**不成立**，见下面 `reason` 的真实语义。

**真实证据**——同一个会话内 7 条 `request/header`（`scripts/diagnose/tw-headers.mjs`）：

| # | reason | provider / model | reasoningEffort |
|---|--------|------------------|-----------------|
| 1 | `initial` | opencodex / cursor/composer-2.5 | high |
| 2 | `change` | xiaomi / mimo-v2.6-flash | high |
| 3 | `resume` | xiaomi / mimo-v2.6-flash | high |
| 4 | `resume` | **opencodex** / cursor/composer-2.5 | high |
| 5 | `change` | xiaomi / mimo-v2.6-flash | high |
| 6 | `resume` | **opencodex** / cursor/composer-2.5 | high |
| 7 | `resume` | opencodex / cursor/composer-2.5 | high |

**`reason` 的真实语义**（`core/session/lib/types/types.d.ts:210-216`）：

- `initial` — 日志里的**第一条** header（新会话）
- `resume` — **一个 loop 实例的首次请求，且日志里已经有 header 事件**（进程重启、fork 播种）
- `change` — 后续某个请求用了**不同的** header

关键推论：**header 只在「变了」或「新 loop 实例」时才追加**。所以
「每轮都调 `selectModel` 但传的值完全一样」在这种情况下**根本不会留下额外 header**，
无法用 header 数量反推 `selectModel` 的调用次数。初版据此下的结论是我推错了。

**修正后的结论**：

1. 这里能看到的确凿事实是 **provider/model 在 `composer-2.5` ↔ `mimo-v2.6-flash` 之间来回跳**，
   而 `reasoningEffort` **始终是 `high`**。每次换模型都会让上游 prompt cache 失效。
2. 这大概率是**你在 UI 里来回切模型**（`taskweaver-model-profiles.json` 的 `activeModelKey` 现在是
   `xiaomi/mimo-v2.6-flash`）。请你确认一下——**如果这不对应你的手动操作，那才是 bug**，我再去查。
3. 顺带排除：`chat-model-resolver` 的用例名就是「primary model only, no single-agent auto route」，
   单智能体路径不会自动换模型。

**仍然值得修的**（`dsh-chat-service.mjs:660 sessionModelMatches()`，已修）：比较口径过严会**每轮**触发 `selectModel`。
真实触发场景是「TaskWeaver 的档位 ≠ DSH 已解析的档位」，例如：

- 未设 `thinkingLevel`（`explicitReasoningEffort` 为 `null`）而 DSH 回读到 `high` → 旧口径每轮判不匹配；
- 你把某个模型的档位调成 `medium` 而 DSH 侧仍是 `high` → 每轮判不匹配。

修法见第 7 节。**注意：在你当前这份配置下（两边都是 `high`），这条不会命中**，所以它不是本次慢的主因。


---

### 差异 5：流式链路「每帧整份快照 + IPC」，且完全没有节流

**DSH 的做法**：投影在客户端本地算，`SessionManager` → `Session` → 通知器按 **microtask/RAF 合并**，
`getSnapshot()` 带缓存、脏了才重建，React 用 `useSyncExternalStore` 订阅。**零 IPC。**

**TaskWeaver 的做法**（`z-conversation-hub.mjs`）：

```js
async handleMuxEnvelope(envelope) {
  const mgr = await ensureManager()
  mgr.handleMuxEnvelope(envelope)
  for (const [conversationId, entry] of attachments) {
    if (entry.sessionId === envelope.payload.sessionId) publish(conversationId)  // ← 每帧
  }
}
```

`publish()` 每次都做 `session.getSnapshot()` → `serializeDshConversationView()`（**含到当前为止的全部文本**）
→ `webContents.send('chat:dshView', view)`。
并且 `attachSession` 里还挂了一次 `session.subscribe(() => publish(...))`，所以**每帧至少序列化 1~2 次**。

更糟的是三条链路同时在跑：

| 通道 | 内容 | 问题 |
|------|------|------|
| `chat:dshView` | 整份快照，`streamingText` = 累计全文 | 每帧一次，O(n²) 字节 |
| `chat:stream` | `{type:'delta', delta, full: turn.text}` | **也带累计全文**（`dsh-chat-service.mjs:366`） |
| `chat:mux` | 原始帧，塞进 800 帧环形缓冲 | 仅内存，但仍在 IPC 上 |

渲染层再放大一次：
- `AgentMessageMarkdown.tsx` **没有 `React.memo`**，每次渲染都对**整段增长中的文本**跑 `ReactMarkdown + remarkGfm`
- `App.tsx:3785` 的 `useEffect` 依赖 `[messages, streamText, sending, toolTraces]`，每次 set 都 `el.scrollTop = el.scrollHeight` → 强制重排

**实测规模**：该会话 1766 个分片事件；turn 6 单轮 **973** 个。
按平均文本长度估算，turn 6 光 `chat:dshView` 就搬运了**数 MB** 的重复全文，Markdown 也被重解析了近千次。

> 这不会让"模型变慢"，但会让**你感知到的回答变慢**（界面卡、字出得一顿一顿、风扇起飞）。
> 这也是与 DSH 体验差距最直观的一处。

---

### 差异 6：模型路线走本地 OpenCodex 代理，出现重试

**真实证据**：

```
04:10:47.257  llm/retry          provider=opencodex  policy=[EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT]
04:10:47.723  llm/retry-started  retry=1
04:16:21.194  llm/retry          ← 第一次尝试等了 5 分 34 秒
04:16:22.259  llm/retry-started  retry=2
```

`dsh/settings.yaml` 里配置的提供方：

| provider | baseURL |
|----------|---------|
| `opencodex` | `http://127.0.0.1:10100/v1`（本地 OpenCodex 网关） |
| `custom-gateway` | `https://yyapis.com/v1` |
| `xiaomi` | — |

`agent-default-model` 是 `opencodex / cursor/composer-2.5 / reasoningEffort: high`。

**这一条严格说不是"TaskWeaver 逻辑"问题，而是配置问题**：你在 TaskWeaver 里把请求导向了本地代理 +
第三方网关，而你在 DSH 里测同一个问题时大概用的是另一条更直的链路。
turn 7 的 700 秒里，有 **5 分 34 秒**纯粹是在等一个注定失败的上游响应。

**建议**：做性能对比实验时，先在两边锁定**同一个 provider + 同一个 model + 同一个 reasoningEffort**，
否则测出来的差异没法归因。

---

### 差异 7：每轮多余的模型目录预检（已实测排除）

`dsh-chat-service.mjs` 每轮 `chat:send` 会串行做：

```
sessions.create（恢复已存在会话）        0.8 ms
api.llm.providers（configureModel 内）   1.6 ms
getDshModelConfig → 目录三元组           4.2 ms
listProvidersAuth → 目录三元组（再来一遍）4.2 ms
sessions.models                          0.8 ms
─────────────────────────────────────────────
合计（不含 /permission 与真实 prompt）   11.6 ms
```

问题在于 `model-service.mjs` 的 `getDshModelDirectory()` **完全没有缓存**：

```js
async function getDshModelDirectory() {
  // 每次都真实打 3 个 Host 请求：llm.providers + llm.models + settings.describe
}
```

`configureModel()` 一次要调 `getDshModelConfig()` + `listProvidersAuth()`，等于**同一次 send 内把目录读两遍**。

**实测证明它不是瓶颈（12ms）**，但仍是明显的浪费，而且 DSH 客户端是缓存模型目录的。
建议加一层 TTL 缓存（例如 30s 或按需失效）。

---

### 差异 8：多智能体编排是潜在的成倍放大器

`orchestration-policy.mjs:20 decideExecutionMode()` 在满足条件时会切到多智能体，
`orchestration-service.mjs:182 planAndExecute()` 的执行链是：

```
1 次 Planner 调用（失败再重试 1 次）
  + N 个子任务调用（各自 selectModelForTask 分配模型）
  + 1 次 synthesize 汇总调用
  + modelService.listCatalog()（又 3 次 Host 请求 + liveDiscovery）
```

本次会话没有触发（日志里 0 条编排事件），但**一旦触发，同一个问题的模型调用次数直接 ×3~×6**。
这也是"DAG 多 Agent"作为毕设特色能力与"快"之间的天然张力，需要在演示时主动控制触发条件。

---

## 3. 优先级修复建议

按「改动小 / 收益大」排序：

| 优先级 | 动作 | 位置 | 预期收益 |
|--------|------|------|---------|
| P0 | **删掉 legacy history 注入**（或只在 DSH 会话确为空时注入一次，且不写进会话日志） | `dsh-chat-service.mjs` `formatLegacyHistoryContext` | 每轮省 1.5~2 万输入 token |
| P0 | **意图判定加兜底**：无明确修改动词时不要默认 CODE_MUTATION；闲聊/提问不要注入"必须跑构建" | `user-intent.mjs:31` | 消除 19~20 步的无意义长链 |
| P0 | **`pnpm run build` 不作为默认自测命令**，改用轻量命令（`tsc --noEmit` / 单测）或让用户显式开启 | `verification-policy.mjs:71` | 单轮省数十秒~数分钟 |
| P1 | **推理档位降到 `medium`**（**不是**「对齐 DSH」——你的 DSH 默认也是 `high`，这是一条纯提速取舍，需你决定） | `taskweaver-model-profiles.json` + 设置 UI | 每个 step 都变快，×19 step |
| P1 | **核对 `sessionModelMatches` 比较口径**（防御性；当前配置下不命中，但未设档位时会每轮触发） | `dsh-chat-service.mjs:660-668` | 保住上游 prompt cache |
| P1 | **给流式链路加节流**：`publish()` 用 RAF/16ms 合并；主对话只保留 projection 一条通道，停发 `chat:stream` 的 delta | `z-conversation-hub.mjs` / `dsh-chat-service.mjs:361-387` | 消除 O(n²)，界面流畅 |
| P2 | **`AgentMessageMarkdown` 加 `React.memo`**，并把滚动贴合改为 `useLayoutEffect` + 节流 | `AgentMessageMarkdown.tsx` / `App.tsx:3785` | 降低重排与重解析 |
| P2 | **给 `getDshModelDirectory()` 加 TTL 缓存**，`configureModel` 内复用同一次结果 | `model-service.mjs:87` | 省掉每轮 8ms 与 6 次 Host 请求 |
| P2 | **性能对比实验固定同 provider/model/effort** | `dsh/settings.yaml` | 让归因成立 |

---

## 4. ⚠️ 重要：你测的是安装版，不是仓库最新代码

```
/Applications/TaskWeaver.app/Contents/Resources/app.asar   构建于 2026-09-29 12:04
electron/backend/dsh-chat-service.mjs                      修改于 2026-09-29 12:11
```

- 安装版（12:04）的 asar 里**包含** `formatLegacyHistoryContext` / `TASKWEAVER_LEGACY_HISTORY_CONTEXT`
- 仓库里 12:11 的版本**已经不含**这两个符号（`grep` 命中 0）

也就是说：**第 1 节那份慢的日志，跑的是 12:04 的打包版。**
如果你在仓库里改了代码却发现行为没变，先确认是不是没重新打包：

```bash
npm run app            # 同步沙箱 + 构建 .app
npm run install:app    # 安装到 /Applications
# 或开发时直接用
npm run dev
```

---

## 5. 复现与验证脚本

本次诊断用到的脚本已归档到 `scripts/diagnose/`：

| 脚本 | 用途 |
|------|------|
| `tw-bench.mjs` | 直接拉起 DSH Host，实测各 RPC 往返延迟 |
| `tw-log-peek.mjs` | 逐帧解压 `dsh/sessions/**/session.jsonl.zstd`（多 zstd frame 拼接） |
| `tw-timeline.mjs` | 从会话日志还原逐轮耗时 / 首块延迟 / 分片事件数 |
| `tw-tools.mjs` | 导出全部工具调用命令、请求头模型、注入文本 |
| `tw-headers.mjs` | 抽出会话内所有 `request/header` 的 `reason` 与 provider/model/effort，看模型是否来回跳 |
| `tw-reasoning-probe.mjs` | 探 DSH 推理等级机制：全局默认、模型可选档位、`defaultEffort`、`selectModel` 是否回填 |
| `test-hub-coalesce.mjs` | 真实 Host + 假 `webContents`，量化投影推送合并效果 |

用法（把会话目录换成你自己的）：

```bash
node scripts/diagnose/tw-bench.mjs
node scripts/diagnose/tw-log-peek.mjs \
  "$HOME/Library/Application Support/taskweaver-desktop/dsh/sessions/--Users-zsn-Documents-~6BD5~8BBE--/tw-c5a494d2-bc75-4188-99b8-f3d062947a31"
node scripts/diagnose/tw-timeline.mjs
node scripts/diagnose/tw-tools.mjs
node scripts/diagnose/tw-headers.mjs          # 不传参数=取最近修改的会话
node scripts/diagnose/tw-reasoning-probe.mjs  # 会自动复制你真实的 settings.yaml
```

> 提示：`session.jsonl.zstd` 是**多帧拼接**的，`zstdDecompressSync` 只解第一帧，
> 需要循环扫描 `28 B5 2F FD` magic 逐帧解压。
>
> ⚠️ 踩过的坑：`tw-reasoning-probe.mjs` 如果**不**复制真实 `settings.yaml`（即用纯临时 `DSH_HOME`），
> `agent-default-model` 会回落到宿主组合项而**没有档位**，于是得出「DSH 从不返回 reasoningEffort」的错误结论。
> 做这类探针时，务必让配置层与用户真实环境一致。

---

## 6. 一句话总结

DSH Host 本身没被改慢（实测毫秒级）；
慢在 TaskWeaver 外层：**首轮塞 61KB 历史 → 每句话被改写成"必须跑构建"的工程任务 →
一轮变成 19~20 步 → 而这 19~20 步里每一步的流式输出又被整份快照无节流地灌进渲染层**。
按 P0 三条改完，同一个问题的耗时应该能回到和 DSH 同一量级。

> 关于推理档位：**DSH 也有推理等级，而且你这台机器的 DSH 默认同样是 `high`**
> （`settings.yaml` → `agent-default-model.reasoningEffort: high`）。
> 所以档位不是「TaskWeaver 独有的额外负担」，它只是一条可选的提速取舍，不是本次慢的成因。

---

## 7. 修复落地与验证（2026-09-29）

### 7.1 已落地的四处改动

| # | 改动 | 文件 | 关键实现 |
|---|------|------|---------|
| 1 | 意图判定改为**保守判定**，默认不再落 `CODE_MUTATION` | `electron/backend/user-intent.mjs` | 新增 `CONVERSATION` 意图并作为兜底；修改类关键词**先于**只读模式匹配；新增 `INTERROGATIVE_BEFORE` 回看守卫，使「这段代码**怎么实现**的」不再被判成修改意图 |
| 2 | 自测命令**不再默认跑 `pnpm run build`** | `electron/backend/verification-policy.mjs` | 优先级改为 `typecheck → lint → tsc → build`；新增 `buildCommand` 字段单独承载重型构建；`readTsconfig()` 识别 solution-style tsconfig（本仓库 `files: []` + `references`，因此选 `npx tsc -b` 而非 `--noEmit`） |
| 3 | 收紧→放宽 `selectModel` 的比较口径，避免**每轮**重建模型绑定 | `electron/backend/dsh-chat-service.mjs` | `sessionModelMatches()` 在「回读值缺 `reasoningEffort`」或「未设档位」时不再判「不匹配」。**注意：这是一条防御性修复，不是本次慢的主因**——原因见 7.2 |
| 4 | 对话投影推送**按 16ms 合并** | `electron/backend/z-conversation-hub.mjs` | `publish()` 拆成 `publishNow()`（首帧立即出）+ 脏集合 + 单次 `setTimeout` 冲刷；`detach` 时清理待推送项 |

### 7.2 验证证据

**改动 1（意图判定）** — 16 条回归用例全通过，含两个边界：

```
"你好"                     → conversation  （旧逻辑：mutation）
"这段代码怎么实现的"        → read_only     （关键词"实现"不再误伤）
"帮我加一个导出 CSV 的功能" → mutation      （"加一个"已纳入关键词）
```

**改动 3（模型绑定比较口径）** — ⚠️ **这条的初版证据是错的，已修正。**

初版我写道「`sessions.models().current` 只返回 `{provider, model}`，永远不含 `reasoningEffort`」，
并据此宣称「每轮都命中该分支」。**这个测量是错的**，原因是我当时的探针用了**临时 `DSH_HOME`**，
没有你的 `settings.yaml` 用户层，于是 `agent-default-model` 回落到宿主组合项（只有 provider+model、没有档位）。

用**你真实配置**重测（`scripts/diagnose/tw-reasoning-probe.mjs`，临时 HOME + 复制真实 `settings.yaml`）：

```
刚创建、从未 selectModel 的会话
  current = {"provider":"opencodex","model":"cursor/composer-2.5","reasoningEffort":"high"}
                                            ↑ 有 reasoningEffort！

selectModel 不传 reasoningEffort（模型 deepseek-v4-flash, defaultEffort=high）
  返回 selected = {"provider":"deepseek-official","model":"deepseek-v4-flash","reasoningEffort":"high"}
  回读 current  = {"provider":"deepseek-official","model":"deepseek-v4-flash","reasoningEffort":"high"}
```

即 `current.reasoningEffort` **是会返回的**：会话有日志时从 `request/header` 派生，
没有日志时回落到全局默认（你的默认里写了 `high`）。
所以在你当前这份配置下（两边都是 `high`），**旧口径本来就能匹配，这条不是本次慢的成因**。

修复仍然保留，因为它挡的是这些**真实存在**的场景：

- 未设 `thinkingLevel`（`explicitReasoningEffort` 为 `null`）而 DSH 回读到 `high` → 旧口径每轮判不匹配；
- 你把某个模型档位调成 `medium`、DSH 侧仍解析为 `high` → 每轮判不匹配。

`scripts/test-dsh-chat-service.mjs` 里那条 `same route should not call selectModel again` 断言覆盖了这个行为。


**改动 4（推送合并）** — `scripts/diagnose/test-hub-coalesce.mjs` 拉起真实 Host 投喂 400 帧：

```
[未合并 (coalesceMs=0)]  投喂 400 帧 → 实际推送 400 次  (压缩比 1.0x)
[已合并 (coalesceMs=16)] 投喂 400 帧 → 实际推送   1 次  (压缩比 400.0x)
减少 99.8%
```

**回归套件** — 10 个相关套件全部通过（exit=0）：

```
test-dsh-chat-service      test-chat-model-resolver   test-orchestration
test-routing-portfolio     test-quota-cycle           test-coalesce-content-blocks
test-dsh-snapshot-serialize test-dsh-transcript-serialize
test-dsh-permission-map    test-usage-and-thinking
```

### 7.3 顺手修掉的一个测试缺陷（重要）

`scripts/test-dsh-chat-service.mjs` 原先**偶发失败**，且失败点飘忽（分别落在
`:162` / `:195` / `:213` / `:219`），一度看起来像本次改动引入的回归。实测定位后确认**与本次改动无关**，
是两个独立问题叠加：

1. **测试自身的事件投喂时序**：mock 在 `service.send()` 还没把该轮注册进 `running` 之前就投喂
   `turn/end`，事件按会话 id 派发时找不到对应轮次，被**静默丢弃**；此后不会再有结束事件，
   顶层 `await` 永久挂起（表现为 `Detected unsettled top-level await`）。
2. **固定 `setTimeout(10/15/30ms)` 等磁盘写**：`dsh-chat-service` 在会话创建与权限切换时都会
   `persistSessions()` 真写盘，磁盘抖动会让 10ms 等待偶发不足。

修法：引入 `waitFor(predicate, { label, timeout })` 轮询助手，把「等固定毫秒」换成
**等状态成立**（`service.isBusy(conversationId)` 代表该轮已注册、可以安全投喂事件）。
改后连跑 6 次 **6/6 通过**（改前是随机的 0~1/3）。

> 复用经验：验证改动时若测试偶发挂起且失败点飘忽，先怀疑测试自己的投喂时序，不要急着回滚业务代码。

### 7.4 仍未处理（等你确认后再动）

- **P1**：把全局 `thinkingLevel` 默认从 `high` 降到 `medium`。
  ⚠️ 这**不是**「对齐 DSH」——你的 DSH `agent-default-model.reasoningEffort` 本来就是 `high`，
  这是一条纯提速取舍。注意 `getThinkingLevel` 优先取 per-model `profiles[key].thinkingLevel`，
  其中 `opencodex/cursor/composer-2.5` 与 `custom-gateway/claude-opus-5-5` 被钉死在 `high`，只改全局不会生效。
- **待确认**：会话内 `composer-2.5 ↔ mimo-v2.6-flash` 来回跳，是否都对应你手动切模型的动作？
  若不对应，那是真 bug，需要继续查。
- **P2**：`AgentMessageMarkdown.tsx` 加 `React.memo`；`App.tsx:3785` 的滚动贴合 effect 依赖
  `[messages, streamText, sending, toolTraces]`，每次更新都强制 `el.scrollTop = el.scrollHeight`。
- **P2**：`model-service.mjs` 的 `getDshModelDirectory()` 无缓存，`configureModel` 每次 send 调两次
  （约 8ms + 6 次多余 Host 请求）。

### 7.5 生效前提

以上改动都在**仓库代码**里，安装版 `/Applications/TaskWeaver.app` 仍是旧的。
要让改动真正生效必须重新打包：

```bash
npm run app            # 同步沙箱 + 构建 .app
npm run install:app    # 安装到 /Applications
# 开发调试时更快的路径
npm run dev
```

