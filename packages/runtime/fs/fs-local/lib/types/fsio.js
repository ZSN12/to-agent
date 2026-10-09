"use strict";
/**
 * Cordis-free local filesystem mechanics. This provider layer returns validated UTF-8 text,
 * streams large files, and rejects binary data; line windows belong to `dsh-tool-fs`. Writes
 * stage an exclusive owner-only file in a private sibling directory and atomically publish it.
 * @module @z/dsh-fs-local/fsio
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLocalTarget = resolveLocalTarget;
exports.probe = probe;
exports.probeNoFollow = probeNoFollow;
exports.listDirectory = listDirectory;
exports.readWholeText = readWholeText;
exports.readWholeBytes = readWholeBytes;
exports.streamWholeText = streamWholeText;
exports.writeFileAtomic = writeFileAtomic;
exports.readForEdit = readForEdit;
exports.readTextForDiff = readTextForDiff;
exports.applyLiteralEdit = applyLiteralEdit;
exports.normalizeLineEndings = normalizeLineEndings;
exports.restoreLineEndings = restoreLineEndings;
var node_crypto_1 = require("node:crypto");
var node_fs_1 = require("node:fs");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var node_util_1 = require("node:util");
var dsh_fs_1 = require("@z/dsh-fs");
var win32_ts_1 = require("./win32.ts");
var BINARY_SAMPLE_BYTES = 8192;
// Bound one non-abortable FileHandle.read so cancellation is observed between chunks.
var DIFF_BASIS_READ_CHUNK_BYTES = 64 * 1024;
function isENOENT(error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
function isEEXIST(error) {
    return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}
/**
 * A path component that is expected to be a directory is a regular file (e.g.
 * resolving `afile/child.txt` when `afile` is a file). Like `ENOENT`, the target
 * cannot exist — so the resolution/probe paths treat it as "absent" rather than
 * letting a raw Node error escape without the structured `FsError` taxonomy.
 */
function isENOTDIR(error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOTDIR';
}
function isAbortError(error) {
    return error instanceof Error && error.name === 'AbortError';
}
/* v8 ignore start -- composes secondary cleanup-failure messages, which require a filesystem/kernel fault after the primary failure. */
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/* v8 ignore stop */
function isPermissionError(error) {
    return error instanceof Error && 'code' in error && (error.code === 'EACCES' || error.code === 'EPERM');
}
function throwIfAborted(signal, verb) {
    if (signal === null || signal === void 0 ? void 0 : signal.aborted)
        throw new dsh_fs_1.FsError("".concat(verb, " aborted"), 'FS_ABORTED');
}
/**
 * `readFile` with the supplied signal, translating a mid-read `AbortError` into
 * the seam's structured `FsError('FS_ABORTED')` (Node rejects an aborted
 * `readFile` with a bare `AbortError`, which would otherwise escape the seam's
 * error taxonomy — the streaming/write paths translate it the same way).
 */
function readFileAbortable(absolutePath, verb, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, promises_1.readFile)(absolutePath, signal ? { signal: signal } : {})];
                case 1: return [2 /*return*/, _a.sent()];
                case 2:
                    error_1 = _a.sent();
                    /* v8 ignore next 2 -- a non-abort readFile rejection needs a permission/IO fault racing an open file. */
                    if (!isAbortError(error_1))
                        throw error_1;
                    throw new dsh_fs_1.FsError("".concat(verb, " aborted"), 'FS_ABORTED');
                case 3: return [2 /*return*/];
            }
        });
    });
}
/** Opaque version token from high-resolution identity and freshness metadata. */
function versionOf(info) {
    return (0, dsh_fs_1.FsVersion)("".concat(info.dev, ":").concat(info.ino, ":").concat(info.size, ":").concat(info.mtimeNs, ":").concat(info.ctimeNs));
}
/**
 * Resolve a path to its absolute display path and realpath identity. For a missing target,
 * realpath the nearest existing ancestor and append the missing suffix, preserving identity
 * across symlinked ancestors before and after creation.
 * @param cwd - base directory a relative `path` resolves against.
 * @param path - absolute or relative path; empty/whitespace-only throws `FS_NOT_FOUND`.
 * @returns the absolute display path plus the realpath-derived stable target key.
 */
