"use strict";
/**
 * Capture coordinator for the telemetry capability. Live capture subscribes to
 * the session firehose plus the one live-bus relay (`agent/error`). Both
 * capture paths apply the fixed chunk projection, build logical records, and
 * run each through the
 * `session-telemetry/record` waterfall (deployment-mounted redaction rules;
 * pass-through when none), then hands the result to the backend. Live capture
 * follows the session firehose; on-demand capture replays the canonical log
 * only when requested. Every synchronous handler is self-contained so a
 * failing backend can never starve other subscribers (cordis `emit` is
 * stop-on-throw) or touch the agent loop. Composed by a backend in its
 * constructor.
 *
 * @module @z/dsh-session-telemetry/coordinator
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
exports.SessionTelemetryCoordinator = void 0;
/**
 * The handoff cursor: per session, the highest `seq` handed to a backend.
 * Deliberately MODULE-scope ambient state — a narrow, documented exception
 * to the registrations-are-effects discipline: cordis has no HMR
 * state-handover API, and keying by the `Session` object (which belongs to
 * the session store and outlives any telemetry fiber) is the only in-process
 * lifetime that lets a re-adopting fiber resume instead of re-handing
 * history. Entries die with their sessions; a missing entry safely means
 * "re-hand everything". Advanced only at emit time — the cursor marks
 * handed-off, not delivered.
 */
var handoffCursor = new WeakMap();
/**
 * Install the telemetry capture side onto a context for one backend.
 *
 * Live capture registers the persistence-coordinator listener set plus the
 * `agent/error` relay, all through `ctx.effect()`/`ctx.on()` on the composing
 * fiber, and sweeps already-live sessions (a hot reload does not replay
 * `session/created`). A `session/disposed` captures the session's `shutdown`
 * operational record at its own termination edge and retires it from the
 * adopted set. On-demand capture registers none of those continuous listeners;
 * {@link captureSession} reads the canonical log explicitly and never creates
 * operational records. Disposal captures shutdown markers for live-adopted
 * sessions, then awaits the backend's `shutdown()`; a failure there warns
 * instead of throwing — best-effort reporting must not fail application
 * teardown.
 */
