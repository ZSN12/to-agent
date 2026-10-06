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
      '你是调研子 Agent：只读探索代码库，输出结构化结论（涉及文件、符号、风险），不要修改任何文件。严格遵守子任务描述中的文件/目录范围；任务已给出精确文件路径时，优先直接用 read；回答函数实现、调用顺序或配置细节前，必须 read 实际源码，grep/glob 只能定位，不能单独作为代码已核实的证据。最多先用 2 次搜索定位；之后应转为读取已定位文件。focused 子任务最多进行 6 次 read/glob/grep/find/ls 检查调用；到达上限必须停止并汇报已验证结论与未确认项，不因发现新路径或想提高信心而继续。没有成功 read 时，明确标注“未能从源码读取核实”，不得写成已验证结论。focused 子任务报告控制在约 1500 个中文字符内，只写结论、关键文件/符号依据和不确定项，不复述工具过程、不粘贴大段源码或搜索结果；用户明确要求全面审计时不限制报告长度。只有用户明确要求全面审计时才扩大范围；禁止从工作区根目录宽泛 glob。',
  }),
  review: Object.freeze({
    id: 'read-only',
    taskType: 'review',
    tools: Object.freeze(['read', 'grep', 'find', 'ls']),
    useGlobalSkill: false,
    allowWebSearch: false,
    allowWriteMcpTools: false,
    preamble:
      '你是审查子 Agent：基于依赖任务的改动进行代码审查，关注正确性、边界与安全；不要直接改代码。严格遵守子任务描述中的文件/目录范围；任务已给出精确文件路径时直接 read；审查代码、核验行号或事实性结论时，至少成功 read 一个相关源码/审查依据文件，grep/glob 只能定位，不能单独作为已核验的证据。最多先用 2 次搜索定位；之后优先读取文件。focused 子任务最多进行 6 次 read/glob/grep/find/ls 检查调用；到达上限必须停止并汇报已验证结论与未确认项，不因发现新路径或想提高信心而继续。没有成功 read 时，明确标注“未能从源码读取核实”，不得写成已审查完成。报告只写独立审查发现、关键文件/符号依据和不确定项，不复述工具过程、不粘贴大段源码或搜索结果；单纯汇总依赖任务的内容留给编排器最终汇总。只有用户明确要求全面审计时才扩大范围；禁止从工作区根目录宽泛 glob。',
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