function resolveLocalTarget(cwd, path) {
    return __awaiter(this, void 0, void 0, function () {
        var displayPath, _a, error_2, missing, ancestor, realAncestor, parentInfo, error_3, parent_1;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (path.trim().length === 0)
                        throw new dsh_fs_1.FsError('file_path must be a non-empty string', 'FS_NOT_FOUND');
                    displayPath = (0, node_path_1.resolve)(cwd, path);
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    _b = { displayPath: displayPath };
                    _a = dsh_fs_1.FsTargetKey;
                    return [4 /*yield*/, (0, promises_1.realpath)(displayPath)];
                case 2: 
                // Prefer the file's own realpath (resolves a symlinked file to its target).
                return [2 /*return*/, (_b.targetKey = _a.apply(void 0, [_c.sent()]), _b)];
                case 3:
                    error_2 = _c.sent();
                    // A path component is a file, not a directory (e.g. "afile/child.txt" where
                    // "afile" is a regular file): the target can neither exist nor be created,
                    // so surface the structured taxonomy instead of a raw Node ENOTDIR.
                    /* v8 ignore next -- Windows reports this case as ENOENT and repairs it in the ancestor walk below. */
                    if (isENOTDIR(error_2))
                        throw new dsh_fs_1.FsError("cannot resolve \"".concat(displayPath, "\": a parent path segment is not a directory"), 'FS_NOT_FOUND');
                    /* v8 ignore next -- non-ENOENT realpath failure needs a permission/IO fault; ENOENT falls through to ancestor resolution. */
                    if (!isENOENT(error_2))
                        throw error_2;
                    return [3 /*break*/, 4];
                case 4:
                    missing = [(0, node_path_1.basename)(displayPath)];
                    ancestor = (0, node_path_1.dirname)(displayPath);
                    _c.label = 5;
                case 5:
                    if (!true) return [3 /*break*/, 12];
                    _c.label = 6;
                case 6:
                    _c.trys.push([6, 10, , 11]);
                    return [4 /*yield*/, (0, promises_1.realpath)(ancestor)
                        // On Windows, realpath of a regular file succeeds where POSIX returns
                        // ENOTDIR (the OS reports ENOENT for `regular-file/child`, not ENOTDIR).
                        // Stat the ancestor to restore the semantic distinction: a non-directory
                        // ancestor means the target passes through a file and can never be created.
                        /* v8 ignore start -- native Windows coverage exercises this repair; POSIX reports ENOTDIR before this point. */
                    ];
                case 7:
                    realAncestor = _c.sent();
                    if (!(process.platform === 'win32')) return [3 /*break*/, 9];
                    return [4 /*yield*/, (0, promises_1.stat)(realAncestor)];
                case 8:
                    parentInfo = _c.sent();
                    if (!parentInfo.isDirectory()) {
                        throw new dsh_fs_1.FsError("cannot resolve \"".concat(displayPath, "\": a parent path segment is not a directory"), 'FS_NOT_FOUND');
                    }
                    _c.label = 9;
                case 9: 
                /* v8 ignore stop */
                return [2 /*return*/, { displayPath: displayPath, targetKey: (0, dsh_fs_1.FsTargetKey)(node_path_1.join.apply(void 0, __spreadArray([realAncestor], missing, false))) }];
                case 10:
                    error_3 = _c.sent();
                    /* v8 ignore next -- native Windows coverage exercises the FsError raised by the repair above. */
                    if (error_3 instanceof dsh_fs_1.FsError)
                        throw error_3;
                    /* v8 ignore next -- a non-ENOENT realpath failure needs a permission/IO fault. */
                    if (!isENOENT(error_3))
                        throw error_3;
                    parent_1 = (0, node_path_1.dirname)(ancestor);
                    /* v8 ignore next -- the filesystem root always realpaths, so the walk terminates before parent === ancestor. */
                    if (parent_1 === ancestor)
                        return [2 /*return*/, { displayPath: displayPath, targetKey: (0, dsh_fs_1.FsTargetKey)(displayPath) }];
                    missing.unshift((0, node_path_1.basename)(ancestor));
                    ancestor = parent_1;
                    return [3 /*break*/, 11];
                case 11: return [3 /*break*/, 5];
                case 12: return [2 /*return*/];
            }
        });
    });
}
function pathType(info) {
    if (info.isFile())
        return 'file';
    /* v8 ignore else -- Windows has no special-entry fixture for the non-directory branch. */
    if (info.isDirectory())
        return 'directory';
    /* v8 ignore next -- the corresponding special-entry return is covered on POSIX. */
    return 'other';
}
function pathLinkType(info) {
    if (info.isSymbolicLink())
        return 'symlink';
    return pathType(info);
}
function probeStats(absolutePath, readStats) {
    return __awaiter(this, void 0, void 0, function () {
        var error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, readStats(absolutePath)];
                case 1: return [2 /*return*/, _a.sent()];
                case 2:
                    error_4 = _a.sent();
                    // ENOENT (no such file) and ENOTDIR (a parent segment is a file) both mean
                    // the target is absent; any other metadata failure is a real permission/IO
                    // fault.
                    /* v8 ignore next -- a non-ENOENT/ENOTDIR metadata failure needs a permission/IO fault; surface it. */
                    if (!isENOENT(error_4) && !isENOTDIR(error_4))
                        throw error_4;
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Probe a path for its version, mode, type, and size. Null if absent.
 * @param absolutePath - the path to stat (typically a target key; symlinks are followed).
 * @returns the metadata, or null when the path — or a parent segment — does not exist.
 */
function probe(absolutePath) {
    return __awaiter(this, void 0, void 0, function () {
        var info;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, probeStats(absolutePath, function (path) { return (0, promises_1.stat)(path, { bigint: true }); })];
                case 1:
                    info = _a.sent();
                    if (!info)
                        return [2 /*return*/, null];
                    return [2 /*return*/, {
                            version: versionOf(info),
                            mode: Number(info.mode & 511n),
                            type: pathType(info),
                            size: Number(info.size),
                        }];
            }
        });
    });
}
/**
 * Probe a path without following the final symlink component.
 * @param absolutePath - the path entry to inspect with `lstat` semantics.
 * @returns path-entry metadata, or null when the entry is absent.
 */
function probeNoFollow(absolutePath) {
    return __awaiter(this, void 0, void 0, function () {
        var info;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, probeStats(absolutePath, function (path) { return (0, promises_1.lstat)(path, { bigint: true }); })];
                case 1:
                    info = _a.sent();
                    if (!info)
                        return [2 /*return*/, null];
                    return [2 /*return*/, {
                            version: versionOf(info),
                            mode: Number(info.mode & 511n),
                            type: pathLinkType(info),
                            size: Number(info.size),
                        }];
            }
        });
    });
}
// --- Directory listing ---
function listingIoError(displayPath, error) {
    /* v8 ignore next -- defensive pass-through for races where a child resolver has already produced a structured FsError. */
    if (error instanceof dsh_fs_1.FsError)
        return error;
    /* v8 ignore next -- requires the listed target/parent to disappear between successful preflight and listing/child resolution. */
    if (isENOENT(error) || isENOTDIR(error))
        return new dsh_fs_1.FsError("cannot list \"".concat(displayPath, "\": not found"), 'FS_NOT_FOUND', { cause: error });
    /* v8 ignore next -- Windows chmod does not deny directory listing; POSIX covers permission translation. */
    if (isPermissionError(error))
        return new dsh_fs_1.FsError("cannot list \"".concat(displayPath, "\": permission denied"), 'FS_PERMISSION_DENIED', { cause: error });
    return new dsh_fs_1.FsError("cannot list \"".concat(displayPath, "\": ").concat(errorMessage(error)), 'FS_IO_ERROR', { cause: error });
}
function resolveListedChildTarget(parent, name) {
    return __awaiter(this, void 0, void 0, function () {
        var identity;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveLocalTarget(parent.targetKey, name)];
                case 1:
                    identity = _a.sent();
                    return [2 /*return*/, { displayPath: (0, node_path_1.join)(parent.displayPath, name), targetKey: identity.targetKey }];
            }
        });
    });
}
/**
 * List direct children of a directory in stable name order. Each child includes
 * a resolved target plus stat metadata when still available; file contents are
 * never read.
 * @param target - the resolved directory to list; a missing or non-directory target throws.
 * @param signal - aborts the listing, checked between children (`FS_ABORTED`).
 * @returns one entry per direct child, sorted by name.
 */