var SessionTelemetryCoordinator = /** @class */ (function () {
    /**
     * @param ctx - the composing backend's context; listeners bind to its fiber.
     * @param backend - the backend receiving records; owned elsewhere, never disposed here beyond `shutdown()` forwarding.
     * @param capture - follow live events, or wait for explicit canonical-log capture.
     */
    function SessionTelemetryCoordinator(ctx, backend, capture) {
        if (capture === void 0) { capture = 'live'; }
        var _this = this;
        this.ctx = ctx;
        this.backend = backend;
        /**
         * Sessions adopted by THIS fiber and still live, for double-adoption
         * protection and the teardown sweep of unmarked sessions;
         * `session/disposed` marks and retires entries.
         */
        this.adopted = new Set();
        /** Per session, the `turn:step` keys whose first chunk already shipped; rebuilt from the log on re-adoption. */
        this.chunkSeen = new WeakMap();
        if (capture === 'live') {
            ctx.on('session/created', function (session) {
                _this.adopt(session);
            });
            // Capture the shutdown marker at the session's own termination edge,
            // then retire the only strong reference owned by this coordinator.
            ctx.on('session/disposed', function (session) {
                _this.contain(function () {
                    if (!_this.adopted.delete(session))
                        return;
                    _this.deliver(session, { record: _this.redact(shutdownRecord(session)) });
                });
            });
            ctx.on('session/event', function (session, event) {
                _this.contain(function () {
                    _this.captureEvent(session, event);
                });
            });
            // Parallel listeners are awaited by the loop at turn end; returning void
            // (not the SDK's flush promise) is the turn-latency contract.
            ctx.on('session/flush', function (session) {
                _this.contain(function () {
                    _this.hintFlush(session);
                });
            });
            ctx.on('agent/error', function (_a) {
                var agent = _a.agent, turn = _a.turn, step = _a.step, error = _a.error;
                _this.contain(function () {
                    _this.relayAgentError(agent, turn, step, error);
                });
            });
            for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
                var session = _a[_i];
                this.adopt(session);
            }
        }
        ctx.effect(function () { return function () { return __awaiter(_this, void 0, void 0, function () {
            var _loop_1, this_1, _i, _a, session, error_1;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _loop_1 = function (session) {
                            this_1.contain(function () {
                                _this.deliver(session, { record: _this.redact(shutdownRecord(session)) });
                            });
                        };
                        this_1 = this;
                        // Sessions still adopted here are alive through whole-application
                        // teardown, so capture the marker before the backend quiesces.
                        for (_i = 0, _a = this.adopted; _i < _a.length; _i++) {
                            session = _a[_i];
                            _loop_1(session);
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.backend.shutdown()];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _b.sent();
                        this.ctx.logger.warn("telemetry: backend shutdown failed: ".concat(String(error_1)));
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); }; }, 'telemetry capture');
    }
    /**
     * Project and hand over the canonical session-log suffix after the handoff
     * cursor, optionally stopping at an inclusive sequence boundary. Redaction
     * runs during this call, so an on-demand caller retains no copied records
     * before requesting capture and uses the policy mounted at that time.
     * Backend and policy failures remain contained per event and do not starve
     * later events in the same replay.
     * @param session - session whose current canonical-log prefix may be handed over.
     * @param throughSeq - optional last sequence included in this capture.
     */
    SessionTelemetryCoordinator.prototype.captureSession = function (session, throughSeq) {
        var _this = this;
        var _a;
        var cursor = (_a = handoffCursor.get(session)) !== null && _a !== void 0 ? _a : session.firstLiveSeq - 1;
        var _loop_2 = function (event_1) {
            if (throughSeq !== undefined && event_1.seq > throughSeq)
                return "break";
            this_2.contain(function () {
                if (event_1.seq <= cursor)
                    _this.track(session, event_1);
                else
                    _this.captureEvent(session, event_1);
            });
        };
        var this_2 = this;
        // Containment is PER EVENT: one rejected record is withheld fail-closed
        // while the rest of the historical replay proceeds.
        for (var _i = 0, _b = session.events; _i < _b.length; _i++) {
            var event_1 = _b[_i];
            var state_1 = _loop_2(event_1);
            if (state_1 === "break")
                break;
        }
    };
    /**
     * Adopt a session: replay its log THROUGH the projection from the handoff
     * cursor, then rely on the firehose for everything after. When no cursor
     * survived, replay starts at the session's construction boundary
     * (`firstLiveSeq`), not seq 0: constructor seeds never publish on the
     * firehose, and their content already left the process under another
     * identity — the same id in a previous process (resume) or the parent's
     * stream (fork, stitched by receivers via `session.seed_length`). Events
     * at or below the start still feed the projection state (first-chunk
     * tracking) without being re-handed, so a resumed fiber drops mid-step
     * chunk continuations exactly like the fiber that saw the step begin. The
     * cost, accepted with the capture contract's at-most-once stance: a resume no longer
     * backfills records a previous process failed to deliver.
     * @param session - the live session to adopt; a second adoption is a no-op.
     */
    SessionTelemetryCoordinator.prototype.adopt = function (session) {
        if (this.adopted.has(session))
            return;
        this.adopted.add(session);
        this.captureSession(session);
    };
    /** Feed the chunk projection without handing off — the ≤cursor half of re-adoption. */
    SessionTelemetryCoordinator.prototype.track = function (session, event) {
        if (event.type === 'assistant/chunk') {
            this.seen(session).add("".concat(event.data.turn, ":").concat(event.data.step));
        }
    };
    /** Project, redact, and hand one event to the backend. */
    SessionTelemetryCoordinator.prototype.captureEvent = function (session, event) {
        if (event.type === 'assistant/chunk') {
            var key = "".concat(event.data.turn, ":").concat(event.data.step);
            var seen = this.seen(session);
            // Fixed chunk projection: only the first chunk of each (turn, step)
            // ships — the stream-started signal; content is byte-complete in the
            // step's assembled assistant/message. Dropped chunks do not advance
            // the cursor, so re-adoption re-drops them deterministically.
            if (seen.has(key))
                return;
            seen.add(key);
        }
        this.deliver(session, {
            record: this.redact({
                channel: 'ledger',
                time: event.time,
                severity: severityOf(event),
                attributes: identityOf(session, event),
                // The canonical event object is mutable and the backend serializes
                // later; append-time validation guarantees this clone cannot throw.
                body: structuredClone(event.data),
            }),
            seq: event.seq,
        });
    };
    /**
     * Run the `session-telemetry/record` waterfall at capture time. The innermost `next`
     * passes the record through unchanged — this package ships no rules; exported
     * data is as clean as the listeners a deployment mounts. Callers run inside
     * {@link contain}, so a throwing rule withholds the record instead of
     * reaching the loop (fail-closed). On-demand capture invokes this waterfall
     * while reading the canonical session log, not when the event was appended.
     */
    SessionTelemetryCoordinator.prototype.redact = function (record) {
        return this.ctx.waterfall('session-telemetry/record', record, function () { return record; });
    };
    /** Hand one redacted record to the backend, then advance its ledger cursor. */
    SessionTelemetryCoordinator.prototype.deliver = function (session, pending) {
        this.backend.emit(pending.record);
        if (pending.seq !== undefined)
            handoffCursor.set(session, pending.seq);
    };
    /** Forward the turn-end boundary to the backend's optional flush hint. */
    SessionTelemetryCoordinator.prototype.hintFlush = function (session) {
        var _a, _b;
        if (this.adopted.has(session))
            (_b = (_a = this.backend).flush) === null || _b === void 0 ? void 0 : _b.call(_a);
    };
    /** Relay one `agent/error` bus emission as an `agent-error` operational record. */
    SessionTelemetryCoordinator.prototype.relayAgentError = function (agent, turn, step, error) {
        var detail = errorDetail(error);
        this.deliver(agent.session, {
            record: this.redact({
                channel: 'ops',
                time: Date.now(),
                severity: 'error',
                attributes: {
                    'telemetry.op': 'agent-error',
                    'session.id': String(agent.session.id),
                    'agent.id': agent.id,
                    'error.name': detail.name,
                    turn: turn,
                    step: step,
                },
                body: detail,
            }),
        });
    };
    /** Lazily create the per-session first-chunk tracking set. */
    SessionTelemetryCoordinator.prototype.seen = function (session) {
        var set = this.chunkSeen.get(session);
        if (!set)
            this.chunkSeen.set(session, set = new Set());
        return set;
    };
    /**
     * Run one capture-side step with its exception contained: cordis `emit`
     * is stop-on-throw, so a throwing listener would starve every subscriber
     * registered after this plugin — nothing from the backend may escape.
     */
    SessionTelemetryCoordinator.prototype.contain = function (step) {
        try {
            step();
        }
        catch (error) {
            this.ctx.logger.warn("telemetry: capture step failed: ".concat(String(error)));
        }
    };
    return SessionTelemetryCoordinator;
}());
exports.SessionTelemetryCoordinator = SessionTelemetryCoordinator;
/**
 * Build the per-session clean-exit marker: emitted at the session's own
 * disposal edge, or at coordinator dispose for sessions still alive then.
 */
