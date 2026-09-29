/**
 * Resolve the target conversation for an IPC request.
 *
 * An explicit null/empty value means the renderer had no active conversation;
 * only legacy callers that omit the argument may use the current conversation.
 */
export function resolveConversationId(requestedConversationId, activeConversationId) {
  if (requestedConversationId === undefined) {
    return typeof activeConversationId === 'string' && activeConversationId.trim()
      ? activeConversationId
      : null
  }

  return typeof requestedConversationId === 'string' && requestedConversationId.trim()
    ? requestedConversationId
    : null
}
