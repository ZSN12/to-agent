import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppStateStore } from '../backend/app-state-store.mjs'
import { createRoleProfileStore } from '../backend/role-profile-store.mjs'
import { createRoleChatService } from '../backend/role-chat-service.mjs'
import { createDshSessionIndex } from '../backend/dsh-chat/session-index.mjs'
import { createUsageStore } from '../backend/usage-store.mjs'
import { createChatTurnPersistence } from '../backend/chat-turn-persistence.mjs'
import { registerChatSendIpc } from '../backend/ipc/register-chat-send-ipc.mjs'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-role-mode-'))
try {
  const profiles = createRoleProfileStore(home)
  const researcher = await profiles.upsert({
    name: '研究员',
    description: '核实事实并说明依据',
    modelKey: 'provider/research',
    persona: '你是一名严谨的研究员。',
    stylePreset: 'precise',
  })
  const critic = await profiles.upsert({
    name: '批评者',
    modelKey: 'provider/critic',
    persona: '你擅长发现方案中的漏洞。',
  })
  assert.equal((await profiles.list()).length, 2)
  assert.equal(critic.stylePreset, 'custom', 'legacy roles default to custom style')
  await assert.rejects(profiles.upsert({ name: '缺少模型', persona: 'role' }), /角色模型/)
  const updated = await profiles.upsert({ ...researcher, name: '资深研究员' })
  assert.equal(updated.id, researcher.id)
  assert.equal((await profiles.list()).length, 2, 'updating a role does not create a duplicate')

  const appState = createAppStateStore(home, home)
  const usageStore = createUsageStore(home)
  const persistNativeTurn = createChatTurnPersistence({ appState, usageStore })
  const conversationId = (await appState.getState()).conversationId
  const requests = []
  let sequence = 0
  const service = createRoleChatService({
    roleProfileStore: profiles,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      async runAgentTurn(request) {
        requests.push(request)
        sequence += 1
        return { turnId: `role-turn-${sequence}`, startedAt: Date.now(), text: `回复 ${sequence}`, usage: { inputTokens: 3, outputTokens: 2 } }
      },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const events = []
  const webContents = { isDestroyed: () => false, send: (_channel, event) => events.push(event) }
  const runtimeContext = { permissionMode: 'ask', workspacePath: home }
  const steeringIpcHandlers = new Map()
  const routedRoleSteers = []
  const normalSteers = []
  registerChatSendIpc({
    ipcMain: { handle: (channel, handler) => steeringIpcHandlers.set(channel, handler) },
    appBootstrap: { start: async () => {} },
    resolveIpcConversationId: async (conversationId) => conversationId,
    getConversationRuntimeContext: async () => runtimeContext,
    withTurnLock: async (_conversationId, run) => run(),
    chatTurnPipeline: { runQueuedBehavior: async (request) => { normalSteers.push(request); return { accepted: true } } },
    roleChatService: {
      isRunning: (conversationId) => conversationId === 'role-steer-ipc',
      async steer(request) { routedRoleSteers.push(request); return { accepted: true, targets: 1 } },
    },
  })
  const steeringIpcEvent = {
    sender: webContents,
    senderFrame: { url: 'taskweaver://app' },
  }
  const roleSteerIpcResult = await steeringIpcHandlers.get('chat:steer')(steeringIpcEvent, '定向纠偏', 'role-steer-ipc')
  assert.equal(roleSteerIpcResult.ok, true)
  assert.equal(routedRoleSteers.length, 1, 'Bot group steering routes through the role service')
  assert.equal(normalSteers.length, 0, 'Bot group steering never falls through to the primary chat session')
  await steeringIpcHandlers.get('chat:steer')(steeringIpcEvent, 'normal steering', 'primary-steer-ipc')
  assert.equal(normalSteers.length, 1, 'normal chat steering retains its existing queue path')
  await appState.appendMessagesToConversation(conversationId, {
    id: 'work-history-check',
    author: 'orchestrator',
    name: 'TaskWeaver',
    text: '来自 KAI Work 的既有上下文',
    timestamp: Date.now(),
  })

  const solo = await service.send({
    webContents,
    conversationId,
    text: '解释这个主题',
    roleIds: [researcher.id],
    runtimeContext,
  })
  assert.equal(solo.user.roleMode, true, 'role-mode user messages remain distinct from the primary DSH projection')
  assert.equal(solo.assistants.length, 1)
  assert.equal(solo.assistants[0].name, '资深研究员')
  assert.equal(solo.assistants[0].speakerId, researcher.id)
  assert.equal(solo.assistants[0].roleMode, true)
  assert.match(requests[0].rolePersona, /你是一名严谨的研究员。/)
  assert.match(requests[0].rolePersona, /严谨工程/)
  assert.match(requests[0].rolePersona, /角色设定只用于选择分析视角/,
    'role identity should guide the work without leaking into unrelated task replies')
  assert.match(requests[0].rolePersona, /不要自我介绍、提及角色标签、其他 Bot/,
    'role responses should avoid canned identity and other-Bot references')
  assert.match(requests[0].text, /【校验边界】如果使用模 9、估算、抽样或其他一致性检查/,
    'verification boundaries must be placed in the per-task instructions')
  assert.match(requests[0].text, /不能单独证明结论完全正确/,
    'weak checks must not be overstated as proof')
  assert.match(requests[0].text, /来自 KAI Work 的既有上下文/,
    'Bot mode should carry the same conversation history as KAI Work')
  assert.equal(researcher.stylePreset, 'precise')
  assert.doesNotMatch(requests[0].text, /你是一名严谨的研究员/, 'persona guidance travels separately from user text')
  assert.equal(requests[0].modelKey, 'provider/research')
  assert.equal(requests[0].sessionMuxVisible, false, 'role histories are kept out of the primary DSH transcript')
  assert.equal(requests[0].streamToRenderer, true, 'role turns must expose live reasoning, tools, and answer text')
  assert.equal(requests[0].roleToolCallLimit, 12, 'each Bot turn carries a Host-enforced tool-call budget')

  let transcriptAtSecondBotStart = null
  const groupWebContents = {
    ...webContents,
    send: (_channel, event) => {
      events.push(event)
      if (event.roleId === critic.id && event.status === 'started') {
        transcriptAtSecondBotStart = appState.getConversationState(conversationId)
      }
    },
  }
  const group = await service.send({
    webContents: groupWebContents,
    conversationId,
    text: '评估方案',
    roleIds: [researcher.id, critic.id],
    runtimeContext,
  })
  assert.equal(group.assistants.length, 2)
  assert.equal(group.assistants[0].speakerId, researcher.id)
  assert.equal(group.assistants[1].speakerId, critic.id)
  const firstGroupReplyEvent = events.findIndex((event) => event.assistantMessage?.text === '回复 2')
  const secondGroupStartEvent = events.findIndex((event, index) => index > firstGroupReplyEvent
    && event.roleId === critic.id && event.status === 'started')
  assert.ok(firstGroupReplyEvent >= 0, 'each completed Bot reply is streamed as a durable transcript message')
  assert.ok(secondGroupStartEvent > firstGroupReplyEvent, 'the previous Bot reply arrives before the next Bot starts')
  assert.equal(events[firstGroupReplyEvent].assistantMessage.speakerId, researcher.id)
  assert.equal(events[firstGroupReplyEvent].assistantMessage.roleMode, true)
  assert.ok(transcriptAtSecondBotStart, 'the second Bot start observes the first Bot transcript snapshot')
  assert.ok((await transcriptAtSecondBotStart).messages.some((message) => message.id === events[firstGroupReplyEvent].assistantMessage.id),
    'the first Bot reply is committed to durable conversation history before the next Bot starts')
  assert.equal(requests[1].modelKey, 'provider/research')
  assert.equal(requests[2].modelKey, 'provider/critic')
  assert.match(requests[2].rolePersona, /^你擅长发现方案中的漏洞。/)
  assert.match(requests[2].rolePersona, /避免模板化问候、重复总结/)
  assert.match(requests[2].text, /研究员：\n回复 2/, 'later roles receive earlier replies from this group turn')
  assert.match(requests[2].text, /资深研究员：\n回复 1/, 'roles also receive the shared conversation history')
  assert.match(requests[2].text, /不要用“我同意”“正如前面所说”等附和句开头/,
    'relay prompts discourage agreement-first filler')
  assert.notEqual(requests[1].sessionKey, requests[2].sessionKey, 'different roles use independent durable sessions')
  assert.equal(requests[0].sessionKey, requests[1].sessionKey, 'the same role reuses its own durable session')
  const secondConversation = await appState.createThread({ workspacePath: home })
  await service.send({
    webContents,
    conversationId: secondConversation.conversationId,
    text: 'start a separate conversation',
    roleIds: [researcher.id],
    runtimeContext,
  })
  assert.notEqual(requests[0].sessionKey, requests[3].sessionKey, 'role history is isolated per conversation')
  assert.doesNotMatch(requests[3].text, /来自 KAI Work 的既有上下文|资深研究员：\n回复 2/,
    'a new conversation does not inherit prior Bot or KAI Work messages')

  let releaseSteeredResearcher
  const steeredResearcherGate = new Promise((resolve) => { releaseSteeredResearcher = resolve })
  let steeredResearcherStarted
  const steeredResearcherStartedPromise = new Promise((resolve) => { steeredResearcherStarted = resolve })
  const runningRoleSessions = new Set()
  const steeringCalls = []
  const steeredRoleRequests = []
  const steeringEvents = []
  const steeringWebContents = { ...webContents, send: (_channel, event) => steeringEvents.push(event) }
  const steeringConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  const steeringService = createRoleChatService({
    roleProfileStore: profiles,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      isBusy: (sessionKey) => runningRoleSessions.has(sessionKey),
      async send(request) {
        steeringCalls.push(request)
        return { accepted: true, queued: false }
      },
      async runAgentTurn(request) {
        steeredRoleRequests.push(request)
        if (request.modelKey === researcher.modelKey) {
          runningRoleSessions.add(request.sessionKey)
          steeredResearcherStarted()
          await steeredResearcherGate
          runningRoleSessions.delete(request.sessionKey)
          return { turnId: 'steered-researcher', startedAt: Date.now(), text: '研究结论' }
        }
        return { turnId: 'steered-critic', startedAt: Date.now(), text: '修正后的风险分析' }
      },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const steeringPending = steeringService.send({
    webContents: steeringWebContents,
    conversationId: steeringConversationId,
    text: '分析方案',
    roleIds: [researcher.id, critic.id],
    runtimeContext,
  })
  await steeredResearcherStartedPromise
  const steeringResult = await steeringService.steer({
    conversationId: steeringConversationId,
    text: '先核实数据来源，再给结论',
    webContents: steeringWebContents,
  })
  assert.equal(steeringResult.accepted, true)
  assert.equal(steeringResult.targets, 1, 'relay correction is sent to the Bot that is currently running')
  assert.equal(steeringCalls.length, 1)
  assert.equal(steeringCalls[0].sessionKey, steeredRoleRequests[0].sessionKey,
    'correction is routed to the active role session, not the primary chat session')
  assert.equal(steeringCalls[0].behavior, 'steer')
  assert.equal(steeringCalls[0].activeOnly, true,
    'a correction must never start a second session turn if the target Bot just finished')
  const savedSteering = (await appState.getConversationState(steeringConversationId)).messages.at(-1)
  assert.equal(savedSteering.roleMode, true)
  assert.equal(savedSteering.behavior, 'steer')
  releaseSteeredResearcher()
  await steeringPending
  const criticAfterCorrection = steeredRoleRequests.find((request) => request.modelKey === critic.modelKey)
  assert.match(criticAfterCorrection.text, /用户在本轮执行中的纠偏/)
  assert.match(criticAfterCorrection.text, /先核实数据来源，再给结论/,
    'later relay Bots also receive the correction in their prompt')

  let releasePreparingRole
  const preparingRoleGate = new Promise((resolve) => { releasePreparingRole = resolve })
  let preparingRoleLookupStarted
  const preparingRoleLookupStartedPromise = new Promise((resolve) => { preparingRoleLookupStarted = resolve })
  const preparingConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  let preparingRolePrompt = ''
  const preparingService = createRoleChatService({
    roleProfileStore: {
      async get(id) {
        preparingRoleLookupStarted()
        await preparingRoleGate
        return profiles.get(id)
      },
    },
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      isBusy: () => false,
      async runAgentTurn(request) {
        preparingRolePrompt = request.text
        return { turnId: 'prepared-role', startedAt: Date.now(), text: '已纳入纠偏' }
      },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const preparingPending = preparingService.send({
    webContents: steeringWebContents,
    conversationId: preparingConversationId,
    text: '开始分析',
    roleIds: [researcher.id],
    runtimeContext,
  })
  await preparingRoleLookupStartedPromise
  const earlySteer = await preparingService.steer({
    conversationId: preparingConversationId,
    text: '忽略无来源数据',
    webContents: steeringWebContents,
  })
  assert.equal(earlySteer.accepted, true)
  assert.equal(earlySteer.includedInUpcomingRoles, true,
    'corrections submitted while a Bot is being prepared are held for its initial prompt')
  releasePreparingRole()
  await preparingPending
  assert.match(preparingRolePrompt, /忽略无来源数据/)
  assert.equal((preparingRolePrompt.match(/忽略无来源数据/g) ?? []).length, 1,
    'an early correction appears once even when persisted before the shared-history snapshot')

  let releaseSteeringModelLookup
  const steeringModelLookupGate = new Promise((resolve) => { releaseSteeringModelLookup = resolve })
  let steeringModelLookupStarted
  const steeringModelLookupStartedPromise = new Promise((resolve) => { steeringModelLookupStarted = resolve })
  const resolvingModelConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  let resolvingModelPrompt = ''
  const resolvingModelService = createRoleChatService({
    roleProfileStore: profiles,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => {
      steeringModelLookupStarted()
      await steeringModelLookupGate
      return { modelKey: requestedKey }
    },
    chat: {
      isBusy: () => false,
      async runAgentTurn(request) {
        resolvingModelPrompt = typeof request.textProvider === 'function'
          ? request.textProvider()
          : request.text
        return { turnId: 'model-resolution-role', startedAt: Date.now(), text: '已纳入模型准备阶段的纠偏' }
      },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const resolvingModelPending = resolvingModelService.send({
    webContents: steeringWebContents,
    conversationId: resolvingModelConversationId,
    text: '先检查方案',
    roleIds: [researcher.id],
    runtimeContext,
  })
  await steeringModelLookupStartedPromise
  const modelPreparationCorrection = resolvingModelService.steer({
    conversationId: resolvingModelConversationId,
    text: '先确认数据是否来自一手来源',
    webContents: steeringWebContents,
  })
  releaseSteeringModelLookup()
  const [modelPreparationSteerResult] = await Promise.all([modelPreparationCorrection, resolvingModelPending])
  assert.equal(modelPreparationSteerResult.accepted, true,
    'steering during model resolution is accepted before DSH registers its active turn')
  assert.equal(modelPreparationSteerResult.includedInUpcomingRoles, true)
  assert.match(resolvingModelPrompt, /先确认数据是否来自一手来源/,
    'a correction during model resolution is late-bound into the role’s initial prompt')

  assert.deepEqual(events.filter((event) => event.type === 'role_progress').map((event) => event.status), [
    'started', 'completed', 'started', 'completed', 'started', 'completed', 'started', 'completed',
  ])

  const saved = (await appState.getConversationState(conversationId)).messages
  assert.equal(saved.filter((message) => message.roleMode).length, 5,
    'role-mode user messages and role replies remain marked for transcript merging')
  assert.equal((await usageStore.getStats()).totals.totalCalls, 4)
  await assert.rejects(service.send({
    conversationId,
    text: 'invalid strategy',
    roleIds: [researcher.id],
    discussionStrategy: 'unknown',
    runtimeContext,
  }), /讨论策略无效/)
  await assert.rejects(service.send({
    conversationId,
    text: 'summary needs multiple roles',
    roleIds: [researcher.id],
    summarize: true,
    runtimeContext,
  }), /至少需要选择两个角色/)

  let releaseIndependentReplies
  const independentReplyGate = new Promise((resolve) => { releaseIndependentReplies = resolve })
  let bothIndependentStarted
  const bothIndependentStartedPromise = new Promise((resolve) => { bothIndependentStarted = resolve })
  const independentRequests = []
  const independentService = createRoleChatService({
    roleProfileStore: profiles,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      async runAgentTurn(request) {
        independentRequests.push(request)
        if (independentRequests.length === 2) bothIndependentStarted()
        if (request.text.includes('【本轮 Bot 回答】')) {
          return { turnId: 'independent-summary', startedAt: Date.now(), text: '汇总：共同结论与风险' }
        }
        await independentReplyGate
        return { turnId: `independent-${request.modelKey}`, startedAt: Date.now(), text: `独立结论 ${request.modelKey}` }
      },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const independentConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  const independentPending = independentService.send({
    webContents,
    conversationId: independentConversationId,
    text: '分别独立评估这个方案',
    roleIds: [researcher.id, critic.id],
    discussionStrategy: 'independent',
    summarize: true,
    runtimeContext,
  })
  await bothIndependentStartedPromise
  assert.equal(independentRequests.length, 2, 'independent Bots start before either reply completes')
  assert.ok(independentRequests.every((request) => request.streamToRenderer === false),
    'parallel Bot turns do not mix their transient streaming projections')
  assert.ok(independentRequests.every((request) => /本轮采用独立回答/.test(request.text)))
  assert.ok(independentRequests.every((request) => !/【本轮其他角色已发表的意见】/.test(request.text)),
    'independent Bots do not receive their peers’ current-turn replies')
  releaseIndependentReplies()
  const independentResult = await independentPending
  assert.equal(independentRequests.length, 3, 'the optional synthesis runs after both independent answers')
  assert.match(independentRequests[2].text, /【本轮 Bot 回答】/)
  assert.match(independentRequests[2].text, /独立结论 provider\/research/)
  assert.match(independentRequests[2].text, /独立结论 provider\/critic/)
  assert.equal(independentResult.assistants.length, 3)
  assert.equal(independentResult.assistants.at(-1).roleSummary, true,
    'the lead Bot synthesis is explicitly marked in the saved transcript')
  const independentUser = (await appState.getConversationState(independentConversationId)).messages[0]
  assert.equal(independentUser.roleDiscussionStrategy, 'independent')
  assert.equal(independentUser.roleSummaryRequested, true)
  // 检查持久化助手消息元数据，确保前端 Message 组件能识别 roleMode 并触发“转入 KAI Work 实施”
  const independentThreadState = await appState.getConversationState(independentConversationId)
  const independentAssistants = independentThreadState.messages.filter((m) => m.author === 'orchestrator')
  assert.equal(independentAssistants.length, 3)
  for (const msg of independentAssistants) {
    assert.equal(msg.roleMode, true, '所有 Bot 回答必须标记 roleMode 为 true')
    assert.ok(msg.speakerId, 'Bot 回答必须包含 speakerId')
  }
  const leadSummaryMsg = independentAssistants.find((m) => m.roleSummary === true)
  assert.ok(leadSummaryMsg, '汇总轮次必须包含 roleSummary: true 标记')
  // 模拟前端 handleTransferToWork 转换逻辑
  const transferredWorkPrompt = `基于此前 KAI Bot 研讨结论，请实施以下方案：\n\n${leadSummaryMsg.text.trim()}`
  assert.match(transferredWorkPrompt, /基于此前 KAI Bot 研讨结论，请实施以下方案：/)
  assert.match(transferredWorkPrompt, /汇总：共同结论与风险/)

  let bothAbortableStarted
  const bothAbortableStartedPromise = new Promise((resolve) => { bothAbortableStarted = resolve })
  const parallelAbortKeys = []
  let parallelAbortStartCount = 0
  const parallelAbortService = createRoleChatService({
    roleProfileStore: profiles,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      runAgentTurn: ({ signal }) => new Promise((_resolve, reject) => {
        parallelAbortStartCount += 1
        if (parallelAbortStartCount === 2) bothAbortableStarted()
        signal.addEventListener('abort', () => reject(new Error('任务已停止')), { once: true })
      }),
      async abort(sessionKey) { parallelAbortKeys.push(sessionKey); return true },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const parallelAbortConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  const parallelAbortPending = parallelAbortService.send({
    webContents,
    conversationId: parallelAbortConversationId,
    text: '取消并行角色回答',
    roleIds: [researcher.id, critic.id],
    discussionStrategy: 'independent',
    runtimeContext,
  })
  await bothAbortableStartedPromise
  assert.equal(parallelAbortService.abort(parallelAbortConversationId), true)
  await parallelAbortService.waitForAbort(parallelAbortConversationId)
  const parallelAbortResult = await parallelAbortPending
  assert.equal(parallelAbortKeys.length, 2, 'stopping independent mode aborts every active Bot session')
  assert.equal(parallelAbortResult.roleErrors.length, 2)

  const failedEvents = []
  const failureRequests = []
  const failureService = createRoleChatService({
    roleProfileStore: profiles,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      async runAgentTurn(request) {
        failureRequests.push(request)
        if (request.modelKey === 'provider/research') {
          const error = new Error('provider timed out')
          error.modelKey = request.modelKey
          error.partialResult = {
            turnId: 'partial-research-result',
            startedAt: Date.now(),
            text: '已完成的部分分析',
            usage: { inputTokens: 2, outputTokens: 1 },
          }
          throw error
        }
        return { turnId: 'critic-after-failure', startedAt: Date.now(), text: '继续完成的评审' }
      },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const failedGroup = await failureService.send({
    webContents: { ...webContents, send: (_channel, event) => failedEvents.push(event) },
    conversationId,
    text: '处理可能超时的任务',
    roleIds: [researcher.id, critic.id],
    runtimeContext,
  })
  assert.equal(failedGroup.roleErrors.length, 1, 'one provider failure is isolated to its role')
  assert.equal(failedGroup.assistants.length, 2, 'partial output is saved and later roles continue')
  assert.equal(failedGroup.assistants[0].speakerId, researcher.id)
  assert.equal(failedGroup.assistants[0].interrupted, true)
  assert.match(failedGroup.assistants[0].callout, /provider timed out/)
  const partialFailureEvent = failedEvents.find((event) => event.status === 'failed')
  assert.equal(partialFailureEvent.assistantMessage.text, '已完成的部分分析',
    'partial output is streamed into the transcript before the next Bot starts')
  assert.equal(partialFailureEvent.assistantMessage.speakerId, researcher.id)
  assert.equal(failedGroup.assistants[1].speakerId, critic.id)
  assert.doesNotMatch(failureRequests[1]?.text ?? '', /已完成的部分分析/,
    'failed partial text is preserved in the transcript but not presented as a successful peer answer')
  assert.deepEqual(failedEvents.map((event) => event.status), ['started', 'failed', 'started', 'completed'])

  let lookupEntered
  const lookupEnteredPromise = new Promise((resolve) => { lookupEntered = resolve })
  let releaseLookup
  const lookupGate = new Promise((resolve) => { releaseLookup = resolve })
  let lookupCount = 0
  const guardedService = createRoleChatService({
    roleProfileStore: {
      async get(id) {
        lookupCount += 1
        lookupEntered()
        await lookupGate
        return profiles.get(id)
      },
    },
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: { async runAgentTurn() { return { turnId: 'single-writer', startedAt: Date.now(), text: '完成' } } },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const guardedArgs = { conversationId, text: '不能并行写入', roleIds: [researcher.id], runtimeContext }
  const firstGuardedSend = guardedService.send(guardedArgs)
  await lookupEnteredPromise
  const overlappingSend = guardedService.send(guardedArgs)
  releaseLookup()
  const [guardedResult, overlappingResult] = await Promise.allSettled([firstGuardedSend, overlappingSend])
  assert.equal(guardedResult.status, 'fulfilled')
  assert.equal(overlappingResult.status, 'rejected', 'the service rejects a same-conversation send before awaiting storage')
  assert.match(overlappingResult.reason.message, /仍在处理中/)
  assert.equal(lookupCount, 1, 'the rejected send must not read profiles or append a second user message')

  let releaseRoleLookup
  const roleLookupGate = new Promise((resolve) => { releaseRoleLookup = resolve })
  let roleLookupEntered
  const roleLookupEnteredPromise = new Promise((resolve) => { roleLookupEntered = resolve })
  let modelCallsBeforeUserAppend = 0
  const preProfileCancelService = createRoleChatService({
    roleProfileStore: {
      async get(id) {
        roleLookupEntered()
        await roleLookupGate
        return profiles.get(id)
      },
    },
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: { async runAgentTurn() {
      modelCallsBeforeUserAppend += 1
      return { turnId: 'must-not-run', text: '不应执行' }
    } },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const preProfileConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  const messagesBeforeCancel = (await appState.getConversationState(preProfileConversationId)).messages
  const preProfilePending = preProfileCancelService.send({
    conversationId: preProfileConversationId,
    text: '读取角色配置时取消',
    roleIds: [researcher.id],
    runtimeContext,
  })
  await roleLookupEnteredPromise
  assert.equal(preProfileCancelService.abort(preProfileConversationId), true)
  releaseRoleLookup()
  const preProfileCancelled = await preProfilePending
  assert.equal(preProfileCancelled.user, null, 'cancelling before a turn starts must not leave a phantom user message')
  assert.equal(modelCallsBeforeUserAppend, 0)
  assert.deepEqual((await appState.getConversationState(preProfileConversationId)).messages, messagesBeforeCancel)

  let finishModelLookup
  const modelLookupGate = new Promise((resolve) => { finishModelLookup = resolve })
  let callsAfterPreflightCancel = 0
  let preflightService
  let preflightStarted
  const preflightStartedPromise = new Promise((resolve) => { preflightStarted = resolve })
  const preflightConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  const preflightEvents = []
  preflightService = createRoleChatService({
    roleProfileStore: profiles,
    profileStore: {},
    resolveModelKeyForChat: () => modelLookupGate,
    chat: { async runAgentTurn() {
      callsAfterPreflightCancel += 1
      return { turnId: 'should-not-run', text: '不应执行' }
    } },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const preflightWebContents = { isDestroyed: () => false, send: (_channel, event) => {
    preflightEvents.push(event)
    if (event.status === 'started') {
      assert.equal(preflightService.abort(preflightConversationId), true)
      preflightStarted()
    }
  } }
  const preflightPending = preflightService.send({
    webContents: preflightWebContents,
    conversationId: preflightConversationId,
    text: '在模型准备期间取消',
    roleIds: [researcher.id],
    runtimeContext,
  })
  await preflightStartedPromise
  finishModelLookup({ modelKey: researcher.modelKey })
  const preflightCancelled = await preflightPending
  assert.equal(callsAfterPreflightCancel, 0, 'a cancellation during model resolution must not start the model')
  assert.equal(preflightCancelled.roleErrors.length, 1)
  assert.equal(preflightEvents.at(-1).status, 'cancelled')

  assert.equal(await profiles.remove(critic.id), true)
  assert.equal(await profiles.remove(critic.id), false)
  await assert.rejects(service.send({
    conversationId,
    text: 'missing role',
    roleIds: [critic.id],
    runtimeContext,
  }), /角色不存在/)

  const sessions = new Map([
    ['primary', { sessionId: 'primary-session', ownerConversationId: conversationId }],
    ['role', { sessionId: 'role-session', ownerConversationId: conversationId, muxVisible: false }],
  ])
  const sessionIndex = createDshSessionIndex({
    sessions,
    observedSequences: new Map(),
    liveUsage: new Map(),
    queueSnapshots: new Map(),
    muxWatchers: new Map(),
    running: new Map(),
  })
  assert.equal(sessionIndex.conversationIdForSession('primary-session'), conversationId)
  assert.equal(sessionIndex.conversationIdForSession('role-session'), null, 'role transcript events stay private from the primary DSH transcript')

  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  let abortedSessionKey = null
  const abortService = createRoleChatService({
    roleProfileStore: profiles,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      runAgentTurn: ({ signal }) => new Promise((resolve, reject) => {
        started()
        signal.addEventListener('abort', () => reject(new Error('任务已停止')), { once: true })
      }),
      async abort(sessionKey) { abortedSessionKey = sessionKey; return sessionKey.startsWith('tw-role-') },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const pending = abortService.send({
    webContents,
    conversationId,
    text: 'cancel this',
    roleIds: [researcher.id],
    runtimeContext,
  })
  await startedPromise
  assert.equal(abortService.abort(conversationId), true)
  await abortService.waitForAbort(conversationId)
  assert.match(abortedSessionKey, /^tw-role-/,
    'Stop targets the active role session instead of the primary conversation id')
  const cancelled = await pending
  assert.match(cancelled.roleErrors[0].message, /停止/)
  assert.equal(abortService.abort(conversationId), false)
  assert.equal(events.at(-1).status, 'cancelled')

  let retryCalls = 0
  const recoverableAbortService = createRoleChatService({
    roleProfileStore: profiles,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      runAgentTurn: ({ signal }) => {
        retryCalls += 1
        if (retryCalls > 1) return Promise.resolve({ turnId: 'after-cancel', startedAt: Date.now(), text: '已恢复' })
        retryStarted()
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('任务已停止')), { once: true })
        })
      },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  let retryStarted
  const retryStartedPromise = new Promise((resolve) => { retryStarted = resolve })
  const retryEvents = []
  const retryWebContents = { isDestroyed: () => false, send: (_channel, event) => {
    retryEvents.push(event)
  } }
  const retryConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  const cancellablePending = recoverableAbortService.send({
    webContents: retryWebContents,
    conversationId: retryConversationId,
    text: '取消再重试',
    roleIds: [researcher.id],
    runtimeContext,
  })
  await retryStartedPromise
  assert.equal(recoverableAbortService.abort(retryConversationId), true)
  const cancelledRetry = await cancellablePending
  assert.match(cancelledRetry.roleErrors[0].message, /停止/)
  const recovered = await recoverableAbortService.send({
    webContents: retryWebContents,
    conversationId: retryConversationId,
    text: '重试',
    roleIds: [researcher.id],
    runtimeContext,
  })
  assert.equal(recovered.assistants[0].text, '已恢复', 'cancellation releases the role turn lock')

  console.log('角色模式验证通过：资料校验、群聊上下文、失败恢复、单写锁、独立并发汇总持久化与取消重试。')
} finally {
  await fs.rm(home, { recursive: true, force: true })
}
