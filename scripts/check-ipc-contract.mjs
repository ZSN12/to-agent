#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC_CHANNELS } from '../electron/ipc/channels.mjs'
import { checkGeneratedIpcTypes } from './gen-ipc-types.mjs'
import { isGeneratedPreload } from './gen-preload.mjs'
import { parsePreloadApi, scanRegisteredHandlers, scanRendererTaskweaverPaths } from './ipc-contract-utils.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const preloadPath = path.join(root, 'electron/preload.cjs')
const backendDir = path.join(root, 'electron/backend')
const rendererDir = path.join(root, 'src')
const preloadSource = fs.readFileSync(preloadPath, 'utf8')
const { invokeMethods, bridgeMethods, exposedPaths } = parsePreloadApi(preloadSource, 'electron/preload.cjs')
const registeredHandlers = scanRegisteredHandlers(backendDir, root)
const rendererPaths = scanRendererTaskweaverPaths(rendererDir)
export function collectIpcContractIssues({
  channels = IPC_CHANNELS,
  handlers = registeredHandlers,
  invokeMethods: preloadMethods = invokeMethods,
  bridgeMethods: preloadBridgeMethods = bridgeMethods,
  exposedPaths: preloadPaths = exposedPaths,
  rendererPaths: usedRendererPaths = rendererPaths,
  generatedTypesFresh = checkGeneratedIpcTypes(),
  generatedPreloadFresh = isGeneratedPreload(preloadSource),
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
    const actualPath = preloadMethods.get(entry.name)
    if (!actualPath) problems.push(`${entry.name}: table entry is not exposed by preload`)
    else if (actualPath !== entry.bridgePath) problems.push(`${entry.name}: bridgePath=${entry.bridgePath}, preload exposes ${actualPath}`)
    if (!preloadBridgeMethods.has(entry.bridgePath)) problems.push(`${entry.name}: bridgePath ${entry.bridgePath} is not a generated preload method`)
  }

  for (const [channel, modulePath] of handlers) {
    if (!tableByName.has(channel)) problems.push(`${channel}: registered in ${modulePath} but absent from the IPC table`)
  }
  for (const [channel, bridgePath] of preloadMethods) {
    if (!tableByName.has(channel)) problems.push(`${channel}: exposed as ${bridgePath} by preload but absent from the IPC table`)
  }

  const missingRendererPaths = [...usedRendererPaths.keys()]
    .filter((accessPath) => !preloadPaths.has(accessPath))
    .sort()
  if (missingRendererPaths.length) {
    problems.push(`renderer calls taskweaver APIs not exposed by preload: ${missingRendererPaths.join(', ')}`)
  }

  if (!generatedTypesFresh) problems.push('generated IPC TypeScript files are stale; run node scripts/gen-ipc-types.mjs')
  if (!generatedPreloadFresh) problems.push('electron/preload.cjs is stale; run node scripts/gen-preload.mjs')
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
