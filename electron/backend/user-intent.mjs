/**
 * TaskWeaver 用户意图分析器 (User Intent Analyzer)
 * 区分“代码修改实施 (CODE_MUTATION)”、“只读咨询理解 (READ_ONLY)”与“架构规划 (PLANNING)”
 */

export const USER_INTENTS = Object.freeze({
  CODE_MUTATION: 'mutation',
  READ_ONLY: 'read_only',
  PLANNING: 'planning',
})

const READ_ONLY_PATTERNS = [
  /^(请问|为什么|怎么理解|解释一下|说明一下|分析一下|介绍一下|什么是|如何看待|有什么区别)/i,
  /(什么意思|怎么回事|有什么用|怎么用|用法是|原理是|时间复杂度|空间复杂度|优缺点|哪里定义|在何处)\??$/i,
  /^(查看|查一下|查找|找一下|搜一下|搜索|定位|阅读|帮我看|看下|看一下|帮我找|帮我搜|帮我查|走读|请教)/i,
  /(解释|分析|介绍|说明|总结|走读|梳理|理解|含义|作用)/i,
]

const MUTATION_KEYWORDS = [
  '修改', '修复', 'fix', 'bug', '实现', '新增', '添加', '增加', '重构', '编写', '写一个', '创建',
  '优化', '改动', '替换', '删除', '更新', '补充', '接入', '对齐', '解决', '补全',
  'refactor', 'implement', 'add', 'create', 'update', 'remove', 'delete',
]

/**
 * 分析用户输入意图
 * @param {string} text 用户输入文本
 * @param {string} [workMode='code'] 当前工作模式 ('code' | 'plan' | 'goal')
 * @returns {typeof USER_INTENTS[keyof typeof USER_INTENTS]}
 */
export function analyzeUserIntent(text, workMode = 'code') {
  if (workMode === 'plan') return USER_INTENTS.PLANNING

  const clean = (text || '').trim()
  if (!clean) return USER_INTENTS.READ_ONLY

  // 1. 如果有明确的规划关键词
  if (/^(\/plan|制定计划|生成方案|架构规划|实施计划|规划一下)/i.test(clean)) {
    return USER_INTENTS.PLANNING
  }

  // 2. 检查是否包含明确的代码修改动词
  const hasMutationKeyword = MUTATION_KEYWORDS.some((kw) => clean.includes(kw))

  // 3. 检查是否为典型的只读咨询/分析/定位
  const isMatchReadOnlyPattern = READ_ONLY_PATTERNS.some((regex) => regex.test(clean))

  if (isMatchReadOnlyPattern && !hasMutationKeyword) {
    return USER_INTENTS.READ_ONLY
  }

  if (hasMutationKeyword) {
    return USER_INTENTS.CODE_MUTATION
  }

  // 4. 问句结尾
  if (/[?？吗呢嘛]$/.test(clean)) {
    return USER_INTENTS.READ_ONLY
  }

  return USER_INTENTS.CODE_MUTATION
}

/**
 * 根据用户意图与工作区策略，为单 Agent 对话注入有针对性的闭环提示
 * @param {string} prompt 组装好上下文的 prompt
 * @param {string} intent 意图类型
 * @param {import('./verification-policy.mjs').detectVerificationCommands extends (a: any) => infer R ? R : any} policy 验证策略
 */
export function injectIntentGuidelines(prompt, intent, policy) {
  if (intent === USER_INTENTS.PLANNING) {
    return prompt // 计划模式已有专门的前缀提示
  }

  if (intent === USER_INTENTS.READ_ONLY) {
    return `${prompt}\n\n> [!NOTE]\n> 当前请求属于技术咨询或代码理解，请直接提供清晰严谨的解答。在没有用户明确要求的情况下，无需修改工作区文件或执行测试。`
  }

  if (intent === USER_INTENTS.CODE_MUTATION && policy) {
    const testCmd = policy.primaryCommand || policy.testCommand
    if (testCmd) {
      return `${prompt}\n\n> [!IMPORTANT]\n> **自主闭环要求**：完成上述代码修改后，你必须调用 \`bash\` 工具运行工作区验证命令 \`${testCmd}\` 自测。若验证失败，请根据错误日志自行修正；验证通过后，请在最终回复末尾附带自检结果总结。`
    }
  }

  return prompt
}
