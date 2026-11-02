#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { scenarioNames, scenarios } from '../e2e/ui/scenarios.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const devServerUrl = 'http://127.0.0.1:5173/'
const viteEntry = path.join(root, 'node_modules/vite/bin/vite.js')

function printUsage() {
  console.error(`Usage: node scripts/ui-verify.mjs <scenario|all>\nScenarios: ${scenarioNames.join(', ')}`)
}

function serverEnvironment() {
  const env = {}
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SYSTEMROOT', 'WINDIR']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  env.NODE_ENV = 'development'
  env.NODE_OPTIONS = '--max-old-space-size=8192'
  return env
}

async function probeDevServer() {
  try {
    const response = await fetch(devServerUrl, { signal: AbortSignal.timeout(1_500) })
    if (!response.ok) return false
    return (await response.text()).includes('<title>TaskWeaver</title>')
  } catch {
    return false
  }
}

async function startDevServer() {
  if (await probeDevServer()) return undefined
  try {
    await access(viteEntry)
  } catch {
    throw new Error(`Could not locate the Vite development server at ${viteEntry}`)
  }
  const child = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    cwd: root,
    env: serverEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = []
  let spawnError
  child.once('error', (error) => { spawnError = error })
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
      output.push(String(chunk))
      if (output.join('').length > 16_000) output.splice(0, output.length - 1)
    })
  }
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`Could not start Vite development server: ${spawnError.message}`)
    if (child.exitCode !== null) throw new Error(`Vite development server exited: ${output.join('')}`)
    if (await probeDevServer()) return child
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  await stopDevServer(child)
  throw new Error(`TaskWeaver Vite server did not become ready within 30 seconds: ${output.join('')}`)
}

async function stopDevServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3_000))])
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
}

async function writeFailureEvidence(session, scenario, error) {
  const evidenceDir = session.artifactsDir
  await mkdir(evidenceDir, { recursive: true })
  const evidence = { scenario, error: error instanceof Error ? error.message : String(error) }
  try {
    const screenshot = await session.screenshot(`failure-${scenario}`)
    evidence.screenshot = screenshot
  } catch (screenshotError) {
    evidence.screenshotError = screenshotError instanceof Error ? screenshotError.message : String(screenshotError)
  }
  try {
    await writeFile(path.join(evidenceDir, 'aria-snapshot.yml'), await session.snapshot(), 'utf8')
  } catch (snapshotError) {
    evidence.snapshotError = snapshotError instanceof Error ? snapshotError.message : String(snapshotError)
  }
  evidence.consoleErrors = session.consoleErrors()
  evidence.processOutput = session.processOutput()
  await writeFile(path.join(evidenceDir, 'failure.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  return evidence
}

async function writeDriverFailureEvidence(artifactsRoot, error) {
  await mkdir(artifactsRoot, { recursive: true })
  const evidence = {
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    screenshotError: 'The Electron UI scenario did not reach a page where a screenshot could be captured.',
    ariaSnapshotError: 'The Electron UI scenario did not reach a page where an ARIA snapshot could be captured.',
  }
  await writeFile(path.join(artifactsRoot, 'driver-failure.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
}

async function runScenario(name, UiVerifySession, artifactsRoot) {
  const artifactsDir = path.join(artifactsRoot, name)
  let session
  try {
    session = await UiVerifySession.launch({ root, artifactsDir, scenario: name })
  } catch (error) {
    // Keep an uploadable record even when Electron exits before producing a
    // Playwright page. In that case screenshot/ARIA evidence is unavailable,
    // but the launch error (which includes Playwright's process diagnostics)
    // still identifies the failing scenario in CI.
    await mkdir(artifactsDir, { recursive: true })
    const details = {
      scenario: name,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      screenshotError: 'Electron did not produce an initialized Playwright page.',
      ariaSnapshotError: 'Electron did not produce an initialized Playwright page.',
      trace: 'A trace is available only if Electron opened a Playwright context.',
    }
    await writeFile(path.join(artifactsDir, 'failure.json'), `${JSON.stringify(details, null, 2)}\n`, 'utf8')
    throw error
  }
  let failure
  let evidence
  try {
    await scenarios[name](session)
    const errors = session.consoleErrors()
    if (errors.length > 0) throw new Error(`Renderer reported console errors:\n${errors.join('\n')}`)
  } catch (error) {
    failure = error
    evidence = await writeFailureEvidence(session, name, error)
  } finally {
    await session.close()
  }
  return {
    scenario: name,
    passed: failure === undefined,
    ...(failure === undefined ? {} : { error: failure instanceof Error ? failure.message : String(failure) }),
    ...(evidence ? { artifactsDir: session.artifactsDir, screenshot: evidence.screenshot } : {}),
    trace: path.join(session.artifactsDir, 'trace.zip'),
  }
}

async function main() {
  const selected = process.argv[2]
  if (selected === '--help' || selected === '-h') {
    printUsage()
    return
  }
  if (!selected || (selected !== 'all' && !Object.hasOwn(scenarios, selected))) {
    printUsage()
    process.exitCode = 2
    return
  }
  const artifactsRoot = path.resolve(process.env.TASKWEAVER_UI_ARTIFACTS || path.join(os.tmpdir(), 'taskweaver-ui-verify'))
  let devServer
  try {
    devServer = await startDevServer()
    const { UiVerifySession } = await import(pathToFileURL(path.join(root, 'packages/runtime/interaction/ui-verify/src/index.ts')).href)
    const names = selected === 'all' ? scenarioNames : [selected]
    const results = []
    for (const name of names) {
      const result = await runScenario(name, UiVerifySession, artifactsRoot)
      results.push(result)
      console.log(JSON.stringify(result))
    }
    if (results.some((result) => !result.passed)) process.exitCode = 1
  } catch (error) {
    await writeDriverFailureEvidence(artifactsRoot, error)
    throw error
  } finally {
    await stopDevServer(devServer)
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
