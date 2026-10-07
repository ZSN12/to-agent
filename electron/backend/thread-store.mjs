import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createJsonStore } from './json-store.mjs'
import { searchSessionTranscripts } from './session-transcript-search.mjs'

const VALID_PERMISSION_MODES = new Set(['readonly', 'ask', 'on-risk', 'full'])
const DEFAULT_TITLE = '新对话'

function makeThread({ workspacePath, permissionMode = 'ask', title = DEFAULT_TITLE, pinned = false, archived = false, modelKey = null, thinkingLevel = null, now = Date.now() }) {
  return {
    id: randomUUID(),
    conversationId: randomUUID(),
    workspacePath: workspacePath ?? null,
    title,
    permissionMode: VALID_PERMISSION_MODES.has(permissionMode) ? permissionMode : 'ask',
    pinned: Boolean(pinned),
    archived: Boolean(archived),
    modelKey: modelKey ?? null,
    thinkingLevel: thinkingLevel ?? null,
    createdAt: now,
    updatedAt: now,
    messages: [],
    tasks: [],
    outputLogs: [],
  }
}

function normalizeThread(thread, fallbackWorkspace) {
  const id = thread.id ?? thread.conversationId ?? randomUUID()
  return {
    ...thread,
    id,
    conversationId: thread.conversationId ?? randomUUID(),
    workspacePath: thread.workspacePath === undefined ? null : thread.workspacePath,
    title: typeof thread.title === 'string' ? thread.title : thread.threadTitle ?? DEFAULT_TITLE,
    permissionMode: VALID_PERMISSION_MODES.has(thread.permissionMode) ? thread.permissionMode : 'ask',
    pinned: Boolean(thread.pinned),
    archived: Boolean(thread.archived),
    modelKey: typeof thread.modelKey === 'string' ? thread.modelKey : null,
    thinkingLevel: typeof thread.thinkingLevel === 'string' ? thread.thinkingLevel : null,
    createdAt: Number.isFinite(thread.createdAt) ? thread.createdAt : Date.now(),
    updatedAt: Number.isFinite(thread.updatedAt) ? thread.updatedAt : Date.now(),
    messages: Array.isArray(thread.messages) ? thread.messages : [],
    tasks: Array.isArray(thread.tasks) ? thread.tasks : [],
    outputLogs: Array.isArray(thread.outputLogs) ? thread.outputLogs : [],
  }
}

function summary(thread) {
  return {
    id: thread.id,
    conversationId: thread.conversationId,
    workspacePath: thread.workspacePath,
    title: thread.title,
    permissionMode: thread.permissionMode,
    pinned: Boolean(thread.pinned),
    archived: Boolean(thread.archived),
    modelKey: thread.modelKey ?? null,
    thinkingLevel: thread.thinkingLevel ?? null,
    updatedAt: thread.updatedAt,
    messageCount: thread.messages.length,
  }
}

