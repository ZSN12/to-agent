# @z/dsh-repeat-tool-reminder

[English](README.md) | 中文

这不是面向模型的工具：它不会出现在工具列表中，也不会改写调用。它会监视每个 agent（智能体）的工具调用流，为连续的完全相同调用及重复读取同一文件发送逐级增强的提醒；同一文件的读取计数不会因中间穿插搜索或读取其他文件而清零，并会在新用户轮次开始时重置。TaskWeaver 只读子 Agent 在同一范围内搜索两次或四次仍未读取源码时会收到进度提醒；在指定范围内累计搜索六次时会收到更明确的进度提醒。为避免无限重试，单个指定范围最多允许十次搜索、同一文件每轮最多读取八次，完全相同的读取最多执行三次；下一次匹配调用会被拒绝，并允许模型进行一次恢复响应，若仍重试就结束该 Agent 轮次。读取源码只会清除两次/四次进度提醒计数，不会清除重复搜索计数。不同文件和其他范围仍可继续；同一文件不同区段最多允许八次。检测到基于规范化搜索范围和查询/选项的 2–8 步 `glob`/`grep` 序列重复两轮后，也会拒绝下一次匹配搜索，并在本轮 agent 任务剩余期间锁定该范围。新的用户轮次会解除锁定。这些是针对局部循环/重试的保护，不限制整项任务的总调用次数、时长或 Token。决策记录见 [repeat-tool-reminder Agent Note](../../../.agents/notes/archived/feature/2026-07-08-repeat-tool-guard.md)。

当当前用户轮次带有 TaskWeaver 只读子任务范围 marker 时，插件还会在执行前限制 `read`／`read_image`／`glob`／`grep`／`find`／`ls` 的工作区相对路径。marker 缺失时不影响普通 DSH 会话；marker 格式无效时只读文件工具会 fail-closed。范围外调用会被拒绝并提示使用已收集证据、在范围内继续，或报告证据缺口。局部重复搜索/读取重试保护仅应用于 TaskWeaver 只读范围，不会限制整项任务。

## 配置

```yaml
- id: repeat-tool-reminder
  name: '@z/dsh-repeat-tool-reminder'
  config:
    thresholds: [3, 5, 8]        # default; repeated-call / same-file-read reminder counts
    include: []                  # tool-name patterns to track; empty ⇒ all tools
    exclude: [todo_write]        # tool-name patterns transparent to the chain
    argumentsPreviewChars: 500   # default; cap on arguments quoted in the detailed reminder
```

插件加载时，`thresholds` 会对错误配置快速失败：空列表、非整数、小于 2 的值或重复值都会抛出错误，绝不静默回退到默认值；`argumentsPreviewChars` 同样只接受大于等于 1 的整数。系统会将列表按升序规范化；第一个阈值只发送简短的通用提醒，后续阈值发送详细版本，列出工具、连续次数和规范参数。超过最高阈值后，按最后两个阈值的间距周期性重复提醒（只有一个阈值时按该阈值间距重复），避免长循环在提醒几次后重新变成静默。参数内容截取前 `argumentsPreviewChars` 个字符，并附带省略字符数标记，避免循环中的 `write`／`edit` 载荷无限制进入下一次请求（链键始终比较完整的规范字符串；此上限只约束提醒，不影响检测）。

`include`／`exclude` 条目支持 `*` 通配符，并针对调用时实际存在的工具执行谓词判断，而不是引用注册表条目。因此，与当前任何已注册工具都不匹配的模式并非错误（未加载 MCP 工具的部署中，`exclude: [mcp_*]` 仍然有效）；这与 `toolOrder` 的引用目标检查不同。

## 链语义

完全相同调用的链键为「`(tool name, canonical arguments)`」：规范化过程会对键进行深度排序，然后执行 `JSON.stringify`，因此仅属性顺序不同的参数对象会视为相同。若某次调用与上一条受跟踪调用相同，该 agent 的连续计数器递增；换成另一条受跟踪调用则重置为 1。另外，同一用户轮次内的文件读取按规范化路径分别计数；中间穿插搜索或读取其他文件不会清零。这类提示仅作建议，不会阻止读取仍然需要的代码区段。

