"use strict";
/**
 * Shared boot glue for the app bins (`dsh`, `dsh-acp-demo`): load the gitignored
 * `.env`, install the fail-loud Loader guards, resolve the config path (snapshot-aware), load the
 * optional user patch layers from the Harness home (`~/.dsh`), expose its path resolver to
 * config expressions, and drive the Cordis Loader against a leaf `cordis.yml` until the tree settles.
 * @module @z/dsh-app-boot
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
exports.HARNESS_SOURCE_SECTION = exports.FAIL_LOUD_RELEASE_TIMEOUT_MS = exports.writeProfileManifest = exports.resolveProfileDir = exports.resolveBundleDir = exports.readProfileManifest = exports.PROFILES_DIR = exports.PROFILE_TEMPLATES = exports.PROFILE_PATCH_FILENAME = exports.loadProfile = exports.initProfile = exports.healProfilesModuleFallback = exports.DEFAULT_PROFILE_BUNDLES = exports.composeEntries = void 0;
exports.resolveConfigPath = resolveConfigPath;
exports.loadEnv = loadEnv;
exports.loadLayeredEnv = loadLayeredEnv;
exports.watchUserPatches = watchUserPatches;
exports.loadOptionalPatches = loadOptionalPatches;
exports.loadOverlayPatches = loadOverlayPatches;
exports.renderConfigDump = renderConfigDump;
exports.mountRootInclude = mountRootInclude;
exports.installFailLoud = installFailLoud;
exports.assertEntriesLoaded = assertEntriesLoaded;
exports.assertEntriesActivated = assertEntriesActivated;
exports.boot = boot;
exports.addHarnessSourceSection = addHarnessSourceSection;
var node_url_1 = require("node:url");
var node_fs_1 = require("node:fs");
var node_util_1 = require("node:util");
var node_path_1 = require("node:path");
var yaml = require("js-yaml");
var cordis_1 = require("@z/cordis");
var cordis_plugin_loader_1 = require("@z/cordis-plugin-loader");
var cordis_plugin_include_1 = require("@z/cordis-plugin-include");
var cordis_plugin_group_1 = require("@z/cordis-plugin-group");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var dsh_launch_environment_1 = require("@z/dsh-launch-environment");
var profile_ts_1 = require("./profile.ts");
Object.defineProperty(exports, "composeEntries", { enumerable: true, get: function () { return profile_ts_1.composeEntries; } });
Object.defineProperty(exports, "DEFAULT_PROFILE_BUNDLES", { enumerable: true, get: function () { return profile_ts_1.DEFAULT_PROFILE_BUNDLES; } });
Object.defineProperty(exports, "healProfilesModuleFallback", { enumerable: true, get: function () { return profile_ts_1.healProfilesModuleFallback; } });
Object.defineProperty(exports, "initProfile", { enumerable: true, get: function () { return profile_ts_1.initProfile; } });
Object.defineProperty(exports, "loadProfile", { enumerable: true, get: function () { return profile_ts_1.loadProfile; } });
Object.defineProperty(exports, "PROFILE_PATCH_FILENAME", { enumerable: true, get: function () { return profile_ts_1.PROFILE_PATCH_FILENAME; } });
Object.defineProperty(exports, "PROFILE_TEMPLATES", { enumerable: true, get: function () { return profile_ts_1.PROFILE_TEMPLATES; } });
Object.defineProperty(exports, "PROFILES_DIR", { enumerable: true, get: function () { return profile_ts_1.PROFILES_DIR; } });
Object.defineProperty(exports, "readProfileManifest", { enumerable: true, get: function () { return profile_ts_1.readProfileManifest; } });
Object.defineProperty(exports, "resolveBundleDir", { enumerable: true, get: function () { return profile_ts_1.resolveBundleDir; } });
Object.defineProperty(exports, "resolveProfileDir", { enumerable: true, get: function () { return profile_ts_1.resolveProfileDir; } });
Object.defineProperty(exports, "writeProfileManifest", { enumerable: true, get: function () { return profile_ts_1.writeProfileManifest; } });
/**
 * Resolve the config to boot. Replay swaps a `cordis.yml` basename for
 * `cordis.snapshot.yml` in the same directory; every other mode keeps the path.
 * @param configPath - the requested config path (absolute, or relative to `cwd`).
 * @param snapshotMode - the bin's `$DSH_SNAPSHOT` value; only `'replay'` swaps the
 *   basename.
 * @param cwd - the base a relative `configPath` resolves against.
 * @returns the absolute path of the config to boot.
 */
function resolveConfigPath(configPath, snapshotMode, cwd) {
    if (cwd === void 0) { cwd = process.cwd(); }
    var absolute = (0, node_path_1.resolve)(cwd, configPath);
    if (snapshotMode !== 'replay')
        return absolute;
    var dir = (0, node_path_1.dirname)(absolute);
    var replayName = (0, node_path_1.basename)(absolute).replace(/cordis\.ya?ml$/, 'cordis.snapshot.yml');
    return (0, node_path_1.resolve)(dir, replayName);
}
/**
 * Load the optional gitignored `.env` from `dir`. Missing files fall back to the
 * ambient environment; other read failures are reported through `warn`.
 * @param binName - the diagnostic prefix on the warn line.
 * @param dir - the directory whose `.env` to load.
 * @param warn - sink for the one-line misconfiguration diagnostic.
 */
