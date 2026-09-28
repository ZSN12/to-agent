import assert from 'node:assert/strict'
import {
  getStoredThemeMode,
  setStoredThemeMode,
  getStoredAccentColor,
  setStoredAccentColor,
  resolveEffectiveTheme,
  applyTheme,
} from '../src/shared/theme.ts'

// 模拟浏览器 localStorage 与 window.matchMedia
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
}

let mockPrefersDark = true
globalThis.window = {
  matchMedia: (query) => ({
    matches: query.includes('dark') ? mockPrefersDark : !mockPrefersDark,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
}

const mockRoot = {
  attrs: new Map(),
  style: {},
  setAttribute(k, v) { this.attrs.set(k, v) },
  getAttribute(k) { return this.attrs.get(k) },
}

globalThis.document = {
  documentElement: mockRoot,
}

// 1. 默认主题模式验证
assert.equal(getStoredThemeMode(), 'system', '未设置时默认应为 system')
assert.equal(getStoredAccentColor(), 'blue', '未设置时强调色默认应为 blue')

// 2. 主题模式设置与读取
setStoredThemeMode('light')
assert.equal(getStoredThemeMode(), 'light')
setStoredThemeMode('dark')
assert.equal(getStoredThemeMode(), 'dark')
setStoredThemeMode('system')
assert.equal(getStoredThemeMode(), 'system')

// 3. 强调色设置与读取
setStoredAccentColor('green')
assert.equal(getStoredAccentColor(), 'green')
setStoredAccentColor('purple')
assert.equal(getStoredAccentColor(), 'purple')

// 4. resolveEffectiveTheme 逻辑
mockPrefersDark = true
assert.equal(resolveEffectiveTheme('system'), 'dark', '系统暗色时 system 应解析为 dark')
mockPrefersDark = false
assert.equal(resolveEffectiveTheme('system'), 'light', '系统浅色时 system 应解析为 light')
assert.equal(resolveEffectiveTheme('light'), 'light', '强制 light 应为 light')
assert.equal(resolveEffectiveTheme('dark'), 'dark', '强制 dark 应为 dark')

// 5. applyTheme DOM 状态注入
applyTheme('light', 'green')
assert.equal(mockRoot.getAttribute('data-theme'), 'light')
assert.equal(mockRoot.getAttribute('data-accent'), 'green')
assert.equal(mockRoot.style.colorScheme, 'light')

mockPrefersDark = true
applyTheme('system', 'amber')
assert.equal(mockRoot.getAttribute('data-theme'), 'dark')
assert.equal(mockRoot.getAttribute('data-accent'), 'amber')
assert.equal(mockRoot.style.colorScheme, 'dark')

console.log('appearance theme tests passed successfully!')
