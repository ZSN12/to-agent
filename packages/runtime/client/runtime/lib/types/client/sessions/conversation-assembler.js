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
exports.ConversationNodeAssembler = void 0;
var conversation_ts_1 = require("../contract/conversation.ts");
var conversation_location_index_ts_1 = require("./conversation-location-index.ts");
var PUBLICATION_RANK = {
    none: 0,
    'animation-frame': 1,
    immediate: 2,
};
var LOCATION_DATA_SCOPES = ['step', 'turn'];
function emptyLocationData() {
    return { step: null, turn: null };
}
function maximumPublication(left, right) {
    return PUBLICATION_RANK[left] >= PUBLICATION_RANK[right] ? left : right;
}
function startSeq(context) {
    return context.startSeq;
}
function insertionIndex(contexts, seq) {
    var low = 0;
    var high = contexts.length;
    while (low < high) {
        var middle = low + Math.floor((high - low) / 2);
        var candidate = contexts[middle];
        if (candidate !== undefined && candidate.startSeq < seq)
            low = middle + 1;
        else
            high = middle;
    }
    return low;
}
function contextSnapshot(context) {
    return {
        key: context.key,
        kind: context.kind,
        id: context.id,
        matches: context.matches,
        start: context.start,
        state: context.state,
        current: context.current,
    };
}
function mergeMatches(key, additions, existing) {
    var merged = [];
    var added = 0;
    var current = 0;
    while (added < additions.length || current < existing.length) {
        var left = additions[added];
        var right = existing[current];
        if (left !== undefined && right !== undefined && left.event.seq === right.event.seq) {
            throw new Error("conversation Context ".concat(key, " received duplicate Match ").concat(left.event.seq));
        }
        if (right === undefined || (left !== undefined && left.event.seq < right.event.seq)) {
            merged.push(left);
            added++;
        }
        else {
            merged.push(right);
            current++;
        }
    }
    return merged;
}
/**
 * Session-owned incremental engine that assembles business Contexts from a
 * contiguous Event window and materializes registered view snapshots.
 */
