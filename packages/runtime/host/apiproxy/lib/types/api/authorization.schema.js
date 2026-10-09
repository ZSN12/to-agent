"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizationLogoutValueSchema = exports.authorizationLogoutRequestSchema = exports.authorizationAnswerValueSchema = exports.authorizationAnswerRequestSchema = exports.authorizationCancelValueSchema = exports.authorizationCancelRequestSchema = exports.authorizationBeginValueSchema = exports.authorizationBeginRequestSchema = exports.authorizationListValueSchema = exports.authorizationListRequestSchema = void 0;
/** Authorization domain request/value schemas. */
var zod_1 = require("zod");
var keySchema = zod_1.z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
var methodSchema = zod_1.z.object({ id: zod_1.z.string().min(1), label: zod_1.z.string().min(1) });
var flowSchema = zod_1.z.object({
    key: keySchema,
    label: zod_1.z.string().min(1),
    methods: zod_1.z.array(methodSchema),
    inFlight: zod_1.z.boolean(),
    configured: zod_1.z.boolean(),
});
exports.authorizationListRequestSchema = zod_1.z.object({});
exports.authorizationListValueSchema = zod_1.z.object({ flows: zod_1.z.array(flowSchema) });
exports.authorizationBeginRequestSchema = zod_1.z.object({
    attemptId: zod_1.z.string().uuid(),
    key: keySchema,
    method: zod_1.z.string().min(1).optional(),
});
exports.authorizationBeginValueSchema = zod_1.z.object({ status: zod_1.z.union([zod_1.z.literal('authorized'), zod_1.z.literal('cancelled')]) });
exports.authorizationCancelRequestSchema = zod_1.z.object({ key: keySchema, attemptId: zod_1.z.string().uuid().optional() });
exports.authorizationCancelValueSchema = zod_1.z.object({ cancelled: zod_1.z.boolean() });
exports.authorizationAnswerRequestSchema = zod_1.z.object({
    attemptId: zod_1.z.string().uuid(),
    promptId: zod_1.z.string().uuid(),
    answer: zod_1.z.string().optional(),
    declined: zod_1.z.boolean().optional(),
}).refine(function (value) { return value.declined === true || typeof value.answer === 'string'; }, { message: 'answer is required unless declined' });
exports.authorizationAnswerValueSchema = zod_1.z.object({ accepted: zod_1.z.boolean() });
exports.authorizationLogoutRequestSchema = zod_1.z.object({ key: keySchema });
exports.authorizationLogoutValueSchema = zod_1.z.object({});
