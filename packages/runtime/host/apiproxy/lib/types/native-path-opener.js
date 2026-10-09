"use strict";
/**
 * Cross-platform native path and text-document openers used by the local GUI
 * carrier.
 *
 * The default intent prefers the default browser for documents it renders when
 * the platform can name one, then falls back to the default application. WSL
 * translates every path for the Windows desktop instead of assuming a Linux
 * GUI. The text-editor intent never consults the browser.
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
exports.canOpenNativePath = canOpenNativePath;
exports.openNativePath = openNativePath;
exports.openNativeTextFile = openNativeTextFile;
var node_os_1 = require("node:os");
var node_path_1 = require("node:path");
var dsh_native_command_1 = require("@z/dsh-native-command");
/** Documents a browser renders, as opposed to ones an editor merely edits. */
var BROWSER_DOCUMENTS = new Set(['.html', '.htm', '.xhtml', '.svg']);
/**
 * The macOS bundle registered for `https` — the default browser, as
 * LaunchServices records it. The nested version dict is stripped first
 * because it carries its own `LSHandlerRoleAll`.
 */
function macBundleForHttps(plist) {
    var _a, _b;
    var stripped = plist.replace(/LSHandlerPreferredVersions\s*=\s*\{[^}]*\};/g, '');
    var block = (_a = /\{[^{}]*LSHandlerURLScheme\s*=\s*"?https"?;[^{}]*\}/.exec(stripped)) === null || _a === void 0 ? void 0 : _a[0];
    if (block === undefined)
        return undefined;
    return (_b = /LSHandlerRoleAll\s*=\s*"?([\w.-]+)"?;/.exec(block)) === null || _b === void 0 ? void 0 : _b[1];
}
/**
 * Open one browser-renderable document with the default browser.
 * @returns true when a browser took it; false when this platform cannot name
 * one, or naming it failed — the caller then uses the default application.
 */
