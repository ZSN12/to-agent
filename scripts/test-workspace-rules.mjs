import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  discoverWorkspaceRuleFiles,
  loadWorkspaceRules,
  clearWorkspaceRulesCache,
} from '../electron/backend/workspace-rules-service.mjs'
import { assembleWorkspaceContext } from '../electron/backend/context-assembler.mjs'

const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-rules-test-'))

try {
  clearWorkspaceRulesCache()

  // 1. 测试空工作区：无规则文件
  const emptyFiles = await discoverWorkspaceRuleFiles(testDir)
  assert.deepEqual(emptyFiles, [])
  const emptyLoaded = await loadWorkspaceRules(testDir)
  assert.equal(emptyLoaded.text, '')
  assert.equal(emptyLoaded.bytes, 0)
  assert.equal(emptyLoaded.files.length, 0)

  // 2. 写入原生 TASKWEAVER.md
  await fs.writeFile(path.join(testDir, 'TASKWEAVER.md'), '# 项目约定\n- 统一使用 TypeScript 5.9\n- 遵循严格错误捕获规范', 'utf8')
  const foundTaskWeaver = await discoverWorkspaceRuleFiles(testDir)
  assert.ok(foundTaskWeaver.includes('TASKWEAVER.md'))

  clearWorkspaceRulesCache()
  const loadedTaskWeaver = await loadWorkspaceRules(testDir)
  assert.ok(loadedTaskWeaver.text.includes('统一使用 TypeScript 5.9'))
  assert.ok(loadedTaskWeaver.text.includes('<taskweaver_project_rules source="TASKWEAVER.md">'))
  assert.equal(loadedTaskWeaver.files.length, 1)
  assert.equal(loadedTaskWeaver.files[0].relativePath, 'TASKWEAVER.md')
  assert.equal(loadedTaskWeaver.files[0].truncated, false)

  // 3. 写入多种兼容规范（AGENTS.md, CLAUDE.md, .cursorrules, .cursor/rules/api.md）
  await fs.writeFile(path.join(testDir, 'AGENTS.md'), '# Codex Agent Instructions\nAlways run tests before completing turn.', 'utf8')
  await fs.writeFile(path.join(testDir, 'CLAUDE.md'), '# Claude Code Guidelines\nDo not delete user comments.', 'utf8')
  await fs.writeFile(path.join(testDir, '.cursorrules'), '# Cursor Rules\nPrefer functional style.', 'utf8')

  await fs.mkdir(path.join(testDir, '.cursor', 'rules'), { recursive: true })
  await fs.writeFile(path.join(testDir, '.cursor', 'rules', 'db.mdc'), '# Database Schema Rules\nAll tables must have created_at.', 'utf8')

  clearWorkspaceRulesCache()
  const allFound = await discoverWorkspaceRuleFiles(testDir)
  assert.ok(allFound.includes('TASKWEAVER.md'))
  assert.ok(allFound.includes('AGENTS.md'))
  assert.ok(allFound.includes('CLAUDE.md'))
  assert.ok(allFound.includes('.cursorrules'))
  assert.ok(allFound.includes(path.join('.cursor', 'rules', 'db.mdc')))

  const allLoaded = await loadWorkspaceRules(testDir)
  assert.ok(allLoaded.text.includes('TASKWEAVER.md'))
  assert.ok(allLoaded.text.includes('AGENTS.md'))
  assert.ok(allLoaded.text.includes('CLAUDE.md'))
  assert.ok(allLoaded.text.includes('.cursorrules'))
  assert.ok(allLoaded.text.includes('db.mdc'))
  assert.equal(allLoaded.files.length, 5)

  // 4. 预算截断测试：限制总预算为 500 字节
  clearWorkspaceRulesCache()
  const smallBudgetLoaded = await loadWorkspaceRules(testDir, { budgetBytes: 500 })
  assert.ok(smallBudgetLoaded.bytes <= 650, '总字节数必须受预算控制')
  assert.ok(smallBudgetLoaded.files.length >= 1)

  // 5. 与 assembleWorkspaceContext 集成验证
  clearWorkspaceRulesCache()
  const assembled = await assembleWorkspaceContext('请实现一个通用数据查询服务', testDir, {
    includeRules: true,
  })
  assert.ok(assembled.prompt.includes('项目指令与规范约定'))
  assert.ok(assembled.prompt.includes('统一使用 TypeScript 5.9'))
  assert.ok(assembled.layers.suffix.some((l) => l.id === 'workspace-rules'))
  assert.ok(assembled.sourceBytes.rules > 0)
  assert.equal(assembled.injectedBytes, assembled.sourceBytes.rules)

  // 6. 测试 includeRules: false 时不注入
  clearWorkspaceRulesCache()
  const assembledWithoutRules = await assembleWorkspaceContext('请实现一个通用数据查询服务', testDir, {
    includeRules: false,
  })
  assert.equal(assembledWithoutRules.prompt, '请实现一个通用数据查询服务')
  assert.equal(assembledWithoutRules.injectedBytes, 0)
  assert.equal(assembledWithoutRules.layers.suffix.length, 0)

  console.log('test-workspace-rules: all checks passed!')
} finally {
  await fs.rm(testDir, { recursive: true, force: true })
}
