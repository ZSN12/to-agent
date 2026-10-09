/**
 * The auto-review answerer: a prepend listener on the `approval/request`
 * waterfall that runs the reviewer and maps its outcome onto an
 * {@link ApprovalOutcome}, failing closed. Enforcement stays with the approval
 * service — this listener only recommends, and only for requests it is
 * configured to judge.
 * @module @z/dsh-auto-review
 */
import type { ApprovalOutcome, ApprovalRequest } from '@z/dsh-user-approval';
import './session-events.ts';
import type { ReviewPolicy, Reviewer } from './types.ts';
/**
 * Build the `approval/request` prepend listener.
 *
 * The listener is enabled only when the reviewer is configured on; because the
 * approval service dispatches `approval/request` only under an interactive
 * (`ask`) session policy, sandboxed work that never raises an approval request
 * is never routed through a reviewer. It classifies the request, runs the
 * reviewer, then maps the outcome through {@link decide}: `allow` authorizes
 * once, `deny` rejects, and anything else (defer, low-risk no-rule, mismatch,
 * or reviewer failure) delegates via `next()` to the human answerers. A thrown
 * reviewer always fails closed.
 *
 * @param policy - the configured review policy.
 * @param reviewer - the reviewer executor seam.
 * @param enabled - whether review mode is active for this listener.
 * @returns the `approval/request` waterfall listener.
 */
export declare function answerer(policy: ReviewPolicy, reviewer: Reviewer, enabled: boolean): (req: ApprovalRequest, next: () => Promise<ApprovalOutcome>) => Promise<ApprovalOutcome>;
//# sourceMappingURL=answerer.d.ts.map