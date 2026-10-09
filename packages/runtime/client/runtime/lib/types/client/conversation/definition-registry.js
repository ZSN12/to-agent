"use strict";
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
exports.ConversationDefinitionRegistry = void 0;
var cordis_1 = require("@z/cordis");
/** Shared lifecycle and stable-entry storage for one Conversation Definition registry. */
var ConversationDefinitionRegistry = /** @class */ (function (_super) {
    __extends(ConversationDefinitionRegistry, _super);
    function ConversationDefinitionRegistry() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.definitions = new Map();
        _this.listeners = new Set();
        _this.cached = [];
        return _this;
    }
    /**
     * Return reference-stable Definitions in registration order.
     * @returns current Definitions.
     */
    ConversationDefinitionRegistry.prototype.entries = function () {
        return this.cached;
    };
    /**
     * Observe low-frequency registry changes.
     * @param listener - synchronous invalidation callback.
     * @returns unsubscribe callback.
     */
    ConversationDefinitionRegistry.prototype.subscribe = function (listener) {
        var _this = this;
        this.listeners.add(listener);
        return function () { _this.listeners.delete(listener); };
    };
    /**
     * Register one uniquely keyed Definition for the caller's lifetime.
     * @param key - registry-local unique key.
     * @param definition - contributed Definition.
     * @param duplicateMessage - error raised when the key is already owned.
     * @param effectName - Cordis effect diagnostic label.
     * @returns idempotent disposer.
     */
    ConversationDefinitionRegistry.prototype.registerDefinition = function (key, definition, duplicateMessage, effectName) {
        var _this = this;
        if (this.definitions.has(key))
            throw new Error(duplicateMessage);
        var owner = this.ctx;
        var dispose = owner.effect(function () {
            _this.definitions.set(key, definition);
            _this.refresh();
            return function () {
                if (_this.definitions.get(key) !== definition)
                    return;
                _this.definitions.delete(key);
                _this.refresh();
            };
        }, effectName);
        return function () { void dispose(); };
    };
    /** Refresh cached entries and synchronously invalidate subscribers. */
    ConversationDefinitionRegistry.prototype.refresh = function () {
        this.cached = __spreadArray([], this.definitions.values(), true);
        for (var _i = 0, _a = this.listeners; _i < _a.length; _i++) {
            var listener = _a[_i];
            listener();
        }
    };
    return ConversationDefinitionRegistry;
}(cordis_1.Service));
exports.ConversationDefinitionRegistry = ConversationDefinitionRegistry;
