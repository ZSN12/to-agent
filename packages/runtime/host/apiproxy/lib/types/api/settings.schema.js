"use strict";
/**
 * settings domain zod schemas (names derived from map keys: settingsDescribeRequestSchema /
 * settingsDescribeValueSchema / settingsUpdate* / settingsReplace*).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsReplaceValueSchema = exports.settingsMutateValueSchema = exports.settingsMutateRequestSchema = exports.settingsPathOpSchema = exports.settingsReplaceRequestSchema = exports.settingsUpdateValueSchema = exports.settingsUpdateRequestSchema = exports.settingsOpenDocumentValueSchema = exports.settingsOpenDocumentRequestSchema = exports.settingsDescribeValueSchema = exports.settingsDescribeRequestSchema = exports.settingsNamespaceViewSchema = exports.settingsSecretViewSchema = void 0;
var zod_1 = require("zod");
/** One redacted secret slot. */
exports.settingsSecretViewSchema = zod_1.z.object({
    path: zod_1.z.array(zod_1.z.string()),
    set: zod_1.z.boolean(),
});
/** SettingsNamespaceView row of settings.describe and the write responses. */
exports.settingsNamespaceViewSchema = zod_1.z.object({
    ns: zod_1.z.string().min(1),
    schema: zod_1.z.unknown(),
    value: zod_1.z.unknown(),
    base: zod_1.z.unknown().optional(),
    user: zod_1.z.unknown().optional(),
    applies: zod_1.z.union([zod_1.z.literal('live'), zod_1.z.literal('restart')]),
    secrets: zod_1.z.array(exports.settingsSecretViewSchema),
    revision: zod_1.z.number(),
});
/** settings.describe request payload. */
exports.settingsDescribeRequestSchema = zod_1.z.object({});
/** settings.describe response value. */
exports.settingsDescribeValueSchema = zod_1.z.object({
    writable: zod_1.z.boolean(),
    hasDocument: zod_1.z.boolean(),
    namespaces: zod_1.z.array(exports.settingsNamespaceViewSchema),
});
/** settings.openDocument request payload. */
exports.settingsOpenDocumentRequestSchema = zod_1.z.object({});
/** settings.openDocument response value. */
exports.settingsOpenDocumentValueSchema = zod_1.z.object({
    opened: zod_1.z.literal(true),
});
/** settings.update request payload. */
exports.settingsUpdateRequestSchema = zod_1.z.object({
    ns: zod_1.z.string().min(1),
    patch: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    expectedRevision: zod_1.z.number().optional(),
});
/** settings.update response value: the namespace's new redacted view. */
exports.settingsUpdateValueSchema = exports.settingsNamespaceViewSchema;
/** settings.replace request payload. */
exports.settingsReplaceRequestSchema = zod_1.z.object({
    ns: zod_1.z.string().min(1),
    section: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    expectedRevision: zod_1.z.number().optional(),
});
/** One path-addressed edit of settings.mutate. */
exports.settingsPathOpSchema = zod_1.z.discriminatedUnion('op', [
    zod_1.z.object({ op: zod_1.z.literal('set'), path: zod_1.z.array(zod_1.z.string()), value: zod_1.z.unknown() }),
    zod_1.z.object({ op: zod_1.z.literal('unset'), path: zod_1.z.array(zod_1.z.string()) }),
]);
/** settings.mutate request payload. */
exports.settingsMutateRequestSchema = zod_1.z.object({
    ns: zod_1.z.string().min(1),
    ops: zod_1.z.array(exports.settingsPathOpSchema),
    expectedRevision: zod_1.z.number().optional(),
});
/** settings.mutate response value: the namespace's new redacted view. */
exports.settingsMutateValueSchema = exports.settingsNamespaceViewSchema;
/** settings.replace response value. */
exports.settingsReplaceValueSchema = exports.settingsNamespaceViewSchema;
