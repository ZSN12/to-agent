import { z } from 'zod';
import { sessionIdSchema } from "./sessions.schema.js";
const mcpToolViewSchema = z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.string(), z.unknown()),
});
export const mcpListRequestSchema = z.object({});
export const mcpListValueSchema = z.object({
    tools: z.array(mcpToolViewSchema),
});
export const mcpCallRequestSchema = z.object({
    sessionId: sessionIdSchema,
    name: z.string().regex(/^mcp__[A-Za-z0-9_-]+__/),
    arguments: z.record(z.string(), z.json()),
});
export const mcpCallValueSchema = z.object({
    isError: z.boolean(),
    content: z.array(z.string()),
    value: z.json().optional(),
});
//# sourceMappingURL=mcp.schema.js.map