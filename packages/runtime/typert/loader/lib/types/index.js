"use strict";
/**
 * Typert Loader integration: automatic registration for mounted plugin packages.
 *
 * When a loader entry mounts, this plugin resolves the entry's package.json; a
 * package exporting `./typert` has its host face imported and its
 * `TYPERT` manifest registered into `ctx.typert`, and the registration is
 * withdrawn when the entry unmounts. Explicit `packages` cover plugins nested
 * behind another Loader entry, whose Cordis fibers carry no resolvable package
 * specifier. Packages without the export are skipped silently when discovered
 * from Loader entries; an explicit package or declared artifact that is broken
 * fails loud — aggregated into this plugin's activation throw for existing
 * entries, contained to a logged error per package in steady state.
 *
 * Scanning is incremental per entry name, mirroring the client-modules node
 * half: every cordis `internal/plugin` emission marks the fiber's entry name
 * dirty and a microtask flush reconciles each dirty name against the live
 * loader entries; the activation pass seeds the same dirty set with all
 * current entries. Package verdicts and imported manifests are cached per
 * package name and never expire — plugin-set changes take effect on restart.
 *
 * Manual `ctx.typert.register()` remains available for contributions
 * that do not use a `./typert` artifact (hand-written wire schemas,
 * tests, non-loader compositions).
 *
 * @module @z/dsh-typert-loader
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
exports.Config = exports.inject = exports.name = exports.TYPERT_HOST_EXPORT = void 0;
exports.validateTypertManifest = validateTypertManifest;
exports.apply = apply;
var node_fs_1 = require("node:fs");
var node_module_1 = require("node:module");
var node_path_1 = require("node:path");
var node_url_1 = require("node:url");
var schemastery_1 = require("@z/schemastery");
/** The package.json exports key naming a package's host-face typert artifact. */
exports.TYPERT_HOST_EXPORT = './typert';
/** Cordis plugin name. */
exports.name = 'typert-loader';
/** Services required before registration: the registry this plugin feeds and the Loader it observes. */
exports.inject = ['typert', 'loader'];
/** Validate explicit package names and default to Loader-entry discovery only. */
exports.Config = schemastery_1.default.object({
    packages: schemastery_1.default.array(schemastery_1.default.string().min(1)).default([]),
});
var MEMBER_KINDS = new Set(['property', 'method', 'getter', 'setter', 'call', 'construct', 'index']);
/** Resolve the `./typert` export to a relative path, accepting the string and one-level conditional forms. */
function typertExportOf(pkgName, exportsField) {
    if (typeof exportsField !== 'object' || exportsField === null)
        return undefined;
    var target = exportsField[exports.TYPERT_HOST_EXPORT];
    if (target === undefined)
        return undefined;
    if (typeof target === 'string')
        return target;
    if (typeof target === 'object' && target !== null) {
        var fallback = target.default;
        if (typeof fallback === 'string')
            return fallback;
    }
    throw new Error("typert-loader: ".concat(pkgName, " exports[\"").concat(exports.TYPERT_HOST_EXPORT, "\"] must be a string or an object with a string default"));
}
/**
 * Narrow a dynamically imported typert module's `TYPERT` export to a
 * contribution owned by `pkgName`. This is the module/file boundary: the
 * manifest crosses from a build artifact into the typed registry, so every
 * field is checked and every failure names the package and the defect.
 * @param pkgName - the package whose typert face was imported.
 * @param exported - the module's `TYPERT` export.
 * @returns the validated contribution.
 */
