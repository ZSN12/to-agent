/** Map verbose backend / projection labels to short UI copy (DSH TurnStatus style). */
export function shortStreamActivityLabel(activity: string | null | undefined): string | null {
  if (!activity?.trim()) return null
  const text = activity.trim()
  if (/^deep diving(?:\.{3}|…)?$/i.test(text)) return '模型正在处理'
  const hostTool = text.match(/^正在执行工具[：:]\s*(.+?)(?:…+|\.{3})?$/)?.[1]?.trim()
  const toolActivity = hostTool ?? text
  const batchTool = toolActivity.match(/^(.+?)\s*[（(]\s*(?:批量调用|batch(?:\s+call|ed))\s*[）)]$/i)?.[1]?.trim()
  if (batchTool) return `正在执行 ${batchTool} 批量调用`
  if (hostTool) return `正在执行 ${hostTool}`
  if (/模型第\s*\d+\s*步/.test(text)) return null
  if (/思考|reasoning/i.test(text)) return '模型思考中'
  if (/等待模型/i.test(text)) return '等待模型响应'
  if (/组装上下文/i.test(text)) return '正在整理上下文'
  if (/准备.*模型/i.test(text)) return '准备模型请求'
  if (text.length <= 28) return text
  return `${text.slice(0, 28)}…`
}

/** Always give the user a truthful live status, even before the model emits prose. */
export function visibleStreamStatusLabel({
  activity,
  isThinking,
  hasVisibleText,
  completedToolCount,
}: {
  activity?: string | null
  isThinking?: boolean
  hasVisibleText?: boolean
  completedToolCount?: number
}): string {
  const visibleActivity = shortStreamActivityLabel(activity)
  if (visibleActivity) return visibleActivity
  if (isThinking) return '模型正在分析下一步'
  if (hasVisibleText) return '正在生成回复'
  if ((completedToolCount ?? 0) > 0) return '工具已返回，模型正在继续'
  return '正在等待模型响应'
}
