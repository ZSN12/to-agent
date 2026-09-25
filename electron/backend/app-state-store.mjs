import path from 'node:path'
import { createJsonStore } from './json-store.mjs'
import { createThreadStore } from './thread-store.mjs'

const DEFAULT_STATE = () => ({
  workspacePath: null,
  conversationId: null,
  threadTitle: '新对话',
  permissionMode: 'ask',
  messages: [],
  tasks: [],
  outputLogs: [],
})

function toAppState(threadState) {
  return {
    workspacePath: threadState.workspacePath,
    conversationId: threadState.conversationId,
    threadTitle: threadState.title,
    currentThreadId: threadState.id,
    permissionMode: threadState.permissionMode,
    messages: threadState.messages,
    tasks: threadState.tasks,
    outputLogs: threadState.outputLogs,
    threads: threadState.threads,
  }
}

function titleFromMessage(text) {
  const compact = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!compact) return '新对话'
  return compact.length > 42 ? `${compact.slice(0, 42)}…` : compact
}

/** App-facing state adapter over a local multi-thread store. */
export function createAppStateStore(userDataPath, fallbackWorkspace) {
  const legacyStore = createJsonStore(path.join(userDataPath, 'taskweaver-app-state.json'), () => ({
    ...DEFAULT_STATE(),
    workspacePath: fallbackWorkspace,
  }))
  const threadStore = createThreadStore(userDataPath, fallbackWorkspace)
  let initialization

  async function ensureInitialized() {
    if (!initialization) {
      initialization = (async () => {
        const legacy = await legacyStore.read()
        await threadStore.initialize(legacy)
      })()
    }
    await initialization
  }

  async function getState() {
    await ensureInitialized()
    return toAppState(await threadStore.getState())
  }

  return {
    async getState() {
      return getState()
    },
    async listThreads() {
      await ensureInitialized()
      return threadStore.listThreads()
    },
    async createThread(options) {
      await ensureInitialized()
      return toAppState(await threadStore.createThread(options))
    },
    async switchThread(threadId) {
      await ensureInitialized()
      return toAppState(await threadStore.switchThread(threadId))
    },
    async renameThread(threadId, title) {
      await ensureInitialized()
      return threadStore.renameThread(threadId, title)
    },
    async togglePinThread(threadId) {
      await ensureInitialized()
      return threadStore.togglePinThread(threadId)
    },
    async deleteThread(threadId) {
      await ensureInitialized()
      return toAppState(await threadStore.deleteThread(threadId))
    },
    async forkThread(threadId, messageId) {
      await ensureInitialized()
      return toAppState(await threadStore.forkThread(threadId, messageId))
    },
    async setWorkspace(workspacePath) {
      await ensureInitialized()
      // A different project receives a fresh thread/session so history from the
      // previous project can never be replayed in the new workspace.
      return toAppState(await threadStore.createThread({ workspacePath }))
    },
    async setThreadTitle(threadTitle) {
      await ensureInitialized()
      const current = await threadStore.getState()
      await threadStore.renameThread(current.id, threadTitle)
      return getState()
    },
    async setPermissionMode(permissionMode) {
      if (!['ask', 'on-risk', 'full'].includes(permissionMode)) throw new Error('权限模式无效')
      await ensureInitialized()
      return toAppState(await threadStore.setCurrent({ permissionMode }))
    },
    async setMessages(messages) {
      await ensureInitialized()
      return toAppState(await threadStore.setCurrent({ messages }))
    },
    async appendMessages(...entries) {
      await ensureInitialized()
      return toAppState(await threadStore.updateCurrent((thread) => {
        const messages = [...thread.messages, ...entries]
        const firstUserMessage = messages.find((message) => message.author === 'user')
        const title = thread.title === '新对话' && firstUserMessage ? titleFromMessage(firstUserMessage.text) : thread.title
        return { messages, title }
      }))
    },
    async setTasks(tasks) {
      await ensureInitialized()
      return toAppState(await threadStore.setCurrent({ tasks }))
    },
    async appendOutputLog(entry) {
      await ensureInitialized()
      const safe = {
        id: String(entry?.id ?? `log-${Date.now()}`).slice(0, 120),
        toolName: String(entry?.toolName ?? 'tool').slice(0, 80),
        status: ['running', 'done', 'error', 'blocked'].includes(entry?.status) ? entry.status : 'done',
        inputSummary: String(entry?.inputSummary ?? '').slice(0, 500),
        resultSummary: String(entry?.resultSummary ?? '').slice(0, 1200),
        taskId: entry?.taskId ? String(entry.taskId).slice(0, 80) : undefined,
        startedAt: Number.isFinite(entry?.startedAt) ? entry.startedAt : Date.now(),
        durationMs: Number.isFinite(entry?.durationMs) ? Math.max(0, entry.durationMs) : null,
      }
      return toAppState(await threadStore.updateCurrent((thread) => ({
        outputLogs: [...thread.outputLogs.filter((item) => item.id !== safe.id), safe].slice(-150),
      })))
    },
    async listOutputLogs({ query = '', status, limit = 150 } = {}) {
      await ensureInitialized()
      const thread = await threadStore.getState()
      const normalizedQuery = String(query).toLocaleLowerCase()
      return thread.outputLogs
        .filter((item) => !status || item.status === status)
        .filter((item) => !normalizedQuery || `${item.toolName} ${item.inputSummary} ${item.resultSummary}`.toLocaleLowerCase().includes(normalizedQuery))
        .slice(-Math.max(1, Math.min(150, Number(limit) || 150)))
        .reverse()
    },
    async clearConversation() {
      await ensureInitialized()
      return toAppState(await threadStore.createThread())
    },
  }
}
