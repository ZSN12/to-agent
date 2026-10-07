/**
 * DSH 会话生命周期回归测试：工作区闸门 / 映射回收 / fork 继承 / LRU 淘汰。
 *
 * 对应 `docs/多会话隔离审计.md` 的 1、2、3、4 号问题。
 * 运行：node scripts/test-dsh-session-lifecycle.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createDshChatService } from '../electron/backend/dsh-chat-service.mjs'
import { Z_MAX_TRACKED_SESSIONS } from '../electron/backend/config.mjs'

const modelService = {
  async getDshModelConfig(modelKey) {
    return { provider: 'test', id: modelKey.split('/')[1], name: 'Test', contextWindow: 16_000, maxTokens: 2_000, active: true }
  },
  async listProvidersAuth() {
    return [{ id: 'test', configured: true }]
  },
}
const profileStore = { async getThinkingLevel() { return null } }
const webContents = { send() {}, isDestroyed() { return false } }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(predicate, { label = 'condition', timeout = 5000, interval = 5 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    if (predicate()) return
    if (Date.now() > deadline) throw new Error(`等待超时（${timeout}ms）：${label}`)
    await sleep(interval)
  }
}

function mapPathFor(home) {
  return path.join(home, 'taskweaver', 'dsh-session-map.json')
}
async function readMapFile(home) {
  return JSON.parse(await fs.readFile(mapPathFor(home), 'utf8')).sessions
}

/**
 * 最小可用 mock：只需要 create / prompt / models / selectModel / fork / history / mux。
 * `turnEndSeqs` 用来模拟会话日志里的 turn/end seq 序列。
 */
function createMockRuntime({ turnEndSeqs = [], forkImpl = null, existingSessions = {} } = {}) {
  const frames = []
  const created = []
  const forkCalls = []
  const historyCalls = []
  const waiters = []
  let currentPermissionPreset = 'workspace-write'

  function push(frame) {
    const waiter = waiters.shift()
    if (waiter) waiter({ value: frame, done: false })
    else frames.push(frame)
  }

  const api = {
    events: {
      async *mux(_payload, signal, onOpen) {
        onOpen?.()
        while (!signal.aborted) {
          if (frames.length) {
            yield frames.shift()
            continue
          }
          const next = await Promise.race([
            new Promise((resolve) => { waiters.push(resolve) }),
            new Promise((resolve) => signal.addEventListener('abort', () => resolve({ done: true }), { once: true })),
          ])
          if (signal.aborted) return
          if (!next.done) yield next.value
        }
      },
    },
    sessions: {
      async create({ sessionId, cwd, agentPreset }) {
        created.push({ sessionId, cwd, agentPreset })
        const existingPreset = existingSessions[sessionId]
        if (existingPreset && agentPreset && existingPreset !== agentPreset) {
          return { result: { ok: false, error: { code: 'agent-preset-conflict', message: 'session preset cannot be changed' } } }
        }
        const actualPreset = existingPreset || agentPreset || 'standard'
        existingSessions[sessionId] = actualPreset
        return { result: { ok: true, value: { sessionId, agentPreset: actualPreset } } }
      },
      async selectModel(input) {
        const route = { provider: input.provider, model: input.model }
        return { result: { ok: true, value: { selected: route } } }
      },
      async models() {
        return { result: { ok: true, value: { current: null, routable: true, groups: [], failures: [] } } }
      },
      async prompt(payload) {
        const promptText = payload?.content?.find((part) => part.type === 'text')?.text
        const permissionMatch = typeof promptText === 'string'
          ? promptText.match(/^\/permission\s+(\S+)$/)
          : null
        if (permissionMatch) currentPermissionPreset = permissionMatch[1]
        return { result: { ok: true, value: { accepted: true, command: { kind: 'success' } } } }
      },
      async cancel() { return { result: { ok: true, value: { cancelled: true } } } },
      async updateQueue() { return { result: { ok: true, value: { accepted: true } } } },
      async fork(payload) {
        forkCalls.push(payload)
        if (forkImpl) return forkImpl(payload)
        return { result: { ok: true, value: { sessionId: `session-${payload.sessionId}-forked` } } }
      },
      async history(payload) {
        historyCalls.push(payload)
        const events = turnEndSeqs.map((seq) => ({ event: { type: 'turn/end', seq } }))
        return {
          result: {
            ok: true,
            value: {
              events,
              hasMore: false,
              projections: {
                asOfSeq: events.at(-1)?.event.seq ?? 0,
                values: {
                  permissions: {
                    options: [
                      {
                        value: 'workspace-write',
                        name: 'workspace-write',
                        description: 'Write inside the workspace and permitted temporary directories; wider retries require approval.',
                      },
                      {
                        value: 'danger-full-access',
                        name: 'danger-full-access',
                        description: 'Full file access without approval prompts.',
                      },
                    ],
                    currentValue: currentPermissionPreset,
                  },
                },
              },
            },
          },
        }
      },
    },
    llm: {
      async providers() {
        return { result: { ok: true, value: { providers: [{ provider: 'test', active: true }] } } }
      },
    },
    async respond() { return { accepted: true } },
  }

  const hostManager = {
    async start() { return { api, baseUrl: 'http://127.0.0.1:0' } },
    async stop() {},
  }

  return { hostManager, push, created, forkCalls, historyCalls }
}

