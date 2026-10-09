"use strict";
/**
 * Mount one preset composition under an agent's scope context, then prove the
 * result is usable before the agent is published.
 *
 * The scope context is what makes the composition per-session: entry contexts
 * chain to the context the subtree was plugged into, so every `ctx.tools`
 * and `ctx.systemPrompt` registration inside the preset files into that
 * agent's layer and unwinds with it. Two guards make that safe. A row that
 * never reached a usable state is rejected, because a directly-plugged subtree
 * is absent from `ctx.loader.entries()` and no boot audit covers it. A row that
 * published a service into the ROOT realm is rejected, because such a service
 * is process-global rather than per-session and the second session mounting the
 * same preset collides with the first.
 * @module @z/dsh-agent-presets/mount
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
exports.livePresetMounts = livePresetMounts;
exports.leakedServices = leakedServices;
exports.standingMountFor = standingMountFor;
exports.serviceForAgent = serviceForAgent;
exports.inactiveRows = inactiveRows;
exports.mountPreset = mountPreset;
var node_path_1 = require("node:path");
var node_url_1 = require("node:url");
var cordis_1 = require("@z/cordis");
var cordis_plugin_include_1 = require("@z/cordis-plugin-include");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var dsh_scope_1 = require("@z/dsh-scope");
var preset_ts_1 = require("./preset.ts");
/**
 * Subtrees captured by config identity. A subtree plugged directly (rather than
 * created as a loader entry) never links itself to an `Entry`, so this is the
 * only handle to the rows it created; config objects are minted per mount, so
 * concurrent mounts cannot collide.
 */
var mounted = new WeakMap();
/**
 * The base URL bare specifiers resolve against, per pending mount, keyed by the
 * same config object. Recorded before the subtree is plugged, because `Include`
 * rewrites its own context's `baseUrl` to the composition's directory and the
 * pre-mount value is the only handle on where the harness itself lives.
 */
var harnessBase = new WeakMap();
function taskweaverEmbedded() {
    return (0, dsh_home_paths_1.taskweaverEmbeddedFromEnv)();
}
/** Where preset rows resolve bare package names from. */
function presetHarnessBaseUrl(agentCtx) {
    if (taskweaverEmbedded()) {
        return "".concat((0, node_url_1.pathToFileURL)(process.cwd()).href, "/");
    }
    return agentCtx.baseUrl;
}
/**
 * Include subclass that publishes its tree and fiber for the audit, and never
 * writes to the file it read.
 */
