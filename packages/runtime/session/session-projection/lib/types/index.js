"use strict";
/**
 * Service Definition and drive registry for the session-projection capability seam: the merge-extensible state and client-view type
 * tables, the `ProjectionDefinition` state-driven computation unit contract,
 * and the `ctx.sessionProjections` registry that DRIVES every registered unit
 * forward eagerly over committed session events. Domain host plugins
 * contribute pure folds and optional client views; the framework owns the
 * subscription, the per-session watermark cache, and change notification;
 * carriers consume the snapshot read face and the change feed. Neither side
 * knows the other
 * (capability-seam three-way split). Design authority: the session-projection
 * RFC (.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md).
 *
 * Whole-value event rule (load-bearing): a state-carrying log event MUST
 * carry the complete post-change state, never a bare delta — it keeps every
 * unit's transition trivially cheap and every served value self-describing.
 *
 * @module @z/dsh-session-projection
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
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionProjectionRegistry = void 0;
var cordis_1 = require("@z/cordis");
/**
 * `ctx.sessionProjections`: the projection unit table and its drive. The
 * service subscribes to `session/event` once; every committed event passes
 * every registered unit's `apply` (eager drive), and a changed state
 * reference in a client-visible unit notifies the change feed with the
 * schema-validated view.
 * Cells build lazily — a unit registered after events flowed, or a session
 * older than the registry, folds `init` over the in-memory log on first
 * touch (event or read). Registration is an effect (disposer rides the
 * calling fiber): an unloaded domain plugin's key disappears from snapshots
 * and clients read it as capability absence. Domain
 * plugins register under `ctx.inject(['sessionProjections'], …)` so headless
 * assemblies without the registry stay unaffected. Registrants sharing a key
 * share one unit and are counted: the same tool package mounted in N agent
 * presets registers N times, and the key survives until the last one
 * unloads.
 */
