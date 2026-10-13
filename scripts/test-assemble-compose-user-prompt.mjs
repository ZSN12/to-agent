import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  assembleAndComposeUserPrompt,
  promptBudgetSnapshotFromStats,
} from '../backend/assemble-and-compose-user-prompt.mjs'
import { prefetchChatTurnInputs } from '../backend/chat-turn-prefetch.mjs'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-compose-'))
const workspacePath = path.join(tmp, 'repo')
await fs.mkdir(path.join(workspacePath, 'backend'), { recursive: true })
await fs.mkdir(path.join(workspacePath, '.taskweaver'), { recursive: true })
await fs.mkdir(path.join(workspacePath, '.cursor', 'rules'), { recursive: true })
await fs.writeFile(path.join(workspacePath, 'package.json'), '{"name":"fixture"}\n')
await fs.writeFile(path.join(workspacePath, 'TASKWEAVER.md'), 'HOST_ROOT_RULE_MARKER\n')
await fs.writeFile(path.join(workspacePath, 'AGENTS.md'), 'HOST_AGENTS_RULE_MARKER\n')
await fs.writeFile(path.join(workspacePath, '.taskweaver', 'rules.md'), 'TASKWEAVER_LOCAL_RULE_MARKER\n')
await fs.writeFile(path.join(workspacePath, '.cursor', 'rules', 'local.mdc'), 'CURSOR_LOCAL_RULE_MARKER\n')
const targetRel = 'backend/register-ipc.mjs'
await fs.writeFile(path.join(workspacePath, targetRel), '// fixture\n')

const result = await assembleAndComposeUserPrompt({
  text: `解释 @file:${targetRel} 的职责`,
  workMode: 'code',
  workspacePath,
  sandboxContextLine: 'sandbox: read-only',
  modelKey: 'xiaomi/mimo-v2.6-flash',
  selectedSkill: null,
  conversationMessages: [],
  preferences: {
    promptInjectionLimitBytes: 32 * 1024,
    enableRepoMap: true,
    autoVerifyAfterMutation: false,
  },
})

assert.ok(result.effectivePrompt.includes('解释 @file:backend/register-ipc.mjs'))
assert.match(result.effectivePrompt, /文件引用：backend\/register-ipc\.mjs/)
assert.doesNotMatch(result.effectivePrompt, /fixture/,
  'the default prompt pipeline sends only a path reference for @file')
assert.ok(result.effectivePrompt.includes('sandbox: read-only'))
assert.ok(result.effectivePrompt.includes('TASKWEAVER_LOCAL_RULE_MARKER'))
assert.ok(result.effectivePrompt.includes('CURSOR_LOCAL_RULE_MARKER'))
assert.doesNotMatch(result.effectivePrompt, /HOST_(?:ROOT|AGENTS)_RULE_MARKER/,
  'root instruction candidates are owned by the Host agent-instructions plugin')
assert.equal(result.promptStats.budgetBytes, 32 * 1024)
assert.ok(result.promptStats.totalInjectedBytes > 0)

const smallWindowBudget = await assembleAndComposeUserPrompt({
  text: `解释 @file:${targetRel} 的职责`,
  workMode: 'code',
  modelContextWindow: 64_000,
  workspacePath,
  sandboxContextLine: 'sandbox: read-only',
  conversationMessages: [],
  preferences: {
    promptInjectionLimitBytes: 128 * 1024,
    enableRepoMap: false,
  },
})
assert.equal(smallWindowBudget.dynamicBudget.workspaceContextBytes, 16 * 1024,
  'workspace context budget scales with the selected model window')
assert.equal(smallWindowBudget.injectionByteCap, 16 * 1024,
  'a larger saved preference cannot exceed the selected model window budget')
assert.equal(smallWindowBudget.promptStats.budgetBytes, 16 * 1024,
  'the scaled cap reaches the final prompt composer')
assert.ok(smallWindowBudget.assembled.injectedBytes <= 16 * 1024,
  'workspace assembly remains under the scaled prompt cap')

