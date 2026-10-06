import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assembleWorkspaceContext, workspaceContextLimits } from '../electron/backend/context-assembler.mjs'
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
  assert.match(assembled.prompt, /材料未提供行号时不要猜测行号/)
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

  const rankedDirectory = path.join(workspace, 'ranked')
  await fs.mkdir(rankedDirectory)
  for (let index = 0; index < 42; index += 1) {
    await fs.writeFile(path.join(rankedDirectory, `00-filler-${String(index).padStart(2, '0')}.txt`), `unrelated note ${index}\n`)
  }
  await fs.writeFile(path.join(rankedDirectory, 'zz-auth.ts'), 'export function rateLimitRequest() { return true }\n')
  const relevant = await assembleWorkspaceContext('请定位 rate limit 请求限流逻辑 @dir:ranked', workspace)
  assert.match(relevant.prompt, /ranked\/zz-auth\.ts/)
  assert.match(relevant.prompt, /rateLimitRequest/)
  assert.match(relevant.prompt, /内容列表已截断/)

  await fs.writeFile(path.join(workspace, 'noise-marker.md'), 'explicit file reference that should not affect @dir ranking\n')
  const noisyDirectory = path.join(workspace, 'noisy-search')
  await fs.mkdir(noisyDirectory)
  for (let index = 0; index < 41; index += 1) {
    await fs.writeFile(path.join(noisyDirectory, `noise-marker-decoy-${String(index).padStart(2, '0')}.txt`), 'unrelated content\n')
  }
  await fs.writeFile(path.join(noisyDirectory, 'target.txt'), 'rareneedle is the requested implementation\n')
  const deNoised = await assembleWorkspaceContext(
    'find rareneedle @file:noise-marker.md @dir:noisy-search',
    workspace,
  )
  assert.match(deNoised.prompt, /文件：noisy-search\/target\.txt/, 'paths embedded in @ references should not pollute directory relevance ranking')

  const scanLimitedDirectory = path.join(workspace, 'scan-limited')
  await fs.mkdir(scanLimitedDirectory)
  for (let index = 0; index < workspaceContextLimits.MAX_DIRECTORY_CONTENT_SCAN + 5; index += 1) {
    await fs.writeFile(path.join(scanLimitedDirectory, `file-${String(index).padStart(3, '0')}.txt`), `candidate ${index}\n`)
  }
  const scanLimited = await assembleWorkspaceContext('@dir:scan-limited', workspace)
  const scanReference = scanLimited.references.find((reference) => reference.path === 'scan-limited')
  assert.equal(scanReference.scannedFileCount, workspaceContextLimits.MAX_DIRECTORY_CONTENT_SCAN, 'directory body reads should have a fixed per-reference cap')
  assert.match(scanLimited.prompt, /内容列表已截断/)

  const oversizedDirectory = path.join(workspace, 'oversized')
  await fs.mkdir(oversizedDirectory)
  const oversizedBody = 'x'.repeat(33 * 1024)
  for (let index = 0; index < workspaceContextLimits.MAX_DIRECTORY_FILES + 5; index += 1) {
    await fs.writeFile(path.join(oversizedDirectory, `large-${String(index).padStart(2, '0')}.txt`), oversizedBody)
  }
  await fs.writeFile(path.join(oversizedDirectory, 'small-target.txt'), 'needle implementation\n')
  const oversizedFiles = await assembleWorkspaceContext('find needle @dir:oversized', workspace)
  assert.match(oversizedFiles.prompt, /文件：oversized\/small-target\.txt/, 'oversized files must not consume readable-result slots')
  assert.match(oversizedFiles.prompt, /文件过大/, 'oversized candidates should still be reported')

  console.log('workspace context checks passed: bounded @file/@dir, relevance-ranked directory context, traversal and symlink containment, index exclusions')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
