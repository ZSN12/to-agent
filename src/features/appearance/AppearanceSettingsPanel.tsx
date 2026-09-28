import { useState, useEffect } from 'react'
import { Check, Sun, Moon, Laptop, Palette } from 'lucide-react'
import {
  ThemeMode,
  AccentColor,
  getStoredThemeMode,
  setStoredThemeMode,
  getStoredAccentColor,
  setStoredAccentColor,
  applyTheme,
} from '../../shared/theme'

export function AppearanceSettingsPanel({ onToast }: { onToast?: (msg: string) => void }) {
  const [mode, setMode] = useState<ThemeMode>(getStoredThemeMode)
  const [accent, setAccent] = useState<AccentColor>(getStoredAccentColor)

  const handleSelectMode = (newMode: ThemeMode) => {
    setMode(newMode)
    setStoredThemeMode(newMode)
    const effective = applyTheme(newMode, accent)
    onToast?.(`已切换为${newMode === 'system' ? `跟随系统 (${effective === 'dark' ? '深色' : '浅色'})` : newMode === 'light' ? '浅色模式' : '深色模式'}`)
  }

  const handleSelectAccent = (newAccent: AccentColor) => {
    setAccent(newAccent)
    setStoredAccentColor(newAccent)
    applyTheme(mode, newAccent)
    onToast?.(`强调色已更新`)
  }

  return (
    <div className="settings-panel appearance-settings-panel">
      <header className="settings-panel-header">
        <h2 className="settings-panel-title">外观</h2>
        <p className="settings-panel-description">自定义 TaskWeaver 的界面主题、配色与代码显示风格。</p>
      </header>

      {/* 主题选择区域 */}
      <section className="appearance-section">
        <h3 className="appearance-section-title">主题</h3>

        <div className="theme-card-grid">
          {/* 系统 (Auto) */}
          <button
            type="button"
            className={`theme-card ${mode === 'system' ? 'active' : ''}`}
            onClick={() => handleSelectMode('system')}
            aria-label="跟随系统主题"
          >
            <div className="theme-card-preview preview-system">
              {/* 左半边浅色预览 */}
              <div className="preview-split-light">
                <div className="preview-mini-titlebar" />
                <div className="preview-mini-content">
                  <div className="preview-mini-card">
                    <div className="preview-mini-line w-30" />
                    <div className="preview-mini-line w-60" />
                    <div className="preview-mini-line w-40" />
                  </div>
                </div>
              </div>
              {/* 右半边深色预览 */}
              <div className="preview-split-dark">
                <div className="preview-mini-titlebar" />
                <div className="preview-mini-content">
                  <div className="preview-mini-card">
                    <div className="preview-mini-line w-30" />
                    <div className="preview-mini-line w-60" />
                    <div className="preview-mini-line w-40" />
                  </div>
                </div>
              </div>
              <div className="preview-split-divider" />
            </div>
            <span className="theme-card-label">系统</span>
          </button>

          {/* 浅色 (Light) */}
          <button
            type="button"
            className={`theme-card ${mode === 'light' ? 'active' : ''}`}
            onClick={() => handleSelectMode('light')}
            aria-label="浅色主题"
          >
            <div className="theme-card-preview preview-light">
              <div className="preview-mini-titlebar" />
              <div className="preview-mini-content">
                <div className="preview-mini-card">
                  <div className="preview-mini-line w-40" />
                  <div className="preview-mini-line w-80" />
                  <div className="preview-mini-line w-60" />
                  <div className="preview-mini-line w-30" />
                </div>
              </div>
            </div>
            <span className="theme-card-label">浅色</span>
          </button>

          {/* 深色 (Dark) */}
          <button
            type="button"
            className={`theme-card ${mode === 'dark' ? 'active' : ''}`}
            onClick={() => handleSelectMode('dark')}
            aria-label="深色主题"
          >
            <div className="theme-card-preview preview-dark">
              <div className="preview-mini-titlebar" />
              <div className="preview-mini-content">
                <div className="preview-mini-card">
                  <div className="preview-mini-line w-40" />
                  <div className="preview-mini-line w-80" />
                  <div className="preview-mini-line w-60" />
                  <div className="preview-mini-line w-30" />
                </div>
              </div>
            </div>
            <span className="theme-card-label">深色</span>
          </button>
        </div>
      </section>

      {/* 代码 Diff 实时对比框（完美还原用户截图中的极客感效果） */}
      <section className="appearance-section">
        <div className="appearance-diff-preview">
          <div className="diff-preview-header">
            <span className="diff-header-tab">主题预览效果 (Diff Preview)</span>
          </div>
          <div className="diff-preview-body">
            {/* 左列（旧值/删除） */}
            <div className="diff-col left">
              <div className="diff-row"><span className="diff-ln">1</span><span className="diff-code"><span className="token-keyword">const</span> themePreview: <span className="token-type">ThemeConfig</span> = {'{'}</span></div>
              <div className="diff-row diff-del"><span className="diff-ln">2</span><span className="diff-code">&nbsp;&nbsp;surface: <span className="token-str">"sidebar"</span>,</span></div>
              <div className="diff-row diff-del"><span className="diff-ln">3</span><span className="diff-code">&nbsp;&nbsp;accent: <span className="token-str">"#2563eb"</span>,</span></div>
              <div className="diff-row diff-del"><span className="diff-ln">4</span><span className="diff-code">&nbsp;&nbsp;contrast: <span className="token-num">42</span>,</span></div>
              <div className="diff-row"><span className="diff-ln">5</span><span className="diff-code">{'}'};</span></div>
            </div>

            <div className="diff-col-divider" />

            {/* 右列（新值/增加） */}
            <div className="diff-col right">
              <div className="diff-row"><span className="diff-ln">1</span><span className="diff-code"><span className="token-keyword">const</span> themePreview: <span className="token-type">ThemeConfig</span> = {'{'}</span></div>
              <div className="diff-row diff-add"><span className="diff-ln">2</span><span className="diff-code">&nbsp;&nbsp;surface: <span className="token-str">"sidebar-elevated"</span>,</span></div>
              <div className="diff-row diff-add"><span className="diff-ln">3</span><span className="diff-code">&nbsp;&nbsp;accent: <span className="token-str">"#0ea5e9"</span>,</span></div>
              <div className="diff-row diff-add"><span className="diff-ln">4</span><span className="diff-code">&nbsp;&nbsp;contrast: <span className="token-num">68</span>,</span></div>
              <div className="diff-row"><span className="diff-ln">5</span><span className="diff-code">{'}'};</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* 强调色选择 */}
      <section className="appearance-section">
        <div className="appearance-option-row">
          <div className="appearance-option-info">
            <span className="appearance-option-title">强调色</span>
            <span className="appearance-option-desc">选择应用按钮、高亮和活动状态的品牌色彩</span>
          </div>
          <div className="accent-color-picker">
            {[
              { id: 'blue', label: '默认蓝', color: '#2563eb' },
              { id: 'green', label: '翡翠绿', color: '#10a37f' },
              { id: 'purple', label: '紫罗兰', color: '#9333ea' },
              { id: 'amber', label: '琥珀金', color: '#f59e0b' },
              { id: 'neutral', label: '极简灰', color: '#64748b' },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                className={`accent-circle ${accent === c.id ? 'active' : ''}`}
                style={{ backgroundColor: c.color }}
                onClick={() => handleSelectAccent(c.id as AccentColor)}
                title={c.label}
              >
                {accent === c.id && <Check size={12} color="#fff" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
