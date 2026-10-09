import { describe, expect, it } from 'vitest'
import { Context } from '@z/cordis'
import { createUserMessage, CallId  } from '@z/dsh-llm'
import { SessionId, type SessionEvent } from '@z/dsh-session'
import { defineContentToolFixture } from '@z/dsh-tools'
import type { Agent } from '@z/dsh-agent'
import AgentLoop from '@z/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@z/dsh-agent-loop-testkit'
import * as RepeatToolGuard from '@z/dsh-repeat-tool-reminder'
import type { Config } from '@z/dsh-repeat-tool-reminder'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

const testToolSignal = new AbortController().signal

/**
 * Behavior suite for the repeat-tool-call guard: chain semantics (identical /
 * different-tracked / untracked-transparent / per-agent / resets), threshold
 * escalation incl. the `thresholds[0]` gentle-text rule, canonicalization,
 * fold-onto-downstream-decision, and fail-loud config validation — all driven
 * through a real agent loop against a scripted mock adapter (no network).
 */

/** Boot the core spine + the guard; the caller registers adapters and extra listeners. */
async function harness(config: Config = {}): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(RepeatToolGuard, config)
  ctx.tools.register(defineContentToolFixture({ name: 'probe', description: 'p', parameters: {}, async execute() { return [{ type: 'text', text: 'ok' }] } }))
  ctx.tools.register(defineContentToolFixture({ name: 'other', description: 'o', parameters: {}, async execute() { return [{ type: 'text', text: 'ok' }] } }))
  return ctx
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => { const d = ctx.on('agent/status', ({ agent: s, status: st }) => { if (s === agent && st === 'idle') { d(); resolve() } }) })
}

/** Every injected-context user message in the agent's log, flattened to joined text + source for terse assertions. */
function reminders(agent: Agent): { text: string; source: unknown }[] {
  return [...agent.session.events]
    .filter((e): e is SessionEvent<'user/message'> => e.type === 'user/message' && e.data.source.kind !== 'user')
    .map(e => ({
      text: e.data.content.map(block => block.type === 'text' ? block.text : '').join('|'),
      source: e.data.source,
    }))
}

// The reminder is a `notice`-form context; its summary names the repeated
// call so a reader sees it without expanding the row.
const guardSource = (tool: string, count: number) => ({
  kind: 'plugin',
  plugin: 'repeat-tool-reminder',
  form: 'notice',
  summary: `${tool} × ${count}`,
})

