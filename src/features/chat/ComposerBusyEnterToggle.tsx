import type { BusyEnterMode } from '../../shared/app-api'

/** DSH EnterBehaviorRow 的 Composer 内快捷切换（忙时 Enter = 排队 / 纠偏）。 */
export function ComposerBusyEnterToggle({
  mode,
  onChange,
}: {
  mode: BusyEnterMode
  onChange: (mode: BusyEnterMode) => void
}) {
  return (
    <div className="composer-busy-enter" role="group" aria-label="忙时 Enter 行为">
      <span className="composer-busy-enter-label">忙时 Enter</span>
      <button
        type="button"
        className={`composer-busy-enter-opt ${mode === 'followUp' ? 'active' : ''}`}
        onClick={() => onChange('followUp')}
        title="排队追问（DSH 默认）"
      >
        排队
      </button>
      <button
        type="button"
        className={`composer-busy-enter-opt ${mode === 'steer' ? 'active' : ''}`}
        onClick={() => onChange('steer')}
        title="纠偏当前运行中的 Agent"
      >
        纠偏
      </button>
    </div>
  )
}
