import path from 'node:path'
import crypto from 'node:crypto'
import { createJsonStore } from './json-store.mjs'

/**
 * 校验模式是否匹配目标字符串（支持简单通配符 *，或完全匹配）
 */
export function matchPattern(pattern, target) {
  if (!pattern || typeof target !== 'string') return false
  const p = pattern.trim()
  const t = target.trim()
  if (p === '*' || p === t) return true
  if (p.includes('*')) {
    // 将通配符 * 转换为正则
    const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    const regex = new RegExp(`^${escaped}$`, 'i')
    return regex.test(t)
  }
  return false
}

/** Persistent command rules are exact by default; shell metacharacters never act as globs implicitly. */
export function matchCommandPattern(pattern, target, { allowWildcards = false } = {}) {
  if (typeof pattern !== 'string' || typeof target !== 'string') return false
  const expected = pattern.trim()
  const actual = target.trim()
  return allowWildcards && expected.includes('*')
    ? matchPattern(expected, actual)
    : expected === actual
}

/** Split shell command lists and pipelines outside quotes for per-segment permission evaluation. */
export function splitShellCommandSegments(command) {
  const source = String(command ?? '')
  const segments = []
  let buffer = ''
  let quote = null
  let escaped = false
  let commandRequired = false

  const pushSegment = () => {
    const value = buffer.trim()
    if (value) segments.push(value)
    buffer = ''
    return Boolean(value)
  }

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (escaped) {
      buffer += char
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      buffer += char
      escaped = true
      continue
    }
    if (quote) {
      buffer += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      buffer += char
      continue
    }

    let operator = null
    let width = 1
    if (char === '&' && source[i + 1] === '>') {
      buffer += char
      continue
    }
    if ((char === '&' && source[i + 1] === '&') || (char === '|' && source[i + 1] === '|')) {
      operator = source.slice(i, i + 2)
      width = 2
    } else if (char === '|' && source[i + 1] === '&') {
      operator = '|&'
      width = 2
    } else if (char === '&' || char === '|') {
      operator = char
    } else if (char === ';' || char === '\n' || char === '\r') {
      operator = char
    }

    if (!operator) {
      buffer += char
      continue
    }

    const hadSegment = pushSegment()
    if (!hadSegment && commandRequired) return []
    commandRequired = ['&&', '||', '|', '|&', '&'].includes(operator)
    i += width - 1
  }

  if (quote || escaped) return []
  const hadFinalSegment = pushSegment()
  if ((commandRequired && !hadFinalSegment) || (!segments.length && !hadFinalSegment)) return []
  return segments
}

/**
 * TaskWeaver 细粒度权限规则存储
 * 支持为指定工具（如 bash、read、write、edit 或 MCP 工具）配置命令白名单/黑名单、路径匹配规则。
 */