function listDirectory(target, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var info, error_5, entries, error_6, result, _i, _a, entry, childTarget, childInfo, error_7;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    throwIfAborted(signal, 'list');
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, probe(target.targetKey)];
                case 2:
                    info = _c.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_5 = _c.sent();
                    throw listingIoError(target.displayPath, error_5);
                case 4:
                    if (!info)
                        throw new dsh_fs_1.FsError("cannot list \"".concat(target.displayPath, "\": not found"), 'FS_NOT_FOUND');
                    if (info.type !== 'directory')
                        throw new dsh_fs_1.FsError("cannot list \"".concat(target.displayPath, "\": not a directory"), 'FS_NOT_DIRECTORY');
                    _c.label = 5;
                case 5:
                    _c.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, (0, promises_1.readdir)(target.targetKey, { withFileTypes: true, encoding: 'utf8' })];
                case 6:
                    entries = _c.sent();
                    return [3 /*break*/, 8];
                case 7:
                    error_6 = _c.sent();
                    /* v8 ignore next -- requires permission/kernel failure from readdir after a successful directory stat. */
                    throw listingIoError(target.displayPath, error_6);
                case 8:
                    throwIfAborted(signal, 'list');
                    result = [];
                    _i = 0, _a = entries.sort(function (left, right) { return left.name.localeCompare(right.name); });
                    _c.label = 9;
                case 9:
                    if (!(_i < _a.length)) return [3 /*break*/, 16];
                    entry = _a[_i];
                    throwIfAborted(signal, 'list');
                    _c.label = 10;
                case 10:
                    _c.trys.push([10, 13, , 14]);
                    return [4 /*yield*/, resolveListedChildTarget(target, entry.name)];
                case 11:
                    childTarget = _c.sent();
                    return [4 /*yield*/, probe(childTarget.targetKey)];
                case 12:
                    childInfo = _c.sent();
                    result.push(__assign(__assign({ name: entry.name, type: (_b = childInfo === null || childInfo === void 0 ? void 0 : childInfo.type) !== null && _b !== void 0 ? _b : 'other', target: childTarget }, (childInfo ? { version: childInfo.version } : {})), ((childInfo === null || childInfo === void 0 ? void 0 : childInfo.type) === 'file' ? { size: childInfo.size } : {})));
                    return [3 /*break*/, 14];
                case 13:
                    error_7 = _c.sent();
                    throw listingIoError((0, node_path_1.join)(target.displayPath, entry.name), error_7);
                case 14:
                    throwIfAborted(signal, 'list');
                    _c.label = 15;
                case 15:
                    _i++;
                    return [3 /*break*/, 9];
                case 16: return [2 /*return*/, result];
            }
        });
    });
}
// --- Reading ---
function notTextError(verb, displayPath) {
    return new dsh_fs_1.FsError("cannot ".concat(verb, " \"").concat(displayPath, "\": invalid UTF-8 text"), 'FS_NOT_TEXT');
}
function decodeUtf8(buffer, verb, displayPath) {
    try {
        return new node_util_1.TextDecoder('utf-8', { fatal: true }).decode(buffer);
    }
    catch (error) {
        /* v8 ignore next 2 -- TextDecoder({fatal}) only throws TypeError on invalid bytes; any other throw is an unreachable runtime fault. */
        if (!(error instanceof TypeError))
            throw error;
        throw notTextError(verb, displayPath);
    }
}
function decodeUtf8Stream(decoder, chunk, verb, displayPath) {
    try {
        return chunk ? decoder.decode(chunk, { stream: true }) : decoder.decode();
    }
    catch (error) {
        /* v8 ignore next 2 -- TextDecoder({fatal}) only throws TypeError on invalid bytes; any other throw is an unreachable runtime fault. */
        if (!(error instanceof TypeError))
            throw error;
        throw notTextError(verb, displayPath);
    }
}
function statRegularFile(target, verb, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var info, error_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    throwIfAborted(signal, verb);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.stat)(target.targetKey)];
                case 2:
                    info = _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_8 = _a.sent();
                    /* v8 ignore next 2 -- a non-ENOENT stat failure needs a permission/IO fault; only the not-found path is reachable in tests. */
                    if (!isENOENT(error_8))
                        throw error_8;
                    throw new dsh_fs_1.FsError("cannot ".concat(verb, " \"").concat(target.displayPath, "\": not found"), 'FS_NOT_FOUND');
                case 4:
                    if (!info.isFile())
                        throw new dsh_fs_1.FsError("cannot ".concat(verb, " \"").concat(target.displayPath, "\": not a regular file"), 'FS_NOT_REGULAR_FILE');
                    return [2 /*return*/, info];
            }
        });
    });
}
/**
 * Read a whole regular UTF-8 text file into a single decoded string. Rejects
 * non-regular files, invalid UTF-8, and NUL-byte binary samples.
 * @param target - the resolved file to read.
 * @param signal - aborts the read (`FS_ABORTED`).
 * @returns the full decoded text, byte-for-byte (no normalization).
 */
