import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { registerWorkspaceGitIpc } from '../backend/register-workspace-git-ipc.mjs'
import { extractFileDiff } from '../backend/tool-trace.mjs'
import { inspectCreatedFileForRevert } from '../backend/workspace-diff-revert.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-diff-revert-'))
const event = { senderFrame: { url: 'taskweaver://app/index.html' } }

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  }).trim()
}

function register(workspacePath) {
  const handlers = new Map()
  registerWorkspaceGitIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    userDataPath: path.join(root, 'user-data'),
    resolveActiveRuntime: async () => ({ workspacePath, conversationId: 'conversation-1' }),
    withWorkspaceOperation: async (_workspacePath, operation) => operation(),
  })
  return (payload) => handlers.get('workspace:revertDiff')(event, payload)
}

function checkpointRefs(workspacePath) {
  const output = git(workspacePath, 'for-each-ref', '--format=%(refname)', 'refs/taskweaver/checkpoints')
  return output ? output.split('\n') : []
}

try {
  const repo = path.join(root, 'repo')
  await fs.mkdir(repo)
  git(repo, 'init', '-q')
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'init')
  const revert = register(repo)

  // Hunk revert snapshots the pre-revert contents before overwriting them.
  await fs.writeFile(path.join(repo, 'edited.txt'), 'keep\nnew line\nend\n')
  const hunk = await revert({ path: 'edited.txt', reverseEdits: [{ oldText: 'keep\nnew line\nend', newText: 'keep\nold line\nend' }] })
  assert.equal(hunk.ok, true, hunk.error)
  assert.equal(await fs.readFile(path.join(repo, 'edited.txt'), 'utf8'), 'keep\nold line\nend\n')
  assert.ok(hunk.data.checkpointId, 'a hunk revert reports its protective checkpoint')
  const [firstRef] = checkpointRefs(repo)
  assert.ok(firstRef, 'the checkpoint is anchored by a Git ref')
  assert.equal(git(repo, 'show', `${firstRef}:edited.txt`), 'keep\nnew line\nend', 'the checkpoint holds the content being reverted')
  assert.equal(git(repo, 'diff', '--cached', '--name-only'), '', 'the user index is untouched')

  const repeated = await revert({ path: 'edited.txt', reverseEdits: [{ oldText: 'keep\nnew line\nend', newText: 'keep\nold line\nend' }] })
  assert.equal(repeated.ok, true)
  assert.equal(repeated.data.checkpointId, undefined, 'an already-reverted hunk writes nothing and takes no checkpoint')
  assert.equal(checkpointRefs(repo).length, 1)

  // A tool-created file is deleted only while it still matches what the tool wrote.
  const created = extractFileDiff('write', { path: 'created.txt', content: 'hello\n' }, {
    content: [{ type: 'text', text: 'Created file created.txt' }],
  })
  assert.equal(created.isNewFile, true)
  assert.match(created.createdContentSha256, /^[0-9a-f]{64}$/)
  await fs.writeFile(path.join(repo, 'created.txt'), 'hello\n')
  const removed = await revert({ path: 'created.txt', createdContentSha256: created.createdContentSha256 })
  assert.equal(removed.ok, true, removed.error)
  await assert.rejects(fs.access(path.join(repo, 'created.txt')), 'the unchanged created file is removed')
  assert.ok(removed.data.checkpointId)
  const createdRef = checkpointRefs(repo).find((ref) => ref !== firstRef)
  assert.equal(git(repo, 'show', `${createdRef}:created.txt`), 'hello', 'the deleted untracked file stays recoverable')

  const again = await revert({ path: 'created.txt', createdContentSha256: created.createdContentSha256 })
  assert.equal(again.ok, true, 'a missing created file counts as already reverted')

  await fs.writeFile(path.join(repo, 'created.txt'), 'hello\nuser edit\n')
  const refusedEdit = await revert({ path: 'created.txt', createdContentSha256: created.createdContentSha256 })
  assert.equal(refusedEdit.ok, false, 'a created file edited afterwards is not deleted')
  assert.equal(await fs.readFile(path.join(repo, 'created.txt'), 'utf8'), 'hello\nuser edit\n')

  const refusedHash = await revert({ path: 'created.txt', createdContentSha256: 'not-a-hash' })
  assert.equal(refusedHash.ok, false, 'malformed fingerprints are rejected')

  const outside = await revert({ path: '../outside.txt', createdContentSha256: created.createdContentSha256 })
  assert.equal(outside.ok, false, 'paths outside the workspace are rejected')

  await fs.mkdir(path.join(repo, 'dir.txt'))
  await assert.rejects(
    inspectCreatedFileForRevert(path.join(repo, 'dir.txt'), created.createdContentSha256),
    /不是普通文件/,
    'only regular files are eligible for deletion',
  )

  // Workspaces without Git still revert; there is nothing to snapshot into.
  const plain = path.join(root, 'plain')
  await fs.mkdir(plain)
  await fs.writeFile(path.join(plain, 'note.txt'), 'hello\n')
  const plainResult = await register(plain)({ path: 'note.txt', createdContentSha256: created.createdContentSha256 })
  assert.equal(plainResult.ok, true, plainResult.error)
  assert.equal(plainResult.data.checkpointId, null)
} finally {
  await fs.rm(root, { recursive: true, force: true })
}

console.log('workspace diff revert IPC checks passed: protective checkpoints, created-file removal and refusal cases')