- **不受跟踪的调用对链透明。** 被 `include`／`exclude` 排除的调用既不递增计数器，也不重置计数器；因此，`grep X → todo_write → grep X` 仍算作连续两次 `grep X`，即使 `todo_write` 已被排除。这正是排除机制的价值：循环中穿插的记录类工具不能掩盖循环。
- **被拒绝的调用也计数。** 检测位于 `tools/post-execute`；即便调用被 `tools/pre-execute` 监听器拒绝，该事件也会运行。模型反复尝试被拒绝的调用，恰恰是需要打断的循环。
- **忽略没有 agent 的调用。** 直接调用 `ctx.tools.execute()` 的调用方没有需要提醒的模型，也没有可作为键的活跃 agent 对象。
- **按 agent 分键。** 工具注册表位于上下文层级，subagent 会交错通过同一个 waterfall（瀑布式事件），因此完全相同调用和逐文件读取计数均使用 `WeakMap<Agent, …>`，以活跃 agent 对象为键。一个 agent 的重复调用绝不会触发另一个 agent 的提醒。用户提示词（`agent/pre-step`）会重置提交该提示词的 agent 计数；对象生命周期会自然限制弱引用条目的寿命，无需 dispose（资源释放）监听器。
- **重复搜索序列断路。** 插件只暂存当前 agent 最近的 `glob`/`grep` 工具、规范化范围及规范参数（含查询 pattern/选项）；同一目录下不同查询不会被判成相同调用，遇到其他受跟踪工具会重置该序列。如果相同的 2–8 步序列已经重复两次，下一次匹配调用会在执行前被拒绝，并锁定该范围直到本轮结束。拒绝反馈要求唯一一次恢复响应停止宽泛搜索、利用已收集证据作答；已知路径的直接读取仍可用。若恢复响应再次尝试被锁定范围，会在下一次 LLM 请求前结束本轮。其他范围和直接读取仍可用，新用户轮次会解除锁定。这是针对精确重复循环的有限恢复，不是整项任务的累计调用上限。
- **TaskWeaver 只读循环保护。** 每个明确分配的搜索范围允许十次不同的 `glob`／`grep`／`find`／`ls` 搜索；累计六次时先提醒。读取不会重置搜索计数。之后的搜索会被拒绝，模型可用一次恢复响应改为读取、切换范围或总结；若再次搜索被拒绝的范围，会在下一次 LLM 请求前结束本轮。完全相同的 `read`／`read_image` 调用最多执行三次，第四次会被拒绝；同一文件每个 Agent 轮次最多读取八次，即使模型不断更换行区间也一样。首次拒绝后，恢复响应可以改读另一个已授权文件或直接总结；若重试被锁定文件，会在下一次 LLM 请求前结束本轮。其他授权文件、范围及任务其余工作不受影响。新用户轮次会重置计数；这些不是整项任务的调用、时长或 Token 预算。
- **TaskWeaver 只读路径范围。** 只在当前用户轮次包含 `<taskweaver-readonly-scope-v1>{"paths":[...]}</taskweaver-readonly-scope-v1>` 时启用。每条路径必须是明确的工作区相对字面路径；绝对路径、工作区根、通配符和 `..` 都拒绝。列出的文件/目录及其后代路径可访问，其他读/搜索在执行前拒绝。若 `glob` 的搜索根为 `.`，仅当 pattern 本身是范围内的字面路径时才允许；通配符或全工作区搜索仍拒绝。新用户轮次没有 marker 时范围不会泄漏到下一条请求。对带 marker 的 TaskWeaver 子 Agent，有效范围内的读取另限制为每文件每轮八次，允许一次恢复；不带 marker 的普通 Host 会话不受逐文件次数限制。
- **仅驻留内存。** 从持久化恢复的会话会从一条全新的链开始：guard 是启发式提醒，并非有日志记录的不变量；提醒会延后，这是可接受的代价。

## 提醒传递

提醒通过 post-execute 决策中的 `additionalContexts`（来源为 `{kind: 'plugin', plugin: 'repeat-tool-reminder'}`）传递，绝不替换 `content`；用于审计的 `tool/result` 事件仍保留工具自己的输出。循环会缓冲这段上下文，并在该步骤的工具结果之后将其作为注入的 `user/message` 追加；会话会将它渲染为普通的合成用户消息。因此，提醒对模型可见、带有来源归属，并且无需增加会话事件即可从会话日志重建。提醒监听器始终通过 `next()` 委派，并将自己的提醒放在下游决策的上下文数组之前（两种结果都适用：被阻止的调用也会收到提醒）；独立的搜索序列断路器则会在执行前拒绝循环调用，并在工具结果中解释原因。

## 模型体验

### 首个阈值的上下文消息

#### 模型看到的内容

达到第一个配置的连续重复阈值时，对应 agent 会收到以下提醒。系统不会添加工具 schema 或正常调用文本。

##### 首个阈值提醒

```markdown
You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again: if the task is not complete, try a different approach or different arguments instead of repeating the call.
```

#### Token 影响

达到阈值前为零 token。提醒会作为该 agent 的历史记录保留。

#### KV Cache 影响

仅追加；新出现的内容位于可复用请求前缀之后，不会使现有 KV Cache 条目失效。

### 后续阈值的上下文消息

#### 模型看到的内容

达到后续阈值时，agent 会收到以下详细提醒模板。受上限约束的参数预览严格以 `… (+<omitted> more chars)` 结尾。

##### 后续阈值提醒

```markdown
Repeated tool call detected:
- tool: <toolName>
- consecutive_calls: <count>
- arguments: <canonicalArguments>
The repeated calls are not making progress. Do not call this tool with these exact arguments again. Inspect the latest result and choose a different action, different arguments, or finish the task if enough evidence has been gathered.
```

#### Token 影响

每条提醒都会作为历史记录保留；`argumentsPreviewChars` 会限制随数据变化的参数文本长度，而各 agent 仍使用独立计数器。

#### KV Cache 影响

仅追加；新出现的内容位于可复用请求前缀之后，不会使现有 KV Cache 条目失效。

## 已知限制与暂缓事项

- **精确序列触发**：必须先匹配到工具、范围和规范参数都相同的序列才会触发锁定，因此变更查询或选项可能延迟首次锁定；触发后，该范围上的所有 `glob`／`grep` 都会在本轮剩余期间被拒绝。
- **压缩（compaction）不会重置链**：跨越压缩检查点的链会继续计数。
- **不跨轮持久化**：重复调用链会在新用户任务开始时重置，也不会在进程重启后恢复。
- **subagent 之间不共享链**：链始终按 agent 隔离；即使父 agent 与其 subagent 重复相同调用，也不会合并计数。
- **合理的幂等轮询超过阈值后仍会收到提醒**：可通过 `thresholds`／`exclude` 配置释放压力。