function readWholeText(target, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var raw;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, statRegularFile(target, 'read', signal)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, readFileAbortable(target.targetKey, 'read', signal)];
                case 2:
                    raw = _a.sent();
                    throwIfAborted(signal, 'read');
                    if (raw.subarray(0, BINARY_SAMPLE_BYTES).includes(0)) {
                        throw new dsh_fs_1.FsError("cannot read \"".concat(target.displayPath, "\": binary file"), 'FS_NOT_TEXT');
                    }
                    return [2 /*return*/, decodeUtf8(raw, 'read', target.displayPath)];
            }
        });
    });
}
/**
 * Read a whole regular file as raw bytes with no decoding or binary rejection.
 * `maxBytes` bounds the complete content: the stat size short-circuits an
 * oversized file before any content I/O, and the stream reads at most one byte
 * beyond the cap so a file growing after stat cannot cause unbounded buffering.
 * @param target - the resolved file to read.
 * @param signal - aborts the read (`FS_ABORTED`).
 * @param maxBytes - inclusive byte cap on the complete content (`FS_TOO_LARGE`).
 * @param internals - test seam for a deterministic post-stat growth race.
 * @returns the full raw content, at most `maxBytes` long.
 */
function readWholeBytes(target_1, signal_1, maxBytes_1) {
    return __awaiter(this, arguments, void 0, function (target, signal, maxBytes, internals) {
        var info, stream, chunks, bytes, _a, _b, _c, chunk, e_1_1, error_9;
        var _d, e_1, _e, _f;
        var _g;
        if (internals === void 0) { internals = {}; }
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0: return [4 /*yield*/, statRegularFile(target, 'read', signal)];
                case 1:
                    info = _h.sent();
                    if (info.size > maxBytes) {
                        throw new dsh_fs_1.FsError("cannot read \"".concat(target.displayPath, "\": ").concat(info.size, " bytes exceeds the ").concat(maxBytes, "-byte limit"), 'FS_TOO_LARGE');
                    }
                    return [4 /*yield*/, ((_g = internals.inspectReadBytesAfterStat) === null || _g === void 0 ? void 0 : _g.call(internals, target))];
                case 2:
                    _h.sent();
                    stream = (0, node_fs_1.createReadStream)(target.targetKey, __assign({ end: maxBytes }, signal ? { signal: signal } : {}));
                    chunks = [];
                    bytes = 0;
                    _h.label = 3;
                case 3:
                    _h.trys.push([3, 16, , 17]);
                    _h.label = 4;
                case 4:
                    _h.trys.push([4, 9, 10, 15]);
                    _a = true, _b = __asyncValues(stream);
                    _h.label = 5;
                case 5: return [4 /*yield*/, _b.next()];
                case 6:
                    if (!(_c = _h.sent(), _d = _c.done, !_d)) return [3 /*break*/, 8];
                    _f = _c.value;
                    _a = false;
                    chunk = _f;
                    bytes += chunk.length;
                    if (bytes > maxBytes) {
                        throw new dsh_fs_1.FsError("cannot read \"".concat(target.displayPath, "\": content exceeds the ").concat(maxBytes, "-byte limit"), 'FS_TOO_LARGE');
                    }
                    chunks.push(chunk);
                    _h.label = 7;
                case 7:
                    _a = true;
                    return [3 /*break*/, 5];
                case 8: return [3 /*break*/, 15];
                case 9:
                    e_1_1 = _h.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 15];
                case 10:
                    _h.trys.push([10, , 13, 14]);
                    if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 12];
                    return [4 /*yield*/, _e.call(_b)];
                case 11:
                    _h.sent();
                    _h.label = 12;
                case 12: return [3 /*break*/, 14];
                case 13:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 14: return [7 /*endfinally*/];
                case 15: return [3 /*break*/, 17];
                case 16:
                    error_9 = _h.sent();
                    /* v8 ignore next 2 -- a mid-stream abort needs cancellation racing an active read; pre-abort is deterministic. */
                    if (isAbortError(error_9))
                        throw new dsh_fs_1.FsError('read aborted', 'FS_ABORTED');
                    throw error_9;
                case 17: return [2 /*return*/, Buffer.concat(chunks, bytes)];
            }
        });
    });
}
/**
 * Stream a whole regular UTF-8 text file as decoded text chunks. Same text
 * semantics as {@link readWholeText} (regular-file check, binary/NUL rejection,
 * cross-chunk UTF-8 decoding), but never holds the whole file in memory.
 * @param target - the resolved file to stream.
 * @param signal - aborts the stream, including between chunks (`FS_ABORTED`).
 * @returns decoded text chunks in file order; chunk boundaries carry no meaning.
 */