var ConversationNodeAssembler = /** @class */ (function () {
    /**
     * @param eventDefinitions - live Event Definition registry.
     * @param viewDefinitions - live view builder registry.
     */
    function ConversationNodeAssembler(eventDefinitions, viewDefinitions) {
        this.eventDefinitions = eventDefinitions;
        this.viewDefinitions = viewDefinitions;
        this.contexts = new Map();
        this.contextsByKind = new Map();
        this.contextsBySeq = new Map();
        this.inputs = new Map();
        this.locationIndex = new conversation_location_index_ts_1.ConversationLocationIndex();
        this.dirty = new Set();
        this.revised = new Set();
        this.dependents = new Map();
        this.views = new Map();
        this.hasMore = false;
        this.replacePending = true;
        this.timelineDirty = true;
        this.resetViewBuilders();
    }
    /**
     * Replace the complete loaded window after open, resync, or gap repair.
     * @param entries - complete contiguous window.
     * @param hasMore - whether older history remains outside the window.
     * @returns immediate publication request.
     */
    ConversationNodeAssembler.prototype.replaceWindow = function (entries, hasMore) {
        this.contexts.clear();
        this.contextsByKind.clear();
        this.contextsBySeq.clear();
        this.inputs.clear();
        this.dirty.clear();
        this.revised.clear();
        this.dependents.clear();
        this.hasMore = hasMore;
        var sorted = __spreadArray([], entries, true).sort(function (left, right) { return left.event.seq - right.event.seq; });
        for (var _i = 0, sorted_1 = sorted; _i < sorted_1.length; _i++) {
            var entry = sorted_1[_i];
            this.inputs.set(entry.event.seq, entry);
        }
        this.locationIndex.rebuild(sorted);
        this.timelineDirty = true;
        for (var _a = 0, sorted_2 = sorted; _a < sorted_2.length; _a++) {
            var entry = sorted_2[_a];
            this.matchInput(entry);
        }
        this.replayDependencies();
        this.revised.clear();
        for (var _b = 0, _c = this.contexts.values(); _b < _c.length; _b++) {
            var context = _c[_b];
            this.dirty.add(context);
        }
        this.replacePending = true;
        return 'immediate';
    };
    /**
     * Add one contiguous live tail event without scanning existing Contexts.
     * @param input - appended Event and optional wire view.
     * @returns highest requested publication cadence.
     */
    ConversationNodeAssembler.prototype.append = function (input) {
        if (this.inputs.has(input.event.seq))
            return 'none';
        this.revised.clear();
        this.inputs.set(input.event.seq, input);
        var publication = 'none';
        if (isLocationBoundary(input.event.type)) {
            var previousTimeline = this.locationIndex.snapshot();
            var changed = this.locationIndex.appendBoundary(input.event);
            if (this.locationIndex.snapshot() !== previousTimeline) {
                this.timelineDirty = true;
                publication = 'immediate';
            }
            this.replayContexts(this.refreshMatchLocations(changed));
            if (changed.size > 0)
                publication = 'immediate';
        }
        else {
            this.locationIndex.appendNonBoundary(input.event);
        }
        publication = maximumPublication(publication, this.matchInput(input));
        if (this.replayRevisedDependents())
            publication = 'immediate';
        this.revised.clear();
        return publication;
    };
    /**
     * Add an older page while preserving existing Context and view identities.
     * @param entries - newly loaded older Events.
     * @param hasMore - whether history still precedes the expanded window.
     * @returns highest requested publication cadence.
     */
    ConversationNodeAssembler.prototype.prepend = function (entries, hasMore) {
        var _this = this;
        this.revised.clear();
        var publication = 'none';
        var previousHasMore = this.hasMore;
        var fresh = entries
            .filter(function (entry) { return !_this.inputs.has(entry.event.seq); })
            .sort(function (left, right) { return left.event.seq - right.event.seq; });
        for (var _i = 0, fresh_1 = fresh; _i < fresh_1.length; _i++) {
            var entry = fresh_1[_i];
            this.inputs.set(entry.event.seq, entry);
        }
        this.hasMore = hasMore;
        var previousTimeline = this.locationIndex.snapshot();
        var changedLocations = this.locationIndex.rebuild(this.sortedInputs());
        if (this.locationIndex.snapshot() !== previousTimeline)
            this.timelineDirty = true;
        var affected = this.refreshMatchLocations(changedLocations);
        var pending = new Map();
        for (var _a = 0, fresh_2 = fresh; _a < fresh_2.length; _a++) {
            var entry = fresh_2[_a];
            publication = maximumPublication(publication, this.collectInput(entry, pending));
        }
        this.applyPendingMatches(pending, affected);
        this.replayContexts(affected);
        if ((this.revised.size > 0 || previousHasMore !== hasMore) && this.replayDependencies()) {
            publication = 'immediate';
        }
        if (changedLocations.size > 0)
            publication = 'immediate';
        this.revised.clear();
        return publication;
    };
    /**
     * Rebuild against the current Registry set after a low-frequency plugin change.
     * @returns immediate publication request.
     */
    ConversationNodeAssembler.prototype.rebuildRegistry = function () {
        this.resetViewBuilders();
        return this.replaceWindow(this.sortedInputs(), this.hasMore);
    };
    /**
     * Materialize dirty Contexts and advance every registered view builder.
     * @returns whether any view snapshot was rebuilt or incrementally applied.
     */
    ConversationNodeAssembler.prototype.flush = function () {
        var _a, _b, _c, _d, _e;
        if (!this.replacePending && this.dirty.size === 0 && !this.timelineDirty)
            return false;
        if (this.replacePending) {
            this.replaceLocationData();
            var allByTarget = new Map();
            for (var _i = 0, _f = this.views.keys(); _i < _f.length; _i++) {
                var target = _f[_i];
                allByTarget.set(target, []);
            }
            for (var _g = 0, _h = this.contexts.values(); _g < _h.length; _g++) {
                var context = _h[_g];
                var target = context.definition.target;
                if (target === undefined || !this.views.has(target))
                    continue;
                var node = this.buildNode(context, target);
                context.current.set(target, node);
                if (node !== null)
                    (_a = allByTarget.get(target)) === null || _a === void 0 ? void 0 : _a.push(node);
            }
            for (var _j = 0, _k = this.views.values(); _j < _k.length; _j++) {
                var view = _k[_j];
                view.snapshot = view.builder.replace({
                    nodes: (_b = allByTarget.get(view.target)) !== null && _b !== void 0 ? _b : [],
                    timeline: this.locationIndex.snapshot(),
                });
            }
            this.replacePending = false;
            this.dirty.clear();
            this.timelineDirty = false;
            return true;
        }
        var upsertsByTarget = new Map();
        for (var _l = 0, _m = this.views.keys(); _l < _m.length; _l++) {
            var target = _m[_l];
            upsertsByTarget.set(target, []);
        }
        if (this.applyDirtyLocationData())
            this.timelineDirty = true;
        for (var _o = 0, _p = this.dirty; _o < _p.length; _o++) {
            var context = _p[_o];
            var target = context.definition.target;
            if (target === undefined || !this.views.has(target))
                continue;
            var previous = (_c = context.current.get(target)) !== null && _c !== void 0 ? _c : null;
            var node = this.buildNode(context, target);
            if (node === null && previous !== null) {
                throw new Error("conversation Definition \"".concat(context.kind, "\" withdrew materialized target \"").concat(target, "\"; return the same key with hidden visibility instead"));
            }
            context.current.set(target, node);
            if (node !== null)
                (_d = upsertsByTarget.get(target)) === null || _d === void 0 ? void 0 : _d.push(node);
        }
        this.dirty.clear();
        var timelineDirty = this.timelineDirty;
        this.timelineDirty = false;
        for (var _q = 0, _r = this.views.values(); _q < _r.length; _q++) {
            var view = _r[_q];
            var upserts = (_e = upsertsByTarget.get(view.target)) !== null && _e !== void 0 ? _e : [];
            if (upserts.length === 0 && !timelineDirty)
                continue;
            view.snapshot = view.builder.apply({
                upserts: upserts,
                timeline: this.locationIndex.snapshot(),
            });
        }
        return true;
    };
    /**
     * Read the latest snapshot of a registered target.
     * @param target - registered view target.
     * @returns target snapshot, or undefined when no builder is registered.
     */
    ConversationNodeAssembler.prototype.snapshot = function (target) {
        var _a;
        return (_a = this.views.get(target)) === null || _a === void 0 ? void 0 : _a.snapshot;
    };
    ConversationNodeAssembler.prototype.get = function (target) {
        return this.snapshot(target);
    };
    ConversationNodeAssembler.prototype.sortedInputs = function () {
        return __spreadArray([], this.inputs.values(), true).sort(function (left, right) { return left.event.seq - right.event.seq; });
    };
    ConversationNodeAssembler.prototype.matchInput = function (input) {
        var _this = this;
        return this.dispatchInput(input, function (definition, id, role) {
            return _this.acceptMatch(definition, id, role, input);
        });
    };
    ConversationNodeAssembler.prototype.collectInput = function (input, pending) {
        var _this = this;
        return this.dispatchInput(input, function (definition, id, role) {
            var _a, _b, _c;
            var key = (0, conversation_ts_1.conversationContextKey)(definition.kind, id);
            var match = __assign(__assign({}, input), { role: role, location: _this.locationIndex.locationOf(input.event) });
            var matches = (_a = pending.get(key)) !== null && _a !== void 0 ? _a : [];
            matches.push({ definition: definition, id: id, match: match });
            pending.set(key, matches);
            return (_c = (_b = definition.publication) === null || _b === void 0 ? void 0 : _b.call(definition, match)) !== null && _c !== void 0 ? _c : 'immediate';
        });
    };
    ConversationNodeAssembler.prototype.dispatchInput = function (input, accept) {
        var matchedTargets = new Set();
        var publication = 'none';
        for (var _i = 0, _a = this.eventDefinitions.entries(); _i < _a.length; _i++) {
            var definition = _a[_i];
            var result = definition.match(input.event);
            if (result === null)
                continue;
            if (definition.target !== undefined)
                matchedTargets.add(definition.target);
            publication = maximumPublication(publication, accept(definition, result.id, result.role));
        }
        var fallback = this.eventDefinitions.fallbackEntry();
        var target = fallback === null || fallback === void 0 ? void 0 : fallback.target;
        if (fallback !== undefined && target !== undefined && !matchedTargets.has(target)) {
            var result = fallback.match(input.event);
            if (result !== null) {
                publication = maximumPublication(publication, accept(fallback, result.id, result.role));
            }
        }
        return publication;
    };
    ConversationNodeAssembler.prototype.acceptMatch = function (definition, id, role, input) {
        var _a, _b, _c;
        var key = (0, conversation_ts_1.conversationContextKey)(definition.kind, id);
        var context = this.contexts.get(key);
        if (role === 'start' && (context === null || context === void 0 ? void 0 : context.start) !== undefined) {
            throw new Error("conversation Context ".concat(key, " received more than one start Match"));
        }
        if (context === undefined) {
            context = {
                key: key,
                kind: definition.kind,
                id: id,
                definition: definition,
                startSeq: undefined,
                start: undefined,
                matches: [],
                state: undefined,
                revision: 0,
                current: new Map(),
                locationData: emptyLocationData(),
                dependencies: new Map(),
            };
            this.contexts.set(key, context);
        }
        var match = __assign(__assign({}, input), { role: role, location: this.locationIndex.locationOf(input.event) });
        var previous = context.matches.at(-1);
        if (previous !== undefined && previous.event.seq >= input.event.seq) {
            throw new Error("conversation Context ".concat(key, " received non-appended Match ").concat(input.event.seq));
        }
        if (role === 'start' && context.matches.length > 0) {
            throw new Error("conversation Context ".concat(key, " received an update before its start Match"));
        }
        context.matches.push(match);
        if (role === 'start') {
            context.startSeq = input.event.seq;
            context.start = match;
            this.indexStartedContext(context);
        }
        var owners = (_a = this.contextsBySeq.get(input.event.seq)) !== null && _a !== void 0 ? _a : new Set();
        owners.add(context);
        this.contextsBySeq.set(input.event.seq, owners);
        if (role === 'start') {
            this.replayContext(context);
        }
        else if (context.state !== undefined) {
            var typed = contextSnapshot(context);
            context.state = requireState(definition, 'update', definition.update(typed, match));
            context.revision++;
            this.revised.add(context);
        }
        this.dirty.add(context);
        return (_c = (_b = definition.publication) === null || _b === void 0 ? void 0 : _b.call(definition, match)) !== null && _c !== void 0 ? _c : 'immediate';
    };
    ConversationNodeAssembler.prototype.applyPendingMatches = function (pending, affected) {
        var _this = this;
        var _a;
        var startsByKind = new Map();
        var _loop_1 = function (key, entries) {
            var first = entries[0];
            if (first === undefined)
                return "continue";
            var context = this_1.contexts.get(key);
            if (context === undefined) {
                context = {
                    key: key,
                    kind: first.definition.kind,
                    id: first.id,
                    definition: first.definition,
                    startSeq: undefined,
                    start: undefined,
                    matches: [],
                    state: undefined,
                    revision: 0,
                    current: new Map(),
                    locationData: emptyLocationData(),
                    dependencies: new Map(),
                };
                this_1.contexts.set(key, context);
            }
            var discoveredStart;
            var additions = entries
                .map(function (entry) {
                var _a;
                if (entry.definition !== context.definition || entry.id !== context.id) {
                    throw new Error("conversation Context ".concat(key, " received inconsistent Definition identity"));
                }
                if (entry.match.role === 'start') {
                    if (discoveredStart !== undefined || context.start !== undefined) {
                        throw new Error("conversation Context ".concat(key, " received more than one start Match"));
                    }
                    discoveredStart = entry.match;
                }
                var owners = (_a = _this.contextsBySeq.get(entry.match.event.seq)) !== null && _a !== void 0 ? _a : new Set();
                owners.add(context);
                _this.contextsBySeq.set(entry.match.event.seq, owners);
                return entry.match;
            })
                .sort(function (left, right) { return left.event.seq - right.event.seq; });
            context.matches = mergeMatches(context.key, additions, context.matches);
            if (discoveredStart !== undefined) {
                context.start = discoveredStart;
                context.startSeq = discoveredStart.event.seq;
                var starts = (_a = startsByKind.get(context.kind)) !== null && _a !== void 0 ? _a : [];
                starts.push(context);
                startsByKind.set(context.kind, starts);
            }
            if (context.start !== undefined && context.matches[0] !== context.start) {
                throw new Error("conversation Context ".concat(context.key, " received an update before its start Match"));
            }
            affected.add(context);
            this_1.dirty.add(context);
        };
        var this_1 = this;
        for (var _i = 0, pending_1 = pending; _i < pending_1.length; _i++) {
            var _b = pending_1[_i], key = _b[0], entries = _b[1];
            _loop_1(key, entries);
        }
        for (var _c = 0, startsByKind_1 = startsByKind; _c < startsByKind_1.length; _c++) {
            var _d = startsByKind_1[_c], kind = _d[0], contexts = _d[1];
            this.indexStartedContexts(kind, contexts);
        }
    };
    ConversationNodeAssembler.prototype.replayContexts = function (contexts) {
        var ordered = __spreadArray([], contexts, true).sort(function (left, right) { var _a, _b; return ((_a = left.startSeq) !== null && _a !== void 0 ? _a : Number.POSITIVE_INFINITY) - ((_b = right.startSeq) !== null && _b !== void 0 ? _b : Number.POSITIVE_INFINITY); });
        for (var _i = 0, ordered_1 = ordered; _i < ordered_1.length; _i++) {
            var context = ordered_1[_i];
            if (context.start === undefined) {
                context.state = undefined;
                this.dirty.add(context);
                continue;
            }
            this.replayContext(context);
        }
    };
    ConversationNodeAssembler.prototype.replayContext = function (context) {
        var start = context.start;
        if (start === undefined) {
            context.state = undefined;
            return;
        }
        if (context.matches[0] !== start) {
            throw new Error("conversation Context ".concat(context.key, " received an update before its start Match"));
        }
        var dependencies = new Map();
        var reader = this.readerFor(start.event.seq, dependencies);
        context.state = undefined;
        context.state = requireState(context.definition, 'start', context.definition.start(contextSnapshot(context), start, reader));
        this.replaceDependencies(context, dependencies);
        for (var index = 1; index < context.matches.length; index++) {
            var match = context.matches[index];
            if (match === undefined || match.role !== 'update')
                continue;
            var typed = contextSnapshot(context);
            context.state = requireState(context.definition, 'update', context.definition.update(typed, match));
        }
        context.revision++;
        this.revised.add(context);
        this.dirty.add(context);
    };
    ConversationNodeAssembler.prototype.replaceDependencies = function (context, dependencies) {
        var _a;
        for (var _i = 0, _b = context.dependencies.values(); _i < _b.length; _i++) {
            var dependency = _b[_i];
            if (dependency.key === undefined)
                continue;
            var current = this.dependents.get(dependency.key);
            current === null || current === void 0 ? void 0 : current.delete(context);
            if ((current === null || current === void 0 ? void 0 : current.size) === 0)
                this.dependents.delete(dependency.key);
        }
        context.dependencies = dependencies;
        for (var _c = 0, _d = dependencies.values(); _c < _d.length; _c++) {
            var dependency = _d[_c];
            if (dependency.key === undefined)
                continue;
            var current = (_a = this.dependents.get(dependency.key)) !== null && _a !== void 0 ? _a : new Set();
            current.add(context);
            this.dependents.set(dependency.key, current);
        }
    };
    ConversationNodeAssembler.prototype.replayRevisedDependents = function () {
        var _a;
        var pending = __spreadArray([], this.revised, true);
        var affected = new Set();
        for (var index = 0; index < pending.length; index++) {
            var dependency = pending[index];
            if (dependency === undefined)
                continue;
            for (var _i = 0, _b = (_a = this.dependents.get(dependency.key)) !== null && _a !== void 0 ? _a : []; _i < _b.length; _i++) {
                var dependent = _b[_i];
                if (affected.has(dependent))
                    continue;
                affected.add(dependent);
                pending.push(dependent);
            }
        }
        this.replayContexts(affected);
        return affected.size > 0;
    };
    ConversationNodeAssembler.prototype.readerFor = function (beforeSeq, dependencies) {
        var _this = this;
        return {
            previous: function (kind) {
                var predecessor = _this.previousContext(kind, beforeSeq);
                dependencies.set(kind, {
                    kind: kind,
                    key: predecessor === null || predecessor === void 0 ? void 0 : predecessor.key,
                    revision: predecessor === null || predecessor === void 0 ? void 0 : predecessor.revision,
                    windowGap: predecessor === undefined && _this.hasMore,
                });
                if ((predecessor === null || predecessor === void 0 ? void 0 : predecessor.state) === undefined)
                    return undefined;
                var seq = startSeq(predecessor);
                if (seq === undefined)
                    return undefined;
                return {
                    key: predecessor.key,
                    kind: predecessor.kind,
                    id: predecessor.id,
                    startSeq: seq,
                    state: predecessor.state,
                    matches: predecessor.matches,
                };
            },
        };
    };
    ConversationNodeAssembler.prototype.previousContext = function (kind, beforeSeq) {
        var _a;
        var candidates = (_a = this.contextsByKind.get(kind)) !== null && _a !== void 0 ? _a : [];
        var indexBefore = insertionIndex(candidates, beforeSeq);
        for (var index = indexBefore - 1; index >= 0; index--) {
            var candidate = candidates[index];
            if ((candidate === null || candidate === void 0 ? void 0 : candidate.state) !== undefined)
                return candidate;
        }
        return undefined;
    };
    /** Insert one newly discovered start into its Definition's ordered predecessor index. */
    ConversationNodeAssembler.prototype.indexStartedContext = function (context) {
        var _a;
        var seq = context.startSeq;
        if (seq === undefined)
            return;
        var candidates = (_a = this.contextsByKind.get(context.kind)) !== null && _a !== void 0 ? _a : [];
        var previous = candidates.at(-1);
        if (previous === undefined || previous.startSeq < seq)
            candidates.push(context);
        else
            candidates.splice(insertionIndex(candidates, seq), 0, context);
        this.contextsByKind.set(context.kind, candidates);
    };
    ConversationNodeAssembler.prototype.indexStartedContexts = function (kind, additions) {
        var _a;
        if (additions.length === 0)
            return;
        var sorted = __spreadArray([], additions, true).sort(function (left, right) {
            return left.startSeq - right.startSeq;
        });
        var existing = (_a = this.contextsByKind.get(kind)) !== null && _a !== void 0 ? _a : [];
        var merged = [];
        var before = 0;
        var added = 0;
        while (before < existing.length || added < sorted.length) {
            var left = existing[before];
            var right = sorted[added];
            if (right === undefined || (left !== undefined && left.startSeq < right.startSeq)) {
                merged.push(left);
                before++;
            }
            else {
                merged.push(right);
                added++;
            }
        }
        this.contextsByKind.set(kind, merged);
    };
    ConversationNodeAssembler.prototype.replayDependencies = function () {
        var replayed = false;
        var ordered = __spreadArray([], this.contexts.values(), true).filter(function (context) { return startSeq(context) !== undefined; })
            .sort(function (left, right) { return startSeq(left) - startSeq(right); });
        for (var _i = 0, ordered_2 = ordered; _i < ordered_2.length; _i++) {
            var context = ordered_2[_i];
            if (context.state === undefined || context.dependencies.size === 0)
                continue;
            var before = startSeq(context);
            if (before === undefined)
                continue;
            var changed = false;
            for (var _a = 0, _b = context.dependencies.values(); _a < _b.length; _a++) {
                var dependency = _b[_a];
                var current = this.previousContext(dependency.kind, before);
                var windowGap = current === undefined && this.hasMore;
                if ((current === null || current === void 0 ? void 0 : current.key) !== dependency.key
                    || (current === null || current === void 0 ? void 0 : current.revision) !== dependency.revision
                    || windowGap !== dependency.windowGap) {
                    changed = true;
                    break;
                }
            }
            if (changed) {
                this.replayContext(context);
                replayed = true;
            }
        }
        return replayed;
    };
    ConversationNodeAssembler.prototype.refreshMatchLocations = function (changedSeqs) {
        var _this = this;
        var _a;
        var affected = new Set();
        if (changedSeqs.size === 0)
            return affected;
        for (var _i = 0, changedSeqs_1 = changedSeqs; _i < changedSeqs_1.length; _i++) {
            var seq = changedSeqs_1[_i];
            for (var _b = 0, _c = (_a = this.contextsBySeq.get(seq)) !== null && _a !== void 0 ? _a : []; _b < _c.length; _b++) {
                var context = _c[_b];
                affected.add(context);
            }
        }
        var _loop_2 = function (context) {
            var start = context.start;
            var matches = context.matches.map(function (match) {
                if (!changedSeqs.has(match.event.seq))
                    return match;
                var refreshed = __assign(__assign({}, match), { location: _this.locationIndex.locationOf(match.event) });
                if (match === start)
                    start = refreshed;
                return refreshed;
            });
            context.matches = matches;
            context.start = start;
        };
        for (var _d = 0, affected_1 = affected; _d < affected_1.length; _d++) {
            var context = affected_1[_d];
            _loop_2(context);
        }
        return affected;
    };
    ConversationNodeAssembler.prototype.buildNode = function (context, target) {
        if (context.definition.target !== target || context.definition.buildViewNode === undefined)
            return null;
        var node = context.definition.buildViewNode(contextSnapshot(context));
        if (node === null)
            return null;
        if (node.key !== context.key) {
            throw new Error("conversation Definition \"".concat(context.kind, "\" returned unstable key \"").concat(node.key, "\"; expected \"").concat(context.key, "\""));
        }
        if (node.target !== target) {
            throw new Error("conversation Definition \"".concat(context.kind, "\" returned target \"").concat(node.target, "\" while building \"").concat(target, "\""));
        }
        return node;
    };
    ConversationNodeAssembler.prototype.buildLocationData = function (context, scope) {
        if (context.definition.buildLocationData === undefined)
            return null;
        var data = context.definition.buildLocationData(contextSnapshot(context), scope);
        if (data === null)
            return null;
        if (data.kind !== scope) {
            throw new Error("conversation Definition \"".concat(context.kind, "\" published ").concat(data.kind, " data through its ").concat(scope, " scope"));
        }
        if (data.key !== context.kind) {
            throw new Error("conversation Definition \"".concat(context.kind, "\" published Location data key \"").concat(data.key, "\"; expected its owned kind"));
        }
        if (!Number.isSafeInteger(data.turn) || data.turn < 0) {
            throw new Error("conversation Definition \"".concat(context.kind, "\" published invalid turn ").concat(data.turn));
        }
        if (data.kind === 'step' && (!Number.isSafeInteger(data.step) || data.step < 0)) {
            throw new Error("conversation Definition \"".concat(context.kind, "\" published invalid step ").concat(String(data.step)));
        }
        return data;
    };
    ConversationNodeAssembler.prototype.replaceLocationData = function () {
        var entries = [];
        for (var _i = 0, LOCATION_DATA_SCOPES_1 = LOCATION_DATA_SCOPES; _i < LOCATION_DATA_SCOPES_1.length; _i++) {
            var scope = LOCATION_DATA_SCOPES_1[_i];
            for (var _a = 0, _b = this.contexts.values(); _a < _b.length; _a++) {
                var context = _b[_a];
                var data = this.buildLocationData(context, scope);
                context.locationData[scope] = data;
                if (data !== null)
                    entries.push({ owner: context.key, data: data });
            }
            // Turn publishers may read Step data from this same flush, so each phase
            // installs the cumulative replacement before the next phase builds.
            this.locationIndex.replaceData(entries);
        }
    };
    ConversationNodeAssembler.prototype.applyDirtyLocationData = function () {
        var changed = false;
        for (var _i = 0, LOCATION_DATA_SCOPES_2 = LOCATION_DATA_SCOPES; _i < LOCATION_DATA_SCOPES_2.length; _i++) {
            var scope = LOCATION_DATA_SCOPES_2[_i];
            var changes = [];
            for (var _a = 0, _b = this.dirty; _a < _b.length; _a++) {
                var context = _b[_a];
                var previous = context.locationData[scope];
                var next = this.buildLocationData(context, scope);
                context.locationData[scope] = next;
                if (previous !== next)
                    changes.push({ owner: context.key, previous: previous, next: next });
            }
            changed = this.locationIndex.applyData(changes) || changed;
        }
        return changed;
    };
    ConversationNodeAssembler.prototype.resetViewBuilders = function () {
        this.views.clear();
        for (var _i = 0, _a = this.viewDefinitions.entries(); _i < _a.length; _i++) {
            var definition = _a[_i];
            var builder = definition.create();
            this.views.set(definition.target, {
                target: definition.target,
                builder: builder,
                snapshot: builder.empty,
            });
        }
        this.replacePending = true;
    };
    return ConversationNodeAssembler;
}());
exports.ConversationNodeAssembler = ConversationNodeAssembler;
function isLocationBoundary(type) {
    return type === 'turn/start' || type === 'turn/end' || type === 'step/start' || type === 'step/end';
}
function requireState(definition, phase, state) {
    if (state === undefined) {
        throw new Error("conversation Definition \"".concat(definition.kind, "\" returned undefined from ").concat(phase, "()"));
    }
    return state;
}
