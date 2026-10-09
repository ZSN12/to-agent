"use strict";
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
exports.ConversationLocationIndex = void 0;
var MutableLocationDataStore = /** @class */ (function () {
    function MutableLocationDataStore() {
        this.entries = new Map();
    }
    MutableLocationDataStore.prototype.get = function (key) {
        var _a;
        return (_a = this.entries.get(key)) === null || _a === void 0 ? void 0 : _a.value;
    };
    MutableLocationDataStore.prototype.remove = function (owner, key) {
        var current = this.entries.get(key);
        if ((current === null || current === void 0 ? void 0 : current.owner) !== owner)
            return false;
        this.entries.delete(key);
        return true;
    };
    MutableLocationDataStore.prototype.set = function (owner, key, value) {
        var current = this.entries.get(key);
        if (current !== undefined && current.owner !== owner) {
            throw new Error("conversation Location data \"".concat(key, "\" is already owned by ").concat(current.owner));
        }
        if ((current === null || current === void 0 ? void 0 : current.value) === value)
            return false;
        this.entries.set(key, { owner: owner, value: value });
        return true;
    };
    MutableLocationDataStore.prototype.replace = function (entries) {
        var changed = this.entries.size !== entries.size;
        if (!changed) {
            for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
                var _a = entries_1[_i], key = _a[0], value = _a[1];
                var current = this.entries.get(key);
                if ((current === null || current === void 0 ? void 0 : current.owner) !== value.owner || current.value !== value.value) {
                    changed = true;
                    break;
                }
            }
        }
        if (changed)
            this.entries = new Map(entries);
        return changed;
    };
    return MutableLocationDataStore;
}());
var SESSION_LOCATION = { kind: 'session' };
var UNRESOLVED_LOCATION = { kind: 'unresolved' };
function payloadCoordinates(event) {
    var data = event.data;
    if (data.turn === null)
        return { session: true };
    var turn = Number.isSafeInteger(data.turn) && data.turn >= 0
        ? data.turn
        : undefined;
    var step = Number.isSafeInteger(data.step) && data.step >= 0
        ? data.step
        : undefined;
    return __assign(__assign({}, turn === undefined ? {} : { turn: turn }), step === undefined ? {} : { step: step });
}
function sameReferences(left, right) {
    return left.length === right.length && left.every(function (value, index) { return value === right[index]; });
}
function sameStep(left, right) {
    return left !== undefined
        && left.start === right.start && left.end === right.end && left.status === right.status
        && left.data === right.data;
}
function sameTurn(left, right) {
    return left !== undefined
        && left.start === right.start && left.end === right.end && left.status === right.status
        && left.data === right.data && sameReferences(left.steps, right.steps);
}
function sameLocation(left, right) {
    if (left === undefined || right === undefined || left.kind !== right.kind)
        return left === right;
    if (left.kind === 'session' || left.kind === 'unresolved')
        return true;
    if (right.kind === 'session' || right.kind === 'unresolved')
        return false;
    if (left.kind === 'turn' || right.kind === 'turn') {
        return left.kind === 'turn' && right.kind === 'turn' && left.turn === right.turn;
    }
    return left.turn === right.turn && left.step === right.step;
}
/** Session-owned Turn/Step timeline and event-to-Location index. */
var ConversationLocationIndex = /** @class */ (function () {
    function ConversationLocationIndex() {
        this.coordinates = new Map();
        this.locations = new Map();
        this.seqsByTurn = new Map();
        this.timeline = { turnOrder: [], turns: new Map() };
        this.turnDataStores = new Map();
        this.stepDataStores = new Map();
    }
    /**
     * Return the current reference-stable timeline.
     * @returns current timeline snapshot.
     */
    ConversationLocationIndex.prototype.snapshot = function () {
        return this.timeline;
    };
    /**
     * Replace all Definition-owned Location values while preserving reader identities.
     * @param entries - complete current set of Definition-owned Location values.
     * @returns whether any published Location data changed.
     */
    ConversationLocationIndex.prototype.replaceData = function (entries) {
        var _a, _b, _c, _d;
        var turns = new Map();
        var steps = new Map();
        for (var _i = 0, entries_2 = entries; _i < entries_2.length; _i++) {
            var _e = entries_2[_i], owner = _e.owner, data = _e.data;
            var values = data.kind === 'turn'
                ? (_a = turns.get(data.turn)) !== null && _a !== void 0 ? _a : new Map()
                : (_b = steps.get(stepDataKey(data.turn, requireStep(data)))) !== null && _b !== void 0 ? _b : new Map();
            var current = values.get(data.key);
            if (current !== undefined && current.owner !== owner) {
                throw new Error("conversation Location data \"".concat(data.key, "\" is already owned by ").concat(current.owner));
            }
            values.set(data.key, { owner: owner, value: data.value });
            if (data.kind === 'turn')
                turns.set(data.turn, values);
            else
                steps.set(stepDataKey(data.turn, requireStep(data)), values);
        }
        var changed = false;
        for (var _f = 0, _g = new Set(__spreadArray(__spreadArray([], this.turnDataStores.keys(), true), turns.keys(), true)); _f < _g.length; _f++) {
            var turn = _g[_f];
            changed = this.mutableTurnData(turn).replace((_c = turns.get(turn)) !== null && _c !== void 0 ? _c : new Map()) || changed;
        }
        for (var _h = 0, _j = new Set(__spreadArray(__spreadArray([], this.stepDataStores.keys(), true), steps.keys(), true)); _h < _j.length; _h++) {
            var step = _j[_h];
            changed = this.mutableStepData(step).replace((_d = steps.get(step)) !== null && _d !== void 0 ? _d : new Map()) || changed;
        }
        return changed;
    };
    /**
     * Apply changed Context publications without rebuilding Turn/Step membership.
     * @param changes - incremental removals and replacements from published Contexts.
     * @returns whether any published Location data changed.
     */
    ConversationLocationIndex.prototype.applyData = function (changes) {
        var changed = false;
        for (var _i = 0, changes_1 = changes; _i < changes_1.length; _i++) {
            var change = changes_1[_i];
            var previous = change.previous;
            if (previous === null)
                continue;
            changed = this.storeFor(previous).remove(change.owner, previous.key) || changed;
        }
        for (var _a = 0, changes_2 = changes; _a < changes_2.length; _a++) {
            var change = changes_2[_a];
            var next = change.next;
            if (next === null)
                continue;
            changed = this.storeFor(next).set(change.owner, next.key, next.value) || changed;
        }
        return changed;
    };
    /**
     * Resolve the latest Location for one event.
     * @param event - event already ingested into this index.
     * @returns current Location, falling back to session when it has no Turn/Step affinity.
     */
    ConversationLocationIndex.prototype.locationOf = function (event) {
        var _a;
        return (_a = this.locations.get(event.seq)) !== null && _a !== void 0 ? _a : SESSION_LOCATION;
    };
    /**
     * Rebuild timeline facts after replace/prepend or a boundary append.
     * @param entries - complete current window in ascending seq order.
     * @returns seqs whose resolved Location changed.
     */
    ConversationLocationIndex.prototype.rebuild = function (entries) {
        var _this = this;
        var _a, _b, _c;
        var previousLocations = this.locations;
        var turns = new Map();
        var coordinates = new Map();
        var currentTurn;
        var currentStep;
        var turnDraft = function (turn, seq) {
            var draft = turns.get(turn);
            if (draft === undefined) {
                draft = { turn: turn, firstSeq: seq, steps: new Map() };
                turns.set(turn, draft);
            }
            else {
                draft.firstSeq = Math.min(draft.firstSeq, seq);
            }
            return draft;
        };
        var stepDraft = function (turn, step, seq) {
            var owner = turnDraft(turn, seq);
            var draft = owner.steps.get(step);
            if (draft === undefined) {
                draft = { turn: turn, step: step, firstSeq: seq };
                owner.steps.set(step, draft);
            }
            else {
                draft.firstSeq = Math.min(draft.firstSeq, seq);
            }
            return draft;
        };
        for (var _i = 0, entries_3 = entries; _i < entries_3.length; _i++) {
            var event_1 = entries_3[_i].event;
            var explicit = payloadCoordinates(event_1);
            if (event_1.type === 'turn/start') {
                currentTurn = event_1.data.turn;
                currentStep = undefined;
            }
            if (event_1.type === 'step/start') {
                currentTurn = event_1.data.turn;
                currentStep = event_1.data.step;
            }
            if (explicit.session !== true && explicit.turn !== undefined) {
                if (currentTurn !== explicit.turn)
                    currentStep = undefined;
                currentTurn = explicit.turn;
                if (explicit.step !== undefined)
                    currentStep = explicit.step;
            }
            var turn = explicit.session === true ? undefined : (_a = explicit.turn) !== null && _a !== void 0 ? _a : currentTurn;
            var step = explicit.session === true || event_1.type === 'turn/start' || event_1.type === 'turn/end'
                ? undefined
                : (_b = explicit.step) !== null && _b !== void 0 ? _b : (turn === currentTurn ? currentStep : undefined);
            coordinates.set(event_1.seq, __assign(__assign({}, turn === undefined ? {} : { turn: turn }), turn === undefined || step === undefined ? {} : { step: step }));
            if (turn !== undefined)
                turnDraft(turn, event_1.seq);
            if (turn !== undefined && step !== undefined)
                stepDraft(turn, step, event_1.seq);
            if (event_1.type === 'turn/start') {
                turnDraft(event_1.data.turn, event_1.seq).start = event_1;
            }
            else if (event_1.type === 'turn/end') {
                turnDraft(event_1.data.turn, event_1.seq).end = event_1;
            }
            else if (event_1.type === 'step/start') {
                stepDraft(event_1.data.turn, event_1.data.step, event_1.seq).start = event_1;
            }
            else if (event_1.type === 'step/end') {
                stepDraft(event_1.data.turn, event_1.data.step, event_1.seq).end = event_1;
            }
            if (event_1.type === 'step/end' && currentTurn === event_1.data.turn && currentStep === event_1.data.step) {
                currentStep = undefined;
            }
            if (event_1.type === 'turn/end' && currentTurn === event_1.data.turn) {
                currentTurn = undefined;
                currentStep = undefined;
            }
        }
        var previousTurns = this.timeline.turns;
        var nextTurns = new Map();
        var orderedDrafts = __spreadArray([], turns.values(), true).sort(function (left, right) { return left.firstSeq - right.firstSeq; });
        var _loop_1 = function (draft) {
            var previousTurn = previousTurns.get(draft.turn);
            var previousSteps = new Map((_c = previousTurn === null || previousTurn === void 0 ? void 0 : previousTurn.steps.map(function (step) { return [step.step, step]; })) !== null && _c !== void 0 ? _c : []);
            var steps = __spreadArray([], draft.steps.values(), true).sort(function (left, right) { return left.firstSeq - right.firstSeq; })
                .map(function (candidate) {
                var value = {
                    turn: candidate.turn,
                    step: candidate.step,
                    start: candidate.start,
                    end: candidate.end,
                    status: candidate.end !== undefined
                        ? 'closed'
                        : candidate.start === undefined ? 'unknown' : 'open',
                    data: _this.stepData(candidate.turn, candidate.step),
                };
                var previous = previousSteps.get(candidate.step);
                return sameStep(previous, value) ? previous : value;
            });
            var value = {
                turn: draft.turn,
                start: draft.start,
                end: draft.end,
                status: draft.end !== undefined ? 'closed' : draft.start === undefined ? 'unknown' : 'open',
                steps: steps,
                data: this_1.turnData(draft.turn),
            };
            nextTurns.set(draft.turn, sameTurn(previousTurn, value) ? previousTurn : value);
        };
        var this_1 = this;
        for (var _d = 0, orderedDrafts_1 = orderedDrafts; _d < orderedDrafts_1.length; _d++) {
            var draft = orderedDrafts_1[_d];
            _loop_1(draft);
        }
        var nextOrder = orderedDrafts.map(function (draft) { return draft.turn; });
        var turnOrder = this.timeline.turnOrder.length === nextOrder.length
            && this.timeline.turnOrder.every(function (turn, index) { return turn === nextOrder[index]; })
            ? this.timeline.turnOrder
            : nextOrder;
        var sameMap = previousTurns.size === nextTurns.size;
        if (sameMap) {
            for (var _e = 0, nextTurns_1 = nextTurns; _e < nextTurns_1.length; _e++) {
                var _f = nextTurns_1[_e], turn = _f[0], value = _f[1];
                if (previousTurns.get(turn) !== value) {
                    sameMap = false;
                    break;
                }
            }
        }
        this.timeline = sameMap && turnOrder === this.timeline.turnOrder
            ? this.timeline
            : { turnOrder: turnOrder, turns: nextTurns };
        this.coordinates = coordinates;
        this.locations = new Map();
        this.seqsByTurn = new Map();
        for (var _g = 0, entries_4 = entries; _g < entries_4.length; _g++) {
            var event_2 = entries_4[_g].event;
            var coordinates_1 = this.coordinates.get(event_2.seq);
            if ((coordinates_1 === null || coordinates_1 === void 0 ? void 0 : coordinates_1.turn) !== undefined)
                this.indexTurnSeq(coordinates_1.turn, event_2.seq);
            this.locations.set(event_2.seq, this.resolve(event_2.seq));
        }
        this.currentTurn = currentTurn;
        this.currentStep = currentStep;
        var changed = new Set();
        for (var _h = 0, entries_5 = entries; _h < entries_5.length; _h++) {
            var event_3 = entries_5[_h].event;
            if (!sameLocation(previousLocations.get(event_3.seq), this.locations.get(event_3.seq))) {
                changed.add(event_3.seq);
            }
        }
        return changed;
    };
    /**
     * Append one Turn/Step boundary while revisiting only the owning Turn.
     * @param event - contiguous tail boundary event.
     * @returns seqs whose immutable Location reference changed.
     */
    ConversationLocationIndex.prototype.appendBoundary = function (event) {
        var _a, _b, _c, _d;
        if (event.type !== 'turn/start' && event.type !== 'turn/end'
            && event.type !== 'step/start' && event.type !== 'step/end') {
            throw new Error("conversation Location boundary expected, received ".concat(event.type));
        }
        var explicit = payloadCoordinates(event);
        if (event.type === 'turn/start') {
            this.currentTurn = event.data.turn;
            this.currentStep = undefined;
        }
        else if (event.type === 'step/start') {
            this.currentTurn = event.data.turn;
            this.currentStep = event.data.step;
        }
        if (explicit.turn !== undefined) {
            if (this.currentTurn !== explicit.turn)
                this.currentStep = undefined;
            this.currentTurn = explicit.turn;
            if (explicit.step !== undefined)
                this.currentStep = explicit.step;
        }
        var turnNumber = (_a = explicit.turn) !== null && _a !== void 0 ? _a : this.currentTurn;
        if (turnNumber === undefined)
            throw new Error("conversation boundary ".concat(event.type, " has no turn"));
        var stepNumber = event.type === 'turn/start' || event.type === 'turn/end'
            ? undefined
            : (_b = explicit.step) !== null && _b !== void 0 ? _b : (turnNumber === this.currentTurn ? this.currentStep : undefined);
        this.coordinates.set(event.seq, __assign({ turn: turnNumber }, stepNumber === undefined ? {} : { step: stepNumber }));
        this.indexTurnSeq(turnNumber, event.seq);
        var previousTurn = this.timeline.turns.get(turnNumber);
        var steps = (_c = previousTurn === null || previousTurn === void 0 ? void 0 : previousTurn.steps) !== null && _c !== void 0 ? _c : [];
        if (event.type === 'step/start' || event.type === 'step/end') {
            var number_1 = event.data.step;
            var previousStep = steps.find(function (candidate) { return candidate.step === number_1; });
            var candidate_1 = {
                turn: turnNumber,
                step: number_1,
                start: event.type === 'step/start' ? event : previousStep === null || previousStep === void 0 ? void 0 : previousStep.start,
                end: event.type === 'step/end' ? event : previousStep === null || previousStep === void 0 ? void 0 : previousStep.end,
                status: event.type === 'step/end' || (previousStep === null || previousStep === void 0 ? void 0 : previousStep.end) !== undefined ? 'closed' : 'open',
                data: this.stepData(turnNumber, number_1),
            };
            var nextStep_1 = sameStep(previousStep, candidate_1) ? previousStep : candidate_1;
            var index_1 = steps.findIndex(function (step) { return step.step === number_1; });
            steps = index_1 < 0
                ? __spreadArray(__spreadArray([], steps, true), [nextStep_1], false) : steps.map(function (step, at) { return at === index_1 ? nextStep_1 : step; });
        }
        var candidate = {
            turn: turnNumber,
            start: event.type === 'turn/start' ? event : previousTurn === null || previousTurn === void 0 ? void 0 : previousTurn.start,
            end: event.type === 'turn/end' ? event : previousTurn === null || previousTurn === void 0 ? void 0 : previousTurn.end,
            status: event.type === 'turn/end' || (previousTurn === null || previousTurn === void 0 ? void 0 : previousTurn.end) !== undefined
                ? 'closed'
                : event.type === 'turn/start' || (previousTurn === null || previousTurn === void 0 ? void 0 : previousTurn.start) !== undefined ? 'open' : 'unknown',
            steps: steps,
            data: this.turnData(turnNumber),
        };
        var turn = sameTurn(previousTurn, candidate) ? previousTurn : candidate;
        var turns = new Map(this.timeline.turns);
        turns.set(turnNumber, turn);
        var turnOrder = previousTurn === undefined
            ? __spreadArray(__spreadArray([], this.timeline.turnOrder, true), [turnNumber], false) : this.timeline.turnOrder;
        this.timeline = { turnOrder: turnOrder, turns: turns };
        var changed = new Set();
        for (var _i = 0, _e = (_d = this.seqsByTurn.get(turnNumber)) !== null && _d !== void 0 ? _d : []; _i < _e.length; _i++) {
            var seq = _e[_i];
            var previous = this.locations.get(seq);
            var next = this.resolve(seq);
            this.locations.set(seq, next);
            if (!sameLocation(previous, next))
                changed.add(seq);
        }
        if (event.type === 'step/end' && this.currentTurn === event.data.turn && this.currentStep === event.data.step) {
            this.currentStep = undefined;
        }
        if (event.type === 'turn/end' && this.currentTurn === event.data.turn) {
            this.currentTurn = undefined;
            this.currentStep = undefined;
        }
        return changed;
    };
    /**
     * Index one non-boundary tail event without rescanning the window.
     * @param event - contiguous appended event.
     */
    ConversationLocationIndex.prototype.appendNonBoundary = function (event) {
        var _a, _b;
        var explicit = payloadCoordinates(event);
        if (explicit.session === true) {
            this.coordinates.set(event.seq, {});
            this.locations.set(event.seq, SESSION_LOCATION);
            return;
        }
        if (explicit.turn !== undefined) {
            if (this.currentTurn !== explicit.turn)
                this.currentStep = undefined;
            this.currentTurn = explicit.turn;
            if (explicit.step !== undefined)
                this.currentStep = explicit.step;
        }
        var turn = (_a = explicit.turn) !== null && _a !== void 0 ? _a : this.currentTurn;
        var step = (_b = explicit.step) !== null && _b !== void 0 ? _b : (turn === this.currentTurn ? this.currentStep : undefined);
        this.coordinates.set(event.seq, __assign(__assign({}, turn === undefined ? {} : { turn: turn }), turn === undefined || step === undefined ? {} : { step: step }));
        if (turn !== undefined)
            this.indexTurnSeq(turn, event.seq);
        this.locations.set(event.seq, this.resolve(event.seq));
    };
    ConversationLocationIndex.prototype.indexTurnSeq = function (turn, seq) {
        var _a;
        var current = (_a = this.seqsByTurn.get(turn)) !== null && _a !== void 0 ? _a : new Set();
        current.add(seq);
        this.seqsByTurn.set(turn, current);
    };
    ConversationLocationIndex.prototype.turnData = function (turn) {
        return this.mutableTurnData(turn);
    };
    ConversationLocationIndex.prototype.stepData = function (turn, step) {
        return this.mutableStepData(stepDataKey(turn, step));
    };
    ConversationLocationIndex.prototype.mutableTurnData = function (turn) {
        var _a;
        var current = (_a = this.turnDataStores.get(turn)) !== null && _a !== void 0 ? _a : new MutableLocationDataStore();
        this.turnDataStores.set(turn, current);
        return current;
    };
    ConversationLocationIndex.prototype.mutableStepData = function (key) {
        var _a;
        var current = (_a = this.stepDataStores.get(key)) !== null && _a !== void 0 ? _a : new MutableLocationDataStore();
        this.stepDataStores.set(key, current);
        return current;
    };
    ConversationLocationIndex.prototype.storeFor = function (data) {
        return data.kind === 'turn'
            ? this.mutableTurnData(data.turn)
            : this.mutableStepData(stepDataKey(data.turn, requireStep(data)));
    };
    ConversationLocationIndex.prototype.resolve = function (seq) {
        var coordinates = this.coordinates.get(seq);
        if ((coordinates === null || coordinates === void 0 ? void 0 : coordinates.turn) === undefined)
            return SESSION_LOCATION;
        var turn = this.timeline.turns.get(coordinates.turn);
        if (turn === undefined)
            return UNRESOLVED_LOCATION;
        if (coordinates.step === undefined)
            return { kind: 'turn', turn: turn };
        var step = turn.steps.find(function (candidate) { return candidate.step === coordinates.step; });
        return step === undefined ? { kind: 'turn', turn: turn } : { kind: 'step', turn: turn, step: step };
    };
    return ConversationLocationIndex;
}());
exports.ConversationLocationIndex = ConversationLocationIndex;
function stepDataKey(turn, step) {
    return "".concat(turn, ":").concat(step);
}
function requireStep(data) {
    if (data.kind === 'step' && data.step !== undefined)
        return data.step;
    throw new Error("conversation Step data \"".concat(data.key, "\" requires a step"));
}
