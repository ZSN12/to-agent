import assert from 'node:assert'
import { UsageLedger } from '../electron/backend/orchestration/usage-ledger.mjs'

async function testUsageLedger() {
  const ledger = new UsageLedger()

  // test record
  ledger.record({
    runId: 'run-1',
    taskId: 'planner',
    attempt: 1,
    modelKey: 'model-a',
    usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.1 },
    outcome: 'success'
  })

  ledger.record({
    runId: 'run-1',
    taskId: 'task-1',
    attempt: 1,
    modelKey: 'model-b',
    usage: { promptTokens: 20, completionTokens: 10, costUsd: 0.2 },
    outcome: 'failed'
  })

  ledger.record({
    runId: 'run-1',
    taskId: 'task-1',
    attempt: 2,
    modelKey: 'model-a',
    usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.1 },
    outcome: 'success'
  })

  const summary = ledger.getSummary()
  assert.strictEqual(summary.totalTokens, 60) // (10+5) + (20+10) + (10+5)
  assert.strictEqual(Math.abs(summary.totalCostUsd - 0.4) < 1e-6, true)
  assert.strictEqual(summary.breakdown['model-a'].tokens, 30)
  assert.strictEqual(summary.breakdown['model-b'].tokens, 30)

  console.log('UsageLedger tests passed')
}

testUsageLedger().catch((err) => {
  console.error(err)
  process.exit(1)
})
