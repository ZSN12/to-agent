"use strict";
/**
 * Instruction-file discovery and bounded, abort-aware provider reads.
 *
 * @module @z/dsh-agent-instructions/files
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.findProjectRoot = findProjectRoot;
exports.ancestorChain = ancestorChain;
exports.descendantDirsBetween = descendantDirsBetween;
exports.relativeDisplay = relativeDisplay;
exports.discoverBaselineInstructionFiles = discoverBaselineInstructionFiles;
exports.dedupInstructionFilesByDirectory = dedupInstructionFilesByDirectory;
exports.loadBaselineInstructions = loadBaselineInstructions;
exports.loadBaselineInstructionSet = loadBaselineInstructionSet;
exports.probeScopeInstruction = probeScopeInstruction;
exports.readScopeInstruction = readScopeInstruction;
var node_fs_1 = require("node:fs");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var config_ts_1 = require("./config.ts");
var digest_ts_1 = require("./digest.ts");
var render_ts_1 = require("./render.ts");
function signalOptions(signal) {
    return signal === undefined ? undefined : { signal: signal };
}
function isMissingPathError(error) {
    return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}
function nodeStatFile(path, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var info, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [4 /*yield*/, (0, promises_1.stat)(path)];
                case 1:
                    info = _a.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if (!info.isFile())
                        return [2 /*return*/, { kind: 'absent' }];
                    return [2 /*return*/, { kind: 'present', info: { size: info.size } }];
                case 2:
                    error_1 = _a.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [2 /*return*/, isMissingPathError(error_1) ? { kind: 'absent' } : { kind: 'unavailable' }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function fsStatFile(path, fileSystem, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var target, info, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fileSystem.resolve(path, signalOptions(signal))];
                case 1:
                    target = _b.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [4 /*yield*/, fileSystem.stat(target, signal)];
                case 2:
                    info = _b.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if ((info === null || info === void 0 ? void 0 : info.type) !== 'file')
                        return [2 /*return*/, { kind: 'absent' }];
                    return [2 /*return*/, {
                            kind: 'present',
                            info: __assign({ target: target, version: info.version }, info.size === undefined ? {} : { size: info.size }),
                        }];
                case 3:
                    _a = _b.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [2 /*return*/, { kind: 'unavailable' }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function statFile(path, fileSystem, signal) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, fileSystem === undefined ? nodeStatFile(path, signal) : fsStatFile(path, fileSystem, signal)];
        });
    });
}
function existsAsMarker(path, fileSystem, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var target, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!(fileSystem !== undefined)) return [3 /*break*/, 5];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fileSystem.resolve(path, signalOptions(signal))];
                case 2:
                    target = _c.sent();
                    return [4 /*yield*/, fileSystem.stat(target, signal)];
                case 3: return [2 /*return*/, (_c.sent()) !== undefined];
                case 4:
                    _a = _c.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    // TODO(root-marker-unavailable): preserve provider failure separately from
                    // absence and stop discovery; continuing upward can cross into an ancestor project.
                    return [2 /*return*/, false];
                case 5:
                    _c.trys.push([5, 7, , 8]);
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [4 /*yield*/, (0, promises_1.stat)(path)];
                case 6:
                    _c.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [2 /*return*/, true];
                case 7:
                    _b = _c.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [2 /*return*/, false];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * Walk upward to the first directory containing a configured root marker.
 * @param cwd - absolute session working directory where the walk begins.
 * @param markers - child names that identify a project root.
 * @param fileSystem - optional provider used instead of host filesystem probes.
 * @param signal - cancellation for provider and host probes.
 * @returns the discovered project root, or `cwd` when no marker exists.
 */
