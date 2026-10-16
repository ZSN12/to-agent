import { z } from 'zod'
import type { OrchestrationResponsePayload } from './orchestration.ts'
import type { Wire } from './rpc.schema.ts'
import { sessionIdSchema } from './sessions.schema.ts'

export const orchestrationResponsePayloadSchema = z.object({
  sessionId: sessionIdSchema,
  summary: z.string().max(20_000),
  runId: z.string().nullable(),
  taskCount: z.number().int().nonnegative(),
  failedTaskCount: z.number().int().nonnegative(),
  cancelled: z.boolean(),
}) satisfies z.ZodType<Wire<OrchestrationResponsePayload>>
