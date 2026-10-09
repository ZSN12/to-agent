"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mcpCallValueSchema = exports.mcpCallRequestSchema = exports.mcpListValueSchema = exports.mcpListRequestSchema = void 0;
var zod_1 = require("zod");
var sessions_schema_ts_1 = require("./sessions.schema.ts");
var mcpToolViewSchema = zod_1.z.object({
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    parameters: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
});
exports.mcpListRequestSchema = zod_1.z.object({});
exports.mcpListValueSchema = zod_1.z.object({
    tools: zod_1.z.array(mcpToolViewSchema),
});
exports.mcpCallRequestSchema = zod_1.z.object({
    sessionId: sessions_schema_ts_1.sessionIdSchema,
    name: zod_1.z.string().regex(/^mcp__[A-Za-z0-9_-]+__/),
    arguments: zod_1.z.record(zod_1.z.string(), zod_1.z.json()),
});
exports.mcpCallValueSchema = zod_1.z.object({
    isError: zod_1.z.boolean(),
    content: zod_1.z.array(zod_1.z.string()),
    value: zod_1.z.json().optional(),
});
