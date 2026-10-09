"use strict";
/**
 * SessionTelemetryBackend Service Definition for the DeepSeek Harness.
 *
 * This package owns the CAPTURE side of session-event reporting — which records
 * exist (the chunk projection), what they carry (the logical record), when
 * they are captured (adoption, the per-append firehose, lifecycle
 * forwarding), live versus on-demand canonical-log capture, and the HMR
 * cursor. Everything downstream of
 * {@link SessionTelemetryBackend.emit} — batching, retry, queueing, and loss policy — is the
 * reporting SDK's territory and is deliberately not modelled here. The
 * design and its trade-offs are pinned in
 * .agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md.
 *
 * @module @z/dsh-session-telemetry
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
exports.SessionTelemetryCoordinator = exports.SessionTelemetryBackend = void 0;
var cordis_1 = require("@z/cordis");
/**
 * Loadable form of the backend contract: one implementation per context —
 * the cordis `Service` registration under the `telemetry` key throws on a
 * duplicate, cordis' standard behavior. A backend composes a
 * {@link SessionTelemetryCoordinator} in its constructor to install the capture side.
 */
var SessionTelemetryBackend = /** @class */ (function (_super) {
    __extends(SessionTelemetryBackend, _super);
    function SessionTelemetryBackend(ctx) {
        return _super.call(this, ctx, 'sessionTelemetry') || this;
    }
    return SessionTelemetryBackend;
}(cordis_1.Service));
exports.SessionTelemetryBackend = SessionTelemetryBackend;
var coordinator_ts_1 = require("./coordinator.ts");
Object.defineProperty(exports, "SessionTelemetryCoordinator", { enumerable: true, get: function () { return coordinator_ts_1.SessionTelemetryCoordinator; } });