function loadEnv(binName, dir, warn) {
    if (dir === void 0) { dir = process.cwd(); }
    if (warn === void 0) { warn = function (line) { return void process.stderr.write(line); }; }
    try {
        process.loadEnvFile((0, node_path_1.resolve)(dir, '.env'));
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) !== 'ENOENT') {
            warn("".concat(binName, ": failed to load .env: ").concat(String(error), "\n"));
        }
        // ENOENT (no .env) is fine — rely on the ambient environment.
    }
}
/** Exact names no discovered file may set. */
var BOOTSTRAP_NAMES = new Set([
    // Process launch and module resolution.
    'PATH', 'HOME', 'USERPROFILE', 'SHELL',
    'NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS',
    'LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT',
    // Interpreter startup hooks.
    'BASH_ENV', 'ENV', 'SHELLOPTS', 'BASHOPTS',
    'PERL5OPT', 'PERL5LIB', 'PYTHONSTARTUP', 'PYTHONPATH', 'RUBYOPT', 'RUBYLIB',
    'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS',
    'PYTHONHOME',
    // Version-control hooks, config redirects, and ambient command selectors.
    'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_EXTERNAL_DIFF', 'GIT_PAGER', 'GIT_EDITOR',
    'GIT_ASKPASS', 'SSH_ASKPASS',
    'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_COUNT',
    'EDITOR', 'VISUAL', 'PAGER', 'BROWSER',
    // Network reach and trust.
    'DEEPSEEK_BASE_URL', 'DEEPSEEK_SEARCH_BASE_URL',
    'SSL_CERT_FILE', 'SSL_CERT_DIR',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE',
    'NODE_TLS_REJECT_UNAUTHORIZED',
]);
/** Name prefixes no discovered file may set. */
var BOOTSTRAP_PREFIXES = ['DSH_', 'XDG_', 'DYLD_', 'BASH_FUNC_'];
/**
 * Whether a variable may come only from the inherited process environment
 * because it changes process, runtime, VCS, or network bootstrap.
 * @param name - the variable name.
 * @returns true when only the inherited environment may supply it.
 */
function isBootstrapOnly(name) {
    var upper = name.toUpperCase();
    return BOOTSTRAP_NAMES.has(upper) || BOOTSTRAP_PREFIXES.some(function (prefix) { return upper.startsWith(prefix); });
}
/**
 * Parse one directory's `.env` without applying it, rejecting bootstrap-only
 * names before any value is materialized.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param dir - the directory whose `.env` to read.
 * @param warn - sink for the one-line unreadable-file diagnostic.
 * @returns the parsed entries, or `undefined` when the file is absent or unreadable.
 * @throws when the file declares a name {@link isBootstrapOnly} rejects.
 */
function readEnvLayer(binName, dir, warn) {
    var path = (0, node_path_1.resolve)(dir, '.env');
    var content;
    try {
        content = (0, node_fs_1.readFileSync)(path, 'utf8');
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) !== 'ENOENT') {
            warn("".concat(binName, ": failed to load .env: ").concat(String(error), "\n"));
        }
        // ENOENT (no .env) is fine — rely on the ambient environment.
        return undefined;
    }
    // Parse once so validation and materialization use exactly the same entries.
    var values = (0, node_util_1.parseEnv)(content);
    for (var _i = 0, _a = Object.keys(values); _i < _a.length; _i++) {
        var name_1 = _a[_i];
        if (!isBootstrapOnly(name_1))
            continue;
        throw new Error("".concat(binName, ": ").concat(path, " sets \"").concat(name_1, "\", which only the launching environment may set")
            + ' (it decides how this process starts, where its code and instructions load from, or how it'
            + " reaches the network); export ".concat(name_1, " instead of putting it in a .env file"));
    }
    return { path: path, values: values };
}
/**
 * Load the product CLI's inherited > invoking-directory `.env` > Harness-home
 * `.env` snapshot. The Harness home resolves before either file; both files
 * are checked before either is applied, and accepted values are materialized
 * without replacing inherited ones. The snapshot preserves which layer supplied each value.
 * @param binName - the diagnostic prefix on the diagnostics.
 * @param cwd - the invoking directory whose `.env` is the project layer.
 * @param warn - sink for the one-line misconfiguration diagnostics.
 * @returns this run's frozen environment snapshot.
 * @throws when either file declares a bootstrap-only variable.
 */
