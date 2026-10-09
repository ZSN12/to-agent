#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { IPC_CHANNELS, PRELOAD_EVENTS, PRELOAD_LOCAL_METHODS } from '../electron/ipc/channels.mjs'
import { collectIpcContractIssues } from './check-ipc-contract.mjs'
import { parsePreloadApi, scanRegisteredHandlers } from './ipc-contract-utils.mjs'
import { checkGeneratedIpcTypes } from './gen-ipc-types.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const preloadSource = fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8')
const preload = parsePreloadApi(preloadSource, 'electron/preload.cjs')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskweaver-ipc-contract-'))

function loadPreload(devtools = false) {
  const calls = []
  const subscriptions = new Map()
  const removedListeners = []
  const ipcRenderer = {
    invoke(channel, ...args) {
      calls.push({ channel, args })
      return undefined
    },
    on(channel, handler) {
      subscriptions.set(channel, handler)
    },
    removeListener(channel, handler) {
      removedListeners.push(channel)
      if (subscriptions.get(channel) === handler) subscriptions.delete(channel)
    },
  }
  let exposedName
  let exposedApi
  vm.runInNewContext(preloadSource, {
    process: { env: { TASKWEAVER_DEVTOOLS: devtools ? '1' : '' } },
    require(moduleName) {
      assert.equal(moduleName, 'electron')
      return {
        contextBridge: {
          exposeInMainWorld(name, api) {
            exposedName = name
            exposedApi = api
          },
        },
        ipcRenderer,
        webUtils: { getPathForFile: () => 'dropped:path' },
      }
    },
  }, { filename: 'electron/preload.cjs' })
  assert.equal(exposedName, 'taskweaver')
  return { api: exposedApi, calls, ipcRenderer, subscriptions, removedListeners }
}

try {
  const runtime = loadPreload()
  const devtoolsRuntime = loadPreload(true)
  for (const entry of IPC_CHANNELS) {
    const method = entry.bridgePath.split('.').reduce((value, segment) => value?.[segment], devtoolsRuntime.api)
    assert.equal(typeof method, 'function', `${entry.bridgePath} must be a public preload function`)
    method(...Array.from({ length: method.length }, (_, index) => `argument-${index}`))
  }
  assert.deepEqual(devtoolsRuntime.calls.map(({ channel }) => channel), IPC_CHANNELS.map(({ name }) => name))
  assert.equal(runtime.api.debug, undefined, 'debug APIs must stay hidden unless explicitly enabled')
  assert.equal(typeof devtoolsRuntime.api.debug.shadowTranscript, 'function')

  for (const entry of PRELOAD_EVENTS) {
    const subscribe = entry.bridgePath.split('.').reduce((value, segment) => value?.[segment], runtime.api)
    assert.equal(typeof subscribe, 'function', `${entry.bridgePath} event subscription must be exposed`)
    let received
    const unsubscribe = subscribe((payload) => { received = payload })
    const payload = { channel: entry.event }
    runtime.subscriptions.get(entry.event)(undefined, payload)
    assert.equal(received, payload)
    unsubscribe()
    assert(runtime.removedListeners.includes(entry.event), `${entry.event} listener must be removable`)
  }

  for (const entry of PRELOAD_LOCAL_METHODS) {
    const method = entry.bridgePath.split('.').reduce((value, segment) => value?.[segment], runtime.api)
    assert.equal(method({ name: 'drop.txt' }), 'dropped:path')
  }

  assert.equal(runtime.api.ipcRenderer, undefined, 'raw ipcRenderer must not cross the contextBridge')

  const removed = IPC_CHANNELS[0]
  const registrations = IPC_CHANNELS
    .filter((entry) => entry.name !== removed.name)
    .map((entry) => `ipcHandle(ipcMain, '${entry.name}', () => undefined)`)
  const registrationFile = path.join(tempRoot, 'register-ipc.mjs')
  fs.writeFileSync(registrationFile, registrations.join('\n'))
  const handlers = scanRegisteredHandlers(tempRoot, tempRoot)
  const removedIssues = collectIpcContractIssues({
    handlers,
    invokeMethods: preload.invokeMethods,
    exposedPaths: preload.exposedPaths,
    rendererPaths: new Map(),
    generatedTypesFresh: true,
  })
  assert(removedIssues.some((issue) => issue.startsWith(`${removed.name}: table entry has no ipcHandle registration`)))

  const missingBridgeMethods = new Map(preload.bridgeMethods)
  missingBridgeMethods.delete(removed.bridgePath)
  const bridgeIssues = collectIpcContractIssues({
    bridgeMethods: missingBridgeMethods,
    rendererPaths: new Map(),
    generatedTypesFresh: true,
    generatedPreloadFresh: true,
  })
  assert(bridgeIssues.some((issue) => issue.startsWith(`${removed.name}: bridgePath ${removed.bridgePath} is not a generated preload method`)))

  const mismatchedTypes = IPC_CHANNELS.map((entry) => entry.name === removed.name
    ? { ...entry, resultSchema: { ...entry.resultSchema, reference: 'Promise<void>' } }
    : entry)
  const typeIssues = collectIpcContractIssues({
    channels: mismatchedTypes,
    rendererPaths: new Map(),
    generatedTypesFresh: true,
    generatedPreloadFresh: true,
  })
  assert(typeIssues.some((issue) => issue.startsWith(`${removed.name}: argsSchema and resultSchema must reference the same API method`)))

  const rendererIssues = collectIpcContractIssues({
    rendererPaths: new Map([['chat.missingMethod', 1]]),
    generatedTypesFresh: true,
  })
  assert(rendererIssues.some((issue) => issue.includes('chat.missingMethod')))
  assert.equal(checkGeneratedIpcTypes(), true, 'generated IPC types must be current')

  console.log(`test-ipc-contract: ok (${IPC_CHANNELS.length} entries; handler, bridgePath, type-reference, and renderer checks passed)`)
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
