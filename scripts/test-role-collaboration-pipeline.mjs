import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppStateStore } from '../backend/app-state-store.mjs'
import { createRoleProfileStore, inferRoleDuty } from '../backend/role-profile-store.mjs'
import { createRoleChatService } from '../backend/role-chat-service.mjs'
import { createUsageStore } from '../backend/usage-store.mjs'
import { createChatTurnPersistence } from '../backend/chat-turn-persistence.mjs'
import { classifyTaskIntent, parseReviewResult, resolveCollaborationPlan } from '../backend/role-collaboration-router.mjs'

console.log('--- 1. 验证 Bot 职责智能推断 ---')
assert.equal(inferRoleDuty({ name: '代码审查员', description: '负责找出安全与逻辑漏洞', persona: '你是一名严谨的 reviewer' }), 'reviewer')
assert.equal(inferRoleDuty({ name: '架构师', description: '规划系统架构与实施步骤', persona: '擅长总体设计' }), 'planner')
assert.equal(inferRoleDuty({ name: '后端开发', description: '负责根据方案编码实现功能', persona: '全栈工程师' }), 'implementer')
assert.equal(inferRoleDuty({ name: '事实核查员', description: '检索事实与调研证据', persona: '研究员' }), 'researcher')
assert.equal(inferRoleDuty({ name: '生活助手', description: '陪聊与解答日常问题', persona: '友善的聊天机器人' }), 'generalist')
console.log('✓ 职责智能推断验证通过！')

console.log('--- 2. 验证任务意图分类 ---')
assert.equal(classifyTaskIntent('修复这个会话追加消息后界面空白的问题'), 'execute')
assert.equal(classifyTaskIntent('实现一个支持自动导出的功能'), 'execute')
assert.equal(classifyTaskIntent('分析为什么出现这个问题，不要改代码'), 'investigate')
assert.equal(classifyTaskIntent('诊断一下内存占用过高的原因，只做分析'), 'investigate')
assert.equal(classifyTaskIntent('请介绍一下 Cordis 运行时的设计哲学'), 'answer')
assert.equal(classifyTaskIntent('这段代码怎么重构比较好'), 'investigate', 'consultative refactor questions must not start a write pipeline')
assert.equal(classifyTaskIntent('实现这个思路有哪些优缺点'), 'investigate', 'pros and cons questions must not execute the proposed change')
assert.equal(classifyTaskIntent('请分析一下怎么实现这个功能'), 'investigate')
assert.equal(classifyTaskIntent('优化'), 'answer', 'a lone broad verb is not enough to start implementation')
assert.equal(classifyTaskIntent('实现'), 'answer', 'a lone implementation verb is too ambiguous to start a pipeline')
assert.equal(classifyTaskIntent('删掉'), 'execute', 'a short removal imperative can use the conversation context as its target')
assert.equal(classifyTaskIntent('重新编译安装一下'), 'execute', 'a compound build/install imperative should enter execution')
assert.equal(classifyTaskIntent('优化一下这个页面'), 'execute')
assert.equal(classifyTaskIntent('把这个页面优化一下'), 'execute')
assert.equal(classifyTaskIntent('能不能帮我修复这个 bug'), 'execute')
assert.equal(classifyTaskIntent('不要优化这个页面，只给建议'), 'investigate')
assert.deepEqual(parseReviewResult('通过\n[REVIEW_RESULT: APPROVED]'), { status: 'approved', feedback: '通过' })
assert.equal(parseReviewResult('发现空指针风险\n[REVIEW_RESULT: REJECTED]').status, 'rejected')
assert.equal(parseReviewResult('看起来应该没问题').status, 'unknown', 'free-form praise is not a structured approval')
assert.equal(parseReviewResult('[REVIEW_RESULT: APPROVED]\n[REVIEW_RESULT: REJECTED]').status, 'unknown', 'conflicting duplicate markers fail closed')
console.log('✓ 任务意图分类验证通过！')

