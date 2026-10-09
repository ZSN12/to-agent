"use strict";
/**
 * Session-query service error containment and model-safe translation.
 *
 * @module @z/dsh-tool-session-query/service-boundary
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceBoundary = void 0;
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_session_query_1 = require("@z/dsh-session-query");
var UNPRINTABLE_SERVICE_ERROR = '[unprintable session query failure]';
var SAFE_SESSION_QUERY_FAILURES = {
    SESSION_QUERY_ABORTED: {
        code: 'SESSION_QUERY_ABORTED',
        message: 'session query was cancelled',
    },
    SESSION_QUERY_CORRUPT_SESSION: {
        code: 'SESSION_QUERY_CORRUPT_SESSION',
        message: 'session event history is corrupt',
    },
    SESSION_QUERY_EVENT_NOT_FOUND: {
        code: 'SESSION_QUERY_EVENT_NOT_FOUND',
        message: 'session event was not found',
    },
    SESSION_QUERY_INDEX_FAILED: {
        code: 'SESSION_QUERY_INDEX_FAILED',
        message: 'session search index is unavailable',
    },
    SESSION_QUERY_INVALID_CONFIG: {
        code: 'SESSION_QUERY_TOOL_FAILED',
        message: 'session query operation failed',
    },
    SESSION_QUERY_INVALID_CURSOR: {
        code: 'SESSION_QUERY_INVALID_CURSOR',
        message: 'session search continuation is invalid',
    },
    SESSION_QUERY_INVALID_FILTER: {
        code: 'SESSION_QUERY_INVALID_FILTER',
        message: 'session query filters were rejected',
    },
    SESSION_QUERY_INVALID_LIMIT: {
        code: 'SESSION_QUERY_INVALID_LIMIT',
        message: 'session query result limit was rejected',
    },
    SESSION_QUERY_INVALID_QUERY: {
        code: 'SESSION_QUERY_INVALID_QUERY',
        message: 'session query was rejected',
    },
    SESSION_QUERY_INVALID_LINEAGE: {
        code: 'SESSION_QUERY_INVALID_LINEAGE',
        message: 'session lineage is invalid',
    },
    SESSION_QUERY_INVALID_SURFACE: {
        code: 'SESSION_QUERY_INVALID_SURFACE',
        message: 'session event history is invalid',
    },
    SESSION_QUERY_INVALID_WINDOW: {
        code: 'SESSION_QUERY_INVALID_WINDOW',
        message: 'session event window is invalid',
    },
    SESSION_QUERY_PERSISTENCE_FAILED: {
        code: 'SESSION_QUERY_PERSISTENCE_FAILED',
        message: 'session history storage is unavailable',
    },
    SESSION_QUERY_SEARCH_DISABLED: {
        code: 'SESSION_QUERY_SEARCH_DISABLED',
        message: 'session search is disabled in this deployment',
    },
    SESSION_QUERY_SESSION_NOT_FOUND: {
        code: 'SESSION_QUERY_SESSION_NOT_FOUND',
        message: 'session was not found',
    },
    SESSION_QUERY_STALE_CURSOR: {
        code: 'SESSION_QUERY_STALE_CURSOR',
        message: 'session history changed while paging; retry the complete search call',
    },
    SESSION_QUERY_SOURCE_CONFLICT: {
        code: 'SESSION_QUERY_TOOL_FAILED',
        message: 'session query operation failed',
    },
};
function unauthorizedTarget() {
    return new dsh_llm_1.HarnessError('session target is outside the caller workspace', 'SESSION_QUERY_TOOL_UNAUTHORIZED');
}
function call(ctx, signal, operation, invoke) {
    return __awaiter(this, void 0, void 0, function () {
        var value, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    signal.throwIfAborted();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, invoke()];
                case 2:
                    value = _a.sent();
                    signal.throwIfAborted();
                    return [2 /*return*/, value];
                case 3:
                    error_1 = _a.sent();
                    signal.throwIfAborted();
                    throw sanitizeError(ctx, operation, error_1);
                case 4: return [2 /*return*/];
            }
        });
    });
}
function sanitizeError(ctx, operation, error) {
    var generic = genericFailure();
    var diagnostic = fullError(error);
    try {
        ctx.logger.warn("tool-session-query: ".concat(operation, " failed: ").concat(diagnostic));
        if (error instanceof dsh_session_query_1.SessionQueryError) {
            var code = error.code;
            var failure = typeof code === 'string' && Object.hasOwn(SAFE_SESSION_QUERY_FAILURES, code)
                ? SAFE_SESSION_QUERY_FAILURES[code]
                : undefined;
            if (failure !== undefined && failure.code !== 'SESSION_QUERY_TOOL_FAILED') {
                return new dsh_session_query_1.SessionQueryError(failure.message, failure.code);
            }
        }
        if (error instanceof dsh_llm_1.HarnessError && error.code === 'SESSION_QUERY_TOOL_UNAUTHORIZED') {
            return unauthorizedTarget();
        }
    }
    catch (_a) {
        return generic;
    }
    return generic;
}
function genericFailure() {
    return new dsh_llm_1.HarnessError('session query operation failed', 'SESSION_QUERY_TOOL_FAILED');
}
function fullError(error) {
    try {
        return renderFullError(error);
    }
    catch (_a) {
        return UNPRINTABLE_SERVICE_ERROR;
    }
}
function renderFullError(error) {
    var _a;
    if (!(error instanceof Error))
        return String(error);
    var diagnostics = [];
    var seen = new Set();
    var current = error;
    while (current instanceof Error && !seen.has(current)) {
        seen.add(current);
        diagnostics.push((_a = current.stack) !== null && _a !== void 0 ? _a : String(current));
        current = current.cause;
    }
    /* v8 ignore next -- defensive containment for a cyclic Error.cause graph */
    if (current instanceof Error)
        diagnostics.push('[circular error cause]');
    else if (current !== undefined)
        diagnostics.push(renderFullError(current));
    return diagnostics.join('\nCaused by: ');
}
/** Model-safe session-query invocation and error translation boundary. */
exports.serviceBoundary = {
    unauthorizedTarget: unauthorizedTarget,
    call: call,
    sanitizeError: sanitizeError,
};
