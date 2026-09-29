/** Package-owned session-event invariants for auto-review. @module @z/dsh-auto-review/invariant */

import type { Context } from '@z/cordis'
import type { Session, SessionEvent } from '@z/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@z/dsh-invariants'

const PACKAGE_NAME = '@z/dsh-auto-review'

/** Cordis companion plugin name. */
export const name = 'auto-review-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

const RISKS = ['low', 'medium', 'high', 'critical'] as const
const DECISIONS = ['allow', 'deny', 'defer'] as const
const VERDICTS = ['allow', 'deny', 'defer'] as const

/* jscpd:ignore-start -- package companions share replay and dispatch plumbing */
/** Validate the package-owned event fields and ignore unrelated events. */
function validateEvent(event: SessionEvent, fail: InvariantFailure): void {
  if (event.type !== 'approval/review') return
  if (!RISKS.includes(event.data.risk)) {
    fail(`approval/review carries unknown risk ${JSON.stringify(event.data.risk)}`)
  }
  if (!DECISIONS.includes(event.data.decision)) {
    fail(`approval/review carries unknown decision ${JSON.stringify(event.data.decision)}`)
  }
  if (!VERDICTS.includes(event.data.verdict)) {
    fail(`approval/review carries unknown verdict ${JSON.stringify(event.data.verdict)}`)
  }
}

/** Install validation for loaded and newly appended review records. */
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
