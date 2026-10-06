import { useEffect, useState } from 'react'
import type { UserQuestionAnswer, UserQuestionPromptPayload } from '../../shared/app-api'

type DraftAnswer = { selected: string[]; custom: string }

export function UserQuestionPanel({
  prompt,
  onAnswer,
}: {
  prompt: UserQuestionPromptPayload
  onAnswer: (id: string, answer: UserQuestionAnswer) => Promise<boolean>
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
