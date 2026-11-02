import { useCallback, useEffect, useState } from 'react'
import { Check, MessageSquare } from 'lucide-react'
import { SettingsLayout } from '../settings/SettingsLayout'

function getBridge() {
  return window.taskweaver
}

export function ChatBehaviorSettingsPanel({ onToast }: { onToast?: (msg: string) => void }) {
  const [selfHealingLoop, setSelfHealingLoop] = useState(true)
  const [enableRepoMap, setEnableRepoMap] = useState(true)
  const [inlineSmallFileReferences, setInlineSmallFileReferences] = useState(false)
  const [compactionThresholdRatio, setCompactionThresholdRatio] = useState(0.8)
  const [savingCompactionThreshold, setSavingCompactionThreshold] = useState(false)
  const [selfHealingMaxRetries, setSelfHealingMaxRetries] = useState(2)
  const [preferencesLoading, setPreferencesLoading] = useState(true)

  useEffect(() => {
    const bridge = getBridge()
    let cancelled = false
    void Promise.resolve(bridge?.preferences?.get?.()).then((preferencesResult) => {
      if (cancelled) return
      if (preferencesResult?.ok) {
        setSelfHealingLoop(preferencesResult.data.selfHealingLoop !== false)
        setEnableRepoMap(preferencesResult.data.enableRepoMap !== false)
        setInlineSmallFileReferences(preferencesResult.data.inlineSmallFileReferences === true)
        const threshold = Number(preferencesResult.data.compactionThresholdRatio)
        setCompactionThresholdRatio(Number.isFinite(threshold) ? Math.min(0.9, Math.max(0.6, threshold)) : 0.8)
        const retries = Number(preferencesResult.data.selfHealingMaxRetries)
        setSelfHealingMaxRetries(Number.isFinite(retries) ? Math.max(1, Math.min(3, retries)) : 2)
      }
    }).catch(() => {
      // Keep safe defaults if the settings bridge is temporarily unavailable.
    }).finally(() => {
      if (cancelled) return
      setPreferencesLoading(false)
    })
    return () => { cancelled = true }
  }, [])

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

  const saveEnableRepoMap = useCallback(async () => {
    const next = !enableRepoMap
    const bridge = getBridge()
    if (!bridge?.preferences?.set) return
    const res = await bridge.preferences.set({ enableRepoMap: next })
    if (!res.ok) {
      onToast?.(res.error || '保存失败')
      return
    }
    setEnableRepoMap(res.data.enableRepoMap !== false)
    onToast?.(next ? '已开启：首轮注入仓库结构图' : '已关闭仓库结构图注入')
  }, [enableRepoMap, onToast])

  const saveInlineSmallFileReferences = useCallback(async () => {
    const next = !inlineSmallFileReferences
    const bridge = getBridge()
    if (!bridge?.preferences?.set) return
    const res = await bridge.preferences.set({ inlineSmallFileReferences: next })
    if (!res.ok) {
      onToast?.(res.error || '保存失败')
      return
    }
    setInlineSmallFileReferences(res.data.inlineSmallFileReferences === true)
    onToast?.(next ? '已开启：小于 4 KiB 的文本文件会随 @file 引用内联' : '已关闭：@file 默认只发送路径引用')
  }, [inlineSmallFileReferences, onToast])

  const saveCompactionThreshold = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.preferences?.set) return
    setSavingCompactionThreshold(true)
    try {
      const res = await bridge.preferences.set({ compactionThresholdRatio })
      if (!res.ok) {
        onToast?.(res.error || '保存压缩阈值失败')
        return
      }
      const applied = Number(res.data.compactionThresholdRatio)
      setCompactionThresholdRatio(Number.isFinite(applied) ? applied : 0.8)
      onToast?.(`自动压缩阈值已应用：${Math.round((Number.isFinite(applied) ? applied : 0.8) * 100)}%`)
    } finally {
      setSavingCompactionThreshold(false)
    }
  }, [compactionThresholdRatio, onToast])

  const saveSelfHealingMaxRetries = useCallback(async (value: number) => {
    const next = Math.max(1, Math.min(3, Math.round(value)))
    const bridge = getBridge()
    if (!bridge?.preferences?.set) return
    const res = await bridge.preferences.set({ selfHealingMaxRetries: next })
    if (!res.ok) {
      onToast?.(res.error || '保存失败')
      return
    }
    setSelfHealingMaxRetries(next)
    onToast?.(`自动修复最多重试次数：${next}`)
  }, [onToast])

  return (
    <SettingsLayout
      title="对话行为"
      description="配置自动验证、上下文与发送消息的行为。"
      className="settings-panel chat-behavior-settings"
    >
      <section className="chat-enter-section">
        <div className="chat-enter-section-heading">
          <MessageSquare size={16} aria-hidden />
          <div>
            <h3>回复期间发送消息</h3>
            <p>按 Enter 会将消息排队，当前回复结束后再发送。</p>
          </div>
        </div>
      </section>
      <section className="chat-enter-section">
        <div className="chat-enter-section-heading">
          <Check size={16} aria-hidden />
          <div>
            <h3>自动验证与修复</h3>
            <p>代码变更后运行项目的检查与聚焦测试（与 Agent 的命令相同的沙箱），未通过时让 Agent 自动修复并重新验证，结果显示在回复下方。仅在受信任且非只读的工作区运行，默认开启。</p>
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
      <section className="chat-enter-section">
        <div className="chat-enter-section-heading">
          <Check size={16} aria-hidden />
          <div>
            <h3>上下文与自愈</h3>
            <p>控制自动压缩阈值、Prompt Pipeline 仓库结构图注入，以及验证失败后的重试上限。</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enableRepoMap}
          className={`chat-self-healing-toggle ${enableRepoMap ? 'is-active' : ''}`}
          disabled={preferencesLoading}
          onClick={() => void saveEnableRepoMap()}
        >
          <span>{enableRepoMap ? '仓库结构图：开' : '仓库结构图：关'}</span>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={inlineSmallFileReferences}
          className={`chat-self-healing-toggle ${inlineSmallFileReferences ? 'is-active' : ''} chat-inline-reference-toggle`}
          disabled={preferencesLoading}
          onClick={() => void saveInlineSmallFileReferences()}
        >
          <span>{inlineSmallFileReferences ? '小文件内联：开' : '小文件内联：关'}</span>
          <span className="chat-self-healing-toggle-state">{preferencesLoading ? '读取中…' : '切换设置'}</span>
        </button>
        <p className="chat-small-file-hint">
          默认只发送工作区相对路径；开启后仅内联小于 4 KiB 的 UTF-8 文本，并附文件修改时间。
        </p>
        <label className="chat-compaction-setting">
          <span>自动压缩阈值：{Math.round(compactionThresholdRatio * 100)}%</span>
          <input
            type="range"
            min={0.6}
            max={0.9}
            step={0.05}
            value={compactionThresholdRatio}
            disabled={preferencesLoading || savingCompactionThreshold}
            onChange={(event) => setCompactionThresholdRatio(Number(event.target.value))}
            aria-label="自动压缩阈值"
          />
          <span className="chat-compaction-help">
            按当前模型上下文窗口的比例触发；保存后需要重启本机运行时。范围 60%–90%。
          </span>
        </label>
        <button
          type="button"
          className="chat-self-healing-toggle chat-compaction-save"
          disabled={preferencesLoading || savingCompactionThreshold}
          onClick={() => void saveCompactionThreshold()}
        >
          <span>{savingCompactionThreshold ? '正在应用…' : '保存并应用压缩阈值'}</span>
        </button>
        <label className="chat-retry-setting">
          <span>自愈最多重试（1–3）</span>
          <input
            type="number"
            min={1}
            max={3}
            step={1}
            value={selfHealingMaxRetries}
            disabled={preferencesLoading}
            onChange={(e) => {
              const parsed = Number(e.target.value)
              if (Number.isFinite(parsed)) setSelfHealingMaxRetries(parsed)
            }}
            onBlur={() => { void saveSelfHealingMaxRetries(selfHealingMaxRetries) }}
            className="chat-retry-input"
          />
        </label>
      </section>
    </SettingsLayout>
  )
}
