/**
 * Resolve read-only prompt preparation inputs concurrently. The session state,
 * preferences, selected skill, and model context window are independent reads.
 */
export async function prefetchChatTurnInputs({
  skillName,
  workspacePath,
  workspaceTrusted,
  activeKey,
  conversationId,
  skills,
  appPreferences,
  modelService,
  appState,
}) {
  const skillPromise = skillName
    ? Promise.resolve().then(() => skills.resolve(skillName, { workspacePath, workspaceTrusted }))
    : Promise.resolve(null)
  const preferencesPromise = Promise.resolve().then(() => appPreferences.get())
  const contextWindowPromise = activeKey && typeof modelService?.getModelContextWindow === 'function'
    ? Promise.resolve()
      .then(() => modelService.getModelContextWindow(activeKey))
      .catch(() => null)
    : Promise.resolve(null)
  const conversationPromise = Promise.resolve().then(() => appState.getConversationState
    ? appState.getConversationState(conversationId)
    : appState.getState())

  const [selectedSkill, preferences, modelContextWindow, conversationState] = await Promise.all([
    skillPromise,
    preferencesPromise,
    contextWindowPromise,
    conversationPromise,
  ])

  return { selectedSkill, preferences, modelContextWindow, conversationState }
}
