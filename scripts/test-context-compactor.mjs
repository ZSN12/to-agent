import assert from 'node:assert/strict'
import {
  compactToolOutput,
  calculateDynamicContextBudget,
  COMPACTION_LIMITS,
} from '../electron/backend/context-compactor.mjs'

// ============ 1. 短输出不折叠 ============
const shortText = 'line 1\nline 2\nline 3\nsuccess'
const shortRes = compactToolOutput(shortText, { maxChars: 500, maxLines: 10 })
assert.equal(shortRes.compacted, false)
assert.equal(shortRes.text, shortText)
assert.equal(shortRes.omittedLines, 0)

// ============ 2. 超过行数限制触发折叠 ============
const manyLines = Array.from({ length: 150 }, (_, i) => `Line ${i + 1}: some normal output text`).join('\n')
const lineRes = compactToolOutput(manyLines, { maxChars: 10000, maxLines: 50, headLines: 5, tailLines: 5 })
assert.equal(lineRes.compacted, true)
assert.ok(lineRes.text.startsWith('Line 1:'))
assert.ok(lineRes.text.includes('Line 150:'))
assert.ok(lineRes.text.includes('自动省略中间'))
assert.ok(lineRes.compactedLength < manyLines.length)

// ============ 3. 中间被省略部分中的关键诊断保留 ============
const errorLines = Array.from({ length: 100 }, (_, i) => {
  if (i === 50) return 'FATAL ERROR: TS2304 Cannot find name "Config"'
  if (i === 52) return 'SyntaxError: Unexpected token in line 52'
  return `Normal trace log entry ${i}`
}).join('\n')

const errorRes = compactToolOutput(errorLines, { maxChars: 10000, maxLines: 40, headLines: 5, tailLines: 5 })
assert.equal(errorRes.compacted, true)
assert.ok(errorRes.text.includes('TS2304 Cannot find name "Config"'), '中间的关键诊断必须被提取保留')
assert.ok(errorRes.text.includes('SyntaxError: Unexpected token'), '中间的关键语法错误必须被保留')

// ============ 4. 动态上下文预算分配测试 ============
const planBudget = calculateDynamicContextBudget('plan', { modelContextWindow: 128_000 })
assert.equal(planBudget.workspaceContextBytes, 32 * 1024, '计划模式工作区注入默认 32KiB')
assert.equal(planBudget.repoMapTokens, 2000, '计划模式应分配更多 Repo Map tokens')

const codeBudget = calculateDynamicContextBudget('code', { modelContextWindow: 128_000 })
assert.equal(codeBudget.workspaceContextBytes, 32 * 1024, '代码模式工作区注入默认 32KiB')
assert.equal(codeBudget.repoMapTokens, 1200, '代码编写模式应分配适中 Repo Map tokens')
assert.ok(codeBudget.toolOutputMaxChars > planBudget.toolOutputMaxChars, '代码模式应保留更多工具输出空间')
assert.equal(COMPACTION_LIMITS.MAX_TOOL_OUTPUT_CHARS, 3000, '默认工具输出折叠阈值应保持稳定')

console.log('✓ context-compactor 测试用例 100% 通过！')
