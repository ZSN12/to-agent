export type ThemeMode = 'system' | 'light' | 'dark'

export type AccentColor = 'blue' | 'green' | 'purple' | 'amber' | 'neutral'

const THEME_STORAGE_KEY = 'taskweaver.theme.mode'
const ACCENT_STORAGE_KEY = 'taskweaver.theme.accent'

export function getStoredThemeMode(): ThemeMode {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY)
    if (val === 'light' || val === 'dark' || val === 'system') return val
  } catch {
    // ignore
  }
  return 'system'
}

export function setStoredThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

export function getStoredAccentColor(): AccentColor {
  try {
    const val = localStorage.getItem(ACCENT_STORAGE_KEY)
    if (val === 'blue' || val === 'green' || val === 'purple' || val === 'amber' || val === 'neutral') return val
  } catch {
    // ignore
  }
  return 'blue'
}

export function setStoredAccentColor(color: AccentColor): void {
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, color)
  } catch {
    // ignore
  }
}

export function resolveEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

export function applyTheme(mode: ThemeMode, accent: AccentColor = 'blue'): 'light' | 'dark' {
  const effective = resolveEffectiveTheme(mode)
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.setAttribute('data-theme', effective)
    root.setAttribute('data-accent', accent)
    root.style.colorScheme = effective
  }
  return effective
}
