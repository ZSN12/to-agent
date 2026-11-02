// Type-only extract of the host state sweeper contract (vendor/opencodex/src/lib/state-store-sweeper.ts).
// The host runs the sweeper and hands each store the current configuration generation.

export interface GenerationContext {
  generation: number;
  providerNames: ReadonlySet<string>;
  comboIds: ReadonlySet<string>;
  comboTargets: ReadonlySet<string>;
  codexAccountIds: ReadonlySet<string>;
  oauthAccountKeys: ReadonlySet<string>;
  configRoots: ReadonlySet<string>;
}
