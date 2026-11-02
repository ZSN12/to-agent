import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { TaskVerificationEvidence } from '../../types'
import { AUTO_VERIFICATION_PROMPT_MARKER } from './autoVerification'
import './turn-verification.css'

const STATUS_LABEL: Record<string, string> = {
  passed: '验证通过',
  failed: '验证未通过',
  incomplete: '验证未完成',
  not_run: '未验证',
  skipped: '已跳过验证',
  partial: '部分通过',
}

function commandOutcome(item: NonNullable<TaskVerificationEvidence['commands']>[number]): string {
  if (item.sandboxDenied) return '被沙箱拒绝'
  if (item.timedOut) return '超时'
  if (item.status === 'cancelled') return '已取消'
  if (item.exitCode === null) return '未执行'
  return item.exitCode === 0 ? '通过' : `退出码 ${item.exitCode}`
}

function formatDuration(durationMs?: number): string | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return null
  return durationMs < 1000 ? `${Math.round(durationMs)} ms` : `${(durationMs / 1000).toFixed(1)} s`
}

/** Result of the automatic post-change verification, from runner records only. */
export function TurnVerification({ evidence }: { evidence: TaskVerificationEvidence }) {
  const status = evidence.status ?? (evidence.executed ? (evidence.passed ? 'passed' : 'failed') : 'not_run')
  const healAttempts = evidence.healAttempts ?? 0
  const duration = formatDuration(evidence.durationMs)
  const commands = evidence.commands ?? []
  const detail = status === 'passed'
    ? (healAttempts > 0 ? `经过 ${healAttempts} 轮自动修复后通过` : null)
    : evidence.reason ?? null

  return (
    <div className={`turn-verification is-${status}`} role="status">
      <div className="turn-verification-head">
        <span className="turn-verification-dot" aria-hidden />
        <strong>{STATUS_LABEL[status] ?? '验证状态未知'}</strong>
        {duration && <span className="turn-verification-meta">{duration}</span>}
        {status !== 'passed' && healAttempts > 0 && (
          <span className="turn-verification-meta">已自动修复 {healAttempts} 轮</span>
        )}
      </div>
      {commands.length > 0 && (
        <ul className="turn-verification-commands">
          {commands.map((item, index) => (
            <li key={`${item.command}-${index}`}>
              <code>{item.command}</code>
              <span>{commandOutcome(item)}</span>
            </li>
          ))}
        </ul>
      )}
      {detail && <p className="turn-verification-detail">{detail}</p>}
    </div>
  )
}

/** A repair prompt the verification loop sent on the user's behalf, shown as automatic. */
export function AutoVerificationPromptRow({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [firstLine, ...rest] = text.split('\n')
  const title = firstLine.slice(AUTO_VERIFICATION_PROMPT_MARKER.length).trim()
  return (
    <div className={`auto-verification-prompt${open ? ' is-open' : ''}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <ChevronRight size={13} className="auto-verification-prompt-chevron" aria-hidden />
        <span className="auto-verification-prompt-label">TaskWeaver 自动验证</span>
        {title && <span className="auto-verification-prompt-title">{title}</span>}
      </button>
      {open && <pre className="auto-verification-prompt-body">{rest.join('\n').trim()}</pre>}
    </div>
  )
}
