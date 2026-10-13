import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const tmpDir = path.join(rootDir, 'node_modules/.tmp-test-startup-report')
fs.mkdirSync(tmpDir, { recursive: true })

const modernFixturePath = path.join(tmpDir, 'modern.jsonl')
const legacyFixturePath = path.join(tmpDir, 'legacy.jsonl')

// Modern format fixture
const modernEvents = [
  { timestamp: '2026-10-10T00:00:00.000Z', pid: 1001, startupId: 's-1', elapsedMs: 120.5, sinceT0Ms: 150.2, event: 'window:ready-to-show' },
  { timestamp: '2026-10-10T00:00:00.100Z', pid: 1001, startupId: 's-1', elapsedMs: 250.0, sinceT0Ms: 280.0, event: 'models:loadBundle-end', stale: true },
  { timestamp: '2026-10-10T00:00:01.000Z', pid: 1001, startupId: 's-1', elapsedMs: 1200.0, sinceT0Ms: 1230.0, event: 'host:start:ready' },
  { timestamp: '2026-10-10T00:00:01.200Z', pid: 1001, startupId: 's-1', elapsedMs: 1350.0, sinceT0Ms: 1380.0, event: 'models:loadBundle-end', stale: false },
  { timestamp: '2026-10-10T00:00:01.300Z', pid: 1001, elapsedMs: 1400.0, sinceT0Ms: 1430.0, event: 'mcp:connect:ok', server: 'github', ms: 180.5 },
  { timestamp: '2026-10-10T00:00:01.400Z', pid: 1002, elapsedMs: 1500.0, sinceT0Ms: 1530.0, event: 'bridge:token-helper', provider: 'cursor', ms: 80.0 },
]
fs.writeFileSync(modernFixturePath, modernEvents.map(e => JSON.stringify(e)).join('\n') + '\n')

// Legacy format fixture (using t / ms)
const legacyEvents = [
  { t: 180.0, pid: 2002, event: 'swift:window-visible' },
  { t: 310.0, pid: 2002, event: 'models:loadBundle', stale: true },
  { t: 1500.0, pid: 2002, event: 'host:start:ready' },
  { t: 1650.0, pid: 2002, event: 'models:loadBundle', stale: false },
  { t: 1700.0, pid: 2002, event: 'token:helper' },
]
fs.writeFileSync(legacyFixturePath, legacyEvents.map(e => JSON.stringify(e)).join('\n') + '\n')

console.log('🧪 Testing tw-startup-report.mjs...')

// 1. Test single file JSON output
const modernJsonOut = execFileSync(
  'node',
  [path.join(rootDir, 'scripts/tw-startup-report.mjs'), '--json', modernFixturePath],
  { encoding: 'utf8' }
)
const modernReport = JSON.parse(modernJsonOut)
assert.equal(modernReport.totalRuns, 1)
assert.equal(modernReport.median.windowVisibleMs, 150.2) // Preferred sinceT0Ms
assert.equal(modernReport.median.firstCatalogMs, 280.0)
assert.equal(modernReport.median.firstFreshCatalogMs, 1380.0)
assert.equal(modernReport.median.hostStarts, 1)
assert.equal(modernReport.median.hostRestarts, 0)
assert.equal(modernReport.median.mcpSlowestConnectMs, 180.5)
assert.equal(modernReport.median.tokenHelperCalls, 1, 'an ID-less child-process event joins the only identified run')

// 2. Test legacy file JSON output
const legacyJsonOut = execFileSync(
  'node',
  [path.join(rootDir, 'scripts/tw-startup-report.mjs'), '--json', legacyFixturePath],
  { encoding: 'utf8' }
)
const legacyReport = JSON.parse(legacyJsonOut)
assert.equal(legacyReport.totalRuns, 1)
assert.equal(legacyReport.median.windowVisibleMs, 180.0)
assert.equal(legacyReport.median.firstCatalogMs, 310.0)
assert.equal(legacyReport.median.firstFreshCatalogMs, 1650.0)
assert.equal(legacyReport.median.tokenHelperCalls, 1)

// 3. Test multi-file Markdown output
const markdownOut = execFileSync(
  'node',
  [path.join(rootDir, 'scripts/tw-startup-report.mjs'), modernFixturePath, legacyFixturePath],
  { encoding: 'utf8' }
)
assert.ok(markdownOut.includes('TaskWeaver 启动性能度量报告 (2 次运行)'))
assert.ok(markdownOut.includes('窗口可见 (windowVisibleMs)'))
assert.ok(markdownOut.includes('首个目录 (firstCatalogMs)'))
const multiRunJsonOut = execFileSync(
  'node',
  [path.join(rootDir, 'scripts/tw-startup-report.mjs'), '--json', modernFixturePath, legacyFixturePath],
  { encoding: 'utf8' }
)
const multiRunReport = JSON.parse(multiRunJsonOut)
assert.equal(multiRunReport.median.windowVisibleMs, 165.1, 'even sample counts use the midpoint average')

console.log('✅ tw-startup-report.mjs verification PASSED!')
