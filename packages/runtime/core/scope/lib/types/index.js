"use strict";
/**
 * Scoped-context primitive: mint a Cordis context that tags registrations with
 * an opaque identity and build routing-only event carriers for that identity.
 *
 * @module @z/dsh-scope
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
exports.ScopedLayers = exports.NamedEntries = exports.AnonymousEntries = void 0;
exports.bindScopeParent = bindScopeParent;
exports.scopeParentOf = scopeParentOf;
exports.scopeChainOf = scopeChainOf;
exports.createScope = createScope;
exports.scopeOf = scopeOf;
exports.scopeTarget = scopeTarget;
exports.isScopeCarrier = isScopeCarrier;
exports.carrierKeyOf = carrierKeyOf;
var cordis_1 = require("@z/cordis");
var store_ts_1 = require("./store.ts");
Object.defineProperty(exports, "AnonymousEntries", { enumerable: true, get: function () { return store_ts_1.AnonymousEntries; } });
Object.defineProperty(exports, "NamedEntries", { enumerable: true, get: function () { return store_ts_1.NamedEntries; } });
Object.defineProperty(exports, "ScopedLayers", { enumerable: true, get: function () { return store_ts_1.ScopedLayers; } });
/** Context tag written by {@link createScope}. */
var kScope = Symbol('dsh.scope');
/** The key associated with each carrier. Presence distinguishes an unkeyed carrier from a non-carrier. */
var carrierKeys = new WeakMap();
/**
 * The enclosing scope of each key. One relation powers both directions of
 * scope nesting: registration views inherit DOWN the chain (a child scope
 * sees its ancestors' layers — {@link ScopedLayers}), and event admission
 * extends UP it (a listener tagged with an ancestor receives events dispatched
 * to a descendant key — {@link scopeTarget}).
 */
var scopeParents = new WeakMap();
/** Cycle-checked write shared by the bind and every rebind. */
function linkScopeParent(key, parent) {
    for (var cursor = parent; cursor !== undefined; cursor = scopeParents.get(cursor)) {
        if (cursor === key)
            throw new Error('dsh-scope: scope parent link would form a cycle');
    }
    scopeParents.set(key, parent);
}
/**
 * Bind `parent` as `key`'s enclosing scope, once.
 *
 * A key that already has a parent throws: there is no open re-link path, so a
 * scope's ancestry cannot be moved by anyone but the original binder, who
 * alone receives the {@link ScopeParentBinding}. A link that would close a
 * cycle is rejected, because every chain consumer walks parents to the root.
 * @param key - the child scope key.
 * @param parent - its enclosing scope key.
 * @returns the binding that alone may re-link this key.
 */
function bindScopeParent(key, parent) {
    if (scopeParents.has(key)) {
        throw new Error('dsh-scope: scope key is already bound to a parent; re-linking requires the binding returned by the original bind');
    }
    linkScopeParent(key, parent);
    return {
        rebind: function (next) {
            linkScopeParent(key, next);
        },
    };
}
/**
 * Read one key's enclosing scope.
 * @param key - the scope key to inspect.
 * @returns its parent key, or `undefined` for a root scope.
 */
function scopeParentOf(key) {
    return scopeParents.get(key);
}
/**
 * The chain from a key to its root ancestor.
 * @param key - the starting key, or `undefined` for the empty chain.
 * @returns keys nearest-first: `[key, parent, grandparent, …]`.
 */
function scopeChainOf(key) {
    var chain = [];
    for (var cursor = key; cursor !== undefined; cursor = scopeParents.get(cursor))
        chain.push(cursor);
    return chain;
}
/** Follow a Cordis fiber through asynchronous teardown even if its raw disposer was already claimed. */
function quiesceFiber(fiber) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve(fiber.dispose())];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    if (!(fiber.inertia !== undefined)) return [3 /*break*/, 4];
                    return [4 /*yield*/, fiber.inertia];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 2];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** Shared no-op plugin used as the backing scope fiber. */
function scope() { }
/**
 * Mint a scope under `ctx`. The scoped context inherits the minting plugin's
 * dependency API and owns every registration made through it.
 * @param ctx - active context whose dependency API the scope inherits.
 * @param key - opaque identity used for listener routing.
 * @param options - optional scope-chain placement.
 * @returns the scoped context and exact/shared disposal boundaries.
 */
function createScope(ctx, key, options) {
    var _a;
    if ((options === null || options === void 0 ? void 0 : options.parent) !== undefined)
        bindScopeParent(key, options.parent);
    var fiber = ctx.plugin(scope);
    var scoped = fiber.ctx.extend((_a = {}, _a[kScope] = key, _a));
    var disposing;
    return {
        ctx: scoped,
        rawDispose: fiber.dispose,
        dispose: function () { return (disposing !== null && disposing !== void 0 ? disposing : (disposing = quiesceFiber(fiber))); },
    };
}
/**
 * Read the nearest scope tag inherited by a context.
 * @param ctx - context to inspect.
 * @returns its scope key, or `undefined` for an unscoped context.
 */
function scopeOf(ctx) {
    return ctx[kScope];
}
/**
 * Build an opaque receiver that preserves the base filter, admits untagged
 * listeners globally, and admits tagged listeners for a matching key or any
 * of its ancestors ({@link bindScopeParent}): a listener owned by an enclosing
 * scope receives every descendant scope's events, which is what lets one
 * standing composition observe each of the agents composed under it. A tag
 * BELOW the dispatch key stays excluded — events flow up the chain, never
 * down.
 * @param base - subject or service whose existing Cordis filter is preserved.
 * @param key - routed scope identity, or `undefined` for an unscoped subject.
 * @returns a carrier whose subject remains available only through event arguments.
 */
function scopeTarget(base, key) {
    var _a;
    var baseFilter = base[cordis_1.Context.filter];
    var carrier = (_a = {},
        _a[cordis_1.Context.filter] = function (ctx) {
            if (baseFilter !== undefined && !baseFilter.call(base, ctx))
                return false;
            var tag = scopeOf(ctx);
            if (tag === undefined)
                return true;
            for (var cursor = key; cursor !== undefined; cursor = scopeParents.get(cursor)) {
                if (cursor === tag)
                    return true;
            }
            return false;
        },
        _a);
    carrierKeys.set(carrier, key);
    return carrier;
}
/**
 * Test whether a value is a scope carrier.
 * @param value - dispatch receiver to inspect.
 * @returns whether {@link scopeTarget} created it.
 */
function isScopeCarrier(value) {
    return typeof value === 'object' && value !== null && carrierKeys.has(value);
}
/**
 * Read a carrier's routing key.
 * @param value - dispatch receiver to inspect.
 * @returns the carrier key, or `undefined` for an unkeyed/non-carrier value.
 */
function carrierKeyOf(value) {
    if (!isScopeCarrier(value))
        return undefined;
    return carrierKeys.get(value);
}
