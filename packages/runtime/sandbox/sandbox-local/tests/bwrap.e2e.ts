import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@taskweaver/cordis'
import type { SandboxPolicy } from '@taskweaver/dsh-sandbox'
import { LocalSandboxProvider } from '@taskweaver/dsh-sandbox-local'
import { bwrapProfileArgs } from '../src/profiles.ts'

/**
 * Keyless backend integration through `confine()` and a real bwrap process. On Linux the sole
 * bwrap rung is selected directly. Tests assert world effects, wrap shape, and that the
 * kernel denial matches the advertised dialect; consumer coverage lives in dsh-bash-sandbox.
 * Skips when bwrap or user namespaces are unavailable. HOME-based workspaces avoid bwrap's
 * ephemeral `/tmp`, so workspace-write actually proves the workspace-root rebind.
 */

const probe = spawnSync('bwrap', [...bwrapProfileArgs({ mode: 'read-only', workspaceRoot: '/' }), '--', 'true'], { timeout: 5_000, stdio: 'ignore' })
const bwrapUsable = probe.status === 0

let ctx: Context | undefined
const tempDirs: string[] = []
const tempFiles: string[] = []

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  for (const file of tempFiles.splice(0)) rmSync(file, { force: true })
})

async function tempDir(base: string): Promise<string> {
  const dir = await mkdtemp(join(base, 'dsh-bwrap-e2e-'))
  tempDirs.push(dir)
  return dir
}

async function provider(): Promise<LocalSandboxProvider> {
  ctx = new Context()
  await ctx.plugin(LocalSandboxProvider, {})
  return ctx.sandbox as LocalSandboxProvider
}

async function startBackgroundProcess(script: string, args: string[] = []): Promise<{ child: ChildProcess; ready: string }> {
  const child = spawn(process.execPath, ['-e', script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  child.stderr?.resume()
  const lines = createInterface({ input: child.stdout! })
  const ready = await new Promise<string>((resolve, reject) => {
    lines.once('line', resolve)
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`background server exited before ready (${code})`)))
  })
  return { child, ready }
}

async function stopBackgroundProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await once(child, 'exit')
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/** Confine a shell command under `policy` and run it for real; returns the spawn result and the wrap's facts. */
function runConfined(sandbox: LocalSandboxProvider, command: string, policy: SandboxPolicy) {
  const confined = sandbox.confine(['bash', '-c', command], policy)
  const result = spawnSync(confined.argv[0] as string, confined.argv.slice(1), { timeout: 30_000, encoding: 'utf8' })
  return { result, confined }
}

