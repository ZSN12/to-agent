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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationEventRegistry = void 0;
var definition_registry_ts_1 = require("./definition-registry.ts");
/** Runtime registry of independently owned Conversation business Definitions. */
var ConversationEventRegistry = /** @class */ (function (_super) {
    __extends(ConversationEventRegistry, _super);
    /** @param ctx - owning Client Runtime context. */
    function ConversationEventRegistry(ctx) {
        return _super.call(this, ctx, 'conversationEvents') || this;
    }
    /**
     * Register a uniquely named business Definition for the caller's lifetime.
     * @param definition - Definition contribution.
     * @returns idempotent disposer.
     */
    ConversationEventRegistry.prototype.register = function (definition) {
        assertDefinitionTarget(definition);
        return this.registerDefinition(definition.kind, definition, "conversation Definition \"".concat(definition.kind, "\" is already registered"), "conversationEvents.register(".concat(JSON.stringify(definition.kind), ")"));
    };
    /**
     * Register the sole fallback used only when no ordinary Definition matches.
     * @param definition - fallback Definition.
     * @returns idempotent disposer.
     */
    ConversationEventRegistry.prototype.registerFallback = function (definition) {
        var _this = this;
        assertDefinitionTarget(definition);
        var target = definition.target;
        if (target === undefined)
            throw new Error('conversation fallback Definition must declare a target');
        if (this.fallback !== undefined)
            throw new Error('conversation fallback Definition is already registered');
        var owner = this.ctx;
        var dispose = owner.effect(function () {
            _this.fallback = definition;
            _this.refresh();
            return function () {
                if (_this.fallback !== definition)
                    return;
                _this.fallback = undefined;
                _this.refresh();
            };
        }, "conversationEvents.registerFallback(".concat(JSON.stringify(definition.kind), ")"));
        return function () { void dispose(); };
    };
    /**
     * Return the current unmatched-event fallback.
     * @returns installed fallback, when present.
     */
    ConversationEventRegistry.prototype.fallbackEntry = function () {
        return this.fallback;
    };
    return ConversationEventRegistry;
}(definition_registry_ts_1.ConversationDefinitionRegistry));
exports.ConversationEventRegistry = ConversationEventRegistry;
function assertDefinitionTarget(definition) {
    if ((definition.target === undefined) !== (definition.buildViewNode === undefined)) {
        throw new Error("conversation Definition \"".concat(definition.kind, "\" must declare target and buildViewNode together"));
    }
}
