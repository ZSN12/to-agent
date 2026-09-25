import fs from 'node:fs/promises'
import path from 'node:path'
import { createAgentSession, SessionManager } from '../agent/agent-runtime.mjs'
import { createTaskWeaverResourceLoader } from '../agent/taskweaver-resources.mjs'
import { applySkillInstructions } from './skill-prompt.mjs'
import { executeDag, validateAndOrderTasks } from './dag-scheduler.mjs'
import { selectModelForTask } from './orchestration-policy.mjs'
import { getTaskProfile, getToolsForTask } from './task-profile.mjs'
import { createMemoryStore, buildMemoryPromptSections } from './memory-store.mjs'
import { sendToolTrace, summarizeToolInput, summarizeToolResult, extractFileDiff } from './tool-trace.mjs'

const TASK_TYPES = new Set(['research', 'implementation', 'test', 'review'])
const TYPE_LABELS = {
  research: '调研',
  implementation: '实现',
  test: '测试',
  review: '审查',
}
const TIER_LABELS = { cheap: 'low', balanced: 'balanced', strong: 'high' }

function nowLabel() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function messageId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function parsePlan(text) {
  const withoutFence = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Planner 未返回有效的 JSON 任务计划')
  let parsed
  try {
    parsed = JSON.parse(withoutFence.slice(start, end + 1))
  } catch {
    throw new Error('Planner 返回的任务计划 JSON 无法解析')
  }
  if (!Array.isArray(parsed.tasks)) throw new Error('Planner 返回的任务计划缺少 tasks 数组')
  return parsed.tasks.map((task) => ({
    ...task,
    taskType: TASK_TYPES.has(task.taskType) ? task.taskType : 'implementation',
    dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
    reasons: Array.isArray(task.reasons) ? task.reasons : [],
  }))
}

function layoutTasks(tasks) {
  const columns = 3
  return tasks.map((task, index) => ({
    ...task,
    x: 4 + (index % columns) * 33,
    y: 5 + Math.floor(index / columns) * 34,
  }))
}

function combineUsage(usages) {
  const sum = (key) => usages.reduce((total, usage) => total + (usage?.[key] ?? 0), 0)
  const elapsedMs = sum('elapsedMs')
  const outputTokens = sum('outputTokens')
  const latest = [...usages].reverse().find(Boolean)
  return {
    inputTokens: sum('inputTokens'),
    outputTokens,
    cacheReadTokens: sum('cacheReadTokens'),
    cacheWriteTokens: sum('cacheWriteTokens'),
    costUsd: sum('costUsd'),
    elapsedMs,
    tokensPerSecond: elapsedMs ? Math.round((outputTokens * 1000) / elapsedMs) : 0,
    contextTokens: latest?.contextTokens ?? null,
    contextWindow: latest?.contextWindow ?? null,
    contextPercent: latest?.contextPercent ?? null,
  }
}

