"use strict";
/** Filesystem-seam source access for the generic stdio LSP provider. */
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeWorkspace = canonicalizeWorkspace;
exports.readHostSource = readHostSource;
var node_buffer_1 = require("node:buffer");
var abort_ts_1 = require("./abort.ts");
/**
 * Resolve and validate one workspace through `ctx.fs`.
 * @param fs - filesystem provider sharing the language server's execution world.
 * @param workspaceRoot - caller-supplied workspace path.
 * @param signal - optional cancellation around provider operations.
 * @returns stable identity plus process path and file URI.
 */
function canonicalizeWorkspace(fs, workspaceRoot, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var target, error_1, info;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    (0, abort_ts_1.throwIfAborted)(signal);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fs.resolve(workspaceRoot, signal === undefined ? {} : { signal: signal })];
                case 2:
                    target = _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    (0, abort_ts_1.throwIfAborted)(signal);
                    throw new Error("workspace root \"".concat(workspaceRoot, "\" cannot be resolved: ").concat(messageOf(error_1)), { cause: error_1 });
                case 4:
                    (0, abort_ts_1.throwIfAborted)(signal);
                    return [4 /*yield*/, fs.stat(target, signal).catch(function (error) {
                            (0, abort_ts_1.throwIfAborted)(signal);
                            throw error;
                        })];
                case 5:
                    info = _a.sent();
                    (0, abort_ts_1.throwIfAborted)(signal);
                    if ((info === null || info === void 0 ? void 0 : info.type) !== 'directory') {
                        throw new Error("workspace root \"".concat(workspaceRoot, "\" is not a directory"));
                    }
                    return [2 /*return*/, {
                            target: target,
                            canonicalPath: fs.processPath(target),
                            fileUrl: fs.fileUrl(target),
                        }];
            }
        });
    });
}
/**
 * Resolve, contain, and read one byte-bounded query source through `ctx.fs`.
 * This layer owns the LSP-specific complete-document cap while the filesystem
 * provider owns streaming, regular-file checks, and UTF-8 validation.
 * @param fs - filesystem provider sharing the server's execution world.
 * @param filePath - absolute source path or path relative to `workspace`.
 * @param workspace - already-canonical workspace.
 * @param maxDocumentBytes - largest complete source accepted by this host.
 * @param signal - optional cancellation.
 * @returns canonical file URI and current text.
 */
function readHostSource(fs, filePath, workspace, maxDocumentBytes, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var target, error_2, chunks, bytes, stream, _a, stream_1, stream_1_1, chunk, e_1_1, error_3;
        var _b, e_1, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    (0, abort_ts_1.throwIfAborted)(signal);
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fs.resolve(filePath, __assign({ cwd: workspace.canonicalPath }, signal === undefined ? {} : { signal: signal }))];
                case 2:
                    target = _e.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _e.sent();
                    (0, abort_ts_1.throwIfAborted)(signal);
                    throw new Error("source \"".concat(filePath, "\" cannot be resolved: ").concat(messageOf(error_2)), { cause: error_2 });
                case 4:
                    (0, abort_ts_1.throwIfAborted)(signal);
                    if (!fs.contains(workspace.target, target)) {
                        throw new Error("source \"".concat(filePath, "\" resolves outside the workspace"));
                    }
                    chunks = [];
                    bytes = 0;
                    _e.label = 5;
                case 5:
                    _e.trys.push([5, 19, , 20]);
                    return [4 /*yield*/, fs.streamText(target, signal)];
                case 6:
                    stream = _e.sent();
                    _e.label = 7;
                case 7:
                    _e.trys.push([7, 12, 13, 18]);
                    _a = true, stream_1 = __asyncValues(stream);
                    _e.label = 8;
                case 8: return [4 /*yield*/, stream_1.next()];
                case 9:
                    if (!(stream_1_1 = _e.sent(), _b = stream_1_1.done, !_b)) return [3 /*break*/, 11];
                    _d = stream_1_1.value;
                    _a = false;
                    chunk = _d;
                    (0, abort_ts_1.throwIfAborted)(signal);
                    bytes += node_buffer_1.Buffer.byteLength(chunk);
                    if (bytes > maxDocumentBytes)
                        return [3 /*break*/, 11];
                    chunks.push(chunk);
                    _e.label = 10;
                case 10:
                    _a = true;
                    return [3 /*break*/, 8];
                case 11: return [3 /*break*/, 18];
                case 12:
                    e_1_1 = _e.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 18];
                case 13:
                    _e.trys.push([13, , 16, 17]);
                    if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 15];
                    return [4 /*yield*/, _c.call(stream_1)];
                case 14:
                    _e.sent();
                    _e.label = 15;
                case 15: return [3 /*break*/, 17];
                case 16:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 17: return [7 /*endfinally*/];
                case 18: return [3 /*break*/, 20];
                case 19:
                    error_3 = _e.sent();
                    (0, abort_ts_1.throwIfAborted)(signal);
                    throw new Error("source \"".concat(filePath, "\" could not be read: ").concat(messageOf(error_3)), { cause: error_3 });
                case 20:
                    if (bytes > maxDocumentBytes) {
                        throw new Error("source \"".concat(filePath, "\" exceeds the ").concat(maxDocumentBytes, "-byte limit; reading stopped after ").concat(bytes, " bytes"));
                    }
                    (0, abort_ts_1.throwIfAborted)(signal);
                    return [2 /*return*/, {
                            fileUrl: fs.fileUrl(target),
                            text: chunks.join(''),
                        }];
            }
        });
    });
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
