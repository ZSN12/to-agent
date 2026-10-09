"use strict";
/**
 * Service Definition for the workflow capability seam. Service Providers execute orchestration scripts;
 * observe-only lifecycle events never expose run control.
 * @module @z/dsh-workflow
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
exports.WorkflowEngine = exports.WorkflowError = exports.WorkflowRunId = void 0;
exports.isFatalWorkflowError = isFatalWorkflowError;
var cordis_1 = require("@z/cordis");
var dsh_llm_1 = require("@z/dsh-llm");
var types_ts_1 = require("./types.ts");
Object.defineProperty(exports, "WorkflowRunId", { enumerable: true, get: function () { return types_ts_1.WorkflowRunId; } });
/**
 * Typed error for workflow-seam failures. Extends {@link HarnessError}, so the
 * `code` is machine-routable taxonomy. `fatal` drives the combinator
 * discipline: `parallel()`/`pipeline()` re-throw a fatal error (a typo'd
 * option or a tripped cap must kill the script loudly), and reserve the
 * per-item `null` for child-run failures and ordinary in-stage script errors.
 * Every {@link WorkflowErrorCode} is fatal; the flag exists so the
 * distinction is explicit at every catch site rather than implied.
 */
var WorkflowError = /** @class */ (function (_super) {
    __extends(WorkflowError, _super);
    function WorkflowError(message, code, options) {
        var _a;
        var _this = _super.call(this, message, code, options) || this;
        _this.name = 'WorkflowError';
        _this.fatal = (_a = options === null || options === void 0 ? void 0 : options.fatal) !== null && _a !== void 0 ? _a : true;
        return _this;
    }
    return WorkflowError;
}(dsh_llm_1.HarnessError));
exports.WorkflowError = WorkflowError;
/**
 * Whether combinators must re-throw `error` instead of mapping the item to `null`.
 * @param error - any thrown value; fatality is host `instanceof` (unforgeable from a script realm).
 * @returns true iff `error` is a {@link WorkflowError} whose `fatal` flag is set.
 */
function isFatalWorkflowError(error) {
    return error instanceof WorkflowError && error.fatal;
}
/**
 * Workflow Service Definition contract. Invalid requests throw before publication; a live
 * run is holder-owned, its result never rejects, cancellation and disposal are
 * bounded, and disposal waits for child cleanup within that bound. Lifecycle
 * listener failures are contained, and `workflow/end` fires exactly once as the
 * result settles.
 */
var WorkflowEngine = /** @class */ (function (_super) {
    __extends(WorkflowEngine, _super);
    function WorkflowEngine(ctx) {
        return _super.call(this, ctx, 'workflowEngine') || this;
    }
    /**
     * Emit a lifecycle event while containing and logging each listener failure.
     * @param name - the `workflow/*` event to dispatch.
     * @param args - the event's payload, matching its declared signature.
     */
    WorkflowEngine.prototype.emitWorkflowEvent = function (name) {
        var _this = this;
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        for (var _a = 0, _b = this.ctx.events.dispatch('emit', __spreadArray([name], args, true)); _a < _b.length; _a++) {
            var callback = _b[_a];
            try {
                var returned = callback.apply(void 0, args);
                void Promise.resolve(returned).catch(function (error) {
                    _this.ctx.logger.warn("workflow: ".concat(name, " listener rejected: ").concat(renderListenerError(error)));
                });
            }
            catch (error) {
                this.ctx.logger.warn("workflow: ".concat(name, " listener threw: ").concat(renderListenerError(error)));
            }
        }
    };
    return WorkflowEngine;
}(cordis_1.Service));
exports.WorkflowEngine = WorkflowEngine;
/**
 * Render any thrown value without violating listener containment.
 * @param error - any thrown value.
 * @returns `String(error)`, or a fixed label when even coercion throws.
 */
function renderListenerError(error) {
    try {
        return String(error);
    }
    catch (_a) {
        // String coercion itself may throw.
        return '[unrenderable thrown value]';
    }
}
exports.default = WorkflowEngine;
