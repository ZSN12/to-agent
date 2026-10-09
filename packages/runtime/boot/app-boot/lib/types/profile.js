"use strict";
/**
 * Profile discovery, initialization, and patch-layer composition for the
 * `dsh --profile` launcher family.
 *
 * A profile is a directory under `$DSH_HOME/profiles/<name>` holding a
 * `package.json` (out-of-tree plugin dependencies plus the profile manifest
 * `dsh.profile` with its ordered `bundles` list) and a `cordis.patch.yml`
 * (the user's own patch layer, applied after every bundle layer). Bundles are
 * npm packages whose manifest declares
 * `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`; the tree is
 * composed by applying each bundle's patch list in `dsh.profile.bundles` order over
 * an empty entry list, then the profile's own patches, then any launcher
 * layers (`--patch` files and flag-derived patches).
 *
 * Module resolution is two-anchor by construction: a bundle name resolves
 * first from the dsh installation (the launcher's own package), then from the
 * profile directory. The Loader's `baseUrl` is the profile directory, whose
 * `node_modules` pnpm manages for out-of-tree plugins, while the maintained
 * flat fallback directory `$DSH_HOME/profiles/node_modules` (one symlink per
 * package the installation's app and bundles depend on) makes every in-box
 * plugin Node-resolvable from any profile through the ordinary parent-walk.
 * @module @z/dsh-app-boot/profile
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
exports.DEFAULT_PROFILE_BUNDLES = exports.PROFILE_TEMPLATES = exports.PROFILE_PATCH_FILENAME = exports.PROFILES_DIR = void 0;
exports.resolveProfileDir = resolveProfileDir;
exports.initProfile = initProfile;
exports.healProfilesModuleFallback = healProfilesModuleFallback;
exports.readProfileManifest = readProfileManifest;
exports.writeProfileManifest = writeProfileManifest;
exports.resolveBundleDir = resolveBundleDir;
exports.loadProfile = loadProfile;
exports.composeEntries = composeEntries;
var node_module_1 = require("node:module");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var cordis_plugin_include_1 = require("@z/cordis-plugin-include");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var index_ts_1 = require("./index.ts");
/** Directory under the Harness home holding every profile. */
exports.PROFILES_DIR = 'profiles';
/** The user patch layer inside a profile directory (hot-reloaded on long-lived surfaces). */
exports.PROFILE_PATCH_FILENAME = 'cordis.patch.yml';
/**
 * Resolve a profile's directory under the Harness home.
 * @param name - the profile name (`dsh --profile <name>`).
 * @param home - the Harness home; defaults to {@link resolveDshHome}.
 * @returns the absolute profile directory (which may not exist yet).
 */
function resolveProfileDir(name, home) {
    if (home === void 0) { home = (0, dsh_home_paths_1.resolveDshHome)(); }
    if (name === '' || name.includes('/') || name.includes('\\') || name === '.' || name === '..'
        // The launcher-maintained flat module fallback lives at this sibling path.
        || name === 'node_modules') {
        throw new Error("dsh: invalid profile name ".concat(JSON.stringify(name)));
    }
    return (0, node_path_1.join)(home, exports.PROFILES_DIR, name);
}
/** The shipped profile templates auto-initialized on first use, by name. */
exports.PROFILE_TEMPLATES = {
    web: ['@z/dsh-base', '@z/dsh-taskweaver'],
};
/** Installation-owned bundle tuples normalized to the shipped template. */
var INSTALLATION_OWNED_PROFILE_TUPLES = {
    web: ['@z/dsh-base', '@z/dsh-taskweaver'],
};
/** The bundle list a `dsh plugin` init uses for a name with no shipped template. */
exports.DEFAULT_PROFILE_BUNDLES = ['@z/dsh-base'];
var PROFILE_PATCH_TEMPLATE = "# Your patch layer for this dsh profile, applied after every bundle layer:\n# a top-level YAML array of loader patch entries (id-targeted config\n# overrides, disables, and insert lists; `!!js` expressions allowed).\n[]\n";
// The hoisted linker gives out-of-tree plugins a flat node_modules whose
// missing peers (cordis and friends) fall through to the healed
// profiles/node_modules installation fallback, so every plugin shares the
// installation's single cordis instance instead of a duplicate. pnpm ≥10
// reads its settings from pnpm-workspace.yaml, not .npmrc.
var PROFILE_PNPM_WORKSPACE = "packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n";
/**
 * Initialize a profile directory: manifest, empty user patch layer, and the
 * pnpm settings out-of-tree plugins need. Existing files are never touched,
 * so re-running is a no-op on an initialized profile.
 * @param dir - the profile directory from {@link resolveProfileDir}.
 * @param bundles - the initial `dsh.profile.bundles` layer list.
 */
