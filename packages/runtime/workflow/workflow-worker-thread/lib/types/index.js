"use strict";
/**
 * Worker-thread workflow engine. Each run executes its model-written script in
 * an escapable vm context on a fresh worker and bridges `agent()` calls to host
 * subagents. The thread prevents synchronous script work from blocking the host
 * and permits forced termination, but it is containment rather than a security boundary.
 * @module @z/dsh-workflow-worker-thread
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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MaterializeError = exports.materializeFromRealm = exports.validateMeta = void 0;
var node_crypto_1 = require("node:crypto");
var node_os_1 = require("node:os");
var vm = require("node:vm");
var schemastery_1 = require("@z/schemastery");
var dsh_workflow_1 = require("@z/dsh-workflow");
var host_ts_1 = require("./host.ts");
var meta_ts_1 = require("./meta.ts");
var meta_ts_2 = require("./meta.ts");
Object.defineProperty(exports, "validateMeta", { enumerable: true, get: function () { return meta_ts_2.validateMeta; } });
var realm_ts_1 = require("./realm.ts");
Object.defineProperty(exports, "materializeFromRealm", { enumerable: true, get: function () { return realm_ts_1.materializeFromRealm; } });
Object.defineProperty(exports, "MaterializeError", { enumerable: true, get: function () { return realm_ts_1.MaterializeError; } });
/** A body that still carries the Claude Code-style meta header (meta rides the seam as data here). */
var META_STATEMENT = /^\s*export\s+const\s+meta\b/;
/**
 * Parse-check the body with the SAME wrapper the worker-side runtime
 * compiles, so `start()` keeps the seam's synchronous `SCRIPT_PARSE` throw
 * (the worker's own compile happens a thread away, after `start()` returned).
 * One redundant parse per run, bought deliberately for the contract. A body
 * opening with `export const meta` gets a pointed message instead of the
 * wrapper's bare SyntaxError — the model's likeliest authoring slip.
 */
function assertBodyParses(body, name) {
    if (META_STATEMENT.test(body)) {
        throw new dsh_workflow_1.WorkflowError('workflow meta rides the `meta` request field, not the script: remove the `export const meta = {...}` statement from the body', 'SCRIPT_PARSE');
    }
    try {
        // Parse only — the script object is discarded, nothing executes.
        void new vm.Script("(async () => {\n".concat(body, "\n})()"), { filename: "workflow:".concat(name), lineOffset: -1 });
    }
    catch (error) {
        throw new dsh_workflow_1.WorkflowError("workflow script does not parse: ".concat(String(error)), 'SCRIPT_PARSE', { cause: error });
    }
}
/** Resolve one run's provider route before publishing work. */
function resolveSubagentProvider(ctx, configured, override) {
    var provider = override !== null && override !== void 0 ? override : configured;
    if (provider.length === 0 || provider !== provider.trim()) {
        throw new dsh_workflow_1.WorkflowError('workflow subagentProvider must be a non-empty normalized string', 'INVALID_ARGUMENT');
    }
    if (ctx.subagents.getProvider(provider) === undefined) {
        throw new dsh_workflow_1.WorkflowError("no subagent provider registered for \"".concat(provider, "\""), 'AGENT_START');
    }
    return provider;
}
/** Resolve one run's total-child cap against the engine deployment ceiling. */
function resolveMaxTotalAgents(requested, ceiling) {
    if (requested === undefined)
        return ceiling;
    if (!Number.isSafeInteger(requested) || requested < 1) {
        throw new dsh_workflow_1.WorkflowError('workflow maxTotalAgents must be a positive safe integer', 'INVALID_ARGUMENT');
    }
    if (requested > ceiling) {
        throw new dsh_workflow_1.WorkflowError("workflow maxTotalAgents ".concat(requested, " exceeds the engine ceiling ").concat(ceiling), 'INVALID_ARGUMENT');
    }
    return requested;
}
/**
 * The worker-thread engine service. `start()` validates the script up front
 * (meta + a host-side body parse) and returns a {@link WorkflowRun} whose
 * `result` never rejects; the `workflow/*` events fire around the run per
 * the seam contract.
 */
