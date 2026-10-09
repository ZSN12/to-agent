"use strict";
/**
 * agent-presets domain zod schemas (names derived from map keys:
 * agentPresetListRequestSchema / agentPresetListValueSchema).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentPresetRemoveValueSchema = exports.agentPresetRemoveRequestSchema = exports.agentPresetOpenDocumentValueSchema = exports.agentPresetOpenDocumentRequestSchema = exports.agentPresetCopyValueSchema = exports.agentPresetCopyRequestSchema = exports.agentPresetReadValueSchema = exports.agentPresetReadRequestSchema = exports.agentPresetSelectValueSchema = exports.agentPresetSelectRequestSchema = exports.agentPresetListValueSchema = exports.agentPresetListRequestSchema = exports.agentPresetEntrySchema = void 0;
var zod_1 = require("zod");
var sessions_schema_ts_1 = require("./sessions.schema.ts");
/** AgentPresetEntry row of agentPreset.list. */
exports.agentPresetEntrySchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    trust: zod_1.z.union([zod_1.z.literal('system'), zod_1.z.literal('user')]),
    isDefault: zod_1.z.boolean(),
    name: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    broken: zod_1.z.string().min(1).optional(),
});
/** agentPreset.list request payload. */
exports.agentPresetListRequestSchema = zod_1.z.object({});
/** agentPreset.list response value. */
exports.agentPresetListValueSchema = zod_1.z.object({
    presets: zod_1.z.array(exports.agentPresetEntrySchema),
    authorable: zod_1.z.boolean(),
    hasDocument: zod_1.z.boolean(),
});
/** agentPreset.select request payload. */
exports.agentPresetSelectRequestSchema = zod_1.z.object({
    sessionId: sessions_schema_ts_1.sessionIdSchema,
    agentPreset: zod_1.z.string().min(1),
});
/** agentPreset.select response value. */
exports.agentPresetSelectValueSchema = zod_1.z.object({
    agentPreset: zod_1.z.string(),
});
/** agentPreset.read request payload. */
exports.agentPresetReadRequestSchema = zod_1.z.object({
    agentPreset: zod_1.z.string().min(1),
});
/** agentPreset.read response value. */
exports.agentPresetReadValueSchema = zod_1.z.object({
    agentPreset: zod_1.z.string(),
    trust: zod_1.z.union([zod_1.z.literal('system'), zod_1.z.literal('user')]),
    content: zod_1.z.string(),
    name: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
});
/** agentPreset.copy request payload. */
exports.agentPresetCopyRequestSchema = zod_1.z.object({
    from: zod_1.z.string().min(1),
    agentPreset: zod_1.z.string().min(1),
    name: zod_1.z.string().optional(),
});
/** agentPreset.copy response value. */
exports.agentPresetCopyValueSchema = zod_1.z.object({
    agentPreset: zod_1.z.string(),
});
/** agentPreset.openDocument request payload. */
exports.agentPresetOpenDocumentRequestSchema = zod_1.z.object({
    agentPreset: zod_1.z.string().min(1),
});
/** agentPreset.openDocument response value. */
exports.agentPresetOpenDocumentValueSchema = zod_1.z.union([
    zod_1.z.object({ opened: zod_1.z.literal(true) }),
    zod_1.z.object({ opened: zod_1.z.literal(false), path: zod_1.z.string() }),
]);
/** agentPreset.remove request payload. */
exports.agentPresetRemoveRequestSchema = zod_1.z.object({
    agentPreset: zod_1.z.string().min(1),
});
/** agentPreset.remove response value. */
exports.agentPresetRemoveValueSchema = zod_1.z.object({});
