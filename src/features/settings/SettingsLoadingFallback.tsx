import type { CSSProperties } from 'react'
import './settings-layout.css'

export interface SettingsLoadingFallbackProps {
  /** 提示文案，默认“正在加载设置…” */
  label?: string
  /** 是否渲染为全屏占位（用于 App 根部挂载 SettingsPage 时的过渡） */
  fullScreen?: boolean
  style?: CSSProperties
}

/**
 * 设置中心加载占位组件
 * 支持全屏（首屏进入设置）与卡片式（切换子面板）两种展示模式
 */
export function SettingsLoadingFallback({
  label = '正在加载设置…',
  fullScreen = false,
  style,
}: SettingsLoadingFallbackProps) {
  const inner = (
    <div className="settings-loading" role="status" aria-live="polite">
      <div className="settings-loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )

  if (fullScreen) {
    return (
      <div
        className="settings-screen settings-loading-screen"
        data-testid="settings-loading-fallback"
        style={style}
      >
        {inner}
      </div>
    )
  }

  return (
    <div style={style}>
      {inner}
    </div>
  )
}