function initProfile(dir, bundles) {
    (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    var manifestPath = (0, node_path_1.join)(dir, 'package.json');
    if (!(0, node_fs_1.existsSync)(manifestPath)) {
        var manifest = {
            name: "dsh-profile-".concat((0, node_path_1.basename)(dir)),
            private: true,
            dependencies: {},
            dsh: { profile: { bundles: __spreadArray([], bundles, true) } },
        };
        (0, node_fs_1.writeFileSync)(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n');
    }
    var patchPath = (0, node_path_1.join)(dir, exports.PROFILE_PATCH_FILENAME);
    if (!(0, node_fs_1.existsSync)(patchPath))
        (0, node_fs_1.writeFileSync)(patchPath, PROFILE_PATCH_TEMPLATE);
    var workspacePath = (0, node_path_1.join)(dir, 'pnpm-workspace.yaml');
    if (!(0, node_fs_1.existsSync)(workspacePath))
        (0, node_fs_1.writeFileSync)(workspacePath, PROFILE_PNPM_WORKSPACE);
}
/** Ensure `link` is a symlink to `target`, replacing a wrong or dangling link; a real directory throws. */
function ensureSymlink(link, target) {
    var stat;
    try {
        stat = (0, node_fs_1.lstatSync)(link);
    }
    catch (_a) {
        // Missing link (first run) — created below. Any other lstat failure on a
        // path we just created the parent of would resurface on symlinkSync.
        stat = undefined;
    }
    if (stat !== undefined) {
        if (!stat.isSymbolicLink()) {
            throw new Error("dsh: ".concat(link, " exists and is not a symlink; remove it so dsh can manage the installation fallback"));
        }
        if ((0, node_fs_1.readlinkSync)(link) === target)
            return;
        // unlink deletes the reparse point itself on Windows too; rmSync treats a
        // junction as a directory and throws EISDIR unless recursive.
        (0, node_fs_1.unlinkSync)(link);
    }
    try {
        (0, node_fs_1.symlinkSync)(target, link, 'junction');
    }
    catch (error) {
        // Concurrent launches heal the same fallback; losing the race to a
        // process writing the identical link is success, anything else is not.
        // The window between the lstat miss above and this write cannot be
        // staged deterministically from the public API.
        /* v8 ignore next 4 */
        if (error.code !== 'EEXIST'
            || !(0, node_fs_1.lstatSync)(link).isSymbolicLink() || (0, node_fs_1.readlinkSync)(link) !== target) {
            throw error;
        }
    }
}
/**
 * Maintain the flat module fallback `$DSH_HOME/profiles/node_modules`: one
 * symlink per package in the dsh app's resolvable dependency CLOSURE (BFS
 * over `dependencies` from the app manifest), each resolved from its own
 * real location. Node's parent-directory walk from any profile finds this
 * directory after the profile's own `node_modules`, so every in-box plugin
 * resolves without pnpm ever managing it — the exact "bundles come from the
 * installation" contract. The closure (not just direct dependencies) is
 * required for out-of-tree plugins: their peer dependencies name Service
 * Definition packages (`dsh-compaction`, `dsh-invariants`, ...) that the app
 * reaches only through its Service Provider packages. Symlinked packages
 * resolve their own dependencies from their real directories (Node's default
 * symlink-following), so each package needs only its one flat link.
 * Idempotent: correct links are kept and moved installations are
 * re-pointed; a stale link to a vanished package stays until its name is
 * reused (dangling links are invisible to resolution).
 * @param installAnchor - absolute path of the dsh app's package.json.
 * @param home - the Harness home; defaults to {@link resolveDshHome}.
 */
function healProfilesModuleFallback(installAnchor, home) {
    var _a, _b;
    if (home === void 0) { home = (0, dsh_home_paths_1.resolveDshHome)(); }
    var profilesDir = (0, node_path_1.join)(home, exports.PROFILES_DIR);
    var modulesDir = (0, node_path_1.join)(profilesDir, 'node_modules');
    (0, node_fs_1.mkdirSync)(modulesDir, { recursive: true });
    var appManifest = JSON.parse((0, node_fs_1.readFileSync)(installAnchor, 'utf8'));
    var links = new Map();
    /* v8 ignore next -- a real app manifest always declares its name */
    if (appManifest.name !== undefined)
        links.set(appManifest.name, (0, node_path_1.dirname)(installAnchor));
    // BFS over the resolvable dependency graph; the visited set is the link
    // map itself (first resolution wins, matching Node's own nearest-wins).
    var queue = [{ anchor: installAnchor, manifest: appManifest }];
    for (var next = queue.shift(); next !== undefined; next = queue.shift()) {
        // Peer dependencies participate: Service Definition packages (dsh-subprocess,
        // dsh-compaction, ...) are peers of their implementations, never plain
        // dependencies, yet out-of-tree plugins import them directly.
        /* v8 ignore next -- a real app manifest always declares dependencies */
        for (var _i = 0, _c = __spreadArray(__spreadArray([], Object.keys((_a = next.manifest.dependencies) !== null && _a !== void 0 ? _a : {}), true), Object.keys((_b = next.manifest.peerDependencies) !== null && _b !== void 0 ? _b : {}), true); _i < _c.length; _i++) {
            var dep = _c[_i];
            if (links.has(dep))
                continue;
            var dir = packageDirFromAnchor(next.anchor, dep);
            // A declared-but-uninstalled dependency cannot be a loader-visible
            // plugin; skip it rather than fail the whole boot.
            if (dir === undefined)
                continue;
            links.set(dep, dir);
            var manifestPath = (0, node_path_1.join)(dir, 'package.json');
            queue.push({ anchor: manifestPath, manifest: JSON.parse((0, node_fs_1.readFileSync)(manifestPath, 'utf8')) });
        }
    }
    for (var _d = 0, links_1 = links; _d < links_1.length; _d++) {
        var _e = links_1[_d], packageName = _e[0], target = _e[1];
        var link = (0, node_path_1.join)(modulesDir, packageName);
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(link), { recursive: true });
        ensureSymlink(link, target);
    }
}
/**
 * Read a profile's manifest.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param dir - the profile directory.
 * @returns the parsed manifest.
 */
function readProfileManifest(binName, dir) {
    var path = (0, node_path_1.join)(dir, 'package.json');
    var raw;
    try {
        raw = (0, node_fs_1.readFileSync)(path, 'utf8');
    }
    catch (error) {
        throw new Error("".concat(binName, ": failed to read profile manifest ").concat(path, ": ").concat(String(error)));
    }
    // The field checks below validate the file data before trusting the parse type.
    var parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error("".concat(binName, ": profile manifest ").concat(path, " must hold a JSON object"));
    }
    return parsed;
}
/**
 * Write a profile's manifest back (2-space JSON, trailing newline).
 * @param dir - the profile directory.
 * @param manifest - the manifest value to persist.
 */
