"use strict";
/**
 * approvals domain zod schemas (respond is a client-response; the payload schema serves
 * the /api/respond endpoint's second parse after routing via the pending table).
 * ApprovalRequestId brand cast point: one.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.approvalResponsePayloadSchema = exports.approvalRequestIdSchema = void 0;
var zod_1 = require("zod");
var sessions_schema_ts_1 = require("./sessions.schema.ts");
/** ApprovalRequestId: one brand cast after schema validation (the only cast point in this domain). */
exports.approvalRequestIdSchema = zod_1.z.string().min(1);
/** Approval answer payload (the result.value slot of a client-response). */
exports.approvalResponsePayloadSchema = zod_1.z.object({
    sessionId: sessions_schema_ts_1.sessionIdSchema,
    approvalId: exports.approvalRequestIdSchema,
    outcome: zod_1.z.union([zod_1.z.literal('allowed-once'), zod_1.z.literal('rejected')]),
});
