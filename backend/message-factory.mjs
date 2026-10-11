/** @param {number} [timestamp] */
export function clockLabelZh(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * @param {string} text
 * @param {string} conversationId
 * @param {{ appState: { appendMessagesToConversation: Function } }} deps
 */
/**
 * @param {string} text
 * @param {string} conversationId
 * @param {{ appState: { appendMessagesToConversation: Function }, behavior?: 'steer' | 'followUp', name?: string }} deps
 */
export async function appendUserChatEntry(text, conversationId, { appState, behavior, name = '你' }) {
  const now = Date.now()
  const time = clockLabelZh(now)
  const messageId = `m-${now}-${Math.random().toString(36).slice(2, 8)}`
  const userEntry = {
    id: behavior === 'steer'
      ? `m-steer-${now}`
      : behavior === 'followUp'
        ? `m-followup-${now}`
        : `${messageId}-u`,
    author: 'user',
    name,
    time,
    timestamp: now,
    text,
    ...(behavior ? { behavior } : {}),
  }
  await appState.appendMessagesToConversation(conversationId, userEntry)
  return { messageId, time, userEntry }
}
