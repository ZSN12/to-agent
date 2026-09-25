import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { detectVerificationCommands, formatVerificationPrompt } from '../electron/backend/verification-policy.mjs'
import { buildCodingAgentPrompt } from '../electron/backend/coding-agent-prompt.mjs'

async function run() {
  const currentWorkspace = process.cwd()

  // 1. 测试当前 TaskWeaver 项目识别
  const currentPolicy = detectVerificationCommands(currentWorkspace)
  assert.equal(currentPolicy.projectType, 'typescript-node')
  assert.equal(currentPolicy.primaryCommand, 'npm run build')
  assert.equal(currentPolicy.testCommand, 'npm run test:all')
  assert.ok(currentPolicy.allCommands.includes('npm run build'))

  // 2. 测试虚拟 Python 项目
  const tempPython = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-test-py-'))
  try {
    fs.writeFileSync(path.join(tempPython, 'requirements.txt'), 'pytest>=7.0\n')
    fs.writeFileSync(path.join(tempPython, 'pytest.ini'), '[pytest]\n')
    const pyPolicy = detectVerificationCommands(tempPython)
    assert.equal(pyPolicy.projectType, 'python')
    assert.equal(pyPolicy.primaryCommand, 'pytest')
  } finally {
    fs.rmSync(tempPython, { recursive: true, force: true })
  }

  // 3. 测试虚拟 Rust 项目
  const tempRust = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-test-rust-'))
  try {
    fs.writeFileSync(path.join(tempRust, 'Cargo.toml'), '[package]\nname = "demo"\n')
    const rustPolicy = detectVerificationCommands(tempRust)
    assert.equal(rustPolicy.projectType, 'rust')
    assert.equal(rustPolicy.testCommand, 'cargo test')
  } finally {
    fs.rmSync(tempRust, { recursive: true, force: true })
  }

  // 4. 测试 Coding Agent 提示词生成
  const prompt = buildCodingAgentPrompt({ workspacePath: currentWorkspace })
  assert.ok(prompt.includes('Autonomous Coding Protocol v2'))
  assert.ok(prompt.includes('最小 Diff 精准编辑'))
  assert.ok(prompt.includes('自愈修正回路'))
  assert.ok(prompt.includes('防止虚构测试结果'))
  assert.ok(prompt.includes('npm run build'))
  assert.ok(prompt.includes('变更与自检总结'))

  // 5. 测试现代包管理器自适应识别 (pnpm / yarn / bun)
  const tempPnpm = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-test-pnpm-'))
  try {
    fs.writeFileSync(path.join(tempPnpm, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run', build: 'vite build' } }))
    fs.writeFileSync(path.join(tempPnpm, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4\n')
    const pnpmPolicy = detectVerificationCommands(tempPnpm)
    assert.equal(pnpmPolicy.packageManager, 'pnpm')
    assert.equal(pnpmPolicy.primaryCommand, 'pnpm run build')
    assert.equal(pnpmPolicy.testCommand, 'pnpm test')
  } finally {
    fs.rmSync(tempPnpm, { recursive: true, force: true })
  }

  // 6. 测试 Makefile 项目
  const tempMake = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-test-make-'))
  try {
    fs.writeFileSync(path.join(tempMake, 'Makefile'), 'test:\n\tpytest\n')
    const makePolicy = detectVerificationCommands(tempMake)
    assert.equal(makePolicy.projectType, 'make')
    assert.equal(makePolicy.primaryCommand, 'make')
    assert.equal(makePolicy.testCommand, 'make test')
  } finally {
    fs.rmSync(tempMake, { recursive: true, force: true })
  }

  // 7. 测试用户意图分析 (user-intent.mjs)
  const { analyzeUserIntent, injectIntentGuidelines, USER_INTENTS } = await import('../electron/backend/user-intent.mjs')
  
  // 7.1 只读咨询类
  assert.equal(analyzeUserIntent('请问快速排序的时间复杂度是多少？'), USER_INTENTS.READ_ONLY)
  assert.equal(analyzeUserIntent('解释一下这段代码的作用'), USER_INTENTS.READ_ONLY)
  assert.equal(analyzeUserIntent('帮我看一下哪里定义了 handleSubmit'), USER_INTENTS.READ_ONLY)

  // 7.2 代码修改类
  assert.equal(analyzeUserIntent('修复登录接口返回 401 的 bug'), USER_INTENTS.CODE_MUTATION)
  assert.equal(analyzeUserIntent('在 User 表中新增 age 字段并添加验证'), USER_INTENTS.CODE_MUTATION)
  assert.equal(analyzeUserIntent('重构 utils.ts 中的时间转换函数'), USER_INTENTS.CODE_MUTATION)

  // 7.3 计划模式
  assert.equal(analyzeUserIntent('重构认证模块', 'plan'), USER_INTENTS.PLANNING)
  assert.equal(analyzeUserIntent('/plan 为项目添加单元测试方案'), USER_INTENTS.PLANNING)

  // 7.4 意图指引注入测试
  const readOnlyInjected = injectIntentGuidelines('原始文本', USER_INTENTS.READ_ONLY, currentPolicy)
  assert.ok(readOnlyInjected.includes('当前请求属于技术咨询或代码理解'))
  assert.ok(!readOnlyInjected.includes('自主闭环要求'))

  const mutationInjected = injectIntentGuidelines('原始文本', USER_INTENTS.CODE_MUTATION, currentPolicy)
  assert.ok(mutationInjected.includes('自主闭环要求'))
  assert.ok(mutationInjected.includes('npm run build'))

  console.log('verification-policy, project detection, and user-intent tests passed successfully!')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
