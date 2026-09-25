import { createAgentSession, SessionManager } from '../agent/agent-runtime.mjs'
import { createTaskWeaverResourceLoader } from '../agent/taskweaver-resources.mjs'
import { applySkillInstructions } from './skill-prompt.mjs'
import { sendToolTrace, summarizeToolInput, summarizeToolResult, extractFileDiff } from './tool-trace.mjs'
import { getToolsForSingleAgent } from './task-profile.mjs'
import { aggregateSessionEntries, mapPiSessionStats } from './session-stats.mjs'
import path from 'node:path'

function applyThinkingLevel(session, level) {
  if (!session || typeof session.setThinkingLevel !== 'function') return
  try {
    session.setThinkingLevel(level)
  } catch {
    // ignore
  }
}

const REDACTED_THINKING_OPEN = '<think>'
const REDACTED_THINKING_CLOSE = '</think>'

/**
 * 部分 Cursor 模型把 thinking 包在 XML 标签里流式输出；状态挂在对象上避免闭包/打包作用域问题。
 */
function createRedactedThinkingTextHandler({
  onTextDelta,
  onThinkingStart,
  onThinkingDelta,
  onThinkingEnd,
}) {
  const state = { insideThinkTag: false }

  function push(rawChunk) {
    if (!rawChunk) return
    if (rawChunk.includes(REDACTED_THINKING_OPEN)) {
      state.insideThinkTag = true
      onThinkingStart()
      const parts = rawChunk.split(REDACTED_THINKING_OPEN)
      if (parts[0]) onTextDelta(parts[0])
      const thinkPart = parts.slice(1).join(REDACTED_THINKING_OPEN)
      if (thinkPart.includes(REDACTED_THINKING_CLOSE)) {
        const subParts = thinkPart.split(REDACTED_THINKING_CLOSE)
        if (subParts[0]) onThinkingDelta(subParts[0])
        state.insideThinkTag = false
        onThinkingEnd()
        if (subParts[1]) onTextDelta(subParts[1])
      } else if (thinkPart) {
        onThinkingDelta(thinkPart)
      }
      return
    }
    if (state.insideThinkTag) {
      if (rawChunk.includes(REDACTED_THINKING_CLOSE)) {
        const parts = rawChunk.split(REDACTED_THINKING_CLOSE)
        if (parts[0]) onThinkingDelta(parts[0])
        state.insideThinkTag = false
        onThinkingEnd()
        if (parts[1]) onTextDelta(parts[1])
      } else {
        onThinkingDelta(rawChunk)
      }
      return
    }
    onTextDelta(rawChunk)
  }

  return { push, state }
}

function getUsageDelta(before, after, durationMs) {
  const nonNegative = (value) => Math.max(0, Number.isFinite(value) ? value : 0)
  const inputTokens = nonNegative(after.tokens.input - before.tokens.input)
  const outputTokens = nonNegative(after.tokens.output - before.tokens.output)
  const cacheReadTokens = nonNegative(after.tokens.cacheRead - before.tokens.cacheRead)
  const cacheWriteTokens = nonNegative(after.tokens.cacheWrite - before.tokens.cacheWrite)
  const elapsedMs = Math.max(0, Math.round(durationMs))
  const context = after.contextUsage

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: nonNegative(after.cost - before.cost),
    elapsedMs,
    tokensPerSecond: elapsedMs > 0 ? Math.round((outputTokens * 1000) / elapsedMs) : 0,
    contextTokens: context?.tokens ?? null,
    contextWindow: context?.contextWindow ?? null,
    contextPercent: context?.percent ?? null,
  }
}