var PresetTree = /** @class */ (function (_super) {
    __extends(PresetTree, _super);
    function PresetTree(ctx, config) {
        var _this = _super.call(this, ctx, config) || this;
        mounted.set(config, { tree: _this, fiber: ctx.fiber });
        return _this;
    }
    /**
     * Resolve a bare specifier from the harness rather than from the preset.
     *
     * `EntryTree.import()` resolves against the tree's own `baseUrl`, which
     * `Include` sets to the composition's directory. That is right for a
     * relative specifier — a preset's own files travel with it — and wrong for
     * a package name: a locally authored preset lives under the user's home,
     * where Node's upward `node_modules` walk never reaches the harness's own
     * dependencies, so every `@z/dsh-*` row would fail to import. The
     * mount records the host composition's base instead, which is inside the
     * installed harness, and bare names resolve from there. An absolute
     * filesystem path names neither base and becomes a file URL before Node's
     * ESM loader receives it, which is required for drive-letter paths on
     * Windows.
     * @param name - the module specifier from the row.
     * @param getOuterStack - the loader's stack composer for import diagnostics.
     * @returns the imported module, or the `cordis:` builtin.
     */
    PresetTree.prototype.import = function (name, getOuterStack) {
        var specifier = (0, node_path_1.isAbsolute)(name) ? (0, node_url_1.pathToFileURL)(name).href : name;
        var base = harnessBase.get(this.config);
        /* v8 ignore next -- every PresetTree is constructed by `mountPreset`, which records the base first */
        if (base === undefined)
            return _super.prototype.import.call(this, specifier, getOuterStack);
        if (name.startsWith('.') || name.startsWith('cordis:'))
            return _super.prototype.import.call(this, name, getOuterStack);
        var internal = this.ctx.loader.internal;
        /* v8 ignore next -- Node always supplies the internal module loader; the branch keeps a
           hypothetical embedder from losing the row's name in a resolution error. */
        if (internal === undefined)
            return _super.prototype.import.call(this, specifier, getOuterStack);
        return internal.import(specifier, base, {});
    };
    /**
     * A preset is an input, never a persistence target.
     *
     * The Loader writes a tree back through this method whenever it decides the
     * config changed — a plugin self-disposing is enough, and tearing an agent
     * down disposes its whole subtree. Inherited, that rewrites the preset file
     * with whatever the dying tree held, which in practice means truncating a
     * shipped composition to `[]` the first time a session ends. Persisting a
     * preset is also meaningless: nothing here is user state, and the same file
     * backs every session that names it.
     *
     * Dropping the write drops the `loader/config-update` the inherited method
     * emits with it. Nothing observes one for a preset subtree today, and a
     * future "edit your preset while it runs" flow needs a deliberate
     * persistence path rather than this method's return.
     */
    PresetTree.prototype.write = function () {
    };
    return PresetTree;
}(cordis_plugin_include_1.Include));
var mounts = new Set();
/**
 * Drop every record whose subtree is gone.
 *
 * Records are pruned by observation rather than through a disposal hook
 * because a subtree can be torn down by its owning agent, by a failed mount, or
 * by the whole tree unloading, and a cleared `uid` is what all three share.
 *
 * Pruning therefore has to happen on a path this module owns. Reading is one
 * such path, but not a reliable one: the only production reader is the
 * invariant companion's service listener, and `dsh-invariants` is a
 * development composition — a shipped host never loads it. Mounting is the
 * other, and it is the one every session takes, which bounds the set at one
 * generation of dead records rather than one per session ever composed. Each
 * record would otherwise retain its whole disposed subtree: the fiber holds
 * its config, and that config is the key its `EntryTree` is stored under.
 */
function pruneDisposedMounts() {
    for (var _i = 0, mounts_1 = mounts; _i < mounts_1.length; _i++) {
        var mount = mounts_1[_i];
        if (mount.fiber.uid === null)
            mounts.delete(mount);
    }
}
/**
 * Every preset composition still installed, pruning fibers disposed since the
 * last read.
 * @returns the live mounts.
 */
function livePresetMounts() {
    pruneDisposedMounts();
    return __spreadArray([], mounts, true);
}
/**
 * Whether `fiber` is `root` itself or is mounted anywhere inside its subtree.
 *
 * Membership is object identity. `uid` looks like a cheaper key but is a
 * per-registry counter, so fibers in two different roots collide on it and a
 * subtree in one runtime would be blamed for a service published in another.
 * @param fiber - the fiber to locate.
 * @param root - the subtree root to test membership against.
 * @returns true when `fiber` belongs to `root`'s subtree.
 */
function withinFiber(fiber, root) {
    var current = fiber;
    while (true) {
        if (current === root)
            return true;
        var parent_1 = current.parent.fiber;
        if (parent_1 === current)
            return false;
        current = parent_1;
    }
}
/**
 * Service names the mounted subtree published into the root realm.
 *
 * A provider without an `isolate` realm stores its implementation under the
 * root's symbol for that name, which is exactly the comparison below; a
 * provider inside an `isolate` realm stores under a realm-private symbol and
 * is correctly absent here.
 * @param ctx - any context of the runtime whose service store is inspected.
 * @param mount - the mounted subtree's fiber.
 * @returns the leaked service names in lexical order.
 */
function leakedServices(ctx, mount) {
    var store = ctx.reflect.store;
    var rootIsolate = ctx.root[cordis_1.Context.isolate];
    var leaked = [];
    for (var _i = 0, _a = Object.getOwnPropertySymbols(store); _i < _a.length; _i++) {
        var key = _a[_i];
        var impl = store[key];
        /* v8 ignore next -- cordis deletes a store slot on disposal rather than
           clearing it, so an own symbol always resolves; the guard exists only
           because the store's index signature is optional. */
        if (impl === undefined)
            continue;
        if (!withinFiber(impl.fiber, mount))
            continue;
        if (rootIsolate[impl.name] === key)
            leaked.push(impl.name);
    }
    return leaked.sort(function (left, right) { return left.localeCompare(right); });
}
/**
 * The standing composition one agent is joined to.
 *
 * The agent's own key is parented to its preset's standing key, so the mount
 * is found by matching that parent rather than by walking up from the agent —
 * the mount is not under the agent's fiber. An agent that joined no preset —
 * a deployment composing no roster, or a child agent before its join — has no
 * parent link and resolves to undefined.
 * @param agentCtx - the agent's scope context.
 * @returns the mount the agent joined, or undefined when it joined none.
 */
