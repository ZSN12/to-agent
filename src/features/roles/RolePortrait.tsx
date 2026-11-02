import { memo } from 'react'

export type RolePortraitProps = {
  name: string
  variant?: number
  size?: 'small' | 'medium' | 'large'
  status?: 'idle' | 'working' | 'waiting' | 'blocked' | 'done'
}

type BotPreset = {
  id: string
  label: string
  render: () => React.ReactNode
}

/**
 * 经典 Grok Bot 风格未来主义形象：
 * 1. 纯粹现代几何外形 (Squircle / Pebble / Prism / Orb / Aegis / Monolith)
 * 2. 沉浸式深黑玻璃面屏 (Visor Display)
 * 3. 标志性灵动双发光胶囊眼 (Vertical Capsule Eyes)，无嘴无鼻，纯粹灵动
 * 4. 细腻顶光与科技饰线
 */
const presets: BotPreset[] = [
  // 0: Amber Squircle (琥珀圆角立方体)
  {
    id: 'squircle',
    label: '琥珀魔方',
    render: () => (
      <>
        {/* 外壳 */}
        <rect x="7" y="7" width="50" height="50" rx="16" className="role-grok-shell" />
        {/* 顶部高光弧 */}
        <path d="M14 12 Q32 8 50 12" className="role-grok-highlight" />
        {/* 黑色面屏 */}
        <rect x="13" y="14" width="38" height="36" rx="12" className="role-grok-visor" />
        {/* 面屏微反光 */}
        <path d="M16 18 Q32 15 48 18" className="role-grok-visor-glare" />
        {/* 标志性 Grok 双胶囊眼 */}
        <g className="role-grok-eyes">
          <rect x="22.5" y="25" width="5.5" height="13" rx="2.75" className="role-grok-eye" />
          <rect x="36" y="25" width="5.5" height="13" rx="2.75" className="role-grok-eye" />
        </g>
        {/* 科技额点 */}
        <circle cx="32" cy="10.5" r="1.5" className="role-grok-accent-dot" />
      </>
    ),
  },
  // 1: Emerald Pebble (翡翠流线鹅卵石)
  {
    id: 'pebble',
    label: '极客翡翠',
    render: () => (
      <>
        {/* 外壳 */}
        <rect x="9" y="6" width="46" height="52" rx="21" className="role-grok-shell" />
        <path d="M16 11 Q32 7 48 11" className="role-grok-highlight" />
        {/* 面屏 */}
        <rect x="14" y="13" width="36" height="38" rx="16" className="role-grok-visor" />
        <path d="M17 17 Q32 14 47 17" className="role-grok-visor-glare" />
        {/* 双胶囊眼 */}
        <g className="role-grok-eyes">
          <rect x="22.5" y="25" width="5.5" height="13" rx="2.75" className="role-grok-eye" />
          <rect x="36" y="25" width="5.5" height="13" rx="2.75" className="role-grok-eye" />
        </g>
        {/* 两侧科技天线槽 */}
        <line x1="10" y1="32" x2="13" y2="32" className="role-grok-tech-line" />
        <line x1="51" y1="32" x2="54" y2="32" className="role-grok-tech-line" />
      </>
    ),
  },
  // 2: Cyber Prism (赛博六边晶体)
  {
    id: 'prism',
    label: '赛博晶体',
    render: () => (
      <>
        {/* 外壳 */}
        <path d="M32 6 L55 19 L55 45 L32 58 L9 45 L9 19 Z" className="role-grok-shell" strokeLinejoin="round" />
        <path d="M16 18 L32 10 L48 18" className="role-grok-highlight" />
        {/* 面屏 */}
        <path d="M32 14 L49 24 L49 43 L32 52 L15 43 L15 24 Z" className="role-grok-visor" strokeLinejoin="round" />
        {/* 双胶囊眼 (带微倾斜) */}
        <g className="role-grok-eyes">
          <rect x="22" y="25.5" width="5.5" height="13" rx="2.75" className="role-grok-eye" transform="rotate(-3 24.75 32)" />
          <rect x="36.5" y="25.5" width="5.5" height="13" rx="2.75" className="role-grok-eye" transform="rotate(3 39.25 32)" />
        </g>
        {/* 晶核微导槽 */}
        <path d="M30 10 L32 8 L34 10" className="role-grok-tech-line" />
      </>
    ),
  },
  // 3: Cobalt Orb (宇航太空球)
  {
    id: 'orb',
    label: '深空宇航',
    render: () => (
      <>
        {/* 外壳 */}
        <circle cx="32" cy="32" r="25" className="role-grok-shell" />
        <path d="M16 16 Q32 9 48 16" className="role-grok-highlight" />
        {/* 宇航大曲面面屏 */}
        <rect x="13" y="16" width="38" height="32" rx="15" className="role-grok-visor" />
        <path d="M16 20 Q32 16 48 20" className="role-grok-visor-glare" />
        {/* 双胶囊眼 */}
        <g className="role-grok-eyes">
          <rect x="22.5" y="25" width="5.5" height="13" rx="2.75" className="role-grok-eye" />
          <rect x="36" y="25" width="5.5" height="13" rx="2.75" className="role-grok-eye" />
        </g>
        {/* 底部基座微环 */}
        <path d="M22 53 Q32 56 42 53" className="role-grok-tech-line" />
      </>
    ),
  },
  // 4: Coral Aegis (极简先锋盾)
  {
    id: 'aegis',
    label: '先锋盾',
    render: () => (
      <>
        {/* 外壳 */}
        <path d="M12 9 H52 Q53 30 32 57 Q11 30 12 9 Z" className="role-grok-shell" strokeLinejoin="round" />
        <path d="M18 13 H46" className="role-grok-highlight" />
        {/* 面屏 */}
        <path d="M16 15 H48 Q49 32 32 51 Q15 32 16 15 Z" className="role-grok-visor" strokeLinejoin="round" />
        {/* 双胶囊眼 */}
        <g className="role-grok-eyes">
          <rect x="22.5" y="25" width="5.5" height="13" rx="2.75" className="role-grok-eye" />
          <rect x="36" y="25" width="5.5" height="13" rx="2.75" className="role-grok-eye" />
        </g>
        {/* 额头科技条 */}
        <line x1="28" y1="12" x2="36" y2="12" className="role-grok-tech-line" />
      </>
    ),
  },
  // 5: Obsidian Monolith (黑曜石图腾)
  {
    id: 'monolith',
    label: '黑曜图腾',
    render: () => (
      <>
        {/* 外壳 */}
        <path d="M14 7 L50 7 L54 51 L32 57 L10 51 Z" className="role-grok-shell" strokeLinejoin="round" />
        <path d="M18 11 L46 11" className="role-grok-highlight" />
        {/* 面屏 */}
        <path d="M17 14 L47 14 L50 47 L32 52 L14 47 Z" className="role-grok-visor" strokeLinejoin="round" />
        {/* 双胶囊眼 */}
        <g className="role-grok-eyes">
          <rect x="22.5" y="25" width="5.5" height="13" rx="2.75" className="role-grok-eye" />
          <rect x="36" y="25" width="5.5" height="13" rx="2.75" className="role-grok-eye" />
        </g>
        {/* 钛银标角 */}
        <polygon points="46,8 50,8 50,12" className="role-grok-accent-fill" />
      </>
    ),
  },
]

export const RolePortrait = memo(function RolePortrait({
  name,
  variant = 0,
  size = 'medium',
  status = 'idle',
}: RolePortraitProps) {
  const index = Math.abs(variant) % presets.length
  const current = presets[index]

  return (
    <span
      className={`role-portrait role-portrait-${size} role-avatar-tone-${index} role-portrait-status-${status}`}
      aria-hidden="true"
      title={name}
      data-testid="role-portrait"
    >
      <svg viewBox="0 0 64 64" focusable="false">
        {current.render()}
      </svg>
      <span className="role-portrait-status-dot" />
    </span>
  )
})
