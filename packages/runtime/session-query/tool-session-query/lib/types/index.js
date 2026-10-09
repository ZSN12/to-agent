"use strict";
/**
 * Model-facing, workspace-authorized session-history search and read tools.
 *
 * @module @z/dsh-tool-session-query
 */
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
exports.Config = exports.DEFAULT_SEARCH_TIMEOUT_MS = exports.DEFAULT_MAX_SEARCH_RESULTS = exports.inject = exports.name = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_timeout_1 = require("@z/dsh-timeout");
var dsh_tools_1 = require("@z/dsh-tools");
var input_ts_1 = require("./input.ts");
var operations_ts_1 = require("./operations.ts");
var presentation_ts_1 = require("./presentation.ts");
/** Cordis plugin name used by Loader diagnostics. */
exports.name = 'tool-session-query';
/** Capability services required by the model-facing consumer. */
exports.inject = ['tools', 'systemPrompt', 'sessionQuery'];
/** Default maximum number of authorized search hits returned by one call. */
exports.DEFAULT_MAX_SEARCH_RESULTS = 30;
/** Default cooperative deadline for either full-text search tool. */
exports.DEFAULT_SEARCH_TIMEOUT_MS = 30000;
/** Schemastery config for Loader defaults and generated configuration docs. */
exports.Config = schemastery_1.default.object({
    maxSearchResults: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_MAX_SEARCH_RESULTS),
    searchTimeoutMs: schemastery_1.default.number().step(1).min(1).max(dsh_timeout_1.MAX_TIMER_DELAY_MS).default(exports.DEFAULT_SEARCH_TIMEOUT_MS),
});
var TEXT_OUTPUT = {
    schema: { type: 'string' },
    render: function (_args, value) { return [{ type: 'text', text: value }]; },
};
var PROMPT_TEXT = 'Use session_search to find relevant work from prior sessions, or session_event_search to search earlier '
    + 'events in one session. Search results are cursor-free and workspace-scoped. Follow a useful hit with '
    + 'session_trace, session_event_trace, or session_event_read when you need lineage, relationships, or exact data.';
/** Register all five tools and their shared model guidance. */
function apply(ctx, config) {
    var resolved = resolveConfig(config);
    ctx.systemPrompt.section({
        name: 'tool:session-query',
        order: 113,
        text: PROMPT_TEXT,
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'session_search',
        description: 'Search prior sessions in the caller workspace and return the strongest matching event from each session.',
        parameters: input_ts_1.toolInput.sessionSearchParameters,
        output: TEXT_OUTPUT,
        timeoutMs: resolved.searchTimeoutMs,
        execute: function (args, exec) { return operations_ts_1.operations.executeSessionSearch(ctx, args, exec, resolved.maxSearchResults); },
        presentCall: presentation_ts_1.presentation.presentSessionSearchCall,
    }));
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'session_event_search',
        description: 'Search prior events in one authorized session; the current session excludes the step performing this call.',
        parameters: input_ts_1.toolInput.eventSearchParameters,
        output: TEXT_OUTPUT,
        timeoutMs: resolved.searchTimeoutMs,
        execute: function (args, exec) { return operations_ts_1.operations.executeEventSearch(ctx, args, exec, resolved.maxSearchResults); },
        presentCall: presentation_ts_1.presentation.presentEventSearchCall,
    }));
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'session_trace',
        description: 'Read the authorized session lineage around one session, including complete visible ancestor and descendant relationships.',
        parameters: input_ts_1.toolInput.targetSessionParameter,
        output: TEXT_OUTPUT,
        isConcurrencySafe: function () { return true; },
        execute: function (args, exec) { return operations_ts_1.operations.executeSessionTrace(ctx, args, exec); },
        presentCall: presentation_ts_1.presentation.presentSessionTraceCall,
    }));
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'session_event_trace',
        description: 'Read every direct replacement and relationship to a cited source event for one event in an authorized session.',
        parameters: __assign(__assign({}, input_ts_1.toolInput.targetSessionParameter), { seq: { type: 'integer', required: true, description: 'Target event sequence number.' } }),
        output: TEXT_OUTPUT,
        isConcurrencySafe: function () { return true; },
        execute: function (args, exec) { return operations_ts_1.operations.executeEventTrace(ctx, args, exec); },
        presentCall: function (args) { return presentation_ts_1.presentation.presentEventTargetCall('Trace event', args); },
    }));
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'session_event_read',
        description: 'Read one full unabridged event and optional neighboring raw-event summaries from an authorized session.',
        parameters: __assign(__assign({}, input_ts_1.toolInput.targetSessionParameter), { seq: { type: 'integer', required: true, description: 'Target event sequence number.' }, before: { type: 'integer', description: 'Number of preceding raw events to summarize. Omit for none.' }, after: { type: 'integer', description: 'Number of following raw events to summarize. Omit for none.' } }),
        output: TEXT_OUTPUT,
        isConcurrencySafe: function () { return true; },
        execute: function (args, exec) { return operations_ts_1.operations.executeEventRead(ctx, args, exec); },
        presentCall: function (args) { return presentation_ts_1.presentation.presentEventTargetCall('Read event', args); },
    }));
}
function resolveConfig(config) {
    var _a, _b;
    var maxSearchResults = (_a = config.maxSearchResults) !== null && _a !== void 0 ? _a : exports.DEFAULT_MAX_SEARCH_RESULTS;
    var searchTimeoutMs = (_b = config.searchTimeoutMs) !== null && _b !== void 0 ? _b : exports.DEFAULT_SEARCH_TIMEOUT_MS;
    if (!Number.isSafeInteger(maxSearchResults) || maxSearchResults < 1) {
        throw new TypeError('tool-session-query: maxSearchResults must be a positive safe integer');
    }
    if (!Number.isInteger(searchTimeoutMs) || searchTimeoutMs < 1 || searchTimeoutMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        throw new TypeError("tool-session-query: searchTimeoutMs must be a positive integer no greater than ".concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
    return { maxSearchResults: maxSearchResults, searchTimeoutMs: searchTimeoutMs };
}
