import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** 助手消息：将 Markdown 渲染为排版，避免计划/列表/raw # 符号观感混乱。
 * 流式期间父组件每帧都会重渲染，text 未变化的历史消息用 memo 跳过
 * 整段 ReactMarkdown + remarkGfm 解析（长回答下这是主要的重排开销）。 */
export const AgentMessageMarkdown = memo(function AgentMessageMarkdown({ text }: { text: string }) {
  return (
    <div className="message-text message-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
})