function openInBrowser(path, signal, platform, run, env) {
    return __awaiter(this, void 0, void 0, function () {
        var bundle, stdout, _a, browser;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(platform === 'darwin')) return [3 /*break*/, 6];
                    bundle = void 0;
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, run('defaults', ['read', 'com.apple.LaunchServices/com.apple.launchservices.secure'], signal)];
                case 2:
                    stdout = (_b.sent()).stdout;
                    bundle = macBundleForHttps(stdout);
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    // No LaunchServices record (a fresh account never changed a default):
                    // the content-type handler is then the system's own choice anyway.
                    return [2 /*return*/, false];
                case 4:
                    if (bundle === undefined)
                        return [2 /*return*/, false];
                    return [4 /*yield*/, run('open', ['-b', bundle, path], signal)];
                case 5:
                    _b.sent();
                    return [2 /*return*/, true];
                case 6:
                    if (!(platform === 'linux')) return [3 /*break*/, 8];
                    browser = env.BROWSER;
                    if (browser === undefined || browser === '')
                        return [2 /*return*/, false];
                    return [4 /*yield*/, run(browser, [path], signal)];
                case 7:
                    _b.sent();
                    return [2 /*return*/, true];
                case 8: 
                // Windows names no browser without reading the UserChoice registry, and its
                // .html association is the browser in the ordinary case.
                return [2 /*return*/, false];
            }
        });
    });
}
/** PowerShell single-quoted literal (doubles embedded quotes). */
function powershellLiteral(path) {
    return "'".concat(path.replace(/'/g, "''"), "'");
}
/** Whether one environment marker is set to a non-empty value. */
function present(value) {
    return value !== undefined && value !== '';
}
/** Distinguish WSL from desktop Linux using its process and kernel markers. */
function isWsl(internals) {
    var _a, _b;
    var env = (_a = internals.env) !== null && _a !== void 0 ? _a : process.env;
    if (present(env.WSL_DISTRO_NAME) || present(env.WSL_INTEROP))
        return true;
    return ((_b = internals.osRelease) !== null && _b !== void 0 ? _b : (0, node_os_1.release)()).toLowerCase().includes('microsoft');
}
/** Open one Windows-resolvable path through its registered desktop application. */
function openWindowsPath(path, signal, run) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, run('powershell.exe', [
                        '-NoProfile',
                        '-Command',
                        "Invoke-Item -LiteralPath ".concat(powershellLiteral(path)),
                    ], signal)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/** Translate a WSL path before handing it to the Windows desktop. */
function openWslPath(path, signal, run) {
    return __awaiter(this, void 0, void 0, function () {
        var translated, windowsPath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, run('wslpath', ['-w', path], signal)];
                case 1:
                    translated = _a.sent();
                    signal.throwIfAborted();
                    windowsPath = translated.stdout.replace(/[\r\n]+$/, '');
                    if (windowsPath === '')
                        throw new Error('wslpath returned no Windows path');
                    return [4 /*yield*/, openWindowsPath(windowsPath, signal, run)];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/** Dispatch one shell-free platform command for the requested open intent. */
function openNativePathWithIntent(path_1, signal_1, intent_1) {
    return __awaiter(this, arguments, void 0, function (path, signal, intent, internals) {
        var platform, run, env, wsl, _a;
        var _b, _c, _d;
        if (internals === void 0) { internals = {}; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    platform = (_b = internals.platform) !== null && _b !== void 0 ? _b : process.platform;
                    run = (_c = internals.run) !== null && _c !== void 0 ? _c : dsh_native_command_1.runNativeCommand;
                    env = (_d = internals.env) !== null && _d !== void 0 ? _d : process.env;
                    wsl = platform === 'linux' && isWsl(internals);
                    _a = !wsl && intent === 'default' && BROWSER_DOCUMENTS.has((0, node_path_1.extname)(path).toLowerCase());
                    if (!_a) return [3 /*break*/, 2];
                    return [4 /*yield*/, openInBrowser(path, signal, platform, run, env)];
                case 1:
                    _a = (_e.sent());
                    _e.label = 2;
                case 2:
                    if (_a)
                        return [2 /*return*/];
                    if (!(platform === 'darwin')) return [3 /*break*/, 4];
                    return [4 /*yield*/, run('open', intent === 'text-editor' ? ['-t', path] : [path], signal)];
                case 3:
                    _e.sent();
                    return [2 /*return*/];
                case 4:
                    if (!(platform === 'win32')) return [3 /*break*/, 6];
                    return [4 /*yield*/, openWindowsPath(path, signal, run)];
                case 5:
                    _e.sent();
                    return [2 /*return*/];
                case 6:
                    if (!(platform === 'linux')) return [3 /*break*/, 10];
                    if (!wsl) return [3 /*break*/, 8];
                    return [4 /*yield*/, openWslPath(path, signal, run)];
                case 7:
                    _e.sent();
                    return [2 /*return*/];
                case 8: return [4 /*yield*/, run('xdg-open', [path], signal)];
                case 9:
                    _e.sent();
                    return [2 /*return*/];
                case 10: throw new Error("native path opener is unsupported on ".concat(platform));
            }
        });
    });
}
/**
 * Whether {@link openNativePath} plausibly reaches a desktop on this host.
 *
 * macOS and Windows always carry a desktop opener; Linux does when it is WSL
 * (the Windows desktop takes the path) or a display server is announced.
 * A headless or containerised Linux host answers false, which is what lets a
 * surface show a path as text instead of offering a button that would spawn
 * `xdg-open` into nothing.
 * @param internals - platform and environment seam for deterministic tests.
 * @returns true when handing a path to the native opener can work at all.
 */
function canOpenNativePath(internals) {
    var _a, _b;
    if (internals === void 0) { internals = {}; }
    var platform = (_a = internals.platform) !== null && _a !== void 0 ? _a : process.platform;
    if (platform === 'darwin' || platform === 'win32')
        return true;
    if (platform !== 'linux')
        return false;
    var env = (_b = internals.env) !== null && _b !== void 0 ? _b : process.env;
    return isWsl(internals) || present(env.DISPLAY) || present(env.WAYLAND_DISPLAY);
}
/**
 * Open a filesystem path with the operating system's default application, or
 * with the default browser when the path names a document a browser renders.
 * @param path - absolute or host-resolvable path (caller owns resolution).
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform, environment, and runner hooks for deterministic tests.
 */
function openNativePath(path, signal, internals) {
    if (internals === void 0) { internals = {}; }
    return openNativePathWithIntent(path, signal, 'default', internals);
}
/**
 * Open a text document for editing; macOS bypasses the file-type association
 * so a YAML association with a browser cannot consume the gesture.
 * @param path - absolute or host-resolvable text-document path.
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform and runner hooks for deterministic tests.
 */
function openNativeTextFile(path, signal, internals) {
    if (internals === void 0) { internals = {}; }
    return openNativePathWithIntent(path, signal, 'text-editor', internals);
}
