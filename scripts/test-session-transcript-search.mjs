import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDshChatService } from '../desktop/backend/dsh-chat-service.mjs'
import { createThreadStore } from '../desktop/backend/thread-store.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-transcript-search-'))
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let service
try {
  for (const preset of ['tw-default', 'tw-code', 'tw-taskweaver-code', 'tw-taskweaver-readonly']) {
    const source = await fs.readFile(
      path.join(repositoryRoot, 'packages/runtime/host-cli/config/agent-presets', preset, 'agent.cordis.yml'),
      'utf8',
    )
    assert.match(source,
      /- id: tool-session-query\s+name: '@taskweaver\/dsh-tool-session-query'\s+config:\s+maxSearchResults: 30\b/m,
      `${preset} should mount tool-session-query with a 30-result cap`)
  }

  const store = createThreadStore(root, '/ws')
  const first = await store.initialize({ threadId: 'legacy-thread', workspacePath: '/ws' })
  await store.renameThread(first.id, '旧讨论')

  await fs.mkdir(path.join(root, 'taskweaver'), { recursive: true })
  await fs.writeFile(path.join(root, 'taskweaver', 'dsh-session-map.json'), JSON.stringify({
    version: 1,
    sessions: {
      [first.conversationId]: {
        sessionId: 'host-session-last-discussion',
        cwd: '/ws',
      },
    },
  }))

  const searchCalls = []
  const api = {
    sessions: {
      async search(request) {
        searchCalls.push(request)
        return {
          result: {
            ok: true,
            value: request.query === '重构计划'
              ? {
                items: [
                  {
                    sessionId: 'host-session-last-discussion',
                    snippet: '上次讨论的重构计划已经完成',
                  },
                  {
                    sessionId: 'unmapped-host-session',
                    snippet: '不应显示成没有本地对话映射的结果',
                  },
                ],
                hasMore: false,
              }
              : { items: [], hasMore: false },
          },
        }
      },
    },
    events: {
      mux(_request, signal, markOpen) {
        markOpen()
        return {
          async *[Symbol.asyncIterator]() {
            await new Promise(resolve => {
              if (signal.aborted) {
                resolve()
                return
              }
              signal.addEventListener('abort', resolve, { once: true })
            })
          },
        }
      },
    },
  }
  let hostSearch
  const hostManager = {
    async start() { return { api } },
    isRunning() { return true },
    async stop() {},
  }
  service = createDshChatService({
    hostManager,
    userDataPath: root,
    getWorkspacePath: () => '/ws',
    appState: {
      setSessionSearch(search) { hostSearch = search },
    },
  })
  assert.equal(typeof hostSearch, 'function')
  await store.setSessionSearch(hostSearch)

  const found = await store.searchThreads('重构计划', { workspacePath: '/ws' })
  assert.deepEqual(searchCalls, [{ query: '重构计划' }])
  assert.equal(found.length, 1)
  assert.equal(found[0].conversationId, first.conversationId)
  assert.equal(found[0].searchSnippet, '上次讨论的重构计划已经完成')

  const localTitle = await store.searchThreads('旧讨论', { workspacePath: '/ws' })
  assert.equal(localTitle[0].conversationId, first.conversationId)
  assert.equal(localTitle[0].searchSnippet, undefined)
  console.log('Host session-search bridge, conversation mapping, and snippet test passed')
} finally {
  await service?.stop()
  await fs.rm(root, { recursive: true, force: true })
}
