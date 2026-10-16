import assert from 'node:assert/strict'
import { UI_VERIFY_APPROVAL_FIXTURE, UI_VERIFY_MOCK_REPLY } from '../../packages/provider-bridge-transport/index.mjs'

const sidebar = { testId: 'app-sidebar' }
const composer = { testId: 'message-input' }
const messageList = { testId: 'message-list' }

/** Five TaskWeaver-only UI smoke scenarios. They share the isolated driver used by the agent tool. */
export const scenarios = {
  async launch(session) {
    await session.expectVisible(sidebar)
    await session.expectVisible({ testId: 'new-chat' })
    await session.expectVisible(composer)
    await session.expectVisible(messageList)

    let events = []
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      events = await session.startupTraceEvents()
      const hasHostReady = events.some((row) => row.event === 'host:start:ready')
      const hasHostFailure = events.some((row) => row.event === 'host:start:failed')
      const hasBundle = events.some((row) => row.event === 'models:loadBundle-end')
      if ((hasHostReady && hasBundle) || (hasHostFailure && hasBundle)) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    assert.equal(events.filter((row) => row.event === 'host:start:begin').length, 1,
      'cold app startup should launch Host once')
    assert.ok(events.some((row) => row.event === 'host:start:ready'), 'Host should become ready')
    const bundleStarts = events.filter((row) => row.event === 'models:loadBundle-start')
    const bundleEnds = events.filter((row) => row.event === 'models:loadBundle-end')
    assert.ok(bundleStarts.length <= 2, `model bundle should load at most twice, got ${bundleStarts.length}`)
    assert.ok(bundleEnds.length > 0, 'model bundle should finish loading')
    assert.ok(!events.some((row) => row.event.startsWith('ocx:export-')),
      'startup must not run an ocx export')
    assert.ok(!events.some((row) => row.event.startsWith('live-discovery:')),
      'startup must not run provider live discovery')

    const firstVisibleUi = events.find((row) => row.event === 'ui:page-visible')
    const firstBundle = bundleEnds[0]
    assert.ok(firstVisibleUi, 'startup trace should include the first visible UI page')
    assert.ok(firstBundle, 'startup trace should include the first model bundle')
    const hasFastSnapshot = events.some((row) => row.event === 'models:catalog-cache-hit'
      || row.event === 'models:catalog-snapshot-hit')
    assert.ok(hasFastSnapshot, 'first screen should have a cached or bundled model catalog')
    const readyToBundleMs = Math.max(0, firstBundle.sinceT0Ms - firstVisibleUi.sinceT0Ms)
    assert.ok(readyToBundleMs < 1_000,
      `cached first model bundle should be available within 1s after first UI display (got ${readyToBundleMs.toFixed(1)}ms)`)
  },

  async 'new-session'(session) {
    await session.expectVisible(composer)
    await session.click({ testId: 'new-chat' })
    await session.expectVisible(composer)
    const snapshot = await session.snapshot()
    assert.match(snapshot, /新建会话|新对话/u, 'ARIA snapshot should expose the new-session navigation item')
  },

  async 'mock-message'(session) {
    const text = `ui-verify-${Date.now()}`
    await session.fill(composer, text)
    await session.click({ testId: 'send-message' })
    await session.expectText(messageList, text)
    // Only the isolated UI verification process receives this local provider
    // fixture flag; it never reads a stored credential or contacts a provider.
    await session.expectText(messageList, UI_VERIFY_MOCK_REPLY)
  },

  async approval(session) {
    await session.click({ testId: 'permission-mode-trigger' })
    await session.click({ testId: 'permission-mode-option-ask' })
    await session.fill(composer, UI_VERIFY_APPROVAL_FIXTURE)
    await session.click({ testId: 'send-message' })
    await session.expectVisible({ testId: 'approval-panel' })
    await session.expectText({ testId: 'approval-panel-detail' }, 'UI verification writes one temporary marker')
    await session.click({ testId: 'approval-allow-once' })
    await session.waitFor({ testId: 'approval-panel' }, 'hidden')
    await session.expectText(messageList, 'UI_VERIFY_APPROVAL_OK')
  },

  async settings(session) {
    await session.click({ testId: 'open-settings' })
    await session.expectVisible({ testId: 'settings-page' })
    await session.click({ role: 'button', name: '外观' })
    await session.expectVisible({ role: 'heading', name: '外观' })
    await session.click({ role: 'button', name: '深色主题' })
    await session.expectText({ testId: 'settings-page' }, '已切换为深色模式')
    await session.screenshot('settings-dark')
    const search = { role: 'searchbox', name: '搜索设置' }
    await session.fill(search, '路由')
    await session.click({ role: 'button', name: '路由与扩展' })
    await session.expectVisible({ role: 'heading', name: '路由与扩展' })
    await session.screenshot('routing-dark')

    await session.fill(search, '')
    await session.click({ role: 'button', name: '外观' })
    await session.click({ role: 'button', name: '浅色主题' })
    await session.expectText({ testId: 'settings-page' }, '已切换为浅色模式')
    await session.screenshot('settings-light')
    await session.fill(search, '路由')
    await session.click({ role: 'button', name: '路由与扩展' })
    await session.expectVisible({ role: 'heading', name: '路由与扩展' })
    await session.screenshot('routing-light')
  },
}

export const scenarioNames = Object.keys(scenarios)
