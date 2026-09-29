import { describe, expect, it } from 'vitest'
import type { Context } from '@z/cordis'
import type { Agent } from '@z/dsh-agent'
import type { SubagentRun } from '@z/dsh-subagent'
import { subagentReviewer } from '../src/reviewer.ts'

/** A Context carrying only the subagent seam surface the reviewer needs. */
function ctxWithSubagents(start: (provider: string, request: unknown) => Promise<unknown>): Context {
  return { subagents: { start } } as unknown as Context
}

const parent = {} as Agent

function completedRun(structured: unknown): Promise<Partial<SubagentRun>> {
  return Promise.resolve({
    result: Promise.resolve({
      stopReason: 'completed',
      structured,
      output: [{ type: 'text' as const, text: '' }],
    }),
  })
}

describe('subagentReviewer', () => {
  it('resolves the structured ReviewOutcome from a completed child', async () => {
    const reviewer = subagentReviewer(ctxWithSubagents(() => completedRun({ risk: 'high', decision: 'deny' })), 'spawn')
    const outcome = await reviewer.run({ toolName: 'rm' }, parent, new AbortController().signal)
    expect(outcome).toEqual({ risk: 'high', decision: 'deny' })
  })

  it('passes the provider, parent, outputSchema, and no tools to start', async () => {
    let capturedProvider: string | undefined
    let captured: unknown
    const reviewer = subagentReviewer(ctxWithSubagents((provider, request) => {
      capturedProvider = provider as string
      captured = request
      return completedRun({ risk: 'low', decision: 'allow' })
    }), 'spawn')
    await reviewer.run({ toolName: 'bash', reason: 'curl' }, parent, new AbortController().signal)
    const req = captured as { provider: string; parent: Agent; outputSchema: unknown; toolFilter: unknown; prompt: unknown[] }
    expect(capturedProvider).toBe('spawn')
    expect(req.parent).toBe(parent)
    expect(req.toolFilter).toEqual({ allow: [] })
    expect(req.outputSchema).toEqual({
      type: 'object',
      properties: {
        risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        decision: { type: 'string', enum: ['allow', 'deny', 'defer'] },
        reason: { type: 'string' },
      },
      required: ['risk', 'decision'],
      additionalProperties: false,
    })
  })

  it('throws when the child does not complete with a structured verdict', async () => {
    const reviewer = subagentReviewer(
      ctxWithSubagents(() => Promise.resolve({ result: Promise.resolve({ stopReason: 'cancelled' }) })),
      'spawn',
    )
    await expect(reviewer.run({ toolName: 'bash' }, parent, new AbortController().signal)).rejects.toThrow(
      'did not complete',
    )
  })

  it('throws when the completed child carries no structured value', async () => {
    const reviewer = subagentReviewer(ctxWithSubagents(() => completedRun(undefined)), 'spawn')
    await expect(reviewer.run({ toolName: 'bash' }, parent, new AbortController().signal)).rejects.toThrow(
      'did not complete',
    )
  })
})
