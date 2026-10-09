function safeErrorSummary(error) {
  const message = error instanceof Error ? error.message : String(error ?? '未知错误')
  return message
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
    .slice(0, 600)
}

export function classifySubtaskFailure(error, { signal } = {}) {
  const code = typeof error?.code === 'string' ? error.code.toUpperCase() : ''
  const status = Number(error?.status ?? error?.statusCode)
  const message = safeErrorSummary(error).toLowerCase()
  if (code === 'AGENT_BLOCKED' || code === 'AGENT_EMPTY_RESPONSE') {
    return {
      kind: code === 'AGENT_BLOCKED' ? 'policy-blocked' : 'empty-response',
      retryable: false,
      reason: code === 'AGENT_BLOCKED'
        ? '工具或安全策略已阻止本轮；更换模型重试可能重复触发相同阻止，不自动重试'
        : 'Agent 本轮没有返回最终文本；避免自动升级模型重复消耗，需人工决定是否继续',
    }
  }
  if (signal?.aborted || code === 'ABORT_ERR' || code === 'ERR_CANCELED' || /\b(aborted|cancelled|canceled)\b/.test(message)) {
    return { kind: 'cancelled', retryable: false, reason: '任务已取消' }
  }
  if (
    ['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'EWORKSPACE'].includes(code)
    || /permission denied|access denied|sandbox|workspace (?:is )?not found|working directory.*not found|command not found/.test(message)
  ) {
    return { kind: 'environment', retryable: false, reason: '工作区、命令或权限环境错误，不通过更换模型重试' }
  }
  if (
    [400, 401, 403, 404, 422].includes(status)
    || /invalid api key|incorrect api key|unauthorized|authentication failed|model not found|unsupported model|invalid request/.test(message)
  ) {
    return { kind: 'configuration', retryable: false, reason: '模型或请求配置错误，不通过更换模型盲目重试' }
  }
  const tlsHandshakeFailure = /client network socket disconnected|network socket disconnected|tls handshake|secure tls/.test(message)
  if (
    code === 'TRANSPORT'
    || ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code)
    || tlsHandshakeFailure
    || /socket hang up|connection reset|fetch failed|network error/.test(message)
  ) {
    return {
      kind: 'transport',
      retryable: true,
      failoverScope: 'route-domain',
      failureStage: tlsHandshakeFailure ? 'tls-handshake' : 'provider-transport',
      reason: '模型传输连接中断，重试时切换到其他上游路由',
    }
  }
  if (
    [408, 425, 429, 500, 502, 503, 504].includes(status)
    || /timeout|timed out|rate limit|temporarily unavailable|fetch failed|network error/.test(message)
  ) {
    return { kind: 'transient', retryable: true, reason: '模型服务暂时不可用，可尝试其他已配置模型' }
  }
  return { kind: 'execution', retryable: true, reason: '子任务执行失败，可携带失败证据尝试其他模型' }
}

function attachEvidence(error, evidenceBundle) {
  const wrapped = error instanceof Error ? error : new Error(String(error ?? '子任务执行失败'))
  wrapped.evidenceBundle = evidenceBundle
  return wrapped
}

function makeEvidenceBundle(task, attempts, error, failure) {
  return {
    task_id: task?.id ?? 'unknown',
    task_type: task?.taskType ?? 'unknown',
    title: task?.title ?? '',
    related_files: [],
    verified_facts: [],
    diff: null,
    failed_tests: [],
    failure_class: failure.kind,
    failure_scope: failure.failoverScope ?? 'model',
    failure_stage: failure.failureStage ?? 'model-execution',
    error_summary: safeErrorSummary(error),
    attempted_actions: attempts.map(({ modelKey, outcome, errorSummary }) =>
      `${modelKey}: ${outcome}${errorSummary ? ` — ${errorSummary}` : ''}`),
    created_at: new Date().toISOString(),
  }
}

/** Run a subtask once, then retry eligible failures on models outside failed transport domains. */
export async function runWithSubtaskRetries({
  task,
  initialModelKey,
  failureDomainForModel,
  maxRetries = 1,
  canRetry = true,
  run,
  chooseModel,
  onRetry,
  signal,
}) {
  let lastError
  const attempts = []
  const excludedModelKeys = new Set([initialModelKey])

  try {
    return { result: await run(initialModelKey, null), modelKey: initialModelKey, attempts: 0 }
  } catch (error) {
    lastError = error
    attempts.push({ modelKey: initialModelKey, outcome: 'failed', errorSummary: safeErrorSummary(error) })
  }

  const retryLimit = Math.max(0, Math.min(3, Number(maxRetries) || 0))
  let failure = classifySubtaskFailure(lastError, { signal })
  let evidenceBundle = makeEvidenceBundle(task, attempts, lastError, failure)
  const retryAllowed = (classifiedFailure, error) => typeof canRetry === 'function'
    ? Boolean(canRetry({ task, failure: classifiedFailure, error }))
    : Boolean(canRetry)
  const excludedFailureDomains = new Set()
  const excludeFailedRouteDomain = (modelKey, classifiedFailure) => {
    if (classifiedFailure.failoverScope !== 'route-domain' || typeof failureDomainForModel !== 'function') return
    const domain = failureDomainForModel(modelKey)
    if (typeof domain === 'string' && domain.trim()) excludedFailureDomains.add(domain)
  }
  excludeFailedRouteDomain(initialModelKey, failure)
  if (!retryAllowed(failure, lastError) || retryLimit === 0 || !failure.retryable) {
    throw attachEvidence(lastError, evidenceBundle)
  }

  for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
    if (signal?.aborted) throw attachEvidence(lastError, evidenceBundle)
    const candidate = await chooseModel({
      excludeModelKeys: [...excludedModelKeys],
      excludeFailureDomains: [...excludedFailureDomains],
      attempt,
      previousError: lastError,
      failure,
      evidenceBundle,
    })
    if (!candidate?.modelKey || excludedModelKeys.has(candidate.modelKey)) {
      throw attachEvidence(lastError, evidenceBundle)
    }
    excludedModelKeys.add(candidate.modelKey)

    await onRetry?.({ ...candidate, attempt, maxRetries: retryLimit, previousError: lastError, failure, evidenceBundle })
    try {
      const result = await run(candidate.modelKey, evidenceBundle)
      return {
        result,
        modelKey: candidate.modelKey,
        attempts: attempt,
        candidate,
        evidenceBundle,
      }
    } catch (error) {
      lastError = error
      attempts.push({ modelKey: candidate.modelKey, outcome: 'failed', errorSummary: safeErrorSummary(error) })
      failure = classifySubtaskFailure(error, { signal })
      excludeFailedRouteDomain(candidate.modelKey, failure)
      evidenceBundle = makeEvidenceBundle(task, attempts, error, failure)
      if (!failure.retryable || !retryAllowed(failure, error)) throw attachEvidence(error, evidenceBundle)
    }
  }

  throw attachEvidence(lastError, evidenceBundle)
}
