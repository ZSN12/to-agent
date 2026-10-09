import { z } from 'zod';
export declare const mcpListRequestSchema: z.ZodObject<{}, z.core.$strip>;
export declare const mcpListValueSchema: z.ZodObject<{
    tools: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const mcpCallRequestSchema: z.ZodObject<{
    sessionId: z.ZodType<import("@z/dsh-session").SessionId, unknown, z.core.$ZodTypeInternals<import("@z/dsh-session").SessionId, unknown>>;
    name: z.ZodString;
    arguments: z.ZodRecord<z.ZodString, z.ZodJSONSchema>;
}, z.core.$strip>;
export declare const mcpCallValueSchema: z.ZodObject<{
    isError: z.ZodBoolean;
    content: z.ZodArray<z.ZodString>;
    value: z.ZodOptional<z.ZodJSONSchema>;
}, z.core.$strip>;
//# sourceMappingURL=mcp.schema.d.ts.map