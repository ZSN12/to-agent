// Type-only extract of the provider registry vocabulary (vendor/opencodex/src/providers/registry/types.ts).

export type ProviderAuthKind = "forward" | "oauth" | "key" | "local";

/**
 * Wire protocol a client spoke when it reached the proxy. Chat and Anthropic surfaces
 * translate into a Responses-shaped body, so the original inbound travels with the request.
 */
export type InboundWire = "responses" | "chat" | "anthropic";

/**
 * A per-model wire default: a bare string applies to every inbound, while the object
 * form may scope the default to listed inbound protocols and authentication modes.
 */
export type ModelWireDefault = string | {
  wire: string;
  inbound: readonly InboundWire[];
  authModes?: readonly ProviderAuthKind[];
  /** Whether this registry-selected route may relay a caller-owned service_tier. */
  forwardCallerServiceTier?: boolean;
};