function loadLayeredEnv(binName, cwd, warn) {
    if (cwd === void 0) { cwd = process.cwd(); }
    if (warn === void 0) { warn = function (line) { return void process.stderr.write(line); }; }
    var home = (0, dsh_home_paths_1.resolveDshHome)();
    var inherited = __assign({}, process.env);
    // Parse both layers first: a rejection must not leave one file applied.
    var project = readEnvLayer(binName, cwd, warn);
    var user = home === (0, node_path_1.resolve)(cwd) ? undefined : readEnvLayer(binName, home, warn);
    // Apply the checked values without replacing a higher-ranked name.
    for (var _i = 0, _a = [project, user]; _i < _a.length; _i++) {
        var layer = _a[_i];
        if (layer === undefined)
            continue;
        for (var _b = 0, _c = Object.entries(layer.values); _b < _c.length; _b++) {
            var _d = _c[_b], name_2 = _d[0], value = _d[1];
            if (process.env[name_2] === undefined)
                process.env[name_2] = value;
        }
    }
    return (0, dsh_launch_environment_1.createLaunchEnvironmentSnapshot)(__spreadArray(__spreadArray([
        { source: 'process', values: inherited }
    ], project === undefined ? [] : [{ source: 'project-env', path: project.path, values: project.values }], true), user === undefined ? [] : [{ source: 'user-env', path: user.path, values: user.values }], true));
}
var bootstrapIncludes = new WeakMap();
// The include's YAML dialect (`!!js` scalars become expression nodes the
// Loader interpolates against each entry's injection-ready context), imported
// from the include itself so patch parsing and config dumping can never drift
// from what the include mounts. User patch layers share it so they may
// reference `process.env`.
var userPatchesSchema = cordis_plugin_include_1.entryListSchema;
/**
 * Watch the user patch layer through Cordis HMR and transactionally reapply it to the boot include.
 * @param ctx - settled app context containing the root Include and an active HMR service.
 * @param options - diagnostic, file, and patch-composition inputs.
 * @returns an asynchronous disposer after the exact-path watcher is ready.
 * @throws when HMR or the root Include is absent, watcher setup fails, or initial path resolution fails.
 */
function watchUserPatches(ctx, options) {
    return __awaiter(this, void 0, void 0, function () {
        var binName, filename, _a, compose, hmr, entry, register, error_1;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    binName = options.binName, filename = options.filename, _a = options.compose, compose = _a === void 0 ? function (patches) { return patches; } : _a;
                    hmr = ctx.get('hmr');
                    if (hmr === undefined)
                        throw new Error("".concat(binName, ": user patch-layer watching requires the Cordis HMR service"));
                    entry = bootstrapIncludes.get(ctx);
                    if (entry === undefined)
                        throw new Error("".concat(binName, ": user patch-layer watching requires the root Include entry"));
                    register = hmr.registerConfig(filename, function () { return __awaiter(_this, void 0, void 0, function () {
                        var _a, _previousPatches, includeConfig, userPatches, patches;
                        var _b;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    _a = entry.options.config, _previousPatches = _a.patches, includeConfig = __rest(_a, ["patches"]);
                                    userPatches = (_b = loadOptionalPatches(binName, filename)) !== null && _b !== void 0 ? _b : [];
                                    patches = compose(userPatches);
                                    return [4 /*yield*/, entry.update({
                                            config: __assign(__assign({}, includeConfig), { patches: patches }),
                                        })];
                                case 1:
                                    _c.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, register];
                case 2: return [2 /*return*/, _b.sent()];
                case 3:
                    error_1 = _b.sent();
                    // A surface can dispose the whole tree while the watcher is still opening;
                    // the HMR effect registration then fails with INACTIVE_EFFECT. That is the
                    // app exiting exactly as asked, not a watch failure, so return a no-op
                    // disposer instead of crashing.
                    if ((error_1 === null || error_1 === void 0 ? void 0 : error_1.code) === 'INACTIVE_EFFECT')
                        return [2 /*return*/, function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                return [2 /*return*/];
                            }); }); }];
                    throw error_1;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Load an optional patch-list file: a top-level YAML array of loader patch
 * entries (`@z/cordis-plugin-include`'s `PatchOptions`): id-targeted config
 * overrides and `insert` lists, with `!!js` expressions allowed. A missing
 * file means "no layer"; an unreadable, unparsable, or non-array file throws —
 * a present patch file that cannot apply is a misconfiguration and must fail
 * loud at boot, never be silently skipped.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param file - absolute path of the patch file.
 * @returns the parsed patches, or `undefined` when the file does not exist.
 */
function loadOptionalPatches(binName, file) {
    var content;
    try {
        content = (0, node_fs_1.readFileSync)(file, 'utf8');
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) === 'ENOENT')
            return undefined;
        throw new Error("".concat(binName, ": failed to read patches ").concat(file, ": ").concat(String(error)));
    }
    return parsePatchList(binName, file, content, 'patches');
}
/**
 * Load a required overlay patch list: a bundle's `cordis.patch.yml` or a
 * `--patch <path>` overlay. Same file format as {@link loadOptionalPatches},
 * but a missing file throws, because the caller named this file — its absence
 * is a misconfiguration, not "no overlay".
 * @param binName - the diagnostic prefix on the thrown error.
 * @param file - absolute path of the overlay file.
 * @returns the parsed patch list.
 */
function loadOverlayPatches(binName, file) {
    var content;
    try {
        content = (0, node_fs_1.readFileSync)(file, 'utf8');
    }
    catch (error) {
        throw new Error("".concat(binName, ": failed to read overlay ").concat(file, ": ").concat(String(error)));
    }
    return parsePatchList(binName, file, content, 'overlay');
}
/**
 * Parse one loader patch list: a top-level YAML array of
 * `@z/cordis-plugin-include` `PatchOptions` (id-targeted config overrides and
 * `insert` lists, `!!js` expressions allowed). Every invalid field or value throws,
 * because a patch file that cannot be applied at all is a misconfiguration; a
 * single patch whose target row is absent stays a per-entry Loader warning, so
 * one overlay shared across surfaces does not have to match every tree.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param file - the source path, quoted in errors.
 * @param content - the file's text.
 * @param label - what to call this list in errors (`patches`, `overlay`).
 * @returns the parsed patch list.
 */
