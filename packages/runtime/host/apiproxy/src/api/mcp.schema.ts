import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import { sessionIdSchema } from './sessions.schema.ts'

const mcpToolViewSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()),
})

export const mcpListRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'mcp.list'>>>
export const mcpListValueSchema = z.object({
  tools: z.array(mcpToolViewSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'mcp.list'>>>

export const mcpCallRequestSchema = z.object({
  sessionId: sessionIdSchema,
  name: z.string().regex(/^mcp__[A-Za-z0-9_-]+__/),
  arguments: z.record(z.string(), z.json()),
}) satisfies z.ZodType<Wire<RequestPayload<'mcp.call'>>>

export const mcpCallValueSchema = z.object({
  isError: z.boolean(),
  content: z.array(z.string()),
  value: z.json().optional(),
}) satisfies z.ZodType<Wire<ResponseValue<'mcp.call'>>>
