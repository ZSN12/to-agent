import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'

async function loadSource(entry, plugins = []) {
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, format: 'cjs', platform: 'node',
    jsx: 'automatic', external: ['react', 'react/jsx-runtime'], plugins,
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  return module.exports
}
const { buildChatMessageNavigation, buildDshToolHistoryIndex, dshToolHistoryForMessage, isDshContextMessage } = await loadSource('src/features/dsh-runtime/dshTranscriptMessages.ts')
const message = (id, author = 'orchestrator', extra = {}) => ({ id, author, name: id, time: '00:00', text: `text ${id}`, ...extra })
const user = (id, extra) => message(id, 'user', extra)
const context = (id) => message(id, 'agent', { dshContext: { plugin: 'test' } })
const compact = (id) => message(id, 'orchestrator', { compaction: { automatic: true } })
function legacyNavigation(messages) {
  const eligibleAssistant = (candidate) => candidate.author !== 'user' && !candidate.compaction && !isDshContextMessage(candidate)
  const relations = messages.map((_, index) => {
    let previousAssistantId = null, previousUserIndex = -1, responseForUser
    for (let cursor = index - 1; cursor >= 0; cursor--) {
      if (eligibleAssistant(messages[cursor])) { previousAssistantId = messages[cursor].id; break }
    }
    for (let cursor = index - 1; cursor >= 0; cursor--) {
      const candidate = messages[cursor]
      if (isDshContextMessage(candidate) || candidate.compaction) continue
      if (candidate.author === 'user' && !candidate.behavior) { previousUserIndex = cursor; break }
    }
    for (let cursor = index + 1; cursor < messages.length; cursor++) {
      const candidate = messages[cursor]
      if (isDshContextMessage(candidate) || candidate.compaction) continue
      if (candidate.author === 'user' && !candidate.behavior) break
      if (candidate.author !== 'user') { responseForUser = candidate; break }
    }
    return { previousAssistantId, previousUserIndex, responseForUser }
  })
  const latestAssistantIndex = messages.findLastIndex(eligibleAssistant)
  return {
    relations, latestAssistantIndex,
    lastAgentMessageId: latestAssistantIndex >= 0 ? messages[latestAssistantIndex].id : null,
    latestUserMessageIndex: messages.findLastIndex((candidate) => candidate.author === 'user' && !candidate.behavior),
  }
}
function legacyHistory(message, rows, traces, latest) {
  const turn = Number.isSafeInteger(message.dshTurn) && message.dshTurn > 0 ? message.dshTurn : null
  if (turn === null) return latest ? { rows, traces } : {}
  return {
    rows: rows?.filter((row) => row.turn === turn || (latest && row.turn === 0)),
    ...(latest ? { traces: traces.filter((trace) => trace.turn === turn || trace.turn == null) } : {}),
  }
}
const tool = (id, turn) => ({ callId: id, toolName: 'read', argsRaw: '{}', status: 'done', turn, step: 1 })
const trace = (id, turn) => ({ id, toolName: 'read', status: 'done', turn })

const cases = [
  [], [context('ctx'), compact('compact')],
  [user('u1'), context('ctx'), user('steer', { behavior: 'steer' }), compact('compact'), message('a1', 'orchestrator', { modelKey: 'first' }), message('a2'), user('u2'), message('a3-error', 'orchestrator', { errorCode: 'MAX_STEPS' }), user('pending')],
  [message('start'), user('follow-up', { behavior: 'follow-up' }), context('ctx'), user('u1'), user('u2'), message('a-error', 'orchestrator', { callout: '执行失败：mock' }), message('retry'), compact('compact')],
]
let seed = 42
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
for (let sample = 0; sample < 50; sample++) {
  cases.push(Array.from({ length: 40 }, (_, i) => {
    const id = `${sample}-${i}`
    return [() => user(id), () => user(id, { behavior: 'steer' }), () => context(id), () => compact(id), () => message(id), () => message(id, 'orchestrator', { errorCode: 'MAX_STEPS' })][random() % 6]()
  }))
}
for (const messages of cases) assert.deepEqual(buildChatMessageNavigation(messages), legacyNavigation(messages))