function standingMountFor(agentCtx) {
    var agentKey = (0, dsh_scope_1.scopeOf)(agentCtx);
    if (agentKey === undefined)
        return undefined;
    var standingKey = (0, dsh_scope_1.scopeParentOf)(agentKey);
    if (standingKey === undefined)
        return undefined;
    return livePresetMounts().find(function (candidate) { return candidate.key === standingKey; });
}
/**
 * One agent's instance of a service its preset mounted.
 *
 * A preset publishes a service behind an `isolate` realm so two sessions
 * cannot collide, and an entry-local realm is invisible to everything outside
 * the group — including the agent's own scope context and the host. That is
 * right for the rows inside the group and wrong for one caller: a request that
 * is ABOUT a session but arrives from outside it, which is every browser RPC
 * the api-proxy serves.
 *
 * Ownership is the same relation {@link leakedServices} reads, inverted: there
 * it names implementations a subtree published into the ROOT realm, here it
 * names the one this subtree published anywhere. Fiber membership is object
 * identity for the reason stated on {@link withinFiber}.
 *
 * This is READ addressing for a caller that already holds the agent. It is not
 * a general host handle on a session's internals: a host row that `inject`s a
 * service cannot use it, because injection resolves before any session exists
 * and has no agent to key by — such a service belongs on the host plane.
 * @param ctx - any context of the runtime whose service store is inspected.
 * @param agent - the agent whose mounted composition to look inside.
 * @param name - the service name as the preset's rows resolve it.
 * @returns the agent's instance, or undefined when its preset mounts none.
 */
function serviceForAgent(ctx, agent, name) {
    var mount = standingMountFor(agent.ctx);
    if (mount === undefined)
        return undefined;
    var store = ctx.reflect.store;
    for (var _i = 0, _a = Object.getOwnPropertySymbols(store); _i < _a.length; _i++) {
        var key = _a[_i];
        var impl = store[key];
        /* v8 ignore next -- cordis deletes a store slot on disposal rather than clearing it */
        if (impl === undefined)
            continue;
        if (impl.name !== name)
            continue;
        if (withinFiber(impl.fiber, mount.fiber))
            return impl.value;
    }
    return undefined;
}
/**
 * Rows that did not reach a usable state, each rendered as one diagnostic line.
 *
 * A row whose module failed to import or whose plugin threw already rejects the
 * mount through the loader; what remains observable here is a row still waiting
 * for a service the composition never supplies.
 * @param tree - the mounted subtree.
 * @returns one line per unusable row, empty when every enabled row is usable.
 */
function inactiveRows(tree) {
    var lines = [];
    var _loop_1 = function (entry) {
        if (entry.disabled)
            return "continue";
        var fiber = entry.fiber;
        /* v8 ignore next 4 -- the loader rejects an entry whose module or plugin failed,
           so a settled tree never holds an enabled fiber-less entry; the branch exists
           only because `Entry.fiber` is declared optional. */
        if (fiber === undefined) {
            lines.push("".concat(entry.options.id, " (").concat(entry.options.name, "): never started"));
            return "continue";
        }
        var missing = Object.keys(fiber.inject).filter(function (name) { return fiber.ctx.get(name) === undefined; });
        if (missing.length > 0) {
            lines.push("".concat(entry.options.id, " (").concat(entry.options.name, "): waiting for ").concat(missing.join(', ')));
        }
    };
    for (var _i = 0, _a = tree.entries(); _i < _a.length; _i++) {
        var entry = _a[_i];
        _loop_1(entry);
    }
    return lines;
}
/**
 * The reportable text of a mount failure.
 *
 * The loader reports several failed rows as one `AggregateError`, whose own
 * message names none of them; without flattening, a composition that fails on
 * two rows says only "loader entries failed to apply" and the operator has
 * nothing to act on.
 * @param error - the value the mount rejected with.
 * @returns a single-line-per-cause description.
 */
