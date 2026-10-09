import fs from 'node:fs/promises'
import path from 'node:path'

/** 主会话的 DSH 会话 id 是确定性的：同一个 sessionKey 永远推导出同一个 id。 */
export function sessionIdForKey(sessionKey) {
  return `tw-${sessionKey}`
}

/**
 * 会话 cwd 是否是文件系统根（`/`、`C:\`）。
 * DSH 的沙箱边界就是会话 cwd（`sandbox-policy` 用 `session.header.cwd` 当 workspaceRoot），
 * 所以 cwd 落在根上等于 `workspace-write` 的「只能写工作区内」完全失效。
 */
export function isFilesystemRoot(target) {
  if (typeof target !== 'string' || !target) return false
  const resolved = path.resolve(target)
  return resolved === path.parse(resolved).root
}

/**
 * 未绑定工作区时 `process.cwd()` 会退化成 `/`（打包版从 Finder 启动），
 * 而 DSH 用会话 cwd 当沙箱边界 —— 等于把 workspace-write 放开到整个磁盘。
 * 宁可拒绝发送，也不静默建一个边界失效的会话。
 */
export function assertBindableWorkspace(cwd) {
  if (!isFilesystemRoot(cwd)) return
  throw new Error(
    '当前对话还没有绑定工作区。未绑定工作区时会话会落在文件系统根目录，'
    + 'Z Runtime 的文件写入沙箱边界将失效，因此本次消息已阻止。请先选择一个工作区文件夹再发送。',
  )
}

export function rpcValue(response, operation) {
  const result = response?.result ?? response
  if (result?.ok === false) {
    const error = result.error ?? {}
    const failure = new Error(error.message || `${operation} failed`)
    if (error.code) failure.code = error.code
    throw failure
  }
  return result?.value ?? result
}

export function textFromMessage(message) {
  if (!message || typeof message !== 'object') return ''
  if (typeof message.text === 'string') return message.text
  if (!Array.isArray(message.content)) return ''
  return message.content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
}

export function assistantTextStepKey(turn, event) {
  const eventTurn = event?.data?.turn
  const eventStep = event?.data?.step
  if (Number.isInteger(eventTurn) && Number.isInteger(eventStep)) {
    const key = String(eventTurn) + ':' + String(eventStep)
    turn.currentTextStepKey = key
    return key
  }
  return turn.currentTextStepKey ?? 'unsequenced'
}

export function setAssistantStepText(turn, stepKey, text) {
  turn.textByStep ??= new Map()
  turn.textByStep.set(stepKey, text)
  turn.text = [...turn.textByStep.values()].join('')
}

export function logHostUserMessageBytes(logger, {
  conversationId,
  sessionKey,
  taskId,
  delivery,
  inputText,
  submittedText,
  skill,
}) {
  const inputUtf8Bytes = Buffer.byteLength(inputText, 'utf8')
  const submittedUtf8Bytes = Buffer.byteLength(submittedText, 'utf8')
  logger?.debug?.('[prompt-pipeline] Host user-message payload bytes', {
    conversationId,
    sessionKey,
    taskId: taskId ?? null,
    delivery,
    inputUtf8Bytes,
    submittedUtf8Bytes,
    skillEnvelopeAddedUtf8Bytes: Math.max(0, submittedUtf8Bytes - inputUtf8Bytes),
    skillMode: !skill ? 'none' : skill.nativeInvocation ? 'host-native' : 'filesystem',
  })
}

export function normalizeTokenUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  const cost = typeof usage.cost === 'number' ? usage.cost : usage.cost?.total
  const inputTokens = Number(usage.inputTokens ?? usage.input ?? 0) || 0
  const outputTokens = Number(usage.outputTokens ?? usage.output ?? 0) || 0
  const cacheReadTokens = Number(usage.cacheReadTokens ?? usage.cacheRead ?? 0) || 0
  const cacheWriteTokens = Number(usage.cacheWriteTokens ?? usage.cacheWrite ?? 0) || 0
  const explicitContext = Number(usage.contextTokens ?? usage.totalTokens ?? 0)
  const contextTokens = explicitContext > 0
    ? explicitContext
    : (inputTokens > 0 ? (inputTokens + cacheReadTokens) : null)
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: Number(cost ?? 0) || 0,
    contextTokens,
    contextWindow: Number(usage.contextWindow ?? 0) || null,
  }
}

