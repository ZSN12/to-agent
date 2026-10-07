import { lazy, Suspense, useEffect, useState } from 'react'
import type { UserQuestionAnswer, UserQuestionPromptPayload } from '../../shared/app-api'
import { makePlanReviewAnswer, readPlanReviewQuestion, type PlanReviewQuestion } from './planReviewQuestion'

const AgentMessageMarkdown = lazy(() => import('./AgentMessageMarkdown').then(module => ({ default: module.AgentMessageMarkdown })))

type DraftAnswer = { selected: string[]; custom: string }

export function UserQuestionPanel({
  prompt,
  onAnswer,
  onDiscuss,
}: {
  prompt: UserQuestionPromptPayload
  onAnswer: (id: string, answer: UserQuestionAnswer) => Promise<boolean>
  onDiscuss?: (id: string) => Promise<boolean>
}) {
  const [drafts, setDrafts] = useState<Record<string, DraftAnswer>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setDrafts(Object.fromEntries(prompt.questions.map(question => [question.id, { selected: [], custom: '' }])))
    setSubmitting(false)
  }, [prompt.id, prompt.questions])

  const update = (questionId: string, next: DraftAnswer) => {
    setDrafts(current => ({ ...current, [questionId]: next }))
  }

  const complete = prompt.questions.every(question => {
    const answer = drafts[question.id]
    return Boolean(answer && (answer.selected.length || answer.custom.trim()))
  })

  const submit = async () => {
    if (!complete || submitting) return
    setSubmitting(true)
    const answer = {
      answers: prompt.questions.map(question => {
        const draft = drafts[question.id]
        return {
          id: question.id,
          selected: draft.selected,
          ...(draft.custom.trim() ? { custom: draft.custom.trim() } : {}),
        }
      }),
    }
    if (!await onAnswer(prompt.id, answer)) setSubmitting(false)
  }

  const planReview = readPlanReviewQuestion(prompt.questions)
  if (planReview) {
    return <PlanReviewCard prompt={prompt} review={planReview} onAnswer={onAnswer} onDiscuss={onDiscuss} />
  }

  return (
    <section className="user-question-panel" role="dialog" aria-labelledby="user-question-title">
      <header className="user-question-panel-head">
        <strong id="user-question-title">
          {prompt.questions.some(question => question.intent?.kind === 'plan-review') ? '请审阅计划' : 'Agent 需要你的回答'}
        </strong>
        <span>{prompt.questions.length > 1 ? `${prompt.questions.length} 个问题` : '回答后任务将继续'}</span>
      </header>
      <div className="user-question-list">
        {prompt.questions.map((question, index) => {
          const draft = drafts[question.id] ?? { selected: [], custom: '' }
          const options = question.options ?? []
          return (
            <fieldset className="user-question-item" key={question.id}>
              {question.header && <legend>{question.header}</legend>}
              <p className="user-question-title">{question.question}</p>
              {question.detail && <pre className="user-question-detail">{question.detail}</pre>}
              {options.length > 0 && (
                <div className="user-question-options">
                  {options.map(option => {
                    const checked = draft.selected.includes(option.label)
                    return (
                      <label className={`user-question-option${checked ? ' is-selected' : ''}`} key={option.label}>
                        <input
                          type={question.multiSelect ? 'checkbox' : 'radio'}
                          name={`${prompt.id}-${question.id}`}
                          checked={checked}
                          onChange={() => update(question.id, {
                            selected: question.multiSelect
                              ? checked ? draft.selected.filter(value => value !== option.label) : [...draft.selected, option.label]
                              : [option.label],
                            custom: question.multiSelect ? draft.custom : '',
                          })}
                        />
                        <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              <textarea
                aria-label={`问题 ${index + 1} 的补充回答`}
                placeholder={options.length ? '补充说明（可选）' : '输入你的回答'}
                value={draft.custom}
                onChange={event => update(question.id, {
                  selected: question.multiSelect ? draft.selected : [],
                  custom: event.target.value,
                })}
                rows={2}
              />
            </fieldset>
          )
        })}
      </div>
      <footer className="user-question-actions">
        <button type="button" className="approval-btn allow" disabled={!complete || submitting} onClick={() => void submit()}>
          {submitting ? '正在提交…' : '提交回答并继续'}
        </button>
      </footer>
    </section>
  )
}

function PlanReviewCard({
  prompt,
  review,
  onAnswer,
  onDiscuss,
}: {
  prompt: UserQuestionPromptPayload
  review: PlanReviewQuestion
  onAnswer: (id: string, answer: UserQuestionAnswer) => Promise<boolean>
  onDiscuss?: (id: string) => Promise<boolean>
}) {
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const discuss = async () => {
    if (!onDiscuss || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      if (await onDiscuss(prompt.id)) return
      setError('暂时无法返回对话，请重试。')
    } catch (cause) {
      setError(cause instanceof Error ? `暂时无法返回对话：${cause.message}` : '暂时无法返回对话，请重试。')
    }
    setSubmitting(false)
  }

  const decide = async (decision: 'approve' | 'keep-planning') => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const accepted = await onAnswer(prompt.id, makePlanReviewAnswer(review, decision, feedback))
      if (accepted) return
      setError('提交失败，请重试。')
    } catch (cause) {
      setError(cause instanceof Error ? `提交失败：${cause.message}` : '提交失败，请重试。')
    }
    setSubmitting(false)
  }

  return (
    <section className="user-question-panel plan-review-panel" role="dialog" aria-labelledby="plan-review-title">
      <header className="user-question-panel-head plan-review-head">
        <strong id="plan-review-title">请审阅执行计划</strong>
        <span>批准后 Agent 才会开始执行</span>
      </header>
      <p className="plan-review-question">{review.question}</p>
      <div className="plan-review-body" aria-label="待审阅的计划">
        <Suspense fallback={<pre className="plan-review-plain-fallback">{review.plan}</pre>}>
          <AgentMessageMarkdown text={review.plan} />
        </Suspense>
      </div>
      <label className="plan-review-feedback-label" htmlFor={`plan-review-feedback-${prompt.id}`}>
        需要调整？写下意见后选择“继续规划”
      </label>
      <textarea
        id={`plan-review-feedback-${prompt.id}`}
        className="plan-review-feedback"
        value={feedback}
        disabled={submitting}
        onChange={event => setFeedback(event.target.value)}
        placeholder="可选：指出需要修改的内容"
        rows={2}
      />
      {error && <p className="plan-review-error" role="alert">{error}</p>}
      <footer className="plan-review-actions">
        {onDiscuss && (
          <button
            type="button"
            className="approval-btn always"
            disabled={submitting}
            onClick={() => void discuss()}
          >
            讨论
          </button>
        )}
        <button
          type="button"
          className="approval-btn deny"
          disabled={submitting}
          title={review.keepPlanning.description}
          onClick={() => void decide('keep-planning')}
        >
          {submitting ? '正在提交…' : '继续规划'}
        </button>
        <button
          type="button"
          className="approval-btn allow"
          disabled={submitting}
          title={review.approve.description}
          onClick={() => void decide('approve')}
        >
          {submitting ? '正在提交…' : '批准并执行'}
        </button>
      </footer>
    </section>
  )
}
