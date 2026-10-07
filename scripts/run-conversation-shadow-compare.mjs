import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZHostManager } from '../electron/agent/z-host/index.mjs'
import {
  createTaskWeaverConversationRuntime,
  fakeSessionRemotes,
  loadSessionManagerClass,
} from '../electron/backend/dsh-conversation-runtime.mjs'
import { extractDshChatTranscript } from '../electron/backend/dsh-transcript-serialize.mjs'
import {
  compareConversationTranscripts,
  inspectUserPromptEnvelope,
} from '../electron/backend/conversation-shadow-compare.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const userDataPath = process.argv.find((arg) => arg.startsWith('--user-data='))?.slice('--user-data='.length)
  ?? path.join(os.homedir(), 'Library/Application Support/taskweaver-desktop')
const requestedConversationId = process.argv.find((arg) => arg.startsWith('--conversation='))?.slice('--conversation='.length)
const includeTimeline = process.argv.includes('--timeline')
const threadsPath = path.join(userDataPath, 'taskweaver-threads.json')
const mapPath = path.join(userDataPath, 'taskweaver/dsh-session-map.json')
const sessionRoot = path.join(userDataPath, 'dsh/sessions')
const [threadState, sessionMap] = await Promise.all([
  fs.readFile(threadsPath, 'utf8').then(JSON.parse),
  fs.readFile(mapPath, 'utf8').then(JSON.parse),
])
const threads = Array.isArray(threadState.threads) ? threadState.threads : []
const candidates = Object.entries(sessionMap.sessions ?? {}).flatMap(([conversationId, entry]) => {
  const thread = threads.find((row) => row.conversationId === conversationId)
  if (!thread || (requestedConversationId && conversationId !== requestedConversationId)) return []
  if (!requestedConversationId && thread.workspacePath !== root) return []
  return [{ conversationId, entry, thread }]
})
const workspaces = await fs.readdir(sessionRoot)
const artifacts = []
for (const candidate of candidates) {
  for (const workspace of workspaces) {
    const directory = path.join(sessionRoot, workspace, candidate.entry.sessionId)
    try {
      const stat = await fs.stat(path.join(directory, 'session.jsonl.zstd'))
      artifacts.push({ ...candidate, directory, workspace, modifiedAt: stat.mtimeMs, archiveBytes: stat.size })
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    }
  }
}
const source = artifacts.sort((left, right) => right.modifiedAt - left.modifiedAt)[0]
if (!source) throw new Error(requestedConversationId
  ? `No UI+Host session archive found for conversation ${requestedConversationId}`
  : 'No UI+Host session archive found for a conversation bound to the current project')

