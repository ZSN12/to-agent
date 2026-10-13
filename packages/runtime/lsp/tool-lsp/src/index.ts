/**
 * Model-facing `lsp` tool over `ctx.lsp`. One read-only tool with four operations
 * (`goToDefinition`/`findReferences`/`goToImplementation`/`hover`); it converts one-based UTF-16
 * cursor coordinates to the seam's zero-based positions, requires the session workspace with no
 * fallback, caps and renders results, and attaches a configurable timeout budget for
 * `dsh-tool-call-timeout-policy` to enforce. It runtime-injects only `tools`, `lsp`, and `systemPrompt` and
 * imports no provider.
 *
 * Namespace plugin (named exports, no default export).
 * @module @taskweaver/dsh-tool-lsp
 */

import type { Context } from '@taskweaver/cordis'
import z from '@taskweaver/schemastery'
import { defineTool } from '@taskweaver/dsh-tools'
import type { PostToolDecision, ToolExecution } from '@taskweaver/dsh-tools'
import { assertNever } from '@taskweaver/dsh-llm'
import { LspError, MAX_DIAGNOSTICS_WAIT_MS } from '@taskweaver/dsh-lsp'
import type { LspDiagnostic } from '@taskweaver/dsh-lsp'
import type {} from '@taskweaver/dsh-lsp'
import type {} from '@taskweaver/dsh-system-prompt'
import { MAX_TIMER_DELAY_MS } from '@taskweaver/dsh-timeout'
import {
  DEFAULT_MAX_LOCATIONS,
  DEFAULT_MAX_RESULT_CHARS,
  formatHover,
  formatLocations,
  LSP_OPERATIONS,
  parseLspArgs,
  presentLspCall,
} from './render.ts'
import { sessionCwd } from './session-cwd.ts'

export {
  DEFAULT_MAX_LOCATIONS,
  DEFAULT_MAX_RESULT_CHARS,
  formatHover,
  formatLocations,
  LSP_OPERATIONS,
  parseLspArgs,
  presentLspCall,
  renderUri,
} from './render.ts'
export { sessionCwd } from './session-cwd.ts'

/** Cordis plugin name for loader diagnostics. */
export const name = 'tool-lsp'

/** Services required by this plugin. */
export const inject = ['tools', 'lsp', 'systemPrompt']

/** Default tool-call timeout budget (ms), covering the queued open/query/close lifecycle. */
export const DEFAULT_LSP_TOOL_TIMEOUT_MS = 60_000
const MAX_POST_EDIT_DIAGNOSTICS = 5
const MAX_POST_EDIT_DIAGNOSTICS_SCANNED = 100
const MAX_POST_EDIT_DIAGNOSTIC_MESSAGE_CHARS = 400
const MAX_POST_PATCH_DIAGNOSTIC_FILES = 8
const POST_EDIT_TOOLS: ReadonlySet<string> = new Set(['edit', 'write', 'apply_patch'])
const PATCH_FILE_DIRECTIVES = ['*** Add File:', '*** Update File:'] as const

/** The stable system-prompt guidance positioning LSP as a precision aid. */
export const LSP_PROMPT_TEXT =
  'Use search/read for ordinary navigation. Use lsp when textual matches are ambiguous or before a change requires precise definitions, implementations, or references. Positions are one-based line and character (UTF-16) at the cursor; an off-symbol position may return no results. findReferences always includes the declaration.'

/** Plugin configuration: result caps and the timeout budget. */
export interface Config {
  /** Largest number of rendered locations before an omission marker (default 100). */
  maxLocations?: number
  /** Largest complete rendered result in characters, including truncation metadata (default 16000). */
  maxResultChars?: number
  /** Tool-call timeout budget in ms (default 60000). */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  maxLocations: z.number().default(DEFAULT_MAX_LOCATIONS),
  maxResultChars: z.number().default(DEFAULT_MAX_RESULT_CHARS),
  timeoutMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_LSP_TOOL_TIMEOUT_MS),
})

type ResolvedConfig = Required<Config>

const LSP_POSITION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    line: { type: 'integer', required: true },
    character: { type: 'integer', required: true },
  },
} as const

