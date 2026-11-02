import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentMessageMarkdown } from '../src/features/chat/AgentMessageMarkdown.tsx'

const source = [
  '行内计算：$2 \\times 3 = 6$。',
  '',
  '$$',
  '\\frac{1}{2} + \\frac{1}{2} = 1',
  '$$',
].join('\n')

const html = renderToStaticMarkup(createElement(AgentMessageMarkdown, { text: source }))
assert.match(html, /class="katex"/, 'inline math should render with KaTeX markup')
assert.match(html, /class="katex-display"/, 'display math should render with KaTeX markup')
assert.match(html, /<math/, 'rendered math should include accessible MathML')

console.log('markdown math rendering tests passed')
