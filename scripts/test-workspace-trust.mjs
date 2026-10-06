import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createWorkspaceTrustService } from '../electron/backend/workspace-trust-service.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-trust-'))
try {
  const workspace = path.join(root, 'workspace')
  const appData = path.join(root, 'app-data')
  await fs.mkdir(workspace, { recursive: true })
  const trust = createWorkspaceTrustService(appData)
  assert.equal((await trust.get(workspace)).trusted, false)
  assert.equal((await trust.set(workspace, true)).trusted, true)
  assert.equal((await createWorkspaceTrustService(appData).get(workspace)).trusted, true, 'trust must persist across service restarts')
  assert.equal((await trust.set(workspace, false)).trusted, false)

  assert.equal((await trust.list()).length, 1, 'trust registry should list the canonical workspace record')
  console.log('workspace trust checks passed: unknown defaults untrusted, persistence across service restarts, and explicit trust changes')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
