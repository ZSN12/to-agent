import assert from 'node:assert/strict'
import { composePromptPipeline } from '../electron/backend/prompt-pipeline.mjs'

// UTF-8 字节预算按编码后的实际字节数计算，不计算 userText 或连接符。
const utf8 = composePromptPipeline({
  userText: '用户原文',
  prefixLayers: [{ id: 'prefix', text: '界 \n' }],
  suffixLayers: [{ id: 'suffix', text: '🙂 ' }],
  maxInjectedBytes: 10,
})
assert.equal(utf8.prompt, '界 \n用户原文🙂 ')
assert.equal(utf8.injectedBytes, 10)
assert.deepEqual(utf8.layerBytes, { prefix: 5, suffix: 5 })

// 超限时按优先级低到高移除 optional suffix；相同优先级保持原始顺序。
// prefix 即使标记 optional 也不可删除，required 缺省时默认保留。
const prefixText = 'P1|P2|'
const userText = '  原样用户文本\n'
const suffixLayers = [
  { id: 'required-default', text: 'R', priority: -10 },
  { id: 'drop-first', text: 'a', required: false, priority: 1 },
  { id: 'keep-priority', text: 'K', required: false, priority: 5 },
  { id: 'drop-second', text: 'b', required: false, priority: 1 },
]
const originalSuffixSnapshot = structuredClone(suffixLayers)
const ordered = composePromptPipeline({
  userText,
  prefixLayers: [
    { id: 'prefix-one', text: 'P1|', required: false, priority: -100 },
    { id: 'prefix-two', text: 'P2|' },
  ],
  suffixLayers,
  maxInjectedBytes: Buffer.byteLength(prefixText + 'RK', 'utf8'),
})
assert.equal(ordered.prompt, `${prefixText}${userText}RK`)
assert.equal(ordered.injectedBytes, Buffer.byteLength(prefixText + 'RK', 'utf8'))
assert.deepEqual(ordered.droppedLayers, ['drop-first', 'drop-second'])
assert.deepEqual(ordered.layerBytes, {
  'prefix-one': 3,
  'prefix-two': 3,
  'required-default': 1,
  'keep-priority': 1,
})
assert.deepEqual(Object.keys(ordered.layerBytes), [
  'prefix-one', 'prefix-two', 'required-default', 'keep-priority',
], 'layerBytes must contain only layers retained in the final prompt')
assert.deepEqual(suffixLayers, originalSuffixSnapshot, 'input layer objects must not be mutated')
assert.equal(ordered.prompt.slice(prefixText.length, prefixText.length + userText.length), userText,
  'userText must be preserved byte-for-byte and character-for-character')

// Required prefix/suffix layers cannot be evicted; fail closed if they do not fit.
assert.throws(() => composePromptPipeline({
  userText: 'U',
  prefixLayers: [{ id: 'prefix', text: 'abc' }],
  suffixLayers: [
    { id: 'optional', text: 'x', required: false, priority: -1 },
    { id: 'required', text: 'y' },
  ],
  maxInjectedBytes: 3,
}), /required prompt layers need 4 UTF-8 bytes/)

// No layers is valid, including a zero-byte injection budget.
const empty = composePromptPipeline({ userText: '原文', maxInjectedBytes: 0 })
assert.deepEqual(empty, {
  prompt: '原文',
  injectedBytes: 0,
  layerBytes: {},
  droppedLayers: [],
})

// Reject duplicate ids and malformed input rather than silently normalizing it.
assert.throws(() => composePromptPipeline({
  userText: 'U',
  prefixLayers: [{ id: 'same', text: 'P' }],
  suffixLayers: [{ id: 'same', text: 'S' }],
  maxInjectedBytes: 10,
}), /duplicate prompt layer id: same/)
assert.throws(() => composePromptPipeline({ userText: 'U', maxInjectedBytes: -1 }), /maxInjectedBytes/)
assert.throws(() => composePromptPipeline({ userText: 'U', prefixLayers: [null], maxInjectedBytes: 1 }), /must be an object/)
assert.throws(() => composePromptPipeline({
  userText: 'U',
  suffixLayers: [{ id: 'optional', text: 'S', required: 'no' }],
  maxInjectedBytes: 1,
}), /required must be a boolean/)

console.log('prompt-pipeline 测试通过（UTF-8、顺序/优先级、输入不可变、超限处理、校验、空层）。')
