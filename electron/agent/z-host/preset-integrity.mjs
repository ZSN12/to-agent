import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const TASKWEAVER_RUNTIME_AGENT_PRESETS = Object.freeze([
  'taskweaver-readonly',
  'taskweaver-code',
  'taskweaver-planner',
])

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function readPreset(root, id) {
  const filePath = path.join(root, id, 'agent.cordis.yml')
  try {
    const bytes = await fs.readFile(filePath)
    return { hash: digest(bytes), bytes }
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

/** Compare TaskWeaver-owned preset files in the runtime deploy with their source. */
export async function inspectTaskWeaverPresetDeploy(sourceRoot, deployedRoot) {
  const presets = await Promise.all(TASKWEAVER_RUNTIME_AGENT_PRESETS.map(async (id) => {
    const [source, deployed] = await Promise.all([
      readPreset(sourceRoot, id),
      readPreset(deployedRoot, id),
    ])
    const status = !source ? 'missing-source'
      : !deployed ? 'missing-deployed'
        : source.hash !== deployed.hash ? 'mismatch' : 'verified'
    return {
      id,
      status,
      sourceSha256: source?.hash ?? null,
      deployedSha256: deployed?.hash ?? null,
    }
  }))
  return {
    status: presets.every((preset) => preset.status === 'verified') ? 'verified' : 'failed',
    presets,
  }
}

export async function assertTaskWeaverPresetDeployMatches(sourceRoot, deployedRoot) {
  const result = await inspectTaskWeaverPresetDeploy(sourceRoot, deployedRoot)
  if (result.status !== 'verified') {
    const drift = result.presets.filter((preset) => preset.status !== 'verified')
      .map((preset) => `${preset.id}:${preset.status}`)
      .join(', ')
    throw new Error(`TaskWeaver agent preset deploy does not match source (${drift})`)
  }
  return result
}