function findProjectRoot(cwd, markers, fileSystem, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var current, _i, markers_1, marker, parent_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    current = (0, node_path_1.resolve)(cwd);
                    _a.label = 1;
                case 1:
                    _i = 0, markers_1 = markers;
                    _a.label = 2;
                case 2:
                    if (!(_i < markers_1.length)) return [3 /*break*/, 5];
                    marker = markers_1[_i];
                    return [4 /*yield*/, existsAsMarker((0, node_path_1.join)(current, marker), fileSystem, signal)];
                case 3:
                    if (_a.sent())
                        return [2 /*return*/, current];
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    parent_1 = (0, node_path_1.dirname)(current);
                    if (parent_1 === current)
                        return [2 /*return*/, (0, node_path_1.resolve)(cwd)];
                    current = parent_1;
                    _a.label = 6;
                case 6: return [3 /*break*/, 1];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * Build the inclusive root-to-cwd directory chain.
 * @param root - root directory expected to contain or equal `cwd`.
 * @param cwd - most-specific directory in the chain.
 * @returns directories ordered from broadest to most specific.
 */
function ancestorChain(root, cwd) {
    var chain = [];
    var current = (0, node_path_1.resolve)(cwd);
    var resolvedRoot = (0, node_path_1.resolve)(root);
    while (current !== resolvedRoot) {
        chain.push(current);
        var parent_2 = (0, node_path_1.dirname)(current);
        /* v8 ignore next -- discovery always supplies cwd or an ancestor root. */
        if (parent_2 === current)
            break;
        current = parent_2;
    }
    chain.push(resolvedRoot);
    return chain.reverse();
}
/**
 * Find descendant directories crossed between a cwd and a touched file.
 * @param root - session cwd that bounds nested discovery.
 * @param touchedPath - absolute path or path relative to `root`.
 * @returns descendant directories from shallowest through the touched file's parent.
 */
function descendantDirsBetween(root, touchedPath) {
    var resolvedRoot = (0, node_path_1.resolve)(root);
    var targetPath = (0, node_path_1.isAbsolute)(touchedPath) ? (0, node_path_1.resolve)(touchedPath) : (0, node_path_1.resolve)(resolvedRoot, touchedPath);
    var targetDir = (0, node_path_1.dirname)(targetPath);
    var rel = (0, node_path_1.relative)(resolvedRoot, targetDir);
    if (rel.length === 0 || rel.startsWith('..') || (0, node_path_1.isAbsolute)(rel))
        return [];
    return ancestorChain(resolvedRoot, targetDir).slice(1);
}
/**
 * Convert an absolute instruction path to its project-root-relative display form.
 * @param root - project root used as the display base.
 * @param path - absolute path to display.
 * @returns the root-relative path.
 */
function relativeDisplay(root, path) {
    return (0, node_path_1.relative)(root, path);
}
function allExistingInstructionFiles(dir, root, instructionFileCandidates, fileSystem, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var found, _i, instructionFileCandidates_1, candidate, path, probe;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    found = [];
                    _i = 0, instructionFileCandidates_1 = instructionFileCandidates;
                    _a.label = 1;
                case 1:
                    if (!(_i < instructionFileCandidates_1.length)) return [3 /*break*/, 4];
                    candidate = instructionFileCandidates_1[_i];
                    path = (0, node_path_1.join)(dir, candidate);
                    return [4 /*yield*/, statFile(path, fileSystem, signal)];
                case 2:
                    probe = _a.sent();
                    switch (probe.kind) {
                        case 'present':
                            found.push(__assign({ absolutePath: path, displayPath: relativeDisplay(root, path) }, probe.info));
                            return [3 /*break*/, 3];
                        // A missing candidate is skipped; a transient provider failure skips only
                        // that candidate so the remaining independent candidates still load.
                        case 'absent':
                        case 'unavailable':
                            return [3 /*break*/, 3];
                        /* v8 ignore next 2 -- StatFileProbe is closed; this arm only makes adding a kind a compile error. */
                        default:
                            (0, dsh_llm_1.assertNever)(probe, 'StatFileProbe');
                    }
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, found];
            }
        });
    });
}
function discoverInstructionFiles(options, fileSystem) {
    return __awaiter(this, void 0, void 0, function () {
        var config, files, seen, addFile, userGlobal, userGlobalProbe, cwd, projectRoot, _a, _i, _b, dir, _c, _d, candidates, _e, _f, file;
        var _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    config = (0, config_ts_1.resolveDiscoveryConfig)(options);
                    files = [];
                    seen = new Set();
                    addFile = function (file) {
                        if (seen.has(file.absolutePath))
                            return;
                        seen.add(file.absolutePath);
                        files.push(file);
                    };
                    userGlobal = (0, node_path_1.join)(config.dshHome, render_ts_1.USER_GLOBAL_FILE);
                    return [4 /*yield*/, statFile(userGlobal, fileSystem, options.signal)];
                case 1:
                    userGlobalProbe = _h.sent();
                    switch (userGlobalProbe.kind) {
                        case 'present':
                            addFile(__assign({ absolutePath: userGlobal, displayPath: userGlobalDisplayPath(config.dshHome) }, userGlobalProbe.info));
                            break;
                        case 'absent':
                        case 'unavailable':
                            break;
                        /* v8 ignore next 2 -- StatFileProbe is closed; this arm only makes adding a kind a compile error. */
                        default:
                            (0, dsh_llm_1.assertNever)(userGlobalProbe, 'StatFileProbe');
                    }
                    cwd = (0, node_path_1.resolve)(options.cwd);
                    if (!((_g = options.projectRoot) !== null && _g !== void 0)) return [3 /*break*/, 2];
                    _a = _g;
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, findProjectRoot(cwd, config.projectRootMarkers, fileSystem, options.signal)];
                case 3:
                    _a = _h.sent();
                    _h.label = 4;
                case 4:
                    projectRoot = _a;
                    _i = 0, _b = ancestorChain(projectRoot, cwd);
                    _h.label = 5;
                case 5:
                    if (!(_i < _b.length)) return [3 /*break*/, 12];
                    dir = _b[_i];
                    _c = 0, _d = [config.instructionFileCandidates, config.localInstructionFileCandidates];
                    _h.label = 6;
                case 6:
                    if (!(_c < _d.length)) return [3 /*break*/, 11];
                    candidates = _d[_c];
                    _e = 0;
                    return [4 /*yield*/, allExistingInstructionFiles(dir, projectRoot, candidates, fileSystem, options.signal)];
                case 7:
                    _f = _h.sent();
                    _h.label = 8;
                case 8:
                    if (!(_e < _f.length)) return [3 /*break*/, 10];
                    file = _f[_e];
                    addFile(file);
                    _h.label = 9;
                case 9:
                    _e++;
                    return [3 /*break*/, 8];
                case 10:
                    _c++;
                    return [3 /*break*/, 6];
                case 11:
                    _i++;
                    return [3 /*break*/, 5];
                case 12: return [2 /*return*/, files];
            }
        });
    });
}
/**
 * Discover host-visible user-global and root-to-cwd instruction candidates.
 * All present candidates in each directory are returned; trimmed-content
 * duplicates are collapsed later, once content is read.
 * @param options - cwd, home, root marker, and candidate configuration.
 * @returns path-deduplicated instruction candidates in model precedence order.
 */
