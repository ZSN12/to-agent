"use strict";
/** Read-only projection of the current Cordis Loader plugin entries. */
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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginInventoryGateway = void 0;
var dsh_typert_protocol_1 = require("@z/dsh-typert-protocol");
/** Brand an existing Loader-tree entry id at the owning boundary. */
function pluginEntryId(value) {
    return value;
}
/** Runtime mirror: FiberState is a cross-package const enum. */
var FIBER_STATE = {
    PENDING: 0,
    LOADING: 1,
    ACTIVE: 2,
    FAILED: 3,
    DISPOSED: 4,
    UNLOADING: 5,
};
/** Complete public projection of Cordis Fiber states. */
var FIBER_PHASE = (_a = {},
    _a[FIBER_STATE.PENDING] = 'pending',
    _a[FIBER_STATE.LOADING] = 'loading',
    _a[FIBER_STATE.ACTIVE] = 'active',
    _a[FIBER_STATE.FAILED] = 'failed',
    _a[FIBER_STATE.DISPOSED] = null,
    _a[FIBER_STATE.UNLOADING] = 'unloading',
    _a);
/** Remote-only service exposing the Loader's current non-group entry state. */
var PluginInventoryGateway = function () {
    var _a;
    var _classSuper = dsh_typert_protocol_1.TypertRemoteService;
    var _instanceExtraInitializers = [];
    var _list_decorators;
    return _a = /** @class */ (function (_super) {
            __extends(PluginInventoryGateway, _super);
            function PluginInventoryGateway(ctx) {
                var _this = _super.call(this, ctx, 'pluginInventory') || this;
                __runInitializers(_this, _instanceExtraInitializers);
                return _this;
            }
            /**
             * Read the Loader directly on every call. Cordis's internal plugin/status
             * events already maintain Entry.fiber and Fiber.state, so a second cache
             * would only add another lifecycle truth to keep synchronized.
             * @returns Current non-group Loader entries in Loader order.
             */
            PluginInventoryGateway.prototype.list = function () {
                var entries = [];
                for (var _i = 0, _b = this.ctx.loader.entries(); _i < _b.length; _i++) {
                    var entry = _b[_i];
                    if (entry.options.group)
                        continue;
                    entries.push({
                        entryId: pluginEntryId(entry.id),
                        moduleName: entry.options.name,
                        enabled: !entry.disabled,
                        fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state],
                    });
                }
                return { entries: entries };
            };
            return PluginInventoryGateway;
        }(_classSuper)),
        (function () {
            var _b;
            var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_b = _classSuper[Symbol.metadata]) !== null && _b !== void 0 ? _b : null) : void 0;
            _list_decorators = [(0, dsh_typert_protocol_1.Remote)('list')];
            __esDecorate(_a, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: function (obj) { return "list" in obj; }, get: function (obj) { return obj.list; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a.inject = ['loader'],
        _a;
}();
exports.PluginInventoryGateway = PluginInventoryGateway;
exports.default = PluginInventoryGateway;
