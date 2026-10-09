"use strict";
/**
 * Host-filesystem implementation of `ctx.fs`. Realpath-derived target identity makes aliases
 * share stale guards, and writes through a symlink update its target without replacing the link.
 * @module @z/dsh-fs-local
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalFileSystem = void 0;
var node_buffer_1 = require("node:buffer");
var node_path_1 = require("node:path");
var node_url_1 = require("node:url");
var schemastery_1 = require("@z/schemastery");
var dsh_fs_1 = require("@z/dsh-fs");
var fsio_ts_1 = require("./fsio.ts");
var DEFAULT_DIFF_BASIS_MAX_BYTES = 10 * 1024 * 1024;
var MAX_DIFF_BASIS_BYTES = Math.min(node_buffer_1.constants.MAX_LENGTH, node_buffer_1.constants.MAX_STRING_LENGTH);
/**
 * The host-filesystem backend. Reads resolve relative paths from {@link Config.cwd}
 * (a resolution default, NOT a containment boundary — see the filesystem
 * capability-seam Agent Note); enforce
 * containment with a stricter backend or a `tools/execute` permission plugin.
 */
var LocalFileSystem = /** @class */ (function (_super) {
    __extends(LocalFileSystem, _super);
    function LocalFileSystem(ctx, config) {
        var _this = _super.call(this, ctx) || this;
        /** Test hook forwarded to fsio for atomic-publication boundaries. */
        _this.internals = {};
        /** Per-targetKey tail promise: serializes mutating ops so the read→guard→write
         * window can't interleave, making concurrent writes/edits deterministically
         * ordered (one wins, the rest see the new version and reject as stale). */
        _this.locks = new Map();
        var resolved = config;
        if (!Number.isSafeInteger(resolved.diffBasisMaxBytes)
            || resolved.diffBasisMaxBytes <= 0
            || resolved.diffBasisMaxBytes > MAX_DIFF_BASIS_BYTES) {
            throw new Error("fs-local: diffBasisMaxBytes must be a positive safe integer no greater than ".concat(MAX_DIFF_BASIS_BYTES));
        }
        _this.config = resolved;
        return _this;
    }
    /** Run `op` with exclusive access to `targetKey` (FIFO per key). */
    LocalFileSystem.prototype.withLock = function (targetKey, op) {
        return __awaiter(this, void 0, void 0, function () {
            var prior, run, tail;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        prior = (_a = this.locks.get(targetKey)) !== null && _a !== void 0 ? _a : Promise.resolve();
                        run = prior.then(op, op);
                        tail = run.then(function () { return undefined; }, function () { return undefined; });
                        this.locks.set(targetKey, tail);
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, , 3, 4]);
                        return [4 /*yield*/, run];
                    case 2: return [2 /*return*/, _b.sent()];
                    case 3:
                        if (this.locks.get(targetKey) === tail) {
                            this.locks.delete(targetKey);
                        }
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    LocalFileSystem.prototype.resolve = function (path, opts) {
        return __awaiter(this, void 0, void 0, function () {
            var local;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if ((_a = opts === null || opts === void 0 ? void 0 : opts.signal) === null || _a === void 0 ? void 0 : _a.aborted)
                            throw new dsh_fs_1.FsError('resolve aborted', 'FS_ABORTED');
                        return [4 /*yield*/, (0, fsio_ts_1.resolveLocalTarget)((_b = opts === null || opts === void 0 ? void 0 : opts.cwd) !== null && _b !== void 0 ? _b : this.config.cwd, path)];
                    case 1:
                        local = _d.sent();
                        if ((_c = opts === null || opts === void 0 ? void 0 : opts.signal) === null || _c === void 0 ? void 0 : _c.aborted)
                            throw new dsh_fs_1.FsError('resolve aborted', 'FS_ABORTED');
                        return [2 /*return*/, { targetKey: local.targetKey, displayPath: local.displayPath }];
                }
            });
        });
    };
    LocalFileSystem.prototype.processPath = function (target) {
        return String(target.targetKey);
    };
    LocalFileSystem.prototype.fileUrl = function (target) {
        return (0, node_url_1.pathToFileURL)(this.processPath(target)).href;
    };
    LocalFileSystem.prototype.contains = function (parent, child) {
        var path = (0, node_path_1.relative)(this.processPath(parent), this.processPath(child));
        return path === '' || (path !== '..' && !path.startsWith("..".concat(node_path_1.sep)) && !(0, node_path_1.isAbsolute)(path));
    };
    LocalFileSystem.prototype.stat = function (target, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var info;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            throw new dsh_fs_1.FsError('stat aborted', 'FS_ABORTED');
                        return [4 /*yield*/, (0, fsio_ts_1.probe)(target.targetKey)];
                    case 1:
                        info = _a.sent();
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            throw new dsh_fs_1.FsError('stat aborted', 'FS_ABORTED');
                        if (!info)
                            return [2 /*return*/, undefined];
                        return [2 /*return*/, { version: info.version, type: info.type, size: info.size }];
                }
            });
        });
    };
    LocalFileSystem.prototype.lstat = function (path, opts, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var info;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            throw new dsh_fs_1.FsError('lstat aborted', 'FS_ABORTED');
                        if (path.trim().length === 0)
                            throw new dsh_fs_1.FsError('file_path must be a non-empty string', 'FS_NOT_FOUND');
                        return [4 /*yield*/, (0, fsio_ts_1.probeNoFollow)((0, node_path_1.resolve)((_a = opts === null || opts === void 0 ? void 0 : opts.cwd) !== null && _a !== void 0 ? _a : this.config.cwd, path))];
                    case 1:
                        info = _b.sent();
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            throw new dsh_fs_1.FsError('lstat aborted', 'FS_ABORTED');
                        if (!info)
                            return [2 /*return*/, undefined];
                        return [2 /*return*/, { version: info.version, type: info.type, size: info.size }];
                }
            });
        });
    };
    LocalFileSystem.prototype.readText = function (target, signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, fsio_ts_1.readWholeText)({ displayPath: target.displayPath, targetKey: target.targetKey }, signal)];
            });
        });
    };
    LocalFileSystem.prototype.streamText = function (target, signal) {
        return Promise.resolve((0, fsio_ts_1.streamWholeText)({ displayPath: target.displayPath, targetKey: target.targetKey }, signal));
    };
    LocalFileSystem.prototype.readBytes = function (target, signal, maxBytes) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, fsio_ts_1.readWholeBytes)({ displayPath: target.displayPath, targetKey: target.targetKey }, signal, maxBytes, this.internals)];
            });
        });
    };
    LocalFileSystem.prototype.listDir = function (target, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var entries;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, fsio_ts_1.listDirectory)({ displayPath: target.displayPath, targetKey: target.targetKey }, signal)];
                    case 1:
                        entries = _a.sent();
                        return [2 /*return*/, entries.map(function (entry) { return (__assign(__assign({ name: entry.name, type: entry.type, target: { targetKey: entry.target.targetKey, displayPath: entry.target.displayPath } }, (entry.version !== undefined ? { version: entry.version } : {})), (entry.size !== undefined ? { size: entry.size } : {}))); })];
                }
            });
        });
    };
    LocalFileSystem.prototype.writeText = function (target, content, expected, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, this.withLock(target.targetKey, function () { return __awaiter(_this, void 0, void 0, function () {
                        var existing, diffable, before, _a, after;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, (0, fsio_ts_1.probe)(target.targetKey)];
                                case 1:
                                    existing = _b.sent();
                                    if (existing && existing.type !== 'file') {
                                        throw new dsh_fs_1.FsError("cannot write \"".concat(target.displayPath, "\": not a regular file"), 'FS_NOT_REGULAR_FILE');
                                    }
                                    if ((expected === null || expected === void 0 ? void 0 : expected.kind) === 'replaceIfVersion') {
                                        // Stale guard: the file must still exist at the version the owner observed.
                                        if (!existing)
                                            throw new dsh_fs_1.FsError("cannot write \"".concat(target.displayPath, "\": file no longer exists"), 'FS_STALE_VERSION');
                                        if (existing.version !== expected.version) {
                                            throw new dsh_fs_1.FsError("cannot write \"".concat(target.displayPath, "\": file changed since it was read"), 'FS_STALE_VERSION');
                                        }
                                    }
                                    else if ((expected === null || expected === void 0 ? void 0 : expected.kind) === 'createIfAbsent' && existing) {
                                        // createIfAbsent onto an existing file: a blind overwrite — require a read first.
                                        throw new dsh_fs_1.FsError("cannot overwrite existing \"".concat(target.displayPath, "\" without reading it first"), 'FS_NOT_OBSERVED');
                                    }
                                    diffable = existing !== null
                                        && Buffer.byteLength(content, 'utf8') < this.config.diffBasisMaxBytes;
                                    if (!diffable) return [3 /*break*/, 3];
                                    return [4 /*yield*/, (0, fsio_ts_1.readTextForDiff)(target.targetKey, this.config.diffBasisMaxBytes, signal)];
                                case 2:
                                    _a = _b.sent();
                                    return [3 /*break*/, 4];
                                case 3:
                                    _a = null;
                                    _b.label = 4;
                                case 4:
                                    before = _a;
                                    return [4 /*yield*/, (0, fsio_ts_1.writeFileAtomic)(target.targetKey, content, existing === null || existing === void 0 ? void 0 : existing.mode, signal, this.internals, (expected === null || expected === void 0 ? void 0 : expected.kind) === 'createIfAbsent' ? { displayPath: target.displayPath } : undefined)];
                                case 5:
                                    _b.sent();
                                    return [4 /*yield*/, (0, fsio_ts_1.probe)(target.targetKey)];
                                case 6:
                                    after = _b.sent();
                                    return [2 /*return*/, {
                                            operation: existing ? 'update' : 'create',
                                            version: this.versionAfterWrite(after, target),
                                            before: before,
                                            // LF-normalized to share the diff basis with `before` (also LF): a CRLF
                                            // overwrite must not read as every line changed. Line-ending restoration
                                            // is a storage detail the applied-hunk diff ignores.
                                            after: (0, fsio_ts_1.normalizeLineEndings)(content),
                                        }];
                            }
                        });
                    }); })];
            });
        });
    };
    LocalFileSystem.prototype.editText = function (target, edit, expected, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, this.withLock(target.targetKey, function () { return __awaiter(_this, void 0, void 0, function () {
                        var existing, original, edited, content, after;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, (0, fsio_ts_1.probe)(target.targetKey)
                                    // Stale guard before literal matching: an edit based on an old read reports
                                    // FS_STALE_VERSION, not FS_EDIT_NOT_FOUND/FS_AMBIGUOUS_EDIT against newer content.
                                    // Missing targets use the same stale code on guarded and unconditional edit paths.
                                ];
                                case 1:
                                    existing = _a.sent();
                                    // Stale guard before literal matching: an edit based on an old read reports
                                    // FS_STALE_VERSION, not FS_EDIT_NOT_FOUND/FS_AMBIGUOUS_EDIT against newer content.
                                    // Missing targets use the same stale code on guarded and unconditional edit paths.
                                    if (!existing)
                                        throw new dsh_fs_1.FsError("cannot edit \"".concat(target.displayPath, "\": file changed since it was read"), 'FS_STALE_VERSION');
                                    if (existing.type !== 'file')
                                        throw new dsh_fs_1.FsError("cannot edit \"".concat(target.displayPath, "\": not a regular file"), 'FS_NOT_REGULAR_FILE');
                                    // expected === undefined: unconditional edit of the current content — no
                                    // version guard. Still inside the per-target lock, so the read→match→write
                                    // window is serialized and atomic.
                                    if (expected && existing.version !== expected.version) {
                                        throw new dsh_fs_1.FsError("cannot edit \"".concat(target.displayPath, "\": file changed since it was read"), 'FS_STALE_VERSION');
                                    }
                                    return [4 /*yield*/, (0, fsio_ts_1.readForEdit)(target.targetKey, target.displayPath, signal)];
                                case 2:
                                    original = _a.sent();
                                    edited = (0, fsio_ts_1.applyLiteralEdit)(original.content, edit.oldString, edit.newString, edit.replaceAll, target.displayPath);
                                    content = (0, fsio_ts_1.restoreLineEndings)(edited.content, original.lineEndings);
                                    return [4 /*yield*/, (0, fsio_ts_1.writeFileAtomic)(target.targetKey, content, existing.mode, signal, this.internals)];
                                case 3:
                                    _a.sent();
                                    return [4 /*yield*/, (0, fsio_ts_1.probe)(target.targetKey)];
                                case 4:
                                    after = _a.sent();
                                    return [2 /*return*/, {
                                            version: this.versionAfterWrite(after, target),
                                            // The LF-normalized before/after text (the applied-hunk diff basis);
                                            // line-ending restoration is a storage detail the diff ignores.
                                            before: original.content,
                                            after: edited.content,
                                        }];
                            }
                        });
                    }); })];
            });
        });
    };
    /* v8 ignore next 5 -- the post-write probe finding the file absent requires a
     * concurrent unlink between rename and stat; fall back to a sentinel version. */
    LocalFileSystem.prototype.versionAfterWrite = function (after, target) {
        if (after)
            return after.version;
        return (0, dsh_fs_1.FsVersion)("missing:".concat(target.targetKey));
    };
    LocalFileSystem.Config = schemastery_1.default.object({
        cwd: schemastery_1.default.string().default(process.cwd()),
        diffBasisMaxBytes: schemastery_1.default.number().default(DEFAULT_DIFF_BASIS_MAX_BYTES),
    });
    return LocalFileSystem;
}(dsh_fs_1.FileSystem));
exports.LocalFileSystem = LocalFileSystem;
exports.default = LocalFileSystem;
