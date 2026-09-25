export function RetryBanner({
  attempt,
  maxAttempts,
  delayMs,
  message,
}: {
  attempt: number
  maxAttempts?: number
  delayMs?: number
  message?: string
}) {
  const max = maxAttempts ?? attempt
  const seconds = delayMs ? Math.ceil(delayMs / 1000) : null
  return (
    <div className="retry-banner" role="status">
      模型请求失败，正在重试 ({attempt}/{max})
      {seconds ? ` · ${seconds}s 后重试` : ''}
      {message ? ` · ${message.slice(0, 120)}` : ''}
    </div>
  )
}