export function createChatService({ modelService, profileStore, usageStore, appState, mcpService, getWorkspacePath, getWorkspaceTrusted = () => false, agentDataPath, builtInSkillsPath, builtInExtensionsPath }) {
  /** @type {import('../agent/runtime-types.d.ts').AgentSession | null} */
  let session = null
  let sessionModel = null
  let sessionModelKey = null
  let sessionCwd = null
  let sessionConversationId = null
  let inFlight = false
  let cancelRequested = false

  async function disposeSession() {
    if (session) {
      try {
        session.dispose()
      } catch {
        // ignore
      }
    }
    session = null
    sessionModel = null
    sessionModelKey = null
    sessionCwd = null
    sessionConversationId = null
  }

  async function ensureSession(modelKey, conversationId) {
    let cwd = getWorkspacePath()
    if (!cwd) {
      cwd = path.join(agentDataPath, 'scratch')
      try {
        const fsSync = await import('node:fs')
        fsSync.mkdirSync(cwd, { recursive: true })
      } catch {
        // ignore
      }
    }
    if (!modelKey) throw new Error('请先选择已鉴权的模型')

    const rt = await modelService.getRuntime()
    const slash = modelKey.indexOf('/')
    if (slash <= 0) throw new Error(`无效的模型标识: ${modelKey}`)
    const provider = modelKey.slice(0, slash)
    const id = modelKey.slice(slash + 1)
    const model = rt.getModel(provider, id)
    if (!model) throw new Error(`未找到模型: ${modelKey}`)

    const available = await rt.getAvailable()
    const ok = available.some((m) => m.provider === provider && m.id === id)
    if (!ok) throw new Error(`模型未鉴权或不可用: ${modelKey}`)

    if (!/^[a-f\d-]{36}$/i.test(conversationId ?? '')) {
      throw new Error('当前对话标识无效，请新建对话后重试')
    }

    const thinkingLevel = (await profileStore?.getThinkingLevel?.()) || 'high'

    if (session && sessionConversationId === conversationId && sessionCwd === cwd) {
      if (sessionModelKey !== modelKey) {
        await session.setModel(model)
        sessionModelKey = modelKey
        sessionModel = model
      }
      applyThinkingLevel(session, thinkingLevel)
      return session
    }

    await disposeSession()
    const sessionDir = path.join(agentDataPath, 'conversations')
    const sessionFile = path.join(sessionDir, `${conversationId}.jsonl`)
    const sessionManager = SessionManager.open(sessionFile, sessionDir, cwd)
    const { resourceLoader, settingsManager } = createTaskWeaverResourceLoader({ cwd, agentDir: agentDataPath, builtInSkillsPath, builtInExtensionsPath, projectTrusted: getWorkspaceTrusted() })
    await resourceLoader.reload()
    const mcpTools = mcpService ? (await mcpService.getCustomTools()).tools : []
    const { session: created } = await createAgentSession({
      cwd,
      agentDir: agentDataPath,
      model,
      thinkingLevel,
      modelRuntime: rt,
      sessionManager,
      settingsManager,
      resourceLoader,
      tools: [...getToolsForSingleAgent(), ...mcpTools.map((tool) => tool.name)],
      customTools: mcpTools,
    })
    session = created
    sessionModel = model
    try {
      if (typeof session.setAutoCompactionEnabled === 'function') {
        session.setAutoCompactionEnabled(true)
      }
    } catch {
      // ignore
    }
    sessionModelKey = modelKey
    sessionCwd = cwd
    sessionConversationId = conversationId
    return session
  }

  async function send({ text, modelKey, conversationId, webContents, skill, behavior }) {
    if (inFlight) {
      if (session && (behavior === 'steer' || behavior === 'followUp')) {
        if (behavior === 'steer' && typeof session.steer === 'function') {
          await session.steer(text)
          webContents.send('chat:stream', { type: 'steering_queued', text })
          return { text: '', conversationId, queued: 'steer' }
        }
        if (behavior === 'followUp' && typeof session.followUp === 'function') {
          await session.followUp(text)
          webContents.send('chat:stream', { type: 'followup_queued', text })
          return { text: '', conversationId, queued: 'followUp' }
        }
      }
      throw new Error('上一条消息仍在处理中')
    }
    inFlight = true
    cancelRequested = false
    let full = ''
    let thinking = ''
    let thinkingStartedAt = null
    let thinkingDurationMs = 0
    let lastErrorMessage = null
    let unsubscribe = () => {}
    const markThinkingStart = () => {
      if (!thinkingStartedAt) thinkingStartedAt = Date.now()
      webContents.send('chat:stream', { type: 'thinking_start' })
    }
    const markThinkingEnd = () => {
      if (thinkingStartedAt) thinkingDurationMs = Date.now() - thinkingStartedAt
      webContents.send('chat:stream', {
        type: 'thinking_end',
        fullThinking: thinking,
        durationMs: thinkingDurationMs,
      })
    }
    const pushTextDelta = createRedactedThinkingTextHandler({
      onTextDelta: (delta) => {
        markFirstToken()
        full += delta
        webContents.send('chat:stream', { type: 'delta', delta, full })
      },
      onThinkingStart: () => {
        markFirstToken()
        markThinkingStart()
      },
      onThinkingDelta: (delta) => {
        markFirstToken()
        if (!thinkingStartedAt) thinkingStartedAt = Date.now()
        thinking += delta
        webContents.send('chat:stream', { type: 'thinking_delta', delta, fullThinking: thinking })
      },
      onThinkingEnd: markThinkingEnd,
    })
    const toolStartedAt = new Map()
    const toolArgsMap = new Map()
    let promptStartedAt = null
    let firstTokenAt = null
    let turnToolMs = 0
    const markFirstToken = () => {
      if (!firstTokenAt && promptStartedAt) firstTokenAt = Date.now()
    }
    const trace = (payload) => {
      sendToolTrace(webContents, payload)
      void Promise.resolve(appState?.appendOutputLog(payload)).catch(() => {})
    }

    try {
      const activeSession = await ensureSession(modelKey, conversationId)
      if (cancelRequested) return { text: '', conversationId, cancelled: true }

      const trimmed = (text || '').trim()
      if (trimmed === '/compact' || trimmed.startsWith('/compact ')) {
        const customInstructions = trimmed.startsWith('/compact ') ? trimmed.slice(9).trim() : undefined
        trace({
          id: `compact-${Date.now()}`,
          toolName: 'context-compaction',
          status: 'running',
          inputSummary: customInstructions ? `正在手动压缩上下文（指示：${customInstructions}）…` : '正在手动压缩会话历史记忆…',
          startedAt: Date.now(),
        })
        webContents.send('chat:stream', { type: 'progress', text: '正在压缩上下文记忆…' })
        let compactResult = null
        try {
          if (typeof activeSession.compact === 'function') {
            compactResult = await activeSession.compact(customInstructions)
          }
        } catch (compactErr) {
          trace({
            id: `compact-${Date.now()}`,
            toolName: 'context-compaction',
            status: 'error',
            resultSummary: `压缩未完成: ${compactErr?.message || String(compactErr)}`,
            durationMs: 300,
          })
          const errMsg = `上下文压缩未执行成功：${compactErr?.message || '当前会话暂无足够可压缩的消息'}`
          webContents.send('chat:stream', { type: 'done', full: errMsg })
          return { text: errMsg, conversationId }
        }
        trace({
          id: `compact-${Date.now()}`,
          toolName: 'context-compaction',
          status: 'done',
          resultSummary: '上下文记忆已压缩完成，保留关键工作上下文',
          durationMs: 400,
        })
        const resText = compactResult?.summary
          ? `会话上下文已成功压缩并精简。\n\n**压缩摘要**：\n${compactResult.summary}`
          : '会话上下文已成功压缩，保留核心记忆并释放了 Token 空间。'
        webContents.send('chat:stream', { type: 'done', full: resText })
        return {
          text: resText,
          conversationId,
        }
      }

      const statsBefore = activeSession.getSessionStats()
      const startedAt = Date.now()
      unsubscribe = activeSession.subscribe((event) => {
        if (event.type === 'queue_update') {
          webContents.send('chat:stream', {
            type: 'queue_update',
            steering: Array.from(new Set(event.steering || [])),
            followUp: Array.from(new Set(event.followUp || [])),
          })
          return
        }
        if (event.type === 'compaction_start') {
          trace({
            id: `compact-${Date.now()}`,
            toolName: 'context-compaction',
            status: 'running',
            inputSummary: '对话历史较长，正在自动压缩上下文记忆…',
            startedAt: Date.now(),
          })
          return
        }
        if (event.type === 'compaction_end') {
          const summary = event.result?.summary?.trim() || ''
          trace({
            id: `compact-${Date.now()}`,
            toolName: 'context-compaction',
            status: 'done',
            resultSummary: summary
              ? `上下文已压缩 · ${summary.slice(0, 120)}${summary.length > 120 ? '…' : ''}`
              : '上下文记忆已自动压缩，保留关键工作上下文',
            durationMs: 300,
          })
          webContents.send('chat:stream', {
            type: 'compaction',
            automatic: event.reason !== 'manual',
            summary: summary || undefined,
            tokensBefore: event.result?.tokensBefore ?? null,
          })
          return
        }
        if (event.type === 'auto_retry_start') {
          webContents.send('chat:stream', {
            type: 'retry',
            phase: 'start',
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delayMs: event.delayMs,
            message: event.errorMessage,
          })
          return
        }
        if (event.type === 'auto_retry_end') {
          webContents.send('chat:stream', {
            type: 'retry',
            phase: 'end',
            attempt: event.attempt,
            success: event.success,
            message: event.finalError,
          })
          return
        }
        if (event.type === 'message_update') {
          const part = event.assistantMessageEvent
          if (part?.type === 'thinking_start') {
            markFirstToken()
            thinkingStartedAt = Date.now()
            webContents.send('chat:stream', { type: 'thinking_start' })
          } else if (part?.type === 'thinking_delta' && part.delta) {
            markFirstToken()
            if (!thinkingStartedAt) thinkingStartedAt = Date.now()
            thinking += part.delta
            webContents.send('chat:stream', { type: 'thinking_delta', delta: part.delta, fullThinking: thinking })
          } else if (part?.type === 'thinking_end') {
            if (part.content) thinking = part.content
            if (thinkingStartedAt) thinkingDurationMs = Date.now() - thinkingStartedAt
            webContents.send('chat:stream', { type: 'thinking_end', fullThinking: thinking, durationMs: thinkingDurationMs })
          } else if (part?.type === 'text_delta' && part.delta) {
            markFirstToken()
            pushTextDelta.push(part.delta)
          }
          if (part?.type === 'error' && part.error) {
            lastErrorMessage = typeof part.error === 'string' ? part.error : (part.error.message || JSON.stringify(part.error))
          }
          return
        }
        if (event.type === 'message_end') {
          if (event.message?.errorMessage) {
            lastErrorMessage = event.message.errorMessage
          }
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
          })
        } else if (event.type === 'tool_execution_end') {
          const id = String(event.toolCallId ?? `${event.toolName}-${Date.now()}`)
          const startedAt = toolStartedAt.get(id)
          const args = toolArgsMap.get(id) || event.args
          const fileDiff = extractFileDiff(event.toolName, args, event.result)
          const durationMs = startedAt ? Date.now() - startedAt : null
          if (durationMs) turnToolMs += durationMs
          trace({
            id,
            toolName: String(event.toolName ?? 'tool'),
            status: event.isError ? 'error' : 'done',
            resultSummary: summarizeToolResult(event.result, Boolean(event.isError)),
            durationMs,
            fileDiff,
          })
          toolStartedAt.delete(id)
          toolArgsMap.delete(id)
        }
      })

      webContents.send('chat:stream', { type: 'start' })
      const prompt = applySkillInstructions(text, skill)
      promptStartedAt = Date.now()
      await activeSession.prompt(prompt)

      if (!thinking) {
        const lastMsg = activeSession.messages?.at?.(-1)
        if (lastMsg?.content && Array.isArray(lastMsg.content)) {
          const tBlock = lastMsg.content.find((b) => b?.type === 'thinking')
          if (tBlock?.thinking) {
            thinking = tBlock.thinking
          }
        }
      }

      if (!full.trim()) {
        const lastMsg = activeSession.messages?.at?.(-1)
        const errMsg = lastErrorMessage || lastMsg?.errorMessage
        if (errMsg) {
          if (errMsg.includes('not supported when using Codex with a ChatGPT account')) {
            throw new Error(`当前 ChatGPT Plus/Pro 订阅账号不支持该模型版本，请在右下角切换为 GPT-5.5 (openai-codex/gpt-5.5) 继续使用。`)
          }
          throw new Error(errMsg)
        }
      }

      const elapsedMs = Date.now() - startedAt
      const usage = getUsageDelta(statsBefore, activeSession.getSessionStats(), elapsedMs)
      if (usage) {
        const ttftMs = firstTokenAt && promptStartedAt ? Math.max(0, firstTokenAt - promptStartedAt) : null
        const toolMs = turnToolMs > 0 ? turnToolMs : null
        const llmMs = toolMs != null ? Math.max(0, elapsedMs - toolMs) : elapsedMs
        usage.ttftMs = ttftMs
        usage.toolMs = toolMs
        usage.llmMs = llmMs
      }
      // 与消息气泡 usage、DSH getReport 同源：pi getSessionStats 差分 → 每条 record
      if (
        usageStore &&
        usage &&
        (usage.inputTokens > 0 ||
          usage.outputTokens > 0 ||
          usage.cacheReadTokens > 0 ||
          usage.cacheWriteTokens > 0)
      ) {
        const slash = modelKey.indexOf('/')
        const rt = await modelService.getRuntime()
        const usageModel =
          slash > 0 ? rt.getModel(modelKey.slice(0, slash), modelKey.slice(slash + 1)) : null
        try {
          await usageStore.record({
            modelKey,
            modelName: usageModel?.name,
            conversationId,
            ...usage,
          })
        } catch {
          // ignore usage persistence errors
        }
      }
      webContents.send('chat:stream', { type: 'done', full, fullThinking: thinking })
      return {
        text: full,
        thinking: thinking.trim() ? thinking.trim() : undefined,
        thinkingDurationMs: thinkingDurationMs || undefined,
        usage,
        conversationId,
        cancelled: cancelRequested,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      webContents.send('chat:stream', { type: 'error', message })
      throw error
    } finally {
      unsubscribe()
      inFlight = false
      cancelRequested = false
    }
  }

  async function updateThinkingLevel(level) {
    applyThinkingLevel(session, level)
  }

  async function abort() {
    if (!inFlight) return false
    cancelRequested = true
    await session?.abort()
    return true
  }

  function mutateQueue(kind, index, action, text) {
    if (!session || !inFlight) return { ok: false, error: '当前没有运行中的会话' }
    const lane = kind === 'steering' ? 'steering' : 'followUp'
    if (action === 'remove') {
      if (!session.removeQueuedMessage?.(lane, index)) return { ok: false, error: '无法移除队列项' }
    } else if (action === 'update') {
      if (!text?.trim()) return { ok: false, error: '内容不能为空' }
      if (!session.updateQueuedMessage?.(lane, index, text.trim())) return { ok: false, error: '无法更新队列项' }
    } else {
      return { ok: false, error: '未知操作' }
    }
    return {
      ok: true,
      steering: [...(session.getSteeringMessages?.() ?? [])],
      followUp: [...(session.getFollowUpMessages?.() ?? [])],
    }
  }

  async function sendWrapped(options) {
    return send(options)
  }

  function getLiveContextUsage() {
    if (!session || typeof session.getSessionStats !== 'function') {
      return { inputTokens: 0, outputTokens: 0, contextTokens: null, contextWindow: null, contextPercent: null }
    }
    const stats = session.getSessionStats()
    const ctx = stats?.contextUsage
    return {
      inputTokens: stats?.tokens?.input ?? 0,
      outputTokens: stats?.tokens?.output ?? 0,
      cacheReadTokens: stats?.tokens?.cacheRead ?? 0,
      contextTokens: ctx?.tokens ?? null,
      contextWindow: ctx?.contextWindow ?? null,
      contextPercent: ctx?.percent ?? null,
    }
  }

  async function getSessionStatsSnapshot(conversationId) {
    if (!conversationId || !/^[a-f\d-]{36}$/i.test(conversationId)) {
      return null
    }
    if (session && sessionConversationId === conversationId && typeof session.getSessionStats === 'function') {
      return mapPiSessionStats(session.getSessionStats())
    }
    try {
      let cwd = getWorkspacePath()
      if (!cwd) {
        cwd = path.join(agentDataPath, 'scratch')
      }
      const sessionDir = path.join(agentDataPath, 'conversations')
      const sessionFile = path.join(sessionDir, `${conversationId}.jsonl`)
      const sessionManager = SessionManager.open(sessionFile, sessionDir, cwd)
      const folded = aggregateSessionEntries(sessionManager.getEntries())
      return {
        ...folded,
        contextTokens: null,
        contextWindow: null,
        contextPercent: null,
      }
    } catch {
      return null
    }
  }

  return {
    send: sendWrapped,
    abort,
    isBusy: () => inFlight,
    disposeSession,
    resetSession: disposeSession,
    updateThinkingLevel,
    mutateQueue,
    getLiveContextUsage,
    getSessionStatsSnapshot,
  }
}
