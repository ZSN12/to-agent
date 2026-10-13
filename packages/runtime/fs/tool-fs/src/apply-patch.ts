/**
 * Model-facing Codex-format multi-file patch tool. All content is prepared in
 * memory and committed through the Host filesystem's sandboxed batch API.
 * @module @taskweaver/dsh-tool-fs/src/apply-patch
 */

import type { Context } from '@taskweaver/cordis'
import { dirname } from 'node:path'
import { defineTool } from '@taskweaver/dsh-tools'
import type { DiffCallView, DiffResultView, ToolResult } from '@taskweaver/dsh-tools'
import { FsError } from '@taskweaver/dsh-fs'
import type { FsTarget, FsTextMutation, FsWriteIntent } from '@taskweaver/dsh-fs'
import type {} from '@taskweaver/dsh-system-prompt'
import { computeHunkDiffs, diffsFromMeta } from './diff.ts'
import { remediateFsError } from './error.ts'
import { sessionResolveOptions } from './session-cwd.ts'
import type { FsSandboxController } from './sandbox.ts'

const MAX_PATCH_BYTES = 1024 * 1024
const MAX_PATCH_FILES = 32
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_RESULT_BYTES = 10 * 1024 * 1024

export interface ParsedPatchFile {
  path: string
  operation: 'add' | 'update'
  content?: string
  hunks?: PatchHunk[]
}

interface PatchLine {
  kind: 'context' | 'remove' | 'add'
  text: string
}

interface PatchHunk {
  lines: PatchLine[]
}

function fail(message: string): never {
  throw new Error(`invalid patch: ${message}`)
}

/** Parse the supported Codex patch subset. Delete/move directives are rejected. */
export function parseCodexPatch(patch: string): ParsedPatchFile[] {
  if (Buffer.byteLength(patch, 'utf8') > MAX_PATCH_BYTES) fail(`patch exceeds ${MAX_PATCH_BYTES} bytes`)
  const lines = patch.split(/\r?\n/u)
  if (lines[0] !== '*** Begin Patch') fail('expected *** Begin Patch')
  const files: ParsedPatchFile[] = []
  const paths = new Set<string>()
  let index = 1

  while (index < lines.length && lines[index] !== '*** End Patch') {
    const header = lines[index++]!
    if (header.startsWith('*** Delete File:')) {
      fail('file deletion is not supported by the rollback-capable batch API')
    }
    if (header.startsWith('*** Add File:')) {
      const path = header.slice('*** Add File:'.length).trim()
      if (!path) fail('add-file path is empty')
      if (paths.has(path)) fail(`duplicate path: ${path}`)
      paths.add(path)
      const added: string[] = []
      while (index < lines.length && (!lines[index]!.startsWith('*** ') || lines[index] === '*** End of File')) {
        const line = lines[index++]!
        if (line === '*** End of File') continue
        if (line === '\\ No newline at end of file') fail('no-newline markers are unsupported')
        if (!line.startsWith('+')) fail(`add-file body must contain only + lines for ${path}`)
        added.push(line.slice(1))
      }
      files.push({ path, operation: 'add', content: added.length === 0 ? '' : `${added.join('\n')}\n` })
      continue
    }
    if (header.startsWith('*** Update File:')) {
      const path = header.slice('*** Update File:'.length).trim()
      if (!path) fail('update-file path is empty')
      if (paths.has(path)) fail(`duplicate path: ${path}`)
      paths.add(path)
      if (index < lines.length && lines[index]!.startsWith('*** Move to:')) {
        fail('file moves are not supported by the rollback-capable batch API')
      }
      const hunks: PatchHunk[] = []
      while (index < lines.length && !lines[index]!.startsWith('*** ')) {
        const marker = lines[index++]!
        if (!marker.startsWith('@@')) fail(`expected @@ hunk marker for ${path}`)
        const hunk: PatchLine[] = []
        while (index < lines.length
          && !lines[index]!.startsWith('@@')
          && (!lines[index]!.startsWith('*** ') || lines[index] === '*** End of File')) {
          const line = lines[index++]!
          if (line === '\\ No newline at end of file') fail('no-newline markers are unsupported')
          if (line === '*** End of File') continue
          const prefix = line[0]
          if (prefix === ' ') hunk.push({ kind: 'context', text: line.slice(1) })
          else if (prefix === '-') hunk.push({ kind: 'remove', text: line.slice(1) })
          else if (prefix === '+') hunk.push({ kind: 'add', text: line.slice(1) })
          else fail(`invalid hunk line for ${path}`)
        }
        if (!hunk.some(line => line.kind !== 'context')) fail(`hunk for ${path} contains no changes`)
        hunks.push({ lines: hunk })
      }
      if (hunks.length === 0) fail(`update for ${path} has no hunks`)
      files.push({ path, operation: 'update', hunks })
      continue
    }
    if (header.startsWith('*** Move to:')) fail('file moves are not supported by the rollback-capable batch API')
    fail(`unsupported directive: ${header}`)
  }

  if (lines[index] !== '*** End Patch') fail('missing *** End Patch')
  index += 1
  if (lines.slice(index).some(line => line.length > 0)) fail('unexpected content after *** End Patch')
  if (files.length === 0) fail('patch contains no files')
  if (files.length > MAX_PATCH_FILES) fail(`patch contains more than ${MAX_PATCH_FILES} files`)
  return files
}

