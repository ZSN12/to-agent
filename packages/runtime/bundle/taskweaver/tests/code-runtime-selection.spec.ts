import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadOverlayPatches } from '../../../boot/app-boot/src/index.ts'

const PATCH_FILE = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))

function selector(): (processLike: { env: Record<string, string | undefined> }) => string {
  const patches = loadOverlayPatches('taskweaver-test', PATCH_FILE)
  const inserted = patches.flatMap(patch => patch.insert ?? [])
  const row = inserted.find(entry => entry.id === 'code-runtime')
  if (row === undefined || typeof row.name !== 'object' || row.name === null || !('__jsExpr' in row.name)) {
    throw new Error('TaskWeaver code-runtime row must choose its provider through one JS expression')
  }
  const expression = (row.name as { __jsExpr: string }).__jsExpr
  return new Function('process', `return (${expression})`) as ReturnType<typeof selector>
}

describe('TaskWeaver code-runtime language selection', () => {
  it('defaults to TypeScript and selects Python only when explicitly requested', () => {
    const select = selector()
    expect(select({ env: {} })).toBe('@taskweaver/dsh-code-runtime-worker-thread')
    expect(select({ env: { TASKWEAVER_CODE_LANGUAGE: 'typescript' } })).toBe('@taskweaver/dsh-code-runtime-worker-thread')
    expect(select({ env: { TASKWEAVER_CODE_LANGUAGE: 'python' } })).toBe('@taskweaver/dsh-code-runtime-python')
    expect(() => select({ env: { TASKWEAVER_CODE_LANGUAGE: 'ruby' } })).toThrow('TASKWEAVER_CODE_LANGUAGE must be typescript or python')
  })
})