function parsePatchList(binName, file, content, label) {
    if (!content.trim())
        return [];
    var parsed;
    try {
        parsed = yaml.load(content, { schema: userPatchesSchema });
    }
    catch (error) {
        throw new Error("".concat(binName, ": failed to parse ").concat(label, " ").concat(file, ": ").concat(String(error)));
    }
    if (parsed === null || parsed === undefined)
        return [];
    if (!Array.isArray(parsed)) {
        throw new Error("".concat(binName, ": ").concat(label, " ").concat(file, " must be a top-level YAML array of loader patch entries"));
    }
    parsed.forEach(function (entry, index) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            throw new Error("".concat(binName, ": ").concat(label, " entry ").concat(index + 1, " in ").concat(file, " must be a mapping (a loader patch entry)"));
        }
    });
    return parsed;
}
/**
 * Compose the effective entry list exactly as `boot()` would mount it: parse
 * the base config file with the include's entry-list dialect, apply every
 * layer's patches as ONE flattened list through the include's own patch
 * algorithm (`applyEntryPatches`) — the same single call `boot()` makes, so
 * even patch-visibility corner cases (a later layer targeting a group child a
 * plain config replacement introduced, which the single-pass id index never
 * sees) compose identically — then render the result as YAML in the same
 * dialect (`!!js` expressions print verbatim, unevaluated).
 *
 * Every run of rows from the same file and patch layers is preceded by a `# ==` comment
 * naming the file that contributed the rows and any layers that patched them,
 * so the output stays a loadable YAML document while showing which section
 * comes from which file. The file and patch labels are derived from single-call prefix
 * snapshots (base + layers 1..k), diffed positionally: the patch algorithm
 * only rewrites rows in place or appends, so a top-level index identifies one
 * row across snapshots, and a layer whose addition changes the row (config
 * replacement, disable, group insert) is listed as having patched it.
 *
 * A patch that matches no row is reported through `warn` with its layer
 * label, mirroring the Loader's boot-time warning. Earlier layers' patches
 * see an identical preceding state in every snapshot that includes them, so
 * each snapshot's warning list extends the previous one and the new tail
 * belongs to the added layer.
 * @param binName - the diagnostic prefix on read/parse errors.
 * @param absoluteConfigPath - the base config file `boot()` would include.
 * @param layers - overlay layers in application order (later wins).
 * @param warn - sink for skipped-patch diagnostics; defaults to stderr.
 * @returns the composed entry list rendered as a YAML document with
 * source comment separators.
 */
