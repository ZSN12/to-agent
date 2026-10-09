import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* Phase 1: inventory tripwire, NOT proof that there is already one writer.
 * Audited first-party paths:
 * - scheduled-job-run: scheduled job append lines.
 * - register-ipc: IPC registration only (no direct transcript writes).
 * - message-factory/chat-turn-pipeline: createUserMessage append.
 * - chat-turn-persistence: native terminal result and failure (same turn ids).
 * - app-state-store -> thread-store -> json-store: durable UI JSON cache;
 *   legacy taskweaver-app-state.json is read/migrated, fork copies UI messages.
 *   This cache contains UI-only/error facts too: it is not wholly rebuildable.
 * - dsh-chat/chat-send + model-config: three sessions.prompt admissions
 *   (permission command, active queue/steer, fresh turn). Host owns events.
 *   persistSessions writes routing/model metadata, not a transcript.
 * - z-conversation-hub + serializers: rebuildable in-memory DSH projection.
 * - usage-store.record/import: accounting, not authoritative message history.
 * - Pi JSONL/legacy: no first-party writer found. transcript-search only reads;
 *   orchestration's planner/child .jsonl names now derive DSH session keys.
 * Vendor boundary (audited, deliberately not scanned):
 * session-persistence/src/coordinator.ts owns session event admission/batching;
 * session-persistence-jsonl/src/index.ts appendBatch/appendLines/materialize
 * write and fsync authoritative events. Client SessionManager is a projection.
 *
 * Known direct APIs and literal transcript sinks are checked across electron/
 * and src/, excluding electron/vendor. Comments/strings alone never match.
 * Registrations pin call shape and multiplicity, not line numbers. A moved
 * identical call is indistinguishable; this is not a control/data-flow analysis.
 * Dynamic/computed/aliased calls, template interpolation, arbitrary variable
 * paths, new unknown APIs, vendor writes and cross-process ownership remain
 * outside this guard. No runtime, credentials, or model is accessed.
 */
const root = fileURLToPath(new URL('../', import.meta.url))
const registry = [
  ['electron/backend/message-factory.mjs', 'appendMessagesToConversation:conversationId,userEntry', 1, 'createUserMessage via chat-turn-pipeline'],
  ['electron/backend/scheduled-job-run.mjs', 'appendMessagesToConversation:conversationId,{', 1, 'scheduled jobs failure append'],
  ['electron/backend/chat-turn-pipeline.mjs', 'upsertMessagesToConversation:conversationId,agentEntry', 1, 'IPC assistant projection via chat-turn-pipeline'],
  ['electron/backend/chat-turn-pipeline.mjs', 'upsertMessagesToConversation:conversationId,{', 1, 'handleChatError error patch upsert'],
  ['electron/backend/chat-turn-pipeline.mjs', 'appendMessagesToConversation:conversationId,{', 1, 'handleChatError fallback error message'],
  ['electron/backend/chat-turn-persistence.mjs', 'upsertMessagesToConversation:conversationId,{', 2, 'native terminal projection + error'],
  ['electron/backend/dsh-chat/chat-send.mjs', 'sessions.prompt:{sessionId:', 2, 'Host prompt admission (queue + turn)'],
  ['electron/backend/dsh-chat/model-config.mjs', 'sessions.prompt:{sessionId:', 1, 'permission-mode command prompt'],
  ['electron/backend/thread-store.mjs', 'store.update:async(current', 2, 'thread json-store.update (transact + updateCurrent)'],
  ['electron/backend/json-store.mjs', 'writeFile:temporaryPath,<string>', 1, 'shared atomic JSON sink'],
  ['electron/backend/app-state-store.mjs', 'setCurrent:{messages}', 1, 'replace UI messages'],
  ['electron/backend/app-state-store.mjs', 'updateCurrent:(thread)', 2, 'messages + unrelated output logs'],
  ['electron/backend/app-state-store.mjs', 'updateConversation:conversationId,(', 3, 'append/upsert + output logs'],
  ['electron/backend/app-state-store.mjs', 'updateConversation:conversationId,{', 1, 'task metadata patch'],
  ['electron/backend/thread-store.mjs', 'fact-store:taskweaver-threads.json', 1, 'UI cache store'],
  ['electron/backend/app-state-store.mjs', 'fact-store:taskweaver-app-state.json', 1, 'legacy migration input'],
]

