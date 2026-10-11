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

function makeProfile(displayName: string) {
  return {
    bridgeKind: 'cursor',
    displayName,
    models: [{ id: `cursor/${displayName.toLowerCase()}`, name: displayName }],
  }
}

describe('hot apply provider updates without DUPLICATE_DIRECTORY', () => {
  beforeEach(() => {
    shared.config = {}
    shared.onChange = undefined
  })

  it('progressively updates {a} -> {a,b} -> {b} -> invalid -> {b,c} gracefully', async () => {
    let currentAdapterRoutes: string[] = []
    let currentDirectoryProviders: string[] = []

    const adapterReplace = vi.fn((routes: string[]) => {
      currentAdapterRoutes = routes
    })
    const directoryReplace = vi.fn((entries: Array<{ provider: string }>) => {
      // If duplicate provider is registered, mock DUPLICATE_DIRECTORY error
      const keys = entries.map((e) => e.provider)
      const unique = new Set(keys)
      if (keys.length !== unique.size) {
        const err = new Error('DUPLICATE_DIRECTORY')
        Object.assign(err, { code: 'DUPLICATE_DIRECTORY' })
        throw err
      }
      currentDirectoryProviders = keys
    })

    const registerAdapter = vi.fn((routes: string[]) => {
      currentAdapterRoutes = routes
      return Object.assign(vi.fn(), { replace: adapterReplace })
    })
    const registerConfigurableProviders = vi.fn((entries: Array<{ provider: string }>) => {
      currentDirectoryProviders = entries.map((e) => e.provider)
      return Object.assign(vi.fn(), { replace: directoryReplace })
    })

    const ctx = {
      llm: { registerAdapter, registerConfigurableProviders },
      logger: { warn: vi.fn(), error: vi.fn() },
    } as unknown as Context

    await apply(ctx)

    // Step 1: {a}
    shared.config = { providers: { a: makeProfile('Provider A') } }
    shared.onChange?.()
    expect(currentAdapterRoutes).toEqual(['a'])
    expect(currentDirectoryProviders).toEqual(['a'])

    // Step 2: {a, b}
    shared.config = { providers: { a: makeProfile('Provider A'), b: makeProfile('Provider B') } }
    shared.onChange?.()
    expect(currentAdapterRoutes.sort()).toEqual(['a', 'b'])
    expect(currentDirectoryProviders.sort()).toEqual(['a', 'b'])

    // Step 3: {b}
    shared.config = { providers: { b: makeProfile('Provider B') } }
    shared.onChange?.()
    expect(currentAdapterRoutes).toEqual(['b'])
    expect(currentDirectoryProviders).toEqual(['b'])

    // Step 4: Invalid configuration (e.g. malformed null or non-object)
    shared.config = null as unknown as Record<string, unknown>
    shared.onChange?.()
    // Retains last good configuration
    expect(currentAdapterRoutes).toEqual(['b'])
    expect(currentDirectoryProviders).toEqual(['b'])

    // Step 5: {b, c}
    shared.config = { providers: { b: makeProfile('Provider B'), c: makeProfile('Provider C') } }
    shared.onChange?.()
    expect(currentAdapterRoutes.sort()).toEqual(['b', 'c'])
    expect(currentDirectoryProviders.sort()).toEqual(['b', 'c'])

    // Confirms registerConfigurableProviders was called once initial, all updates handled via atomic replace
    expect(registerConfigurableProviders).toHaveBeenCalledTimes(1)
  })
})
