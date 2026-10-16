#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { generateEvaluationReport } from './eval-report.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultSuitePath = path.join(root, 'eval/coding-agent/tasks.json')
const CONFIGS = new Set(['single', 'dag-fixed', 'dag-routed'])
const PRESETS = new Set(['taskweaver-readonly', 'taskweaver-code'])
const PERMISSION_MODES = new Set(['readonly', 'on-risk'])

function parseArgs(argv) {
  const options = {
    suite: defaultSuitePath,
    configs: ['single', 'dag-fixed', 'dag-routed'],
    limit: 5,
    repeats: 1,
    dryRun: true,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const value = () => {
      const next = argv[++i]
      if (!next || next.startsWith('--')) throw new Error(`missing value for ${token}`)
      return next
    }
    if (token === '--help' || token === '-h') options.help = true
    else if (token === '--dry-run') { options.dryRun = true; options.live = false }
    else if (token === '--live') { options.dryRun = false; options.live = true }
    else if (token === '--suite') options.suite = path.resolve(value())
    else if (token === '--configs') options.configs = value().split(',').map(item => item.trim()).filter(Boolean)
    else if (token === '--limit') options.limit = Number(value())
    else if (token === '--task-ids') options.taskIds = value().split(',').map(item => item.trim()).filter(Boolean)
    else if (token === '--repeats') options.repeats = Number(value())
    else if (token === '--model') options.model = value()
    else if (token === '--worktree-root') options.worktreeRoot = path.resolve(value())
    else if (token === '--report-dir') options.reportDir = path.resolve(value())
    else if (token === '--max-cost-usd') options.maxCostUsd = Number(value())
    else if (token === '--confirm-cost-usd') options.confirmCostUsd = Number(value())
    else throw new Error(`unknown option: ${token}`)
  }
  return options
}

