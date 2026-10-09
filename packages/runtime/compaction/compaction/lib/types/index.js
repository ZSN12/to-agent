"use strict";
/**
 * Compaction Service Definition (`ctx.compaction`): providers decide when to
 * compact and replace a history range with one summary node by subclassing
 * {@link CompactionEngine}. This interface necessarily depends on session and LLM
 * vocabulary; the rationale is in the
 * [compaction Agent Note](../../../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md).
 * @module @z/dsh-compaction
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompactionEngine = exports.ManualCompactionError = exports.isCompactCheckpointSource = exports.compactCheckpointSource = exports.toolPairingBalancedBefore = exports.toolPairingBalancedAfter = exports.CompactionId = void 0;
var cordis_1 = require("@z/cordis");
var brand_ts_1 = require("./brand.ts");
Object.defineProperty(exports, "CompactionId", { enumerable: true, get: function () { return brand_ts_1.CompactionId; } });
var tool_pairing_ts_1 = require("./tool-pairing.ts");
Object.defineProperty(exports, "toolPairingBalancedAfter", { enumerable: true, get: function () { return tool_pairing_ts_1.toolPairingBalancedAfter; } });
Object.defineProperty(exports, "toolPairingBalancedBefore", { enumerable: true, get: function () { return tool_pairing_ts_1.toolPairingBalancedBefore; } });
// The checkpoint source constructor and predicate are declared on the cordis-free
// `./checkpoint` leaf so client and wire programs can name them without this
// root's Context merge; the root stays the host-side entry point for both.
var checkpoint_ts_1 = require("./checkpoint.ts");
Object.defineProperty(exports, "compactCheckpointSource", { enumerable: true, get: function () { return checkpoint_ts_1.compactCheckpointSource; } });
Object.defineProperty(exports, "isCompactCheckpointSource", { enumerable: true, get: function () { return checkpoint_ts_1.isCompactCheckpointSource; } });
/**
 * Expected manual-compaction failure suitable for a direct human-command result.
 * Shared durable-lock entry assertions may also throw the `busy` subtype from
 * automatic compaction paths.
 */
var ManualCompactionError = /** @class */ (function (_super) {
    __extends(ManualCompactionError, _super);
    /**
     * Create one classified compaction failure.
     * @param code - stable failure class; `busy` may originate from any compaction entry path.
     * @param message - backend diagnostic retained as the Error message.
     * @param options - optional original failure.
     */
    function ManualCompactionError(code, message, options) {
        var _this = _super.call(this, message, options) || this;
        _this.code = code;
        _this.name = 'ManualCompactionError';
        return _this;
    }
    return ManualCompactionError;
}(Error));
exports.ManualCompactionError = ManualCompactionError;
/**
 * Abstract compaction service. Implementations own trigger policy, retention,
 * and summarization, and may consume a separate measurement service. A
 * successful run replaces the selected surface span with one summary node and
 * prevents concurrent compaction of the same session. The replacement user
 * message uses {@link compactCheckpointSource} with the transaction identity
 * so consumers recognize and correlate it independently of the backend. Load
 * one implementation per context as `ctx.compaction`.
 */
var CompactionEngine = /** @class */ (function (_super) {
    __extends(CompactionEngine, _super);
    function CompactionEngine(ctx) {
        return _super.call(this, ctx, 'compaction') || this;
    }
    return CompactionEngine;
}(cordis_1.Service));
exports.CompactionEngine = CompactionEngine;
exports.default = CompactionEngine;
