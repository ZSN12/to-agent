"use strict";
/**
 * Service Definition for the `ctx.shell` capability seam, covering foreground commands and background process
 * handles. Job ids, ownership, polling, and notices belong to
 * `@z/dsh-jobs`, keeping executors independent of sessions.
 * @module @z/dsh-shell
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
exports.ShellExecutor = exports.parseExitStatus = exports.DSH_ENV_PREFIX = exports.SHELL_SETTINGS_NAMESPACE = void 0;
var cordis_1 = require("@z/cordis");
var dsh_settings_1 = require("@z/dsh-settings");
/**
 * Settings namespace of this capability, owned here rather than by either
 * executor family because it names the capability, not an implementation: a
 * host composes exactly one provider of `ctx.shell` (the win32 layer swaps the
 * POSIX rows for the pwsh ones, and mounting both fails loud on a duplicate
 * service registration), so the providers share one namespace without ever
 * registering it twice, and a settings document carried between platforms
 * keeps resolving on both.
 */
exports.SHELL_SETTINGS_NAMESPACE = (0, dsh_settings_1.settingsNamespace)('shell');
var types_ts_1 = require("./types.ts");
Object.defineProperty(exports, "DSH_ENV_PREFIX", { enumerable: true, get: function () { return types_ts_1.DSH_ENV_PREFIX; } });
var render_ts_1 = require("./render.ts");
Object.defineProperty(exports, "parseExitStatus", { enumerable: true, get: function () { return render_ts_1.parseExitStatus; } });
/**
 * Abstract bash execution service. Subclass, implement the abstract methods,
 * and load the subclass as a plugin — it registers as `ctx.shell` (one
 * implementation per context; loading a second throws, which is cordis'
 * standard duplicate-service behavior).
 *
 * Implementations must honor these semantics:
 * - {@link run} rejects only for infrastructure failures. Nonzero exits,
 *   timeout kills, and abort kills resolve with a {@link ShellRunResult}.
 * - {@link start} returns immediately; no timeout applies to background
 *   processes. `done` settles at process close and never rejects; spawn
 *   failures settle as `killed` with the error on stderr.
 * - {@link ShellProcess.readOutput} is incremental: consecutive reads never
 *   repeat output. Lossy reads report truncation and available spill files.
 * - A still-running background process is stopped and awaited when its
 *   owning composition tears down. With the subprocess seam that
 *   boundary is `ctx.subprocess` disposal, so a background process survives
 *   an executor-only reload.
 */
var ShellExecutor = /** @class */ (function (_super) {
    __extends(ShellExecutor, _super);
    function ShellExecutor(ctx) {
        return _super.call(this, ctx, 'shell') || this;
    }
    Object.defineProperty(ShellExecutor.prototype, "sandboxMode", {
        /**
         * The sandbox mode this executor applies by default, or `undefined` when it
         * does not sandbox commands.
         * @returns the configured default sandbox mode, when supported.
         */
        get: function () {
            return undefined;
        },
        enumerable: false,
        configurable: true
    });
    return ShellExecutor;
}(cordis_1.Service));
exports.ShellExecutor = ShellExecutor;
exports.default = ShellExecutor;
