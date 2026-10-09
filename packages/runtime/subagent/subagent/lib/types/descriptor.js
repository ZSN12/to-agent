"use strict";
/**
 * The durable subagent-child descriptor: the versioned, model-hidden
 * `subagent/descriptor` session event that identifies every session-backed
 * subagent and records whether it is one-shot or continuable. Continuable
 * descriptors additionally preserve the declared composition required for
 * cold resume. Providers append it turn-enclosed in the child's initial turn.
 *
 * The descriptor deliberately snapshots explicit fields rather than the
 * merge-extensible `AgentOptions` object: an unrelated extension value cannot
 * make continuation fail merely because it is not JSON, and later composition
 * inputs require a deliberate {@link SUBAGENT_DESCRIPTOR_VERSION} change. It
 * omits `subagentDepth` — cold resume trusts the persisted header's
 * `delegationDepth` as the monotone floor — and `outputSchema`, which belongs
 * to one activation's result contract rather than durable child composition.
 * Per-activation knobs such as `maxTokens` are omitted for the same reason as
 * `outputSchema`: they budget one activation. Cold resume requires the exact
 * live parent for authorization but reconstructs child options only from the
 * durable descriptor, so it neither restores the prior budget nor inherits
 * the parent's current one; the resumed route's defaults apply instead.
 *
 * @module @z/dsh-subagent/descriptor
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
exports.SUBAGENT_DESCRIPTOR_VERSION = void 0;
exports.snapshotSubagentDescriptor = snapshotSubagentDescriptor;
exports.foldSubagentDescriptor = foldSubagentDescriptor;
var dsh_session_1 = require("@z/dsh-session");
/**
 * The current descriptor format version, stamped into every appended
 * `subagent/descriptor` event and required verbatim by {@link foldSubagentDescriptor}.
 * Supporting another composition input is a deliberate version change, never
 * an implicit extra field.
 */
