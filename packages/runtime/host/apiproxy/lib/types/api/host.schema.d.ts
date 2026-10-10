/**
 * host domain zod schemas (names derived from map keys).
 */
import { z } from 'zod';
/** host.describe request payload (empty object literal). */
export declare const hostDescribeRequestSchema: z.ZodObject<{}, z.core.$strip>;
/** host.describe response value. */
export declare const hostDescribeValueSchema: z.ZodObject<{
    version: z.ZodString;
    cwd: z.ZodString;
    provider: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    attachedSessions: z.ZodNumber;
    home: z.ZodString;
    canOpenPath: z.ZodBoolean;
}, z.core.$strip>;
/** host.pickDirectory request payload (empty object literal). */
export declare const hostPickDirectoryRequestSchema: z.ZodObject<{}, z.core.$strip>;
/** host.pickDirectory response value; null means the user cancelled. */
export declare const hostPickDirectoryValueSchema: z.ZodObject<{
    path: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
/** host.openPath request payload. */
export declare const hostOpenPathRequestSchema: z.ZodObject<{
    path: z.ZodString;
}, z.core.$strip>;
/** host.openPath response value. */
export declare const hostOpenPathValueSchema: z.ZodObject<{
    opened: z.ZodLiteral<true>;
}, z.core.$strip>;
/** host.searchWeb request payload. */
export declare const hostSearchWebRequestSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/** host.searchWeb response value; API keys never cross the Host boundary. */
export declare const hostSearchWebValueSchema: z.ZodObject<{
    content: z.ZodOptional<z.ZodString>;
    sources: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        snippet: z.ZodOptional<z.ZodString>;
        publishedAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    truncated: z.ZodBoolean;
}, z.core.$strip>;
//# sourceMappingURL=host.schema.d.ts.map