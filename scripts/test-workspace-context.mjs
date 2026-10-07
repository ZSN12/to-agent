import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assembleWorkspaceContext, isFirstConversationTurn, shouldAttachRepoMap, workspaceContextLimits } from '../electron/backend/context-assembler.mjs'
import { composePromptPipeline } from '../electron/backend/prompt-pipeline.mjs'
import { createWorkspaceIndex } from '../electron/backend/workspace-index.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-context-'))

try {
  assert.equal(shouldAttachRepoMap('你好', 'code', { isFirstTurn: true, hasNonConversationIntent: false }), false,
    'first-turn greetings must not trigger repository indexing')
  assert.equal(shouldAttachRepoMap('分析这个仓库的结构', 'code', { isFirstTurn: true, hasNonConversationIntent: true }), true,
    'the first engineering request may receive the bounded repository map')
  assert.equal(shouldAttachRepoMap('分析这个仓库的结构', 'code', { isFirstTurn: false, hasNonConversationIntent: true }), false,
    'later turns do not re-inject the default repository map')
  assert.equal(shouldAttachRepoMap('读 @file:src/main.ts', 'code', { isFirstTurn: false, hasNonConversationIntent: true }), false,
    'later explicit references resolve only the requested context without rebuilding the default repository map')
  assert.equal(isFirstConversationTurn([]), true)
  assert.equal(isFirstConversationTurn([{ author: 'user', text: 'previous turn' }]), false,
    'persisted app messages mark a conversation as no longer on its first turn')
  assert.equal(isFirstConversationTurn([{ role: 'user', content: 'API-shaped prior turn' }]), false,
    'API role-shaped messages also mark a conversation as no longer on its first turn')
  assert.equal(isFirstConversationTurn([{ author: 'assistant', text: 'hello' }]), true)

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
  assert.equal(
    assembled.layers.prefix.map((layer) => layer.text).join('')
      + '请看 @file:src/main.ts 和 @dir:src'
      + assembled.layers.suffix.map((layer) => layer.text).join(''),
    assembled.prompt,
    'workspace assembler must expose layers that reconstruct its exact prompt',
  )
  assert.match(assembled.prompt, /export const answer = 42/)
  assert.match(assembled.prompt, /材料未提供行号时不要猜测行号/)
  assert.match(assembled.prompt, /Design notes/)
  assert.equal(assembled.sourceBytes.context, Buffer.byteLength(assembled.prompt, 'utf8') - Buffer.byteLength('请看 @file:src/main.ts 和 @dir:src', 'utf8'))
  assert.equal(assembled.injectedBytes, assembled.sourceBytes.context)
  assert.equal(assembled.references.length, 2)
  assert.equal(assembled.references[0].path, 'src/main.ts')
  assert.equal(assembled.references[1].kind, 'directory')
  assert.ok(!assembled.prompt.includes('must not index'))

  const unchanged = await assembleWorkspaceContext('普通问题', workspace)
  assert.equal(unchanged.prompt, '普通问题')
  assert.deepEqual(unchanged.references, [])
  assert.equal(unchanged.injectedBytes, 0)
  assert.deepEqual(unchanged.sourceBytes, { context: 0, sandboxPolicy: 0 })
  assert.deepEqual(unchanged.layers, { prefix: [], suffix: [] })

  const defaultWithoutWorkspace = await assembleWorkspaceContext(
    '普通问题',
    path.join(root, 'workspace-that-does-not-exist'),
  )
  assert.equal(defaultWithoutWorkspace.prompt, '普通问题', 'requests without explicit references must not traverse or resolve the workspace')
  assert.deepEqual(defaultWithoutWorkspace.references, [])
  assert.equal(defaultWithoutWorkspace.injectedBytes, 0)

  const referenceWithMapBudget = await assembleWorkspaceContext('@file:src/main.ts', workspace, {
    maxInjectionBytes: 4 * 1024,
    includeRepoMap: true,
    repoMapTokens: 10_000,
  })
  assert.ok(referenceWithMapBudget.injectedBytes <= 4 * 1024,
    'explicit context and any optional Repo Map must share the configured hard cap')
  assert.match(referenceWithMapBudget.prompt, /export const answer = 42/,
    'explicit references stay ahead of a generated Repo Map when the budget is tight')

  await assert.rejects(() => assembleWorkspaceContext('读 @file:../secret.txt', workspace), /不能离开当前工作区/)
  await assert.rejects(() => assembleWorkspaceContext('读 @file:outside-link.txt', workspace), /工作区以外/)
  await assert.rejects(() => assembleWorkspaceContext('读 @file:/etc/passwd', workspace), /工作区相对路径/)
  await assert.rejects(() => assembleWorkspaceContext('读 @dir:.', workspace), /不能预加载整个工作区/)
  await assert.rejects(() => assembleWorkspaceContext('读 @dir:./', workspace), /不能预加载整个工作区/)

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

  const cap = workspaceContextLimits.MAX_CONTEXT_INJECTION_BYTES
  assert.equal(cap, 32 * 1024)
  const utf8EdgePath = path.join(workspace, 'utf8-edge.txt')
  const utf8EdgeContent = '界'.repeat(10_900) // 32,700 UTF-8 bytes: below the per-file cap, above the final wrapped-prompt budget.
  await fs.writeFile(utf8EdgePath, utf8EdgeContent)
  const utf8Edge = await assembleWorkspaceContext('@file:utf8-edge.txt', workspace)
  assert.ok(utf8Edge.sourceBytes.context <= cap, 'explicit @file context must stay within the hard UTF-8 byte cap')
  assert.equal(utf8Edge.injectedBytes, utf8Edge.sourceBytes.context)
  assert.equal(utf8Edge.contextTruncated, true, 'wrapper and file metadata count against the same cap')
  assert.match(utf8Edge.prompt, /因单次 32 KiB 上下文上限已截断/)
  assert.ok(!utf8Edge.prompt.includes('\uFFFD'), 'truncation must not split a multi-byte UTF-8 character')

  const smallCandidate = await assembleWorkspaceContext('@file:utf8-edge.txt', workspace, {
    maxInjectionBytes: 8 * 1024,
  })
  assert.ok(smallCandidate.injectedBytes <= 8 * 1024)
  assert.equal(smallCandidate.contextTruncated, true)
  const largerCandidate = await assembleWorkspaceContext('@file:utf8-edge.txt', workspace, {
    maxInjectionBytes: 48 * 1024,
  })
  assert.ok(largerCandidate.injectedBytes <= 48 * 1024)
  assert.equal(largerCandidate.contextTruncated, false)
  await assert.rejects(() => assembleWorkspaceContext('@file:utf8-edge.txt', workspace, {
    maxInjectionBytes: 1024 * 1024 + 1,
  }), /maxInjectionBytes must be an integer/)

  const cappedDirectory = path.join(workspace, 'cap-directory')
  await fs.mkdir(cappedDirectory)
  await fs.writeFile(path.join(cappedDirectory, 'a-first.txt'), 'a'.repeat(18_000))
  await fs.writeFile(path.join(cappedDirectory, 'b-second.txt'), 'b'.repeat(18_000))
  const directoryEdge = await assembleWorkspaceContext('@dir:cap-directory', workspace)
  assert.ok(directoryEdge.sourceBytes.context <= cap, 'explicit @dir context must stay within the hard UTF-8 byte cap')
  assert.equal(directoryEdge.contextTruncated, true, 'directory file headers and wrappers count against the cap')
  assert.ok(!directoryEdge.prompt.includes('outside secret'), 'an @dir may only read/inject files under the referenced directory')

  const mixedFilePath = path.join(workspace, 'mixed-large.txt')
  const mixedDirectory = path.join(workspace, 'mixed-directory')
  await fs.writeFile(mixedFilePath, 'm'.repeat(20_000))
  await fs.mkdir(mixedDirectory)
  await fs.writeFile(path.join(mixedDirectory, 'nested.txt'), 'n'.repeat(18_000))
  const mixedEdge = await assembleWorkspaceContext('@file:mixed-large.txt @dir:mixed-directory', workspace)
  assert.ok(mixedEdge.sourceBytes.context <= cap, '@file and @dir references share one per-request injection budget')
  assert.equal(mixedEdge.contextTruncated, true)
  assert.equal(mixedEdge.references.length, 2)
  assert.ok(!mixedEdge.prompt.includes('n'.repeat(18_000)), 'lower-priority later context must be truncated when the combined budget is exhausted')

  const sandboxOnly = await assembleWorkspaceContext('普通问题', workspace, { sandboxContextLine: '只允许读取工作区' })
  assert.equal(sandboxOnly.sourceBytes.context, 0, 'no @ reference must produce zero workspace-context injection')
  assert.equal(sandboxOnly.injectedBytes, Buffer.byteLength('只允许读取工作区\n\n', 'utf8'))
  const sandboxAtByteLimit = await assembleWorkspaceContext('普通问题', workspace, {
    sandboxContextLine: '界'.repeat(10),
    maxInjectionBytes: 32,
  })
  assert.equal(sandboxAtByteLimit.injectedBytes, 32, 'sandbox policy bytes, including its separator, may exactly fill the injection cap')
  await assert.rejects(() => assembleWorkspaceContext('普通问题', workspace, {
    sandboxContextLine: '界'.repeat(11),
    maxInjectionBytes: 32,
  }), /安全策略说明超过单次上下文注入上限/, 'oversized mandatory policy must fail closed even when there are no @ references')
  const sandboxAndContext = await assembleWorkspaceContext('@file:utf8-edge.txt', workspace, {
    sandboxContextLine: '只允许读取工作区',
  })
  assert.ok(sandboxAndContext.injectedBytes <= cap, 'sandbox policy and explicit file context share the 32 KiB injection budget')
  assert.equal(sandboxAndContext.sourceBytes.context + sandboxAndContext.sourceBytes.sandboxPolicy,
    sandboxAndContext.injectedBytes)
  const finalPrompt = composePromptPipeline({
    userText: '@file:utf8-edge.txt',
    prefixLayers: sandboxAndContext.layers.prefix,
    suffixLayers: [
      ...sandboxAndContext.layers.suffix,
      { id: 'verification-guidance', text: '\n验证提示', required: false, priority: 0 },
    ],
    maxInjectedBytes: cap,
  })
  assert.ok(finalPrompt.injectedBytes <= cap, 'the final prompt must respect the same aggregate injection cap')
  assert.deepEqual(finalPrompt.droppedLayers, ['verification-guidance'], 'only optional verification guidance may be dropped after explicit context fills the cap')
  assert.equal(finalPrompt.prompt, sandboxAndContext.prompt, 'the user text, sandbox policy and explicit context remain unchanged')

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

  const permissionRankingDirectory = path.join(workspace, 'ranking-target')
  await fs.mkdir(permissionRankingDirectory)
  for (let index = 0; index < 12; index += 1) {
    const decoyPath = path.join(permissionRankingDirectory, `task-profile-decoy-${String(index).padStart(2, '0')}.mjs`)
    await fs.writeFile(
      decoyPath,
      `// generic task planning and verification notes ${index}\n${'unrelated execution guidance '.repeat(75)}`,
    )
    const future = new Date(Date.now() + 60_000 + index)
    await fs.utimes(decoyPath, future, future)
  }
  await fs.writeFile(path.join(permissionRankingDirectory, 'permission-service.mjs'), 'export function authorizePermission() { return true }\n')
  await fs.writeFile(path.join(permissionRankingDirectory, 'dsh-permission-map.mjs'), 'export function mapPermissionPreset() { return "read-only" }\n')
  await fs.writeFile(path.join(permissionRankingDirectory, 'sandbox-policy.mjs'), 'export function resolveSandboxPolicy() { return "workspace-write" }\n')
  await fs.writeFile(path.join(permissionRankingDirectory, 'approval-bridge.mjs'), 'export function requestApproval() { return "prompt" }\n')
  await fs.writeFile(
    path.join(permissionRankingDirectory, 'permission-overview.mjs'),
    `// permission authorization access policy sandbox isolation approval prompt\n${'x'.repeat(15_800)}`,
  )
  const permissionTask = [
    '追踪用户选择的权限模式如何传入 Host，并由沙箱和审批落实。',
    '用不超过 5 条列出端到端链路并引用路径；只在预载上下文不足时使用只读文件工具。',
    '不要全仓扫描，不运行构建或测试，不修改文件。',
    '@dir:ranking-target',
  ].join(' ')
  const permissionRanked = await assembleWorkspaceContext(permissionTask, workspace)
  for (const fileName of ['permission-service.mjs', 'dsh-permission-map.mjs', 'sandbox-policy.mjs', 'approval-bridge.mjs']) {
    assert.match(permissionRanked.prompt, new RegExp(`文件：ranking-target/${fileName.replaceAll('.', '\\.')}\\n`),
      `${fileName} should rank above generic task/verification instructions for a Chinese permissions request`)
  }
  const injectedDecoys = [...permissionRanked.prompt.matchAll(/文件：ranking-target\/task-profile-decoy-/g)]
  assert.ok(injectedDecoys.length < 12, 'relevant source files should displace some lower-signal decoys under the injection cap')

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

  const cacheDir = path.join(workspace, 'cache-bust')
  await fs.mkdir(cacheDir)
  await fs.writeFile(path.join(cacheDir, 'marker.ts'), 'export const version = 1\n')
  const beforeCache = await assembleWorkspaceContext('version marker @dir:cache-bust', workspace)
  assert.match(beforeCache.prompt, /version = 1/)
  await fs.writeFile(path.join(cacheDir, 'marker.ts'), 'export const version = 2\n')
  const afterCache = await assembleWorkspaceContext('version marker @dir:cache-bust', workspace)
  assert.match(afterCache.prompt, /version = 2/, 'relevance cache must miss after file mtime/content change')

  console.log('workspace context checks passed: default and candidate UTF-8 injection caps, accounting, @file/@dir boundaries, zero-reference behavior, relevance-ranked directory context, traversal and symlink containment, index exclusions')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
