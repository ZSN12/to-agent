"use strict";
/** Package-owned LLM stream-protocol invariants. @module @z/dsh-llm/invariant */
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-llm';
/** Cordis companion plugin name. */
exports.name = 'llm-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Require one chunk index to be a non-negative safe integer. */
function validateIndex(index, fail) {
    if (!Number.isSafeInteger(index) || index < 0) {
        fail("LLM stream block index must be a non-negative safe integer, got ".concat(index));
    }
}
/** Require a delta to address an open block of its matching type. */
function validateDelta(open, index, expected, fail) {
    validateIndex(index, fail);
    var actual = open.get(index);
    if (actual !== expected) {
        fail("".concat(expected, " delta at index ").concat(index, " requires an open ").concat(expected, " block, got ").concat(String(actual)));
    }
}
/** Wrap one provider stream and enforce its grammar as chunks are consumed. */
function validateStream(source, fail) {
    return __asyncGenerator(this, arguments, function validateStream_1() {
        var open, usageSeen, finished, _a, source_1, source_1_1, chunk, blockType, e_1_1;
        var _b, e_1, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    open = new Map();
                    usageSeen = false;
                    finished = false;
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 8, 9, 14]);
                    _a = true, source_1 = __asyncValues(source);
                    _e.label = 2;
                case 2: return [4 /*yield*/, __await(source_1.next())];
                case 3:
                    if (!(source_1_1 = _e.sent(), _b = source_1_1.done, !_b)) return [3 /*break*/, 7];
                    _d = source_1_1.value;
                    _a = false;
                    chunk = _d;
                    if (finished)
                        fail("LLM stream emitted ".concat(chunk.type, " after terminal finish"));
                    switch (chunk.type) {
                        case 'block-start':
                            validateIndex(chunk.index, fail);
                            if (open.has(chunk.index))
                                fail("LLM stream repeated block-start index ".concat(chunk.index));
                            open.set(chunk.index, chunk.blockType);
                            break;
                        case 'text-delta':
                            validateDelta(open, chunk.index, 'text', fail);
                            break;
                        case 'reasoning-delta':
                            validateDelta(open, chunk.index, 'reasoning', fail);
                            break;
                        case 'tool-call-delta':
                            validateDelta(open, chunk.index, 'tool-call', fail);
                            break;
                        case 'block-end': {
                            validateIndex(chunk.index, fail);
                            blockType = open.get(chunk.index);
                            if (blockType === undefined)
                                fail("LLM stream block-end index ".concat(chunk.index, " has no open block"));
                            if (chunk.block.type !== blockType) {
                                fail("LLM stream block-end index ".concat(chunk.index, " closes ").concat(chunk.block.type, ", expected ").concat(blockType));
                            }
                            open.delete(chunk.index);
                            break;
                        }
                        case 'usage':
                            if (usageSeen)
                                fail('LLM stream emitted usage more than once');
                            usageSeen = true;
                            break;
                        case 'finish':
                            if (open.size > 0 && chunk.reason.kind !== 'error' && chunk.reason.kind !== 'aborted') {
                                fail("LLM stream finished with ".concat(open.size, " open block(s)"));
                            }
                            finished = true;
                            break;
                    }
                    return [4 /*yield*/, __await(chunk)];
                case 4: return [4 /*yield*/, _e.sent()];
                case 5:
                    _e.sent();
                    _e.label = 6;
                case 6:
                    _a = true;
                    return [3 /*break*/, 2];
                case 7: return [3 /*break*/, 14];
                case 8:
                    e_1_1 = _e.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 14];
                case 9:
                    _e.trys.push([9, , 12, 13]);
                    if (!(!_a && !_b && (_c = source_1.return))) return [3 /*break*/, 11];
                    return [4 /*yield*/, __await(_c.call(source_1))];
                case 10:
                    _e.sent();
                    _e.label = 11;
                case 11: return [3 /*break*/, 13];
                case 12:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 13: return [7 /*endfinally*/];
                case 14:
                    if (!finished)
                        fail('LLM stream ended without a terminal finish chunk');
                    return [2 /*return*/];
            }
        });
    });
}
/** Install validation around every provider stream. */
var install = function (ctx, fail) {
    ctx.on('llm/stream', function (_options, next) { return validateStream(next(), fail); }, { global: true, prepend: true });
    ctx.on('llm/adapters-updated', function () {
        // A disposer-time emit can outlive the service-store entry during whole-
        // context teardown; only a live service promises a readable registry.
        var llm = ctx.get('llm');
        if (llm === undefined)
            return;
        for (var _i = 0, _a = llm.listProviders(); _i < _a.length; _i++) {
            var provider = _a[_i];
            try {
                llm.providerRetryPolicy(provider.id);
            }
            catch (_b) {
                // Reaching here IS the violation: the notification promised a readable
                // registry, and only that broken promise can make the lookup throw.
                fail("llm/adapters-updated fired while provider \"".concat(provider.id, "\" has no readable registration"));
            }
        }
    }, { global: true });
};
/**
 * Register the LLM invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
