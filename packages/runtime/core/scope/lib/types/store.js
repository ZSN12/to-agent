"use strict";
/**
 * Shared insertion-ordered storage and effect ownership for scope-aware registries.
 *
 * @module @z/dsh-scope
 */
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
exports.ScopedLayers = exports.AnonymousEntries = exports.NamedEntries = void 0;
var index_ts_1 = require("./index.ts");
/**
 * Insertion-ordered named entries with caller-owned duplicate diagnostics.
 *
 * Values are borrowed. Iterators are live within one nonempty table
 * generation; draining the table detaches them from later insertions. Each
 * successful insertion returns an idempotent undo for that exact entry.
 */
var NamedEntries = /** @class */ (function () {
    function NamedEntries(duplicateError) {
        this.duplicateError = duplicateError;
        this.data = new Map();
    }
    /**
     * Insert one unique name.
     * @param name - name unique within this table.
     * @param value - borrowed value to retain.
     * @returns an idempotent undo that removes only this insertion.
     */
    NamedEntries.prototype.insert = function (name, value) {
        var _this = this;
        var data = this.data;
        if (data.has(name))
            throw this.duplicateError(name);
        data.set(name, value);
        var active = true;
        return function () {
            if (!active)
                return;
            active = false;
            data.delete(name);
            if (data.size === 0 && _this.data === data)
                _this.data = new Map();
        };
    };
    /**
     * Read one named value.
     * @param name - name to resolve.
     * @returns the retained value, or `undefined` when absent.
     */
    NamedEntries.prototype.get = function (name) {
        return this.data.get(name);
    };
    /**
     * Test one name for membership.
     * @param name - name to test.
     * @returns whether the table contains that name.
     */
    NamedEntries.prototype.has = function (name) {
        return this.data.has(name);
    };
    /**
     * Iterate live names in insertion order.
     * @returns the native live key iterator.
     */
    NamedEntries.prototype.keys = function () {
        return this.data.keys();
    };
    /**
     * Iterate live entries in insertion order.
     * @returns the native live entry iterator.
     */
    NamedEntries.prototype.entries = function () {
        return this.data.entries();
    };
    /**
     * Iterate live values in insertion order.
     * @returns the native live value iterator.
     */
    NamedEntries.prototype.values = function () {
        return this.data.values();
    };
    /**
     * Test whether this table has no entries.
     * @returns whether the table is empty.
     */
    NamedEntries.prototype.isEmpty = function () {
        return this.data.size === 0;
    };
    return NamedEntries;
}());
exports.NamedEntries = NamedEntries;
/**
 * Insertion-ordered anonymous entries with independent registration identity.
 *
 * Equal values remain separate registrations. Values are borrowed, and
 * iterators are live within one nonempty table generation; draining the table
 * detaches them from later appends.
 */
var AnonymousEntries = /** @class */ (function () {
    function AnonymousEntries() {
        this.data = new Map();
    }
    /**
     * Append one independently owned value.
     * @param value - borrowed value to retain.
     * @returns an idempotent undo for this exact append.
     */
    AnonymousEntries.prototype.append = function (value) {
        var _this = this;
        var data = this.data;
        var key = Symbol();
        data.set(key, value);
        var active = true;
        return function () {
            if (!active)
                return;
            active = false;
            data.delete(key);
            if (data.size === 0 && _this.data === data)
                _this.data = new Map();
        };
    };
    /**
     * Iterate live values in insertion order.
     * @returns the native live value iterator.
     */
    AnonymousEntries.prototype.values = function () {
        return this.data.values();
    };
    /**
     * Test whether this table has no entries.
     * @returns whether the table is empty.
     */
    AnonymousEntries.prototype.isEmpty = function () {
        return this.data.size === 0;
    };
    return AnonymousEntries;
}());
exports.AnonymousEntries = AnonymousEntries;
/**
 * Own the global and exact-scope layers for one registry.
 *
 * Reads never create scoped layers. Registrations derive both visibility and
 * effect ownership from the supplied Cordis context, collect undo before
 * notification, and reclaim only a completely empty aggregate layer.
 */
