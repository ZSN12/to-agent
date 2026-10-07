/**
 * Runtime invariants for @z/dsh-tool-cache.
 *
 * No runtime invariant: tool cache is ephemeral per-session state.
 * Cache correctness is validated through functional tests (cache hit/miss behavior,
 * invalidation after writes, session isolation).
 */

import { register } from '@z/dsh-runtime-diagnostics-invariants'

register('@z/dsh-tool-cache', () => {
  // No persistent state or cross-session relationships to validate
})
