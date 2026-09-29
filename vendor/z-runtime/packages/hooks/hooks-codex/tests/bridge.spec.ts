import { createUserMessage } from '@z/dsh-llm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@z/cordis'
import Loader from '@z/cordis-plugin-loader'
import { SessionId, type SessionEvent } from '@z/dsh-session'
import { defineContentToolFixture } from '@z/dsh-tools'
import type { Agent } from '@z/dsh-agent'
import AgentLoop from '@z/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@z/dsh-agent-loop-testkit'
import { LocalBashExecutor } from '@z/dsh-bash-local'
import LocalSubprocessRuntime from '@z/dsh-subprocess-local'
import * as HooksCodex from '@z/dsh-hooks-codex'
import SandboxPolicyService from '@z/dsh-sandbox-policy'
import ApprovalService from '@z/dsh-user-approval'
import { scopeTarget } from '@z/dsh-scope'
import SubagentRuntime, { SubagentRunId } from '@z/dsh-subagent'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

/**
 * Full-loop Codex bridge tests with a mock model, the real loop and bash
 * executor, and shell hooks from a temporary config. Covers regex matching,
 * block-only decisions, and the five-event subset.
 */

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

function configDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-hooks-codex-'))
  dirs.push(dir)
  return dir
}
function script(dir: string, name: string, body: string): string {
  const path = join(dir, name)
  writeFileSync(path, body)
  chmodSync(path, 0o755)
  return path
}
function writeHooks(dir: string, hooks: unknown): void {
  writeFileSync(join(dir, 'hooks.json'), JSON.stringify({ hooks }))
}

async function harness(
  dir: string,
  adapter: MockAdapter,
  beforeHooks?: (ctx: Context) => void,
  pluginConfig?: Record<string, unknown>,
): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(LocalBashExecutor, { timeoutMs: 10_000 })
  beforeHooks?.(ctx)
  await ctx.plugin(HooksCodex, { configPath: join(dir, 'hooks.json'), model: 'test-model', ...pluginConfig })
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

function waitForIdle(_ctx: Context, agent: Agent): Promise<void> {
  return agent.whenIdle()
}
function events(agent: Agent): SessionEvent[] { return [...agent.session.events] }

/** Poll `predicate` until true or the deadline passes (detached hook effects can't be awaited directly). */
async function waitFor(predicate: () => boolean, timeout = 5000, interval = 10): Promise<void> {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met before deadline')
    await new Promise(r => setTimeout(r, interval))
  }
}

/** Emit a scoped subagent event so the bridge's subagent listeners observe it. */
function subagentCarrier(ctx: Context) {
  return scopeTarget(ctx as unknown as SubagentRuntime, undefined)
}