function mountDetail(error) {
    /* v8 ignore next -- every path into the mount's catch throws an Error: the loader
       wraps a row's thrown value before it propagates, and this module's own
       rejections are Errors. The fallback keeps a hostile value readable. */
    if (!(error instanceof Error))
        return String(error);
    if (!(error instanceof AggregateError))
        return error.message;
    return __spreadArray([error.message], error.errors.map(function (cause) { return "- ".concat(mountDetail(cause)); }), true).join('\n');
}
/**
 * Mount `preset` under `agentCtx` and return only once every row is usable.
 *
 * The subtree is owned by `agentCtx`'s fiber, so it unwinds with the agent and
 * the caller receives no disposer. A rejection leaves nothing mounted.
 * @param agentCtx - the agent's scope context, from the agent factory's `setup`.
 * @param preset - the resolved preset to compose the agent from.
 * @throws when `agentCtx` carries no scope, a row is unusable, or a row
 * published a service into the root realm.
 */
function mountPreset(agentCtx, preset) {
    return __awaiter(this, void 0, void 0, function () {
        var scope, config, harnessBaseUrl, handle, subtree, tree, fiber, unusable, leaked, error_1, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    scope = (0, dsh_scope_1.scopeOf)(agentCtx);
                    if (scope === undefined) {
                        throw new Error("agent-presets: refusing to mount preset \"".concat(preset.id, "\" into an unscoped context; ")
                            + 'its registrations would apply to every agent in the process');
                    }
                    config = { path: (0, node_url_1.pathToFileURL)(preset.path).href };
                    harnessBaseUrl = presetHarnessBaseUrl(agentCtx);
                    /* v8 ignore next -- the Loader sets `baseUrl` on the root before any scoped context derives from it */
                    if (harnessBaseUrl !== undefined)
                        harnessBase.set(config, harnessBaseUrl);
                    // Before the record this mount is about to add: standing mounts are one per
                    // preset and live until whole-tree teardown, so pruning here only sweeps
                    // records of torn-down runtimes (tests; an HMR reload of the roster).
                    pruneDisposedMounts();
                    handle = agentCtx.plugin(PresetTree, config);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 8]);
                    return [4 /*yield*/, handle.await()];
                case 2:
                    _b.sent();
                    subtree = mounted.get(config);
                    /* v8 ignore next -- the subclass constructor runs before `await()` settles for every mounted tree */
                    if (subtree === undefined)
                        throw new Error('mounted subtree did not publish its entry tree');
                    tree = subtree.tree, fiber = subtree.fiber;
                    unusable = inactiveRows(tree);
                    if (unusable.length > 0) {
                        throw new Error("".concat(String(unusable.length), " row(s) did not activate:\n").concat(unusable.join('\n')));
                    }
                    leaked = leakedServices(agentCtx, fiber);
                    if (leaked.length > 0) {
                        throw new Error("row(s) published process-global service(s) [".concat(leaked.join(', '), "]; ")
                            + 'a preset service must sit behind an `isolate` realm or move to the host composition');
                    }
                    mounts.add({ presetId: preset.id, fiber: fiber, key: (0, dsh_scope_1.scopeOf)(agentCtx) });
                    return [3 /*break*/, 8];
                case 3:
                    error_1 = _b.sent();
                    _b.label = 4;
                case 4:
                    _b.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, handle.dispose()
                        /* v8 ignore next 5 -- teardown of a subtree nothing else references has no
                           observed failure mode; the guard exists so a teardown error cannot
                           replace the mount diagnostic the caller needs. */
                    ];
                case 5:
                    _b.sent();
                    return [3 /*break*/, 7];
                case 6:
                    _a = _b.sent();
                    return [3 /*break*/, 7];
                case 7: throw new preset_ts_1.PresetMountError(preset.id, "".concat(mountDetail(error_1), " (").concat(preset.path, ")"), { cause: error_1 });
                case 8: return [2 /*return*/];
            }
        });
    });
}
