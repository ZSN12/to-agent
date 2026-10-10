import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@taskweaver/cordis'
import { SandboxProvider } from '@taskweaver/dsh-sandbox'
import type { ConfinedArgv, SandboxPolicy } from '@taskweaver/dsh-sandbox'
import { SandboxPolicyService } from '@taskweaver/dsh-sandbox-policy'
import type { CodeBindingNamespace } from '@taskweaver/dsh-code-runtime'
import { discoverPython3, isCommandLineToolsStub, PythonCodeRuntime } from '../src/python-runtime.ts'

const canaryKey = 'TASKWEAVER_PYTHON_RUNTIME_TEST_SECRET'
const priorCanary = process.env[canaryKey]

afterEach(() => {
  if (priorCanary === undefined) delete process.env[canaryKey]
  else process.env[canaryKey] = priorCanary
})

async function setup(config: ConstructorParameters<typeof PythonCodeRuntime>[1] = {}) {
  const confined: Array<{ argv: string[]; policy: SandboxPolicy }> = []
  class FakeSandboxProvider extends SandboxProvider {
    confine(argv: readonly string[], policy: SandboxPolicy): ConfinedArgv {
      confined.push({ argv: [...argv], policy })
      return { argv: [...argv], enforcement: 'full', denialSignatures: [], runnerFailureRules: [] }
    }
  }
  const ctx = new Context()
  await ctx.plugin(FakeSandboxProvider)
  await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: process.cwd() })
  await ctx.plugin(PythonCodeRuntime, config)
  return { ctx, runtime: ctx.codeRuntime as PythonCodeRuntime, confined }
}

const tools = (functions: Record<string, (args: unknown) => Promise<unknown>>): CodeBindingNamespace[] => [{
  global: 'tools',
  functions,
  errorClass: { name: 'ToolCallError', memberNameProperty: 'toolName' },
}]

describe('PythonCodeRuntime', () => {
  it('uses a user python3, confines its argv with the per-run policy, and bridges logs, calls, and results', async () => {
    const { ctx, runtime, confined } = await setup()
    try {
      const result = await runtime.run({
        program: `
print('hello from python')
echoed = await tools.echo({'value': 41})
return {'answer': echoed['value'] + 1}
`,
        bindings: tools({ echo: async args => args }),
        sandboxPolicy: { mode: 'workspace-write', workspaceRoot: process.cwd() },
      })

      expect(runtime.language).toBe('python')
      expect(runtime.isolation).toBe('process')
      expect(result.logs.join('')).toBe('hello from python\n')
      expect(result.value).toEqual({ answer: 42 })
      expect(confined).toHaveLength(1)
      expect(confined[0]?.argv.slice(1)).toEqual(['-I', '-B', expect.stringMatching(/[/\\]py[/\\]runner\.py$/)])
      expect(confined[0]?.policy).toEqual({ mode: 'workspace-write', workspaceRoot: process.cwd() })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('does not pass the host environment or credentials into the Python process', async () => {
    process.env[canaryKey] = 'test-only-secret-canary'
    const { ctx, runtime } = await setup()
    try {
      const result = await runtime.run({
        program: `import os\nreturn os.environ.get(${JSON.stringify(canaryKey)})`,
        bindings: [],
      })
      expect(result.error).toBeUndefined()
      expect(result.value).toBeNull()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('turns wall timeout and AbortSignal into failures and tears down the subprocess', async () => {
    const { ctx, runtime } = await setup({ maxWallMs: 300, cpuSeconds: 30 })
    try {
      const timedOut = await runtime.run({ program: 'while True: pass', bindings: [] })
      expect(timedOut.error?.kind).toBe('timeout')

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort('test cancelled'), 80)
      const aborted = await runtime.run({ program: 'while True: pass', bindings: [], signal: controller.signal })
      clearTimeout(timer)
      expect(aborted.error?.kind).toBe('abort')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('caps child logs and returns the shared truncation marker', async () => {
    const { ctx, runtime } = await setup({ maxLogBytes: 512 })
    try {
      const result = await runtime.run({ program: "print('x' * 2000)", bindings: [] })
      expect(result.error?.kind).toBe('output-limit')
      expect(result.logs.at(-1)).toBe('[dsh-code-runtime-python] log capture truncated at 512 bytes')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('reports missing Python and recognizes the macOS Command Line Tools placeholder', async () => {
    const missing = await discoverPython3('', 'darwin')
    expect(missing).toMatchObject({ error: expect.stringContaining('Install CPython 3.9 or newer') })
    expect(await discoverPython3('', 'win32')).toMatchObject({ error: expect.stringContaining('does not support Windows') })
    expect(isCommandLineToolsStub('/Library/Developer/CommandLineTools/usr/bin/python3', 'not runnable')).toBe(true)
    expect(isCommandLineToolsStub('/usr/local/bin/python3', 'xcode-select: no developer tools were found')).toBe(true)
    expect(isCommandLineToolsStub('/opt/homebrew/bin/python3', 'Python 3.12.1')).toBe(false)
  })
})
