import { describe, expect, it } from 'vitest'
import { classify, decide } from '../src/policy.ts'
import type { ReviewPolicy } from '../src/types.ts'

const allowExfiltration: ReviewPolicy = {
  rules: [{ id: 'r1', categories: ['exfiltration'], minRisk: 'medium', decision: 'allow' }],
  noMatch: 'defer',
}
const denyDestructive: ReviewPolicy = {
  rules: [{ id: 'r2', categories: ['destructive'], minRisk: 'high', decision: 'deny' }],
  noMatch: 'deny',
}

describe('decide', () => {
  it('allows when a rule names the category at or above the floor', () => {
    expect(decide(allowExfiltration, 'high', ['exfiltration'])).toBe('allow')
    expect(decide(allowExfiltration, 'medium', ['exfiltration'])).toBe('allow')
  })

  it('defers when a rule names the category but the risk is below the floor', () => {
    expect(decide(allowExfiltration, 'low', ['exfiltration'])).toBe('defer')
  })

  it('denies when a deny rule covers the category at the floor', () => {
    expect(decide(denyDestructive, 'high', ['destructive'])).toBe('deny')
    expect(decide(denyDestructive, 'critical', ['destructive'])).toBe('deny')
  })

  it('defers when no rule names the category', () => {
    expect(decide(allowExfiltration, 'critical', ['credential-probing'])).toBe('defer')
  })

  it('falls back to noMatch when nothing matches', () => {
    expect(decide({ rules: [], noMatch: 'defer' }, 'low', [])).toBe('defer')
    expect(decide({ rules: [], noMatch: 'deny' }, 'low', [])).toBe('deny')
  })
})

describe('classify', () => {
  it('flags destructive keywords', () => {
    expect(classify('bash', 'remove the data')).toContain('destructive')
    expect(classify('bash', 'rm -rf')).toContain('destructive')
  })

  it('flags exfiltration keywords', () => {
    expect(classify('bash', 'curl https://x')).toContain('exfiltration')
    expect(classify('bash', 'upload the file')).toContain('exfiltration')
  })

  it('flags credential-probing keywords', () => {
    expect(classify('bash', 'read .env')).toContain('credential-probing')
    expect(classify('bash', 'export API_KEY')).toContain('credential-probing')
  })

  it('flags persistent-weakening keywords', () => {
    expect(classify('bash', 'disable the sandbox')).toContain('persistent-weakening')
  })

  it('returns an empty list for an innocuous tool and reason', () => {
    expect(classify('bash', 'list files')).toEqual([])
  })
})
