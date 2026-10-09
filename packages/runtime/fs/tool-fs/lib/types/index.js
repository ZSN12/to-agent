"use strict";
/**
 * Model-facing read, read_image, write, and edit tools over `ctx.fs`. This package owns schemas, validation,
 * read windows, formatting, and observation events, never a concrete provider. An optional
 * event policy supplies mutation guards; without one the tools use unconditional provider calls.
 * @module @z/dsh-tool-fs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.diffsFromMeta = exports.computeHunkDiffs = exports.sessionResolveOptions = exports.sessionCwd = exports.FsSandboxController = exports.inject = exports.name = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var read_ts_1 = require("./read.ts");
var write_ts_1 = require("./write.ts");
var edit_ts_1 = require("./edit.ts");
var read_image_ts_1 = require("./read-image.ts");
var read_render_ts_1 = require("./read-render.ts");
var sandbox_ts_1 = require("./sandbox.ts");
/** Cordis plugin name used by loader diagnostics. */
exports.name = 'tool-fs';
/** Services required by the filesystem tool suite. */
exports.inject = ['tools', 'fs', 'systemPrompt'];
// Shared by sibling filesystem plugins so mutations use the same policy path.
var sandbox_ts_2 = require("./sandbox.ts");
Object.defineProperty(exports, "FsSandboxController", { enumerable: true, get: function () { return sandbox_ts_2.FsSandboxController; } });
var session_cwd_ts_1 = require("./session-cwd.ts");
Object.defineProperty(exports, "sessionCwd", { enumerable: true, get: function () { return session_cwd_ts_1.sessionCwd; } });
Object.defineProperty(exports, "sessionResolveOptions", { enumerable: true, get: function () { return session_cwd_ts_1.sessionResolveOptions; } });
var diff_ts_1 = require("./diff.ts");
Object.defineProperty(exports, "computeHunkDiffs", { enumerable: true, get: function () { return diff_ts_1.computeHunkDiffs; } });
Object.defineProperty(exports, "diffsFromMeta", { enumerable: true, get: function () { return diff_ts_1.diffsFromMeta; } });
exports.Config = schemastery_1.default.object({
    mutations: schemastery_1.default.boolean().default(true),
    readLimit: schemastery_1.default.number().default(read_ts_1.READ_LIMIT),
    readMaxLineLength: schemastery_1.default.number().default(read_render_ts_1.READ_MAX_LINE_LENGTH),
    readMaxBytes: schemastery_1.default.number().default(read_render_ts_1.READ_MAX_BYTES),
    readStreamMinSize: schemastery_1.default.number().default(read_ts_1.STREAM_MIN_SIZE),
});
/** Every read cap counts lines/chars/bytes — a positive integer, or windowing arithmetic misbehaves silently. */
function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error("tool-fs: ".concat(name, " must be a positive integer"));
    }
}
/** Register the full `read`/`write`/`edit` filesystem tool suite, plus `read_image` while `attachments` is mounted. */
function apply(ctx, config) {
    // schemastery (Config) has already filled every defaulted field.
    var resolved = config;
    assertPositiveInteger('readLimit', resolved.readLimit);
    assertPositiveInteger('readMaxLineLength', resolved.readMaxLineLength);
    assertPositiveInteger('readMaxBytes', resolved.readMaxBytes);
    assertPositiveInteger('readStreamMinSize', resolved.readStreamMinSize);
    (0, read_ts_1.applyReadTool)(ctx, {
        limit: resolved.readLimit,
        maxLineLength: resolved.readMaxLineLength,
        maxBytes: resolved.readMaxBytes,
        streamMinSize: resolved.readStreamMinSize,
    });
    if (!resolved.mutations) {
        // A read-only preset can be mounted beneath a deployment that already
        // registered the mutating filesystem tools globally. Omitting our own
        // write/edit registrations is not enough in that case: the scoped tool
        // view inherits those global definitions. Mask only the inherited
        // capabilities that actually exist; standalone read-only compositions
        // have nothing to restrict.
        var inheritedMutations = ['write', 'edit'].filter(function (name) { return ctx.tools.get(name) !== undefined; });
        if (inheritedMutations.length > 0)
            ctx.tools.restrict({ deny: inheritedMutations });
    }
    // read_image is composition-conditional: without a mounted attachment store
    // the deployment cannot durably commit image bytes, so the tool never
    // registers; the execute body keeps a defensive re-check for direct callers.
    ctx.inject(['attachments'], function (imageCtx) {
        (0, read_image_ts_1.applyReadImageTool)(imageCtx);
    });
    if (resolved.mutations) {
        // One escalation API shared by both mutating tools: advertisement gating,
        // per-call policy resolution, and denial-marker mapping, all keyed off whether
        // the mounted ctx.fs confines (ctx.fs.sandboxMode).
        var sandbox = new sandbox_ts_1.FsSandboxController(ctx);
        (0, write_ts_1.applyWriteTool)(ctx, sandbox);
        (0, edit_ts_1.applyEditTool)(ctx, sandbox);
    }
}