const largeWindowBudget = await assembleAndComposeUserPrompt({
  text: '你好',
  modelContextWindow: 1_000_000,
  preferences: { enableRepoMap: false },
})
assert.equal(largeWindowBudget.dynamicBudget.workspaceContextBytes, 128 * 1024,
  'large model windows scale up to the workspace context safety ceiling')
assert.equal(largeWindowBudget.injectionByteCap, 128 * 1024,
  'the default saved preference follows the computed model-window cap')
assert.equal(largeWindowBudget.promptStats.budgetBytes, 128 * 1024,
  'the large-window budget reaches the final prompt composer')

const inlineReference = await assembleAndComposeUserPrompt({
  text: `解释 @file:${targetRel} 的职责`,
  workMode: 'code',
  workspacePath,
  sandboxContextLine: 'sandbox: read-only',
  modelKey: 'xiaomi/mimo-v2.6-flash',
  selectedSkill: null,
  conversationMessages: [],
  preferences: {
    promptInjectionLimitBytes: 32 * 1024,
    enableRepoMap: false,
    inlineSmallFileReferences: true,
  },
})
assert.match(inlineReference.effectivePrompt, /fixture/,
  'the explicit preference reaches the prompt assembler for small text files')
assert.doesNotMatch(inlineReference.effectivePrompt, /mtime：/,
  'volatile file timestamps are not included in inline context text')

const laterTurn = await assembleAndComposeUserPrompt({
  text: '继续处理同一任务。',
  workMode: 'code',
  workspacePath,
  sandboxContextLine: 'sandbox: read-only',
  modelKey: 'xiaomi/mimo-v2.6-flash',
  selectedSkill: null,
  conversationMessages: [{ author: 'user', content: '修复上一轮的问题' }],
  preferences: { promptInjectionLimitBytes: 32 * 1024, enableRepoMap: false },
})
assert.match(laterTurn.effectivePrompt, /TASKWEAVER_LOCAL_RULE_MARKER/,
  'trusted workspace rules are re-injected on subsequent task turns to survive context compaction')
assert.match(laterTurn.effectivePrompt, /CURSOR_LOCAL_RULE_MARKER/,
  'trusted editor rules remain available after the first task turn')

const composerResult = await assembleAndComposeUserPrompt({
  text: '只读检查一个文件。',
  workMode: 'code',
  workspacePath,
  sandboxContextLine: 'sandbox: read-only',
  modelKey: 'opencodex/cursor/composer-2.5',
  selectedSkill: null,
  conversationMessages: [],
  preferences: {
    promptInjectionLimitBytes: 32 * 1024,
    enableRepoMap: false,
    autoVerifyAfterMutation: false,
  },
})
assert.doesNotMatch(composerResult.effectivePrompt, /taskweaver_cursor_tools|read 优先用 file_path/,
  'tool guidance is not duplicated into the user message; the bridge derives it from this turn\'s tool catalog')
assert.equal(composerResult.promptStats.cursorGuidanceBytes, 0)

const composerGreeting = await assembleAndComposeUserPrompt({
  text: '你好',
  workMode: 'code',
  workspacePath,
  sandboxContextLine: 'sandbox: read-only',
  modelKey: 'opencodex/cursor/composer-2.5',
  selectedSkill: null,
  conversationMessages: [],
  preferences: { promptInjectionLimitBytes: 32 * 1024, enableRepoMap: false },
})
assert.doesNotMatch(composerGreeting.effectivePrompt, /taskweaver_cursor_tools|read 优先用 file_path/,
  'Cursor tool directions are not injected into a simple greeting')
assert.doesNotMatch(composerGreeting.effectivePrompt, /TASKWEAVER_LOCAL_RULE_MARKER|CURSOR_LOCAL_RULE_MARKER/,
  'repository rules do not consume a plain greeting turn')

