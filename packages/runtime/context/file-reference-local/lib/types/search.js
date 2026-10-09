"use strict";
/**
 * Host-workspace discovery for `@file` completion. The index contains paths
 * only: selected values remain ordinary prompt text and file contents stay
 * behind the model-facing `read` tool.
 *
 * @module @z/dsh-file-reference-local/search
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
exports.WorkspaceFileSearch = exports.DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES = exports.DEFAULT_FILE_SEARCH_MAX_ENTRIES = exports.DEFAULT_FILE_SEARCH_MAX_RESULTS = exports.formatFileMention = exports.activeAtToken = void 0;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var grammar_1 = require("@z/dsh-file-reference/grammar");
Object.defineProperty(exports, "activeAtToken", { enumerable: true, get: function () { return grammar_1.activeAtToken; } });
Object.defineProperty(exports, "formatFileMention", { enumerable: true, get: function () { return grammar_1.formatFileMention; } });
/** Default maximum file and directory candidates rendered for one query. */
exports.DEFAULT_FILE_SEARCH_MAX_RESULTS = 20;
/** Default maximum entries retained in one workspace search index. */
exports.DEFAULT_FILE_SEARCH_MAX_ENTRIES = 10000;
/** Directory basenames omitted from traversal unless the deployment overrides them. */
exports.DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES = ['.git', 'node_modules'];
/**
 * Cancellable, reusable fuzzy index rooted at one agent working directory.
 * Directory-scoped queries list live state; bare fuzzy queries share one
 * bounded traversal until the `@` interaction ends or a tool result invalidates it.
 */