function renderConfigDump(binName, absoluteConfigPath, layers, warn) {
    var _a;
    if (warn === void 0) { warn = function (line) { return void process.stderr.write("".concat(line, "\n")); }; }
    var content;
    try {
        content = (0, node_fs_1.readFileSync)(absoluteConfigPath, 'utf8');
    }
    catch (error) {
        throw new Error("".concat(binName, ": failed to read config ").concat(absoluteConfigPath, ": ").concat(String(error)));
    }
    var parsed;
    try {
        parsed = yaml.load(content, { schema: cordis_plugin_include_1.entryListSchema });
    }
    catch (error) {
        throw new Error("".concat(binName, ": failed to parse config ").concat(absoluteConfigPath, ": ").concat(String(error)));
    }
    if (!Array.isArray(parsed)) {
        throw new Error("".concat(binName, ": config ").concat(absoluteConfigPath, " must be a top-level YAML array of entries"));
    }
    var baseLabel = (0, node_path_1.basename)(absoluteConfigPath);
    // YAML parsing yields untyped rows; the include validates each entry
    // at mount, and the dump prints whatever the file holds, so `EntryOptions`
    // here is structural trust in the same file `boot()` would include.
    var base = parsed;
    // snapshot_k = ONE application of layers 1..k flattened, using the exact
    // arguments boot passes for that prefix. snapshot_N is the mounted composition.
    // The patches are cloned per call: applyEntryPatches detaches the entry
    // list but pushes `insert` rows by reference from the patch list, so
    // sharing patch objects across snapshot calls would leak a later
    // snapshot's mutations into an earlier one's result.
    var snapshot = function (count, warnings) {
        var flattened = structuredClone(layers.slice(0, count).flatMap(function (layer) { return layer.patches; }));
        return (0, cordis_plugin_include_1.applyEntryPatches)(base, flattened, function (message) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            // The include logs through cordis's printf-style logger (`%C` = code); a
            // dump has no logger, so substitute inline for a plain line.
            var index = 0;
            warnings.push(message.replace(/%C/g, function () { return JSON.stringify(args[index++]); }));
        });
    };
    var previous = base;
    var previousWarnings = [];
    var provenance = base.map(function () { return ({ origin: baseLabel, patchedBy: [] }); });
    var composed = base;
    for (var count = 1; count <= layers.length; count += 1) {
        var layer = layers[count - 1];
        /* v8 ignore next -- count iterates 1..length, so the slot exists */
        if (layer === undefined)
            continue;
        var warnings = [];
        composed = snapshot(count, warnings);
        for (var _i = 0, _b = warnings.slice(previousWarnings.length); _i < _b.length; _i++) {
            var line = _b[_i];
            warn("".concat(binName, ": [").concat(layer.label, "] ").concat(line));
        }
        var before = previous.map(function (entry) { return JSON.stringify(entry); });
        for (var index = 0; index < composed.length; index += 1) {
            if (index >= before.length)
                provenance.push({ origin: layer.label, patchedBy: [] });
            else if (JSON.stringify(composed[index]) !== before[index])
                (_a = provenance[index]) === null || _a === void 0 ? void 0 : _a.patchedBy.push(layer.label);
        }
        previous = composed;
        previousWarnings = warnings;
    }
    return groupedDump(composed, provenance);
}
/** Render the composed rows grouped under one source-and-patches comment per contiguous run. */
function groupedDump(composed, provenance) {
    var lines = [];
    var currentLabel;
    var group = [];
    var flush = function () {
        if (currentLabel === undefined || group.length === 0)
            return;
        lines.push("# == ".concat(currentLabel));
        lines.push(yaml.dump(group, { schema: cordis_plugin_include_1.entryListSchema, noRefs: true }).trimEnd());
        group = [];
    };
    for (var index = 0; index < composed.length; index += 1) {
        var record = provenance[index];
        /* v8 ignore next -- this array is index-aligned with composed by construction */
        if (record === undefined)
            continue;
        var label = record.patchedBy.length === 0
            ? record.origin
            : "".concat(record.origin, ", patched by ").concat(record.patchedBy.join(', '));
        if (label !== currentLabel) {
            flush();
            currentLabel = label;
        }
        group.push(composed[index]);
    }
    flush();
    return lines.join('\n') + '\n';
}
/**
 * Mount and remember the exact root Include entry used by app boot and user patch-layer HMR.
 * @param ctx - context carrying an initialized Loader service.
 * @param absoluteConfigPath - absolute YAML or JSON configuration path.
 * @param patches - initial app and user patches, applied in order.
 * @param bareModuleBaseUrl - optional installed-host base for bare package
 * names; relative names continue to resolve beside the configuration file.
 * @returns the created root Include entry, or `undefined` when a surface
 * disposed the whole tree (taking the Loader service with it) while the
 * transactional create was still settling entry lifecycle.
 */
function mountRootInclude(ctx_1, absoluteConfigPath_1) {
    return __awaiter(this, arguments, void 0, function (ctx, absoluteConfigPath, patches, bareModuleBaseUrl) {
        var includeConfig, rootInclude, includeId, loader, entry;
        if (patches === void 0) { patches = []; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ctx.loader.builtins.include = bareModuleBaseUrl === undefined
                        ? cordis_plugin_include_1.default
                        : /** @class */ (function (_super) {
                            __extends(HostResolvedRootInclude, _super);
                            function HostResolvedRootInclude() {
                                return _super !== null && _super.apply(this, arguments) || this;
                            }
                            HostResolvedRootInclude.prototype.import = function (name, getOuterStack) {
                                var specifier = (0, node_path_1.isAbsolute)(name) ? (0, node_url_1.pathToFileURL)(name).href : name;
                                if (name.startsWith('.') || name.startsWith('cordis:'))
                                    return _super.prototype.import.call(this, specifier, getOuterStack);
                                var internal = this.ctx.loader.internal;
                                /* v8 ignore next -- Node supplies the internal loader; this preserves the
                                   original diagnostic for hypothetical embedders without it. */
                                if (internal === undefined)
                                    return _super.prototype.import.call(this, specifier, getOuterStack);
                                return internal.import(specifier, bareModuleBaseUrl, {});
                            };
                            return HostResolvedRootInclude;
                        }(cordis_plugin_include_1.default));
                    // `cordis:group` alongside it: a group row is how a composition gives one
                    // `isolate` realm to a provider and its consumers together, and an agent
                    // preset living outside this workspace cannot resolve `@z/cordis-plugin-group`
                    // by name. Both builtins load through the ambient module pipeline, so neither
                    // depends on the included tree's own specifier resolution.
                    ctx.loader.builtins.group = cordis_plugin_group_1.default;
                    includeConfig = __assign({ path: (0, node_url_1.pathToFileURL)(absoluteConfigPath).href }, patches.length > 0 ? { patches: __spreadArray([], patches, true) } : {});
                    rootInclude = {
                        id: 'include',
                        name: 'cordis:include',
                        config: includeConfig,
                    };
                    return [4 /*yield*/, ctx.loader.create(rootInclude)];
                case 1:
                    includeId = _a.sent();
                    loader = ctx.get('loader');
                    if (loader === undefined)
                        return [2 /*return*/, undefined];
                    entry = loader.resolve(includeId);
                    bootstrapIncludes.set(ctx, entry);
                    return [2 /*return*/, entry];
            }
        });
    });
}
// Loader rc.5 derives and drops a rejected promise after a fiber fails. Keep
// exact reasons already folded into the boot diagnostic visible through the
// next process rejection checkpoint so the process guard can coalesce them.
var assembledActivationRejections = new Map();
function retainAssembledRejection(reason) {
    var _a;
    assembledActivationRejections.set(reason, ((_a = assembledActivationRejections.get(reason)) !== null && _a !== void 0 ? _a : 0) + 1);
}
function releaseAssembledRejection(reason) {
    var count = assembledActivationRejections.get(reason);
    if (count === undefined || count === 1) {
        assembledActivationRejections.delete(reason);
    }
    else {
        assembledActivationRejections.set(reason, count - 1);
    }
}
function observeLoaderRejectionCheckpoint(reasons) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, reasons_1, reason, _a, reasons_2, reason;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    for (_i = 0, reasons_1 = reasons; _i < reasons_1.length; _i++) {
                        reason = reasons_1[_i];
                        retainAssembledRejection(reason);
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, , 3, 4]);
                    return [4 /*yield*/, new Promise(function (resolve) { return setImmediate(resolve); })];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    for (_a = 0, reasons_2 = reasons; _a < reasons_2.length; _a++) {
                        reason = reasons_2[_a];
                        releaseAssembledRejection(reason);
                    }
                    return [7 /*endfinally*/];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * How long {@link installFailLoud} waits for its `release` hook before exiting
 * anyway. A wedged disposer must delay the fatal exit, never cancel it.
 */
