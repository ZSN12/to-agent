"use strict";
/**
 * credentials domain zod schemas (names derived from map keys:
 * credentialsDescribeRequestSchema / credentialsDescribeValueSchema / …).
 * The reference-name pattern mirrors the seam's `credentialRef` guard so an
 * invalid name fails as `bad-request` before reaching the service.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.credentialsUnsetValueSchema = exports.credentialsUnsetRequestSchema = exports.credentialsSetValueSchema = exports.credentialsSetRequestSchema = exports.credentialsDescribeValueSchema = exports.credentialsDescribeRequestSchema = exports.credentialViewSchema = exports.credentialRefNameSchema = void 0;
var zod_1 = require("zod");
/** POSIX-portable environment-variable name (the seam's `credentialRef` pattern). */
exports.credentialRefNameSchema = zod_1.z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
/** CredentialView entry of credentials.describe. */
exports.credentialViewSchema = zod_1.z.object({
    configured: zod_1.z.boolean(),
    source: zod_1.z.string().optional(),
    writable: zod_1.z.boolean(),
});
/** credentials.describe request payload. */
exports.credentialsDescribeRequestSchema = zod_1.z.object({
    refs: zod_1.z.array(exports.credentialRefNameSchema).max(64),
});
/** credentials.describe response value. */
exports.credentialsDescribeValueSchema = zod_1.z.object({
    credentials: zod_1.z.record(zod_1.z.string(), exports.credentialViewSchema),
});
/** credentials.set request payload: the one direction a value crosses this wire. */
exports.credentialsSetRequestSchema = zod_1.z.object({
    ref: exports.credentialRefNameSchema,
    value: zod_1.z.string().min(1),
});
/** credentials.set response value. */
exports.credentialsSetValueSchema = zod_1.z.object({});
/** credentials.unset request payload. */
exports.credentialsUnsetRequestSchema = zod_1.z.object({
    ref: exports.credentialRefNameSchema,
});
/** credentials.unset response value. */
exports.credentialsUnsetValueSchema = zod_1.z.object({});