function streamWholeText(target, signal) {
    return __asyncGenerator(this, arguments, function streamWholeText_1() {
        function scanBinarySample(chunk) {
            if (sampledBytes >= BINARY_SAMPLE_BYTES)
                return;
            var sample = chunk.subarray(0, Math.min(chunk.length, BINARY_SAMPLE_BYTES - sampledBytes));
            if (sample.includes(0)) {
                throw new dsh_fs_1.FsError("cannot read \"".concat(target.displayPath, "\": binary file"), 'FS_NOT_TEXT');
            }
            sampledBytes += sample.length;
        }
        var stream, decoder, sampledBytes, _a, _b, _c, chunk, e_2_1, error_10;
        var _d, e_2, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0: return [4 /*yield*/, __await(statRegularFile(target, 'read', signal))];
                case 1:
                    _g.sent();
                    stream = (0, node_fs_1.createReadStream)(target.targetKey, signal ? { signal: signal } : {});
                    decoder = new node_util_1.TextDecoder('utf-8', { fatal: true });
                    sampledBytes = 0;
                    _g.label = 2;
                case 2:
                    _g.trys.push([2, 19, , 20]);
                    _g.label = 3;
                case 3:
                    _g.trys.push([3, 10, 11, 16]);
                    _a = true, _b = __asyncValues(stream);
                    _g.label = 4;
                case 4: return [4 /*yield*/, __await(_b.next())];
                case 5:
                    if (!(_c = _g.sent(), _d = _c.done, !_d)) return [3 /*break*/, 9];
                    _f = _c.value;
                    _a = false;
                    chunk = _f;
                    scanBinarySample(chunk);
                    return [4 /*yield*/, __await(decodeUtf8Stream(decoder, chunk, 'read', target.displayPath))];
                case 6: return [4 /*yield*/, _g.sent()];
                case 7:
                    _g.sent();
                    _g.label = 8;
                case 8:
                    _a = true;
                    return [3 /*break*/, 4];
                case 9: return [3 /*break*/, 16];
                case 10:
                    e_2_1 = _g.sent();
                    e_2 = { error: e_2_1 };
                    return [3 /*break*/, 16];
                case 11:
                    _g.trys.push([11, , 14, 15]);
                    if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 13];
                    return [4 /*yield*/, __await(_e.call(_b))];
                case 12:
                    _g.sent();
                    _g.label = 13;
                case 13: return [3 /*break*/, 15];
                case 14:
                    if (e_2) throw e_2.error;
                    return [7 /*endfinally*/];
                case 15: return [7 /*endfinally*/];
                case 16: return [4 /*yield*/, __await(decodeUtf8Stream(decoder, undefined, 'read', target.displayPath))];
                case 17: return [4 /*yield*/, _g.sent()];
                case 18:
                    _g.sent();
                    return [3 /*break*/, 20];
                case 19:
                    error_10 = _g.sent();
                    /* v8 ignore next 4 -- mid-stream errors need an abort/IO fault racing the loop; pre-abort is caught by throwIfAborted. */
                    if (isAbortError(error_10))
                        throw new dsh_fs_1.FsError('read aborted', 'FS_ABORTED');
                    throw error_10;
                case 20: return [2 /*return*/];
            }
        });
    });
}
// --- Writing ---
function removeStagingDirOrThrow(stagingDir, originalError, removeStagingDir) {
    return __awaiter(this, void 0, void 0, function () {
        var cleanupError_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, removeStagingDir(stagingDir)];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    cleanupError_1 = _a.sent();
                    /* v8 ignore next 1 -- cleanup failure here needs a second filesystem fault after the primary write failure. */
                    throw new dsh_fs_1.FsError("write failed (".concat(errorMessage(originalError), ") and temp cleanup failed (").concat(errorMessage(cleanupError_1), ")"), 'FS_NOT_FOUND', { cause: originalError });
                case 3: throw originalError;
            }
        });
    });
}
function throwGuardedCreateFailure(error, absolutePath, displayPath, inspectPublicationTarget) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, metadataError_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, inspectPublicationTarget(absolutePath)];
                case 1:
                    existing = _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    metadataError_1 = _a.sent();
                    if (!isENOENT(metadataError_1) && !isENOTDIR(metadataError_1)) {
                        throw new dsh_fs_1.FsError("cannot write \"".concat(displayPath, "\": ").concat(errorMessage(metadataError_1)), 'FS_IO_ERROR', { cause: metadataError_1 });
                    }
                    return [3 /*break*/, 3];
                case 3:
                    // Link errno values vary by platform and filesystem. Inspect the target entry
                    // after failure so a collision is not confused with missing hard-link support.
                    if (existing !== undefined) {
                        if (!existing.isFile()) {
                            throw new dsh_fs_1.FsError("cannot write \"".concat(displayPath, "\": not a regular file"), 'FS_NOT_REGULAR_FILE', { cause: error });
                        }
                        throw new dsh_fs_1.FsError("cannot overwrite existing \"".concat(displayPath, "\" without reading it first"), 'FS_NOT_OBSERVED', { cause: error });
                    }
                    if (isEEXIST(error)) {
                        throw new dsh_fs_1.FsError("cannot overwrite existing \"".concat(displayPath, "\" without reading it first"), 'FS_NOT_OBSERVED', { cause: error });
                    }
                    throw new dsh_fs_1.FsError("cannot write \"".concat(displayPath, "\": ").concat(errorMessage(error)), 'FS_IO_ERROR', { cause: error });
            }
        });
    });
}
/**
 * Atomically replace a file through a private, synced staging file in the same directory.
 * POSIX protects the staging directory and file with `0o700` and `0o600`. A new Windows file
 * inherits the destination directory's DACL; a replacement copies the existing target's DACL
 * onto the empty temp before writing and preserves the target descriptor at publication.
 * @param absolutePath - destination; missing parent directories are created.
 * @param content - the full UTF-8 text to write.
 * @param mode - existing destination's POSIX mode to preserve, or `undefined` for a new file;
 * inert as a mode on Windows but identifies replacement security semantics.
 * @param signal - cancellation checked before final publication.
 * @param internals - Test hook for pinning temp names and observing the staged file.
 * @param createIfAbsent - when provided, publish with a hard-link no-replace
 * primitive; a concurrent creator's file is preserved and this write is
 * rejected with `FS_NOT_OBSERVED` using the supplied display path.
 */
