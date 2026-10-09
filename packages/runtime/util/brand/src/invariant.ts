/**
 * Package-owned invariant companion for `@z/dsh-brand`.
 * @module @z/dsh-brand/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@z/cordis'
import type { InvariantInstaller } from '@z/dsh-invariants'

const PACKAGE_NAME = '@z/dsh-brand'

/** Cordis companion plugin name. */
export const name = 'brand-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this pure utility owns no event stream or mutable runtime data; its value
 * algebra is enforced by unit tests.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
