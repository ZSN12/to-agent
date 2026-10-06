import path from 'node:path'
import { createJsonStore } from './json-store.mjs'
import { createThreadStore } from './thread-store.mjs'
import {
  MESSAGE_TITLE_MAX_LENGTH,
  LOG_ID_MAX_LENGTH,
  TOOL_NAME_MAX_LENGTH,
  TASK_ID_MAX_LENGTH,
  TOOL_INPUT_SUMMARY_MAX_LENGTH,
  TOOL_RESULT_SUMMARY_MAX_LENGTH,
  MAX_OUTPUT_LOGS,
} from './config.mjs'

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
    modelKey: threadState.modelKey ?? null,
    thinkingLevel: threadState.thinkingLevel ?? null,
    messages: threadState.messages,
    tasks: threadState.tasks,
    outputLogs: threadState.outputLogs,
    threads: threadState.threads,
  }
}

function titleFromMessage(text) {
  const compact = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!compact) return '新对话'
  return compact.length > MESSAGE_TITLE_MAX_LENGTH ? `${compact.slice(0, MESSAGE_TITLE_MAX_LENGTH)}…` : compact
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
    async getConversationState(conversationId) {
      await ensureInitialized()
      return toAppState(await threadStore.getByConversationId(conversationId))
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
    async toggleArchiveThread(threadId) {
      await ensureInitialized()
      return threadStore.toggleArchiveThread(threadId)
    },
    async searchThreads(query, options) {
      await ensureInitialized()
      return threadStore.searchThreads(query, options)
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
      const current = await threadStore.getState()
      const targetWorkspace = workspacePath ?? null
      if ((current.workspacePath ?? null) === targetWorkspace) {
        return toAppState(current)
      }
      const isEmpty = (!current.messages || current.messages.length === 0)
        && (!current.tasks || current.tasks.length === 0)
      if (isEmpty) {
        return toAppState(await threadStore.setCurrent({ workspacePath: targetWorkspace }))
      }
      return toAppState(await threadStore.createThread({ workspacePath: targetWorkspace }))
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
    async setModelKey(modelKey) {
      await ensureInitialized()
      return toAppState(await threadStore.setCurrent({ modelKey: modelKey ?? null }))
    },
    async setThinkingLevel(thinkingLevel) {
      await ensureInitialized()
      return toAppState(await threadStore.setCurrent({ thinkingLevel: thinkingLevel ?? null }))
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
    async appendMessagesToConversation(conversationId, ...entries) {
      await ensureInitialized()
      return toAppState(await threadStore.updateConversation(conversationId, (thread) => {
        const messages = [...thread.messages, ...entries]
        const firstUserMessage = messages.find((message) => message.author === 'user')
        const title = thread.title === '新对话' && firstUserMessage ? titleFromMessage(firstUserMessage.text) : thread.title
        return { messages, title }
      }))
    },
    async upsertMessagesToConversation(conversationId, ...entries) {
      await ensureInitialized()
      return toAppState(await threadStore.updateConversation(conversationId, (thread) => {
        const messages = [...thread.messages]
        for (const entry of entries) {
          const index = messages.findIndex(message => message.id === entry.id)
          if (index < 0) messages.push(entry)
          else messages[index] = { ...messages[index], ...entry }
        }
        return { messages }
      }))
    },
    async setTasks(tasks) {
      await ensureInitialized()
      return toAppState(await threadStore.setCurrent({ tasks }))
    },
    async setTasksForConversation(conversationId, tasks) {
      await ensureInitialized()
      return toAppState(await threadStore.updateConversation(conversationId, { tasks }))
    },
    async appendOutputLog(entry) {
      await ensureInitialized()
      const safe = {
        id: String(entry?.id ?? `log-${Date.now()}`).slice(0, LOG_ID_MAX_LENGTH),
        toolName: String(entry?.toolName ?? 'tool').slice(0, TOOL_NAME_MAX_LENGTH),
        status: ['running', 'done', 'error', 'blocked', 'cancelled'].includes(entry?.status) ? entry.status : 'done',
        inputSummary: String(entry?.inputSummary ?? '').slice(0, TOOL_INPUT_SUMMARY_MAX_LENGTH),
        resultSummary: String(entry?.resultSummary ?? '').slice(0, TOOL_RESULT_SUMMARY_MAX_LENGTH),
        taskId: entry?.taskId ? String(entry.taskId).slice(0, TASK_ID_MAX_LENGTH) : undefined,
        startedAt: Number.isFinite(entry?.startedAt) ? entry.startedAt : Date.now(),
        durationMs: Number.isFinite(entry?.durationMs) ? Math.max(0, entry.durationMs) : null,
      }
      return toAppState(await threadStore.updateCurrent((thread) => ({
        outputLogs: [...thread.outputLogs.filter((item) => item.id !== safe.id), safe].slice(-MAX_OUTPUT_LOGS),
      })))
    },
    async appendOutputLogForConversation(conversationId, entry) {
      await ensureInitialized()
      const safe = {
        id: String(entry?.id ?? `log-${Date.now()}`).slice(0, LOG_ID_MAX_LENGTH),
        toolName: String(entry?.toolName ?? 'tool').slice(0, TOOL_NAME_MAX_LENGTH),
        status: ['running', 'done', 'error', 'blocked', 'cancelled'].includes(entry?.status) ? entry.status : 'done',
        inputSummary: String(entry?.inputSummary ?? '').slice(0, TOOL_INPUT_SUMMARY_MAX_LENGTH),
        resultSummary: String(entry?.resultSummary ?? '').slice(0, TOOL_RESULT_SUMMARY_MAX_LENGTH),
        taskId: entry?.taskId ? String(entry.taskId).slice(0, TASK_ID_MAX_LENGTH) : undefined,
        startedAt: Number.isFinite(entry?.startedAt) ? entry.startedAt : Date.now(),
        durationMs: Number.isFinite(entry?.durationMs) ? Math.max(0, entry.durationMs) : null,
      }
      return toAppState(await threadStore.updateConversation(conversationId, (thread) => ({
        outputLogs: [...thread.outputLogs.filter((item) => item.id !== safe.id), safe].slice(-MAX_OUTPUT_LOGS),
      })))
    },
    async listOutputLogs({ query = '', status, limit = MAX_OUTPUT_LOGS } = {}) {
      await ensureInitialized()
      const thread = await threadStore.getState()
      const normalizedQuery = String(query).toLocaleLowerCase()
      return thread.outputLogs
        .filter((item) => !status || item.status === status)
        .filter((item) => !normalizedQuery || `${item.toolName} ${item.inputSummary} ${item.resultSummary}`.toLocaleLowerCase().includes(normalizedQuery))
        .slice(-Math.max(1, Math.min(MAX_OUTPUT_LOGS, Number(limit) || MAX_OUTPUT_LOGS)))
        .reverse()
    },
    async clearConversation(options = {}) {
      await ensureInitialized()
      return toAppState(await threadStore.createThread(options))
    },
  }
}
