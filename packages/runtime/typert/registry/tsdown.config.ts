import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@taskweaver/dsh-typert-registry',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true },
)