function writeProfileManifest(dir, manifest) {
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(dir, 'package.json'), JSON.stringify(manifest, undefined, 2) + '\n');
}
/** Return whether two bundle lists have the same values in the same order. */
function sameBundles(left, right) {
    return left.length === right.length && left.every(function (value, index) { return value === right[index]; });
}
/**
 * Normalize an exact installation-owned bundle tuple to its shipped template
 * while preserving every other manifest field. Any other list is user-owned.
 */
function normalizeShippedProfile(name, dir, manifest) {
    var _a, _b, _c, _d;
    var installationOwned = INSTALLATION_OWNED_PROFILE_TUPLES[name];
    var current = exports.PROFILE_TEMPLATES[name];
    var bundles = (_b = (_a = manifest.dsh) === null || _a === void 0 ? void 0 : _a.profile) === null || _b === void 0 ? void 0 : _b.bundles;
    var retiredWebSurface = name === 'web'
        && (bundles === null || bundles === void 0 ? void 0 : bundles.length) === 2
        && bundles[0] === '@z/dsh-base'
        && ((_c = bundles[1]) === null || _c === void 0 ? void 0 : _c.split('/').at(-1)) === 'web-app';
    if (installationOwned === undefined || current === undefined || bundles === undefined
        || (!sameBundles(bundles, installationOwned) && !retiredWebSurface))
        return manifest;
    var normalized = __assign(__assign({}, manifest), { dsh: __assign(__assign({}, manifest.dsh), { profile: __assign(__assign({}, (_d = manifest.dsh) === null || _d === void 0 ? void 0 : _d.profile), { bundles: __spreadArray([], current, true) }) }) });
    writeProfileManifest(dir, normalized);
    return normalized;
}
/**
 * Resolve a package's root directory from one anchor without depending on the
 * package exporting `./package.json` (`require.resolve` would need that):
 * probe the require resolution paths for a directory holding the named
 * manifest. This is Node's own node_modules lookup order, so the result
 * matches what the Loader would import from the same anchor, and
 * `existsSync` follows the symlinks pnpm's isolated layout uses.
 */