describe.skipIf(!bwrapUsable)('sandbox-local: real bwrap confinement', () => {
  it('the passing probe selects the bwrap rung naturally — first in the ladder, full enforcement, EROFS dialect', async () => {
    const workdir = await tempDir(tmpdir())
    const sandbox = await provider()
    const confined = sandbox.confine(['true'], { mode: 'read-only', workspaceRoot: workdir })
    expect(confined.argv[0]).toBe('bwrap')
    expect(confined.enforcement).toBe('full')
    expect(confined.denialSignatures).toEqual(['read-only file system'])
  })

  it('read-only denies a write — the file must NOT exist, and the kernel speaks the advertised dialect', async () => {
    const workdir = await tempDir(tmpdir())
    const sandbox = await provider()
    const { result } = runConfined(sandbox, `echo hi > ${workdir}/denied.txt`, { mode: 'read-only', workspaceRoot: workdir })
    expect(result.status).not.toBe(0)
    // The wrap's denialSignatures must be what the kernel actually prints.
    expect(result.stderr.toLowerCase()).toContain('read-only file system')
    expect(existsSync(join(workdir, 'denied.txt'))).toBe(false)
  })

  it('read-only keeps the tree readable/executable and the fresh /dev/null writable', async () => {
    const workdir = await tempDir(tmpdir())
    const sandbox = await provider()
    const { result } = runConfined(sandbox, 'ls / > /dev/null && echo dev-ok', { mode: 'read-only', workspaceRoot: workdir })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('dev-ok\n')
  })

  it.each(['read-only', 'workspace-write'] as const)(
    '%s runs in a private PID namespace and blocks writes through procfs root magic links',
    async (mode) => {
      const workdir = await tempDir(homedir())
      const outside = await tempDir(homedir())
      const target = join(outside, 'escaped.txt')
      const sandbox = await provider()
      // Compare PID-namespace identity, not PID numbers: numeric /proc entries
      // recur inside a private namespace, and the /proc/1/root write below is
      // denied even in a shared namespace (host init is root-owned), so this
      // comparison is the assertion that fails when --unshare-pid is lost.
      const hostPidNamespace = readlinkSync('/proc/self/ns/pid')
      const visibility = runConfined(sandbox, 'readlink /proc/self/ns/pid', { mode, workspaceRoot: workdir })
      expect(visibility.result.status).toBe(0)
      expect(visibility.result.stdout.trim()).not.toBe('')
      expect(visibility.result.stdout.trim()).not.toBe(hostPidNamespace)

      const escape = runConfined(
        sandbox,
        `printf escaped > /proc/1/root${target}`,
        { mode, workspaceRoot: workdir },
      )
      expect(escape.result.status).not.toBe(0)
      expect(existsSync(target)).toBe(false)
    },
  )

  it('keeps descendants observable and controllable inside the private PID namespace', async () => {
    const workdir = await tempDir(homedir())
    const sandbox = await provider()
    const { result } = runConfined(
      sandbox,
      'sleep 30 & child=$!; kill -0 "$child" && kill "$child"; wait "$child"; status=$?; test "$status" -ge 128',
      { mode: 'read-only', workspaceRoot: workdir },
    )
    expect(result.status).toBe(0)
  })

  it('workspace-write lands a write inside the workspace root and still denies one beside it', async () => {
    const workdir = await tempDir(homedir())
    const outside = await tempDir(homedir())
    const sandbox = await provider()

    const inside = runConfined(sandbox, `printf bwrap-ok > ${workdir}/allowed.txt`, { mode: 'workspace-write', workspaceRoot: workdir })
    expect(inside.result.status).toBe(0)
    expect(readFileSync(join(workdir, 'allowed.txt'), 'utf8')).toBe('bwrap-ok')

    const denied = runConfined(sandbox, `echo hi > ${outside}/denied.txt`, { mode: 'workspace-write', workspaceRoot: workdir })
    expect(denied.result.status).not.toBe(0)
    expect(existsSync(join(outside, 'denied.txt'))).toBe(false)
  })

  it('workspace-write mounts an EPHEMERAL /tmp: the write succeeds inside, the host /tmp stays untouched', async () => {
    // bwrap swaps in a fresh tmpfs that dies with the process; Seatbelt grants
    // the host temp areas instead.
    const workdir = await tempDir(homedir())
    const target = `/tmp/dsh-bwrap-e2e-ephemeral-${process.pid}.txt`
    tempFiles.push(target)
    const sandbox = await provider()
    const { result } = runConfined(sandbox, `printf tmp-ok > ${target} && cat ${target}`, { mode: 'workspace-write', workspaceRoot: workdir })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('tmp-ok')
    expect(existsSync(target)).toBe(false)
  })

  it('workspace-write blocks TCP network requests while keeping local Unix sockets available', async () => {
    const mode = 'workspace-write'
    const workdir = await tempDir(homedir())
    const sandbox = await provider()
    const policy = { mode, workspaceRoot: workdir } as const
    const http = await startBackgroundProcess(
      'const s=require("node:http").createServer((_q,r)=>r.end("ok"));s.listen(0,"127.0.0.1",()=>process.stdout.write(String(s.address().port)+"\\n"))',
    )
    const url = `http://127.0.0.1:${http.ready}/`
    try {
      expect((await fetch(url)).status).toBe(200)

      const hostNetworkNamespace = readlinkSync('/proc/self/ns/net')
      const networkNamespace = runConfined(sandbox, 'readlink /proc/self/ns/net', policy)
      expect(networkNamespace.result.status).toBe(0)
      expect(networkNamespace.result.stdout.trim()).not.toBe(hostNetworkNamespace)

      const fetchScript = `fetch(${JSON.stringify(url)})`
      const network = runConfined(sandbox, `node -e ${shellQuote(fetchScript)}`, policy)
      expect(network.result.status).not.toBe(0)
      expect(network.confined.denialSignatures.some(signature => network.result.stderr.toLowerCase().includes(signature.toLowerCase()))).toBe(true)

      if (spawnSync('curl', ['--version'], { stdio: 'ignore' }).status === 0) {
        const curl = runConfined(sandbox, `curl --max-time 2 --fail --silent --show-error ${shellQuote(url)}`, policy)
        expect(curl.result.status).not.toBe(0)
        expect(curl.confined.denialSignatures.some(signature => curl.result.stderr.toLowerCase().includes(signature.toLowerCase()))).toBe(true)
      }
    } finally {
      await stopBackgroundProcess(http.child)
    }

    const socketPath = join(workdir, 'local-ipc.sock')
    const socket = await startBackgroundProcess(
      'const s=require("node:net").createServer(c=>c.end("ok"));s.listen(process.argv[1],()=>process.stdout.write("ready\\n"))',
      [socketPath],
    )
    try {
      const socketScript = 'const s=require("node:net").createConnection(process.argv[1]);let d="";s.on("data",c=>d+=c);s.on("end",()=>process.exit(d==="ok"?0:1));s.on("error",()=>process.exit(2))'
      const localIpc = runConfined(sandbox, `node -e ${shellQuote(socketScript)} ${shellQuote(socketPath)}`, policy)
      expect(localIpc.result.status).toBe(0)
      expect(socket.ready).toBe('ready')
    } finally {
      await stopBackgroundProcess(socket.child)
    }
  })
})