const taskAfterGreeting = await assembleAndComposeUserPrompt({
  text: '修复 backend/register-ipc.mjs 的问题',
  workMode: 'code',
  workspacePath,
  sandboxContextLine: 'sandbox: read-only',
  modelKey: 'opencodex/cursor/composer-2.5',
  selectedSkill: null,
  conversationMessages: [{ author: 'user', text: '你好' }],
  preferences: { promptInjectionLimitBytes: 32 * 1024, enableRepoMap: false },
})
assert.doesNotMatch(taskAfterGreeting.effectivePrompt, /taskweaver_cursor_tools|read 优先用 file_path/,
  'tool directions are supplied by the bridge system prompt, not copied into the user message')
assert.match(taskAfterGreeting.effectivePrompt, /TASKWEAVER_LOCAL_RULE_MARKER/,
  'the first actual engineering task after a greeting still receives workspace rules')

const snapshot = promptBudgetSnapshotFromStats('conv-1', result.promptStats, result.assembled, 'test')
assert.equal(snapshot.conversationId, 'conv-1')
assert.equal(snapshot.scope, 'test')
assert.equal(snapshot.contextTruncated, result.assembled.contextTruncated === true)

const pipelineSource = await fs.readFile(new URL('../backend/chat-turn-pipeline.mjs', import.meta.url), 'utf8')
const chatIpcSource = await fs.readFile(new URL('../backend/ipc/register-chat-ipc.mjs', import.meta.url), 'utf8')
assert.match(pipelineSource, /assembleAndComposeUserPrompt/)
assert.match(chatIpcSource, /tasks:sendMessage[\s\S]*runTaskMessage/)
assert.match(pipelineSource, /runTaskMessage[\s\S]*assembleAndComposeUserPrompt/)
assert.doesNotMatch(pipelineSource, /runTaskMessage[\s\S]*composePromptPipeline\(/)

const pendingReads = new Map()
const startedReads = []
for (const name of ['skill', 'preferences', 'context-window', 'conversation']) {
  let resolveRead
  const promise = new Promise((resolve) => { resolveRead = resolve })
  pendingReads.set(name, { promise, resolve: resolveRead })
}
const prefetchedPromise = prefetchChatTurnInputs({
  skillName: 'review',
  workspacePath,
  workspaceTrusted: true,
  activeKey: 'xiaomi/mimo-v2.6-flash',
  conversationId: 'conversation-1',
  skills: { resolve: () => { startedReads.push('skill'); return pendingReads.get('skill').promise } },
  appPreferences: { get: () => { startedReads.push('preferences'); return pendingReads.get('preferences').promise } },
  modelService: { getModelContextWindow: () => { startedReads.push('context-window'); return pendingReads.get('context-window').promise } },
  appState: { getConversationState: () => { startedReads.push('conversation'); return pendingReads.get('conversation').promise } },
})
await new Promise((resolve) => setImmediate(resolve))
assert.deepEqual(startedReads.sort(), ['context-window', 'conversation', 'preferences', 'skill'],
  'all read-only preparation inputs start before any one of them resolves')
pendingReads.get('skill').resolve({ name: 'review' })
pendingReads.get('preferences').resolve({ enableRepoMap: false })
pendingReads.get('context-window').resolve(128_000)
pendingReads.get('conversation').resolve({ messages: [{ author: 'user', text: 'prior' }] })
assert.deepEqual(await prefetchedPromise, {
  selectedSkill: { name: 'review' },
  preferences: { enableRepoMap: false },
  modelContextWindow: 128_000,
  conversationState: { messages: [{ author: 'user', text: 'prior' }] },
})

const contextWindowFallback = await prefetchChatTurnInputs({
  skillName: null,
  activeKey: 'missing/model',
  conversationId: 'conversation-2',
  skills: { resolve: async () => { throw new Error('should not resolve an absent skill') } },
  appPreferences: { get: async () => ({}) },
  modelService: { getModelContextWindow: async () => { throw new Error('catalog unavailable') } },
  appState: { getState: async () => ({ messages: [] }) },
})
assert.equal(contextWindowFallback.modelContextWindow, null,
  'a missing model context-window hint remains a non-fatal fallback')
assert.equal(contextWindowFallback.conversationState.messages.length, 0)

console.log('test-assemble-compose-user-prompt: ok')
