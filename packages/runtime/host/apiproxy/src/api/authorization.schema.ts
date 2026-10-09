/** Authorization domain request/value schemas. */
import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { AuthorizationFlowView } from './authorization.ts'
import type { Wire } from './rpc.schema.ts'

const keySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/)
const methodSchema = z.object({ id: z.string().min(1), label: z.string().min(1) })
const flowSchema = z.object({
  key: keySchema,
  label: z.string().min(1),
  methods: z.array(methodSchema),
  inFlight: z.boolean(),
  configured: z.boolean(),
}) satisfies z.ZodType<Wire<AuthorizationFlowView>>

export const authorizationListRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'authorization.list'>>>
export const authorizationListValueSchema = z.object({ flows: z.array(flowSchema) }) satisfies z.ZodType<Wire<ResponseValue<'authorization.list'>>>
export const authorizationBeginRequestSchema = z.object({
  attemptId: z.string().uuid(),
  key: keySchema,
  method: z.string().min(1).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'authorization.begin'>>>
export const authorizationBeginValueSchema = z.object({ status: z.union([z.literal('authorized'), z.literal('cancelled')]) }) satisfies z.ZodType<Wire<ResponseValue<'authorization.begin'>>>
export const authorizationCancelRequestSchema = z.object({ key: keySchema, attemptId: z.string().uuid().optional() }) satisfies z.ZodType<Wire<RequestPayload<'authorization.cancel'>>>
export const authorizationCancelValueSchema = z.object({ cancelled: z.boolean() }) satisfies z.ZodType<Wire<ResponseValue<'authorization.cancel'>>>
export const authorizationAnswerRequestSchema = z.object({
  attemptId: z.string().uuid(),
  promptId: z.string().uuid(),
  answer: z.string().optional(),
  declined: z.boolean().optional(),
}).refine(value => value.declined === true || typeof value.answer === 'string', { message: 'answer is required unless declined' }) satisfies z.ZodType<Wire<RequestPayload<'authorization.answer'>>>
export const authorizationAnswerValueSchema = z.object({ accepted: z.boolean() }) satisfies z.ZodType<Wire<ResponseValue<'authorization.answer'>>>
export const authorizationLogoutRequestSchema = z.object({ key: keySchema }) satisfies z.ZodType<Wire<RequestPayload<'authorization.logout'>>>
export const authorizationLogoutValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'authorization.logout'>>>
