"use strict";
/**
 * Windows security-descriptor helpers for atomic local-file replacement. Koffi loads lazily so
 * non-Windows processes never open Win32 libraries.
 * @module @z/dsh-fs-local/win32
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
exports.readFileDaclWin32 = readFileDaclWin32;
exports.copyFileDaclWin32 = copyFileDaclWin32;
exports.replaceFileWin32 = replaceFileWin32;
var node_path_1 = require("node:path");
var DACL_SECURITY_INFORMATION = 0x00000004;
var PROTECTED_DACL_SECURITY_INFORMATION = 0x80000000;
var ERROR_FILE_NOT_FOUND = 2;
var ERROR_PATH_NOT_FOUND = 3;
var ERROR_ACCESS_DENIED = 5;
var bindings;
function win32() {
    return __awaiter(this, void 0, void 0, function () {
        var koffi, advapi32, kernel32;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (bindings !== undefined)
                        return [2 /*return*/, bindings];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('koffi'); })];
                case 1:
                    koffi = (_a.sent()).default;
                    advapi32 = koffi.load('advapi32.dll');
                    kernel32 = koffi.load('kernel32.dll');
                    bindings = {
                        getFileSecurityW: advapi32.func('int __stdcall GetFileSecurityW(const char16_t *path, uint32_t requested, void *descriptor, uint32_t length, _Out_ uint32_t *needed)'),
                        setFileSecurityW: advapi32.func('int __stdcall SetFileSecurityW(const char16_t *path, uint32_t information, const void *descriptor)'),
                        replaceFileW: kernel32.func('int __stdcall ReplaceFileW(const char16_t *replaced, const char16_t *replacement, const char16_t *backup, uint32_t flags, void *exclude, void *reserved)'),
                        getLastError: kernel32.func('uint32_t __stdcall GetLastError()'),
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
        default:
            return 'EIO';
    }
}
function win32Error(syscall, win32Code, path) {
    var code = errnoCode(win32Code);
    var error = new Error("".concat(syscall, " ").concat(code, " (Win32 ").concat(win32Code, "): ").concat(path));
    error.code = code;
    error.errno = win32Code;
    error.syscall = syscall;
    error.path = path;
    error.win32Code = win32Code;
    return error;
}
/**
 * Read a file's self-relative DACL security descriptor.
 * @param path - existing file whose DACL is read.
 * @returns a descriptor buffer accepted by `SetFileSecurityW`.
 */
function readFileDaclWin32(path) {
    return __awaiter(this, void 0, void 0, function () {
        var api, nativePath, needed, descriptor;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, win32()];
                case 1:
                    api = _a.sent();
                    nativePath = (0, node_path_1.toNamespacedPath)(path);
                    needed = [0];
                    api.getFileSecurityW(nativePath, DACL_SECURITY_INFORMATION, null, 0, needed);
                    if (needed[0] === 0)
                        throw win32Error('GetFileSecurityW', api.getLastError(), path);
                    descriptor = Buffer.alloc(needed[0]);
                    if (api.getFileSecurityW(nativePath, DACL_SECURITY_INFORMATION, descriptor, descriptor.length, needed) === 0) {
                        throw win32Error('GetFileSecurityW', api.getLastError(), path);
                    }
                    return [2 /*return*/, descriptor.subarray(0, needed[0])];
            }
        });
    });
}
/**
 * Copy an existing file's DACL onto another file and protect it from staging-parent inheritance.
 * The destination must still be empty when confidentiality depends on this call.
 * @param source - existing file whose DACL is copied.
 * @param destination - existing file that receives the protected DACL.
 */
function copyFileDaclWin32(source, destination) {
    return __awaiter(this, void 0, void 0, function () {
        var descriptor, api, information;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, readFileDaclWin32(source)];
                case 1:
                    descriptor = _a.sent();
                    return [4 /*yield*/, win32()];
                case 2:
                    api = _a.sent();
                    information = (DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION) >>> 0;
                    if (api.setFileSecurityW((0, node_path_1.toNamespacedPath)(destination), information, descriptor) === 0) {
                        throw win32Error('SetFileSecurityW', api.getLastError(), destination);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Replace a Windows file while preserving the replaced file's ACL and other replace metadata.
 * @param replaced - existing destination file.
 * @param replacement - closed staging file on the same volume.
 */
function replaceFileWin32(replaced, replacement) {
    return __awaiter(this, void 0, void 0, function () {
        var api;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, win32()];
                case 1:
                    api = _a.sent();
                    if (api.replaceFileW((0, node_path_1.toNamespacedPath)(replaced), (0, node_path_1.toNamespacedPath)(replacement), null, 0, null, null) === 0) {
                        throw win32Error('ReplaceFileW', api.getLastError(), replaced);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
