import assert from 'node:assert/strict'
import path from 'node:path'
import {
  getEffectivePath,
  findExecutableInPath,
  diagnoseTool,
  diagnoseEnvironment,
  getSanitizedEnv,
} from '../electron/backend/env-service.mjs'

console.log('--- 开始测试 env-service 环境变量与外部工具诊断 ---')

// 1. 测试 getEffectivePath
const effectivePath = await getEffectivePath()
assert.ok(typeof effectivePath === 'string' && effectivePath.length > 0, 'effectivePath 必须为非空字符串')
const parts = effectivePath.split(path.delimiter)
assert.ok(parts.includes('/bin') || parts.includes('/usr/bin'), '必须包含系统核心目录')

// 2. 测试现有工具诊断：git 和 node
const gitDiag = await diagnoseTool('git', effectivePath)
assert.ok(gitDiag.name === 'git')
if (gitDiag.installed) {
  assert.ok(gitDiag.resolvedPath, '已安装的 git 必须解析出绝对路径')
  assert.ok(typeof gitDiag.version === 'string' && gitDiag.version.length > 0, '已安装的 git 必须输出版本号')
}

const nodeDiag = await diagnoseTool('node', effectivePath)
assert.ok(nodeDiag.name === 'node')
if (nodeDiag.installed) {
  assert.ok(nodeDiag.resolvedPath, '已安装的 node 必须解析出绝对路径')
  assert.ok(gitDiag.version, '已安装的 node 必须包含版本号')
}

// 3. 测试不存在工具的诊断与修复提示：绝不能输出误导性的“权限不足”
const fakeDiag = await diagnoseTool('non_existent_fake_tool_abc_123', effectivePath)
assert.equal(fakeDiag.installed, false, '不存在的程序必须标记为未安装')
assert.equal(fakeDiag.resolvedPath, null)
assert.ok(fakeDiag.fixGuide, '必须给出具体的修复建议指引')
assert.equal(fakeDiag.error.includes('权限不足'), false, '命令不存在时严禁误导性提示“权限不足”！')
assert.equal(fakeDiag.fixGuide.includes('权限不足'), false, '修复建议中严禁误导性提示“权限不足”！')

// 4. 测试全局环境诊断报告 diagnoseEnvironment
const report = await diagnoseEnvironment()
assert.ok(report.platform, '报告必须包含平台')
assert.ok(report.arch, '报告必须包含架构')
assert.ok(report.tools.git, '报告必须包含 git 诊断')
assert.ok(report.tools.node, '报告必须包含 node 诊断')
assert.ok(report.tools.npm, '报告必须包含 npm 诊断')
assert.ok(report.tools.ocx, '报告必须包含 ocx 诊断')
assert.ok(report.summary, '报告必须包含可读总结')

// 5. 测试安全净化环境变量字典
const sanitized = await getSanitizedEnv([], { CUSTOM_TEST_VAR: '123' })
assert.equal(sanitized.CUSTOM_TEST_VAR, '123')
assert.ok(sanitized.PATH, '净化后必须保留有效 PATH')
assert.ok(sanitized.SHELL, '净化后必须保留 SHELL')
assert.ok(sanitized.TERM, '净化后必须保留 TERM')

console.log('✓ env-service 环境变量修复与外部工具诊断全部测试通过！')
