"use strict";
/**
 * Windows durable namespace helpers for the JSONL backend.
 *
 * POSIX publishes a newly-created log by creating a directory entry and then
 * fsyncing the parent directory. Windows does not expose that parent-directory
 * fsync contract through Node, so the Windows path uses the native durable
 * namespace primitive instead: create a staging object in the target directory
 * and publish it with `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)` without
 * replacement or cross-volume copy fallback.
 *
 * @module dsh-session-persistence-jsonl/win32
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
exports.publishNewFileWin32 = publishNewFileWin32;
exports.ensureDurableDirectoryWin32 = ensureDurableDirectoryWin32;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var MOVEFILE_WRITE_THROUGH = 0x00000008;
var ERROR_FILE_NOT_FOUND = 2;
var ERROR_PATH_NOT_FOUND = 3;
var ERROR_ACCESS_DENIED = 5;
var ERROR_NOT_SAME_DEVICE = 17;
var ERROR_FILE_EXISTS = 80;
var ERROR_INVALID_NAME = 123;
var ERROR_ALREADY_EXISTS = 183;
var bindings;
/** Load the small Win32 API lazily so non-Windows processes never load Koffi. */
function win32() {
    return __awaiter(this, void 0, void 0, function () {
        var koffi, kernel32;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (bindings !== undefined)
                        return [2 /*return*/, bindings];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('koffi'); })];
                case 1:
                    koffi = (_a.sent()).default;
                    kernel32 = koffi.load('kernel32.dll');
                    bindings = {
                        moveFileExW: kernel32.func('__stdcall', 'MoveFileExW', 'int', ['str16', 'str16', 'uint']),
                        getLastError: kernel32.func('__stdcall', 'GetLastError', 'uint', []),
                    };
                    return [2 /*return*/, bindings];
            }
        });
    });
}
function errnoCode(win32Code) {
    switch (win32Code) {
        case ERROR_FILE_NOT_FOUND:
        case ERROR_PATH_NOT_FOUND:
            return 'ENOENT';
        case ERROR_ACCESS_DENIED:
            return 'EACCES';
        case ERROR_NOT_SAME_DEVICE:
            return 'EXDEV';
        case ERROR_FILE_EXISTS:
        case ERROR_ALREADY_EXISTS:
            return 'EEXIST';
        case ERROR_INVALID_NAME:
            return 'EINVAL';
        default:
            return 'EIO';
    }
}
function win32Error(syscall, win32Code, path, dest) {
    var code = errnoCode(win32Code);
    var error = new Error("".concat(syscall, " ").concat(code, " (Win32 ").concat(win32Code, "): ").concat(path, " -> ").concat(dest));
    error.code = code;
    error.errno = win32Code;
    error.syscall = syscall;
    error.path = path;
    error.dest = dest;
    error.win32Code = win32Code;
    return error;
}
function isENOENT(error) {
    return (error === null || error === void 0 ? void 0 : error.code) === 'ENOENT';
}
function isEEXIST(error) {
    return (error === null || error === void 0 ? void 0 : error.code) === 'EEXIST';
}
function assertDirectory(path) {
    return __awaiter(this, void 0, void 0, function () {
        var probe, info, error, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    probe = path === (0, node_path_1.parse)(path).root ? path : (0, node_path_1.toNamespacedPath)(path);
                    return [4 /*yield*/, (0, promises_1.stat)(probe)];
                case 1:
                    info = _a.sent();
                    if (info.isDirectory())
                        return [2 /*return*/, true];
                    error = new Error("path exists but is not a directory: ".concat(path));
                    error.code = 'ENOTDIR';
                    error.path = path;
                    throw error;
                case 2:
                    error_1 = _a.sent();
                    if (isENOENT(error_1))
                        return [2 /*return*/, false];
                    throw error_1;
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Publish `existing` at `replacement` with Windows write-through rename
 * semantics. The destination must not already exist; the move must stay within
 * the volume (no copy fallback flag is set).
 * @param existing - the synced staging path to move.
 * @param replacement - the final path, which must not already exist.
 */
function publishNewFileWin32(existing, replacement) {
    return __awaiter(this, void 0, void 0, function () {
        var api, ok;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, win32()];
                case 1:
                    api = _a.sent();
                    ok = api.moveFileExW((0, node_path_1.toNamespacedPath)(existing), (0, node_path_1.toNamespacedPath)(replacement), MOVEFILE_WRITE_THROUGH);
                    if (ok === 0)
                        throw win32Error('MoveFileExW', api.getLastError(), existing, replacement);
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Create `target` and its missing ancestors with durable Windows namespace
 * publication. Each missing directory is first created as a random staging
 * sibling, then moved to its final name with `MOVEFILE_WRITE_THROUGH`; races
 * with another creator are accepted only after verifying the winner is a
 * directory.
 * @param target - the absolute directory path to create durably when absent.
 */
function ensureDurableDirectoryWin32(target) {
    return __awaiter(this, void 0, void 0, function () {
        var absolute, root, segments, current, _i, segments_1, segment, next;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    absolute = (0, node_path_1.resolve)(target);
                    root = (0, node_path_1.parse)(absolute).root;
                    return [4 /*yield*/, assertDirectory(root)];
                case 1:
                    _a.sent();
                    segments = absolute.slice(root.length).split(/[\\/]+/).filter(function (part) { return part.length > 0; });
                    current = root;
                    _i = 0, segments_1 = segments;
                    _a.label = 2;
                case 2:
                    if (!(_i < segments_1.length)) return [3 /*break*/, 7];
                    segment = segments_1[_i];
                    next = (0, node_path_1.join)(current, segment);
                    return [4 /*yield*/, assertDirectory(next)];
                case 3:
                    if (!!(_a.sent())) return [3 /*break*/, 5];
                    return [4 /*yield*/, createLeafDirectoryWin32(current, next)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    current = next;
                    _a.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 2];
                case 7: return [2 /*return*/];
            }
        });
    });
}
function createLeafDirectoryWin32(parent, target) {
    return __awaiter(this, void 0, void 0, function () {
        var staging, error_2, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, promises_1.mkdtemp)((0, node_path_1.toNamespacedPath)((0, node_path_1.join)(parent, '.dsh-mkdir-')))];
                case 1:
                    staging = _b.sent();
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 8]);
                    return [4 /*yield*/, publishNewFileWin32(staging, target)];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 8];
                case 4:
                    error_2 = _b.sent();
                    return [4 /*yield*/, (0, promises_1.rm)(staging, { recursive: true, force: true })];
                case 5:
                    _b.sent();
                    _a = isEEXIST(error_2);
                    if (!_a) return [3 /*break*/, 7];
                    return [4 /*yield*/, assertDirectory(target)];
                case 6:
                    _a = (_b.sent());
                    _b.label = 7;
                case 7:
                    if (_a)
                        return [2 /*return*/];
                    throw error_2;
                case 8: return [2 /*return*/];
            }
        });
    });
}
