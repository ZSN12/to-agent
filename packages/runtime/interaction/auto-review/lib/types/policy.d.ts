/**
 * Policy evaluation for auto-review: classify a reviewer's risk against the
 * configured rules and decide whether the reviewer may authorize on its own, or
 * whether the request must fall back to a human. Enforcement stays with the
 * approval service; this module only recommends.
 * @module @z/dsh-auto-review
 */
import type { ReviewCategory, ReviewDecision, ReviewPolicy, RiskLevel } from './types.ts';
/**
 * Map a reviewer outcome to an allowed policy decision.
 *
 * A reviewer may only end with `allow` when a rule names one of the request's
 * categories AND the reviewer's risk is at or above the rule's floor AND the
 * rule decides `allow` — the authorization boundary that stops a reviewer from
 * green-lighting a high-destructive action on a laxer rule. `deny` is honored
 * only when a `deny` rule covers the category at the risk floor. Anything else
 * (a low-risk request that no rule authorizes, a mismatch, or `defer`) falls
 * back to a human.
 *
 * @param policy - the configured rules and no-match fallback.
 * @param risk - the reviewer's risk grade.
 * @param categories - the categories the reviewed request exhibits.
 * @returns `allow`, `deny`, or `defer` (delegate to a human).
 */
export declare function decide(policy: ReviewPolicy, risk: RiskLevel, categories: readonly ReviewCategory[]): ReviewDecision;
/**
 * Classify a request's threat categories. The answerer feeds the tool name and
 * the approval reason through here to build the reviewer's input lens. A
 * destructive or credential-adjacent keyword raises the request to the
 * corresponding category so policy rules can key on it.
 *
 * @param toolName - the tool that triggered the approval request.
 * @param reason - the approval request's reason, if any.
 * @returns the threat categories the request exhibits (possibly empty).
 */
export declare function classify(toolName: string, reason: string | undefined): readonly ReviewCategory[];
//# sourceMappingURL=policy.d.ts.map