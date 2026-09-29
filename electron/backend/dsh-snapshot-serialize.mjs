import { extractDshChatTranscript } from './dsh-transcript-serialize.mjs'

/** Serialize @z/dsh-client-runtime ConversationSnapshot to IPC-safe JSON for TaskWeaver UI. */

function blockSummary(block) {
  if (!block || typeof block !== 'object') return null
  const kind = block.kind
  if (kind === 'text' || kind === 'reasoning') {
    const text = typeof block.text === 'string' ? block.text : ''
    return { kind, preview: text.slice(0, 240), length: text.length }
  }
  if (kind === 'tool-call') {
    return {
      kind,
      name: block.name ?? '',
      callId: block.callId ?? '',
      argsPreview: typeof block.argsRaw === 'string' ? block.argsRaw.slice(0, 120) : '',
    }
  }
  return { kind: kind ?? 'unknown' }
}

function summarizePartial(partial) {
  if (!partial) return null
  const blocksSummary = Array.isArray(partial.blocks)
    ? partial.blocks.map(blockSummary).filter(Boolean)
    : []
  return { turn: partial.turn, step: partial.step, blocks: blocksSummary }
}

function extractStreamingContent(partial) {
  if (!partial?.blocks?.length) return { text: '', reasoning: '' }
  let text = ''
  let reasoning = ''
  for (const block of partial.blocks) {
    if (block?.kind === 'text' && typeof block.text === 'string') text += block.text
    if (block?.kind === 'reasoning' && typeof block.text === 'string') reasoning += block.text
  }
  return { text, reasoning }
}

function flattenResultContent(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else if (block) parts.push(JSON.stringify(block))
  }
  return parts.join('\n').slice(0, 800)
}

function serializeToolRoot(root) {
  if (!root || typeof root !== 'object') return null
  const settled = root.kind === 'tool-result'
  const toolName = settled ? (root.call?.name ?? 'tool') : (root.name ?? 'tool')
  const argsRaw = settled ? (root.call?.argsRaw ?? '') : (root.argsRaw ?? '')
  const callId = String(settled ? root.callId : root.callId ?? '')
  if (!callId) return null
  let status = 'running'
  if (settled) {
    if (root.error?.code === 'interrupted') status = 'stopped'
    else if (root.isError) status = 'error'
    else status = 'done'
  }
  const startedAt = settled ? (root.callTime ?? root.time) : root.time
  const durationMs =
    settled && root.callTime != null && root.time != null
      ? Math.max(0, root.time - root.callTime)
      : undefined
  const resultPreview = settled ? flattenResultContent(root.content) : undefined
  return {
    callId,
    toolName,
    argsRaw: typeof argsRaw === 'string' ? argsRaw : '',
    status,
    turn: root.turn ?? 0,
    step: root.step ?? 0,
    startedAt: typeof startedAt === 'number' ? startedAt : undefined,
    durationMs,
    resultPreview: resultPreview || undefined,
    isError: settled ? Boolean(root.isError) : false,
  }
}

function listChatNodes(snapshot) {
  const chat = snapshot.chat
  if (!chat) return []
  const store = chat.nodes
  const order = chat.order
  if (Array.isArray(order) && store) {
    const get = typeof store.get === 'function' ? (key) => store.get(key) : (key) => store[key]
    return order.map(get).filter(Boolean)
  }
  if (typeof store?.values === 'function') return [...store.values()]
  if (Array.isArray(store)) return store
  if (store && typeof store === 'object') return Object.values(store)
  return []
}

function extractToolRows(snapshot) {
  const seen = new Set()
  const rows = []

  const pushRoot = (root) => {
    const serialized = serializeToolRoot(root)
    if (!serialized || seen.has(serialized.callId)) return
    seen.add(serialized.callId)
    rows.push(serialized)
    const children = root?.subCalls
    if (Array.isArray(children)) {
      for (const child of children) pushRoot(child)
    }
  }

  for (const node of listChatNodes(snapshot)) {
    if (node?.kind === 'tool-call') pushRoot(node.data?.root)
  }

  for (const call of snapshot.runningCalls ?? []) {
    pushRoot(call)
  }

  for (const block of snapshot.partial?.blocks ?? []) {
    if (block?.kind !== 'tool-call') continue
    pushRoot({
      callId: block.callId,
      name: block.name,
      argsRaw: block.argsRaw ?? '',
      turn: snapshot.partial?.turn,
      step: snapshot.partial?.step,
      time: Date.now(),
      callView: null,
      subCalls: [],
    })
  }

  const activeTurn = snapshot.partial?.turn
    ?? snapshot.runningCalls?.[0]?.turn
    ?? (snapshot.running ? (rows.length ? rows[rows.length - 1].turn : null) : null)
  if (activeTurn != null) {
    const current = rows.filter((row) => row.turn === activeTurn || row.turn === 0)
    if (current.length) return current
  }
  return rows.slice(-40)
}

