import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadOverlayPatches } from '../../../boot/app-boot/src/index.ts'

const BUNDLE_PATCH = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
const BUNDLE_PACKAGE = fileURLToPath(new URL('../package.json', import.meta.url))
const HOST_README = fileURLToPath(new URL('../../../host-cli/README.zh.md', import.meta.url))
const DEFAULT_PRESET = fileURLToPath(new URL('../../../host-cli/config/agent-presets/tw-default/agent.cordis.yml', import.meta.url))
const CODE_PRESET = fileURLToPath(new URL('../../../host-cli/config/agent-presets/tw-code/agent.cordis.yml', import.meta.url))

function insertedRows(filePath: string): Array<Record<string, unknown>> {
  return loadOverlayPatches('taskweaver-lsp-wiring-test', filePath)
    .flatMap(patch => patch.insert ?? (patch.id ? [patch] : [])) as Array<Record<string, unknown>>
}

describe('TaskWeaver LSP host wiring', () => {
  it('mounts the shared registry and keeps executable-backed providers opt-in', () => {
    const rows = insertedRows(BUNDLE_PATCH)
    expect(rows.find(row => row.id === 'lsp')).toMatchObject({
      name: '@taskweaver/dsh-lsp',
    })
    expect(rows.find(row => row.id === 'lsp-stdio')).toMatchObject({
      name: '@taskweaver/dsh-lsp-stdio',
      disabled: true,
    })
    expect(rows.find(row => row.id === 'lsp-stdio')).not.toHaveProperty('config')
  })

  it('includes provider packages in the production bundle and documents the trusted Host entry point', () => {
    const pkg = JSON.parse(readFileSync(BUNDLE_PACKAGE, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const readme = readFileSync(HOST_README, 'utf8')
    expect(pkg.dependencies?.['@taskweaver/dsh-lsp']).toBe('workspace:^')
    expect(pkg.dependencies?.['@taskweaver/dsh-lsp-stdio']).toBe('workspace:^')
    expect(readme).toContain('$TASKWEAVER_HOME/profiles/<profile>/cordis.patch.yml')
    expect(readme).toContain('command: /absolute/path/to/typescript-language-server')
    expect(readme).toContain('Do not derive executable names or arguments from workspace files')
  })

  it.each([
    ['tw-default', DEFAULT_PRESET],
    ['tw-code', CODE_PRESET],
  ])('registers the model-facing lsp tool in %s', (_name, filePath) => {
    const rows = insertedRows(filePath)
    expect(rows.find(row => row.id === 'tool-lsp')).toMatchObject({
      name: '@taskweaver/dsh-tool-lsp',
    })
  })

  it('includes the model-facing tool in the production bundle', () => {
    const pkg = JSON.parse(readFileSync(BUNDLE_PACKAGE, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(pkg.dependencies?.['@taskweaver/dsh-tool-lsp']).toBe('workspace:^')
  })
})
