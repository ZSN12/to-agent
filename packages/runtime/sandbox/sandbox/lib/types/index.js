"use strict";
/**
 * Service Definition for the same-world process-confinement capability seam: wrap exact subprocess argv under a
 * host-path file policy. Containers, microVMs, and remote execution replace the
 * surrounding capability seam instead; this service shares the host kernel and filesystem.
 * @module @z/dsh-sandbox
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
exports.SandboxProvider = exports.SandboxUnavailableError = exports.SANDBOX_UNAVAILABLE = exports.writableRoots = exports.canonicalPath = exports.validateEscalationArgs = exports.sandboxDenialMarker = exports.escalationHintMarker = exports.approveEscalation = exports.WIDER_MODES = exports.ESCALATION_TARGETS = void 0;
var cordis_1 = require("@z/cordis");
var dsh_llm_1 = require("@z/dsh-llm");
var escalation_ts_1 = require("./escalation.ts");
Object.defineProperty(exports, "ESCALATION_TARGETS", { enumerable: true, get: function () { return escalation_ts_1.ESCALATION_TARGETS; } });
Object.defineProperty(exports, "WIDER_MODES", { enumerable: true, get: function () { return escalation_ts_1.WIDER_MODES; } });
Object.defineProperty(exports, "approveEscalation", { enumerable: true, get: function () { return escalation_ts_1.approveEscalation; } });
Object.defineProperty(exports, "escalationHintMarker", { enumerable: true, get: function () { return escalation_ts_1.escalationHintMarker; } });
Object.defineProperty(exports, "sandboxDenialMarker", { enumerable: true, get: function () { return escalation_ts_1.sandboxDenialMarker; } });
Object.defineProperty(exports, "validateEscalationArgs", { enumerable: true, get: function () { return escalation_ts_1.validateEscalationArgs; } });
var roots_ts_1 = require("./roots.ts");
Object.defineProperty(exports, "canonicalPath", { enumerable: true, get: function () { return roots_ts_1.canonicalPath; } });
Object.defineProperty(exports, "writableRoots", { enumerable: true, get: function () { return roots_ts_1.writableRoots; } });
/**
 * Error code for a requested confined mode when no backend is usable. The
 * provider fails closed, and `HarnessError` carries the code through
 * `tool/result` so callers can distinguish missing confinement from command
 * failure.
 */
exports.SANDBOX_UNAVAILABLE = 'SANDBOX_UNAVAILABLE';
/**
 * Thrown when {@link SandboxProvider.confine} cannot enforce the requested
 * mode. Carries {@link SANDBOX_UNAVAILABLE} through the structured error
 * channel.
 */
var SandboxUnavailableError = /** @class */ (function (_super) {
    __extends(SandboxUnavailableError, _super);
    function SandboxUnavailableError(mode, detail) {
        var _this = _super.call(this, "sandbox mode \"".concat(mode, "\" is requested but no sandbox backend is usable on this host; ")
            + 'refusing to run the command unconfined. Install bubblewrap or run a Landlock-enforcing '
            + 'kernel (Linux), ensure sandbox-exec is usable (macOS), or ensure the ACL '
            + 'restricted-token runner can start (Windows) — otherwise switch the consumer to '
            + 'danger-full-access.'
            + (detail === undefined ? '' : " Runner failure: ".concat(detail)), exports.SANDBOX_UNAVAILABLE) || this;
        _this.name = 'SandboxUnavailableError';
        return _this;
    }
    return SandboxUnavailableError;
}(dsh_llm_1.HarnessError));
exports.SandboxUnavailableError = SandboxUnavailableError;
/**
 * Abstract process-sandbox service. {@link confine} must return enforcing argv
 * or fail closed at wrap or runner-execution time; silent unconfined passthrough
 * is forbidden. Functional probes arbitrate multi-runner chains and may be
 * skipped for a sole candidate, whose own refusal remains the fail-closed end.
 */
var SandboxProvider = /** @class */ (function (_super) {
    __extends(SandboxProvider, _super);
    /* v8 ignore next -- abstract service construction is covered through concrete provider packages. */
    function SandboxProvider(ctx) {
        return _super.call(this, ctx, 'sandbox') || this;
    }
    return SandboxProvider;
}(cordis_1.Service));
exports.SandboxProvider = SandboxProvider;
exports.default = SandboxProvider;
