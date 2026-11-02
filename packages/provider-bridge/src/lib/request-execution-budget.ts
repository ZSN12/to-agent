// Type-only extract of the host's send budget (vendor/opencodex/src/lib/request-execution-budget.ts).
// The budget object is created by the host; provider-bridge only reserves dispatches against it,
// so this declares the part of that contract the bridge calls.
import type { TransientSendBudget } from "./upstream-retry";

export type SendClass =
  | "initial"
  | "transient"
  | "auth-recovery"
  | "repair"
  | "account-failover"
  | "combo-failover"
  | "prewarm";

export type BudgetDenial =
  | "total-exhausted"
  | "base-allowance-exhausted"
  | "final-recovery-spent"
  | "alternate-target-exhausted"
  | "target-transition-exhausted"
  | "spend-exhausted"
  | "not-replay-safe";

export interface DispatchIntent {
  readonly sendClass: SendClass;
  readonly targetKey: string;
  readonly replaySafe?: boolean;
}

export interface SingleUseDispatchPermit {
  readonly sendClass: SendClass;
  /** Confirm the dispatch this permit paid for; a second call returns false. */
  use(): boolean;
  /** Hand back a reservation that never dispatched. */
  release(): void;
}

export type DispatchDecision =
  | { allowed: true; permit: SingleUseDispatchPermit }
  | { allowed: false; reason: BudgetDenial };

export interface RequestExecutionBudget extends TransientSendBudget {
  readonly logicalRequestId: string;
  reserveDispatch(intent: DispatchIntent): DispatchDecision;
}