export function createPermissionRulesStore({ userDataPath }) {
  const store = createJsonStore(path.join(userDataPath, 'taskweaver-permission-rules.json'), { rules: [] })

  async function listRules({ workspacePath } = {}) {
    const data = await store.read()
    const rules = Array.isArray(data?.rules) ? data.rules : []
    if (!workspacePath) return rules
    return rules.filter((rule) => rule.scope === 'global' || rule.workspacePath === workspacePath)
  }

  async function addRule(input) {
    if (!input || typeof input !== 'object') throw new Error('规则配置无效')
    const tool = String(input.tool || '*').trim()
    const type = ['command', 'path', 'tool'].includes(input.type) ? input.type : 'command'
    const pattern = String(input.pattern || '').trim()
    const decision = ['allow', 'deny'].includes(input.decision) ? input.decision : 'allow'
    const scope = ['workspace', 'global'].includes(input.scope) ? input.scope : 'workspace'
    const workspacePath = scope === 'workspace' && input.workspacePath ? String(input.workspacePath) : null

    if (!pattern && type !== 'tool') {
      throw new Error('规则匹配模式不能为空')
    }

    const rule = {
      id: input.id || `rule-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      tool,
      type,
      pattern: pattern || '*',
      decision,
      scope,
      workspacePath,
      createdAt: Date.now(),
      description: input.description ? String(input.description).slice(0, 200) : '',
      ...(type === 'command' && input.allowWildcards === true ? { allowWildcards: true } : {}),
    }

    const data = await store.read()
    const rules = Array.isArray(data?.rules) ? data.rules : []
    const updated = [...rules.filter((r) => r.id !== rule.id), rule]
    await store.write({ rules: updated })
    return rule
  }

  async function removeRule(ruleId) {
    if (!ruleId) return false
    const data = await store.read()
    const rules = Array.isArray(data?.rules) ? data.rules : []
    const filtered = rules.filter((r) => r.id !== ruleId)
    if (filtered.length !== rules.length) {
      await store.write({ rules: filtered })
      return true
    }
    return false
  }

  async function clearRules({ workspacePath, globalOnly } = {}) {
    const data = await store.read()
    const rules = Array.isArray(data?.rules) ? data.rules : []
    let remaining
    if (globalOnly) {
      remaining = rules.filter((r) => r.scope !== 'global')
    } else if (workspacePath) {
      remaining = rules.filter((r) => r.workspacePath !== workspacePath)
    } else {
      remaining = []
    }
    await store.write({ rules: remaining })
    return true
  }

  /**
   * 匹配规则：先判定有效的所有 deny 规则，若命中直接 deny；
   * 否则判定有效的所有 allow 规则，若命中直接 allow；
   * 否则返回 null。
   */
  async function matchRule({ tool, input, workspacePath }) {
    const rules = await listRules({ workspacePath })
    if (rules.length === 0) return null

    const toolName = String(tool || '').trim()
    const command = toolName === 'bash' ? String(input?.command ?? '').trim() : ''
    const commandSegments = toolName === 'bash' ? splitShellCommandSegments(command) : []
    const candidatePath = typeof input?.path === 'string'
      ? input.path
      : typeof input?.file_path === 'string'
        ? input.file_path
        : typeof input?.filePath === 'string'
          ? input.filePath
          : ''

    function testRule(rule, commandTarget = command) {
      // 工具不匹配
      if (rule.tool !== '*' && rule.tool !== toolName) return false

      if (rule.type === 'tool') {
        return true
      }
      if (rule.type === 'command') {
        if (!commandTarget) return false
        return matchCommandPattern(rule.pattern, commandTarget, { allowWildcards: rule.allowWildcards === true })
      }
      if (rule.type === 'path') {
        if (toolName === 'bash') return false
        if (!candidatePath) return false
        // 对相对工作区的路径与绝对路径均支持通配匹配
        const normalizedCandidate = candidatePath.replace(/\\/g, '/')
        return matchPattern(rule.pattern, normalizedCandidate) ||
               matchPattern(rule.pattern, path.basename(normalizedCandidate))
      }
      return false
    }

    // 1. 先查是否有 deny 规则命中（最高优先）
    for (const rule of rules) {
      if (rule.decision !== 'deny') continue
      if (toolName === 'bash' && rule.type === 'command') {
        const matchedSegment = commandSegments.find((segment) => testRule(rule, segment))
        if (matchedSegment) return { matched: true, decision: 'deny', rule }
      } else if (testRule(rule)) {
        return { matched: true, decision: 'deny', rule }
      }
    }

    // 2. 再查是否有 allow 规则命中
    if (toolName === 'bash' && command) {
      if (!commandSegments.length) return null
      const matchedRules = commandSegments.map((segment) => rules.find((rule) =>
        rule.decision === 'allow' && testRule(rule, segment),
      ))
      if (matchedRules.every(Boolean)) {
        return { matched: true, decision: 'allow', rule: matchedRules[0] }
      }
      return null
    }
    for (const rule of rules) {
      if (rule.decision === 'allow' && testRule(rule)) return { matched: true, decision: 'allow', rule }
    }

    return null
  }

  return {
    listRules,
    addRule,
    removeRule,
    clearRules,
    matchRule,
  }
}
