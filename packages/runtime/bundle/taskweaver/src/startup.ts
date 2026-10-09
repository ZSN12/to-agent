/**
 * Parse the TaskWeaver API Host's WebServer bind and `/api` trust options.
 * @module @z/dsh-taskweaver/startup
 */

import { Command } from 'commander'
import type { Context } from '@z/cordis'
import { parseCmdline } from '@z/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'web-startup'

/** Service required before the flags can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided to the WebServer and API Host rows. */
export const WEB_STARTUP_SERVICE = 'webStartup'

/** Values read from the parsed invocation. */
export interface WebStartupValues {
  host?: string
  port?: number
  trustedHosts: string[]
}

interface WebOptions {
  host?: string
  port?: string
  trustedHost?: string[]
}

function webCommand(): Command {
  return new Command()
    .name('dsh --profile web')
    .description('Start the TaskWeaver API Host.')
    .helpOption('-h, --help', 'show this help')
    .option('--host <host>', 'WebServer bind host')
    .option('--port <port>', 'WebServer port; pass 0 to let the OS pick a free one')
    .option('--trusted-host <authority...>', 'extra authority accepted by the /api trust fence; repeatable')
    .addHelpText('after', `
Examples:
  dsh --profile web                       start on the composed host and port
  dsh --profile web --host 127.0.0.1 --port 0
  dsh --profile web --trusted-host app.internal
`)
}

/** Parse and provide the Web invocation as an ordinary Cordis service. */
export function apply(ctx: Context): void {
  const program = webCommand()
  program.action(() => {
    const options = program.opts<WebOptions>()
    if (options.host === '0.0.0.0') {
      program.error('error: --host 0.0.0.0 is intentionally not supported yet for safety; use 127.0.0.1 instead')
    }
    if (options.port !== undefined && !/^\d+$/u.test(options.port)) {
      program.error(`error: --port must be a number, got ${JSON.stringify(options.port)}`)
    }
    ctx.provide(WEB_STARTUP_SERVICE, {
      ...options.host !== undefined && { host: options.host },
      ...options.port !== undefined && { port: Number(options.port) },
      trustedHosts: options.trustedHost ?? [],
    } satisfies WebStartupValues)
  })
  parseCmdline(ctx, program)
}
