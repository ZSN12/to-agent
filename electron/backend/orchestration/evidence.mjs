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
  return { complete: true, reason: '' }
}
