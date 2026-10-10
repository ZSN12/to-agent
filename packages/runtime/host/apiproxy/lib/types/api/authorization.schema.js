/** Authorization domain request/value schemas. */
import { z } from 'zod';
const keySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
const methodSchema = z.object({ id: z.string().min(1), label: z.string().min(1) });
const flowSchema = z.object({
    key: keySchema,
    label: z.string().min(1),
    methods: z.array(methodSchema),
    inFlight: z.boolean(),
    configured: z.boolean(),
});
export const authorizationListRequestSchema = z.object({});
export const authorizationListValueSchema = z.object({ flows: z.array(flowSchema) });
export const authorizationBeginRequestSchema = z.object({
    attemptId: z.string().uuid(),
    key: keySchema,
    method: z.string().min(1).optional(),
});
export const authorizationBeginValueSchema = z.object({ status: z.union([z.literal('authorized'), z.literal('cancelled')]) });
export const authorizationCancelRequestSchema = z.object({ key: keySchema, attemptId: z.string().uuid().optional() });
export const authorizationCancelValueSchema = z.object({ cancelled: z.boolean() });
export const authorizationAnswerRequestSchema = z.object({
    attemptId: z.string().uuid(),
    promptId: z.string().uuid(),
    answer: z.string().optional(),
    declined: z.boolean().optional(),
}).refine(value => value.declined === true || typeof value.answer === 'string', { message: 'answer is required unless declined' });
export const authorizationAnswerValueSchema = z.object({ accepted: z.boolean() });
export const authorizationLogoutRequestSchema = z.object({ key: keySchema });
export const authorizationLogoutValueSchema = z.object({});
//# sourceMappingURL=authorization.schema.js.map