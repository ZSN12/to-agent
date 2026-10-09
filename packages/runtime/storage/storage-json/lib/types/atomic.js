"use strict";
/**
 * Atomic whole-file replacement for the JSON backend.
 *
 * Publish protocol: write a same-directory temp file, fsync it, then
 * `rename()` over the target. Rename is an atomic replace on POSIX and on
 * Windows (libuv maps it to `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`),
 * and replacement is the intended semantic here — unlike the session-log
 * backend's link()+unlink() no-clobber protocol, a unit file has exactly one
 * writer per process and last-write-wins is correct. After the rename the
 * parent directory is fsynced on POSIX so the new entry is crash-durable.
 * @module @z/dsh-storage-json/src/atomic
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
exports.writeAtomic = writeAtomic;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var node_crypto_1 = require("node:crypto");
/**
 * Durably replace `path` with `data`.
 * @param path - Absolute target file path.
 * @param data - Full new file content.
 * @returns resolution after the replacement is crash-durable.
 */
function writeAtomic(path, data) {
    return __awaiter(this, void 0, void 0, function () {
        var tmp, handle, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    tmp = (0, node_path_1.join)((0, node_path_1.dirname)(path), ".".concat((0, node_crypto_1.randomUUID)(), ".tmp"));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 11, , 13]);
                    return [4 /*yield*/, (0, promises_1.open)(tmp, 'wx', 384)];
                case 2:
                    handle = _a.sent();
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, , 6, 8]);
                    return [4 /*yield*/, handle.writeFile(data, 'utf8')];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, handle.sync()];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 8];
                case 6: return [4 /*yield*/, handle.close()];
                case 7:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 8: return [4 /*yield*/, (0, promises_1.rename)(tmp, path)];
                case 9:
                    _a.sent();
                    return [4 /*yield*/, fsyncDirectory((0, node_path_1.dirname)(path))];
                case 10:
                    _a.sent();
                    return [3 /*break*/, 13];
                case 11:
                    error_1 = _a.sent();
                    return [4 /*yield*/, (0, promises_1.rm)(tmp, { force: true })];
                case 12:
                    _a.sent();
                    throw error_1;
                case 13: return [2 /*return*/];
            }
        });
    });
}
/** fsync a POSIX directory so a just-renamed entry is crash-durable. */
/* v8 ignore start -- Windows rejects O_RDONLY directory opens; POSIX coverage exercises this. */
function fsyncDirectory(path) {
    return __awaiter(this, void 0, void 0, function () {
        var handle;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (process.platform === 'win32')
                        return [2 /*return*/];
                    return [4 /*yield*/, (0, promises_1.open)(path, 'r')];
                case 1:
                    handle = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 4, 6]);
                    return [4 /*yield*/, handle.sync()];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, handle.close()];
                case 5:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/* v8 ignore stop */
