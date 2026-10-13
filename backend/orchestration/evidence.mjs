export function summarizeExecutionEvidence(evidence) {
  const calls = Array.isArray(evidence?.observedToolCalls) ? evidence.observedToolCalls : []
  const successful = calls.filter((call) => call.status === 'done')
  const reads = successful.filter((call) => call.toolName === 'read').length
  const searches = successful.filter((call) => ['glob', 'grep', 'find', 'ls'].includes(call.toolName)).length
  const failed = calls.filter((call) => ['error', 'failed', 'blocked', 'cancelled'].includes(call.status)).length
  const running = calls.filter((call) => call.status === 'running').length
  const scopeDeniedToolCalls = Math.max(0, Number(evidence?.scopeDeniedToolCalls) || 0)
  const parts = []
  if (reads) parts.push(`读取 ${reads}`)
  if (searches) parts.push(`搜索 ${searches}`)
  if (failed) parts.push(`失败 ${failed}`)
  if (scopeDeniedToolCalls) parts.push(`越界拒绝 ${scopeDeniedToolCalls}`)
  if (running) parts.push(`未结束 ${running}`)
  if (evidence?.omittedToolCalls) parts.push(`另有 ${evidence.omittedToolCalls} 次未纳入明细`)
  const label = parts.length
    ? `Host 工具记录：${parts.join(' · ')}`
    : 'Host 未观测到工具调用'
  return {
    source: evidence?.source === 'z-host-tool-events' ? 'z-host-tool-events' : 'unknown',
    observedCallCount: calls.length,
    successfulReadCount: reads,
    successfulSearchCount: searches,
    failedCallCount: failed,
    scopeDeniedToolCalls,
    runningCallCount: running,
    omittedToolCalls: Math.max(0, Number(evidence?.omittedToolCalls) || 0),
    label,
  }
}

function explicitlyReportsEvidenceGap(text) {
  return /(?:范围不足|待复核)|(?:本任务|任务(?:要求|目标|验收点)?|(?:核心|关键|部分)?(?:调用|请求|端到端)?链(?:路)?|验收点)[^。；\n]{0,32}(?:未(?:闭合|核实|完成)|尚未(?:核实|完成)|无法(?:证明|完成)|仍有(?:关键)?证据缺口|不完整)|未能从源码读取核实[^。；\n]{0,48}(?:超出允许文件范围|范围不足|证据缺口)/i.test(String(text ?? ''))
}

const ACCEPTANCE_REPORT_START = '<taskweaver-acceptance-v1>'
const ACCEPTANCE_REPORT_END = '</taskweaver-acceptance-v1>'

/** Parse and check the node's explicit one-by-one acceptance report. */
export function assessAcceptanceCriteria(task, text) {
  const criteria = Array.isArray(task?.acceptance) ? task.acceptance : []
  if (criteria.length === 0) return { required: 0, passed: true, items: [] }
  const source = String(text ?? '')
  const start = source.lastIndexOf(ACCEPTANCE_REPORT_START)
  const end = start >= 0 ? source.indexOf(ACCEPTANCE_REPORT_END, start + ACCEPTANCE_REPORT_START.length) : -1
  if (start < 0 || end < 0) {
    return {
      required: criteria.length,
      passed: false,
      reason: '缺少结构化逐项验收报告',
      items: criteria.map((criterion) => ({ criterion, passed: null, evidence: '' })),
    }
  }

  let report
  try {
    report = JSON.parse(source.slice(start + ACCEPTANCE_REPORT_START.length, end).trim())
  } catch {
    return {
      required: criteria.length,
      passed: false,
      reason: '逐项验收报告不是有效 JSON',
      items: criteria.map((criterion) => ({ criterion, passed: null, evidence: '' })),
    }
  }
  const entries = Array.isArray(report?.results) ? report.results : []
  const items = criteria.map((criterion, index) => {
    const entry = entries[index]
    const evidence = typeof entry?.evidence === 'string' ? entry.evidence.trim().slice(0, 1_000) : ''
    const criterionMatches = typeof entry?.criterion === 'string' && entry.criterion.trim() === criterion
    const passed = criterionMatches && typeof entry.passed === 'boolean' && evidence.length > 0
      ? entry.passed
      : null
    return { criterion, passed, evidence }
  })
  const exactCount = entries.length === criteria.length
  const passed = exactCount && items.every((item) => item.passed === true)
  return {
    required: criteria.length,
    passed,
    ...(passed ? {} : { reason: exactCount ? '至少一条验收点未通过或缺少可核对证据' : '验收报告条目数与计划验收点不一致' }),
    items,
  }
}