var WorkspaceFileSearch = /** @class */ (function () {
    function WorkspaceFileSearch(root, config) {
        this.root = root;
        this.config = config;
        this.disposed = false;
        if (!Number.isSafeInteger(config.maxResults) || config.maxResults <= 0) {
            throw new Error('file search maxResults must be a positive safe integer');
        }
        if (!Number.isSafeInteger(config.maxEntries) || config.maxEntries <= 0) {
            throw new Error('file search maxEntries must be a positive safe integer');
        }
        if (config.excludedDirectories.some(function (name) { return name.length === 0 || name.includes('/') || name.includes('\\'); })) {
            throw new Error('file search excludedDirectories entries must be non-empty directory basenames');
        }
        this.excludedDirectories = new Set(config.excludedDirectories);
    }
    /**
     * Return ranked path candidates for the current token.
     * @param rawQuery - path text following `@` or `@"`.
     * @param signal - cancels this caller's wait without killing an index shared by a newer query.
     * @returns at most `maxResults` deterministic candidates.
     */
    WorkspaceFileSearch.prototype.list = function (rawQuery, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var query, slash, directory, fragment, indexed;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal.throwIfAborted();
                        if (this.disposed)
                            return [2 /*return*/, []];
                        query = rawQuery.replaceAll('\\', '/');
                        slash = query.lastIndexOf('/');
                        if (query === '' || slash >= 0) {
                            directory = slash < 0 ? '' : query.slice(0, slash + 1);
                            fragment = slash < 0 ? '' : query.slice(slash + 1);
                            return [2 /*return*/, this.listDirectory(directory, fragment, signal)];
                        }
                        return [4 /*yield*/, waitForPromise(this.ensureIndex(), signal)];
                    case 1:
                        indexed = _a.sent();
                        return [2 /*return*/, rankCandidates(indexed.filter(function (candidate) { return visibleForGlobalQuery(candidate.path, query); }), query, this.config.maxResults)];
                }
            });
        });
    };
    /** Discard the current index so the next bare query observes a fresh tree. */
    WorkspaceFileSearch.prototype.invalidate = function () {
        var _a;
        (_a = this.generation) === null || _a === void 0 ? void 0 : _a.controller.abort(new Error('file search index invalidated'));
        this.generation = undefined;
    };
    /** Abort traversal and make later queries return no candidates. */
    WorkspaceFileSearch.prototype.dispose = function () {
        if (this.disposed)
            return;
        this.disposed = true;
        this.invalidate();
    };
    WorkspaceFileSearch.prototype.ensureIndex = function () {
        var _this = this;
        if (this.generation !== undefined)
            return this.generation.promise;
        var controller = new AbortController();
        var generation = {
            controller: controller,
            promise: Promise.resolve([]),
        };
        generation.promise = this.scanWorkspace(controller.signal).catch(function (error) {
            /* v8 ignore next -- every owned abort clears `generation` synchronously; this only protects an unexpected scan failure */
            if (_this.generation === generation)
                _this.generation = undefined;
            throw error;
        });
        this.generation = generation;
        return generation.promise;
    };
    WorkspaceFileSearch.prototype.scanWorkspace = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var indexed, directories, cursor, directory, entries, _i, entries_1, entry, path;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        indexed = [];
                        directories = [{ absolute: this.root, relative: '' }];
                        cursor = 0;
                        _a.label = 1;
                    case 1:
                        if (!(cursor < directories.length && indexed.length < this.config.maxEntries)) return [3 /*break*/, 4];
                        signal.throwIfAborted();
                        directory = directories[cursor];
                        /* v8 ignore next 3 -- cursor is bounded by this exact queue's length. */
                        if (directory === undefined) {
                            throw new Error('file search selected a missing directory');
                        }
                        return [4 /*yield*/, readDirectory(directory.absolute, signal)];
                    case 2:
                        entries = _a.sent();
                        for (_i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
                            entry = entries_1[_i];
                            signal.throwIfAborted();
                            path = directory.relative === '' ? entry.name : "".concat(directory.relative, "/").concat(entry.name);
                            if (entry.isDirectory()) {
                                if (this.excludedDirectories.has(entry.name))
                                    continue;
                                indexed.push({ path: path, kind: 'directory' });
                                directories.push({ absolute: (0, node_path_1.join)(directory.absolute, entry.name), relative: path });
                            }
                            else if (entry.isFile()) {
                                indexed.push({ path: path, kind: 'file' });
                            }
                            if (indexed.length >= this.config.maxEntries)
                                break;
                        }
                        _a.label = 3;
                    case 3:
                        cursor += 1;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, indexed];
                }
            });
        });
    };
    WorkspaceFileSearch.prototype.listDirectory = function (displayDirectory, fragment, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var absolute, entries, candidates, _i, entries_2, entry;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (displayDirectory.split('/').some(function (segment) { return _this.excludedDirectories.has(segment); }))
                            return [2 /*return*/, []];
                        return [4 /*yield*/, resolveDisplayDirectory(this.root, displayDirectory, signal)];
                    case 1:
                        absolute = _a.sent();
                        if (absolute === undefined)
                            return [2 /*return*/, []];
                        return [4 /*yield*/, readDirectory(absolute, signal)];
                    case 2:
                        entries = _a.sent();
                        candidates = [];
                        for (_i = 0, entries_2 = entries; _i < entries_2.length; _i++) {
                            entry = entries_2[_i];
                            if (entry.name.startsWith('.') && !fragment.startsWith('.'))
                                continue;
                            if (entry.isDirectory()) {
                                if (this.excludedDirectories.has(entry.name))
                                    continue;
                                candidates.push({ path: "".concat(displayDirectory).concat(entry.name), kind: 'directory' });
                            }
                            else if (entry.isFile()) {
                                candidates.push({ path: "".concat(displayDirectory).concat(entry.name), kind: 'file' });
                            }
                        }
                        return [2 /*return*/, rankCandidates(candidates, fragment, this.config.maxResults)];
                }
            });
        });
    };
    return WorkspaceFileSearch;
}());
exports.WorkspaceFileSearch = WorkspaceFileSearch;
function resolveDisplayDirectory(root, displayDirectory, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var resolvedRoot, absolute, fromRoot, current, _i, _a, segment, status_1, _error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    resolvedRoot = (0, node_path_1.resolve)(root);
                    absolute = (0, node_path_1.resolve)(resolvedRoot, displayDirectory === '' ? '.' : displayDirectory);
                    fromRoot = (0, node_path_1.relative)(resolvedRoot, absolute);
                    if (fromRoot === '..' || fromRoot.startsWith("..".concat(node_path_1.sep)))
                        return [2 /*return*/, undefined
                            /* v8 ignore next -- only Windows can produce a cross-volume absolute relative path */
                        ];
                    /* v8 ignore next -- only Windows can produce a cross-volume absolute relative path */
                    if ((0, node_path_1.isAbsolute)(fromRoot))
                        return [2 /*return*/, undefined];
                    current = resolvedRoot;
                    _i = 0, _a = fromRoot.split(node_path_1.sep).filter(Boolean);
                    _b.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 6];
                    segment = _a[_i];
                    signal.throwIfAborted();
                    current = (0, node_path_1.join)(current, segment);
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, (0, promises_1.lstat)(current)];
                case 3:
                    status_1 = _b.sent();
                    signal.throwIfAborted();
                    if (status_1.isSymbolicLink() || !status_1.isDirectory())
                        return [2 /*return*/, undefined];
                    return [3 /*break*/, 5];
                case 4:
                    _error_1 = _b.sent();
                    signal.throwIfAborted();
                    return [2 /*return*/, undefined];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, absolute];
            }
        });
    });
}
function readDirectory(absolute, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var entries, _error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    signal.throwIfAborted();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.readdir)(absolute, { withFileTypes: true })];
                case 2:
                    entries = _a.sent();
                    signal.throwIfAborted();
                    return [2 /*return*/, entries.sort(function (left, right) { return compareText(left.name, right.name); })];
                case 3:
                    _error_2 = _a.sent();
                    signal.throwIfAborted();
                    // An unreadable/missing subtree contributes no candidates; other readable
                    // branches remain useful and autocomplete is advisory.
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function visibleForGlobalQuery(path, query) {
    if (query.startsWith('.') || query.includes('/.'))
        return true;
    return !path.split('/').some(function (segment) { return segment.startsWith('.'); });
}
function rankCandidates(candidates, query, limit) {
    var ranked = [];
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var candidate = candidates_1[_i];
        var score = scoreCandidate(candidate, query);
        if (score !== undefined)
            ranked.push({ candidate: candidate, score: score });
    }
    ranked.sort(function (left, right) {
        return right.score - left.score
            || kindRank(left.candidate.kind) - kindRank(right.candidate.kind)
            || (query === '' ? 0 : left.candidate.path.length - right.candidate.path.length)
            || compareText(left.candidate.path, right.candidate.path);
    });
    return ranked.slice(0, limit).map(function (entry) { return entry.candidate; });
}
function scoreCandidate(candidate, query) {
    if (query === '')
        return 0;
    var path = candidate.path.toLowerCase();
    var name = path.slice(path.lastIndexOf('/') + 1);
    var needle = query.toLowerCase();
    var directoryBonus = candidate.kind === 'directory' ? 25 : 0;
    if (name === needle)
        return 1000 + directoryBonus;
    if (name.startsWith(needle))
        return 900 + directoryBonus;
    if (name.includes(needle))
        return 700 + directoryBonus;
    if (path.includes(needle))
        return 500 + directoryBonus;
    var subsequence = subsequenceScore(path, needle);
    return subsequence === undefined ? undefined : 300 + subsequence + directoryBonus;
}
function subsequenceScore(target, query) {
    var targetIndex = 0;
    var gap = 0;
    for (var _i = 0, query_1 = query; _i < query_1.length; _i++) {
        var character = query_1[_i];
        var found = target.indexOf(character, targetIndex);
        if (found < 0)
            return undefined;
        gap += found - targetIndex;
        targetIndex = found + 1;
    }
    return Math.max(0, 100 - gap);
}
function kindRank(kind) {
    return kind === 'directory' ? 0 : 1;
}
function compareText(left, right) {
    /* v8 ignore next -- entries and candidates are unique; host enumeration
     * order determines which comparison direction sort requests. */
    return left < right ? -1 : left > right ? 1 : 0;
}
function waitForPromise(promise, signal) {
    /* v8 ignore next -- `list()` checks this signal immediately before its synchronous call into this helper */
    if (signal.aborted)
        return Promise.reject(errorReason(signal.reason, 'file search aborted'));
    return new Promise(function (resolvePromise, rejectPromise) {
        var onAbort = function () { rejectPromise(errorReason(signal.reason, 'file search aborted')); };
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(function (value) {
            signal.removeEventListener('abort', onAbort);
            resolvePromise(value);
        }, function (error) {
            signal.removeEventListener('abort', onAbort);
            rejectPromise(errorReason(error, 'file search index failed'));
        });
    });
}
function errorReason(reason, fallback) {
    return reason instanceof Error ? reason : new Error(fallback, { cause: reason });
}
