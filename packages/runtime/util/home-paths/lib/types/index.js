"use strict";
/**
 * Shared filesystem path helpers for DeepSeek Harness user data.
 *
 * @module @z/dsh-home-paths
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
exports.DSH_TASKWEAVER_EMBEDDED_ENV = exports.Z_TASKWEAVER_EMBEDDED_ENV = exports.Z_HOME_ENV = exports.DSH_HOME_ENV = exports.DEFAULT_DSH_HOME_DISPLAY = exports.DSH_HOME_DIR_NAME = void 0;
exports.taskweaverEmbeddedFromEnv = taskweaverEmbeddedFromEnv;
exports.canonicalizeWatchPath = canonicalizeWatchPath;
exports.defaultDshHome = defaultDshHome;
exports.expandHomePath = expandHomePath;
exports.resolveDshHome = resolveDshHome;
exports.dshHomePath = dshHomePath;
exports.dshHomeDisplay = dshHomeDisplay;
var promises_1 = require("node:fs/promises");
var node_os_1 = require("node:os");
var node_path_1 = require("node:path");
/** Directory name for the default DeepSeek Harness home under the OS home. */
exports.DSH_HOME_DIR_NAME = '.dsh';
/** Stable user-facing display form for the default DeepSeek Harness home. */
exports.DEFAULT_DSH_HOME_DISPLAY = "~/".concat(exports.DSH_HOME_DIR_NAME);
/** Environment variable that overrides the default DeepSeek Harness home. */
exports.DSH_HOME_ENV = 'DSH_HOME';
/** TaskWeaver / Z runtime home (`Z_HOME` wins over `DSH_HOME` when both are set). */
exports.Z_HOME_ENV = 'Z_HOME';
/** Embedded TaskWeaver host (Electron owns UI); non-empty value opts in. */
exports.Z_TASKWEAVER_EMBEDDED_ENV = 'Z_TASKWEAVER_EMBEDDED';
/** Legacy embedded flag; read after {@link Z_TASKWEAVER_EMBEDDED_ENV}. */
exports.DSH_TASKWEAVER_EMBEDDED_ENV = 'DSH_TASKWEAVER_EMBEDDED';
function nonBlankEnv(env, key) {
    var value = env[key];
    if (value === undefined || value.trim().length === 0)
        return undefined;
    return value;
}
/** Whether this process runs as TaskWeaver's embedded Z host (`Z_*` then `DSH_*`). */
function taskweaverEmbeddedFromEnv(env) {
    if (env === void 0) { env = process.env; }
    return nonBlankEnv(env, exports.Z_TASKWEAVER_EMBEDDED_ENV) !== undefined
        || nonBlankEnv(env, exports.DSH_TASKWEAVER_EMBEDDED_ENV) !== undefined;
}
/**
 * Give a native filesystem watcher one canonical spelling of a path, even
 * when its final components do not exist yet. The deepest existing ancestor
 * is resolved through {@link realpath}; when a suffix is missing, that
 * ancestor is also proved to be an enumerable directory before the suffix is
 * restored. This prevents Windows from treating a regular-file ancestor as
 * ordinary absence, and prevents short-name aliases from being mixed with
 * long paths emitted by the native watcher backend.
 * @param path - Watch target or root, resolved against the current directory.
 * @returns the target with its existing ancestor canonicalized.
 * @throws when ancestor traversal encounters an error other than absence, or
 * the existing ancestor of a missing suffix is not an enumerable directory.
 */
function canonicalizeWatchPath(path) {
    return __awaiter(this, void 0, void 0, function () {
        var current, missing, canonical, directory, error_1, parent_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    current = (0, node_path_1.resolve)(path);
                    missing = [];
                    _a.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 9];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 7, , 8]);
                    return [4 /*yield*/, (0, promises_1.realpath)(current)];
                case 3:
                    canonical = _a.sent();
                    if (!(missing.length > 0)) return [3 /*break*/, 6];
                    return [4 /*yield*/, (0, promises_1.opendir)(canonical)];
                case 4:
                    directory = _a.sent();
                    return [4 /*yield*/, directory.close()];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6: return [2 /*return*/, node_path_1.join.apply(void 0, __spreadArray([canonical], missing.reverse(), false))];
                case 7:
                    error_1 = _a.sent();
                    if (error_1.code !== 'ENOENT')
                        throw error_1;
                    parent_1 = (0, node_path_1.dirname)(current);
                    /* v8 ignore next -- a filesystem root exists, so traversal resolves before this guard */
                    if (parent_1 === current)
                        throw error_1;
                    missing.push((0, node_path_1.basename)(current));
                    current = parent_1;
                    return [3 /*break*/, 8];
                case 8: return [3 /*break*/, 1];
                case 9: return [2 /*return*/];
            }
        });
    });
}
/**
 * Resolve the default DeepSeek Harness home using Node's platform path rules.
 * @returns the absolute default harness home path.
 */
function defaultDshHome() {
    return (0, node_path_1.join)((0, node_os_1.homedir)(), exports.DSH_HOME_DIR_NAME);
}
/**
 * Expand supported tilde prefixes against the operating-system home.
 * @param path - configured path that may begin with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the original value when no supported prefix is present.
 */
function expandHomePath(path) {
    if (path === '~')
        return (0, node_os_1.homedir)();
    if (path.startsWith('~/') || path.startsWith('~\\'))
        return (0, node_path_1.join)((0, node_os_1.homedir)(), path.slice(2));
    return path;
}
/**
 * Resolve the single-root DeepSeek Harness home.
 *
 * Precedence, highest first: an explicit configured path, `$Z_HOME`, `$DSH_HOME`,
 * then `~/.dsh`. The harness keeps all user data under one root. An empty or
 * whitespace-only override is treated as unset, so a blank value never
 * resolves the home to the current working directory.
 * @param configured - explicit harness-home override, which has highest precedence.
 * @param env - environment mapping used to read `Z_HOME` / `DSH_HOME`.
 * @returns the normalized absolute harness home path.
 */
function resolveDshHome(configured, env) {
    var _a, _b;
    if (env === void 0) { env = process.env; }
    var fromZ = nonBlankEnv(env, exports.Z_HOME_ENV);
    var fromDsh = nonBlankEnv(env, exports.DSH_HOME_ENV);
    var selected = (_b = (_a = configured !== null && configured !== void 0 ? configured : fromZ) !== null && _a !== void 0 ? _a : fromDsh) !== null && _b !== void 0 ? _b : defaultDshHome();
    return (0, node_path_1.resolve)(expandHomePath(selected));
}
/**
 * Join path segments onto the resolved DeepSeek Harness home.
 * @param segments - path segments appended to the Harness home; an empty list returns the home itself.
 * @returns the normalized absolute joined path.
 */
function dshHomePath() {
    var segments = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        segments[_i] = arguments[_i];
    }
    return node_path_1.join.apply(void 0, __spreadArray([resolveDshHome()], segments, false));
}
/**
 * Describe a resolved harness home symbolically for user-facing display.
 *
 * It never returns an absolute machine path: the default home is labelled
 * `~/.dsh`, and any configured home is labelled `$DSH_HOME`.
 * @param resolvedHome - the absolute path returned by {@link resolveDshHome}.
 * @returns `~/.dsh` for the default home, otherwise `$DSH_HOME`.
 */
function dshHomeDisplay(resolvedHome) {
    return resolvedHome === (0, node_path_1.resolve)(defaultDshHome()) ? exports.DEFAULT_DSH_HOME_DISPLAY : "$".concat(exports.DSH_HOME_ENV);
}
