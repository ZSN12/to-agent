/** DSH ui-tool row model (subset) for TaskWeaver projection rows. */

export type DshToolRowVariant = 'search' | 'read' | 'bash' | 'write' | 'edit' | 'code' | 'others'

const TOOL_VARIANTS: Record<string, DshToolRowVariant> = {
  bash: 'bash',
  pwsh: 'bash',
  read: 'read',
  web_fetch: 'read',
  web_search: 'search',
  grep: 'search',
  glob: 'search',
  write: 'write',
  edit: 'edit',
  run_code: 'code',
}

export interface DshToolTitlePair {
  running: string
  settled: string
}

const VARIANT_TITLES: Record<DshToolRowVariant, DshToolTitlePair> = {
  bash: { running: '运行命令', settled: '执行了命令' },
  read: { running: '正在读取', settled: '查看了文件' },
  write: { running: '正在修改', settled: '修改了文件' },
  edit: { running: '正在修改', settled: '修改了文件' },
  search: { running: '正在搜索', settled: '搜索了文件' },
  code: { running: '正在执行代码', settled: '执行了代码' },
  others: { running: '调用工具', settled: '调用了工具' },
}

const SUMMARY_KEYS: Record<DshToolRowVariant, readonly string[]> = {
  bash: ['command', 'cmd', 'description'],
  read: ['path', 'file_path', 'url'],
  search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  code: ['description', 'code'],
  others: [],
}

function firstLine(text: string): string {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

export function parseToolArgs(argsRaw: string): Record<string, unknown> | null {
  if (!argsRaw || !argsRaw.trim()) return null
  try {
    const parsed = JSON.parse(argsRaw) as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function pickString(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const v = args[key]
    if (typeof v === 'string' && v !== '') return v
  }
  return undefined
}

export function deriveSummary(variant: DshToolRowVariant, argsRaw: string): string {
  const parsed = parseToolArgs(argsRaw)
  if (!parsed) return firstLine(argsRaw)
  if (variant === 'search' && Array.isArray(parsed.queries)) {
    const queries = parsed.queries.filter((q): q is string => typeof q === 'string' && q !== '')
    if (queries.length > 0) return queries.map(firstLine).join(', ')
  }
  const picked = pickString(parsed, SUMMARY_KEYS[variant])
  if (picked !== undefined) return firstLine(picked)
  for (const v of Object.values(parsed)) {
    if (typeof v === 'string' && v !== '') return firstLine(v)
  }
  return firstLine(argsRaw)
}

export function classifyDshTool(toolName: string): DshToolRowVariant {
  return TOOL_VARIANTS[toolName] ?? 'others'
}

export function dshToolRowPresentation(
  toolName: string,
  argsRaw: string,
  workspacePath?: string | null,
  status: 'running' | 'done' | 'error' | 'stopped' = 'done',
) {
  const variant = classifyDshTool(toolName)
  let summary = deriveSummary(variant, argsRaw)
  if (workspacePath && summary.startsWith(workspacePath)) {
    summary = summary.slice(workspacePath.length).replace(/^[/\\]+/, '') || summary
  }
  const titlePair = VARIANT_TITLES[variant]
  const title = titlePair
    ? (status === 'running' ? titlePair.running : titlePair.settled)
    : (variant === 'others' && toolName ? toolName : '执行了工具')

  return { variant, title, summary }
}

