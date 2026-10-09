"use strict";
/**
 * Human-facing `/compact` command over the backend-independent compaction seam.
 * @module @z/dsh-command-compact
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
exports.inject = exports.name = void 0;
exports.apply = apply;
var dsh_compaction_1 = require("@z/dsh-compaction");
exports.name = 'command-compact';
exports.inject = ['commands', 'compaction'];
var USAGE = 'Usage: /compact (no arguments)';
/** Fail loudly if a locally closed union gains an unhandled member. */
/* v8 ignore start -- closed-union backstop is unreachable without violating the TypeScript contract */
function assertNever(value) {
    throw new TypeError("unknown manual compaction error code: ".concat(String(value)));
}
/* v8 ignore stop */
/** Convert expected capability failures into concise human-only outcomes. */
function expectedFailure(error) {
    switch (error.code) {
        case 'busy':
            return {
                kind: 'error',
                text: 'Compaction is unavailable because this process has an active compaction, or the agent is not idle.',
            };
        case 'cancelled':
            return { kind: 'error', text: 'Compaction cancelled.' };
        case 'changed':
            return {
                kind: 'error',
                text: 'The history selected for compaction changed before it could be replaced. The conversation is unchanged; the attempt is recorded in the session log.',
            };
        case 'summary':
            return {
                kind: 'error',
                text: 'Compaction could not produce a useful summary. The conversation is unchanged; the attempt is recorded in the session log.',
            };
        case 'commit':
            return {
                kind: 'error',
                text: 'Compaction did not finish cleanly; some session history may have changed. Inspect the current session state before retrying.',
            };
        case 'persistence':
            return {
                kind: 'error',
                text: 'Compaction finished, but the session could not be saved.',
            };
        /* v8 ignore next 2 -- ManualCompactionErrorCode is closed and every member is handled above */
        default: return assertNever(error.code);
    }
}
/** Execute one argument-free manual compaction request. */
function executeCompact(ctx, invocation) {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (invocation.rawInput.trim().length > 0) {
                        return [2 /*return*/, { kind: 'error', text: USAGE }];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, ctx.compaction.compactNow(invocation.agent, invocation.signal, invocation.commandId)];
                case 2:
                    result = _a.sent();
                    if (result === null)
                        return [2 /*return*/, { kind: 'success', text: 'No compactable history yet.' }];
                    return [2 /*return*/, {
                            kind: 'success',
                            text: "Compacted ".concat(result.shadowedSeqs.length, " history items (~").concat(result.shadowedTokenCount, " tokens)."),
                            sourceEventSeq: result.summarySeq,
                        }];
                case 3:
                    error_1 = _a.sent();
                    if (invocation.signal.aborted)
                        return [2 /*return*/, { kind: 'error', text: 'Compaction cancelled.' }];
                    if (error_1 instanceof dsh_compaction_1.ManualCompactionError)
                        return [2 /*return*/, expectedFailure(error_1)];
                    throw error_1;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Register `/compact` for every composed human-command adapter.
 * @param ctx - context carrying the command registry and the compaction seam.
 */
function apply(ctx) {
    var active = new Set();
    var handler = function (invocation) {
        var operation = executeCompact(ctx, invocation);
        active.add(operation);
        var retire = function () { active.delete(operation); };
        // Both branches retire without rethrowing, so the derived observer promise
        // cannot become an unhandled mirror of an expected handler rejection.
        void operation.then(retire, retire);
        return operation;
    };
    ctx.effect(function () {
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // Yield drain before registration: composite teardown is LIFO, so no new
                // invocation can enter while already-started handler promises quiesce.
                return [4 /*yield*/, function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, Promise.allSettled(active)];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    }); }); }];
                case 1:
                    // Yield drain before registration: composite teardown is LIFO, so no new
                    // invocation can enter while already-started handler promises quiesce.
                    _a.sent();
                    return [4 /*yield*/, ctx.commands.register({
                            name: 'compact',
                            description: 'Compact older conversation history',
                            handler: handler,
                        })];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }, 'command-compact lifecycle');
}
