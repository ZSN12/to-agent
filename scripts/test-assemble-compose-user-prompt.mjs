import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  assembleAndComposeUserPrompt,
  promptBudgetSnapshotFromStats,
} from '../electron/backend/assemble-and-compose-user-prompt.mjs'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-compose-'))
const workspacePath = path.join(tmp, 'repo')
await fs.mkdir(path.join(workspacePath, 'electron', 'backend'), { recursive: true })
await fs.writeFile(path.join(workspacePath, 'package.json'), '{"name":"fixture"}\n')
const targetRel = 'electron/backend/register-ipc.mjs'
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

assert.ok(result.effectivePrompt.includes('解释 @file:electron/backend/register-ipc.mjs'))
assert.ok(result.effectivePrompt.includes('sandbox: read-only'))
assert.equal(result.promptStats.budgetBytes, 32 * 1024)
assert.ok(result.promptStats.totalInjectedBytes > 0)

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
assert.match(composerResult.effectivePrompt, /read 优先用 file_path/)
assert.match(composerResult.effectivePrompt, /grep 用必填 pattern/)
assert.match(composerResult.effectivePrompt, /工具返回参数校验错误时.*最多重试一次/)
assert.doesNotMatch(result.effectivePrompt, /read 优先用 file_path/)

const snapshot = promptBudgetSnapshotFromStats('conv-1', result.promptStats, result.assembled, 'test')
assert.equal(snapshot.conversationId, 'conv-1')
assert.equal(snapshot.scope, 'test')
assert.equal(snapshot.contextTruncated, result.assembled.contextTruncated === true)

const ipcSource = await fs.readFile(new URL('../electron/backend/register-ipc.mjs', import.meta.url), 'utf8')
assert.match(ipcSource, /assembleAndComposeUserPrompt/)
assert.match(ipcSource, /tasks:sendMessage[\s\S]*assembleAndComposeUserPrompt/)
assert.doesNotMatch(ipcSource, /tasks:sendMessage[\s\S]*composePromptPipeline\(/)

console.log('test-assemble-compose-user-prompt: ok')
