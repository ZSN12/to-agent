"use strict";
/** Pure replay fold and strict decoder for durable goal changes. */
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
exports.emptyGoalFoldState = emptyGoalFoldState;
exports.decodeGoalChange = decodeGoalChange;
exports.goalChangeRef = goalChangeRef;
exports.applyGoalChange = applyGoalChange;
exports.applyGoalEvent = applyGoalEvent;
exports.foldGoal = foldGoal;
var runtime_ts_1 = require("./runtime.ts");
var SNAPSHOT_OPERATIONS = new Set([
    'create',
    'edit',
    'pause',
    'resume',
    'complete',
    'block',
]);
var PHASES = new Set(['active', 'paused', 'blocked', 'complete']);
/**
 * Build an empty replay accumulator.
 * @returns mutable state with no current goal or prior ref.
 */
function emptyGoalFoldState() {
    return {
        goal: undefined,
        roundsStarted: 0,
        createdAt: undefined,
        updatedAt: undefined,
        lastRef: undefined,
        seenGoalIds: new Set(),
    };
}
/** Whether a value is a JSON record rather than an array. */
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Require one positive safe integer. */
function positiveInteger(value, field) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
        throw new Error("goal change ".concat(field, " must be a positive safe integer"));
    }
    return value;
}
/** Require one non-negative safe integer. */
function nonNegativeInteger(value, field) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error("goal change ".concat(field, " must be a non-negative safe integer"));
    }
    return value;
}
/** Decode one canonical blocker explanation. */
function decodeBlockReason(value) {
    if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'code,message') {
        throw new Error('goal change goal.blockedReason must have exactly code and message fields');
    }
    if (typeof value['code'] !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value['code'])) {
        throw new Error('goal change goal.blockedReason.code must be lower-kebab-case');
    }
    if (typeof value['message'] !== 'string' || value['message'].trim().length === 0
        || value['message'] !== value['message'].trim()) {
        throw new Error('goal change goal.blockedReason.message must be non-empty and normalized');
    }
    return { code: value['code'], message: value['message'] };
}
/** Decode and validate one snapshot. */
function decodeSnapshot(value) {
    if (!isRecord(value))
        throw new Error('goal change goal must be a record');
    if (typeof value['id'] !== 'string' || value['id'].length === 0) {
        throw new Error('goal change goal.id must be a non-empty string');
    }
    if (typeof value['objective'] !== 'string' || value['objective'].trim().length === 0
        || value['objective'] !== value['objective'].trim()) {
        throw new Error('goal change goal.objective must be non-empty and normalized');
    }
    if (typeof value['phase'] !== 'string' || !PHASES.has(value['phase'])) {
        throw new Error('goal change goal.phase is invalid');
    }
    var phase = value['phase'];
    var expectedKeys = phase === 'blocked'
        ? 'blockedReason,id,maxGoalRounds,objective,phase,revision'
        : 'id,maxGoalRounds,objective,phase,revision';
    if (Object.keys(value).sort().join(',') !== expectedKeys) {
        throw new Error("goal change goal for phase ".concat(phase, " must have exactly ").concat(expectedKeys, " fields"));
    }
    return __assign({ id: (0, runtime_ts_1.GoalId)(value['id']), revision: positiveInteger(value['revision'], 'goal.revision'), objective: value['objective'], phase: phase, maxGoalRounds: positiveInteger(value['maxGoalRounds'], 'goal.maxGoalRounds') }, phase === 'blocked' ? { blockedReason: decodeBlockReason(value['blockedReason']) } : {});
}
/** Decode and validate one ref. */
function decodeRef(value) {
    if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'id,revision') {
        throw new Error('goal clear tombstone must have exactly id and revision fields');
    }
    if (typeof value['id'] !== 'string' || value['id'].length === 0) {
        throw new Error('goal clear tombstone id must be a non-empty string');
    }
    return { id: (0, runtime_ts_1.GoalId)(value['id']), revision: positiveInteger(value['revision'], 'cleared.revision') };
}
/**
 * Decode a value that declares itself as a goal change. Unrelated values
 * return `undefined`; malformed goal changes fail replay loudly.
 * @param value - candidate source change.
 * @returns validated goal change or `undefined` for another value kind.
 */
