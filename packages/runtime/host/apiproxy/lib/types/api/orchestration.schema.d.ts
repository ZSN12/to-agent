import { z } from 'zod';
export declare const orchestrationResponsePayloadSchema: z.ZodObject<{
    sessionId: z.ZodType<import("@taskweaver/dsh-session").SessionId, unknown, z.core.$ZodTypeInternals<import("@taskweaver/dsh-session").SessionId, unknown>>;
    summary: z.ZodString;
    runId: z.ZodNullable<z.ZodString>;
    taskCount: z.ZodNumber;
    failedTaskCount: z.ZodNumber;
    cancelled: z.ZodBoolean;
}, z.core.$strip>;
//# sourceMappingURL=orchestration.schema.d.ts.map