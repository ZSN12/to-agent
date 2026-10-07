/** Map verbose backend / projection labels to short UI copy (DSH TurnStatus style). */
export function shortStreamActivityLabel(activity: string | null | undefined): string | null {
  if (!activity?.trim()) return null
  const text = activity.trim()
  const tool = text.match(/正在执行工具[：:]\s*([^\s…]+)/)?.[1]
  if (tool) return tool
  if (/模型第\s*\d+\s*步/.test(text)) return null
  if (/思考|reasoning/i.test(text)) return '模型思考中'
  if (/等待模型/i.test(text)) return '等待模型响应'
  if (/组装上下文/i.test(text)) return '正在整理上下文'
  if (/准备.*模型/i.test(text)) return '准备模型请求'
  if (text.length <= 28) return text
  return `${text.slice(0, 28)}…`
}
