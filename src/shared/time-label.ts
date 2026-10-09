/** Chat message clock label (zh-CN, 24h), aligned with `electron/backend/message-factory.mjs`. */
export function clockLabelZh(timestamp: number = Date.now()): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