function discoverBaselineInstructionFiles(options) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, discoverInstructionFiles(options)];
                case 1: return [2 /*return*/, (_a.sent()).map(function (_a) {
                        var absolutePath = _a.absolutePath, displayPath = _a.displayPath;
                        return ({ absolutePath: absolutePath, displayPath: displayPath });
                    })];
            }
        });
    });
}
function nodeTextChunks(path, signal) {
    return __asyncGenerator(this, arguments, function nodeTextChunks_1() {
        var stream, _a, stream_1, stream_1_1, chunk, e_1_1;
        var _b, e_1, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    stream = (0, node_fs_1.createReadStream)(path, { encoding: 'utf8', signal: signal });
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 8, 9, 14]);
                    _a = true, stream_1 = __asyncValues(stream);
                    _e.label = 2;
                case 2: return [4 /*yield*/, __await(stream_1.next())];
                case 3:
                    if (!(stream_1_1 = _e.sent(), _b = stream_1_1.done, !_b)) return [3 /*break*/, 7];
                    _d = stream_1_1.value;
                    _a = false;
                    chunk = _d;
                    return [4 /*yield*/, __await(String(chunk))];
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
                    if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 11];
                    return [4 /*yield*/, __await(_c.call(stream_1))];
                case 10:
                    _e.sent();
                    _e.label = 11;
                case 11: return [3 /*break*/, 13];
                case 12:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 13: return [7 /*endfinally*/];
                case 14: return [2 /*return*/];
            }
        });
    });
}
function readBounded(file, maxSourceBytes, fileSystem, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var chunks, _a, parts, bytes, _b, chunks_1, chunks_1_1, chunk, e_2_1, _c;
        var _d, e_2, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    // TODO(total-instruction-read-bound): enforce an aggregate source budget
                    // across a complete baseline or reconciliation batch; the render budget is
                    // applied only after every accepted file has been read under this per-file cap.
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if (file.size !== undefined && file.size > maxSourceBytes)
                        return [2 /*return*/, undefined];
                    _g.label = 1;
                case 1:
                    _g.trys.push([1, 17, , 18]);
                    if (!(fileSystem === undefined || file.target === undefined)) return [3 /*break*/, 2];
                    _a = nodeTextChunks(file.absolutePath, signal);
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, fileSystem.streamText(file.target, signal)];
                case 3:
                    _a = _g.sent();
                    _g.label = 4;
                case 4:
                    chunks = _a;
                    parts = [];
                    bytes = 0;
                    _g.label = 5;
                case 5:
                    _g.trys.push([5, 10, 11, 16]);
                    _b = true, chunks_1 = __asyncValues(chunks);
                    _g.label = 6;
                case 6: return [4 /*yield*/, chunks_1.next()];
                case 7:
                    if (!(chunks_1_1 = _g.sent(), _d = chunks_1_1.done, !_d)) return [3 /*break*/, 9];
                    _f = chunks_1_1.value;
                    _b = false;
                    chunk = _f;
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    bytes += Buffer.byteLength(chunk, 'utf8');
                    if (bytes > maxSourceBytes)
                        return [2 /*return*/, undefined];
                    parts.push(chunk);
                    _g.label = 8;
                case 8:
                    _b = true;
                    return [3 /*break*/, 6];
                case 9: return [3 /*break*/, 16];
                case 10:
                    e_2_1 = _g.sent();
                    e_2 = { error: e_2_1 };
                    return [3 /*break*/, 16];
                case 11:
                    _g.trys.push([11, , 14, 15]);
                    if (!(!_b && !_d && (_e = chunks_1.return))) return [3 /*break*/, 13];
                    return [4 /*yield*/, _e.call(chunks_1)];
                case 12:
                    _g.sent();
                    _g.label = 13;
                case 13: return [3 /*break*/, 15];
                case 14:
                    if (e_2) throw e_2.error;
                    return [7 /*endfinally*/];
                case 15: return [7 /*endfinally*/];
                case 16:
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [2 /*return*/, parts.join('')];
                case 17:
                    _c = _g.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    // A file may disappear or become unreadable after its metadata probe.
                    return [2 /*return*/, undefined];
                case 18: return [2 /*return*/];
            }
        });
    });
}
/**
 * Drop later candidates whose trimmed content duplicates an earlier sibling in
 * the same directory. Different directories never collapse even when identical;
 * within one directory the earliest candidate in discovery order is kept and its
 * original bytes are rendered. A candidate that symlinks a sibling resolves to
 * the same content and collapses here like any byte-identical real file.
 * @param files - loaded files in discovery order.
 * @returns the retained files in the same order.
 */
