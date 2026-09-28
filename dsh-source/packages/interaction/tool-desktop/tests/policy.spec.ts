import { describe, expect, it } from 'vitest'
import { classifyDesktopAccess, resolveVerdict } from '../src/policy.ts'
import type { DesktopAccessPolicy } from '../src/types.ts'

function policy(rules: DesktopAccessPolicy['rules'], def: 'allow' | 'deny'): DesktopAccessPolicy {
  return { rules, default: def }
}

describe('classifyDesktopAccess', () => {
  it('returns the first matching rule', () => {
    const p = policy(
      [
        { bundleId: 'com.example.denied', access: 'deny' },
        { bundleId: 'com.example.allowed', access: 'allow' },
      ],
      'deny',
    )
    expect(classifyDesktopAccess(p, 'com.example.allowed')).toBe('allow')
    expect(classifyDesktopAccess(p, 'com.example.denied')).toBe('deny')
  })

  it('defers an unmatched app under a deny default', () => {
    const p = policy([{ bundleId: 'com.example.allowed', access: 'allow' }], 'deny')
    expect(classifyDesktopAccess(p, 'com.other.app')).toBe('defer')
  })

  it('allows an unmatched app under an allow default', () => {
    const p = policy([{ bundleId: 'com.example.denied', access: 'deny' }], 'allow')
    expect(classifyDesktopAccess(p, 'com.other.app')).toBe('allow')
  })

  it('prefers the first rule when duplicates exist', () => {
    const p = policy(
      [
        { bundleId: 'com.example.app', access: 'deny' },
        { bundleId: 'com.example.app', access: 'allow' },
      ],
      'deny',
    )
    expect(classifyDesktopAccess(p, 'com.example.app')).toBe('deny')
  })
})

describe('resolveVerdict', () => {
  it('keeps deny final', () => {
    expect(resolveVerdict('deny', false)).toBe('deny')
    expect(resolveVerdict('deny', true)).toBe('deny')
  })

  it('keeps defer as defer', () => {
    expect(resolveVerdict('defer', false)).toBe('defer')
    expect(resolveVerdict('defer', true)).toBe('defer')
  })

  it('gates allow when gateAllow is set', () => {
    expect(resolveVerdict('allow', true)).toBe('defer')
    expect(resolveVerdict('allow', false)).toBe('allow')
  })
})
