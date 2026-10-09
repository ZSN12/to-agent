"use strict";
/**
 * Browse backend of the directory-picker seam: registers `ctx.directoryPicker`
 * with the `browse` capability — one-level directory listing and child-directory
 * creation over the host filesystem via Node's stdlib (which already carries
 * the per-OS adaptation). Nothing renders on the host display, so this backend
 * serves remote clients the dialog backend cannot. Policy decisions (hidden
 * entries flagged but returned, symlinks followed, whole-filesystem scope) are
 * recorded in the directory-picker seam Agent Note.
 * @module @z/dsh-host-directory-picker-browse
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
exports.fullyQualified = fullyQualified;
exports.boundedInsert = boundedInsert;
exports.raceAbort = raceAbort;
var promises_1 = require("node:fs/promises");
var node_os_1 = require("node:os");
var node_path_1 = require("node:path");
var schemastery_1 = require("@z/schemastery");
var dsh_host_directory_picker_1 = require("@z/dsh-host-directory-picker");
/**
 * Ancestor chain from the filesystem root to `target` inclusive — the
 * breadcrumb rows of a listing, every one a jump target.
 */
function ancestryCrumbs(target) {
    var crumbs = [];
    var current = target;
    for (;;) {
        var parent_1 = (0, node_path_1.dirname)(current);
        // basename of a root is '' — label the root crumb by its full path ('/', 'C:\').
        crumbs.unshift({ name: parent_1 === current ? current : (0, node_path_1.basename)(current), path: current, hidden: false });
        if (parent_1 === current)
            return crumbs;
        current = parent_1;
    }
}
/**
 * True when the path names one fixed filesystem location regardless of
 * process state: POSIX-absolute on POSIX; on Windows only drive-qualified
 * (`C:\…`) or complete UNC (`\\server\share…`) forms. Rooted drive-less
 * forms (`\foo`, `/foo`) and incomplete UNC prefixes (`\\`, `\\server`)
 * pass `isAbsolute` yet still resolve against the process's current drive.
 * @param path - candidate path.
 * @param platform - replaces `process.platform` for deterministic tests.
 * @returns whether the path is fully qualified on the platform.
 */
function fullyQualified(path, platform) {
    if (platform === void 0) { platform = process.platform; }
    return platform === 'win32'
        ? node_path_1.win32.isAbsolute(path) && /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/]+[^\\/]+)/.test(path)
        : node_path_1.posix.isAbsolute(path);
}
/**
 * Insert a streamed candidate into the name-sorted bounded window, evicting
 * the name-largest candidate when the window exceeds `keep`. Memory over an
 * arbitrarily large level therefore stays O(keep) regardless of how many
 * children the directory holds.
 * @param window - the name-ascending window, mutated in place.
 * @param candidate - the streamed candidate to place.
 * @param keep - the window bound.
 * @returns true when an eviction happened (the level has candidates beyond the window).
 */
function boundedInsert(window, candidate, keep) {
    // Full window, name at or beyond the tail: one comparison rejects, so an
    // oversized level costs O(1) per candidate past the head instead of a
    // window scan (100k children against a 1,001 window must not approach
    // 10^8 comparisons).
    // oxlint-disable-next-line typescript/no-non-null-assertion -- a full window (length === keep >= 1) has a tail
    if (window.length === keep && candidate.name.localeCompare(window[window.length - 1].name) >= 0)
        return true;
    // Binary insertion keeps a retained candidate at O(log keep) comparisons.
    var lo = 0;
    var hi = window.length;
    while (lo < hi) {
        var mid = (lo + hi) >>> 1;
        // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded by the loop condition
        if (candidate.name.localeCompare(window[mid].name) < 0)
            hi = mid;
        else
            lo = mid + 1;
    }
    window.splice(lo, 0, candidate);
    if (window.length <= keep)
        return false;
    window.pop();
    return true;
}
/**
 * Await `operation`, but reject with the signal's reason the moment it
 * aborts. Node's filesystem reads are not retractable, so the operation
 * itself keeps running against a handle the caller then closes — its late
 * settlement is swallowed here so an abandoned read cannot surface as an
 * unhandled rejection.
 * @param operation - the in-flight filesystem step.
 * @param signal - caller lifetime; absent means plain awaiting.
 * @returns the operation's value.
 */
