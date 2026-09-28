/**
 * Task-aware profiles for multi-agent DAG (C1). Maps taskType → tools, skill, MCP policy.
 */
const PROFILES = Object.freeze({
  research: Object.freeze({
    id: 'read-only',
    taskType: 'research',
    tools: Object.freeze(['read', 'grep', 'find', 'ls']),
    useGlobalSkill: false,
    allowWebSearch: true,
    allowWriteMcpTools: false,
    preamble:
      '你是调研子 Agent：只读探索代码库，输出结构化结论（涉及文件、符号、风险），不要修改任何文件。',
  }),
  review: Object.freeze({
    id: 'read-only',
    taskType: 'review',
    tools: Object.freeze(['read', 'grep', 'find', 'ls']),
    useGlobalSkill: false,
    allowWebSearch: false,
    allowWriteMcpTools: false,
    preamble:
      '你是审查子 Agent：基于依赖任务的改动进行代码审查，关注正确性、边界与安全；不要直接改代码。',
  }),
  test: Object.freeze({
    id: 'verification',
    taskType: 'test',
    tools: Object.freeze(['read', 'bash', 'grep', 'find', 'ls']),
    useGlobalSkill: false,
    allowWebSearch: false,
    allowWriteMcpTools: false,
    preamble:
      '你是测试验证子 Agent：运行项目真实的构建/测试命令，报告通过与否与关键日志；不要为通过测试而掩盖失败。',
  }),
  implementation: Object.freeze({
    id: 'workspace-write',
    taskType: 'implementation',
    tools: Object.freeze(['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls']),
    useGlobalSkill: true,
    allowWebSearch: false,
    allowWriteMcpTools: true,
    preamble:
      '你是实现子 Agent：在依赖调研结论基础上完成代码修改，保持仓库风格一致，并说明改动文件与验证情况。',
  }),
})

const READ_ONLY_PARALLEL_TYPES = new Set(['research', 'review'])

export function getTaskProfile(taskType) {
  return PROFILES[taskType] ?? PROFILES.implementation
}

export function getToolsForTask(taskType) {
  return [...getTaskProfile(taskType).tools]
}

/** 单 Agent 主对话使用完整工具集。 */
export function getToolsForSingleAgent() {
  return [...PROFILES.implementation.tools]
}

export function isReadOnlyTaskType(taskType) {
  return READ_ONLY_PARALLEL_TYPES.has(taskType)
}

export function canRunSubtasksInParallel(batch) {
  if (!Array.isArray(batch) || batch.length < 2) return false
  return batch.every((task) => isReadOnlyTaskType(task.taskType))
}
