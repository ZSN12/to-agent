import assert from 'node:assert/strict'
import { registerAppIpc } from '../backend/ipc/register-app-ipc.mjs'

const handlers = new Map()
let createdOptions = null
let resetCalls = 0
let refreshCalls = 0
let busyChecks = 0

registerAppIpc({
  ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
  BrowserWindow: {},
  dialog: {},
  userDataPath: '/tmp/taskweaver-new-thread-test',
  appState: {
    async getState() {
      throw new Error('creating a new conversation must not inspect or mutate the active run')
    },
    async createThread(options) {
      createdOptions = options
      return { conversationId: 'new-conversation', currentThreadId: 'new-thread', ...options }
    },
  },
  chat: {
    async resetSession() { resetCalls += 1 },
  },
  conversationHub: {},
  refreshUiSnapshot: async () => { refreshCalls += 1 },
  assertNotBusy() { busyChecks += 1; throw new Error('active conversation is busy') },
  validateWorkspace: async (workspacePath) => workspacePath,
})

const invoke = handlers.get('app:clearConversation')
assert.equal(typeof invoke, 'function')
const result = await invoke(
  { senderFrame: { url: 'taskweaver://app/index.html' } },
  { workspacePath: '/workspace/project' },
)

assert.deepEqual(result, {
  ok: true,
  data: {
    conversationId: 'new-conversation',
    currentThreadId: 'new-thread',
    workspacePath: '/workspace/project',
  },
})
assert.deepEqual(createdOptions, { workspacePath: '/workspace/project' })
assert.equal(resetCalls, 0, 'creating a thread must not reset the active chat session')
assert.equal(busyChecks, 0, 'an unrelated running conversation must not block thread creation')
assert.equal(refreshCalls, 1)

console.log('✓ a new conversation can be opened while another conversation is running')