const LSP_RANGE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    start: { ...LSP_POSITION_OUTPUT_SCHEMA, required: true },
    end: { ...LSP_POSITION_OUTPUT_SCHEMA, required: true },
  },
} as const

/**
 * Register the `lsp` tool and its system-prompt guidance.
 * @param ctx - the plugin context (must inject `tools`, `lsp`, `systemPrompt`).
 * @param config - the resolved plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  assertPositiveInteger('maxLocations', resolved.maxLocations)
  assertPositiveInteger('maxResultChars', resolved.maxResultChars)
  assertTimer('timeoutMs', resolved.timeoutMs)

  ctx.systemPrompt.section({ name: 'tool:lsp', order: 112, text: LSP_PROMPT_TEXT })

  ctx.tools.register(defineTool({
    name: 'lsp',
    description:
      'Query a language server for precise code navigation. operation is one of goToDefinition, findReferences, goToImplementation, hover. line and character are one-based UTF-16 cursor coordinates. findReferences includes the declaration.',
    parameters: {
      operation: {
        type: 'string',
        required: true,
        enum: [...LSP_OPERATIONS],
        description: 'goToDefinition, findReferences, goToImplementation, or hover.',
      },
      file_path: { type: 'string', required: true, description: 'The source file to query, relative to the workspace or absolute.' },
      line: { type: 'number', required: true, description: 'One-based line of the cursor.' },
      character: { type: 'number', required: true, description: 'One-based UTF-16 column of the cursor.' },
    },
    output: {
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'locations' },
              locations: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    uri: { type: 'string', required: true },
                    range: { ...LSP_RANGE_OUTPUT_SCHEMA, required: true },
                  },
                },
              },
              resolvedWorkspaceUri: { type: 'string', required: true },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'hover' },
              hover: {
                required: true,
                oneOf: [
                  { type: 'null' },
                  {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      contents: { type: 'string', required: true },
                      range: LSP_RANGE_OUTPUT_SCHEMA,
                    },
                  },
                ],
              },
            },
          },
        ],
      },
      render: (_args, value) => {
        switch (value.kind) {
          case 'locations':
            return [{ type: 'text', text: formatLocations(value.locations, value.resolvedWorkspaceUri, resolved.maxLocations, resolved.maxResultChars) }]
          case 'hover':
            return [{ type: 'text', text: formatHover(value.hover, resolved.maxResultChars) }]
          /* v8 ignore next -- exhaustive over the output schema's closed union; unreachable. */
          default:
            return assertNever(value, 'tool-lsp output')
        }
      },
    },
    timeoutMs: resolved.timeoutMs,
    async execute(args, exec) {
      const input = parseLspArgs(args)
      const workspaceRoot = sessionCwd(exec)
      if (workspaceRoot === undefined) {
        throw new LspError('the lsp tool requires a session workspace cwd', 'LSP_WORKSPACE_REQUIRED')
      }
      const result = await ctx.lsp.query({
        operation: input.operation,
        filePath: input.filePath,
        position: input.position,
        workspaceRoot,
      }, exec.signal)
      switch (result.kind) {
        case 'locations':
          return {
            kind: 'locations' as const,
            locations: result.locations.map(location => ({
              uri: location.uri,
              range: {
                start: { line: location.range.start.line, character: location.range.start.character },
                end: { line: location.range.end.line, character: location.range.end.character },
              },
            })),
            resolvedWorkspaceUri: result.resolvedWorkspaceUri,
          }
        case 'hover':
          return {
            kind: 'hover' as const,
            hover: result.hover === null
              ? null
              : {
                contents: result.hover.contents,
                ...result.hover.range === undefined
                  ? {}
                  : {
                    range: {
                      start: { line: result.hover.range.start.line, character: result.hover.range.start.character },
                      end: { line: result.hover.range.end.line, character: result.hover.range.end.character },
                    },
                  },
              },
          }
        /* v8 ignore next -- exhaustive over the closed LspQueryResult union; unreachable. */
        default:
          return assertNever(result, 'tool-lsp result')
      }
    },
    presentCall: presentLspCall,
  }))

  // Advisory-only result enrichment. The filesystem tools own mutation and
  // permissions; this listener observes their settled result and asks an
  // already-running LSP provider for a short, workspace-scoped diagnostic refresh.
  ctx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
    const decision = await next()
    if (decision.kind !== 'accept' || result.isError || Object.hasOwn(decision, 'value')
      || !POST_EDIT_TOOLS.has(exec.name)) return decision
    const filePaths = toolFilePaths(exec)
    const workspaceRoot = sessionCwd(exec)
    if (filePaths.length === 0 || workspaceRoot === undefined) return decision

    // Files are queried concurrently so a multi-file patch shares one wait budget.
    const reports = await Promise.all(filePaths.map(async (filePath) => {
      let diagnostics: readonly LspDiagnostic[]
      try {
        diagnostics = await ctx.lsp.getDiagnostics(
          { filePath, workspaceRoot },
          { waitMs: MAX_DIAGNOSTICS_WAIT_MS, signal: exec.signal },
        )
      } catch {
        // Diagnostics are a convenience, never a reason to fail a successful mutation.
        return null
      }
      const errors = diagnostics.slice(0, MAX_POST_EDIT_DIAGNOSTICS_SCANNED)
        .filter(item => item.severity === 1)
      return errors.length === 0 ? null : formatPostEditDiagnostics(filePath, errors)
    }))
    const texts = reports.filter((text): text is string => text !== null)
    if (texts.length === 0) return decision

    const content = decision.content ?? result.content
    return {
      kind: 'accept',
      content: [
        ...content,
        ...texts.map(text => ({ type: 'text' as const, text })),
      ],
      ...decision.additionalContexts !== undefined
        ? { additionalContexts: decision.additionalContexts }
        : {},
    }
  })
}