const rows = [tool('zero-first', 0), tool('old', 1), tool('current-first', 2), tool('zero-middle', 0), tool('current-last', 2), tool('invalid', NaN)]
const traces = [trace('unscoped-first'), trace('old', 1), trace('current', 2), trace('null-unscoped', null), trace('zero', 0), trace('invalid', NaN)]
for (const inputRows of [undefined, [], rows]) {
  const index = buildDshToolHistoryIndex(inputRows, traces)
  for (const turn of [undefined, 0, 1, 2, -1, NaN, 2.5, Infinity]) {
    const candidate = message(`turn-${turn}`, 'orchestrator', { dshTurn: turn })
    for (const latest of [false, true]) {
      const expected = legacyHistory(candidate, inputRows, traces, latest)
      assert.deepEqual(index.forMessage(candidate, latest), expected)
      assert.deepEqual(dshToolHistoryForMessage(candidate, inputRows, traces, latest), expected)
    }
    if (turn !== undefined) {
      assert.deepEqual(index.forTurn(turn), {
        rows: inputRows?.filter((row) => row.turn === turn || row.turn === 0),
        traces: traces.filter((trace) => trace.turn === turn || trace.turn == null),
      })
    }
  }
  assert.equal(index.forMessage(message('legacy'), true).rows, inputRows)
  assert.equal(index.forMessage(message('legacy'), true).traces, traces)
}

for (const size of [100, 500, 1000]) {
  let messageReads = 0, rowTurnReads = 0, traceTurnReads = 0
  const messages = Array.from({ length: size }, (_, i) => i % 2 === 0 ? user(`u-${i}`) : message(`a-${i}`, 'orchestrator', { dshTurn: (i + 1) / 2 }))
  const countedMessages = new Proxy(messages, { get(target, key, receiver) { if (/^\d+$/.test(String(key))) messageReads++; return Reflect.get(target, key, receiver) } })
  const navigation = buildChatMessageNavigation(countedMessages)
  assert.equal(messageReads, size * 2)
  const inputRows = Array.from({ length: size * 2 }, (_, i) => ({ ...tool(`r-${i}`, 1 + i % (size / 2)), get turn() { rowTurnReads++; return 1 + i % (size / 2) } }))
  const inputTraces = Array.from({ length: size }, (_, i) => ({ ...trace(`t-${i}`), get turn() { traceTurnReads++; return 1 + i % (size / 2) } }))
  const index = buildDshToolHistoryIndex(inputRows, inputTraces)
  let visibleRows = 0
  messages.forEach((candidate, i) => {
    visibleRows += index.forMessage(candidate, i === navigation.latestAssistantIndex).rows?.length ?? 0
    void navigation.relations[i].previousAssistantId
    void navigation.relations[i].previousUserIndex
    void navigation.relations[i].responseForUser
  })
  index.forTurn(size / 2)
  assert.equal(visibleRows, inputRows.length)
  assert.equal(rowTurnReads, inputRows.length)
  assert.equal(traceTurnReads, inputTraces.length)
}