function dedupInstructionFilesByDirectory(files) {
    var keptDigestsByDir = new Map();
    var kept = [];
    for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
        var file = files_1[_i];
        var dir = (0, node_path_1.dirname)(file.displayPath);
        var digests = keptDigestsByDir.get(dir);
        if (digests === undefined) {
            digests = new Set();
            keptDigestsByDir.set(dir, digests);
        }
        var digest = (0, digest_ts_1.trimmedInstructionDigest)(file.content);
        if (digests.has(digest))
            continue;
        digests.add(digest);
        kept.push(file);
    }
    return kept;
}
/**
 * Discover, read, and render the baseline instruction chain.
 * @param options - discovery, source-size, byte-budget, and cancellation configuration.
 * @param fileSystem - optional provider used instead of host filesystem reads.
 * @returns rendered baseline context, or undefined when nothing can be loaded.
 */
function loadBaselineInstructions(options, fileSystem) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, loadBaselineInstructionSet(options, fileSystem)];
                case 1: return [2 /*return*/, (_a = (_b.sent())) === null || _a === void 0 ? void 0 : _a.rendered];
            }
        });
    });
}
/**
 * Load a baseline together with the files retained after rendering.
 * @param options - discovery, source-size, byte-budget, and cancellation configuration.
 * @param fileSystem - optional provider used instead of host filesystem reads.
 * @returns rendered context and retained files, an explicit empty replacement set, or undefined when empty or disabled.
 */
