import { useCallback, useEffect, useState } from 'react'
import { Check, CornerDownLeft, ListPlus, MessageSquare } from 'lucide-react'
import type { BusyEnterMode } from '../../shared/app-api'

function getBridge() {
  return window.taskweaver
}

export function ChatBehaviorSettingsPanel({ onToast }: { onToast?: (msg: string) => void }) {
  const [busyEnter, setBusyEnter] = useState<BusyEnterMode>('followUp')
  const [loading, setLoading] = useState(true)
  const [selfHealingLoop, setSelfHealingLoop] = useState(false)
  const [preferencesLoading, setPreferencesLoading] = useState(true)

  useEffect(() => {
    const bridge = getBridge()
    let cancelled = false
    void Promise.all([
      bridge?.models?.getBusyEnterMode?.(),
      bridge?.preferences?.get?.(),
    ]).then(([busyEnterResult, preferencesResult]) => {
      if (cancelled) return
      if (busyEnterResult?.ok) setBusyEnter(busyEnterResult.data)
      if (preferencesResult?.ok) setSelfHealingLoop(preferencesResult.data.selfHealingLoop === true)
    }).catch(() => {
      // Keep safe defaults if the settings bridge is temporarily unavailable.
    }).finally(() => {
      if (cancelled) return
      setLoading(false)
      setPreferencesLoading(false)
    })
    return () => { cancelled = true }
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

  const saveSelfHealingLoop = useCallback(async () => {
    const next = !selfHealingLoop
    const bridge = getBridge()
    if (!bridge?.preferences?.set) return
    const res = await bridge.preferences.set({ selfHealingLoop: next })
    if (!res.ok) {
      onToast?.(res.error || '保存失败')
      return
    }
    setSelfHealingLoop(res.data.selfHealingLoop === true)
    onToast?.(next ? '已开启：代码修改后自动运行项目验证与修复' : '已关闭自动验证与静默修复')
  }, [onToast, selfHealingLoop])

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
      <section className="chat-enter-section">
        <div className="chat-enter-section-heading">
          <Check size={16} aria-hidden />
          <div>
            <h3>自动验证与修复</h3>
            <p>代码变更后运行项目验证命令；失败时允许 Agent 自动修复重试。命令来自项目配置，默认关闭。</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={selfHealingLoop}
          className={`chat-self-healing-toggle ${selfHealingLoop ? 'is-active' : ''}`}
          disabled={preferencesLoading}
          onClick={() => void saveSelfHealingLoop()}
        >
          <span>{selfHealingLoop ? '已开启' : '已关闭'}</span>
          <span className="chat-self-healing-toggle-state">{preferencesLoading ? '读取中…' : '切换设置'}</span>
        </button>
      </section>
    </div>
  )
}