// Exercise the actual parent component with inert visual children. This checks
// hook wiring, per-row action anchors and the selected stream/history props.
const exportsByPath = {
  '../composer/Composer': 'Composer', './Message': 'Message', './ChangedFilesDock': 'ChangedFilesDock',
  './PendingSteeringBubble': 'PendingSteeringBubble', './RetryBanner': 'RetryBanner', '../terminal/TerminalDrawer': 'TerminalDrawer',
}
const { MainConversation } = await loadSource('src/features/chat/MainConversation.tsx', [{
  name: 'inert-chat-visuals',
  setup(build) {
    build.onResolve({ filter: /.*/ }, ({ path }) => exportsByPath[path] ? { path, namespace: 'chat-test' } : undefined)
    build.onLoad({ filter: /.*/, namespace: 'chat-test' }, ({ path }) => ({ contents: `export function ${exportsByPath[path]}(props) { globalThis.__taskweaverChatCaptured.push({ name: ${JSON.stringify(exportsByPath[path])}, props }); return null }`, loader: 'js' }))
  },
}])
function render(messages, options = {}) {
  globalThis.__taskweaverChatCaptured = []
  renderToStaticMarkup(createElement(MainConversation, {
    currentThreadId: 'synthetic-thread', messages, model: { id: 'fallback' }, modelOptions: [], skills: [], permissionMode: 'default',
    toolTraces: traces, dshToolRows: rows, threadTitle: 'Synthetic', taskCount: 0, workbenchOpen: false, workbenchTab: 'files', workspacePath: null, availableProjects: [],
    onSelectProject() {}, onPickWorkspace() {}, onDetachWorkspace() {}, onModelChange() {}, onPermissionModeChange() {}, onSend() {}, onCancel() {},
    async onSearchContext() { return [] }, async onCreateDroppedReference() { return null }, onToggleNav() {}, ...options,
  }))
  return globalThis.__taskweaverChatCaptured.filter((item) => item.name === 'Message').map((item) => item.props)
}
try {
  const calls = []
  const history = [user('u1'), context('ctx'), message('a1', 'orchestrator', { modelKey: 'm-first', dshTurn: 1 }), compact('compact'), user('u2'), user('steer', { behavior: 'steer' }), message('a2-error', 'orchestrator', { errorCode: 'RETRY', dshTurn: 2 })]
  const rendered = render(history, { onFork: (id) => calls.push(['fork', id]), onResendMessage: (...args) => calls.push(['resend', ...args]), onContinueMessage: (...args) => calls.push(['continue', ...args]) })
  assert.equal(rendered.some((props) => props.message.id === 'ctx'), false)
  const byId = new Map(rendered.map((props) => [props.message.id, props]))
  byId.get('u1').onEditAndResend('first-edited')
  assert.deepEqual(calls.pop(), ['resend', 'first-edited', null, 'm-first'])
  byId.get('u2').onEditAndResend('edited')
  assert.deepEqual(calls.pop(), ['resend', 'edited', 'a1', 'fallback'])
  byId.get('a2-error').onRetry()
  assert.deepEqual(calls.pop(), ['resend', 'text u2', 'a1', 'fallback'])
  byId.get('u1').onFork('u1')
  assert.deepEqual(calls.pop(), ['fork', 'u1'])
  assert.equal(byId.get('steer').onEditAndResend, undefined)
  assert.equal(byId.get('compact').onFork, undefined)
  assert.deepEqual(byId.get('a1').dshToolRows.map((row) => row.callId), ['old'])
  assert.deepEqual(byId.get('a2-error').dshToolRows.map((row) => row.callId), ['zero-first', 'current-first', 'zero-middle', 'current-last'])
  assert.deepEqual(byId.get('a2-error').toolTraceItems.map((item) => item.id), ['unscoped-first', 'current', 'null-unscoped'])
  const capped = [...history.slice(0, -1), { ...history.at(-1), errorCode: 'MAX_STEPS', modelKey: 'cap-model' }]
  render(capped, { onResendMessage() {}, onContinueMessage: (...args) => calls.push(['continue', ...args]) }).at(-1).onRetry()
  assert.deepEqual(calls.pop(), ['continue', 'cap-model'])
  const successful = [...history.slice(0, -1), { ...history.at(-1), errorCode: undefined, modelKey: 'latest-model' }]
  render(successful, { onResendMessage: (...args) => calls.push(args) }).at(-1).onRegenerate()
  assert.deepEqual(calls.pop(), ['text u2', 'a1', 'latest-model'])
  const withTrailingCompact = render([...successful, compact('tail')], { onFork: (id) => calls.push(['fork', id]) })
  withTrailingCompact.find((props) => props.message.id === 'u1').onFork('u1')
  assert.deepEqual(calls.pop(), ['fork', 'u1'], 'a disabled later row must not revoke an earlier row fork')
  const streaming = render(history, { sending: true, activeDshTurn: 2 })
  assert.deepEqual(streaming.at(-1).dshToolRows.map((row) => row.callId), ['zero-first', 'current-first', 'zero-middle', 'current-last'])
  assert.deepEqual(streaming.at(-1).toolTraceItems.map((item) => item.id), ['unscoped-first', 'current', 'null-unscoped'])
  assert.equal(streaming.find((props) => props.message.id === 'a2-error').toolTraceItems, undefined)
  assert.deepEqual(render(history, { sending: true }).at(-1).dshToolRows, [])
  assert.deepEqual(render(history, { sending: true }).at(-1).toolTraceItems, traces)
  assert.equal(render([...history, user('pending')]).find((props) => props.message.id === 'a2-error').toolTraceItems, undefined)
} finally { delete globalThis.__taskweaverChatCaptured }
console.log('Chat-history source checks passed: legacy-equivalent turn/navigation semantics, 100/500/1000 linear data reads and MainConversation edit/retry/continue/regenerate/fork/stream wiring.')
