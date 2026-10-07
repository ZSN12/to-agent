import type { UserQuestionAnswer, UserQuestionItem } from '../../shared/app-api'

export type PlanReviewQuestion = {
  id: string
  question: string
  plan: string
  approve: { label: string; description?: string }
  keepPlanning: { label: string; description?: string }
}

/** Narrow only a complete binary Host plan-review prompt; leave all other prompts generic. */
export function readPlanReviewQuestion(questions: readonly UserQuestionItem[]): PlanReviewQuestion | null {
  if (questions.length !== 1) return null
  const question = questions[0]
  if (!question || question.intent?.kind !== 'plan-review' || !question.detail || question.multiSelect === true) return null

  const options = question.options ?? []
  if (options.length !== 2) return null
  const approve = options.find(option => option.label === question.intent?.approve)
  const keepPlanning = options.find(option => option.label !== question.intent?.approve)
  if (!approve || !keepPlanning) return null

  return {
    id: question.id,
    question: question.question,
    plan: question.detail,
    approve,
    keepPlanning,
  }
}

/** Preserve the Host-owned option labels; feedback is meaningful only when asking the Agent to revise. */
export function makePlanReviewAnswer(
  review: PlanReviewQuestion,
  decision: 'approve' | 'keep-planning',
  feedback = '',
): UserQuestionAnswer {
  const isApproval = decision === 'approve'
  const note = feedback.trim()
  return {
    answers: [{
      id: review.id,
      selected: [isApproval ? review.approve.label : review.keepPlanning.label],
      ...(!isApproval && note ? { custom: note } : {}),
    }],
  }
}
