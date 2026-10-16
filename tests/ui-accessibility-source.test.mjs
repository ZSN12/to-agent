import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8')

test('major settings controls expose state without an incomplete ARIA tab pattern', async () => {
  const [settings, provider, models, logs, plugins, permissions, terminal] = await Promise.all([
    read('../src/features/settings/SettingsPage.tsx'),
    read('../src/features/models/CustomProviderSection.tsx'),
    read('../src/features/models/ModelSettingsPanel.tsx'),
    read('../src/features/logs/OutputLogPanel.tsx'),
    read('../src/features/plugins/PluginsMarketplaceView.tsx'),
    read('../src/features/permissions/PermissionSettingsPanel.tsx'),
    read('../src/features/terminal/TerminalDrawer.tsx'),
  ])

  assert.match(settings, /aria-current=\{section === item\.section \? 'page' : undefined\}/)
  assert.match(settings, /<nav aria-label=\{`\$\{group\.title\}设置`\}>/)
  assert.match(settings, /id="settings-content"/)
  for (const source of [provider, models, logs]) {
    assert.match(source, /role="group"/)
    assert.match(source, /aria-pressed=/)
    assert.doesNotMatch(source, /role="tab(list)?"/)
  }
  assert.match(logs, /aria-label=\{activeTab === 'tools' \? '搜索工具轨迹' : '搜索审批审计'\}/)
  assert.match(logs, /aria-label=\{isCopied \? '完整日志已复制'/)
  assert.match(plugins, /<article\s+className="codex-plugin-card codex-plugin-card-featured"/)
  assert.match(plugins, /aria-label=\{webSearchConfig\.enabled \? '关闭网页搜索' : '启用网页搜索'\}/)
  assert.doesNotMatch(plugins, /<div\s+className="codex-plugin-card codex-plugin-card-featured"[\s\S]*?onClick=\{openWebSearchModal\}/)
  assert.match(permissions, /<button\s+type="button"\s+aria-pressed=\{active\}/)
  assert.match(permissions, /role="group" aria-label="全局权限模式"/)
  assert.match(terminal, /role="group" aria-label="终端会话"/)
  assert.match(terminal, /<button\s+type="button"\s+className=\{`terminal-tab-item[\s\S]*?aria-pressed=\{tab\.id === activeTabId\}/)
  assert.match(terminal, /aria-label=\{`关闭终端 \$\{tab\.title\}`\}/)
})

test('model pickers use keyboard-activatable checkbox buttons', async () => {
  const [models, localScan, focusStyles, parityStyles] = await Promise.all([
    read('../src/features/models/ModelSettingsPanel.tsx'),
    read('../src/features/models/LocalScanModal.tsx'),
    read('../src/styles.css'),
    read('../src/styles-dsh-parity.css'),
  ])

  assert.match(models, /<button\s+type="button"\s+key=\{model\.key\}\s+role="checkbox"\s+aria-checked=\{isSelected\}/s)
  assert.match(models, /<button\s+type="button"\s+key=\{item\.id\}\s+aria-pressed=\{isSelected\}/s)
  assert.doesNotMatch(models, /role="button"\s+tabIndex=\{0\}/)
  assert.match(models, /role="group"\s+aria-label="选择模型提供方"/)
  assert.match(localScan, /<button[\s\S]*?role="checkbox"[\s\S]*?aria-checked=\{checked\}[\s\S]*?disabled=\{disabled\}/)
  assert.doesNotMatch(localScan, /role="listitem"|tabIndex=\{disabled \? -1 : 0\}/)
  assert.match(focusStyles, /button:focus-visible, textarea:focus-visible, input:focus-visible/)
  assert.match(parityStyles, /\.local-scan-row\s*\{[^}]*appearance:\s*none/s)
  assert.match(parityStyles, /\.codex-plugin-card-open\s*\{[^}]*background:\s*transparent/s)
})

test('shortcut recording can be canceled without trapping keyboard Tab', async () => {
  const shortcuts = await read('../src/features/settings/ShortcutsSettings.tsx')

  assert.match(shortcuts, /if \(e\.key === 'Tab'\)\s*\{\s*setRecordingId\(null\)\s*e\.stopPropagation\(\)\s*return/s)
  assert.match(shortcuts, /<button\s+type="button"\s+className="shortcut-recording-box"[\s\S]*?aria-label="取消按键录制"/)
  assert.match(shortcuts, /role="status" aria-live="polite"/)
})

test('modal focus management traps Tab, supports Escape, and restores the opener', async () => {
  const [focusTrap, confirmModal, localScan, probeModels, gitCheckpoints, plugins] = await Promise.all([
    read('../src/shared/useModalFocusTrap.ts'),
    read('../src/shared/ConfirmModal.tsx'),
    read('../src/features/models/LocalScanModal.tsx'),
    read('../src/features/models/ProbeModelsModal.tsx'),
    read('../src/features/git/GitCheckpointPanel.tsx'),
    read('../src/features/plugins/PluginsMarketplaceView.tsx'),
  ])

  assert.match(focusTrap, /event\.key === 'Escape'/)
  assert.match(focusTrap, /event\.key !== 'Tab'/)
  assert.match(focusTrap, /last\.focus\(\)/)
  assert.match(focusTrap, /first\.focus\(\)/)
  assert.match(focusTrap, /previousFocus\.focus\(\)/)
  assert.match(confirmModal, /role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby=\{titleId\}/)
  assert.match(localScan, /role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby=\{titleId\}/)
  assert.match(probeModels, /useModalFocusTrap/)
  assert.match(gitCheckpoints, /aria-labelledby=\{commitDialogTitleId\}/)
  assert.match(plugins, /useModalFocusTrap/)
})