function isVerificationCommand(command) {
  const segments = String(command ?? '').split(/&&|\|\||[;|\n]/)
  return segments.some((raw) => {
    let segment = raw.trim().replace(/^(?:env\s+)?/, '')
    segment = segment.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+/, '')
    const packageScript = /^(?:\S*\/)?(?:pnpm|npm|yarn|bun)\s+(?:(?:--?[^\s]+)\s+)*(?:run\s+)?(?:test|build|check|lint|typecheck|type-check)(?:[:_-][\w.-]+)?(?=\s|$)/i
    const packageExec = /^(?:(?:pnpm|yarn)\s+exec|(?:npx|bunx))\s+(?:(?:--?[^\s]+)\s+)*(?:vitest|jest|tsc|eslint|pytest|ruff|mypy|biome)(?=\s|$)/i
    const directTool = /^(?:\S*\/)?(?:vitest|jest|tsc|eslint|pytest|ruff|mypy)(?=\s|$)/i
    const pythonModule = /^python(?:3)?\s+-m\s+(?:pytest|unittest)(?=\s|$)/i
    const standardCommand = /^(?:(?:\S*\/)?(?:cargo|go|make|ninja|swift|xcodebuild|mvn|gradle)|python(?:3)?)\s+(?:(?:-[^\s]+)\s+)*(?:test|tests|build|check|lint|vet|verify|package|compile|\-m\s+(?:pytest|unittest))(?=\s|$)/i
    return packageScript.test(segment)
      || packageExec.test(segment)
      || directTool.test(segment)
      || pythonModule.test(segment)
      || standardCommand.test(segment)
  })
}

/** Summarize only Host-observed foreground verification commands and outcomes. */
export function summarizeCommandVerification(executionEvidence) {
  const calls = Array.isArray(executionEvidence?.observedToolCalls)
    ? executionEvidence.observedToolCalls
    : []
  const latestByCommand = new Map()
  for (const call of calls) {
    if (!['bash', 'pwsh'].includes(call?.toolName) || !isVerificationCommand(call.commandSummary)) continue
    const key = String(call.commandSummary).trim().replace(/\s+/g, ' ')
    latestByCommand.set(key, call)
  }
  const observed = [...latestByCommand.values()]
  const passed = observed.length > 0 && observed.every((call) => call.status === 'done'
    && call.commandOutcome?.background !== true
    && call.commandOutcome?.timedOut !== true
    && call.commandOutcome?.sandboxDenied !== true
    && !call.commandOutcome?.signal
    && Number.isInteger(call.commandOutcome?.exitCode)
    && call.commandOutcome.exitCode === 0)
  const failed = observed.find((call) => call.status === 'error'
    || call.commandOutcome?.background === true
    || call.commandOutcome?.timedOut === true
    || call.commandOutcome?.sandboxDenied === true
    || call.commandOutcome?.signal
    || (Number.isInteger(call.commandOutcome?.exitCode) && call.commandOutcome.exitCode !== 0))
  const unknown = observed.find((call) => call.status !== 'done'
    || !Number.isInteger(call.commandOutcome?.exitCode))
  return {
    observed,
    present: observed.length > 0,
    passed,
    command: observed.at(-1)?.commandSummary ?? null,
    exitCode: observed.at(-1)?.commandOutcome?.exitCode ?? null,
    ...(failed ? { reason: `Host 工具记录显示验证命令未通过或未结束：${failed.commandSummary}` }
      : unknown ? { reason: `Host 工具记录缺少验证命令的完成状态或退出码：${unknown.commandSummary}` }
        : observed.length === 0 ? { reason: 'Host 未记录到 test/build/check 验证命令' } : {}),
  }
}