describe('hooks-codex bridge', () => {
  it('a PreToolUse hook (exit 2) denies a tool the regex matcher matches as a substring', async () => {
    const dir = configDir()
    const deny = script(dir, 'deny.sh', '#!/usr/bin/env bash\necho "codex blocked it" >&2\nexit 2\n')
    // Codex regex matcher: "Bash" is /Bash/ — matches the tool name "Bash".
    writeHooks(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: deny }] }] })

    const adapter = new MockAdapter([toolCallResponse('c1', 'Bash', { command: 'ls' }), textResponse('done')])
    const ctx = await harness(dir, adapter)
    let ran = false
    ctx.tools.register(defineContentToolFixture({ name: 'Bash', description: 'b', parameters: { command: { type: 'string' } }, async execute() { ran = true; return [{ type: 'text', text: 'no' }] } }))
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'run ls' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(ran).toBe(false)
    const result = events(agent).find(e => e.type === 'tool/result')
    expect(result?.type === 'tool/result' && result.data.message.content[0].isError).toBe(true)
    expect(result?.type === 'tool/result' && result.data.message.content[0].content.some(b => b.type === 'text' && b.text.includes('codex blocked it'))).toBe(true)
    expect(events(agent).some(e => e.type === 'hook/invoked' && e.data.dialect === 'codex' && e.data.point === 'PreToolUse')).toBe(true)
  })

  it('a Stop hook (exit 2) forces the turn to continue with the reason as steering', async () => {
    const dir = configDir()
    // Stop ignores its malformed matcher field. Block once with a marker;
    // until the loop guard lands, an always-blocking hook would never finish.
    const marker = join(dir, 'fired')
    const cont = script(dir, 'cont.sh', `#!/usr/bin/env bash\nif [ -e "${marker}" ]; then exit 0; fi\ntouch "${marker}"\necho "keep going: address the goal" >&2\nexit 2\n`)
    writeHooks(dir, { Stop: [{ matcher: '[', hooks: [{ type: 'command', command: cont }] }] })

    const adapter = new MockAdapter([textResponse('first answer'), textResponse('second answer after goal')])
    const ctx = await harness(dir, adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(adapter.requests).toHaveLength(2)
    expect(JSON.stringify(adapter.requests[1]!.messages)).toContain('keep going: address the goal')
  }, 15_000) // Two real hook subprocesses and agent steps need startup and teardown headroom under load.

  it('the Stop loop guard lets an always-blocking hook end the turn after the cap', async () => {
    const dir = configDir()
    // Unconditionally blocking Stop hook — with no guard it would loop forever.
    const cont = script(dir, 'always-block.sh', '#!/usr/bin/env bash\necho "keep going: address the goal" >&2\nexit 2\n')
    writeHooks(dir, { Stop: [{ matcher: '[', hooks: [{ type: 'command', command: cont }] }] })

    const adapter = new MockAdapter([textResponse('first answer'), textResponse('second answer after goal')])
    const ctx = await harness(dir, adapter, undefined, { stopLoopGuardMax: 1 })
    const agent = ctx.agentLoop.create(SessionId('a-loopguard'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    // First answer + exactly one forced continuation, then the guard lets the turn end.
    expect(adapter.requests).toHaveLength(2)
    expect(JSON.stringify(adapter.requests[1]!.messages)).toContain('keep going: address the goal')
  }, 20_000)

  it('stopLoopGuardMax: 0 restores the historical always-continue-on-block behavior', async () => {
    const dir = configDir()
    // An always-blocking Stop hook (empty stderr, no reason) with the guard
    // disabled must force-continue on every stop using the default steering
    // text — the historical behavior before the guard landed. The marker makes
    // it self-limit after the first block so the turn ends.
    const marker = join(dir, 'fired')
    const cont = script(dir, 'always-block.sh', `#!/usr/bin/env bash\nif [ -e "${marker}" ]; then exit 0; fi\ntouch "${marker}"\nexit 2\n`)
    writeHooks(dir, { Stop: [{ matcher: '[', hooks: [{ type: 'command', command: cont }] }] })

    const adapter = new MockAdapter([textResponse('first answer'), textResponse('second answer after goal')])
    const ctx = await harness(dir, adapter, undefined, { stopLoopGuardMax: 0 })
    const agent = ctx.agentLoop.create(SessionId('a-guard-off'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(adapter.requests).toHaveLength(2)
    expect(JSON.stringify(adapter.requests[1]!.messages)).toContain('continue: blocked by Stop hook')
  }, 20_000)

  it('rejects a negative or fractional stopLoopGuardMax at load', async () => {
    const dir = configDir()
    writeHooks(dir, {})
    for (const bad of [-1, 1.5, Number.NaN]) {
      const adapter = new MockAdapter([])
      await expect(harness(dir, adapter, undefined, { stopLoopGuardMax: bad }))
        .rejects.toThrow(/hooks-codex: stopLoopGuardMax must be a non-negative integer/)
    }
  })

  it('a blocking Stop hook resets the loop guard on a non-blocking Stop decision', async () => {
    const dir = configDir()
    // Block on the first stop, exit 0 on the second (a non-blocking decision).
    const marker = join(dir, 'fired')
    const cont = script(dir, 'once-block.sh', `#!/usr/bin/env bash\nif [ -e "${marker}" ]; then exit 0; fi\ntouch "${marker}"\necho "keep going: address the goal" >&2\nexit 2\n`)
    writeHooks(dir, { Stop: [{ matcher: '[', hooks: [{ type: 'command', command: cont }] }] })

    const adapter = new MockAdapter([textResponse('first answer'), textResponse('second answer after goal')])
    const ctx = await harness(dir, adapter, undefined, { stopLoopGuardMax: 1 })
    const agent = ctx.agentLoop.create(SessionId('a-reset'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    // The first Stop blocks (guard=1 still allows it); the second Stop is
    // non-blocking, so the turn ends without the guard tripping an extra step.
    expect(adapter.requests).toHaveLength(2)
    expect(JSON.stringify(adapter.requests[1]!.messages)).toContain('keep going: address the goal')
  }, 20_000)

  it('reports the effective sandbox/approval policy as permission_mode in the payload', async () => {
    const dir = configDir()
    const payloadFile = join(dir, 'payload.json')
    // Capture the PreToolUse stdin payload, then allow the tool through.
    const capture = script(dir, 'capture.sh', `#!/usr/bin/env bash\ncat > "${payloadFile}"\nexit 0\n`)
    writeHooks(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: capture }] }] })

    const adapter = new MockAdapter([toolCallResponse('c1', 'Bash', { command: 'ls' }), textResponse('done')])
    // Mount a danger-full-access sandbox policy + never-ask approval so the
    // derived Codex permission_mode is not the fallback 'default'.
    const ctx = await harness(dir, adapter, async (c) => {
      await c.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: dir })
      await c.plugin(ApprovalService, { policy: 'never' })
    })
    let ran = false
    ctx.tools.register(defineContentToolFixture({ name: 'Bash', description: 'b', parameters: { command: { type: 'string' } }, async execute() { ran = true; return [{ type: 'text', text: 'ok' }] } }))
    const agent = ctx.agentLoop.create(SessionId('a-pmode'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'run ls' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    await waitFor(() => existsSync(payloadFile))

    const payload = JSON.parse(readFileSync(payloadFile, 'utf8'))
    expect(payload.permission_mode).toBe('bypassPermissions')
    expect(ran).toBe(true)
  }, 20_000)

  it('falls back to permission_mode "default" when no sandbox/approval seam is mounted', async () => {
    const dir = configDir()
    const payloadFile = join(dir, 'payload.json')
    const capture = script(dir, 'capture.sh', `#!/usr/bin/env bash\ncat > "${payloadFile}"\nexit 0\n`)
    writeHooks(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: capture }] }] })

    const adapter = new MockAdapter([toolCallResponse('c1', 'Bash', { command: 'ls' }), textResponse('done')])
    const ctx = await harness(dir, adapter)
    let ran = false
    ctx.tools.register(defineContentToolFixture({ name: 'Bash', description: 'b', parameters: { command: { type: 'string' } }, async execute() { ran = true; return [{ type: 'text', text: 'ok' }] } }))
    const agent = ctx.agentLoop.create(SessionId('a-pmode2'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'run ls' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    await waitFor(() => existsSync(payloadFile))

    const payload = JSON.parse(readFileSync(payloadFile, 'utf8'))
    expect(payload.permission_mode).toBe('default')
    expect(ran).toBe(true)
  }, 20_000)

  it('reports permission_mode "dontAsk" under a never approval policy with a confined sandbox', async () => {
    const dir = configDir()
    const payloadFile = join(dir, 'payload.json')
    const capture = script(dir, 'capture.sh', `#!/usr/bin/env bash\ncat > "${payloadFile}"\nexit 0\n`)
    writeHooks(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: capture }] }] })

    const adapter = new MockAdapter([toolCallResponse('c1', 'Bash', { command: 'ls' }), textResponse('done')])
    // A confined (workspace-write) sandbox with a never approval policy folds to
    // `dontAsk` — covering the approval arm of permissionModeOf past the
    // danger-full-access short-circuit.
    const ctx = await harness(dir, adapter, async (c) => {
      await c.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: dir })
      await c.plugin(ApprovalService, { policy: 'never' })
    })
    ctx.tools.register(defineContentToolFixture({ name: 'Bash', description: 'b', parameters: { command: { type: 'string' } }, async execute() { return [{ type: 'text', text: 'ok' }] } }))
    const agent = ctx.agentLoop.create(SessionId('a-pmode3'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'run ls' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    await waitFor(() => existsSync(payloadFile))

    const payload = JSON.parse(readFileSync(payloadFile, 'utf8'))
    expect(payload.permission_mode).toBe('dontAsk')
  }, 20_000)

  it('reports permission_mode "default" under an ask approval policy with a confined sandbox', async () => {
    const dir = configDir()
    const payloadFile = join(dir, 'payload.json')
    const capture = script(dir, 'capture.sh', `#!/usr/bin/env bash\ncat > "${payloadFile}"\nexit 0\n`)
    writeHooks(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: capture }] }] })

    const adapter = new MockAdapter([toolCallResponse('c1', 'Bash', { command: 'ls' }), textResponse('done')])
    // A confined sandbox with an `ask` (not `never`) approval policy folds back
    // to `default` — covering the non-`never` fallthrough of permissionModeOf.
    const ctx = await harness(dir, adapter, async (c) => {
      await c.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: dir })
      await c.plugin(ApprovalService, { policy: 'ask' })
    })
    ctx.tools.register(defineContentToolFixture({ name: 'Bash', description: 'b', parameters: { command: { type: 'string' } }, async execute() { return [{ type: 'text', text: 'ok' }] } }))
    const agent = ctx.agentLoop.create(SessionId('a-pmode4'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'run ls' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    await waitFor(() => existsSync(payloadFile))

    const payload = JSON.parse(readFileSync(payloadFile, 'utf8'))
    expect(payload.permission_mode).toBe('default')
  }, 20_000)

  it('permission_mode resolves against an agentless direct run when the sandbox seam is mounted', async () => {
    const dir = configDir()
    // A no-agent direct tool run with a sandbox policy mounted exercises the
    // `session === undefined` arm of the sandbox-mode fold in permissionModeOf.
    writeHooks(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: script(dir, 'cap.sh', '#!/usr/bin/env bash\ncat > /dev/null\nexit 0\n') }] }] })
    const ctx = await harness(dir, new MockAdapter([]), async (c) => {
      await c.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: dir })
    })
    let ran = false
    ctx.tools.register(defineContentToolFixture({ name: 'Bash', description: 'b', parameters: { command: { type: 'string' } }, async execute() { ran = true; return [{ type: 'text', text: 'ok' }] } }))
    const { CallId } = await import('@z/dsh-llm')
    const result = await ctx.tools.execute({ signal: new AbortController().signal, callId: CallId('c1'), name: 'Bash', arguments: { command: 'x' } })
    expect(result.isError).toBeFalsy()
    expect(ran).toBe(true)
  }, 10_000)

  it('turn cancellation aborts and reaps a running UserPromptSubmit hook before idle', async () => {
    const dir = configDir()
    const pidFile = join(dir, 'pid')
    const marker = join(dir, 'started')
    const slow = script(dir, 'slow-prompt.sh', `#!/usr/bin/env bash\necho $$ > "${pidFile}"\ntouch "${marker}"\nsleep 30\n`)
    writeHooks(dir, { UserPromptSubmit: [{ hooks: [{ type: 'command', command: slow }] }] })

    const adapter = new MockAdapter([textResponse('must not run')])
    const ctx = await harness(dir, adapter)
    const agent = ctx.agentLoop.create(SessionId('cancel-prompt-hook'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'cancel the hook' }], source: { kind: 'user' } }))
    await waitFor(() => existsSync(marker))
    const pid = Number(readFileSync(pidFile, 'utf8').trim())

    const idle = agent.whenIdle()
    agent.cancel({ kind: 'user' })
    await idle

    expect(() => process.kill(pid, 0)).toThrow()
    expect(adapter.requests).toHaveLength(0)
    expect(events(agent).filter(event => event.type === 'turn/start' || event.type === 'hook/invoked'
      || event.type === 'hook/result' || event.type === 'turn/end').map(event => event.type))
      .toEqual(['turn/start', 'hook/invoked', 'hook/result', 'turn/end'])
  })

  it('only the five bridge-supported Codex events are honored — a SubagentStop entry is ignored', async () => {
    const dir = configDir()
    const s = script(dir, 'x.sh', '#!/usr/bin/env bash\nexit 2\n')
    writeHooks(dir, { SubagentStop: [{ hooks: [{ type: 'command', command: s }] }] })

    const adapter = new MockAdapter([textResponse('fine')])
    const ctx = await harness(dir, adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(adapter.requests).toHaveLength(1)
  })

  it('a missing config registers no hooks and does not crash', async () => {
    const dir = configDir() // no hooks.json written
    const adapter = new MockAdapter([textResponse('ok')])
    const ctx = await harness(dir, adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(adapter.requests).toHaveLength(1)
  })

  it('an invalid regex matcher is reported and registers no hooks', async () => {
    const dir = configDir()
    writeHooks(dir, {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'exit 2' }] }],
      PreToolUse: [{ matcher: '[', hooks: [{ type: 'command', command: 'exit 2' }] }],
    })
    const adapter = new MockAdapter([textResponse('ok')])
    const warn = vi.fn()
    const ctx = await harness(dir, adapter, (ctx) => { ctx.logger.warn = warn as never })
    const agent = ctx.agentLoop.create(SessionId('invalid-codex-matcher'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(adapter.requests).toHaveLength(1)
    expect(events(agent).some(event => event.type === 'hook/invoked')).toBe(false)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(
      'invalid codex regex matcher "[" on event "PreToolUse"',
    ))
  })

  it('disposing the bridge fiber removes its listeners (HMR safety)', async () => {
    const dir = configDir()
    // A leaked listener would let this blocking hook veto the prompt and log an invocation; a
    // no-op hook would pass even when leaked.
    const deny = script(dir, 'deny.sh', '#!/usr/bin/env bash\nexit 2\n')
    writeHooks(dir, { UserPromptSubmit: [{ hooks: [{ type: 'command', command: deny }] }] })
    const adapter = new MockAdapter([textResponse('ok')])
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(LocalBashExecutor, { timeoutMs: 10_000 })
    const fiber = await ctx.plugin(HooksCodex, { configPath: join(dir, 'hooks.json'), model: 'm' })
    await fiber.dispose()
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(adapter.requests).toHaveLength(1) // not blocked → the listener is gone
    expect(events(agent).some(e => e.type === 'hook/invoked')).toBe(false) // no hook ran
  })

  it('disposing the bridge aborts a still-running SessionStart hook and drains to quiescence', async () => {
    const dir = configDir()
    const pidFile = join(dir, 'pid')
    const marker = join(dir, 'started')
    // Record the PID and marker before sleeping past the suite timeout. Disposal must abort the
    // tracked process through `runPoint`, not await its natural exit.
    const slow = script(dir, 'slow.sh', `#!/usr/bin/env bash\necho $$ > "${pidFile}"\ntouch "${marker}"\nsleep 30\n`)
    writeHooks(dir, { SessionStart: [{ hooks: [{ type: 'command', command: slow }] }] })
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(LocalBashExecutor, { timeoutMs: 10_000 })
    const fiber = await ctx.plugin(HooksCodex, { configPath: join(dir, 'hooks.json'), model: 'm' })
    ctx.llm.registerAdapter(['mock'], new MockAdapter([]))
    const warn = vi.fn()
    ctx.logger.warn = warn as never
    ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' }) // fires agent/session-start
    await waitFor(() => existsSync(marker))
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    await fiber.dispose()
    // Disposal reaches quiescence only after the aborted run settles and the process is reaped, so
    // `kill(pid, 0)` must report ESRCH. Untracked fire-and-forget work would remain.
    expect(() => process.kill(pid, 0)).toThrow()
    // runHook resolves an aborted run as a non-blocking error, so draining must
    // not log a rejected continuation.
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('SessionStart hook failed'))
  })

  it('has the namespace-plugin export shape (no stray default) so the Loader keeps name/inject/apply', () => {
    expect('default' in HooksCodex).toBe(false)
    expect(HooksCodex.name).toBe('hooks-codex')
    expect(HooksCodex.inject).toEqual(['shell'])
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(HooksCodex) as Record<string, unknown>
    expect(unwrapped).toBe(HooksCodex)
    expect(unwrapped.name).toBe('hooks-codex')
    expect(unwrapped.inject).toEqual(['shell'])
    expect(typeof unwrapped.apply).toBe('function')
  })

  it('a PermissionRequest hook allowing pre-approves the question (allowed-once, no delegation)', async () => {
    const dir = configDir()
    writeHooks(dir, { PermissionRequest: [{ matcher: 'Bash', hooks: [{ type: 'command', command: script(dir, 'allow.sh', '#!/usr/bin/env bash\necho \'{"hookSpecificOutput":{"hookEventName":"PermissionRequest","permissionDecision":"allow"}}\'\n') }] }] })
    const adapter = new MockAdapter([])
    const ctx = await harness(dir, adapter)
    const agent = ctx.agentLoop.create(SessionId('a-perm-allow'), { provider: 'mock', model: 'mock' })
    agent.session.append('turn/start', { turn: 1 })
    const outcome = await ctx.waterfall('approval/request', { agent, toolName: 'Bash', reason: 'needs shell access' }, () => Promise.resolve<import('@z/dsh-user-approval').ApprovalOutcome>('unavailable'))
    expect(outcome).toBe('allowed-once')
    expect(events(agent).some(e => e.type === 'hook/invoked' && e.data.point === 'PermissionRequest')).toBe(true)
  }, 10_000)

  it('a PermissionRequest hook denying rejects the question (rejected)', async () => {
    const dir = configDir()
    writeHooks(dir, { PermissionRequest: [{ matcher: 'Bash', hooks: [{ type: 'command', command: script(dir, 'deny.sh', '#!/usr/bin/env bash\necho "no" >&2\nexit 2\n') }] }] })
    const adapter = new MockAdapter([])
    const ctx = await harness(dir, adapter)
    const agent = ctx.agentLoop.create(SessionId('a-perm-deny'), { provider: 'mock', model: 'mock' })
    agent.session.append('turn/start', { turn: 1 })
    const outcome = await ctx.waterfall('approval/request', { agent, toolName: 'Bash' }, () => Promise.resolve<import('@z/dsh-user-approval').ApprovalOutcome>('unavailable'))
    expect(outcome).toBe('rejected')
  }, 10_000)

  it('a PermissionRequest hook without a decision delegates to the next answerer (no pre-approval)', async () => {
    const dir = configDir()
    writeHooks(dir, { PermissionRequest: [{ matcher: 'Bash', hooks: [{ type: 'command', command: script(dir, 'clean.sh', '#!/usr/bin/env bash\nexit 0\n') }] }] })
    const adapter = new MockAdapter([])
    const ctx = await harness(dir, adapter)
    const agent = ctx.agentLoop.create(SessionId('a-perm-clean'), { provider: 'mock', model: 'mock' })
    agent.session.append('turn/start', { turn: 1 })
    // The prepend answerer delegates (next) when the hook is silent, so the
    // downstream fallback resolves — the human/UI answerer still gets to decide.
    const outcome = await ctx.waterfall('approval/request', { agent, toolName: 'Bash' }, () => Promise.resolve<import('@z/dsh-user-approval').ApprovalOutcome>('unavailable'))
    expect(outcome).toBe('unavailable')
  }, 10_000)

  it('a non-matching PermissionRequest matcher does not run the hook and delegates', async () => {
    const dir = configDir()
    writeHooks(dir, { PermissionRequest: [{ matcher: '^Edit$', hooks: [{ type: 'command', command: script(dir, 'deny.sh', '#!/usr/bin/env bash\nexit 2\n') }] }] })
    const adapter = new MockAdapter([])
    const ctx = await harness(dir, adapter)
    const agent = ctx.agentLoop.create(SessionId('a-perm-nomatch'), { provider: 'mock', model: 'mock' })
    agent.session.append('turn/start', { turn: 1 })
    const outcome = await ctx.waterfall('approval/request', { agent, toolName: 'Bash' }, () => Promise.resolve<import('@z/dsh-user-approval').ApprovalOutcome>('unavailable'))
    expect(outcome).toBe('unavailable')
    expect(events(agent).some(e => e.type === 'hook/invoked')).toBe(false)
  }, 10_000)

  it('SubagentStart and SubagentStop hooks run on the subagent lifecycle events', async () => {
    const dir = configDir()
    const startMarker = join(dir, 'started')
    const stopMarker = join(dir, 'stopped')
    writeHooks(dir, {
      SubagentStart: [{ matcher: 'general-purpose', hooks: [{ type: 'command', command: script(dir, 's.sh', `#!/usr/bin/env bash\ntouch "${startMarker}"\n`) }] }],
      SubagentStop: [{ matcher: 'general-purpose', hooks: [{ type: 'command', command: script(dir, 't.sh', `#!/usr/bin/env bash\ntouch "${stopMarker}"\n`) }] }],
    })
    const adapter = new MockAdapter([])
    const ctx = await harness(dir, adapter)
    // Drive the observe-only lifecycle events directly (no real child needed —
    // the bridge just listens). No child agent is registered, so the start
    // hook's child lookup yields undefined and simply runs the hook.
    ctx.emit(subagentCarrier(ctx), 'subagent/start', { runId: SubagentRunId('run-1'), provider: 'inproc', id: SessionId('child-1'), local: false })
    ctx.emit(subagentCarrier(ctx), 'subagent/end', { runId: SubagentRunId('run-1'), provider: 'inproc', id: SessionId('child-1'), local: false, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: 'done' }] })

    await waitFor(() => existsSync(startMarker) && existsSync(stopMarker))
    expect(existsSync(startMarker)).toBe(true)
    expect(existsSync(stopMarker)).toBe(true)
  }, 10_000)

  it('a SubagentStart hook injects additionalContext into a live child agent', async () => {
    const dir = configDir()
    writeHooks(dir, { SubagentStart: [{ hooks: [{ type: 'command', command: script(dir, 's.sh', '#!/usr/bin/env bash\necho \'{"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"child-guidance"}}\'\n') }] }] })
    const adapter = new MockAdapter([])
    const ctx = await harness(dir, adapter)
    const injected: string[] = []
    const child = {
      id: SessionId('child-x'),
      inject: (message: { content: Array<{ type: string; text: string }> }) => {
        for (const b of message.content) if (b.type === 'text') injected.push(b.text)
      },
      session: { id: SessionId('child-x'), header: { id: 'child-x' } },
    } as unknown as Parameters<typeof ctx.agents.register>[0]
    ctx.agents.register(child)
    ctx.emit(subagentCarrier(ctx), 'subagent/start', { runId: SubagentRunId('run-x'), provider: 'inproc', id: SessionId('child-x'), local: true })
    await waitFor(() => injected.includes('child-guidance'))
    expect(injected).toContain('child-guidance')
  }, 10_000)

  it('contains a throwing SubagentStart hook continuation (logged, not fatal)', async () => {
    const dir = configDir()
    // A hook whose context is to be injected; the child's inject throws, so the
    // .then continuation rejects and the .catch logs instead of crashing.
    writeHooks(dir, { SubagentStart: [{ hooks: [{ type: 'command', command: script(dir, 's.sh', '#!/usr/bin/env bash\necho \'{"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"boom"}}\'\n') }] }] })
    const adapter = new MockAdapter([])
    const ctx = await harness(dir, adapter)
    const warn = vi.fn(); ctx.logger.warn = warn as never
    const child = {
      id: SessionId('child-y'),
      inject: () => { throw new Error('inject boom') },
      session: { id: SessionId('child-y'), header: { id: 'child-y' } },
    } as unknown as Parameters<typeof ctx.agents.register>[0]
    ctx.agents.register(child)
    ctx.emit(subagentCarrier(ctx), 'subagent/start', { runId: SubagentRunId('run-y'), provider: 'inproc', id: SessionId('child-y'), local: true })
    await waitFor(() => warn.mock.calls.some(c => String(c[0]).includes('SubagentStart hook failed')))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SubagentStart hook failed'))
  }, 10_000)

  it('SubagentStop resolves the child from the start run so session_id/cwd match', async () => {
    const dir = configDir()
    const stopMarker = join(dir, 'stopped')
    writeHooks(dir, { SubagentStop: [{ hooks: [{ type: 'command', command: script(dir, 't.sh', `#!/usr/bin/env bash\ntouch "${stopMarker}"\n`) }] }] })
    const adapter = new MockAdapter([])
    const ctx = await harness(dir, adapter)
    // Register a child and emit start so the stop handler resolves it from the
    // runId → child map (the `child ? { agent: child }` arm with a present child).
    const child = {
      id: SessionId('child-z'),
      inject: () => {},
      session: { id: SessionId('child-z'), header: { id: 'child-z' } },
    } as unknown as Parameters<typeof ctx.agents.register>[0]
    ctx.agents.register(child)
    ctx.emit(subagentCarrier(ctx), 'subagent/start', { runId: SubagentRunId('run-z'), provider: 'inproc', id: SessionId('child-z'), local: true })
    ctx.emit(subagentCarrier(ctx), 'subagent/end', { runId: SubagentRunId('run-z'), provider: 'inproc', id: SessionId('child-z'), local: true, stopReason: 'completed' })
    await waitFor(() => existsSync(stopMarker))
    expect(existsSync(stopMarker)).toBe(true)
  }, 10_000)
})