function makeService(home, runtime, workspace) {
  return createDshChatService({
    hostManager: runtime.hostManager,
    userDataPath: home,
    getWorkspacePath: () => workspace,
    profileStore,
    modelService,
  })
}

function pushAssistantText(runtime, sessionId, text = 'ok') {
  runtime.push({ payload: { type: 'session/event', sessionId, event: {
    type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text } },
  } } })
}

/** 跑一轮完整对话（send + turn/end）。 */
async function runTurn(service, runtime, { conversationId, modelKey = 'test/m1' }) {
  const turn = service.send({ text: 'hi', modelKey, conversationId, webContents })
  await waitFor(() => service.isBusy(conversationId), { label: `${conversationId} 已进入运行态` })
  const sessionId = `tw-${conversationId}`
  pushAssistantText(runtime, sessionId)
  runtime.push({ payload: { type: 'session/event', sessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  await turn
}

const cleanup = []
try {
  // ============ 1. 未绑定工作区必须被拒绝 ============
  {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-lifecycle-unbound-'))
    cleanup.push(home)
    const runtime = createMockRuntime()
    const service = makeService(home, runtime, '/')
    await assert.rejects(
      service.send({ text: 'hi', modelKey: 'test/m1', conversationId: 'conv-unbound', webContents }),
      /还没有绑定工作区/,
      'cwd 落在文件系统根时必须拒绝发送',
    )
    assert.equal(runtime.created.length, 0, '被拒绝的请求不应创建 DSH 会话')
    // 根目录之外仍然正常工作
    await service.stop()
    const okHome = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-lifecycle-bound-'))
    cleanup.push(okHome)
    const okRuntime = createMockRuntime()
    const okService = makeService(okHome, okRuntime, okHome)
    await runTurn(okService, okRuntime, { conversationId: 'conv-ok' })
    assert.equal(okRuntime.created[0].cwd, okHome)
    await okService.stop()
    console.log('✓ 未绑定工作区被拒绝，且不创建 DSH 会话；正常路径不受影响')
  }

  // ============ 2. forgetConversation 回收映射（含编排子会话），保留磁盘日志 ============
  {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-lifecycle-forget-'))
    cleanup.push(home)
    const runtime = createMockRuntime()
    const service = makeService(home, runtime, home)
    await runTurn(service, runtime, { conversationId: 'conv-del' })
    // 手动塞一条编排子会话映射（owner 指向 conv-del，key 不同）
    const seeded = await readMapFile(home)
    seeded['tw-orchestration-conv-del-run1-planner'] = {
      sessionId: 'tw-orchestration-conv-del-run1-planner',
      cwd: home,
      ownerConversationId: 'conv-del',
      lastUsedAt: 1,
    }
    seeded['conv-keep'] = { sessionId: 'tw-conv-keep', cwd: home, ownerConversationId: 'conv-keep', lastUsedAt: 2 }
    await fs.writeFile(mapPathFor(home), `${JSON.stringify({ version: 1, sessions: seeded }, null, 2)}\n`)

    const fresh = makeService(home, runtime, home)
    const { removed } = await fresh.forgetConversation('conv-del')
    assert.deepEqual(
      removed.sort(),
      ['conv-del', 'tw-orchestration-conv-del-run1-planner'],
      'forgetConversation 必须同时回收编排子会话条目',
    )
    assert.equal(fresh.getSessionId('conv-del'), null)
    const after = await readMapFile(home)
    assert.equal(after['conv-del'], undefined)
    assert.equal(after['tw-orchestration-conv-del-run1-planner'], undefined)
    assert.ok(after['conv-keep'], '其它对话的映射不能被误删')
    // 重复调用是幂等的
    assert.deepEqual((await fresh.forgetConversation('conv-del')).removed, [])
    await fresh.stop()
    console.log('✓ forgetConversation 回收映射条目（含编排子会话）且不误删其它对话')
  }

  // ============ 3. forkConversation 继承上下文 ============
  {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-lifecycle-fork-'))
    cleanup.push(home)
    const runtime = createMockRuntime({ turnEndSeqs: [3, 9, 15, 21] })
    const service = makeService(home, runtime, home)
    await runTurn(service, runtime, { conversationId: 'conv-src' })

    // 保留前 2 轮 → atSeq 取第 2 个 turn/end 的 seq
    const forked = await service.forkConversation({
      sourceConversationId: 'conv-src',
      targetConversationId: 'conv-child',
      completedTurns: 2,
    })
    assert.equal(forked.ok, true)
    assert.equal(forked.atSeq, 9, 'completedTurns=2 应切在第 2 个 turn/end（seq 9）')
    assert.deepEqual(runtime.forkCalls[0], { sessionId: 'tw-conv-src', atSeq: 9 })
    assert.equal(service.getSessionId('conv-child'), 'session-tw-conv-src-forked')
    const childEntry = (await readMapFile(home))['conv-child']
    assert.equal(childEntry.cwd, home, '分支必须继承源会话的工作区')
    assert.equal(childEntry.forkedFromSessionId, 'tw-conv-src')
    assert.equal(childEntry.forkedAtSeq, 9)

    // UI 分支点没有对应的 Host 已完成轮次时必须失败，不能静默继承分支点之后的上下文
    const over = await service.forkConversation({
      sourceConversationId: 'conv-src',
      targetConversationId: 'conv-child-over',
      completedTurns: 99,
    })
    assert.deepEqual(over, { ok: false, reason: 'fork-point-unavailable' })
    assert.equal(service.getSessionId('conv-child-over'), null)
    assert.equal(runtime.forkCalls.length, 1, '无效分支点不得调用 Host fork')

    // 源会话不在映射表里 → 明确失败，而不是造一个空会话
    const missing = await service.forkConversation({
      sourceConversationId: 'conv-unknown',
      targetConversationId: 'conv-child-missing',
    })
    assert.deepEqual(missing, { ok: false, reason: 'no-source-session' })
    assert.equal(service.getSessionId('conv-child-missing'), null)

    await service.stop()

    // Z Host 拒绝 fork（例如没有已完成的 turn）时不得写入半成品映射
    const failHome = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-lifecycle-fork-fail-'))
    cleanup.push(failHome)
    const failRuntime = createMockRuntime({
      forkImpl: async () => ({ result: { ok: false, error: { code: 'fork-unavailable', message: 'no completed turn to fork from' } } }),
    })
    const failService = makeService(failHome, failRuntime, failHome)
    await runTurn(failService, failRuntime, { conversationId: 'conv-src-fail' })
    const failed = await failService.forkConversation({
      sourceConversationId: 'conv-src-fail',
      targetConversationId: 'conv-child-fail',
    })
    assert.equal(failed.ok, false)
    assert.equal(failed.reason, 'fork-failed')
    assert.equal(failService.getSessionId('conv-child-fail'), null)
    assert.equal((await readMapFile(failHome))['conv-child-fail'], undefined)
    await failService.stop()

    // Host fork 成功但映射文件提交失败时也必须撤回内存映射，不能报告成功。
    const persistHome = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-lifecycle-fork-persist-'))
    cleanup.push(persistHome)
    const persistRuntime = createMockRuntime()
    const persistService = makeService(persistHome, persistRuntime, persistHome)
    await runTurn(persistService, persistRuntime, { conversationId: 'conv-src-persist' })
    const mapPath = mapPathFor(persistHome)
    const backupPath = `${mapPath}.backup`
    await fs.rename(mapPath, backupPath)
    await fs.mkdir(mapPath)
    const persistenceFailed = await persistService.forkConversation({
      sourceConversationId: 'conv-src-persist',
      targetConversationId: 'conv-child-persist',
    })
    assert.equal(persistenceFailed.ok, false)
    assert.equal(persistenceFailed.reason, 'mapping-persist-failed')
    assert.equal(persistService.getSessionId('conv-child-persist'), null)
    assert.equal(persistRuntime.forkCalls.length, 1, 'Host fork occurred, but failed mapping persistence must not be exposed as success')
    await fs.rm(mapPath, { recursive: true, force: true })
    await fs.rename(backupPath, mapPath)
    assert.equal((await readMapFile(persistHome))['conv-child-persist'], undefined)
    await persistService.stop()

    console.log('✓ forkConversation 精确切分、拒绝无效分支点、映射落盘失败回滚')
  }

  // ============ 4. 映射表 LRU：只淘汰可推导条目 ============
  {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-lifecycle-lru-'))
    cleanup.push(home)
    const seeded = {}
    // 305 条可推导主会话条目，lastUsedAt 递增
    for (let i = 0; i < 305; i += 1) {
      const key = `bulk-${String(i).padStart(3, '0')}`
      seeded[key] = { sessionId: `tw-${key}`, cwd: home, ownerConversationId: key, lastUsedAt: i }
    }
    // 1 条 fork 出来的子会话：id 由 DSH 随机生成，不可推导 —— 即使最旧也必须保留
    seeded['forked-conv'] = { sessionId: 'session-random-uuid', cwd: home, ownerConversationId: 'forked-conv', lastUsedAt: -1 }
    await fs.mkdir(path.dirname(mapPathFor(home)), { recursive: true })
    await fs.writeFile(mapPathFor(home), `${JSON.stringify({ version: 1, sessions: seeded }, null, 2)}\n`)

    const runtime = createMockRuntime()
    const service = makeService(home, runtime, home)
    await runTurn(service, runtime, { conversationId: 'brand-new' })

    // 306 条已有 + 1 条新建 = 307，超出 7 条 → 淘汰最旧的 7 条可推导条目（bulk-000…bulk-006）
    const after = await readMapFile(home)
    const keys = Object.keys(after)
    assert.equal(keys.length, Z_MAX_TRACKED_SESSIONS, `淘汰后条目数应回落到 ${Z_MAX_TRACKED_SESSIONS}`)
    assert.ok(after['forked-conv'], '不可推导（fork 出来的）条目必须保留')
    assert.ok(after['brand-new'], '刚创建的条目不能被自己淘汰')
    assert.equal(after['bulk-000'], undefined, '最久未使用的可推导条目应被淘汰')
    assert.equal(after['bulk-006'], undefined)
    assert.ok(after['bulk-007'], '较新的条目应保留')
    assert.ok(after['bulk-304'], '最新的条目必须保留')
    await service.stop()
    console.log(`✓ 映射表超过 ${Z_MAX_TRACKED_SESSIONS} 条时按 LRU 淘汰可推导条目，保留 fork 条目`)
  }

  // ============ 5. 映射丢失后附着旧 Host 会话，不能套用新会话预设 ============
  {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-lifecycle-preset-rebind-'))
    cleanup.push(home)
    const sessionId = 'tw-old-conversation'
    const runtime = createMockRuntime({ existingSessions: { [sessionId]: 'standard' } })
    const service = makeService(home, runtime, home)
    const turn = service.send({
      text: '继续旧会话',
      modelKey: 'test/m1',
      conversationId: 'old-conversation',
      agentPreset: 'code',
      webContents,
    })
    await waitFor(() => service.isBusy('old-conversation'), { label: '旧会话重新绑定后进入运行态' })
    pushAssistantText(runtime, sessionId)
    runtime.push({ payload: { type: 'session/event', sessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await turn
    const entry = (await readMapFile(home))['old-conversation']
    assert.equal(entry.agentPreset, 'standard', 'Host 的旧预设是权威值，新会话预设不能覆盖它')
    assert.deepEqual(runtime.created.map((item) => item.agentPreset), ['code', undefined], '检测到 Host 预设冲突后应省略预设并重试附着')
    await service.stop()
    console.log('✓ 映射丢失时通过 Host 的 preset conflict 安全附着旧会话，并保留 Host 预设')
  }

  console.log('\nDSH 会话生命周期测试全部通过！')
} finally {
  for (const dir of cleanup) await fs.rm(dir, { recursive: true, force: true })
}
