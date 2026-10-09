"use strict";
/** Package-owned workflow lifecycle invariants. @module @z/dsh-workflow/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-workflow';
/** Cordis companion plugin name. */
exports.name = 'workflow-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Require every event for a run to retain its validated identity snapshot. */
function traceFor(traces, info, fail) {
    var trace = traces.get(info.id);
    if (trace === undefined)
        fail("workflow event has no matching workflow/start for run ".concat(JSON.stringify(info.id)));
    if (trace.meta !== JSON.stringify(info.meta)) {
        fail("workflow event meta diverges from workflow/start for run ".concat(JSON.stringify(info.id)));
    }
    return trace;
}
/** Assert the immutable identity fields shared by an agent pair. */
function validateAgentEnd(start, end, fail) {
    if (start.label !== end.label || start.phase !== end.phase || start.childId !== end.childId) {
        fail("workflow/agent-end identity diverges from workflow/agent-start for seq ".concat(end.seq));
    }
    var outcome = end.outcome;
    if (outcome !== 'completed' && outcome !== 'failed' && outcome !== 'cancelled') {
        fail("workflow/agent-end carries unknown outcome ".concat(JSON.stringify(outcome)));
    }
}
/** Validate a terminal result against the accumulated run trace. */
function validateWorkflowEnd(trace, result, fail) {
    if (trace.agents.size > 0)
        fail("workflow/end has ".concat(trace.agents.size, " agent call(s) without workflow/agent-end"));
    if (!Number.isSafeInteger(result.agentsStarted) || result.agentsStarted < trace.starts) {
        fail('workflow/end agentsStarted must be a safe integer covering every observed agent start');
    }
    if (result.stopReason === 'completed' ? result.error !== undefined : typeof result.error !== 'string') {
        fail('workflow/end error must be absent exactly for completed runs');
    }
}
/** Install workflow start/end and child-call pairing checks. */
var install = function (ctx, fail) {
    var traces = new Map();
    var stagedStarts = new WeakSet();
    var stagedAgentStarts = new WeakSet();
    var stagedAgentEnds = new WeakSet();
    var stagedEnds = new WeakSet();
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName === 'workflow/start') {
            var info_1 = args[0];
            if (String(info_1.id).length === 0 || info_1.meta.name.length === 0 || info_1.meta.description.length === 0) {
                fail('workflow/start id, meta.name, and meta.description must be non-empty');
            }
            if (traces.has(info_1.id))
                fail("workflow/start repeated run id ".concat(JSON.stringify(info_1.id)));
            stagedStarts.add(info_1);
            return;
        }
        if (!eventName.startsWith('workflow/'))
            return;
        var info = args[0];
        var trace = traceFor(traces, info, fail);
        if (eventName === 'workflow/agent-start') {
            var agent = args[1];
            if (!Number.isSafeInteger(agent.seq) || agent.seq < 1 || String(agent.childId).length === 0) {
                fail('workflow/agent-start seq must be positive and childId must be non-empty');
            }
            if (trace.agents.has(agent.seq))
                fail("workflow/agent-start repeated seq ".concat(agent.seq));
            stagedAgentStarts.add(agent);
            return;
        }
        if (eventName === 'workflow/agent-end') {
            var agent = args[1];
            var start = trace.agents.get(agent.seq);
            if (start === undefined)
                return fail("workflow/agent-end has no matching start for seq ".concat(agent.seq));
            validateAgentEnd(start, agent, fail);
            stagedAgentEnds.add(agent);
            return;
        }
        if (eventName === 'workflow/end') {
            var result = args[1];
            validateWorkflowEnd(trace, result, fail);
            stagedEnds.add(result);
        }
    }, { global: true });
    ctx.on('workflow/start', function (info) {
        /* v8 ignore next -- internal/dispatch stages the same run-info object */
        if (!stagedStarts.delete(info))
            return;
        traces.set(info.id, { meta: JSON.stringify(info.meta), agents: new Map(), starts: 0 });
    }, { global: true });
    ctx.on('workflow/agent-start', function (info, agent) {
        /* v8 ignore next -- internal/dispatch stages the same agent object */
        if (!stagedAgentStarts.delete(agent))
            return;
        var trace = traceFor(traces, info, fail);
        trace.agents.set(agent.seq, agent);
        trace.starts += 1;
    }, { global: true });
    ctx.on('workflow/agent-end', function (info, agent) {
        /* v8 ignore next -- internal/dispatch stages the same agent object */
        if (!stagedAgentEnds.delete(agent))
            return;
        traceFor(traces, info, fail).agents.delete(agent.seq);
    }, { global: true });
    ctx.on('workflow/end', function (info, result) {
        /* v8 ignore next -- internal/dispatch stages the same result object */
        if (!stagedEnds.delete(result))
            return;
        traces.delete(info.id);
    }, { global: true });
};
/**
 * Register the workflow invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
