function redact(text) {
  return String(text)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, '$1[已隐藏]')
    .replace(/\b(api[_-]?key|token|password|secret|authorization)(\s*[:=]\s*)(["']?)[^\s,;"']+/gi, '$1$2$3[已隐藏]')
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, '[已隐藏凭据]')
}

function compact(value, max = 180) {
  const text = redact(value).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function summarizeToolInput(toolName, args) {
  const input = args && typeof args === 'object' ? args : {}
  if ((toolName === 'glob' || toolName === 'grep') && typeof input.pattern === 'string') {
    return compact(`${input.pattern}${input.path ? ` · ${input.path}` : ''}`, 220)
  }
  if (toolName === 'run_code' && typeof input.description === 'string') return compact(input.description, 220)
  if ((toolName === 'bash' || toolName === 'pwsh') && typeof input.description === 'string') {
    return compact(input.description, 220)
  }
  if ((toolName === 'bash' || toolName === 'pwsh') && typeof input.command === 'string') {
    return compact(input.command, 220)
  }
  for (const key of ['file_path', 'path', 'filePath', 'url', 'query', 'pattern']) {
    if (typeof input[key] === 'string') return compact(input[key], 220)
  }
  if (typeof input.description === 'string') return compact(input.description, 220)
  for (const value of Object.values(input)) {
    if (typeof value === 'string' && value.trim()) return compact(value, 220)
  }
  return ''
}

// Z messages wrap model-facing blocks in tool-result; older adapters return
// flat blocks. Normalize only this known wrapper, without interpreting text.
export function normalizeToolResult(result) {
  const content = []
  let isError = Boolean(result?.isError)
  let details = result?.details
  function collect(blocks) {
    for (const block of Array.isArray(blocks) ? blocks : []) {
      if (block?.type === 'tool-result') {
        isError ||= Boolean(block.isError)
        details ??= block.details
        collect(block.content)
      } else {
        content.push(block)
      }
    }
  }
  collect(result?.content)
  return { ...result, content, isError, details }
}

export function summarizeToolResult(result, isError) {
  result = normalizeToolResult(result)
  if (isError || result.isError) {
    const textOutput = Array.isArray(result?.content)
      ? result.content.filter((item) => item?.type === 'text' && typeof item.text === 'string').map((item) => item.text).join('\n')
      : ''
    return compact(textOutput || result?.error || '工具执行失败', 600)
  }
  const blocks = Array.isArray(result?.content) ? result.content.length : 0
  const chars = Array.isArray(result?.content)
    ? result.content.reduce((total, item) => total + (typeof item?.text === 'string' ? item.text.length : 0), 0)
    : 0
  return blocks ? `执行完成 · ${blocks} 个结果块，约 ${chars} 字符` : '执行完成'
}

function fileLines(text) {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

// Diff the small contextual hunks persisted by Z's write/edit presentation
// metadata. A bounded LCS avoids claiming inaccurate counts for very large
// hunks, while still producing a normal +/- patch for the UI.
function diffFileText(oldText, newText) {
  const before = fileLines(oldText ?? '')
  const after = fileLines(newText)
  const width = after.length + 1
  const cells = (before.length + 1) * width
  if (cells > 400_000) return null
  const lcs = new Uint32Array(cells)
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      const at = i * width + j
      lcs[at] = before[i] === after[j]
        ? lcs[(i + 1) * width + j + 1] + 1
        : Math.max(lcs[(i + 1) * width + j], lcs[at + 1])
    }
  }

  const patch = [`@@ -1,${before.length} +1,${after.length} @@`]
  let addedLines = 0
  let deletedLines = 0
  let i = 0
  let j = 0
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      patch.push(` ${before[i]}`)
      i++
      j++
    } else if (i < before.length && (j >= after.length || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
      patch.push(`-${before[i++]}`)
      deletedLines++
    } else {
      patch.push(`+${after[j++]}`)
      addedLines++
    }
  }
  return { diff: patch.join('\n'), addedLines, deletedLines }
}

function fileDiffFromMeta(toolName, targetPath, meta, isNewFile = false) {
  const hunks = Array.isArray(meta?.diffs) ? meta.diffs : []
  if (hunks.length === 0) return null
  const rendered = []
  let addedLines = 0
  let deletedLines = 0
  let changed = false
  for (const hunk of hunks) {
    if (typeof hunk?.newText !== 'string' || !(hunk.oldText === null || typeof hunk.oldText === 'string')) return null
    if (!(hunk.oldText === null && isNewFile) && hunk.oldText === hunk.newText) continue
    changed = true
    const result = diffFileText(hunk.oldText ?? '', hunk.newText)
    if (!result) return { path: targetPath, diff: '', type: toolName }
    rendered.push(result.diff)
    addedLines += result.addedLines
    deletedLines += result.deletedLines
  }
  if (!changed) return null
  return {
    path: targetPath,
    diff: rendered.join('\n'),
    type: toolName,
    addedLines,
    deletedLines,
    ...(isNewFile ? { isNewFile: true } : {}),
  }
}

