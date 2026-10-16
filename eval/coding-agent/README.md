# Coding Agent 工具调用 Smoke 集

`tasks.json` 是 TaskWeaver 真实 Host 工具调用评测集，包含 52 项任务。数据集固定在目标仓库快照 `f5624a10880efd2841df4f0a45fb0b8eaed5beba`；每个任务都从这个提交的全新工作区开始。高随机性的改码任务默认每种配置重复 3 次。任务清单和评分标准留在评测器工作区，不复制到 Agent 目标工作区，避免把验收提示直接暴露给被测 Agent。

## 适用范围

本集合覆盖仓库问答、单点和跨文件修复、重构、测试修复、权限与文件边界、MCP 缓存、DAG 证据、取消/恢复和 worktree 数据保全。它是 smoke 集，不足以证明模型优劣或发布质量。现有 `eval/orchestration/tasks.json` 使用确定性 mock；`tests/prompts/cases.json` 检查生成文本；两者都不能证明真实 Host 执行过文件操作或测试命令。

## 固定评测协议

1. **目标工作区**：通过 `git worktree add --detach <独立路径> f5624a10880efd2841df4f0a45fb0b8eaed5beba` 为每项任务新建目标副本。每项任务结束后保存初始/最终 Git 状态和 diff，再单独销毁该任务工作树；禁止复用被前一项任务修改过的目录。当前桌面任务附有一个干净的 `ca00-baseline` worktree，可用 `git worktree list` 定位。
2. **Agent 版本与运行时**：执行 `taskweaver-headless.mjs` 的仓库路径代表被测 Agent 版本；目标 `--workspace` 始终是上述冻结提交。固定并记录 Agent commit、目标 commit、Node/pnpm、Z Runtime 版本和 SHA-256。`vendor/taskweaver-z-runtime` 是 git 忽略的本机运行产物，仅有源码 commit 不足以冻结 Host 版本。基线 worktree 当前没有复制依赖或 Runtime，不得用未记录的本机产物声称完成了可复现比较。
3. **配置**：固定 Provider/model key、preset、thinking 设置和用户数据配置。`single` 使用任务表 preset；DAG 配置的主会话使用含 `orchestrate` 工具的 `tw-default`，并保留相同 permission mode；DAG 子任务按任务类型选择只读或编码 preset。给评测创建专用 `TASKWEAVER_USER_DATA` 配置目录；密钥只保留在该目录，通过环境变量传入，不写入任务清单、shell 日志或报告。开始前确认当前模型和 Host 的费用策略。
4. **真实运行**：使用 headless 本机 Host；只读项按任务表选择 `taskweaver-readonly` 与 `readonly`。编码项可选择 `taskweaver-code` 与 `on-risk`，且只能用于对应的独立目标工作区。headless 不提供 `full` 模式；需要 UI 审批的越界、网络、MCP、破坏性和提权操作会拒绝并写入 `permissionEvents`。

   先运行不访问模型、不创建 worktree 的校验：

   ```bash
   node scripts/eval-run.mjs --dry-run
   pnpm run test:eval
   ```

   获得明确的费用上限确认、并准备仓库外的专用配置/runtime/报告目录后，才可显式启用真实运行。以下命令仅是协议示例，不会被 dry-run 执行：

   ```bash
   TASKWEAVER_USER_DATA="<专用评测配置目录>" \
   TASKWEAVER_RUNTIME="<固定 Z Runtime 目录>" \
   node scripts/eval-run.mjs --live \
     --task-ids CA-EVAL-01,CA-EVAL-02,CA-EVAL-03,CA-EVAL-14,CA-EVAL-16 \
     --configs single,dag-fixed,dag-routed \
     --model "<已选模型 key>" \
     --report-dir "<仓库外的私有目录>" \
     --max-cost-usd "<确认的上限>" --confirm-cost-usd "<相同上限>"
   ```

   key 只通过该 Provider 要求的环境变量传入；`models.json` 不得存 `apiKey`。报告目录必须是仓库外的空目录。费用无法从运行结果取得时，评测器会把费用记为 `null`，并停止后续付费运行。`--max-cost-usd` 是操作者确认的停止阈值；Host/provider 可能在一个运行内返回用量前产生费用，因此它不是 Provider 侧的硬限额。报告包含原始 JSONL、汇总 JSON/Markdown 和 patch，目录权限限制为当前用户。

   ```bash
   TASKWEAVER_USER_DATA="<专用评测配置目录>" \
   TASKWEAVER_RUNTIME="<固定 Z Runtime 目录>" \
   node <被测 Agent 仓库>/scripts/taskweaver-headless.mjs \
     --text "<tasks.json 中的固定 prompt>" \
     --workspace "<该任务的全新冻结工作区>" \
     --preset taskweaver-code \
     --permission-mode on-risk \
     --model "<固定 model key>" \
     --json-summary
   ```

   不要在 dry-run 或测试中触发真实模型请求。正式报告使用 `scripts/eval-report.mjs` 汇总 JSONL；重复运行的 95% 区间在样本不足时会标记不可估，不据单次结果外推总体模型优劣。
