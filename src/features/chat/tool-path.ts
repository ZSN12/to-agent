import type { ToolTraceItem } from '../../shared/app-api'

/** 从工具轨迹中解析可在工作区内打开的文件路径 */
export function resolveToolFilePath(item: ToolTraceItem): string | null {
  if (item.fileDiff?.path) return item.fileDiff.path
  const summary = item.inputSummary?.trim()
  if (!summary) return null
  if (summary.startsWith('参数：') || summary.startsWith('匹配：')) return null
  if (item.toolName === 'bash' || item.toolName === 'context-compaction') return null
  if (['read', 'edit', 'write', 'grep', 'find', 'ls'].includes(item.toolName)) {
    return summary.split(/\s+/)[0] || summary
  }
  return null
}
