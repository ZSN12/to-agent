import { memo, type MouseEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { normalizeMarkdownUrl } from '../../shared/markdown-url.mjs'

const FILE_NAME_OR_PATH_REGEX = /^(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.(?:json|js|jsx|ts|tsx|css|scss|less|html|md|mdx|py|sh|bash|zsh|yaml|yml|toml|rs|go|java|c|cpp|h|hpp|sql|env|lock|xml|svg|vue|graphql)$/i

function openExternalLink(href: string | undefined, event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault()
  const safeUrl = href ? normalizeMarkdownUrl(href) : ''
  if (safeUrl) window.open(safeUrl)
}

function isFileMention(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.includes('\n') || trimmed.includes(' ')) return false
  return FILE_NAME_OR_PATH_REGEX.test(trimmed)
}

/** 助手消息：将 Markdown 渲染为排版，支持 DSH 原生深蓝底文件胶囊与正文行距规范。 */
export const AgentMessageMarkdown = memo(function AgentMessageMarkdown({ text }: { text: string }) {
  return (
    <div className="message-text message-markdown dsh-markdown-flow">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={normalizeMarkdownUrl}
        components={{
          a({ href, children, ...props }) {
            return (
              <a {...props} href={href} rel="noreferrer" onClick={(e) => openExternalLink(href, e)}>
                {children}
              </a>
            )
          },
          code({ node, className, children, ...props }) {
            const codeString = String(children)
            const isBlock = Boolean(className && /language-/.test(className)) || codeString.includes('\n')
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            }
            if (isFileMention(codeString)) {
              return (
                <code className="dsh-file-mention-chip" title={`文件：${codeString}`} {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code className="dsh-inline-code" {...props}>
                {children}
              </code>
            )
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
