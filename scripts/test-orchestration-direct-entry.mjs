import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppStateStore } from '../backend/app-state-store.mjs'
import { createChatTurnPipeline } from '../backend/chat-turn-pipeline.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-orchestration-entry-'))
try {
  const appState = createAppStateStore(root, root)
  const activeKey = 'test/model'
  const seen = []
  let chatCalls = 0
  const pipeline = createChatTurnPipeline({
    appState,
    profileStore: { resolve: async () => ({}) },
    modelService: { getModelContextWindow: async () => 16_000 },
    resolveModelKeyForChat: async () => ({ modelKey: activeKey }),
    appPreferences: { get: async () => ({}) },
    createGitCheckpoint: async () => {},
    userDataPath: path.join(root, 'user-data'),
    chat: { send: async () => { chatCalls += 1; throw new Error('direct DAG entry must skip the primary model loop') } },
    orchestration: {
      planAndExecute: async (request) => {
        seen.push(request)
        return {
          assistant: { text: '两项子任务已完成', fileChanges: [{ path: 'src/result.ts' }] },
          tasks: [{ id: 'T1' }, { id: 'T2' }],
        }
      },
    },
    permissions: { withExecution: async (_mode, _sender, operation) => operation() },
    skills: { resolve: async (name) => name === 'parallel-skill'
      ? { name, multiAgent: true, instructions: '并行完成独立部分。' }
      : null },
    persistNativeTurn: async () => {},
    workspaceHooksTrusted: async () => false,
    sandboxContextLineForContext: () => '工作区命令受安全策略约束。',
  })

  const webContents = { isDestroyed: () => false, send() {} }
  const modes = [
    { name: 'composer toggle', options: { executionModeOverride: 'multi-agent' } },
    { name: 'goal mode', options: { workMode: 'goal' } },
    { name: 'multi-agent skill', options: { skillName: 'parallel-skill' } },
  ]
  for (const [index, { name, options }] of modes.entries()) {
    const { conversationId } = await appState.createThread({ workspacePath: root })
    const result = await pipeline.runTurn({
      webContents,
      text: `完成 ${name} 的用户目标`,
      conversationId,
      runtimeContext: {
        workspacePath: root,
        workspaceTrusted: false,
        permissionMode: 'ask',
        modelKey: activeKey,
      },
      ...options,
    })
    assert.equal(result.assistant.text, '两项子任务已完成')
    assert.match(result.assistant.callout, /2 个子任务/)
    assert.equal(seen.length, index + 1, `${name} must invoke the DAG exactly once`)
    assert.equal(seen[index].rawText, `完成 ${name} 的用户目标`)
    assert.equal(seen[index].conversationId, conversationId)
    assert.equal(seen[index].workspacePath, root)
    assert.equal(seen[index].permissionMode, 'ask')
    assert.ok(seen[index].contextLayers.some((layer) => layer.id === 'sandbox-policy'
      && layer.text.includes('工作区命令受安全策略约束')), 'the planner and child sessions receive the complete prompt context')
    assert.equal(seen[index].skillAlreadyApplied, true)
  }
  assert.equal(seen[0].skill, null)
  assert.equal(seen[1].skill, null)
  assert.equal(seen[2].skill?.name, 'parallel-skill')
  assert.equal(chatCalls, 0, 'explicit DAG entry points must not first invoke the primary single-agent loop')
  console.log('direct multi-agent entry checks passed (composer toggle, goal mode, Skill, prompt context)')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
