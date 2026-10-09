/**
 * Session-event augmentation for auto-review: the `approval/review` log-only
 * audit record appended to the owning session when a reviewer renders a verdict.
 * @module @z/dsh-auto-review
 */
import type { RiskLevel, ReviewDecision } from './types.ts';
declare module '@z/dsh-session/types' {
    interface SessionEventMap {
        /**
         * A reviewer verdict for one approval request — log-only audit (like
         * `hook/*`; NOT a surface event, carries no `surfaceOp`). `decision` is the
         * reviewer's raw posture; `verdict` is the policy-mapped outcome that drove
         * the answerer's `allowed-once`/`rejected`/delegate. `reason` is the
         * model-safe rationale when the reviewer supplied one.
         */
        'approval/review': {
            toolName: string;
            risk: RiskLevel;
            decision: ReviewDecision;
            verdict: 'allow' | 'deny' | 'defer';
            reason?: string;
        };
    }
}
export type {};
//# sourceMappingURL=session-events.d.ts.map