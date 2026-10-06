/**
 * TaskWeaver 用户意图分析器 (User Intent Analyzer)
 * 区分「代码修改实施 (CODE_MUTATION)」、「只读咨询理解 (READ_ONLY)」、
 * 「架构规划 (PLANNING)」与「普通对话 (CONVERSATION)」。
 *
 * 设计原则：**保守判定**。
 * 只有命中明确的“改代码”动词才认定为 CODE_MUTATION；无法判断时归入 CONVERSATION 并且
 * 不注入任何自检要求。旧实现把无规则的输入一律当作 CODE_MUTATION，导致“你好”这类寒暄
 * 也被追加“必须运行构建命令自测”，在大型仓库上会触发分钟级的无意义构建链。
 */

export const USER_INTENTS = Object.freeze({
  CODE_MUTATION: 'mutation',
  READ_ONLY: 'read_only',
  PLANNING: 'planning',
  /** 寒暄、确认、闲聊，或无法判断意图的中性输入——不注入任何额外要求。 */
  CONVERSATION: 'conversation',
})

const READ_ONLY_PATTERNS = [
  /^(请问|为什么|怎么理解|解释一下|说明一下|分析一下|介绍一下|什么是|如何看待|有什么区别)/i,
  /(什么意思|怎么回事|有什么用|怎么用|用法是|原理是|时间复杂度|空间复杂度|优缺点|哪里定义|在何处)\??$/i,
  /^(查看|查一下|查找|找一下|搜一下|搜索|定位|阅读|帮我看|看下|看一下|帮我找|帮我搜|帮我查|走读|请教|读下|读一下)/i,
  /(解释|分析|介绍|说明|总结|走读|梳理|理解|含义|作用)/i,
  // 中文常见疑问句式（注意：mutation 关键词优先判定，因此不会吞掉“修复这个并解释原因”）
  /(是干什么的|干什么用的|是干嘛的|怎么实现|如何实现|谁调用|被谁调用|在哪(里|儿)|什么区别|哪个更好|是否支持)/,
]

/** 寒暄 / 致谢 / 确认：明确不是工程任务。 */
const CONVERSATION_PATTERNS = [
  /^(你好|您好|hi|hello|hey|嗨|哈喽|在吗|在么|早上好|中午好|下午好|晚上好|晚安)/i,
  /^(谢谢|感谢|辛苦了|收到|明白|明白了|好的|好嘞|嗯|ok|OK|okay)\s*[!！。.~]*$/,
  /^(你是谁|你能做什么|介绍一下你自己|测试|test)\s*[?？!！。.]*$/i,
]

/** 明确的代码修改动词。命中这里才认定为代码修改任务。 */
const MUTATION_KEYWORDS = [
  '修改', '修复', 'fix', 'bug', '实现', '新增', '添加', '增加', '重构', '编写', '写一个', '创建',
  '优化', '改动', '替换', '删除', '更新', '补充', '接入', '对齐', '解决', '补全',
  '改成', '改一下', '改掉', '去掉', '加上', '删掉', '修一下', '调一下',
  '加一个', '加个', '帮我加', '补一个', '写个', '做个',
  'refactor', 'implement', 'add', 'create', 'update', 'remove', 'delete',
]

/** 紧邻在动词之前的疑问词：此时该动词是在“问怎么做”，不是在“要求做”。 */
const INTERROGATIVE_BEFORE = /(怎么|如何|为什么|为啥|什么是|是否|哪里|什么|哪种|能否|可不可以)$/

/** 紧跟在动词之后的释义问法：如「更新是什么意思」——在问词义，不是在要求更新。 */
const INTERROGATIVE_AFTER = /^(是什么意思|是啥意思|是什么|指什么|指的是什么|的含义)/

/**
 * 判断是否表达了“要改代码”的意图。
 * 中文没有词边界，`实现`/`更新`/`优化` 这类词会出现在“怎么实现的”这种疑问句里，
 * 因此被疑问词紧邻修饰的动词不计入修改意图。
 * @param {string} text
 */
