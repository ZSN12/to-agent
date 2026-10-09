import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertTaskWeaverPresetDeployMatches,
  inspectTaskWeaverPresetDeploy,
  TASKWEAVER_RUNTIME_AGENT_PRESETS,
} from '../electron/agent/z-host/preset-integrity.mjs'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-preset-integrity-'))
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(tempRoot, 'source')
const deployedRoot = path.join(tempRoot, 'deployed')

try {
  for (const id of TASKWEAVER_RUNTIME_AGENT_PRESETS) {
    const contents = `preset: ${id}\n`
    for (const root of [sourceRoot, deployedRoot]) {
      const dir = path.join(root, id)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'agent.cordis.yml'), contents)
    }
  }

  const matching = await assertTaskWeaverPresetDeployMatches(sourceRoot, deployedRoot)
  assert.equal(matching.status, 'verified')
  assert.equal(matching.presets.length, 3)

  const repositoryPresets = await assertTaskWeaverPresetDeployMatches(
    path.join(projectRoot, 'vendor', 'z-runtime', 'apps', 'cli', 'config', 'agent-presets'),
    path.join(projectRoot, 'vendor', 'taskweaver-z-runtime', 'config', 'agent-presets'),
  )
  assert.equal(repositoryPresets.status, 'verified', 'checked-in runtime deploy must contain the current TaskWeaver presets')

  await fs.writeFile(path.join(deployedRoot, 'taskweaver-readonly', 'agent.cordis.yml'), 'stale preset\n')
  const drift = await inspectTaskWeaverPresetDeploy(sourceRoot, deployedRoot)
  assert.equal(drift.status, 'failed')
  assert.equal(drift.presets.find((preset) => preset.id === 'taskweaver-readonly')?.status, 'mismatch')
  await assert.rejects(assertTaskWeaverPresetDeployMatches(sourceRoot, deployedRoot), /taskweaver-readonly:mismatch/)

  await fs.rm(path.join(deployedRoot, 'taskweaver-planner'), { recursive: true })
  const missing = await inspectTaskWeaverPresetDeploy(sourceRoot, deployedRoot)
  assert.equal(missing.presets.find((preset) => preset.id === 'taskweaver-planner')?.status, 'missing-deployed')

  console.log('TaskWeaver runtime preset integrity checks passed (repository deploy, match, stale, missing deploy)')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
