import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@taskweaver/dsh-api-remotes',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true },
)