function decodeGoalChange(value) {
    if (!isRecord(value) || value['kind'] !== 'goal/change')
        return undefined;
    if (value['version'] !== runtime_ts_1.GOAL_CHANGE_VERSION) {
        throw new Error("unsupported goal change version ".concat(String(value['version'])));
    }
    if (value['operation'] === 'clear') {
        var allowed_1 = ['cleared', 'clearedAt', 'kind', 'operation', 'version'];
        if (Object.keys(value).sort().join(',') !== allowed_1.sort().join(',')) {
            throw new Error("goal clear change must have exactly ".concat(allowed_1.sort().join(','), " fields"));
        }
        return {
            kind: 'goal/change',
            version: runtime_ts_1.GOAL_CHANGE_VERSION,
            operation: 'clear',
            cleared: decodeRef(value['cleared']),
            clearedAt: nonNegativeInteger(value['clearedAt'], 'clearedAt'),
        };
    }
    if (typeof value['operation'] !== 'string'
        || !SNAPSHOT_OPERATIONS.has(value['operation'])) {
        throw new Error('goal change operation is invalid');
    }
    var allowed = ['createdAt', 'goal', 'kind', 'operation', 'roundsStarted', 'updatedAt', 'version'];
    if (Object.keys(value).sort().join(',') !== allowed.sort().join(',')) {
        throw new Error("goal snapshot change must have exactly ".concat(allowed.sort().join(','), " fields"));
    }
    var createdAt = nonNegativeInteger(value['createdAt'], 'createdAt');
    var updatedAt = nonNegativeInteger(value['updatedAt'], 'updatedAt');
    if (updatedAt < createdAt)
        throw new Error('goal change updatedAt cannot precede createdAt');
    return {
        kind: 'goal/change',
        version: runtime_ts_1.GOAL_CHANGE_VERSION,
        operation: value['operation'],
        goal: decodeSnapshot(value['goal']),
        roundsStarted: nonNegativeInteger(value['roundsStarted'], 'roundsStarted'),
        createdAt: createdAt,
        updatedAt: updatedAt,
    };
}
/** Narrow model attribution to a valid goal source. */
function goalSource(source) {
    if (source.kind !== 'goal')
        return undefined;
    if (typeof source.goalId !== 'string' || source.goalId.length === 0
        || !Number.isSafeInteger(source.revision) || source.revision < 1
        || !Number.isSafeInteger(source.round) || source.round < 1) {
        throw new Error('goal message source is invalid');
    }
    return source;
}
/** Require two snapshots to retain fields that only `edit` may replace. */
function requireSameDefinition(current, next, operation) {
    if (next.objective !== current.objective || next.maxGoalRounds !== current.maxGoalRounds) {
        throw new Error("goal ".concat(operation, " cannot change objective or maxGoalRounds"));
    }
}
/** Require one exact next revision of the current goal. */
function requireNextRevision(current, next, operation) {
    if (next.id !== current.id || next.revision !== current.revision + 1) {
        throw new Error("goal ".concat(operation, " must advance the current goal by one revision"));
    }
}
/** Validate one non-create snapshot operation against the preceding projection. */
function validateSnapshotTransition(state, change, current) {
    var next = change.goal;
    requireNextRevision(current, next, change.operation);
    /* v8 ignore next -- a current goal established by this fold always has an updatedAt */
    if (state.updatedAt === undefined)
        throw new Error('current goal fold lacks updatedAt');
    if (change.createdAt !== state.createdAt
        || change.updatedAt < state.updatedAt
        || change.roundsStarted !== state.roundsStarted) {
        throw new Error("goal ".concat(change.operation, " does not preserve the current counters and timestamps"));
    }
    switch (change.operation) {
        case 'edit':
            if (next.phase !== current.phase
                || JSON.stringify(next.blockedReason) !== JSON.stringify(current.blockedReason)) {
                throw new Error('goal edit cannot change phase or blocked reason');
            }
            break;
        case 'pause':
            requireSameDefinition(current, next, change.operation);
            if (current.phase !== 'active' || next.phase !== 'paused')
                throw new Error('goal pause has an invalid phase transition');
            break;
        case 'resume': {
            requireSameDefinition(current, next, change.operation);
            var resumable = new Set([
                'active',
                'paused',
                'blocked',
            ]);
            if (!resumable.has(current.phase) || next.phase !== 'active' || state.roundsStarted >= next.maxGoalRounds) {
                throw new Error('goal resume has an invalid phase transition or exhausted round budget');
            }
            break;
        }
        case 'complete':
            requireSameDefinition(current, next, change.operation);
            if (current.phase === 'complete' || next.phase !== 'complete')
                throw new Error('goal complete has an invalid phase transition');
            break;
        case 'block':
            requireSameDefinition(current, next, change.operation);
            if (current.phase !== 'active' || next.phase !== 'blocked')
                throw new Error('goal block has an invalid phase transition');
            break;
        /* v8 ignore start -- the caller excludes create and GoalOperation is closed; these arms retain fail-loud exhaustiveness */
        case 'create':
            throw new Error('goal create cannot be validated as a current-goal transition');
        default:
            change.operation;
            throw new Error('unknown goal snapshot operation');
        /* v8 ignore stop */
    }
}
/**
 * Return the revision identity carried by a snapshot or tombstone.
 * @param change - decoded goal mutation.
 * @returns stable identity used to reconcile a deferred change with its log event.
 */