function packageDirFromAnchor(anchor, packageName) {
    var _a;
    // resolve.paths returns null only for builtins, which no bundle name is.
    /* v8 ignore next */
    for (var _i = 0, _b = (_a = (0, node_module_1.createRequire)(anchor).resolve.paths(packageName)) !== null && _a !== void 0 ? _a : []; _i < _b.length; _i++) {
        var searchPath = _b[_i];
        var candidate = (0, node_path_1.join)(searchPath, packageName);
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(candidate, 'package.json')))
            return candidate;
    }
    return undefined;
}
/**
 * Resolve one bundle package's directory: installation anchor first, then the
 * profile directory. The installation-first order is the contract that
 * `@z/dsh-base` (and every other in-box bundle) always comes from
 * the same installation as the running dsh, never from a profile-local copy.
 * Resolution does not require the package to export `./package.json`.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param packageName - the bundle's package name from `dsh.profile.bundles`.
 * @param installAnchor - absolute path of a file inside the dsh app package (its package.json).
 * @param profileDir - the profile directory (second anchor).
 * @returns the bundle package's absolute directory.
 */
function resolveBundleDir(binName, packageName, installAnchor, profileDir) {
    for (var _i = 0, _a = [installAnchor, (0, node_path_1.join)(profileDir, 'package.json')]; _i < _a.length; _i++) {
        var anchor = _a[_i];
        var dir = packageDirFromAnchor(anchor, packageName);
        if (dir !== undefined)
            return dir;
    }
    throw new Error("".concat(binName, ": cannot resolve profile bundle ").concat(JSON.stringify(packageName), " from the dsh installation or ").concat(profileDir, "; ")
        + "run 'dsh plugin --profile ".concat((0, node_path_1.basename)(profileDir), " install' if its dependency is not installed"));
}
/**
 * Load a profile: resolve every `dsh.profile.bundles` entry to its patch
 * layer and parse the profile's own patch file. A listed bundle without a
 * `dsh.bundle` manifest fails loud — naming a bundle-less package as a layer
 * is a misconfiguration, not "no patches".
 * @param binName - the diagnostic prefix on thrown errors.
 * @param name - the profile name.
 * @param installAnchor - absolute path of the dsh app's package.json (first resolution anchor).
 * @param home - the Harness home; defaults to {@link resolveDshHome}.
 * @param options - `userLayer: false` skips reading `cordis.patch.yml`, so a
 * bundles-only consumer (`--dump-default-config`, a recovery diagnostic)
 * cannot fail on a broken user layer.
 * @returns the loaded profile (empty `patches` when the user layer is skipped).
 */
