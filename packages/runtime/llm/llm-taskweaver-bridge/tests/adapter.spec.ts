import { describe, expect, it } from 'vitest'
import { TaskWeaverBridgeAdapter } from '../src/adapter.ts'

describe('TaskWeaverBridgeAdapter model capabilities', () => {
  it('publishes declared reasoning efforts and the default for the exact model route', async () => {
    const adapter = new TaskWeaverBridgeAdapter({
      options: () => ({
        providers: new Map([['bridge-antigravity', {
          bridgeKind: 'google-antigravity',
          displayName: 'Antigravity',
          models: [{
            id: 'gemini-3.8-flash',
            reasoning: true,
            thinkingLevelMap: { low: 'low', medium: 'medium', high: 'high' },
            defaultThinkingLevel: 'medium',
          }],
        }]]),
      }),
    })

    await expect(adapter.resolveModel('bridge-antigravity', 'gemini-3.8-flash')).resolves.toMatchObject({
      provider: 'bridge-antigravity',
      id: 'gemini-3.8-flash',
      reasoning: {
        efforts: [
          { id: 'low', name: 'Low' },
          { id: 'medium', name: 'Medium' },
          { id: 'high', name: 'High' },
        ],
        defaultEffort: 'medium',
      },
    })
  })

  it('omits reasoning capability when no selectable effort is declared', async () => {
    const adapter = new TaskWeaverBridgeAdapter({
      options: () => ({
        providers: new Map([['bridge-antigravity', {
          bridgeKind: 'google-antigravity',
          displayName: 'Antigravity',
          models: [{ id: 'gemini-3.5-flash', reasoning: false }],
        }]]),
      }),
    })

    const resolved = await adapter.resolveModel('bridge-antigravity', 'gemini-3.5-flash')
    expect(resolved.reasoning).toBeUndefined()
  })
})
