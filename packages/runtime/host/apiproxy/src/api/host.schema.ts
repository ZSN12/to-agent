/**
 * host domain zod schemas (names derived from map keys).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** host.describe request payload (empty object literal). */
export const hostDescribeRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'host.describe'>>>

/** host.describe response value. */
export const hostDescribeValueSchema = z.object({
  version: z.string(),
  cwd: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
  attachedSessions: z.number().int().nonnegative(),
  home: z.string(),
  canOpenPath: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.describe'>>>

/** host.pickDirectory request payload (empty object literal). */
export const hostPickDirectoryRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'host.pickDirectory'>>>

/** host.pickDirectory response value; null means the user cancelled. */
export const hostPickDirectoryValueSchema = z.object({
  path: z.string().nullable(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.pickDirectory'>>>

/** host.openPath request payload. */
export const hostOpenPathRequestSchema = z.object({
  path: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'host.openPath'>>>

/** host.openPath response value. */
export const hostOpenPathValueSchema = z.object({
  opened: z.literal(true),
}) satisfies z.ZodType<Wire<ResponseValue<'host.openPath'>>>

/** host.searchWeb request payload. */
export const hostSearchWebRequestSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  maxResults: z.number().int().min(1).max(20).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.searchWeb'>>>

/** host.searchWeb response value; API keys never cross the Host boundary. */
export const hostSearchWebValueSchema = z.object({
  content: z.string().optional(),
  sources: z.array(z.object({
    url: z.string().min(1),
    title: z.string().optional(),
    snippet: z.string().optional(),
    publishedAt: z.string().optional(),
  })),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.searchWeb'>>>
