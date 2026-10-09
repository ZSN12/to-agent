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
      '你是调研子 Agent：只读探索代码库，输出结构化结论（涉及文件、符号、风险），不要修改任何文件。严格遵守子任务描述中的文件/目录范围；所有文件工具路径必须使用工作区相对路径，禁止传绝对路径。回答函数实现、调用顺序或配置细节前，必须 read 实际源码，grep/glob 只能定位，不能单独作为代码已核实的证据。已知路径的小文件可直接 read；大型源码文件若目标符号/区段尚未定位，先在该精确文件内 grep，再用 read(offset, limit) 读取命中附近的相关范围，避免先读取默认大窗口来寻找位置。若需核实多文件调用链，先并行定位各文件中的关键符号，再并行读取；只建立回答问题所需的最短链路，入口到目标调用由源码证实后立即结束。复用已有读取，只有能指出缺失的具体事实时才继续搜索。根据问题选择最相关的搜索与读取；避免重复检查，除非能指出尚未解决的具体事实。完成条件：子任务要求的结论均有源码证据，且不确定项已标明后，立即整理回答；不要顺手追查未被要求的相邻 UI、持久化或 Host 内部实现。只有当这些部分是验收条件或现有证据确实无法支撑结论时才扩大。没有成功 read 时，明确标注“未能从源码读取核实”，不得写成已验证结论。focused 子任务只写结论、关键文件/符号依据和不确定项，不复述工具过程、不粘贴大段源码或搜索结果；只有用户明确要求全面审计时才扩大范围并系统覆盖；禁止从工作区根目录宽泛 glob。',
  }),
  review: Object.freeze({
    id: 'read-only',
    taskType: 'review',
    tools: Object.freeze(['read', 'grep', 'find', 'ls']),
    useGlobalSkill: false,
    allowWebSearch: false,
    allowWriteMcpTools: false,
    preamble:
      '你是审查子 Agent：基于依赖任务的改动进行代码审查，关注正确性、边界与安全；不要直接改代码。严格遵守子任务描述中的文件/目录范围；所有文件工具路径必须使用工作区相对路径，禁止传绝对路径。审查代码、核验行号或事实性结论时，至少成功 read 一个相关源码/审查依据文件，grep/glob 只能定位，不能单独作为已核实的证据。已知路径的小文件可直接 read；大型源码文件若目标符号/区段尚未定位，先在该精确文件内 grep，再用 read(offset, limit) 读取命中附近的相关范围，避免先读取默认大窗口来寻找位置。根据具体审查点搜索并读取相关依据，避免重复检查，除非能指出尚未解决的具体事实。完成条件：审查要求均有源码证据、发现与不确定项已整理后，立即报告；不要顺手审查未被要求的相邻组件，除非证据显示其会影响当前结论。没有成功 read 时，明确标注“未能从源码读取核实”，不得写成已审查完成。报告只写独立审查发现、关键文件/符号依据和不确定项，不复述工具过程、不粘贴大段源码或搜索结果；单纯汇总依赖任务的内容留给编排器最终汇总。只有用户明确要求全面审计时才扩大范围并系统覆盖；禁止从工作区根目录宽泛 glob。',
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

function scopesOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

/**
 * Whether implementation tasks have explicit, non-overlapping write scopes.
 * Callers must also ensure each task runs in an isolated worktree.
 */
export function canRunScopedImplementationTasksConcurrently(tasks) {
  if (!Array.isArray(tasks) || tasks.length < 2) return false
  const assignedScopes = []
  for (const task of tasks) {
    if (task?.taskType !== 'implementation' || !Array.isArray(task.writeScopes) || task.writeScopes.length === 0) {
      return false
    }
    const taskScopes = []
    for (const scope of task.writeScopes) {
      if (typeof scope !== 'string' || !scope.trim()) return false
      const normalized = scope.trim().normalize('NFC').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '')
      if (
        !normalized
        || normalized.startsWith('/')
        || /^[a-z]:/i.test(normalized)
        || normalized.split('/').includes('..')
        || /[*?{}\[\]]/.test(normalized)
      ) return false
      const canonical = normalized.toLowerCase()
      if (assignedScopes.some((owned) => scopesOverlap(canonical, owned))) return false
      taskScopes.push(canonical)
    }
    assignedScopes.push(...taskScopes)
  }
  return true
}
