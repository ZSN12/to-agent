# TaskWeaver 本地 Hook

在 **用户数据目录** `taskweaver-hooks.json` 或工作区 **`.taskweaver/hooks.json`** 中配置 Shell 钩子（合并执行，工作区在后）。

## 阶段

| 阶段 | 时机 |
|------|------|
| `beforeTurn` | `chat:send` 进入执行前（已组装 prompt） |
| `afterTurn` | 助手消息落库后 |

## 环境变量

- `TASKWEAVER_HOOK_PHASE`
- `TASKWEAVER_CONVERSATION_ID`
- `TASKWEAVER_PROMPT`
- `TASKWEAVER_EXECUTION_MODE`（`single-agent` / `multi-agent`）

## 示例

见仓库根目录 [`.taskweaver/hooks.example.json`](../.taskweaver/hooks.example.json)。

单条 Hook 可设 `"failClosed": true`：该 Hook 失败后停止执行后续 Hook；Hook 失败本身会记录在返回结果中，不会撤销或阻断当前聊天轮次。每个命令最多运行 30 秒，超时会终止整个命令进程树；stdout/stderr 各最多保留 64 KiB，避免 Hook 输出占满主进程内存。

工作区 Hook 会以当前用户权限在工作区目录中运行。只在可信工作区中启用，并避免把密钥写入命令行或 Hook 输出。