function validateTypertManifest(pkgName, exported) {
    if (typeof exported !== 'object' || exported === null) {
        throw new Error("typert-loader: ".concat(pkgName, " exports \"").concat(exports.TYPERT_HOST_EXPORT, "\" but its module has no TYPERT manifest object"));
    }
    var manifest = exported;
    if (manifest.package !== pkgName) {
        throw new Error("typert-loader: ".concat(pkgName, " TYPERT manifest names package ").concat(JSON.stringify(manifest.package), " \u2014 the manifest must be owned by the package that exports it"));
    }
    if (manifest.face !== 'host') {
        throw new Error("typert-loader: ".concat(pkgName, " exports \"").concat(exports.TYPERT_HOST_EXPORT, "\" but TYPERT.face is not \"host\""));
    }
    if (!Array.isArray(manifest.schemas)) {
        throw new Error("typert-loader: ".concat(pkgName, " TYPERT.schemas must be an array"));
    }
    for (var _i = 0, _a = manifest.schemas; _i < _a.length; _i++) {
        var value = _a[_i];
        if (typeof value !== 'object' || value === null) {
            throw new Error("typert-loader: ".concat(pkgName, " TYPERT.schemas contains a non-object schema"));
        }
        var schema = value;
        requireString(pkgName, schema, 'name', 'schema');
        if (typeof schema.schema !== 'object' || schema.schema === null || !('_zod' in schema.schema)) {
            throw new Error("typert-loader: ".concat(pkgName, " TYPERT schema \"").concat(schema.name, "\" is not a zod v4 schema instance"));
        }
    }
    var model = requireObject(pkgName, manifest.model, 'TYPERT.model');
    var services = requireArray(pkgName, model.services, 'TYPERT.model.services');
    var events = requireArray(pkgName, model.events, 'TYPERT.model.events');
    var objects = requireArray(pkgName, model.objects, 'TYPERT.model.objects');
    for (var _b = 0, services_1 = services; _b < services_1.length; _b++) {
        var value = services_1[_b];
        var service = requireObject(pkgName, value, 'service');
        requireDocumentation(pkgName, service, 'service');
        requireString(pkgName, service, 'key', 'service');
        requireString(pkgName, service, 'exportName', 'service');
        requireMembers(pkgName, service.members, "service \"".concat(service.key, "\""));
        requireTypes(pkgName, service.types, "service \"".concat(service.key, "\""));
    }
    for (var _c = 0, events_1 = events; _c < events_1.length; _c++) {
        var value = events_1[_c];
        var event_1 = requireObject(pkgName, value, 'event');
        requireDocumentation(pkgName, event_1, 'event');
        requireString(pkgName, event_1, 'name', 'event');
        requireString(pkgName, event_1, 'signature', "event \"".concat(event_1.name, "\""));
        if (event_1.mode !== undefined && typeof event_1.mode !== 'string') {
            throw new Error("typert-loader: ".concat(pkgName, " event \"").concat(event_1.name, "\" mode must be a string"));
        }
    }
    for (var _d = 0, objects_1 = objects; _d < objects_1.length; _d++) {
        var value = objects_1[_d];
        var object = requireObject(pkgName, value, 'object');
        requireDocumentation(pkgName, object, 'object');
        requireString(pkgName, object, 'name', 'object');
        requireString(pkgName, object, 'exportName', 'object');
        requireMembers(pkgName, object.members, "object \"".concat(object.name, "\""));
        requireTypes(pkgName, object.types, "object \"".concat(object.name, "\""));
    }
    for (var _e = 0, _f = requireArray(pkgName, manifest.invocations, 'TYPERT.invocations'); _e < _f.length; _e++) {
        var value = _f[_e];
        requireInvocation(pkgName, value);
    }
    return manifest;
}
function requireObject(pkgName, value, subject) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error("typert-loader: ".concat(pkgName, " ").concat(subject, " must be an object"));
    }
    return value;
}
function requireArray(pkgName, value, subject) {
    if (!Array.isArray(value))
        throw new Error("typert-loader: ".concat(pkgName, " ").concat(subject, " must be an array"));
    return value;
}
function requireString(pkgName, value, key, subject) {
    if (typeof value[key] !== 'string' || value[key].length === 0) {
        throw new Error("typert-loader: ".concat(pkgName, " ").concat(subject, " has a missing or empty ").concat(key));
    }
}
function requireDocumentation(pkgName, value, subject) {
    requireArray(pkgName, value.tags, "".concat(subject, ".tags"));
    for (var _i = 0, _a = ['description', 'summary', 'jsDoc']; _i < _a.length; _i++) {
        var key = _a[_i];
        if (value[key] !== undefined && typeof value[key] !== 'string') {
            throw new Error("typert-loader: ".concat(pkgName, " ").concat(subject, ".").concat(key, " must be a string"));
        }
    }
}
function requireMembers(pkgName, value, subject) {
    for (var _i = 0, _a = requireArray(pkgName, value, "".concat(subject, ".members")); _i < _a.length; _i++) {
        var item = _a[_i];
        var member = requireObject(pkgName, item, "".concat(subject, " member"));
        requireString(pkgName, member, 'name', "".concat(subject, " member"));
        requireString(pkgName, member, 'signature', "".concat(subject, " member"));
        if (typeof member.kind !== 'string' || !MEMBER_KINDS.has(member.kind)) {
            throw new Error("typert-loader: ".concat(pkgName, " ").concat(subject, " member \"").concat(member.name, "\" has invalid kind"));
        }
    }
}
function requireTypes(pkgName, value, subject) {
    for (var _i = 0, _a = requireArray(pkgName, value, "".concat(subject, ".types")); _i < _a.length; _i++) {
        var item = _a[_i];
        var type = requireObject(pkgName, item, "".concat(subject, " type"));
        requireString(pkgName, type, 'name', "".concat(subject, " type"));
        requireString(pkgName, type, 'declaration', "".concat(subject, " type"));
    }
}
function requireInvocation(pkgName, value) {
    var invocation = requireObject(pkgName, value, 'invocation');
    for (var _i = 0, _a = ['id', 'service', 'namespace', 'method']; _i < _a.length; _i++) {
        var key = _a[_i];
        requireString(pkgName, invocation, key, 'invocation');
    }
    var id = invocation.id;
    var receiver = requireObject(pkgName, invocation.invocation, "invocation \"".concat(id, "\" receiver"));
    if (receiver.kind === 'context') {
        requireString(pkgName, receiver, 'context', "invocation \"".concat(id, "\" Context receiver"));
        requireString(pkgName, receiver, 'wire', "invocation \"".concat(id, "\" Context receiver"));
        requireStrictCodec(pkgName, receiver.codec, "invocation \"".concat(id, "\" Context codec"));
    }
    else if (receiver.kind !== 'direct') {
        throw new Error("typert-loader: ".concat(pkgName, " invocation \"").concat(id, "\" receiver kind must be \"direct\" or \"context\""));
    }
    var wires = new Set();
    var parameters = new Map();
    var lookupCount = 0;
    for (var _b = 0, _c = requireArray(pkgName, invocation.parameters, "invocation \"".concat(id, "\" parameters")); _b < _c.length; _b++) {
        var valueParameter = _c[_b];
        var parameter = requireObject(pkgName, valueParameter, "invocation \"".concat(id, "\" parameter"));
        requireString(pkgName, parameter, 'name', "invocation \"".concat(id, "\" parameter"));
        requireString(pkgName, parameter, 'wire', "invocation \"".concat(id, "\" parameter"));
        var wire = parameter.wire;
        if (wires.has(wire)) {
            throw new Error("typert-loader: ".concat(pkgName, " invocation \"").concat(id, "\" repeats wire field \"").concat(wire, "\""));
        }
        wires.add(wire);
        if (parameter.source === 'lookup') {
            lookupCount += 1;
            requireString(pkgName, parameter, 'lookup', "invocation \"".concat(id, "\" lookup parameter"));
        }
        else if (parameter.source === 'json') {
            if (parameter.lookup !== undefined) {
                throw new Error("typert-loader: ".concat(pkgName, " invocation \"").concat(id, "\" JSON parameter declares a lookup"));
            }
        }
        else {
            throw new Error("typert-loader: ".concat(pkgName, " invocation \"").concat(id, "\" parameter source must be \"json\" or \"lookup\""));
        }
        parameters.set(wire, parameter);
        requireStrictCodec(pkgName, parameter.codec, "invocation \"".concat(id, "\" parameter codec"));
    }
    if (invocation.cancellation !== undefined) {
        var cancellation = requireObject(pkgName, invocation.cancellation, "invocation \"".concat(id, "\" cancellation"));
        if (cancellation.parameter !== 'signal') {
            throw new Error("typert-loader: ".concat(pkgName, " invocation \"").concat(id, "\" cancellation parameter must be \"signal\""));
        }
    }
    if (invocation.scope !== undefined) {
        if (receiver.kind !== 'direct') {
            throw new Error("typert-loader: ".concat(pkgName, " invocation \"").concat(id, "\" Context receiver cannot declare a direct scope projection"));
        }
        var scope = requireObject(pkgName, invocation.scope, "invocation \"".concat(id, "\" scope"));
        requireString(pkgName, scope, 'context', "invocation \"".concat(id, "\" scope"));
        requireString(pkgName, scope, 'wire', "invocation \"".concat(id, "\" scope"));
        var parameter = parameters.get(scope.wire);
        if (lookupCount !== 1 || (parameter === null || parameter === void 0 ? void 0 : parameter.source) !== 'lookup' || parameter.lookup !== scope.context) {
            throw new Error("typert-loader: ".concat(pkgName, " invocation \"").concat(id, "\" scope wire \"").concat(scope.wire, "\" must select its only lookup parameter"));
        }
    }
    if (receiver.kind === 'context' && wires.has(receiver.wire)) {
        throw new Error("typert-loader: ".concat(pkgName, " invocation \"").concat(id, "\" repeats Context wire field \"").concat(receiver.wire, "\""));
    }
    requireStrictCodec(pkgName, invocation.result, "invocation \"".concat(id, "\" result codec"));
    if (invocation.sourceLocation !== undefined) {
        var location_1 = requireObject(pkgName, invocation.sourceLocation, "invocation \"".concat(id, "\" sourceLocation"));
        requireString(pkgName, location_1, 'file', "invocation \"".concat(id, "\" sourceLocation"));
        for (var _d = 0, _e = ['line', 'column']; _d < _e.length; _d++) {
            var key = _e[_d];
            if (!Number.isInteger(location_1[key]) || location_1[key] < 1) {
                throw new Error("typert-loader: ".concat(pkgName, " invocation \"").concat(id, "\" sourceLocation.").concat(key, " must be a positive integer"));
            }
        }
    }
}
function requireStrictCodec(pkgName, value, subject) {
    var codec = requireObject(pkgName, value, subject);
    if (codec.mode !== 'strict') {
        throw new Error("typert-loader: ".concat(pkgName, " ").concat(subject, " must use a strict codec"));
    }
    requireString(pkgName, codec, 'typeSymbol', subject);
    if (typeof codec.schema !== 'object'
        || codec.schema === null
        || !('_zod' in codec.schema)
        || typeof codec.schema.parse !== 'function') {
        throw new Error("typert-loader: ".concat(pkgName, " ").concat(subject, " is not backed by a zod v4 schema"));
    }
}
/**
 * Scan current Loader entries during activation, then follow entry mounts and
 * unmounts for this plugin's lifetime.
 * @param ctx - plugin context carrying `typert` and `loader`.
 * @param config - explicit package artifacts in addition to Loader entries.
 */
