import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export function launchAgentLabel(jobId) {
  const safe = String(jobId).replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 48)
  return `com.taskweaver.scheduled.${safe}`
}

export function launchAgentPlistPath(label) {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
}

/**
 * @param {{ id: string, intervalMinutes: number }} job
 * @param {{ userDataPath: string, nodePath?: string }} options
 */
export function buildLaunchAgentPlist(job, options) {
  const label = launchAgentLabel(job.id)
  const node = options.nodePath || process.execPath
  const runner = path.join(PROJECT_ROOT, 'scripts', 'run-scheduled-job-cli.mjs')
  const intervalSec = Math.max(300, Math.round((job.intervalMinutes || 60) * 60))
  const args = [
    runner,
    '--job-id',
    job.id,
    '--user-data',
    options.userDataPath,
  ]
  const programArguments = [node, ...args]
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(PROJECT_ROOT)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TASKWEAVER_USER_DATA</key>
    <string>${escapeXml(options.userDataPath)}</string>
    <key>PATH</key>
    <string>${escapeXml(process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin')}</string>
  </dict>
  <key>StartInterval</key>
  <integer>${intervalSec}</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(options.userDataPath, 'logs', `scheduled-${job.id}.out.log`))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(options.userDataPath, 'logs', `scheduled-${job.id}.err.log`))}</string>
</dict>
</plist>
`
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function runLaunchctl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('launchctl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(stderr.trim() || `launchctl exit ${code}`))
    })
  })
}

export async function installJobLaunchAgent(job, userDataPath) {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'unsupported-platform' }
  }
  await fs.mkdir(path.join(userDataPath, 'logs'), { recursive: true })
  const label = launchAgentLabel(job.id)
  const plistPath = launchAgentPlistPath(label)
  const xml = buildLaunchAgentPlist(job, { userDataPath })
  await fs.writeFile(plistPath, xml, 'utf8')
  try {
    await runLaunchctl(['bootout', `gui/${process.getuid()}`, plistPath])
  } catch {
    /* not loaded */
  }
  await runLaunchctl(['bootstrap', `gui/${process.getuid()}`, plistPath])
  return { ok: true, label, plistPath }
}

export async function removeJobLaunchAgent(jobId) {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'unsupported-platform' }
  }
  const label = launchAgentLabel(jobId)
  const plistPath = launchAgentPlistPath(label)
  try {
    await runLaunchctl(['bootout', `gui/${process.getuid()}`, plistPath])
  } catch {
    /* ignore */
  }
  try {
    await fs.unlink(plistPath)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return { ok: true, label }
}

export async function isJobLaunchAgentInstalled(jobId) {
  if (process.platform !== 'darwin') return false
  try {
    await fs.access(launchAgentPlistPath(launchAgentLabel(jobId)))
    return true
  } catch {
    return false
  }
}
