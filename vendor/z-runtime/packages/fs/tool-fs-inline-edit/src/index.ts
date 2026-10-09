import type { Context } from '@z/cordis'
import { defineTool } from '@z/dsh-tools'
import type { DiffCallView, JsonValue } from '@z/dsh-tools'
import { computeHunkDiffs, FsSandboxController, sessionResolveOptions } from '@z/dsh-tool-fs'
import type {} from '@z/dsh-fs'
import type {} from '@z/dsh-system-prompt'

export const name = 'tool-fs-inline-edit'
export const inject = ['tools', 'fs', 'systemPrompt']
interface Args { file_path: string; old_string: string; new_string: string; preview?: boolean; sandbox_permissions?: string; justification?: string }
interface Result { path: string; before: string; after: string; preview: boolean }

export function apply(ctx: Context): void {
  const sandbox = new FsSandboxController(ctx)
  ctx.systemPrompt.section({ name: 'tool:edit_file_inline', order: 103, text: 'Use edit_file_inline to preview a contextual diff before applying a targeted replacement. Preview is read-only by default; set preview=false to apply.' })
  ctx.tools.register(defineTool({
    name: 'edit_file_inline',
    description: 'Preview a contextual diff for a unique text replacement, then explicitly apply it with preview=false.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'File path resolved within the session workspace.' },
      old_string: { type: 'string', required: true, description: 'Exact non-empty text to replace; must occur once.' },
      new_string: { type: 'string', required: true, description: 'Replacement text.' },
      preview: { type: 'boolean', description: 'Show diff without changing the file; defaults to true.' },
      ...sandbox.escalationModes.length ? sandbox.schemaFields() : {},
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        path: { type: 'string', required: true }, before: { type: 'string', required: true },
        after: { type: 'string', required: true }, preview: { type: 'boolean', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: value.preview ? `Preview only; no changes made to ${value.path}. Set preview=false to apply.` : `Applied inline edit to ${value.path}.` }],
      presentationMeta: (_args, value) => JSON.parse(JSON.stringify({ diffs: computeHunkDiffs(value.path, value.before, value.after) })) as JsonValue,
    },
    async execute(args: Args, exec): Promise<Result> {
      if (!args.file_path.trim() || !args.old_string) throw new Error('file_path and old_string must be non-empty')
      if (args.old_string === args.new_string) throw new Error('old_string and new_string must differ')
      const preview = args.preview ?? true
      const policy = preview ? undefined : await sandbox.resolvePolicy('edit_file_inline', args, exec)
      const target = await ctx.fs.resolve(args.file_path, sessionResolveOptions(exec, args.file_path, policy?.workspaceRoot))
      const info = await ctx.fs.stat(target, exec.signal)
      if (!info || info.type !== 'file') throw new Error(`Not a regular file: ${target.displayPath}`)
      if ((info.size ?? 0) > 256 * 1024) throw new Error('Inline edit supports files up to 256 KiB')
      const before = await ctx.fs.readText(target, exec.signal)
      ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
      const offset = before.indexOf(args.old_string)
      if (offset < 0) throw new Error('old_string not found; reread the file and retry')
      if (before.indexOf(args.old_string, offset + args.old_string.length) >= 0) throw new Error('old_string is ambiguous; include more context')
      const after = before.slice(0, offset) + args.new_string + before.slice(offset + args.old_string.length)
      if (!preview) {
        try {
          const intent = await ctx.waterfall('fs/edit-intent', target, exec, () => undefined)
          const outcome = await ctx.fs.editText(target, { oldString: args.old_string, newString: args.new_string, replaceAll: false }, intent, exec.signal, policy)
          ctx.emit('fs/observed', target, { kind: 'present', version: outcome.version }, exec)
        } catch (error) { throw sandbox.mapError(error, policy) }
      }
      return { path: target.displayPath, before, after, preview }
    },
    presentCall(args): DiffCallView { return { card: 'diff', title: `${args.preview === false ? 'Edit' : 'Preview'} ${args.file_path}`, diffs: [{ path: args.file_path, oldText: args.old_string, newText: args.new_string }] } },
  }))
}
