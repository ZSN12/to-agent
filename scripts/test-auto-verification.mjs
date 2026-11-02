import assert from 'node:assert/strict'
import {
  AUTO_VERIFICATION_PROMPT_MARKER,
  verificationEvidence,
} from '../backend/chat-turn-pipeline.mjs'
import { verificationSandboxPolicy } from '../backend/sandbox-policy.mjs'

const renderer = await import('../src/features/chat/autoVerification.ts')

// The renderer labels repair prompts by this marker, so both sides must agree.
assert.equal(renderer.AUTO_VERIFICATION_PROMPT_MARKER, AUTO_VERIFICATION_PROMPT_MARKER)
assert.equal(renderer.isAutoVerificationPrompt(`${AUTO_VERIFICATION_PROMPT_MARKER} 第 1/2 轮修复\n...`), true)
assert.equal(renderer.isAutoVerificationPrompt('请修复 [TaskWeaver 自动验证] 报的错'), false, 'only a leading marker counts')
assert.equal(renderer.isAutoVerificationPrompt(undefined), false)

// Sandbox: same bash policy as the Agent; `auto` never silently runs unconfined.
const workspacePath = '/tmp/tw-auto-verify'
assert.deepEqual(
  verificationSandboxPolicy({ workspacePath, permissionMode: 'ask', bashSandbox: 'auto', sessionSandboxMode: null }),
  { mode: 'workspace-write', workspaceRoot: workspacePath },
)
assert.equal(verificationSandboxPolicy({ workspacePath, permissionMode: 'full', bashSandbox: 'auto' }).mode, 'off',
  'full access mode runs verification like the Agent bash: unconfined')
assert.equal(verificationSandboxPolicy({ workspacePath, permissionMode: 'ask', bashSandbox: 'off' }).mode, 'off',
  'an explicit bash sandbox opt-out applies to verification too')
assert.equal(verificationSandboxPolicy({ workspacePath, permissionMode: 'ask', bashSandbox: 'read-only' }).mode, 'read-only')

// Evidence: only runner records count, and non-code outcomes are not called failures.
const step = (overrides = {}) => ({
  command: 'pnpm run typecheck', kind: 'check', status: 'passed', exitCode: 0, durationMs: 10,
  timedOut: false, sandboxDenied: false, ...overrides,
})
assert.equal(verificationEvidence(null), undefined)
const passed = verificationEvidence({
  executed: true, passed: true, command: 'pnpm run test', exitCode: 0, durationMs: 30, timedOut: false,
  repairable: false, commands: [step(), step({ command: 'pnpm run test', kind: 'test' })],
}, 1)
assert.equal(passed.status, 'passed')
assert.equal(passed.healAttempts, 1)
assert.equal(passed.reason, undefined)
assert.deepEqual(passed.commands.map((item) => [item.command, item.source, item.background]), [
  ['pnpm run typecheck', 'workspace-runner', false],
  ['pnpm run test', 'workspace-runner', false],
])

const failed = verificationEvidence({
  executed: true, passed: false, command: 'pnpm run test', exitCode: 1, durationMs: 30, timedOut: false,
  repairable: true, errorSummary: 'expected 1 to be 2', commands: [step(), step({ command: 'pnpm run test', status: 'failed', exitCode: 1 })],
}, 2)
assert.equal(failed.status, 'failed')
assert.equal(failed.reason, 'expected 1 to be 2')
assert.equal(failed.healAttempts, 2)

const timedOut = verificationEvidence({
  executed: true, passed: false, command: 'pnpm run test', exitCode: 124, timedOut: true, repairable: false,
  errorSummary: '验证命令运行超时', commands: [step({ status: 'failed', exitCode: 124, timedOut: true })],
})
assert.equal(timedOut.status, 'incomplete', 'a timeout is reported as unconfirmed, not as a code failure')
assert.equal(timedOut.commands[0].timedOut, true)

const denied = verificationEvidence({
  executed: true, passed: false, command: 'pnpm run test', exitCode: 1, repairable: false, sandboxDenied: true,
  commands: [step({ status: 'failed', exitCode: 1, sandboxDenied: true })],
})
assert.equal(denied.status, 'incomplete')
assert.equal(denied.commands[0].sandboxDenied, true)

const notRun = verificationEvidence({ executed: false, cancelled: false, errorSummary: '未检测到可执行的验证命令。', commands: [] })
assert.equal(notRun.status, 'not_run')
assert.equal(notRun.passed, false)
assert.equal(notRun.reason, '未检测到可执行的验证命令。')
assert.equal(verificationEvidence({ executed: false, cancelled: true, commands: [] }).status, 'incomplete')

console.log('auto verification helpers passed')