var WorkerThreadWorkflowEngine = /** @class */ (function (_super) {
    __extends(WorkerThreadWorkflowEngine, _super);
    function WorkerThreadWorkflowEngine(ctx, config) {
        var _this = _super.call(this, ctx) || this;
        // schemastery (static Config) has already filled the defaulted fields;
        // the assertion records that resolution, not a hidden fallback.
        _this.config = config;
        return _this;
    }
    /**
     * Validate and execute a workflow script in a fresh worker thread. Throws
     * {@link WorkflowError} synchronously (`META_INVALID` for a malformed meta
     * block, `SCRIPT_PARSE` for a body that does not compile) for a request
     * that cannot begin; once a run is returned, every failure resolves through
     * `result.stopReason` instead.
     * @param request - the script body, its meta data and `args`, the parent
     *   agent, and an optional cancel signal.
     * @returns the live run (its `result` resolves when the script settles).
     */
    WorkerThreadWorkflowEngine.prototype.start = function (request) {
        var _this = this;
        var meta = (0, meta_ts_1.validateMeta)(request.meta);
        assertBodyParses(request.script, meta.name);
        var subagentProvider = resolveSubagentProvider(this.ctx, this.config.provider, request.subagentProvider);
        var maxTotalAgents = resolveMaxTotalAgents(request.maxTotalAgents, this.config.maxTotalAgents);
        var id = (0, dsh_workflow_1.WorkflowRunId)((0, node_crypto_1.randomUUID)());
        var info = { id: id, meta: meta };
        var limits = {
            maxConcurrentAgents: this.config.maxConcurrentAgents === 0
                ? Math.min(16, Math.max(1, (0, node_os_1.availableParallelism)() - 2))
                : this.config.maxConcurrentAgents,
            maxTotalAgents: maxTotalAgents,
            maxItemsPerCall: this.config.maxItemsPerCall,
            syncTimeoutMs: this.config.syncTimeoutMs,
        };
        var init = __assign(__assign({ meta: meta, body: request.script }, request.args !== undefined ? { args: request.args } : {}), { limits: limits });
        // Capture the dependency while this service call is still traced through
        // the start() holder. Cordis strips the engine-provider shadow when it
        // returns the SubagentRuntime handle, so an already-returned run can keep
        // starting children after an engine HMR unload removes ctx.workflowEngine.
        // Re-resolving `this.ctx.subagents` later from WorkerRun would instead walk
        // the now-inactive engine fiber and break the seam's holder-owned lifetime.
        var runCtx = this.ctx;
        var subagents = runCtx.subagents;
        var workerRun = new host_ts_1.WorkerRun(runCtx, subagents, id, meta, request.parent, init, subagentProvider, this.config.disposeGraceMs, {
            phase: function (title) { _this.emitWorkflowEvent('workflow/phase', info, title); },
            log: function (message) { _this.emitWorkflowEvent('workflow/log', info, message); },
            agentStart: function (agent) { _this.emitWorkflowEvent('workflow/agent-start', info, agent); },
            agentEnd: function (agent) { _this.emitWorkflowEvent('workflow/agent-end', info, agent); },
        }, request.signal);
        this.emitWorkflowEvent('workflow/start', info);
        // `workflow/end` fires as the (never-rejecting) result settles, with the
        // outcome DATA only — the value stays with the run's holder.
        void workerRun.result.then(function (settled) {
            _this.emitWorkflowEvent('workflow/end', info, __assign(__assign({ stopReason: settled.stopReason }, settled.error !== undefined ? { error: settled.error } : {}), { agentsStarted: settled.agentsStarted }));
        });
        return workerRun;
    };
    WorkerThreadWorkflowEngine.inject = ['subagents'];
    WorkerThreadWorkflowEngine.Config = schemastery_1.default.object({
        provider: schemastery_1.default.string().default('spawn'),
        maxConcurrentAgents: schemastery_1.default.natural().default(0),
        maxTotalAgents: schemastery_1.default.natural().min(1).default(1000),
        maxItemsPerCall: schemastery_1.default.natural().min(1).default(4096),
        syncTimeoutMs: schemastery_1.default.natural().min(1).default(5000),
        disposeGraceMs: schemastery_1.default.natural().default(5000),
    });
    return WorkerThreadWorkflowEngine;
}(dsh_workflow_1.default));
exports.default = WorkerThreadWorkflowEngine;