/** Local per-thread state; each thread owns its workspace, transcript, tasks and session id. */
export function createThreadStore(userDataPath, fallbackWorkspace) {
  const store = createJsonStore(path.join(userDataPath, 'taskweaver-threads.json'), () => ({ currentThreadId: null, threads: [] }))
  let queue = Promise.resolve()

  function serialize(operation) {
    const next = queue.then(operation, operation)
    queue = next.catch(() => {})
    return next
  }

  async function transact(mutator) {
    return serialize(async () => {
      const current = await store.read()
      const state = {
        currentThreadId: current.currentThreadId ?? null,
        threads: Array.isArray(current.threads) ? current.threads.map((thread) => normalizeThread(thread, fallbackWorkspace)) : [],
      }
      const next = await mutator(state)
      await store.write(next)
      return next
    })
  }

  async function currentState() {
    const state = await store.read()
    const threads = Array.isArray(state.threads) ? state.threads.map((thread) => normalizeThread(thread, fallbackWorkspace)) : []
    const current = threads.find((thread) => thread.id === state.currentThreadId)
    if (!current) throw new Error('当前会话不存在')
    return { ...current, currentThreadId: current.id, threads: threads.map(summary) }
  }

  async function updateThread(threadId, patch) {
    await transact((state) => {
      const index = state.threads.findIndex((thread) => thread.id === threadId)
      if (index < 0) throw new Error('找不到该会话')
      const thread = state.threads[index]
      const nextPatch = typeof patch === 'function' ? patch(thread) : patch
      state.threads[index] = normalizeThread({ ...thread, ...nextPatch, updatedAt: Date.now() }, fallbackWorkspace)
      return state
    })
    return currentState()
  }

  async function updateConversation(conversationId, patch) {
    await transact((state) => {
      const index = state.threads.findIndex((thread) => thread.conversationId === conversationId)
      if (index < 0) throw new Error('找不到该对话')
      const thread = state.threads[index]
      const nextPatch = typeof patch === 'function' ? patch(thread) : patch
      state.threads[index] = normalizeThread({ ...thread, ...nextPatch, updatedAt: Date.now() }, fallbackWorkspace)
      return state
    })
    return currentState()
  }

  return {
    filePath: store.filePath,
    async initialize(legacyState = null) {
      await transact((state) => {
        if (state.threads.length > 0) {
          if (!state.threads.some((thread) => thread.id === state.currentThreadId)) {
            state.currentThreadId = state.threads[0].id
          }
          return state
        }
        const legacy = legacyState && typeof legacyState === 'object' ? legacyState : {}
        const migrated = normalizeThread({
          id: legacy.threadId ?? legacy.conversationId ?? randomUUID(),
          conversationId: legacy.conversationId,
          workspacePath: legacy.workspacePath,
          title: legacy.threadTitle,
          permissionMode: legacy.permissionMode,
          messages: legacy.messages,
          tasks: legacy.tasks,
          outputLogs: legacy.outputLogs,
        }, fallbackWorkspace)
        state.currentThreadId = migrated.id
        state.threads = [migrated]
        return state
      })
      return currentState()
    },
    getState: currentState,
    async getByConversationId(conversationId) {
      const state = await store.read()
      const threads = Array.isArray(state.threads) ? state.threads.map((thread) => normalizeThread(thread, fallbackWorkspace)) : []
      const thread = threads.find((item) => item.conversationId === conversationId)
      if (!thread) throw new Error('找不到该对话')
      return { ...thread, currentThreadId: state.currentThreadId, threads: threads.map(summary) }
    },
    updateConversation,
    async listThreads() {
      const state = await store.read()
      const threads = Array.isArray(state.threads) ? state.threads.map((thread) => normalizeThread(thread, fallbackWorkspace)) : []
      return threads.sort((a, b) => b.updatedAt - a.updatedAt).map((thread) => ({ ...summary(thread), current: thread.id === state.currentThreadId }))
    },
    async createThread({ workspacePath, permissionMode, title, modelKey, thinkingLevel } = {}) {
      await transact((state) => {
        const current = state.threads.find((thread) => thread.id === state.currentThreadId)
        const thread = makeThread({
          workspacePath: workspacePath !== undefined ? workspacePath : (current?.workspacePath ?? null),
          permissionMode: permissionMode ?? current?.permissionMode ?? 'ask',
          title: title ?? DEFAULT_TITLE,
          modelKey: modelKey !== undefined ? modelKey : (current?.modelKey ?? null),
          thinkingLevel: thinkingLevel !== undefined ? thinkingLevel : (current?.thinkingLevel ?? null),
        })
        state.threads.unshift(thread)
        state.currentThreadId = thread.id
        return state
      })
      return currentState()
    },
    async switchThread(threadId) {
      await transact((state) => {
        if (!state.threads.some((thread) => thread.id === threadId)) throw new Error('找不到该会话')
        state.currentThreadId = threadId
        return state
      })
      return currentState()
    },
    async renameThread(threadId, title) {
      const normalized = String(title ?? '').trim()
      if (!normalized) throw new Error('会话名称不能为空')
      await updateThread(threadId, { title: normalized.slice(0, 80) })
      return this.listThreads()
    },
    async togglePinThread(threadId) {
      await transact((state) => {
        const index = state.threads.findIndex((thread) => thread.id === threadId)
        if (index < 0) throw new Error('找不到该会话')
        const thread = state.threads[index]
        state.threads[index] = normalizeThread({ ...thread, pinned: !thread.pinned, updatedAt: Date.now() }, fallbackWorkspace)
        return state
      })
      return this.listThreads()
    },
    async toggleArchiveThread(threadId) {
      await transact((state) => {
        const index = state.threads.findIndex((thread) => thread.id === threadId)
        if (index < 0) throw new Error('找不到该会话')
        const thread = state.threads[index]
        const nextArchived = !thread.archived
        state.threads[index] = normalizeThread({ ...thread, archived: nextArchived, updatedAt: Date.now() }, fallbackWorkspace)
        if (nextArchived && state.currentThreadId === threadId) {
          const activeCandidate = state.threads.find((t) => !t.archived && t.id !== threadId)
          if (activeCandidate) {
            state.currentThreadId = activeCandidate.id
          }
        }
        return state
      })
      return this.listThreads()
    },
    async searchThreads(query, { workspacePath } = {}) {
      const state = await store.read()
      const threads = Array.isArray(state.threads) ? state.threads.map((t) => normalizeThread(t, fallbackWorkspace)) : []
      const q = String(query || '').trim().toLowerCase()
      if (!q) {
        return threads
          .filter((t) => (workspacePath ? t.workspacePath === workspacePath : true))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((t) => ({ ...summary(t), current: t.id === state.currentThreadId }))
      }

      const conversationsDir = path.join(userDataPath, 'taskweaver-agent', 'conversations')
      const transcriptHits = await searchSessionTranscripts(conversationsDir, q, { limit: 80 })
      const transcriptConversationIds = new Set(transcriptHits.map((hit) => hit.conversationId))

      return threads
        .filter((t) => {
          if (workspacePath && t.workspacePath !== workspacePath) return false
          const titleMatch = t.title.toLowerCase().includes(q)
          const msgMatch = t.messages.some((m) => {
            const text = typeof m.text === 'string' ? m.text : (typeof m.content === 'string' ? m.content : '')
            return text.toLowerCase().includes(q)
          })
          const jsonlMatch = transcriptConversationIds.has(t.conversationId)
          return titleMatch || msgMatch || jsonlMatch
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((t) => ({ ...summary(t), current: t.id === state.currentThreadId }))
    },
    async deleteThread(threadId) {
      await transact((state) => {
        if (!state.threads.some((thread) => thread.id === threadId)) throw new Error('找不到该会话')
        state.threads = state.threads.filter((thread) => thread.id !== threadId)
        if (state.threads.length === 0) {
          const replacement = makeThread({ workspacePath: fallbackWorkspace })
          state.threads = [replacement]
          state.currentThreadId = replacement.id
        } else if (state.currentThreadId === threadId) {
          state.currentThreadId = [...state.threads].sort((a, b) => b.updatedAt - a.updatedAt)[0].id
        }
        return state
      })
      return currentState()
    },
    async forkThread(threadId, messageId) {
      await transact((state) => {
        const source = state.threads.find((t) => t.id === threadId)
        if (!source) throw new Error('找不到要分支的会话')

        let slicedMessages = []
        if (messageId) {
          const idx = source.messages.findIndex((m) => m.id === messageId)
          if (idx >= 0) {
            slicedMessages = source.messages.slice(0, idx + 1)
          } else {
            slicedMessages = [...source.messages]
          }
        } else {
          slicedMessages = [...source.messages]
        }

        const now = Date.now()
        const baseTitle = (source.title || DEFAULT_TITLE).replace(/\s*\(分支\s*\d*\)$/, '')
        const forkedTitle = `${baseTitle} (分支)`

        const newThread = {
          id: randomUUID(),
          conversationId: randomUUID(),
          workspacePath: source.workspacePath ?? fallbackWorkspace ?? null,
          title: forkedTitle,
          permissionMode: source.permissionMode ?? 'ask',
          modelKey: source.modelKey ?? null,
          thinkingLevel: source.thinkingLevel ?? null,
          createdAt: now,
          updatedAt: now,
          messages: JSON.parse(JSON.stringify(slicedMessages)),
          tasks: [],
          outputLogs: [],
        }

        state.threads.unshift(newThread)
        state.currentThreadId = newThread.id
        return state
      })
      return currentState()
    },
    async setCurrent(patch) {
      return transact(async (state) => {
        if (!state.currentThreadId) throw new Error('当前会话不存在')
        const index = state.threads.findIndex((thread) => thread.id === state.currentThreadId)
        if (index < 0) throw new Error('当前会话不存在')
        const thread = state.threads[index]
        const nextPatch = typeof patch === 'function' ? patch(thread) : patch
        state.threads[index] = normalizeThread({ ...thread, ...nextPatch, updatedAt: Date.now() }, fallbackWorkspace)
        return state
      }).then(() => currentState())
    },
    async updateCurrent(mutator) {
      return serialize(async () => {
        const state = await store.read()
        const threads = Array.isArray(state.threads) ? state.threads.map((thread) => normalizeThread(thread, fallbackWorkspace)) : []
        const index = threads.findIndex((thread) => thread.id === state.currentThreadId)
        if (index < 0) throw new Error('当前会话不存在')
        const updated = await mutator(threads[index])
        threads[index] = normalizeThread({ ...threads[index], ...updated, updatedAt: Date.now() }, fallbackWorkspace)
        await store.write({ currentThreadId: state.currentThreadId, threads })
        return currentState()
      })
    },
  }
}
