import type { AssistantContentBlock } from '../../types'

const THINK_JOIN = '\n\n---\n\n'

/**
 * 多轮 agent 循环会产生 pass:0:thinking、pass:1:thinking… 多条短推理。
 * DSH 式 UI 更合理的是把相邻 thinking 合成一块，展开可看全文。
 */
export function coalesceContentBlocks(blocks: AssistantContentBlock[]): AssistantContentBlock[] {
  if (!blocks?.length) return []
  const exploded: AssistantContentBlock[] = []

  for (const seg of blocks) {
    if (!seg.text?.trim() && seg.kind === 'text') continue

    if (seg.kind === 'text' && seg.text.includes('<think>')) {
      // 提取 <think>...</think> 标签内容为单独的 thinking 块
      const parts = seg.text.split(/(<think>[\s\S]*?<\/think>)/gi)
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (!part) continue
        const thinkMatch = part.match(/^<think>([\s\S]*?)<\/think>$/i)
        if (thinkMatch) {
          const thinkContent = thinkMatch[1].trim()
          if (thinkContent) {
            exploded.push({ id: `${seg.id}-think-${i}`, kind: 'thinking', text: thinkContent })
          }
        } else if (part.trim()) {
          exploded.push({ id: `${seg.id}-text-${i}`, kind: 'text', text: part })
        }
      }
      continue
    }

    exploded.push({ ...seg, text: seg.text ?? '' })
  }

function stepOf(id: string): string | null {
  const m = id.match(/step-(\d+)/)
  return m ? m[1] : null
}

  const out: AssistantContentBlock[] = []
  for (const seg of exploded) {
    if (!seg.text?.trim() && seg.kind === 'text') continue

    const prev = out[out.length - 1]
    const prevStep = prev ? stepOf(prev.id) : null
    const currentStep = stepOf(seg.id)
    const isDifferentStep = prevStep !== null && currentStep !== null && prevStep !== currentStep

    if (seg.kind === 'thinking' && prev?.kind === 'thinking' && !isDifferentStep) {
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