export function createOrchestrationService({ modelService, profileStore, appState, mcpService, getWorkspacePath, getWorkspaceTrusted = () => false, agentDataPath, builtInSkillsPath, builtInExtensionsPath }) {
  let inFlight = false
  let activeSession = null
  let currentAbortController = null
  const memory = createMemoryStore({ agentDataPath })

  async function resolveModel(modelKey) {
    const runtime = await modelService.getRuntime()
    const [provider, ...parts] = modelKey.split('/')
    const id = parts.join('/')
    const model = runtime.getModel(provider, id)
    if (!model) throw new Error(`未找到模型：${modelKey}`)
    const available = await runtime.getAvailable()
    if (!available.some((item) => item.provider === provider && item.id === id)) {
      throw new Error(`模型未鉴权或不可用：${modelKey}`)
    }
    return { runtime, model }
  }

  async function runPrompt({ modelKey, text, sessionFile, noTools = false, taskType, skill, webContents, taskId }) {
    const cwd = getWorkspacePath()
    if (!cwd) throw new Error('请先设置工作区目录')
    const { runtime, model } = await resolveModel(modelKey)
    await fs.mkdir(path.dirname(sessionFile), { recursive: true })
    const manager = SessionManager.open(sessionFile, path.dirname(sessionFile), cwd)
    const { resourceLoader, settingsManager } = createTaskWeaverResourceLoader({ cwd, agentDir: agentDataPath, builtInSkillsPath, builtInExtensionsPath, projectTrusted: getWorkspaceTrusted() })
    const mcpTools = !noTools && mcpService ? (await mcpService.getCustomTools({ taskType })).tools : []
    const { session } = await createAgentSession({
      cwd,
      agentDir: agentDataPath,
      model,
      modelRuntime: runtime,
      sessionManager: manager,
      resourceLoader,
      settingsManager,
      ...(noTools ? { noTools: 'all' } : {}),
      ...(taskType ? { tools: [...getToolsForTask(taskType), ...mcpTools.map((tool) => tool.name)] } : {}),
      customTools: mcpTools,
    })
    activeSession = session
    try {
      if (typeof session.setAutoCompactionEnabled === 'function') {
        session.setAutoCompactionEnabled(true)
      }
    } catch {
      // ignore
    }
    const before = session.getSessionStats()
    let output = ''
    const toolStartedAt = new Map()
    const toolArgsMap = new Map()
    const trace = (payload) => {
      sendToolTrace(webContents, payload)
      void Promise.resolve(appState?.appendOutputLog(payload)).catch(() => {})
    }
    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'message_update') {
        const part = event.assistantMessageEvent
        if (part?.type === 'text_delta' && part.delta) output += part.delta
        return
      }
      if (event.type === 'tool_execution_start') {
        const id = String(event.toolCallId ?? `${event.toolName}-${Date.now()}`)
        toolStartedAt.set(id, Date.now())
        toolArgsMap.set(id, event.args)
        trace({
          id,
          toolName: String(event.toolName ?? 'tool'),
          status: 'running',
          inputSummary: summarizeToolInput(event.toolName, event.args),
          startedAt: toolStartedAt.get(id),
          taskId,
        })
      } else if (event.type === 'tool_execution_end') {
        const id = String(event.toolCallId ?? `${event.toolName}-${Date.now()}`)
        const startedAt = toolStartedAt.get(id)
        const args = toolArgsMap.get(id) || event.args
        const fileDiff = extractFileDiff(event.toolName, args, event.result)
        trace({
          id,
          toolName: String(event.toolName ?? 'tool'),
          status: event.isError ? 'error' : 'done',
          resultSummary: summarizeToolResult(event.result, Boolean(event.isError)),
          durationMs: startedAt ? Date.now() - startedAt : null,
          fileDiff,
          taskId,
        })
        toolStartedAt.delete(id)
        toolArgsMap.delete(id)
      }
    })
    const startedAt = Date.now()
    try {
      if (currentAbortController?.signal.aborted) throw new Error('任务已停止')
      await session.prompt(applySkillInstructions(text, skill))
      if (currentAbortController?.signal.aborted) throw new Error('任务已停止')
      const after = session.getSessionStats()
      const nonnegative = (n) => Math.max(0, Number.isFinite(n) ? n : 0)
      const elapsedMs = Date.now() - startedAt
      return {
        text: output,
        usage: {
          inputTokens: nonnegative(after.tokens.input - before.tokens.input),
          outputTokens: nonnegative(after.tokens.output - before.tokens.output),
          cacheReadTokens: nonnegative(after.tokens.cacheRead - before.tokens.cacheRead),
          cacheWriteTokens: nonnegative(after.tokens.cacheWrite - before.tokens.cacheWrite),
          costUsd: nonnegative(after.cost - before.cost),
          elapsedMs,
          tokensPerSecond: elapsedMs ? Math.round((Math.max(0, after.tokens.output - before.tokens.output) * 1000) / elapsedMs) : 0,
          contextTokens: after.contextUsage?.tokens ?? null,
          contextWindow: after.contextUsage?.contextWindow ?? null,
          contextPercent: after.contextUsage?.percent ?? null,
        },
      }
    } finally {
      unsubscribe()
      if (activeSession === session) activeSession = null
      session.dispose()
    }
  }

  async function publishTasks(tasks, webContents) {
    const normalized = layoutTasks(tasks)
    await appState.setTasks(normalized)
    if (!webContents.isDestroyed()) webContents.send('chat:stream', { type: 'tasks', tasks: normalized })
  }

  async function planAndExecute({ text, primaryModelKey, conversationId, webContents, synthesize, skill }) {
    if (inFlight) throw new Error('上一条多 Agent 任务仍在处理中')
    inFlight = true
    const abortController = new AbortController()
    currentAbortController = abortController
    try {
      if (!webContents.isDestroyed()) webContents.send('chat:stream', { type: 'progress', text: '正在分析任务并生成 DAG…' })
      const cwd = getWorkspacePath()
      await memory.init(conversationId, cwd, text)
      const plannerFile = path.join(agentDataPath, 'orchestration', conversationId, 'planner.jsonl')
      const plannerPrompt = [
        '你是 TaskWeaver 的多智能体高级任务规划器 (Planner Agent)。负责将软件工程需求拆分为协作子任务的有向无环图 (DAG)。你不执行代码，不能调用工具。',
        '协作子任务职责规范：',
        '1. research (调研 Agent): 负责先期探索工作区架构、定位受影响的文件与符号，输出结构化方案，无写权限。',
        '2. implementation (编码 Agent): 依赖 research，负责具体的代码编写与精准修改，严格遵循代码规范。',
        '3. test (测试验证 Agent): 依赖 implementation，负责运行构建/单元测试命令，验证修改结果。',
        '4. review (审查 Agent): 依赖 implementation，负责审查代码 Diff、潜在边界问题与安全性。',
        '请根据任务规模拆分为 2 到 5 个职责明确的子任务；有先后依赖的务必在 dependsOn 中声明前置任务 id。',
        '只输出纯 JSON，不加 Markdown 代码块。格式：{"tasks":[{"id":"T1","title":"短标题","taskType":"research|implementation|test|review","role":"职责名","description":"目标与验收标准","dependsOn":[],"reasons":["规划原因"]}]}',
        `工作区：${cwd}`,
        `用户原始请求：\n${text}`,
      ].join('\n\n')
      const planResult = await runPrompt({ modelKey: primaryModelKey, text: plannerPrompt, sessionFile: plannerFile, noTools: true, skill })
      const usage = [planResult.usage]
      const planned = validateAndOrderTasks(parsePlan(planResult.text))
      const catalog = await modelService.listCatalog()
      const selected = await Promise.all(planned.map(async (task) => {
        const routing = selectModelForTask(task.taskType, catalog, primaryModelKey)
        if (!routing.model) throw new Error(`子任务 ${task.id} 没有可用模型`)
        const profile = routing.model.profile
        const message = {
          id: `${task.id}-plan`,
          author: 'orchestrator',
          name: 'TaskWeaver',
          time: nowLabel(),
          text: `已创建子任务：${task.description}`,
        }
        return {
          ...task,
          role: task.role || TYPE_LABELS[task.taskType],
          modelKey: routing.model.key,
          model: routing.model.name,
          tier: TIER_LABELS[profile?.tier ?? 'balanced'],
          status: 'queued',
          statusLabel: '排队中',
          duration: '',
          detail: task.description,
          confidence: '',
          reasons: [...task.reasons, routing.reason],
          messages: [message],
          routeReason: routing.reason,
          toolProfile: getTaskProfile(task.taskType).id,
        }
      }))
      let tasks = layoutTasks(selected)
      await publishTasks(tasks, webContents)

      const execution = await executeDag(tasks, {
        signal: abortController.signal,
        onTaskChange: async (changed, meta) => {
          if (changed.status === 'running' && !webContents.isDestroyed()) {
            webContents.send('chat:stream', { type: 'progress', text: `正在执行 ${changed.id} · ${changed.title}（${changed.model}）…` })
          }
          tasks = tasks.map((task) => {
            if (task.id !== changed.id) return task
            if (meta?.result) {
              return {
                ...changed,
                messages: [...task.messages, {
                  id: `${changed.id}-assistant`,
                  author: 'agent',
                  name: changed.role,
                  time: nowLabel(),
                  text: meta.result.text || '（Agent 未返回文本）',
                  modelKey: changed.modelKey,
                  usage: meta.result.usage,
                }],
              }
            }
            return { ...task, ...changed }
          })
          await publishTasks(tasks, webContents)
        },
        execute: async (task, dependencyResults) => {
          const childFile = path.join(agentDataPath, 'orchestration', conversationId, `${task.id}.jsonl`)
          const projectMemory = await memory.load(conversationId)
          const memoryBlock = buildMemoryPromptSections(projectMemory, task, dependencyResults)
          const prompt = [
            '你是 TaskWeaver 中负责一个明确子任务的编程 Agent。只完成本子任务，遵守仓库现有约定；可以检查和修改当前工作区。不要重复完成其他子任务。',
            memoryBlock,
            `当前子任务 ${task.id}：${task.title}\n${task.description}`,
            `职责：${task.role}。任务类型：${task.taskType}。`,
            '完成后简要说明做了什么、修改了哪些文件、验证结果和仍存在的问题。不要声称未实际执行的验证已经通过。',
          ].join('\n\n')
          const result = await runPrompt({ modelKey: task.modelKey, text: prompt, sessionFile: childFile, taskType: task.taskType, skill, webContents, taskId: task.id })
          usage.push(result.usage)
          await memory.recordTaskResult(conversationId, { ...task, statusLabel: '已完成' }, result)
          return result
        },
      })

      if (execution.cancelled) {
        return {
          assistant: { text: '多 Agent 任务已停止；已完成的子任务进度保留。', usage: combineUsage(usage), cancelled: true },
          tasks,
          failedTaskIds: [...execution.failed],
        }
      }

      const outcomes = tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.statusLabel,
        result: task.messages.at(-1)?.text ?? '（任务未生成结果）',
      }))
      const projectMemory = await memory.load(conversationId)
      const synthesis = [
        '请根据下列子任务执行结果，面向用户总结本次工作的最终进展。不要再次执行工具，不要重复改代码。',
        '明确区分已完成、受阻和未完成的工作，并列出真实验证结果。若某子任务失败或被依赖阻塞，要明确说明。',
        projectMemory?.rolling_summary ? `【项目进展摘要】\n${projectMemory.rolling_summary}` : '',
        `用户原始请求：\n${text}`,
        `子任务结果：\n${JSON.stringify(outcomes, null, 2)}`,
      ].filter(Boolean).join('\n\n')
      if (!webContents.isDestroyed()) webContents.send('chat:stream', { type: 'progress', text: '子任务已结束，正在汇总执行结果…' })
      const assistant = await synthesize(synthesis)
      usage.push(assistant.usage)
      return {
        assistant: { ...assistant, usage: combineUsage(usage) },
        tasks,
        failedTaskIds: [...execution.failed],
      }
    } finally {
      inFlight = false
      if (currentAbortController === abortController) currentAbortController = null
    }
  }

  async function sendTaskMessage({ taskId, text, conversationId, webContents }) {
    if (inFlight) throw new Error('多 Agent 任务仍在执行，暂不能向子任务发送消息')
    const abortController = new AbortController()
    currentAbortController = abortController
    try {
    const state = await appState.getState()
    const tasks = state.tasks
    const task = tasks.find((item) => item.id === taskId)
    if (!task) throw new Error('找不到该子任务')
    const user = { id: messageId(), author: 'user', name: '你', time: nowLabel(), text }
    const childFile = path.join(agentDataPath, 'orchestration', conversationId, `${taskId}.jsonl`)
    let prompt = text
    try {
      await fs.access(childFile)
    } catch {
      const originalRequest = state.messages.find((message) => message.author === 'user')?.text ?? ''
      prompt = `用户原始请求：${originalRequest}\n当前子任务：${task.title}\n任务目标：${task.description}\n\n用户补充指令：\n${text}`
    }
    const result = await runPrompt({ modelKey: task.modelKey, text: prompt, sessionFile: childFile, taskType: task.taskType, webContents, taskId })
    const assistant = {
      id: messageId(),
      author: 'agent',
      name: task.role,
      time: nowLabel(),
      text: result.text || '（Agent 未返回文本）',
      modelKey: task.modelKey,
      usage: result.usage,
    }
    const updated = tasks.map((item) => item.id === taskId ? { ...item, messages: [...item.messages, user, assistant] } : item)
    await publishTasks(updated, webContents)
    return { user, assistant }
    } finally {
      if (currentAbortController === abortController) currentAbortController = null
    }
  }

  async function abort() {
    if (!currentAbortController) return false
    currentAbortController.abort()
    await activeSession?.abort()
    return true
  }

  return { planAndExecute, sendTaskMessage, abort, isBusy: () => inFlight || Boolean(currentAbortController) }
}
