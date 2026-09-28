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
  if (toolName === 'bash' && typeof input.command === 'string') return compact(input.command, 220)
  for (const key of ['file_path', 'path', 'filePath']) {
    if (typeof input[key] === 'string') return compact(input[key], 220)
  }
  if (typeof input.pattern === 'string') return `匹配：${compact(input.pattern, 160)}`
  const safeKeys = Object.keys(input).filter((key) => !/(key|token|password|secret|auth)/i.test(key))
  return safeKeys.length ? `参数：${safeKeys.slice(0, 6).join('、')}` : '工具参数已隐藏'
}

export function summarizeToolResult(result, isError) {
  if (isError) {
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

export function extractFileDiff(toolName, args, result) {
  if (!result || result.isError) return null
  const input = args && typeof args === 'object' ? args : {}
  const targetPath = input.path || input.file_path || input.filePath || ''
  if (!targetPath) return null

  if (toolName === 'edit') {
    const diff = result.details?.diff || result.details?.patch || ''
    if (diff) {
      const lines = diff.split('\n')
      let added = 0
      let deleted = 0
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) added++
        else if (line.startsWith('-') && !line.startsWith('---')) deleted++
      }
      const edits = Array.isArray(input.edits) ? input.edits : []
      const reverseEdits = edits
        .filter((e) => typeof e?.oldText === 'string' && typeof e?.newText === 'string')
        .map((e) => ({ oldText: e.newText, newText: e.oldText }))
      return {
        path: targetPath,
        diff,
        type: 'edit',
        firstChangedLine: result.details?.firstChangedLine,
        reverseEdits,
        addedLines: added,
        deletedLines: deleted,
      }
    }
  }

  if (toolName === 'write') {
    const content = typeof input.content === 'string' ? input.content : ''
    const lines = content.split('\n')
    const diffFormatted = lines.map((l) => `+${l}`).join('\n')
    return {
      path: targetPath,
      diff: diffFormatted,
      type: 'write',
      addedLines: lines.length,
      deletedLines: 0,
      isNewFile: Boolean(result.details?.created || !result.details?.overwritten),
    }
  }

  return null
}

export function sendToolTrace(webContents, payload) {
  if (!webContents || typeof webContents.send !== 'function') return
  if (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) return
  webContents.send('chat:stream', { type: 'tool', ...payload })
}

