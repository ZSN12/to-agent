/**
 * Package-owned invariant companion for `@taskweaver/dsh-taskweaver`.
 * @module @taskweaver/dsh-taskweaver/invariant
 */

import type { Context } from '@taskweaver/cordis'
import type { InvariantInstaller } from '@taskweaver/dsh-invariants'

const PACKAGE_NAME = '@taskweaver/dsh-taskweaver'

/** Cordis companion plugin name. */
export const name = 'taskweaver-api-host-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package owns no mutable state. The WebServer and
 * `/api` route lifecycle invariants belong to their respective packages.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
