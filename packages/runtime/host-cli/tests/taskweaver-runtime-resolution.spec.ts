import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveTaskWeaverBareModuleBaseUrl } from '../src/profile-boot.ts'

describe('resolveTaskWeaverBareModuleBaseUrl', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('anchors source-workspace plugin imports at the host-cli importer', () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), 'taskweaver-host-runtime-'))
    const hostRoot = join(runtimeRoot, 'host-cli')
    const packageDir = join(hostRoot, 'node_modules', '@taskweaver', 'fixture-plugin')
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      name: '@taskweaver/fixture-plugin',
      type: 'module',
      exports: './index.mjs',
    }))
    writeFileSync(join(packageDir, 'index.mjs'), 'export default true\n')
    vi.stubEnv('TASKWEAVER_EMBEDDED', '1')

    try {
      const baseUrl = resolveTaskWeaverBareModuleBaseUrl(runtimeRoot)

      expect(baseUrl).toBe(`${pathToFileURL(hostRoot).href}/`)
      expect(createRequire(baseUrl!).resolve('@taskweaver/fixture-plugin')).toBe(realpathSync(join(packageDir, 'index.mjs')))
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true })
    }
  })

  it('keeps deployed runtime-packages as the resolution anchor', () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), 'taskweaver-deployed-runtime-'))
    mkdirSync(join(runtimeRoot, 'runtime-packages', '@taskweaver'), { recursive: true })
    vi.stubEnv('TASKWEAVER_EMBEDDED', '1')

    try {
      expect(resolveTaskWeaverBareModuleBaseUrl(runtimeRoot)).toBe(`${pathToFileURL(runtimeRoot).href}/`)
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true })
    }
  })
})
