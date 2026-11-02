import { Layers3, MessageSquareText, Sparkles } from 'lucide-react'
import { useState } from 'react'

export function OrchestrationChoiceCard({
  decision,
  onChoose,
}: {
  decision: { confidence: number; reasons: string[] }
  onChoose: (choice: 'single-agent' | 'multi-agent') => Promise<boolean>
}) {
  const [submittingChoice, setSubmittingChoice] = useState<'single-agent' | 'multi-agent' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const choose = async (choice: 'single-agent' | 'multi-agent') => {
    if (submittingChoice) return
    setSubmittingChoice(choice)
    setError(null)
    try {
      if (await onChoose(choice)) return
      setError('选择未能提交，请重试。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '选择未能提交，请重试。')
    }
    setSubmittingChoice(null)
  }

  return (
    <section className="orchestration-choice-card" aria-labelledby="orchestration-choice-title">
      <div className="orchestration-choice-heading">
        <span className="orchestration-choice-icon" aria-hidden="true"><Sparkles size={16} /></span>
        <div>
          <strong id="orchestration-choice-title">检测到跨模块任务</strong>
          <span>建议开启多智能体并行编排？</span>
        </div>
        <small>{Math.round(Math.max(0, Math.min(1, decision.confidence)) * 100)}% 规则置信度</small>
      </div>
      {decision.reasons.length > 0 && (
        <p className="orchestration-choice-reasons">{decision.reasons.join(' · ')}</p>
      )}
      <div className="orchestration-choice-actions">
        <button
          type="button"
          className="orchestration-choice-secondary"
          disabled={submittingChoice !== null}
          onClick={() => void choose('single-agent')}
        >
          <MessageSquareText size={15} />{submittingChoice === 'single-agent' ? '继续中…' : '继续单 Agent'}
        </button>
        <button
          type="button"
          className="orchestration-choice-primary"
          disabled={submittingChoice !== null}
          onClick={() => void choose('multi-agent')}
        >
          <Layers3 size={15} />{submittingChoice === 'multi-agent' ? '正在开启…' : '开启多智能体'}
        </button>
      </div>
      {error && <p className="orchestration-choice-error" role="alert">{error}</p>}
    </section>
  )
}