export function usageFromMessage(message) {
  return normalizeTokenUsage(message?.usage)
}

export function usageFromAssistantEvent(event) {
  return normalizeTokenUsage(event?.data?.usage) ?? usageFromMessage(event?.data?.message)
}

export function mergeLastModelFailure(nativeError, lastModelFailure) {
  if (!lastModelFailure) return nativeError
  const error = nativeError && typeof nativeError === 'object'
    ? { ...nativeError }
    : typeof nativeError === 'string'
      ? { message: nativeError }
      : {}
  const code = typeof error.code === 'string' ? error.code.toUpperCase() : ''
  if (lastModelFailure.code && ['', 'ERROR', 'UNKNOWN', 'INTERNAL_ERROR', 'AGENT_ERROR'].includes(code)) {
    error.code = lastModelFailure.code
  }
  const message = typeof error.message === 'string' ? error.message.trim() : ''
  if ((!message || /^(?:z agent )?(?:执行失败|execution failed|internal error|unknown error)\.?$/i.test(message))
    && lastModelFailure.message) {
    error.message = lastModelFailure.message
  }
  return error
}

export function safeModelFailureMessage(message) {
  if (typeof message !== 'string') return null
  return message
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
    .slice(0, 600)
}

/** Pause reasoning clock so tool/model gaps are not shown as “Think 用时”. */
export function pauseThinkingSegment(turn, now = Date.now()) {
  if (!turn.thinkingStartedAt || turn.thinkingEndedAt) return
  turn.thinkingEndedAt = now
  turn.thinkingActiveMs = (turn.thinkingActiveMs ?? 0) + Math.max(0, now - turn.thinkingStartedAt)
  turn.thinkingStartedAt = null
}

export function activeThinkingDurationMs(turn, now = Date.now()) {
  let total = turn.thinkingActiveMs ?? 0
  if (turn.thinkingStartedAt && !turn.thinkingEndedAt) {
    total += Math.max(0, now - turn.thinkingStartedAt)
  }
  return total
}

export function endThinkingSegment(turn, emitFn, emitTarget, now = Date.now()) {
  const wasActive = Boolean(turn.thinkingStartedAt && !turn.thinkingEndedAt)
  pauseThinkingSegment(turn, now)
  if (wasActive && !turn.silentText) {
    emitFn(emitTarget, turn.webContents, {
      type: 'thinking_end',
      fullThinking: turn.thinking,
      durationMs: activeThinkingDurationMs(turn, now),
    })
  }
}

export function recordFileChange(turn, fileDiff) {
  if (!turn.fileChanges || typeof fileDiff?.path !== 'string' || !fileDiff.path) return
  const normalizedPath = fileDiff.path.replace(/\\/g, '/')
  const key = normalizedPath.toLocaleLowerCase()
  const hasCounts = Number.isFinite(fileDiff.addedLines) && Number.isFinite(fileDiff.deletedLines)
  const existing = turn.fileChanges.get(key)
  if (!existing) {
    turn.fileChanges.set(key, {
      path: fileDiff.path,
      addedLines: hasCounts ? Math.max(0, fileDiff.addedLines) : 0,
      deletedLines: hasCounts ? Math.max(0, fileDiff.deletedLines) : 0,
      statsComplete: hasCounts,
      isNewFile: fileDiff.isNewFile === true,
    })
    return
  }
  if (hasCounts) {
    existing.addedLines += Math.max(0, fileDiff.addedLines)
    existing.deletedLines += Math.max(0, fileDiff.deletedLines)
  } else {
    existing.statsComplete = false
  }
  existing.isNewFile ||= fileDiff.isNewFile === true
}

export function resumeThinkingSegment(turn, now = Date.now()) {
  if (turn.thinkingStartedAt && !turn.thinkingEndedAt) return
  turn.thinkingStartedAt = now
  turn.thinkingEndedAt = null
}

export async function readSessionMap(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' && parsed.sessions && typeof parsed.sessions === 'object'
      ? parsed.sessions
      : {}
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw new Error(`读取 Z 会话映射失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