function writeFileAtomic(absolutePath_1, content_1, mode_1, signal_1) {
    return __awaiter(this, arguments, void 0, function (absolutePath, content, mode, signal, internals, createIfAbsent) {
        var directory, stagingDirName, stagingDir, tempName, tempPath, platform, copyFileDacl, replaceFile, linkFile, inspectPublicationTarget, removeStagingDir, handle, stagingCreated, error_11, error_12, _committedStagingCleanupFailure_1, error_13, failure, closeError_1;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        if (internals === void 0) { internals = {}; }
        return __generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    throwIfAborted(signal, 'write');
                    directory = (0, node_path_1.dirname)(absolutePath);
                    return [4 /*yield*/, (0, promises_1.mkdir)(directory, { recursive: true })];
                case 1:
                    _m.sent();
                    throwIfAborted(signal, 'write');
                    stagingDirName = (_b = (_a = internals.tempDirName) === null || _a === void 0 ? void 0 : _a.call(internals, absolutePath)) !== null && _b !== void 0 ? _b : ".".concat((0, node_path_1.basename)(absolutePath), ".").concat(process.pid, ".").concat((0, node_crypto_1.randomUUID)(), ".tmpdir");
                    stagingDir = (0, node_path_1.join)(directory, stagingDirName);
                    tempName = (_d = (_c = internals.tempName) === null || _c === void 0 ? void 0 : _c.call(internals, absolutePath)) !== null && _d !== void 0 ? _d : "".concat((0, node_path_1.basename)(absolutePath), ".tmp");
                    tempPath = (0, node_path_1.join)(stagingDir, tempName);
                    platform = (_e = internals.platform) !== null && _e !== void 0 ? _e : process.platform;
                    copyFileDacl = (_f = internals.copyFileDacl) !== null && _f !== void 0 ? _f : win32_ts_1.copyFileDaclWin32;
                    replaceFile = (_g = internals.replaceFile) !== null && _g !== void 0 ? _g : win32_ts_1.replaceFileWin32;
                    linkFile = (_h = internals.linkFile) !== null && _h !== void 0 ? _h : promises_1.link;
                    inspectPublicationTarget = (_j = internals.inspectPublicationTarget) !== null && _j !== void 0 ? _j : (function (path) { return (0, promises_1.lstat)(path, { bigint: true }); });
                    removeStagingDir = (_k = internals.removeStagingDir) !== null && _k !== void 0 ? _k : (function (path) { return (0, promises_1.rm)(path, { recursive: true, force: true }); });
                    stagingCreated = false;
                    _m.label = 2;
                case 2:
                    _m.trys.push([2, 32, , 37]);
                    return [4 /*yield*/, (0, promises_1.mkdir)(stagingDir, { mode: 448 })];
                case 3:
                    _m.sent();
                    stagingCreated = true;
                    return [4 /*yield*/, (0, promises_1.chmod)(stagingDir, 448)];
                case 4:
                    _m.sent();
                    return [4 /*yield*/, (0, promises_1.open)(tempPath, 'wx', 384)];
                case 5:
                    handle = _m.sent();
                    return [4 /*yield*/, handle.chmod(384)];
                case 6:
                    _m.sent();
                    if (!(platform === 'win32' && mode !== undefined)) return [3 /*break*/, 8];
                    return [4 /*yield*/, copyFileDacl(absolutePath, tempPath)];
                case 7:
                    _m.sent();
                    _m.label = 8;
                case 8: return [4 /*yield*/, handle.writeFile(content, __assign({ encoding: 'utf8' }, signal ? { signal: signal } : {}))];
                case 9:
                    _m.sent();
                    return [4 /*yield*/, handle.sync()];
                case 10:
                    _m.sent();
                    return [4 /*yield*/, ((_l = internals.inspectTemp) === null || _l === void 0 ? void 0 : _l.call(internals, { stagingDir: stagingDir, tempPath: tempPath }))];
                case 11:
                    _m.sent();
                    if (!(mode !== undefined)) return [3 /*break*/, 13];
                    return [4 /*yield*/, handle.chmod(mode)];
                case 12:
                    _m.sent();
                    _m.label = 13;
                case 13: return [4 /*yield*/, handle.close()];
                case 14:
                    _m.sent();
                    handle = undefined;
                    throwIfAborted(signal, 'write');
                    if (!(createIfAbsent !== undefined)) return [3 /*break*/, 20];
                    _m.label = 15;
                case 15:
                    _m.trys.push([15, 17, , 19]);
                    return [4 /*yield*/, linkFile(tempPath, absolutePath)];
                case 16:
                    _m.sent();
                    return [3 /*break*/, 19];
                case 17:
                    error_11 = _m.sent();
                    return [4 /*yield*/, throwGuardedCreateFailure(error_11, absolutePath, createIfAbsent.displayPath, inspectPublicationTarget)];
                case 18:
                    _m.sent();
                    return [3 /*break*/, 19];
                case 19: return [3 /*break*/, 28];
                case 20:
                    if (!(platform === 'win32' && mode !== undefined)) return [3 /*break*/, 26];
                    _m.label = 21;
                case 21:
                    _m.trys.push([21, 23, , 25]);
                    return [4 /*yield*/, replaceFile(absolutePath, tempPath)];
                case 22:
                    _m.sent();
                    return [3 /*break*/, 25];
                case 23:
                    error_12 = _m.sent();
                    // If the observed target disappears during staging, the protected DACL
                    // already copied to the temp remains authoritative for recreation.
                    if (!isENOENT(error_12))
                        throw error_12;
                    return [4 /*yield*/, (0, promises_1.rename)(tempPath, absolutePath)];
                case 24:
                    _m.sent();
                    return [3 /*break*/, 25];
                case 25: return [3 /*break*/, 28];
                case 26: return [4 /*yield*/, (0, promises_1.rename)(tempPath, absolutePath)];
                case 27:
                    _m.sent();
                    _m.label = 28;
                case 28:
                    _m.trys.push([28, 30, , 31]);
                    return [4 /*yield*/, removeStagingDir(stagingDir)];
                case 29:
                    _m.sent();
                    return [3 /*break*/, 31];
                case 30:
                    _committedStagingCleanupFailure_1 = _m.sent();
                    return [3 /*break*/, 31];
                case 31: return [3 /*break*/, 37];
                case 32:
                    error_13 = _m.sent();
                    failure = isAbortError(error_13) ? new dsh_fs_1.FsError('write aborted', 'FS_ABORTED') : error_13;
                    if (!handle) return [3 /*break*/, 36];
                    _m.label = 33;
                case 33:
                    _m.trys.push([33, 35, , 36]);
                    return [4 /*yield*/, handle.close()];
                case 34:
                    _m.sent();
                    return [3 /*break*/, 36];
                case 35:
                    closeError_1 = _m.sent();
                    failure = new dsh_fs_1.FsError("write failed (".concat(errorMessage(failure), ") and temp close failed (").concat(errorMessage(closeError_1), ")"), 'FS_NOT_FOUND', { cause: failure });
                    return [3 /*break*/, 36];
                case 36:
                    if (!stagingCreated)
                        throw failure;
                    return [2 /*return*/, removeStagingDirOrThrow(stagingDir, failure, removeStagingDir)];
                case 37: return [2 /*return*/];
            }
        });
    });
}
/**
 * Collapse CRLF to LF — the canonical in-memory form every edit/diff basis
 * uses. Lone `\r` bytes (not followed by `\n`) are left untouched.
 * @param content - decoded text in whatever line-ending style the file had.
 * @returns the text with every `\r\n` pair replaced by `\n`.
 */
