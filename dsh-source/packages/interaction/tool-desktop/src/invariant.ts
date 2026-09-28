/** Package-owned session-event invariants for desktop control. @module @deepseek-ai/dsh-tool-desktop/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-desktop'

/** Cordis companion plugin name. */
export const name = 'tool-desktop-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

const KINDS = new Set([
  'move',
  'click',
  'double_click',
  'drag',
  'scroll',
  'type',
  'key_combo',
  'shortcut',
  'screenshot',
])
const OUTCOMES = new Set(['applied', 'denied'])

/* jscpd:ignore-start -- package companions share replay and dispatch plumbing */
/** Validate the package-owned event fields and ignore unrelated events. */
function validateEvent(event: SessionEvent, fail: InvariantFailure): void {
  if (event.type !== 'desktop/action') return
  if (!KINDS.has(event.data.kind)) {
    fail(`desktop/action carries unknown kind ${JSON.stringify(event.data.kind)}`)
  }
  if (!OUTCOMES.has(event.data.outcome)) {
    fail(`desktop/action carries unknown outcome ${JSON.stringify(event.data.outcome)}`)
  }
}

/** Install validation for loaded and newly appended desktop records. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const session of ctx.sessions.list()) {
    for (const event of session.events) validateEvent(event, fail)
  }
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const event = (args as [Session, SessionEvent])[1]
    validateEvent(event, fail)
  }, { global: true })
}, { inject: ['sessions'] })
/* jscpd:ignore-end */

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