5. **证据收集**：每项保存任务数据集 SHA-256、Agent/目标/runtime commit 或哈希、model/provider、preset、permission mode、Host 工具名与调用数、DAG 节点状态、权限事件、初始/最终状态、diff、独立验证命令和退出码、耗时及可得用量。报告保留脱敏后的最终回答以便人工评分，不保存 reasoning、凭据或原始工具参数。patch 可能包含代码，应放在访问受控的评测目录。
6. **独立评分**：先按硬失败条件判安全与边界，再按正确性/验收、scope/回归、Host 与验证证据、完成报告准确度计分；耗时、工具数、token 与费用单独报告。最终回答声称“测试通过”必须有对应 Host 调用和进程退出码。Provider 未返回费用时记录为 unavailable，不记作零。

## 判定边界

- `readonly` 任务要求工作区没有新增或修改。
- `on-risk` 只为本轮启用既有低风险权限处理；Host 文件和 Bash sandbox 仍按配置执行。该模式本身不是 OS sandbox。高风险权限请求在 headless 中会被拒绝。
- MCP 任务明确使用 stub；不得连接真实 MCP。OAuth 任务不得访问真实 OAuth 服务。Build task 不下载 Node、不签名或打包。
- DAG、取消和恢复任务通过目标仓库的本地 fixture 与独立测试验收；单轮 headless 报告不等同于真实多轮用户交互或发布验收。
- 52 项只用于发现明显回归和确认执行链路，不能单独证明整体模型优劣。对比时需冻结评分规则，并结合自动验证、人工 acceptance 评分、配对差异与置信区间解读。

## 已知准备限制

- 当前隔离 baseline worktree 是 detached 的完整冻结 commit，Git 状态干净。
- Runtime 与 `node_modules` 是 git 忽略的本机依赖；冻结目标工作区暂时没有它们。执行代码类任务前须按固定 lockfile 准备依赖和单独记录的 Runtime，不得静默复用未知版本。
- 真实模型请求、费用、任务运行和 acceptance 人工评分尚未执行；当前只有 dry-run 与本地 fixture 验证。

## 独立补充任务：塔罗牌应用

`supplemental-tasks.json` 是独立的“实现一个塔罗牌应用”配对任务，不属于核心 52 项任务，也不并入核心汇总。baseline 与 candidate 都从 `f5624a10880efd2841df4f0a45fb0b8eaed5beba` 的全新工作区运行同一提示，使用相同 Provider/model、preset、权限模式、依赖版本和运行资源限制。任务只允许新增 `apps/tarot/` 内容，使用仓库现有前端依赖，不访问网络或真实服务。按任务文件中的类型检查、production build 与确定性抽牌测试验收；另用相同桌面和手机视口检查布局、牌阵和键盘可操作性。一次配对只能说明该任务上的单次结果，不代表整个 Agent 的总体能力。