var ScopedLayers = /** @class */ (function () {
    function ScopedLayers(createLayer, onChange) {
        this.createLayer = createLayer;
        this.onChange = onChange;
        this.scoped = new Map();
        this.global = createLayer(undefined);
    }
    /**
     * Read an existing exact-scope overlay. Deliberately chain-blind: callers
     * addressing one scope's OWN contributions (its restrictions, its guards)
     * must not silently pick up an ancestor's — use {@link chainLayers} where
     * inheritance is the point.
     * @param scope - exact scope key; `undefined` denotes no overlay.
     * @returns the existing scoped layer, or `undefined` without creating one.
     */
    ScopedLayers.prototype.peek = function (scope) {
        if (scope === undefined)
            return undefined;
        return this.scoped.get(scope);
    };
    /**
     * Existing overlays along the scope's parent chain ({@link scopeChainOf}),
     * farthest ancestor first and the exact scope last, so a caller layering
     * them in order gives the nearest scope the final word.
     * @param scope - viewing scope, or `undefined` for no overlays.
     * @returns the existing layers, nearest last; absent overlays are skipped.
     */
    ScopedLayers.prototype.chainLayers = function (scope) {
        var layers = [];
        for (var _i = 0, _a = (0, index_ts_1.scopeChainOf)(scope).reverse(); _i < _a.length; _i++) {
            var key = _a[_i];
            var layer = this.scoped.get(key);
            if (layer !== undefined)
                layers.push(layer);
        }
        return layers;
    };
    /**
     * Materialize global named entries followed by scope-chain shadows,
     * farthest ancestor first, so the nearest scope's entry wins a name.
     * @param scope - viewing scope, or `undefined` for the global view.
     * @param pick - select the named table from a layer.
     * @returns an insertion-ordered effective map.
     */
    ScopedLayers.prototype.merge = function (scope, pick) {
        var merged = new Map(pick(this.global).entries());
        for (var _i = 0, _a = this.chainLayers(scope); _i < _a.length; _i++) {
            var layer = _a[_i];
            for (var _b = 0, _c = pick(layer).entries(); _b < _c.length; _b++) {
                var _d = _c[_b], name_1 = _d[0], value = _d[1];
                merged.set(name_1, value);
            }
        }
        return merged;
    };
    /**
     * Attach one synchronous layer mutation to its registration context.
     * @param ctx - context that determines both scope visibility and effect ownership.
     * @param action - atomic mutation returning its synchronous undo.
     * @param options - Cordis effect label and optional change notification.
     * @returns the exact disposer returned by `ctx.effect()`.
     */
    ScopedLayers.prototype.effect = function (ctx, action, options) {
        var _a;
        var scope = (0, index_ts_1.scopeOf)(ctx);
        var notify = (_a = options.notify) !== null && _a !== void 0 ? _a : true;
        var dispose = ctx.effect(function () {
            var layer, created, existing, undo;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        created = false;
                        if (scope === undefined) {
                            layer = this.global;
                        }
                        else {
                            existing = this.scoped.get(scope);
                            if (existing === undefined) {
                                layer = this.createLayer(scope);
                                this.scoped.set(scope, layer);
                                created = true;
                            }
                            else {
                                layer = existing;
                            }
                        }
                        try {
                            undo = action(layer);
                        }
                        catch (error) {
                            if (scope !== undefined && created && layer.isEmpty())
                                this.scoped.delete(scope);
                            throw error;
                        }
                        return [4 /*yield*/, function () {
                                undo();
                                if (scope !== undefined && layer.isEmpty())
                                    _this.scoped.delete(scope);
                                if (notify)
                                    _this.onChange();
                            }];
                    case 1:
                        _a.sent();
                        if (notify)
                            this.onChange();
                        return [2 /*return*/];
                }
            });
        }.bind(this), options.label);
        // oxlint-disable-next-line typescript/no-misused-promises -- exact synchronous disposer preserves Cordis effect identity
        return dispose;
    };
    return ScopedLayers;
}());
exports.ScopedLayers = ScopedLayers;
