import assert from 'node:assert/strict'
import { composePromptPipeline, DEFAULT_PROMPT_BUDGET_BYTES } from '../electron/backend/prompt-pipeline.mjs'
import { buildSkillPromptPrefix } from '../electron/backend/skill-prompt.mjs'

// UTF-8 字节预算按编码后的实际字节数计算，不计算连接符。
const utf8 = composePromptPipeline({
  userText: '用户原文',
  prefixLayers: [{ id: 'prefix', text: '界 \n' }],
  suffixLayers: [{ id: 'suffix', text: '🙂 ' }],
  maxInjectedBytes: 10,
})
assert.equal(utf8.prompt, '界 \n用户原文🙂 ')
assert.equal(utf8.injectedBytes, 10)
assert.deepEqual(utf8.layerBytes, { prefix: 5, suffix: 5 })
assert.deepEqual(utf8.diagnostics, {
  budgetBytes: 10,
  userBytes: 12,
  injectedBytes: 10,
  promptBytes: 22,
  estimatedTokens: 6,
  injectedEstimatedTokens: 3,
  remainingBudgetBytes: 0,
  utilization: 1,
})

// Budget defaults to 32 KiB and output diagnostics use a documented token-ish estimate.
const defaultBudget = composePromptPipeline({ userText: 'question', suffixLayers: [{ id: 'mode', text: 'mode' }] })
assert.equal(DEFAULT_PROMPT_BUDGET_BYTES, 32 * 1024)
assert.equal(defaultBudget.diagnostics.budgetBytes, 32 * 1024)
assert.equal(defaultBudget.diagnostics.promptBytes, Buffer.byteLength(defaultBudget.prompt, 'utf8'))
assert.equal(defaultBudget.diagnostics.estimatedTokens, Math.ceil(defaultBudget.diagnostics.promptBytes / 4))
const greeting = composePromptPipeline({ userText: '你好' })
assert.equal(greeting.injectedBytes, 0, 'plain conversation starts with zero business-injected layers')

const skillPrefix = buildSkillPromptPrefix({ name: 'review', baseDir: '/skills/review', instructions: '检查边界条件。' })
const skilled = composePromptPipeline({
  userText: '请审查这个改动。',
  prefixLayers: [{ id: 'selected-skill', text: skillPrefix, required: true }],
})
assert.ok(skilled.prompt.startsWith(skillPrefix), 'selected Skill is composed into the same injection pipeline')
assert.equal(skilled.layerBytes['selected-skill'], Buffer.byteLength(skillPrefix, 'utf8'),
  'selected Skill bytes are visible in budget diagnostics')
assert.throws(() => composePromptPipeline({
  userText: '请审查这个改动。',
  prefixLayers: [{ id: 'selected-skill', text: skillPrefix, required: true }],
  maxInjectedBytes: Buffer.byteLength(skillPrefix, 'utf8') - 1,
}), /required prompt layers need/, 'oversized selected Skills fail closed instead of bypassing the cap')

// Overflow removes optional layers in ascending priority, with stable input-order ties.
// Guidance order: verify < cursor guidance < mode < context.
const ranked = composePromptPipeline({
  userText: 'U',
  prefixLayers: [{ id: 'policy', text: 'P' }],
  suffixLayers: [
    { id: 'verify', text: 'V', required: false, priority: 1 },
    { id: 'cursor-guidance', text: 'C', required: false, priority: 2 },
    { id: 'mode', text: 'M', required: false, priority: 3 },
    { id: 'context', text: 'X', required: false, priority: 4 },
  ],
  maxInjectedBytes: 3,
})
assert.equal(ranked.prompt, 'PUMX')
assert.equal(ranked.injectedBytes, 3)
assert.deepEqual(ranked.droppedLayers, ['verify', 'cursor-guidance'])
assert.deepEqual(ranked.layerBytes, { policy: 1, mode: 1, context: 1 })

const tiedSuffix = [
  { id: 'first', text: '1', required: false, priority: 0 },
  { id: 'second', text: '2', required: false, priority: 0 },
  { id: 'required-default', text: 'R', priority: -10 },
]
const tiedSuffixSnapshot = structuredClone(tiedSuffix)
const stableTies = composePromptPipeline({
  userText: 'U',
  suffixLayers: tiedSuffix,
  maxInjectedBytes: 1,
})
assert.equal(stableTies.prompt, 'UR')
assert.deepEqual(stableTies.droppedLayers, ['first', 'second'])
assert.deepEqual(tiedSuffix, tiedSuffixSnapshot, 'input layer objects must not be mutated')

// Optional prefix layers participate in clipping too; the user text stays intact.
const prefixClip = composePromptPipeline({
  userText: '  原样用户文本\n',
  prefixLayers: [
    { id: 'optional-prefix', text: 'prefix', required: false, priority: -10 },
    { id: 'required-prefix', text: 'P' },
  ],
  maxInjectedBytes: 1,
})
assert.equal(prefixClip.prompt, 'P  原样用户文本\n')
assert.deepEqual(prefixClip.droppedLayers, ['optional-prefix'])

// Required layers cannot be evicted; fail closed if they do not fit.
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
  diagnostics: {
    budgetBytes: 0,
    userBytes: 6,
    injectedBytes: 0,
    promptBytes: 6,
    estimatedTokens: 2,
    injectedEstimatedTokens: 0,
    remainingBudgetBytes: 0,
    utilization: 0,
  },
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

console.log('prompt-pipeline 测试通过（UTF-8、32 KiB 默认预算、稳定优先级裁剪、输入不可变语义、诊断估算、超限处理、校验、空层）。')
