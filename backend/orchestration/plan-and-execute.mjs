import path from 'node:path'
import crypto from 'node:crypto'
import { applySkillInstructions, resolveSkillForSubtask } from '../skill-prompt.mjs'
import { detectVerificationCommands, executeVerificationRunner } from '../verification-policy.mjs'
import { executeDag, validateAndOrderTasks } from '../dag-scheduler.mjs'
import { modelFailureDomain, nextTaskTier, selectModelForTask, shouldUpgradeFailedTask } from '../orchestration-policy.mjs'
import { buildRoutingOptions } from '../routing-portfolio-service.mjs'
import { runWithSubtaskRetries } from '../subtask-retry.mjs'
import { getTaskProfile } from '../task-profile.mjs'
import { buildMemoryPromptSections } from '../memory-store.mjs'
import {
  captureNodeWorktreeFailureEvidence,
  getGitWorkspaceMutationFingerprint,
  getWorkspaceHeadCommit,
  isCleanGitWorkspace,
  resetNodeWorktree,
} from '../worktree-service.mjs'
import {
  PlannerFallbackError,
  buildPlannerRetryPrompt,
  resolveOrchestrationAgentPreset,
  createPlannerProgressRelay,
  requiresReadOnlyPlan,
  validatePlanForRequest,
  completeReadOnlyPlanScopes,
  validateReadOnlyPlanScopesFromIndex,
  collectPlannerPathHints,
  parsePlan,
  layoutTasks,
  combineUsage,
  mergeFileChanges,
  directExecutionSummary,
  isCodeMutationRequest,
  TYPE_LABELS,
  TIER_LABELS,
  READ_ONLY_TASK_TYPES,
} from './planner.mjs'
import { loadWorkspacePlannerHints } from './planner-hints.mjs'
import {
  createPlannerOutputSchema,
  normalizePlannerTaskRoute,
  supportsPlannerOutputSchema,
  taskReferencesImage,
} from './planner-routing.mjs'
import {
  summarizeExecutionEvidence,
  summarizeCommandVerification,
  assessAcceptanceCriteria,
  assessSubtaskCompletion,
} from './evidence.mjs'
import { UsageLedger } from './usage-ledger.mjs'
import { createNodeDeadline, resolveNodeTimeouts, waitForNodeTurn } from './node-deadline.mjs'
import { createNodeWorkspaceRegistry } from './node-workspace.mjs'
import { normalizeDagNodeLimit } from './dag-limits.mjs'
import { applyPlanApprovalChanges } from './plan-approval.mjs'
import { createDagPauseControl } from './pause-control.mjs'
import {
  prepareCrossProviderReviewTasks,
  resolveCrossProviderReviewEnabled,
  selectCrossProviderReviewRoute,
} from './cross-provider-review.mjs'

const DEFAULT_DAG_PROVIDER_CONCURRENCY = 2

export function shouldRunSelfHealingVerification({
  selfHealingEnabled,
  taskType,
  hasFileChanges,
  hasVerification,
  workspaceTrusted,
  permissionMode,
  execCwd,
}) {
  return selfHealingEnabled === true
    && (taskType === 'implementation' || taskType === 'test')
    && hasFileChanges === true
    && hasVerification !== true
    && Boolean(execCwd)
    && workspaceTrusted === true
    && permissionMode !== 'readonly'
}

