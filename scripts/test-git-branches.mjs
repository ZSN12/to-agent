import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  createGitBranch,
  listGitBranches,
  switchGitBranch,
} from '../backend/git-service.mjs'

const execFileAsync = promisify(execFile)
async function runGit(args, cwd) {
  return execFileAsync('git', args, { cwd, env: { ...process.env, LC_ALL: 'C' } })
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-git-branches-test-'))
const repo = path.join(root, 'repo')
await fs.mkdir(repo, { recursive: true })

try {
  await runGit(['init', '-b', 'main'], repo)
  await runGit(['config', 'user.name', 'TaskWeaver Test'], repo)
  await runGit(['config', 'user.email', 'test@taskweaver.local'], repo)
  await fs.writeFile(path.join(repo, 'README.md'), 'base\n')
  await runGit(['add', 'README.md'], repo)
  await runGit(['commit', '-m', 'initial commit'], repo)

  const initial = await listGitBranches(repo)
  assert.deepEqual(initial.branches, ['main'])
  assert.equal(initial.currentBranch, 'main')

  // Creating a branch preserves tracked edits, staged work, and untracked files.
  await fs.writeFile(path.join(repo, 'README.md'), 'draft edit\n')
  await fs.writeFile(path.join(repo, 'draft.txt'), 'untracked draft\n')
  const created = await createGitBranch(repo, 'feature/git-branch-controls')
  assert.equal(created.branch, 'feature/git-branch-controls')
  assert.equal((await listGitBranches(repo)).currentBranch, 'feature/git-branch-controls')
  assert.equal(await fs.readFile(path.join(repo, 'README.md'), 'utf8'), 'draft edit\n')
  assert.equal(await fs.readFile(path.join(repo, 'draft.txt'), 'utf8'), 'untracked draft\n')

  await assert.rejects(createGitBranch(repo, 'feature/git-branch-controls'), /已存在/)
  await assert.rejects(createGitBranch(repo, '../escape'), /不合法/)
  await assert.rejects(switchGitBranch(repo, 'missing-branch'), /找不到本地分支/)

  await fs.writeFile(path.join(repo, 'README.md'), 'another uncommitted edit\n')
  await assert.rejects(switchGitBranch(repo, 'main'), /未提交改动/)
  assert.equal((await listGitBranches(repo)).currentBranch, 'feature/git-branch-controls', 'a refused switch must leave HEAD unchanged')
  assert.equal(await fs.readFile(path.join(repo, 'README.md'), 'utf8'), 'another uncommitted edit\n', 'a refused switch must preserve file contents')

  await runGit(['add', '-A'], repo)
  await runGit(['commit', '-m', 'save branch work'], repo)
  const switched = await switchGitBranch(repo, 'main')
  assert.equal(switched.branch, 'main')
  assert.equal(switched.unchanged, false)
  assert.equal((await listGitBranches(repo)).currentBranch, 'main')
  await assert.rejects(fs.access(path.join(repo, 'draft.txt')), { code: 'ENOENT' }, 'switching to main exposes its own file tree')

  const unchanged = await switchGitBranch(repo, 'main')
  assert.equal(unchanged.unchanged, true)

  await assert.rejects(listGitBranches(path.join(root, 'not-a-repo')), /不是 Git 仓库/)
  console.log('git-branches: create, list, clean switch, dirty-worktree protection, and validation passed')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