var SessionProjectionRegistry = /** @class */ (function (_super) {
    __extends(SessionProjectionRegistry, _super);
    /**
     * Create and install the registry as `ctx.sessionProjections`.
     * @param ctx - Cordis context that owns the service.
     */
    function SessionProjectionRegistry(ctx) {
        var _this = _super.call(this, ctx, 'sessionProjections') || this;
        _this.registrations = new Map();
        _this.listeners = new Set();
        ctx.on('session/event', function (session, event) {
            _this.drive(session, event);
        });
        return _this;
    }
    SessionProjectionRegistry.prototype.register = function (definition) {
        var wire = definition.wire;
        var erased = {
            key: definition.key,
            stateSchema: definition.stateSchema,
            init: function () { return definition.init(); },
            apply: function (state, event) { return definition.apply(state, event); },
            wire: wire === undefined
                ? undefined
                : { viewSchema: wire.viewSchema, view: function (state) { return wire.view(state); } },
            stateVersion: definition.stateVersion,
        };
        if (!Number.isSafeInteger(definition.stateVersion) || definition.stateVersion < 0) {
            throw new Error("session projection ".concat(JSON.stringify(definition.key), " stateVersion must be a non-negative integer, got ").concat(String(definition.stateVersion)));
        }
        var dispose = this.ctx.effect(function () {
            var key, existing;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        key = erased.key;
                        existing = this.registrations.get(key);
                        if (existing === undefined) {
                            this.registrations.set(key, { def: erased, cells: new WeakMap(), refs: 1 });
                        }
                        else {
                            if (existing.def.stateVersion !== erased.stateVersion) {
                                throw new Error("session projection key ".concat(JSON.stringify(key), " is already registered at stateVersion ").concat(String(existing.def.stateVersion), "; refusing to share it with stateVersion ").concat(String(erased.stateVersion)));
                            }
                            existing.refs += 1;
                        }
                        return [4 /*yield*/, function () {
                                var live = _this.registrations.get(key);
                                /* v8 ignore next -- the disposer runs once per successful registration, so the entry it counted is still here */
                                if (live === undefined)
                                    return;
                                live.refs -= 1;
                                if (live.refs === 0)
                                    _this.registrations.delete(key);
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'sessionProjections.register()');
        return function () { return void dispose(); };
    };
    /**
     * Subscribe to the change feed. The registration is an effect on the
     * calling context's fiber.
     * @param listener - called once per client-visible unit whose state reference changed, per committed event.
     * @returns the exact disposer that unsubscribes.
     */
    SessionProjectionRegistry.prototype.onChanged = function (listener) {
        var _this = this;
        var dispose = this.ctx.effect(function () {
            _this.listeners.add(listener);
            return function () {
                _this.listeners.delete(listener);
            };
        }, 'sessionProjections.onChanged()');
        return function () { return void dispose(); };
    };
    /**
     * Read one unit's current host state without computing unrelated views.
     * The returned value is live; callers must not mutate it.
     * @param session - the session whose state is read.
     * @param key - the registered unit key.
     * @returns current state, or `undefined` when the key is not registered.
     */
    SessionProjectionRegistry.prototype.stateOf = function (session, key) {
        var registration = this.registrations.get(key);
        if (registration === undefined)
            return undefined;
        return this.cellFor(registration, session).state;
    };
    /**
     * One consistent cut over every registered client-visible unit for one session, read from
     * the watermark cache (missing cells fold lazily over the in-memory log).
     * Fully synchronous — every value and `asOfSeq` reflect the same log
     * position. Each value passes its unit's `viewSchema` before leaving.
     * @param session - the session whose projection values are read.
     * @returns the snapshot; `values` is empty when no client-visible unit is registered.
     */
    SessionProjectionRegistry.prototype.snapshot = function (session) {
        var values = {};
        for (var _i = 0, _a = this.registrations.values(); _i < _a.length; _i++) {
            var registration = _a[_i];
            if (registration.def.wire === undefined)
                continue;
            var cell = this.cellFor(registration, session);
            values[registration.def.key] = registration.def.wire.viewSchema.parse(registration.def.wire.view(cell.state));
        }
        return { asOfSeq: session.seq - 1, values: values };
    };
    /**
     * State-level checkpoint of every persisted unit for one session, read
     * from the watermark cache (missing cells fold lazily over the in-memory
     * log). This is the write side of the persisted projection cache: the
     * returned rows are the `(key → {ver, seq, val})` part of the durable
     * `(sessionId, key, ver, seq, val)`
     * rows. Every `val` is a DETACHED structured clone — never the live
     * cell reference: the watermark cache is this registry's authoritative
     * mutable state, and a caller reaching the live reference could corrupt
     * every subsequent snapshot and frame through it (plain JSON by the unit
     * contract, so the clone is total).
     * @param session - the session whose unit states are checkpointed.
     * @returns one row per registered key.
     */
    SessionProjectionRegistry.prototype.checkpoint = function (session) {
        var rows = {};
        for (var _i = 0, _a = this.registrations.values(); _i < _a.length; _i++) {
            var registration = _a[_i];
            var cell = this.cellFor(registration, session);
            rows[registration.def.key] = {
                ver: registration.def.stateVersion,
                seq: cell.observedSeq,
                val: structuredClone(cell.state),
            };
        }
        return rows;
    };
    /**
     * The stored seq a {@link restore} tail read over `checkpoint` must start
     * at: one event BELOW the lowest usable watermark (a row is usable when
     * its `ver` matches the live unit's `stateVersion`; an absent or mismatched row
     * pulls the floor to `0` — that key must refold the full log). The
     * one-below anchor is load-bearing: the tail then proves how far the
     * stored log still extends, so {@link restore} can detect a log that
     * shrank below a row's watermark (crash-repair truncation) instead of
     * serving the stale row as current — an empty tail read from the anchor
     * yields an end below every watermark and the restore rejects for a full
     * re-read.
     * @param checkpoint - persisted rows for one session (possibly stale or empty).
     * @returns the seq to hand the persistence `readFrom`, or `undefined`
     *   when no unit is registered (no read needed — {@link restore} would
     *   serve empty values regardless).
     */
    SessionProjectionRegistry.prototype.restoreFloor = function (checkpoint) {
        var floor;
        for (var _i = 0, _a = this.registrations.values(); _i < _a.length; _i++) {
            var registration = _a[_i];
            var row = checkpoint[registration.def.key];
            var need = row !== undefined && row.ver === registration.def.stateVersion
                ? Math.max(row.seq + 1, 0)
                : 0;
            floor = floor === undefined ? need : Math.min(floor, need);
        }
        return floor === undefined ? undefined : Math.max(floor - 1, 0);
    };
    /**
     * View a checkpoint's rows without any log read: for every registered
     * client-visible unit whose row's `ver` matches, serve the schema-validated
     * `view` of the schema-validated stored state; mismatched, malformed, or absent rows leave their key
     * absent (a cold or listing consumer treats it as not-yet-available and a
     * fuller read path refolds it). The zero-I/O rung of the read ladder —
     * values are as stale as their rows, never wrong.
     * @param checkpoint - persisted rows for one session (possibly stale or empty).
     * @returns whole values per key with a usable row; empty when none.
     */
    SessionProjectionRegistry.prototype.viewCheckpoint = function (checkpoint) {
        var values = {};
        for (var _i = 0, _a = this.registrations.values(); _i < _a.length; _i++) {
            var registration = _a[_i];
            var def = registration.def;
            if (def.wire === undefined)
                continue;
            var row = checkpoint[def.key];
            if (row === undefined || row.ver !== def.stateVersion)
                continue;
            var state = void 0;
            try {
                state = def.stateSchema.parse(row.val);
            }
            catch (_b) {
                continue;
            }
            values[def.key] = def.wire.viewSchema.parse(def.wire.view(state));
        }
        return values;
    };
    /**
     * Cold read: fold every persisted unit over a stored log suffix, seeding
     * each from its checkpoint row when usable — the one read recipe (cached
     * state + forward tail replay + `view`) applied without a live `Session`.
     * Call with the events returned by a persistence
     * `readFrom(id, restoreFloor(checkpoint))` and that same floor as
     * `baseSeq`; the floor's one-below anchor makes the supplied end honest,
     * so a shrunk log is detected here. A row is usable iff its
     * `ver` matches the live unit's `stateVersion`, it does not predate `baseSeq`
     * (`seq >= baseSeq - 1`), and it does not claim events past the
     * supplied end (`seq <= endSeq`); an unusable row is discarded
     * and its key refolds from `init` — which is only sound over the full
     * log, so a discarded row with `baseSeq > 0` throws (the caller re-reads
     * from seq 0, e.g. after a crash-repair truncation shrank the log below
     * a row's watermark).
     * @param checkpoint - persisted rows for one session (possibly stale or empty).
     * @param events - the stored events with `seq >= baseSeq`, in seq order.
     * @param baseSeq - the seq `events` starts at (its first event's seq when non-empty).
     * @returns the snapshot cut at the supplied log end (`asOfSeq` is the last
     *   supplied event's seq, `baseSeq - 1` for an empty tail) plus the
     *   refreshed checkpoint rows at that cut, ready for a durable write-back.
     */
    SessionProjectionRegistry.prototype.restore = function (checkpoint, events, baseSeq) {
        var _a, _b;
        var endSeq = (_b = (_a = events.at(-1)) === null || _a === void 0 ? void 0 : _a.seq) !== null && _b !== void 0 ? _b : baseSeq - 1;
        var values = {};
        var refreshed = {};
        for (var _i = 0, _c = this.registrations.values(); _i < _c.length; _i++) {
            var registration = _c[_i];
            var def = registration.def;
            var row = checkpoint[def.key];
            var usable = row !== undefined
                && row.ver === def.stateVersion
                && row.seq >= baseSeq - 1
                && row.seq <= endSeq;
            if (!usable && baseSeq > 0) {
                throw new Error("session projection ".concat(JSON.stringify(def.key), " cannot restore from seq ").concat(baseSeq, ": ")
                    + 'its checkpoint row is missing, version-mismatched, or beyond the supplied log end; re-read from seq 0');
            }
            var state = usable ? def.stateSchema.parse(row.val) : def.init();
            var from = usable ? row.seq : baseSeq - 1;
            for (var _d = 0, events_1 = events; _d < events_1.length; _d++) {
                var event_1 = events_1[_d];
                if (event_1.seq > from)
                    state = def.apply(state, event_1);
            }
            if (def.wire !== undefined)
                values[def.key] = def.wire.viewSchema.parse(def.wire.view(state));
            refreshed[def.key] = { ver: def.stateVersion, seq: endSeq, val: state };
        }
        return {
            snapshot: { asOfSeq: endSeq, values: values },
            checkpoint: refreshed,
        };
    };
    /** Fold one unit from init over `events`, producing a cell watermarked at the last folded event. */
    SessionProjectionRegistry.prototype.buildCell = function (def, events) {
        var _a, _b;
        var state = def.init();
        for (var _i = 0, events_2 = events; _i < events_2.length; _i++) {
            var event_2 = events_2[_i];
            state = def.apply(state, event_2);
        }
        return { state: state, observedSeq: ((_b = (_a = events.at(-1)) === null || _a === void 0 ? void 0 : _a.seq) !== null && _b !== void 0 ? _b : -1) };
    };
    /** Read (or lazily build, folding the full in-memory log) one unit's cell. */
    SessionProjectionRegistry.prototype.cellFor = function (registration, session) {
        var cell = registration.cells.get(session);
        if (cell === undefined) {
            cell = this.buildCell(registration.def, session.events);
            registration.cells.set(session, cell);
        }
        return cell;
    };
    /** Eager drive: pass one committed event through every registered unit; notify on changed references. */
    SessionProjectionRegistry.prototype.drive = function (session, event) {
        for (var _i = 0, _a = this.registrations.values(); _i < _a.length; _i++) {
            var registration = _a[_i];
            var cell = registration.cells.get(session);
            if (cell === undefined) {
                // Late build mid-stream: fold history before this event (seq = log
                // index, so the prefix slice is exact), then take the normal gate.
                cell = this.buildCell(registration.def, session.events.slice(0, event.seq));
                registration.cells.set(session, cell);
            }
            var next = registration.def.apply(cell.state, event);
            var changed = !Object.is(next, cell.state);
            cell.state = next;
            cell.observedSeq = event.seq;
            if (changed && registration.def.wire !== undefined && this.listeners.size > 0) {
                var value = registration.def.wire.viewSchema.parse(registration.def.wire.view(next));
                for (var _b = 0, _c = this.listeners; _b < _c.length; _b++) {
                    var listener = _c[_b];
                    listener(session, registration.def.key, value, event.seq);
                }
            }
        }
    };
    return SessionProjectionRegistry;
}(cordis_1.Service));
exports.SessionProjectionRegistry = SessionProjectionRegistry;
exports.default = SessionProjectionRegistry;
