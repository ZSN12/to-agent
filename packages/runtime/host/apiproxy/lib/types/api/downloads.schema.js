"use strict";
/**
 * downloads domain zod schemas. The download surface has no wire
 * envelope: the request arrives as query parameters (all strings), so its
 * request schema parses the raw query-parameter object into the method's
 * exact request shape. SessionId brand cast point: sessionIdSchema, and only
 * there (hosted in sessions.schema like every other cast).
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionLogQuerySchema = void 0;
var zod_1 = require("zod");
var sessions_schema_ts_1 = require("./sessions.schema.ts");
/**
 * session.export query params → the sessionLog request. `includeDescendants`
 * accepts exactly `true`/`false`/absent; any other value is rejected (400) so
 * a misspelled flag cannot silently under-export.
 */
exports.sessionLogQuerySchema = zod_1.z
    .object({
    sessionId: sessions_schema_ts_1.sessionIdSchema,
    includeDescendants: zod_1.z.union([zod_1.z.literal('true'), zod_1.z.literal('false')]).optional(),
})
    .transform(function (query) { return (__assign({ sessionId: query.sessionId }, (query.includeDescendants === 'true' ? { includeDescendants: true } : {}))); });