// Small lexical recognizer: discard comments, keep quoted strings opaque.
// This intentionally does not pretend to parse JS/TS semantics.
function tokens(source) {
  const result = []
  const re = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[A-Za-z_$][\w$]*|\?\.|[^\s]/gy
  for (const match of source.matchAll(re)) {
    const value = match[0]
    if (/^\s|^\/\//.test(value) || value.startsWith('/*')) continue
    result.push({ value, offset: match.index, string: /^["'`]/.test(value) })
  }
  return result
}

const messageMethods = new Set(['setMessages', 'appendMessages', 'appendMessagesToConversation', 'upsertMessagesToConversation', 'appendMessage', 'appendTurn', 'saveHistory', 'writeHistory', 'saveConversation'])
const diskMethods = new Set(['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream'])
const factPath = /(?:taskweaver-(?:threads|app-state)\.json|\.jsonl(?:$|[.'"`])|history\.json)/

function sites(source, file) {
  const ts = tokens(source)
  const found = []
  for (let i = 0; i < ts.length; i++) {
    const token = ts[i]
    if (token.string || ts[i + 1]?.value !== '(') continue
    const method = token.value
    const member = ['.', '?.'].includes(ts[i - 1]?.value)
    const receiver = ts[i - 2]?.value
    let depth = 1, end = i + 2
    for (; end < ts.length && depth; end++) {
      if (!ts[end].string && ts[end].value === '(') depth++
      if (!ts[end].string && ts[end].value === ')') depth--
    }
    const args = ts.slice(i + 2, end)
    const prefix = args.slice(0, 3).map((item) => item.string ? '<string>' : item.value).join('')
    let key
    if (member && messageMethods.has(method)) key = `${method}:${prefix}`
    else if (member && receiver === 'sessions' && method === 'prompt') key = `sessions.prompt:${prefix}`
    else if (member && receiver === 'sessionPersistence' && ['append', 'save', 'create'].includes(method)) key = `sessionPersistence.${method}:${prefix}`
    else if (member && ['setCurrent', 'updateCurrent', 'updateConversation'].includes(method) && receiver === 'threadStore') {
      if (method !== 'setCurrent' || args.some((item) => item.value === 'messages')) key = `${method}:${prefix}`
    } else if (member && receiver === 'store' && method === 'update' && file.endsWith('/thread-store.mjs')) key = `store.update:${prefix}`
    else if (member && diskMethods.has(method) && (file.endsWith('/json-store.mjs') || args.some((item) => item.string && factPath.test(item.value)))) key = `${method}:${prefix}`
    else if (method === 'createJsonStore') {
      const literal = args.find((item) => item.string && factPath.test(item.value))
      if (literal) key = `fact-store:${literal.value.slice(1, -1)}`
    }
    if (key) found.push({ key, line: source.slice(0, token.offset).split('\n').length })
  }
  return found
}

async function files(dir) {
  const result = []
  for (const entry of await fs.readdir(path.join(root, dir), { withFileTypes: true })) {
    if (['vendor', 'node_modules', 'dist', 'tests', '__tests__'].includes(entry.name)) continue
    const name = `${dir}/${entry.name}`
    if (entry.isDirectory()) result.push(...await files(name))
    else if (entry.isFile() && /\.(?:[cm]?js|tsx?)$/.test(name) && !/\.test\./.test(name)) result.push(name)
  }
  return result.sort()
}

// Offline recognizer fixtures: detect added duplicate sites, ignore prose/readers.
assert.equal(sites('// x.appendMessage(m)\nconst s = "x.appendMessage(m)"; api.sessions.history({}); fs.writeFile(configPath, settings)', 'electron/example.mjs').length, 0)
assert.equal(sites('other.appendMessagesToConversation(id, msg); other.appendMessagesToConversation(id, msg)', 'electron/example.mjs').length, 2)
assert.equal(sites('fs.appendFile("new.jsonl", data)', 'electron/example.mjs').length, 1)
assert.equal(sites('api.sessions.prompt({ sessionId: id }); ctx.sessionPersistence.append(id, events)', 'electron/example.mjs').length, 2)

const actual = new Map()
for (const file of [...await files('electron'), ...await files('src')]) {
  for (const site of sites(await fs.readFile(path.join(root, file), 'utf8'), file)) {
    const id = `${file} | ${site.key}`
    const lines = actual.get(id) ?? []
    lines.push(site.line)
    actual.set(id, lines)
  }
}
const expected = new Map(registry.map(([file, key, count]) => [`${file} | ${key}`, count]))
const failures = []
for (const [id, lines] of actual) {
  if (expected.get(id) !== lines.length) failures.push(`${id}: expected ${expected.get(id) ?? 0}, found ${lines.length} (lines ${lines.join(', ')})`)
}
for (const [id, count] of expected) if (!actual.has(id)) failures.push(`${id}: expected ${count}, found 0 (stale registration)`)
assert.deepEqual(failures, [], 'Unregistered or changed conversation write sites; audit before updating registry')
console.log(`PASS conversation writer inventory: ${registry.length} registrations, ${[...actual.values()].reduce((count, lines) => count + lines.length, 0)} calls; lexical fixtures passed`)
console.log('Phase 1 only: UI cache duplicates remain; authoritative Z Runtime persistence, dynamic/aliased calls and variable-path disk writes are not proved safe.')
