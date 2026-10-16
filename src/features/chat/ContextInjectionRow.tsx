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
  const isRuntimeSnapshot = plugin === '@taskweaver/dsh-system-prompt' && form === 'snapshot'
  const label = isRuntimeSnapshot ? '运行上下文' : '上下文注入'
  const sourceLabel = isRuntimeSnapshot ? 'Host 自动更新' : plugin
  const formLabel = isRuntimeSnapshot ? '快照' : form?.trim() || '未声明形式'
  const timeLabel = typeof timestamp === 'number' ? clockLabelZh(timestamp) : null

  return (
    <article className="message dsh-flow-item context-message" data-context-message>
      <details className="context-injection-disclosure">
        <summary
          className="context-injection-summary"
          aria-label={`${label}，来源 ${sourceLabel}，形式 ${formLabel}`}
          title={isRuntimeSnapshot
            ? 'Host 提供给模型的运行上下文；内容变化时记录新快照'
            : `${plugin} · ${formLabel}`}
        >
          <Puzzle size={15} className="context-injection-icon" aria-hidden="true" />
          <span className="context-injection-label">{label}</span>
          <span className="context-injection-plugin">{sourceLabel}</span>
          <span className="context-injection-form">· {formLabel}</span>
          {timeLabel && <time className="context-injection-time">{timeLabel}</time>}
          <ChevronRight size={15} className="context-injection-chevron" aria-hidden="true" />
        </summary>
        <div className="context-injection-body">
          {isRuntimeSnapshot && <p>这是 Host 提供给模型的动态运行上下文，只在内容变化时记录快照。</p>}
          <pre>{text || '（空上下文）'}</pre>
        </div>
      </details>
    </article>
  )
}
