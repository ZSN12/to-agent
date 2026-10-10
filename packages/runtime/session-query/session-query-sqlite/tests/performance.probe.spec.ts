import { createUserMessage } from '@taskweaver/dsh-llm'
import { Context } from '@taskweaver/cordis'
import { SessionId } from '@taskweaver/dsh-session'
import SessionStore from '@taskweaver/dsh-session'
import SqliteSessionQueryEngine from '@taskweaver/dsh-session-query-sqlite'
import { expect, it } from 'vitest'

it('probes a warmed trigram search across ten thousand messages', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SqliteSessionQueryEngine, { path: ':memory:' })
  try {
    const events = Array.from({ length: 10_000 }, (_, index) => ({
      type: 'user/message' as const,
      seq: index,
      time: index + 1,
      data: createUserMessage({
        content: [{ type: 'text' as const, text: index === 4567
          ? 'Prior discussion marker: previous-discussion-marker-20261009'
          : `Unrelated discussion line ${index}` }],
        source: { kind: 'user' as const },
      }),
      surfaceOp: 'append' as const,
    }))
    ctx.sessions.create(SessionId('ten-thousand-message-probe'), {
      seed: events,
      meta: { cwd: '/work', createdAt: 1 },
    })

    await ctx.sessionQuery.searchSessions({ query: 'previous-discussion-marker-20261009' })
    const startedAt = performance.now()
    const result = await ctx.sessionQuery.searchSessions({ query: 'previous-discussion-marker-20261009' })
    const elapsedMs = performance.now() - startedAt

    expect(result.items).toHaveLength(1)
    expect(elapsedMs).toBeLessThan(100)
    console.log(`Warmed 10k-message session search: ${elapsedMs.toFixed(2)}ms`)
  } finally {
    await ctx.fiber.dispose()
  }
})
