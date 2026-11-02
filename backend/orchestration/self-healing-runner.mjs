import { executeVerificationRunner } from '../verification-policy.mjs'
import { verificationSandboxPolicy } from '../sandbox-policy.mjs'
import { compactToolOutput } from '../context-compactor.mjs'

export function createVerificationResult({
  status,
  executed = false,
  command = null,
  passed = false,
  exitCode = null,
  ...details
}) {
  return { status, executed, command, passed, exitCode, ...details }
}

export function shouldRunSelfHealingVerification({
  selfHealingEnabled,
  taskType,
  hasFileChanges,
  hasVerification,
  workspaceTrusted,
  permissionMode,
  execCwd,
}) {
  return selfHealingEnabled === true
    && (taskType === 'implementation' || taskType === 'test')
    && hasFileChanges === true
    && hasVerification !== true
    && Boolean(execCwd)
    && workspaceTrusted === true
    && permissionMode !== 'readonly'
}

/**
 * 执行轻量级自愈自检，处理取消、超时、输出压缩并格式化注入警告。
 */
export async function runSelfHealingVerification({
  execCwd,
  signal,
  permissionMode,
  bashSandbox,
  modelContextWindow = null,
  modelKey = null,
  timeoutMs = 25_000,
}) {
  const verifyRes = await executeVerificationRunner(execCwd, {
    timeoutMs,
    signal,
    sandboxPolicy: verificationSandboxPolicy({
      workspacePath: execCwd,
      permissionMode,
      bashSandbox,
    }),
  })

  if (verifyRes.cancelled || signal?.aborted) {
    throw signal?.reason ?? new Error('任务已取消')
  }

  const verification = createVerificationResult({
    status: verifyRes.status,
    executed: verifyRes.executed,
    command: verifyRes.command,
    passed: verifyRes.passed,
    exitCode: verifyRes.exitCode,
    durationMs: verifyRes.durationMs,
  })

  let warningNotice = null
  if (verifyRes.executed && !verifyRes.passed) {
    const rawError = verifyRes.errorSummary || verifyRes.stderr || verifyRes.stdout || ''
    const compacted = compactToolOutput(rawError, {
      contextWindow: modelContextWindow,
      toolName: verifyRes.command || 'verification',
    })
    warningNotice = `\n\n> [!WARNING]\n> **轻量自检未通过**（\`${verifyRes.command}\`，退出码 ${verifyRes.exitCode}）：\n\`\`\`\n${compacted.text}\n\`\`\``
  }

  return {
    verification,
    warningNotice,
  }
}