function loadProfile(binName, name, installAnchor, home, options) {
    var _a, _b, _c;
    if (home === void 0) { home = (0, dsh_home_paths_1.resolveDshHome)(); }
    if (options === void 0) { options = {}; }
    var dir = resolveProfileDir(name, home);
    if (!(0, node_fs_1.existsSync)((0, node_path_1.join)(dir, 'package.json'))) {
        var template = exports.PROFILE_TEMPLATES[name];
        if (template === undefined) {
            throw new Error("".concat(binName, ": profile ").concat(JSON.stringify(name), " does not exist; create it with 'dsh plugin --profile ").concat(name, " add <package>'"));
        }
        initProfile(dir, template);
    }
    var manifest = normalizeShippedProfile(name, dir, readProfileManifest(binName, dir));
    // A hand-written profile manifest may omit the dsh section entirely.
    var bundles = (_c = (_b = (_a = manifest.dsh) === null || _a === void 0 ? void 0 : _a.profile) === null || _b === void 0 ? void 0 : _b.bundles) !== null && _c !== void 0 ? _c : [];
    var layers = bundles.map(function (packageName) {
        var _a, _b;
        var packageDir = resolveBundleDir(binName, packageName, installAnchor, dir);
        var bundleManifest = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(packageDir, 'package.json'), 'utf8'));
        var declared = (_b = (_a = bundleManifest.dsh) === null || _a === void 0 ? void 0 : _a.bundle) === null || _b === void 0 ? void 0 : _b.patch;
        if (declared === undefined) {
            throw new Error("".concat(binName, ": profile bundle ").concat(JSON.stringify(packageName), " declares no dsh.bundle in its package.json"));
        }
        var patchPath = (0, node_path_1.join)(packageDir, declared);
        return { packageName: packageName, packageDir: packageDir, patchPath: patchPath, patches: (0, index_ts_1.loadOverlayPatches)(binName, patchPath) };
    });
    var patchPath = (0, node_path_1.join)(dir, exports.PROFILE_PATCH_FILENAME);
    var patches = options.userLayer !== false && (0, node_fs_1.existsSync)(patchPath)
        ? (0, index_ts_1.loadOverlayPatches)(binName, patchPath)
        : [];
    return { name: name, dir: dir, layers: layers, patchPath: patchPath, patches: patches };
}
/**
 * Compose patch layers into the effective entry list over an empty root —
 * the same single `applyEntryPatches` call the boot include makes, so flag
 * derivation and config dumps see exactly what mounts.
 * @param layers - patch lists in application order.
 * @param warn - sink for skipped-patch diagnostics; defaults to silent (boot repeats them).
 * @returns the composed entry list.
 */
function composeEntries(layers, warn) {
    if (warn === void 0) { warn = function () { }; }
    return (0, cordis_plugin_include_1.applyEntryPatches)([], structuredClone(layers.flat()), function (message) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        var index = 0;
        warn(message.replace(/%C/g, function () { return JSON.stringify(args[index++]); }));
    });
}
