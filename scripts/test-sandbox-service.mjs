import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  probeSandboxSupport,
  confineArgv,
  wrapBashInvocation,
  SANDBOX_MODE,
} from '../electron/backend/sandbox-service.mjs'

const probe = probeSandboxSupport()
console.log('sandbox probe:', probe)

if (probe.available) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-sandbox-'))
  const blocked = path.join(tmp, 'outside-write.txt')
  const inside = path.join(tmp, 'inside-write.txt')
  await fs.writeFile(inside, 'ok\n')

  const policy = { mode: SANDBOX_MODE.READ_ONLY, workspaceRoot: tmp }
  const argv = confineArgv(['bash', '-c', `echo test > ${blocked}`], policy)
  const run = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' })
  assert.notEqual(run.status, 0, 'read-only sandbox should block writes outside allowed roots')

  const wrapped = wrapBashInvocation(`echo sandboxed > ${path.join(tmp, 'w.txt')}`, tmp, {
    mode: SANDBOX_MODE.WORKSPACE_WRITE,
    workspaceRoot: tmp,
  })
  const writeRun = spawnSync(wrapped.program, wrapped.args, { cwd: wrapped.cwd, encoding: 'utf8' })
  assert.equal(writeRun.status, 0, `workspace-write should allow writes in workspace: ${writeRun.stderr}`)
  const content = await fs.readFile(path.join(tmp, 'w.txt'), 'utf8')
  assert.equal(content.trim(), 'sandboxed')

  await fs.rm(tmp, { recursive: true, force: true })
  console.log('sandbox-service integration tests passed')
} else {
  console.log('sandbox not available on this platform — probe-only pass')
}
