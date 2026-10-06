import { useCallback, useEffect, useState } from 'react'
import { Check, CornerDownLeft, ListPlus, MessageSquare } from 'lucide-react'
import type { BusyEnterMode } from '../../shared/app-api'

function getBridge() {
  return window.taskweaver
}

export function ChatBehaviorSettingsPanel({ onToast }: { onToast?: (msg: string) => void }) {
  const [busyEnter, setBusyEnter] = useState<BusyEnterMode>('followUp')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const bridge = getBridge()
    void bridge?.models?.getBusyEnterMode?.().then((res) => {
      if (res?.ok) setBusyEnter(res.data)
      setLoading(false)
    })
  }, [])

  const save = useCallback(async (mode: BusyEnterMode) => {
    const bridge = getBridge()
    if (!bridge?.models?.setBusyEnterMode) return
    const res = await bridge.models.setBusyEnterMode(mode)
    if (!res.ok) {
      onToast?.(res.error || '保存失败')
      return
    }
    setBusyEnter(res.data)
    onToast?.(mode === 'followUp' ? '已设为：忙时 Enter 加入排队追问（Z 默认）' : '已设为：忙时 Enter 发送纠偏')
  }, [onToast])

  return (
    <div className="settings-panel chat-behavior-settings">
      <header className="chat-behavior-header">
        <h2>对话行为</h2>
        <p>配置 Agent 回复期间按 Enter 时的消息行为；工具预设由系统按任务自动选择。</p>
      </header>
      <section className="chat-enter-section">
        <div className="chat-enter-section-heading">
          <MessageSquare size={16} aria-hidden />
          <div>
            <h3>忙时按 Enter</h3>
            <p>可随时切换；设置会保存并同步到输入框。</p>
          </div>
        </div>
        <div className="chat-enter-options" role="radiogroup" aria-label="忙时按 Enter 的行为">
          <button
            type="button"
            role="radio"
            aria-checked={busyEnter === 'followUp'}
            className={`chat-enter-choice ${busyEnter === 'followUp' ? 'is-active' : ''}`}
            disabled={loading}
            onClick={() => void save('followUp')}
          >
            <span className="chat-enter-choice-icon"><ListPlus size={18} /></span>
            <span className="chat-enter-choice-copy">
              <span className="chat-enter-choice-title">排队追问</span>
              <span className="chat-enter-choice-description">当前回复结束后，再执行这条消息。</span>
            </span>
            <span className="chat-enter-choice-state">{busyEnter === 'followUp' && <><Check size={13} /> 当前</>}</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={busyEnter === 'steer'}
            className={`chat-enter-choice ${busyEnter === 'steer' ? 'is-active' : ''}`}
            disabled={loading}
            onClick={() => void save('steer')}
          >
            <span className="chat-enter-choice-icon"><CornerDownLeft size={18} /></span>
            <span className="chat-enter-choice-copy">
              <span className="chat-enter-choice-title">纠偏当前任务</span>
              <span className="chat-enter-choice-description">将新指令发给正在运行的 Agent。</span>
            </span>
            <span className="chat-enter-choice-state">{busyEnter === 'steer' && <><Check size={13} /> 当前</>}</span>
          </button>
        </div>
      </section>
    </div>
  )
}
