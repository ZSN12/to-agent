import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createOrchestrationService } from '../backend/orchestration-service.mjs'
import { RunStore } from '../backend/orchestration/run-store.mjs'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dag-approval-'))
try {
  const workspacePath = path.join(tempRoot, 'workspace')
  const userDataPath = path.join(tempRoot, 'user-data')
  const agentDataPath = path.join(tempRoot, 'agent-data')
  await Promise.all([fs.mkdir(workspacePath), fs.mkdir(userDataPath), fs.mkdir(agentDataPath)])
  await fs.writeFile(path.join(workspacePath, 'README.md'), 'mock project\n')
  const integrationVerificationMarker = path.join(tempRoot, 'integration-verification-started')
  const verificationCommand = `node -e 'require("node:fs").writeFileSync(${JSON.stringify(integrationVerificationMarker)}, "started"); setTimeout(() => {}, 30000)'`
  await fs.writeFile(path.join(workspacePath, 'package.json'), JSON.stringify({
    name: 'taskweaver-dag-cancel-fixture',
    version: '1.0.0',
    scripts: { typecheck: verificationCommand },
  }))
  execFileSync('git', ['init', '-b', 'main'], { cwd: workspacePath, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'TaskWeaver Test'], { cwd: workspacePath, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'test@taskweaver.local'], { cwd: workspacePath, stdio: 'ignore' })
  execFileSync('git', ['add', '-A'], { cwd: workspacePath, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'fixture baseline'], { cwd: workspacePath, stdio: 'ignore' })

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
  const acceptance = (criterion) => `<taskweaver-acceptance-v1>${JSON.stringify({
    results: [{ criterion, passed: true, evidence: 'README.md 已读取' }],
  })}</taskweaver-acceptance-v1>`
  const taskCalls = []
  const plannerCalls = []
  const states = new Map()
  let pauseRunConversationId = null
  let cancelPlanningConversationId = null
  let cancelChildConversationId = null
  let cancelSynthesisConversationId = null
  let integrationCancelConversationId = null
  let enableWorktreeIsolation = false
  let releasePausedTask
  let markPausedTaskStarted
  const pausedTaskStarted = new Promise((resolve) => { markPausedTaskStarted = resolve })
  let markCancelledPlanningStarted
  const cancelledPlanningStarted = new Promise((resolve) => { markCancelledPlanningStarted = resolve })
  let markCancelledSynthesisStarted
  const cancelledSynthesisStarted = new Promise((resolve) => { markCancelledSynthesisStarted = resolve })
  let markCancelledChildStarted
  const cancelledChildStarted = new Promise((resolve) => { markCancelledChildStarted = resolve })
  const waitForAbort = (signal, partialUsage) => new Promise((_resolve, reject) => {
    const rejectAsAborted = () => {
      const error = new Error('mock task aborted')
      if (partialUsage) error.partialResult = { usage: partialUsage }
      reject(error)
    }
    if (signal?.aborted) {
      rejectAsAborted()
      return
    }
    signal?.addEventListener('abort', rejectAsAborted, { once: true })
  })
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
        if (options.text.includes('子任务执行结果')) {
          if (options.conversationId === cancelSynthesisConversationId) {
            markCancelledSynthesisStarted()
            await waitForAbort(options.signal, { inputTokens: 7, outputTokens: 3, costUsd: 0.07 })
          }
          return { text: '所有保留节点均已完成。', usage: { inputTokens: 2, outputTokens: 1 } }
        }
        if (options.conversationId === cancelSynthesisConversationId) {
          return {
            text: JSON.stringify({ tasks: [
              { id: 'T1', title: '成功调研', taskType: 'research', role: '调研', description: '读取 README 并核对结论', acceptance: ['T1 结论可验证'], scopePaths: ['README.md'], dependsOn: [] },
              { id: 'T2', title: '不完整调研', taskType: 'research', role: '调研', description: '检查另一项结论', acceptance: ['T2 结论可验证'], scopePaths: ['README.md'], dependsOn: [] },
            ] }),
            usage: { inputTokens: 3, outputTokens: 2 },
          }
        }
        if (options.conversationId === integrationCancelConversationId) {
          return {
            text: JSON.stringify({ tasks: [
              {
                id: 'T1', title: '集成取消 fixture', taskType: 'implementation', role: '实现',
                description: '仅生成一个可成功结束的实现节点，以便验证集成阶段取消生命周期。',
                acceptance: ['集成阶段取消状态保留'], writeScopes: ['src/integration.ts'], dependsOn: [],
              },
            ] }),
            usage: { inputTokens: 3, outputTokens: 2 },
          }
        }
        if (options.conversationId === cancelPlanningConversationId) {
          markCancelledPlanningStarted()
          await waitForAbort(options.signal, { inputTokens: 5, outputTokens: 2, costUsd: 0.05 })
        }
        return {
          text: JSON.stringify({ tasks: [
            { id: 'T1', title: '执行主任务', taskType: 'implementation', role: '实现', description: '实现初始目标', acceptance: ['主任务结果可观察'], writeScopes: ['src/main.ts'], dependsOn: [] },
            { id: 'T2', title: '辅助任务', taskType: 'implementation', role: '实现', description: '实现辅助目标', acceptance: ['辅助结果可观察'], writeScopes: ['src/extra.ts'], dependsOn: ['T1'] },
          ] }),
          usage: { inputTokens: 3, outputTokens: 2 },
        }
      }
      taskCalls.push(options)
      if (options.conversationId === integrationCancelConversationId && options.taskId === 'T1') {
        return {
          text: `无需改动，因为本用例只验证集成阶段取消。\n${acceptance('集成阶段取消状态保留')}`,
          usage: { inputTokens: 4, outputTokens: 2 },
        }
      }
      if (options.conversationId === cancelChildConversationId && options.taskId === 'T1') {
        markCancelledChildStarted()
        await waitForAbort(options.signal, { inputTokens: 11, outputTokens: 4, costUsd: 0.11 })
      }
      if (options.conversationId === cancelSynthesisConversationId) {
        if (options.taskId === 'T1') {
          options.webContents.send('chat:stream', {
            type: 'tool', taskId: options.taskId, id: 'cancel-synthesis-read',
            toolName: 'read', status: 'done', inputSummary: 'README.md', resultSummary: 'mock README',
          })
          return { text: `README.md 已核对。\n${acceptance('T1 结论可验证')}`, usage: { inputTokens: 2, outputTokens: 1 } }
        }
        return { text: '暂时无法核验第二项结论。', usage: { inputTokens: 1, outputTokens: 1 } }
      }
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
    getAppPreferences: async () => ({ dagPlanApproval: 'write-only', worktreeIsolation: enableWorktreeIsolation }),
    dshRuntime,
  })

  const planningCancelConversation = randomUUID()
  states.set(planningCancelConversation, { tasks: [] })
  cancelPlanningConversationId = planningCancelConversation
  const planningCancelRun = orchestration.planAndExecute({
    text: '请实现一个小功能',
    primaryModelKey: 'mock/balanced',
    conversationId: planningCancelConversation,
    webContents: { send() {} },
  })
  await cancelledPlanningStarted
  assert.equal(await orchestration.abort(planningCancelConversation), true)
  const planningCancelResult = await planningCancelRun
  cancelPlanningConversationId = null
  assert.equal(planningCancelResult.assistant.cancelled, true, 'stopping during planner generation is reported as cancellation')
  assert.deepEqual(
    [planningCancelResult.assistant.usage.inputTokens, planningCancelResult.assistant.usage.outputTokens],
    [5, 2],
    'partial usage from an aborted planner call remains visible in the assistant result',
  )
  assert.equal((await orchestration.listRuns(planningCancelConversation))[0]?.status, 'cancelled')
  assert.equal(plannerCalls.filter((call) => call.conversationId === planningCancelConversation).length, 1,
    'an aborted planner attempt does not retry the cancelled model call')

  const childCancelConversation = randomUUID()
  states.set(childCancelConversation, { tasks: [] })
  cancelChildConversationId = childCancelConversation
  const childCancelRun = orchestration.planAndExecute({
    text: '请实现一组有关联的功能，然后在第一个子任务执行时停止',
    primaryModelKey: 'mock/balanced',
    conversationId: childCancelConversation,
    dagPlanApprovalOverride: 'never',
    webContents: { send() {} },
  })
  await cancelledChildStarted
  assert.equal(await orchestration.abort(childCancelConversation), true)
  const childCancelResult = await childCancelRun
  cancelChildConversationId = null
  assert.equal(childCancelResult.assistant.cancelled, true, 'stopping a running child task is reported as cancellation')
  assert.deepEqual(
    [childCancelResult.assistant.usage.inputTokens, childCancelResult.assistant.usage.outputTokens],
    [14, 6],
    'partial usage from an aborted child is added to planner usage',
  )
  assert.equal(taskCalls.filter((call) => call.conversationId === childCancelConversation).length, 1,
    'a child call cancelled by the user is not retried')
  assert.equal(childCancelResult.tasks.find((task) => task.id === 'T2')?.status, 'cancelled',
    'downstream nodes do not run after the active child is cancelled')

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
  const approvedTaskCallOffset = taskCalls.length
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
  assert.equal(taskCalls.length, approvedTaskCallOffset, 'write nodes do not start before approval')

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
  assert.equal(taskCalls.length, approvedTaskCallOffset + 1)
  assert.equal(taskCalls[approvedTaskCallOffset].taskId, 'T1')
  assert.equal(taskCalls[approvedTaskCallOffset].modelKey, 'mock/strong', 'the approved model override is used at execution time')
  assert.match(taskCalls[approvedTaskCallOffset].text, /更新后的目标/)

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

  const approvalCancelConversation = randomUUID()
  const approvalCancelEvents = []
  states.set(approvalCancelConversation, { tasks: [] })
  const approvalCancelRun = orchestration.planAndExecute({
    text: '请实现一个停止测试功能',
    primaryModelKey: 'mock/balanced',
    conversationId: approvalCancelConversation,
    webContents: { send: (_channel, payload) => approvalCancelEvents.push(payload) },
  })
  await waitForApproval(approvalCancelEvents)
  assert.equal(await orchestration.abort(approvalCancelConversation), true)
  const approvalCancelResult = await approvalCancelRun
  assert.equal(approvalCancelResult.assistant.cancelled, true, 'stopping at the approval gate is reported as cancellation')
  assert.equal((await orchestration.listRuns(approvalCancelConversation))[0]?.status, 'cancelled')
  assert.ok(states.get(approvalCancelConversation).tasks.every((task) => task.status === 'cancelled'))
  assert.equal(taskCalls.some((call) => call.conversationId === approvalCancelConversation), false,
    'stopping at approval never starts child tasks')

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

  const synthesisCancelConversation = randomUUID()
  states.set(synthesisCancelConversation, { tasks: [] })
  cancelSynthesisConversationId = synthesisCancelConversation
  const synthesisCancelRun = orchestration.planAndExecute({
    text: '请只读调研 README 中两项内容，然后在汇总阶段停止',
    primaryModelKey: 'mock/balanced',
    conversationId: synthesisCancelConversation,
    dagPlanApprovalOverride: 'never',
    webContents: { send() {} },
  })
  await cancelledSynthesisStarted
  assert.equal(await orchestration.abort(synthesisCancelConversation), true)
  const synthesisCancelResult = await synthesisCancelRun
  cancelSynthesisConversationId = null
  assert.equal(synthesisCancelResult.assistant.cancelled, true, 'stopping during final synthesis is reported as cancellation')
  assert.equal((await orchestration.listRuns(synthesisCancelConversation))[0]?.status, 'cancelled')
  assert.deepEqual(synthesisCancelResult.tasks.map((task) => task.status), ['done', 'review'],
    'completed and failed node results stay visible when only final synthesis is cancelled')
  assert.deepEqual(synthesisCancelResult.tasks.map((task) => task.runStatus), ['completed', 'failed'],
    'final synthesis cancellation preserves completed and failed node states')
  assert.deepEqual(
    [synthesisCancelResult.assistant.usage.inputTokens, synthesisCancelResult.assistant.usage.outputTokens],
    [13, 7],
    'cancelled synthesis usage is added to completed planner and child task usage',
  )

  const integrationCancelConversation = randomUUID()
  states.set(integrationCancelConversation, { tasks: [] })
  integrationCancelConversationId = integrationCancelConversation
  enableWorktreeIsolation = true
  const integrationCancelRun = orchestration.planAndExecute({
    text: '请实现集成取消生命周期测试',
    primaryModelKey: 'mock/balanced',
    conversationId: integrationCancelConversation,
    dagPlanApprovalOverride: 'never',
    workspaceTrusted: true,
    permissionMode: 'workspace-write',
    webContents: { send() {} },
  })
  const verificationDeadline = Date.now() + 5000
  let verificationStarted = false
  while (!verificationStarted && Date.now() < verificationDeadline) {
    try {
      await fs.access(integrationVerificationMarker)
      verificationStarted = true
    } catch { /* wait for the integration verification subprocess */ }
    if (!verificationStarted) await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.ok(verificationStarted, 'the integration verification command should start before cancellation')
  assert.equal(await orchestration.abort(integrationCancelConversation), true)
  const integrationCancelResult = await integrationCancelRun
  integrationCancelConversationId = null
  enableWorktreeIsolation = false
  assert.equal(integrationCancelResult.assistant.cancelled, true,
    'stopping during integration verification must finish the DAG as cancelled')
  const integrationCancelState = await new RunStore({ agentDataPath })
    .loadRun(integrationCancelConversation, integrationCancelResult.runId)
  assert.equal(integrationCancelState?.status, 'cancelled')
  assert.equal(integrationCancelState?.integration?.status, 'cancelled',
    'the integration worktree must be retained with an explicit cancellation state')
  assert.equal(integrationCancelState?.integration?.verification?.status, 'cancelled',
    'the in-flight verification must be recorded as cancelled')
  assert.ok(integrationCancelState?.integration?.branchName,
    'cancelling verification must preserve the previewable integration branch')
  assert.equal(plannerCalls.filter((call) => call.conversationId === integrationCancelConversation
    && call.text.includes('子任务执行结果')).length, 0,
  'final synthesis must not start after integration verification is cancelled')

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
