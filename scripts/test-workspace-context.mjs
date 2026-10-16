import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assembleWorkspaceContext, isFirstConversationTurn, shouldAttachRepoMap, workspaceContextLimits } from '../backend/context-assembler.mjs'
import { composePromptPipeline } from '../backend/prompt-pipeline.mjs'
import { createWorkspaceIndex } from '../backend/workspace-index.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-context-'))

try {
  assert.equal(shouldAttachRepoMap('你好', 'code', { isFirstTurn: true, workspaceTrusted: true }), true,
    'a trusted workspace receives the bounded repository map on the first conversation turn')
  assert.equal(shouldAttachRepoMap('你好', 'code', { isFirstTurn: true, workspaceTrusted: false }), false,
    'an untrusted workspace must not trigger repository indexing')
  assert.equal(shouldAttachRepoMap('分析这个仓库的结构', 'code', { isFirstTurn: true, workspaceTrusted: true }), true,
    'repo-map inclusion does not depend on intent classification')
  assert.equal(shouldAttachRepoMap('分析这个仓库的结构', 'code', { isFirstTurn: false, workspaceTrusted: true }), false,
    'later turns do not re-inject the default repository map')
  assert.equal(shouldAttachRepoMap('读 @file:src/main.ts', 'code', { isFirstTurn: false, workspaceTrusted: true }), false,
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
  await fs.symlink(path.join(workspace, 'src', 'main.ts'), path.join(workspace, 'main-link.ts'))
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
  assert.match(assembled.prompt, /文件引用：src\/main\.ts/)
  assert.match(assembled.prompt, /路径：src\/main\.ts/)
  assert.match(assembled.prompt, /材料未提供行号时不要猜测行号/)
  assert.doesNotMatch(assembled.prompt, /export const answer = 42|Design notes/,
    '@file and @dir default to path references without reading file bodies')
  assert.equal(assembled.sourceBytes.context, Buffer.byteLength(assembled.prompt, 'utf8') - Buffer.byteLength('请看 @file:src/main.ts 和 @dir:src', 'utf8'))
  assert.equal(assembled.injectedBytes, assembled.sourceBytes.context)
  assert.equal(assembled.references.length, 2)
  assert.equal(assembled.references[0].path, 'src/main.ts')
  assert.equal(assembled.references[1].kind, 'directory')
  assert.ok(!assembled.prompt.includes('must not index'))

  const canonicalSymlinkReference = await assembleWorkspaceContext('@file:main-link.ts', workspace)
  assert.equal(canonicalSymlinkReference.references[0].path, 'src/main.ts',
    'an in-workspace symlink resolves to the canonical relative target path')
  assert.match(canonicalSymlinkReference.prompt, /文件引用：src\/main\.ts/)
  assert.doesNotMatch(canonicalSymlinkReference.prompt, /文件引用：main-link\.ts/)

  const inlineSmall = await assembleWorkspaceContext('@file:src/main.ts', workspace, {
    inlineSmallFileReferences: true,
  })
  assert.match(inlineSmall.prompt, /export const answer = 42/)
  assert.doesNotMatch(inlineSmall.prompt, /mtime：/)
  assert.equal(inlineSmall.references[0].inlined, true)

  const directoryBodies = await assembleWorkspaceContext('@dir:src', workspace)
  assert.match(directoryBodies.prompt, /仅列出路径，不读取正文/)
  assert.doesNotMatch(directoryBodies.prompt, /export const answer = 42|Design notes/,
    '@dir lists paths only and never pre-reads file bodies')

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
  assert.match(referenceWithMapBudget.prompt, /文件引用：src\/main\.ts/,
    'explicit path references stay ahead of a generated Repo Map when the budget is tight')

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

  const oversized = 'x'.repeat(30 * 1024)
  await fs.writeFile(path.join(workspace, 'large.txt'), oversized)
  const bounded = await assembleWorkspaceContext('@file:large.txt', workspace)
  assert.ok(!bounded.prompt.includes(oversized))
  assert.match(bounded.prompt, /文件引用：large\.txt/)
  assert.ok(bounded.sourceBytes.context < 1024, 'a 30+ KiB file contributes less than 1 KiB of default prompt context')
  assert.equal(bounded.contextTruncated, false, 'a path-only reference is complete, not truncated file content')

  const cap = workspaceContextLimits.MAX_CONTEXT_INJECTION_BYTES
  assert.equal(cap, 32 * 1024)
  const utf8EdgePath = path.join(workspace, 'utf8-edge.txt')
  const utf8EdgeContent = '界'.repeat(10_900) // 32,700 UTF-8 bytes: below the per-file cap, above the final wrapped-prompt budget.
  await fs.writeFile(utf8EdgePath, utf8EdgeContent)
  const utf8Edge = await assembleWorkspaceContext('@file:utf8-edge.txt', workspace)
  assert.ok(utf8Edge.sourceBytes.context < 1024, 'large UTF-8 files remain compact path references by default')
  assert.doesNotMatch(utf8Edge.prompt, /界{10}/)
  assert.equal(utf8Edge.contextTruncated, false)

  const inlineCandidate = await assembleWorkspaceContext('@file:utf8-edge.txt', workspace, {
    inlineSmallFileReferences: true,
  })
  assert.doesNotMatch(inlineCandidate.prompt, /界{10}/, 'files at or above 4 KiB are never inlined')
  assert.match(inlineCandidate.prompt, /文件引用：utf8-edge\.txt/)
  await assert.rejects(() => assembleWorkspaceContext('@file:utf8-edge.txt', workspace, {
    maxInjectionBytes: 1024 * 1024 + 1,
  }), /maxInjectionBytes must be an integer/)

  const cappedDirectory = path.join(workspace, 'cap-directory')
  await fs.mkdir(cappedDirectory)
  await fs.writeFile(path.join(cappedDirectory, 'a-first.txt'), 'a'.repeat(18_000))
  await fs.writeFile(path.join(cappedDirectory, 'b-second.txt'), 'b'.repeat(18_000))
  const directoryEdge = await assembleWorkspaceContext('@dir:cap-directory', workspace)
  assert.ok(directoryEdge.sourceBytes.context <= cap, 'explicit @dir context must stay within the hard UTF-8 byte cap')
  assert.equal(directoryEdge.contextTruncated, false, 'a compact path list fits comfortably within the normal context budget')
  assert.match(directoryEdge.prompt, /路径：cap-directory\/a-first\.txt/)
  assert.ok(!directoryEdge.prompt.includes('outside secret'), 'an @dir lists only paths under the referenced directory')
  assert.doesNotMatch(directoryEdge.prompt, /a{100}|b{100}/, '@dir must not read any file body')

  const mixedFilePath = path.join(workspace, 'mixed-large.txt')
  const mixedDirectory = path.join(workspace, 'mixed-directory')
  await fs.writeFile(mixedFilePath, 'm'.repeat(20_000))
  await fs.mkdir(mixedDirectory)
  await fs.writeFile(path.join(mixedDirectory, 'nested.txt'), 'n'.repeat(18_000))
  const mixedEdge = await assembleWorkspaceContext('@file:mixed-large.txt @dir:mixed-directory', workspace)
  assert.ok(mixedEdge.sourceBytes.context <= cap, '@file and @dir references share one per-request injection budget')
  assert.equal(mixedEdge.contextTruncated, false)
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
  assert.deepEqual(finalPrompt.droppedLayers, [])
  assert.match(finalPrompt.prompt, /验证提示/)

  const rankedDirectory = path.join(workspace, 'ranked')
  await fs.mkdir(rankedDirectory)
  for (let index = 0; index < 42; index += 1) {
    await fs.writeFile(path.join(rankedDirectory, `00-filler-${String(index).padStart(2, '0')}.txt`), `unrelated note ${index}\n`)
  }
  await fs.writeFile(path.join(rankedDirectory, 'rate-limit-auth.ts'), 'export function rateLimitRequest() { return true }\n')
  const relevant = await assembleWorkspaceContext('请定位 rate limit 请求限流逻辑 @dir:ranked', workspace)
  assert.match(relevant.prompt, /ranked\/rate-limit-auth\.ts/)
  assert.doesNotMatch(relevant.prompt, /rateLimitRequest/)
  assert.match(relevant.prompt, /路径列表已截断/)

  const permissionRankingDirectory = path.join(workspace, 'ranking-target')
  await fs.mkdir(permissionRankingDirectory)
  for (let index = 0; index < workspaceContextLimits.MAX_DIRECTORY_FILES + 5; index += 1) {
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
    assert.match(permissionRanked.prompt, new RegExp(`路径：ranking-target/${fileName.replaceAll('.', '\\.')}\\n`),
      `${fileName} should rank above generic task/verification instructions for a Chinese permissions request`)
  }
  const injectedDecoys = [...permissionRanked.prompt.matchAll(/路径：ranking-target\/task-profile-decoy-/g)]
  assert.ok(injectedDecoys.length < workspaceContextLimits.MAX_DIRECTORY_FILES + 5,
    'path relevance should prioritize permission files within the bounded directory listing')

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
  await fs.rename(path.join(noisyDirectory, 'target.txt'), path.join(noisyDirectory, 'rareneedle-target.txt'))
  const pathRanked = await assembleWorkspaceContext(
    'find rareneedle @file:noise-marker.md @dir:noisy-search',
    workspace,
  )
  assert.match(pathRanked.prompt, /路径：noisy-search\/rareneedle-target\.txt/,
    'directory ranking uses path names and ignores unrelated @file path tokens')
  assert.doesNotMatch(deNoised.prompt, /requested implementation/)

  const scanLimitedDirectory = path.join(workspace, 'scan-limited')
  await fs.mkdir(scanLimitedDirectory)
  for (let index = 0; index < workspaceContextLimits.MAX_DIRECTORY_FILES + 5; index += 1) {
    await fs.writeFile(path.join(scanLimitedDirectory, `file-${String(index).padStart(3, '0')}.txt`), `candidate ${index}\n`)
  }
  const scanLimited = await assembleWorkspaceContext('@dir:scan-limited', workspace)
  const scanReference = scanLimited.references.find((reference) => reference.path === 'scan-limited')
  assert.equal(scanReference.fileCount, workspaceContextLimits.MAX_DIRECTORY_FILES, 'directory path listing has a fixed per-reference cap')
  assert.equal(scanReference.entryCount, workspaceContextLimits.MAX_DIRECTORY_FILES + 5)
  assert.match(scanLimited.prompt, /路径列表已截断/)
  assert.doesNotMatch(scanLimited.prompt, /candidate 0/)

  const oversizedDirectory = path.join(workspace, 'oversized')
  await fs.mkdir(oversizedDirectory)
  const oversizedBody = 'x'.repeat(33 * 1024)
  for (let index = 0; index < workspaceContextLimits.MAX_DIRECTORY_FILES + 5; index += 1) {
    await fs.writeFile(path.join(oversizedDirectory, `large-${String(index).padStart(2, '0')}.txt`), oversizedBody)
  }
  await fs.writeFile(path.join(oversizedDirectory, 'needle-small-target.txt'), 'needle implementation\n')
  const oversizedFiles = await assembleWorkspaceContext('find needle @dir:oversized', workspace)
  assert.match(oversizedFiles.prompt, /路径：oversized\/needle-small-target\.txt/)
  assert.doesNotMatch(oversizedFiles.prompt, /needle implementation|x{100}/,
    '@dir reports large and small file paths uniformly without reading file bodies')

  const cacheDir = path.join(workspace, 'cache-bust')
  await fs.mkdir(cacheDir)
  await fs.writeFile(path.join(cacheDir, 'marker.ts'), 'export const version = 1\n')
  const beforeCache = await assembleWorkspaceContext('version marker @file:cache-bust/marker.ts', workspace, {
    inlineSmallFileReferences: true,
  })
  assert.match(beforeCache.prompt, /version = 1/)
  const markerPath = path.join(cacheDir, 'marker.ts')
  await fs.writeFile(markerPath, 'export const version = 2\n')
  const changedMtime = new Date(Date.now() + 2_000)
  await fs.utimes(markerPath, changedMtime, changedMtime)
  const afterChange = await assembleWorkspaceContext('version marker @file:cache-bust/marker.ts', workspace, {
    inlineSmallFileReferences: true,
  })
  assert.match(afterChange.prompt, /version = 2/, 'the next request reads current file content without a stale assembler cache')
  assert.doesNotMatch(afterChange.prompt, /version = 1/)
  assert.doesNotMatch(afterChange.prompt, /mtime：/)

  const belowInlineLimitPath = path.join(workspace, 'below-inline-limit.txt')
  const atInlineLimitPath = path.join(workspace, 'at-inline-limit.txt')
  await fs.writeFile(belowInlineLimitPath, 'a'.repeat(workspaceContextLimits.MAX_INLINE_FILE_BYTES - 1))
  await fs.writeFile(atInlineLimitPath, 'b'.repeat(workspaceContextLimits.MAX_INLINE_FILE_BYTES))
  const belowLimit = await assembleWorkspaceContext('@file:below-inline-limit.txt', workspace, {
    inlineSmallFileReferences: true,
  })
  const atLimit = await assembleWorkspaceContext('@file:at-inline-limit.txt', workspace, {
    inlineSmallFileReferences: true,
  })
  assert.match(belowLimit.prompt, /a{100}/, 'a readable text file smaller than 4 KiB may be inlined')
  assert.match(atLimit.prompt, /文件引用：at-inline-limit\.txt/)
  assert.doesNotMatch(atLimit.prompt, /b{100}/, 'the 4 KiB boundary is exclusive')

  const composerSource = await fs.readFile(new URL('../src/features/composer/Composer.tsx', import.meta.url), 'utf8')
  const insertStart = composerSource.indexOf('const insertReference =')
  const insertEnd = composerSource.indexOf('const openContextMenu =', insertStart)
  assert.ok(insertStart >= 0 && insertEnd > insertStart, 'Composer provides an @ context completion insertion function')
  const insertReferenceSource = composerSource.slice(insertStart, insertEnd)
  assert.match(insertReferenceSource, /reference\.path/)
  assert.doesNotMatch(insertReferenceSource, /readFile|read_document|reference\.content/,
    'Composer @ completion inserts path tokens without reading file bodies')
  const fileReferencePrompt = await fs.readFile(new URL('../packages/runtime/context/file-reference/src/index.ts', import.meta.url), 'utf8')
  assert.match(fileReferencePrompt, /Use the read tool when their contents are needed/,
    'the DSH file-reference prompt directs models to the sandboxed read tool on demand')
  const fileReferencePlugin = await fs.readFile(new URL('../packages/runtime/context/file-reference-local/src/index.ts', import.meta.url), 'utf8')
  assert.match(fileReferencePlugin, /agent\.ctx\.tools\.get\('read', agent\)[\s\S]*FILE_REFERENCE_PROMPT/,
    'the local DSH plugin injects the file-reference prompt when the Host read tool is available')
  const assemblerSource = await fs.readFile(new URL('../backend/context-assembler.mjs', import.meta.url), 'utf8')
  const collectorStart = assemblerSource.indexOf('async function collectDirectoryPaths')
  const readerStart = assemblerSource.indexOf('async function readSmallUtf8File', collectorStart)
  assert.ok(collectorStart >= 0 && readerStart > collectorStart)
  assert.doesNotMatch(assemblerSource.slice(collectorStart, readerStart), /readFile\s*\(/,
    '@dir collection must not read file bodies')
  assert.match(assemblerSource, /O_NOFOLLOW/,
    'opt-in inline reads reject a final-component symlink swap after workspace path validation')
  assert.match(assemblerSource, /O_NONBLOCK/,
    'opt-in inline reads cannot block if a file is swapped with a FIFO')
  assert.match(assemblerSource, /canonicalBefore !== absolutePath[\s\S]*pathBefore\.ino !== before\.ino/,
    'opt-in inline reads verify canonical path and descriptor identity before reading bytes')

  console.log('workspace context checks passed: path-only @file/@dir defaults, opt-in small text inlining, bounded path listings, fresh content per request, traversal and symlink containment, Composer and DSH read references')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
