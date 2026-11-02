#!/usr/bin/env node
import assert from 'node:assert/strict'
import { build } from 'esbuild'

let cursor = 0
let pendingEffects = []
const hookSlots = []
const hooks = {
  useState(initial) {
    const index = cursor++
    hookSlots[index] ??= typeof initial === 'function' ? initial() : initial
    return [hookSlots[index], (value) => {
      hookSlots[index] = typeof value === 'function' ? value(hookSlots[index]) : value
    }]
  },
  useCallback(callback) {
    cursor++
    return callback
  },
  useEffect(effect) {
    cursor++
    pendingEffects.push(effect)
  },
}
globalThis.__taskweaverOpenUsageHooks = hooks

const result = await build({
  stdin: {
    contents: `export { useOpenUsageLimits, OPENUSAGE_AUTO_REFRESH_INTERVAL_MS } from './src/features/models/useOpenUsageLimits';
      export { openUsageSnapshotFetchedAt, formatFetchedAt } from './src/features/models/openusage-limits-summary';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [{
    name: 'headless-react-hooks',
    setup(api) {
      api.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'openusage-test' }))
      api.onLoad({ filter: /.*/, namespace: 'openusage-test' }, () => ({
        contents: 'export const { useState, useCallback, useEffect } = globalThis.__taskweaverOpenUsageHooks;',
      }))
    },
  }],
})
const { useOpenUsageLimits, OPENUSAGE_AUTO_REFRESH_INTERVAL_MS, openUsageSnapshotFetchedAt, formatFetchedAt } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
)

const oldestProviderFetch = Date.now() - 72_000
assert.equal(openUsageSnapshotFetchedAt({ providers: {
  codex: { fetchedAt: new Date(oldestProviderFetch + 30_000).toISOString() },
  antigravity: { fetchedAt: new Date(oldestProviderFetch).toISOString() },
} }), oldestProviderFetch, 'the status uses the oldest provider collection timestamp, not the API read time')
assert.match(formatFetchedAt(Date.now() - 25_000), /秒前更新$/, 'freshness text does not show a misleading zero minutes')

let nextTimer = 0
const timers = new Map()
let openUsageCalls = 0
globalThis.window = {
  taskweaver: {
    preferences: { get: async () => ({ ok: true, data: {} }) },
    openusage: {
      getLimits: async () => {
        openUsageCalls += 1
        return {
          ok: true,
          data: {
            ok: true,
            active: true,
            baseUrl: 'http://127.0.0.1:6736',
            data: { schema: 'openusage.limits.v1', providers: {} },
          },
        }
      },
    },
  },
  setInterval(callback, delay) {
    const id = ++nextTimer
    timers.set(id, { callback, delay })
    return id
  },
  clearInterval(id) { timers.delete(id) },
}

function render(autoFetch) {
  cursor = 0
  pendingEffects = []
  useOpenUsageLimits({ autoFetch })
  const effects = pendingEffects
  pendingEffects = []
  return effects.map((effect) => effect()).filter((cleanup) => typeof cleanup === 'function')
}

const cleanups = render(true)
await new Promise((resolve) => setImmediate(resolve))
assert.equal(timers.size, 1, 'the visible quota panel schedules one automatic refresh timer')
assert.equal([...timers.values()][0].delay, OPENUSAGE_AUTO_REFRESH_INTERVAL_MS,
  'automatic refresh cadence is the documented one-minute UI interval')
assert.equal(openUsageCalls, 1, 'the quota panel fetches immediately when mounted')
timers.values().next().value.callback()
await new Promise((resolve) => setImmediate(resolve))
assert.equal(openUsageCalls, 2, 'the timer fetches a newer OpenUsage snapshot')
for (const cleanup of cleanups) cleanup()
assert.equal(timers.size, 0, 'unmounting the quota panel clears its timer')

hookSlots.length = 0
const disabledCleanups = render(false)
assert.equal(timers.size, 0, 'autoFetch=false does not start background polling')
for (const cleanup of disabledCleanups) cleanup()

console.log('OpenUsage auto-refresh hook tests passed')
