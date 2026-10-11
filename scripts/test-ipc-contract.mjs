#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC_CHANNELS, PRELOAD_EVENTS, PRELOAD_LOCAL_METHODS } from '../contract/channels.mjs'
import { collectIpcContractIssues } from './check-ipc-contract.mjs'
import { parseShellBridgeApi, scanRegisteredHandlers } from './ipc-contract-utils.mjs'
import { checkGeneratedIpcTypes } from './gen-ipc-types.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bridgeSource = fs.readFileSync(path.join(root, 'src/shell/taskweaver-shell-bridge.generated.ts'), 'utf8')
const bridgeTypeSource = fs.readFileSync(path.join(root, 'src/shared/ipc-bridge.generated.d.ts'), 'utf8')
const bridge = parseShellBridgeApi(bridgeSource)
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskweaver-ipc-contract-'))

try {
  for (const entry of IPC_CHANNELS) {
    assert.equal(bridge.invokeMethods.get(entry.name), entry.bridgePath, `${entry.name} must map to ${entry.bridgePath}`)
    assert(bridge.bridgeMethods.has(entry.bridgePath), `${entry.bridgePath} must be exposed by the Shell bridge`)
  }

  for (const entry of PRELOAD_EVENTS) {
    assert.equal(bridge.eventMethods.get(entry.event), entry.bridgePath, `${entry.event} must map to ${entry.bridgePath}`)
    assert(bridge.bridgeMethods.has(entry.bridgePath), `${entry.bridgePath} event subscription must be exposed`)
  }

  for (const entry of PRELOAD_LOCAL_METHODS) {
    assert(bridge.bridgeMethods.has(entry.bridgePath), `${entry.bridgePath} local bridge method must be exposed`)
    assert(bridge.exposedPaths.has(entry.bridgePath), `${entry.bridgePath} must be a public Shell API path`)
  }

  assert.match(bridgeSource, /\/shell\/v1\/invoke/, 'Shell API calls must use the HTTP bridge')
  assert.match(bridgeSource, /\/shell\/v1\/events/, 'Shell events must use the server-sent event bridge')
  assert.doesNotMatch(bridgeSource, /electron|ipcRenderer|contextBridge/i, 'the Swift Shell bridge must not depend on Electron preload APIs')
  assert.match(bridgeTypeSource, /import\('\.\/app-api'\)/, 'generated bridge types must resolve the shared API module')
  assert.match(bridgeTypeSource, /import\('\.\/model-api'\)/, 'generated bridge types must resolve the shared model API module')
  assert.doesNotMatch(bridgeTypeSource, /import\('\.\/types\//, 'renderer bridge types must not point at a nonexistent src/shared/types directory')

  const removed = IPC_CHANNELS[0]
  const registrations = IPC_CHANNELS
    .filter((entry) => entry.name !== removed.name)
    .map((entry) => `ipcHandle(ipcMain, '${entry.name}', () => undefined)`)
  const registrationFile = path.join(tempRoot, 'register-ipc.mjs')
  fs.writeFileSync(registrationFile, registrations.join('\n'))
  const handlers = scanRegisteredHandlers(tempRoot, tempRoot)
  const removedIssues = collectIpcContractIssues({
    handlers,
    invokeMethods: bridge.invokeMethods,
    exposedPaths: bridge.exposedPaths,
    rendererPaths: new Map(),
    generatedTypesFresh: true,
  })
  assert(removedIssues.some((issue) => issue.startsWith(`${removed.name}: table entry has no ipcHandle registration`)))

  const missingBridgeMethods = new Map(bridge.bridgeMethods)
  missingBridgeMethods.delete(removed.bridgePath)
  const bridgeIssues = collectIpcContractIssues({
    bridgeMethods: missingBridgeMethods,
    rendererPaths: new Map(),
    generatedTypesFresh: true,
  })
  assert(bridgeIssues.some((issue) => issue.startsWith(`${removed.name}: bridgePath ${removed.bridgePath} is not a generated shell bridge method`)))

  const mismatchedTypes = IPC_CHANNELS.map((entry) => entry.name === removed.name
    ? { ...entry, resultSchema: { ...entry.resultSchema, reference: 'Promise<void>' } }
    : entry)
  const typeIssues = collectIpcContractIssues({
    channels: mismatchedTypes,
    rendererPaths: new Map(),
    generatedTypesFresh: true,
  })
  assert(typeIssues.some((issue) => issue.startsWith(`${removed.name}: argsSchema and resultSchema must reference the same API method`)))

  const rendererIssues = collectIpcContractIssues({
    rendererPaths: new Map([['chat.missingMethod', 1]]),
    generatedTypesFresh: true,
  })
  assert(rendererIssues.some((issue) => issue.includes('chat.missingMethod')))
  assert.equal(checkGeneratedIpcTypes(), true, 'generated IPC types must be current')

  console.log(`test-ipc-contract: ok (${IPC_CHANNELS.length} invoke channels, ${PRELOAD_EVENTS.length} events, ${PRELOAD_LOCAL_METHODS.length} local methods; handler, Shell bridge, type-reference, and renderer checks passed)`)
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
