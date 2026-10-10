import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({
  stdin: {
    contents: `
      export { registerChatIpc } from './desktop/backend/ipc/register-chat-ipc.mjs'
      export { registerWorktreeIpc } from './desktop/backend/ipc/register-worktree-ipc.mjs'
    `,
    resolveDir: process.cwd(),
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [{
    name: 'p6-ipc-test-dependencies',
    setup(api) {
      api.onResolve({ filter: /^\.\.\/ipc-utils\.mjs$/ }, () => ({ path: 'ipc-utils', namespace: 'p6-test' }))
      api.onLoad({ filter: /^ipc-utils$/, namespace: 'p6-test' }, () => ({
        contents: `export function ipcHandle(ipcMain, channel, handler) {
          ipcMain.handle(channel, async (event, ...args) => {
            try { return { ok: true, data: await handler(event, ...args) } }
            catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
          })
        }`,
      }))

      api.onResolve({ filter: /^\.\.\/worktree-service\.mjs$/ }, () => ({ path: 'worktree-service', namespace: 'p6-test' }))
      api.onLoad({ filter: /^worktree-service$/, namespace: 'p6-test' }, () => ({
        contents: `const calls = () => globalThis.__taskweaverP6.calls
          export async function listTaskWorktrees(input) { calls().push(['list', input]); return [{ taskId: 'T1' }] }
          export async function removeTaskWorktree(input) { calls().push(['remove', input]); return { removed: true } }
          export async function getTaskWorktreeDiff(input) { calls().push(['diff', input]); return { taskId: input.taskId, stat: '', patch: '' } }
          export async function previewTaskWorktreeMerge(input) { calls().push(['preview', input]); return { canApply: true, conflict: false, files: [], stat: '' } }
          export async function applyTaskWorktreeMerge(input) { calls().push(['apply', input]); return { merged: true } }`,
      }))

      api.onResolve({ filter: /^\.\.\/git-service\.mjs$/ }, () => ({ path: 'git-service', namespace: 'p6-test' }))
      api.onLoad({ filter: /^git-service$/, namespace: 'p6-test' }, () => ({
        contents: `const calls = () => globalThis.__taskweaverP6.calls
          export async function isGitRepository(workspacePath) { calls().push(['isGitRepository', workspacePath]); return true }
          export async function createGitCheckpoint(workspacePath, options) { calls().push(['checkpoint', { workspacePath, ...options }]); return { ok: true } }`,
      }))
    },
  }],
})

const { registerChatIpc, registerWorktreeIpc } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`,
)
const handlers = new Map()
const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
const calls = []
globalThis.__taskweaverP6 = { calls }

registerChatIpc({
  ipcMain,
  chat: { listRunningConversationIds: () => ['conv-chat', 'conv-shared'] },
  orchestration: { listRunningConversationIds: () => ['conv-dag', 'conv-shared'] },
  turnInProgressByConversation: new Map([['conv-turn', true], ['conv-idle', false]]),
})

const listRunning = await handlers.get('chat:listRunningConversations')({}, {})
assert.equal(listRunning.ok, true)
assert.deepEqual(new Set(listRunning.data), new Set(['conv-chat', 'conv-shared', 'conv-dag', 'conv-turn']),
  'running status must aggregate chat, DAG and turn locks, deduplicating conversations')

let busy = false
const resolved = []
registerWorktreeIpc({
  ipcMain,
  userDataPath: '/test/user-data',
  resolveWorktreeContext: async (requestedConversationId) => {
    resolved.push(requestedConversationId)
    return { conversationId: `canonical:${requestedConversationId}`, workspacePath: '/test/workspace' }
  },
  assertNotBusy: (conversationId) => {
    calls.push(['assertNotBusy', conversationId])
    if (busy) throw new Error('conversation is busy')
  },
  withWorkspaceOperation: async (workspacePath, operation) => {
    calls.push(['workspaceOperation', workspacePath])
    return await operation()
  },
})

assert.deepEqual((await handlers.get('worktree:list')({}, 'conv-a')).data, [{ taskId: 'T1' }])
await handlers.get('worktree:remove')({}, 'task-a', true, 'conv-a', 'run-a')
await handlers.get('worktree:diff')({}, 'task-a', 'conv-a', 'run-a')
await handlers.get('worktree:previewMerge')({}, 'task-a', 'conv-a', 'run-a')
const applied = await handlers.get('worktree:applyMerge')({}, 'task-a', { removeAfter: true, files: ['src/a.ts'] }, 'conv-a', 'run-a')
assert.equal(applied.ok, true)
assert.deepEqual(resolved, ['conv-a', 'conv-a', 'conv-a', 'conv-a', 'conv-a'])

const scopedCalls = calls.filter(([, value]) => value && typeof value === 'object' && 'conversationId' in value)
assert.equal(scopedCalls.length, 6, 'worktree operations and the pre-merge checkpoint all remain conversation-scoped')
for (const [, value] of scopedCalls) {
  assert.equal(value.conversationId, 'canonical:conv-a')
  assert.equal(value.workspacePath, '/test/workspace')
  if ('taskId' in value) assert.equal(value.runId, 'run-a')
}
assert.deepEqual(calls.filter(([name]) => ['checkpoint', 'apply'].includes(name)).map(([name]) => name), ['checkpoint', 'apply'],
  'apply must checkpoint before changing the main workspace')
assert.deepEqual(calls.find(([name]) => name === 'apply')?.[1], {
  workspacePath: '/test/workspace',
  conversationId: 'canonical:conv-a',
  runId: 'run-a',
  taskId: 'task-a',
  userDataPath: '/test/user-data',
  removeAfter: true,
  files: ['src/a.ts'],
})

busy = true
const rejectedApply = await handlers.get('worktree:applyMerge')({}, 'task-a', {}, 'conv-a', 'run-a')
assert.deepEqual(rejectedApply, { ok: false, error: 'conversation is busy' })
assert.equal(calls.filter(([name]) => name === 'apply').length, 1, 'busy conversations cannot apply a worktree merge')

delete globalThis.__taskweaverP6
console.log('P6 IPC wiring passed: parallel running-state union, conversation/run-scoped worktree calls, conflict-safe merge gate, and checkpoint ordering')
