import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const presetRoots = [
  path.join(projectRoot, 'packages', 'runtime', 'apps', 'cli', 'config', 'agent-presets'),
  path.join(projectRoot, 'vendor', 'taskweaver-z-runtime', 'config', 'agent-presets'),
]

/** Same rules as @z/dsh-agent-presets discovery `entryListProblem`. */
function entryListProblem(rows, at = '') {
  if (!Array.isArray(rows)) {
    return at === ''
      ? 'the composition must be a top-level list of plugin rows'
      : `group ${at} must hold a list of plugin rows`
  }
  for (const [index, row] of rows.entries()) {
    const label = at === '' ? `row ${String(index + 1)}` : `${at} row ${String(index + 1)}`
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return `${label} is not a plugin row (expected a map with a "name")`
    }
    const { name, group, config } = row
    if (typeof name !== 'string' || name === '') {
      return `${label} names no plugin (a "name" string is required)`
    }
    if (group === true) {
      const nested = entryListProblem(config, label)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

const requireFromRuntime = createRequire(
  path.join(projectRoot, 'vendor', 'taskweaver-z-runtime', 'runtime-packages', '@z', 'dsh-agent-presets', 'package.json'),
)

async function loadPresetRows(filePath) {
  const yaml = requireFromRuntime('js-yaml')
  const { entryListSchema } = requireFromRuntime('@z/cordis-plugin-include')
  const content = await fs.readFile(filePath, 'utf8')
  return yaml.load(content, { schema: entryListSchema })
}

async function scanPresetRoot(root, { requireWebSearch = false } = {}) {
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const filePath = path.join(root, entry.name, 'agent.cordis.yml')
    try {
      await fs.access(filePath)
    } catch {
      continue
    }
    const rows = await loadPresetRows(filePath)
    const problem = entryListProblem(rows)
    assert.equal(problem, undefined, `${path.relative(projectRoot, filePath)}: ${problem}`)
    if (requireWebSearch && ['standard', 'code', 'taskweaver-code', 'taskweaver-readonly'].includes(entry.name)) {
      const webTool = rows.find((row) => row.id === 'tool-web')
      assert.equal(webTool?.name, '@z/dsh-tool-web', `${path.relative(projectRoot, filePath)} must expose the model-facing web_search tool`)
      assert.notEqual(webTool?.disabled, true, `${path.relative(projectRoot, filePath)} must not disable web_search`)
    }
    if (['standard', 'taskweaver-code', 'taskweaver-readonly', 'taskweaver-planner', 'taskweaver-pi-lite'].includes(entry.name)) {
      const instructions = rows.find((row) => row.name === '@z/dsh-agent-instructions')
      assert.ok(instructions, `${path.relative(projectRoot, filePath)} must mount agent-instructions`)
      assert.deepEqual(
        instructions.config?.instructionFileCandidates,
        ['TASKWEAVER.md', 'AGENTS.md', 'CLAUDE.md', '.cursorrules'],
        `${path.relative(projectRoot, filePath)} must share the configured root instruction candidates`,
      )
    }
  }
}

for (const [index, root] of presetRoots.entries()) {
  await scanPresetRoot(root, { requireWebSearch: index === 0 })
}

console.log('agent preset composition checks passed (source + deployed)')
