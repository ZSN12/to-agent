import { describe, expect, it } from 'vitest'
import { resolveBridgeRuntimeRoot } from '../src/registry.ts'

describe('resolveBridgeRuntimeRoot', () => {
  it('prefers TASKWEAVER_RUNTIME and warns when a legacy alias is present', () => {
    const warnings: string[] = []
    expect(resolveBridgeRuntimeRoot({
      TASKWEAVER_RUNTIME: '/runtime/current',
      TASKWEAVER_Z_RUNTIME: '/runtime/old-z',
      TASKWEAVER_DSH_RUNTIME: '/runtime/old-dsh',
    }, (message) => warnings.push(message))).toBe('/runtime/current')
    expect(warnings).toHaveLength(2)
    expect(warnings.every((message) => message.includes('TASKWEAVER_RUNTIME'))).toBe(true)
    expect(resolveBridgeRuntimeRoot({ TASKWEAVER_Z_RUNTIME: '/runtime/old' }, (message) => warnings.push(message)))
      .toBe('/runtime/old')
    expect(warnings).toHaveLength(2) // aliases warn once per process even when read repeatedly
  })
})