function mapRunningCall(call) {
  if (!call) return null
  return {
    callId: String(call.callId ?? ''),
    toolName: call.name ?? 'tool',
    argsRaw: typeof call.argsRaw === 'string' ? call.argsRaw : '',
    status: 'running',
    turn: call.turn,
    step: call.step,
    startedAt: call.time ?? null,
  }
}

function queueItemText(item) {
  if (!item || typeof item !== 'object') return ''
  if (typeof item.text === 'string' && item.text.trim()) return item.text.trim()
  const messageContent = item.message?.content
  const content = Array.isArray(messageContent) ? messageContent : item.content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('')
}

function queueTexts(queue) {
  if (!Array.isArray(queue)) return { steering: [], followUp: [] }
  return {
    steering: queue.filter((q) => q?.placement === 'steering').map(queueItemText).filter(Boolean),
    followUp: queue.filter((q) => q?.placement === 'queued').map(queueItemText).filter(Boolean),
  }
}

function readProjections(projectionStore) {
  const projections = {}
  if (!projectionStore || typeof projectionStore !== 'object') return projections
  if (typeof projectionStore.values === 'function') {
    const values = projectionStore.values()
    if (values?.tokenUsage !== undefined) projections.tokenUsage = values.tokenUsage
    if (values?.contextPressure !== undefined) projections.contextPressure = values.contextPressure
    if (values?.contextBreakdown !== undefined) projections.contextBreakdown = values.contextBreakdown
    return projections
  }
  if (typeof projectionStore.get === 'function') {
    const tokenUsage = projectionStore.get('tokenUsage')
    if (tokenUsage !== undefined) projections.tokenUsage = tokenUsage
    const contextPressure = projectionStore.get('contextPressure')
    if (contextPressure !== undefined) projections.contextPressure = contextPressure
    const contextBreakdown = projectionStore.get('contextBreakdown')
    if (contextBreakdown !== undefined) projections.contextBreakdown = contextBreakdown
  }
  return projections
}

function activityLabel(snapshot) {
  if (!snapshot) return null
  if (snapshot.runningCalls?.length) {
    const first = snapshot.runningCalls[0]
    return `正在执行工具：${first?.name ?? 'tool'}…`
  }
  if (snapshot.partial?.blocks?.length) {
    const tool = snapshot.partial.blocks.find((b) => b?.kind === 'tool-call')
    if (tool) return `正在执行工具：${tool.name ?? 'tool'}…`
    const reasoning = snapshot.partial.blocks.find((b) => b?.kind === 'reasoning')
    if (reasoning?.text?.trim()) return '正在思考…'
    return '正在生成回复…'
  }
  if (snapshot.running) return null
  return null
}

/**
 * @param {import('@z/dsh-client-runtime').ConversationSnapshot | Record<string, unknown>} snapshot
 * @param {{ sessionId?: string, conversationId?: string, projections?: { get?: (key: string) => unknown, values?: () => Record<string, unknown> } }} meta
 */
export function serializeDshConversationView(snapshot, meta = {}) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      conversationId: meta.conversationId ?? null,
      sessionId: meta.sessionId ?? null,
      running: false,
      partial: null,
      runningCalls: [],
      toolRows: [],
      streamingText: '',
      streamingReasoning: '',
      transcript: [],
      queue: { steering: [], followUp: [] },
      projections: {},
      activityLabel: null,
    }
  }

  const runningCalls = (snapshot.runningCalls ?? [])
    .map(mapRunningCall)
    .filter(Boolean)
  const toolRows = extractToolRows(snapshot)
  const streaming = extractStreamingContent(snapshot.partial)
  const transcript = extractDshChatTranscript(snapshot)

  return {
    conversationId: meta.conversationId ?? null,
    sessionId: meta.sessionId ?? snapshot.sessionId ?? null,
    running: Boolean(snapshot.running),
    partial: summarizePartial(snapshot.partial),
    streamingText: streaming.text,
    streamingReasoning: streaming.reasoning,
    transcript,
    runningCalls,
    toolRows,
    queue: queueTexts(snapshot.queue),
    projections: readProjections(meta.projections),
    activityLabel: activityLabel(snapshot),
    openState: snapshot.openState ?? 'idle',
    hasMore: Boolean(snapshot.hasMore),
    blank: Boolean(snapshot.blank),
  }
}