function normalizeLineEndings(content) {
    return content.replaceAll('\r\n', '\n');
}
function detectLineEndings(raw) {
    var sample = raw.slice(0, 4096);
    var crlfCount = sample.split('\r\n').length - 1;
    var lfCount = sample.split('\n').length - 1 - crlfCount;
    return crlfCount > lfCount ? 'CRLF' : 'LF';
}
/**
 * Convert LF-normalized content back to the line-ending style detected at read
 * time, for write-back. `LF` returns the content unchanged; `CRLF` re-normalizes
 * first so an already-CRLF sequence is never doubled to `\r\r\n`.
 * @param content - the LF-normalized (edited) text.
 * @param lineEndings - the original file's style, as detected by {@link readForEdit}.
 * @returns the text in the original file's line-ending style.
 */
function restoreLineEndings(content, lineEndings) {
    return lineEndings === 'LF' ? content : normalizeLineEndings(content).split('\n').join('\r\n');
}
function countOccurrences(content, needle) {
    var count = 0;
    var index = 0;
    while (true) {
        var found = content.indexOf(needle, index);
        if (found === -1)
            return count;
        count += 1;
        index = found + needle.length;
    }
}
/**
 * Read and decode a file for editing: rejects binaries, returns LF-normalized
 * content plus the original line-ending style for write-back.
 * @param absolutePath - the file to read (typically a target key).
 * @param displayPath - the caller-facing path used in error messages.
 * @param signal - aborts the read (`FS_ABORTED`).
 * @returns the LF-normalized content and the detected style to restore on write-back.
 */
function readForEdit(absolutePath, displayPath, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var buffer, raw;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    throwIfAborted(signal, 'edit');
                    return [4 /*yield*/, readFileAbortable(absolutePath, 'edit', signal)];
                case 1:
                    buffer = _a.sent();
                    throwIfAborted(signal, 'edit');
                    if (buffer.includes(0))
                        throw new dsh_fs_1.FsError("cannot edit \"".concat(displayPath, "\": binary file"), 'FS_NOT_TEXT');
                    raw = decodeUtf8(buffer, 'edit', displayPath);
                    return [2 /*return*/, { content: normalizeLineEndings(raw), lineEndings: detectLineEndings(raw) }];
            }
        });
    });
}
/**
 * Best-effort overwrite diff basis. Binary, invalid UTF-8, a file at/above the byte limit,
 * or a file deleted/made unreadable after the caller's preflight returns `null` so the write
 * still succeeds and presentation falls back to a whole-file diff. The bound is enforced on
 * the opened descriptor rather than a prior path stat, so concurrent external replacement or
 * size changes cannot make this helper buffer more than `maxBytes`.
 * @param absolutePath - the file to read (typically a target key).
 * @param maxBytes - exclusive upper bound for bytes held as the contextual-diff basis.
 * @param signal - aborts the read (`FS_ABORTED`); cancellation propagates, unlike I/O failure.
 * @returns the LF-normalized text, or null for a non-regular, at/above-limit, binary, non-UTF-8,
 * descriptor-size-changed, or unreadable file.
 */
function readTextForDiff(absolutePath, maxBytes, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var handle, buffer, total, openedSize, info, length_1, bytesRead, basis, error_14;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    throwIfAborted(signal, 'read');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 11, , 12]);
                    return [4 /*yield*/, (0, promises_1.open)(absolutePath, 'r')];
                case 2:
                    handle = _a.sent();
                    buffer = void 0;
                    total = 0;
                    openedSize = 0;
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, , 8, 10]);
                    throwIfAborted(signal, 'read');
                    return [4 /*yield*/, handle.stat()];
                case 4:
                    info = _a.sent();
                    throwIfAborted(signal, 'read');
                    if (!info.isFile())
                        return [2 /*return*/, null];
                    if (info.size >= maxBytes)
                        return [2 /*return*/, null];
                    openedSize = info.size;
                    // One extra byte detects growth after stat without retaining per-read backing buffers.
                    buffer = Buffer.allocUnsafe(openedSize + 1);
                    _a.label = 5;
                case 5:
                    if (!(total < buffer.length)) return [3 /*break*/, 7];
                    throwIfAborted(signal, 'read');
                    length_1 = Math.min(buffer.length - total, DIFF_BASIS_READ_CHUNK_BYTES);
                    return [4 /*yield*/, handle.read(buffer, total, length_1, null)];
                case 6:
                    bytesRead = (_a.sent()).bytesRead;
                    if (bytesRead === 0)
                        return [3 /*break*/, 7];
                    total += bytesRead;
                    return [3 /*break*/, 5];
                case 7: return [3 /*break*/, 10];
                case 8: return [4 /*yield*/, handle.close()];
                case 9:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 10:
                    throwIfAborted(signal, 'read');
                    if (total !== openedSize)
                        return [2 /*return*/, null];
                    basis = buffer.subarray(0, total);
                    if (basis.includes(0))
                        return [2 /*return*/, null];
                    try {
                        return [2 /*return*/, normalizeLineEndings(new node_util_1.TextDecoder('utf-8', { fatal: true }).decode(basis))];
                    }
                    catch (error) {
                        /* v8 ignore next 2 -- TextDecoder({fatal}) only throws TypeError on invalid bytes;
                         * any other throw is an unreachable runtime fault. */
                        if (!(error instanceof TypeError))
                            throw error;
                        return [2 /*return*/, null];
                    }
                    return [3 /*break*/, 12];
                case 11:
                    error_14 = _a.sent();
                    // Cancellation is the caller's intent and still propagates.
                    if (error_14 instanceof dsh_fs_1.FsError)
                        throw error_14;
                    // A descriptor-phase errno — deleted or made unreadable after the caller's
                    // preflight, or a faulted read — costs only the optional basis: a committed
                    // write must not fail for a presentation-only pre-read.
                    if (error_14 instanceof Error && 'code' in error_14)
                        return [2 /*return*/, null];
                    throw error_14;
                case 12: return [2 /*return*/];
            }
        });
    });
}
/**
 * Fuzzy helper: normalize trailing whitespace on each line.
 */