function applyHunks(original: string, hunks: readonly PatchHunk[], path: string): string {
  const trailingNewline = original.endsWith('\n')
  const lines = original.replaceAll('\r\n', '\n').split('\n')
  if (trailingNewline) lines.pop()

  for (const hunk of hunks) {
    const expected = hunk.lines.filter(line => line.kind !== 'add').map(line => line.text)
    const replacement = hunk.lines.filter(line => line.kind !== 'remove').map(line => line.text)
    if (expected.length === 0) fail(`insert-only hunks are unsupported for ${path}; include context`)

    const matches: number[] = []
    for (let start = 0; start <= lines.length - expected.length; start += 1) {
      if (expected.every((line, offset) => lines[start + offset] === line)) matches.push(start)
    }
    if (matches.length === 0) fail(`hunk context did not match ${path}`)
    if (matches.length > 1) fail(`hunk context matched more than once in ${path}`)
    lines.splice(matches[0]!, expected.length, ...replacement)
  }

  const after = `${lines.join('\n')}${trailingNewline && lines.length > 0 ? '\n' : ''}`
  if (after === original.replaceAll('\r\n', '\n')) fail(`patch makes no change to ${path}`)
  return after
}

function decodeText(bytes: Uint8Array, path: string): string {
  if (bytes.includes(0)) throw new FsError(`cannot patch "${path}": binary file`, 'FS_NOT_TEXT')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error: unknown) {
    if (error instanceof TypeError) throw new FsError(`cannot patch "${path}": invalid UTF-8 text`, 'FS_NOT_TEXT', { cause: error })
    throw error
  }
}

interface ApplyPatchArgs {
  patch: string
  sandbox_permissions?: string
  justification?: string
}

interface PreparedFile {
  target: FsTarget
  operation: 'add' | 'update'
  content: string
  expected: FsWriteIntent
}

function outputFor(files: readonly { path: string; operation: 'add' | 'update' }[]): string {
  const noun = files.length === 1 ? 'file' : 'files'
  const paths = files.map(({ path, operation }) => `${operation === 'add' ? 'Added' : 'Updated'} ${path}`)
  return `<type>file_changes</type>\n<content>\nApplied patch to ${files.length} ${noun}.\n${paths.join('\n')}\n</content>`
}

