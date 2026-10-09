"use strict";
/**
 * skills domain zod schemas (names derived from map keys: skillListRequestSchema /
 * skillListValueSchema).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillListValueSchema = exports.skillListRequestSchema = exports.skillEntrySchema = void 0;
var zod_1 = require("zod");
var sessions_schema_ts_1 = require("./sessions.schema.ts");
/** SkillEntry row of skill.list. */
exports.skillEntrySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string(),
    whenToUse: zod_1.z.string().optional(),
    modelInvocable: zod_1.z.boolean(),
});
/** skill.list request payload. */
exports.skillListRequestSchema = zod_1.z.object({
    sessionId: sessions_schema_ts_1.sessionIdSchema,
});
/** skill.list response value. */
exports.skillListValueSchema = zod_1.z.object({
    skills: zod_1.z.array(exports.skillEntrySchema),
});
