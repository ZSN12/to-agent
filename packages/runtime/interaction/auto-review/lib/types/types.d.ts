/**
 * Type-only vocabulary for the auto-review capability: the reviewer's structured
 * outcome, the policy rules that gate it, and the seam contract a reviewer
 * executor must satisfy. No runtime code lives here.
 * @module @z/dsh-auto-review
 */
import type { Agent } from '@z/dsh-agent';
/** Risk grades a reviewer or policy may attach to a reviewed request. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
/** A reviewer's terminal posture toward one approval request. */
export type ReviewDecision = 'allow' | 'deny' | 'defer';
/**
 * The threat categories a policy rule classifies. Mirrors the reviewer's
 * evaluation lens (data exfiltration, credential probing, destructive actions,
 * persistent weakening of guardrails) without exposing secrets to the model.
 */
export type ReviewCategory = 'exfiltration' | 'credential-probing' | 'destructive' | 'persistent-weakening';
/** A reviewer's structured conclusion for one request. */
export interface ReviewOutcome {
    readonly risk: RiskLevel;
    readonly decision: ReviewDecision;
    /** Human-readable, model-safe rationale (never policy internals or secrets). */
    readonly reason?: string;
}
/** One policy rule: which categories at or above a risk floor it decides. */
export interface ReviewPolicyRule {
    /** Stable identifier for diagnostics and future per-rule overrides. */
    id: string;
    /** The threat categories this rule may decide on. */
    categories: ReviewCategory[];
    /** The lowest risk this rule may decide on its own. */
    minRisk: RiskLevel;
    /** Verdict when a request matches this rule: `allow` or `deny`. */
    decision: 'allow' | 'deny';
}
/**
 * The configured auto-review policy: a rule list plus a closed fallback. Rules
 * are evaluated in order; an `allow` rule authorizes only when the request's
 * risk is at or above the rule's `minRisk` and one of its categories matches —
 * anything else defers to a human (the reviewer never exceeds its mandate).
 */
export interface ReviewPolicy {
    /** Policy rules, evaluated in declaration order until one matches. */
    rules: ReviewPolicyRule[];
    /** Decision when no rule matches: `deny` fails closed, `defer` asks a human. */
    noMatch: 'deny' | 'defer';
}
/**
 * The structured, sanitized input handed to a reviewer: enough to judge an
 * approval request without exposing tool arguments, credentials, or policy
 * internals.
 */
export interface ReviewRequest {
    /** The tool that triggered the approval request. */
    readonly toolName: string;
    /** The approval request's own reason, if any. */
    readonly reason?: string;
}
/**
 * The reviewer executor seam. The real implementation drives a one-shot
 * subagent through `ctx.subagents`; tests inject a scripted substitute. The
 * executor is responsible for producing a structured {@link ReviewOutcome} or
 * throwing, in which case the answerer fails closed. The spawning parent is
 * passed per call so each approval request's agent seeds the reviewer child.
 */
export interface Reviewer {
    readonly run: (request: ReviewRequest, parent: Agent, signal: AbortSignal) => Promise<ReviewOutcome>;
}
//# sourceMappingURL=types.d.ts.map