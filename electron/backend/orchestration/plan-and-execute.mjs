import path from 'node:path'
import crypto from 'node:crypto'
import { applySkillInstructions, resolveSkillForSubtask } from '../skill-prompt.mjs'
import { detectVerificationCommands, executeVerificationRunner } from '../verification-policy.mjs'
import { executeDag, validateAndOrderTasks } from '../dag-scheduler.mjs'
import { modelFailureDomain, selectModelForTask, shouldUpgradeFailedTask } from '../orchestration-policy.mjs'
import { buildRoutingOptions } from '../routing-portfolio-service.mjs'
import { runWithSubtaskRetries } from '../subtask-retry.mjs'
import { getTaskProfile } from '../task-profile.mjs'
import { buildMemoryPromptSections } from '../memory-store.mjs'
import { createTaskWorktree, isCleanGitWorkspace } from '../worktree-service.mjs'
import {
  PlannerFallbackError,
  resolveOrchestrationAgentPreset,
  createPlannerProgressRelay,
  requiresReadOnlyPlan,
  validatePlanForRequest,
  completeReadOnlyPlanScopes,
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
import { summarizeExecutionEvidence, assessSubtaskCompletion } from './evidence.mjs'

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
}) {
  async function planAndExecute({ text, primaryModelKey, conversationId, webContents, skill, skillAlreadyApplied = false, workspacePath, permissionMode }) {
    if (!conversationId) throw new Error('当前对话标识无效')
    if (runs.get(conversationId)?.inFlight) throw new Error('该对话的上一条多 Agent 任务仍在处理中')
    const abortController = new AbortController()
    const taskAbortControllers = new Map()
    const taskStatuses = new Map()
    const abortTaskControllers = () => {
      for (const controller of taskAbortControllers.values()) controller.abort()
    }
    abortController.signal.addEventListener('abort', abortTaskControllers, { once: true })
    const run = { inFlight: true, abortController, taskAbortControllers, taskStatuses }
    runs.set(conversationId, run)
    const runId = crypto.randomUUID()
    const plannerSkill = skillAlreadyApplied ? null : skill
    try {
      sendChatStreamIfAvailable(webContents, { type: 'progress', text: '正在分析任务并生成 DAG…', conversationId })
      const cwd = workspacePath || (await getWorkspacePath(conversationId))
      const prefs = getAppPreferences ? await getAppPreferences() : { worktreeIsolation: false }
      const parallelWorktreeBaselineReady = Boolean(
        prefs.worktreeIsolation === true && userDataPath && await isCleanGitWorkspace(cwd),
      )
      const parallelImplementationAllowed = parallelWorktreeBaselineReady
      const readOnlyRequest = requiresReadOnlyPlan(text)
      const codeMutationRequest = isCodeMutationRequest(text)
      const plannerPathHints = await collectPlannerPathHints(cwd, text)
      await memory.init(conversationId, cwd, text)
      await memory.beginRun(conversationId, runId)
      const plannerFile = path.join(agentDataPath, 'orchestration', conversationId, 'planner.jsonl')
      const plannerPrompt = [
        '你是 TaskWeaver 的多智能体高级任务规划器 (Planner Agent)。负责将软件工程需求拆分为协作子任务的有向无环图 (DAG)。你不执行代码，不能调用工具。',
        '协作子任务职责规范：',
        '1. research (调研 Agent): 负责先期探索工作区架构、定位受影响的文件与符号，输出结构化方案，无写权限。',
        '2. implementation (编码 Agent): 负责实际编写/修改代码。只有目标或依赖关系确实未知时才先安排 research；用户已给出明确实现目标时，不要把实现任务替换成调研任务。',
        '3. test (测试验证 Agent): 仅当 implementation 的改动已存在于该测试 Agent 的执行工作区时，才运行构建/单元测试并将结果作为验证；不能对未包含改动的基线声称验证通过。',
        '4. review (审查 Agent): 依赖 implementation，负责审查代码 Diff、潜在边界问题与安全性。',
        parallelImplementationAllowed
          ? '实现拆分规则：当功能能按互不重叠的文件或模块独立实现时，优先拆成多个 implementation 节点并行处理；每个节点必须输出 writeScopes 字符串数组，列出它独占的字面路径，并在 description 中明确只改这些范围。若涉及同一文件或紧密耦合改动，保持一个 implementation 节点，或用 dependsOn 明确排序；不要仅为增加 Agent 数量重复拆 research。'
          : '实现拆分规则：当前不具备安全的并行写入条件，将独立代码修改合并到一个 implementation 节点；只有确有先后依赖时才拆成多个 implementation 并用 dependsOn 串行。不要把实现退化成 research，也不要为了增加 Agent 数量而串行重复拆分。',
        ...(codeMutationRequest ? [
          '【代码变更请求强制约束】用户明确要求修改、修复、实现或优化代码。计划必须包含至少一个 implementation 节点并实际完成代码变更；research/review/test 不能替代实现。只在目标、依赖或受影响范围确实未知时添加前置 research。',
        ] : []),
        parallelImplementationAllowed
          ? '当前已启用 Worktree 隔离且 Git 工作区干净：具有互不重叠 writeScopes 的独立 implementation 节点会在隔离 worktree 中并行执行；各 worktree 的改动仍需用户检查并手动合并。'
          : '当前不具备安全的并行写入条件（需要启用 Worktree 隔离，且 Git 工作区干净）；仍应直接安排 implementation，但不要声称写任务会并行执行。',
        parallelImplementationAllowed
          ? '如果拆分为并行 worktree 实现，不要安排依赖这些未合并改动的独立 test 节点；每个 implementation 应在自己的 worktree 完成适用的轻量验证，集成测试留到用户合并后执行。'
          : '',
        ...(readOnlyRequest ? [
          '【只读请求强制约束】用户明确要求只读/禁止修改。本次所有子任务只能使用 research 或 review；即使是交叉汇总、复核、总结，也必须标为 review 或 research，绝不能标为 implementation/test。每项描述必须明确“只读，不修改文件、不运行写入命令”。',
        ] : []),
        '请根据任务规模拆分为 1 到 5 个职责明确的子任务：简单且目标清晰的变更可以只安排一个 implementation；只有拆分能带来独立并行工作或必要的前置结论时才增加节点。若用户明确给出“ N 项独立研究/调研并行”数量，DAG 必须恰好包含 N 个互相独立的 research 节点，不得增加 review 或汇总节点，也不得让这些 research 节点相互依赖。编排器会在所有子任务结束后自动调用最终汇总，因此不要额外创建只负责“汇总/总结/交叉汇总/综合各研究结果”的 review 子任务；review 只用于有独立审查对象和验收标准的实际审查（例如基于具体 diff 检查风险），不要重复读取 research 已覆盖的文件来代替最终汇总。',
        '研究/审查任务必须有明确边界：每项只回答一个问题，在 description 中列出允许检查的文件或最多一个窄目录、验收点和停止条件；不要分配“通读整个项目/检查所有代码”这类开放任务。回答函数实现、调用顺序或配置细节必须读取源码文件；grep/glob 只能定位，不能作为代码已核实的证据。优先指定直接相关的文件；路径未知时可先搜索定位，再读取实际源码。对于端到端链路/跨文件调用关系问题，scopePaths 必须覆盖闭合结论所需的每个环节（例如 UI 状态/发送入口、preload、IPC、服务与 Host 调用端），不能只授权入口后再尝试越界读取；若现有候选文件不足，应在规划时纳入必要文件或窄目录。独立任务表示彼此无依赖，不要求文件范围完全不重叠；调用链闭合、证据完整优先于零重叠，必要时允许多个任务读取同一个桥接文件。子任务 description 必须写明按给定文件顺序逐跳核实；大源码文件先对目标符号做一次窄搜索，再读取相关 offset/limit 行段，禁止先整文件读取或反复扩大搜索；已给行号/符号时直接从该位置检查。避免重复探索，只有发现尚未解决的具体事实时才扩大检查。',
        '每个 research/review 节点还必须输出 scopePaths 字符串数组，至少 1 项、最多 12 项，只能使用工作区路径索引中的字面量相对路径；不能写绝对路径、通配符、.. 或工作区根目录。scopePaths 是工具层强制执行的读文件/搜索边界，范围外调用会被 Host 拒绝。',
        `【工作区路径索引：仅路径名，不含文件正文，也不代表已读取】扫描 ${plannerPathHints.visitedEntries} 个目录项${plannerPathHints.truncated ? '（达到扫描/展示上限，结果不完整）' : ''}。只从下列真实存在的路径中挑选候选文件；不得仅凭路径推断其内容。规划时尽量直接指定少量候选文件，并要求子 Agent 读取它们；只有索引不足时才安排必要的搜索：\n${plannerPathHints.paths.map((item) => `- ${item}`).join('\n') || '(没有发现路径；任务需先搜索定位，再实际读取文件)'}`,
        '只输出纯 JSON，不加 Markdown 代码块。格式：{"tasks":[{"id":"T1","title":"短标题","taskType":"research|implementation|test|review","role":"职责名","description":"目标、允许检查的文件/目录、验收点与停止条件","scopePaths":["electron/main.cjs"],"writeScopes":["src/features/foo/Bar.tsx"],"dependsOn":[],"reasons":["规划原因"]}]}；writeScopes 只供 implementation 使用，research/review 继续使用 scopePaths。',
        `工作区：${cwd}`,
        `用户原始请求：\n${text}`,
      ].join('\n\n')
      let plannerSuffixRetry = '\n\n上次输出无法解析。请只输出一个 JSON 对象，不要 Markdown 代码块，不要任何解释文字。'
      let planResult
      let planned
      let plannerSessionKey = `tw-orchestration-${conversationId}-${runId}-planner`
      const plannerProgress = createPlannerProgressRelay(webContents, conversationId)
      try {
        try {
          planResult = await runPrompt({
            modelKey: primaryModelKey,
            text: plannerPrompt,
            sessionFile: plannerFile,
            noTools: true,
            skill: plannerSkill,
            signal: abortController.signal,
            conversationId,
            cwdOverride: cwd,
            sessionKey: plannerSessionKey,
            webContents: plannerProgress.webContents,
            permissionMode: readOnlyRequest ? 'readonly' : permissionMode,
          })
          planned = completeReadOnlyPlanScopes(
            validatePlanForRequest(validateAndOrderTasks(parsePlan(planResult.text)), text, {
              requireParallelImplementationScopes: parallelImplementationAllowed,
            }),
            text,
            plannerPathHints.paths,
          )
        } catch (firstError) {
          if (firstError?.message?.startsWith('实现写入范围无效：')) {
            plannerSuffixRetry = `\n\n上次计划被实现范围校验拒绝：${firstError.message}。每个 implementation 节点的 writeScopes 必须是工作区相对路径字面量数组，不能含绝对路径、通配符、.. 或工作区根目录；彼此并行的实现节点不得使用重叠路径。只输出纯 JSON。`
          } else if (firstError?.message?.startsWith('代码变更请求缺少 implementation 节点：')) {
            plannerSuffixRetry = `\n\n上次计划被任务完整性校验拒绝：${firstError.message}。用户明确要求代码变更，必须至少安排一个 implementation 节点实际完成修改；不要用 research/review/test 代替实现。可以保留必要的前置 research 或实现后的 review，但不要创建无关调研。只输出纯 JSON。`
          } else if (firstError?.message?.startsWith('并行实现写入范围缺失：')) {
            plannerSuffixRetry = `\n\n上次计划被并行安全校验拒绝：${firstError.message}。每一对没有依赖关系、可能同时就绪的 implementation 节点都必须提供互不重叠的 writeScopes 字符串数组；如果改动实际耦合，请合并为一个 implementation 或用 dependsOn 串行。只输出纯 JSON。`
          } else if (firstError?.message?.startsWith('实现写入范围重叠：')) {
            plannerSuffixRetry = `\n\n上次计划被并行安全校验拒绝：${firstError.message}。请把共享文件的修改放到同一个 implementation 节点，或用 dependsOn 明确串行；只有写入范围互不重叠且无需彼此结果的实现才能并行。只输出纯 JSON。`
          } else if (firstError?.message?.startsWith('只读子任务范围无效：')) {
            plannerSuffixRetry = `\n\n上次计划被范围校验拒绝：${firstError.message}。为每个 research/review 节点补齐 scopePaths 字符串数组，只能使用工作区路径索引里的字面量相对文件或窄目录路径，至少 1 项，不得使用绝对路径、通配符、.. 或工作区根目录。description 也必须写清允许范围、验收点和停止条件。只输出纯 JSON。`
          } else if (firstError?.message?.includes('只读请求包含非只读子任务类型')) {
            plannerSuffixRetry = `\n\n上次计划被安全校验拒绝：${firstError.message}。这是只读任务；请把所有 implementation/test 子任务改为 research/review。汇总和交叉核验请标为 review。不得输出任何非 research/review 类型。只输出纯 JSON。`
          } else if (firstError?.message?.startsWith('并行研究任务数量不匹配：')) {
            plannerSuffixRetry = `\n\n上次计划被请求约束校验拒绝：${firstError.message}。请严格按用户明确指定的独立并行研究数量重写计划：只创建恰好对应数量的 research 节点，彼此无依赖；不要创建 review 或汇总节点，最终综合由编排器完成。只输出纯 JSON。`
          }
          plannerProgress.update('计划未通过校验，正在进行一次有限修正')
          try {
            plannerSessionKey = `tw-orchestration-${conversationId}-${runId}-planner-retry`
            planResult = await runPrompt({
              modelKey: primaryModelKey,
              text: plannerPrompt + plannerSuffixRetry,
              sessionFile: plannerFile,
              noTools: true,
              skill: plannerSkill,
              signal: abortController.signal,
              conversationId,
              cwdOverride: cwd,
              sessionKey: plannerSessionKey,
              webContents: plannerProgress.webContents,
              permissionMode: readOnlyRequest ? 'readonly' : permissionMode,
            })
            planned = completeReadOnlyPlanScopes(
              validatePlanForRequest(validateAndOrderTasks(parsePlan(planResult.text)), text, {
                requireParallelImplementationScopes: parallelImplementationAllowed,
              }),
              text,
              plannerPathHints.paths,
            )
          } catch (secondError) {
            const message = secondError instanceof Error ? secondError.message : String(secondError)
            throw new PlannerFallbackError(message, { partialUsage: planResult?.usage ?? null })
          }
        }
      } finally {
        plannerProgress.dispose()
      }
      const plannerSessionId = dshRuntime.getSessionId?.(plannerSessionKey) || undefined
      const usage = [planResult.usage]
      const routingOptions = await buildRoutingOptions({ userDataPath, openUsageBaseUrl: prefs.openUsageBaseUrl })
      const catalog = await modelService.listCatalog()
      const routeOpts = { ...routingOptions }
      const allocationCounts = Object.create(null)
      const selected = []
      for (const task of planned) {
        const routing = selectModelForTask(task.taskType, catalog, primaryModelKey, {
          ...routeOpts,
          allocationCounts,
        })
        if (!routing.model) throw new Error(`子任务 ${task.id} 没有可用模型`)
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
            reasons: routing.reasons,
            confidence: routing.confidence,
            estimatedCost: routing.estimatedCost,
            costEstimate: routing.costEstimate,
          },
          toolProfile: getTaskProfile(task.taskType).id,
          dshSessionKey: `tw-orchestration-${conversationId}-${runId}-${task.id}`,
        })
      }
      const implementationCount = selected.filter((task) => task.taskType === 'implementation').length
      if (implementationCount > 1) {
        const parallelNote = parallelImplementationAllowed
          ? '已启用 Worktree 隔离且工作区干净；writeScopes 不重叠的实现节点会并行执行，改动保留在各自 worktree 中供检查/合并。'
          : !prefs.worktreeIsolation
            ? '实现节点将串行执行；如需并行，请启用设置中的 Worktree 隔离。'
            : '实现节点将串行执行；并行 worktree 需要干净的 Git 工作区和可用的应用数据目录。'
        sendChatStreamIfAvailable(webContents, { type: 'progress', text: parallelNote, conversationId })
      }
      let tasks = layoutTasks(selected)
      for (const task of tasks) {
        taskAbortControllers.set(task.id, new AbortController())
        taskStatuses.set(task.id, task.status)
      }
      if (abortController.signal.aborted) abortTaskControllers()
      await publishTasks(tasks, webContents, conversationId)

      const worktreeTaskIds = []

      const execution = await executeDag(tasks, {
        signal: abortController.signal,
        getTaskSignal: (taskId) => taskAbortControllers.get(taskId)?.signal,
        maxConcurrency: maxSubtaskConcurrency,
        allowParallelImplementation: parallelImplementationAllowed,
        onTaskChange: async (changed, meta) => {
          taskStatuses.set(changed.id, changed.status)
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
                ...changed,
                worktreeIsolated: meta.result.worktreeIsolated === true || task.worktreeIsolated,
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
                ...changed,
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
            return { ...task, ...changed }
          })
          await publishTasks(tasks, webContents, conversationId)
        },
        execute: async (task, dependencyResults, taskSignal, executionMode = {}) => {
          const prefs = getAppPreferences ? await getAppPreferences() : {}
          const childFile = path.join(agentDataPath, 'orchestration', conversationId, `${task.id}.jsonl`)
          const projectMemory = await memory.load(conversationId)
          const workspaceRoot = cwd
          let execCwd = workspaceRoot
          let worktreeNote = ''
          const wantsWorktree = prefs.worktreeIsolation || executionMode.parallelWriteIsolation === true
          if (wantsWorktree && workspaceRoot && (task.taskType === 'implementation' || task.taskType === 'test')) {
            if (!userDataPath) {
              const reason = '应用数据目录不可用'
              if (executionMode.parallelWriteIsolation === true) {
                throw new Error(`任务 ${task.id} 无法创建独立 worktree，并行实现已安全停止：${reason}`)
              }
              worktreeNote = `\n\n（${reason}，回退到主工作区执行。）`
            } else if (!(await isCleanGitWorkspace(workspaceRoot))) {
              const reason = '工作区不是干净的 Git 仓库，保留未提交上下文并在主工作区执行'
              if (executionMode.parallelWriteIsolation === true) {
                throw new Error(`任务 ${task.id} 无法创建独立 worktree，并行实现已安全停止：${reason}`)
              }
              worktreeNote = `\n\n（${reason}。）`
            } else {
              try {
                const wt = await createTaskWorktree({
                  workspacePath: workspaceRoot,
                  conversationId,
                  runId,
                  taskId: task.id,
                  userDataPath,
                })
                if (executionMode.parallelWriteIsolation === true && wt.reused) {
                  throw new Error(`任务 ${task.id} 已有旧 worktree；为避免复用旧代码，不能启动并行实现`)
                }
                execCwd = wt.path
                worktreeTaskIds.push(task.id)
                worktreeNote = wt.reused
                  ? '\n\n（在已有 git worktree 中执行，未自动合并到主工作区。）'
                  : '\n\n（在独立 git worktree 中执行，未自动合并到主工作区。）'
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                if (executionMode.parallelWriteIsolation === true) {
                  throw new Error(`任务 ${task.id} 无法创建独立 worktree，并行实现已安全停止：${message}`)
                }
                worktreeNote = `\n\n（worktree 创建失败，回退主工作区：${message}）`
              }
            }
          }
          const profile = getTaskProfile(task.taskType)
          const subtaskSkill = resolveSkillForSubtask(skill, task.taskType)
          const buildPrompt = (evidenceBundle = null) => {
            const memoryBlock = buildMemoryPromptSections(projectMemory, task, dependencyResults, { evidenceBundle })
            const parts = [
              profile.preamble,
              memoryBlock,
              `当前子任务 ${task.id}：${task.title}\n${task.description}`,
              `职责：${task.role}。任务类型：${task.taskType}。工具档：${profile.id}。`,
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

          const runSubtask = async (modelKey, evidenceBundle = null) => runPrompt({
              modelKey,
              text: buildPrompt(evidenceBundle),
              sessionFile: childFile,
              taskType: task.taskType,
              skill: subtaskSkill,
              webContents,
              taskId: task.id,
              cwdOverride: execCwd,
              signal: taskSignal,
              conversationId,
              parentSessionId: plannerSessionId,
              permissionMode: readOnlyRequest ? 'readonly' : permissionMode,
              ...(task.taskType === 'implementation' && Array.isArray(task.writeScopes)
                ? { writeScopes: task.writeScopes }
                : {}),
              // Escalation gets a clean DSH session: carry only the compact,
              // verified L4 evidence rather than inheriting failed-turn noise.
              sessionKey: evidenceBundle
                ? `${task.dshSessionKey}-escalation-${evidenceBundle.attempted_actions.length}`
                : task.dshSessionKey,
            })

          const subtaskUpgradeMax = Math.max(0, Math.min(3, Number(prefs.subtaskUpgradeMax ?? 1) || 0))
          let execution
          try {
            execution = await runWithSubtaskRetries({
              task,
              initialModelKey: task.modelKey,
              maxRetries: subtaskUpgradeMax,
              canRetry: ({ failure }) => shouldUpgradeFailedTask(task.taskType, failure),
              signal: taskSignal,
              run: runSubtask,
              failureDomainForModel: (modelKey) => {
                const model = catalog.models.find((candidate) => candidate.key === modelKey)
                return model ? modelFailureDomain(model) : null
              },
              chooseModel: async ({ excludeModelKeys, excludeFailureDomains }) => {
                const freshCatalog = await modelService.listCatalog()
                const upgrade = selectModelForTask(task.taskType, freshCatalog, primaryModelKey, {
                  ...routeOpts,
                  excludeModelKeys,
                  excludeFailureDomains,
                })
                if (!upgrade.model) return null
                return {
                  modelKey: upgrade.model.key,
                  displayName: upgrade.displayName || upgrade.model.name,
                  reason: upgrade.reason,
                }
              },
              onRetry: async ({ displayName, attempt, maxRetries, failure, evidenceBundle }) => {
                await memory.recordEvidenceBundle(conversationId, evidenceBundle)
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

          // implementation / test 类型子任务产生文件修改时，自动运行静默自检
          if (
            prefs.selfHealingLoop === true &&
            (task.taskType === 'implementation' || task.taskType === 'test') &&
            Array.isArray(result.fileChanges) &&
            result.fileChanges.length > 0 &&
            execCwd
          ) {
            try {
              const verifyRes = await executeVerificationRunner(execCwd, { timeoutMs: 25_000 })
              result.verification = {
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
              // ignore verification error
            }
          }

          result.completionAssessment = assessSubtaskCompletion(task, result)
          if (result.verification && !result.verification.passed) {
            result.completionAssessment.complete = false
            result.completionAssessment.reason = `自检命令 ${result.verification.command} 退出码非零 (${result.verification.exitCode})`
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

      if (worktreeTaskIds.length) {
        sendChatStreamIfAvailable(webContents, {
          type: 'progress',
          text: `已在独立 worktree 完成 ${worktreeTaskIds.length} 个子任务（${worktreeTaskIds.join('、')}）。可在 DAG 子任务面板或设置 → 路由与扩展 中查看差异并合并到主工作区。`,
          conversationId,
        })
      }

      if (execution.cancelled) {
        return {
          assistant: {
            text: '多 Agent 任务已停止；已完成的子任务进度保留。',
            usage: combineUsage(usage),
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
          result: agentResult?.text ?? '（任务未生成结果）',
          runtimeObservedActions: agentResult?.executionEvidence ?? {
            source: 'z-host-tool-events',
            observedToolCalls: [],
          },
          evidenceAssessment: task.executionEvidenceSummary
            ?? summarizeExecutionEvidence(agentResult?.executionEvidence),
        }
      })
      const projectMemory = await memory.load(conversationId)
      const synthesis = [
        '请根据下列子任务执行结果，面向用户总结本次工作的最终进展。不要再次执行工具，不要重复改代码。',
        '明确区分已完成、受阻和未完成的工作，并列出真实验证结果。若某子任务失败或被依赖阻塞，要明确说明。',
        '最终回复保持精炼：先给总体结论，再按子任务各列结论与最必要的源码/工具证据，最后说明交叉结果和关键未验证项；不要逐条复述工具过程或重复子任务原文，通常控制在约 800–1500 个中文字符，只有必要信息较多时才超出。失败、证据缺口和未执行的验证必须如实保留。',
        '【证据规则】每个子任务附带的 runtimeObservedActions 是 Z Host 实际观测到的工具调用记录，优先级高于子 Agent 的自述；evidenceAssessment 是后端根据该记录计算的摘要。只能声称调用了记录中出现的工具；没有 read 工具记录就不能声称实际读取并核验了文件，没有测试/构建命令记录就不能声称测试/构建已运行或通过。若子 Agent 自述与记录不符，明确标为“未能从工具记录核实”，不要补造调用、文件或验证结果。无工具记录的依赖汇总可以作为汇总输出，但不得描述成独立核验。',
        projectMemory?.rolling_summary ? `【项目进展摘要】\n${projectMemory.rolling_summary}` : '',
        `用户原始请求：\n${text}`,
        `子任务结果：\n${JSON.stringify(outcomes, null, 2)}`,
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
      } catch (error) {
        if (abortController.signal.aborted) throw error
        assistant = directExecutionSummary(outcomes, error)
        sendChatStreamIfAvailable(webContents, {
          type: 'progress',
          text: '汇总模型调用失败，已按后端保存的子任务状态生成直出汇总。',
          conversationId,
        })
      }
      usage.push(assistant.usage)
      return {
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
    } finally {
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
