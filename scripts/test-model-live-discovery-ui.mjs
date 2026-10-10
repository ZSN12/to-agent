import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const [panel, modelApi, channelTable, ipcHandler] = await Promise.all([
  fs.readFile(new URL('../src/features/models/ModelSettingsPanel.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/shared/model-api.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../desktop/ipc/channels.mjs', import.meta.url), 'utf8'),
  fs.readFile(new URL('../desktop/backend/ipc/register-models-ipc.mjs', import.meta.url), 'utf8'),
])

const actionStart = panel.indexOf('const handleDiscoverAvailableModels = async () =>')
const actionEnd = panel.indexOf('const handleStartOAuth = async', actionStart)
assert.notEqual(actionStart, -1, 'settings page exposes the explicit model discovery action')
assert.notEqual(actionEnd, -1, 'discovery handler remains a bounded settings action')
const action = panel.slice(actionStart, actionEnd)
assert.match(panel, />\s*(?:\{providerDiscoveryLoading \? '正在获取…' : )?['"]获取可用模型['"]/, 'settings action has the requested label')
assert.match(action, /Promise\.allSettled\(targets\.map/, 'all configured sources settle independently in parallel')
assert.match(action, /model\.source === 'bundled'/, 'pi-ai bundled models are answered from the already-loaded local catalog')
assert.match(action, /window\.taskweaver\?\.models\?\.discoverProviderModels/, 'non-bundled sources use the main-process discovery service')
assert.match(action, /await discover\(\{ providerId: source\.id \}\)/, 'online discovery is requested per provider')
assert.doesNotMatch(action, /batchAddCustomModels|onAddModels\(|onAddModel\(/, 'discovery only displays results and does not save them')
assert.match(panel, /结果仅供查看，没有修改配置/, 'the UI tells users the result is read-only')

assert.match(modelApi, /discoverProviderModels: \(payload: DiscoverProviderModelsPayload\) => Promise<IpcResult<DiscoveredProviderModel\[\]>>/)
assert.match(channelTable, /\["models:discoverProviderModels", "models\.discoverProviderModels"/)
assert.match(ipcHandler, /PROVIDER_DISCOVERY_TIMEOUT_MS = 3_000/)
assert.match(ipcHandler, /signal: controller\.signal/)
assert.match(ipcHandler, /raceWithAbort\(modelService\.discoverProviderModels/)

console.log('Model discovery UI checks passed: explicit read-only action, offline bundled catalog, parallel isolated results, and bounded IPC wiring.')