function command(commandName, args, cwd = root) {
  const result = spawnSync(commandName, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${commandName} ${args.join(' ')} failed (${result.status}): ${result.stderr.trim()}`)
  return result.stdout.trim()
}

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function versionParts(value) {
  const match = String(value).match(/(?:^|[^\d])(\d+)\.(\d+)\.(\d+)/)
  return match ? match.slice(1).map(Number) : null
}

function versionAtLeast(actual, minimum) {
  const left = versionParts(actual)
  const right = versionParts(minimum)
  if (!left || !right) return false
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i]
  }
  return true
}

function engineMinimum(engineRange) {
  const match = String(engineRange ?? '').match(/>=\s*v?(\d+\.\d+(?:\.\d+)?)/)
  return match?.[1]?.includes('.') && match[1].split('.').length === 2 ? `${match[1]}.0` : match?.[1] ?? null
}

export function validateSuite(suite, rawText) {
  const issues = []
  if (suite?.schemaVersion !== 1) issues.push('schemaVersion must be 1')
  if (typeof suite?.suiteId !== 'string' || !suite.suiteId.trim()) issues.push('suiteId is required')
  if (!/^[a-f0-9]{40}$/i.test(String(suite?.targetCommit ?? ''))) issues.push('targetCommit must be a full Git commit SHA')
  if (!Array.isArray(suite?.tasks)) issues.push('tasks must be an array')
  const tasks = Array.isArray(suite?.tasks) ? suite.tasks : []
  if (tasks.length < 50) issues.push(`suite has ${tasks.length} tasks; at least 50 are required`)
  if (suite?.taskCount !== tasks.length) issues.push(`taskCount says ${suite?.taskCount}; observed ${tasks.length}`)
  const ids = new Set()
  for (const [index, task] of tasks.entries()) {
    const label = `tasks[${index}]`
    if (typeof task?.id !== 'string' || !task.id.trim()) issues.push(`${label}.id is required`)
    else if (ids.has(task.id)) issues.push(`${label}.id duplicates ${task.id}`)
    else ids.add(task.id)
    if (typeof task?.taskType !== 'string' || !task.taskType.trim()) issues.push(`${label}.taskType is required`)
    if (!PRESETS.has(task?.preset)) issues.push(`${label}.preset must be taskweaver-readonly or taskweaver-code`)
    if (!PERMISSION_MODES.has(task?.permissionMode)) issues.push(`${label}.permissionMode must be readonly or on-risk`)
    if (typeof task?.prompt !== 'string' || !task.prompt.trim()) issues.push(`${label}.prompt is required`)
    if (!Array.isArray(task?.acceptance) || task.acceptance.length < 1 || task.acceptance.length > 5
      || task.acceptance.some(item => typeof item !== 'string' || !item.trim())) {
      issues.push(`${label}.acceptance must contain 1–5 non-empty checks`)
    }
    if (!Array.isArray(task?.verificationCommands) || task.verificationCommands.length < 1
      || task.verificationCommands.some(item => typeof item !== 'string' || !item.trim())) {
      issues.push(`${label}.verificationCommands must contain at least one explicit command`)
    }
    if (task?.stochasticity === 'high' && task?.repeatCount !== 3) {
      issues.push(`${label} is high-stochasticity and must set repeatCount to 3`)
    }
    if (!Number.isInteger(task?.repeatCount) || task.repeatCount < 1 || task.repeatCount > 3) {
      issues.push(`${label}.repeatCount must be an integer from 1 to 3`)
    }
    if (!Array.isArray(task?.forbiddenEffects) || task.forbiddenEffects.length < 1) issues.push(`${label}.forbiddenEffects is required`)
    if (!Array.isArray(task?.riskTags) || task.riskTags.length < 1) issues.push(`${label}.riskTags is required`)
  }
  if (typeof rawText !== 'string' || rawText.length === 0) issues.push('suite source is empty')
  const scoringWeights = suite?.scoring?.weights
  if (!scoringWeights || Object.values(scoringWeights).reduce((sum, value) => sum + (Number(value) || 0), 0) !== 100) {
    issues.push('scoring.weights must add up to 100')
  }
  return issues
}

export function resolveEvaluationPreset(task, config) {
  // The readonly preset intentionally has no orchestrate tool. DAG comparison
  // therefore uses the default primary catalog; readonly remains enforced by
  // the independent session permission mode, while child presets are selected
  // by the planner from the task type.
  return config === 'single' ? task.preset : 'tw-default'
}

async function sha256Tree(directory) {
  const hash = createHash('sha256')
  const visit = async (current, relative) => {
    const entries = await fs.readdir(current, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.cache') continue
      const absolute = path.join(current, entry.name)
      const name = path.posix.join(relative, entry.name)
      const stat = await fs.lstat(absolute)
      hash.update(`${name}\0${stat.mode}\0`)
      if (stat.isDirectory()) await visit(absolute, name)
      else if (stat.isSymbolicLink()) hash.update(`link:${await fs.readlink(absolute)}\0`)
      else if (stat.isFile()) hash.update(await fs.readFile(absolute))
    }
  }
  await visit(directory, '')
  return hash.digest('hex')
}

async function readSuite(suitePath) {
  const rawText = await fs.readFile(suitePath, 'utf8')
  return { suite: JSON.parse(rawText), rawText }
}

async function validateDryRun(options, suite, rawText) {
  const issues = validateSuite(suite, rawText)
  for (const config of options.configs) if (!CONFIGS.has(config)) issues.push(`unsupported config: ${config}`)
  if (new Set(options.configs).size !== options.configs.length) issues.push('configs contains duplicates')
  if (!options.taskIds && (!Number.isInteger(options.limit) || options.limit < 5)) issues.push('--limit must be an integer of at least 5')
  if (!Number.isInteger(options.repeats) || options.repeats < 1 || options.repeats > 3) issues.push('--repeats must be 1–3')
  if (!options.configs.length) issues.push('--configs must include at least one configuration')

  try { command('git', ['cat-file', '-e', `${suite.targetCommit}^{commit}`]) }
  catch { issues.push(`frozen target commit is unavailable locally: ${suite.targetCommit}`) }
  let targetPackage = null
  try { targetPackage = JSON.parse(command('git', ['show', `${suite.targetCommit}:package.json`])) }
  catch { issues.push('could not read package.json from the frozen target commit') }
  let pnpmVersion = null
  try { pnpmVersion = command('pnpm', ['--version']) }
  catch { issues.push('pnpm is unavailable or failed its version check') }
  const requiredPnpm = targetPackage?.packageManager?.match(/^pnpm@(.+)$/)?.[1]
  if (!requiredPnpm) issues.push('frozen target package.json must pin pnpm with packageManager')
  else if (pnpmVersion && pnpmVersion !== requiredPnpm) issues.push(`pnpm ${requiredPnpm} is required by the frozen target; found ${pnpmVersion}`)
  const requiredNode = engineMinimum(targetPackage?.engines?.node)
  if (requiredNode && !versionAtLeast(process.version, requiredNode)) issues.push(`Node ${requiredNode} or newer is required by the frozen target; found ${process.version}`)
  const worktreeRoot = options.worktreeRoot ?? path.join(os.tmpdir(), 'taskweaver-coding-agent-eval')
  const worktreeParent = path.dirname(worktreeRoot)
  try { await fs.access(worktreeParent, fsSync.constants.R_OK | fsSync.constants.W_OK) }
  catch { issues.push(`worktree parent does not exist or is not writable: ${worktreeParent}`) }
  if (isInside(root, worktreeRoot)) issues.push('--worktree-root must be outside the repository')
  try {
    const parentReal = await fs.realpath(worktreeParent)
    if (isInside(root, path.join(parentReal, path.basename(worktreeRoot)))) issues.push('--worktree-root resolves inside the repository')
  } catch {}

  const selectedTasks = options.taskIds ? suite.tasks.filter(task => options.taskIds.includes(task.id)) : suite.tasks.slice(0, options.limit)
  if (options.taskIds) {
    if (options.taskIds.length < 5) issues.push('--task-ids must select at least five tasks')
    if (new Set(options.taskIds).size !== options.taskIds.length) issues.push('--task-ids contains duplicates')
    for (const taskId of options.taskIds) if (!suite.tasks.some(task => task.id === taskId)) issues.push(`unknown task id: ${taskId}`)
  }
  const plannedRuns = selectedTasks.reduce((sum, task) => sum + Math.max(options.repeats, task.repeatCount ?? 1) * options.configs.length, 0)
  return {
    issues,
    worktreeRoot,
    plan: {
      suiteId: suite.suiteId,
      taskCount: suite.tasks.length,
      selectedTaskCount: selectedTasks.length,
      plannedRuns,
      targetCommit: suite.targetCommit,
      nodeVersion: process.version,
      pnpmVersion,
      configurations: options.configs,
      repeats: options.repeats,
      worktreeRoot,
      networkCalls: 0,
      modelCalls: 0,
      worktreesCreated: 0,
    },
  }
}

function usageValue(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function aggregateUsage(report) {
  const usages = [report?.result?.usage, ...(report?.orchestrationRuns ?? []).map(run => run.usage)]
    .filter(value => value && typeof value === 'object')
  if (!usages.length) return { inputTokens: null, outputTokens: null, cacheTokens: null, costUsd: null }
  const sum = keys => {
    const values = usages.map(value => keys.map(key => usageValue(value[key])).find(item => item !== null) ?? null)
    if (values.some(item => item === null)) return null
    return values.reduce((total, item) => total + item, 0)
  }
  const cacheTotals = usages.map(value => {
    const read = ['cacheReadTokens', 'cache_read_tokens', 'cacheRead'].map(key => usageValue(value[key])).find(item => item !== null)
    const write = ['cacheWriteTokens', 'cache_write_tokens', 'cacheWrite'].map(key => usageValue(value[key])).find(item => item !== null)
    if (read !== undefined && read !== null && write !== undefined && write !== null) return read + write
    return ['cacheTokens', 'cache_tokens', 'cachedTokens'].map(key => usageValue(value[key])).find(item => item !== null) ?? null
  })
  const rawCost = sum(['costUsd', 'cost_usd'])
  return {
    inputTokens: sum(['inputTokens', 'promptTokens', 'input']),
    outputTokens: sum(['outputTokens', 'completionTokens', 'output']),
    cacheTokens: cacheTotals.some(value => value === null) ? null : cacheTotals.reduce((total, value) => total + value, 0),
    costUsd: rawCost,
  }
}

function runChild(commandName, args, { cwd, env, timeoutMs = 60 * 60 * 1000, onChunk = () => {}, signal = null }) {
  return new Promise((resolve, reject) => {
    const detached = process.platform !== 'win32'
    const child = spawn(commandName, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached })
    const signalChildTree = signal => {
      if (detached && child.pid) {
        try { process.kill(-child.pid, signal); return }
        catch (error) { if (error?.code !== 'ESRCH') child.kill(signal); return }
      }
      child.kill(signal)
    }
    let stdoutTail = ''
    let stderrTail = ''
    let timer
    let killTimer
    let aborted = false
    const abortChild = () => {
      aborted = true
      signalChildTree('SIGTERM')
      killTimer = setTimeout(() => signalChildTree('SIGKILL'), 5_000)
      killTimer.unref()
    }
    const appendTail = (previous, chunk, max = 2_000_000) => `${previous}${chunk.toString('utf8')}`.slice(-max)
    child.stdout.on('data', chunk => { stdoutTail = appendTail(stdoutTail, chunk); onChunk() })
    child.stderr.on('data', chunk => { stderrTail = appendTail(stderrTail, chunk, 8_000) })
    timer = setTimeout(() => {
      signalChildTree('SIGTERM')
      killTimer = setTimeout(() => signalChildTree('SIGKILL'), 5_000)
      killTimer.unref()
    }, timeoutMs)
    if (signal?.aborted) abortChild()
    else signal?.addEventListener('abort', abortChild, { once: true })
    child.once('error', error => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      signal?.removeEventListener('abort', abortChild)
      reject(error)
    })
    child.once('exit', (code, exitSignal) => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      signal?.removeEventListener('abort', abortChild)
      resolve({ code: aborted ? 130 : (code ?? 1), signal: exitSignal, stdoutTail, stderrTail })
    })
  })
}

function lastHeadlessSummary(stdout) {
  for (const line of stdout.split(/\r?\n/).reverse()) {
    if (!line.trim()) continue
    try {
      const value = JSON.parse(line)
      if (value?.wrapper === 'taskweaver-headless') return value
    } catch {}
  }
  return null
}

async function runVerificationCommands(commands, worktree, env, signal) {
  const results = []
  for (const verificationCommand of commands) {
    const startedAt = Date.now()
    try {
      const result = await runChild('/bin/zsh', ['-lc', verificationCommand], {
        cwd: worktree,
        env,
        timeoutMs: 10 * 60 * 1000,
        signal,
      })
      results.push({ command: verificationCommand, exitCode: result.code, elapsedMs: Date.now() - startedAt })
    } catch (error) {
      results.push({ command: verificationCommand, exitCode: null, elapsedMs: Date.now() - startedAt, errorCode: error?.code ?? 'VERIFY_COMMAND_FAILED' })
    }
  }
  return results
}

async function gitText(worktree, args) {
  return command('git', ['-C', worktree, ...args])
}

async function captureWorkspace(worktree, outputDirectory, key, initialStatus) {
  const finalStatus = await gitText(worktree, ['status', '--porcelain'])
  const changed = new Set((await gitText(worktree, ['diff', '--name-only', 'HEAD'])).split('\n').filter(Boolean))
  const untracked = await gitText(worktree, ['ls-files', '--others', '--exclude-standard'])
  for (const file of untracked.split('\n').filter(Boolean)) changed.add(file)
  // Mark untracked files as intent-to-add so the saved diff includes their
  // contents. The worktree is disposable and the original status is captured
  // first, so this does not alter the user's repository or hide new files.
  if (untracked.trim()) command('git', ['-C', worktree, 'add', '--intent-to-add', '--', '.'])
  const diff = await gitText(worktree, ['diff', '--binary', 'HEAD'])
  const diffPath = path.join(outputDirectory, `${key}.patch`)
  await fs.writeFile(diffPath, diff, { mode: 0o600 })
  return { initialStatus, finalStatus, changedFiles: [...changed].sort(), diffPath }
}

async function ensureSecureInputs(options) {
  if (process.platform !== 'darwin') throw new Error('live coding-agent evaluation currently requires macOS')
  if (process.env.CI) throw new Error('live model evaluation is disabled in CI')
  if (!options.model) throw new Error('--model is required for live evaluation')
  if (!options.reportDir) throw new Error('--report-dir is required for live evaluation')
  if (!Number.isFinite(options.maxCostUsd) || options.maxCostUsd <= 0
    || options.confirmCostUsd !== options.maxCostUsd) {
    throw new Error('live evaluation requires --max-cost-usd X and an explicit matching --confirm-cost-usd X')
  }
  if (!process.env.TASKWEAVER_USER_DATA) throw new Error('set TASKWEAVER_USER_DATA to a dedicated evaluation config directory')
  if (!process.env.TASKWEAVER_RUNTIME) throw new Error('set TASKWEAVER_RUNTIME to the fixed Z Runtime directory')
  const userData = path.resolve(process.env.TASKWEAVER_USER_DATA)
  if (isInside(root, userData)) throw new Error('dedicated TASKWEAVER_USER_DATA must be outside the repository')
  await fs.access(userData, fsSync.constants.R_OK)
  const realUserData = await fs.realpath(userData)
  if (isInside(root, realUserData)) throw new Error('dedicated TASKWEAVER_USER_DATA resolves inside the repository')
  const modelsPath = path.join(userData, 'taskweaver', 'models.json')
  try {
    const models = JSON.parse(await fs.readFile(modelsPath, 'utf8'))
    if (Object.values(models.providers ?? {}).some(provider => provider && typeof provider === 'object'
      && typeof provider.apiKey === 'string' && provider.apiKey.trim())) {
      throw new Error('remove provider apiKey fields from the evaluation models.json and pass keys through environment variables')
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const runtimeRoot = path.resolve(process.env.TASKWEAVER_RUNTIME)
  if (!(await fs.stat(runtimeRoot)).isDirectory()) throw new Error('TASKWEAVER_RUNTIME must be a directory')
  if (isInside(root, options.reportDir)) throw new Error('--report-dir must be outside the repository')
  await fs.mkdir(options.reportDir, { recursive: true, mode: 0o700 })
  const realReportDir = await fs.realpath(options.reportDir)
  if (isInside(root, realReportDir)) throw new Error('--report-dir resolves inside the repository')
  if ((await fs.readdir(realReportDir)).length > 0) throw new Error('--report-dir must be empty so evaluation results are not overwritten or mixed')
  await fs.chmod(realReportDir, 0o700)
  return { userData, runtimeRoot }
}

function redactSecrets(value, env = process.env) {
  let message = String(value ?? '')
  for (const [key, secret] of Object.entries(env)) {
    if (!/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key) || typeof secret !== 'string' || secret.length < 6) continue
    message = message.split(secret).join('[REDACTED]')
  }
  return message.slice(0, 500)
}

async function readSmokeReport(summary) {
  if (!summary?.reportPath) return { report: null, reportDirectory: null }
  const reportPath = summary.reportPath
  try {
    const stat = await fs.stat(reportPath)
    if (stat.isDirectory()) {
      const failurePath = path.join(reportPath, 'failure.json')
      try { return { report: JSON.parse(await fs.readFile(failurePath, 'utf8')), reportDirectory: reportPath } }
      catch (error) { if (error?.code !== 'ENOENT') throw error; return { report: null, reportDirectory: reportPath } }
    }
    return { report: JSON.parse(await fs.readFile(reportPath, 'utf8')), reportDirectory: path.dirname(reportPath) }
  } catch (error) {
    if (error?.code === 'ENOENT') return { report: null, reportDirectory: path.dirname(reportPath) }
    throw error
  }
}

async function runLive(options, suite, rawText) {
  const { userData, runtimeRoot } = await ensureSecureInputs(options)
  const selectedTasks = options.taskIds ? suite.tasks.filter(task => options.taskIds.includes(task.id)) : suite.tasks.slice(0, options.limit)
  const agentCommit = command('git', ['rev-parse', 'HEAD'])
  const agentDiff = command('git', ['diff', '--binary', 'HEAD'])
  const untrackedAgentFiles = command('git', ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0').filter(Boolean).sort()
  const agentWorkingTreeHash = createHash('sha256').update(agentDiff)
  for (const file of untrackedAgentFiles) {
    const absolute = path.join(root, file)
    const stat = await fs.lstat(absolute)
    agentWorkingTreeHash.update(`${file}\0${stat.mode}\0`)
    agentWorkingTreeHash.update(stat.isSymbolicLink() ? await fs.readlink(absolute) : await fs.readFile(absolute))
  }
  const suiteHash = createHash('sha256').update(rawText).digest('hex')
  const runtimeHash = await sha256Tree(runtimeRoot)
  const worktreeRoot = options.worktreeRoot ?? path.join(os.tmpdir(), 'taskweaver-coding-agent-eval')
  const worktreeParentReal = await fs.realpath(path.dirname(worktreeRoot))
  const worktreeCandidate = path.join(worktreeParentReal, path.basename(worktreeRoot))
  if (isInside(root, worktreeRoot) || isInside(root, worktreeCandidate)) throw new Error('--worktree-root must be outside the repository')
  await fs.mkdir(worktreeRoot, { recursive: true, mode: 0o700 })
  const realWorktreeRoot = await fs.realpath(worktreeRoot)
  if (isInside(root, realWorktreeRoot)) throw new Error('--worktree-root resolves inside the repository')
  await fs.chmod(realWorktreeRoot, 0o700)
  const metadata = {
    suiteId: suite.suiteId,
    suiteSha256: suiteHash,
    agentCommit,
    agentWorkingTreeDiffSha256: agentWorkingTreeHash.digest('hex'),
    targetCommit: suite.targetCommit,
    nodeVersion: process.version,
    pnpmVersion: command('pnpm', ['--version']),
    runtimeRoot,
    runtimeSha256: runtimeHash,
    modelKey: options.model,
    maxCostUsd: options.maxCostUsd,
    configurations: options.configs,
    createdAt: new Date().toISOString(),
  }
  const evalId = randomUUID()
  const resultsPath = path.join(options.reportDir, `eval-${Date.now()}-${evalId}.jsonl`)
  const resultHandle = await fs.open(resultsPath, 'wx', 0o600)
  let knownCostUsd = 0
  let unknownCostRuns = 0
  let completedRuns = 0
  const totalRuns = selectedTasks.reduce((sum, task) => sum + Math.max(options.repeats, task.repeatCount ?? 1) * options.configs.length, 0)
  const perDagBudget = options.maxCostUsd / Math.max(1, totalRuns)
  const abortController = new AbortController()
  let receivedSignal = null
  const onSigint = () => { receivedSignal = 'SIGINT'; abortController.abort() }
  const onSigterm = () => { receivedSignal = 'SIGTERM'; abortController.abort() }
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)
  try {
    for (const config of options.configs) {
      for (const task of selectedTasks) {
        const repeatCount = Math.max(options.repeats, task.repeatCount ?? 1)
        for (let repeat = 1; repeat <= repeatCount; repeat += 1) {
          const runKey = `${task.id}-${config}-r${repeat}`
          const worktree = path.join(worktreeRoot, `${runKey}-${randomUUID()}`)
          const smokeReportDirectory = path.join(options.reportDir, '.sessions', `${runKey}-${randomUUID()}`)
          await resultHandle.write(`${JSON.stringify({ kind: 'start', runKey, config, taskId: task.id, repeat, timestamp: new Date().toISOString() })}\n`)
          let worktreeAdded = false
          let modelStarted = false
          let runCostAccounted = false
          let worktreeCleanupError = null
          let record
          try {
            command('git', ['worktree', 'add', '--detach', worktree, suite.targetCommit])
            worktreeAdded = true
            const initialStatus = await gitText(worktree, ['status', '--porcelain'])
            if (initialStatus) throw new Error('new frozen worktree is not clean')
            const worktreeHead = await gitText(worktree, ['rev-parse', 'HEAD'])
            if (worktreeHead !== suite.targetCommit) throw new Error('new worktree does not match frozen target commit')

            const installStartedAt = Date.now()
            const install = await runChild('pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'], {
              cwd: worktree,
              env: process.env,
              timeoutMs: 30 * 60 * 1000,
              signal: abortController.signal,
            })
            if (install.code !== 0) throw new Error(`offline dependency preparation failed (${install.code})`)
            const installElapsedMs = Date.now() - installStartedAt
            const childEnv = {
              ...process.env,
              TASKWEAVER_USER_DATA: userData,
              TASKWEAVER_RUNTIME: runtimeRoot,
              TASKWEAVER_EVAL: '1',
              TASKWEAVER_EVAL_DAG_BUDGET_USD: String(perDagBudget),
              TASKWEAVER_EVAL_DAG_BUDGET_TOKENS: '200000',
            }
            const childArgs = [
              'scripts/taskweaver-headless.mjs', '--json-summary',
              '--report-dir', smokeReportDirectory,
              '--text', task.prompt,
              '--workspace', worktree,
              '--preset', resolveEvaluationPreset(task, config),
              '--permission-mode', task.permissionMode,
              '--model', options.model,
              '--evaluation-mode', config,
              '--eval-secure',
            ]
            const startedAt = Date.now()
            modelStarted = true
            const smoke = await runChild(process.execPath, childArgs, {
              cwd: root,
              env: childEnv,
              timeoutMs: 90 * 60 * 1000,
              signal: abortController.signal,
            })
            const summary = lastHeadlessSummary(smoke.stdoutTail)
            const { report: smokeReport } = await readSmokeReport(summary)
            const verification = await runVerificationCommands(task.verificationCommands, worktree, childEnv, abortController.signal)
            const workspace = await captureWorkspace(worktree, options.reportDir, `${evalId}-${runKey}`, initialStatus)
            const usage = aggregateUsage(smokeReport)
            if (usage.costUsd === null) unknownCostRuns += 1
            else knownCostUsd += usage.costUsd
            runCostAccounted = true
            record = {
              ...metadata,
              kind: 'result',
              runKey,
              taskId: task.id,
              taskType: task.taskType,
              config,
              repeat,
              modelKey: options.model,
              agentPreset: resolveEvaluationPreset(task, config),
              taskPreset: task.preset,
              permissionMode: task.permissionMode,
              runOk: smoke.code === 0 && summary?.ok === true,
              independentVerification: verification,
              verificationOk: verification.length > 0 && verification.every(item => item.exitCode === 0),
              readOnlyClean: task.permissionMode !== 'readonly' || workspace.finalStatus === '',
              elapsedMs: Date.now() - startedAt,
              dependencyPreparationMs: installElapsedMs,
              hostToolCallCount: (smokeReport?.toolCalls?.length ?? 0)
                + (smokeReport?.nestedToolCalls?.length ?? 0)
                + (smokeReport?.orchestrationRuns ?? []).reduce((sum, run) => sum + run.tasks.reduce((taskSum, item) => taskSum + item.toolCallCount, 0), 0),
              hostToolCalls: [
                ...(smokeReport?.toolCalls ?? []),
                ...(smokeReport?.nestedToolCalls ?? []),
              ].map(call => typeof call.name === 'string' ? call.name : 'unknown'),
              ...usage,
              permissionEvents: smokeReport?.permissionEvents ?? [],
              requestHeaders: smokeReport?.requestHeaders ?? [],
              orchestrationRuns: smokeReport?.orchestrationRuns ?? [],
              agentFinalText: redactSecrets(smokeReport?.result?.text ?? '').slice(0, 20_000) || null,
              workspace,
              automatedPassed: smoke.code === 0 && summary?.ok === true
                && verification.length > 0 && verification.every(item => item.exitCode === 0)
                && (task.permissionMode !== 'readonly' || workspace.finalStatus === ''),
              headlessError: smoke.code === 0 ? null : 'headless-run-failed',
              knownCumulativeCostUsd: knownCostUsd,
              unknownCostRuns,
            }
          } catch (error) {
            if (modelStarted && !runCostAccounted) unknownCostRuns += 1
            record = {
              ...metadata,
              kind: 'result',
              runKey,
              taskId: task.id,
              config,
              repeat,
              runOk: false,
              errorCode: error?.code ?? 'EVAL_RUN_FAILED',
              error: redactSecrets(error?.message ?? error),
              knownCumulativeCostUsd: knownCostUsd,
              unknownCostRuns,
            }
          } finally {
            await fs.rm(smokeReportDirectory, { recursive: true, force: true }).catch(() => {})
            if (worktreeAdded) {
              try { command('git', ['worktree', 'remove', '--force', worktree]) }
              catch (error) { worktreeCleanupError = redactSecrets(error?.message ?? error) }
            }
          }
          if (worktreeCleanupError) record.worktreeCleanupError = worktreeCleanupError
          await resultHandle.write(`${JSON.stringify(record)}\n`)
          await resultHandle.sync()
          completedRuns += 1
          console.log(JSON.stringify({ status: 'task-complete', runKey, runOk: record.runOk, knownCumulativeCostUsd: knownCostUsd, unknownCostRuns }))
          if (abortController.signal.aborted) throw new Error(`evaluation interrupted by ${receivedSignal ?? 'signal'}`)
          if (knownCostUsd > options.maxCostUsd) throw new Error('known model cost exceeded the confirmed maximum; stopped before the next run')
          if (unknownCostRuns > 0 && completedRuns < totalRuns) throw new Error('provider cost is unavailable; stopped before the next paid run so the confirmed budget is not silently exceeded')
        }
      }
    }
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    await resultHandle.close()
    try {
      const report = await generateEvaluationReport(resultsPath, options.reportDir)
      console.log(JSON.stringify({ status: 'eval-report-finalized', resultsPath, summaryJsonPath: report.jsonPath, summaryMarkdownPath: report.markdownPath, suiteHash, knownCostUsd, unknownCostRuns, runs: report.summary.records, plannedRuns: totalRuns }))
    } catch (error) {
      console.error(JSON.stringify({ status: 'eval-report-failed', error: redactSecrets(error?.message ?? error) }))
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    console.log('Usage: node scripts/eval-run.mjs [--dry-run] [--suite path] [--configs single,dag-fixed,dag-routed] [--limit 5 | --task-ids CA-EVAL-01,...] [--repeats 1..3]')
    console.log('Live: add --live --model key --report-dir outside-repo --max-cost-usd X --confirm-cost-usd X; set TASKWEAVER_USER_DATA and TASKWEAVER_RUNTIME.')
    return 0
  }
  const { suite, rawText } = await readSuite(options.suite)
  const validation = await validateDryRun(options, suite, rawText)
  if (validation.issues.length) {
    console.error(JSON.stringify({ status: 'invalid', issues: validation.issues }, null, 2))
    return 2
  }
  if (options.dryRun) {
    console.log(JSON.stringify({
      status: 'dry-run-ok',
      suiteSha256: createHash('sha256').update(rawText).digest('hex'),
      ...validation.plan,
    }, null, 2))
    return 0
  }
  try {
    await runLive(options, suite, rawText)
    return 0
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', error: redactSecrets(error?.message ?? error).slice(0, 1_000) }))
    return 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