function hasMutationIntent(text) {
  for (const keyword of MUTATION_KEYWORDS) {
    let from = 0
    while (true) {
      const index = text.indexOf(keyword, from)
      if (index < 0) break
      const before = text.slice(Math.max(0, index - 3), index)
      const after = text.slice(index + keyword.length)
      if (!INTERROGATIVE_BEFORE.test(before) && !INTERROGATIVE_AFTER.test(after)) return true
      from = index + keyword.length
    }
  }
  return false
}

/**
 * 分析用户输入意图
 * @param {string} text 用户输入文本
 * @param {string} [workMode='code'] 当前工作模式 ('code' | 'plan' | 'goal')
 * @returns {typeof USER_INTENTS[keyof typeof USER_INTENTS]}
 */
export function analyzeUserIntent(text, workMode = 'code') {
  if (workMode === 'plan') return USER_INTENTS.PLANNING

  const clean = (text || '').trim()
  if (!clean) return USER_INTENTS.CONVERSATION

  // 1. 显式规划关键词
  if (/^(\/plan|制定计划|生成方案|架构规划|实施计划|规划一下)/i.test(clean)) {
    return USER_INTENTS.PLANNING
  }

  // 2. 寒暄 / 确认 / 致谢
  if (CONVERSATION_PATTERNS.some((regex) => regex.test(clean))) {
    return USER_INTENTS.CONVERSATION
  }

  // 3. 明确的代码修改动词（优先级高于只读，避免“修复一下并解释原因”被误判为只读）
  if (hasMutationIntent(clean)) {
    return USER_INTENTS.CODE_MUTATION
  }

  // 4. 只读咨询 / 分析 / 定位
  if (READ_ONLY_PATTERNS.some((regex) => regex.test(clean))) {
    return USER_INTENTS.READ_ONLY
  }

  // 5. 问句结尾
  if (/[?？吗呢嘛]$/.test(clean)) {
    return USER_INTENTS.READ_ONLY
  }

  // 6. 兜底：无法判断时保持中性，宁可不提示，也不要误判成“要改代码 + 要跑构建”。
  return USER_INTENTS.CONVERSATION
}

/**
 * 根据用户意图与工作区策略，为单 Agent 对话注入有针对性的闭环提示
 * @param {string} prompt 组装好上下文的 prompt
 * @param {string} intent 意图类型
 * @param {import('./verification-policy.mjs').VerificationPolicy | null} policy 验证策略
 */
export function injectIntentGuidelines(prompt, intent, policy) {
  // 计划模式已有专门的前缀提示
  if (intent === USER_INTENTS.PLANNING) return prompt

  // 普通对话 / 无法判断：不注入任何额外要求
  if (intent === USER_INTENTS.CONVERSATION) return prompt

  if (intent === USER_INTENTS.READ_ONLY) {
    return `${prompt}\n\n> [!NOTE]\n> 当前请求属于只读咨询或代码理解，请直接依据证据回答，不要修改文件或执行测试。若用户指定了文件/目录范围，优先限定在该范围；只有回答确实需要时才扩展，并简要说明原因。若用户明确禁止读取范围外内容，必须遵守，并把因此无法验证的部分明确标为未验证。避免重复读取，证据足够后停止探索。`
  }

  if (intent === USER_INTENTS.CODE_MUTATION && policy) {
    const verifyCmd = policy.primaryCommand || policy.testCommand
    if (verifyCmd) {
      return `${prompt}\n\n> [!IMPORTANT]\n> **自主闭环要求**：本次修改完成后，请调用 \`bash\` 工具运行轻量验证命令 \`${verifyCmd}\` 自检。若验证失败，请根据错误日志自行修正；验证通过后，请在最终回复末尾附带自检结果总结。\n> 若本次改动属于纯文案/注释或无法被该命令覆盖，可跳过验证并在回复中说明原因。`
    }
  }

  return prompt
}
