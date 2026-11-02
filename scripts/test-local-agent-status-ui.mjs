import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { transform } from 'esbuild'

const source = await fs.readFile(new URL('../src/features/models/LocalAgentStatusStrip.tsx', import.meta.url), 'utf8')

assert.match(source, /!agent\.loggedIn && loginKindForAgent\(agent\)\) return '需授权 TaskWeaver'/, 'an undiscovered Antigravity provider still explains that its bridge needs authorization')
assert.match(source, /loginKind && !agent\.loggedIn && \(/, 'the authorization action appears before any provider models have been discovered')
assert.match(source, /loginBusy \? '正在打开[^']*' : '(?:网页登录|授权)'/, 'the visible action accurately describes the authorization flow')
assert.doesNotMatch(source, /Antigravity 客户端的登录状态不会自动共享/, 'the status header does not show the native-app login explanation')

// Execute the production probe callback with deterministic hooks and an offline
// IPC stub, checking the props rendered after both success and failure.
const panelSource = await fs.readFile(new URL('../src/features/models/ModelSettingsPanel.tsx', import.meta.url), 'utf8')
const { code } = await transform(panelSource, { loader: 'tsx', format: 'cjs', jsx: 'automatic' })

async function exerciseProbe(probeProviderModels) {
  const states = []
  let cursor = 0
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], (update) => {
        states[index] = typeof update === 'function' ? update(states[index]) : update
      }]
    },
    useCallback: (callback) => callback,
    useMemo: (compute) => compute(),
    useEffect() {},
    useRef: (current) => ({ current }),
  }
  const components = new Map()
  const component = (name) => {
    if (!components.has(name)) components.set(name, function ComponentStub() {})
    return components.get(name)
  }
  const jsx = (type, props) => ({ type, props })
  const module = { exports: {} }
  const requireStub = (id) => {
    if (id === 'react') return hooks
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    return new Proxy({}, { get: (_, name) => {
      if (name === 'buildModelSourceGroups') return () => [{
        id: 'custom-test', name: 'Offline test', kind: 'custom', configured: true, models: [],
      }]
      if (name === 'useLocalAgentBridgeStatus') return () => ({ status: null, loading: false })
      return component(name)
    } })
  }
  vm.runInNewContext(code, {
    module, exports: module.exports, require: requireStub,
    window: { taskweaver: { models: { probeProviderModels } } },
  })
  const render = () => {
    cursor = 0
    return module.exports.ModelSettingsPanel({
      auth: [], models: [], candidateModels: [], loading: false, bridgeReady: true, error: null,
    })
  }
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = find(child, predicate)
      if (found) return found
    }
    return null
  }
  const modal = () => find(render(), (node) => node.type === component('ProbeModelsModal')).props
  const button = find(render(), (node) => node.props?.title === '在线向该提供商探测最新开放的可用模型')
  button.props.onClick()
  assert.equal(modal().loading, true, 'a pending probe must show the loading state')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(modal().loading, false, 'a settled probe must expose its result or error')
  return modal()
}

const probeResult = { models: [{ id: 'test-model' }], total: 1, newCount: 1 }
const successfulProbe = await exerciseProbe(async () => ({ ok: true, data: probeResult }))
assert.equal(successfulProbe.result, probeResult)
assert.equal(successfulProbe.error, null)
const failedProbe = await exerciseProbe(async () => ({ ok: false, error: 'offline rejection' }))
assert.equal(failedProbe.error, 'offline rejection')
assert.equal(failedProbe.result, null)
const thrownProbe = await exerciseProbe(async () => { throw new Error('offline exception') })
assert.equal(thrownProbe.error, 'offline exception')

console.log('Local Agent status UI checks passed: missing bridge authorization is actionable without the removed header explanation.')