export function applyApplyPatchTool(ctx: Context, sandbox: FsSandboxController): void {
  ctx.systemPrompt.section({
    name: 'tool:apply_patch',
    order: 103,
    text: 'Use apply_patch for a focused multi-file change using Codex patch format. It supports add and update directives only; deletion, moves, symlinks, missing parent directories, and ambiguous hunks are rejected. Every file is checked before the batch is staged. The Host attempts in-process rollback on publication failure, but ordinary filesystems cannot make multiple paths appear atomically to external readers.',
  })

  ctx.tools.register(defineTool({
    name: 'apply_patch',
    description: 'Apply a Codex-format patch that adds or updates multiple UTF-8 text files through the Host filesystem permissions.',
    parameters: {
      patch: { type: 'string', required: true, description: 'Codex patch text beginning with *** Begin Patch and ending with *** End Patch.' },
      ...sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {},
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          files: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                operation: { type: 'string', required: true, enum: ['add', 'update'] },
                before: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
                after: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: outputFor(value.files) }],
      presentationMeta: (_args, value) => ({
        diffs: value.files.flatMap(file => file.before === null
          ? []
          : computeHunkDiffs(file.path, file.before, file.after).map(({ path, oldText, newText }) => ({ path, oldText, newText }))),
      }),
    },
    async execute(args: ApplyPatchArgs, exec) {
      const sandboxPolicy = await sandbox.resolvePolicy('apply_patch', args, exec)
      try {
        const parsed = parseCodexPatch(args.patch)
        const prepared: PreparedFile[] = []
        const seenTargets = new Set<string>()
        let totalResultBytes = 0

        for (const file of parsed) {
          const options = sessionResolveOptions(exec, file.path, sandboxPolicy?.workspaceRoot)
          const pathInfo = await ctx.fs.lstat(file.path, options, exec.signal)
          if (pathInfo?.type === 'symlink') {
            throw new FsError(`cannot patch "${file.path}": symbolic-link targets are unsupported`, 'FS_TRANSACTION_UNSUPPORTED')
          }
          const target = await ctx.fs.resolve(file.path, options)
          if (seenTargets.has(target.targetKey)) {
            throw new FsError(`patch resolves more than once to "${target.displayPath}"`, 'FS_TRANSACTION_UNSUPPORTED')
          }
          seenTargets.add(target.targetKey)

          const info = await ctx.fs.stat(target, exec.signal)
          let content: string
          let expected: FsWriteIntent
          if (info === undefined) {
            if (file.operation !== 'add') {
              ctx.emit('fs/observed', target, { kind: 'absent' }, exec)
              throw new FsError(`cannot update "${target.displayPath}": file does not exist`, 'FS_NOT_FOUND')
            }
            const parent = await ctx.fs.resolve(dirname(target.displayPath), options)
            const parentInfo = await ctx.fs.stat(parent, exec.signal)
            if (parentInfo?.type !== 'directory') {
              throw new FsError(`cannot add "${target.displayPath}": parent directory must already exist`, 'FS_NOT_DIRECTORY')
            }
            ctx.emit('fs/observed', target, { kind: 'absent' }, exec)
            expected = await ctx.waterfall('fs/write-intent', target, exec, () => ({ kind: 'createIfAbsent' as const }))
              ?? { kind: 'createIfAbsent' }
            content = file.content ?? ''
          } else {
            if (info.type !== 'file') throw new FsError(`cannot patch "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
            if (file.operation !== 'update') {
              throw new FsError(`cannot add "${target.displayPath}": target already exists`, 'FS_NOT_OBSERVED')
            }
            if (info.size !== undefined && info.size > MAX_FILE_BYTES) {
              throw new FsError(`cannot patch "${target.displayPath}": file exceeds ${MAX_FILE_BYTES} bytes`, 'FS_TOO_LARGE')
            }
            const bytes = await ctx.fs.readBytes(target, exec.signal, MAX_FILE_BYTES)
            const original = decodeText(bytes, target.displayPath)
            ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
            content = applyHunks(original, file.hunks ?? [], target.displayPath)
            expected = await ctx.waterfall('fs/write-intent', target, exec, () => ({
              kind: 'replaceIfVersion' as const,
              version: info.version,
            })) ?? { kind: 'replaceIfVersion', version: info.version }
          }
          const resultBytes = Buffer.byteLength(content, 'utf8')
          if (resultBytes > MAX_FILE_BYTES) {
            throw new FsError(`cannot patch "${target.displayPath}": result exceeds ${MAX_FILE_BYTES} bytes`, 'FS_TOO_LARGE')
          }
          totalResultBytes += resultBytes
          if (totalResultBytes > MAX_TOTAL_RESULT_BYTES) {
            throw new FsError(`patch results exceed ${MAX_TOTAL_RESULT_BYTES} bytes`, 'FS_TOO_LARGE')
          }
          prepared.push({ target, operation: file.operation, content, expected })
        }

        const mutations: FsTextMutation[] = prepared.map(({ target, content, expected }) => ({ target, content, expected }))
        const outcomes = await ctx.fs.applyTextTransaction(mutations, exec.signal, sandboxPolicy)
        for (const outcome of outcomes) {
          ctx.emit('fs/observed', outcome.target, { kind: 'present', version: outcome.version }, exec)
        }
        return {
          files: outcomes.map(({ target, operation, before, after }) => ({
            path: target.displayPath,
            operation: operation === 'create' ? 'add' as const : 'update' as const,
            before,
            after,
          })),
        }
      } catch (error: unknown) {
        throw remediateFsError(sandbox.mapError(error, sandboxPolicy))
      }
    },
    presentCall(_args): DiffCallView {
      return { card: 'diff', title: 'Apply patch', diffs: [], locations: [] }
    },
    presentResult(_args, result: ToolResult): DiffResultView | undefined {
      if (result.isError) return undefined
      const diffs = diffsFromMeta(result.meta)
      return diffs === undefined ? undefined : { card: 'diff', title: 'Apply patch', diffs }
    },
  }))
}
