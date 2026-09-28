import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/invariant.ts'

function harness(existingSessions: Array<{ events: Array<{ type: string; data: Record<string, unknown> }> }> = []) {
  const failures: string[] = []
  const sessions = {
    list() {
      return existingSessions
    },
  }
  const listeners: Array<(mode: string, eventName: string, args: unknown) => void> = []
  const ctx = {
    sessions,
    on(eventName: string, listener: (...args: unknown[]) => void) {
      void eventName
      // Registered as a global internal/dispatch listener.
      listeners.push(listener)
      return () => {}
    },
    invariants: {
      register(_name: string, install: unknown) {
        const installer = install as {
          (c: Context, fail: (msg: string) => void): void
        }
        installer(ctx as unknown as Context, msg => failures.push(msg))
        return () => {}
      },
    },
  }
  return { failures, ctx, listeners }
}

function appendValid(listeners: ReturnType<typeof harness>['listeners']): void {
  listeners[0]!('before', 'session/event', [{}, { type: 'desktop/action', data: { kind: 'move', outcome: 'applied' } }])
}

describe('tool-desktop invariant', () => {
  it('registers and accepts a valid desktop/action record', () => {
    const h = harness()
    void apply(h.ctx as unknown as Context)
    appendValid(h.listeners)
    expect(h.failures).toHaveLength(0)
  })

  it('rejects an unknown kind', () => {
    const h = harness()
    void apply(h.ctx as unknown as Context)
    h.listeners[0]!('before', 'session/event', [{}, { type: 'desktop/action', data: { kind: 'teleport', outcome: 'applied' } }])
    expect(h.failures.length).toBeGreaterThan(0)
    expect(h.failures[0]).toContain('unknown kind')
  })

  it('rejects an unknown outcome', () => {
    const h = harness()
    void apply(h.ctx as unknown as Context)
    h.listeners[0]!('before', 'session/event', [{}, { type: 'desktop/action', data: { kind: 'click', outcome: 'maybe' } }])
    expect(h.failures.length).toBeGreaterThan(0)
    expect(h.failures[0]).toContain('unknown outcome')
  })

  it('ignores unrelated events', () => {
    const h = harness()
    void apply(h.ctx as unknown as Context)
    h.listeners[0]!('before', 'session/event', [{}, { type: 'approval/review', data: {} }])
    expect(h.failures).toHaveLength(0)
  })

  it('replays and validates existing desktop records on load', () => {
    const h = harness([
      { events: [{ type: 'desktop/action', data: { kind: 'move', outcome: 'applied' } }] },
    ])
    void apply(h.ctx as unknown as Context)
    expect(h.failures).toHaveLength(0)
  })

  it('flags an invalid existing record on load', () => {
    const h = harness([
      { events: [{ type: 'desktop/action', data: { kind: 'boom', outcome: 'applied' } }] },
    ])
    void apply(h.ctx as unknown as Context)
    expect(h.failures.length).toBeGreaterThan(0)
  })
})
