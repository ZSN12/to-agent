"use strict";
/**
 * The background-job Service Definition (`ctx.jobs`). It owns the contract for
 * job ids, session-scoped access, lifecycle state, completion listeners, and
 * owner cleanup while producers retain their execution resources. The
 * process-local registry lives in `@z/dsh-jobs-local`.
 * @module @z/dsh-jobs
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
exports.JobRegistry = exports.JobId = void 0;
var cordis_1 = require("@z/cordis");
var types_ts_1 = require("./types.ts");
Object.defineProperty(exports, "JobId", { enumerable: true, get: function () { return types_ts_1.JobId; } });
/**
 * Abstract background job registry. Subclass, implement the abstract methods,
 * and load the subclass as a plugin — it registers as `ctx.jobs` (one
 * implementation per context; loading a second throws, which is cordis'
 * standard duplicate-service behavior).
 *
 * Implementations must honor these semantics:
 * - Registrations outlive producer and controller fibers. Owner and
 *   service disposal cancel live work and await compliant producers; a
 *   throwing teardown cancel force-fails only the record. Teardown
 *   cancellation also marks the record reported, because a record its owner
 *   is being destroyed for has no reader left.
 * - Owned-job access is fenced by the owner's session id. Ids are
 *   predictable, so authorization — not secrecy — is the boundary.
 * - Settlement is first-wins: one terminal record, released waiters, and one
 *   round of contained listener notification, even against a late producer
 *   outcome. Completion is announced last, after the record is committed and
 *   every other observer of the settlement has seen it, because a reporter
 *   may open a model turn synchronously.
 * - {@link start} refuses work while no attached job controller serves the
 *   spec's owner, so a producer cannot start work that owner cannot collect
 *   or stop. One registry serves every composition in the process, so this
 *   question — and completion-listener delivery — is owner-relative rather
 *   than process-wide: registrations made from an unscoped context serve
 *   every owner, and registrations made under an agent composition's scope
 *   serve exactly the agents composed under it.
 */
var JobRegistry = /** @class */ (function (_super) {
    __extends(JobRegistry, _super);
    function JobRegistry(ctx) {
        var _newTarget = this.constructor;
        // `abstract` erases at runtime, so a composition row naming this package
        // would register a ctx.jobs with no method implementations and fail far
        // from the misconfiguration. Fail loud at load instead.
        if (_newTarget === JobRegistry) {
            throw new Error('@z/dsh-jobs is the abstract job registry seam; load an implementation such as @z/dsh-jobs-local instead');
        }
        return _super.call(this, ctx, 'jobs') || this;
    }
    return JobRegistry;
}(cordis_1.Service));
exports.JobRegistry = JobRegistry;
exports.default = JobRegistry;
