/**
 * TaskWeaver's API-only Host glue: expose the explicit `/api` trust list and
 * publish `z web:` only after the complete Loader tree is ready.
 * @module @z/dsh-taskweaver
 */

import type { Context } from '@z/cordis'
import z from '@z/schemastery'
import type {} from '@z/cordis-plugin-loader'
import type {} from '@z/dsh-host-webserver'

/** Stable Cordis plugin name. */
export const name = 'taskweaver-api-host'

/** Service consumed by the `/api` connection row. */
export const WEB_RUNTIME_SERVICE = 'webRuntime'

/** Wait for the API route owner and other boot rows before announcing readiness. */
export const inject = ['webServer']

/** Explicit non-loopback authorities accepted by the `/api` trust fence. */
export interface Config {
  trustedHosts: string[]
}

export const Config: z<Config> = z.object({
  trustedHosts: z.array(String).default([]),
})

/** Values shared with the `/api` connection service after bind. */
export interface WebRuntimeValues {
  trustedHosts: string[]
}

/**
 * Publish the API trust list and announce the loopback endpoint once every
 * loader row has mounted. The supervisor treats this line as `/api` readiness.
 * @param ctx - Host context containing the bound WebServer.
 * @param config - explicit authorities forwarded to the `/api` trust fence.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.provide(WEB_RUNTIME_SERVICE, { trustedHosts: config.trustedHosts } satisfies WebRuntimeValues)

  const announceReady = (): void => {
    if (ctx.get('webServer') === undefined) return
    console.log(`z web: http://127.0.0.1:${String(ctx.webServer.port)}`)
  }
  const settled = ctx.get('loader')?.await()
  if (settled === undefined) {
    announceReady()
  } else {
    void settled.then(announceReady, () => {})
  }
}
