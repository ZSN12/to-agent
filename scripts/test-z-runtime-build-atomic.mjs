import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-z-runtime-build-atomic-test-'))
const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-z-runtime-build-atomic-'))
const fakeBin = path.join(tempRoot, 'bin')
const fakePnpm = path.join(fakeBin, 'pnpm')
const marker = path.join(outputDir, 'last-known-good.txt')

try {
  await fs.mkdir(fakeBin, { recursive: true })
  await fs.writeFile(marker, 'preserve this deploy if pnpm deploy fails\n')
  await fs.writeFile(fakePnpm, '#!/bin/sh\nprintf "%s\\n" "$*"\nexit 37\n')
  await fs.chmod(fakePnpm, 0o755)

  const result = spawnSync(process.execPath, [path.join(root, 'scripts/build-host-runtime.mjs'), '--skip-build'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      TASKWEAVER_Z_RUNTIME_OUTPUT_DIR: outputDir,
    },
  })

  assert.equal(result.status, 1, 'a failed deploy command must fail the build')
  assert.match(`${result.stdout}\n${result.stderr}`, /pnpm deploy →/,
    'the fake pnpm must fail at the deploy stage, not an earlier build step')
  assert.match(`${result.stdout}\n${result.stderr}`, /--filter @z\/dsh deploy/)
  assert.equal(await fs.readFile(marker, 'utf8'), 'preserve this deploy if pnpm deploy fails\n',
    'a failed deploy must leave the previous output untouched')

  const siblings = await fs.readdir(path.dirname(outputDir))
  const stagePrefix = `taskweaver-z-runtime-build-${path.basename(outputDir)}-`
  assert.equal(siblings.some((name) => name.startsWith(stagePrefix)), false,
    'failed deployment staging must be cleaned up')

  const runtimeStagingDir = path.join(root, 'vendor', `taskweaver-z-runtime-build-validation-${process.pid}`)
  const upgrade = spawnSync(process.execPath, [path.join(root, 'scripts/upgrade-vendor-pi-ai.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, TASKWEAVER_Z_RUNTIME: runtimeStagingDir },
  })
  assert.equal(upgrade.status, 1)
  assert.match(`${upgrade.stdout}\n${upgrade.stderr}`, /缺少 runtime deploy/,
    'pi-ai sync must accept the dedicated staging directory under vendor')
  assert.doesNotMatch(`${upgrade.stdout}\n${upgrade.stderr}`, /must be a dedicated/,
    'the staging-path validator must accept the build location without touching it')
  console.log('Z Runtime deploy failure preserves the previous output and cleans staging')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
  await fs.rm(outputDir, { recursive: true, force: true })
}