exports.SUBAGENT_DESCRIPTOR_VERSION = 2;
var DESCRIPTOR_BASE_KEYS = [
    'version',
    'mode',
    'provider',
    'label',
];
var ONE_SHOT_DESCRIPTOR_KEYS = new Set(DESCRIPTOR_BASE_KEYS);
var CONTINUABLE_DESCRIPTOR_KEYS = new Set(__spreadArray(__spreadArray([], DESCRIPTOR_BASE_KEYS, true), [
    'agentProvider',
    'agentModel',
    'persona',
    'toolFilter',
], false));
var TOOL_FILTER_KEYS = new Set(['allow', 'deny']);
/** Whether a persisted JSON value is an object record. */
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Reject fields outside one versioned record's declared schema. */
function assertKnownKeys(value, keys, path) {
    var unknown = Object.keys(value).find(function (key) { return !keys.has(key); });
    if (unknown !== undefined) {
        throw new Error("persisted subagent descriptor ".concat(path, " has unknown field \"").concat(unknown, "\""));
    }
}
/** Read one optional string field from a persisted descriptor record. */
function optionalString(value, key) {
    if (!Object.hasOwn(value, key))
        return undefined;
    var field = value[key];
    if (typeof field !== 'string') {
        throw new Error("persisted subagent descriptor ".concat(key, " must be a string"));
    }
    return field;
}
/** Read one optional string-array field from a persisted tool restriction. */
function optionalStringArray(value, key) {
    if (!Object.hasOwn(value, key))
        return undefined;
    var field = value[key];
    if (!Array.isArray(field)) {
        throw new Error("persisted subagent descriptor toolFilter.".concat(key, " must be an array of strings"));
    }
    var items = field;
    if (items.some(function (item) { return typeof item !== 'string'; })) {
        throw new Error("persisted subagent descriptor toolFilter.".concat(key, " must be an array of strings"));
    }
    return items;
}
/** Validate and reconstruct a persisted tool restriction. */
function parseToolFilter(value) {
    if (!isRecord(value)) {
        throw new Error('persisted subagent descriptor toolFilter must be an object');
    }
    assertKnownKeys(value, TOOL_FILTER_KEYS, 'toolFilter');
    var allow = optionalStringArray(value, 'allow');
    var deny = optionalStringArray(value, 'deny');
    if (allow === undefined && deny === undefined) {
        throw new Error('persisted subagent descriptor toolFilter must declare allow and/or deny');
    }
    return __assign(__assign({}, allow !== undefined ? { allow: allow } : {}), deny !== undefined ? { deny: deny } : {});
}
/** Validate one persisted descriptor payload for the current runtime. */
function parseSubagentDescriptor(value) {
    if (!isRecord(value)) {
        throw new Error('persisted subagent descriptor payload must be an object');
    }
    var version = value['version'];
    if (typeof version !== 'number') {
        throw new Error('persisted subagent descriptor version must be a number');
    }
    if (version !== exports.SUBAGENT_DESCRIPTOR_VERSION)
        return undefined;
    var mode = value['mode'];
    if (mode !== 'one-shot' && mode !== 'continuable') {
        throw new Error('persisted subagent descriptor mode must be "one-shot" or "continuable"');
    }
    assertKnownKeys(value, mode === 'one-shot' ? ONE_SHOT_DESCRIPTOR_KEYS : CONTINUABLE_DESCRIPTOR_KEYS, 'payload');
    var provider = value['provider'];
    if (typeof provider !== 'string') {
        throw new Error('persisted subagent descriptor provider must be a string');
    }
    if (mode === 'one-shot') {
        var label_1 = optionalString(value, 'label');
        return __assign({ version: exports.SUBAGENT_DESCRIPTOR_VERSION, mode: mode, provider: provider }, label_1 !== undefined ? { label: label_1 } : {});
    }
    var label = value['label'];
    if (typeof label !== 'string') {
        throw new Error('persisted subagent descriptor label must be a string');
    }
    var agentProvider = optionalString(value, 'agentProvider');
    var agentModel = optionalString(value, 'agentModel');
    var persona = optionalString(value, 'persona');
    var toolFilter = Object.hasOwn(value, 'toolFilter')
        ? parseToolFilter(value['toolFilter'])
        : undefined;
    return __assign(__assign(__assign(__assign({ version: exports.SUBAGENT_DESCRIPTOR_VERSION, mode: mode, provider: provider, label: label }, agentProvider !== undefined ? { agentProvider: agentProvider } : {}), agentModel !== undefined ? { agentModel: agentModel } : {}), persona !== undefined ? { persona: persona } : {}), toolFilter !== undefined ? { toolFilter: toolFilter } : {});
}
function snapshotSubagentDescriptor(input) {
    var candidate = input.mode === 'one-shot'
        ? __assign({ version: exports.SUBAGENT_DESCRIPTOR_VERSION, mode: input.mode, provider: input.provider }, input.label !== undefined ? { label: input.label } : {}) : __assign(__assign(__assign(__assign({ version: exports.SUBAGENT_DESCRIPTOR_VERSION, mode: input.mode, provider: input.provider, label: input.label }, input.agentProvider !== undefined ? { agentProvider: input.agentProvider } : {}), input.agentModel !== undefined ? { agentModel: input.agentModel } : {}), input.persona !== undefined ? { persona: input.persona } : {}), input.toolFilter !== undefined ? { toolFilter: input.toolFilter } : {});
    var snapshot = (0, dsh_session_1.snapshotJsonValue)(candidate);
    if (snapshot === undefined) {
        throw new Error('subagent descriptor is not losslessly JSON-serializable');
    }
    return snapshot;
}
/**
 * Fold a persisted child log to its supported descriptor. The first
 * `subagent/descriptor` event is authoritative — the establishing provider
 * appends exactly one, so a later same-type event cannot rewrite the declared
 * composition.
 * @param events - the loaded child session events.
 * @returns the descriptor, or `undefined` when the log has none or its
 *   version is not {@link SUBAGENT_DESCRIPTOR_VERSION} (the child cannot be
 *   classified by this runtime).
 * @throws when a current-version persisted payload does not match its complete
 *   declared schema.
 */
function foldSubagentDescriptor(events) {
    var event = events.find(function (candidate) { return candidate.type === 'subagent/descriptor'; });
    if (event === undefined)
        return undefined;
    return parseSubagentDescriptor(event.data);
}