function normalizeTrailingSpaces(str) {
    return str.split('\n').map(function (line) { return line.trimEnd(); }).join('\n');
}
/**
 * Fuzzy helper: find replacement using trimmed lines comparison and indentation alignment.
 */
function fuzzyFindAndReplace(content, oldNorm, newNorm) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    // Strategy 1: Ignore line-trailing whitespace differences
    var contentNoTrailing = normalizeTrailingSpaces(content);
    var oldNoTrailing = normalizeTrailingSpaces(oldNorm);
    if (contentNoTrailing.includes(oldNoTrailing)) {
        var count = countOccurrences(contentNoTrailing, oldNoTrailing);
        if (count === 1) {
            // Find actual character indices in original content
            var cLines = content.split('\n');
            var oLines = oldNorm.split('\n');
            for (var i = 0; i <= cLines.length - oLines.length; i++) {
                var match = true;
                for (var j = 0; j < oLines.length; j++) {
                    if (((_a = cLines[i + j]) === null || _a === void 0 ? void 0 : _a.trimEnd()) !== ((_b = oLines[j]) === null || _b === void 0 ? void 0 : _b.trimEnd())) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    var before = cLines.slice(0, i);
                    var after = cLines.slice(i + oLines.length);
                    var newLines = newNorm.split('\n');
                    return {
                        content: __spreadArray(__spreadArray(__spreadArray([], before, true), newLines, true), after, true).join('\n'),
                        replacements: 1,
                    };
                }
            }
        }
    }
    // Strategy 2: Trim leading/trailing blank lines in old_string
    var oldTrimmed = oldNorm.replace(/^\n+|\n+$/g, '');
    if (oldTrimmed && oldTrimmed !== oldNorm && content.includes(oldTrimmed)) {
        var count = countOccurrences(content, oldTrimmed);
        if (count === 1) {
            var newTrimmed = newNorm.replace(/^\n+|\n+$/g, '');
            return { content: content.replace(oldTrimmed, newTrimmed), replacements: 1 };
        }
    }
    // Strategy 3: Indentation adjustment (all lines shifted by uniform spaces)
    var contentLines = content.split('\n');
    var oldLines = oldNorm.split('\n');
    if (oldLines.length > 0) {
        var strippedOldLines = oldLines.map(function (l) { return l.trimStart(); });
        var matches = [];
        for (var i = 0; i <= contentLines.length - oldLines.length; i++) {
            var match = true;
            for (var j = 0; j < oldLines.length; j++) {
                if (((_c = contentLines[i + j]) === null || _c === void 0 ? void 0 : _c.trim()) !== ((_d = strippedOldLines[j]) === null || _d === void 0 ? void 0 : _d.trim())) {
                    match = false;
                    break;
                }
            }
            if (match)
                matches.push(i);
        }
        if (matches.length === 1) {
            var matchStart = matches[0];
            // Calculate indentation delta from first non-empty line
            var firstTargetLine = contentLines[matchStart] || '';
            var firstOldLine = oldLines[0] || '';
            var targetIndent = (_f = (_e = firstTargetLine.match(/^\s*/)) === null || _e === void 0 ? void 0 : _e[0]) !== null && _f !== void 0 ? _f : '';
            var oldIndent = (_h = (_g = firstOldLine.match(/^\s*/)) === null || _g === void 0 ? void 0 : _g[0]) !== null && _h !== void 0 ? _h : '';
            var indentDelta_1 = targetIndent.length - oldIndent.length;
            var adjustedNewLines = newNorm.split('\n').map(function (l) {
                var _a, _b;
                if (!l.trim())
                    return l;
                if (indentDelta_1 > 0)
                    return ' '.repeat(indentDelta_1) + l;
                if (indentDelta_1 < 0) {
                    var removeCount = Math.min(-indentDelta_1, (_b = (_a = l.match(/^\s*/)) === null || _a === void 0 ? void 0 : _a[0].length) !== null && _b !== void 0 ? _b : 0);
                    return l.slice(removeCount);
                }
                return l;
            });
            var before = contentLines.slice(0, matchStart);
            var after = contentLines.slice(matchStart + oldLines.length);
            return {
                content: __spreadArray(__spreadArray(__spreadArray([], before, true), adjustedNewLines, true), after, true).join('\n'),
                replacements: 1,
            };
        }
    }
    return null;
}
/**
 * Apply a literal replacement to LF-normalized content. Empty or missing search text throws
 * `FS_EDIT_NOT_FOUND`; multiple matches throw `FS_AMBIGUOUS_EDIT` unless `replaceAll` is true.
 * @param content - the current file content, already LF-normalized.
 * @param oldString - literal text to find; CRLF inside it is normalized to LF before
 *   matching.
 * @param newString - literal replacement text, normalized the same way.
 * @param replaceAll - replace every match instead of requiring exactly one.
 * @param displayPath - the caller-facing path used in error messages.
 * @returns the edited LF-normalized content plus how many occurrences were replaced.
 */
function applyLiteralEdit(content, oldString, newString, replaceAll, displayPath) {
    var oldNorm = normalizeLineEndings(oldString);
    if (oldNorm.length === 0) {
        throw new dsh_fs_1.FsError('old_string must be a non-empty string', 'FS_EDIT_NOT_FOUND');
    }
    var newNorm = normalizeLineEndings(newString);
    var replacements = countOccurrences(content, oldNorm);
    if (replacements === 0) {
        // Attempt multi-stage fuzzy fallback if not replaceAll
        if (!replaceAll) {
            var fuzzyResult = fuzzyFindAndReplace(content, oldNorm, newNorm);
            if (fuzzyResult)
                return fuzzyResult;
        }
        throw new dsh_fs_1.FsError("old_string was not found in \"".concat(displayPath, "\""), 'FS_EDIT_NOT_FOUND');
    }
    if (!replaceAll && replacements > 1) {
        throw new dsh_fs_1.FsError("old_string matched ".concat(replacements, " times in \"").concat(displayPath, "\"; provide a more specific old_string or set replace_all to true"), 'FS_AMBIGUOUS_EDIT');
    }
    return { content: content.split(oldNorm).join(newNorm), replacements: replacements };
}