describe('threshold escalation', () => {
  it('reminds gently at the first default threshold (3) and in detail at the second (5)', async () => {
    const ctx = await harness()
    const adapter = new MockAdapter([
      ...Array.from({ length: 5 }, (_, i) => toolCallResponse(`c${i}`, 'probe', { q: 'same' })),
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const found = reminders(agent)
    expect(found).toHaveLength(2)
    expect(found[0]!.text).toContain('repeating the exact same tool call')
    expect(found[0]!.source).toEqual(guardSource('probe', 3))
    expect(found[1]!.text).toContain('consecutive_calls: 5')
    expect(found[1]!.text).toContain('- tool: probe')
    expect(found[1]!.text).toContain('{"q":"same"}')
    expect(found[1]!.source).toEqual(guardSource('probe', 5))
  })

  it('keys the gentle text to thresholds[0], not the literal 3', async () => {
    const ctx = await harness({ thresholds: [4, 2] }) // unsorted on purpose: normalized ascending
    const adapter = new MockAdapter([
      ...Array.from({ length: 4 }, (_, i) => toolCallResponse(`c${i}`, 'probe', {})),
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const found = reminders(agent)
    expect(found).toHaveLength(2)
    expect(found[0]!.text).toContain('repeating the exact same tool call') // gentle at 2
    expect(found[1]!.text).toContain('consecutive_calls: 4') // detailed at 4
  })

})

describe('multi-call search-cycle breaker', () => {
  it('limits repeated varied searches in one TaskWeaver read-only scope and allows one recovery retry', async () => {
    const ctx = await harness()
    const executed: string[] = []
    ctx.tools.register(defineContentToolFixture({
      name: 'grep', description: 'search source', parameters: { path: { type: 'string' }, pattern: { type: 'string' } },
      async execute(args) { executed.push(`grep:${args.pattern}`); return [{ type: 'text', text: 'match' }] },
    }))
    ctx.tools.register(defineContentToolFixture({
      name: 'read', description: 'read source', parameters: { file_path: { type: 'string' } },
      async execute(args) { executed.push(`read:${args.file_path}`); return [{ type: 'text', text: 'source excerpt' }] },
    }))
    const searches = Array.from({ length: 12 }, (_, index) => toolCallResponse(
      `scope-search-${index + 1}`, 'grep', { path: 'src/large.ts', pattern: `unique-symbol-${index + 1}` },
    ))
    const adapter = new MockAdapter([
      ...searches.slice(0, 5),
      toolCallResponse('read-between-searches', 'read', { file_path: 'src/large.ts' }),
      ...searches.slice(5),
      textResponse('The source has been inspected; I am summarizing evidence and any remaining gap.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('readonly-scope-search-loop'), { provider: 'mock', model: 'mock' })
    const marker = '<taskweaver-readonly-scope-v1>{"paths":["src/large.ts"]}</taskweaver-readonly-scope-v1>'
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: `Inspect this source.\n${marker}` }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)

    expect(executed).toHaveLength(11) // ten searches plus the valid read; denied retries never execute
    expect(executed[5]).toBe('read:src/large.ts')
    const results = [...agent.session.events].filter((event): event is SessionEvent<'tool/result'> => event.type === 'tool/result')
    expect(results).toHaveLength(13) // ten searches, one read, first denial, one blocked retry
    expect(results[11]!.data.message.content[0]!.isError).toBe(true)
    expect(results[11]!.data.message.content[0]!.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('denied after 10 search attempts in this same scope'),
    })
    expect(results[12]!.data.message.content[0]!.isError).toBe(true)
    expect(results[12]!.data.message.content[0]!.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('remains blocked after its one recovery response'),
    })
    expect(reminders(agent).some(({ text }) => text.includes('6 filesystem searches in the assigned read-only scope src/large.ts'))).toBe(true)
    expect(adapter.requests).toHaveLength(13)
    expect([...agent.session.events].filter((event) => event.type === 'turn/end').at(-1)?.data.reason).toEqual({ kind: 'blocked' })
  })

  it('bounds identical reads of a TaskWeaver-scoped file while allowing new ranges and one retry', async () => {
    const ctx = await harness()
    const executed: string[] = []
    ctx.tools.register(defineContentToolFixture({
      name: 'read', description: 'read source range',
      parameters: { file_path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } },
      async execute(args) {
        executed.push(`read:${args.file_path}:${args.offset ?? 'all'}`)
        return [{ type: 'text', text: 'same source excerpt' }]
      },
    }))
    const adapter = new MockAdapter([
      ...Array.from({ length: 5 }, (_, index) => toolCallResponse(
        `identical-read-${index + 1}`, 'read', { file_path: 'src/large.ts' },
      )),
      ...Array.from({ length: 4 }, (_, index) => toolCallResponse(
        `distinct-range-${index + 1}`, 'read', { file_path: 'src/large.ts', offset: index * 100 + 1, limit: 100 },
      )),
      textResponse('The distinct ranges were inspected and summarized.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('readonly-identical-read-loop'), { provider: 'mock', model: 'mock' })
    const marker = '<taskweaver-readonly-scope-v1>{"paths":["src/large.ts"]}</taskweaver-readonly-scope-v1>'
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: `Inspect this source.\n${marker}` }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)

    expect(executed).toEqual([
      'read:src/large.ts:all', 'read:src/large.ts:all', 'read:src/large.ts:all',
    ], 'identical full-file retries are blocked while distinct ranges remain available')
    const results = [...agent.session.events].filter((event): event is SessionEvent<'tool/result'> => event.type === 'tool/result')
    expect(results).toHaveLength(5)
    expect(results[3]!.data.message.content[0]!.isError).toBe(true)
    expect(results[3]!.data.message.content[0]!.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('same source three times'),
    })
    expect(results[4]!.data.message.content[0]!.isError).toBe(true)
    expect(results[4]!.data.message.content[0]!.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('one recovery response'),
    })
    expect(adapter.requests).toHaveLength(5)
    expect([...agent.session.events].filter((event) => event.type === 'turn/end').at(-1)?.data.reason).toEqual({ kind: 'blocked' })

    agent.followup(createUserMessage({
      content: [{ type: 'text', text: `Read distinct, non-overlapping ranges in this source.\n${marker}` }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)
    expect(executed.slice(3)).toEqual([
      'read:src/large.ts:1', 'read:src/large.ts:101', 'read:src/large.ts:201', 'read:src/large.ts:301',
    ])
    expect([...agent.session.events].filter((event) => event.type === 'turn/end').at(-1)?.data.reason).toEqual({ kind: 'completed' })
  })

  it('bounds varied reads of one TaskWeaver-scoped file but lets recovery continue on another authorized file', async () => {
    const ctx = await harness()
    const executed: string[] = []
    ctx.tools.register(defineContentToolFixture({
      name: 'read', description: 'read source range',
      parameters: { file_path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } },
      async execute(args) {
        executed.push(`read:${args.file_path}:${args.offset ?? 'all'}`)
        return [{ type: 'text', text: 'source excerpt' }]
      },
    }))
    const marker = '<taskweaver-readonly-scope-v1>{"paths":["src/large.ts","src/other.ts"]}</taskweaver-readonly-scope-v1>'
    const adapter = new MockAdapter([
      ...Array.from({ length: 9 }, (_, index) => toolCallResponse(
        `varied-file-read-${index + 1}`, 'read', { file_path: 'src/large.ts', offset: index * 100 + 1, limit: 100 },
      )), // the ninth same-file read is denied before execution
      toolCallResponse('recovery-other-file', 'read', { file_path: 'src/other.ts', offset: 1, limit: 50 }),
      textResponse('The file-local read guard fired; I used the other authorized source and finished the task.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('readonly-varied-file-read-limit'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: `Inspect both authorized sources.\n${marker}` }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)

    expect(executed).toEqual([
      ...Array.from({ length: 8 }, (_, index) => `read:src/large.ts:${index * 100 + 1}`),
      'read:src/other.ts:1',
    ])
    const results = [...agent.session.events].filter((event): event is SessionEvent<'tool/result'> => event.type === 'tool/result')
    expect(results).toHaveLength(10)
    expect(results[8]!.data.message.content[0]!.isError).toBe(true)
    expect(results[8]!.data.message.content[0]!.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('denied after 8 in-scope reads of this same file'),
    })
    expect(adapter.requests).toHaveLength(11)
    expect([...agent.session.events].filter((event) => event.type === 'turn/end').at(-1)?.data.reason).toEqual({ kind: 'completed' })
  })

  it('stops before another model request if the one recovery response retries a file-local read latch', async () => {
    const ctx = await harness()
    const executed: number[] = []
    ctx.tools.register(defineContentToolFixture({
      name: 'read', description: 'read source range',
      parameters: { file_path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } },
      async execute(args) {
        executed.push(args.offset)
        return [{ type: 'text', text: 'source excerpt' }]
      },
    }))
    const marker = '<taskweaver-readonly-scope-v1>{"paths":["src/large.ts"]}</taskweaver-readonly-scope-v1>'
    const adapter = new MockAdapter([
      ...Array.from({ length: 8 }, (_, index) => toolCallResponse(
        `file-latch-read-${index + 1}`, 'read', { file_path: 'src/large.ts', offset: index * 100 + 1, limit: 100 },
      )),
      toolCallResponse('file-latch-first-denial', 'read', { file_path: 'src/large.ts', offset: 801, limit: 100 }),
      toolCallResponse('file-latch-retry', 'read', { file_path: 'src/large.ts', offset: 901, limit: 100 }),
      textResponse('This response must not be requested after the blocked retry.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('readonly-varied-file-read-latch'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: `Inspect this source.\n${marker}` }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)

    expect(executed).toEqual([1, 101, 201, 301, 401, 501, 601, 701])
    const results = [...agent.session.events].filter((event): event is SessionEvent<'tool/result'> => event.type === 'tool/result')
    expect(results).toHaveLength(10)
    expect(results[9]!.data.message.content[0]!.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('remain blocked after the one recovery response'),
    })
    expect(adapter.requests).toHaveLength(10)
    expect([...agent.session.events].filter((event) => event.type === 'turn/end').at(-1)?.data.reason).toEqual({ kind: 'blocked' })
  })

  it('keeps distinct searches at the same scope available', async () => {
    const ctx = await harness()
    const executed: string[] = []
    ctx.tools.register(defineContentToolFixture({
      name: 'glob', description: 'search paths', parameters: { path: { type: 'string' }, pattern: { type: 'string' } },
      async execute(args) { executed.push(`glob:${args.path}`); return [{ type: 'text', text: 'paths' }] },
    }))
    ctx.tools.register(defineContentToolFixture({
      name: 'grep', description: 'search contents', parameters: { path: { type: 'string' }, pattern: { type: 'string' } },
      async execute(args) { executed.push(`grep:${args.path}`); return [{ type: 'text', text: 'matches' }] },
    }))
    const adapter = new MockAdapter([
      toolCallResponse('s1', 'glob', { path: '.', pattern: 'src/**/*.ts' }),
      toolCallResponse('s2', 'grep', { path: '.', pattern: 'sessions\\.prompt' }),
      toolCallResponse('s3', 'glob', { path: '.', pattern: 'electron/**/*.mjs' }),
      toolCallResponse('s4', 'grep', { path: '.', pattern: 'executeSingleAgent' }),
      toolCallResponse('s5', 'glob', { path: '.', pattern: 'package.json' }),
      textResponse('Different searches at the same scope are useful, not a cycle.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('search-cycle'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Inspect the request path' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(executed).toEqual(['glob:.', 'grep:.', 'glob:.', 'grep:.', 'glob:.'])
    const results = [...agent.session.events].filter((e): e is SessionEvent<'tool/result'> => e.type === 'tool/result')
    expect(results).toHaveLength(5)
    expect(results.every((result) => !result.data.message.content[0]!.isError)).toBe(true)
    expect(adapter.requests).toHaveLength(6)
    expect([...agent.session.events].filter((event) => event.type === 'turn/end').at(-1)?.data.reason).toEqual({ kind: 'completed' })
  })

  it('breaks an exact repeated search cycle with one bounded retry, not a task-wide budget', async () => {
    const ctx = await harness()
    const executed: string[] = []
    ctx.tools.register(defineContentToolFixture({
      name: 'glob', description: 'search paths', parameters: { path: { type: 'string' }, pattern: { type: 'string' } },
      async execute(args) { executed.push(`glob:${args.path}:${args.pattern}`); return [{ type: 'text', text: 'paths' }] },
    }))
    ctx.tools.register(defineContentToolFixture({
      name: 'grep', description: 'search contents', parameters: { path: { type: 'string' }, pattern: { type: 'string' } },
      async execute(args) { executed.push(`grep:${args.path}:${args.pattern}`); return [{ type: 'text', text: 'matches' }] },
    }))
    ctx.tools.register(defineContentToolFixture({
      name: 'read', description: 'read a file', parameters: { file_path: { type: 'string' } },
      async execute(args) { executed.push(`read:${args.file_path}`); return [{ type: 'text', text: 'excerpt' }] },
    }))
    const adapter = new MockAdapter([
      toolCallResponse('s1', 'glob', { path: '.', pattern: 'src/**/*.ts' }),
      toolCallResponse('s2', 'grep', { path: '.', pattern: 'sessions\\.prompt' }),
      toolCallResponse('s3', 'glob', { path: '.', pattern: 'src/**/*.ts' }),
      toolCallResponse('s4', 'grep', { path: '.', pattern: 'sessions\\.prompt' }),
      toolCallResponse('s5', 'glob', { path: '.', pattern: 'src/**/*.ts' }), // exact cycle repeats; denied before execution
      toolCallResponse('s6', 'grep', { path: 'src', pattern: 'main' }), // the one retry can switch to a narrower scope
      toolCallResponse('s7', 'read', { file_path: 'src/main.tsx' }),
      toolCallResponse('s8', 'glob', { path: '.', pattern: 'new-root-query' }), // denied, then turn stops before another request
      toolCallResponse('s9', 'glob', { path: '.', pattern: 'fresh-after-user-turn' }),
      textResponse('A new user request can search this path again.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('search-cycle-exact'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Inspect the request path' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(executed).toEqual([
      'glob:.:src/**/*.ts', 'grep:.:sessions\\.prompt',
      'glob:.:src/**/*.ts', 'grep:.:sessions\\.prompt',
      'grep:src:main', 'read:src/main.tsx',
    ])
    const results = [...agent.session.events].filter((e): e is SessionEvent<'tool/result'> => e.type === 'tool/result')
    expect(results).toHaveLength(8)
    expect(results[4]!.data.message.content[0]!.isError).toBe(true)
    expect(results[4]!.data.message.content[0]!.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('same 2-call glob/grep sequence with identical search arguments at scope . has already repeated'),
    })
    expect(results[7]!.data.message.content[0]!.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('one allowed model retry after the cycle warning'),
    })
    expect(adapter.requests).toHaveLength(8)
    const firstTurnEnd = [...agent.session.events].filter((event) => event.type === 'turn/end')[0]
    expect(firstTurnEnd?.data.reason).toEqual({ kind: 'blocked' })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Start a new request and search the root again.' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(adapter.requests).toHaveLength(10)
    expect(executed.at(-1)).toBe('glob:.:fresh-after-user-turn')
    expect([...agent.session.events].filter((event) => event.type === 'turn/end').at(-1)?.data.reason).toEqual({ kind: 'completed' })
  })

  it('lets the agent synthesize after a cycle warning instead of spending the recovery step on another scan', async () => {
    const ctx = await harness()
    const executed: string[] = []
    ctx.tools.register(defineContentToolFixture({
      name: 'glob', description: 'search paths', parameters: { path: { type: 'string' }, pattern: { type: 'string' } },
      async execute(args) { executed.push(`glob:${args.pattern}`); return [{ type: 'text', text: 'found source files' }] },
    }))
    ctx.tools.register(defineContentToolFixture({
      name: 'grep', description: 'search contents', parameters: { path: { type: 'string' }, pattern: { type: 'string' } },
      async execute(args) { executed.push(`grep:${args.pattern}`); return [{ type: 'text', text: 'found request handler' }] },
    }))
    const adapter = new MockAdapter([
      toolCallResponse('s1', 'glob', { path: '.', pattern: 'src/**/*.ts' }),
      toolCallResponse('s2', 'grep', { path: '.', pattern: 'sessions\\.prompt' }),
      toolCallResponse('s3', 'glob', { path: '.', pattern: 'src/**/*.ts' }),
      toolCallResponse('s4', 'grep', { path: '.', pattern: 'sessions\\.prompt' }),
      toolCallResponse('s5', 'glob', { path: '.', pattern: 'src/**/*.ts' }), // denied; model should synthesize from gathered evidence
      textResponse('The request handler is in the source tree; I found its entry point and stopped the repeated scan.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('search-cycle-synthesize'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Summarize the request path' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(executed).toEqual([
      'glob:src/**/*.ts', 'grep:sessions\\.prompt',
      'glob:src/**/*.ts', 'grep:sessions\\.prompt',
    ])
    const results = [...agent.session.events].filter((event): event is SessionEvent<'tool/result'> => event.type === 'tool/result')
    expect(results).toHaveLength(5)
    expect(results[4]!.data.message.content[0]!.isError).toBe(true)
    expect(results[4]!.data.message.content[0]!.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('answer now, clearly stating any gaps'),
    })
    expect(adapter.requests).toHaveLength(6)
    expect([...agent.session.events].filter((event) => event.type === 'turn/end').at(-1)?.data.reason).toEqual({ kind: 'completed' })
  })
})

describe('TaskWeaver read-only path scopes', () => {
  it('allows assigned paths, denies out-of-scope reads and broad searches before execution, and does not leak into the next turn', async () => {
    const ctx = await harness()
    const executed: string[] = []
    for (const [name, parameters] of [
      ['read', { file_path: { type: 'string' } }],
      ['glob', { pattern: { type: 'string' }, path: { type: 'string' } }],
      ['grep', { pattern: { type: 'string' }, path: { type: 'string' } }],
    ] as const) {
      ctx.tools.register(defineContentToolFixture({
        name,
        description: name,
        parameters,
        async execute(args) {
          executed.push(`${name}:${JSON.stringify(args)}`)
          return [{ type: 'text', text: 'ok' }]
        },
      }))
    }
    const adapter = new MockAdapter([
      toolCallResponse('inside', 'read', { file_path: 'src/main.ts' }),
      toolCallResponse('outside', 'read', { file_path: 'src/../secrets.txt' }),
      toolCallResponse('broad', 'glob', { pattern: '**/*' }),
      toolCallResponse('scoped-literal-glob', 'glob', { pattern: 'src/main.ts' }),
      toolCallResponse('scoped-search', 'grep', { pattern: 'TODO', path: 'src/main.ts' }),
      textResponse('The assigned source file was inspected; out-of-scope paths were not read.'),
      toolCallResponse('unscoped-next-turn', 'read', { file_path: 'outside.txt' }),
      textResponse('A new unscoped turn can use the ordinary workspace tools.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('readonly-path-scope'), { provider: 'mock', model: 'mock' })
    const marker = '<taskweaver-readonly-scope-v1>{"paths":["src/main.ts"]}</taskweaver-readonly-scope-v1>'
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: `Inspect the assigned source only.\n${marker}` }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)
    expect(executed).toEqual([
      'read:{"file_path":"src/main.ts"}',
      'glob:{"pattern":"src/main.ts"}',
      'grep:{"pattern":"TODO","path":"src/main.ts"}',
    ])

    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Read outside.txt.' }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)
    expect(executed.at(-1)).toBe('read:{"file_path":"outside.txt"}')
  })

  it('fails closed for a malformed scope marker', async () => {
    const ctx = await harness()
    const executed: string[] = []
    ctx.tools.register(defineContentToolFixture({
      name: 'read',
      description: 'read a file',
      parameters: { file_path: { type: 'string' } },
      async execute(args) { executed.push(String(args.file_path)); return [{ type: 'text', text: 'ok' }] },
    }))
    const adapter = new MockAdapter([
      toolCallResponse('malformed-scope-read', 'read', { file_path: 'src/main.ts' }),
      textResponse('The scope marker was invalid, so I reported the limitation.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('readonly-path-scope-invalid'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: '<taskweaver-readonly-scope-v1>not-json</taskweaver-readonly-scope-v1>' }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)
    expect(executed).toEqual([])
  })
})

describe('chain semantics', () => {
  it('nudges scoped read-only agents to read after repeated same-scope searches and resets after a read', async () => {
    const ctx = await harness()
    const executed: string[] = []
    ctx.tools.register(defineContentToolFixture({
      name: 'grep',
      description: 'search source',
      parameters: { path: { type: 'string' }, pattern: { type: 'string' } },
      async execute(args) { executed.push(`grep:${args.pattern}`); return [{ type: 'text', text: 'match' }] },
    }))
    ctx.tools.register(defineContentToolFixture({
      name: 'read',
      description: 'read source',
      parameters: { file_path: { type: 'string' } },
      async execute(args) { executed.push(`read:${args.file_path}`); return [{ type: 'text', text: 'source with line numbers' }] },
    }))
    const adapter = new MockAdapter([
      toolCallResponse('g1', 'grep', { path: 'src/large.ts', pattern: 'first-symbol' }),
      toolCallResponse('g2', 'grep', { path: 'src/large.ts', pattern: 'second-symbol' }),
      toolCallResponse('r1', 'read', { file_path: 'src/large.ts' }),
      toolCallResponse('g3', 'grep', { path: 'src/large.ts', pattern: 'third-symbol' }),
      toolCallResponse('g4', 'grep', { path: 'src/large.ts', pattern: 'fourth-symbol' }),
      textResponse('The source was read and the evidence gap is stated.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('search-focus'), { provider: 'mock', model: 'mock' })
    const marker = '<taskweaver-readonly-scope-v1>{"paths":["src/large.ts"]}</taskweaver-readonly-scope-v1>'
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: `Inspect this source.\n${marker}` }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)

    expect(executed).toEqual([
      'grep:first-symbol', 'grep:second-symbol', 'read:src/large.ts',
      'grep:third-symbol', 'grep:fourth-symbol',
    ], 'the progress nudge must not deny valid searches or impose a total call budget')
    const found = reminders(agent)
    expect(found).toHaveLength(2)
    expect(found[0]!.text).toContain('2 filesystem searches in scope src/large.ts without reading')
    expect(found[0]!.text).toContain('not a total tool-call, time, or token budget')
    expect(found[1]!.text).toContain('2 filesystem searches in scope src/large.ts without reading')
    expect(found[0]!.source).toEqual({
      kind: 'plugin', plugin: 'repeat-tool-reminder', form: 'notice', summary: 'grep src/large.ts × 2',
    })
  })

  it('reminds when consecutive reads target the same file with different ranges', async () => {
    const ctx = await harness()
    ctx.tools.register(defineContentToolFixture({
      name: 'read',
      description: 'read a file range',
      parameters: { file_path: { type: 'string' }, offset: { type: 'number' } },
      async execute() { return [{ type: 'text', text: 'excerpt' }] },
    }))
    const adapter = new MockAdapter([
      ...Array.from({ length: 11 }, (_, index) => toolCallResponse(
        `c${index + 1}`, 'read', { file_path: 'src/large.ts', offset: index * 100 + 1 },
      )),
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('read-target'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'review the file' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const found = reminders(agent)
    expect(found).toHaveLength(4)
    expect(found[0]!.text).toContain('read the same file several times')
    expect(found[1]!.text).toContain('reads_of_file: 5')
    expect(found[1]!.text).toContain('src/large.ts')
    expect(found[1]!.text).toContain('Summarize what is known now')
    expect(found[2]!.text).toContain('reads_of_file: 8')
    expect(found[3]!.text).toContain('reads_of_file: 11')
  })

  it('counts same-file reads across searches without mixing different file targets', async () => {
    const ctx = await harness()
    ctx.tools.register(defineContentToolFixture({
      name: 'read',
      description: 'read a file range',
      parameters: { file_path: { type: 'string' }, offset: { type: 'number' } },
      async execute() { return [{ type: 'text', text: 'excerpt' }] },
    }))
    ctx.tools.register(defineContentToolFixture({
      name: 'grep',
      description: 'search source',
      parameters: { pattern: { type: 'string' } },
      async execute() { return [{ type: 'text', text: 'match' }] },
    }))
    const adapter = new MockAdapter([
      toolCallResponse('r1', 'read', { file_path: 'src/large.ts', offset: 1 }),
      toolCallResponse('g1', 'grep', { pattern: 'first-symbol' }),
      toolCallResponse('r2', 'read', { file_path: 'src/other.ts', offset: 1 }),
      toolCallResponse('g2', 'grep', { pattern: 'second-symbol' }),
      toolCallResponse('r3', 'read', { file_path: 'src/large.ts', offset: 101 }),
      toolCallResponse('g3', 'grep', { pattern: 'third-symbol' }),
      toolCallResponse('r4', 'read', { file_path: 'src/other.ts', offset: 101 }),
      toolCallResponse('g4', 'grep', { pattern: 'fourth-symbol' }),
      toolCallResponse('r5', 'read', { file_path: 'src/large.ts', offset: 201 }),
      textResponse('The relevant ranges have been checked.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('read-target-interleaved'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'inspect the relevant source' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const found = reminders(agent)
    expect(found).toHaveLength(1)
    expect(found[0]!.text).toContain('read the same file several times')
    expect(found[0]!.text).toContain('src/large.ts')
    expect(found[0]!.source).toEqual({
      kind: 'plugin',
      plugin: 'repeat-tool-reminder',
      form: 'notice',
      summary: 'read src/large.ts × 3',
    })
  })

  it('caps the detailed reminder arguments at argumentsPreviewChars (detection still keys on the full string)', async () => {
    const ctx = await harness({ thresholds: [2, 3], argumentsPreviewChars: 24 })
    const bigPayload = 'x'.repeat(400)
    const adapter = new MockAdapter([
      toolCallResponse('c1', 'probe', { body: bigPayload }),
      toolCallResponse('c2', 'probe', { body: bigPayload }),
      toolCallResponse('c3', 'probe', { body: bigPayload }),
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const found = reminders(agent)
    expect(found).toHaveLength(2) // gentle at 2, detailed at 3 — full-key matching survived the cap
    const detailed = found[1]!.text
    expect(detailed).toContain('- arguments: {"body":"xxxxxxxxxxxxxx') // 24-char head
    expect(detailed).toContain('… (+387 more chars)')
    expect(detailed).not.toContain(bigPayload)
  })

  it('a different tracked call resets the chain', async () => {
    const ctx = await harness()
    const adapter = new MockAdapter([
      toolCallResponse('c1', 'probe', { q: 1 }),
      toolCallResponse('c2', 'probe', { q: 1 }),
      toolCallResponse('c3', 'other', {}), // tracked, different → reset
      toolCallResponse('c4', 'probe', { q: 1 }),
      toolCallResponse('c5', 'probe', { q: 1 }),
      toolCallResponse('c6', 'probe', { q: 1 }), // 3rd consecutive AFTER the reset
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(reminders(agent)).toHaveLength(1)
  })

  it('excluded calls are transparent: they neither count nor reset', async () => {
    const ctx = await harness({ exclude: ['other'] })
    const adapter = new MockAdapter([
      toolCallResponse('c1', 'probe', { q: 1 }),
      toolCallResponse('c2', 'other', {}), // excluded → invisible to the chain
      toolCallResponse('c3', 'probe', { q: 1 }),
      toolCallResponse('c4', 'other', {}),
      toolCallResponse('c5', 'probe', { q: 1 }), // 3rd consecutive probe
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const found = reminders(agent)
    expect(found).toHaveLength(1)
    expect(found[0]!.text).toContain('repeating the exact same tool call')
  })

  it('include patterns track only matching tools (wildcard star)', async () => {
    const ctx = await harness({ include: ['pro*'] })
    const adapter = new MockAdapter([
      toolCallResponse('c1', 'other', {}),
      toolCallResponse('c2', 'other', {}),
      toolCallResponse('c3', 'other', {}), // 3 identical, but untracked
      toolCallResponse('c4', 'probe', {}),
      toolCallResponse('c5', 'probe', {}),
      toolCallResponse('c6', 'probe', {}), // 3 identical, tracked
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const found = reminders(agent)
    expect(found).toHaveLength(1)
    expect(found[0]!.text).toContain('repeating the exact same tool call')
  })

  it('escapes regex metacharacters in patterns (a dot matches only a literal dot)', async () => {
    const ctx = await harness({ exclude: ['pr.be'] }) // would match 'probe' as a regex; must not as a wildcard
    const adapter = new MockAdapter([
      ...Array.from({ length: 3 }, (_, i) => toolCallResponse(`c${i}`, 'probe', {})),
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(reminders(agent)).toHaveLength(1) // probe was NOT excluded
  })

  it('canonicalization ignores property order, deeply', async () => {
    const ctx = await harness()
    const adapter = new MockAdapter([
      toolCallResponse('c1', 'probe', { a: 1, nested: { x: [1, 2], y: null } }),
      toolCallResponse('c2', 'probe', { nested: { y: null, x: [1, 2] }, a: 1 }),
      toolCallResponse('c3', 'probe', { a: 1, nested: { x: [1, 2], y: null } }),
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(reminders(agent)).toHaveLength(1) // all three canonicalize identically
  })

  it('keys chains per agent: one agent repeating never trips another', async () => {
    const ctx = await harness()
    ctx.llm.registerAdapter(['mock-a'], new MockAdapter([
      toolCallResponse('a1', 'probe', { q: 1 }),
      toolCallResponse('a2', 'probe', { q: 1 }),
      textResponse('done'),
    ]))
    ctx.llm.registerAdapter(['mock-b'], new MockAdapter([
      toolCallResponse('b1', 'probe', { q: 1 }),
      toolCallResponse('b2', 'probe', { q: 1 }),
      toolCallResponse('b3', 'probe', { q: 1 }),
      textResponse('done'),
    ]))
    const agentA = ctx.agentLoop.create(SessionId('a'), { provider: 'mock-a', model: 'model-a' })
    const agentB = ctx.agentLoop.create(SessionId('b'), { provider: 'mock-b', model: 'model-b' })
    agentA.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    agentB.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await Promise.all([waitForIdle(ctx, agentA), waitForIdle(ctx, agentB)])

    expect(reminders(agentA)).toHaveLength(0) // 2 repeats < 3, despite B's 3 in the same registry
    expect(reminders(agentB)).toHaveLength(1)
  })

  it('a new user prompt resets the chain', async () => {
    const ctx = await harness()
    const adapter = new MockAdapter([
      toolCallResponse('c1', 'probe', { q: 1 }),
      toolCallResponse('c2', 'probe', { q: 1 }),
      textResponse('turn one done'),
      toolCallResponse('c3', 'probe', { q: 1 }), // without the reset this would be the 3rd
      textResponse('turn two done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'again' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(reminders(agent)).toHaveLength(0)
  })

  it('drops an agent chain on disposal', async () => {
    const ctx = await harness({ thresholds: [2] })
    ctx.llm.registerAdapter(['mock'], new MockAdapter([
      toolCallResponse('c1', 'probe', { q: 1 }),
      textResponse('done'),
      toolCallResponse('c2', 'probe', { q: 1 }), // same id, fresh agent: count 1, not 2
      textResponse('done'),
    ]))
    // Loop agents are torn down by disposing the scope that created them
    // (the loop.spec pattern): a child plugin fiber owns `first`.
    let first!: Agent
    const fiber = await ctx.plugin(Object.assign((inner: Context) => {
      first = inner.agentLoop.create(SessionId('reused'), { provider: 'mock', model: 'mock' })
    }, { inject: ['agentLoop'] }))
    first.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, first)
    await fiber.dispose()
    await first.whenIdle()

    const second = ctx.agentLoop.create(SessionId('reused'), { provider: 'mock', model: 'mock' })
    second.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, second)

    expect(reminders(second)).toHaveLength(0)
  })

  it('counts denied calls: hammering a denied tool still draws the reminder', async () => {
    const ctx = await harness({ thresholds: [2] })
    ctx.on('tools/pre-execute', async () => ({ kind: 'deny' as const, reason: 'sealed' }))
    const adapter = new MockAdapter([
      toolCallResponse('c1', 'probe', { q: 1 }),
      toolCallResponse('c2', 'probe', { q: 1 }),
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(reminders(agent)).toHaveLength(1)
  })

  it('ignores direct executes with no agent (they neither crash nor advance any chain)', async () => {
    const ctx = await harness({ thresholds: [2] })
    const direct = await ctx.tools.execute({ signal: testToolSignal, callId: CallId('d1'), name: 'probe', arguments: { q: 1 } })
    expect(direct.isError).toBe(false)

    ctx.llm.registerAdapter(['mock'], new MockAdapter([
      toolCallResponse('c1', 'probe', { q: 1 }), // if the direct call had counted, this would be #2
      textResponse('done'),
    ]))
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    expect(reminders(agent)).toHaveLength(0)
  })
})

describe('fold onto the downstream decision', () => {
  it('folds the reminder onto a downstream block and keeps its feedback', async () => {
    const ctx = await harness({ thresholds: [2] })
    ctx.on('tools/post-execute', async () => ({
      kind: 'block' as const,
      feedback: [{ type: 'text' as const, text: 'nope' }],
      additionalContexts: [createUserMessage({
        content: [{ type: 'text' as const, text: 'downstream-ctx' }], source: { kind: 'plugin' as const, plugin: 'test' },
      })],
    }))
    const adapter = new MockAdapter([
      toolCallResponse('c1', 'probe', { q: 1 }),
      toolCallResponse('c2', 'probe', { q: 1 }),
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const found = reminders(agent)
    expect(found).toHaveLength(3)
    // Only the repeated call adds guard context; downstream source fields survive.
    expect(found[0]!.text).toBe('downstream-ctx')
    expect(found[0]!.source).toEqual({ kind: 'plugin', plugin: 'test' })
    expect(found[1]!.text).toContain('repeating the exact same tool call')
    expect(found[1]!.source).toEqual(guardSource('probe', 2))
    expect(found[2]).toEqual({ text: 'downstream-ctx', source: { kind: 'plugin', plugin: 'test' } })
    // The block's feedback reached the tool result unchanged.
    const results = [...agent.session.events].filter((e): e is SessionEvent<'tool/result'> => e.type === 'tool/result')
    expect(results.every(r => r.data.message.content[0].isError)).toBe(true)
    expect(results[1]!.data.message.content[0].content).toEqual([{ type: 'text', text: 'nope' }])
  })

  it('preserves a downstream canonical value replacement while folding', async () => {
    const ctx = await harness({ thresholds: [2] })
    ctx.on('tools/post-execute', async () => ({
      kind: 'accept' as const,
      value: [{ type: 'text' as const, text: 'replaced' }],
    }))
    const adapter = new MockAdapter([
      toolCallResponse('c1', 'probe', { q: 1 }),
      toolCallResponse('c2', 'probe', { q: 1 }),
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const found = reminders(agent)
    expect(found).toHaveLength(1)
    expect(found[0]!.text).toContain('repeating the exact same tool call')
    const results = [...agent.session.events].filter((e): e is SessionEvent<'tool/result'> => e.type === 'tool/result')
    expect(results[1]!.data.message.content[0].content).toEqual([{ type: 'text', text: 'replaced' }])
  })
})

describe('config validation fails loud', () => {
  async function spine(): Promise<Context> {
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    return ctx
  }

  it('rejects an empty thresholds list', async () => {
    const ctx = await spine()
    await expect(ctx.plugin(RepeatToolGuard, { thresholds: [] })).rejects.toThrow(/must not be empty/)
  })

  it('rejects a threshold below 2', async () => {
    const ctx = await spine()
    await expect(ctx.plugin(RepeatToolGuard, { thresholds: [1, 3] })).rejects.toThrow(/integer >= 2/)
  })

  it('rejects a non-integer threshold', async () => {
    const ctx = await spine()
    await expect(ctx.plugin(RepeatToolGuard, { thresholds: [2.5] })).rejects.toThrow(/integer >= 2/)
  })

  it('rejects duplicate thresholds', async () => {
    const ctx = await spine()
    await expect(ctx.plugin(RepeatToolGuard, { thresholds: [3, 3] })).rejects.toThrow(/duplicates/)
  })

  it('rejects a non-positive or fractional argumentsPreviewChars', async () => {
    const ctx = await spine()
    await expect(ctx.plugin(RepeatToolGuard, { argumentsPreviewChars: 0 })).rejects.toThrow(/argumentsPreviewChars/)
    const ctx2 = await spine()
    await expect(ctx2.plugin(RepeatToolGuard, { argumentsPreviewChars: 12.5 })).rejects.toThrow(/argumentsPreviewChars/)
  })
})
