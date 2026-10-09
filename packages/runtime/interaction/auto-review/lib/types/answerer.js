/**
 * The auto-review answerer: a prepend listener on the `approval/request`
 * waterfall that runs the reviewer and maps its outcome onto an
 * {@link ApprovalOutcome}, failing closed. Enforcement stays with the approval
 * service — this listener only recommends, and only for requests it is
 * configured to judge.
 * @module @z/dsh-auto-review
 */
import { classify, decide } from "./policy.js";
import "./session-events.js";
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
export function answerer(policy, reviewer, enabled) {
    return async (req, next) => {
        if (!enabled)
            return next();
        try {
            const categories = classify(req.toolName, req.reason);
            const outcome = await reviewer.run({ toolName: req.toolName, ...req.reason !== undefined ? { reason: req.reason } : {} }, req.agent, req.signal ?? abortedNever());
            const verdict = decide(policy, outcome.risk, categories);
            // Review decisions are log-only audit records appended to the owning
            // session, mirroring the approval/asked + approval/decided pair; nothing
            // here is a SurfaceEventType.
            req.agent.session.append('approval/review', {
                toolName: req.toolName,
                risk: outcome.risk,
                decision: outcome.decision,
                verdict,
                ...outcome.reason !== undefined ? { reason: outcome.reason } : {},
            });
            if (verdict === 'allow')
                return 'allowed-once';
            if (verdict === 'deny')
                return 'rejected';
            return next();
        }
        catch {
            // Reviewer failure or a denied structure fails closed to a human.
            return next();
        }
    };
}
/** A never-cancelled signal for approval requests that carry none. */
function abortedNever() {
    return new AbortController().signal;
}
//# sourceMappingURL=answerer.js.map