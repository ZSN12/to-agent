import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createWorkspaceTrustService } from '../electron/backend/workspace-trust-service.mjs'
import { createTaskWeaverResourceLoader } from '../electron/agent/taskweaver-resources.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-trust-'))
try {
  const workspace = path.join(root, 'workspace')
  const appData = path.join(root, 'app-data')
  const projectExtension = path.join(workspace, '.taskweaver', 'extensions', 'project-extension.ts')
  await fs.mkdir(path.dirname(projectExtension), { recursive: true })
  await fs.writeFile(projectExtension, 'export default function () {}\n')

  const trust = createWorkspaceTrustService(appData)
  assert.equal((await trust.get(workspace)).trusted, false)
  assert.equal((await trust.set(workspace, true)).trusted, true)
  assert.equal((await createWorkspaceTrustService(appData).get(workspace)).trusted, true, 'trust must persist across service restarts')
  assert.equal((await trust.set(workspace, false)).trusted, false)

  const untrusted = createTaskWeaverResourceLoader({
    cwd: workspace,
    agentDir: appData,
    builtInSkillsPath: path.resolve('electron/skills'),
    builtInExtensionsPath: path.resolve('electron/extensions/taskweaver-permissions.ts'),
    projectTrusted: false,
  })
  await untrusted.resourceLoader.reload()
  assert.equal(untrusted.settingsManager.isProjectTrusted(), false)
  assert.equal(untrusted.resourceLoader.getExtensions().extensions.some((item) => item.path === projectExtension), false)

  const trusted = createTaskWeaverResourceLoader({
    cwd: workspace,
    agentDir: appData,
    builtInSkillsPath: path.resolve('electron/skills'),
    builtInExtensionsPath: path.resolve('electron/extensions/taskweaver-permissions.ts'),
    projectTrusted: true,
  })
  await trusted.resourceLoader.reload()
  assert.equal(trusted.settingsManager.isProjectTrusted(), true)
  assert.equal(trusted.resourceLoader.getExtensions().extensions.some((item) => item.path === projectExtension), true)

  console.log('workspace trust checks passed: unknown defaults untrusted, persistence, project resource isolation')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
