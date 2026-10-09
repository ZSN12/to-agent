import type { ToolTraceItem } from '../../shared/app-api'

export function visibleToolActivity(item: ToolTraceItem, workspacePath?: string | null): string {
  const verbs: Record<string, string> = {
    edit: '正在修改',
    write: '正在写入',
    read: '正在读取',
    grep: '正在搜索',
    find: '正在查找',
    glob: '正在查找',
    bash: '正在运行命令',
    run_code: '正在执行代码',
  }
  const filePath = item.inputSummary || item.fileDiff?.path || ''
  const root = workspacePath?.replace(/\\/g, '/').replace(/\/$/, '')
  const normalized = filePath.replace(/\\/g, '/')
  const displayPath = root && normalized.toLocaleLowerCase().startsWith(`${root}/`.toLocaleLowerCase())
    ? normalized.slice(root.length + 1)
    : normalized
  const verb = verbs[item.toolName] ?? `正在执行 ${item.toolName}`
  const safeSummary = (item.inputSummary ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 88)
  return displayPath && ['edit', 'write', 'read'].includes(item.toolName)
    ? `${verb} · ${displayPath}`
    : safeSummary && ['run_code', 'bash', 'pwsh'].includes(item.toolName)
      ? `${verb} · ${safeSummary}`
      : verb
}
