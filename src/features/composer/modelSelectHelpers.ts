const thinkingLevelLabels: Record<string, { en: string; zh: string; desc: string }> = {
  off: { en: 'Off', zh: '关闭', desc: '不进行思考推理' },
  minimal: { en: 'Minimal', zh: '极低', desc: '最少推理开销' },
  low: { en: 'Low', zh: '低', desc: '轻度思考，快速响应' },
  medium: { en: 'Medium', zh: '中', desc: '适中推理深度' },
  high: { en: 'High', zh: '高', desc: '深度思考' },
  xhigh: { en: 'Extra High', zh: '极高', desc: '更深推理' },
  max: { en: 'Max', zh: '最大', desc: '最高推理强度' },
}

export function effortDisplayMeta(
  id: string,
  options?: { id: string; name?: string; description?: string }[],
) {
  const row = options?.find((option) => option.id === id)
  if (row?.name) {
    return { en: row.name, zh: row.name, desc: row.description ?? '' }
  }
  const fallback = thinkingLevelLabels[id]
  if (fallback) return fallback
  return { en: id, zh: id, desc: '' }
}