/** 规划 → DAG 执行 → 汇总 三阶段编排。 */
export function createPlanAndExecute({
  runs,
  memory,
  runPrompt,
  publishTasks,
  modelService,
  getWorkspacePath,
  agentDataPath,
  userDataPath,
  getAppPreferences,
  dshRuntime,
  maxSubtaskConcurrency,
  sendChatStreamIfAvailable,
  nowLabel,
  runStore,
  traceStore,
  pendingApprovals,
}) {
  async function planAndExecute({ text, rawText, contextLayers, primaryModelKey, conversationId, webContents, skill, skillAlreadyApplied = false, workspacePath, permissionMode, workspaceTrusted = false, attachments, documents, dagPlanApprovalOverride, forceReadOnly = false, replay = null, signal: parentSignal = null }) {
    if (!conversationId) throw new Error('当前对话标识无效')
    if (runs.get(conversationId)?.inFlight) throw new Error('该对话的上一条多 Agent 任务仍在处理中')
    if (parentSignal?.aborted) throw new Error('任务已取消')
    const abortController = new AbortController()
    const abortFromParent = () => abortController.abort(parentSignal?.reason)
    parentSignal?.addEventListener('abort', abortFromParent, { once: true })
    if (parentSignal?.aborted) abortFromParent()
    const pauseControl = createDagPauseControl(abortController.signal)
    const taskAbortControllers = new Map()
    const taskStatuses = new Map()
    const runId = crypto.randomUUID()
    const abortTaskControllers = () => {
      for (const controller of taskAbortControllers.values()) controller.abort()
    }
    abortController.signal.addEventListener('abort', abortTaskControllers, { once: true })
    if (abortController.signal.aborted) abortTaskControllers()
    const run = { inFlight: true, abortController, taskAbortControllers, taskStatuses, runId, status: 'planning', pauseControl, onPauseChange: null }
    runs.set(conversationId, run)
    const runState = {
      runId,
      conversationId,
      createdAt: new Date().toISOString(),
      status: 'planning',
      tasks: [],
      ...(replay ? { sourceRunId: replay.source.runId, replayMode: replay.mode } : {}),
    }
    const trace = (type, details = {}) => traceStore?.append(conversationId, runId, { type, ...details })
    const plannerSkill = skillAlreadyApplied ? null : skill
    let ledger = null
    let usage = []
    const combineRecordedRunUsage = () => {
      const records = ledger?.getRecords?.()
      return combineUsage(Array.isArray(records) ? records.map((record) => record.usage) : usage)
    }
    const finalizeCancelledRun = async () => {
      const phase = runState.status
      const cancelledTasks = (Array.isArray(runState.tasks) ? runState.tasks : []).map((task) => {
        const terminal = ['done', 'review', 'cancelled', 'failed'].includes(task.status)
        const status = terminal ? task.status : 'cancelled'
        return {
          ...task,
          status,
          statusLabel: terminal ? task.statusLabel : '已停止',
          runStatus: status === 'done' ? 'completed' : ['review', 'failed'].includes(status) ? 'failed' : 'cancelled',
        }
      })
      const failedTaskIds = cancelledTasks.filter((task) => task.status !== 'done').map((task) => task.id)
      run.schedulerActive = false
      run.pauseControl.resume()
      runState.status = 'cancelled'
      runState.tasks = cancelledTasks
      run.status = 'cancelled'
      await runStore?.saveRun(conversationId, runId, runState)
      if (cancelledTasks.length) await publishTasks(cancelledTasks, webContents, conversationId)
      await ledger?.flush()
      await trace('run_cancelled', { phase, failedTaskIds })
      await traceStore?.flush(conversationId, runId)
      return {
        runId,
        assistant: {
          text: '多 Agent 任务已停止；已完成的子任务进度保留。',
          usage: combineRecordedRunUsage(),
          fileChanges: mergeFileChanges(...cancelledTasks.map((task) => task.messages.map((message) => message.fileChanges))),
          cancelled: true,
        },
        tasks: cancelledTasks,
        failedTaskIds,
      }
    }
    try {
      await runStore?.saveRun(conversationId, runId, runState)
      await trace('run_started')
      sendChatStreamIfAvailable(webContents, {
        type: 'progress',
        text: replay ? '正在从运行记录恢复 DAG…' : '正在分析任务并生成 DAG…',
        conversationId,
      })
      const cwd = workspacePath || (await getWorkspacePath(conversationId))
      const prefs = getAppPreferences ? await getAppPreferences() : { worktreeIsolation: false }
      const replaySettings = replay?.source?.settings ?? {}
      const configuredDagNodeLimit = replay
        ? replaySettings.maxDagNodes
        : prefs.maxDagNodes
      const dagNodeLimit = normalizeDagNodeLimit(configuredDagNodeLimit)
      const runWorktreeIsolation = replay ? replaySettings.worktreeIsolation === true : prefs.worktreeIsolation === true
      const configuredBudgetTokens = Number(replaySettings.dagBudgetTokens ?? prefs.dagBudgetTokens)
      const dagBudgetTokens = Number.isFinite(configuredBudgetTokens) && configuredBudgetTokens > 0
        ? configuredBudgetTokens
        : 2_000_000
      const configuredBudgetUsd = Number(replaySettings.dagBudgetUsd ?? prefs.dagBudgetUsd)
      const dagBudgetUsd = Number.isFinite(configuredBudgetUsd) && configuredBudgetUsd > 0
        ? configuredBudgetUsd
        : 2
      const configuredConcurrency = replay
        ? replaySettings.maxSubtaskConcurrency
        : (maxSubtaskConcurrency ?? prefs.maxSubtaskConcurrency)
      const dagConcurrency = Number.isInteger(Number(configuredConcurrency))
        ? Math.max(1, Math.min(10, Math.floor(Number(configuredConcurrency))))
        : 3
      const configuredProviderConcurrency = Number(replaySettings.maxProviderConcurrency)
      const maxProviderConcurrency = Number.isInteger(configuredProviderConcurrency)
        ? Math.max(1, Math.min(10, configuredProviderConcurrency))
        : DEFAULT_DAG_PROVIDER_CONCURRENCY
      runState.settings = {
        maxSubtaskConcurrency: dagConcurrency,
        maxDagNodes: dagNodeLimit,
        maxProviderConcurrency,
        worktreeIsolation: runWorktreeIsolation,
        dagReadOnlyTimeoutMs: replaySettings.dagReadOnlyTimeoutMs ?? prefs.dagReadOnlyTimeoutMs ?? 10 * 60 * 1000,
        dagWriteTimeoutMs: replaySettings.dagWriteTimeoutMs ?? prefs.dagWriteTimeoutMs ?? 20 * 60 * 1000,
        dagIdleTimeoutMs: replaySettings.dagIdleTimeoutMs ?? prefs.dagIdleTimeoutMs ?? 3 * 60 * 1000,
        dagBudgetTokens,
        dagBudgetUsd,
      }
      await runStore?.saveRun(conversationId, runId, runState)
      ledger = new UsageLedger({
        onRecord: (record) => trace('model_call', {
          taskId: record.taskId,
          attempt: record.attempt,
          modelKey: record.modelKey,
          outcome: record.outcome,
          usage: record.usage,
        }),
      })
      const parallelWorktreeBaselineReady = replay
        ? Boolean(runWorktreeIsolation && replay.source.baseCommit && userDataPath)
        : Boolean(runWorktreeIsolation && userDataPath && await isCleanGitWorkspace(cwd))
      const parallelImplementationAllowed = parallelWorktreeBaselineReady
      const runBaseCommit = replay
        ? (replay.source.baseCommit ?? null)
        : (parallelWorktreeBaselineReady ? await getWorkspaceHeadCommit(cwd) : null)
      const originalText = replay?.source?.originalText || rawText || text
      primaryModelKey = replay?.source?.primaryModelKey || primaryModelKey
      permissionMode = replay?.source?.permissionMode || permissionMode
      const readOnlyRequest = forceReadOnly === true || requiresReadOnlyPlan(originalText)
      const codeMutationRequest = isCodeMutationRequest(originalText)
      const crossProviderReviewEnabled = replay
        ? replaySettings.dagCrossProviderReview === true
        : resolveCrossProviderReviewEnabled(originalText, prefs.dagCrossProviderReview)
      const shouldAutoReview = !replay && codeMutationRequest && crossProviderReviewEnabled
      if (shouldAutoReview && dagNodeLimit < 2) {
        throw new Error('当前 DAG 节点上限为 1，无法同时安排实现和跨提供方审查；请将节点上限调至至少 2 或关闭自动审查。')
      }
      runState.settings.dagCrossProviderReview = crossProviderReviewEnabled
      await runStore?.saveRun(conversationId, runId, runState)
      const evaluationMode = process.env.TASKWEAVER_EVAL === '1'
      const workspacePlannerHints = replay
        ? null
        : await loadWorkspacePlannerHints(cwd, { disabled: evaluationMode })
      const plannerPathHints = replay
        ? { paths: [], visitedEntries: 0, truncated: false, truncationMessage: '', workspaceHints: null }
        : await collectPlannerPathHints(cwd, originalText, { workspaceHints: workspacePlannerHints })
      const plannerPathWarning = plannerPathHints.truncated
        ? (plannerPathHints.truncationMessage || '达到扫描/展示上限，结果不完整').replace(/。+$/u, '')
        : ''
      const catalog = await modelService.listCatalog()
      const plannerApi = catalog.models.find((model) => model.key === primaryModelKey)?.api
      const plannerOutputSchema = supportsPlannerOutputSchema(plannerApi)
        ? createPlannerOutputSchema()
        : undefined
      Object.assign(runState, {
        originalText,
        primaryModelKey,
        workspacePath: cwd,
        permissionMode: permissionMode ?? 'ask',
        workspaceTrusted: workspaceTrusted === true,
        baseCommit: runBaseCommit,
      })
      await memory.init(conversationId, cwd, originalText)
      await memory.beginRun(conversationId, runId)
      const plannerFile = path.join(agentDataPath, 'orchestration', conversationId, runId, 'planner.jsonl')
      let planResult = null
      let planned = null
      let plannerSessionKey = `tw-orchestration-${conversationId}-${runId}-planner`
      let plannerSessionId
      if (replay) {
        planned = replay.tasks.map((task) => normalizePlannerTaskRoute(task, { strict: false }))
        await trace('planning_reused', {
          sourceRunId: replay.source.runId,
          mode: replay.mode,
          taskIds: [...replay.pendingTaskIds],
        })
      } else {
      const plannerPrompt = [
        '你是 TaskWeaver 的多智能体高级任务规划器 (Planner Agent)。负责将软件工程需求拆分为协作子任务的有向无环图 (DAG)。你不执行代码，不能调用工具。',
        '协作子任务职责规范：',
        '1. research (调研 Agent): 负责先期探索工作区架构、定位受影响的文件与符号，输出结构化方案，无写权限。',
        '2. implementation (编码 Agent): 负责实际编写/修改代码。只有目标或依赖关系确实未知时才先安排 research；用户已给出明确实现目标时，不要把实现任务替换成调研任务。',
        '3. test (测试验证 Agent): 仅当 implementation 的改动已存在于该测试 Agent 的执行工作区时，才运行构建/单元测试并将结果作为验证；不能对未包含改动的基线声称验证通过。',
        '4. review (审查 Agent): 依赖 implementation，负责审查代码 Diff、潜在边界问题与安全性。',
        '【验收标准】每个节点都必须给出 acceptance 字符串数组，包含 1–5 条具体、可核对的验收点；避免“完成任务”“质量良好”等不可检查表述。实现节点写明变更/验证结果，调研和审查节点写明必须读取并证实的事实。',
        parallelImplementationAllowed
          ? '实现拆分规则：当功能能按互不重叠的文件或模块独立实现时，优先拆成多个 implementation 节点并行处理；每个节点必须输出 writeScopes 字符串数组，列出它独占的字面路径，并在 description 中明确只改这些范围。若涉及同一文件或紧密耦合改动，保持一个 implementation 节点，或用 dependsOn 明确排序；不要仅为增加 Agent 数量重复拆 research。'
          : '实现拆分规则：当前不具备安全的并行写入条件，将独立代码修改合并到一个 implementation 节点；只有确有先后依赖时才拆成多个 implementation 并用 dependsOn 串行。不要把实现退化成 research，也不要为了增加 Agent 数量而串行重复拆分。',
        ...(codeMutationRequest ? [
          '【代码变更请求强制约束】用户明确要求修改、修复、实现或优化代码。计划必须包含至少一个 implementation 节点并实际完成代码变更；research/review/test 不能替代实现。只在目标、依赖或受影响范围确实未知时添加前置 research。',
        ] : []),
        ...(shouldAutoReview ? [
          `【跨提供方自动审查已启用】系统会在代码任务结束后追加一个只读 review 节点，并要求它使用不同于所有 implementation 节点的 provider；本计划最多安排 ${dagNodeLimit - 1} 个业务节点，不能自行创建重复的 review。每个 implementation 必须提供精确 writeScopes，以便审查只读取实际改动范围。`,
        ] : []),
        parallelImplementationAllowed
          ? '当前已启用 Worktree 隔离且 Git 工作区干净：具有互不重叠 writeScopes 的独立 implementation 节点会在隔离 worktree 中并行执行；各 worktree 的改动仍需用户检查并手动合并。'
          : '当前不具备安全的并行写入条件（需要启用 Worktree 隔离，且 Git 工作区干净）；仍应直接安排 implementation，但不要声称写任务会并行执行。',
        parallelImplementationAllowed
          ? '可以安排依赖实现节点的 test/review；编排器会将成功上游写节点的分支合并到下游隔离工作区，并在所有写节点完成后生成可预览的集成分支。'
          : '',
        ...(readOnlyRequest ? [
          '【只读请求强制约束】用户明确要求只读/禁止修改。本次所有子任务只能使用 research 或 review；即使是交叉汇总、复核、总结，也必须标为 review 或 research，绝不能标为 implementation/test。每项描述必须明确“只读，不修改文件、不运行写入命令”。',
        ] : []),
        shouldAutoReview
          ? '请根据任务规模拆分为 1 到 5 个职责明确的业务子任务；系统会自动追加跨提供方 review，因此不要创建 review 节点。简单且目标清晰的变更可以只安排一个 implementation；只有拆分能带来独立并行工作或必要前置结论时才增加节点。'
          : `请根据任务规模拆分为 1 到 ${dagNodeLimit} 个职责明确的子任务：简单且目标清晰的变更可以只安排一个 implementation；只有拆分能带来独立并行工作或必要的前置结论时才增加节点。若用户明确给出“ N 项独立研究/调研并行”数量，DAG 必须恰好包含 N 个互相独立的 research 节点，不得增加 review 或汇总节点，也不得让这些 research 节点相互依赖。编排器会在所有子任务结束后自动调用最终汇总，因此不要额外创建只负责“汇总/总结/交叉汇总/综合各研究结果”的 review 子任务；review 只用于有独立审查对象和验收标准的实际审查（例如基于具体 diff 检查风险），不要重复读取 research 已覆盖的文件来代替最终汇总。`,
        '研究/审查任务必须有明确边界：每项只回答一个问题，在 description 中列出允许检查的文件或最多一个窄目录、验收点和停止条件；不要分配“通读整个项目/检查所有代码”这类开放任务。回答函数实现、调用顺序或配置细节必须读取源码文件；grep/glob 只能定位，不能作为代码已核实的证据。优先指定直接相关的文件；路径未知时可先搜索定位，再读取实际源码。对于端到端链路/跨文件调用关系问题，scopePaths 必须覆盖闭合结论所需的每个环节（例如 UI 状态/发送入口、preload、IPC、服务与 Host 调用端），不能只授权入口后再尝试越界读取；若现有候选文件不足，应在规划时纳入必要文件或窄目录。独立任务表示彼此无依赖，不要求文件范围完全不重叠；调用链闭合、证据完整优先于零重叠，必要时允许多个任务读取同一个桥接文件。子任务 description 必须写明按给定文件顺序逐跳核实；大源码文件先对目标符号做一次窄搜索，再读取相关 offset/limit 行段，禁止先整文件读取或反复扩大搜索；已给行号/符号时直接从该位置检查。避免重复探索，只有发现尚未解决的具体事实时才扩大检查。',
        '每个 research/review 节点还必须输出 scopePaths 字符串数组，至少 1 项、最多 12 项，只能使用工作区路径索引中的字面量相对路径；不能写绝对路径、通配符、.. 或工作区根目录。scopePaths 是工具层强制执行的读文件/搜索边界，范围外调用会被 Host 拒绝。',
        `【工作区路径索引：仅路径名，不含文件正文，也不代表已读取】扫描 ${plannerPathHints.visitedEntries} 个目录项${plannerPathWarning ? `（${plannerPathWarning}）` : ''}。只从下列真实存在的路径中挑选候选文件；不得仅凭路径推断其内容。规划时尽量直接指定少量候选文件，并要求子 Agent 读取它们；只有索引不足时才安排必要的搜索：\n${plannerPathHints.paths.map((item) => `- ${item}`).join('\n') || '(没有发现路径；任务需先搜索定位，再实际读取文件)'}`,
        `只输出纯 JSON，不加 Markdown 代码块。格式：{"tasks":[{"id":"T1","title":"短标题","taskType":"research|implementation|test|review","role":"职责名","description":"目标、允许检查的文件/目录、验收点与停止条件","acceptance":["能由结果或 Host 证据逐项核对的验收点"],"scopePaths":[${JSON.stringify(plannerPathHints.paths[0] ?? '从上方路径索引选择的真实路径')}],"writeScopes":["src/features/foo/Bar.tsx"],"dependsOn":[],"reasons":["规划原因"],"route":{"tier_adjust":0,"needs_vision":false,"reason":""}}]}；每个 task 必须有 route，route 中禁止输出 model 字段；acceptance 必须为 1–5 条。writeScopes 只供 implementation 使用，research/review 继续使用 scopePaths。`,
        `工作区：${cwd}`,
        ...(contextLayers && contextLayers.length > 0 ? [
          '【系统上下文】\n' + contextLayers.map(l => `[${l.id}]\n${l.text}`).join('\n\n')
        ] : []),
        `【用户原始请求】\n${originalText}`,
      ].join('\n\n')
      const plannerProgress = createPlannerProgressRelay(webContents, conversationId)
      try {
        await trace('planning_started', { modelKey: primaryModelKey })
        let previousOutput = ''
        let previousRejection = ''
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          plannerSessionKey = attempt === 1
            ? `tw-orchestration-${conversationId}-${runId}-planner`
            : `tw-orchestration-${conversationId}-${runId}-planner-attempt-${attempt}`
          const attemptPrompt = attempt === 1
            ? plannerPrompt
            : buildPlannerRetryPrompt(plannerPrompt, {
              previousOutput,
              rejectionReason: previousRejection,
              attempt,
            })
          planResult = null
          let attemptOutput = ''
          try {
            planResult = await runPrompt({
              modelKey: primaryModelKey,
              text: attemptPrompt,
              sessionFile: plannerFile,
              noTools: true,
              skill: plannerSkill,
              signal: abortController.signal,
              conversationId,
              cwdOverride: cwd,
              sessionKey: plannerSessionKey,
              webContents: plannerProgress.webContents,
              permissionMode: readOnlyRequest ? 'readonly' : permissionMode,
              ...(plannerOutputSchema === undefined ? {} : { outputSchema: plannerOutputSchema }),
              attachments,
              documents,
            })
            attemptOutput = String(planResult?.text ?? '')
            planned = validateReadOnlyPlanScopesFromIndex(completeReadOnlyPlanScopes(
              validatePlanForRequest(validateAndOrderTasks(parsePlan(attemptOutput)
                .map((task) => normalizePlannerTaskRoute(task, { strict: false }))), originalText, {
                requireParallelImplementationScopes: parallelImplementationAllowed,
                requireCrossProviderReview: shouldAutoReview,
                maxDagNodes: dagNodeLimit,
              }),
              originalText,
              plannerPathHints.paths,
              plannerPathHints.workspaceHints,
            ), plannerPathHints.paths)
            if (shouldAutoReview) {
              const preparedReview = prepareCrossProviderReviewTasks(planned, { maxNodes: dagNodeLimit })
              if (preparedReview.reason) {
                if (preparedReview.reason === 'dag_node_limit') {
                  throw new Error(`交叉审查节点超出 DAG 上限：当前上限为 ${dagNodeLimit}，请减少业务节点或复用现有 review 节点`)
                }
                throw new Error(`交叉审查无法接入：${preparedReview.reason}`)
              }
              planned = validateAndOrderTasks(preparedReview.tasks, { maxNodes: dagNodeLimit })
            }
            const record = {
              attempt,
              plan: attemptOutput.slice(0, 20_000),
              rejectionReason: null,
              accepted: true,
              usage: planResult.usage ?? {},
            }
            runState.plannerAttempts = [...(runState.plannerAttempts ?? []), record]
            await runStore?.saveRun(conversationId, runId, runState)
            await trace('planning_attempt', { attempt, accepted: true, taskIds: planned.map((task) => task.id) })
            ledger.record({ runId, taskId: 'planner', attempt, modelKey: primaryModelKey, usage: planResult.usage ?? {}, outcome: 'success' })
            break
          } catch (error) {
            attemptOutput = attemptOutput || String(error?.partialResult?.text ?? '')
            const reason = String(error?.message ?? error ?? '未知规划错误').slice(0, 2_000)
            const attemptUsage = planResult?.usage ?? error?.partialResult?.usage ?? {}
            runState.plannerAttempts = [...(runState.plannerAttempts ?? []), {
              attempt,
              plan: attemptOutput.slice(0, 20_000),
              rejectionReason: reason,
              accepted: false,
              usage: attemptUsage,
            }]
            await runStore?.saveRun(conversationId, runId, runState)
            await trace('planning_attempt', { attempt, accepted: false, rejectionReason: reason })
            ledger.record({ runId, taskId: 'planner', attempt, modelKey: primaryModelKey, usage: attemptUsage, outcome: 'failed' })
            if (abortController.signal.aborted) throw error
            if (attempt === 3) {
              throw new PlannerFallbackError(reason, { partialUsage: attemptUsage })
            }
            previousOutput = attemptOutput
            previousRejection = reason
            plannerProgress.update(`计划未通过校验，正在进行第 ${attempt + 1} 次有限修正`)
          }
        }
      } finally {
        plannerProgress.dispose()
      }
      await trace('planning_completed', {
        taskCount: planned.length,
        taskIds: planned.map((task) => task.id),
      })
      plannerSessionId = dshRuntime.getSessionId?.(plannerSessionKey) || undefined
      }
      usage = planResult?.usage ? [planResult.usage] : []
      const routingOptions = await buildRoutingOptions({ userDataPath, openUsageBaseUrl: prefs.openUsageBaseUrl })
      const providerByModelKey = new Map(catalog.models.map((model) => [
        model.key,
        model.provider || String(model.key).split('/')[0] || 'unknown',
      ]))
      const routeOpts = { ...routingOptions }
      const allocationCounts = Object.create(null)
      const selected = []
      if (replay) {
        for (const task of planned) {
          const isPending = replay.pendingTaskIds.has(task.id)
          const crossReviewRouting = isPending && task.crossProviderReview === true
            ? selectCrossProviderReviewRoute({
              catalog,
              primaryModelKey,
              implementationModelKeys: planned
                .filter((candidate) => candidate.taskType === 'implementation')
                .map((candidate) => candidate.modelKey),
              routeOptions: { ...routeOpts, allocationCounts },
              needsVision: task.route?.needs_vision === true,
            })
            : null
          const model = crossReviewRouting
            ? crossReviewRouting.model
            : isPending
            ? catalog.models.find((candidate) => candidate.key === task.modelKey
              && candidate.available === true
              && candidate.routeRegistered !== false
              && (!(task.route?.needs_vision === true || taskReferencesImage(task)) || candidate.vision === true))
            : null
          if (isPending && !model && !crossReviewRouting) {
            throw new Error(`运行记录中的模型当前不可用，无法继续节点 ${task.id}：${task.modelKey ?? '未知模型'}`)
          }
          selected.push({
            ...task,
            runId,
            role: task.role || TYPE_LABELS[task.taskType],
            modelKey: model?.key ?? (crossReviewRouting ? null : task.modelKey),
            model: model?.name ?? task.model ?? task.modelKey ?? '未知模型',
            tier: model ? TIER_LABELS[model.profile?.tier ?? 'balanced'] : task.tier,
            ...(crossReviewRouting && !model ? { routeUnavailableReason: crossReviewRouting.reason } : {}),
            ...(crossReviewRouting && model ? {
              routeDecision: {
                ...(task.routeDecision ?? {}),
                strategy: crossReviewRouting.strategy,
                crossProvider: crossReviewRouting.crossProvider === true,
                implementationProviders: crossReviewRouting.implementationProviders,
                reviewProvider: crossReviewRouting.reviewProvider,
                reasons: [
                  ...(crossReviewRouting.reasons ?? []),
                  `跨提供方审查：实现 ${crossReviewRouting.implementationProviders.join(', ')}，审查 ${crossReviewRouting.reviewProvider}`,
                ],
              },
            } : {}),
            status: isPending ? 'queued' : (task.status ?? 'done'),
            statusLabel: isPending ? '排队中' : (task.statusLabel ?? '已完成'),
            duration: isPending ? '' : (task.duration ?? ''),
            detail: task.description,
            messages: Array.isArray(task.messages) ? task.messages : [],
            toolProfile: task.toolProfile || getTaskProfile(task.taskType).id,
            dshSessionKey: `tw-orchestration-${conversationId}-${runId}-${task.id}`,
            permissionMode: READ_ONLY_TASK_TYPES.has(task.taskType) ? 'readonly' : permissionMode,
          })
          if (isPending && model) {
            await trace(crossReviewRouting ? 'cross_provider_review_rerouted' : 'route_reused', {
              taskId: task.id,
              taskType: task.taskType,
              modelKey: model.key,
              ...(crossReviewRouting ? {
                crossProvider: crossReviewRouting.crossProvider === true,
                implementationProviders: crossReviewRouting.implementationProviders,
                reviewProvider: crossReviewRouting.reviewProvider,
                reasons: crossReviewRouting.reasons,
              } : {}),
            })
          } else if (isPending && crossReviewRouting) {
            await trace('cross_provider_review_unavailable', {
              taskId: task.id,
              reason: crossReviewRouting.reason,
              implementationProviders: crossReviewRouting.implementationProviders ?? [],
            })
          }
        }
      } else for (const task of planned) {
        const routing = task.crossProviderReview === true
          ? selectCrossProviderReviewRoute({
            catalog,
            primaryModelKey,
            implementationModelKeys: selected
              .filter((candidate) => candidate.taskType === 'implementation')
              .map((candidate) => candidate.modelKey),
            routeOptions: { ...routeOpts, allocationCounts },
            needsVision: task.route?.needs_vision === true,
          })
          : selectModelForTask(task.taskType, catalog, primaryModelKey, {
            ...routeOpts,
            allocationCounts,
            needsVision: task.route?.needs_vision === true,
          })
        if (!routing.model && task.crossProviderReview !== true) throw new Error(`子任务 ${task.id} 没有可用模型`)
        if (!routing.model) {
          const unavailable = {
            ...task,
            runId,
            role: task.role || TYPE_LABELS[task.taskType],
            modelKey: null,
            model: '无可用的跨提供方审查模型',
            tier: '',
            status: 'queued',
            statusLabel: '排队中',
            duration: '',
            detail: task.description,
            reasons: [...(task.reasons ?? []), routing.reason],
            routeReason: routing.reason,
            routeUnavailableReason: routing.reason,
            routeDecision: {
              strategy: 'unavailable',
              reasons: [routing.reason],
              crossProvider: true,
              implementationProviders: routing.implementationProviders ?? [],
            },
            messages: [{
              id: `${task.id}-plan`,
              author: 'orchestrator',
              name: 'TaskWeaver',
              time: nowLabel(),
              text: `交叉审查暂不可用：${routing.reason}`,
            }],
            toolProfile: getTaskProfile(task.taskType).id,
            dshSessionKey: `tw-orchestration-${conversationId}-${runId}-${task.id}`,
            permissionMode: 'readonly',
          }
          selected.push(unavailable)
          await trace('cross_provider_review_unavailable', {
            taskId: task.id,
            reason: routing.reason,
            implementationProviders: routing.implementationProviders ?? [],
          })
          continue
        }
        for (const providerId of routing.allocationProviders ?? []) {
          allocationCounts[providerId] = (allocationCounts[providerId] ?? 0) + 1
        }
        const profile = routing.model.profile
        const message = {
          id: `${task.id}-plan`,
          author: 'orchestrator',
          name: 'TaskWeaver',
          time: nowLabel(),
          text: `已创建子任务：${task.description}`,
        }
        selected.push({
          ...task,
          runId,
          role: task.role || TYPE_LABELS[task.taskType],
          modelKey: routing.model.key,
          model: routing.displayName || routing.model.name,
          tier: TIER_LABELS[profile?.tier ?? 'balanced'],
          status: 'queued',
          statusLabel: '排队中',
          duration: '',
          detail: task.description,
          confidence: routing.confidence ? `${Math.round(routing.confidence * 100)}%` : '',
          reasons: [...task.reasons, routing.reason],
          messages: [message],
          routeReason: routing.reason,
          routeDecision: {
            strategy: routing.strategy,
            displayName: routing.displayName,
            reasons: task.crossProviderReview === true
              ? [...(routing.reasons ?? []), `跨提供方审查：实现 ${routing.implementationProviders.join(', ')}，审查 ${routing.reviewProvider}`]
              : routing.reasons,
            confidence: routing.confidence,
            estimatedCost: routing.estimatedCost,
            costEstimate: routing.costEstimate,
            ...(task.crossProviderReview === true ? {
              crossProvider: routing.crossProvider === true,
              implementationProviders: routing.implementationProviders,
              reviewProvider: routing.reviewProvider,
            } : {}),
          },
          toolProfile: getTaskProfile(task.taskType).id,
          dshSessionKey: `tw-orchestration-${conversationId}-${runId}-${task.id}`,
          permissionMode: READ_ONLY_TASK_TYPES.has(task.taskType) ? 'readonly' : permissionMode,
        })
        await trace('route_decision', {
          taskId: task.id,
          taskType: task.taskType,
          modelKey: routing.model.key,
          strategy: routing.strategy,
          reasons: task.crossProviderReview === true
            ? [...(routing.reasons ?? []), `跨提供方审查：实现 ${routing.implementationProviders.join(', ')}，审查 ${routing.reviewProvider}`]
            : routing.reasons ?? [routing.reason].filter(Boolean),
          estimatedCost: routing.estimatedCost,
          ...(task.crossProviderReview === true ? {
            crossProvider: true,
            implementationProviders: routing.implementationProviders,
            reviewProvider: routing.reviewProvider,
          } : {}),
        })
      }
      const implementationCount = selected.filter((task) => task.taskType === 'implementation').length
      if (implementationCount > 1) {
        const parallelNote = parallelImplementationAllowed
          ? '已启用 Worktree 隔离且工作区干净；writeScopes 不重叠的实现节点会并行执行，下游测试/审查会继承依赖分支，结束后生成集成分支供预览/合并。'
          : !prefs.worktreeIsolation
            ? '实现节点将串行执行；如需并行，请启用设置中的 Worktree 隔离。'
            : '实现节点将串行执行；并行 worktree 需要干净的 Git 工作区和可用的应用数据目录。'
        sendChatStreamIfAvailable(webContents, { type: 'progress', text: parallelNote, conversationId })
      }
      let tasks = layoutTasks(selected)
      const initialWriterBranches = replay
        ? new Map(replay.source.tasks
          .filter((task) => replay.initialResults.has(task.id)
            && ['implementation', 'test'].includes(task.taskType)
            && typeof task.execBranch === 'string'
            && task.execBranch)
          .map((task) => [task.id, task.execBranch]))
        : null
      const nodeWorkspace = createNodeWorkspaceRegistry({
        enabled: parallelWorktreeBaselineReady,
        workspacePath: cwd,
        conversationId,
        runId,
        userDataPath,
        baseCommit: runBaseCommit,
        tasks,
        signal: abortController.signal,
        initialWriterBranches,
      })
      runState.baseCommit = runBaseCommit
      const approvalMode = ['always', 'write-only', 'never'].includes(dagPlanApprovalOverride)
        ? dagPlanApprovalOverride
        : (['always', 'write-only', 'never'].includes(prefs.dagPlanApproval) ? prefs.dagPlanApproval : 'write-only')
      const requiresApproval = !replay && (approvalMode === 'always' || (approvalMode === 'write-only' && implementationCount > 0))
      if (requiresApproval) {
        tasks = tasks.map((task) => ({ ...task, statusLabel: '待审批', runStatus: 'awaiting_approval' }))
      } else {
        tasks = tasks.map((task) => ({
          ...task,
          runStatus: replay && replay.initialResults.has(task.id) ? 'completed' : 'running',
        }))
      }
      for (const task of tasks) {
        taskAbortControllers.set(task.id, new AbortController())
        taskStatuses.set(task.id, task.status)
      }
      if (abortController.signal.aborted) abortTaskControllers()

      run.onPauseChange = async (paused) => {
        runState.status = paused ? 'paused' : 'running'
        run.status = runState.status
        tasks = tasks.map((task) => ({
          ...task,
          runStatus: task.status === 'done' ? 'completed' : (paused ? 'paused' : 'running'),
        }))
        runState.tasks = tasks
        await runStore?.saveRun(conversationId, runId, runState)
        await trace(paused ? 'run_paused' : 'run_resumed')
        await publishTasks(tasks, webContents, conversationId)
      }

      runState.tasks = tasks
      runState.status = requiresApproval ? 'awaiting_approval' : 'running'
      run.status = runState.status
      run.schedulerActive = !requiresApproval
      await runStore?.saveRun(conversationId, runId, runState)
      await publishTasks(tasks, webContents, conversationId)
      if (requiresApproval) {
        let resolveApproval
        let rejectApproval
        const approvalResult = new Promise((resolve, reject) => {
          resolveApproval = resolve
          rejectApproval = reject
        })
        const approvalOutcome = approvalResult.then(
          (approvedTasks) => ({ approvedTasks }),
          (error) => ({ error }),
        )
        pendingApprovals.set(runId, {
          conversationId,
          resolve: resolveApproval,
          reject: rejectApproval,
          validate: (changes) => {
            const changedTasks = applyPlanApprovalChanges(tasks, changes, { catalog })
            const validatedTasks = validatePlanForRequest(validateAndOrderTasks(changedTasks, { maxNodes: dagNodeLimit }), originalText, {
              requireParallelImplementationScopes: parallelImplementationAllowed,
              maxDagNodes: dagNodeLimit,
            })
            return layoutTasks(validatedTasks)
          },
        })
        sendChatStreamIfAvailable(webContents, { type: 'plan_approval_required', conversationId, runId, taskCount: tasks.length })
        await trace('plan_approval_requested', { taskCount: tasks.length })
        try {
          if (abortController.signal.aborted) throw new Error('任务已取消')
          const removeAbortListener = () => abortController.signal.removeEventListener('abort', onAbort)
          const onAbort = () => {
            const pending = pendingApprovals.get(runId)
            if (pending?.conversationId === conversationId) pendingApprovals.delete(runId)
            rejectApproval(new Error('任务已取消'))
          }
          abortController.signal.addEventListener('abort', onAbort, { once: true })
          try {
            const outcome = await approvalOutcome
            if (outcome.error) throw outcome.error
            tasks = outcome.approvedTasks
          } finally {
            removeAbortListener()
          }
          tasks = tasks.map((task) => ({ ...task, statusLabel: '排队中', runStatus: 'running' }))
          runState.tasks = tasks
          runState.status = 'running'
          run.status = 'running'
          run.schedulerActive = true
          await runStore?.saveRun(conversationId, runId, runState)
          await publishTasks(tasks, webContents, conversationId)
          await trace('plan_approval_approved', { taskCount: tasks.length })
        } catch (e) {
          const rejected = e?.message === '用户已拒绝执行该计划'
          if (rejected) {
            tasks = tasks.map((task) => ({ ...task, status: 'cancelled', statusLabel: '计划已拒绝', runStatus: 'rejected' }))
            runState.tasks = tasks
            runState.status = 'rejected'
            run.status = 'rejected'
            await runStore?.saveRun(conversationId, runId, runState)
            await publishTasks(tasks, webContents, conversationId)
            await trace('plan_approval_rejected', { taskCount: tasks.length })
          } else {
            tasks = tasks.map((task) => ({ ...task, status: 'cancelled', statusLabel: '已停止', runStatus: 'cancelled' }))
            runState.tasks = tasks
            runState.status = 'cancelled'
            run.status = 'cancelled'
            await runStore?.saveRun(conversationId, runId, runState)
            await publishTasks(tasks, webContents, conversationId)
          }
          pendingApprovals.delete(runId)
          if (rejected) {
            const rejection = new Error('用户已拒绝执行该计划')
            rejection.code = 'DAG_PLAN_REJECTED'
            throw rejection
          }
          throw e
        }
      }

      runState.status = 'running'
      run.status = 'running'
      await runStore?.saveRun(conversationId, runId, runState)

      const worktreeTaskIds = []

      let budgetExceededReason = null
      const execution = await executeDag(tasks, {
        signal: abortController.signal,
        getTaskSignal: (taskId) => taskAbortControllers.get(taskId)?.signal,
        maxConcurrency: dagConcurrency,
        maxNodes: dagNodeLimit,
        maxConcurrencyPerProvider: maxProviderConcurrency,
        getTaskProvider: (task) => providerByModelKey.get(task.modelKey) || String(task.modelKey ?? '').split('/')[0] || 'unknown',
        allowParallelImplementation: parallelImplementationAllowed,
        pauseGate: () => pauseControl.waitUntilResumed(),
        checkBudget: async () => {
          if (budgetExceededReason) return budgetExceededReason
          const summary = ledger.getSummary()
          if (summary.totalTokens > dagBudgetTokens) {
            budgetExceededReason = `超出预算（> ${dagBudgetTokens} tokens）`
            await trace('budget_exceeded', {
              budgetTokens: dagBudgetTokens,
              budgetUsd: dagBudgetUsd,
              totalTokens: summary.totalTokens,
              totalCostUsd: summary.totalCostUsd,
            })
            return budgetExceededReason
          }
          if (summary.totalCostUsd > dagBudgetUsd) {
            budgetExceededReason = `超出预算（> $${dagBudgetUsd}）`
            await trace('budget_exceeded', {
              budgetTokens: dagBudgetTokens,
              budgetUsd: dagBudgetUsd,
              totalTokens: summary.totalTokens,
              totalCostUsd: summary.totalCostUsd,
            })
            return budgetExceededReason
          }
          return null
        },
        ...(replay ? {
          initialResults: replay.initialResults,
          initialFailedIds: [...replay.initialFailedIds],
          pendingTaskIds: [...replay.pendingTaskIds],
        } : {}),
        onTaskChange: async (changed, meta) => {
          taskStatuses.set(changed.id, changed.status)
          const previousTask = tasks.find((task) => task.id === changed.id)
          const transitionAt = new Date().toISOString()
          let lifecycle = {}
          if (changed.status === 'running') {
            lifecycle = { startedAt: previousTask?.startedAt ?? transitionAt, endedAt: undefined, durationMs: null }
            await trace('node_started', {
              taskId: changed.id,
              taskType: changed.taskType,
              modelKey: changed.modelKey,
              startedAt: lifecycle.startedAt,
            })
          } else if (!['queued', 'running'].includes(changed.status)) {
            const startedAt = previousTask?.startedAt ?? changed.startedAt
            const durationMs = startedAt ? Math.max(0, Date.parse(transitionAt) - Date.parse(startedAt)) : null
            lifecycle = {
              ...(startedAt ? { startedAt } : {}),
              endedAt: transitionAt,
              durationMs,
              duration: durationMs === null ? '' : durationMs < 1000
                ? `${durationMs}ms`
                : durationMs < 60_000
                  ? `${(durationMs / 1000).toFixed(1)}s`
                  : `${Math.floor(durationMs / 60_000)}m ${Math.floor((durationMs % 60_000) / 1000)}s`,
              usageSummary: ledger.getTaskSummary(changed.id),
            }
            await trace('node_finished', {
              taskId: changed.id,
              taskType: changed.taskType,
              status: changed.status,
              statusLabel: changed.statusLabel,
              modelKey: meta?.result?.upgradedTo ?? changed.modelKey,
              startedAt: startedAt ?? null,
              endedAt: transitionAt,
              durationMs,
              errorCode: meta?.error?.code ?? null,
              verification: meta?.result?.verification ?? null,
            })
          }
          const taskChange = { ...changed, ...lifecycle, runStatus: pauseControl.paused ? 'paused' : 'running' }
          if (changed.status === 'running') {
            sendChatStreamIfAvailable(webContents, { type: 'progress', text: `正在执行 ${changed.id} · ${changed.title}（${changed.model}）…`, conversationId })
          }
          tasks = tasks.map((task) => {
            if (task.id !== changed.id) return task
            if (meta?.result) {
              const upgradedTo = meta.result.upgradedTo
              const upgradeNote = meta.result.upgradeReason
                ? `\n\n（经过 ${meta.result.upgradeAttempts ?? 1} 次模型升级重试，最终使用 ${meta.result.upgradedDisplayName ?? changed.model}：${meta.result.upgradeReason}）`
                : ''
              return {
                ...task,
                ...taskChange,
                worktreeIsolated: meta.result.worktreeIsolated === true || task.worktreeIsolated,
                ...(meta.result.execBranch ? { execBranch: meta.result.execBranch } : {}),
                ...(meta.result.execCommit ? { execCommit: meta.result.execCommit } : {}),
                ...(meta.result.execCwd ? { execCwd: meta.result.execCwd } : {}),
                ...(meta.result.acceptanceAssessment ? { acceptanceAssessment: meta.result.acceptanceAssessment } : {}),
                ...(upgradedTo
                  ? {
                    modelKey: upgradedTo,
                    model: meta.result.upgradedDisplayName ?? changed.model,
                    routeReason: meta.result.upgradeReason ?? changed.routeReason,
                  }
                  : {}),
                executionEvidenceSummary: summarizeExecutionEvidence(meta.result.executionEvidence),
                messages: [...task.messages, {
                  id: `${changed.id}-assistant`,
                  author: 'agent',
                  name: changed.role,
                  time: nowLabel(),
                  text: meta.result.completionAssessment?.complete === false
                    ? `未完成：${meta.result.completionAssessment.reason || '证据不足。'}${meta.result.text ? `\n\n${meta.result.text}` : ''}${upgradeNote}`
                    : meta.result.text
                      ? meta.result.text + upgradeNote
                      : `未完成：${meta.result.completionAssessment?.reason || 'Agent 未返回最终文本。'}`,
                  modelKey: upgradedTo ?? changed.modelKey,
                  usage: meta.result.usage,
                  fileChanges: meta.result.fileChanges,
                  verification: meta.result.verification,
                  verificationRequired: meta.result.verificationRequired === true,
                  acceptanceAssessment: meta.result.acceptanceAssessment,
                  executionEvidence: meta.result.executionEvidence ?? null,
                  executionEvidenceSummary: summarizeExecutionEvidence(meta.result.executionEvidence),
                }],
              }
            }
            if (meta?.error) {
              const partial = meta.error.partialResult ?? {}
              const evidence = meta.error.executionEvidence ?? partial.executionEvidence ?? null
              const reason = meta.error.message || '子任务未能生成最终结果'
              return {
                ...task,
                ...taskChange,
                executionEvidenceSummary: summarizeExecutionEvidence(evidence),
                messages: [...task.messages, {
                  id: `${changed.id}-assistant`,
                  author: 'agent',
                  name: changed.role,
                  time: nowLabel(),
                  text: partial.text || `未完成：${reason}`,
                  modelKey: changed.modelKey,
                  usage: partial.usage,
                  fileChanges: partial.fileChanges,
                  executionEvidence: evidence,
                  executionEvidenceSummary: summarizeExecutionEvidence(evidence),
                }],
              }
            }
            return { ...task, ...taskChange }
          })
          runState.tasks = tasks
          await runStore?.saveRun(conversationId, runId, runState)
          await publishTasks(tasks, webContents, conversationId)
        },
        execute: async (task, dependencyResults, taskSignal, executionMode = {}) => {
          if (task.crossProviderReview === true && !task.modelKey) {
            throw new Error(task.routeUnavailableReason || '没有可用的跨提供方审查模型；交叉审查未运行。')
          }
          const childFile = path.join(agentDataPath, 'orchestration', conversationId, runId, `${task.id}.jsonl`)
          const projectMemory = await memory.load(conversationId)
          const workspaceRoot = cwd
          let execCwd = workspaceRoot
          let execBranch = null
          let execStartCommit = null
          let worktreeNote = ''
          const wantsWorktree = runWorktreeIsolation || executionMode.parallelWriteIsolation === true
          const supportsWorktree = ['implementation', 'test', 'review'].includes(task.taskType)
          if (wantsWorktree && workspaceRoot && supportsWorktree) {
            if (!userDataPath) {
              const reason = '应用数据目录不可用'
              if (executionMode.parallelWriteIsolation === true) {
                throw new Error(`任务 ${task.id} 无法创建独立 worktree，并行实现已安全停止：${reason}`)
              }
              worktreeNote = `\n\n（${reason}，回退到主工作区执行。）`
            } else if (!nodeWorkspace.enabled) {
              const reason = '需要启用 worktree 隔离且运行基线必须是干净 Git 提交'
              if (executionMode.parallelWriteIsolation === true) {
                throw new Error(`任务 ${task.id} 无法创建独立 worktree，并行实现已安全停止：${reason}`)
              }
              worktreeNote = `\n\n（${reason}，本节点在会话工作区执行。）`
            } else {
              try {
                const wt = await nodeWorkspace.create(task)
                if (executionMode.parallelWriteIsolation === true && wt.reused) {
                  throw new Error(`任务 ${task.id} 已有旧 worktree；为避免复用旧代码，不能启动并行实现`)
                }
                execCwd = wt.path
                execBranch = wt.branchName
                execStartCommit = wt.startCommit
                worktreeTaskIds.push(task.id)
                worktreeNote = `\n\n（在隔离分支 ${wt.branchName} 中执行；仅合并已完成的依赖写节点，最终改动保留在集成分支供预览。）`
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                if (error?.code === 'WORKTREE_MERGE_CONFLICT') throw error
                if (executionMode.parallelWriteIsolation === true) {
                  throw new Error(`任务 ${task.id} 无法创建独立 worktree，并行实现已安全停止：${message}`)
                }
                throw new Error(`任务 ${task.id} 无法创建隔离 worktree：${message}`)
              }
            }
          }
          task.execCwd = execCwd
          task.execBranch = execBranch
          task.execStartCommit = execStartCommit
          task.worktreeIsolated = Boolean(execBranch)
          task.permissionMode = READ_ONLY_TASK_TYPES.has(task.taskType) ? 'readonly' : permissionMode
          const profile = getTaskProfile(task.taskType)
          const subtaskSkill = resolveSkillForSubtask(skill, task.taskType)
          const buildPrompt = (evidenceBundle = null) => {
            const memoryBlock = buildMemoryPromptSections(projectMemory, task, dependencyResults, { evidenceBundle })
            const parts = [
              profile.preamble,
              ...(Array.isArray(contextLayers) && contextLayers.length > 0 ? [
                `【共享的主会话上下文】\n${contextLayers.map(layer => `[${layer.id}]\n${layer.text}`).join('\n\n')}`,
              ] : []),
              memoryBlock,
              `当前子任务 ${task.id}：${task.title}\n${task.description}`,
              `职责：${task.role}。任务类型：${task.taskType}。工具档：${profile.id}。`,
              Array.isArray(task.acceptance) && task.acceptance.length > 0
                ? `【本节点验收点】\n${task.acceptance.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n')}\n请在最终回答末尾附上以下结构化报告，逐项原样复用 criterion；只有证据支持时 passed 才能为 true，无法证明则填 false，并填写可核对的证据文本：\n${'<taskweaver-acceptance-v1>{"results":[{"criterion":"验收点原文","passed":true,"evidence":"可核对证据"}]}</taskweaver-acceptance-v1>'}`
                : '',
              execCwd !== workspaceRoot ? `执行目录（隔离 worktree）：${execCwd}` : '',
            ]
            if (task.taskType === 'test' && workspaceRoot) {
              const policy = detectVerificationCommands(workspaceRoot)
              const cmd = policy?.primaryCommand || policy?.testCommand
              if (cmd) {
                parts.push(`【推荐验证命令】优先运行：\`${cmd}\`（若不适配本子任务可说明原因后选用其他命令）。`)
              }
            }
            parts.push('完成后简要说明做了什么、修改了哪些文件、验证结果和仍存在的问题。不要声称未实际执行的验证已经通过。')
            if (READ_ONLY_TASK_TYPES.has(task.taskType)) {
              parts.push('只读范围执行规则：scopePaths 是执行层强制白名单且已覆盖本任务验收点。所有文件工具路径必须使用工作区相对路径，禁止传绝对路径。对其中列出的字面文件路径，不要用 glob/ls 再确认是否存在，直接 read；若需定位未给出的符号，只对该文件 grep 一次。只有直接读取报告路径不存在时，才在已授权范围内搜索替代路径。不要对父目录或工作区执行 glob/ls。被拒绝的范围外探索不代表本任务缺少证据；只有任务明确要求的验收点无法由授权文件证明时，才报告任务未完成。不要把未要求的相邻模块或内部实现列为证据缺口。')
              parts.push(`<taskweaver-readonly-scope-v1>${JSON.stringify({ paths: task.scopePaths })}</taskweaver-readonly-scope-v1>`)
            }
            if (task.taskType === 'implementation' && Array.isArray(task.writeScopes) && task.writeScopes.length > 0) {
              parts.push(`实现写入范围：仅修改以下文件或目录：${task.writeScopes.join('、')}。不要编辑范围外文件；如果实现必须扩大范围，先在最终答复中说明原因，不要自行扩展。`)
            }
            return parts.filter(Boolean).join('\n\n')
          }

          const writerTask = task.taskType === 'implementation' || task.taskType === 'test'
          const workspaceMutationBefore = writerTask && !execBranch
            ? await getGitWorkspaceMutationFingerprint(execCwd)
            : null
          let resetPendingRetry = false
          const nodeTimeouts = resolveNodeTimeouts(task.taskType, prefs)
          const runSubtask = async (modelKey, evidenceBundle = null) => {
            const attemptNo = evidenceBundle ? evidenceBundle.attempted_actions.length + 1 : 1
            const deadline = createNodeDeadline({
              parentSignal: taskSignal,
              ...nodeTimeouts,
              onTimeout: (timeoutError) => sendChatStreamIfAvailable(webContents, {
                type: 'progress',
                text: `子任务 ${task.id} ${timeoutError.code === 'ETASK_IDLE_TIMEOUT' ? '因无流事件超时' : '超过运行时限'}，正在停止当前尝试…`,
                conversationId,
              }),
            })
            try {
              const turn = runPrompt({
                modelKey,
                text: buildPrompt(evidenceBundle),
                sessionFile: childFile,
                taskType: task.taskType,
                skill: subtaskSkill,
                webContents,
                taskId: task.id,
                cwdOverride: execCwd,
                signal: deadline.signal,
                onActivity: () => deadline.touch(),
                conversationId,
                parentSessionId: plannerSessionId,
                permissionMode: task.permissionMode,
                ...(task.taskType === 'implementation' && Array.isArray(task.writeScopes)
                  ? { writeScopes: task.writeScopes }
                  : {}),
                ...(documents?.length ? { documents } : {}),
                sessionKey: evidenceBundle
                  ? `${task.dshSessionKey}-escalation-${evidenceBundle.attempted_actions.length}`
                  : task.dshSessionKey,
              })
              const res = await waitForNodeTurn(turn, deadline.signal)
              ledger.record({ runId, taskId: task.id, attempt: attemptNo, modelKey, usage: res.usage ?? {}, outcome: 'success' })
              return res
            } catch (error) {
              const timeoutReason = deadline.signal.reason
              if (['ETASK_TIMEOUT', 'ETASK_IDLE_TIMEOUT'].includes(timeoutReason?.code)
                && !['ETASK_TIMEOUT', 'ETASK_IDLE_TIMEOUT'].includes(error?.code)) {
                const timeoutError = new Error(timeoutReason.message, { cause: error })
                timeoutError.name = timeoutReason.name
                timeoutError.code = timeoutReason.code
                timeoutError.kind = 'timeout'
                timeoutError.partialResult = error?.partialResult
                timeoutError.executionEvidence = error?.executionEvidence
                error = timeoutError
              }
              const partialUsage = error.partialResult?.usage
              ledger.record({ runId, taskId: task.id, attempt: attemptNo, modelKey, usage: partialUsage ?? {}, outcome: 'failed' })
              throw error
            } finally {
              deadline.dispose()
            }
          }

          const subtaskUpgradeMax = Math.max(0, Math.min(3, Number(prefs.subtaskUpgradeMax ?? 1) || 0))
          let execution
          try {
            execution = await runWithSubtaskRetries({
              task,
              initialModelKey: task.modelKey,
              maxRetries: subtaskUpgradeMax,
              canRetry: ({ failure, attempt }) => {
                if ((writerTask && failure.kind === 'execution' || failure.kind === 'timeout') && attempt > 1) return false
                return shouldUpgradeFailedTask(task.taskType, failure)
              },
              signal: taskSignal,
              run: runSubtask,
              prepareRetry: async () => {
                if (!writerTask) return null
                if (execBranch) {
                  const evidence = await captureNodeWorktreeFailureEvidence({
                    workspacePath: workspaceRoot,
                    conversationId,
                    runId,
                    taskId: task.id,
                    userDataPath,
                    startCommit: execStartCommit,
                  })
                  resetPendingRetry = true
                  return { allowRetry: true, evidenceBundle: evidence }
                }
                const currentFingerprint = await getGitWorkspaceMutationFingerprint(execCwd)
                if (workspaceMutationBefore === null || currentFingerprint !== workspaceMutationBefore) {
                  return {
                    allowRetry: false,
                    evidenceBundle: {
                      related_files: [],
                      diff: null,
                    },
                  }
                }
                return { allowRetry: true }
              },
              failureDomainForModel: (modelKey) => {
                const model = catalog.models.find((candidate) => candidate.key === modelKey)
                return model ? modelFailureDomain(model) : null
              },
              chooseModel: async ({ excludeModelKeys, excludeFailureDomains, previousModelKey }) => {
                const freshCatalog = await modelService.listCatalog()
                const currentModel = freshCatalog.models.find((candidate) => candidate.key === previousModelKey)
                const currentTier = currentModel?.profile?.tier ?? 'balanced'
                const upgrade = selectModelForTask(task.taskType, freshCatalog, primaryModelKey, {
                  ...routeOpts,
                  excludeModelKeys,
                  excludeFailureDomains,
                  minTier: currentTier,
                  preferTier: nextTaskTier(task.taskType, currentTier),
                  needsVision: task.route?.needs_vision === true,
                })
                if (!upgrade.model) return null
                return {
                  modelKey: upgrade.model.key,
                  displayName: upgrade.displayName || upgrade.model.name,
                  reason: upgrade.reason,
                }
              },
              onRetry: async ({ modelKey: retryModelKey, displayName, attempt, maxRetries, failure, evidenceBundle }) => {
                await memory.recordEvidenceBundle(conversationId, evidenceBundle)
                if (resetPendingRetry && execBranch) {
                  await resetNodeWorktree({
                    workspacePath: workspaceRoot,
                    conversationId,
                    runId,
                    taskId: task.id,
                    userDataPath,
                    startCommit: execStartCommit,
                  })
                  resetPendingRetry = false
                }
                await trace('node_retry', {
                  taskId: task.id,
                  attempt,
                  previousModel: task.modelKey,
                  modelKey: retryModelKey,
                  displayName,
                  failureKind: failure.kind,
                  failureStage: failure.failureStage ?? null,
                })
                sendChatStreamIfAvailable(webContents, {
                  type: 'progress',
                  text: `子任务 ${task.id} 失败（${failure.failureStage ?? failure.kind}），正在尝试模型升级重试（${attempt}/${maxRetries}：${displayName}）…`,
                  conversationId,
                })
              },
            })
          } catch (error) {
            if (error?.evidenceBundle) await memory.recordEvidenceBundle(conversationId, error.evidenceBundle)
            throw error
          }
          const { result } = execution
          const modelKey = execution.modelKey
          if (execution.attempts > 0) {
            result.upgradedFrom = task.modelKey
            result.upgradedTo = modelKey
            result.upgradedDisplayName = execution.candidate.displayName
            result.upgradeReason = execution.candidate.reason
            result.upgradeAttempts = execution.attempts
          }

          if (worktreeNote && result.text) result.text += worktreeNote
          result.worktreeIsolated = execCwd !== workspaceRoot

          const hasFileChanges = Array.isArray(result.fileChanges) && result.fileChanges.some((change) => typeof change?.path === 'string' && change.path)
          const verificationPolicy = detectVerificationCommands(execCwd)
          if (task.taskType === 'implementation' && hasFileChanges) {
            result.verificationRequired = Boolean(verificationPolicy.primaryCommand)
            if (!verificationPolicy.primaryCommand) {
              result.verification = {
                status: 'not_run',
                executed: false,
                command: null,
                passed: false,
                exitCode: null,
                reason: '工作区未检测到标准验证命令。',
              }
            } else if (!runState.workspaceTrusted || permissionMode === 'readonly') {
              result.verification = {
                status: 'skipped',
                executed: false,
                command: verificationPolicy.primaryCommand,
                passed: false,
                exitCode: null,
                reason: '工作区未受信任或当前为只读权限，未自动运行验证命令。',
              }
            } else {
              try {
                const verifyRes = await executeVerificationRunner(execCwd, {
                  commandOverride: verificationPolicy.primaryCommand,
                  timeoutMs: 5 * 60 * 1000,
                  signal: abortController.signal,
                })
                if (verifyRes.cancelled || abortController.signal.aborted) {
                  throw abortController.signal.reason ?? new Error('任务已取消')
                }
                result.verification = {
                  status: verifyRes.status,
                  executed: verifyRes.executed,
                  command: verifyRes.command,
                  passed: verifyRes.passed,
                  exitCode: verifyRes.exitCode,
                  durationMs: verifyRes.durationMs,
                  timedOut: verifyRes.timedOut,
                  errorSummary: verifyRes.errorSummary,
                }
                if (verifyRes.executed && !verifyRes.passed && result.text) {
                  result.text += `\n\n> [!WARNING]\n> **验收验证未通过**（\`${verifyRes.command}\`，退出码 ${verifyRes.exitCode}）：\n\`\`\`\n${(verifyRes.errorSummary || verifyRes.stderr || verifyRes.stdout).slice(0, 1000)}\n\`\`\``
                }
              } catch (error) {
                if (abortController.signal.aborted) throw error
                result.verification = {
                  status: 'failed',
                  executed: false,
                  command: verificationPolicy.primaryCommand,
                  passed: false,
                  exitCode: null,
                  reason: error instanceof Error ? error.message : String(error),
                }
              }
            }
          }

          // implementation / test 类型子任务产生文件修改时，自动运行静默自检
          if (shouldRunSelfHealingVerification({
            selfHealingEnabled: prefs.selfHealingLoop,
            taskType: task.taskType,
            hasFileChanges: Array.isArray(result.fileChanges) && result.fileChanges.some((change) => typeof change?.path === 'string' && change.path),
            hasVerification: Boolean(result.verification),
            workspaceTrusted: runState.workspaceTrusted,
            permissionMode,
            execCwd,
          })) {
            try {
              const verifyRes = await executeVerificationRunner(execCwd, {
                timeoutMs: 25_000,
                signal: abortController.signal,
              })
              if (verifyRes.cancelled || abortController.signal.aborted) {
                throw abortController.signal.reason ?? new Error('任务已取消')
              }
              result.verification = {
                status: verifyRes.status,
                executed: verifyRes.executed,
                command: verifyRes.command,
                passed: verifyRes.passed,
                exitCode: verifyRes.exitCode,
                durationMs: verifyRes.durationMs,
              }
              if (verifyRes.executed && !verifyRes.passed) {
                if (result.text) {
                  result.text += `\n\n> [!WARNING]\n> **轻量自检未通过**（\`${verifyRes.command}\`，退出码 ${verifyRes.exitCode}）：\n\`\`\`\n${(verifyRes.errorSummary || verifyRes.stderr || verifyRes.stdout).slice(0, 1000)}\n\`\`\``
                }
              }
            } catch (err) {
              if (abortController.signal.aborted) throw err
              // ignore verification error
            }
          }

          const commandVerification = summarizeCommandVerification(result.executionEvidence, result.verification)
          if (task.taskType === 'test') result.verificationRequired = true
          if (commandVerification.present) {
            result.verification = {
              status: commandVerification.status,
              executed: commandVerification.executed,
              command: commandVerification.command,
              passed: commandVerification.passed,
              exitCode: commandVerification.exitCode,
              source: commandVerification.source,
              commands: commandVerification.observed.map((call) => ({
                command: call.commandSummary,
                status: call.status,
                source: call.verificationSource ?? 'z-host-tool-events',
                exitCode: call.commandOutcome?.exitCode ?? null,
                background: call.commandOutcome?.background === true,
                timedOut: call.commandOutcome?.timedOut === true,
                sandboxDenied: call.commandOutcome?.sandboxDenied === true,
                ...(call.commandOutcome?.signal ? { signal: call.commandOutcome.signal } : {}),
              })),
              ...(commandVerification.reason ? { reason: commandVerification.reason } : {}),
            }
          } else if (task.taskType === 'test' && !result.verification) {
            result.verification = {
              status: 'not_run',
              executed: false,
              command: null,
              passed: false,
              exitCode: null,
              source: 'z-host-tool-events',
              reason: 'Host 未记录到 test/build/check 验证命令',
            }
          }

          result.acceptanceAssessment = assessAcceptanceCriteria(task, result.text)
          result.completionAssessment = assessSubtaskCompletion(task, result)
          const verificationStatus = result.verification?.status
          const verificationBlocksCompletion = result.verification && (
            ['failed', 'partial', 'incomplete', 'skipped'].includes(verificationStatus)
            || (result.verificationRequired === true && verificationStatus !== 'passed')
            || (!verificationStatus && result.verification.passed !== true)
          )
          if (verificationBlocksCompletion) {
            result.completionAssessment.complete = false
            result.completionAssessment.reason = result.verification.reason
              || `验证命令 ${result.verification.command} 未通过 (${result.verification.exitCode ?? '未执行'})`
          }

          if (result.completionAssessment.complete && execBranch && writerTask) {
            const committed = await nodeWorkspace.commit(task)
            result.execBranch = committed.branchName
            result.execCommit = committed.commit
            result.execCwd = execCwd
          }

          usage.push(result.usage)
          await memory.recordTaskResult(conversationId, {
            ...task,
            statusLabel: result.completionAssessment.complete ? '已完成' : '验证未通过',
            modelKey,
          }, result)
          return result
        },
      })
      run.schedulerActive = false
      run.status = 'finalizing'
      runState.status = 'finalizing'
      tasks = tasks.map((task) => ({ ...task, runStatus: task.status === 'done' ? 'completed' : 'finalizing' }))
      runState.tasks = tasks
      await runStore?.saveRun(conversationId, runId, runState)
      await publishTasks(tasks, webContents, conversationId)

      let integrationError = null
      let integrationVerificationFailure = null
      if (nodeWorkspace.enabled && !execution.cancelled) {
        try {
          const integration = await nodeWorkspace.createIntegration()
          if (integration) {
            worktreeTaskIds.push('integration')
            runState.integration = {
              status: 'ready',
              taskId: 'integration',
              runId,
              branchName: integration.branchName,
              path: integration.path,
              baseCommit: runBaseCommit,
              mergedBranches: integration.mergedBranches ?? [],
            }
            if (abortController.signal.aborted) throw abortController.signal.reason ?? new Error('任务已取消')
            const verificationPolicy = detectVerificationCommands(integration.path)
            if (verificationPolicy.primaryCommand) {
              if (runState.workspaceTrusted && permissionMode !== 'readonly') {
                const verifyRes = await executeVerificationRunner(integration.path, {
                  commandOverride: verificationPolicy.primaryCommand,
                  timeoutMs: 5 * 60 * 1000,
                  signal: abortController.signal,
                })
                runState.integration.verification = {
                  status: verifyRes.status,
                  executed: verifyRes.executed,
                  command: verifyRes.command,
                  passed: verifyRes.passed,
                  exitCode: verifyRes.exitCode,
                  durationMs: verifyRes.durationMs,
                  timedOut: verifyRes.timedOut,
                  errorSummary: verifyRes.errorSummary,
                }
                if (verifyRes.cancelled || abortController.signal.aborted) {
                  throw abortController.signal.reason ?? new Error('任务已取消')
                }
              } else {
                runState.integration.verification = {
                  status: 'skipped',
                  executed: false,
                  command: verificationPolicy.primaryCommand,
                  passed: false,
                  exitCode: null,
                  reason: '工作区未受信任或当前为只读权限，未自动运行集成验证。',
                }
              }
              if (!runState.integration.verification.passed) {
                integrationVerificationFailure = runState.integration.verification.reason
                  || `集成分支验证未通过：${runState.integration.verification.command}`
                runState.integration.status = 'verification_failed'
                await trace('integration_verification_failed', {
                  command: runState.integration.verification.command,
                  executed: runState.integration.verification.executed,
                  errorSummary: runState.integration.verification.errorSummary ?? runState.integration.verification.reason ?? null,
                })
              } else {
                await trace('integration_verification_passed', {
                  command: runState.integration.verification.command,
                  durationMs: runState.integration.verification.durationMs,
                })
              }
            }
            if (!verificationPolicy.primaryCommand) {
              runState.integration.verification = {
                status: 'not_run',
                executed: false,
                command: null,
                passed: false,
                exitCode: null,
                reason: '集成工作区未检测到标准验证命令。',
              }
            }
            await trace('integration_created', {
              branchName: integration.branchName,
              mergedBranches: integration.mergedBranches ?? [],
            })
          }
        } catch (error) {
          if (abortController.signal.aborted) {
            runState.integration = runState.integration
              ? { ...runState.integration, status: 'cancelled', error: '集成阶段已取消。' }
              : { status: 'cancelled', taskId: 'integration', runId, error: '集成阶段已取消。' }
            await trace('integration_cancelled', { branchName: runState.integration.branchName ?? null })
          } else {
            integrationError = error instanceof Error ? error.message : String(error)
            runState.integration = {
              status: error?.code === 'WORKTREE_MERGE_CONFLICT' ? 'conflict' : 'failed',
              taskId: 'integration',
              runId,
              error: integrationError,
              branches: error?.branches ?? [],
            }
            await trace('integration_failed', {
              status: runState.integration.status,
              error: integrationError,
              branches: runState.integration.branches,
            })
          }
          sendChatStreamIfAvailable(webContents, {
            type: 'progress',
            text: abortController.signal.aborted
              ? '集成阶段已停止；已完成的子任务进度保留。'
              : `集成分支创建失败：${integrationError}。各节点 worktree 仍保留供检查。`,
            conversationId,
          })
        }
        await runStore?.saveRun(conversationId, runId, runState)
      }

      if (worktreeTaskIds.length) {
        sendChatStreamIfAvailable(webContents, {
          type: 'progress',
          text: `已为 ${worktreeTaskIds.filter((id) => id !== 'integration').length} 个节点保留隔离 worktree${runState.integration?.branchName ? `，集成分支为 ${runState.integration.branchName}` : ''}。可预览后再合并到主工作区；系统不会自动合并。`,
          conversationId,
        })
      }

      if (execution.cancelled || abortController.signal.aborted) {
        runState.status = 'cancelled'
        run.status = 'cancelled'
        tasks = tasks.map((task) => ({ ...task, runStatus: task.status === 'done' ? 'completed' : 'cancelled' }))
        runState.tasks = tasks
        await runStore?.saveRun(conversationId, runId, runState)
        await publishTasks(tasks, webContents, conversationId)
        await ledger.flush()
        await trace('run_cancelled', { failedTaskIds: [...execution.failed] })
        await traceStore?.flush(conversationId, runId)
        return {
          runId,
          assistant: {
            text: '多 Agent 任务已停止；已完成的子任务进度保留。',
            usage: combineRecordedRunUsage(),
            fileChanges: mergeFileChanges(...tasks.map((task) => task.messages.map((message) => message.fileChanges))),
            cancelled: true,
          },
          tasks,
          failedTaskIds: [...execution.failed],
        }
      }

      const outcomes = tasks.map((task) => {
        const agentResult = task.messages.findLast((message) => message.author === 'agent')
        return {
          id: task.id,
          title: task.title,
          status: task.statusLabel,
          acceptance: task.acceptance,
          acceptanceAssessment: agentResult?.acceptanceAssessment ?? task.acceptanceAssessment ?? null,
          verification: agentResult?.verification ?? null,
          result: agentResult?.text ?? '（任务未生成结果）',
          evidenceAssessment: task.executionEvidenceSummary
            ?? summarizeExecutionEvidence(agentResult?.executionEvidence),
        }
      })
      let outcomesJson = JSON.stringify(outcomes, null, 2)
      if (outcomesJson.length > 24000) {
        outcomesJson = outcomesJson.slice(0, 24000) + '\n... (超出24k字符上限，结果截断)'
      }
      const projectMemory = await memory.load(conversationId)
      const synthesis = [
        '请根据下列子任务执行结果，面向用户总结本次工作的最终进展。不要再次执行工具，不要重复改代码。',
        '明确区分已完成、受阻和未完成的工作，并列出真实验证结果。若某子任务失败或被依赖阻塞，要明确说明。',
        '对每个节点的 acceptanceAssessment 逐项报告通过/未通过；不得把节点自述改写成后端未确认的验收结论。',
        '验证结论必须逐项依据 verification.status：passed 才能报告通过；failed、partial、not_run、skipped、incomplete 必须保留对应状态。不得根据 Agent 自述或输出中出现的“passed/tests passed”文字推断测试成功。',
        runState.integration?.branchName
          ? `隔离执行已生成用户可预览的集成分支 ${runState.integration.branchName}（worktree taskId 为 integration）；不要声称已合并到主工作区。`
          : integrationError
            ? `隔离执行的集成分支未能生成：${integrationError}。不要声称上游改动已经集成。`
            : '',
        runState.integration?.verification
          ? `【集成验证】状态 ${runState.integration.verification.status ?? (runState.integration.verification.passed ? 'passed' : 'failed')}；命令 ${runState.integration.verification.command ?? '无'}；退出码 ${runState.integration.verification.exitCode ?? '无'}；${runState.integration.verification.reason ?? runState.integration.verification.errorSummary ?? '无补充说明'}。`
          : integrationVerificationFailure
            ? `【集成验证】${integrationVerificationFailure}；验证结果已保存在运行记录中，不能声称集成分支通过验证。`
            : '',
        budgetExceededReason ? `【注意】DAG 运行由于${budgetExceededReason}已停止启动新节点，部分后续节点被标记为未完成。请在最终回复中如实说明这一点。` : '',
        '最终回复保持精炼：先给总体结论，再按子任务各列结论与最必要的源码/工具证据，最后说明交叉结果和关键未验证项；不要逐条复述工具过程或重复子任务原文，通常控制在约 800–1500 个中文字符，只有必要信息较多时才超出。失败、证据缺口和未执行的验证必须如实保留。',
        '【证据规则】每个子任务附带的 evidenceAssessment 是后端根据 Z Host 实际观测到的工具调用记录计算的摘要，优先级高于子 Agent 的自述。只能声称调用了记录中出现的工具；没有 read 工具记录就不能声称实际读取并核验了文件，没有测试/构建命令记录就不能声称测试/构建已运行或通过。若子 Agent 自述与记录不符，明确标为“未能从工具记录核实”，不要补造调用、文件或验证结果。无工具记录的依赖汇总可以作为汇总输出，但不得描述成独立核验。',
        projectMemory?.rolling_summary ? `【项目进展摘要】\n${projectMemory.rolling_summary}` : '',
        `用户原始请求：\n${text}`,
        `子任务结果：\n${outcomesJson}`,
      ].filter(Boolean).join('\n\n')
      sendChatStreamIfAvailable(webContents, { type: 'progress', text: '子任务已结束，正在汇总执行结果…', conversationId })
      const synthesizeFn = async (prompt) => {
        if (!dshRuntime) throw new Error('多 Agent 编排需要 Z Runtime')
        return dshRuntime.runAgentTurn({
          conversationId,
          sessionKey: `tw-orchestration-${conversationId}-${runId}-synthesis`,
          modelKey: primaryModelKey,
          text: applySkillInstructions(prompt, plannerSkill),
          webContents,
          cwd,
          agentPreset: resolveOrchestrationAgentPreset({ noTools: true }),
          parentSessionId: plannerSessionId,
          signal: abortController.signal,
          permissionMode: readOnlyRequest ? 'readonly' : permissionMode,
        })
      }
      let assistant
      try {
        assistant = await synthesizeFn(synthesis)
        if (abortController.signal.aborted) throw new Error('任务已取消')
        ledger.record({ runId, taskId: 'synthesis', attempt: 1, modelKey: primaryModelKey, usage: assistant.usage ?? {}, outcome: 'success' })
      } catch (error) {
        const partialUsage = error.partialResult?.usage
        ledger.record({ runId, taskId: 'synthesis', attempt: 1, modelKey: primaryModelKey, usage: partialUsage ?? {}, outcome: 'failed' })
        if (abortController.signal.aborted) throw error
        assistant = directExecutionSummary(outcomes, error)
        sendChatStreamIfAvailable(webContents, {
          type: 'progress',
          text: '汇总模型调用失败，已按后端保存的子任务状态生成直出汇总。',
          conversationId,
        })
      }
      usage.push(assistant.usage)

      runState.status = 'completed'
      run.status = 'completed'
      tasks = tasks.map((task) => ({ ...task, runStatus: 'completed' }))
      runState.tasks = tasks
      await runStore?.saveRun(conversationId, runId, runState)
      await publishTasks(tasks, webContents, conversationId)
      await ledger.flush()
      await trace('run_completed', {
        failedTaskIds: [...execution.failed],
        usageSummary: ledger.getSummary(),
      })
      await traceStore?.flush(conversationId, runId)

      return {
        runId,
        assistant: {
          ...assistant,
          usage: combineUsage(usage),
          fileChanges: mergeFileChanges(
            assistant.fileChanges,
            ...tasks.map((task) => task.messages.map((message) => message.fileChanges)),
          ),
        },
        tasks,
        failedTaskIds: [...execution.failed],
      }
    } catch (e) {
      run.schedulerActive = false
      run.pauseControl.resume()
      if (e?.code === 'DAG_PLAN_REJECTED') {
        runState.status = 'rejected'
        run.status = 'rejected'
        await runStore?.saveRun(conversationId, runId, runState)
        await ledger?.flush()
        await trace('run_rejected', { usageSummary: ledger?.getSummary() ?? null })
        await traceStore?.flush(conversationId, runId)
        return {
          runId,
          assistant: { text: '已拒绝此 DAG 计划，未启动任何子任务。' },
          tasks: runState.tasks ?? [],
          failedTaskIds: [],
        }
      }
      if (abortController.signal.aborted) return await finalizeCancelledRun()
      if (runState) {
        runState.status = 'failed'
        run.status = 'failed'
        if (Array.isArray(runState.tasks)) {
          runState.tasks = runState.tasks.map((task) => ({
            ...task,
            runStatus: task.status === 'done' ? 'completed' : 'failed',
          }))
          await publishTasks(runState.tasks, webContents, conversationId).catch(() => {})
        }
        await runStore?.saveRun(conversationId, runId, runState).catch(() => {})
      }
      await ledger?.flush()
      await trace('run_failed', {
        errorCode: e?.code ?? null,
        error: String(e?.message ?? e).slice(0, 500),
      })
      await traceStore?.flush(conversationId, runId)
      throw e
    } finally {
      parentSignal?.removeEventListener('abort', abortFromParent)
      abortController.signal.removeEventListener('abort', abortTaskControllers)
      taskAbortControllers.clear()
      taskStatuses.clear()
      run.inFlight = false
      run.abortController = null
      if (runs.get(conversationId) === run) runs.delete(conversationId)
    }
  }
  return planAndExecute
}
