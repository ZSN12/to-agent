import { spawnSync } from 'node:child_process'

const cases = [
  ['semantic-search source', ['--import', 'tsx', 'scripts/test-semantic-search-source.mjs']],
  ['Markdown stream source', ['scripts/test-markdown-stream-source.mjs']],
  ['workspace index and OAuth coalescing', ['scripts/test-cold-work-source.mjs']],
  ['provider SSE parser', ['scripts/test-sse-parser-source.mjs']],
  ['semantic index lifecycle source', ['--import', 'tsx', 'scripts/test-semantic-index-cache-source.mjs']],
  ['chat history indexes and row rendering', ['scripts/test-chat-history-indexes-source.mjs']],
  ['stable callback and message cache lifecycle', ['--import', 'tsx', 'scripts/test-stable-cache-lifecycle.mjs']],
  ['model provider grouping source', ['--import', 'tsx', 'scripts/test-model-source-groups.mjs']],
  ['subagent DAG presentation source', ['scripts/test-subagent-session-tree-source.mjs']],
]

for (const [name, args] of cases) {
  console.log(`\n=== ${name} ===`)
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
