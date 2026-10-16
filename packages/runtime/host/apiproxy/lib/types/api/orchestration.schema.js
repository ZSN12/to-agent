import { z } from 'zod';
import { sessionIdSchema } from "./sessions.schema.js";
export const orchestrationResponsePayloadSchema = z.object({
    sessionId: sessionIdSchema,
    summary: z.string().max(20_000),
    runId: z.string().nullable(),
    taskCount: z.number().int().nonnegative(),
    failedTaskCount: z.number().int().nonnegative(),
    cancelled: z.boolean(),
});
//# sourceMappingURL=orchestration.schema.js.map