function loadBaselineInstructionSet(options, fileSystem) {
    return __awaiter(this, void 0, void 0, function () {
        var config, discovered, loaded, _i, discovered_1, file, content, deduped, _a, rendered_1, included_1, _b, rendered, included;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    config = (0, config_ts_1.resolveConfig)(options);
                    if (config.maxBytes <= 0 || !Number.isFinite(config.maxBytes))
                        return [2 /*return*/, undefined];
                    if (config.maxSourceBytes <= 0 || !Number.isFinite(config.maxSourceBytes))
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, discoverInstructionFiles(options, fileSystem)];
                case 1:
                    discovered = _c.sent();
                    loaded = [];
                    _i = 0, discovered_1 = discovered;
                    _c.label = 2;
                case 2:
                    if (!(_i < discovered_1.length)) return [3 /*break*/, 5];
                    file = discovered_1[_i];
                    return [4 /*yield*/, readBounded(file, config.maxSourceBytes, fileSystem, options.signal)];
                case 3:
                    content = _c.sent();
                    if (content !== undefined) {
                        loaded.push(__assign({ absolutePath: file.absolutePath, displayPath: file.displayPath, content: content }, file.version === undefined ? {} : { version: file.version }));
                    }
                    _c.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    deduped = dedupInstructionFilesByDirectory(loaded);
                    if (deduped.length === 0) {
                        if (options.replacePreviousBaseline !== true)
                            return [2 /*return*/, undefined];
                        _a = (0, render_ts_1.renderWorkspaceInstructionSet)([], {
                            maxBytes: config.maxBytes,
                            replacePreviousBaseline: true,
                        }), rendered_1 = _a.rendered, included_1 = _a.included;
                        return [2 /*return*/, {
                                rendered: rendered_1,
                                observed: [],
                                included: included_1,
                            }];
                    }
                    _b = (0, render_ts_1.renderWorkspaceInstructionSet)(deduped, __assign({ maxBytes: config.maxBytes }, options.replacePreviousBaseline === undefined
                        ? {}
                        : { replacePreviousBaseline: options.replacePreviousBaseline })), rendered = _b.rendered, included = _b.included;
                    return [2 /*return*/, {
                            rendered: rendered,
                            observed: loaded,
                            included: included,
                        }];
            }
        });
    });
}
/**
 * Probe the current provider metadata for one per-candidate instruction scope.
 * @param scope - a {@link candidateScopeKey} identifying a directory and candidate file.
 * @param projectRoot - project root used to resolve and display project scopes.
 * @param resolved - normalized plugin configuration.
 * @param fileSystem - provider used to resolve and stat scope candidates.
 * @param signal - cancellation for provider probes.
 * @returns present metadata, confirmed absence, or temporary unavailability.
 */
function probeScopeInstruction(scope, projectRoot, resolved, fileSystem, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, directory, candidateName, dir, absolutePath, target, info, _b, file;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = (0, render_ts_1.decodeScopeKey)(scope), directory = _a.directory, candidateName = _a.candidateName;
                    dir = directory === render_ts_1.USER_GLOBAL_DIRECTORY
                        ? resolved.dshHome
                        : directory === '.' ? projectRoot : (0, node_path_1.join)(projectRoot, directory);
                    absolutePath = (0, node_path_1.join)(dir, candidateName);
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fileSystem.resolve(absolutePath, signalOptions(signal))];
                case 2:
                    target = _c.sent();
                    return [4 /*yield*/, fileSystem.stat(target, signal)];
                case 3:
                    info = _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _b = _c.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [2 /*return*/, { kind: 'unavailable' }];
                case 5:
                    if ((info === null || info === void 0 ? void 0 : info.type) !== 'file')
                        return [2 /*return*/, { kind: 'absent' }];
                    file = __assign({ absolutePath: absolutePath, displayPath: directory === render_ts_1.USER_GLOBAL_DIRECTORY ? userGlobalDisplayPath(resolved.dshHome) : relativeDisplay(projectRoot, absolutePath), target: target, version: info.version }, info.size === undefined ? {} : { size: info.size });
                    return [2 /*return*/, { kind: 'present', file: file }];
            }
        });
    });
}
/**
 * Read one already-probed scope candidate under the configured source cap.
 * @param file - winning provider candidate and its metadata snapshot.
 * @param maxSourceBytes - maximum UTF-8 bytes accepted from the source.
 * @param fileSystem - provider used for the streaming read.
 * @param signal - cancellation for provider streaming.
 * @returns loaded content with the probed version, or undefined when unavailable.
 */
function readScopeInstruction(file, maxSourceBytes, fileSystem, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var content;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, readBounded(file, maxSourceBytes, fileSystem, signal)];
                case 1:
                    content = _a.sent();
                    if (content === undefined)
                        return [2 /*return*/, undefined];
                    return [2 /*return*/, {
                            absolutePath: file.absolutePath,
                            displayPath: file.displayPath,
                            content: content,
                            version: file.version,
                        }];
            }
        });
    });
}
function userGlobalDisplayPath(dshHome) {
    return "".concat((0, dsh_home_paths_1.dshHomeDisplay)(dshHome), "/AGENTS.md");
}