function apply(ctx, config) {
    return __awaiter(this, void 0, void 0, function () {
        var require, configured, registered, pending, artifactPath, manifests, dirty, flushQueued, active, resolveArtifact, loadManifest, qualifies, processOne, flush, _i, configured_1, packageName, _a, _b, entry, failures;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // Resolution anchor: the config tree's baseUrl (the cordis.yml directory,
                    // whose package declares every composed plugin as a dependency). This
                    // package's own URL would miss sibling packages under pnpm's isolated
                    // node_modules.
                    if (ctx.baseUrl === undefined) {
                        throw new Error('typert-loader: ctx.baseUrl is unset — the loader needs the config-tree anchor to resolve plugin packages');
                    }
                    require = (0, node_module_1.createRequire)(ctx.baseUrl);
                    configured = new Set(config.packages);
                    registered = new Map();
                    pending = new Map();
                    artifactPath = new Map();
                    manifests = new Map();
                    dirty = new Set();
                    flushQueued = false;
                    active = true;
                    ctx.effect(function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, function () {
                                        active = false;
                                        dirty.clear();
                                    }];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }, 'typert loader lifetime');
                    resolveArtifact = function (pkgName) {
                        var cached = artifactPath.get(pkgName);
                        if (cached !== undefined)
                            return cached;
                        var pkgPath;
                        try {
                            pkgPath = require.resolve("".concat(pkgName, "/package.json"));
                        }
                        catch (cause) {
                            if (configured.has(pkgName)) {
                                throw new Error("typert-loader: configured package \"".concat(pkgName, "\" cannot be resolved from the config tree \u2014 add it to the composition package dependencies or remove it from packages"), { cause: cause });
                            }
                            // Not a resolvable package root: loader builtins (cordis:include) and
                            // subpath entries land here — permanently not a typert contributor.
                            artifactPath.set(pkgName, null);
                            return null;
                        }
                        var pkg = JSON.parse((0, node_fs_1.readFileSync)(pkgPath, 'utf8'));
                        var rel = typertExportOf(pkgName, pkg.exports);
                        if (rel === undefined && configured.has(pkgName)) {
                            throw new Error("typert-loader: configured package \"".concat(pkgName, "\" does not export \"").concat(exports.TYPERT_HOST_EXPORT, "\""));
                        }
                        var resolved = rel === undefined ? null : (0, node_path_1.join)((0, node_path_1.dirname)(pkgPath), rel);
                        artifactPath.set(pkgName, resolved);
                        return resolved;
                    };
                    loadManifest = function (pkgName, path) {
                        var loading = manifests.get(pkgName);
                        if (loading === undefined) {
                            loading = Promise.resolve("".concat((0, node_url_1.pathToFileURL)(path).href)).then(function (s) { return require(s); }).then(function (mod) { return validateTypertManifest(pkgName, mod.TYPERT); }, function (cause) {
                                throw new Error("typert-loader: ".concat(pkgName, " exports \"").concat(exports.TYPERT_HOST_EXPORT, "\" but importing ").concat(path, " failed: ").concat(String(cause)));
                            });
                            manifests.set(pkgName, loading);
                        }
                        return loading;
                    };
                    qualifies = function (entryName) {
                        if (configured.has(entryName))
                            return true;
                        for (var _i = 0, _a = ctx.loader.entries(); _i < _a.length; _i++) {
                            var entry = _a[_i];
                            if (entry.options.name === entryName && entry.fiber !== undefined && !entry.disabled)
                                return true;
                        }
                        return false;
                    };
                    processOne = function (entryName) {
                        if (!qualifies(entryName)) {
                            var dispose = registered.get(entryName);
                            if (dispose !== undefined) {
                                registered.delete(entryName);
                                return dispose();
                            }
                            return undefined;
                        }
                        if (registered.has(entryName) || pending.has(entryName))
                            return undefined;
                        var path = resolveArtifact(entryName);
                        if (path === null)
                            return undefined;
                        var task = loadManifest(entryName, path).then(function (manifest) {
                            // The entry may have unmounted (or already re-registered) while the import was in flight.
                            if (!active || !qualifies(entryName) || registered.has(entryName))
                                return;
                            registered.set(entryName, ctx.typert.register(manifest));
                        });
                        pending.set(entryName, task);
                        // Two-armed settle: a bare .finally() would mint a second, unhandled rejection.
                        var settle = function () { pending.delete(entryName); };
                        void task.then(settle, settle);
                        return task;
                    };
                    flush = function (onError) {
                        var tasks = [];
                        for (var _i = 0, _a = __spreadArray([], dirty, true); _i < _a.length; _i++) {
                            var entryName = _a[_i];
                            dirty.delete(entryName);
                            try {
                                var task = processOne(entryName);
                                if (task !== undefined)
                                    tasks.push(task.catch(function (error) { onError(toError(error)); }));
                            }
                            catch (error) {
                                // Steady state: one broken package must not poison the others; the
                                // activation pass aggregates these into a loud throw instead.
                                onError(toError(error));
                            }
                        }
                        return tasks;
                    };
                    // Subscribe before seeding so an entry arriving mid-activation lands in the
                    // same dirty set (Set idempotence makes the overlap harmless). An entry-less
                    // fiber is a child plugin or a manual mount — never a loader row; O(1) drop.
                    ctx.on('internal/plugin', function (fiber) {
                        var _a;
                        var entryName = (_a = fiber.entry) === null || _a === void 0 ? void 0 : _a.options.name;
                        if (entryName === undefined)
                            return;
                        dirty.add(entryName);
                        if (flushQueued)
                            return;
                        flushQueued = true;
                        queueMicrotask(function () {
                            flushQueued = false;
                            if (!active)
                                return;
                            for (var _i = 0, _a = flush(function (err) { ctx.logger.error(err); }); _i < _a.length; _i++) {
                                var task = _a[_i];
                                void task;
                            }
                        });
                    });
                    // Activation pass: the initial scan IS the incremental path over the current
                    // entries; a malformed typert contributor among the already-loaded entries
                    // aggregates into one loud throw (FAILED loader fiber; the boot sweep reports it).
                    for (_i = 0, configured_1 = configured; _i < configured_1.length; _i++) {
                        packageName = configured_1[_i];
                        dirty.add(packageName);
                    }
                    for (_a = 0, _b = ctx.loader.entries(); _a < _b.length; _a++) {
                        entry = _b[_a];
                        dirty.add(entry.options.name);
                    }
                    failures = [];
                    return [4 /*yield*/, Promise.all(flush(function (err) { failures.push(err); }))];
                case 1:
                    _c.sent();
                    if (failures.length > 0) {
                        throw new AggregateError(failures, "typert-loader: ".concat(String(failures.length), " typert contributor(s) failed to register:\n").concat(failures.map(function (e) { return "  - ".concat(e.message); }).join('\n')));
                    }
                    return [2 /*return*/];
            }
        });
    });
}
/** Normalize an arbitrary import or manifest failure to an Error. */
function toError(error) {
    return error instanceof Error ? error : new Error(String(error));
}
