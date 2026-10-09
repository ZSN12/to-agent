import { describe, expect, it } from 'vitest'
import { createApprover, PersistentGrantCache } from '../src/approval.ts'
import type { ApprovalDispatcher } from '../src/approval.ts'
import type { ApprovalOutcome } from '@z/dsh-user-approval'
import type { Agent } from '@z/dsh-agent'
import type { DesktopAccessPolicy } from '../src/types.ts'

function dispatcher(sequence: ApprovalOutcome[]): ApprovalDispatcher & { calls: Array<{ toolName: string; reason?: string }> } {
  const calls: Array<{ toolName: string; reason?: string }> = []
  let i = 0
  return {
    calls,
    async request(req) {
      calls.push({ toolName: req.toolName, ...req.reason !== undefined ? { reason: req.reason } : {} })
      return sequence[Math.min(i++, sequence.length - 1)]!
    },
  }
}

const agent = {} as Agent
const denyDefault: DesktopAccessPolicy = { rules: [], default: 'deny' }
const allowSafari: DesktopAccessPolicy = {
  rules: [{ bundleId: 'com.apple.Safari', access: 'allow' }],
  default: 'deny',
}
const denySafari: DesktopAccessPolicy = {
  rules: [{ bundleId: 'com.apple.Safari', access: 'deny' }],
  default: 'allow',
}

describe('createApprover', () => {
  it('denies without prompting when policy denies the bundle', async () => {
    const disp = dispatcher(['allowed-once'])
    const approve = createApprover({ policy: denySafari, approval: disp })
    const r = await approve(agent, 'com.apple.Safari', 'move')
    expect(r).toEqual({ ok: false, reason: 'desktop: access denied by policy for com.apple.Safari' })
    expect(disp.calls).toHaveLength(0)
  })

  it('allows without prompting when policy allows and gateAllow is off', async () => {
    const disp = dispatcher(['allowed-once'])
    const approve = createApprover({ policy: allowSafari, approval: disp })
    const r = await approve(agent, 'com.apple.Safari', 'click')
    expect(r.ok).toBe(true)
    expect(disp.calls).toHaveLength(0)
  })

  it('asks through the waterfall when gateAllow is on', async () => {
    const disp = dispatcher(['allowed-once'])
    const approve = createApprover({ policy: allowSafari, approval: disp, gateAllow: true })
    const r = await approve(agent, 'com.apple.Safari', 'click')
    expect(r.ok).toBe(true)
    expect(disp.calls).toHaveLength(1)
    expect(disp.calls[0]!.toolName).toBe('desktop_click')
  })

  it('asks through the waterfall for an unmatched deny-default app', async () => {
    const disp = dispatcher(['allowed-once'])
    const approve = createApprover({ policy: denyDefault, approval: disp })
    const r = await approve(agent, 'com.unknown.app', 'type')
    expect(r.ok).toBe(true)
    expect(disp.calls[0]!.reason).toContain('com.unknown.app')
  })

  it('denies when the waterfall rejects', async () => {
    const disp = dispatcher(['rejected'])
    const approve = createApprover({ policy: denyDefault, approval: disp })
    const r = await approve(agent, 'com.unknown.app', 'move')
    expect(r.ok).toBe(false)
  })

  it('denies a null-bundle request when the waterfall rejects', async () => {
    const disp = dispatcher(['rejected'])
    const approve = createApprover({ policy: denyDefault, approval: disp })
    const r = await approve(agent, null, 'scroll')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('not approved')
  })

  it('asks with a generic reason when there is no frontmost app', async () => {
    const disp = dispatcher(['allowed-once'])
    const approve = createApprover({ policy: denyDefault, approval: disp })
    const r = await approve(agent, null, 'scroll')
    expect(r.ok).toBe(true)
    expect(disp.calls[0]!.reason).toContain('No frontmost application')
  })

  it('grants the cache directly on an allow when persist is on', async () => {
    const disp = dispatcher(['rejected'])
    const cache = new PersistentGrantCache()
    const approve = createApprover({ policy: allowSafari, approval: disp, persist: true }, cache)
    const first = await approve(agent, 'com.apple.Safari', 'move')
    expect(first.ok).toBe(true)
    // The allow path granted the cache, so a later call skips the waterfall.
    const second = await approve(agent, 'com.apple.Safari', 'click')
    expect(second.ok).toBe(true)
    expect(disp.calls).toHaveLength(0)
  })

  it('persists an approved bundle across calls when persist is on', async () => {
    const disp = dispatcher(['allowed-once'])
    const approve = createApprover({ policy: denyDefault, approval: disp, persist: true })
    await approve(agent, 'com.example.app', 'move')
    const second = await approve(agent, 'com.example.app', 'click')
    expect(second.ok).toBe(true)
    expect(disp.calls).toHaveLength(1)
  })

  it('shares the persistent cache across approver instances', async () => {
    const disp = dispatcher(['allowed-once'])
    const cache = new PersistentGrantCache()
    const first = createApprover({ policy: denyDefault, approval: disp, persist: true }, cache)
    const second = createApprover({ policy: denyDefault, approval: disp, persist: true }, cache)
    await first(agent, 'com.example.app', 'move')
    const r = await second(agent, 'com.example.app', 'type')
    expect(r.ok).toBe(true)
    expect(disp.calls).toHaveLength(1)
  })
})
