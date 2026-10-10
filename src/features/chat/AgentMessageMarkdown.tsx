import { Children, isValidElement, memo, useMemo, type MouseEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { normalizeMarkdownUrl } from '../../shared/markdown-url.mjs'
import { splitMarkdownStableBlocks } from './markdown-stream-blocks'
import { CodeBlock } from './CodeBlock'

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

function markdownNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return Children.toArray(node).map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return String(child)
    if (isValidElement<{ children?: ReactNode }>(child)) return markdownNodeText(child.props.children)
    return ''
  }).join('')
}

const MarkdownChunk = memo(function MarkdownChunk({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  return (
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
        pre({ children }) {
          const codeElement = Children.toArray(children).find((child) => isValidElement(child))
          const codeProps = codeElement && isValidElement<{ className?: string; children?: ReactNode }>(codeElement)
            ? codeElement.props
            : null
          const className = codeProps?.className ?? ''
          const language = /(?:^|\s)language-([\w+-]+)/u.exec(className)?.[1] ?? ''
          return <CodeBlock code={markdownNodeText(codeProps?.children ?? children)} language={language} isStreaming={isStreaming} />
        },
        code({ node: _node, className, children, ...props }) {
          const codeString = String(children)
          const isBlock = Boolean(className && /language-/.test(className)) || codeString.includes('\n')
          if (isBlock) return <code className={className} {...props}>{children}</code>
          if (isFileMention(codeString)) {
            return <code className="dsh-file-mention-chip" title={`文件：${codeString}`} {...props}>{children}</code>
          }
          return <code className="dsh-inline-code" {...props}>{children}</code>
        },
      }}
    >
      {text}
    </ReactMarkdown>
  )
})

/** 助手消息将稳定 Markdown 块固定下来，只在流式时重解析尚未闭合的尾块。 */
export const AgentMessageMarkdown = memo(function AgentMessageMarkdown({ text, isStreaming = false }: { text: string; isStreaming?: boolean }) {
  const { stableBlocks, tail } = useMemo(() => splitMarkdownStableBlocks(text), [text])

  return (
    <div className="message-text message-markdown dsh-markdown-flow">
      {stableBlocks.map((block, index) => (
        <MarkdownChunk key={`stable-${index}`} text={block} isStreaming={false} />
      ))}
      {tail && <MarkdownChunk key="tail" text={tail} isStreaming={isStreaming} />}
    </div>
  )
})
