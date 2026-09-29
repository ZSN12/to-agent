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

const VARIANT_TITLES: Record<DshToolRowVariant, string> = {
  search: 'Search',
  read: 'Read',
  bash: 'Bash',
  write: 'Write',
  edit: 'Edit',
  code: 'Code',
  others: 'Tool call',
}

const SUMMARY_KEYS: Record<DshToolRowVariant, readonly string[]> = {
  bash: ['description', 'command'],
  read: ['path', 'file_path', 'url'],
  search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  code: ['description'],
  others: [],
}

function firstLine(text: string): string {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

function parseArgs(argsRaw: string): Record<string, unknown> | null {
  if (!argsRaw.trim()) return null
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

function deriveSummary(variant: DshToolRowVariant, argsRaw: string): string {
  const parsed = parseArgs(argsRaw)
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

export function dshToolRowPresentation(toolName: string, argsRaw: string, workspacePath?: string | null) {
  const variant = classifyDshTool(toolName)
  let summary = deriveSummary(variant, argsRaw)
  if (workspacePath && summary.startsWith(workspacePath)) {
    summary = summary.slice(workspacePath.length).replace(/^[/\\]+/, '') || summary
  }
  const title = variant === 'others' && toolName ? toolName : VARIANT_TITLES[variant]
  return { variant, title, summary }
}