exports.FAIL_LOUD_RELEASE_TIMEOUT_MS = 2000;
/**
 * Install before boot to turn a late unhandled plugin-init rejection into one
 * labelled stderr diagnostic and `exit(1)`. A rejection already included by
 * {@link assertEntriesActivated} is ignored during its process checkpoint;
 * every other rejection remains fatal. Stdout remains untouched for ACP; the
 * returned function removes the handler.
 *
 * The Loader mounts entries concurrently, so a surface that owns the terminal
 * can already hold it when a sibling entry rejects. Exiting straight from the
 * handler would strand raw mode, bracketed paste, and the keyboard protocol on
 * the user's shell, and leave an in-flight terminal query's reply to land as
 * literal text at the next prompt. `release` is the terminal owner's chance to
 * hand it back; it is awaited under {@link FAIL_LOUD_RELEASE_TIMEOUT_MS}, whose
 * timer stays referenced so a never-settling disposer cannot let Node reach an
 * empty event loop and exit 0 instead of failing.
 *
 * The diagnostic is written before the release so a hanging or failing disposer
 * cannot swallow the reason. The handler stays installed while the release runs
 * — removing it would let a second concurrent rejection become uncaught and kill
 * the process mid-teardown, stranding exactly the terminal state this restores —
 * so a latch keeps the first rejection the reported one and lets later
 * rejections (including the release's own) fall through to the pending exit.
 * @param binName - the diagnostic prefix on the fatal-failure line.
 * @param proc - the process slice to register on; tests inject a fake.
 * @param release - optional teardown awaited before exit, used by a
 *   terminal-owning surface to restore the terminal. Its own failure is
 *   swallowed because the pending fatal exit already owns the outcome.
 * @returns the uninstaller that removes the rejection handler.
 */
function installFailLoud(binName, proc, release) {
    var _this = this;
    if (proc === void 0) { proc = process; }
    var exiting = false;
    var handler = function (err) {
        var _a;
        if (assembledActivationRejections.has(err))
            return;
        // A release in flight already owns the exit. Swallow later rejections
        // (teardown's own included) rather than reporting a second failure over the
        // real one or letting Node kill the process before the terminal is back.
        if (exiting)
            return;
        exiting = true;
        proc.stderr.write("".concat(binName, ": fatal load failure: ").concat(err instanceof Error ? (_a = err.stack) !== null && _a !== void 0 ? _a : err.message : String(err), "\n"));
        if (release === undefined) {
            proc.exit(1);
            return;
        }
        void (function () { return __awaiter(_this, void 0, void 0, function () {
            var timer, _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, Promise.race([
                                (function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                    return [2 /*return*/, release()];
                                }); }); })(),
                                new Promise(function (resolve) {
                                    timer = setTimeout(resolve, exports.FAIL_LOUD_RELEASE_TIMEOUT_MS);
                                }),
                            ])];
                    case 1:
                        _b.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        _a = _b.sent();
                        return [3 /*break*/, 3];
                    case 3:
                        clearTimeout(timer);
                        proc.exit(1);
                        return [2 /*return*/];
                }
            });
        }); })();
    };
    var uninstall = function () { return void proc.off('unhandledRejection', handler); };
    proc.on('unhandledRejection', handler);
    return uninstall;
}
/**
 * After the tree settles, reject entries with no fiber and name every plugin
 * whose module failed to resolve. Disabled entries are the only valid
 * fiber-less state.
 * @param ctx - the settled context whose loader entries to audit.
 * @param binName - the diagnostic prefix on the thrown error.
 */
function assertEntriesLoaded(ctx, binName) {
    var failed = __spreadArray([], ctx.loader.entries(), true).filter(function (entry) { return entry.fiber === undefined && !entry.disabled; });
    if (failed.length > 0) {
        var names = failed.map(function (entry) { return entry.options.name; }).join(', ');
        throw new Error("".concat(binName, ": plugin(s) failed to load: ").concat(names, "; Cordis startup failed because these plugin(s) could not be resolved (see the error(s) logged above)"));
    }
}
/**
 * Value mirrors used because Cordis's const enum has no runtime object to import.
 * Keep aligned with `packages/extensions/tool-cordis/src/fiber-state.ts` and
 * `packages/client/web/src/loader-status.ts`.
 */
