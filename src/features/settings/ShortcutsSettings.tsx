import { useEffect, useMemo, useState } from 'react'
import { Command, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react'
import { DEFAULT_SHORTCUTS, parseEventToKeys, type ShortcutItem } from '../../shared/shortcuts'

export function ShortcutsSettings({
  shortcuts,
  onUpdateShortcuts,
  onToast,
}: {
  shortcuts: ShortcutItem[]
  onUpdateShortcuts: (next: ShortcutItem[]) => void
  onToast: (message: string) => void
}) {
  const [search, setSearch] = useState('')
  const [recordingId, setRecordingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return shortcuts
    return shortcuts.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.keys.join('').toLowerCase().includes(q)
    )
  }, [shortcuts, search])

  // 监听物理按键录制
  useEffect(() => {
    if (!recordingId) return

    const handleRecordKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // 按 Esc 键取消录制
      if (e.key === 'Escape') {
        setRecordingId(null)
        onToast('已取消按键录制')
        return
      }

      // 如果单独按下 Shift/Control/Alt/Meta 修饰键，等待后续组合键
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) {
        return
      }

      const capturedKeys = parseEventToKeys(e)
      if (capturedKeys && capturedKeys.length > 0) {
        const target = shortcuts.find((s) => s.id === recordingId)
        const next = shortcuts.map((s) =>
          s.id === recordingId ? { ...s, keys: capturedKeys } : s
        )
        onUpdateShortcuts(next)
        setRecordingId(null)
        onToast(`「${target?.title ?? '功能'}」已设置为 ${capturedKeys.join(' ')}`)
      }
    }

    // 在捕获阶段最高优先级拦截按键
    window.addEventListener('keydown', handleRecordKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleRecordKeyDown, true)
    }
  }, [recordingId, shortcuts, onUpdateShortcuts, onToast])

  // 全部重置为默认值
  const handleResetAll = () => {
    const next = DEFAULT_SHORTCUTS.map((item) => ({ ...item, keys: [...item.defaultKeys] }))
    onUpdateShortcuts(next)
    setRecordingId(null)
    onToast('已全部恢复为默认快捷键')
  }

  // 清空该项快捷键（点击垃圾桶，里面的按键没了）
  const handleClear = (id: string) => {
    const target = shortcuts.find((s) => s.id === id)
    const next = shortcuts.map((s) => (s.id === id ? { ...s, keys: [] } : s))
    onUpdateShortcuts(next)
    if (recordingId === id) setRecordingId(null)
    onToast(`已清除「${target?.title ?? '快捷键'}」`)
  }

  // 恢复某项默认值
  const handleResetOne = (id: string) => {
    const def = DEFAULT_SHORTCUTS.find((s) => s.id === id)
    if (!def) return
    const next = shortcuts.map((s) => (s.id === id ? { ...def, keys: [...def.defaultKeys] } : s))
    onUpdateShortcuts(next)
    if (recordingId === id) setRecordingId(null)
    onToast(`已恢复「${def.title}」默认按键`)
  }

  return (
    <section className="settings-page-content shortcuts-settings-page">
      <div className="shortcuts-page-header">
        <h1>键盘快捷键</h1>
        <button type="button" className="shortcuts-reset-all-btn" onClick={handleResetAll}>
          全部重置为默认值
        </button>
      </div>

      <div className="shortcuts-search-wrap">
        <Search size={15} className="shortcuts-search-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索快捷键"
          className="shortcuts-search-input"
        />
        <Command size={14} className="shortcuts-search-badge" />
      </div>

      <div className="shortcuts-card">
        {filtered.length === 0 ? (
          <div className="shortcuts-empty">没有找到匹配的快捷键</div>
        ) : (
          filtered.map((item) => {
            const isRecording = recordingId === item.id
            const hasKeys = item.keys && item.keys.length > 0
            const isDefault =
              hasKeys &&
              item.keys.length === item.defaultKeys.length &&
              item.keys.every((k, i) => k === item.defaultKeys[i])

            return (
              <div className={`shortcut-row ${isRecording ? 'is-recording' : ''}`} key={item.id}>
                <div className="shortcut-info">
                  <strong className="shortcut-title">{item.title}</strong>
                  <p className="shortcut-desc">{item.description}</p>
                </div>
                <div className="shortcut-actions">
                  {isRecording ? (
                    <div
                      className="shortcut-recording-box"
                      onClick={() => setRecordingId(null)}
                      title="点击或按 Esc 取消录制"
                    >
                      <span className="recording-dot" />
                      <span>请按下键盘按键…</span>
                      <span className="recording-esc-hint">Esc 取消</span>
                    </div>
                  ) : hasKeys ? (
                    <button
                      type="button"
                      className="shortcut-keys-btn"
                      onClick={() => setRecordingId(item.id)}
                      title="点击直接录制新快捷键"
                    >
                      <div className="shortcut-keys">
                        {item.keys.map((k, idx) => (
                          <kbd key={idx}>{k}</kbd>
                        ))}
                      </div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="shortcut-empty-btn"
                      onClick={() => setRecordingId(item.id)}
                      title="点击录制快捷键"
                    >
                      <span>+ 点击录制快捷键</span>
                    </button>
                  )}

                  {!isRecording && (
                    <>
                      <button
                        type="button"
                        className="shortcut-icon-btn edit"
                        title="录制新快捷键"
                        onClick={() => setRecordingId(item.id)}
                        aria-label={`修改 ${item.title} 快捷键`}
                      >
                        <Pencil size={13} />
                      </button>

                      {hasKeys ? (
                        <button
                          type="button"
                          className="shortcut-icon-btn delete"
                          title="删除清空当前按键"
                          onClick={() => handleClear(item.id)}
                          aria-label={`删除 ${item.title} 快捷键`}
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="shortcut-icon-btn reset"
                          title="恢复出厂默认按键"
                          onClick={() => handleResetOne(item.id)}
                          aria-label={`恢复 ${item.title} 默认快捷键`}
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}

                      {!isDefault && hasKeys && (
                        <button
                          type="button"
                          className="shortcut-icon-btn reset"
                          title="恢复出厂默认按键"
                          onClick={() => handleResetOne(item.id)}
                          aria-label={`恢复 ${item.title} 默认快捷键`}
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
