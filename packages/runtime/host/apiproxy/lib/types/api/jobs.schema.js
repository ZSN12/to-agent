"use strict";
/**
 * tasks domain zod schemas: the branded job id and the wire view carried by
 * `session/jobs` frames.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskViewSchema = exports.taskIdSchema = void 0;
var zod_1 = require("zod");
/** JobId: one brand cast after non-empty string validation. */
exports.taskIdSchema = zod_1.z.string().min(1);
/**
 * One wire task view. `kind` stays an open string because producer plugins
 * extend the registry's kind map by declaration merging, so the closed set is
 * not knowable at this boundary.
 */
exports.taskViewSchema = zod_1.z.object({
    id: exports.taskIdSchema,
    kind: zod_1.z.string().min(1),
    label: zod_1.z.string().min(1),
    status: zod_1.z.union([
        zod_1.z.literal('running'),
        zod_1.z.literal('stopping'),
        zod_1.z.literal('completed'),
        zod_1.z.literal('killed'),
        zod_1.z.literal('failed'),
    ]),
    detail: zod_1.z.string().optional(),
    startedAt: zod_1.z.number().int().nonnegative(),
    finishedAt: zod_1.z.number().int().nonnegative().optional(),
});