function toolFilePaths(exec: ToolExecution): string[] {
  if (exec.arguments === null || typeof exec.arguments !== 'object' || Array.isArray(exec.arguments)) return []
  if (exec.name === 'apply_patch') return patchFilePaths((exec.arguments as { patch?: unknown }).patch)
  const filePath = (exec.arguments as { file_path?: unknown }).file_path
  return typeof filePath === 'string' && filePath.trim() !== '' ? [filePath] : []
}

/** Paths named by a successfully applied Codex patch's add/update directives. */
function patchFilePaths(patch: unknown): string[] {
  if (typeof patch !== 'string') return []
  const paths: string[] = []
  for (const line of patch.split('\n')) {
    const directive = PATCH_FILE_DIRECTIVES.find(prefix => line.startsWith(prefix))
    if (directive === undefined) continue
    const filePath = line.slice(directive.length).trim()
    if (filePath !== '' && !paths.includes(filePath)) paths.push(filePath)
    if (paths.length === MAX_POST_PATCH_DIAGNOSTIC_FILES) break
  }
  return paths
}

function formatPostEditDiagnostics(filePath: string, diagnostics: readonly LspDiagnostic[]): string {
  const visible = diagnostics.slice(0, MAX_POST_EDIT_DIAGNOSTICS)
  const lines = visible.map(diagnostic => {
    const { line, character } = diagnostic.range.start
    const code = diagnostic.code === undefined ? '' : ` ${diagnostic.code}`
    const source = diagnostic.source === undefined ? '' : ` (${diagnostic.source})`
    const message = diagnostic.message.slice(0, MAX_POST_EDIT_DIAGNOSTIC_MESSAGE_CHARS)
    return `- ${filePath}:${line + 1}:${character + 1}${code}${source}: ${message}`
  })
  const omitted = diagnostics.length - visible.length
  if (omitted > 0) lines.push(`- ${omitted} additional error diagnostics omitted.`)
  return `LSP errors after ${filePath} update (first ${visible.length}):\n${lines.join('\n')}`
}

/** Reject a non-positive-integer config value at load, so misconfiguration fails loud. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`tool-lsp: ${name} must be a positive integer`)
  }
}

/** Reject a timer value Node would clamp instead of scheduling as configured. */
function assertTimer(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`tool-lsp: ${name} must be a positive integer no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}
