/**
 * Register TaskWeaver in-process model bridge routes on `ctx.llm`.
 * @module @z/dsh-llm-taskweaver-bridge
 */

import type { Context } from '@z/cordis'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@z/dsh-settings'
import type { AdapterRegistrationHandle } from '@z/dsh-llm'
import { installDefaultBridgeBackends, installTaskWeaverTransportBackends } from '@z/dsh-bridge-core'
import { TaskWeaverBridgeAdapter } from './adapter.ts'
import { ConfigSchema, resolveBridgeOptions, type Config, type ResolvedBridgeOptions } from './config.ts'

export const name = 'llm-taskweaver-bridge'
export const inject = ['llm']

const NS = settingsNamespace('llm-taskweaver-bridge')

export { TaskWeaverBridgeAdapter } from './adapter.ts'
export { ConfigSchema, resolveBridgeOptions } from './config.ts'
export type { Config } from './config.ts'
export type { ResolvedBridgeOptions } from './config.ts'

export const apply = async (ctx: Context): Promise<void> => {
  installDefaultBridgeBackends()
  try {
    await installTaskWeaverTransportBackends()
  } catch (error) {
    ctx.logger.warn?.('llm-taskweaver-bridge: transport backends not loaded')
    ctx.logger.warn?.(error)
  }

  let readSettings: () => unknown = () => ({})
  let lastGood: ResolvedBridgeOptions = resolveBridgeOptions({})

  const options = (): ResolvedBridgeOptions => {
    try {
      // Settings scopes return frozen, schema-resolved snapshots. Re-running
      // ConfigSchema here attempts to mutate that frozen object and silently
      // leaves every bridge route dormant; validation already happened when
      // the settings section was registered or updated.
      const raw = readSettings()
      const resolved = resolveBridgeOptions(raw as Config)
      lastGood = resolved
      return resolved
    } catch (error) {
      if (lastGood.providers.size === 0) throw error
      ctx.logger.error('llm-taskweaver-bridge: keeping last good provider map after invalid settings')
      ctx.logger.error(error)
      return lastGood
    }
  }

  const adapter = new TaskWeaverBridgeAdapter({ options })
  let registration: AdapterRegistrationHandle | undefined
  let registeredRoutes: string[] = []

  const ensureRegistration = (): void => {
    const routes = [...options().providers.keys()].sort()
    if (deepEqualJson(routes, registeredRoutes)) return
    if (registration === undefined) {
      if (!routes.length) {
        registeredRoutes = routes
        return
      }
      registration = ctx.llm.registerAdapter(routes, adapter)
    } else {
      registration.replace(routes)
    }
    registeredRoutes = routes
    const entries = routes.flatMap((id) => {
      const profile = options().providers.get(id)
      if (!profile) return []
      return [{
        provider: id,
        displayName: profile.displayName,
        settingsNs: NS,
        settingsPath: ['providers', id],
      }]
    })
    if (entries.length) ctx.llm.registerConfigurableProviders(entries)
  }

  options()
  ensureRegistration()

  installSettingsSection(ctx, NS, ConfigSchema, {}, {
    setSource: (source) => {
      readSettings = source
    },
    onChange: () => {
      try {
        ensureRegistration()
      } catch (error) {
        ctx.logger.error('llm-taskweaver-bridge: keeping previous routes after refused update')
        ctx.logger.error(error)
      }
    },
  })
}
