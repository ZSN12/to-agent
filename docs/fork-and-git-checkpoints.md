# 会话分支与 Git 检查点

会话分支和工作区快照解决的是两件不同的事：分支复制模型对话上下文；Git 检查点记录可恢复的文件状态。

## 从消息分支

1. UI 的分支按钮传入当前 DSH transcript 行 ID。
2. 主进程把 `dsh-user-*` / `dsh-asst-*` 投影 ID 映射到本地持久化 user 消息。优先按时间戳匹配，旧消息再用文本作唯一匹配；缺少 ID、未知行或歧义匹配都会拒绝分支。
3. 对 user 行，分支保留该消息所在的完整轮次；对 assistant 行，保留截至该回答的轮次。UI 当前只允许从最新 assistant 回答分支。
4. Host 将保留轮数换算成已完成 `turn/end` 事件的 `atSeq`，创建 DSH 子会话；新 thread 复制同一段本地展示消息，并关联新 conversation/session ID。

分支不创建 Git 分支、不复制工作区文件，也不回滚文件改动；新 thread 继承原工作区路径。需要隔离文件修改时，应另行使用 TaskWeaver worktree。

如果无法确认投影行与本地消息的对应关系，操作会失败并提示重新选择。Compact 行和错误行不显示分支按钮。

## Git 检查点

检查点捕获当前 Git 工作区状态，包括未跟踪文件和未提交改动；它不复制 DSH 会话日志，也不等同于普通 Git commit。检查点由工作区的元数据文件和 `refs/taskweaver/checkpoints/*` 引用管理，最多保留 50 项。

检查点创建时记录所属 `conversationId`。当前会话只能列出、查看、还原或删除属于自己的检查点，以及旧数据中没有会话归属的检查点。还原前会计算受影响文件；有覆盖/删除时先返回确认清单和状态指纹，确认后的还原会校验指纹，避免在工作区再次变化后误覆盖。

建议顺序：改代码前创建检查点；审阅 diff 后再应用/还原；分支会话时不要把它误当作工作区快照，反之亦然。

## 对应实现

- Fork：`electron/backend/fork-turns.mjs`、`electron/backend/dsh-chat-service.mjs`、`electron/backend/register-ipc.mjs`
- Git 检查点：`electron/backend/git-service.mjs`、`electron/backend/register-workspace-git-ipc.mjs`
- 回归入口：`npm run test:fork-thread-smoke`、`npm run test:git-checkpoints`
