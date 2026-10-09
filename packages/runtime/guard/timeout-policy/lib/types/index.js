"use strict";
/**
 * Cooperative tool-call timeout enforcer. A tool declares `timeoutMs` and
 * promises to honor `exec.signal`; this wrapper arms that deadline and maps its
 * own expiry to `TOOL_TIMEOUT` without racing or abandoning the tool promise.
 *
 * FIXME: settle the intended `@z/dsh-timeout-guard` rename before the
 * first tagged release — suggestion only, aligning the name with its `guard/`
 * home; decide at resolution time
 * ([regrouping Agent Note](../../../../.agents/notes/implemented/architecture/2026-07-29-package-regrouping.md)).
 *
 * @module @z/dsh-tool-call-timeout-policy
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
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.name = exports.TOOL_TIMEOUT = void 0;
exports.apply = apply;
var dsh_timeout_1 = require("@z/dsh-timeout");
/**
 * The code owned by this plugin, used BOTH as the internal {@link deadline}
 * classification code AND as the structured error `code` on the replacement
 * tool result. Scoping {@link timeoutOf} to it keeps a nested outer deadline
 * (another `tools/execute` wrapper's timer that fired first) from being misread
 * as this plugin's own timeout — it reads as an ordinary upstream cancel.
 */
exports.TOOL_TIMEOUT = 'TOOL_TIMEOUT';
/** Cordis plugin name used by loader diagnostics. */
exports.name = 'timeout-policy';
/** The tool registry service this plugin wraps (`tools/execute`) and reads (`get`). */
exports.inject = ['tools'];
/**
 * The structured result substituted when this plugin's deadline wins. `content`
 * is the model-facing message; `error.code` is the same {@link TOOL_TIMEOUT}
 * this plugin owns, so a retry/sandbox plugin (and replay) can route on it.
 *
 * @param timeoutMs - the elapsed budget, rendered into the model-facing message.
 * @returns the `isError` {@link ToolExecutionResult} with a `TOOL_TIMEOUT` error.
 */
function toolTimeoutResult(timeoutMs) {
    var message = "tool call timed out after ".concat(timeoutMs, "ms");
    return {
        content: [{ type: 'text', text: "Error: ".concat(message) }],
        isError: true,
        error: { message: message, info: { name: 'ToolTimeoutError', code: exports.TOOL_TIMEOUT } },
    };
}
/**
 * Register the timeout wrapper. It resolves the caller-visible tool definition,
 * temporarily replaces `exec.signal`, delegates, restores the upstream signal,
 * and replaces the result only when this wrapper's own timer fired.
 */
function apply(ctx) {
    var _this = this;
    ctx.on('tools/execute', function (exec, next) { return __awaiter(_this, void 0, void 0, function () {
        var env_1, timeoutMs, d, upstream, result, e_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    env_1 = { stack: [], error: void 0, hasError: false };
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 6, 7, 8]);
                    timeoutMs = (_a = ctx.tools.get(exec.name, exec.agent)) === null || _a === void 0 ? void 0 : _a.timeoutMs;
                    // A tool that declares no budget: no deadline, delegate unchanged.
                    if (timeoutMs === undefined)
                        return [2 /*return*/, next()];
                    d = __addDisposableResource(env_1, (0, dsh_timeout_1.deadline)(exec.signal, timeoutMs, exports.TOOL_TIMEOUT)
                    // Swap the derived deadline onto exec for dispatch, then restore the
                    // caller's own signal so post-execute listeners never see this plugin's
                    // (possibly already-aborted) timeout signal.
                    , false);
                    upstream = exec.signal;
                    exec.signal = d.signal;
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, , 4, 5]);
                    return [4 /*yield*/, next()
                        // If OUR timer fired (scoped by code — a nested outer deadline reads as
                        // undefined here), the tool/capability saw the abort and reached
                        // quiescence; replace whatever it returned (its own abort result) with the
                        // structured TOOL_TIMEOUT the model sees.
                    ];
                case 3:
                    result = _b.sent();
                    // If OUR timer fired (scoped by code — a nested outer deadline reads as
                    // undefined here), the tool/capability saw the abort and reached
                    // quiescence; replace whatever it returned (its own abort result) with the
                    // structured TOOL_TIMEOUT the model sees.
                    if ((0, dsh_timeout_1.timeoutOf)(d.signal, exports.TOOL_TIMEOUT) !== undefined) {
                        return [2 /*return*/, toolTimeoutResult(timeoutMs)];
                    }
                    return [2 /*return*/, result];
                case 4:
                    exec.signal = upstream;
                    return [7 /*endfinally*/];
                case 5: return [3 /*break*/, 8];
                case 6:
                    e_1 = _b.sent();
                    env_1.error = e_1;
                    env_1.hasError = true;
                    return [3 /*break*/, 8];
                case 7:
                    __disposeResources(env_1);
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    }); });
}
