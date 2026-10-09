import { ChevronRight, Puzzle } from 'lucide-react'
import { clockLabelZh } from '../../shared/time-label'

export function ContextInjectionRow({
  plugin,
  form,
  text,
  timestamp,
}: {
  plugin: string
  form?: string
  text: string
  timestamp?: number
}) {
  const formLabel = form?.trim() || '未声明形式'
  const timeLabel = typeof timestamp === 'number' ? clockLabelZh(timestamp) : null

  return (
    <article className="message dsh-flow-item context-message" data-context-message>
      <details className="context-injection-disclosure">
        <summary
          className="context-injection-summary"
          aria-label={`上下文注入，插件 ${plugin}，形式 ${formLabel}`}
          title={`${plugin} · ${formLabel}`}
        >
          <Puzzle size={15} className="context-injection-icon" aria-hidden="true" />
          <span className="context-injection-label">上下文注入</span>
          <span className="context-injection-plugin">{plugin}</span>
          <span className="context-injection-form">· {formLabel}</span>
          {timeLabel && <time className="context-injection-time">{timeLabel}</time>}
          <ChevronRight size={15} className="context-injection-chevron" aria-hidden="true" />
        </summary>
        <div className="context-injection-body">
          <pre>{text || '（空上下文）'}</pre>
        </div>
      </details>
    </article>
  )
}
