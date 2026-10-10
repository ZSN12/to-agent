import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apply,
  BACKEND_PACKAGE,
  inject,
  name,
  SURFACE_PACKAGE,
} from '../lib/index.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function makeContext() {
  const entries: Record<string, { name: string }> = {}
  const created: string[] = []
  let dispose: (() => Promise<void>) | undefined
  let nextId = 0
  const ctx = {
    loader: {
      store: entries,
      async create({ name: entryName }: { name: string }) {
        const id = `entry-${nextId++}`
        entries[id] = { name: entryName }
        created.push(entryName)
        return id
      },
      async remove(id: string) {
        delete entries[id]
      },
    },
    async effect(effect: () => Promise<() => Promise<void>>) {
      dispose = await effect()
    },
  }
  return { ctx, created, entries, dispose: () => dispose?.() }
}

describe('checked-in directory picker runtime output', () => {
  beforeEach(() => {
    vi.stubEnv('TASKWEAVER_EMBEDDED', '')
    vi.stubEnv('Z_TASKWEAVER_EMBEDDED', '')
    vi.stubEnv('DSH_TASKWEAVER_EMBEDDED', '')
  })

  it('keeps the runtime entry and declarations aligned with native-only source', async () => {
    const [source, runtime, declarations] = await Promise.all([
      readFile(join(packageRoot, 'src/index.ts'), 'utf8'),
      readFile(join(packageRoot, 'lib/index.js'), 'utf8'),
      readFile(join(packageRoot, 'lib/types/index.d.ts'), 'utf8'),
    ])

    for (const text of [source, runtime, declarations]) {
      expect(text).toContain('@taskweaver/dsh-host-directory-picker-native')
      expect(text).toContain('@taskweaver/dsh-client-ui-directory-picker-native')
      expect(text).not.toMatch(/directory-picker-browse|resolveDirectoryPickerBackend|hasLinuxChooserBinary|BACKEND_PACKAGES|SURFACE_PACKAGES/)
    }
    expect(runtime).toContain('taskweaverEmbeddedFromEnv()')
    expect(runtime).toContain('const inject = ["loader"]')
    expect(declarations).toContain('export declare const inject: string[]')
    expect(declarations).toContain('export declare function apply(ctx: Context): Promise<void>')
    expect(declarations).not.toMatch(/probe\.ts|resolve\.ts|DirectoryPickerBackendKind/)
  })

  it('mounts only the native Host backend when embedded in Electron', async () => {
    vi.stubEnv('TASKWEAVER_EMBEDDED', '1')
    const harness = makeContext()

    await apply(harness.ctx as unknown as Parameters<typeof apply>[0])

    expect(name).toBe('directory-picker-auto')
    expect(inject).toEqual(['loader'])
    expect(BACKEND_PACKAGE).toBe('@taskweaver/dsh-host-directory-picker-native')
    expect(SURFACE_PACKAGE).toBe('@taskweaver/dsh-client-ui-directory-picker-native')
    expect(harness.created).toEqual([BACKEND_PACKAGE])
    await harness.dispose()
    expect(Object.keys(harness.entries)).toEqual([])
  })

  it('mounts the native Client surface for a non-embedded Host', async () => {
    const harness = makeContext()

    await apply(harness.ctx as unknown as Parameters<typeof apply>[0])

    expect(harness.created).toEqual([BACKEND_PACKAGE, SURFACE_PACKAGE])
    await harness.dispose()
    expect(Object.keys(harness.entries)).toEqual([])
  })
})