function goalChangeRef(change) {
    return change.operation === 'clear'
        ? change.cleared
        : { id: change.goal.id, revision: change.goal.revision };
}
/**
 * Validate and apply one decoded change to a mutable accumulator.
 * @param state - preceding durable goal projection.
 * @param change - decoded full snapshot or clear tombstone.
 */
function applyGoalChange(state, change) {
    var ref = goalChangeRef(change);
    if (change.operation === 'clear') {
        var current = state.goal;
        if (current === undefined)
            throw new Error('goal clear requires a current goal');
        requireNextRevision(current, change.cleared, change.operation);
        /* v8 ignore next -- a current goal established by this fold always has an updatedAt */
        if (state.updatedAt === undefined)
            throw new Error('current goal fold lacks updatedAt');
        if (change.clearedAt < state.updatedAt) {
            throw new Error('goal clear timestamp cannot precede the current goal update');
        }
        state.goal = undefined;
        state.roundsStarted = 0;
        state.createdAt = undefined;
        state.updatedAt = undefined;
        state.lastRef = ref;
        return;
    }
    if (change.operation === 'create') {
        if (change.goal.revision !== 1 || change.goal.phase !== 'active' || change.roundsStarted !== 0
            || (state.goal !== undefined && state.goal.phase !== 'complete')
            || state.seenGoalIds.has(change.goal.id)) {
            throw new Error('goal create requires a fresh active revision-one goal with zero rounds');
        }
        state.seenGoalIds.add(change.goal.id);
    }
    else {
        var current = state.goal;
        if (current === undefined)
            throw new Error("goal ".concat(change.operation, " requires a current goal"));
        validateSnapshotTransition(state, change, current);
    }
    state.goal = change.goal;
    state.roundsStarted = change.roundsStarted;
    state.createdAt = change.createdAt;
    state.updatedAt = change.updatedAt;
    state.lastRef = ref;
}
/**
 * Apply one session event to the strict durable goal fold.
 * @param state - mutable fold accumulator.
 * @param event - next event in sequence order.
 */
function applyGoalEvent(state, event) {
    if (event.type === 'goal/change') {
        var change = decodeGoalChange(event.data);
        /* v8 ignore next -- the event's declared payload always identifies itself as a goal change. */
        if (change === undefined)
            throw new Error("goal change at session event ".concat(event.seq, " has an invalid kind"));
        applyGoalChange(state, change);
        return;
    }
    if (event.type === 'user/message') {
        var source = goalSource(event.data.source);
        if (source === undefined)
            return;
        var current = state.goal;
        if (current === undefined || current.phase !== 'active' || source.goalId !== current.id
            || source.revision !== current.revision || source.round !== state.roundsStarted + 1
            || source.round > current.maxGoalRounds) {
            throw new Error("goal round at session event ".concat(event.seq, " is not the next admitted round of the active goal"));
        }
        state.roundsStarted = source.round;
    }
}
/**
 * Fold current goal state from a contiguous session event log.
 * @param events - session events in sequence order.
 * @returns a fresh durable projection; activation is deliberately absent.
 */
function foldGoal(events) {
    var state = emptyGoalFoldState();
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        applyGoalEvent(state, event_1);
    }
    return __assign(__assign(__assign(__assign(__assign({}, state.goal === undefined ? {} : { goal: __assign({}, state.goal) }), { roundsStarted: state.roundsStarted }), state.createdAt === undefined ? {} : { createdAt: state.createdAt }), state.updatedAt === undefined ? {} : { updatedAt: state.updatedAt }), state.lastRef === undefined ? {} : { lastRef: __assign({}, state.lastRef) });
}
