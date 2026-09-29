/**
 * verification-policy 回归测试。
 *
 * 重点守住「轻量自检优先」这条原则：
 * 自检命令不能首选 `pnpm run build`（= tsc -b && vite build），否则每轮自检都是分钟级。
 * 运行：node scripts/test-verification-policy.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { detectVerificationCommands, formatVerificationPrompt } from '../electron/backend/verification-policy.mjs'

const cleanup = []
/** 建一个临时工作区，`files` 形如 { 'package.json': '...', 'src/a.ts': '' } */
async function makeWorkspace(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-verification-'))
  cleanup.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dir, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content)
  }
  return dir
}
const pkg = (scripts, extra = {}) => JSON.stringify({ name: 'demo', version: '1.0.0', scripts, ...extra })

try {
  // ============ 1. 无工作区 / 目录不存在 ============
  assert.deepEqual(detectVerificationCommands(null), {
    projectType: 'unknown', primaryCommand: null, testCommand: null, buildCommand: null, allCommands: [], description: '未关联工作区',
  })
  assert.equal(detectVerificationCommands(path.join(os.tmpdir(), 'tw-does-not-exist-xyz')).projectType, 'unknown')
  const emptyDir = await makeWorkspace({})
  assert.equal(detectVerificationCommands(emptyDir).projectType, 'general')

  // ============ 2. 轻量优先：typecheck > lint > tsc > build ============
  const allThree = await makeWorkspace({
    'package.json': pkg({ build: 'tsc -b && vite build', lint: 'eslint .', typecheck: 'tsc --noEmit' }),
    'tsconfig.json': JSON.stringify({ compilerOptions: { noEmit: true } }),
  })
  const full = detectVerificationCommands(allThree)
  assert.equal(full.projectType, 'typescript-node')
  assert.equal(full.primaryCommand, 'npm run typecheck', 'typecheck 必须优先于 lint 与 build')
  assert.equal(full.buildCommand, 'npm run build', 'buildCommand 必须独立保留，不因 primary 是 typecheck 而丢失')
  assert.deepEqual(full.allCommands, ['npm run typecheck', 'npm run build'], 'allCommands 应去重且按 primary → test → build 排序')

  // 只有 build 时才回落到完整构建（这是没办法的兜底，不是首选）
  const onlyBuild = await makeWorkspace({ 'package.json': pkg({ build: 'vite build' }) })
  assert.equal(detectVerificationCommands(onlyBuild).primaryCommand, 'npm run build')

  // 有 lint 无 typecheck 时，lint 优先于 tsc
  const lintOnly = await makeWorkspace({
    'package.json': pkg({ lint: 'eslint .', build: 'vite build' }),
    'tsconfig.json': JSON.stringify({ compilerOptions: {} }),
  })
  assert.equal(detectVerificationCommands(lintOnly).primaryCommand, 'npm run lint')

  // ============ 3. tsconfig 形态决定 tsc 命令 ============
  // solution-style（files: [] + references）下 `tsc --noEmit` 什么都不检查，必须用 `tsc -b`
  const solutionStyle = await makeWorkspace({
    'package.json': pkg({ build: 'vite build' }),
    'tsconfig.json': JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }),
  })
  assert.equal(detectVerificationCommands(solutionStyle).primaryCommand, 'npx tsc -b')

  const plainTsconfig = await makeWorkspace({
    'package.json': pkg({ build: 'vite build' }),
    'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
  })
  assert.equal(detectVerificationCommands(plainTsconfig).primaryCommand, 'npx tsc --noEmit')

  // 无 tsconfig 的纯 Node 项目不该给出 tsc 命令
  const plainNode = await makeWorkspace({ 'package.json': pkg({}) })
  assert.equal(detectVerificationCommands(plainNode).projectType, 'node')
  assert.equal(detectVerificationCommands(plainNode).primaryCommand, null)

  // ============ 4. 包管理器识别 ============
  for (const [lockfile, pm] of [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lockb', 'bun']]) {
    const dir = await makeWorkspace({ 'package.json': pkg({ typecheck: 'tsc --noEmit' }), [lockfile]: '' })
    const policy = detectVerificationCommands(dir)
    assert.equal(policy.packageManager, pm)
    assert.equal(policy.primaryCommand, `${pm} run typecheck`)
  }

  // ============ 5. 测试脚本优先级：聚焦的优先于 test:all ============
  const testPriority = await makeWorkspace({
    'package.json': pkg({ 'test:all': 'node run-all.mjs', test: 'node t.mjs', 'test:unit': 'node unit.mjs' }),
  })
  assert.equal(detectVerificationCommands(testPriority).testCommand, 'npm run test:unit')
  const onlyAll = await makeWorkspace({ 'package.json': pkg({ 'test:all': 'node run-all.mjs' }) })
  assert.equal(detectVerificationCommands(onlyAll).testCommand, 'npm run test:all', '只有聚合脚本时仍应给出（放最后）')

  // ============ 6. 其它语言生态 ============
  const cases = [
    [{ 'Cargo.toml': '[package]\nname="a"\n' }, 'rust', 'cargo check'],
    [{ 'go.mod': 'module a\n' }, 'go', 'go vet ./...'],
    [{ 'pyproject.toml': '[project]\nname="a"\n' }, 'python', 'pytest -q --maxfail=1'],
    [{ 'requirements.txt': 'flask\n' }, 'python', 'python -m compileall -q .'],
    [{ 'pom.xml': '<project/>' }, 'maven', 'mvn -q test-compile'],
    [{ 'build.gradle': 'plugins {}' }, 'gradle', 'gradle testClasses'],
    [{ 'Makefile': 'all:\n\techo hi\n' }, 'make', 'make'],
  ]
  for (const [files, projectType, primaryCommand] of cases) {
    const dir = await makeWorkspace(files)
    const policy = detectVerificationCommands(dir)
    assert.equal(policy.projectType, projectType, `${projectType} 识别失败`)
    assert.equal(policy.primaryCommand, primaryCommand)
  }
  // gradlew 存在时用 ./gradlew
  const gradleWrapper = await makeWorkspace({ 'build.gradle.kts': 'plugins {}', 'gradlew': '' })
  assert.equal(detectVerificationCommands(gradleWrapper).primaryCommand, './gradlew testClasses')

  // ============ 7. 提示词内容 ============
  const prompt = formatVerificationPrompt(allThree)
  assert.match(prompt, /轻量自检命令（首选）：`npm run typecheck`/)
  assert.match(prompt, /完整构建命令（较重，仅在必要时运行）：`npm run build`/)
  const emptyPrompt = formatVerificationPrompt(emptyDir)
  assert.match(emptyPrompt, /未检测到标准的自动化构建\/测试脚本/)
  assert.match(emptyPrompt, /严禁假定代码一定正确/)

  // ============ 8. 本仓库（集成校验）============
  // 这个仓库是 solution-style tsconfig + 有 build 脚本，曾经的 bug 是首选 `pnpm run build`。
  const repoRoot = path.resolve(import.meta.dirname, '..')
  const repo = detectVerificationCommands(repoRoot)
  assert.equal(repo.projectType, 'typescript-node')
  assert.notEqual(repo.primaryCommand, `${repo.packageManager} run build`, '自检命令不能首选完整构建')
  assert.equal(repo.primaryCommand, 'npx tsc -b', '本仓库是 solution-style tsconfig，自检应用 tsc -b')
  assert.equal(repo.buildCommand, `${repo.packageManager} run build`)

  console.log('verification-policy 回归测试全部通过：轻量自检优先、tsconfig 形态、包管理器、测试优先级、多语言识别。')
} finally {
  for (const dir of cleanup) await fs.rm(dir, { recursive: true, force: true })
}
