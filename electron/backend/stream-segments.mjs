/**
 * Ordered think/text segments for one user turn (multi-step agent loop).
 * Keys: assistant pass × contentIndex × kind.
 */

export function createStreamSegmentCollector() {
  let assistantPass = 0
  let redactedThinkingSlot = 0
  /** @type {Map<string, { id: string, kind: 'thinking' | 'text', text: string, pass: number, contentIndex: number }>} */
  const byId = new Map()
  /** @type {string[]} */
  const order = []

  function segmentId(pass, contentIndex, kind) {
    return `${pass}:${contentIndex}:${kind}`
  }

  function touch(pass, contentIndex, kind) {
    const id = segmentId(pass, contentIndex, kind)
    let seg = byId.get(id)
    if (!seg) {
      seg = { id, kind, text: '', pass, contentIndex }
      byId.set(id, seg)
      order.push(id)
    }
    return seg
  }

  return {
    onAssistantMessageStart() {
      assistantPass += 1
      redactedThinkingSlot = 0
    },
    onThinkingStart(contentIndex) {
      const idx = typeof contentIndex === 'number' ? contentIndex : redactedThinkingSlot++
      return touch(assistantPass, idx, 'thinking')
    },
    onThinkingDelta(contentIndex, delta, fullText) {
      const idx = typeof contentIndex === 'number' ? contentIndex : redactedThinkingSlot
      const seg = touch(assistantPass, idx, 'thinking')
      if (typeof fullText === 'string') seg.text = fullText
      else if (delta) seg.text += delta
      return seg
    },
    onThinkingEnd(contentIndex, fullText) {
      const idx = typeof contentIndex === 'number' ? contentIndex : redactedThinkingSlot
      const seg = touch(assistantPass, idx, 'thinking')
      if (typeof fullText === 'string' && fullText) seg.text = fullText
      return seg
    },
    onTextStart(contentIndex) {
      const idx = typeof contentIndex === 'number' ? contentIndex : 0
      return touch(assistantPass, idx, 'text')
    },
    onTextDelta(contentIndex, delta, fullText) {
      const idx = typeof contentIndex === 'number' ? contentIndex : 0
      const seg = touch(assistantPass, idx, 'text')
      if (typeof fullText === 'string') seg.text = fullText
      else if (delta) seg.text += delta
      return seg
    },
    snapshot() {
      return order
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((s) => ({ id: s.id, kind: s.kind, text: s.text }))
    },
    combinedText() {
      return this.snapshot()
        .filter((s) => s.kind === 'text' && s.text.trim())
        .map((s) => s.text.trim())
        .join('\n\n')
    },
    combinedThinking() {
      return this.snapshot()
        .filter((s) => s.kind === 'thinking' && s.text.trim())
        .map((s) => s.text.trim())
        .join('\n\n---\n\n')
    },
  }
}
