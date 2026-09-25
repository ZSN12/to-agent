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

  console.log('verification-policy and coding-agent-prompt tests passed successfully!')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
