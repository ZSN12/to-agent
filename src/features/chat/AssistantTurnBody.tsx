import type { AssistantContentBlock, TurnActivitySummary } from '../../types'
import type { DshProjectedToolCall, ToolTraceItem } from '../../shared/app-api'
import { lazy, Suspense, useMemo } from 'react'
import { DshThinkBlock } from './DshThinkBlock'
import { coalesceContentBlocks } from './coalesceContentBlocks'
import { isDebugBlocksEnabled } from './debug-blocks'
import { isStructuredThinkingBlock } from './reasoning-heuristics'
import { DshToolCallList } from './DshToolCallList'

const AgentMessageMarkdown = lazy(() => import('./AgentMessageMarkdown').then((module) => ({ default: module.AgentMessageMarkdown })))

function splitLeadingPreamble(text: string): { preamble: string; rest: string } | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  // 匹配前导引导句（例如："我先看看仓库里最近有什么新改动...我看看具体改了什么：" + 换行 + 详细内容）
  const match = trimmed.match(/^([\s\S]*?(?:：|:)\s*(?:\n+|$))([\s\S]+)$/)
  if (match && match[1]?.trim() && match[2]?.trim()) {
    return {
      preamble: match[1].trim(),
      rest: match[2].trim(),
    }
  }
  return null
}

