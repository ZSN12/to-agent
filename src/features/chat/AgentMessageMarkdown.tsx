import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** 助手消息：将 Markdown 渲染为排版，避免计划/列表/raw # 符号观感混乱 */
export function AgentMessageMarkdown({ text }: { text: string }) {
  return (
    <div className="message-text message-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}
