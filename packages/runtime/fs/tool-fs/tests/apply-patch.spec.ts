import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@taskweaver/cordis'
import { CallId } from '@taskweaver/dsh-llm'
import SystemPrompt from '@taskweaver/dsh-system-prompt'
import ToolRuntime from '@taskweaver/dsh-tools'
import { SandboxedFileSystem } from '@taskweaver/dsh-fs-sandbox'
import SandboxPolicyService from '@taskweaver/dsh-sandbox-policy'
import { parseCodexPatch } from '../src/apply-patch.ts'
import * as ToolFs from '../src/index.ts'

let base = ''
let fibers: Array<Awaited<ReturnType<Context['plugin']>>> = []

afterEach(async () => {
  for (const fiber of fibers.reverse()) await fiber.dispose()
  fibers = []
  if (base) await rm(base, { recursive: true, force: true })
  base = ''
})

async function boot(): Promise<{ ctx: Context; workspace: string; outside: string }> {
  base = await mkdtemp(join(homedir(), '.dsh-apply-patch-'))
  const workspace = join(base, 'workspace')
  const outside = join(base, 'outside')
  await mkdir(workspace)
  await mkdir(outside)
  const ctx = new Context()
  fibers.push(await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: workspace }))
  fibers.push(await ctx.plugin(SystemPrompt))
  fibers.push(await ctx.plugin(ToolRuntime))
  fibers.push(await ctx.plugin(SandboxedFileSystem, { cwd: workspace }))
  fibers.push(await ctx.plugin(ToolFs))
  return { ctx, workspace, outside }
}

function run(ctx: Context, patch: string) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId('apply-patch-test'),
    name: 'apply_patch',
    arguments: { patch },
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

describe('Codex patch parser', () => {
  it('parses add/update directives and rejects destructive directives', () => {
    const parsed = parseCodexPatch([
      '*** Begin Patch',
      '*** Update File: a.txt',
      '@@',
      ' old',
      '-before',
      '+after',
      '*** Add File: b.txt',
      '+new',
      '*** End Patch',
    ].join('\n'))
    expect(parsed.map(file => [file.path, file.operation])).toEqual([['a.txt', 'update'], ['b.txt', 'add']])
    expect(() => parseCodexPatch('*** Begin Patch\n*** Delete File: a.txt\n*** End Patch'))
      .toThrow('file deletion is not supported')
  })
})

describe('apply_patch tool', () => {
  it.skipIf(process.platform === 'win32')('applies a guarded add/update batch inside the workspace', async () => {
    const { ctx, workspace } = await boot()
    const existing = join(workspace, 'existing.txt')
    await writeFile(existing, 'alpha\nold\nomega\n')
    const result = await run(ctx, [
      '*** Begin Patch',
      '*** Update File: existing.txt',
      '@@',
      ' alpha',
      '-old',
      '+new',
      ' omega',
      '*** Add File: added.txt',
      '+created',
      '*** End Patch',
    ].join('\n'))

    expect(result.isError).toBe(false)
    expect(text(result)).toContain('Applied patch to 2 files.')
    expect(await readFile(existing, 'utf8')).toBe('alpha\nnew\nomega\n')
    expect(await readFile(join(workspace, 'added.txt'), 'utf8')).toBe('created\n')
  })

  it.skipIf(process.platform === 'win32')('preserves CRLF when updating an existing file', async () => {
    const { ctx, workspace } = await boot()
    const target = join(workspace, 'windows-lines.txt')
    await writeFile(target, 'alpha\r\nold\r\nomega\r\n')
    const result = await run(ctx, [
      '*** Begin Patch',
      '*** Update File: windows-lines.txt',
      '@@',
      ' alpha',
      '-old',
      '+new',
      ' omega',
      '*** End Patch',
    ].join('\n'))

    expect(result.isError).toBe(false)
    expect(await readFile(target, 'utf8')).toBe('alpha\r\nnew\r\nomega\r\n')
  })

  it.skipIf(process.platform === 'win32')('preserves a missing final newline when updating an LF file', async () => {
    const { ctx, workspace } = await boot()
    const target = join(workspace, 'no-final-newline.txt')
    await writeFile(target, 'old')
    const result = await run(ctx, [
      '*** Begin Patch',
      '*** Update File: no-final-newline.txt',
      '@@',
      '-old',
      '+new',
      '*** End Patch',
    ].join('\n'))

    expect(result.isError).toBe(false)
    expect(await readFile(target, 'utf8')).toBe('new')
  })

  it.skipIf(process.platform === 'win32')('rejects mixed line endings without modifying the file', async () => {
    const { ctx, workspace } = await boot()
    const target = join(workspace, 'mixed-lines.txt')
    const original = 'alpha\r\nold\nomega\r\n'
    await writeFile(target, original)
    const result = await run(ctx, [
      '*** Begin Patch',
      '*** Update File: mixed-lines.txt',
      '@@',
      ' alpha',
      '-old',
      '+new',
      ' omega',
      '*** End Patch',
    ].join('\n'))

    expect(result.isError).toBe(true)
    expect(text(result)).toContain('mixed line endings are unsupported')
    expect(await readFile(target, 'utf8')).toBe(original)
  })

  it.skipIf(process.platform === 'win32')('denies an outside target before publishing an earlier in-workspace add', async () => {
    const { ctx, workspace, outside } = await boot()
    const result = await run(ctx, [
      '*** Begin Patch',
      '*** Add File: first.txt',
      '+first',
      `*** Add File: ${join(outside, 'blocked.txt')}`,
      '+outside',
      '*** End Patch',
    ].join('\n'))

    expect(result.isError).toBe(true)
    expect(text(result)).toContain('[sandbox:')
    await expect(readFile(join(workspace, 'first.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(outside, 'blocked.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