const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-shadow-compare-'))
const copiedSessionDir = path.join(reportDir, 'dsh/sessions', source.workspace, source.entry.sessionId)
let hostManager
try {
  // Copy only the selected session archive. No user credentials/settings are copied,
  // and no prompt is sent; the Host is used only to project its persisted history.
  await fs.mkdir(path.dirname(copiedSessionDir), { recursive: true })
  await fs.cp(source.directory, copiedSessionDir, { recursive: true })
  hostManager = createZHostManager({
    runtimeRoot: path.join(root, 'vendor/taskweaver-z-runtime'),
    userDataPath: reportDir,
    executable: process.execPath,
  })
  const { api } = await hostManager.start()
  const historyReply = await api.sessions.history({ sessionId: source.entry.sessionId, maxMessages: 100_000 })
  if (!historyReply?.result?.ok) {
    throw new Error(historyReply?.result?.error?.message ?? 'Host history read failed')
  }
  const history = historyReply.result.value
  const nativeEvents = Array.isArray(history?.events) ? history.events.map((row) => row.event).filter(Boolean) : []
  const eventTypeCounts = {}
  for (const event of nativeEvents) eventTypeCounts[event.type] = (eventTypeCounts[event.type] ?? 0) + 1
  const usageByTurn = new Map()
  for (const event of nativeEvents) {
    if (event.type !== 'assistant/message') continue
    const turn = event.data?.turn
    const usage = event.data?.usage ?? event.data?.message?.usage
    if (!Number.isInteger(turn) || !usage) continue
    const total = usageByTurn.get(turn) ?? {
      assistantMessages: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    }
    total.assistantMessages++
    total.inputTokens += Number(usage.inputTokens ?? usage.uncachedInputTokens ?? usage.input ?? 0) || 0
    total.outputTokens += Number(usage.outputTokens ?? usage.output ?? 0) || 0
    total.cacheReadTokens += Number(usage.cacheReadTokens ?? usage.cacheRead ?? usage.cache_read_tokens ?? 0) || 0
    total.cacheWriteTokens += Number(usage.cacheWriteTokens ?? usage.cacheWrite ?? usage.cache_write_tokens ?? 0) || 0
    usageByTurn.set(turn, total)
  }
  const nativeHistory = {
    eventCount: nativeEvents.length,
    hasMore: Boolean(history?.hasMore),
    firstSeq: nativeEvents[0]?.seq ?? null,
    lastSeq: nativeEvents.at(-1)?.seq ?? null,
    eventTypeCounts,
    assistantUsageByTurn: Object.fromEntries([...usageByTurn.entries()].sort(([left], [right]) => left - right)),
  }
  const runtimeRoot = path.join(root, 'vendor/taskweaver-z-runtime')
  const SessionManager = await loadSessionManagerClass(runtimeRoot)
  const conversationRuntime = await createTaskWeaverConversationRuntime(runtimeRoot)
  const sessionManager = new SessionManager(api, fakeSessionRemotes(), undefined, undefined, conversationRuntime)
  const session = sessionManager.get(source.entry.sessionId)
  await session.open()
  let olderPages = 0
  while (session.getSnapshot().hasMore) {
    await session.loadOlder()
    olderPages++
    if (olderPages > 1_000) throw new Error('History paging exceeded 1,000 pages; aborting diagnostic')
  }
  const fullSnapshot = session.getSnapshot()
  const hostTranscript = extractDshChatTranscript(fullSnapshot)
  const projectedUsageByTurn = new Map()
  const chat = fullSnapshot.chat
  if (Array.isArray(chat?.order) && typeof chat.nodes?.get === 'function') {
    for (const key of chat.order) {
      const node = chat.nodes.get(key)
      if (node?.kind !== 'assistant-step' || !Number.isInteger(node.data?.turn)) continue
      const usage = node.data.usage ?? node.data.finalNode?.usage
      if (!usage) continue
      const total = projectedUsageByTurn.get(node.data.turn) ?? {
        assistantSteps: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      }
      total.assistantSteps++
      total.inputTokens += Number(usage.inputTokens ?? usage.uncachedInputTokens ?? usage.input ?? 0) || 0
      total.outputTokens += Number(usage.outputTokens ?? usage.output ?? 0) || 0
      total.cacheReadTokens += Number(usage.cacheReadTokens ?? usage.cacheRead ?? usage.cache_read_tokens ?? 0) || 0
      total.cacheWriteTokens += Number(usage.cacheWriteTokens ?? usage.cacheWrite ?? usage.cache_write_tokens ?? 0) || 0
      projectedUsageByTurn.set(node.data.turn, total)
    }
  }
  const timelineAssistantSteps = []
  const timelineThinkingByTurn = new Map()
  for (const [turnNumber, turn] of fullSnapshot.chat?.timeline?.turns ?? []) {
    for (const step of turn.steps ?? []) {
      const assistant = step.data?.get?.('assistant-step')
      if (!assistant) continue
      const stepThinking = (assistant.blocks ?? [])
        .filter(block => block?.kind === 'reasoning' && typeof block.text === 'string')
        .map(block => block.text)
        .join('')
      timelineThinkingByTurn.set(turnNumber, (timelineThinkingByTurn.get(turnNumber) ?? '') + stepThinking)
      timelineAssistantSteps.push({
        turn: turnNumber,
        step: step.step,
        status: assistant.status ?? null,
        hasFinalNode: Boolean(assistant.finalNode),
        reasoningChars: (assistant.blocks ?? []).reduce((total, block) =>
          total + (block?.kind === 'reasoning' && typeof block.text === 'string' ? block.text.length : 0), 0),
        hasUsage: Boolean(assistant.usage ?? assistant.finalNode?.usage),
        usage: assistant.usage ?? assistant.finalNode?.usage ? {
          inputTokens: (assistant.usage ?? assistant.finalNode?.usage).inputTokens ?? null,
          outputTokens: (assistant.usage ?? assistant.finalNode?.usage).outputTokens ?? null,
          cacheReadTokens: (assistant.usage ?? assistant.finalNode?.usage).cacheReadTokens ?? null,
        } : null,
      })
    }
  }
  const comparison = compareConversationTranscripts(source.thread.messages, hostTranscript)
  const uiUserRows = source.thread.messages.filter((row) => row?.author === 'user')
  const hostUserRows = hostTranscript.filter((row) => row?.role === 'user')
  const uiAssistantRows = source.thread.messages.filter((row) => ['orchestrator', 'agent'].includes(row?.author))
  const orderedThinkingTurns = [...timelineThinkingByTurn.keys()].sort((left, right) => left - right)
  const thinkingReconstruction = {
    uiCount: uiAssistantRows.length,
    timelineTurnCount: orderedThinkingTurns.length,
    exactInOrder: uiAssistantRows.reduce((matched, row, index) => {
      const uiThinking = typeof row.thinking === 'string' ? row.thinking.trim() : ''
      const timelineThinking = (timelineThinkingByTurn.get(orderedThinkingTurns[index]) ?? '').trim()
      return matched + Number(uiThinking === timelineThinking)
    }, 0),
    entries: uiAssistantRows.map((row, index) => {
      const turn = orderedThinkingTurns[index]
      const uiThinking = typeof row.thinking === 'string' ? row.thinking.trim() : ''
      const timelineThinking = (timelineThinkingByTurn.get(turn) ?? '').trim()
      return { turn: turn ?? null, uiChars: uiThinking.length, timelineChars: timelineThinking.length, exact: uiThinking === timelineThinking }
    }),
  }
  const timeline = includeTimeline ? {
    ui: source.thread.messages.map((row) => ({
      role: row.author === 'user' ? 'user' : ['orchestrator', 'agent'].includes(row.author) ? 'assistant' : 'other',
      textChars: typeof row.text === 'string' ? row.text.length : 0,
      thinkingChars: typeof row.thinking === 'string' ? row.thinking.length : 0,
      timestamp: row.timestamp ?? null,
      behavior: row.behavior ?? null,
      hasUsage: Boolean(row.usage),
      usage: row.usage ? {
        inputTokens: row.usage.inputTokens ?? null,
        outputTokens: row.usage.outputTokens ?? null,
        cacheReadTokens: row.usage.cacheReadTokens ?? null,
        cacheWriteTokens: row.usage.cacheWriteTokens ?? null,
      } : null,
    })),
    host: hostTranscript.map((row) => ({
      role: row.role,
      textChars: typeof row.text === 'string' ? row.text.length : 0,
      thinkingChars: typeof row.thinking === 'string' ? row.thinking.length : 0,
      timestamp: row.timestamp ?? null,
      behavior: row.behavior ?? null,
      hasUsage: Boolean(row.usage),
      usage: row.usage ? {
        inputTokens: row.usage.inputTokens ?? null,
        outputTokens: row.usage.outputTokens ?? null,
        cacheReadTokens: row.usage.cacheReadTokens ?? null,
        cacheWriteTokens: row.usage.cacheWriteTokens ?? null,
      } : null,
    })),
    userTextShape: uiUserRows.map((row, index) => {
      const uiText = typeof row.text === 'string' ? row.text.trim() : ''
      const hostText = typeof hostUserRows[index]?.text === 'string' ? hostUserRows[index].text.trim() : ''
      return {
        index,
        uiChars: uiText.length,
        hostChars: hostText.length,
        exact: uiText === hostText,
        hostStartsWithUiText: Boolean(uiText) && hostText.startsWith(uiText),
        hostEndsWithUiText: Boolean(uiText) && hostText.endsWith(uiText),
        addedCharsWhenPrefixOrSuffix: hostText.startsWith(uiText) || hostText.endsWith(uiText)
          ? Math.max(0, hostText.length - uiText.length)
          : null,
        envelope: inspectUserPromptEnvelope(uiText, hostText),
      }
    }),
    nativeAssistantEvents: nativeEvents
      .filter((event) => event.type === 'assistant/message' && event.data?.turn <= 2)
      .map((event) => ({
        seq: event.seq,
        turn: event.data?.turn,
        step: event.data?.step,
        dataKeys: Object.keys(event.data ?? {}).sort(),
        surfaceKind: event.data?.surface?.kind ?? (typeof event.data?.surface === 'string' ? event.data.surface : null),
        sourceKind: event.data?.source?.kind ?? event.data?.message?.source?.kind ?? null,
        contentBlockTypes: (event.data?.message?.content ?? []).map((block) => block?.type ?? 'unknown'),
        usage: event.data?.usage ? {
          inputTokens: event.data.usage.inputTokens ?? event.data.usage.uncachedInputTokens ?? null,
          outputTokens: event.data.usage.outputTokens ?? null,
          cacheReadTokens: event.data.usage.cacheReadTokens ?? null,
        } : null,
      })),
    projectedAssistantSteps: (chat?.order ?? [])
      .map((key) => chat.nodes.get(key))
      .filter((node) => node?.kind === 'assistant-step' && node.data?.turn <= 2)
      .map((node) => ({
        turn: node.data.turn,
        step: node.data.step,
        status: node.data.status,
        blockKinds: (node.data.blocks ?? []).map((block) => block?.kind ?? 'unknown'),
        hasFinalNode: Boolean(node.data.finalNode),
        usage: node.data.usage ? {
          inputTokens: node.data.usage.inputTokens ?? node.data.usage.uncachedInputTokens ?? null,
          outputTokens: node.data.usage.outputTokens ?? null,
          cacheReadTokens: node.data.usage.cacheReadTokens ?? null,
        } : null,
      })),
    thinkingReconstruction,
  } : undefined
  console.log(JSON.stringify({
    status: 'compared',
    conversationId: source.conversationId,
    sessionId: source.entry.sessionId,
    archiveBytes: source.archiveBytes,
    archiveModifiedAt: new Date(source.modifiedAt).toISOString(),
    nativeHistory,
    projection: {
      olderPages,
      hasMore: fullSnapshot.hasMore,
      openState: fullSnapshot.openState,
      assistantStepUsageByTurn: Object.fromEntries([...projectedUsageByTurn.entries()].sort(([left], [right]) => left - right)),
      ...(includeTimeline ? { timelineAssistantSteps } : {}),
    },
    comparison,
    ...(timeline ? { timeline } : {}),
    privacy: 'No message text, hashes, settings or credentials are included in this report.',
  }, null, 2))
} finally {
  try { await hostManager?.stop() } finally {
    await fs.rm(reportDir, { recursive: true, force: true })
  }
}
