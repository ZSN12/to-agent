/** Model-visible continuation prompt for one same-session goal round. */
import type { ContentBlock } from '@z/dsh-llm';
import type { GoalView } from '@z/dsh-goal';
/**
 * Render the complete goal-round instruction retained in session history.
 * @param goal - exact active goal revision being admitted.
 * @param round - next positive round number.
 * @returns a fresh one-block prompt for `Agent.followup()`.
 */
export declare function renderGoalRoundPrompt(goal: GoalView, round: number): ContentBlock[];
//# sourceMappingURL=prompt.d.ts.map