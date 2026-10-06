# 失败轮次与排队结果持久化验收（2026-10-03）

## 复现与根因

测试不操作桌面界面、不调用付费模型、不读取用户密钥或修改用户会话。使用当前部署的 `vendor/taskweaver-z-runtime`、真实 Agent、原生只读工具以及本机受控 OpenAI SSE 端点。

`scripts/test-z-failed-turn-lifecycle.mjs` 让模型先输出正文和 reasoning、调用真实 read 读取临时文件，第二次模型请求返回受控 HTTP 402。修复前原生事件和历史已有部分正文，桥接 error 事件却没有 full，断言实际失败：`actual undefined`、`expected PARTIAL_BEFORE_FAILURE`。并不是原生 Agent 没有生成内容。

源码中失败分支只发 error message 并 reject，没有携带现有结果；IPC 只落错误行。成功结果的落库和用量记录又只发生在第一条 send 的返回处，后续 accepted/queued 轮次没有对应返回调用。

## 实现

- 原生 `turn/end` 生成完整结果，失败事件包含轮次 ID、已有正文、reasoning、耗时和已上报用量；reject 仍保留原错误，并附 partialResult，不伪装成功。
- 主聊天每轮终止通过 `onTurnCompleted` 独立持久化，不依赖当前界面订阅或第一条 IPC 返回。磁盘 IO 不阻塞共享 mux 消费；首条 send 等待自己的 commit，排队轮次也分别提交。保存失败保留诊断，IPC 可用相同 ID 重试，仍不替换原模型错误。
- AppState 按 `z-turn-<turnId>` upsert；用量用同一轮次 ID 去重。失败另存稳定错误行，部分输出明确标记为中断，并显示保留提示。
- 子会话和静默编排不进入主聊天终止 sink。DAG 总用量仍由编排汇总后落库，不同时重复计算 synthesis 用量。
- 界面先把失败/停止的部分输出转成稳定消息，再清理临时流。原生投影接管时保留失败标记，重复文本按出现次数匹配元数据；带稳定轮次 ID 的停止不再额外生成时间戳副本。
- IPC 错误携带失败轮次 ID。旧轮次延迟返回的错误，以及另一条被拒绝的忙时请求，不得清除当前新一轮输出和运行状态。子任务错误不清父任务的流、队列或错误栏。

## 通过的证据

`npm run test:z-host-deploy`：

- 已部署 Host 的原生 MCP、只读模型工具、实际重叠并发 DAG、原生历史重启恢复通过。
- 两条排队追问产生三份独立答案，三轮均持久化，而非只保存第一次 IPC 返回。
- 队列删除、编辑、停止并清队列回归通过。
- 排队第二轮先输出、执行 read 再失败，没有未决 IPC 调用也能保存正文、错误和用量；切到另一会话不改变当前选择，重新创建 AppState store 后仍读到原结果。
- 单轮失败保留正文、reasoning、原生历史、已上报 10 输入/2 输出 tokens；重复交付只计一次；下一轮新问题成功。
- 原生压缩空历史、成功、非法参数、31 秒维护、取消以及不支持预设的封闭失败回归通过。

`npm run test:usage`：真实 JSON store 并发、实际 IPC 持久化 helper/错误 wrapper、稳定消息和用量去重、DAG 汇总、保存故障不替换模型错误、用量/思考/冷会话统计通过。

`npm run test:stream-buffer`：执行生产 hook 和 reducer 的无界面调度测试，失败 IPC/reload、下一轮开始、原生投影延迟和接管、重复文本元数据、停止去重、后台隔离、子任务隔离、旧错误延迟返回、新请求被拒绝不伤害当前轮次通过。不是 Electron GUI 端到端测试。

此外 `test:backend`、`test:threads`、`test:orchestration`、`test:dsh-chat`、`test:dsh-lifecycle`、`test:session-transcript`、`npm run build` 和 `git diff --check` 通过。

## 边界与剩余工作

- 本机端点控制的是模型响应，不能据此证明真实供应商延迟已经改善。当前未再调用付费模型；此前真实供应商余额不足。
- 覆盖原生明确 `turn/end` 的成功、停止、失败，以及排队和晚到 IPC。未证明进程硬退出、磁盘持续失败或 mux 断流时完全不丢结果；这些仍需单独故障注入。保存错误不会被假报为成功保存。
- 没有硬截断长任务，没有清空旧历史。上下文压缩后的事实保留与复杂审查收敛仍未完成验收。
- 没有重新安装应用。核对 `/Applications/TaskWeaver.app/Contents/Resources/app.asar` 修改时间仍为 2026-10-03 00:28:02 CST，大小 62,233,047 bytes。源码/本地部署通过不代表安装版已包含本轮修复。
