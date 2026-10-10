import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@taskweaver/cordis'
import { apply } from '../src/index.ts'

const shared = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  onChange: undefined as (() => void) | undefined,
}))

vi.mock('@taskweaver/dsh-settings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@taskweaver/dsh-settings')>()
  return {
    ...original,
    installSettingsSection(_ctx: unknown, _ns: unknown, _schema: unknown, _defaults: unknown, handlers: {
      setSource: (source: () => unknown) => void
      onChange: () => void
    }) {
      handlers.setSource(() => shared.config)
      shared.onChange = handlers.onChange
    },
  }
})

vi.mock('@taskweaver/dsh-bridge-core', () => ({
  installDefaultBridgeBackends: vi.fn(),
  installTaskWeaverTransportBackends: vi.fn(async () => undefined),
  streamThroughBridge: vi.fn(),
}))

function profile(displayName: string) {
  return {
    bridgeKind: 'cursor',
    displayName,
    models: [{ id: 'cursor/composer-2.5', name: 'Composer 2.5' }],
  }
}

describe('bridge adapter and directory registration', () => {
  beforeEach(() => {
    shared.config = {}
    shared.onChange = undefined
  })

  it('atomically replaces adapter routes and configurable directory entries as settings change', async () => {
    const adapterReplace = vi.fn()
    const directoryReplace = vi.fn()
    const registerAdapter = vi.fn(() => Object.assign(vi.fn(), { replace: adapterReplace }))
    const registerConfigurableProviders = vi.fn(() => Object.assign(vi.fn(), { replace: directoryReplace }))
    const ctx = {
      llm: { registerAdapter, registerConfigurableProviders },
      logger: { warn: vi.fn(), error: vi.fn() },
    } as unknown as Context

    await apply(ctx)
    shared.config = { providers: { 'bridge-composer': profile('Composer') } }
    shared.onChange?.()

    expect(registerAdapter).toHaveBeenCalledTimes(1)
    expect(registerAdapter.mock.calls[0]?.[0]).toEqual(['bridge-composer'])
    expect(registerConfigurableProviders).toHaveBeenCalledTimes(1)
    expect(registerConfigurableProviders.mock.calls[0]?.[0]).toEqual([{
      provider: 'bridge-composer',
      displayName: 'Composer',
      settingsNs: 'llm-taskweaver-bridge',
      settingsPath: ['providers', 'bridge-composer'],
    }])

    shared.config = { providers: { 'bridge-composer': profile('Composer Renamed') } }
    shared.onChange?.()
    expect(adapterReplace).not.toHaveBeenCalled()
    expect(directoryReplace).toHaveBeenCalledTimes(1)
    expect(directoryReplace.mock.calls[0]?.[0][0]?.displayName).toBe('Composer Renamed')

    shared.config = {}
    shared.onChange?.()
    expect(adapterReplace).toHaveBeenCalledWith([])
    expect(directoryReplace).toHaveBeenCalledTimes(2)
    expect(directoryReplace.mock.calls[1]?.[0]).toEqual([])
    expect(registerConfigurableProviders).toHaveBeenCalledTimes(1)
  })
})
