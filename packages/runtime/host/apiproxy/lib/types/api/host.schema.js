"use strict";
/**
 * host domain zod schemas (names derived from map keys).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hostOpenPathValueSchema = exports.hostOpenPathRequestSchema = exports.hostCreateDirectoryValueSchema = exports.hostCreateDirectoryRequestSchema = exports.hostListDirectoryValueSchema = exports.hostListDirectoryRequestSchema = exports.directoryEntrySchema = exports.hostPickDirectoryValueSchema = exports.hostPickDirectoryRequestSchema = exports.hostDescribeValueSchema = exports.hostDescribeRequestSchema = void 0;
var zod_1 = require("zod");
/** host.describe request payload (empty object literal). */
exports.hostDescribeRequestSchema = zod_1.z.object({});
/** host.describe response value. */
exports.hostDescribeValueSchema = zod_1.z.object({
    version: zod_1.z.string(),
    cwd: zod_1.z.string(),
    provider: zod_1.z.string().optional(),
    model: zod_1.z.string().optional(),
    attachedSessions: zod_1.z.number().int().nonnegative(),
    home: zod_1.z.string(),
    canOpenPath: zod_1.z.boolean(),
});
/** host.pickDirectory request payload (empty object literal). */
exports.hostPickDirectoryRequestSchema = zod_1.z.object({});
/** host.pickDirectory response value; null means the user cancelled. */
exports.hostPickDirectoryValueSchema = zod_1.z.object({
    path: zod_1.z.string().nullable(),
});
/** Directory row shared by listing entries and breadcrumb crumbs. */
exports.directoryEntrySchema = zod_1.z.object({
    name: zod_1.z.string(),
    path: zod_1.z.string(),
    hidden: zod_1.z.boolean(),
});
/** host.listDirectory request payload; an absent path lists the home directory. */
exports.hostListDirectoryRequestSchema = zod_1.z.object({
    path: zod_1.z.string().optional(),
});
/** host.listDirectory response value. */
exports.hostListDirectoryValueSchema = zod_1.z.object({
    path: zod_1.z.string(),
    home: zod_1.z.string(),
    crumbs: zod_1.z.array(exports.directoryEntrySchema),
    entries: zod_1.z.array(exports.directoryEntrySchema),
    truncated: zod_1.z.boolean(),
});
/** host.createDirectory request payload: name must be one plain path segment. */
exports.hostCreateDirectoryRequestSchema = zod_1.z.object({
    path: zod_1.z.string(),
    name: zod_1.z.string(),
}).refine(function (payload) { return payload.name.trim() !== '' && payload.name !== '.' && payload.name !== '..'
    && !/[/\\]/.test(payload.name); }, { message: 'host.createDirectory requires a single non-blank path segment name' });
/** host.createDirectory response value: the created directory's absolute path. */
exports.hostCreateDirectoryValueSchema = zod_1.z.object({
    path: zod_1.z.string(),
});
/** host.openPath request payload. */
exports.hostOpenPathRequestSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
});
/** host.openPath response value. */
exports.hostOpenPathValueSchema = zod_1.z.object({
    opened: zod_1.z.literal(true),
});