var FIBER_PENDING = 0;
var FIBER_ACTIVE = 2;
var FIBER_FAILED = 3;
/** Render a thrown plugin value without discarding an Error's original stack. */
function formatActivationError(error) {
    var _a;
    return error instanceof Error ? (_a = error.stack) !== null && _a !== void 0 ? _a : error.message : String(error);
}
/**
 * Reject a settled Loader tree when an enabled entry failed or remains inactive.
 * Plugin failures include the original thrown stack; pending entries name their
 * unresolved services because no plugin error exists for that state. Active
 * entries require no further wait; only failed fibers are awaited to recover
 * their private rejection reason.
 * @param ctx - the settled context whose Loader entries to audit.
 * @param binName - the diagnostic prefix on the thrown error.
 * @returns nothing when every enabled entry is active.
 * @throws after one process rejection checkpoint when an entry failed to
 * import, rejected during activation, or did not become active.
 */
function assertEntriesActivated(ctx, binName) {
    return __awaiter(this, void 0, void 0, function () {
        var failures, rejectionReasons, _loop_1, _i, _a, entry, noun;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    assertEntriesLoaded(ctx, binName);
                    failures = [];
                    rejectionReasons = [];
                    _loop_1 = function (entry) {
                        var fiber, state, error_2, missing, subject;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    fiber = entry.fiber;
                                    if (fiber === undefined || entry.disabled)
                                        return [2 /*return*/, "continue"];
                                    state = fiber.state;
                                    if (state === FIBER_ACTIVE)
                                        return [2 /*return*/, "continue"];
                                    if (!(state === FIBER_FAILED)) return [3 /*break*/, 5];
                                    _c.label = 1;
                                case 1:
                                    _c.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, fiber.await()];
                                case 2:
                                    _c.sent();
                                    return [3 /*break*/, 4];
                                case 3:
                                    error_2 = _c.sent();
                                    rejectionReasons.push(error_2);
                                    failures.push("".concat(entry.options.name, ": ").concat(formatActivationError(error_2)));
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/, "continue"];
                                case 5:
                                    if (state === FIBER_PENDING) {
                                        missing = Object.keys(fiber.inject).filter(function (service) { return fiber.ctx.get(service) === undefined; });
                                        subject = missing.length === 1 ? 'service' : 'services';
                                        failures.push("".concat(entry.options.name, ": pending (waiting for ").concat(subject, ": ").concat(missing.join(', ') || 'unknown', ")"));
                                    }
                                    else {
                                        failures.push("".concat(entry.options.name, ": fiber state ").concat(String(state)));
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, _a = ctx.loader.entries();
                    _b.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 4];
                    entry = _a[_i];
                    return [5 /*yield**/, _loop_1(entry)];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    if (!(failures.length > 0)) return [3 /*break*/, 7];
                    if (!(rejectionReasons.length > 0)) return [3 /*break*/, 6];
                    return [4 /*yield*/, observeLoaderRejectionCheckpoint(rejectionReasons)];
                case 5:
                    _b.sent();
                    _b.label = 6;
                case 6:
                    noun = failures.length === 1 ? 'entry' : 'entries';
                    throw new Error("".concat(binName, ": ").concat(String(failures.length), " ").concat(noun, " did not activate\n").concat(failures.join('\n')));
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * Boot the Loader against `absoluteConfigPath` and return only after the whole
 * tree settles. Relative entry names resolve against the config directory;
 * bare package names resolve there by default or against an explicit
 * `bareModuleBaseUrl` for closed packaged runtimes. The bootstrap include
 * is statically imported and mounted as the `cordis:include` builtin, loading
 * through the ambient module pipeline (vite/tsx/plain ESM). The package build
 * embeds Include while leaving Loader external, so the built include tree and
 * host share one Loader peer. Loader
 * settlement rejects startup failures, which `boot` wraps after disposing the
 * partial context; a missing fiber or never-activating entry is rejected by
 * the final audit, {@link assertEntriesActivated}, which rethrows a plugin's
 * init rejection with its original stack; later unhandled rejections remain
 * covered by {@link installFailLoud}. Built bins need the Loader's native
 * helper for bare plugin specifiers; relative specifiers do not.
 * @param binName - the diagnostic prefix for load-failure errors.
 * @param absoluteConfigPath - the config to include; must already be absolute
 * (see {@link resolveConfigPath}).
 * @param patches - optional overlay patches applied over the included tree
 * (see {@link loadOptionalPatches}); an empty list mounts none.
 * @param prepare - optional host setup run after Loader installation and before any config-tree entry mounts.
 * @param bareModuleBaseUrl - optional installed-host base for bare package
 * names; use it when the host, rather than the configuration project, owns the
 * complete plugin set.
 * @returns the root context once every entry has started, or as soon as a
 * surface disposed the tree while startup was still in flight.
 * @throws a labelled error after disposing the partial context — `host
 * preparation failed` when `prepare` threw before any config-tree entry
 * mounted, `plugin tree failed to load` afterwards.
 */
function boot(binName, absoluteConfigPath, patches, prepare, bareModuleBaseUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var ctx, stage, cause_1, detail, deepest, stack;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    ctx = new cordis_1.Context();
                    stage = 'host preparation failed';
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 7, , 9]);
                    ctx.baseUrl = (0, node_url_1.pathToFileURL)((0, node_path_1.dirname)(absoluteConfigPath)).href + '/';
                    ctx.provide('dshHomePath', dsh_home_paths_1.dshHomePath);
                    return [4 /*yield*/, ctx.plugin(cordis_plugin_loader_1.default)];
                case 2:
                    _c.sent();
                    return [4 /*yield*/, (prepare === null || prepare === void 0 ? void 0 : prepare(ctx))];
                case 3:
                    _c.sent();
                    stage = 'plugin tree failed to load';
                    return [4 /*yield*/, mountRootInclude(ctx, absoluteConfigPath, patches, bareModuleBaseUrl)
                        // A surface can finish and dispose the whole tree while startup is still
                        // in flight, before the last entry settles. The Loader service goes with
                        // it, and the activation audit describes a live tree — reading `ctx.loader`
                        // past this point would throw a TypeError over an app that exited exactly
                        // as asked. Transactional group updates settle
                        // lifecycle inside the mount, so the teardown can land before it returns;
                        // re-check after every await.
                    ];
                case 4:
                    _c.sent();
                    // A surface can finish and dispose the whole tree while startup is still
                    // in flight, before the last entry settles. The Loader service goes with
                    // it, and the activation audit describes a live tree — reading `ctx.loader`
                    // past this point would throw a TypeError over an app that exited exactly
                    // as asked. Transactional group updates settle
                    // lifecycle inside the mount, so the teardown can land before it returns;
                    // re-check after every await.
                    return [4 /*yield*/, ((_a = ctx.get('loader')) === null || _a === void 0 ? void 0 : _a.await())];
                case 5:
                    // A surface can finish and dispose the whole tree while startup is still
                    // in flight, before the last entry settles. The Loader service goes with
                    // it, and the activation audit describes a live tree — reading `ctx.loader`
                    // past this point would throw a TypeError over an app that exited exactly
                    // as asked. Transactional group updates settle
                    // lifecycle inside the mount, so the teardown can land before it returns;
                    // re-check after every await.
                    _c.sent();
                    if (ctx.get('loader') === undefined)
                        return [2 /*return*/, ctx];
                    return [4 /*yield*/, assertEntriesActivated(ctx, binName)];
                case 6:
                    _c.sent();
                    return [2 /*return*/, ctx];
                case 7:
                    cause_1 = _c.sent();
                    // Root-fiber disposal contains cleanup failures per observer (Cordis
                    // fiber.ts hardening) and a repeated call returns the settled single-shot
                    // result, so this await cannot reject and replace `cause`.
                    return [4 /*yield*/, ctx.fiber.dispose()];
                case 8:
                    // Root-fiber disposal contains cleanup failures per observer (Cordis
                    // fiber.ts hardening) and a repeated call returns the settled single-shot
                    // result, so this await cannot reject and replace `cause`.
                    _c.sent();
                    detail = cause_1 instanceof Error ? cause_1.message : String(cause_1);
                    deepest = cause_1;
                    while (deepest instanceof Error && deepest.cause !== undefined)
                        deepest = deepest.cause;
                    stack = deepest instanceof Error && deepest !== cause_1 ? "\n".concat((_b = deepest.stack) !== null && _b !== void 0 ? _b : deepest.message) : '';
                    throw new Error("".concat(binName, ": ").concat(stage, ": ").concat(detail).concat(stack), { cause: cause_1 });
                case 9: return [2 /*return*/];
            }
        });
    });
}
/** Prompt-section name for the harness-source location line an app bin adds after boot. */
exports.HARNESS_SOURCE_SECTION = 'harness:source';
/**
 * Add a global prompt section naming the on-disk harness source checkout while
 * explicitly distinguishing it from the task workspace and current working
 * directory. The self-referential `dsh-tool-cordis` toolset reads and edits this
 * checkout. Call once on the settled boot context ({@link boot}); the section
 * orders just after the harness identity opener (`-100`) and before the deployment
 * persona (`0`). A booted tree with no `systemPrompt` service has no prompt to
 * augment, so this is then a no-op that returns `undefined`. The section is
 * registered against the `systemPrompt` service's fiber, so a dev HMR reload of
 * that plugin drops it until the next boot.
 * @param ctx - the settled boot context whose global system prompt to augment.
 * @param sourceRoot - the absolute path to the harness checkout root.
 * @returns the section disposer, or `undefined` when no `systemPrompt` service is mounted.
 */
function addHarnessSourceSection(ctx, sourceRoot) {
    var systemPrompt = ctx.get('systemPrompt');
    if (systemPrompt === undefined)
        return undefined;
    return systemPrompt.section({
        name: exports.HARNESS_SOURCE_SECTION,
        order: -99,
        text: "The DeepSeek Harness implementation checkout is at ".concat(sourceRoot, ". The checkout location and current working directory are separate values and may differ; never infer the working directory from this path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend DSH itself."),
    });
}
