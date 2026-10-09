"use strict";
/**
 * goals domain zod schemas. Mutation-only shapes: every value schema is a
 * `{ ref }` acknowledgement (clear: `{ cleared }`) — the current goal state
 * travels exclusively on the 'goal' session projection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.goalClearValueSchema = exports.goalClearRequestSchema = exports.goalCompleteValueSchema = exports.goalCompleteRequestSchema = exports.goalResumeValueSchema = exports.goalResumeRequestSchema = exports.goalPauseValueSchema = exports.goalPauseRequestSchema = exports.goalEditValueSchema = exports.goalEditRequestSchema = exports.goalCreateValueSchema = exports.goalCreateRequestSchema = exports.goalRefSchema = void 0;
var zod_1 = require("zod");
/** GoalRef schema. */
exports.goalRefSchema = zod_1.z.object({
    id: zod_1.z.string(),
    revision: zod_1.z.number().int().positive(),
});
/** Shared `{ ref }` acknowledgement value of every non-clear mutation. */
var goalRefValueSchema = zod_1.z.object({ ref: exports.goalRefSchema });
/** goal.create request payload. */
exports.goalCreateRequestSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    objective: zod_1.z.string().min(1),
    maxGoalRounds: zod_1.z.number().int().positive().optional(),
});
/** goal.create response value. */
exports.goalCreateValueSchema = goalRefValueSchema;
/** goal.edit request payload. */
exports.goalEditRequestSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    ref: exports.goalRefSchema,
    objective: zod_1.z.string().min(1).optional(),
    maxGoalRounds: zod_1.z.number().int().positive().optional(),
}).refine(function (value) { return value.objective !== undefined || value.maxGoalRounds !== undefined; }, {
    message: 'goal.edit requires objective or maxGoalRounds',
});
/** goal.edit response value. */
exports.goalEditValueSchema = goalRefValueSchema;
/** goal.pause request payload. */
exports.goalPauseRequestSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    ref: exports.goalRefSchema,
});
/** goal.pause response value. */
exports.goalPauseValueSchema = goalRefValueSchema;
/** goal.resume request payload. */
exports.goalResumeRequestSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    ref: exports.goalRefSchema,
});
/** goal.resume response value. */
exports.goalResumeValueSchema = goalRefValueSchema;
/** goal.complete request payload. */
exports.goalCompleteRequestSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    ref: exports.goalRefSchema,
});
/** goal.complete response value. */
exports.goalCompleteValueSchema = goalRefValueSchema;
/** goal.clear request payload. */
exports.goalClearRequestSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    ref: exports.goalRefSchema,
});
/** goal.clear response value. */
exports.goalClearValueSchema = zod_1.z.object({
    cleared: zod_1.z.literal(true),
});
