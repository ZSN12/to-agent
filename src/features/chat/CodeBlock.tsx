import { useEffect, useState } from 'react'
import { copyTextToClipboard } from '../../shared/clipboard'
import type { CodeToken } from './highlight-code'
import { IconCheckOutline16, IconCopyOutline16 } from './DshIcons'

const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Bash', sh: 'Shell', shell: 'Shell', zsh: 'Zsh', js: 'JavaScript', jsx: 'JSX',
  javascript: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', typescript: 'TypeScript',
  py: 'Python', python: 'Python', json: 'JSON', jsonc: 'JSONC', html: 'HTML', css: 'CSS',
  scss: 'SCSS', yaml: 'YAML', yml: 'YAML', toml: 'TOML', md: 'Markdown', markdown: 'Markdown',
  sql: 'SQL', rust: 'Rust', rs: 'Rust', go: 'Go', java: 'Java', c: 'C', cpp: 'C++',
  csharp: 'C#', cs: 'C#', xml: 'XML', diff: 'Diff', text: 'Text', plaintext: 'Text',
}

function displayLanguage(language: string): string {
  const normalized = language.toLowerCase().replace(/^language-/u, '')
  return LANGUAGE_LABELS[normalized] ?? (normalized ? normalized.toUpperCase() : '代码')
}

export function CodeBlock({ code, language = '', isStreaming = false }: {
  code: string
  language?: string
  isStreaming?: boolean
}) {
  const [tokens, setTokens] = useState<CodeToken[] | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setTokens(null)
    if (isStreaming || !code.trim()) return () => { cancelled = true }

    void import('./highlight-code').then(({ highlightCode }) => {
      if (!cancelled) setTokens(highlightCode(code, language))
    }).catch(() => {
      if (!cancelled) setTokens(null)
    })
    return () => { cancelled = true }
  }, [code, isStreaming, language])

  const copy = async () => {
    const didCopy = await copyTextToClipboard(code)
    setCopied(didCopy)
    if (didCopy) window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="dsh-code-block">
      <div className="dsh-code-block-toolbar">
        <span className="dsh-code-language">{displayLanguage(language)}</span>
        <button
          type="button"
          className="dsh-code-copy"
          onClick={() => { void copy() }}
          aria-label={copied ? '已复制代码' : '复制代码'}
          title={copied ? '已复制' : '复制代码'}
        >
          {copied ? <IconCheckOutline16 size={14} /> : <IconCopyOutline16 size={14} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre><code className={language ? `language-${language}` : undefined}>
        {tokens && !isStreaming
          ? tokens.map((token, index) => token.kind === 'plain'
            ? token.text
            : <span className={`dsh-code-token-${token.kind}`} key={`${index}-${token.kind}`}>{token.text}</span>)
          : code}
      </code></pre>
    </div>
  )
}