function raceAbort(operation, signal) {
    if (signal === undefined)
        return operation;
    return new Promise(function (resolve, reject) {
        var onAbort = function () {
            operation.catch(function () {
                // Abandoned read: its handle is being closed by the aborting caller,
                // and the abort reason already carried the outcome.
            });
            reject(asError(signal.reason));
        };
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        operation.then(function (value) {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, function (reason) {
            signal.removeEventListener('abort', onAbort);
            reject(asError(reason));
        });
    });
}
/** The thrown value as an Error (wire/abort reasons may be anything). */
function asError(reason) {
    return reason instanceof Error ? reason : new Error(String(reason));
}
/* v8 ignore start -- a close failure of an abandoned handle has no consumer, and forcing one needs a filesystem torn down mid-request. */
/** Swallow the close failure of a handle its caller already departed. */
function swallowCloseFailure() { }
/* v8 ignore stop */
/** Message text of an unknown thrown value. */
function messageOf(error) {
    /* v8 ignore next -- node:fs rejects with Error instances; the String arm only satisfies the unknown narrowing. */
    return error instanceof Error ? error.message : String(error);
}
/**
 * One listing row for a dirent, following symlinks to directories; null for
 * non-directories and broken/cyclic links (skipped silently — the browser
 * shows what can be entered, and a broken link cannot).
 */
function directoryRow(parent, name, isDirectory, isSymbolicLink, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var path, enterable, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    path = (0, node_path_1.join)(parent, name);
                    enterable = isDirectory;
                    if (!(!enterable && isSymbolicLink)) return [3 /*break*/, 4];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, raceAbort((0, promises_1.stat)(path), signal)];
                case 2:
                    // The probe races the caller too: a symlink target on a stalled
                    // network filesystem must not keep a departed caller's request alive.
                    enterable = (_b.sent()).isDirectory();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    /* v8 ignore next 2 -- an abort landing mid-probe needs a stalled stat; the per-candidate check in list covers the settled path. */
                    if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                        throw asError(signal.reason);
                    // Broken or cyclic symlink: stat is the probe, failure means "not enterable".
                    return [2 /*return*/, null];
                case 4:
                    if (!enterable)
                        return [2 /*return*/, null
                            // POSIX hidden convention; Windows' hidden attribute is not exposed by
                            // dirents (Known Limitations). The client owns whether hidden rows show.
                        ];
                    // POSIX hidden convention; Windows' hidden attribute is not exposed by
                    // dirents (Known Limitations). The client owns whether hidden rows show.
                    return [2 /*return*/, { name: name, path: path, hidden: name.startsWith('.') }];
            }
        });
    });
}
/** The `ctx.directoryPicker` browse implementation (stable capability object per service life). */
var BrowseDirectoryPicker = /** @class */ (function (_super) {
    __extends(BrowseDirectoryPicker, _super);
    function BrowseDirectoryPicker(ctx, config) {
        var _this = _super.call(this, ctx) || this;
        _this.config = config;
        _this.browseCapability = {
            kind: 'browse',
            list: function (path, signal) { return _this.list(path, signal); },
            createDirectory: function (path, name) { return _this.createDirectory(path, name); },
        };
        return _this;
    }
    /**
     * The browse interaction capability.
     * @returns the stable `browse` capability object.
     */
    BrowseDirectoryPicker.prototype.capability = function () {
        return this.browseCapability;
    };
    BrowseDirectoryPicker.prototype.list = function (path, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var home, target, keep, window, evicted, opening_1, level, dirent, candidate, closing, error_1, entries, truncated, _i, window_1, candidate, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        home = (0, node_os_1.homedir)();
                        // The seam contract takes fully qualified paths only; resolve() would
                        // silently rebase a relative or empty wire value under the host process
                        // cwd (or, for rooted drive-less Windows forms, its current drive).
                        if (path !== undefined && !fullyQualified(path)) {
                            throw new dsh_host_directory_picker_1.DirectoryPickerError('directory-unreadable', path, "cannot list \"".concat(path, "\": not a fully qualified path"));
                        }
                        target = (0, node_path_1.resolve)(path !== null && path !== void 0 ? path : home);
                        keep = this.config.maxEntries + 1;
                        window = [];
                        evicted = false;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 13, , 14]);
                        opening_1 = (0, promises_1.opendir)(target);
                        return [4 /*yield*/, raceAbort(opening_1, signal).catch(function (error) {
                                // The abandoned open can still mint a handle after the abort won;
                                // close it so a departed caller cannot leak a descriptor. (A lost
                                // race against opendir's own rejection has nothing to close, and
                                // the close's own failure is swallowed — the request already
                                // returned, so a cleanup error has no consumer.)
                                void opening_1.then(function (dir) { return dir.close().catch(swallowCloseFailure); }, function () {
                                    // Already rejected: raceAbort surfaced or swallowed it.
                                });
                                throw error;
                            })];
                    case 2:
                        level = _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, , 8, 12]);
                        _a.label = 4;
                    case 4: return [4 /*yield*/, raceAbort(level.read(), signal)];
                    case 5:
                        dirent = _a.sent();
                        if (dirent === null)
                            return [3 /*break*/, 7];
                        // Only rows a browser could enter contend for the window; dirent
                        // says "directory" outright, a symlink needs the later stat probe.
                        if (!dirent.isDirectory() && !dirent.isSymbolicLink())
                            return [3 /*break*/, 6];
                        candidate = { name: dirent.name, isDirectory: dirent.isDirectory(), isSymbolicLink: dirent.isSymbolicLink() };
                        if (boundedInsert(window, candidate, keep))
                            evicted = true;
                        _a.label = 6;
                    case 6: return [3 /*break*/, 4];
                    case 7: return [3 /*break*/, 12];
                    case 8:
                        closing = level.close();
                        if (!(signal === null || signal === void 0 ? void 0 : signal.aborted)) return [3 /*break*/, 9];
                        closing.catch(swallowCloseFailure);
                        return [3 /*break*/, 11];
                    case 9: return [4 /*yield*/, closing];
                    case 10:
                        _a.sent();
                        _a.label = 11;
                    case 11: return [7 /*endfinally*/];
                    case 12: return [3 /*break*/, 14];
                    case 13:
                        error_1 = _a.sent();
                        // An abort is the caller's own reason, not an unreadable directory.
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        throw new dsh_host_directory_picker_1.DirectoryPickerError('directory-unreadable', target, "cannot list ".concat(target, ": ").concat(messageOf(error_1)));
                    case 14:
                        entries = [];
                        truncated = evicted;
                        _i = 0, window_1 = window;
                        _a.label = 15;
                    case 15:
                        if (!(_i < window_1.length)) return [3 /*break*/, 18];
                        candidate = window_1[_i];
                        // A caller that departed between reads and probes stops before the
                        // next probe (each probe's own await is raced inside directoryRow).
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, directoryRow(target, candidate.name, candidate.isDirectory, candidate.isSymbolicLink, signal)];
                    case 16:
                        row = _a.sent();
                        if (row === null)
                            return [3 /*break*/, 17];
                        if (entries.length === this.config.maxEntries) {
                            truncated = true;
                            return [3 /*break*/, 18];
                        }
                        entries.push(row);
                        _a.label = 17;
                    case 17:
                        _i++;
                        return [3 /*break*/, 15];
                    case 18: return [2 /*return*/, { path: target, home: home, crumbs: ancestryCrumbs(target), entries: entries, truncated: truncated }];
                }
            });
        });
    };
    BrowseDirectoryPicker.prototype.createDirectory = function (path, name) {
        return __awaiter(this, void 0, void 0, function () {
            var parent, target, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // Same fully-qualified fence as list: never rebase a parent under the
                        // cwd or the current drive.
                        if (!fullyQualified(path)) {
                            throw new dsh_host_directory_picker_1.DirectoryPickerError('directory-create-failed', path, "cannot create under \"".concat(path, "\": not a fully qualified parent path"));
                        }
                        parent = (0, node_path_1.resolve)(path);
                        // The backend owns segment validation (the wire schema also refuses these,
                        // but direct service consumers must hit the same fence).
                        if (name.trim() === '' || name === '.' || name === '..' || /[/\\]/.test(name)) {
                            throw new dsh_host_directory_picker_1.DirectoryPickerError('directory-create-failed', (0, node_path_1.join)(parent, name), "\"".concat(name, "\" is not a single path segment"));
                        }
                        target = (0, node_path_1.join)(parent, name);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        // Non-recursive: the parent is the directory the browser is showing, so
                        // a missing parent is a real failure, not a level to invent.
                        return [4 /*yield*/, (0, promises_1.mkdir)(target)];
                    case 2:
                        // Non-recursive: the parent is the directory the browser is showing, so
                        // a missing parent is a real failure, not a level to invent.
                        _a.sent();
                        return [2 /*return*/, target];
                    case 3:
                        error_2 = _a.sent();
                        if (typeof error_2 === 'object' && error_2 !== null && 'code' in error_2 && error_2.code === 'EEXIST') {
                            throw new dsh_host_directory_picker_1.DirectoryPickerError('directory-exists', target, "".concat(target, " already exists"));
                        }
                        throw new dsh_host_directory_picker_1.DirectoryPickerError('directory-create-failed', target, "cannot create ".concat(target, ": ").concat(messageOf(error_2)));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * `maxEntries` bounds the complete listing level a single `list` call may
     * materialize and put on the wire: at most this many child-directory rows
     * (hidden rows included), with `truncated` flagging a cut level. The
     * default follows GitHub's web UI, which truncates directory listings at
     * 1,000 entries.
     */
    BrowseDirectoryPicker.Config = schemastery_1.default.object({
        maxEntries: schemastery_1.default.natural().min(1).default(1000),
    });
    return BrowseDirectoryPicker;
}(dsh_host_directory_picker_1.DirectoryPicker));
exports.default = BrowseDirectoryPicker;
