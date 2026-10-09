/** Authorization domain request/value schemas. */
import { z } from 'zod';
export declare const authorizationListRequestSchema: z.ZodObject<{}, z.core.$strip>;
export declare const authorizationListValueSchema: z.ZodObject<{
    flows: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        methods: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
        }, z.core.$strip>>;
        inFlight: z.ZodBoolean;
        configured: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const authorizationBeginRequestSchema: z.ZodObject<{
    attemptId: z.ZodString;
    key: z.ZodString;
    method: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const authorizationBeginValueSchema: z.ZodObject<{
    status: z.ZodUnion<readonly [z.ZodLiteral<"authorized">, z.ZodLiteral<"cancelled">]>;
}, z.core.$strip>;
export declare const authorizationCancelRequestSchema: z.ZodObject<{
    key: z.ZodString;
    attemptId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const authorizationCancelValueSchema: z.ZodObject<{
    cancelled: z.ZodBoolean;
}, z.core.$strip>;
export declare const authorizationAnswerRequestSchema: z.ZodObject<{
    attemptId: z.ZodString;
    promptId: z.ZodString;
    answer: z.ZodOptional<z.ZodString>;
    declined: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const authorizationAnswerValueSchema: z.ZodObject<{
    accepted: z.ZodBoolean;
}, z.core.$strip>;
export declare const authorizationLogoutRequestSchema: z.ZodObject<{
    key: z.ZodString;
}, z.core.$strip>;
export declare const authorizationLogoutValueSchema: z.ZodObject<{}, z.core.$strip>;
//# sourceMappingURL=authorization.schema.d.ts.map