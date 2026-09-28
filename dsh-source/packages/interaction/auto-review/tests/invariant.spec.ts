import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import * as AutoReviewInvariant from '@deepseek-ai/dsh-auto-review/invariant'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry, { enabled: true })
  await ctx.plugin(AutoReviewInvariant)
  return ctx
}

function reviewEvent(risk: string, decision: string, verdict: string): SessionEvent {
  return { type: 'approval/review', seq: 0, time: 0, data: { toolName: 'bash', risk, decision, verdict } } as SessionEvent
}

describe('auto-review invariants', () => {
  it('accepts a well-formed review record', async () => {
    const ctx = await setup()
    expect(() => { ctx.emit('session/event', {} as Session, reviewEvent('high', 'deny', 'deny')) }).not.toThrow()
  })

  it('ignores unrelated event streams', async () => {
    const ctx = await setup()
    expect(() => { ctx.emit('session/event', {} as Session, {
      type: 'turn/start', seq: 0, time: 0, data: {},
    } as SessionEvent) }).not.toThrow()
    expect(() => { ctx.emit('tools/change') }).not.toThrow()
  })

  it('rejects an unknown risk grade', async () => {
    const ctx = await setup()
    expect(() => { ctx.emit('session/event', {} as Session, reviewEvent('severe', 'deny', 'deny')) })
      .toThrow(new InvariantError('@deepseek-ai/dsh-auto-review', 'approval/review carries unknown risk "severe"'))
  })

  it('rejects an unknown decision', async () => {
    const ctx = await setup()
    expect(() => { ctx.emit('session/event', {} as Session, reviewEvent('high', 'maybe', 'deny')) })
      .toThrow(new InvariantError('@deepseek-ai/dsh-auto-review', 'approval/review carries unknown decision "maybe"'))
  })

  it('rejects an unknown verdict', async () => {
    const ctx = await setup()
    expect(() => { ctx.emit('session/event', {} as Session, reviewEvent('high', 'deny', 'block')) })
      .toThrow(new InvariantError('@deepseek-ai/dsh-auto-review', 'approval/review carries unknown verdict "block"'))
  })

  it('rejects an invalid review record already present on late registration', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    ctx.sessions.create().append('approval/review', { toolName: 'bash', risk: 'severe' as never, decision: 'deny', verdict: 'deny' })
    await ctx.plugin(InvariantRegistry, { enabled: true })

    await expect(ctx.plugin(AutoReviewInvariant).then(() => undefined)).rejects.toMatchObject({
      code: 'INVARIANT',
      packageName: '@deepseek-ai/dsh-auto-review',
    })
  })
})
