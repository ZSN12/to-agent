import assert from 'node:assert/strict'
import {
  calculateQuotaAdjustment,
  isQuotaResourceFresh,
  modelMatchesQuotaPolicy,
} from '../electron/backend/routing-portfolio-service.mjs'
import { selectModelForTask } from '../electron/backend/orchestration-policy.mjs'
import { loadRoutingPortfolio } from '../electron/backend/routing-portfolio-service.mjs'

const portfolio = loadRoutingPortfolio()
const now = Date.now()

const baseResource = {
  remaining: 80,
  limit: 100,
  stale: false,
  fetchedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
  resetsAt: new Date(now + 12 * 3600000).toISOString(),
}

const snapshot = {
  providers: {
    codex: { resources: { weekly: { ...baseResource } } },
  },
}

assert.equal(modelMatchesQuotaPolicy('openai-codex/gpt-5.5', portfolio.quota_cycles.policies[0]), true)
assert.equal(modelMatchesQuotaPolicy('deepseek/deepseek-chat', portfolio.quota_cycles.policies[0]), false)

const defaults = { max_snapshot_age_ms: 3600000 }
assert.equal(isQuotaResourceFresh(baseResource, defaults, now), true)
assert.equal(isQuotaResourceFresh({ ...baseResource, stale: true }, defaults, now), false)
assert.equal(
  isQuotaResourceFresh(
    { ...baseResource, fetchedAt: new Date(now - 7200000).toISOString() },
    defaults,
    now,
  ),
  false,
)

const bonusAdj = calculateQuotaAdjustment('openai-codex/gpt-5.5', portfolio, snapshot, now)
assert.ok(bonusAdj.bonus > 0)
assert.equal(bonusAdj.penalty, 0)

const scarceSnapshot = {
  providers: {
    codex: {
      resources: {
        weekly: {
          ...baseResource,
          remaining: 5,
          resetsAt: new Date(now + 30 * 24 * 3600000).toISOString(),
        },
      },
    },
  },
}
const scarceAdj = calculateQuotaAdjustment('openai-codex/gpt-5.5', portfolio, scarceSnapshot, now)
assert.ok(scarceAdj.penalty > 0)
assert.equal(scarceAdj.bonus, 0)

const rolloverPortfolio = {
  ...portfolio,
  quota_cycles: {
    ...portfolio.quota_cycles,
    policies: portfolio.quota_cycles.policies.map((policy) =>
      policy.provider_id === 'codex' ? { ...policy, rollover: true } : policy,
    ),
  },
}
assert.equal(calculateQuotaAdjustment('openai-codex/gpt-5.5', rolloverPortfolio, snapshot, now).bonus, 0)

const farFromResetSnapshot = {
  providers: {
    codex: { resources: { weekly: { ...baseResource, resetsAt: new Date(now + 7 * 24 * 3600000).toISOString() } } },
  },
}
assert.equal(calculateQuotaAdjustment('openai-codex/gpt-5.5', portfolio, farFromResetSnapshot, now).bonus, 0)

const missingResetSnapshot = {
  providers: {
    codex: { resources: { weekly: { ...baseResource, resetsAt: undefined, resetAt: undefined } } },
  },
}
assert.equal(calculateQuotaAdjustment('openai-codex/gpt-5.5', portfolio, missingResetSnapshot, now).bonus, 0)

const expiredSnapshot = {
  providers: {
    codex: { resources: { weekly: { ...baseResource, fetchedAt: new Date(now - 2 * 3600000).toISOString() } } },
  },
}
assert.equal(calculateQuotaAdjustment('openai-codex/gpt-5.5', portfolio, expiredSnapshot, now).bonus, 0)

const wrongResourceSnapshot = {
  providers: {
    codex: { resources: { monthly: { ...baseResource } } },
  },
}
assert.equal(calculateQuotaAdjustment('openai-codex/gpt-5.5', portfolio, wrongResourceSnapshot, now).bonus, 0)

const catalog = {
  models: [
    {
      key: 'openai-codex/gpt-5.3-codex-spark',
      name: 'Codex Spark',
      available: true,
      profile: { tier: 'balanced', enabledForAllocation: true },
      costPerMillion: { input: 1, output: 3 },
    },
    {
      key: 'deepseek/deepseek-chat',
      name: 'DeepSeek',
      available: true,
      profile: { tier: 'balanced', enabledForAllocation: true },
      costPerMillion: { input: 0.2, output: 0.8 },
    },
  ],
}

const withQuota = selectModelForTask('implementation', catalog, 'deepseek/deepseek-chat', {
  portfolio,
  quotaSnapshot: snapshot,
  now: new Date(now),
})
assert.equal(withQuota.modelKey, 'openai-codex/gpt-5.3-codex-spark')
assert.ok(withQuota.reasons.some((r) => r.includes('刷新前利用') || r.includes('边际成本为 0')))

const offline = selectModelForTask('implementation', catalog, 'deepseek/deepseek-chat', {
  portfolio,
  quotaSnapshot: null,
  now: new Date(now),
})
assert.equal(offline.modelKey, 'openai-codex/gpt-5.3-codex-spark')

console.log('quota-cycle checks passed')
