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

单条 Hook 可设 `"failClosed": true`：失败后不再执行后续 Hook（不阻断聊天，除非命令本身抛错）。
