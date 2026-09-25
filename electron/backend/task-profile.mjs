/**
 * Least-privilege tool sets for DAG agents. A task type is only a default
 * profile; the shared permission service still governs every enabled tool.
 */
const PROFILES = Object.freeze({
  research: Object.freeze({
    id: 'read-only',
    tools: Object.freeze(['read', 'grep', 'find', 'ls']),
  }),
  review: Object.freeze({
    id: 'read-only',
    tools: Object.freeze(['read', 'grep', 'find', 'ls']),
  }),
  test: Object.freeze({
    id: 'verification',
    tools: Object.freeze(['read', 'bash', 'grep', 'find', 'ls']),
  }),
  implementation: Object.freeze({
    id: 'workspace-write',
    tools: Object.freeze(['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls']),
  }),
})

export function getTaskProfile(taskType) {
  return PROFILES[taskType] ?? PROFILES.implementation
}

export function getToolsForTask(taskType) {
  return [...getTaskProfile(taskType).tools]
}

/** The ordinary coding conversation gets the full, explicit built-in tool set. */
export function getToolsForSingleAgent() {
  return [...PROFILES.implementation.tools]
}