export function AssistantTurnBody({
  blocks,
  fallbackThinking,
  fallbackText,
  thinkingIsStreaming,
  isStreaming = false,
  dshToolRows,
  toolTraceItems,
  turnActivity,
  workspacePath,
  onShowToolDetails,
  onOpenWorkspacePath,
}: {
  blocks?: AssistantContentBlock[] | null
  fallbackThinking?: string
  fallbackText?: string
  thinkingIsStreaming?: boolean
  isStreaming?: boolean
  dshToolRows?: readonly DshProjectedToolCall[]
  toolTraceItems?: readonly ToolTraceItem[]
  turnActivity?: TurnActivitySummary
  workspacePath?: string | null
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
}) {
  const rawSegments =
    blocks && blocks.length > 0
      ? blocks
      : [
          ...(fallbackThinking?.trim()
            ? [{ id: 'legacy-think', kind: 'thinking' as const, text: fallbackThinking }]
            : []),
          ...(fallbackText?.trim() ? [{ id: 'legacy-text', kind: 'text' as const, text: fallbackText }] : []),
        ]

  const hasTools = ((dshToolRows?.length ?? 0) > 0 || (toolTraceItems?.length ?? 0) > 0)
  if (!rawSegments.length && !hasTools) return null

  const segments = coalesceContentBlocks(rawSegments)
  const debug = isDebugBlocksEnabled()
  const lastRaw = rawSegments[rawSegments.length - 1]

  // 构建交织流 items
  type FlowItem =
    | { kind: 'thinking'; id: string; text: string; streamThis: boolean }
    | { kind: 'text'; id: string; text: string }
    | { kind: 'tools'; id: string; filterStep?: number }

  const flowItems = useMemo<FlowItem[]>(() => {
    const items: FlowItem[] = []
    let toolsInserted = !hasTools

    // 如果没有任何文本或思考块，但有工具调用
    if (segments.length === 0) {
      if (hasTools) items.push({ kind: 'tools', id: 'turn-tools' })
      return items
    }

    const thinkingBlocks = segments.filter((s) => isStructuredThinkingBlock(s))
    const textBlocks = segments.filter((s) => !isStructuredThinkingBlock(s))

    // 检查是否有按 step 命名的多步骤结构（如 step-1-thinking, step-2-thinking 等）
    const hasStepIds = segments.some((s) => /step-\d+/.test(s.id))

    if (hasStepIds) {
      const stepNumbers = Array.from(
        new Set(
          segments
            .map((s) => {
              const m = s.id.match(/step-(\d+)/)
              return m ? parseInt(m[1], 10) : 1
            })
            .concat((toolTraceItems ?? []).map((t) => t.step ?? 1))
        )
      ).sort((a, b) => a - b)

      for (let sIdx = 0; sIdx < stepNumbers.length; sIdx++) {
        const stepNum = stepNumbers[sIdx]
        const stepSegs = segments.filter((seg) => {
          const m = seg.id.match(/step-(\d+)/)
          return (m ? parseInt(m[1], 10) : 1) === stepNum
        })

        // 该步骤的 thinking
        for (const seg of stepSegs) {
          if (isStructuredThinkingBlock(seg)) {
            const isLast = seg === segments[segments.length - 1]
            const streamThis = isStreaming && isLast && (thinkingIsStreaming !== false)
            items.push({ kind: 'thinking', id: seg.id, text: seg.text, streamThis })
          }
        }

        // 该步骤的 text
        for (const seg of stepSegs) {
          if (!isStructuredThinkingBlock(seg) && seg.text?.trim()) {
            items.push({ kind: 'text', id: seg.id, text: seg.text })
          }
        }

        // 该步骤的工具调用
        const stepTools = (toolTraceItems ?? []).filter((t) => (t.step ?? 1) === stepNum)
        if (stepTools.length > 0 || (sIdx === 0 && !toolsInserted && hasTools)) {
          items.push({ kind: 'tools', id: `tools-step-${stepNum}`, filterStep: stepNum })
          toolsInserted = true
        }
      }

      if (!toolsInserted && hasTools) {
        items.push({ kind: 'tools', id: 'turn-tools' })
      }
      return items
    }

    // 场景 A：有多个 thinking 块（多轮推理循环）
    // 工具插入在第二轮思考之前（即第一轮思考与说明之后）
    if (thinkingBlocks.length > 1) {
      const firstThinking = thinkingBlocks[0]
      items.push({ kind: 'thinking', id: firstThinking.id, text: firstThinking.text, streamThis: false })

      if (textBlocks.length > 0) {
        const firstText = textBlocks[0]
        const preambleSplit = splitLeadingPreamble(firstText.text)
        if (preambleSplit) {
          items.push({ kind: 'text', id: `${firstText.id}-preamble`, text: preambleSplit.preamble })
          if (hasTools && !toolsInserted) {
            items.push({ kind: 'tools', id: 'turn-tools' })
            toolsInserted = true
          }
          if (preambleSplit.rest) {
            items.push({ kind: 'text', id: `${firstText.id}-rest`, text: preambleSplit.rest })
          }
        } else {
          items.push({ kind: 'text', id: firstText.id, text: firstText.text })
          if (hasTools && !toolsInserted) {
            items.push({ kind: 'tools', id: 'turn-tools' })
            toolsInserted = true
          }
        }
      } else if (hasTools && !toolsInserted) {
        items.push({ kind: 'tools', id: 'turn-tools' })
        toolsInserted = true
      }

      for (let i = 1; i < thinkingBlocks.length; i++) {
        const tb = thinkingBlocks[i]
        const isLast = i === thinkingBlocks.length - 1
        const streamThis = isStreaming && isLast && (thinkingIsStreaming !== false)
        items.push({ kind: 'thinking', id: tb.id, text: tb.text, streamThis })
      }
      for (let i = 1; i < textBlocks.length; i++) {
        const txt = textBlocks[i]
        if (txt.text?.trim()) {
          items.push({ kind: 'text', id: txt.id, text: txt.text })
        }
      }

      if (hasTools && !toolsInserted) {
        items.push({ kind: 'tools', id: 'turn-tools' })
      }
      return items
    }

    // 场景 B：单轮思考或直接输出
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const isLast = i === segments.length - 1
      const streamThis = isStreaming && isLast && lastRaw?.kind === seg.kind && (seg.kind !== 'thinking' || thinkingIsStreaming !== false)

      if (isStructuredThinkingBlock(seg)) {
        items.push({ kind: 'thinking', id: seg.id, text: seg.text, streamThis })
        continue
      }

      // 处理文本块：尝试将前导引导语与后续正文分离，工具卡片穿插在中间
      if (!toolsInserted && hasTools) {
        const preambleSplit = splitLeadingPreamble(seg.text)
        if (preambleSplit) {
          items.push({ kind: 'text', id: `${seg.id}-preamble`, text: preambleSplit.preamble })
          items.push({ kind: 'tools', id: 'turn-tools' })
          if (preambleSplit.rest) {
            items.push({ kind: 'text', id: `${seg.id}-rest`, text: preambleSplit.rest })
          }
          toolsInserted = true
          continue
        } else if (seg.text.length < 240 || seg.text.trim().endsWith(':') || seg.text.trim().endsWith('：')) {
          // 短前导语，工具紧跟其后
          items.push({ kind: 'text', id: seg.id, text: seg.text })
          items.push({ kind: 'tools', id: 'turn-tools' })
          toolsInserted = true
          continue
        } else {
          // 长回答且无明显前导语：工具先于正文呈现
          items.push({ kind: 'tools', id: 'turn-tools' })
          items.push({ kind: 'text', id: seg.id, text: seg.text })
          toolsInserted = true
          continue
        }
      }

      items.push({ kind: 'text', id: seg.id, text: seg.text })
    }

    // 尾部兜底确保工具已插入
    if (!toolsInserted && hasTools) {
      items.push({ kind: 'tools', id: 'turn-tools' })
    }

    return items
  }, [segments, hasTools, isStreaming, lastRaw, thinkingIsStreaming, toolTraceItems])

  return (
    <div className="assistant-turn-body">
      {flowItems.map((item) => {
        if (item.kind === 'thinking') {
          return (
            <div key={item.id} className="assistant-block-wrap is-thinking">
              {debug && <span className="block-debug-chip">thinking · {item.id}</span>}
              <DshThinkBlock thinking={item.text} isStreaming={item.streamThis} />
            </div>
          )
        }

        if (item.kind === 'tools') {
          const stepTraces = item.filterStep !== undefined
            ? (toolTraceItems ?? []).filter((t) => (t.step ?? 1) === item.filterStep)
            : toolTraceItems
          const stepRows = item.filterStep !== undefined
            ? (dshToolRows ?? []).filter((r) => (r.step || 1) === item.filterStep)
            : dshToolRows

          if ((stepTraces?.length ?? 0) === 0 && (stepRows?.length ?? 0) === 0) {
            return null
          }

          return (
            <div key={item.id} className="assistant-block-wrap is-tools message-tool-traces">
              <DshToolCallList
                rows={stepRows}
                traces={stepTraces}
                turnActivity={turnActivity}
                workspacePath={workspacePath}
                isActive={isStreaming}
                onShowToolDetails={onShowToolDetails}
                onOpenWorkspacePath={onOpenWorkspacePath}
              />
            </div>
          )
        }

        return (
          <div key={item.id} className="assistant-block-wrap is-text">
            {debug && <span className="block-debug-chip">text · {item.id}</span>}
            <div className="assistant-text-block">
              <Suspense fallback={<div className="message-text message-markdown">{item.text}</div>}>
                <AgentMessageMarkdown text={item.text} />
              </Suspense>
            </div>
          </div>
        )
      })}
    </div>
  )
}
