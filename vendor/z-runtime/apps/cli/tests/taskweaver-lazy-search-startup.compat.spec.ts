/** Node 22 startup smoke for the shipped TaskWeaver profile. */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const builtBin = join(repoRoot, 'apps/cli/lib/bin.js')
const baseConfigPath = join(repoRoot, 'packages/bundle/base/cordis.patch.yml')
const taskweaverConfigPath = join(repoRoot, 'packages/bundle/taskweaver/cordis.patch.yml')
const requireBuiltArtifacts = process.env.DSH_REQUIRE_BUILT_CLI_SMOKE === '1'

interface ConfigRow {
  id?: string
  disabled?: unknown
  config?: { openAt?: unknown }
}

interface PatchEntry extends ConfigRow {
  insert?: ConfigRow[]
}

const jsExprType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: value => String(value),
})
const configSchema = yaml.JSON_SCHEMA.extend(jsExprType)

/** Boot the built TaskWeaver profile, wait for its API listener, then dispose through SIGTERM. */
function runBuiltTaskWeaver(cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolveRun, rejectRun) => {
    const home = join(cwd, '.taskweaver')
    const env: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: home }
    delete env.NODE_OPTIONS
    delete env.NODE_NO_WARNINGS
    const child = spawn(process.execPath, [
      builtBin,
      '--profile', 'taskweaver',
      '--host', '127.0.0.1',
      '--port', '0',
      '--no-open',
    ], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (!settled && /http:\/\/127\.0\.0\.1:\d+/u.test(stdout)) {
        settled = true
        child.kill('SIGTERM')
      }
    })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      rejectRun(new Error(`built TaskWeaver CLI did not settle and dispose within 60s\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    }, 60_000)
    child.on('error', (error) => {
      clearTimeout(timer)
      rejectRun(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (!settled) {
        rejectRun(new Error(`built TaskWeaver CLI exited before settled startup (code ${String(code)})\nstdout:\n${stdout}\nstderr:\n${stderr}`))
        return
      }
      resolveRun({ stdout, stderr, code: code ?? -1 })
    })
  })
}

describe.skipIf(!requireBuiltArtifacts)('built TaskWeaver lazy-search startup', () => {
  it('boots without opening the persistent search index before a search request', async () => {
    expect(existsSync(builtBin), `missing built CLI ${resolve(builtBin)}; run pnpm build`).toBe(true)
    const baseRows = (yaml.load(await readFile(baseConfigPath, 'utf8'), { schema: configSchema }) as PatchEntry[])
      .flatMap(entry => entry.insert ?? [entry])
    const taskweaverRows = (yaml.load(await readFile(taskweaverConfigPath, 'utf8'), { schema: configSchema }) as PatchEntry[])
      .flatMap(entry => entry.insert ?? [entry])
    const baseRow = baseRows.find(row => row.id === 'session-query-sqlite')
    const taskweaverRow = taskweaverRows.find(row => row.id === 'session-query-sqlite')
    expect(baseRow?.config?.openAt).toBe('never')
    expect(baseRow?.disabled).toBeUndefined()
    expect(taskweaverRow?.config?.openAt).toBe('first-search')
    expect(taskweaverRow?.disabled).toBeUndefined()

    const cwd = await mkdtemp(join(tmpdir(), 'taskweaver-cli-lazy-search-'))
    const profileDir = join(cwd, '.taskweaver', 'profiles', 'taskweaver')
    try {
      await mkdir(profileDir, { recursive: true })
      await writeFile(join(profileDir, 'package.json'), JSON.stringify({
        name: 'taskweaver-profile',
        private: true,
        dependencies: {
          '@z/dsh-base': 'workspace:^',
          '@z/dsh-taskweaver': 'workspace:^',
        },
        dsh: { profile: { bundles: ['@z/dsh-base', '@z/dsh-taskweaver'] } },
      }))
      await writeFile(join(profileDir, 'cordis.patch.yml'), '[]\n')
      const result = await runBuiltTaskWeaver(cwd)
      expect(result.stdout).toMatch(/http:\/\/127\.0\.0\.1:\d+/u)
      expect(result.code).toBe(0)
      expect(result.stderr).not.toMatch(/ExperimentalWarning: SQLite/u)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  }, 70_000)
})