export function assessSubtaskCompletion(task, result) {
  if (typeof result?.text !== 'string' || !result.text.trim()) {
    return {
      complete: false,
      reason: 'Agent 未返回最终文本；不能仅凭工具调用将子任务标记为完成。',
    }
  }
  const calls = Array.isArray(result?.executionEvidence?.observedToolCalls)
    ? result.executionEvidence.observedToolCalls
    : []
  const commandVerification = summarizeCommandVerification(result?.executionEvidence)
  if (task?.taskType === 'research' || task?.taskType === 'review') {
    const scopeDeniedToolCalls = Math.max(0, Number(result?.executionEvidence?.scopeDeniedToolCalls) || 0)
    if (scopeDeniedToolCalls > 0 && explicitlyReportsEvidenceGap(result.text)) {
      return {
        complete: false,
        reason: `Host 拒绝了 ${scopeDeniedToolCalls} 次超出只读子任务范围的工具调用；当前路径计划可能缺少必要证据，需补足范围后再标记完成。`,
      }
    }
    const reads = calls.filter((call) => call.toolName === 'read' && call.status === 'done').length
    if (reads === 0) {
      return {
        complete: false,
        reason: 'Host 未记录到成功的文件读取；搜索结果不足以证明源码或审查依据已被阅读核实。',
      }
    }
  }
  const acceptance = result?.acceptanceAssessment ?? assessAcceptanceCriteria(task, result.text)
  if (!acceptance.passed) {
    return {
      complete: false,
      reason: `验收点未全部通过：${acceptance.reason || acceptance.items.filter((item) => item.passed !== true).map((item) => item.criterion).join('；')}`,
    }
  }
  if (task?.taskType === 'implementation') {
    const hasFileChanges = Array.isArray(result.fileChanges) && result.fileChanges.some((change) => typeof change?.path === 'string' && change.path)
    const explainsNoChange = /(?:无需改动|不需要修改|没有需要修改|未修改文件|无文件改动|no changes needed)/i.test(result.text)
      && /(?:原因|因为|由于|reason|because)/i.test(result.text)
    if (!hasFileChanges && !explainsNoChange) {
      return {
        complete: false,
        reason: '实现节点既没有 Host 记录的文件改动，也没有明确说明无需改动及其理由。',
      }
    }
    if (commandVerification.present && !commandVerification.passed) {
      return { complete: false, reason: commandVerification.reason || 'Host 记录到的验证命令未通过。' }
    }
    if (result.verificationRequired === true
      && (!result.verification?.executed || result.verification.passed !== true)
      && !commandVerification.passed) {
      return {
        complete: false,
        reason: result.verification?.reason || (result.verification?.executed
          ? `验证命令 ${result.verification.command} 未通过 (${result.verification.exitCode})`
          : '工作区未受信任，无法执行计划中的自动验证命令。'),
      }
    }
  }
  if (task?.taskType === 'test') {
    const runnerPassed = result?.verification?.executed === true && result.verification.passed === true
    if (!commandVerification.present && !runnerPassed) {
      return { complete: false, reason: commandVerification.reason || 'Host 未记录到 test/build/check 验证命令' }
    }
    if (commandVerification.present && !commandVerification.passed) {
      return { complete: false, reason: commandVerification.reason || 'Host 记录到的验证命令未通过。' }
    }
  }
  return { complete: true, reason: '' }
}
