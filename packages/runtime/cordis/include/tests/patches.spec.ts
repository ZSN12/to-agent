import { describe, expect, it } from 'vitest'
import { applyEntryPatches, type PatchOptions } from '../src/index.ts'

describe('applyEntryPatches', () => {
  it('keeps inserted bundle patches intact across override removal', () => {
    const bundleLayer: PatchOptions[] = [{
      insert: [{
        id: 'profile-lifecycle-fixture',
        name: './fixture.mjs',
        config: { generation: 'bundle-default' },
      }],
    }]
    const userLayer: PatchOptions[] = [{
      id: 'profile-lifecycle-fixture',
      config: { generation: 'user-override' },
    }]

    const applied = applyEntryPatches([], [...bundleLayer, ...userLayer], () => {})
    expect(applied[0]?.config).toEqual({ generation: 'user-override' })
    expect(bundleLayer[0]?.insert?.[0]?.config).toEqual({ generation: 'bundle-default' })

    const reverted = applyEntryPatches([], bundleLayer, () => {})
    expect(reverted[0]?.config).toEqual({ generation: 'bundle-default' })

    if (applied[0]?.config) applied[0].config.generation = 'mutated-output'
    expect(bundleLayer[0]?.insert?.[0]?.config).toEqual({ generation: 'bundle-default' })
  })
})
