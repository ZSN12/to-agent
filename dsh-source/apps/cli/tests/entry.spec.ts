import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureDeployNodeModules, migrateLegacyTaskWeaverHomePatch } from '../src/deploy-layout.ts'

describe('ensureDeployNodeModules', () => {
  it('links runtime-packages to node_modules when the deploy tree exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-entry-'))
    try {
      mkdirSync(join(root, 'runtime-packages', '@scope', 'pkg'), { recursive: true })
      writeFileSync(join(root, 'runtime-packages', '@scope', 'pkg', 'package.json'), '{}')
      ensureDeployNodeModules(root)
      const link = join(root, 'node_modules')
      expect(existsSync(link)).toBe(true)
      expect(lstatSync(link).isSymbolicLink()).toBe(true)
      expect(readlinkSync(link)).toBe('runtime-packages')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('clears legacy TaskWeaver home authorization overlay when embedded', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-entry-'))
    const prev = process.env.DSH_TASKWEAVER_EMBEDDED
    const prevHome = process.env.DSH_HOME
    try {
      process.env.DSH_TASKWEAVER_EMBEDDED = '1'
      process.env.DSH_HOME = root
      writeFileSync(join(root, 'cordis.patch.yml'), `- insert:
    - id: authorization
      name: '@deepseek-ai/dsh-authorization'
`)
      migrateLegacyTaskWeaverHomePatch()
      expect(readFileSync(join(root, 'cordis.patch.yml'), 'utf8').trim()).toBe('[]')
    } finally {
      process.env.DSH_TASKWEAVER_EMBEDDED = prev
      process.env.DSH_HOME = prevHome
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('is a no-op when runtime-packages is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-entry-'))
    try {
      ensureDeployNodeModules(root)
      expect(existsSync(join(root, 'node_modules'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
