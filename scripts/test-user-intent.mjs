/**
 * user-intent 回归测试。
 *
 * 守住的核心不变量：**无法判断时不要当成「要改代码」**。
 * 旧实现把无匹配的输入一律判成 CODE_MUTATION，于是「你好」也会被追加
 * 「必须运行构建命令自测」——在大仓库上就是分钟级的无意义构建链。
 *
 * 运行：node scripts/test-user-intent.mjs
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { analyzeUserIntent, injectIntentGuidelines, USER_INTENTS } from '../electron/backend/user-intent.mjs'
import { detectVerificationCommands } from '../electron/backend/verification-policy.mjs'

const { CODE_MUTATION, READ_ONLY, PLANNING, CONVERSATION } = USER_INTENTS

const cases = [
  // ===== 空输入 =====
  ['', CONVERSATION, '空字符串'],
  [null, CONVERSATION, 'null'],
  ['   \n  ', CONVERSATION, '纯空白'],

  // ===== 寒暄 / 致谢 / 确认：绝不能判成要改代码 =====
  ['你好', CONVERSATION, '寒暄'],
  ['您好', CONVERSATION, '寒暄'],
  ['hi', CONVERSATION, '英文寒暄'],
  ['早上好', CONVERSATION, '问候'],
  ['在吗', CONVERSATION, '打招呼'],
  ['谢谢', CONVERSATION, '致谢'],
  ['好的', CONVERSATION, '确认'],
  ['收到', CONVERSATION, '确认'],
  ['ok', CONVERSATION, '确认'],
  ['你是谁', CONVERSATION, '自我介绍'],
  ['嗯……让我想想', CONVERSATION, '兜底：判不出来就不注入'],

  // ===== 明确的修改请求 =====
  ['帮我实现一个登录页', CODE_MUTATION, '实现'],
  ['修复这个 bug', CODE_MUTATION, '修复'],
  ['更新一下 README', CODE_MUTATION, '更新'],
  ['删除这个文件', CODE_MUTATION, '删除'],
  ['refactor the auth module', CODE_MUTATION, '英文重构'],
  ['把这个函数改成 async', CODE_MUTATION, '改成'],
  ['修复这个 bug 并解释原因', CODE_MUTATION, 'mutation 必须优先于只读，否则会漏掉闭环要求'],

  // ===== 疑问句里的动词不算修改意图 =====
  ['这个功能是怎么实现的？', READ_ONLY, '「怎么实现」是提问'],
  ['为什么删除了这个文件？', READ_ONLY, '「为什么…删除」是提问'],
  ['更新是什么意思', READ_ONLY, '「X 是什么意思」是问词义'],
  ['查看一下 src 目录', READ_ONLY, '只读查看'],
  ['解释一下这个报错', READ_ONLY, '要求解释'],
  ['这样做对吗？', READ_ONLY, '问句结尾'],

  // ===== 规划 =====
  ['制定计划', PLANNING, '显式规划'],
  ['/plan 重构认证模块', PLANNING, 'plan 前缀'],
  ['随便什么内容', PLANNING, 'plan 工作模式', 'plan'],
]

let failed = 0
for (const [text, expected, label, workMode] of cases) {
  const actual = analyzeUserIntent(text, workMode ?? 'code')
  if (actual !== expected) {
    failed += 1
    console.error(`✗ ${label}：${JSON.stringify(text)} 期望 ${expected}，实际 ${actual}`)
    continue
  }
  console.log(`✓ ${label}：${JSON.stringify(text)} → ${expected}`)
}
assert.equal(failed, 0, `${failed} 条意图判定用例失败`)

// ===== 注入行为 =====
const repoRoot = path.resolve(import.meta.dirname, '..')
const policy = detectVerificationCommands(repoRoot)

// 关键回归：寒暄不能被注入任何东西
for (const text of ['你好', '谢谢', '嗯……让我想想', '随便聊聊']) {
  assert.equal(
    injectIntentGuidelines(text, analyzeUserIntent(text), policy),
    text,
    `「${text}」不应被注入任何指引`,
  )
}
assert.equal(injectIntentGuidelines('原文', PLANNING, policy), '原文', '计划模式已有专门前缀，不重复注入')

const readOnly = injectIntentGuidelines('原文', READ_ONLY, policy)
assert.match(readOnly, /技术咨询或代码理解/)
assert.doesNotMatch(readOnly, /自主闭环要求/, '只读意图不能要求跑自检')

const mutation = injectIntentGuidelines('原文', CODE_MUTATION, policy)
assert.match(mutation, /自主闭环要求/)
assert.match(mutation, new RegExp(policy.primaryCommand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
assert.match(mutation, /若验证失败，请根据错误日志自行修正/)

// 没有可用验证命令时不能生成空要求
const noCommandPolicy = { ...policy, primaryCommand: null, testCommand: null }
assert.equal(injectIntentGuidelines('原文', CODE_MUTATION, noCommandPolicy), '原文')
assert.equal(injectIntentGuidelines('原文', CODE_MUTATION, null), '原文')

// ===== 端到端：寒暄走完整链路后不应出现构建命令 =====
const e2e = injectIntentGuidelines('你好', analyzeUserIntent('你好', 'code'), policy)
assert.doesNotMatch(e2e, /npm run|npx tsc|pnpm run/, '寒暄的最终 prompt 里不能出现任何构建/自检命令')

console.log(`\nuser-intent 回归测试全部通过（${cases.length} 条意图判定 + 注入行为 + 端到端）。`)
