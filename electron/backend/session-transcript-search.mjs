import fs from 'node:fs/promises'
import path from 'node:path'

function extractTextFromJsonlLine(obj) {
  if (!obj || typeof obj !== 'object') return ''
  if (typeof obj.text === 'string') return obj.text
  if (typeof obj.content === 'string') return obj.content
  if (Array.isArray(obj.content)) {
    return obj.content
      .map((part) => (typeof part?.text === 'string' ? part.text : typeof part === 'string' ? part : ''))
      .filter(Boolean)
      .join('\n')
  }
  if (obj.message && typeof obj.message.content === 'string') return obj.message.content
  if (Array.isArray(obj.message?.content)) {
    return obj.message.content.map((p) => p?.text || '').join('\n')
  }
  return ''
}

/**
 * 扫描 pi 会话 jsonl（DSH 风格 session 全文检索的轻量版）。
 */
export async function searchSessionTranscripts(conversationsDir, query, { limit = 40 } = {}) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return []

  let entries = []
  try {
    entries = await fs.readdir(conversationsDir)
  } catch {
    return []
  }

  const hits = []
  for (const file of entries) {
    if (!file.endsWith('.jsonl')) continue
    const conversationId = file.replace(/\.jsonl$/, '')
    const fullPath = path.join(conversationsDir, file)
    let raw
    try {
      raw = await fs.readFile(fullPath, 'utf8')
    } catch {
      continue
    }
    const lines = raw.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      let parsed
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      const text = extractTextFromJsonlLine(parsed)
      if (!text || !text.toLowerCase().includes(q)) continue
      const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160)
      hits.push({
        conversationId,
        line: i + 1,
        role: parsed.role || parsed.message?.role || null,
        snippet,
      })
      if (hits.length >= limit) return hits
    }
  }
  return hits
}
