"use strict";
/**
 * questions domain zod schemas (respond is a client-response; the payload schema serves
 * the /api/respond endpoint's second parse after routing via the pending table). The question
 * identifier is the echoed rpcId; the payload carries no resource id.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.questionResponsePayloadSchema = exports.askUserQuestionAnswerSchema = void 0;
var zod_1 = require("zod");
var sessions_schema_ts_1 = require("./sessions.schema.ts");
/** AskUserQuestionAnswer validated strictly against core dsh-user-questions. */
exports.askUserQuestionAnswerSchema = zod_1.z.object({
    answers: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        selected: zod_1.z.array(zod_1.z.string()),
        custom: zod_1.z.string().optional(),
    })),
});
/** Question answer payload (the result.value slot of a client-response). */
exports.questionResponsePayloadSchema = zod_1.z.object({
    sessionId: sessions_schema_ts_1.sessionIdSchema,
    answer: exports.askUserQuestionAnswerSchema,
});
