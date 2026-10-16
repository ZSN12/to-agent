import { z } from 'zod';
import { sessionIdSchema } from "./sessions.schema.js";
export const orchestrationResponsePayloadSchema = z.object({
    sessionId: sessionIdSchema,
    summary: z.string().max(20_000),
    runId: z.string().nullable(),
    taskCount: z.number().int().nonnegative(),
    failedTaskCount: z.number().int().nonnegative(),
    cancelled: z.boolean(),
    taskStatuses: z.array(z.object({
        id: z.string().min(1).max(128),
        title: z.string().max(500),
        status: z.string().max(100),
    })).max(50),
    changedFiles: z.array(z.string().min(1).max(1_000)).max(200),
});
//# sourceMappingURL=orchestration.schema.js.map