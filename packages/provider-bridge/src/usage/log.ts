// Type-only extract of the usage-log recovery vocabulary (vendor/opencodex/src/usage/telemetry-contract.ts).
// provider-bridge reports physical sends to the host with these kinds; the host owns the log itself.

export type AttemptRecoveryKind =
  | "transient-5xx"
  | "connection-reset"
  | "oauth-401"
  | "oauth-account-403"
  | "key-401"
  | "key-429"
  | "rate-limit-429"
  | "anthropic-oauth-429"
  | "oauth-account-429"
  | "image-413"
  | "console-go-upload-retry"
  | "opaque-blob-rejection"
  | "empty-completion"
  | "reasoning-effort-downgrade"
  | "anthropic-fast-downgrade";

export type AttemptRecoveryWithheld = "retry-send-budget" | "rotation-send-budget";
