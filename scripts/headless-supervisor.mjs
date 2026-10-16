import { spawn } from 'node:child_process'
import { constants as osConstants } from 'node:os'

function parseJsonLine(line) {
  try { return JSON.parse(line) } catch { return null }
}

function signalExitCode(signal) {
  const number = osConstants.signals[signal]
  return Number.isInteger(number) ? 128 + number : 1
}

function summaryFor(exitCode, completed, failed, error) {
  if (completed) {
    return {
      wrapper: 'taskweaver-headless',
      ok: exitCode === 0,
      exitCode,
      fixture: completed.fixture === true,
      elapsedMs: completed.elapsedMs ?? null,
      agentPreset: completed.agentPreset ?? null,
      reportPath: completed.reportPath ?? null,
      text: completed.text ?? null,
      permissionMode: completed.permissionMode ?? null,
      error: error ?? null,
    }
  }
  return {
    wrapper: 'taskweaver-headless',
    ok: false,
    exitCode,
    fixture: failed?.fixture === true,
    elapsedMs: null,
    agentPreset: null,
    reportPath: failed?.reportDir ?? null,
    text: null,
    permissionMode: null,
    error: error ?? failed?.error ?? 'no smoke status line captured',
  }
}

/**
 * Run and supervise the headless smoke child. Injectable process primitives
 * keep signal, timeout, spawn-error, and close handling testable without a Host.
 */
export function superviseHeadlessChild({
  executable,
  args,
  cwd,
  env,
  jsonSummary,
  timeoutMs,
  terminationGraceMs = 10_000,
  spawnChild = spawn,
  parent = process,
  stdout = process.stdout,
  stderr = process.stderr,
}) {
  return new Promise((resolve) => {
    let child
    let lastCompleted = null
    let lastFailed = null
    let stdoutBuffer = ''
    let spawnError = null
    let requestedSignal = null
    let timedOut = false
    let closed = false
    let timeoutTimer = null
    let killTimer = null

    const signalHandlers = new Map()

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      if (killTimer) clearTimeout(killTimer)
      for (const [signal, handler] of signalHandlers) parent.removeListener(signal, handler)
    }

    const emitSummary = (code, signal) => {
      const exitCode = timedOut
        ? 124
        : requestedSignal
          ? signalExitCode(requestedSignal)
          : spawnError
            ? 1
            : Number.isInteger(code)
              ? code
              : signalExitCode(signal)
      const error = timedOut
        ? `task timed out after ${timeoutMs}ms`
        : requestedSignal
          ? `interrupted by ${requestedSignal}`
          : spawnError?.message ?? null
      const summary = summaryFor(exitCode, lastCompleted, lastFailed, error)
      if (timedOut) stderr.write(`taskweaver-headless: ${error}\n`)
      else if (spawnError && !jsonSummary) stderr.write(`taskweaver-headless: ${spawnError.message}\n`)
      if (jsonSummary) stdout.write(`${JSON.stringify(summary)}\n`)
      resolve(jsonSummary && !summary.ok ? (exitCode || 1) : exitCode)
    }

    const finish = (code = null, signal = null) => {
      if (closed) return
      closed = true
      cleanup()
      if (stdoutBuffer.trim()) {
        const line = stdoutBuffer.trim()
        stdout.write(`${line}\n`)
        const event = parseJsonLine(line)
        if (event?.status === 'completed') lastCompleted = event
      }
      emitSummary(code, signal)
    }

    const stopChild = (signal, reason) => {
      if (closed || requestedSignal || timedOut) return
      if (reason === 'timeout') timedOut = true
      else requestedSignal = signal
      try { child.kill(signal) } catch (error) { spawnError ??= error }
      killTimer = setTimeout(() => {
        if (closed) return
        try { child.kill('SIGKILL') } catch (error) { spawnError ??= error }
      }, terminationGraceMs)
    }

    try {
      child = spawnChild(executable, args, {
        cwd,
        stdio: jsonSummary ? ['inherit', 'pipe', 'pipe'] : 'inherit',
        env,
      })
    } catch (error) {
      spawnError = error
      finish(1)
      return
    }

    if (jsonSummary) {
      child.stdout?.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          stdout.write(`${line}\n`)
          const event = parseJsonLine(line)
          if (event?.status === 'completed') lastCompleted = event
        }
      })
      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString()
        stderr.write(text)
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          const event = parseJsonLine(line)
          if (event?.status === 'failed') lastFailed = event
        }
      })
    }

    child.on('error', (error) => {
      spawnError = error
      // A spawn failure has no PID and no running child to wait for. Other
      // ChildProcess errors (for example a failed kill) still need close.
      if (child.pid == null) finish(1)
    })
    child.on('close', (code, signal) => finish(code, signal))

    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handler = () => stopChild(signal, 'signal')
      signalHandlers.set(signal, handler)
      parent.on(signal, handler)
    }

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timeoutTimer = setTimeout(() => stopChild('SIGTERM', 'timeout'), timeoutMs)
    }
  })
}