function shutdownRecord(session) {
    return {
        channel: 'ops',
        time: Date.now(),
        severity: 'info',
        attributes: { 'telemetry.op': 'shutdown', 'session.id': String(session.id) },
        body: { op: 'shutdown' },
    };
}
/** Map an event's own outcome flag to the pre-baked alerting severity. */
function severityOf(event) {
    switch (event.type) {
        case 'tool/result':
            return event.data.message.content[0].isError === true ? 'error' : 'info';
        case 'turn/end':
            return event.data.reason.kind === 'error' ? 'error' : 'info';
        default:
            // Merge-extensible fall-through (no assertNever): event types this coordinator
            // does not depend on — including plugin-merged ones it never heard of —
            // pass through as info; their owners' outcome semantics stay theirs.
            return 'info';
    }
}
/** Normalize the live bus's arbitrary thrown value into the stable operational-record shape. */
function errorDetail(error) {
    var normalized = error instanceof Error ? error : new Error(String(error));
    return { name: normalized.name, message: normalized.message };
}
/** Build the minimal identity attributes: envelope plus self-contained header facts. */
function identityOf(session, event) {
    var attributes = {
        'session.id': String(session.id),
        'event.type': event.type,
        'event.seq': event.seq,
    };
    var _a = session.header, cwd = _a.cwd, parentSession = _a.parentSession, seedLength = _a.seedLength;
    if (cwd !== undefined)
        attributes['session.cwd'] = cwd;
    if (parentSession !== undefined)
        attributes['session.parent_id'] = String(parentSession);
    // The durable fork boundary: a forked stream starts here, and its prefix
    // lives in the parent's stream — receivers stitch on (parent_id, seed_length).
    if (seedLength !== undefined)
        attributes['session.seed_length'] = seedLength;
    return attributes;
}
