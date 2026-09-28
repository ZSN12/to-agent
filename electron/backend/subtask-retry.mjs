/** Run a subtask once, then optionally retry it on distinct routed models. */
export async function runWithSubtaskRetries({
  initialModelKey,
  maxRetries = 1,
  canRetry = true,
  run,
  chooseModel,
  onRetry,
  signal,
}) {
  let lastError
  const excludedModelKeys = new Set([initialModelKey])

  try {
    return { result: await run(initialModelKey), modelKey: initialModelKey, attempts: 0 }
  } catch (error) {
    lastError = error
  }

  const retryLimit = Math.max(0, Math.min(3, Number(maxRetries) || 0))
  if (!canRetry || retryLimit === 0 || signal?.aborted) throw lastError

  for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
    if (signal?.aborted) throw lastError
    const candidate = await chooseModel({
      excludeModelKeys: [...excludedModelKeys],
      attempt,
      previousError: lastError,
    })
    if (!candidate?.modelKey || excludedModelKeys.has(candidate.modelKey)) break
    excludedModelKeys.add(candidate.modelKey)

    await onRetry?.({ ...candidate, attempt, maxRetries: retryLimit, previousError: lastError })
    try {
      return {
        result: await run(candidate.modelKey),
        modelKey: candidate.modelKey,
        attempts: attempt,
        candidate,
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}
