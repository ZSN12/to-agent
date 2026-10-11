#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC_CHANNELS, PRELOAD_EVENTS } from '../contract/channels.mjs'
import { checkGeneratedIpcTypes } from './gen-ipc-types.mjs'
import { checkGeneratedShellBridge } from './gen-shell-bridge.mjs'
import { scanRegisteredHandlers, scanRendererTaskweaverPaths } from './ipc-contract-utils.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bridgePath = path.join(root, 'src/shell/taskweaver-shell-bridge.generated.ts')
const backendDir = path.join(root, 'backend')
const rendererDir = path.join(root, 'src')
const bridgeSource = fs.readFileSync(bridgePath, 'utf8')
const shellBridge = buildShellBridgeIndex(bridgeSource)
const { invokeMethods, bridgeMethods, exposedPaths } = shellBridge

function buildShellBridgeIndex(source) {
  const invokeMethods = new Map()
  const bridgeMethods = new Map()
  const exposedPaths = new Set([''])
  for (const entry of IPC_CHANNELS) {
    const quoted = `invoke("${entry.name}"`
    if (!source.includes(quoted)) continue
    invokeMethods.set(entry.name, entry.bridgePath)
    bridgeMethods.set(entry.bridgePath, quoted)
    for (let index = 1; index <= entry.bridgePath.split('.').length; index += 1) {
      exposedPaths.add(entry.bridgePath.split('.').slice(0, index).join('.'))
    }
  }
  for (const entry of PRELOAD_EVENTS) {
    const quoted = `subscribe("${entry.event}"`
    if (!source.includes(quoted)) continue
    bridgeMethods.set(entry.bridgePath, quoted)
    for (let index = 1; index <= entry.bridgePath.split('.').length; index += 1) {
      exposedPaths.add(entry.bridgePath.split('.').slice(0, index).join('.'))
    }
  }
  return { invokeMethods, bridgeMethods, exposedPaths }
}
const registeredHandlers = scanRegisteredHandlers(backendDir, root)
const rendererPaths = scanRendererTaskweaverPaths(rendererDir)

export function collectIpcContractIssues({
  channels = IPC_CHANNELS,
  handlers = registeredHandlers,
  invokeMethods: bridgeInvokeMethods = invokeMethods,
  bridgeMethods: shellBridgeMethods = bridgeMethods,
  exposedPaths: shellPaths = exposedPaths,
  rendererPaths: usedRendererPaths = rendererPaths,
  generatedTypesFresh = checkGeneratedIpcTypes(),
  generatedShellBridgeFresh = checkGeneratedShellBridge(),
} = {}) {
  const tableByName = new Map()
  const problems = []

  for (const entry of channels) {
    if (tableByName.has(entry.name)) {
      problems.push(`duplicate table entry: ${entry.name}`)
      continue
    }
    tableByName.set(entry.name, entry)
    if (entry.direction !== 'renderer-to-main/invoke') problems.push(`${entry.name}: unsupported direction ${entry.direction}`)
    if (!entry.handlerModule) problems.push(`${entry.name}: handlerModule is missing`)
    if (!entry.argsSchema?.reference) problems.push(`${entry.name}: argsSchema is missing`)
    if (!entry.resultSchema?.reference) problems.push(`${entry.name}: resultSchema is missing`)
    const argsType = entry.argsSchema?.reference?.match(/^Parameters<NonNullable<(.+)>>$/)?.[1]
    if (!argsType || entry.resultSchema?.reference !== `Awaited<ReturnType<NonNullable<${argsType}>>>`) {
      problems.push(`${entry.name}: argsSchema and resultSchema must reference the same API method`)
    }
    const actualHandler = handlers.get(entry.name)
    if (!actualHandler) problems.push(`${entry.name}: table entry has no ipcHandle registration`)
    else if (actualHandler !== entry.handlerModule) problems.push(`${entry.name}: handlerModule=${entry.handlerModule}, registered in ${actualHandler}`)
    const actualPath = bridgeInvokeMethods.get(entry.name)
    if (!actualPath) problems.push(`${entry.name}: table entry is not exposed by shell bridge`)
    else if (actualPath !== entry.bridgePath) problems.push(`${entry.name}: bridgePath=${entry.bridgePath}, shell bridge exposes ${actualPath}`)
    if (!shellBridgeMethods.has(entry.bridgePath)) problems.push(`${entry.name}: bridgePath ${entry.bridgePath} is not a generated shell bridge method`)
  }

  for (const [channel, modulePath] of handlers) {
    if (!tableByName.has(channel)) problems.push(`${channel}: registered in ${modulePath} but absent from the IPC table`)
  }
  for (const [channel, bridgePath] of bridgeInvokeMethods) {
    if (!tableByName.has(channel)) problems.push(`${channel}: exposed as ${bridgePath} by shell bridge but absent from the IPC table`)
  }

  const missingRendererPaths = [...usedRendererPaths.keys()]
    .filter((accessPath) => !shellPaths.has(accessPath))
    .sort()
  if (missingRendererPaths.length) {
    problems.push(`renderer calls taskweaver APIs not exposed by shell bridge: ${missingRendererPaths.join(', ')}`)
  }

  if (!generatedTypesFresh) problems.push('generated IPC TypeScript files are stale; run node scripts/gen-ipc-types.mjs')
  if (!generatedShellBridgeFresh) problems.push('shell bridge is stale; run node scripts/gen-shell-bridge.mjs')
  return problems
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const problems = collectIpcContractIssues()
  if (problems.length) {
    console.error(`check-ipc-contract: failed (${problems.length} issue${problems.length === 1 ? '' : 's'})`)
    for (const problem of problems) console.error(`- ${problem}`)
    process.exit(1)
  }
  console.log(`check-ipc-contract: ok (${IPC_CHANNELS.length} table entries, ${registeredHandlers.size} registrations, ${rendererPaths.size} renderer API paths)`)
}
