/** TaskWeaver API Host readiness follows the bound server and `/api` route. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@z/cordis'
import WebServer from '@z/dsh-host-webserver'
import { apply as registerApiRoute } from '@z/dsh-client-connection'
import { apply } from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks()
})

describe('TaskWeaver API Host readiness', () => {
  it('exposes explicit API trust authorities and announces only after the API route is ready', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    registerApiRoute(ctx, { trustedHosts: [] })

    let finishBoot!: () => void
    ctx.provide('loader', {
      await: () => new Promise<void>((resolve) => { finishBoot = resolve }),
    } as never)

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    apply(ctx, { trustedHosts: ['app.internal'] })

    expect(ctx.get('webRuntime')).toEqual({ trustedHosts: ['app.internal'] })
    expect(log).not.toHaveBeenCalled()

    const url = `http://127.0.0.1:${String(ctx.webServer.port)}/api/__taskweaver_readiness_probe__`
    const response = await fetch(url)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('not found')

    finishBoot()
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith(`z web: http://127.0.0.1:${String(ctx.webServer.port)}`))
  })
})
