import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createOrchestrationService } from '../backend/orchestration-service.mjs'
import { RunStore } from '../backend/orchestration/run-store.mjs'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dag-approval-'))
try {
  const workspacePath = path.join(tempRoot, 'workspace')
  const userDataPath = path.join(tempRoot, 'user-data')
  const agentDataPath = path.join(tempRoot, 'agent-data')
  await Promise.all([fs.mkdir(workspacePath), fs.mkdir(userDataPath), fs.mkdir(agentDataPath)])

  const modelCatalog = {
    models: [
      {
        key: 'mock/balanced', name: 'Mock Balanced', available: true, routeRegistered: true,
        profile: { tier: 'balanced', enabledForAllocation: true },
        costPerMillion: { input: 0, output: 0 },
      },
      {
        key: 'mock/strong', name: 'Mock Strong', available: true, routeRegistered: true,
        profile: { tier: 'strong', enabledForAllocation: true },
        costPerMillion: { input: 0, output: 0 },
      },
    ],
  }
  const taskCalls = []
  const plannerCalls = []
  const states = new Map()
  let pauseRunConversationId = null
  let releasePausedTask
  let markPausedTaskStarted
  const pausedTaskStarted = new Promise((resolve) => { markPausedTaskStarted = resolve })
  const appState = {
    setTasksForConversation: async (conversationId, tasks) => {
      const state = states.get(conversationId) ?? { tasks: [] }
      state.tasks = tasks
      states.set(conversationId, state)
    },
    getConversationState: async (conversationId) => states.get(conversationId) ?? { tasks: [] },
  }
  const dshRuntime = {
    getSessionId: () => 'mock-session',
    runAgentTurn: async (options) => {
      if (options.agentPreset === 'tw-taskweaver-planner') {
        plannerCalls.push(options)
        if (options.text.includes('子任务执行结果')) return { text: '所有保留节点均已完成。', usage: { inputTokens: 2, outputTokens: 1 } }
        return {
          text: JSON.stringify({ tasks: [
            { id: 'T1', title: '执行主任务', taskType: 'implementation', role: '实现', description: '实现初始目标', acceptance: ['主任务结果可观察'], writeScopes: ['src/main.ts'], dependsOn: [] },
            { id: 'T2', title: '辅助任务', taskType: 'implementation', role: '实现', description: '实现辅助目标', acceptance: ['辅助结果可观察'], writeScopes: ['src/extra.ts'], dependsOn: ['T1'] },
          ] }),
          usage: { inputTokens: 3, outputTokens: 2 },
        }
      }
      taskCalls.push(options)
      if (options.conversationId === pauseRunConversationId && options.taskId === 'T1') {
        markPausedTaskStarted()
        await new Promise((resolve) => { releasePausedTask = resolve })
      }
      return { text: `完成任务 ${options.taskId}`, usage: { inputTokens: 4, outputTokens: 2 } }
    },
  }
  const orchestration = createOrchestrationService({
    modelService: { listCatalog: async () => modelCatalog },
    appState,
    getWorkspacePath: async () => workspacePath,
    agentDataPath,
    userDataPath,
    getAppPreferences: async () => ({ dagPlanApproval: 'write-only', worktreeIsolation: false }),
    dshRuntime,
  })

  const waitForApproval = async (events) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const event = events.find((item) => item?.type === 'plan_approval_required')
      if (event) return event
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error('DAG 未进入计划审批状态')
  }

  const approvedConversation = randomUUID()
  const approvedEvents = []
  const approvedState = { tasks: [] }
  states.set(approvedConversation, approvedState)
  const approvedRun = orchestration.planAndExecute({
    text: '请实现一个功能',
    primaryModelKey: 'mock/balanced',
    conversationId: approvedConversation,
    webContents: { send: (_channel, payload) => approvedEvents.push(payload) },
  })
  const approvalEvent = await waitForApproval(approvedEvents)
  assert.equal(approvedState.tasks.length, 2)
  assert.ok(approvedState.tasks.every((task) => task.statusLabel === '待审批'))
  assert.equal(taskCalls.length, 0, 'write nodes do not start before approval')

  const brokenDependency = orchestration.approvePlan(approvedConversation, approvalEvent.runId, {
    edits: [],
    deletedTaskIds: ['T1'],
  })
  assert.equal(brokenDependency.approved, false, 'approval revalidates dependencies after a node deletion')
  assert.match(brokenDependency.error, /无效任务/)

  const unavailableModel = orchestration.approvePlan(approvedConversation, approvalEvent.runId, {
    edits: [{ id: 'T1', description: '更新后的目标', acceptance: ['结果可观察'], modelKey: 'mock/missing' }],
    deletedTaskIds: ['T2'],
  })
  assert.equal(unavailableModel.approved, false, 'approval rejects a model that is not routable')
  assert.match(unavailableModel.error, /模型不可用/)

  const cyclicDependency = orchestration.approvePlan(approvedConversation, approvalEvent.runId, {
    edits: [{ id: 'T1', dependsOn: ['T2'] }],
    deletedTaskIds: [],
  })
  assert.equal(cyclicDependency.approved, false, 'approval revalidates edited dependency cycles')
  assert.match(cyclicDependency.error, /循环/)

  const approved = orchestration.approvePlan(approvedConversation, approvalEvent.runId, {
    edits: [{ id: 'T1', description: '更新后的目标', acceptance: ['结果可观察'], modelKey: 'mock/strong' }],
    deletedTaskIds: ['T2'],
  })
  assert.deepEqual(approved, { approved: true })
  const approvedResult = await approvedRun
  assert.equal(approvedResult.tasks.length, 1, 'deleted nodes are not executed')
  assert.equal(approvedResult.tasks[0].description, '更新后的目标')
  assert.deepEqual(approvedResult.tasks[0].acceptance, ['结果可观察'])
  assert.equal(taskCalls.length, 1)
  assert.equal(taskCalls[0].taskId, 'T1')
  assert.equal(taskCalls[0].modelKey, 'mock/strong', 'the approved model override is used at execution time')
  assert.match(taskCalls[0].text, /更新后的目标/)

  const dependencyConversation = randomUUID()
  const dependencyEvents = []
  states.set(dependencyConversation, { tasks: [] })
  const dependencyCallOffset = taskCalls.length
  const dependencyRun = orchestration.planAndExecute({
    text: '请实现一组有关联的功能',
    primaryModelKey: 'mock/balanced',
    conversationId: dependencyConversation,
    webContents: { send: (_channel, payload) => dependencyEvents.push(payload) },
  })
  const dependencyApproval = await waitForApproval(dependencyEvents)
  const dependencyApproved = orchestration.approvePlan(dependencyConversation, dependencyApproval.runId, {
    edits: [{ id: 'T2', dependsOn: [] }],
    deletedTaskIds: [],
  })
  assert.deepEqual(dependencyApproved, { approved: true }, 'the approval card can remove a dependency edge')
  const dependencyResult = await dependencyRun
  assert.deepEqual(dependencyResult.tasks.find((task) => task.id === 'T2').dependsOn, [], 'the approved dependency edit is persisted')
  assert.deepEqual(taskCalls.slice(dependencyCallOffset).map((call) => call.taskId), ['T1', 'T2'],
    'T2 still executes after T1 fails when the user explicitly removed its dependency')

  const rejectedConversation = randomUUID()
  const rejectedEvents = []
  states.set(rejectedConversation, { tasks: [] })
  const plannerCountBeforeReject = plannerCalls.length
  const taskCountBeforeReject = taskCalls.length
  const rejectedRun = orchestration.planAndExecute({
    text: '请实现另一个功能',
    primaryModelKey: 'mock/balanced',
    conversationId: rejectedConversation,
    webContents: { send: (_channel, payload) => rejectedEvents.push(payload) },
  })
  const rejectedEvent = await waitForApproval(rejectedEvents)
  assert.equal(orchestration.rejectPlan(randomUUID(), rejectedEvent.runId), false, 'one conversation cannot reject another conversation plan')
  assert.equal(orchestration.rejectPlan(rejectedConversation, rejectedEvent.runId), true)
  const rejectedResult = await rejectedRun
  assert.match(rejectedResult.assistant.text, /已拒绝此 DAG 计划/)
  assert.equal(plannerCalls.length, plannerCountBeforeReject + 1, 'rejected plans require only the planner model call')
  assert.equal(taskCalls.length, taskCountBeforeReject, 'rejected plans do not start child or synthesis model calls')
  assert.ok(states.get(rejectedConversation).tasks.every((task) => task.statusLabel === '计划已拒绝'))

  const scheduledConversation = randomUUID()
  const scheduledEvents = []
  pauseRunConversationId = scheduledConversation
  states.set(scheduledConversation, { tasks: [] })
  const scheduledRun = orchestration.planAndExecute({
    text: '定时实现一个小功能',
    primaryModelKey: 'mock/balanced',
    conversationId: scheduledConversation,
    dagPlanApprovalOverride: 'never',
    webContents: { send: (_channel, payload) => scheduledEvents.push(payload) },
  })
  await pausedTaskStarted
  const scheduledRunId = states.get(scheduledConversation).tasks[0].runId
  assert.equal(await orchestration.pauseRun(scheduledConversation, scheduledRunId), true)
  assert.ok(states.get(scheduledConversation).tasks.every((task) => task.runStatus === 'paused'))
  releasePausedTask()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(taskCalls.filter((call) => call.conversationId === scheduledConversation && call.taskId === 'T2').length, 0,
    'pause stops downstream nodes after the active node finishes')
  assert.equal(await orchestration.resumeRun(scheduledConversation, scheduledRunId), true)
  const scheduledResult = await scheduledRun
  assert.equal(scheduledEvents.some((event) => event?.type === 'plan_approval_required'), false,
    'scheduled DAG runs override interactive approval and never wait for a user')
  assert.equal(scheduledResult.tasks.length, 2)
  assert.ok(scheduledResult.tasks.every((task) => task.runStatus === 'completed'))
  const runHistory = await orchestration.listRuns(scheduledConversation)
  assert.equal(runHistory.length, 1)
  assert.equal(runHistory[0].runId, scheduledRunId)
  assert.equal(runHistory[0].status, 'completed', 'completed DAG runs remain available by runId')

  const recoveryAgentDataPath = path.join(tempRoot, 'recovery-agent-data')
  const recoveryUserDataPath = path.join(tempRoot, 'recovery-user-data')
  await Promise.all([fs.mkdir(recoveryAgentDataPath), fs.mkdir(recoveryUserDataPath)])
  const recoveryConversationId = randomUUID()
  const recoveryRunId = randomUUID()
  const recoveryStore = new RunStore({ agentDataPath: recoveryAgentDataPath })
  await recoveryStore.saveRun(recoveryConversationId, recoveryRunId, {
    runId: recoveryRunId,
    conversationId: recoveryConversationId,
    status: 'running',
    tasks: [{ id: 'T1', runId: recoveryRunId, status: 'running', statusLabel: '执行中', runStatus: 'running' }],
  })
  let restoredTasks = null
  createOrchestrationService({
    modelService: { listCatalog: async () => modelCatalog },
    appState: {
      getConversationState: async () => ({ tasks: [] }),
      setTasksForConversation: async (_conversationId, tasks) => { restoredTasks = tasks },
    },
    getWorkspacePath: async () => workspacePath,
    agentDataPath: recoveryAgentDataPath,
    userDataPath: recoveryUserDataPath,
    getAppPreferences: async () => ({ dagPlanApproval: 'write-only' }),
    dshRuntime,
  })
  for (let attempt = 0; attempt < 200 && !restoredTasks; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(restoredTasks?.[0]?.status, 'interrupted', 'startup recovery restores interrupted nodes into the conversation task state')
  assert.equal(restoredTasks?.[0]?.statusLabel, '已中断')

  console.log('DAG plan approval workflow checks passed')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
