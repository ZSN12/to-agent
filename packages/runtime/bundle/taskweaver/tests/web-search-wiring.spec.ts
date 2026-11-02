import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadOverlayPatches } from '../../../boot/app-boot/src/index.ts'

const BASE_PATCH = fileURLToPath(new URL('../../base/cordis.patch.yml', import.meta.url))
const DEFAULT_PRESET = fileURLToPath(new URL('../../../host-cli/config/agent-presets/tw-default/agent.cordis.yml', import.meta.url))
const CODE_PRESET = fileURLToPath(new URL('../../../host-cli/config/agent-presets/tw-code/agent.cordis.yml', import.meta.url))

function insertedRows(filePath: string): Array<Record<string, unknown>> {
  return loadOverlayPatches('taskweaver-web-search-test', filePath)
    .flatMap(patch => patch.insert ?? (patch.id ? [patch] : [])) as Array<Record<string, unknown>>
}

describe('TaskWeaver web-search wiring', () => {
  it('keeps the Host provider active without publishing web_search globally', () => {
    const rows = insertedRows(BASE_PATCH)
    const hostWeb = rows.find(row => row.id === 'web')
    const provider = rows.find(row => row.id === 'web-search-taskweaver')
    const tool = rows.find(row => row.id === 'tool-web')

    expect(hostWeb?.name).toBe('@taskweaver/dsh-web')
    expect(provider?.name).toBe('@taskweaver/dsh-web-search-taskweaver')
    expect((provider?.config as Record<string, unknown>)?.configPathEnv).toBe('TASKWEAVER_WEB_SEARCH_CONFIG_PATH')
    expect(tool).toBeUndefined()
    for (const row of [hostWeb, provider]) expect(row?.disabled).not.toBe(true)
  })

  it.each([
    ['tw-default', DEFAULT_PRESET],
    ['tw-code', CODE_PRESET],
  ])('exposes web_search for %s without storing a provider key in the preset', (_name, filePath) => {
    const webTool = insertedRows(filePath).find(row => row.id === 'tool-web')
    expect(webTool?.name).toBe('@taskweaver/dsh-tool-web')
    expect(webTool?.disabled).not.toBe(true)
    expect(JSON.stringify(webTool)).not.toMatch(/apiKey|API_KEY|secret/i)
  })
})
