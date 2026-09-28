import type { AssistantContentBlock } from '../../types'

const THINK_JOIN = '\n\n---\n\n'

/**
 * 多轮 agent 循环会产生 pass:0:thinking、pass:1:thinking… 多条短推理。
 * DSH 式 UI 更合理的是把相邻 thinking 合成一块，展开可看全文。
 */
export function coalesceContentBlocks(blocks: AssistantContentBlock[]): AssistantContentBlock[] {
  if (!blocks?.length) return []
  const out: AssistantContentBlock[] = []

  for (const seg of blocks) {
    if (!seg.text?.trim() && seg.kind === 'text') continue

    const prev = out[out.length - 1]
    if (seg.kind === 'thinking' && prev?.kind === 'thinking') {
      const chunk = seg.text.trim()
      if (chunk) {
        prev.text = prev.text.trim() ? `${prev.text.trim()}${THINK_JOIN}${chunk}` : chunk
      }
      prev.id = `${prev.id}+${seg.id}`
      continue
    }
    out.push({ ...seg, text: seg.text ?? '' })
  }

  return out
}
