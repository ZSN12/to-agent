/**
 * 规则层入口门控：不调用模型，只在灰区建议用户确认是否启用多 Agent。
 * 自动强制多 Agent 仍由 Skill / 用户措辞 / Goal 模式负责。
 */

const WORKSTREAM_PATTERNS = [
  { id: 'frontend', re: /前端|React|Vue|界面|UI\b|src\/(?:features|components)/i },
  { id: 'backend', re: /后端|API|接口|electron\/backend|FastAPI|服务端/i },
  { id: 'test', re: /测试|e2e|单元测试|集成测试|scripts\/test/i },
  { id: 'deploy', re: /部署|CI|发布|docker|electron-builder/i },
  { id: 'docs', re: /文档|README|docs\//i },
]

const PARALLEL_HINT = /并行|同时推进|独立(?:完成|进行)|两项.*(?:并行|同时)/i
const SERIAL_HINT = /同一文件|先复现|逐步|串行|一步一步|同一个\s*bug/i
const READ_ONLY_HINT = /只读|不得修改|不要修改|不修改文件|不要改文件/i
const SIMPLE_HINT = /修(复|一下).{0,12}(样式|文案|按钮|typo)|小\s*bug|一行|单个文件/i

function countWorkstreams(text) {
  const hits = new Set()
  for (const { id, re } of WORKSTREAM_PATTERNS) {
    if (re.test(text)) hits.add(id)
  }
  const atPaths = text.match(/@[^\s,)]+/g) ?? []
  const pathPrefixes = new Set()
  for (const token of atPaths) {
    const path = token.slice(1).replace(/^["']|["']$/g, '')
    const top = path.split(/[/\\]/).filter(Boolean)[0]
    if (top) pathPrefixes.add(top)
  }
  if (pathPrefixes.size >= 2) {
    for (const p of pathPrefixes) hits.add(`path:${p}`)
  }
  return hits.size
}

/**
 * @returns {{ mode: 'single-agent' | 'ask-user', reason: string, confidence: number, workstreams: number }}
 */
export function evaluateOrchestrationGate(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) {
    return { mode: 'single-agent', reason: '空请求', confidence: 1, workstreams: 0 }
  }
  if (READ_ONLY_HINT.test(trimmed) || SIMPLE_HINT.test(trimmed)) {
    return { mode: 'single-agent', reason: '只读或局部修改更适合单 Agent', confidence: 0.85, workstreams: 0 }
  }
  if (SERIAL_HINT.test(trimmed)) {
    return { mode: 'single-agent', reason: '强串行信号，保持单 Agent', confidence: 0.9, workstreams: countWorkstreams(trimmed) }
  }

  const workstreams = countWorkstreams(trimmed)
  const parallelHint = PARALLEL_HINT.test(trimmed)
  const multiDomainImplement =
    workstreams >= 2
    && /实现|开发|搭建|完成|交付/.test(trimmed)
    && !READ_ONLY_HINT.test(trimmed)

  if (multiDomainImplement && (parallelHint || workstreams >= 3)) {
    return {
      mode: 'ask-user',
      reason: `检测到约 ${workstreams} 个可独立推进的工作面（规则门控，未调用模型）。是否拆分为多 Agent DAG 并行？`,
      confidence: parallelHint ? 0.78 : 0.62,
      workstreams,
    }
  }

  if (workstreams >= 2 && /前端/.test(trimmed) && /(后端|API|接口)/.test(trimmed)) {
    return {
      mode: 'ask-user',
      reason: '前后端/多模块实现类请求可能适合多 Agent；也可继续单 Agent 直达。',
      confidence: 0.65,
      workstreams,
    }
  }

  return { mode: 'single-agent', reason: '未命中多 Agent 灰区', confidence: 0.7, workstreams }
}
