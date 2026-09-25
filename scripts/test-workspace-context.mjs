import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assembleWorkspaceContext } from '../electron/backend/context-assembler.mjs'
import { createWorkspaceIndex } from '../electron/backend/workspace-index.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-context-'))

try {
  const workspace = path.join(root, 'workspace')
  const outside = path.join(root, 'secret.txt')
  await fs.mkdir(path.join(workspace, 'src'), { recursive: true })
  await fs.writeFile(path.join(workspace, 'src', 'main.ts'), 'export const answer = 42\n')
  await fs.writeFile(path.join(workspace, 'src', 'notes.md'), 'Design notes\n')
  await fs.writeFile(path.join(workspace, 'ignored.bin'), Buffer.from([0, 1, 2]))
  await fs.mkdir(path.join(workspace, 'node_modules', 'hidden'), { recursive: true })
  await fs.writeFile(path.join(workspace, 'node_modules', 'hidden', 'secret.js'), 'must not index')
  await fs.writeFile(outside, 'outside secret')
  await fs.symlink(outside, path.join(workspace, 'outside-link.txt'))

  const assembled = await assembleWorkspaceContext('请看 @file:src/main.ts 和 @dir:src', workspace)
  assert.match(assembled.prompt, /export const answer = 42/)
  assert.match(assembled.prompt, /Design notes/)
  assert.equal(assembled.references.length, 2)
  assert.equal(assembled.references[0].path, 'src/main.ts')
  assert.equal(assembled.references[1].kind, 'directory')
  assert.ok(!assembled.prompt.includes('must not index'))

  const unchanged = await assembleWorkspaceContext('普通问题', workspace)
  assert.equal(unchanged.prompt, '普通问题')
  assert.deepEqual(unchanged.references, [])

  await assert.rejects(() => assembleWorkspaceContext('读 @file:../secret.txt', workspace), /不能离开当前工作区/)
  await assert.rejects(() => assembleWorkspaceContext('读 @file:outside-link.txt', workspace), /工作区以外/)
  await assert.rejects(() => assembleWorkspaceContext('读 @file:/etc/passwd', workspace), /工作区相对路径/)

  const index = createWorkspaceIndex({ getWorkspacePath: () => workspace })
  const entries = await index.list({ query: 'main', limit: 10 })
  assert.deepEqual(entries, [{ path: 'src/main.ts', kind: 'file' }])
  const all = await index.list({ limit: 100 })
  assert.ok(!all.some((entry) => entry.path.includes('node_modules')))
  assert.ok(!all.some((entry) => entry.path.includes('outside-link')))

  const oversized = 'x'.repeat(33 * 1024)
  await fs.writeFile(path.join(workspace, 'large.txt'), oversized)
  const bounded = await assembleWorkspaceContext('@file:large.txt', workspace)
  assert.ok(!bounded.prompt.includes(oversized))
  assert.match(bounded.prompt, /超过单文件上限/)

  console.log('workspace context checks passed: bounded @file/@dir, traversal and symlink containment, index exclusions')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
