"use strict";
/** Cross-platform native single-directory chooser behind the native backend's capability. */
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
exports.pickNativeDirectory = pickNativeDirectory;
var dsh_native_command_1 = require("@z/dsh-native-command");
var win32_dialog_ts_1 = require("./win32-dialog.ts");
function outputPath(stdout) {
    var path = stdout.replace(/[\r\n]+$/, '');
    return path === '' ? null : path;
}
function errorCode(error) {
    if (typeof error !== 'object' || error === null || !('code' in error))
        return undefined;
    var code = error.code;
    return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}
function errorStderr(error) {
    if (typeof error !== 'object' || error === null || !('stderr' in error))
        return '';
    var stderr = error.stderr;
    return typeof stderr === 'string' ? stderr : '';
}
function isMissingCommand(error) {
    return errorCode(error) === 'ENOENT';
}
function rethrowIfAborted(signal, error) {
    if (signal.aborted)
        throw error;
}
/**
 * Open the platform directory picker.
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform and runner hooks for deterministic tests.
 * @returns the selected path, or null when the user cancels.
 */
function pickNativeDirectory(signal_1) {
    return __awaiter(this, arguments, void 0, function (signal, internals) {
        var platform, run, result, error_1, pickDialog, result, error_2, result, error_3;
        var _a, _b, _c;
        if (internals === void 0) { internals = {}; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    platform = (_a = internals.platform) !== null && _a !== void 0 ? _a : process.platform;
                    run = (_b = internals.run) !== null && _b !== void 0 ? _b : dsh_native_command_1.runNativeCommand;
                    if (!(platform === 'darwin')) return [3 /*break*/, 4];
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, run('osascript', [
                            '-e', 'set selectedFolder to choose folder with prompt "Select Workspace Directory"',
                            '-e', 'POSIX path of selectedFolder',
                        ], signal)];
                case 2:
                    result = _d.sent();
                    return [2 /*return*/, outputPath(result.stdout)];
                case 3:
                    error_1 = _d.sent();
                    if (!signal.aborted && errorCode(error_1) === 1
                        && /(?:User canceled|-128)/i.test(errorStderr(error_1)))
                        return [2 /*return*/, null];
                    throw error_1;
                case 4:
                    if (!(platform === 'win32')) return [3 /*break*/, 6];
                    pickDialog = (_c = internals.pickWin32Dialog) !== null && _c !== void 0 ? _c : win32_dialog_ts_1.pickWin32Directory;
                    return [4 /*yield*/, pickDialog(signal)];
                case 5: return [2 /*return*/, _d.sent()];
                case 6:
                    if (!(platform === 'linux')) return [3 /*break*/, 13];
                    _d.label = 7;
                case 7:
                    _d.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, run('zenity', [
                            '--file-selection', '--directory', '--title=Select Workspace Directory',
                        ], signal)];
                case 8:
                    result = _d.sent();
                    return [2 /*return*/, outputPath(result.stdout)];
                case 9:
                    error_2 = _d.sent();
                    rethrowIfAborted(signal, error_2);
                    if (errorCode(error_2) === 1)
                        return [2 /*return*/, null];
                    if (!isMissingCommand(error_2))
                        throw error_2;
                    return [3 /*break*/, 10];
                case 10:
                    _d.trys.push([10, 12, , 13]);
                    return [4 /*yield*/, run('kdialog', [
                            '--getexistingdirectory', '.', '--title', 'Select Workspace Directory',
                        ], signal)];
                case 11:
                    result = _d.sent();
                    return [2 /*return*/, outputPath(result.stdout)];
                case 12:
                    error_3 = _d.sent();
                    rethrowIfAborted(signal, error_3);
                    if (errorCode(error_3) === 1)
                        return [2 /*return*/, null];
                    if (isMissingCommand(error_3)) {
                        throw new Error('no supported native directory picker found (install zenity or kdialog)');
                    }
                    throw error_3;
                case 13: throw new Error("native directory picker is unsupported on ".concat(platform));
            }
        });
    });
}