export function extractFileDiff(toolName, args, result) {
  if (result) result = normalizeToolResult(result)
  if (!result || result.isError) return null
  const input = args && typeof args === 'object' ? args : {}
  const targetPath = input.path || input.file_path || input.filePath || ''
  if (!targetPath) return null

  const resultText = (result.content ?? [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
  const created = /(?:Created file|New file created successfully)/i.test(resultText)
  const updated = /Updated file/i.test(resultText)
  const fromMeta = fileDiffFromMeta(toolName, targetPath, result.meta, created)
  if (fromMeta) return fromMeta
  if (Array.isArray(result.meta?.diffs) && result.meta.diffs.length === 0 && !created) return null

  if (toolName === 'edit') {
    const diff = result.details?.diff || result.details?.patch || ''
    if (diff) {
      let added = 0
      let deleted = 0
      for (const line of diff.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) added++
        else if (line.startsWith('-') && !line.startsWith('---')) deleted++
      }
      return { path: targetPath, diff, type: 'edit', addedLines: added, deletedLines: deleted }
    }
    if (typeof input.old_string === 'string' && typeof input.new_string === 'string' && !input.replace_all) {
      if (input.old_string === input.new_string) return null
      const resultDiff = diffFileText(input.old_string, input.new_string)
      return resultDiff
        ? { path: targetPath, diff: resultDiff.diff, type: 'edit', addedLines: resultDiff.addedLines, deletedLines: resultDiff.deletedLines }
        : { path: targetPath, diff: '', type: 'edit' }
    }
    return { path: targetPath, diff: '', type: 'edit' }
  }

  if (toolName === 'write') {
    const content = typeof input.content === 'string' ? input.content : ''
    if (updated) {
      // Native Host writes provide an empty diffs array when the content did
      // not change. Nested code-dispatch results do not carry that metadata,
      // so retain the file with unknown line counts instead of hiding it.
      if (Array.isArray(result.meta?.diffs) && result.meta.diffs.length === 0) return null
      return { path: targetPath, diff: '', type: 'write' }
    }
    if (!created) return { path: targetPath, diff: '', type: 'write' }
    const lines = fileLines(content)
    const diffFormatted = lines.map((line) => `+${line}`).join('\n')
    return {
      path: targetPath,
      diff: diffFormatted,
      type: 'write',
      addedLines: lines.length,
      deletedLines: 0,
      isNewFile: true,
    }
  }

  if (toolName === 'str_replace_editor') {
    const command = input.command
    if (command === 'view') return null
    if (command === 'create') {
      if (!created) return null
      const content = typeof input.file_text === 'string' ? input.file_text : ''
      const lines = fileLines(content)
      return {
        path: targetPath,
        diff: lines.map((line) => `+${line}`).join('\n'),
        type: 'str_replace_editor',
        addedLines: lines.length,
        deletedLines: 0,
        isNewFile: true,
      }
    }
    if (command === 'str_replace' && typeof input.old_str === 'string') {
      const newText = typeof input.new_str === 'string' ? input.new_str : ''
      if (input.old_str === newText) return null
      const changedText = diffFileText(input.old_str, newText)
      return changedText
        ? { path: targetPath, diff: changedText.diff, type: 'str_replace_editor', addedLines: changedText.addedLines, deletedLines: changedText.deletedLines }
        : { path: targetPath, diff: '', type: 'str_replace_editor' }
    }
    if (command === 'insert' && typeof input.new_str === 'string') {
      if (!input.new_str) return null
      const changedText = diffFileText('', input.new_str)
      return changedText
        ? { path: targetPath, diff: changedText.diff, type: 'str_replace_editor', addedLines: changedText.addedLines, deletedLines: 0 }
        : { path: targetPath, diff: '', type: 'str_replace_editor' }
    }
    return { path: targetPath, diff: '', type: 'str_replace_editor' }
  }

  return null
}

export function sendToolTrace(webContents, payload) {
  if (!webContents || typeof webContents.send !== 'function') return
  if (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) return
  webContents.send('chat:stream', { type: 'tool', ...payload })
}
