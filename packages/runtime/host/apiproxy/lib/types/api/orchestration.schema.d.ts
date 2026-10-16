import { z } from 'zod';
export declare const orchestrationResponsePayloadSchema: z.ZodObject<{
    sessionId: z.ZodType<import("@taskweaver/dsh-session").SessionId, unknown, z.core.$ZodTypeInternals<import("@taskweaver/dsh-session").SessionId, unknown>>;
    summary: z.ZodString;
    runId: z.ZodNullable<z.ZodString>;
    taskCount: z.ZodNumber;
    failedTaskCount: z.ZodNumber;
    cancelled: z.ZodBoolean;
    taskStatuses: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        status: z.ZodString;
    }, z.core.$strip>>;
    changedFiles: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
//# sourceMappingURL=orchestration.schema.d.ts.map