"use strict";
/**
 * Pure session projections for subagent identity (mode/label) and active-turn
 * duration.
 *
 * @module @z/dsh-subagent/projection
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subagentIdentityProjectionDefinition = exports.subagentTimingProjectionDefinition = void 0;
var zod_1 = require("zod");
var descriptor_ts_1 = require("./descriptor.ts");
var activeIntervalSchema = zod_1.z.object({
    since: zod_1.z.number().int().nonnegative(),
    through: zod_1.z.number().int().nonnegative(),
}).strict();
var projectionSchema = zod_1.z.object({
    settledMs: zod_1.z.number().int().nonnegative(),
    active: activeIntervalSchema.optional(),
}).strict().transform(function (_a) {
    var settledMs = _a.settledMs, active = _a.active;
    return (__assign({ settledMs: settledMs }, active === undefined ? {} : { active: active }));
});
var timingStateSchema = zod_1.z.object({
    settledMs: zod_1.z.number().int().nonnegative(),
    active: activeIntervalSchema.optional(),
    pendingTurnStart: zod_1.z.number().int().nonnegative().optional(),
    descriptorSeen: zod_1.z.boolean(),
}).strict();
/**
 * Fold turn boundaries around the child's own durable descriptor.
 *
 * A fork seed may contain an ancestor descriptor and completed turns. Every
 * descriptor therefore resets the accumulated state; the healthy catalog
 * admits only a child with exactly one descriptor in its own suffix, making
 * the final reset the child's authoritative timing origin.
 */
exports.subagentTimingProjectionDefinition = {
    key: 'subagentTiming',
    stateSchema: timingStateSchema,
    init: function () { return ({ descriptorSeen: false, settledMs: 0 }); },
    apply: function (state, event) {
        var _a, _b;
        if (event.type === 'turn/start') {
            return state.descriptorSeen
                ? __assign(__assign({}, state), { active: { since: event.time, through: event.time } }) : __assign(__assign({}, state), { pendingTurnStart: event.time });
        }
        if (event.type === 'subagent/descriptor') {
            var activeSince = (_b = (_a = state.active) === null || _a === void 0 ? void 0 : _a.since) !== null && _b !== void 0 ? _b : state.pendingTurnStart;
            return __assign({ descriptorSeen: true, settledMs: 0 }, (activeSince === undefined
                ? {}
                : { active: { since: activeSince, through: event.time } }));
        }
        if (event.type === 'turn/end') {
            if (!state.descriptorSeen) {
                if (state.pendingTurnStart === undefined)
                    return state;
                var _closed = state.pendingTurnStart, next = __rest(state, ["pendingTurnStart"]);
                return next;
            }
            if (state.active === undefined)
                return state;
            var active = state.active, rest = __rest(state, ["active"]);
            return __assign(__assign({}, rest), { settledMs: state.settledMs + Math.max(0, event.time - active.since) });
        }
        if (state.active === undefined)
            return state;
        return __assign(__assign({}, state), { active: __assign(__assign({}, state.active), { through: event.time }) });
    },
    wire: {
        viewSchema: projectionSchema,
        view: function (state) { return (__assign({ settledMs: state.settledMs }, (state.active === undefined ? {} : { active: state.active }))); },
    },
    stateVersion: 2,
};
// The cast bridges only the optional-label arm: Zod's optional output
// includes explicit `undefined`, which exactOptionalPropertyTypes excludes
// from the public interface. The no-value state itself is the serializable
// `null` arm — never `undefined` — so every registry read and push frame
// survives JSON.stringify losslessly.
var identityValueSchema = zod_1.z.discriminatedUnion('mode', [
    zod_1.z.object({
        mode: zod_1.z.literal('one-shot'),
        label: zod_1.z.string().optional(),
        seq: zod_1.z.number().int().nonnegative(),
    }).strict(),
    zod_1.z.object({
        mode: zod_1.z.literal('continuable'),
        label: zod_1.z.string(),
        seq: zod_1.z.number().int().nonnegative(),
    }).strict(),
]);
var identitySchema = identityValueSchema.nullable();
var identityStateSchema = zod_1.z.object({
    identity: identityValueSchema.optional(),
}).strict();
/** Interpret one `subagent/descriptor` event's identity; no value when the payload cannot be trusted. */
function descriptorIdentity(event) {
    var descriptor;
    try {
        descriptor = (0, descriptor_ts_1.foldSubagentDescriptor)([event]);
    }
    catch (_a) {
        // Only a malformed current-version payload throws in descriptor parsing;
        // a projection fold must never throw, so damage folds to no value.
        descriptor = undefined;
    }
    if (descriptor === undefined)
        return undefined;
    return descriptor.mode === 'one-shot'
        ? __assign(__assign({ mode: 'one-shot' }, descriptor.label !== undefined ? { label: descriptor.label } : {}), { seq: event.seq }) : { mode: 'continuable', label: descriptor.label, seq: event.seq };
}
/**
 * Fold the durable mode/label identity from `subagent/descriptor` events,
 * last-wins: a fork seed may replay an ancestor's descriptor, and the child's
 * own descriptor must override it — the same reset discipline as
 * {@link subagentTimingProjectionDefinition}. A malformed or unknown-version
 * payload resets to the `null` sentinel instead of throwing, so a fork of a
 * healthy ancestor never inherits an identity its own descriptor failed to
 * establish — and the reset survives every JSON push frame, so a consumer
 * holding the earlier identity replaces it instead of keeping it stale;
 * `null` ⟺ no valid descriptor, with the causes deliberately undistinguished.
 */
exports.subagentIdentityProjectionDefinition = {
    key: 'subagent',
    stateSchema: identityStateSchema,
    init: function () { return ({}); },
    apply: function (state, event) {
        if (event.type !== 'subagent/descriptor')
            return state;
        var identity = descriptorIdentity(event);
        return identity === undefined ? {} : { identity: identity };
    },
    wire: { viewSchema: identitySchema, view: function (state) { var _a; return (_a = state.identity) !== null && _a !== void 0 ? _a : null; } },
    // Bumped when the identity gained its `seq` field: an older checkpoint row
    // would replay into a value the schema rejects, so it must refold instead.
    stateVersion: 2,
};
