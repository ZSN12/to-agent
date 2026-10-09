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
exports.ConversationViewRegistry = void 0;
var definition_registry_ts_1 = require("./definition-registry.ts");
/** Runtime registry of per-target Conversation snapshot builders. */
var ConversationViewRegistry = /** @class */ (function (_super) {
    __extends(ConversationViewRegistry, _super);
    /** @param ctx - owning Client Runtime context. */
    function ConversationViewRegistry(ctx) {
        return _super.call(this, ctx, 'conversationViews') || this;
    }
    /**
     * Register a uniquely named view builder factory for the caller's lifetime.
     * @param definition - target builder contribution.
     * @returns idempotent disposer.
     */
    ConversationViewRegistry.prototype.register = function (definition) {
        return this.registerDefinition(definition.target, definition, "conversation view target \"".concat(definition.target, "\" is already registered"), "conversationViews.register(".concat(JSON.stringify(definition.target), ")"));
    };
    return ConversationViewRegistry;
}(definition_registry_ts_1.ConversationDefinitionRegistry));
exports.ConversationViewRegistry = ConversationViewRegistry;
