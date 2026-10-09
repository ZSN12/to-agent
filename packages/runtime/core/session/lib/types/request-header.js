"use strict";
/**
 * Request-header reconstruction utilities over full `request/header` session
 * events. Anyone holding a session log reconstructs the {@link EpochHeader}
 * any request was built under by taking the latest canonical snapshot; the
 * loop uses the same equality helper to avoid logging unchanged headers.
 *
 * @module dsh-session/request-header
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
exports.canonicalHeader = canonicalHeader;
exports.headerEquals = headerEquals;
exports.foldRequestHeader = foldRequestHeader;
var dsh_llm_1 = require("@z/dsh-llm");
/**
 * Normalize a header to canonical form: an empty system prompt and empty tool
 * list become absent fields, matching how requests are built. Logging, folding,
 * and comparison use this one representation.
 * @param header - the header to normalize (not mutated).
 * @returns the canonical header.
 */
function canonicalHeader(header) {
    var adapterDefaults = header.adapterDefaults;
    return __assign(__assign(__assign({ config: header.config }, (adapterDefaults === null || adapterDefaults === void 0 ? void 0 : adapterDefaults.reasoningEffort) === true || (adapterDefaults === null || adapterDefaults === void 0 ? void 0 : adapterDefaults.maxTokens) === true
        ? { adapterDefaults: adapterDefaults }
        : {}), header.system !== undefined && header.system.length > 0 ? { system: header.system } : {}), header.tools !== undefined && header.tools.length > 0 ? { tools: header.tools } : {});
}
/** Canonical JSON equality for tool schemas assembled through the same path. */
function sameSchema(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
/**
 * Field-wise equality over canonical headers. Tool schemas compare in order.
 * @param a - one canonical header.
 * @param b - the other.
 * @returns whether config, system, and tools all match.
 */
function headerEquals(a, b) {
    var _a, _b, _c, _d, _e, _f;
    if (!(0, dsh_llm_1.callConfigEquals)(a.config, b.config)
        || ((_a = a.adapterDefaults) === null || _a === void 0 ? void 0 : _a.reasoningEffort) !== ((_b = b.adapterDefaults) === null || _b === void 0 ? void 0 : _b.reasoningEffort)
        || ((_c = a.adapterDefaults) === null || _c === void 0 ? void 0 : _c.maxTokens) !== ((_d = b.adapterDefaults) === null || _d === void 0 ? void 0 : _d.maxTokens)
        || a.system !== b.system)
        return false;
    var at = (_e = a.tools) !== null && _e !== void 0 ? _e : [];
    var bt = (_f = b.tools) !== null && _f !== void 0 ? _f : [];
    return at.length === bt.length && at.every(function (tool, i) { return sameSchema(tool, bt[i]); });
}
/**
 * Fold the header events of a log (or any prefix) into the
 * {@link EpochHeader} in force after the last snapshot. Non-header events are
 * skipped. This is the pure offline reconstruction path; the live session
 * tracks the same fold incrementally.
 * @param events - session events in log order.
 * @param from - a previously folded state to continue from.
 * @returns the latest canonical header, or undefined when none exists yet.
 */
function foldRequestHeader(events, from) {
    var state = from;
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        if (event_1.type === 'request/header')
            state = canonicalHeader(event_1.data.header);
    }
    return state;
}
