import { compactToolOutput } from '../context-compactor.mjs'

export const MODEL_CAPABILITY_RANK = Object.freeze({ weak: 0, medium: 1, strong: 2 })

export function resolveEscalationTier(model, catalog) {
  const capability = model?.capabilityTier
  const capabilityRank = MODEL_CAPABILITY_RANK[capability?.tier]
  const trustedCapability = capability?.overridden === true
    || (['rated', 'single-board'].includes(capability?.status)
      && capability?.source === 'lmarena'
      && catalog?.capabilityTierStatus?.stale !== true)
  if (Number.isFinite(capabilityRank) && trustedCapability) {
    return { rank: capabilityRank, tier: capability.tier, source: 'capability' }
  }
  return null
}

export function redactVerificationOutput(value) {
  return String(value ?? '')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
}

export function isVerificationEnvironmentFailure(value) {
  return /\b(?:EACCES|EPERM|ENOENT)\b|command not found|permission denied|access denied|operation not permitted|sandbox(?:ed)? (?:denied|blocked|refused)|not recognized as an internal|no such file or directory|missing script/i
    .test(String(value ?? ''))
}

export function verificationFailureOutput(verification, contextWindow, toolName = 'verification') {
  const raw = [verification?.errorSummary, verification?.stderr, verification?.stdout]
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n')
  if (!raw) return '验证命令未通过，执行器没有提供错误输出。'
  const compacted = compactToolOutput(raw, { contextWindow, toolName: redactVerificationOutput(toolName).slice(0, 1_000) })
  return redactVerificationOutput(compacted.text).slice(0, 6_000)
}

export function attachVerificationFailure(result, {
  command,
  exitCode,
  output,
  status = 'failed',
  source = 'verification-runner',
}) {
  const safeCommand = redactVerificationOutput(command || '(未知命令)').slice(0, 1_000)
  const safeOutput = redactVerificationOutput(output).slice(0, 6_000)
  const message = `验证命令 ${safeCommand} 未通过（退出码 ${exitCode ?? '未知'}）。\n${safeOutput}`
  const error = new Error(message)
  error.code = 'EVERIFY_FAILED'
  error.failureStage = 'verification'
  error.retryable = true
  error.partialResult = result
  error.executionEvidence = result?.executionEvidence
  error.evidenceBundle = {
    failure_stage: 'verification',
    failure_scope: 'model',
    related_files: (Array.isArray(result?.fileChanges) ? result.fileChanges : [])
      .map((change) => change?.path)
      .filter((file) => typeof file === 'string' && file),
    verified_facts: [],
    diff: null,
    failed_tests: [{ command: safeCommand, exit_code: exitCode ?? null, status, source, output: safeOutput }],
  }
  if (result && typeof result === 'object') {
    result.text = typeof result.text === 'string'
      ? `${result.text}\n\n> [!WARNING]\n> **验收验证未通过**（\`${safeCommand}\`，退出码 ${exitCode ?? '未知'}）：\n\`\`\`\n${safeOutput}\n\`\`\``
      : result.text
  }
  return error
}

export function mapTaskStatus(status, { phase = 'running', paused = false, replayed = false, preserveFailures = false } = {}) {
  if (phase === 'initialize') return replayed ? 'completed' : 'running'
  if (status === 'done' || replayed) return 'completed'
  if (phase === 'cancelled') return preserveFailures && ['review', 'failed'].includes(status) ? 'failed' : 'cancelled'
  if (phase === 'pause') return paused ? 'paused' : 'running'
  return phase
}