console.log('--- 3. 验证端到端多 Bot 自动协作流水线 ---')
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-pipeline-test-'))
try {
  const roleStore = createRoleProfileStore(home)
  const planner = await roleStore.upsert({
    name: '架构规划师',
    description: '负责分析并输出实施方案和验收标准',
    modelKey: 'provider/planner',
    persona: '你负责顶层架构规划与步骤拆解。',
    duty: 'planner',
  })
  const implementer = await roleStore.upsert({
    name: '核心工程师',
    description: '负责落地编码实施与验证',
    modelKey: 'provider/implementer',
    persona: '你负责具体的代码实现与测试执行。',
    duty: 'implementer',
  })
  const reviewer = await roleStore.upsert({
    name: '质量审查员',
    description: '负责独立审查改动与回归风险',
    modelKey: 'provider/reviewer',
    persona: '你负责严格的代码审查与把关。',
    duty: 'reviewer',
  })
  const kai = await roleStore.upsert({
    name: 'Kai',
    description: '负责独立审查实施结果',
    modelKey: 'provider/kai',
    persona: '你负责独立审查代码与测试。',
    duty: 'reviewer',
  })

  // 验证持久化中的职责存储与自动补全
  const storedProfiles = await roleStore.list()
  assert.equal(storedProfiles.find((p) => p.id === planner.id).duty, 'planner')
  assert.equal(storedProfiles.find((p) => p.id === implementer.id).duty, 'implementer')
  assert.equal(storedProfiles.find((p) => p.id === reviewer.id).duty, 'reviewer')

  // 测试流水线编排函数
  const plan = resolveCollaborationPlan({
    profiles: [planner, implementer, reviewer],
    text: '修复这个会话追加消息后界面空白的问题',
    discussionStrategy: 'relay',
  })
  assert.equal(plan.isPipeline, true)
  assert.equal(plan.intent, 'execute')
  assert.equal(plan.stages.length, 3)
  assert.equal(plan.stages[0].stage, 'planning')
  assert.equal(plan.stages[0].profile.id, planner.id)
  assert.equal(plan.stages[1].stage, 'implementation')
  assert.equal(plan.stages[1].profile.id, implementer.id)
  assert.equal(plan.stages[2].stage, 'review')
  assert.equal(plan.stages[2].profile.id, reviewer.id)

  const explicitlyAssignedPlan = resolveCollaborationPlan({
    profiles: [implementer, reviewer, kai],
    text: '@小王你修改一下，然后让Kai审查一下',
    discussionStrategy: 'relay',
  })
  assert.equal(explicitlyAssignedPlan.stages[0].profile.id, implementer.id)
  assert.equal(explicitlyAssignedPlan.stages.at(-1).stage, 'review')
  assert.equal(explicitlyAssignedPlan.stages.at(-1).profile.id, kai.id,
    'an explicitly named reviewer takes precedence over the default reviewer')

  const standaloneReviewPlan = resolveCollaborationPlan({
    profiles: [reviewer, kai],
    text: '让Kai审查一下这段内容',
    discussionStrategy: 'relay',
  })
  assert.equal(standaloneReviewPlan.isPipeline, true)
  assert.deepEqual(standaloneReviewPlan.stages.map(({ profile }) => profile.id), [kai.id],
    'standalone review requests also honor the named reviewer')

  const unavailableStandaloneReviewPlan = resolveCollaborationPlan({
    profiles: [reviewer],
    text: '让kai审查一下',
    discussionStrategy: 'relay',
  })
  assert.equal(unavailableStandaloneReviewPlan.isPipeline, true)
  assert.deepEqual(unavailableStandaloneReviewPlan.stages, [])
  assert.deepEqual(unavailableStandaloneReviewPlan.missingAssignees, [{ stage: 'review', name: 'kai' }])

  const unavailableReviewerPlan = resolveCollaborationPlan({
    profiles: [implementer],
    text: '修复这个问题，然后让kai审查一下',
    discussionStrategy: 'relay',
  })
  assert.equal(unavailableReviewerPlan.isPipeline, true)
  assert.deepEqual(unavailableReviewerPlan.stages.map(({ stage }) => stage), ['implementation'])
  assert.deepEqual(unavailableReviewerPlan.missingAssignees, [{ stage: 'review', name: 'kai' }],
    'an unavailable named reviewer must not be silently replaced by the default reviewer')

  // 运行端到端模拟调度
  const appState = createAppStateStore(home, home)
  const usageStore = createUsageStore(home)
  const persistNativeTurn = createChatTurnPersistence({ appState, usageStore })
  const conversationId = (await appState.createThread({ workspacePath: home })).conversationId

  const stageExecutions = []
  const progressEvents = []
  const permissionExecutions = []
  const webContents = {
    isDestroyed: () => false,
    send: (_channel, event) => progressEvents.push(event),
  }
  const runtimeContext = { permissionMode: 'full', workspacePath: home }

  const service = createRoleChatService({
    roleProfileStore: roleStore,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      async runAgentTurn(request) {
        stageExecutions.push(request)
        if (request.modelKey === planner.modelKey) {
          return {
            turnId: 'stage-1-plan',
            startedAt: Date.now(),
            text: '【规划交付】1. 排查 MessageList 渲染分支；2. 增加空保护；验收条件：单测通过。',
          }
        }
        if (request.modelKey === implementer.modelKey) {
          return {
            turnId: 'stage-2-impl',
            startedAt: Date.now(),
            text: '【实施交付】已修改 MessageList.tsx 第 42 行增加空保护，运行 `pnpm test` 通过。',
            fileChanges: [{ path: 'src/MessageList.tsx', addedLines: 1, deletedLines: 0 }],
            turnActivity: {
              details: [{
                id: 'host-test-call',
                toolName: 'bash',
                inputSummary: 'pnpm run test:role-mode',
                commandSummary: 'pnpm run test:role-mode',
                commandOutcome: { exitCode: 0, background: false, timedOut: false, sandboxDenied: false },
                commandOutputTail: 'role-mode tests passed',
                resultSummary: '执行完成',
              }],
            },
          }
        }
        return {
          turnId: 'stage-3-review',
          startedAt: Date.now(),
          text: '【审查交付】审查通过。代码边界处理得当，无回归风险。\n[REVIEW_RESULT: APPROVED]',
        }
      },
    },
    appState,
    permissions: { withExecution: async (mode, _sender, run) => { permissionExecutions.push(mode); return run() } },
    persistNativeTurn,
    createGitCheckpoint: async (_workspacePath, options) => ({
      ok: true,
      isRepo: true,
      checkpoint: { id: 'role-pipeline-checkpoint', summary: options.summary },
    }),
    getGitCheckpointDiff: async (_workspacePath, checkpointId) => ({
      checkpoint: { id: checkpointId },
      diff: 'diff --git a/src/MessageList.tsx b/src/MessageList.tsx\n--- a/src/MessageList.tsx\n+++ b/src/MessageList.tsx\n@@ -40,1 +40,2 @@\n+if (!messages) return null\ndiff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n+API_KEY=should-not-reach-reviewer',
      stat: 'src/MessageList.tsx | 1 +\n 1 file changed, 1 insertion(+)',
      includesUntrackedFiles: true,
    }),
  })

  // 用户仅交代目标，系统自动完成分工流水线
  const result = await service.send({
    webContents,
    conversationId,
    text: '修复这个会话追加消息后界面空白的问题',
    roleIds: [planner.id, implementer.id, reviewer.id],
    runtimeContext,
  })

  assert.equal(result.assistants.length, 3)
  assert.equal(stageExecutions.length, 3)

  // Planning and review use Host-enforced read-only permissions; implementation inherits the user's setting.
  assert.match(stageExecutions[0].text, /【自动协作 · 阶段一：方案规划与验收标准】/)
  assert.match(stageExecutions[0].text, /Host 已将此阶段放入只读 Agent 工具预设/)
  assert.equal(stageExecutions[0].permissionMode, 'readonly', 'planning uses the Host read-only policy without ask dialogs')
  assert.equal(stageExecutions[0].agentPreset, 'tw-taskweaver-readonly', 'planning exposes only the read-only tool composition')

  // 验证 Stage 2 (实施) 成功接收到 Stage 1 的规划产物
  assert.match(stageExecutions[1].text, /【自动协作 · 阶段二：代码实施与测试验证】/)
  assert.match(stageExecutions[1].text, /【规划 Bot 的验收标准】/)
  assert.match(stageExecutions[1].text, /排查 MessageList 渲染分支/)
  assert.equal(stageExecutions[1].permissionMode, 'full', 'implementation inherits the selected permission mode')
  assert.equal(stageExecutions[1].agentPreset, 'tw-default')

  // Reviewer receives measured evidence, never the implementation Bot's complete self-report.
  assert.match(stageExecutions[2].text, /【自动协作 · 阶段三：独立审查与质量把关】/)
  assert.match(stageExecutions[2].text, /Host 采集的实施证据/)
  assert.match(stageExecutions[2].text, /diff --git a\/src\/MessageList\.tsx/)
  assert.doesNotMatch(stageExecutions[2].text, /should-not-reach-reviewer/)
  assert.match(stageExecutions[2].text, /pnpm run test:role-mode/)
  assert.match(stageExecutions[2].text, /退出码：0/)
  assert.match(stageExecutions[2].text, /role-mode tests passed/)
  assert.doesNotMatch(stageExecutions[2].text, /已修改 MessageList\.tsx 第 42 行/)
  assert.equal(stageExecutions[2].permissionMode, 'readonly', 'review uses the Host read-only policy without ask dialogs')
  assert.equal(stageExecutions[2].agentPreset, 'tw-taskweaver-readonly', 'review exposes the read-only tool composition')
  assert.deepEqual(permissionExecutions, ['readonly', 'full', 'readonly'])
  assert.equal(result.rolePipeline.reviewStatus, 'approved')
  assert.equal(result.rolePipeline.repairAttempts, 0)
  assert.equal(result.rolePipeline.rollbackCheckpoint.id, 'role-pipeline-checkpoint')
  assert.equal(result.rolePipeline.evidence.diffSource, 'git-checkpoint-diff')
  assert.equal(result.rolePipeline.evidence.testRuns[0].exitCode, 0)

  // 验证持久化消息结构
  const threadState = await appState.getConversationState(conversationId)
  const assistantMessages = threadState.messages.filter((m) => m.author === 'orchestrator')
  assert.equal(assistantMessages.length, 3)
  assert.equal(assistantMessages[0].speakerId, planner.id)
  assert.equal(assistantMessages[1].speakerId, implementer.id)
  assert.equal(assistantMessages[2].speakerId, reviewer.id)

  // A structured rejection triggers one repair, fresh evidence collection, and a final independent review.
  const repairConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  const repairRequests = []
  let implementationCount = 0
  let reviewCount = 0
  let diffReadCount = 0
  let checkpointCreateCount = 0
  const repairService = createRoleChatService({
    roleProfileStore: roleStore,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      async runAgentTurn(request) {
        repairRequests.push(request)
        if (request.modelKey === planner.modelKey) {
          return { turnId: 'repair-plan', startedAt: Date.now(), text: '验收条件：缺失输入必须有空值保护。' }
        }
        if (request.modelKey === implementer.modelKey) {
          implementationCount += 1
          return {
            turnId: `repair-implementation-${implementationCount}`,
            startedAt: Date.now(),
            text: implementationCount === 1 ? '初次实施自述：测试已通过。' : '已按驳回意见补上空值保护。',
            fileChanges: [{ path: 'src/message-list.ts', addedLines: implementationCount, deletedLines: 0 }],
            turnActivity: { details: [{
              id: `repair-test-${implementationCount}`,
              toolName: 'bash',
              commandSummary: 'pnpm run test:role-mode',
              commandOutcome: { exitCode: implementationCount === 1 ? 1 : 0, background: false, timedOut: false, sandboxDenied: false },
              commandOutputTail: implementationCount === 1 ? 'assertion failed at MessageList.test.ts' : 'role-mode tests passed',
              inputSummary: 'pnpm run test:role-mode',
              resultSummary: '执行完成',
            }] },
          }
        }
        reviewCount += 1
        return reviewCount === 1
          ? { turnId: 'repair-review-rejected', startedAt: Date.now(), text: 'src/message-list.ts: 缺少 null 输入保护，请补上并重跑测试。\n[REVIEW_RESULT: REJECTED]' }
          : { turnId: 'repair-review-approved', startedAt: Date.now(), text: '复审通过，修改已覆盖空值边界。\n[REVIEW_RESULT: APPROVED]' }
      },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
    createGitCheckpoint: async () => {
      checkpointCreateCount += 1
      return { ok: true, isRepo: true, checkpoint: { id: 'repair-checkpoint' } }
    },
    getGitCheckpointDiff: async () => {
      diffReadCount += 1
      return {
        diff: `diff --git a/src/message-list.ts b/src/message-list.ts\n+++ b/src/message-list.ts\n+patch revision ${diffReadCount}`,
        stat: 'src/message-list.ts | 1 +',
        includesUntrackedFiles: true,
      }
    },
  })
  const repairResult = await repairService.send({
    webContents,
    conversationId: repairConversationId,
    text: '修复消息列表的空值问题',
    roleIds: [planner.id, implementer.id, reviewer.id],
    runtimeContext,
  })
  assert.deepEqual(repairRequests.map((request) => request.modelKey), [
    planner.modelKey, implementer.modelKey, reviewer.modelKey, implementer.modelKey, reviewer.modelKey,
  ])
  assert.match(repairRequests[3].text, /缺少 null 输入保护/)
  assert.match(repairRequests[3].text, /退出码：1/)
  assert.match(repairRequests[4].text, /patch revision 2/)
  assert.match(repairRequests[4].text, /退出码：0/)
  assert.doesNotMatch(repairRequests[2].text, /初次实施自述：测试已通过/)
  assert.equal(checkpointCreateCount, 1, 'the bounded repair loop reuses the original workspace checkpoint')
  assert.equal(diffReadCount, 2, 'evidence is re-collected after the repair before final review')
  assert.equal(repairResult.rolePipeline.repairAttempts, 1)
  assert.equal(repairResult.rolePipeline.reviewStatus, 'approved')
  assert.equal(repairResult.rolePipeline.stages.length, 5)
  assert.deepEqual(repairResult.roleErrors, [])

  // If the final review still rejects, the loop stops after exactly one repair and exposes the remaining risk.
  const unresolvedConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  const unresolvedCalls = []
  let unresolvedImplementationCount = 0
  let unresolvedReviewCount = 0
  const unresolvedService = createRoleChatService({
    roleProfileStore: roleStore,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      async runAgentTurn(request) {
        unresolvedCalls.push(request)
        if (request.modelKey === planner.modelKey) return { turnId: 'unresolved-plan', startedAt: Date.now(), text: '验收条件：问题已处理。' }
        if (request.modelKey === implementer.modelKey) {
          unresolvedImplementationCount += 1
          return { turnId: `unresolved-impl-${unresolvedImplementationCount}`, startedAt: Date.now(), text: '实施完成。' }
        }
        unresolvedReviewCount += 1
        return { turnId: `unresolved-review-${unresolvedReviewCount}`, startedAt: Date.now(), text: '仍有竞态风险。\n[REVIEW_RESULT: REJECTED]' }
      },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
    createGitCheckpoint: async () => ({ ok: true, isRepo: true, checkpoint: { id: 'unresolved-checkpoint' } }),
    getGitCheckpointDiff: async () => ({ diff: 'diff --git a/race.ts b/race.ts\n+still risky', stat: 'race.ts | 1 +', includesUntrackedFiles: true }),
  })
  const unresolvedResult = await unresolvedService.send({
    webContents,
    conversationId: unresolvedConversationId,
    text: '修复竞态问题',
    roleIds: [planner.id, implementer.id, reviewer.id],
    runtimeContext,
  })
  assert.equal(unresolvedImplementationCount, 2, 'only the first implementation and one repair are allowed')
  assert.equal(unresolvedReviewCount, 2, 'the final rejection terminates instead of looping')
  assert.equal(unresolvedCalls.length, 5)
  assert.equal(unresolvedResult.rolePipeline.repairAttempts, 1)
  assert.equal(unresolvedResult.rolePipeline.reviewStatus, 'rejected')
  assert.match(unresolvedResult.roleErrors.at(-1).message, /唯一整改轮后 Reviewer 仍判定需整改/)
  assert.match(unresolvedResult.roleErrors.at(-1).message, /unresolved-checkpoint/)

  // A failed Git checkpoint must stop before the implementer can mutate the workspace.
  const checkpointFailureConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  const checkpointFailureRequests = []
  const checkpointFailureService = createRoleChatService({
    roleProfileStore: roleStore,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: { async runAgentTurn(request) {
      checkpointFailureRequests.push(request)
      return { turnId: 'checkpoint-failure-plan', startedAt: Date.now(), text: '计划完成。' }
    } },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
    createGitCheckpoint: async () => ({ ok: false, isRepo: true, error: 'checkpoint lock timeout' }),
  })
  const checkpointFailureResult = await checkpointFailureService.send({
    webContents,
    conversationId: checkpointFailureConversationId,
    text: '修复一个问题',
    roleIds: [planner.id, implementer.id, reviewer.id],
    runtimeContext,
  })
  assert.equal(checkpointFailureRequests.length, 1, 'the implementation stage is blocked when a Git repository checkpoint fails')
  assert.match(checkpointFailureResult.roleErrors[0].message, /已阻止代码实施/)

  // 验证 4. 上游失败快速阻断 (Fail-Fast)
  const failFastExecutions = []
  const failFastConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  const failFastService = createRoleChatService({
    roleProfileStore: roleStore,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      async runAgentTurn(request) {
        failFastExecutions.push(request)
        if (request.modelKey === planner.modelKey) {
          throw new Error('规划模型上下文异常')
        }
        return { turnId: 'unexpected-stage', startedAt: Date.now(), text: '不应该被执行' }
      },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })

  const failFastResult = await failFastService.send({
    webContents,
    conversationId: failFastConversationId,
    text: '修复关键代码',
    roleIds: [planner.id, implementer.id, reviewer.id],
    runtimeContext,
  })

  assert.equal(failFastExecutions.length, 1, '规划失败时必须立即中断流水线，不得继续调用实施与审查')
  assert.equal(failFastResult.roleErrors.length, 1)
  assert.match(failFastResult.roleErrors[0].message, /规划模型上下文异常/)

  const unavailableReviewerConversationId = (await appState.createThread({ workspacePath: home })).conversationId
  const unavailableReviewerService = createRoleChatService({
    roleProfileStore: roleStore,
    profileStore: {},
    resolveModelKeyForChat: async ({ requestedKey }) => ({ modelKey: requestedKey }),
    chat: {
      async runAgentTurn(request) {
        return { turnId: `missing-${request.modelKey}`, startedAt: Date.now(), text: '实施已完成。' }
      },
    },
    appState,
    permissions: { withExecution: async (_mode, _sender, run) => run() },
    persistNativeTurn,
  })
  const unavailableReviewerResult = await unavailableReviewerService.send({
    webContents,
    conversationId: unavailableReviewerConversationId,
    text: '修复这个问题，然后让kai审查一下',
    roleIds: [implementer.id],
    runtimeContext,
  })
  assert.equal(unavailableReviewerResult.assistants.length, 1,
    'only the requested implementer runs when the named reviewer is unavailable')
  assert.match(unavailableReviewerResult.roleErrors[0].message, /kai.*没有改派/u,
    'the user gets a visible explanation instead of a substituted reviewer')

  console.log('✓ 端到端多 Bot 自动协作流水线（免 @ 自动分工、只读权限安全隔离与 Fail-Fast 阻断）测试全部通过！')
} finally {
  await fs.rm(home, { recursive: true, force: true })
}
