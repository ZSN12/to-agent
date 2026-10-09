"use strict";
/**
 * Host-side ApiProxy implementation. Signature discipline: unary takes the
 * narrow RpcRequest<P> and echoes request.rpcId on the RpcResponse<T>.
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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
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
exports.DEFAULT_COLD_BLANK_PROBE_MAX_BYTES = void 0;
exports.assertJsonArgs = assertJsonArgs;
exports.createApiProxy = createApiProxy;
var node_crypto_1 = require("node:crypto");
var promises_1 = require("node:fs/promises");
var node_os_1 = require("node:os");
var node_path_1 = require("node:path");
var zod_1 = require("zod");
var dsh_agent_1 = require("@z/dsh-agent");
var dsh_attachment_1 = require("@z/dsh-attachment");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_llm_2 = require("@z/dsh-llm");
var dsh_session_1 = require("@z/dsh-session");
var dsh_session_query_1 = require("@z/dsh-session-query");
var dsh_subagent_1 = require("@z/dsh-subagent");
var dsh_skill_1 = require("@z/dsh-skill");
var dsh_workspace_1 = require("@z/dsh-workspace");
// Type-only: brings the `ctx.tools` Context merge into this program (viewFor reads presenters).
var dsh_agent_presets_1 = require("@z/dsh-agent-presets");
var session_export_ts_1 = require("./session-export.ts");
var session_search_ts_1 = require("./api/session-search.ts");
// GoalError narrows domain rejections to their stable codes at the wire boundary.
var dsh_goal_1 = require("@z/dsh-goal");
// The settings/credentials seams: brand guards run at this wire boundary; the
// service reads stay optional (`ctx.get`) so a composition without either
// provider still serves every other domain.
var dsh_settings_1 = require("@z/dsh-settings");
var dsh_credentials_1 = require("@z/dsh-credentials");
// Value edge: the rename impl narrows the title service's validation failure; the import also resolves `ctx.get('sessionTitle')`.
var dsh_session_title_1 = require("@z/dsh-session-title");
var dsh_llm_3 = require("@z/dsh-llm");
var approvals_schema_ts_1 = require("./api/approvals.schema.ts");
var sessions_schema_ts_1 = require("./api/sessions.schema.ts");
var questions_schema_ts_1 = require("./api/questions.schema.ts");
var rpc_ts_1 = require("./api/rpc.ts");
var dsh_user_questions_1 = require("@z/dsh-user-questions");
var dsh_host_directory_picker_1 = require("@z/dsh-host-directory-picker");
var dsh_api_remotes_1 = require("@z/dsh-api-remotes");
var native_path_opener_ts_1 = require("./native-path-opener.ts");
/** Page size when history is called without maxMessages. */
var DEFAULT_MAX_MESSAGES = 50;
/** Provider work budget: at most 100 calls and 2,000 inspected hits. */
var SESSION_SEARCH_PROVIDER_CALL_LIMIT = 100;
/** Bound cold-log stat fan-out and settle each started batch before cancellation returns. */
var COLD_SUMMARY_BATCH_SIZE = 16;
/** Default maximum artifact size eligible for one cold blankness read. */
exports.DEFAULT_COLD_BLANK_PROBE_MAX_BYTES = 1024;
/** Conversation message event types (the pagination counting unit). */
var MESSAGE_TYPES = new Set(['user/message', 'assistant/message']);
/** Validate one prompt as a batch before publishing any durable image object. */
function durablePromptContent(ctx, content) {
    return __awaiter(this, void 0, void 0, function () {
        var refs, next;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (content.every(function (part) { return part.type === 'text'; })) {
                        return [2 /*return*/, content.map(function (part) { return ({ type: 'text', text: part.text }); })];
                    }
                    return [4 /*yield*/, (0, dsh_attachment_1.admitEncodedImages)(ctx.attachments, content.filter(function (part) { return part.type === 'image'; }))];
                case 1:
                    refs = _a.sent();
                    next = 0;
                    return [2 /*return*/, content.map(function (part) { return part.type === 'text'
                            ? { type: 'text', text: part.text }
                            // admitEncodedImages returns one reference per image part in order.
                            : { type: 'image', attachment: refs[next++] }; })];
            }
        });
    });
}
/** Search durable content for an image reference, including nested tool results. */
function imageBlockIn(content, match) {
    if (!Array.isArray(content))
        return undefined;
    for (var _i = 0, content_1 = content; _i < content_1.length; _i++) {
        var value = content_1[_i];
        if (typeof value !== 'object' || value === null || Array.isArray(value))
            continue;
        var block = value;
        if (block.type === 'image' && typeof block.attachment === 'object' && block.attachment !== null) {
            var ref = block.attachment;
            if (match(ref))
                return ref;
        }
        if (block.type === 'tool-result') {
            var nested = imageBlockIn(block.content, match);
            if (nested !== undefined)
                return nested;
        }
    }
    return undefined;
}
/** Search every durable event carrier that can own model-visible content. */
function imageInEvent(event, match) {
    var _a;
    var data = event.data;
    var direct = imageBlockIn(data.content, match);
    if (direct !== undefined)
        return direct;
    if (data.message !== undefined) {
        var wrapped = imageBlockIn(data.message.content, match);
        if (wrapped !== undefined)
            return wrapped;
    }
    if (data.inserted !== undefined) {
        for (var _i = 0, _b = data.inserted; _i < _b.length; _i++) {
            var message = _b[_i];
            var inserted = imageBlockIn(message.content, match);
            if (inserted !== undefined)
                return inserted;
        }
    }
    if (event.type === 'assistant/chunk' && ((_a = data.chunk) === null || _a === void 0 ? void 0 : _a.type) === 'block-end') {
        return imageBlockIn([data.chunk.block], match);
    }
    return undefined;
}
/** Resolve the first reference matching one opaque id. */
function referencedImage(events, attachmentId) {
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        var found = imageInEvent(event_1, function (ref) { return String(ref.attachmentId) === attachmentId; });
        if (found !== undefined)
            return found;
    }
    return undefined;
}
/** Strict browser-zone profile: UTC or an IANA Area/Location-style identifier. */
var IANA_TIME_ZONE = /^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)+$/;
/** Validate and canonicalize one browser-supplied IANA zone at the wire boundary. */
function canonicalClientTimeZone(value) {
    if (value.length === 0 || value.trim() !== value
        || (value !== 'UTC' && !IANA_TIME_ZONE.test(value)))
        return undefined;
    try {
        var canonical = new Intl.DateTimeFormat('en-US', { timeZone: value })
            .resolvedOptions().timeZone;
        /* v8 ignore next -- Intl returns UTC or a canonical IANA Area/Location for accepted input. */
        if (canonical !== 'UTC' && !IANA_TIME_ZONE.test(canonical))
            return undefined;
        return canonical;
    }
    catch (_a) {
        // Intl rejects unsupported zone names; the RPC maps that parser rejection below.
        return undefined;
    }
}
/** Read live abort state across awaits without treating it as synchronously immutable. */
function isAborted(signal) {
    return signal.aborted;
}
/**
 * Message-boundary pagination: count maxMessages append-origin messages
 * backwards from the window tail. Replacement copies never entered the
 * conversation a reader sees — they restate a shadowed range for the model
 * alone — so they consume no quota; the page stays one contiguous raw range,
 * which keeps a compaction's log-only `compaction/summary` record on the same page as its
 * replacement. The cut is the starting seq of the oldest message group (chunks
 * group via sourceEventSeqs — never cut mid-message). The tail page naturally
 * includes the in-progress partial.
 */
function paginate(events, beforeSeq, maxMessages) {
    var window = beforeSeq === undefined ? __spreadArray([], events, true) : events.filter(function (event) { return event.seq < beforeSeq; });
    var count = 0;
    var cut = 0;
    for (var i = window.length - 1; i >= 0; i--) {
        var event_2 = window[i];
        if (!MESSAGE_TYPES.has(event_2.type) || !(0, dsh_session_1.isAppendSurfaceEvent)(event_2))
            continue;
        count++;
        var sources = event_2.sourceEventSeqs;
        var groupStart = event_2.seq;
        if (sources !== undefined) {
            for (var _i = 0, sources_1 = sources; _i < sources_1.length; _i++) {
                var source = sources_1[_i];
                if (source < groupStart)
                    groupStart = source;
            }
        }
        if (count >= maxMessages) {
            cut = groupStart;
            break;
        }
    }
    var page = window.filter(function (event) { return event.seq >= cut; });
    return { events: page, hasMore: cut > 0 };
}
/** Wrap an ok result echoing the request's rpcId. */
function ok(request, value) {
    return { rpcId: request.rpcId, result: { ok: true, value: value } };
}
/**
 * Build the provider/model catalog over every registered route. Shared by the
 * session-scoped `session.models` and host-scoped `llm.models`. Catalog
 * membership stays advisory: an unlisted session selection remains valid for
 * provider dispatch, but is not injected back into the selector after its
 * owning catalog stops advertising it. Per-provider failures ride `failures`
 * without failing the sound groups; groups that advertise nothing are dropped.
 */
function buildModelCatalog(ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var catalog;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.all(ctx.llm.listProviders().map(function (provider) { return __awaiter(_this, void 0, void 0, function () {
                        var models, entries, group, error_1, failure;
                        var _this = this;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 3, , 4]);
                                    return [4 /*yield*/, ctx.llm.listModels(provider.id)];
                                case 1:
                                    models = _a.sent();
                                    return [4 /*yield*/, Promise.all(models.map(function (model) { return __awaiter(_this, void 0, void 0, function () {
                                            var resolved, reasoning;
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0: return [4 /*yield*/, ctx.llm.resolveModelInfo(provider.id, model.id)];
                                                    case 1:
                                                        resolved = _a.sent();
                                                        reasoning = resolved.reasoning === undefined
                                                            ? undefined
                                                            : __assign({ efforts: resolved.reasoning.efforts.map(function (effort) { return (__assign({ id: effort.id, name: effort.name }, effort.description === undefined
                                                                    ? {}
                                                                    : { description: effort.description })); }) }, resolved.reasoning.defaultEffort === undefined
                                                                ? {}
                                                                : { defaultEffort: resolved.reasoning.defaultEffort });
                                                        return [2 /*return*/, __assign(__assign({ id: model.id, name: model.name }, model.description === undefined ? {} : { description: model.description }), reasoning === undefined ? {} : { reasoning: reasoning })];
                                                }
                                            });
                                        }); }))];
                                case 2:
                                    entries = _a.sent();
                                    group = {
                                        id: provider.id,
                                        name: provider.name,
                                        models: entries,
                                    };
                                    return [2 /*return*/, { kind: 'group', group: group }];
                                case 3:
                                    error_1 = _a.sent();
                                    failure = {
                                        id: provider.id,
                                        name: provider.name,
                                        message: error_1 instanceof Error ? error_1.message : String(error_1),
                                    };
                                    return [2 /*return*/, { kind: 'failure', failure: failure }];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); }))];
                case 1:
                    catalog = _a.sent();
                    return [2 /*return*/, {
                            groups: catalog.flatMap(function (item) { return item.kind === 'group' ? [item.group] : []; }).filter(function (group) { return group.models.length > 0; }),
                            failures: catalog.flatMap(function (item) { return item.kind === 'failure' ? [item.failure] : []; }),
                        }];
            }
        });
    });
}
/** Wrap an error result echoing the request's rpcId. */
function err(request, error) {
    return { rpcId: request.rpcId, result: { ok: false, error: error } };
}
/**
 * The RPC refusal a preset failure becomes, or undefined when the failure is
 * about something else.
 *
 * Both the session-create path and the switch path can be handed the same two
 * failures, and a client that has to branch on the code needs them worded the
 * same from either.
 * @param request - the request being answered.
 * @param error - the thrown value.
 * @returns the refusal, or undefined when the caller should keep handling.
 */
function presetFailure(request, error) {
    if (error instanceof dsh_agent_presets_1.UnknownPresetError) {
        return err(request, {
            code: 'agent-preset-not-found',
            message: error.message,
            details: { agentPreset: error.presetId, available: __spreadArray([], error.available, true) },
        });
    }
    if (error instanceof dsh_agent_presets_1.PresetMountError) {
        return err(request, {
            code: 'agent-preset-invalid',
            message: error.message,
            details: { agentPreset: error.presetId, reason: error.reason },
        });
    }
    return undefined;
}
/** Simple async queue: core callbacks push, the AsyncIterable pulls; abort/return cleans up. */
var FrameQueue = /** @class */ (function () {
    function FrameQueue() {
        this.buffer = [];
        this.done = false;
    }
    FrameQueue.prototype.push = function (item) {
        var _a;
        if (this.done)
            return;
        this.buffer.push(item);
        (_a = this.waiter) === null || _a === void 0 ? void 0 : _a.call(this);
    };
    FrameQueue.prototype.end = function () {
        var _a;
        this.done = true;
        (_a = this.waiter) === null || _a === void 0 ? void 0 : _a.call(this);
    };
    FrameQueue.prototype.iterate = function (signal, cleanup) {
        return __asyncGenerator(this, arguments, function iterate_1() {
            var onAbort;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        onAbort = function () { _this.end(); };
                        signal.addEventListener('abort', onAbort, { once: true });
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 11, 12]);
                        _a.label = 2;
                    case 2:
                        if (!true) return [3 /*break*/, 10];
                        _a.label = 3;
                    case 3:
                        if (!(this.buffer.length > 0)) return [3 /*break*/, 6];
                        return [4 /*yield*/, __await(this.buffer.shift())];
                    case 4: return [4 /*yield*/, _a.sent()];
                    case 5:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 6:
                        if (!(this.done || signal.aborted)) return [3 /*break*/, 8];
                        return [4 /*yield*/, __await(void 0)];
                    case 7: return [2 /*return*/, _a.sent()];
                    case 8: return [4 /*yield*/, __await(new Promise(function (resolve) { _this.waiter = resolve; }))];
                    case 9:
                        _a.sent();
                        this.waiter = undefined;
                        return [3 /*break*/, 2];
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        signal.removeEventListener('abort', onAbort);
                        cleanup();
                        return [7 /*endfinally*/];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    return FrameQueue;
}());
/**
 * Server-side frame mint: pure pushes get a fresh rpcId per frame (answerable
 * frames — approval/question requested — mint their stable id in their
 * pending registries instead).
 */
function frame(payload) {
    return { rpcId: (0, rpc_ts_1.RpcId)((0, node_crypto_1.randomUUID)()), payload: payload };
}
/**
 * Narrow one allowlisted host event's argument list to the JSON values the
 * wrapper frame carries. A rejected argument is an allowlist mistake (the
 * forwarded path applies no projection), not hostile input, so it throws rather
 * than degrading to a lossy frame. The throw surfaces where the forwarding
 * listener runs, so the emitter's own listener containment logs it and drops
 * that frame — loud in the Host log, not at load or at the emit. Exported for
 * the test that owns this decision: every currently allowlisted event has a
 * statically JSON-safe payload, so a type-legal `ctx.emit` cannot reach the
 * rejection branch.
 * @param event - forwarded host event name, named in the failure.
 * @param args - the emitter's argument list.
 * @returns the same arguments typed as JSON values.
 */
function assertJsonArgs(event, args) {
    for (var _i = 0, _a = args.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], index = _b[0], arg = _b[1];
        if (!(0, dsh_session_1.isJsonValue)(arg)) {
            throw new Error("forwarded host event \"".concat(event, "\" argument ").concat(index, " is not lossless JSON data"));
        }
    }
    return args;
}
/** Queue the subscription baseline frame. */
function subscribeSession(queue, session) {
    queue.push(frame({ type: 'session/subscribed', sessionId: session.id, lastSeq: session.seq - 1 }));
}
/**
 * Project registry snapshots onto the wire view, dropping the three internal
 * fields {@link JobView} documents as absent.
 */
function jobViews(snapshots) {
    return snapshots.map(function (job) { return (__assign(__assign(__assign({ id: job.id, kind: job.kind, label: job.label, status: job.status }, job.detail === undefined ? {} : { detail: job.detail }), { startedAt: job.startedAt }), job.finishedAt === undefined ? {} : { finishedAt: job.finishedAt })); });
}
/**
 * Whether the session's conversation has started: no turn has run yet (a
 * turn is one model-loop execution). Standalone plugin events — command
 * lifecycle records, plan/mode, titles, goals — never open a turn, so
 * running `/plan` or `/goal` on a fresh session keeps it blank
 * (list-hidden, reusable).
 */
function sessionBlank(session) {
    return !session.events.some(function (event) { return event.type === 'turn/start'; });
}
/** Advance the Session-list hint projection by one committed event. */
function applySessionListMetadata(state, event) {
    var blank = state.blank && event.type !== 'turn/start';
    var lastPromptAt = event.type === 'user/message' && event.data.source.kind === 'user'
        ? event.time
        : state.lastPromptAt;
    return blank === state.blank && lastPromptAt === state.lastPromptAt
        ? state
        : { blank: blank, lastPromptAt: lastPromptAt };
}
/** Fold exact list metadata for an attached Session. */
function sessionListMetadata(events) {
    var state = { blank: true, lastPromptAt: null };
    for (var _i = 0, events_2 = events; _i < events_2.length; _i++) {
        var event_3 = events_2[_i];
        state = applySessionListMetadata(state, event_3);
    }
    return state;
}
/** Sort by creation or latest human prompt, whichever is newer. */
function sessionListUpdatedAt(header, metadata) {
    var _a;
    return Math.max(header.createdAt, (_a = metadata === null || metadata === void 0 ? void 0 : metadata.lastPromptAt) !== null && _a !== void 0 ? _a : 0);
}
/** Shared Session-header projection for list baselines and creation frames. */
function sessionListFields(header, events) {
    if (events === void 0) { events = []; }
    // The preset comes from the log, not the header: a session that switched
    // while blank ran its turns under the newer composition, and a picker
    // showing the creation-time value would contradict what the model saw.
    var agentPreset = (0, dsh_agent_presets_1.resolveSessionPreset)({ header: header, events: events });
    return __assign(__assign(__assign(__assign({}, header.parentSession === undefined ? {} : { parentSessionId: header.parentSession }), header.origin === undefined ? {} : { origin: header.origin }), header.cwd === undefined ? {} : { cwd: header.cwd }), agentPreset === undefined ? {} : { agentPreset: agentPreset });
}
/** SessionSummary projection for attached (in-memory) sessions. */
function summarize(session, running) {
    var metadata = sessionListMetadata(session.events);
    return __assign({ sessionId: session.id, updatedAt: sessionListUpdatedAt(session.header, metadata), running: running, blank: metadata.blank }, sessionListFields(session.header, session.events));
}
/**
 * Verify a possibly blank cold Session only when its physical artifact passes
 * the configured per-Session size check. A stale `blank: true`, an
 * absent cache row, a large or location-less artifact, and read failures all
 * resolve to visible (`false`); listing must never hide a conversation on a
 * cache hint or an unavailable optimization.
 */
function probeColdSessionMetadata(ctx, persistence, meta, maxBytes, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var location, size, _a, events, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (maxBytes === 0)
                        return [2 /*return*/, undefined];
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    location = persistence.locate(meta);
                    if (location === undefined)
                        return [2 /*return*/, undefined];
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.stat)(location.path)];
                case 2:
                    size = (_b.sent()).size;
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [2 /*return*/, undefined];
                case 4:
                    if (size > maxBytes)
                        return [2 /*return*/, undefined];
                    _b.label = 5;
                case 5:
                    _b.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, persistence.readFrom(meta.id, 0, signal)];
                case 6:
                    events = (_b.sent()).events;
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [2 /*return*/, sessionListMetadata(events)];
                case 7:
                    error_2 = _b.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    ctx.logger.warn("session.list: blank probe for \"".concat(meta.id, "\" failed (serving it as visible): ").concat(String(error_2)));
                    return [2 /*return*/, undefined];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/** SessionSummary projection for a cold persisted Session. */
function summarizeCold(ctx, persistence, meta, metadata, blankProbeMaxBytes, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var probed, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!((metadata === null || metadata === void 0 ? void 0 : metadata.blank) === false)) return [3 /*break*/, 1];
                    _a = undefined;
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, probeColdSessionMetadata(ctx, persistence, meta, blankProbeMaxBytes, signal)];
                case 2:
                    _a = _c.sent();
                    _c.label = 3;
                case 3:
                    probed = _a;
                    return [2 /*return*/, __assign({ sessionId: meta.id, updatedAt: sessionListUpdatedAt(meta, probed !== null && probed !== void 0 ? probed : metadata), running: false, blank: (metadata === null || metadata === void 0 ? void 0 : metadata.blank) === false ? false : (_b = probed === null || probed === void 0 ? void 0 : probed.blank) !== null && _b !== void 0 ? _b : false }, sessionListFields(meta))];
            }
        });
    });
}
/** Map a browse-primitive failure onto the wire error vocabulary (unknown throws stay internal). */
function directoryError(error) {
    if (error instanceof dsh_host_directory_picker_1.DirectoryPickerError) {
        return { code: error.code, message: error.message, details: { path: error.path } };
    }
    return { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} };
}
/** Project a pending entry into its answerable mux frame (initial push and mux-open replay share it). */
function requestedFrame(pending) {
    return {
        rpcId: pending.rpcId,
        payload: __assign(__assign({ type: 'approval/requested', sessionId: pending.sessionId, approvalId: pending.approvalId, toolName: pending.toolName }, pending.callId === undefined ? {} : { callId: pending.callId }), pending.reason === undefined ? {} : { reason: pending.reason }),
    };
}
/** Validate one answer batch against the exact question request it resolves. */
function matchesQuestions(payload, pending) {
    if (payload.sessionId !== pending.sessionId)
        return false;
    var answers = payload.answer.answers;
    if (answers.length !== pending.questions.length)
        return false;
    return answers.every(function (answer, index) {
        var _a, _b, _c;
        var question = pending.questions[index];
        if (answer.id !== question.id)
            return false;
        if (new Set(answer.selected).size !== answer.selected.length)
            return false;
        var custom = (_a = answer.custom) === null || _a === void 0 ? void 0 : _a.trim();
        if (custom !== undefined && custom === '')
            return false;
        if (question.multiSelect !== true) {
            if (custom !== undefined && answer.selected.length > 0)
                return false;
            if (answer.selected.length > 1)
                return false;
        }
        var labels = new Set((_c = (_b = question.options) === null || _b === void 0 ? void 0 : _b.map(function (option) { return option.label; })) !== null && _c !== void 0 ? _c : []);
        return answer.selected.every(function (label) { return labels.has(label); });
    });
}
/**
 * Compute the render intent for a tool/call or tool/result event through the
 * presenters registered at this moment; every other event type gets none. A
 * result's presenter needs its call's parsed args — `argsFor` supplies them
 * (live: the per-session call table; history: an in-page backscan), returning
 * undefined when the pairing is unavailable (e.g. the call fell off the page),
 * which soft-falls to no view. Presenter or JSON.parse throws also soft-fall:
 * the client's documented default (generic JSON card) covers every miss.
 */
function viewFor(ctx, event, argsFor, 
// Presenters live with the definitions, and definitions live in the scope
// chain: a preset registers its tools into its standing layer. A live agent
// is a scope whose chain passes through its preset; a cold read passes the
// preset's standing key directly — no agent, no resume. An undefined scope
// sees only the global layer, which is the pre-preset deployment shape.
scope) {
    var _a, _b, _c, _d;
    try {
        if (event.type === 'tool/call') {
            var _e = event.data, name_1 = _e.name, raw = _e.arguments;
            var view = (_b = (_a = ctx.tools.get(name_1, scope)) === null || _a === void 0 ? void 0 : _a.presentCall) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.parse(raw));
            return view === undefined ? undefined : { for: 'call', view: view };
        }
        if (event.type === 'tool/result') {
            var _f = event.data, message = _f.message, meta = _f.meta;
            var result = message.content[0];
            var callId = message.source.callId;
            var call = argsFor(callId);
            if (call === undefined)
                return undefined;
            var view = (_d = (_c = ctx.tools.get(call.name, scope)) === null || _c === void 0 ? void 0 : _c.presentResult) === null || _d === void 0 ? void 0 : _d.call(_c, call.args, __assign({ content: result.content, isError: result.isError === true }, meta === undefined ? {} : { meta: meta }));
            return view === undefined ? undefined : { for: 'result', view: view };
        }
    }
    catch (error) {
        // A throwing presenter (or unparseable arguments) must not break delivery;
        // the event still ships, just without a view.
        console.error("api-proxy: presenter failed for ".concat(event.type, ", falling back to generic: ").concat(String(error)));
    }
    return undefined;
}
/**
 * Resolve a tool/result's call pairing by scanning a window of events backwards
 * for the matching tool/call. Used by the history path (the page is the
 * window — a cross-page pairing soft-falls to no view) and by live-path table
 * misses after a reconnect-eviction.
 */
function backscanArgs(events, callId) {
    for (var i = events.length - 1; i >= 0; i--) {
        var event_4 = events[i];
        if (event_4.type !== 'tool/call')
            continue;
        var data = event_4.data;
        if (data.callId !== callId)
            continue;
        try {
            return { name: data.name, args: JSON.parse(data.arguments) };
        }
        catch (_a) {
            // Unparseable stored arguments: same soft-fall as a live parse failure.
            return undefined;
        }
    }
    return undefined;
}
/** Render one detached history page through the same presenter path as ordinary history. */
function historyPage(ctx, events, beforeSeq, maxMessages, scope) {
    var page = paginate(events, beforeSeq, maxMessages !== null && maxMessages !== void 0 ? maxMessages : DEFAULT_MAX_MESSAGES);
    return {
        events: page.events.map(function (event) {
            var view = viewFor(ctx, event, function (callId) { return backscanArgs(page.events, callId); }, scope);
            return __assign({ event: event }, view === undefined ? {} : { view: view });
        }),
        hasMore: page.hasMore,
    };
}
function projectionsFor(ctx, session) {
    var registry = ctx.get('sessionProjections');
    if (registry === undefined)
        return undefined;
    return registry.snapshot(session);
}
/**
 * The projection baseline of one session.list row, fail-soft: attached
 * sessions cut the registry's live watermark cache; cold sessions view the
 * persisted projection cache's identity-checked stored rows (zero log loads
 * either way — the listing use case the cache exists for). The block shape
 * (values + asOfSeq) matches the history tail's, so a client seeds its
 * value store under the same higher-seq-wins rule. Any failure — and an
 * empty value set — yields an absent block: a listing without projections
 * is degraded, never broken.
 */
function listProjectionsFor(ctx, meta, session) {
    var _a, _b;
    try {
        var block = session !== undefined
            ? (_a = ctx.get('sessionProjections')) === null || _a === void 0 ? void 0 : _a.snapshot(session)
            : (_b = ctx.get('sessionProjectionCache')) === null || _b === void 0 ? void 0 : _b.cachedSnapshot(meta);
        return block !== undefined && Object.keys(block.values).length > 0 ? block : undefined;
    }
    catch (error) {
        ctx.logger.warn("session.list: projection column for \"".concat(meta.id, "\" failed (serving the row without it): ").concat(String(error)));
        return undefined;
    }
}
/** Projection baseline for a detached history tail without Agent activation. */
function detachedProjectionsFor(ctx, events) {
    var registry = ctx.get('sessionProjections');
    if (registry === undefined)
        return undefined;
    return registry.restore({}, events, 0).snapshot;
}
/**
 * Best-effort projections for one subagent history page, fail-soft like
 * {@link listProjectionsFor}: a registered unit throwing on a corrupt payload
 * never blocks transcript reading — the page is served without the block.
 * @param ctx - context carrying the logger for the degradation warning.
 * @param childSessionId - the child whose page is being decorated.
 * @param compute - the arm-specific fold (live watermark or detached restore).
 * @returns the projections block, or undefined when the fold failed.
 */
function subagentHistoryProjections(ctx, childSessionId, compute) {
    try {
        return compute();
    }
    catch (error) {
        ctx.logger.warn("subagent.history: projections for \"".concat(childSessionId, "\" failed (serving the page without them): ").concat(String(error)));
        return undefined;
    }
}
/** Map continuation admission failures without exposing provider details. */
function subagentPromptError(request, error, signal) {
    var childSessionId = request.payload.childSessionId;
    if (signal.aborted) {
        return err(request, { code: 'cancelled', message: 'subagent prompt was cancelled', details: {} });
    }
    if (error instanceof dsh_subagent_1.SubagentError) {
        switch (error.code) {
            case 'NOT_RESUMABLE':
                return err(request, {
                    code: 'subagent-not-resumable',
                    message: 'subagent cannot be resumed',
                    details: { childSessionId: childSessionId },
                });
            case 'UNAUTHORIZED':
                return err(request, {
                    code: 'subagent-unauthorized',
                    message: 'subagent does not belong to this parent',
                    details: { childSessionId: childSessionId },
                });
            case 'DRAINING':
            case 'ACTIVATION_CLOSING':
            case 'CONTINUATION_UNAVAILABLE':
            case 'PERSISTENCE_UNAVAILABLE':
                return err(request, {
                    code: 'subagent-delivery-unavailable',
                    message: 'subagent follow-up is temporarily unavailable',
                    details: { childSessionId: childSessionId },
                });
            default:
                break;
        }
    }
    return err(request, { code: 'internal', message: 'subagent prompt failed', details: {} });
}
/** Stable RPC face of the missing projections capability, shared by every catalog read path. */
function projectionsUnavailableError() {
    return {
        code: 'internal',
        message: 'subagent catalog is unavailable: this deployment does not mount the sessionProjections registry (load @z/dsh-session-projection)',
        details: {},
    };
}
/** Verify one address and mode against the complete direct-child catalog. */
function catalogChild(ctx, address, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var parentSessionId, childSessionId, mode, entries, entry, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    parentSessionId = address.parentSessionId, childSessionId = address.childSessionId, mode = address.mode;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, ctx.subagents.listChildren(parentSessionId, signal)];
                case 2:
                    entries = _a.sent();
                    entry = entries.find(function (candidate) { return candidate.id === childSessionId; });
                    if (entry === undefined || (entry.kind === 'child' && entry.mode !== mode)) {
                        return [2 /*return*/, {
                                error: {
                                    code: 'subagent-not-found',
                                    message: "session \"".concat(childSessionId, "\" is not a ").concat(mode, " direct child of \"").concat(parentSessionId, "\""),
                                    details: { parentSessionId: parentSessionId, childSessionId: childSessionId },
                                },
                            }];
                    }
                    if (entry.kind === 'diagnostic') {
                        return [2 /*return*/, {
                                error: {
                                    code: 'subagent-catalog-diagnostic',
                                    message: "subagent \"".concat(childSessionId, "\" is ").concat(entry.reason),
                                    details: { parentSessionId: parentSessionId, childSessionId: childSessionId, reason: entry.reason },
                                },
                            }];
                    }
                    return [2 /*return*/, { entry: entry }];
                case 3:
                    error_3 = _a.sent();
                    if ((signal === null || signal === void 0 ? void 0 : signal.aborted) || (error_3 instanceof dsh_subagent_1.SubagentError && error_3.code === 'CANCELLED')) {
                        return [2 /*return*/, { error: { code: 'cancelled', message: 'subagent catalog read was cancelled', details: {} } }];
                    }
                    if (error_3 instanceof dsh_subagent_1.SubagentError && error_3.code === 'SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE') {
                        return [2 /*return*/, { error: projectionsUnavailableError() }];
                    }
                    return [2 /*return*/, { error: { code: 'internal', message: 'subagent catalog read failed', details: {} } }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * The requested preset differs from the one this session already runs.
 *
 * A session's composition is fixed at creation: its history was produced under
 * that preset's tools, so adopting the identity under a different one would
 * replay tool calls the rebuilt agent cannot make. Naming a different preset
 * is therefore a caller error rather than a switch.
 */
/** The roster is absent: this deployment composes no agent presets at all. */
function noRoster(agentPreset) {
    return {
        code: 'agent-preset-not-found',
        message: 'this deployment composes no agent presets',
        details: { agentPreset: agentPreset, available: [] },
    };
}
/** Map one authoring/roster failure onto its wire code. */
function presetError(agentPreset, error) {
    if (error instanceof dsh_agent_presets_1.UnknownPresetError) {
        return {
            code: 'agent-preset-not-found',
            message: error.message,
            details: { agentPreset: error.presetId, available: __spreadArray([], error.available, true) },
        };
    }
    if (error instanceof dsh_agent_presets_1.PresetNotWritableError) {
        return { code: 'agent-preset-read-only', message: error.message, details: { agentPreset: agentPreset, reason: error.message } };
    }
    if (error instanceof dsh_agent_presets_1.InvalidPresetIdError || error instanceof dsh_agent_presets_1.PresetExistsError) {
        return { code: 'agent-preset-invalid', message: error.message, details: { agentPreset: agentPreset, reason: error.message } };
    }
    return { code: 'internal', message: "agent preset \"".concat(agentPreset, "\": ").concat(String(error)), details: {} };
}
var AgentPresetConflict = /** @class */ (function (_super) {
    __extends(AgentPresetConflict, _super);
    function AgentPresetConflict(sessionId, requestedPreset, existingPreset) {
        var _this = _super.call(this, existingPreset === undefined
            ? "session \"".concat(sessionId, "\" records no agent preset, so it cannot be adopted under one; ")
                + 'a deployment composing no roster records none on any session — '
            : "session \"".concat(sessionId, "\" already runs agent preset ").concat(JSON.stringify(existingPreset), "; ")
                + "requested ".concat(JSON.stringify(requestedPreset), ". A session's preset is fixed at creation.")) || this;
        _this.sessionId = sessionId;
        _this.requestedPreset = requestedPreset;
        _this.existingPreset = existingPreset;
        return _this;
    }
    return AgentPresetConflict;
}(Error));
/** Requested identity already belongs to a session with another project cwd. */
var SessionCwdConflict = /** @class */ (function (_super) {
    __extends(SessionCwdConflict, _super);
    function SessionCwdConflict(sessionId, requestedCwd, existingCwd) {
        var _this = _super.call(this, "session \"".concat(sessionId, "\" already exists with cwd ").concat(JSON.stringify(existingCwd), "; ")
            + "requested ".concat(JSON.stringify(requestedCwd))) || this;
        _this.sessionId = sessionId;
        _this.requestedCwd = requestedCwd;
        _this.existingCwd = existingCwd;
        return _this;
    }
    return SessionCwdConflict;
}(Error));
/** An explicit Host naming operation would duplicate another Workspace title. */
var WorkspaceNameConflictError = /** @class */ (function (_super) {
    __extends(WorkspaceNameConflictError, _super);
    function WorkspaceNameConflictError(workspaceName) {
        var _this = _super.call(this, "workspace name '".concat(workspaceName, "' is already in use")) || this;
        _this.workspaceName = workspaceName;
        _this.name = 'WorkspaceNameConflictError';
        return _this;
    }
    return WorkspaceNameConflictError;
}(Error));
/** Shared workspace-not-found error response of the workspace.* mutation rows. */
function workspaceNotFound(request, workspaceId) {
    return err(request, {
        code: 'workspace-not-found',
        message: "workspace \"".concat(workspaceId, "\" not found"),
        details: { workspaceId: workspaceId },
    });
}
/** Wire projection of one workspace entity (the workspace.* value row). */
function workspaceView(workspace) {
    return {
        workspaceId: workspace.id,
        path: workspace.path,
        title: workspace.title,
        sessionIds: __spreadArray([], workspace.sessionIds, true),
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
    };
}
/** Wire projection of the durable record carried by `domain/changed`. */
function changedWorkspaceView(workspaceId, value) {
    var record = dsh_workspace_1.workspaceRecord.parse(value);
    return {
        workspaceId: workspaceId,
        path: record.path,
        title: record.title,
        sessionIds: __spreadArray([], record.sessionIds, true),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}
/**
 * Implement ApiProxy over a composed host context.
 * @param ctx - a context with the Host spine and Workspace registry mounted.
 * @param defaults - host routing and project-directory defaults.
 * @returns the ApiProxy implementation.
 */
function createApiProxy(ctx, defaults) {
    var _this = this;
    var _a, _b;
    var sessionExportCompressionLevel = (_a = defaults.sessionExportCompressionLevel) !== null && _a !== void 0 ? _a : session_export_ts_1.DEFAULT_SESSION_LOG_COMPRESSION_LEVEL;
    var coldBlankProbeMaxBytes = (_b = defaults.coldBlankProbeMaxBytes) !== null && _b !== void 0 ? _b : exports.DEFAULT_COLD_BLANK_PROBE_MAX_BYTES;
    /** The seed model each create/resume declares; re-read so it never goes stale. */
    var agentOptions = function () {
        var _a = defaults.defaultModelSelection(), provider = _a.provider, model = _a.model;
        return { provider: provider, model: model };
    };
    var selections = new WeakMap();
    /**
     * Serializes `agentPreset.select` per session. Two concurrent selects both
     * pass the blank check, and the second `unmountPresetFor` then finds nothing
     * to unmount because the first already removed the record — leaving two
     * compositions registered into one agent layer. The client's `busy` flag is
     * not enforcement: the wire is reachable directly.
     */
    var presetSwitches = new Map();
    /** Client-chosen identity creation/resume, deduplicated across concurrent retries. */
    var sessionCreations = new Map();
    /** Serializes path ownership and explicit title checks with Workspace mutations. */
    var workspaceCreationChain = Promise.resolve();
    var pendingQuestions = new Map();
    var pendingApprovals = new Map();
    var authorizationAttempts = new Map();
    var muxQueues = new Set();
    var imageAdmissionChains = new WeakMap();
    /** Serialize image admission with model selection for one agent. */
    function serializeImageAdmission(agent, operation) {
        var _a;
        var result = ((_a = imageAdmissionChains.get(agent)) !== null && _a !== void 0 ? _a : Promise.resolve()).then(operation);
        imageAdmissionChains.set(agent, result.then(function () { return undefined; }, function () { return undefined; }));
        return result;
    }
    /**
     * Install or return the session-local model selection that prompt assembly snapshots.
     *
     * Precedence, resolved on EVERY read rather than seeded once: a selection
     * made in this process, else the session's own latest logged request/header,
     * else the live Agent default. Re-reading keeps the two tiers exact in both
     * directions: a session with a recorded request derives its selection from
     * its log, while a blank session (New Session reuses one rather than minting
     * another) reads any default saved after it was created. There is no create-time
     * per-session override tier on this wire — if one returns (a create-options
     * contribution), it must fold in between the selection and the log.
     */
    function selectionFor(agent) {
        var installed = selections.get(agent);
        if (installed !== undefined)
            return installed;
        var picked;
        var selection = {
            get current() {
                var _a;
                if (picked !== undefined)
                    return picked;
                // Incrementally folded by the session, so a per-step read costs
                // O(new events) rather than a rescan.
                var logged = (_a = agent.session.requestHeader()) === null || _a === void 0 ? void 0 : _a.config;
                if (logged === undefined)
                    return defaults.defaultModelSelection();
                return __assign({ provider: logged.provider, model: logged.model }, logged.reasoningEffort === undefined
                    ? {}
                    : { reasoningEffort: logged.reasoningEffort });
            },
            set current(next) {
                picked = next;
            },
            assembled: undefined,
        };
        (0, dsh_agent_1.installModelSelection)(agent.ctx, selection);
        selections.set(agent, selection);
        return selection;
    }
    /** Pre-publication setup used by both fresh and resumed Web agents. */
    function installSelection(agentCtx) {
        var agent = agentCtx.agent;
        if (agent === undefined)
            throw new Error('api-proxy: agent setup has no scoped agent');
        selectionFor(agent);
    }
    /**
     * Reject an attempt to run an existing session under a different preset.
     *
     * A caller that names no preset always adopts the session as it is, so the
     * common paths — reconnecting, resuming, retrying a create — are unaffected.
     * @param sessionId - the identity being adopted.
     * @param requested - the preset the request named, if any.
     * @param existing - the preset the session RUNS, if any; both callers resolve
     * it from the log, which differs from the creation header once a blank
     * session has switched.
     * @throws when both are present and differ.
     */
    function assertPresetUnchanged(sessionId, requested, existing) {
        if (requested === undefined || requested === existing)
            return;
        throw new AgentPresetConflict(sessionId, requested, existing);
    }
    /**
     * Resolve the preset an agent will be composed from, and the setup that
     * installs it.
     *
     * The id is resolved BEFORE the session exists because the session boundary
     * snapshots `meta` before asynchronous setup begins — a preset discovered
     * during setup could never reach the header. Mounting still happens in
     * setup, where a failure rolls the whole creation back rather than leaving a
     * published session whose capabilities are half-installed.
     *
     * A deployment with no preset roster composes nothing and every session
     * shares the host composition, which is the behavior before presets existed.
     * @param presetId - the requested preset, or `undefined` for the default.
     * @returns the id to record on the header (absent without a roster) and the setup callback.
     * @throws when the roster supplies no such preset.
     */
    function composeAgent(presetId) {
        return __awaiter(this, void 0, void 0, function () {
            var presets, resolvedId;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        presets = ctx.get('agentPresets');
                        if (presets === undefined) {
                            return [2 /*return*/, {
                                    setup: function (agentCtx) {
                                        installSelection(agentCtx);
                                        return Promise.resolve();
                                    },
                                }];
                        }
                        return [4 /*yield*/, presets.resolve(presetId)];
                    case 1:
                        resolvedId = (_a.sent()).id;
                        return [2 /*return*/, {
                                agentPreset: resolvedId,
                                setup: function (agentCtx) { return __awaiter(_this, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                installSelection(agentCtx);
                                                return [4 /*yield*/, presets.mount(agentCtx, resolvedId)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); },
                            }];
                }
            });
        });
    }
    var hasSubagentOwner = function (session, agent) { return (0, dsh_api_remotes_1.hasApiRemoteSubagentOwner)(ctx, session, agent); };
    var subagentOwnershipError = function (sessionId) {
        return (0, dsh_api_remotes_1.apiRemoteSubagentOwnershipError)(sessionId);
    };
    var inspectServable = function (sessionId) {
        return (0, dsh_api_remotes_1.inspectApiRemoteSession)(ctx, sessionId);
    };
    // Cold resume composes the preset the session recorded, for the same reason
    // `session.create` does: its history was produced under that composition.
    // Every generic entry point — prompt, models, commands — arrives here, so
    // leaving it out meant a session opened after a restart ran on host tools
    // and the deployment persona. Resolved from the LOG, not the header: a
    // session that switched while blank ran its turns under the newer
    // composition, and the header is written once at creation. Reading the
    // header here would silently undo the switch on the next restart and
    // restore that history under the old tool set.
    var agentFor = (0, dsh_api_remotes_1.createApiRemoteAgentResolver)(ctx, {
        agentOptions: agentOptions,
        setup: function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
            var meta = _b.meta, events = _b.events;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, composeAgent((0, dsh_agent_presets_1.resolveSessionPreset)({ header: meta, events: events }))];
                    case 1: return [2 /*return*/, (_c.sent()).setup];
                }
            });
        }); },
    });
    /** Send one transient frame to every connected mux consumer. */
    function broadcast(payload) {
        var envelope = frame(payload);
        for (var _i = 0, muxQueues_1 = muxQueues; _i < muxQueues_1.length; _i++) {
            var queue = muxQueues_1[_i];
            queue.push(envelope);
        }
    }
    // Projection change feed → session/projection push frames. The carrier
    // mints the wire frame (the Service Definition package holds no wire vocabulary); the
    // child activates only when a projection registry is composed, and the
    // subscription unwinds with this gateway's fiber.
    ctx.inject(['sessionProjections'], function (projectionCtx) {
        projectionCtx.sessionProjections.onChanged(function (session, key, value, seq) {
            broadcast({ type: 'session/projection', sessionId: session.id, key: key, value: value, seq: seq });
        });
    });
    // The cache supplies recency and a monotonic non-blank hint. A cached
    // `blank: true` remains only a prefix fact and is verified on the cold path.
    ctx.inject(['sessionProjections'], function (projectionCtx) {
        projectionCtx.sessionProjections.register({
            key: 'sessionListMetadata',
            stateSchema: sessions_schema_ts_1.sessionListMetadataProjectionSchema,
            init: function () { return ({ blank: true, lastPromptAt: null }); },
            apply: applySessionListMetadata,
            wire: { viewSchema: sessions_schema_ts_1.sessionListMetadataProjectionSchema, view: function (state) { return state; } },
            stateVersion: 1,
        });
    });
    // The imageLimits projection unit: the attachments config this proxy
    // enforces at prompt admission, constant per host boot. `apply` keeps the
    // same state reference for every event, so no change frames are ever
    // pushed — baselines alone carry the value — and clients pre-check intake
    // and label upload affordances from it. Registered here, not in the
    // attachment Service Definition: dsh-llm depends on dsh-attachment, so the
    // seam package cannot reference the projection registry without a cycle,
    // and the per-message rules the value describes are this proxy's own
    // admission checks. The child activates only while both seams are composed.
    // `view` reading the live service instead of the (null) state is sanctioned
    // exactly for boot-constant units: the value cannot change within a process
    // lifetime, so the fold stays observationally pure, and a stale persisted
    // cache row re-viewing to the current config is the correct outcome.
    ctx.inject(['sessionProjections', 'attachments'], function (projectionCtx) {
        projectionCtx.sessionProjections.register({
            key: 'imageLimits',
            stateSchema: zod_1.z.null(),
            init: function () { return null; },
            apply: function (state) { return state; },
            wire: { viewSchema: sessions_schema_ts_1.imageLimitsProjectionSchema, view: function () { return projectionCtx.attachments.imageLimits; } },
            stateVersion: 1,
        });
    });
    /** Project both durable inbox lists, optionally including the splice currently being emitted. */
    var queueItems = function (agent, splice) {
        var project = function (target) {
            var _a;
            var messages = target === 'next-turn' ? agent.inbox.nextTurn : agent.inbox.nextStep;
            return (splice === null || splice === void 0 ? void 0 : splice.target) === target
                ? messages.toSpliced.apply(messages, __spreadArray([splice.start, (_a = splice.removedCount) !== null && _a !== void 0 ? _a : 0], splice.inserted, false)) : messages;
        };
        return __spreadArray(__spreadArray([], project('next-turn').map(function (message) { return ({ id: message.id, placement: 'queued', message: message }); }), true), project('next-step').map(function (message) { return ({
            id: message.id,
            // Only user-origin messages are steering; injected context (approval
            // notices, task completion, attached snapshots) is not a user action
            // and must not render as a pending steering bubble.
            placement: message.source.kind === 'user' ? 'steering' : 'context',
            message: message,
        }); }), true);
    };
    ctx.root.on('session/event', function (session, event) {
        if (event.type !== 'agent/inbox/spliced')
            return;
        var agent = ctx.agents.get(session.id);
        if ((agent === null || agent === void 0 ? void 0 : agent.session) !== session)
            return;
        broadcast({ type: 'session/queue', sessionId: session.id, items: queueItems(agent, event.data) });
    }, { global: true });
    /** Remove a wait before settling it: synchronous deletion makes the first claimant win. */
    function claimQuestion(pending, outcome) {
        pendingQuestions.delete(pending.rpcId);
        if (pending.signal !== undefined && pending.onAbort !== undefined) {
            pending.signal.removeEventListener('abort', pending.onAbort);
        }
        broadcast({
            type: 'question/resolved', sessionId: pending.sessionId,
            questionRpcId: pending.rpcId,
            outcome: outcome,
        });
    }
    var disposeProvider = ctx.userQuestions.registerProvider({
        ask: function (request) {
            var _a;
            var sessionId = (_a = request.agent) === null || _a === void 0 ? void 0 : _a.id;
            if (sessionId === undefined) {
                return Promise.reject(new dsh_user_questions_1.UserQuestionError('web user interaction requires an agent-owned session', 'ASK_MISSING_AGENT'));
            }
            return new Promise(function (resolve, reject) {
                var _a;
                var rpcId = (0, rpc_ts_1.RpcId)((0, node_crypto_1.randomUUID)());
                var pending = __assign({ rpcId: rpcId, sessionId: sessionId, questions: request.questions, resolve: resolve, reject: reject }, (request.signal === undefined ? {} : { signal: request.signal }));
                var onAbort = function () {
                    claimQuestion(pending, 'cancelled');
                    reject(new dsh_user_questions_1.UserQuestionError('ask_user_question was aborted before the user answered', 'ASK_ABORTED'));
                };
                pending.onAbort = onAbort;
                pendingQuestions.set(rpcId, pending);
                (_a = request.signal) === null || _a === void 0 ? void 0 : _a.addEventListener('abort', onAbort, { once: true });
                var envelope = {
                    rpcId: rpcId,
                    payload: { type: 'question/requested', sessionId: sessionId, questions: request.questions },
                };
                for (var _i = 0, muxQueues_2 = muxQueues; _i < muxQueues_2.length; _i++) {
                    var queue = muxQueues_2[_i];
                    queue.push(envelope);
                }
            });
        },
    });
    ctx.effect(function () { return function () {
        disposeProvider();
        for (var _i = 0, _a = __spreadArray([], pendingQuestions.values(), true); _i < _a.length; _i++) {
            var pending = _a[_i];
            claimQuestion(pending, 'cancelled');
            pending.reject(new dsh_user_questions_1.UserQuestionError('web user-questions provider was disposed', 'ASK_ABORTED'));
        }
    }; }, 'api-proxy: user-questions provider');
    // --- Approval pending registry ------------------------------------------
    // The proxy is the approval channel for every agent this host owns: an ask
    // through `ctx.approval` becomes an answerable server-request on the mux
    // stream (stable rpcId), settled by POST /api/respond. The entry survives
    // client disconnects — mux-open replays still-pending requested frames with
    // the same rpcId (the refresh-recovery baseline) — and withdraws on the
    // ask's own abort signal (turn cancel), pushing `cancelled` to subscribers.
    if (ctx.get('approval') !== undefined) {
        // Teardown parity with the question provider above: a gateway disposed
        // while approvals are pending settles every entry as 'cancelled' (the
        // service's fail-closed vocabulary), so no ask promise dangles past the
        // proxy's lifetime and subscribers see the withdrawal.
        ctx.effect(function () { return function () {
            for (var _i = 0, _a = __spreadArray([], pendingApprovals.values(), true); _i < _a.length; _i++) {
                var pending = _a[_i];
                pending.resolve('cancelled');
            }
        }; }, 'api-proxy: approval registry teardown');
        ctx.on('approval/request', function (req, next) {
            var _a, _b, _c;
            // Dispatch rides a microtask behind the service's own signal check: an
            // abort landing in that window would register the abort listener AFTER
            // the signal fired — never invoked, entry pending forever, zombie frame
            // on every mux replay. Settle synchronously instead of publishing.
            if (((_a = req.signal) === null || _a === void 0 ? void 0 : _a.aborted) === true)
                return Promise.resolve('cancelled');
            // The audit pair `approval/asked` is already appended by the service
            // before dispatch, but dispatch rides a microtask: parallel tool calls
            // can append several asked events before any answerer runs. THIS
            // request's event is therefore the newest asked event that is still
            // undecided, unclaimed by another pending entry, and — when the ask
            // names a call — carries the same callId.
            var events = req.agent.session.events;
            var claimed = new Set();
            for (var _i = 0, _d = pendingApprovals.values(); _i < _d.length; _i++) {
                var entry = _d[_i];
                claimed.add(entry.approvalId);
            }
            var decided = new Set();
            var approvalId;
            for (var i = events.length - 1; i >= 0; i -= 1) {
                var event_5 = events[i];
                if (event_5.type === 'approval/decided') {
                    decided.add(event_5.data.id);
                }
                else if (event_5.type === 'approval/asked') {
                    if (decided.has(event_5.data.id) || claimed.has(event_5.data.id))
                        continue;
                    // Symmetric pairing: a callId-bearing ask only takes its own call's
                    // record, and a callId-less ask only takes a callId-less record —
                    // so neither shape can steal the other's audit id under parallel
                    // asks. (Today every producer — the tool executor — passes callId;
                    // the callId-less arm guards any future non-tool asker.)
                    if (((_b = req.callId) !== null && _b !== void 0 ? _b : null) !== ((_c = event_5.data.callId) !== null && _c !== void 0 ? _c : null))
                        continue;
                    approvalId = event_5.data.id;
                    break;
                }
            }
            // No asked event means the request bypassed the service's audit path —
            // not this channel's question; delegate to the fail-closed default.
            if (approvalId === undefined)
                return next();
            var id = approvalId;
            return new Promise(function (resolve) {
                var _a;
                var settle = function (outcome) {
                    var _a;
                    /* v8 ignore next 3 -- defensive double-settle guard: respond() routes
                       through the pending table (a settled id is not-pending before it can
                       re-settle) and the first settle removes the abort listener, so no
                       reachable path settles twice; kept against future settle callers. */
                    if (!pendingApprovals.delete(pending.rpcId))
                        return;
                    (_a = req.signal) === null || _a === void 0 ? void 0 : _a.removeEventListener('abort', onAbort);
                    broadcast({ type: 'approval/resolved', sessionId: pending.sessionId, approvalId: id, outcome: outcome });
                    // A cancelled ask was already settled by the service's own signal
                    // race, which discards this late resolution; resolving is a no-op
                    // there and keeps this promise from dangling forever.
                    resolve(outcome);
                };
                var onAbort = function () { settle('cancelled'); };
                var pending = __assign(__assign(__assign({ rpcId: (0, rpc_ts_1.RpcId)((0, node_crypto_1.randomUUID)()), sessionId: req.agent.session.id, approvalId: id, toolName: req.toolName }, req.callId === undefined ? {} : { callId: req.callId }), req.reason === undefined ? {} : { reason: req.reason }), { resolve: settle });
                pendingApprovals.set(pending.rpcId, pending);
                (_a = req.signal) === null || _a === void 0 ? void 0 : _a.addEventListener('abort', onAbort, { once: true });
                var envelope = requestedFrame(pending);
                for (var _i = 0, muxQueues_3 = muxQueues; _i < muxQueues_3.length; _i++) {
                    var queue = muxQueues_3[_i];
                    queue.push(envelope);
                }
            });
        });
    }
    /** Read one stable session prefix without acquiring an Agent owner. */
    function readSessionState(sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var attached, inspected;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        attached = ctx.sessions.get(sessionId);
                        if (attached !== undefined) {
                            return [2 /*return*/, {
                                    id: attached.id,
                                    header: attached.header,
                                    events: __spreadArray([], attached.events, true),
                                }];
                        }
                        return [4 /*yield*/, inspectServable(sessionId)];
                    case 1:
                        inspected = _a.sent();
                        return [2 /*return*/, { id: inspected.meta.id, header: inspected.meta, events: inspected.events }];
                }
            });
        });
    }
    /** Resolve the Workspace inherited by a fork without making ordinary loose lineage grouped. */
    function forkWorkspace(source) {
        return __awaiter(this, void 0, void 0, function () {
            var workspaces, direct, lineage, _loop_1, _i, _a, ancestor, state_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        workspaces = ctx.workspaceRegistry.list();
                        direct = workspaces.find(function (workspace) { return workspace.sessionIds.includes(source.id); });
                        if (direct !== undefined || source.header.origin !== 'subagent')
                            return [2 /*return*/, direct];
                        return [4 /*yield*/, ctx.sessionQuery.traceSession(source.id)];
                    case 1:
                        lineage = _b.sent();
                        _loop_1 = function (ancestor) {
                            var workspace = workspaces.find(function (candidate) { return candidate.sessionIds.includes(ancestor.header.id); });
                            if (workspace !== undefined)
                                return { value: workspace };
                        };
                        for (_i = 0, _a = lineage.ancestors; _i < _a.length; _i++) {
                            ancestor = _a[_i];
                            state_1 = _loop_1(ancestor);
                            if (typeof state_1 === "object")
                                return [2 /*return*/, state_1.value];
                        }
                        return [2 /*return*/, undefined];
                }
            });
        });
    }
    /**
     * Resolve which session one transcript read is served from, without
     * acquiring an Agent owner. This is the read's only asynchronous step
     * besides ensuring the composition; {@link historyCutOf} takes the cut.
     * @param sessionId - the transcript being read.
     * @returns the attached session, or the inspected detached header and events.
     * @throws {@link ApiRemoteSessionNotFound} when no project-backed session has that identity.
     */
    function historySourceFor(sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var attached, inspected;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        attached = ctx.sessions.get(sessionId);
                        if (attached !== undefined)
                            return [2 /*return*/, { kind: 'attached', session: attached }];
                        return [4 /*yield*/, inspectServable(sessionId)];
                    case 1:
                        inspected = _a.sent();
                        return [2 /*return*/, { kind: 'detached', header: inspected.meta, events: inspected.events }];
                }
            });
        });
    }
    /**
     * The header and events {@link presenterScopeFor} reads to decide which
     * composition a transcript ran under.
     * @param source - the live or detached session this read is served from.
     * @returns that session's creation header and its events.
     */
    function sourceSession(source) {
        if (source.kind === 'detached')
            return { header: source.header, events: source.events };
        return { header: source.session.header, events: source.session.events };
    }
    /**
     * One transcript cut: the events and the projection baseline that describe
     * the SAME log position.
     *
     * Synchronous, and the two reads sit next to each other, because an attached
     * session keeps appending: an `await` between them would serve events cut at
     * N beside a baseline folded to N+1, which is one response describing two
     * moments. The caller does its awaiting before this call.
     * @param source - the live or detached session this read is served from.
     * @param includeProjections - whether the caller asked for the baseline (a tail page does).
     * @returns the events and, when asked, the baseline for that same position.
     */
    function historyCutOf(source, includeProjections) {
        if (source.kind === 'detached') {
            var projections_1 = includeProjections ? detachedProjectionsFor(ctx, source.events) : undefined;
            return __assign({ events: source.events }, projections_1 === undefined ? {} : { projections: projections_1 });
        }
        var events = __spreadArray([], source.session.events, true);
        var projections = includeProjections ? projectionsFor(ctx, source.session) : undefined;
        return __assign({ events: events }, projections === undefined ? {} : { projections: projections });
    }
    /**
     * The registry view scope a transcript's presenters resolve in.
     *
     * A live agent is that scope itself (its chain passes through its preset's
     * standing layer). A cold session resolves its preset from the LOG, and the
     * preset's STANDING key serves without resuming anything — ensuring the
     * mount composes plugins but starts no agent, session, or turn. No roster,
     * no recorded preset, or a preset the roster no longer supplies all fall
     * back to the global layer: the transcript still serves, with the generic
     * cards a viewless entry renders.
     *
     * Reading the header alone would render a session that switched while blank
     * through the composition it was CREATED with. Every tool only the newer
     * preset registers resolves to no presenter there, and the transcript
     * silently degrades to generic cards for exactly the calls its history is
     * made of.
     * @param sessionId - the transcript being read.
     * @param session - that session's header and log (attached or inspected).
     * @returns the scope to pass to presenter lookups, or undefined for global.
     */
    function presenterScopeFor(sessionId, session) {
        return __awaiter(this, void 0, void 0, function () {
            var live, presets, _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        live = (_b = ctx.get('agents')) === null || _b === void 0 ? void 0 : _b.get(sessionId);
                        if (live !== undefined)
                            return [2 /*return*/, live];
                        presets = ctx.get('agentPresets');
                        if (presets === undefined)
                            return [2 /*return*/, undefined];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, presets.standingKeyFor((0, dsh_agent_presets_1.resolveSessionPreset)(session))];
                    case 2: 
                    // An unrecorded preset (a log from before the roster existed) renders
                    // through the DEFAULT preset's standing layer: that is the composition
                    // an unnamed session composes today, and presenters are pure display,
                    // so the worst a mismatch produces is the generic card it had anyway.
                    return [2 /*return*/, _c.sent()];
                    case 3:
                        _a = _c.sent();
                        // Swallows only the unknown/unusable-preset rejection from the roster:
                        // a deleted or broken preset must degrade this read, never fail it.
                        return [2 /*return*/, undefined];
                    case 4: return [2 /*return*/];
                }
            });
        });
    }
    /** Resolve one requested identity to a live agent, creating or resuming it once. */
    function ensureSession(sessionId, cwd, checkPersistedIdentity, presetId, parentSessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var creation, agent;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        creation = sessionCreations.get(sessionId);
                        if (creation === undefined) {
                            creation = (function () { return __awaiter(_this, void 0, void 0, function () {
                                var attached, live, persistence, stored, _a, inspected, storedPreset, _b, _c, error_4, composition;
                                var _d;
                                return __generator(this, function (_e) {
                                    switch (_e.label) {
                                        case 0:
                                            attached = ctx.sessions.get(sessionId);
                                            live = ctx.agents.get(sessionId);
                                            if (attached !== undefined && hasSubagentOwner(attached, live)) {
                                                throw new dsh_api_remotes_1.ApiRemoteSubagentSessionOwnership(sessionId);
                                            }
                                            if (live !== undefined)
                                                return [2 /*return*/, live];
                                            persistence = checkPersistedIdentity ? ctx.get('sessionPersistence') : undefined;
                                            if (!(persistence === undefined)) return [3 /*break*/, 1];
                                            _a = undefined;
                                            return [3 /*break*/, 3];
                                        case 1: return [4 /*yield*/, persistence.list()];
                                        case 2:
                                            _a = (_e.sent()).find(function (header) { return header.id === sessionId; });
                                            _e.label = 3;
                                        case 3:
                                            stored = _a;
                                            if (!(persistence !== undefined && stored !== undefined)) return [3 /*break*/, 7];
                                            return [4 /*yield*/, persistence.inspect(sessionId)
                                                // Ownership first: explicit-id adoption of a session-backed
                                                // subagent must answer `agent-busy` regardless of the requested
                                                // cwd (the api/commands.ts contract), not a cwd conflict.
                                            ];
                                        case 4:
                                            inspected = _e.sent();
                                            // Ownership first: explicit-id adoption of a session-backed
                                            // subagent must answer `agent-busy` regardless of the requested
                                            // cwd (the api/commands.ts contract), not a cwd conflict.
                                            if (hasSubagentOwner({ header: inspected.meta }, undefined)) {
                                                throw new dsh_api_remotes_1.ApiRemoteSubagentSessionOwnership(sessionId);
                                            }
                                            if (inspected.meta.cwd !== cwd) {
                                                throw new SessionCwdConflict(sessionId, cwd, inspected.meta.cwd);
                                            }
                                            storedPreset = (0, dsh_agent_presets_1.resolveSessionPreset)({ header: inspected.meta, events: inspected.events });
                                            assertPresetUnchanged(sessionId, presetId, storedPreset);
                                            _c = (_b = ctx.agents).resume;
                                            _d = {
                                                resumeSessionId: sessionId,
                                                agentOptions: agentOptions()
                                            };
                                            return [4 /*yield*/, composeAgent(storedPreset)];
                                        case 5: return [4 /*yield*/, _c.apply(_b, [(_d.setup = (_e.sent()).setup,
                                                    _d)])];
                                        case 6: 
                                        // The stored preset wins over anything the request names: a resumed
                                        // session's history was produced under that composition, and
                                        // rebuilding it differently would replay tool calls the model can no
                                        // longer make.
                                        return [2 /*return*/, (_e.sent()).agent];
                                        case 7:
                                            _e.trys.push([7, 9, , 10]);
                                            return [4 /*yield*/, (0, promises_1.mkdir)(cwd, { recursive: true })];
                                        case 8:
                                            _e.sent();
                                            return [3 /*break*/, 10];
                                        case 9:
                                            error_4 = _e.sent();
                                            throw new Error("failed to ensure project directory \"".concat(cwd, "\": ").concat(String(error_4)), { cause: error_4 });
                                        case 10: return [4 /*yield*/, composeAgent(presetId)];
                                        case 11:
                                            composition = _e.sent();
                                            return [4 /*yield*/, ctx.agents.create({
                                                    sessionId: sessionId,
                                                    agentOptions: agentOptions(),
                                                    meta: __assign(__assign({ cwd: cwd }, parentSessionId === undefined ? {} : { parentSession: parentSessionId }), composition.agentPreset === undefined ? {} : { agentPreset: composition.agentPreset }),
                                                    setup: composition.setup,
                                                })];
                                        case 12: return [2 /*return*/, (_e.sent()).agent];
                                    }
                                });
                            }); })().catch(function (error) {
                                // Another Host entry path may have published the same identity while
                                // this operation crossed an asynchronous persistence/filesystem step.
                                var live = ctx.agents.get(sessionId);
                                if (live !== undefined) {
                                    if (hasSubagentOwner(live.session, live))
                                        throw new dsh_api_remotes_1.ApiRemoteSubagentSessionOwnership(sessionId);
                                    return live;
                                }
                                var attached = ctx.sessions.get(sessionId);
                                if (attached !== undefined && hasSubagentOwner(attached, undefined)) {
                                    throw new dsh_api_remotes_1.ApiRemoteSubagentSessionOwnership(sessionId);
                                }
                                throw error;
                            }).finally(function () {
                                sessionCreations.delete(sessionId);
                            });
                            sessionCreations.set(sessionId, creation);
                        }
                        return [4 /*yield*/, creation];
                    case 1:
                        agent = _a.sent();
                        if (hasSubagentOwner(agent.session, agent))
                            throw new dsh_api_remotes_1.ApiRemoteSubagentSessionOwnership(sessionId);
                        // Beside the cwd check for the same reason, and after the await so it
                        // covers every path that yields a live agent — freshly created, adopted
                        // live, resumed from disk, or recovered by the concurrent-creation catch.
                        assertPresetUnchanged(sessionId, presetId, (0, dsh_agent_presets_1.resolveSessionPreset)(agent.session));
                        if (agent.session.header.cwd !== cwd) {
                            throw new SessionCwdConflict(sessionId, cwd, agent.session.header.cwd);
                        }
                        return [2 /*return*/, agent];
                }
            });
        });
    }
    /** Resolve or create one path while holding the Host's workspace-create chain. */
    function ensureWorkspace(path) {
        var _this = this;
        var operation = workspaceCreationChain.then(function () { return __awaiter(_this, void 0, void 0, function () {
            var existing;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, ctx.workspaceRegistry.resolveByPath(path)];
                    case 1:
                        existing = _b.sent();
                        if (existing !== undefined)
                            return [2 /*return*/, { workspace: existing, created: false }];
                        _a = {};
                        return [4 /*yield*/, ctx.workspaceRegistry.create(path)];
                    case 2: return [2 /*return*/, (_a.workspace = _b.sent(), _a.created = true, _a)];
                }
            });
        }); });
        workspaceCreationChain = operation.then(function () { return undefined; }, function () { return undefined; });
        return operation;
    }
    /**
     * Build the session.list baseline shared by listing and search visibility.
     * Attached sessions come from memory; servable cold sessions merge from
     * persistence, and the final order is newest-first.
     */
    function listVisibleSessionSummaries(signal) {
        return __awaiter(this, void 0, void 0, function () {
            var summarizeAttached, items, attached, persistence, cold, offset, batch, settled, summaries, rejected, failure, _i, settled_1, result;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        summarizeAttached = function (session) {
                            var agent = ctx.agents.get(session.id);
                            var projections = listProjectionsFor(ctx, session.header, session);
                            return __assign(__assign({}, summarize(session, (agent === null || agent === void 0 ? void 0 : agent.status) === 'running')), projections === undefined ? {} : { projections: projections });
                        };
                        items = ctx.sessions.list().map(summarizeAttached);
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        attached = new Set(items.map(function (item) { return item.sessionId; }));
                        persistence = ctx.get('sessionPersistence');
                        if (!(persistence !== undefined)) return [3 /*break*/, 5];
                        return [4 /*yield*/, persistence.list(signal)];
                    case 1:
                        cold = (_a.sent())
                            .filter(function (meta) { return !attached.has(meta.id) && meta.cwd !== undefined; });
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        offset = 0;
                        _a.label = 2;
                    case 2:
                        if (!(offset < cold.length)) return [3 /*break*/, 5];
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        batch = cold.slice(offset, offset + COLD_SUMMARY_BATCH_SIZE);
                        return [4 /*yield*/, Promise.allSettled(batch.map(function (meta) { return __awaiter(_this, void 0, void 0, function () {
                                var projections, summary, attachedSession;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            projections = listProjectionsFor(ctx, meta, undefined);
                                            return [4 /*yield*/, summarizeCold(ctx, persistence, meta, projections === null || projections === void 0 ? void 0 : projections.values.sessionListMetadata, coldBlankProbeMaxBytes, signal)];
                                        case 1:
                                            summary = _a.sent();
                                            attachedSession = ctx.sessions.get(meta.id);
                                            if (attachedSession !== undefined)
                                                return [2 /*return*/, summarizeAttached(attachedSession)];
                                            return [2 /*return*/, __assign(__assign({}, summary), projections === undefined ? {} : { projections: projections })];
                                    }
                                });
                            }); }))];
                    case 3:
                        settled = _a.sent();
                        summaries = [];
                        rejected = false;
                        failure = void 0;
                        for (_i = 0, settled_1 = settled; _i < settled_1.length; _i++) {
                            result = settled_1[_i];
                            if (result.status === 'fulfilled') {
                                summaries.push(result.value);
                            }
                            else if (!rejected) {
                                rejected = true;
                                failure = result.reason;
                            }
                        }
                        if (rejected)
                            throw failure;
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        items.push.apply(items, summaries);
                        _a.label = 4;
                    case 4:
                        offset += COLD_SUMMARY_BATCH_SIZE;
                        return [3 /*break*/, 2];
                    case 5:
                        items.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
                        return [2 /*return*/, items];
                }
            });
        });
    }
    /**
     * Resolve the goal service THIS agent runs.
     *
     * The service is per session: an agent preset mounts it behind an `isolate`
     * realm, which no host context resolves. Reading it from the root would
     * answer "absent" for a session whose composition mounts it — so the lookup
     * is keyed by the agent, and only a deployment composing it nowhere is
     * genuinely absent.
     */
    function goalServiceFor(agent) {
        var _a;
        var presets = ctx.get('agentPresets');
        var goals = (_a = presets === null || presets === void 0 ? void 0 : presets.serviceFor(agent, 'goals')) !== null && _a !== void 0 ? _a : ctx.get('goals');
        if (goals === undefined) {
            return { error: { code: 'internal', message: 'goal service is absent: neither this session\'s agent preset nor the host composition mounts @z/dsh-goal', details: {} } };
        }
        return goals;
    }
    /** Map one goal-domain rejection to the wire error (stable GoalError codes ride in details). */
    function goalError(request, error) {
        var details = error instanceof dsh_goal_1.GoalError ? { goalCode: error.code } : {};
        return err(request, { code: 'internal', message: String(error), details: details });
    }
    /** Resolve a session's agent, apply one goal mutation, and acknowledge with the new CAS ref. */
    function mutateGoal(request, mutation) {
        return __awaiter(this, void 0, void 0, function () {
            var found, goals, ref;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, agentFor(request.payload.sessionId)];
                    case 1:
                        found = _a.sent();
                        if ('error' in found)
                            return [2 /*return*/, err(request, found.error)];
                        goals = goalServiceFor(found.agent);
                        if ('error' in goals)
                            return [2 /*return*/, err(request, goals.error)];
                        try {
                            ref = mutation(goals, found.agent);
                            return [2 /*return*/, ok(request, { ref: { id: ref.id, revision: ref.revision } })];
                        }
                        catch (error) {
                            return [2 /*return*/, goalError(request, error)];
                        }
                        return [2 /*return*/];
                }
            });
        });
    }
    /**
     * Whether an adapter currently serves this provider, and therefore whether
     * a session selecting it can start a turn. Catalog membership cannot answer
     * it: an adapter may serve a model its own catalog stopped advertising, so
     * a provider missing from the groups is not the same as one nothing serves.
     * A composition with no llm registry at all cannot judge and says yes —
     * the dispatch it would have refused fails on its own terms.
     */
    function routeServed(provider) {
        var llm = ctx.get('llm');
        return llm === undefined || llm.listProviders().some(function (entry) { return entry.id === provider; });
    }
    /**
     * Resolve the addressed agent for a turn-starting method and refuse when no
     * adapter serves its current selection: a provider nothing serves cannot start a
     * turn, and letting it try spends the whole pre-step path to fail inside
     * the adapter with a message about registration. Refusing here names the
     * model the session is pointed at while the draft is still in the composer.
     * This is `session.prompt`'s enforcement boundary: a client that disables
     * its input is an affordance, and the method stays callable regardless.
     */
    function turnAgentFor(request, sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var found, agent, selection;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, agentFor(sessionId)];
                    case 1:
                        found = _a.sent();
                        if ('error' in found)
                            return [2 /*return*/, { refused: err(request, found.error) }];
                        agent = found.agent;
                        selection = selectionFor(agent).current;
                        if (!routeServed(selection.provider)) {
                            return [2 /*return*/, {
                                    refused: err(request, {
                                        code: 'model-unavailable',
                                        message: "no adapter serves provider \"".concat(selection.provider, "\"; select a model for this session"),
                                        details: { provider: selection.provider, model: selection.model },
                                    }),
                                }];
                        }
                        return [2 /*return*/, { agent: agent }];
                }
            });
        });
    }
    /** Missing-service report shared by the settings domain (skills-domain stance). */
    function settingsAbsent() {
        return { code: 'internal', message: 'settings service is absent: this deployment does not mount a settings provider (e.g. @z/dsh-settings-file) in its composition', details: {} };
    }
    /** Open one Host-resolved target and map native failures onto the wire vocabulary. */
    function openTarget(request, path, signal, open) {
        return __awaiter(this, void 0, void 0, function () {
            var error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, open(path, signal)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, ok(request, { opened: true })];
                    case 2:
                        error_5 = _a.sent();
                        if (signal.aborted) {
                            return [2 /*return*/, err(request, {
                                    code: 'cancelled',
                                    message: 'path open was aborted',
                                    details: {},
                                })];
                        }
                        return [2 /*return*/, err(request, {
                                code: 'internal',
                                message: "path open failed: ".concat(error_5 instanceof Error ? error_5.message : String(error_5)),
                                details: {},
                            })];
                    case 3: return [2 /*return*/];
                }
            });
        });
    }
    /** Open one Host-resolved path with its default application. */
    function openPath(request, path, signal) {
        var _a;
        var open = (_a = defaults.openPath) !== null && _a !== void 0 ? _a : (function (target, openSignal) { return (0, native_path_opener_ts_1.openNativePath)(target, openSignal); });
        return openTarget(request, path, signal, open);
    }
    /** Open one Host-resolved text document in a native editor. */
    function openTextFile(request, path, signal) {
        var _a;
        var open = (_a = defaults.openTextFile) !== null && _a !== void 0 ? _a : (function (target, openSignal) { return (0, native_path_opener_ts_1.openNativeTextFile)(target, openSignal); });
        return openTarget(request, path, signal, open);
    }
    /** Whether this deployment can hand a path to a native opener at all. */
    function canOpenPaths() {
        if (defaults.canOpenPath !== undefined)
            return defaults.canOpenPath();
        // An injected opener is by definition usable; otherwise ask the platform.
        return defaults.openPath !== undefined || (0, native_path_opener_ts_1.canOpenNativePath)();
    }
    /** Missing-service report shared by the credentials domain. */
    function credentialsAbsent() {
        return { code: 'internal', message: 'credentials service is absent: this deployment does not mount a credential provider (e.g. @z/dsh-credentials-local) in its composition', details: {} };
    }
    /** Map one redacted settings descriptor to its wire view. */
    function namespaceView(descriptor) {
        var _a;
        return __assign(__assign(__assign({ ns: String(descriptor.ns), schema: descriptor.schema, value: descriptor.value }, descriptor.base === undefined ? {} : { base: descriptor.base }), descriptor.user === undefined ? {} : { user: descriptor.user }), { applies: descriptor.applies, secrets: ((_a = descriptor.secrets) !== null && _a !== void 0 ? _a : []).map(function (secret) { return ({ path: __spreadArray([], secret.path, true), set: secret.set }); }), revision: descriptor.revision });
    }
    /**
     * Run one settings write (merge or wholesale replace) and acknowledge with
     * the namespace's new redacted view. Every seam refusal — unknown or invalid
     * namespace, read-only provider, schema validation, storage — becomes one
     * `settings-rejected` carrying the seam's own message.
     */
    function settingsWrite(request, ns, mode, section, expectedRevision) {
        return __awaiter(this, void 0, void 0, function () {
            var settings, rejected, branded, error_6, descriptor;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        settings = ctx.get('settings');
                        if (settings === undefined)
                            return [2 /*return*/, err(request, settingsAbsent())];
                        rejected = function (error) {
                            // A stale writer is its own outcome, not a malformed request: the client
                            // must re-read and re-apply rather than treat the write as invalid.
                            if (error instanceof dsh_settings_1.SettingsConflictError) {
                                return err(request, {
                                    code: 'settings-conflict',
                                    message: error.message,
                                    details: { ns: ns, expected: error.expected, actual: error.actual },
                                });
                            }
                            return err(request, {
                                code: 'settings-rejected',
                                message: error instanceof Error ? error.message : String(error),
                                details: { ns: ns },
                            });
                        };
                        try {
                            branded = (0, dsh_settings_1.settingsNamespace)(ns);
                        }
                        catch (error) {
                            // A malformed name can address no registration, so it fails exactly as
                            // an unregistered one does.
                            return [2 /*return*/, rejected(error)];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 8, , 9]);
                        if (!(mode === 'update')) return [3 /*break*/, 3];
                        return [4 /*yield*/, settings.update(branded, section, expectedRevision)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 7];
                    case 3:
                        if (!(mode === 'replace')) return [3 /*break*/, 5];
                        return [4 /*yield*/, settings.replace(branded, section, expectedRevision)];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, settings.mutate(branded, section, expectedRevision)];
                    case 6:
                        _a.sent();
                        _a.label = 7;
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        error_6 = _a.sent();
                        return [2 /*return*/, rejected(error_6)];
                    case 9:
                        descriptor = settings.describe({ redactSecrets: true }).find(function (candidate) { return candidate.ns === branded; });
                        if (descriptor === undefined) {
                            // The write committed but the namespace vanished before this read: only
                            // a concurrent registrant disposal can produce it.
                            return [2 /*return*/, err(request, { code: 'internal', message: "settings namespace \"".concat(ns, "\" was disposed after the ").concat(mode), details: {} })];
                        }
                        return [2 /*return*/, ok(request, namespaceView(descriptor))];
                }
            });
        });
    }
    return {
        sessions: {
            // Attached sessions summarize from memory; persisted-but-unattached (cold)
            // sessions merge in from the persistence store so history survives restarts.
            // Logs without a cwd are not served; every session records its project
            // at create time.
            list: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, _b;
                    var _c;
                    return __generator(this, function (_d) {
                        switch (_d.label) {
                            case 0:
                                _a = ok;
                                _b = [request];
                                _c = {};
                                return [4 /*yield*/, listVisibleSessionSummaries()];
                            case 1: return [2 /*return*/, _a.apply(void 0, _b.concat([(_c.items = _d.sent(), _c)]))];
                        }
                    });
                });
            },
            search: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var cancelled, sessionQuery, visible, visibleIds, authorized, acceptedIds, seenCursors, cursor, providerCallCount, providerPageLimit, requestedCursor, requestedPageLimit, page, error_7, providerItemCount, _i, _a, hit, snippet, nextCursor, error_8;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                cancelled = function () { return err(request, {
                                    code: 'cancelled',
                                    message: 'session search was aborted',
                                    details: {},
                                }); };
                                if (isAborted(signal))
                                    return [2 /*return*/, cancelled()];
                                sessionQuery = ctx.get('sessionQuery');
                                if (sessionQuery === undefined) {
                                    return [2 /*return*/, err(request, {
                                            code: 'internal',
                                            message: 'session search is unavailable: this deployment does not mount @z/dsh-session-query',
                                            details: {},
                                        })];
                                }
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 9, , 10]);
                                return [4 /*yield*/, listVisibleSessionSummaries(signal)];
                            case 2:
                                visible = _b.sent();
                                if (isAborted(signal))
                                    return [2 /*return*/, cancelled()];
                                if (visible.length === 0)
                                    return [2 /*return*/, ok(request, { items: [], hasMore: false })];
                                visibleIds = new Set(visible.map(function (item) { return item.sessionId; }));
                                authorized = [];
                                acceptedIds = new Set();
                                seenCursors = new Set();
                                cursor = void 0;
                                providerCallCount = 0;
                                providerPageLimit = session_search_ts_1.SESSION_SEARCH_RESULT_LIMIT;
                                _b.label = 3;
                            case 3:
                                if (!(authorized.length <= session_search_ts_1.SESSION_SEARCH_RESULT_LIMIT)) return [3 /*break*/, 8];
                                if (isAborted(signal))
                                    return [2 /*return*/, cancelled()];
                                if (providerCallCount >= SESSION_SEARCH_PROVIDER_CALL_LIMIT) {
                                    throw new Error("session search provider exceeded the ".concat(SESSION_SEARCH_PROVIDER_CALL_LIMIT, "-call work budget"));
                                }
                                providerCallCount++;
                                requestedCursor = cursor;
                                requestedPageLimit = providerPageLimit;
                                page = void 0;
                                _b.label = 4;
                            case 4:
                                _b.trys.push([4, 6, , 7]);
                                return [4 /*yield*/, sessionQuery.searchSessions(__assign({ query: request.payload.query, eventFilters: [
                                            { kind: 'type', values: ['user/message', 'assistant/message'] },
                                            { kind: 'surface', values: ['current'] },
                                        ], limit: requestedPageLimit }, requestedCursor === undefined ? {} : { cursor: requestedCursor }), { signal: signal })];
                            case 5:
                                page = _b.sent();
                                return [3 /*break*/, 7];
                            case 6:
                                error_7 = _b.sent();
                                if (isAborted(signal))
                                    return [2 /*return*/, cancelled()];
                                if (requestedCursor === undefined
                                    && error_7 instanceof dsh_session_query_1.SessionQueryError
                                    && error_7.code === 'SESSION_QUERY_INVALID_LIMIT'
                                    && requestedPageLimit > 1) {
                                    providerPageLimit = Math.max(1, Math.floor(requestedPageLimit / 2));
                                    return [3 /*break*/, 3];
                                }
                                if (requestedCursor !== undefined
                                    && error_7 instanceof dsh_session_query_1.SessionQueryError
                                    && error_7.code === 'SESSION_QUERY_STALE_CURSOR') {
                                    authorized.length = 0;
                                    acceptedIds.clear();
                                    seenCursors.clear();
                                    cursor = undefined;
                                    return [3 /*break*/, 3];
                                }
                                throw error_7;
                            case 7:
                                if (isAborted(signal))
                                    return [2 /*return*/, cancelled()];
                                providerItemCount = page.items.length;
                                if (providerItemCount > requestedPageLimit) {
                                    throw new Error("session search provider returned ".concat(providerItemCount, " items; maximum is ").concat(requestedPageLimit));
                                }
                                // Host visibility is the authorization boundary. Consume the
                                // provider's globally ranked results rather than binding every
                                // visible id into one SQLite statement, then require each hit to
                                // name a visible session and a current message from that same
                                // session before emitting its snippet.
                                for (_i = 0, _a = page.items; _i < _a.length; _i++) {
                                    hit = _a[_i];
                                    if (authorized.length > session_search_ts_1.SESSION_SEARCH_RESULT_LIMIT)
                                        continue;
                                    if (!visibleIds.has(hit.header.id)
                                        || hit.bestMatch.sessionId !== hit.header.id
                                        || hit.bestMatch.surface !== 'current'
                                        || !MESSAGE_TYPES.has(hit.bestMatch.type)
                                        || acceptedIds.has(hit.header.id))
                                        continue;
                                    snippet = (0, session_search_ts_1.truncateUnicodeCodePoints)(hit.bestMatch.snippet, session_search_ts_1.SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS);
                                    acceptedIds.add(hit.header.id);
                                    authorized.push({
                                        sessionId: hit.header.id,
                                        snippet: snippet,
                                    });
                                }
                                nextCursor = page.nextCursor;
                                if (nextCursor !== undefined) {
                                    if (seenCursors.has(nextCursor)) {
                                        throw new Error('session search provider repeated a continuation cursor');
                                    }
                                    seenCursors.add(nextCursor);
                                }
                                if (authorized.length > session_search_ts_1.SESSION_SEARCH_RESULT_LIMIT || nextCursor === undefined)
                                    return [3 /*break*/, 8];
                                cursor = nextCursor;
                                return [3 /*break*/, 3];
                            case 8: return [2 /*return*/, ok(request, {
                                    items: authorized.slice(0, session_search_ts_1.SESSION_SEARCH_RESULT_LIMIT),
                                    hasMore: authorized.length > session_search_ts_1.SESSION_SEARCH_RESULT_LIMIT,
                                })];
                            case 9:
                                error_8 = _b.sent();
                                if (isAborted(signal)
                                    || (error_8 instanceof dsh_session_query_1.SessionQueryError && error_8.code === 'SESSION_QUERY_ABORTED'))
                                    return [2 /*return*/, cancelled()
                                        // XXX: Redact provider details before exposing this gateway beyond
                                        // its current single-user local deployment.
                                    ];
                                // XXX: Redact provider details before exposing this gateway beyond
                                // its current single-user local deployment.
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: "session search failed: ".concat(String(error_8)),
                                        details: {},
                                    })];
                            case 10: return [2 /*return*/];
                        }
                    });
                });
            },
            create: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var sessionId, workspace, cwd, requestedPreset, error_9, refused, error_10, created, createdPreset;
                    var _a, _b, _c;
                    return __generator(this, function (_d) {
                        switch (_d.label) {
                            case 0:
                                sessionId = (_a = request.payload.sessionId) !== null && _a !== void 0 ? _a : "session-".concat((0, node_crypto_1.randomUUID)());
                                if (request.payload.workspaceId !== undefined) {
                                    workspace = ctx.workspaceRegistry.get((0, dsh_workspace_1.WorkspaceId)(request.payload.workspaceId));
                                    if (workspace === undefined) {
                                        return [2 /*return*/, err(request, {
                                                code: 'workspace-not-found',
                                                message: "workspace \"".concat(request.payload.workspaceId, "\" not found"),
                                                details: { workspaceId: request.payload.workspaceId },
                                            })];
                                    }
                                }
                                cwd = (_c = (_b = workspace === null || workspace === void 0 ? void 0 : workspace.path) !== null && _b !== void 0 ? _b : request.payload.cwd) !== null && _c !== void 0 ? _c : defaults.cwd;
                                requestedPreset = request.payload.agentPreset;
                                _d.label = 1;
                            case 1:
                                _d.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, ensureSession(sessionId, cwd, request.payload.sessionId !== undefined, requestedPreset, request.payload.parentSessionId)];
                            case 2:
                                _d.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                error_9 = _d.sent();
                                if (error_9 instanceof AgentPresetConflict) {
                                    return [2 /*return*/, err(request, {
                                            code: 'agent-preset-conflict',
                                            message: error_9.message,
                                            details: __assign({ sessionId: error_9.sessionId, requestedPreset: error_9.requestedPreset }, error_9.existingPreset === undefined ? {} : { existingPreset: error_9.existingPreset }),
                                        })];
                                }
                                refused = presetFailure(request, error_9);
                                if (refused !== undefined)
                                    return [2 /*return*/, refused];
                                if (error_9 instanceof SessionCwdConflict) {
                                    return [2 /*return*/, err(request, {
                                            code: 'session-conflict',
                                            message: error_9.message,
                                            details: __assign({ sessionId: error_9.sessionId, requestedCwd: error_9.requestedCwd }, error_9.existingCwd === undefined ? {} : { existingCwd: error_9.existingCwd }),
                                        })];
                                }
                                if (error_9 instanceof dsh_api_remotes_1.ApiRemoteSubagentSessionOwnership) {
                                    return [2 /*return*/, err(request, subagentOwnershipError(error_9.sessionId))];
                                }
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: "failed to create session \"".concat(sessionId, "\": ").concat(String(error_9)),
                                        details: {},
                                    })];
                            case 4:
                                if (!(workspace !== undefined)) return [3 /*break*/, 8];
                                _d.label = 5;
                            case 5:
                                _d.trys.push([5, 7, , 8]);
                                return [4 /*yield*/, workspace.attachSession(sessionId)];
                            case 6:
                                _d.sent();
                                return [3 /*break*/, 8];
                            case 7:
                                error_10 = _d.sent();
                                return [2 /*return*/, err(request, {
                                        code: 'workspace-attach-failed',
                                        message: "session \"".concat(sessionId, "\" was created but could not attach to workspace \"").concat(workspace.id, "\": ").concat(String(error_10)),
                                        details: { sessionId: sessionId, workspaceId: workspace.id },
                                    })];
                            case 8:
                                created = ctx.agents.get(sessionId);
                                createdPreset = created === undefined ? undefined : (0, dsh_agent_presets_1.resolveSessionPreset)(created.session);
                                return [2 /*return*/, ok(request, __assign({ sessionId: sessionId }, createdPreset === undefined ? {} : { agentPreset: createdPreset }))];
                        }
                    });
                });
            },
            history: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, sessionId, beforeSeq, maxMessages, source, scope, cut, page, error_11;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _a = request.payload, sessionId = _a.sessionId, beforeSeq = _a.beforeSeq, maxMessages = _a.maxMessages;
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 4, , 5]);
                                return [4 /*yield*/, historySourceFor(sessionId)
                                    // Both awaits happen BEFORE the cut. Ensuring the recorded
                                    // composition's standing mount is what registers its projection
                                    // units, so a first cold read would otherwise serve a baseline
                                    // missing every preset-owned key; and an attached session keeps
                                    // appending, so awaiting between the two reads would pair events cut
                                    // at N with a baseline folded to N+1.
                                ];
                            case 2:
                                source = _b.sent();
                                return [4 /*yield*/, presenterScopeFor(sessionId, sourceSession(source))];
                            case 3:
                                scope = _b.sent();
                                cut = historyCutOf(source, beforeSeq === undefined);
                                page = historyPage(ctx, cut.events, beforeSeq, maxMessages, scope);
                                return [2 /*return*/, ok(request, __assign({ events: page.events, hasMore: page.hasMore }, cut.projections === undefined ? {} : { projections: cut.projections }))];
                            case 4:
                                error_11 = _b.sent();
                                if (error_11 instanceof dsh_api_remotes_1.ApiRemoteSessionNotFound) {
                                    return [2 /*return*/, err(request, { code: 'session-not-found', message: error_11.message, details: { sessionId: sessionId } })];
                                }
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: "history unavailable for session \"".concat(sessionId, "\": ").concat(String(error_11)),
                                        details: {},
                                    })];
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            },
            models: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var sessionId, found, current, _a, groups, failures, routable;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                sessionId = request.payload.sessionId;
                                return [4 /*yield*/, agentFor(sessionId)];
                            case 1:
                                found = _b.sent();
                                if ('error' in found)
                                    return [2 /*return*/, err(request, found.error)];
                                current = selectionFor(found.agent).current;
                                return [4 /*yield*/, buildModelCatalog(ctx)];
                            case 2:
                                _a = _b.sent(), groups = _a.groups, failures = _a.failures;
                                routable = routeServed(current.provider);
                                return [2 /*return*/, ok(request, { current: __assign({}, current), routable: routable, groups: groups, failures: failures })];
                        }
                    });
                });
            },
            selectModel: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, sessionId, provider, model, reasoningEffort, found;
                    var _this = this;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _a = request.payload, sessionId = _a.sessionId, provider = _a.provider, model = _a.model, reasoningEffort = _a.reasoningEffort;
                                return [4 /*yield*/, agentFor(sessionId)];
                            case 1:
                                found = _b.sent();
                                if ('error' in found)
                                    return [2 /*return*/, err(request, found.error)];
                                return [2 /*return*/, serializeImageAdmission(found.agent, function () { return __awaiter(_this, void 0, void 0, function () {
                                        var resolved, selected, error_12, error_13;
                                        var _a;
                                        return __generator(this, function (_b) {
                                            switch (_b.label) {
                                                case 0:
                                                    _b.trys.push([0, 6, , 7]);
                                                    return [4 /*yield*/, ctx.llm.resolveCallConfig(__assign({ provider: provider, model: model }, reasoningEffort === undefined
                                                            ? {}
                                                            : { reasoningEffort: (0, dsh_llm_1.ReasoningEffortId)(reasoningEffort) }))];
                                                case 1:
                                                    resolved = _b.sent();
                                                    selected = __assign({ provider: resolved.provider, model: resolved.model }, resolved.reasoningEffort === undefined
                                                        ? {}
                                                        : { reasoningEffort: resolved.reasoningEffort });
                                                    selectionFor(found.agent).current = selected;
                                                    _b.label = 2;
                                                case 2:
                                                    _b.trys.push([2, 4, , 5]);
                                                    return [4 /*yield*/, ((_a = defaults.saveDefaultModelSelection) === null || _a === void 0 ? void 0 : _a.call(defaults, selected))];
                                                case 3:
                                                    _b.sent();
                                                    return [3 /*break*/, 5];
                                                case 4:
                                                    error_12 = _b.sent();
                                                    ctx.logger.warn("api-proxy: the model switch applies to this session but was not saved as the default: ".concat(String(error_12)));
                                                    return [3 /*break*/, 5];
                                                case 5: return [2 /*return*/, ok(request, { selected: __assign({}, selected) })];
                                                case 6:
                                                    error_13 = _b.sent();
                                                    return [2 /*return*/, err(request, {
                                                            code: 'model-unavailable',
                                                            message: error_13 instanceof Error ? error_13.message : String(error_13),
                                                            details: { provider: provider, model: model },
                                                        })];
                                                case 7: return [2 /*return*/];
                                            }
                                        });
                                    }); })];
                        }
                    });
                });
            },
            rename: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, sessionId, title, found, titles, accepted;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _a = request.payload, sessionId = _a.sessionId, title = _a.title;
                                return [4 /*yield*/, agentFor(sessionId)];
                            case 1:
                                found = _b.sent();
                                if ('error' in found)
                                    return [2 /*return*/, err(request, found.error)];
                                titles = ctx.get('sessionTitle');
                                if (titles === undefined) {
                                    return [2 /*return*/, err(request, { code: 'internal', message: 'renaming is unavailable: this deployment mounts no session-title service', details: {} })];
                                }
                                try {
                                    accepted = titles.rename(found.agent.session, title);
                                    return [2 /*return*/, ok(request, { title: accepted.title, seq: accepted.eventSeq })];
                                }
                                catch (error) {
                                    // Only the input's fault maps to title-invalid (the message is
                                    // product-user-visible in the rename dialog); liveness and disposal
                                    // races are deployment trouble, not a bad title.
                                    if (error instanceof dsh_session_title_1.SessionTitleInvalidError) {
                                        return [2 /*return*/, err(request, {
                                                code: 'title-invalid',
                                                message: error.message,
                                                details: { sessionId: sessionId },
                                            })];
                                    }
                                    return [2 /*return*/, err(request, {
                                            code: 'internal',
                                            message: "failed to rename session \"".concat(sessionId, "\": ").concat(String(error)),
                                            details: {},
                                        })];
                                }
                                return [2 /*return*/];
                        }
                    });
                });
            },
            fork: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, sessionId, atSeq, source, error_14, events, lastSeq, anchoredBoundary, boundary, cut, workspace, error_15, childId, forkComposition, error_16, error_17;
                    var _b, _c, _d;
                    return __generator(this, function (_e) {
                        switch (_e.label) {
                            case 0:
                                _a = request.payload, sessionId = _a.sessionId, atSeq = _a.atSeq;
                                _e.label = 1;
                            case 1:
                                _e.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, readSessionState(sessionId)];
                            case 2:
                                source = _e.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                error_14 = _e.sent();
                                if (error_14 instanceof dsh_api_remotes_1.ApiRemoteSessionNotFound) {
                                    return [2 /*return*/, err(request, { code: 'session-not-found', message: error_14.message, details: { sessionId: sessionId } })];
                                }
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: "fork source unavailable for session \"".concat(sessionId, "\": ").concat(String(error_14)),
                                        details: {},
                                    })];
                            case 4:
                                events = source.events;
                                lastSeq = (_c = (_b = events.at(-1)) === null || _b === void 0 ? void 0 : _b.seq) !== null && _c !== void 0 ? _c : -1;
                                anchoredBoundary = atSeq === undefined
                                    ? undefined
                                    : events.find(function (e) { return e.type === 'turn/end' && e.seq >= atSeq; });
                                boundary = anchoredBoundary !== null && anchoredBoundary !== void 0 ? anchoredBoundary : (atSeq === undefined || atSeq > lastSeq
                                    ? events.findLast(function (e) { return e.type === 'turn/end'; })
                                    : undefined);
                                if (boundary === undefined) {
                                    return [2 /*return*/, err(request, {
                                            code: 'fork-unavailable',
                                            message: atSeq !== undefined && atSeq <= lastSeq
                                                ? "session \"".concat(sessionId, "\" has not completed the turn containing event ").concat(String(atSeq))
                                                : "session \"".concat(sessionId, "\" has no completed turn to fork from"),
                                            details: { sessionId: sessionId },
                                        })];
                                }
                                cut = boundary.seq + 1;
                                while (cut < events.length && ((_d = events[cut]) === null || _d === void 0 ? void 0 : _d.type) !== 'turn/start')
                                    cut++;
                                _e.label = 5;
                            case 5:
                                _e.trys.push([5, 7, , 8]);
                                return [4 /*yield*/, forkWorkspace(source)];
                            case 6:
                                workspace = _e.sent();
                                return [3 /*break*/, 8];
                            case 7:
                                error_15 = _e.sent();
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: "failed to resolve fork workspace for session \"".concat(sessionId, "\": ").concat(String(error_15)),
                                        details: {},
                                    })];
                            case 8:
                                childId = "session-".concat((0, node_crypto_1.randomUUID)());
                                return [4 /*yield*/, composeAgent((0, dsh_agent_presets_1.resolveSessionPreset)(source))];
                            case 9:
                                forkComposition = _e.sent();
                                _e.label = 10;
                            case 10:
                                _e.trys.push([10, 12, , 13]);
                                return [4 /*yield*/, ctx.agents.create({
                                        sessionId: childId,
                                        seed: events.slice(0, cut),
                                        meta: __assign(__assign(__assign({}, source.header.cwd === undefined ? {} : { cwd: source.header.cwd }), { parentSession: source.id, seedLength: cut }), forkComposition.agentPreset === undefined
                                            ? {}
                                            : { agentPreset: forkComposition.agentPreset }),
                                        agentOptions: agentOptions(),
                                        setup: forkComposition.setup,
                                    })];
                            case 11:
                                _e.sent();
                                return [3 /*break*/, 13];
                            case 12:
                                error_16 = _e.sent();
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: "failed to fork session \"".concat(sessionId, "\": ").concat(String(error_16)),
                                        details: {},
                                    })];
                            case 13:
                                if (!(workspace !== undefined)) return [3 /*break*/, 17];
                                _e.label = 14;
                            case 14:
                                _e.trys.push([14, 16, , 17]);
                                return [4 /*yield*/, workspace.attachSession(childId)];
                            case 15:
                                _e.sent();
                                return [3 /*break*/, 17];
                            case 16:
                                error_17 = _e.sent();
                                return [2 /*return*/, err(request, {
                                        code: 'workspace-attach-failed',
                                        message: "session \"".concat(childId, "\" was forked but could not attach to workspace \"").concat(workspace.id, "\": ").concat(String(error_17)),
                                        details: { sessionId: childId, workspaceId: workspace.id },
                                    })];
                            case 17: return [2 /*return*/, ok(request, { sessionId: childId })];
                        }
                    });
                });
            },
            prompt: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, sessionId, mode, content, clientTimeZone, canonicalTimeZone, resolved, agent, commandText, commands, execution, source, hasImage, admit;
                    var _this = this;
                    var _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                _a = request.payload, sessionId = _a.sessionId, mode = _a.mode, content = _a.content, clientTimeZone = _a.clientTimeZone;
                                canonicalTimeZone = clientTimeZone === undefined
                                    ? undefined
                                    : canonicalClientTimeZone(clientTimeZone);
                                if (clientTimeZone !== undefined && canonicalTimeZone === undefined) {
                                    return [2 /*return*/, err(request, {
                                            code: 'invalid-time-zone',
                                            message: 'clientTimeZone must be UTC or a valid IANA Area/Location name',
                                            details: { value: clientTimeZone },
                                        })];
                                }
                                return [4 /*yield*/, turnAgentFor(request, sessionId)];
                            case 1:
                                resolved = _c.sent();
                                if ('refused' in resolved)
                                    return [2 /*return*/, resolved.refused];
                                agent = resolved.agent;
                                commandText = content.length === 1 && ((_b = content[0]) === null || _b === void 0 ? void 0 : _b.type) === 'text'
                                    ? content[0].text
                                    : undefined;
                                if (!((commandText === null || commandText === void 0 ? void 0 : commandText.startsWith('/')) && !/[\r\n]/.test(commandText))) return [3 /*break*/, 3];
                                commands = ctx.get('commands');
                                if (!(commands !== undefined)) return [3 /*break*/, 3];
                                return [4 /*yield*/, commands.execute(agent, commandText, [], new AbortController().signal)];
                            case 2:
                                execution = _c.sent();
                                if (execution !== undefined) {
                                    if (execution.result.kind === 'error') {
                                        return [2 /*return*/, err(request, {
                                                code: 'command-error',
                                                message: execution.result.text,
                                                details: { commandId: execution.commandId },
                                            })];
                                    }
                                    return [2 /*return*/, ok(request, {
                                            accepted: true,
                                            command: __assign({ kind: 'success' }, execution.result.text === undefined ? {} : { text: execution.result.text }),
                                        })];
                                }
                                _c.label = 3;
                            case 3:
                                if (request.payload.commandOnly === true) {
                                    return [2 /*return*/, err(request, { code: 'unknown-command', message: 'No native command handles this input for the current agent preset.', details: {} })];
                                }
                                source = __assign({ kind: 'user', rpcId: request.rpcId }, (canonicalTimeZone === undefined ? {} : { clientTimeZone: canonicalTimeZone }));
                                hasImage = content.some(function (part) { return part.type === 'image'; });
                                admit = function () { return __awaiter(_this, void 0, void 0, function () {
                                    var current, modelInfo, durable, message, error_18;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                _a.trys.push([0, 4, , 5]);
                                                if (!hasImage) return [3 /*break*/, 2];
                                                current = selectionFor(agent).current;
                                                return [4 /*yield*/, ctx.llm.resolveModelInfo(current.provider, current.model)];
                                            case 1:
                                                modelInfo = _a.sent();
                                                if (modelInfo.inputModalities !== undefined && !modelInfo.inputModalities.includes('image')) {
                                                    return [2 /*return*/, err(request, {
                                                            code: 'attachment-error',
                                                            message: "Model \"".concat(current.model, "\" does not support image input."),
                                                            details: { reason: 'MODEL_DOES_NOT_SUPPORT_IMAGES' },
                                                        })];
                                                }
                                                _a.label = 2;
                                            case 2: return [4 /*yield*/, durablePromptContent(ctx, content)];
                                            case 3:
                                                durable = _a.sent();
                                                message = (0, dsh_llm_1.createUserMessage)({ content: durable, source: source });
                                                if (mode === 'steer')
                                                    agent.steer(message);
                                                else
                                                    agent.followup(message);
                                                return [3 /*break*/, 5];
                                            case 4:
                                                error_18 = _a.sent();
                                                if (error_18 instanceof dsh_attachment_1.AttachmentError) {
                                                    return [2 /*return*/, err(request, {
                                                            code: 'attachment-error',
                                                            message: error_18.message,
                                                            details: { reason: error_18.code },
                                                        })];
                                                }
                                                return [2 /*return*/, err(request, {
                                                        code: 'agent-busy',
                                                        message: 'prompt rejected',
                                                        details: { reason: String(error_18) },
                                                    })];
                                            case 5: return [2 /*return*/, ok(request, { accepted: true })];
                                        }
                                    });
                                }); };
                                return [2 /*return*/, hasImage ? serializeImageAdmission(agent, admit) : admit()];
                        }
                    });
                });
            },
            attachment: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, sessionId, attachmentId, state, error_19, ref, stored, error_20;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _a = request.payload, sessionId = _a.sessionId, attachmentId = _a.attachmentId;
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, readSessionState(sessionId)];
                            case 2:
                                state = _b.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                error_19 = _b.sent();
                                if (error_19 instanceof dsh_api_remotes_1.ApiRemoteSessionNotFound) {
                                    return [2 /*return*/, err(request, {
                                            code: 'session-not-found',
                                            message: error_19.message,
                                            details: { sessionId: sessionId },
                                        })];
                                }
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: "attachment authorization unavailable for session \"".concat(sessionId, "\": ").concat(String(error_19)),
                                        details: {},
                                    })];
                            case 4:
                                ref = referencedImage(state.events, String(attachmentId));
                                if (ref === undefined) {
                                    return [2 /*return*/, err(request, {
                                            code: 'attachment-error',
                                            message: 'Image is not referenced by this session.',
                                            details: { reason: 'ATTACHMENT_NOT_REFERENCED' },
                                        })];
                                }
                                _b.label = 5;
                            case 5:
                                _b.trys.push([5, 7, , 8]);
                                return [4 /*yield*/, ctx.attachments.readImage(ref)];
                            case 6:
                                stored = _b.sent();
                                return [2 /*return*/, ok(request, {
                                        attachment: stored.ref,
                                        data: Buffer.from(stored.data).toString('base64'),
                                    })];
                            case 7:
                                error_20 = _b.sent();
                                if (error_20 instanceof dsh_attachment_1.AttachmentError) {
                                    return [2 /*return*/, err(request, {
                                            code: 'attachment-error',
                                            message: error_20.message,
                                            details: { reason: error_20.code },
                                        })];
                                }
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: 'Unable to read image attachment.',
                                        details: {},
                                    })];
                            case 8: return [2 /*return*/];
                        }
                    });
                });
            },
            updateQueue: function (request) {
                var _a = request.payload, sessionId = _a.sessionId, itemId = _a.itemId, action = _a.action;
                if (action.kind === 'edit' && action.content.some(function (block) { return block.type !== 'text'; })) {
                    return Promise.resolve(err(request, {
                        code: 'attachment-error',
                        message: 'queue edits accept text content only',
                        details: { reason: 'QUEUE_EDIT_NON_TEXT' },
                    }));
                }
                var agent = ctx.agents.get(sessionId);
                if (agent !== undefined && hasSubagentOwner(agent.session, agent)) {
                    return Promise.resolve(err(request, subagentOwnershipError(sessionId)));
                }
                if (agent === undefined) {
                    return Promise.resolve(err(request, {
                        code: 'queue-item-not-found',
                        message: 'queued item is no longer pending',
                        details: { itemId: itemId },
                    }));
                }
                var target = agent.inbox.nextTurn.some(function (message) { return message.id === itemId; })
                    ? 'next-turn'
                    : agent.inbox.nextStep.some(function (message) { return message.id === itemId; }) ? 'next-step' : undefined;
                var message = target === undefined
                    ? undefined
                    : (target === 'next-turn' ? agent.inbox.nextTurn : agent.inbox.nextStep)
                        .find(function (candidate) { return candidate.id === itemId; });
                if (target === undefined || message === undefined) {
                    return Promise.resolve(err(request, {
                        code: 'queue-item-not-found',
                        message: 'queued item is no longer pending',
                        details: { itemId: itemId },
                    }));
                }
                if (action.kind === 'steer' && (target !== 'next-turn' || agent.status !== 'running')) {
                    return Promise.resolve(err(request, {
                        code: 'steer-unavailable',
                        message: 'current turn no longer accepts steering',
                        details: { itemId: itemId },
                    }));
                }
                if (action.kind === 'edit') {
                    agent.inbox.replace(itemId, (0, dsh_llm_1.freezeMessage)(__assign(__assign({}, message), { content: action.content })));
                }
                else {
                    agent.inbox.remove(itemId);
                    if (action.kind === 'steer')
                        agent.steer(message);
                }
                return Promise.resolve(ok(request, { accepted: true }));
            },
            cancel: function (request) {
                var _a = request.payload, sessionId = _a.sessionId, _b = _a.clearPendingUserInput, clearPendingUserInput = _b === void 0 ? false : _b;
                var agent = ctx.agents.get(sessionId);
                if (agent === undefined) {
                    return Promise.resolve(err(request, {
                        code: 'session-not-found',
                        message: "session \"".concat(sessionId, "\" not found (not attached)"),
                        details: { sessionId: sessionId },
                    }));
                }
                if (hasSubagentOwner(agent.session, agent)) {
                    return Promise.resolve(err(request, subagentOwnershipError(sessionId)));
                }
                if (clearPendingUserInput) {
                    // Stop + inbox cleanup is one Host-side synchronous transition. A
                    // client-side queue snapshot can lag this RPC on the separate mux
                    // transport, so clearing by a stale snapshot is not race-safe.
                    // Match the browser's queue semantics: every next-turn item is a
                    // queued follow-up, while only user-origin next-step items are
                    // steering. Preserve plugin/context messages in next-step.
                    for (var _i = 0, _c = __spreadArray([], agent.inbox.nextTurn, true); _i < _c.length; _i++) {
                        var message = _c[_i];
                        agent.inbox.remove(message.id);
                    }
                    for (var _d = 0, _e = __spreadArray([], agent.inbox.nextStep, true); _d < _e.length; _d++) {
                        var message = _e[_d];
                        if (message.source.kind === 'user')
                            agent.inbox.remove(message.id);
                    }
                }
                agent.cancel({ kind: 'user' }, { keepInbox: true });
                return Promise.resolve(ok(request, { accepted: true }));
            },
        },
        subagents: {
            list: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var entries, error_21;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 2, , 3]);
                                return [4 /*yield*/, ctx.subagents.listChildren(request.payload.parentSessionId, signal)];
                            case 1:
                                entries = _a.sent();
                                return [2 /*return*/, ok(request, {
                                        entries: entries.map(function (entry) {
                                            var _a;
                                            return entry.kind === 'child'
                                                ? __assign(__assign({}, entry), { activity: ((_a = ctx.agents.get(entry.id)) === null || _a === void 0 ? void 0 : _a.status) === 'running' ? 'running' : 'inactive' }) : entry;
                                        }),
                                        parentAvailable: ctx.agents.get(request.payload.parentSessionId) !== undefined,
                                    })];
                            case 2:
                                error_21 = _a.sent();
                                if ((signal === null || signal === void 0 ? void 0 : signal.aborted) || (error_21 instanceof dsh_subagent_1.SubagentError && error_21.code === 'CANCELLED')) {
                                    return [2 /*return*/, err(request, {
                                            code: 'cancelled',
                                            message: 'subagent catalog read was cancelled',
                                            details: {},
                                        })];
                                }
                                if (error_21 instanceof dsh_subagent_1.SubagentError && error_21.code === 'SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE') {
                                    return [2 /*return*/, err(request, projectionsUnavailableError())];
                                }
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: 'subagent catalog read failed',
                                        details: {},
                                    })];
                            case 3: return [2 /*return*/];
                        }
                    });
                });
            },
            history: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, parentSessionId, childSessionId, mode, beforeSeq, maxMessages, verified, header, events, projections, attached, inspected_1, error_22, page;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _a = request.payload, parentSessionId = _a.parentSessionId, childSessionId = _a.childSessionId, mode = _a.mode, beforeSeq = _a.beforeSeq, maxMessages = _a.maxMessages;
                                return [4 /*yield*/, catalogChild(ctx, {
                                        parentSessionId: parentSessionId,
                                        childSessionId: childSessionId,
                                        mode: mode,
                                    }, signal)];
                            case 1:
                                verified = _b.sent();
                                if (verified.error !== undefined)
                                    return [2 /*return*/, err(request, verified.error)
                                        // The generic-history data plane: an attached child serves its
                                        // in-memory snapshot and the registry's live watermark projections; a
                                        // cold child is one persistence inspection plus a detached fold.
                                    ];
                                attached = ctx.sessions.get(childSessionId);
                                if (!(attached !== undefined)) return [3 /*break*/, 2];
                                header = attached.header;
                                events = __spreadArray([], attached.events, true);
                                projections = beforeSeq === undefined
                                    ? subagentHistoryProjections(ctx, childSessionId, function () { return projectionsFor(ctx, attached); })
                                    : undefined;
                                return [3 /*break*/, 5];
                            case 2:
                                _b.trys.push([2, 4, , 5]);
                                return [4 /*yield*/, inspectServable(childSessionId)];
                            case 3:
                                inspected_1 = _b.sent();
                                header = inspected_1.meta;
                                events = inspected_1.events;
                                projections = beforeSeq === undefined
                                    ? subagentHistoryProjections(ctx, childSessionId, function () { return detachedProjectionsFor(ctx, inspected_1.events); })
                                    : undefined;
                                return [3 /*break*/, 5];
                            case 4:
                                error_22 = _b.sent();
                                if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                                    return [2 /*return*/, err(request, {
                                            code: 'cancelled',
                                            message: 'subagent history read was cancelled',
                                            details: {},
                                        })];
                                }
                                if (error_22 instanceof dsh_api_remotes_1.ApiRemoteSessionNotFound) {
                                    return [2 /*return*/, err(request, {
                                            code: 'subagent-not-found',
                                            message: 'subagent disappeared during history read',
                                            details: { parentSessionId: parentSessionId, childSessionId: childSessionId },
                                        })];
                                }
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: 'subagent history read failed',
                                        details: {},
                                    })];
                            case 5:
                                if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                                    return [2 /*return*/, err(request, {
                                            code: 'cancelled',
                                            message: 'subagent history read was cancelled',
                                            details: {},
                                        })];
                                }
                                if (header.parentSession !== parentSessionId) {
                                    return [2 /*return*/, err(request, {
                                            code: 'subagent-unauthorized',
                                            message: 'subagent parent changed during history read',
                                            details: { childSessionId: childSessionId },
                                        })];
                                }
                                page = historyPage(ctx, events, beforeSeq, maxMessages);
                                return [2 /*return*/, ok(request, __assign(__assign({}, page), projections === undefined ? {} : { projections: projections }))];
                        }
                    });
                });
            },
            prompt: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, parentSessionId, childSessionId, content, clientTimeZone, canonicalTimeZone, parent, verified, messageId, error_23;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _a = request.payload, parentSessionId = _a.parentSessionId, childSessionId = _a.childSessionId, content = _a.content, clientTimeZone = _a.clientTimeZone;
                                canonicalTimeZone = clientTimeZone === undefined
                                    ? undefined
                                    : canonicalClientTimeZone(clientTimeZone);
                                if (clientTimeZone !== undefined && canonicalTimeZone === undefined) {
                                    return [2 /*return*/, err(request, {
                                            code: 'invalid-time-zone',
                                            message: 'clientTimeZone must be UTC or a valid IANA Area/Location name',
                                            details: { value: clientTimeZone },
                                        })];
                                }
                                parent = ctx.agents.get(parentSessionId);
                                if (parent === undefined) {
                                    return [2 /*return*/, err(request, {
                                            code: 'subagent-parent-unavailable',
                                            message: "parent session \"".concat(parentSessionId, "\" is not live"),
                                            details: { parentSessionId: parentSessionId },
                                        })];
                                }
                                return [4 /*yield*/, catalogChild(ctx, {
                                        parentSessionId: parentSessionId,
                                        childSessionId: childSessionId,
                                        mode: 'continuable',
                                    }, signal)];
                            case 1:
                                verified = _b.sent();
                                if (verified.error !== undefined)
                                    return [2 /*return*/, err(request, verified.error)];
                                _b.label = 2;
                            case 2:
                                _b.trys.push([2, 4, , 5]);
                                return [4 /*yield*/, ctx.subagents.followup(parent, childSessionId, content, {
                                        source: __assign({ kind: 'user', rpcId: request.rpcId }, (canonicalTimeZone === undefined ? {} : { clientTimeZone: canonicalTimeZone })),
                                        signal: signal,
                                    })];
                            case 3:
                                messageId = _b.sent();
                                return [2 /*return*/, ok(request, { messageId: messageId })];
                            case 4:
                                error_23 = _b.sent();
                                return [2 /*return*/, subagentPromptError(request, error_23, signal)];
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            },
            // Deliberately no catalog, history, persistence, or parent Agent lookup:
            // the core primitive alone authorizes the durable address against the
            // live Activation, which is what keeps a live child interruptible while
            // its parent Agent is offline. Absent targets are accepted no-ops there.
            interrupt: function (request) {
                var _a = request.payload, parentSessionId = _a.parentSessionId, childSessionId = _a.childSessionId;
                try {
                    ctx.subagents.interrupt(childSessionId, { kind: 'user', parentSessionId: parentSessionId });
                }
                catch (error) {
                    if (error instanceof dsh_subagent_1.SubagentError && error.code === 'UNAUTHORIZED') {
                        return Promise.resolve(err(request, {
                            code: 'subagent-unauthorized',
                            message: 'subagent does not belong to this parent',
                            details: { childSessionId: childSessionId },
                        }));
                    }
                    return Promise.resolve(err(request, {
                        code: 'internal',
                        message: 'subagent interrupt failed',
                        details: {},
                    }));
                }
                return Promise.resolve(ok(request, { accepted: true }));
            },
        },
        workspace: {
            list: function (request) {
                return Promise.resolve(ok(request, {
                    items: ctx.workspaceRegistry.list().map(workspaceView),
                    archivedSessionIds: __spreadArray([], ctx.workspaceRegistry.archivedSessionIds, true),
                }));
            },
            create: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var path, _a, workspace, created, error_24;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                path = request.payload.path;
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, ensureWorkspace(path)];
                            case 2:
                                _a = _b.sent(), workspace = _a.workspace, created = _a.created;
                                return [2 /*return*/, ok(request, { workspace: workspaceView(workspace), created: created })];
                            case 3:
                                error_24 = _b.sent();
                                // The registry rejects a path that does not resolve to an existing
                                // directory (realpath ENOENT / not-a-directory) — the business
                                // error of the typed-path flow, surfaced as a validation failure.
                                return [2 /*return*/, err(request, {
                                        code: 'workspace-invalid-path',
                                        message: "cannot create a workspace at \"".concat(path, "\": ").concat(error_24 instanceof Error ? error_24.message : String(error_24)),
                                        details: { path: path },
                                    })];
                            case 4: return [2 /*return*/];
                        }
                    });
                });
            },
            rename: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var payload, workspace, title, operation, error_25;
                    var _this = this;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                payload = request.payload;
                                workspace = ctx.workspaceRegistry.get((0, dsh_workspace_1.WorkspaceId)(payload.workspaceId));
                                if (workspace === undefined)
                                    return [2 /*return*/, workspaceNotFound(request, payload.workspaceId)];
                                title = payload.title.trim();
                                operation = workspaceCreationChain.then(function () { return __awaiter(_this, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                if (title === workspace.title)
                                                    return [2 /*return*/];
                                                if (ctx.workspaceRegistry.list().some(function (other) { return other.id !== workspace.id && other.title === title; })) {
                                                    throw new WorkspaceNameConflictError(title);
                                                }
                                                return [4 /*yield*/, workspace.setTitle(title)];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); });
                                workspaceCreationChain = operation.then(function () { return undefined; }, function () { return undefined; });
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, operation];
                            case 2:
                                _a.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                error_25 = _a.sent();
                                if (error_25 instanceof WorkspaceNameConflictError) {
                                    return [2 /*return*/, err(request, {
                                            code: 'workspace-name-conflict',
                                            message: error_25.message,
                                            details: { name: error_25.workspaceName },
                                        })];
                                }
                                throw error_25;
                            case 4: return [2 /*return*/, ok(request, { workspace: workspaceView(workspace) })];
                        }
                    });
                });
            },
            delete: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var workspaceId, operation;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                workspaceId = request.payload.workspaceId;
                                operation = workspaceCreationChain.then(function () {
                                    return ctx.workspaceRegistry.delete((0, dsh_workspace_1.WorkspaceId)(workspaceId));
                                });
                                workspaceCreationChain = operation.then(function () { return undefined; }, function () { return undefined; });
                                return [4 /*yield*/, operation];
                            case 1:
                                if (!(_a.sent()))
                                    return [2 /*return*/, workspaceNotFound(request, workspaceId)];
                                return [2 /*return*/, ok(request, { deleted: true })];
                        }
                    });
                });
            },
            insertBefore: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, workspaceId, beforeWorkspaceId, workspaceIds, error_26;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _a = request.payload, workspaceId = _a.workspaceId, beforeWorkspaceId = _a.beforeWorkspaceId;
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, ctx.workspaceRegistry.insertBefore((0, dsh_workspace_1.WorkspaceId)(workspaceId), beforeWorkspaceId === undefined ? undefined : (0, dsh_workspace_1.WorkspaceId)(beforeWorkspaceId))];
                            case 2:
                                workspaceIds = _b.sent();
                                return [2 /*return*/, ok(request, { workspaceIds: __spreadArray([], workspaceIds, true) })];
                            case 3:
                                error_26 = _b.sent();
                                if (!(error_26 instanceof dsh_workspace_1.WorkspaceOrderInvalidError))
                                    throw error_26;
                                return [2 /*return*/, workspaceNotFound(request, error_26.workspaceId)];
                            case 4: return [2 /*return*/];
                        }
                    });
                });
            },
            insertSessionBefore: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var payload, workspace, error_27;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                payload = request.payload;
                                workspace = ctx.workspaceRegistry.get((0, dsh_workspace_1.WorkspaceId)(payload.workspaceId));
                                if (workspace === undefined)
                                    return [2 /*return*/, workspaceNotFound(request, payload.workspaceId)];
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, workspace.insertSessionBefore(payload.sessionId, payload.beforeSessionId)];
                            case 2:
                                _a.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                error_27 = _a.sent();
                                // Only the entity's unaccounted-id rejection is the business code;
                                // storage/durability failures propagate as internal errors.
                                if (!(error_27 instanceof dsh_workspace_1.WorkspaceMoveInvalidError))
                                    throw error_27;
                                return [2 /*return*/, err(request, {
                                        code: 'workspace-move-invalid',
                                        message: error_27.message,
                                        details: __assign({ workspaceId: payload.workspaceId, sessionId: payload.sessionId }, payload.beforeSessionId === undefined ? {} : { beforeSessionId: payload.beforeSessionId }),
                                    })];
                            case 4: return [2 /*return*/, ok(request, { workspace: workspaceView(workspace) })];
                        }
                    });
                });
            },
            archiveSession: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var sessionId, error_28;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                sessionId = request.payload.sessionId;
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, ctx.workspaceRegistry.archiveSession(sessionId)];
                            case 2:
                                _a.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                error_28 = _a.sent();
                                // Only the registry's unknown-session rejection is the business
                                // code; storage/durability failures propagate as internal errors.
                                if (!(error_28 instanceof dsh_workspace_1.WorkspaceUnknownSessionError))
                                    throw error_28;
                                return [2 /*return*/, err(request, {
                                        code: 'session-not-found',
                                        message: error_28.message,
                                        details: { sessionId: sessionId },
                                    })];
                            case 4: return [2 /*return*/, ok(request, { archivedSessionIds: __spreadArray([], ctx.workspaceRegistry.archivedSessionIds, true) })];
                        }
                    });
                });
            },
        },
        host: {
            describe: function (request) {
                // TODO: version should read host-cli's package.json; placeholder for now.
                var selection = defaults.defaultModelSelection();
                return Promise.resolve(ok(request, {
                    version: '0.0.1',
                    // Same source as session.create's fallback: the UI's default project
                    // must match where an unspecified-cwd session actually lands.
                    cwd: defaults.cwd,
                    // Read live for the same reason: this is what the NEXT session will
                    // start from, so a saved default has to be what it reports.
                    provider: selection.provider,
                    model: selection.model,
                    attachedSessions: ctx.agents.list().length,
                    home: (0, node_os_1.homedir)(),
                    canOpenPath: canOpenPaths(),
                }));
            },
            pickDirectory: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var capability, path, error_29;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                capability = ctx.directoryPicker.capability();
                                if (capability.kind !== 'native') {
                                    return [2 /*return*/, err(request, {
                                            code: 'directory-picker-unavailable',
                                            message: "host.pickDirectory needs the native capability; the composed picker serves \"".concat(capability.kind, "\""),
                                            details: { capability: capability.kind },
                                        })];
                                }
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, capability.pick(signal)];
                            case 2:
                                path = _a.sent();
                                return [2 /*return*/, ok(request, { path: path })];
                            case 3:
                                error_29 = _a.sent();
                                if (signal.aborted) {
                                    return [2 /*return*/, err(request, {
                                            code: 'cancelled',
                                            message: 'directory picker was aborted',
                                            details: {},
                                        })];
                                }
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: "directory picker failed: ".concat(error_29 instanceof Error ? error_29.message : String(error_29)),
                                        details: {},
                                    })];
                            case 4: return [2 /*return*/];
                        }
                    });
                });
            },
            listDirectory: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var capability, _a, _b, error_30;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                capability = ctx.directoryPicker.capability();
                                if (capability.kind !== 'browse') {
                                    return [2 /*return*/, err(request, {
                                            code: 'directory-picker-unavailable',
                                            message: "host.listDirectory needs the browse capability; the composed picker serves \"".concat(capability.kind, "\""),
                                            details: { capability: capability.kind },
                                        })];
                                }
                                _c.label = 1;
                            case 1:
                                _c.trys.push([1, 3, , 4]);
                                _a = ok;
                                _b = [request];
                                return [4 /*yield*/, capability.list(request.payload.path, signal)];
                            case 2: 
                            // The carrier's signal follows the caller: a disconnect or timeout
                            // stops the backend's directory scan instead of outliving it.
                            return [2 /*return*/, _a.apply(void 0, _b.concat([_c.sent()]))];
                            case 3:
                                error_30 = _c.sent();
                                // An abort is the caller's own timeout/disconnect, not a server
                                // failure — same code pickDirectory and command.execute report.
                                if (signal.aborted) {
                                    return [2 /*return*/, err(request, { code: 'cancelled', message: 'directory listing was aborted', details: {} })];
                                }
                                return [2 /*return*/, err(request, directoryError(error_30))];
                            case 4: return [2 /*return*/];
                        }
                    });
                });
            },
            createDirectory: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var capability, _a, _b, error_31;
                    var _c;
                    return __generator(this, function (_d) {
                        switch (_d.label) {
                            case 0:
                                capability = ctx.directoryPicker.capability();
                                if (capability.kind !== 'browse') {
                                    return [2 /*return*/, err(request, {
                                            code: 'directory-picker-unavailable',
                                            message: "host.createDirectory needs the browse capability; the composed picker serves \"".concat(capability.kind, "\""),
                                            details: { capability: capability.kind },
                                        })];
                                }
                                _d.label = 1;
                            case 1:
                                _d.trys.push([1, 3, , 4]);
                                _a = ok;
                                _b = [request];
                                _c = {};
                                return [4 /*yield*/, capability.createDirectory(request.payload.path, request.payload.name)];
                            case 2: return [2 /*return*/, _a.apply(void 0, _b.concat([(_c.path = _d.sent(), _c)]))];
                            case 3:
                                error_31 = _d.sent();
                                return [2 /*return*/, err(request, directoryError(error_31))];
                            case 4: return [2 /*return*/];
                        }
                    });
                });
            },
            openPath: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, openPath(request, request.payload.path, signal)];
                    });
                });
            },
        },
        goals: {
            // Mutations only — the read side is the 'goal' session projection.
            // Every verb resolves the session's agent (agentFor: implicit cold
            // resume, the command.* precedent) and acknowledges with the new CAS
            // ref; the committed goal/change event carries the whole value to every
            // client through the projection frames.
            create: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, objective, maxGoalRounds;
                    return __generator(this, function (_b) {
                        _a = request.payload, objective = _a.objective, maxGoalRounds = _a.maxGoalRounds;
                        return [2 /*return*/, mutateGoal(request, function (goals, agent) { return goals.create(agent, __assign({ objective: objective }, (maxGoalRounds !== undefined ? { maxGoalRounds: maxGoalRounds } : {}))); })];
                    });
                });
            },
            edit: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, ref, objective, maxGoalRounds;
                    return __generator(this, function (_b) {
                        _a = request.payload, ref = _a.ref, objective = _a.objective, maxGoalRounds = _a.maxGoalRounds;
                        return [2 /*return*/, mutateGoal(request, function (goals, agent) { return goals.edit(agent, ref, __assign(__assign({}, (objective !== undefined ? { objective: objective } : {})), (maxGoalRounds !== undefined ? { maxGoalRounds: maxGoalRounds } : {}))); })];
                    });
                });
            },
            pause: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, mutateGoal(request, function (goals, agent) { return goals.pause(agent, request.payload.ref); })];
                    });
                });
            },
            resume: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, mutateGoal(request, function (goals, agent) { return goals.resume(agent, request.payload.ref); })];
                    });
                });
            },
            complete: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, mutateGoal(request, function (goals, agent) { return goals.complete(agent, request.payload.ref); })];
                    });
                });
            },
            clear: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var found, goals;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, agentFor(request.payload.sessionId)];
                            case 1:
                                found = _a.sent();
                                if ('error' in found)
                                    return [2 /*return*/, err(request, found.error)];
                                goals = goalServiceFor(found.agent);
                                if ('error' in goals)
                                    return [2 /*return*/, err(request, goals.error)];
                                try {
                                    goals.clear(found.agent, request.payload.ref);
                                    return [2 /*return*/, ok(request, { cleared: true })];
                                }
                                catch (error) {
                                    return [2 /*return*/, goalError(request, error)];
                                }
                                return [2 /*return*/];
                        }
                    });
                });
            },
        },
        agentPresets: {
            // A deployment with no roster answers with an empty list rather than an
            // error: composing no presets is a valid deployment, and the browser
            // simply offers no choice.
            list: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var presets, defaultId, _a, _b;
                    var _c;
                    return __generator(this, function (_d) {
                        switch (_d.label) {
                            case 0:
                                presets = ctx.get('agentPresets');
                                if (presets === undefined)
                                    return [2 /*return*/, ok(request, { presets: [], authorable: false, hasDocument: false })];
                                defaultId = presets.defaultId;
                                _a = ok;
                                _b = [request];
                                _c = {};
                                return [4 /*yield*/, presets.list()];
                            case 1: return [2 /*return*/, _a.apply(void 0, _b.concat([(_c.presets = (_d.sent()).map(function (preset) { return (__assign(__assign(__assign({ id: preset.id, trust: preset.trust, isDefault: preset.id === defaultId }, preset.name === undefined ? {} : { name: preset.name }), preset.description === undefined ? {} : { description: preset.description }), preset.broken === undefined ? {} : { broken: preset.broken })); }),
                                        _c.authorable = presets.authorable,
                                        _c.hasDocument = canOpenPaths(),
                                        _c)]))];
                        }
                    });
                });
            },
            // Recomposing is limited to a blank session because a started
            // conversation's history was produced under its preset's tools; the
            // agent and the session survive, only the composition is swapped.
            select: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, sessionId, agentPreset, presets, found, agent, swap, queued, turn;
                    var _this = this;
                    var _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                _a = request.payload, sessionId = _a.sessionId, agentPreset = _a.agentPreset;
                                presets = ctx.get('agentPresets');
                                if (presets === undefined) {
                                    return [2 /*return*/, err(request, {
                                            code: 'agent-preset-not-found',
                                            message: 'this deployment composes no agent presets',
                                            details: { agentPreset: agentPreset, available: [] },
                                        })];
                                }
                                return [4 /*yield*/, agentFor(sessionId)];
                            case 1:
                                found = _c.sent();
                                if ('error' in found)
                                    return [2 /*return*/, err(request, found.error)];
                                agent = found.agent;
                                swap = function () { return __awaiter(_this, void 0, void 0, function () {
                                    var preset, error_32, refused;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                // Re-read inside the queue: an earlier switch may have run, and a
                                                // conversation may have started, since this request arrived.
                                                if (!sessionBlank(agent.session)) {
                                                    return [2 /*return*/, err(request, {
                                                            code: 'agent-preset-locked',
                                                            message: "session \"".concat(sessionId, "\" has already started; its agent preset is fixed"),
                                                            details: { sessionId: sessionId, agentPreset: agentPreset },
                                                        })];
                                                }
                                                _a.label = 1;
                                            case 1:
                                                _a.trys.push([1, 3, , 4]);
                                                return [4 /*yield*/, presets.recompose(agent.ctx, agentPreset)
                                                    // Recorded only after the swap committed: the log states what the
                                                    // agent runs, and a rejected mount leaves the previous composition.
                                                ];
                                            case 2:
                                                preset = _a.sent();
                                                // Recorded only after the swap committed: the log states what the
                                                // agent runs, and a rejected mount leaves the previous composition.
                                                agent.session.append('agent-preset/selected', { agentPreset: preset.id });
                                                return [2 /*return*/, ok(request, { agentPreset: preset.id })];
                                            case 3:
                                                error_32 = _a.sent();
                                                refused = presetFailure(request, error_32);
                                                if (refused !== undefined)
                                                    return [2 /*return*/, refused];
                                                return [2 /*return*/, err(request, {
                                                        code: 'internal',
                                                        message: "failed to select agent preset \"".concat(agentPreset, "\": ").concat(String(error_32)),
                                                        details: {},
                                                    })];
                                            case 4: return [2 /*return*/];
                                        }
                                    });
                                }); };
                                queued = (_b = presetSwitches.get(sessionId)) !== null && _b !== void 0 ? _b : Promise.resolve();
                                turn = queued.then(swap);
                                presetSwitches.set(sessionId, turn.catch(function () { return undefined; }));
                                _c.label = 2;
                            case 2:
                                _c.trys.push([2, , 4, 5]);
                                return [4 /*yield*/, turn];
                            case 3: return [2 /*return*/, _c.sent()];
                            case 4:
                                if (presetSwitches.get(sessionId) === turn)
                                    presetSwitches.delete(sessionId);
                                return [7 /*endfinally*/];
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            },
            // Authoring is privileged (see PRIVILEGED_METHODS in dsh-client-connection):
            // a composition names the plugins a session runs, so reading one is
            // reconnaissance, and copy/remove/openDocument manage the roster and
            // drive the host desktop.
            read: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var agentPreset, presets, preset, _a, _b, error_33;
                    var _c;
                    return __generator(this, function (_d) {
                        switch (_d.label) {
                            case 0:
                                agentPreset = request.payload.agentPreset;
                                presets = ctx.get('agentPresets');
                                if (presets === undefined)
                                    return [2 /*return*/, err(request, noRoster(agentPreset))];
                                _d.label = 1;
                            case 1:
                                _d.trys.push([1, 4, , 5]);
                                return [4 /*yield*/, presets.resolve(agentPreset)];
                            case 2:
                                preset = _d.sent();
                                _a = ok;
                                _b = [request];
                                _c = { agentPreset: preset.id, trust: preset.trust };
                                return [4 /*yield*/, presets.read(preset.id)];
                            case 3: return [2 /*return*/, _a.apply(void 0, _b.concat([__assign.apply(void 0, [__assign.apply(void 0, [(_c.content = _d.sent(), _c), preset.name === undefined ? {} : { name: preset.name }]), preset.description === undefined ? {} : { description: preset.description }])]))];
                            case 4:
                                error_33 = _d.sent();
                                return [2 /*return*/, err(request, presetError(agentPreset, error_33))];
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            },
            copy: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, from, agentPreset, name, presets, error_34;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _a = request.payload, from = _a.from, agentPreset = _a.agentPreset, name = _a.name;
                                presets = ctx.get('agentPresets');
                                if (presets === undefined)
                                    return [2 /*return*/, err(request, noRoster(agentPreset))];
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, presets.copy(from, agentPreset, name)];
                            case 2:
                                _b.sent();
                                return [2 /*return*/, ok(request, { agentPreset: agentPreset })];
                            case 3:
                                error_34 = _b.sent();
                                return [2 /*return*/, err(request, presetError(agentPreset, error_34))];
                            case 4: return [2 /*return*/];
                        }
                    });
                });
            },
            openDocument: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var agentPreset, presets, preset, directory, error_35;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                agentPreset = request.payload.agentPreset;
                                presets = ctx.get('agentPresets');
                                if (presets === undefined)
                                    return [2 /*return*/, err(request, noRoster(agentPreset))];
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 4, , 5]);
                                return [4 /*yield*/, presets.resolve(agentPreset)
                                    // Same line as copy/remove draw: the shipped install is not the
                                    // user's to manage, and pointing an editor into it invites edits an
                                    // upgrade will silently overwrite.
                                ];
                            case 2:
                                preset = _a.sent();
                                // Same line as copy/remove draw: the shipped install is not the
                                // user's to manage, and pointing an editor into it invites edits an
                                // upgrade will silently overwrite.
                                if (preset.trust !== 'user') {
                                    throw new dsh_agent_presets_1.PresetNotWritableError(preset.id, 'it ships with the deployment');
                                }
                                directory = (0, node_path_1.dirname)(preset.path);
                                if (!canOpenPaths())
                                    return [2 /*return*/, ok(request, { opened: false, path: directory })];
                                return [4 /*yield*/, openPath(request, directory, signal)];
                            case 3: return [2 /*return*/, _a.sent()];
                            case 4:
                                error_35 = _a.sent();
                                return [2 /*return*/, err(request, presetError(agentPreset, error_35))];
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            },
            remove: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var agentPreset, presets, error_36;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                agentPreset = request.payload.agentPreset;
                                presets = ctx.get('agentPresets');
                                if (presets === undefined)
                                    return [2 /*return*/, err(request, noRoster(agentPreset))];
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, presets.remove(agentPreset)];
                            case 2:
                                _a.sent();
                                return [2 /*return*/, ok(request, {})];
                            case 3:
                                error_36 = _a.sent();
                                return [2 /*return*/, err(request, presetError(agentPreset, error_36))];
                            case 4: return [2 /*return*/];
                        }
                    });
                });
            },
        },
        skills: {
            // Skill lookup never creates or resumes an agent: the session address
            // resolves to a canonical cwd from the host-resident session header, and
            // the view scope is the live agent or the preset's standing key.
            list: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var sessionId, session, cwd, live, presets, scoped, skillRegistry, scope, skills, error_37;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                sessionId = request.payload.sessionId;
                                session = ctx.sessions.get(sessionId);
                                if (session === undefined) {
                                    return [2 /*return*/, err(request, {
                                            code: 'session-not-found',
                                            message: "session \"".concat(sessionId, "\" not found (not attached)"),
                                            details: { sessionId: sessionId },
                                        })];
                                }
                                if (session.header.cwd === undefined) {
                                    // Every served session records its project at create time; a
                                    // cwd-less header is a pre-project legacy log (not served).
                                    return [2 /*return*/, err(request, { code: 'internal', message: "session \"".concat(sessionId, "\" has no project cwd"), details: {} })];
                                }
                                cwd = session.header.cwd;
                                live = ctx.agents.get(sessionId);
                                presets = ctx.get('agentPresets');
                                scoped = live === undefined ? undefined : presets === null || presets === void 0 ? void 0 : presets.serviceFor(live, 'skills');
                                skillRegistry = scoped !== null && scoped !== void 0 ? scoped : ctx.get('skills');
                                if (skillRegistry === undefined) {
                                    return [2 /*return*/, err(request, { code: 'internal', message: 'skill registry is absent: neither this session\'s agent preset nor the host composition mounts @z/dsh-skill', details: {} })];
                                }
                                return [4 /*yield*/, presenterScopeFor(sessionId, session)];
                            case 1:
                                scope = _a.sent();
                                _a.label = 2;
                            case 2:
                                _a.trys.push([2, 4, , 5]);
                                return [4 /*yield*/, skillRegistry.list({ cwd: cwd, scope: scope })];
                            case 3:
                                skills = (_a.sent()).filter(dsh_skill_1.isUserInvocable);
                                return [2 /*return*/, ok(request, {
                                        skills: skills.map(function (skill) { return (__assign(__assign({ name: skill.name, description: skill.description }, skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }), { modelInvocable: skill.invocation.modelInvocable })); }),
                                    })];
                            case 4:
                                error_37 = _a.sent();
                                return [2 /*return*/, err(request, { code: 'internal', message: "skill listing failed: ".concat(String(error_37)), details: {} })];
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            },
        },
        settings: {
            describe: function (request) {
                var settings = ctx.get('settings');
                if (settings === undefined)
                    return Promise.resolve(err(request, settingsAbsent()));
                return Promise.resolve(ok(request, {
                    writable: settings.writable,
                    hasDocument: settings.documentPath !== undefined,
                    namespaces: settings.describe({ redactSecrets: true }).map(namespaceView),
                }));
            },
            openDocument: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var settings, path, error_38;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                settings = ctx.get('settings');
                                if (settings === undefined)
                                    return [2 /*return*/, err(request, settingsAbsent())];
                                if (isAborted(signal)) {
                                    return [2 /*return*/, err(request, {
                                            code: 'cancelled',
                                            message: 'settings document open was aborted',
                                            details: {},
                                        })];
                                }
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, settings.prepareDocument()];
                            case 2:
                                path = _a.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                error_38 = _a.sent();
                                if (isAborted(signal)) {
                                    return [2 /*return*/, err(request, {
                                            code: 'cancelled',
                                            message: 'settings document preparation was aborted',
                                            details: {},
                                        })];
                                }
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: "settings document preparation failed: ".concat(error_38 instanceof Error ? error_38.message : String(error_38)),
                                        details: {},
                                    })];
                            case 4:
                                if (path === undefined) {
                                    return [2 /*return*/, err(request, {
                                            code: 'internal',
                                            message: 'settings provider has no local document to open',
                                            details: {},
                                        })];
                                }
                                if (isAborted(signal)) {
                                    return [2 /*return*/, err(request, {
                                            code: 'cancelled',
                                            message: 'settings document open was aborted',
                                            details: {},
                                        })];
                                }
                                return [2 /*return*/, openTextFile(request, path, signal)];
                        }
                    });
                });
            },
            update: function (request) { return settingsWrite(request, request.payload.ns, 'update', request.payload.patch, request.payload.expectedRevision); },
            replace: function (request) { return settingsWrite(request, request.payload.ns, 'replace', request.payload.section, request.payload.expectedRevision); },
            mutate: function (request) { return settingsWrite(request, request.payload.ns, 'mutate', request.payload.ops, request.payload.expectedRevision); },
        },
        credentials: {
            describe: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var credentials, entries;
                    var _this = this;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                credentials = ctx.get('credentials');
                                if (credentials === undefined)
                                    return [2 /*return*/, err(request, credentialsAbsent())];
                                return [4 /*yield*/, Promise.all(request.payload.refs.map(function (ref) { return __awaiter(_this, void 0, void 0, function () {
                                        var info, view;
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0: return [4 /*yield*/, credentials.describe((0, dsh_credentials_1.credentialRef)(ref))];
                                                case 1:
                                                    info = _a.sent();
                                                    view = __assign(__assign({ configured: info.configured }, info.source === undefined ? {} : { source: info.source }), { writable: info.writable });
                                                    return [2 /*return*/, [ref, view]];
                                            }
                                        });
                                    }); }))];
                            case 1:
                                entries = _a.sent();
                                return [2 /*return*/, ok(request, { credentials: Object.fromEntries(entries) })];
                        }
                    });
                });
            },
            set: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var credentials, _a, ref, value, error_39;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                credentials = ctx.get('credentials');
                                if (credentials === undefined)
                                    return [2 /*return*/, err(request, credentialsAbsent())];
                                _a = request.payload, ref = _a.ref, value = _a.value;
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, credentials.set((0, dsh_credentials_1.credentialRef)(ref), value)];
                            case 2:
                                _b.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                error_39 = _b.sent();
                                return [2 /*return*/, err(request, {
                                        code: 'credential-rejected',
                                        message: error_39 instanceof Error ? error_39.message : String(error_39),
                                        details: { ref: ref },
                                    })];
                            case 4: return [2 /*return*/, ok(request, {})];
                        }
                    });
                });
            },
            unset: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var credentials, ref, error_40;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                credentials = ctx.get('credentials');
                                if (credentials === undefined)
                                    return [2 /*return*/, err(request, credentialsAbsent())];
                                ref = request.payload.ref;
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, credentials.unset((0, dsh_credentials_1.credentialRef)(ref))];
                            case 2:
                                _a.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                error_40 = _a.sent();
                                return [2 /*return*/, err(request, {
                                        code: 'credential-rejected',
                                        message: error_40 instanceof Error ? error_40.message : String(error_40),
                                        details: { ref: ref },
                                    })];
                            case 4: return [2 /*return*/, ok(request, {})];
                        }
                    });
                });
            },
        },
        mcp: {
            list: function (request) {
                var tools = ctx.tools.schemas().filter(function (tool) { return tool.name.startsWith('mcp__'); });
                return Promise.resolve(ok(request, { tools: tools }));
            },
            call: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var found, _a, name, args, result;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0: return [4 /*yield*/, agentFor(request.payload.sessionId)];
                            case 1:
                                found = _b.sent();
                                if ('error' in found)
                                    return [2 /*return*/, err(request, found.error)];
                                _a = request.payload, name = _a.name, args = _a.arguments;
                                if (ctx.tools.get(name, found.agent) === undefined) {
                                    return [2 /*return*/, err(request, {
                                            code: 'internal',
                                            message: "MCP tool \"".concat(name, "\" is not available to this session"),
                                            details: {},
                                        })];
                                }
                                return [4 /*yield*/, ctx.tools.execute({
                                        callId: (0, dsh_llm_3.CallId)("host-mcp-".concat((0, node_crypto_1.randomUUID)())),
                                        name: name,
                                        arguments: args,
                                        signal: signal !== null && signal !== void 0 ? signal : new AbortController().signal,
                                        agent: found.agent,
                                    })];
                            case 2:
                                result = _b.sent();
                                return [2 /*return*/, ok(request, __assign({ isError: result.isError, content: result.content.flatMap(function (block) { return block.type === 'text' ? [block.text] : []; }) }, result.isError ? {} : { value: result.value }))];
                        }
                    });
                });
            },
        },
        llm: {
            providers: function (request) {
                var registered = ctx.llm.listProviders();
                var active = new Set(registered.map(function (provider) { return provider.id; }));
                var directory = ctx.llm.listConfigurableProviders();
                var declared = new Set(directory.map(function (entry) { return entry.provider; }));
                var piAiDirectoryMounted = directory.some(function (entry) { return String(entry.settingsNs) === 'llm-pi-ai'; });
                var views = directory.map(function (entry) { return (__assign({ provider: entry.provider, displayName: entry.displayName, settingsNs: entry.settingsNs, settingsPath: __spreadArray([], entry.settingsPath, true), active: active.has(entry.provider) }, entry.declared === undefined ? {} : { declared: entry.declared })); });
                // Routes registered without a directory declaration still appear —
                // they exist and serve models — just with no settings address. No
                // adapter claimed them, so nothing can say whether they are shipped.
                for (var _i = 0, registered_1 = registered; _i < registered_1.length; _i++) {
                    var provider = registered_1[_i];
                    if (declared.has(provider.id))
                        continue;
                    // When llm-pi-ai is mounted its catalog routes are always configurable
                    // at providers.<id>; exposing an empty settingsNs blocks API clients
                    // from wiring apiKeyEnv before the directory catches up.
                    var piAiFallback = piAiDirectoryMounted && !provider.id.startsWith('custom-');
                    views.push({
                        provider: provider.id,
                        displayName: provider.name,
                        settingsNs: piAiFallback ? 'llm-pi-ai' : '',
                        settingsPath: piAiFallback ? ['providers', provider.id] : [],
                        active: true,
                    });
                }
                return Promise.resolve(ok(request, { providers: views }));
            },
            models: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                _a = ok;
                                _b = [request];
                                return [4 /*yield*/, buildModelCatalog(ctx)];
                            case 1: return [2 /*return*/, _a.apply(void 0, _b.concat([_c.sent()]))];
                        }
                    });
                });
            },
            discoverModels: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var _a, settingsNs, provider, baseURL, api, apiKey, models, error_41;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                _a = request.payload, settingsNs = _a.settingsNs, provider = _a.provider, baseURL = _a.baseURL, api = _a.api, apiKey = _a.apiKey;
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, ctx.llm.discoverModels(settingsNs, __assign(__assign(__assign(__assign(__assign({}, provider === undefined ? {} : { provider: provider }), baseURL === undefined ? {} : { baseURL: baseURL }), api === undefined ? {} : { api: api }), apiKey === undefined ? {} : { apiKey: apiKey }), signal === undefined ? {} : { signal: signal }))];
                            case 2:
                                models = _b.sent();
                                return [2 /*return*/, ok(request, { models: models })];
                            case 3:
                                error_41 = _b.sent();
                                // Every failure here is the user's next move, not a transport fault:
                                // a wrong endpoint, a rejected key, or a protocol with no listing all
                                // end at the same place — fill the models in by hand. The details
                                // repeat only what the caller already sent, never the credential.
                                return [2 /*return*/, err(request, {
                                        code: 'model-discovery-failed',
                                        message: error_41 instanceof Error ? error_41.message : String(error_41),
                                        details: __assign({ settingsNs: settingsNs }, baseURL === undefined ? {} : { baseURL: baseURL }),
                                    })];
                            case 4: return [2 /*return*/];
                        }
                    });
                });
            },
        },
        authorization: {
            list: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var authorization, credentials, flows;
                    var _this = this;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                authorization = ctx.get('authorization');
                                credentials = ctx.get('credentials');
                                if (authorization === undefined || credentials === undefined) {
                                    return [2 /*return*/, err(request, { code: 'internal', message: 'authorization or credentials service is absent', details: {} })];
                                }
                                return [4 /*yield*/, Promise.all(authorization.list().map(function (entry) { return __awaiter(_this, void 0, void 0, function () {
                                        var record;
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0: return [4 /*yield*/, credentials.describeRecord(entry.key)];
                                                case 1:
                                                    record = _a.sent();
                                                    return [2 /*return*/, {
                                                            key: entry.key,
                                                            label: entry.label,
                                                            methods: entry.methods.map(function (method) { return ({ id: method.id, label: method.label }); }),
                                                            inFlight: entry.inFlight,
                                                            configured: record.configured,
                                                        }];
                                            }
                                        });
                                    }); }))];
                            case 1:
                                flows = _a.sent();
                                return [2 /*return*/, ok(request, { flows: flows })];
                        }
                    });
                });
            },
            begin: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var authorization, _a, attemptId, rawKey, method, key, attempt, outcome, error_42;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                authorization = ctx.get('authorization');
                                if (authorization === undefined)
                                    return [2 /*return*/, err(request, { code: 'internal', message: 'authorization service is absent', details: {} })];
                                _a = request.payload, attemptId = _a.attemptId, rawKey = _a.key, method = _a.method;
                                key = (0, dsh_credentials_1.credentialKey)(rawKey.slice(0, rawKey.indexOf('/')), rawKey.slice(rawKey.indexOf('/') + 1));
                                if (authorizationAttempts.has(attemptId))
                                    return [2 /*return*/, err(request, { code: 'internal', message: 'authorization attempt id is already in use', details: {} })];
                                attempt = { key: key, prompts: new Map() };
                                authorizationAttempts.set(attemptId, attempt);
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 3, 4, 5]);
                                return [4 /*yield*/, authorization.begin(__assign(__assign(__assign({ key: key }, method === undefined ? {} : { method: method }), signal === undefined ? {} : { signal: signal }), { interaction: {
                                            notify: function (notice) {
                                                ctx.emit('taskweaver/authorization-notice', attemptId, key, __assign(__assign({ message: notice.message }, notice.url === undefined ? {} : { url: notice.url }), notice.code === undefined ? {} : { code: notice.code }));
                                            },
                                            prompt: function (prompt) {
                                                var promptId = (0, node_crypto_1.randomUUID)();
                                                var promptSignal = prompt.signal, view = __rest(prompt, ["signal"]);
                                                return new Promise(function (resolve, reject) {
                                                    var pending = { resolve: resolve, reject: reject };
                                                    attempt.prompts.set(promptId, pending);
                                                    var onAbort = function () {
                                                        attempt.prompts.delete(promptId);
                                                        reject(new Error('authorization prompt withdrawn'));
                                                    };
                                                    promptSignal === null || promptSignal === void 0 ? void 0 : promptSignal.addEventListener('abort', onAbort, { once: true });
                                                    ctx.emit('taskweaver/authorization-prompt', attemptId, promptId, key, view);
                                                }).finally(function () { attempt.prompts.delete(promptId); });
                                            },
                                        } }))];
                            case 2:
                                outcome = _b.sent();
                                return [2 /*return*/, ok(request, outcome)];
                            case 3:
                                error_42 = _b.sent();
                                return [2 /*return*/, err(request, {
                                        code: 'internal',
                                        message: error_42 instanceof Error ? error_42.message : String(error_42),
                                        details: {},
                                    })];
                            case 4:
                                authorizationAttempts.delete(attemptId);
                                return [7 /*endfinally*/];
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            },
            cancel: function (request) {
                var _a, _b;
                var authorization = ctx.get('authorization');
                if (authorization === undefined)
                    return Promise.resolve(err(request, { code: 'internal', message: 'authorization service is absent', details: {} }));
                var _c = request.payload, rawKey = _c.key, attemptId = _c.attemptId;
                var key = (0, dsh_credentials_1.credentialKey)(rawKey.slice(0, rawKey.indexOf('/')), rawKey.slice(rawKey.indexOf('/') + 1));
                var attempt = attemptId === undefined ? undefined : authorizationAttempts.get(attemptId);
                if (attemptId !== undefined && (attempt === null || attempt === void 0 ? void 0 : attempt.key) !== key)
                    return Promise.resolve(ok(request, { cancelled: false }));
                var inFlight = attempt !== undefined || ((_a = authorization.describe(key)) === null || _a === void 0 ? void 0 : _a.inFlight) === true;
                if (inFlight) {
                    authorization.cancel(key);
                    for (var _i = 0, _d = (_b = attempt === null || attempt === void 0 ? void 0 : attempt.prompts.values()) !== null && _b !== void 0 ? _b : []; _i < _d.length; _i++) {
                        var pending = _d[_i];
                        pending.reject(new Error('authorization declined'));
                    }
                    attempt === null || attempt === void 0 ? void 0 : attempt.prompts.clear();
                }
                return Promise.resolve(ok(request, { cancelled: inFlight }));
            },
            answer: function (request) {
                var _a, _b;
                var _c = request.payload, attemptId = _c.attemptId, promptId = _c.promptId, answer = _c.answer, declined = _c.declined;
                var pending = (_a = authorizationAttempts.get(attemptId)) === null || _a === void 0 ? void 0 : _a.prompts.get(promptId);
                if (pending === undefined)
                    return Promise.resolve(ok(request, { accepted: false }));
                if (declined) {
                    var authorization = ctx.get('authorization');
                    var key = (_b = authorizationAttempts.get(attemptId)) === null || _b === void 0 ? void 0 : _b.key;
                    if (key)
                        authorization === null || authorization === void 0 ? void 0 : authorization.cancel(key);
                    pending.reject(new Error('authorization declined'));
                }
                else
                    pending.resolve(answer !== null && answer !== void 0 ? answer : '');
                return Promise.resolve(ok(request, { accepted: true }));
            },
            logout: function (request) {
                return __awaiter(this, void 0, void 0, function () {
                    var authorization, credentials, rawKey, key;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                authorization = ctx.get('authorization');
                                credentials = ctx.get('credentials');
                                if (authorization === undefined || credentials === undefined)
                                    return [2 /*return*/, err(request, { code: 'internal', message: 'authorization or credentials service is absent', details: {} })];
                                rawKey = request.payload.key;
                                key = (0, dsh_credentials_1.credentialKey)(rawKey.slice(0, rawKey.indexOf('/')), rawKey.slice(rawKey.indexOf('/') + 1));
                                if (authorization.describe(key) === undefined)
                                    return [2 /*return*/, err(request, { code: 'internal', message: 'no authorization flow is registered for this credential', details: {} })];
                                authorization.cancel(key);
                                return [4 /*yield*/, credentials.deleteRecord(key)];
                            case 1:
                                _a.sent();
                                return [2 /*return*/, ok(request, {})];
                        }
                    });
                });
            },
        },
        events: {
            mux: function (_request, signal) {
                var queue = new FrameQueue();
                muxQueues.add(queue);
                for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
                    var session = _a[_i];
                    subscribeSession(queue, session);
                }
                for (var _b = 0, _c = pendingQuestions.values(); _b < _c.length; _b++) {
                    var pending = _c[_b];
                    queue.push({
                        rpcId: pending.rpcId,
                        payload: {
                            type: 'question/requested', sessionId: pending.sessionId,
                            questions: pending.questions,
                        },
                    });
                }
                // Refresh recovery: still-pending approval questions replay with their
                // stable rpcId so a reconnecting client can still answer them.
                for (var _d = 0, _e = pendingApprovals.values(); _d < _e.length; _d++) {
                    var pending = _e[_d];
                    queue.push(requestedFrame(pending));
                }
                // Queue snapshot baseline (pendingQuestions precedent): frames replayed
                // in arrival order per session; a reconnecting client rebuilds its
                // queue view from these alone.
                for (var _f = 0, _g = ctx.sessions.list(); _f < _g.length; _f++) {
                    var session = _g[_f];
                    var agent = ctx.agents.get(session.id);
                    if ((agent === null || agent === void 0 ? void 0 : agent.session) === session && agent.inbox.hasPending) {
                        queue.push(frame({ type: 'session/queue', sessionId: session.id, items: queueItems(agent) }));
                    }
                }
                // Background-task baseline. `ctx.agents.get` is the non-resuming read:
                // a session with no live Agent owns no tasks, so it correctly sees only
                // the unowned ones, and listing never revives a cold session. An empty
                // set sends nothing — absence is how the client reads "no tasks".
                var jobs = ctx.get('jobs');
                if (jobs !== undefined) {
                    for (var _h = 0, _j = ctx.sessions.list(); _h < _j.length; _h++) {
                        var session = _j[_h];
                        var views = jobViews(jobs.list(ctx.agents.get(session.id)));
                        if (views.length > 0) {
                            queue.push(frame({ type: 'session/jobs', sessionId: session.id, jobs: views }));
                        }
                    }
                }
                // Per-session open-call table for result-view pairing. Bounded by the
                // per-turn call count: entries clear on turn/end; a table miss (stream
                // opened mid-turn) backscans the session's in-memory events instead.
                var openCalls = new Map();
                var disposers = __spreadArray([
                    ctx.root.on('session/event', function (session, event) {
                        if (event.type === 'tool/call') {
                            var data = event.data;
                            try {
                                var table = openCalls.get(session.id);
                                if (table === undefined)
                                    openCalls.set(session.id, table = new Map());
                                table.set(data.callId, { name: data.name, args: JSON.parse(data.arguments) });
                            }
                            catch (_a) {
                                // Unparseable model arguments: leave the table unset; the result view soft-falls.
                            }
                        }
                        else if (event.type === 'turn/end') {
                            openCalls.delete(session.id);
                        }
                        var view = viewFor(ctx, event, function (callId) { var _a, _b; return (_b = (_a = openCalls.get(session.id)) === null || _a === void 0 ? void 0 : _a.get(callId)) !== null && _b !== void 0 ? _b : backscanArgs(session.events, callId); }, ctx.agents.get(session.id));
                        queue.push(frame(__assign({ type: 'session/event', sessionId: session.id, event: event }, view === undefined ? {} : { view: view })));
                    }, { global: true }),
                    ctx.root.on('session/created', function (session) {
                        subscribeSession(queue, session);
                        // The subscribe frame clears the client's task mirror, and a
                        // session born after the stream opened missed the baseline loop.
                        // Unowned tasks are visible to it from birth, so without this it
                        // would show none until the next registry change.
                        var views = jobs === undefined ? [] : jobViews(jobs.list(ctx.agents.get(session.id)));
                        if (views.length > 0) {
                            queue.push(frame({ type: 'session/jobs', sessionId: session.id, jobs: views }));
                        }
                    }, { global: true }),
                    ctx.root.on('session/disposed', function (session) {
                        openCalls.delete(session.id);
                    }, { global: true })
                ], jobs === undefined ? [] : [jobs.onJobsChanged(function (owner) {
                        if (owner !== undefined) {
                            // The exact owner instance the fence compares against, so the
                            // push stays correct even while that Agent's scope is tearing
                            // down and a lookup by id would already miss.
                            queue.push(frame({ type: 'session/jobs', sessionId: owner.id, jobs: jobViews(jobs.list(owner)) }));
                            return;
                        }
                        // An unowned task is visible to every caller, so every subscribed
                        // session's set changed with it.
                        for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
                            var session = _a[_i];
                            queue.push(frame({
                                type: 'session/jobs',
                                sessionId: session.id,
                                jobs: jobViews(jobs.list(ctx.agents.get(session.id))),
                            }));
                        }
                    })], true);
                return queue.iterate(signal, function () {
                    muxQueues.delete(queue);
                    for (var _i = 0, disposers_1 = disposers; _i < disposers_1.length; _i++) {
                        var dispose = disposers_1[_i];
                        dispose();
                    }
                });
            },
            host: function (_request, signal) {
                var queue = new FrameQueue();
                var committedWorkspaces = ctx.workspaceRegistry.list();
                var committedWorkspaceIds = new Set(committedWorkspaces.map(function (workspace) { return String(workspace.id); }));
                var committedWorkspaceOrder = committedWorkspaces.map(function (workspace) { return workspace.id; });
                // Frame-dedup baseline, same posture as committedWorkspaceIds: the
                // stream opens against the current set; workspace.list re-baselines
                // reconnecting clients, so only later changes need frames.
                var archivedSessionIds = ctx.workspaceRegistry.archivedSessionIds;
                var disposers = __spreadArray([
                    ctx.root.on('session/created', function (session) {
                        queue.push(frame(__assign({ type: 'host/session-added', sessionId: session.id, 
                            // Derived at frame time like summarize(); a just-created session
                            // has run no turn yet, so this is constantly true in practice.
                            blank: sessionBlank(session) }, sessionListFields(session.header, session.events))));
                    }, { global: true }),
                    ctx.root.on('session/disposed', function (session) {
                        queue.push(frame({ type: 'host/session-removed', sessionId: session.id }));
                    }, { global: true }),
                    ctx.root.on('agent/status', function (_a) {
                        var agent = _a.agent, status = _a.status;
                        queue.push(frame({ type: 'host/session-status', sessionId: agent.id, running: status === 'running' }));
                    }, { global: true }),
                    ctx.root.on('agent/error', function (_a) {
                        var agent = _a.agent, error = _a.error;
                        queue.push(frame({ type: 'host/agent-error', sessionId: agent.id, message: (0, dsh_llm_2.errorChain)(error) }));
                    }, { global: true }),
                    ctx.on('domain/changed', function (change) {
                        if (change.domain !== 'workspace')
                            return;
                        if (change.table === '') {
                            if (change.operation !== 'put')
                                return;
                            var state = dsh_workspace_1.workspaceDomainState.parse(change.value);
                            var orderChanged = state.workspaceIds.length === committedWorkspaceOrder.length
                                && state.workspaceIds.every(function (workspaceId) { return committedWorkspaceIds.has(String(workspaceId)); })
                                && state.workspaceIds.some(function (workspaceId, index) { return workspaceId !== committedWorkspaceOrder[index]; });
                            for (var _i = 0, _a = state.workspaceIds; _i < _a.length; _i++) {
                                var workspaceId = _a[_i];
                                if (committedWorkspaceIds.has(workspaceId))
                                    continue;
                                var workspace = ctx.workspaceRegistry.get(workspaceId);
                                if (workspace === undefined) {
                                    throw new Error("committed workspace registry references missing workspace \"".concat(workspaceId, "\""));
                                }
                                committedWorkspaceIds.add(workspaceId);
                                queue.push(frame({ type: 'host/workspace-changed', workspace: workspaceView(workspace) }));
                            }
                            committedWorkspaceOrder = __spreadArray([], state.workspaceIds, true);
                            if (orderChanged) {
                                queue.push(frame({
                                    type: 'host/workspace-order-changed',
                                    workspaceIds: __spreadArray([], state.workspaceIds, true),
                                }));
                            }
                            if (state.archivedSessionIds.length !== archivedSessionIds.length
                                || state.archivedSessionIds.some(function (id, index) { return id !== archivedSessionIds[index]; })) {
                                archivedSessionIds = state.archivedSessionIds;
                                queue.push(frame({
                                    type: 'host/archived-sessions-changed',
                                    archivedSessionIds: __spreadArray([], state.archivedSessionIds, true),
                                }));
                            }
                            return;
                        }
                        if (change.table !== 'workspaces')
                            return;
                        if (change.operation === 'deleted') {
                            if (!committedWorkspaceIds.delete(change.key))
                                return;
                            queue.push(frame({
                                type: 'host/workspace-removed',
                                workspaceId: change.key,
                            }));
                            return;
                        }
                        if (!committedWorkspaceIds.has(change.key))
                            return;
                        // Existing-entity table writes are complete attach/touch commits.
                        // A new entity's first put waits for the global registry write above.
                        queue.push(frame({
                            type: 'host/workspace-changed',
                            workspace: changedWorkspaceView(change.key, change.value),
                        }));
                    })
                ], dsh_api_remotes_1.API_REMOTE_FORWARDED_EVENTS.map(function (name) { return ctx.on(name, 
                // The allowlist's shape assertion proves each name is a real,
                // non-scoped, void-returning event, so the rest-parameter handler
                // satisfies every member of the union `on` accepts here;
                // assertJsonArgs proves the payload is JSON-safe before it queues.
                (function () {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    queue.push(frame({
                        type: 'host/remote-event',
                        event: name,
                        args: assertJsonArgs(name, args),
                    }));
                })); }), true);
                return queue.iterate(signal, function () { for (var _i = 0, disposers_2 = disposers; _i < disposers_2.length; _i++) {
                    var dispose = disposers_2[_i];
                    dispose();
                } });
            },
        },
        downloads: {
            sessionLog: function (request, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var deps, ready, root, _a;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                deps = (0, session_export_ts_1.sessionLogExportDeps)(ctx);
                                if (deps.sessionQuery === undefined || deps.sessionPersistence === undefined || deps.attachments === undefined) {
                                    return [2 /*return*/, new Response('session log export is unavailable: missing session-query, session-persistence, or attachments service', { status: 500 })];
                                }
                                if (!deps.sessionPersistence.supportsRawArtifacts) {
                                    return [2 /*return*/, new Response('session log export is unavailable: the persistence backend does not expose per-session raw artifacts', { status: 501 })];
                                }
                                ready = {
                                    sessionQuery: deps.sessionQuery,
                                    sessionPersistence: deps.sessionPersistence,
                                    attachments: deps.attachments,
                                    sessions: deps.sessions,
                                };
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 4, , 5]);
                                return [4 /*yield*/, (0, session_export_ts_1.flushLiveSessionLog)(deps, request.sessionId, signal)];
                            case 2:
                                _b.sent();
                                return [4 /*yield*/, deps.sessionPersistence.readRaw(request.sessionId, signal)];
                            case 3:
                                root = _b.sent();
                                signal.throwIfAborted();
                                return [3 /*break*/, 5];
                            case 4:
                                _a = _b.sent();
                                signal.throwIfAborted();
                                // Root preparation failure: answer 500 without echoing the error,
                                // which may carry absolute host paths into the browser error bar.
                                return [2 /*return*/, new Response('session log export failed to prepare the stored artifact', { status: 500 })];
                            case 5:
                                if (root === undefined) {
                                    return [2 /*return*/, new Response('session not found', { status: 404 })];
                                }
                                return [2 /*return*/, new Response((0, session_export_ts_1.streamSessionLogZip)(ready, root, request.sessionId, request.includeDescendants === true, sessionExportCompressionLevel, signal), {
                                        headers: {
                                            'content-type': 'application/zip',
                                            'content-disposition': "attachment; filename=\"".concat((0, session_export_ts_1.sessionLogZipFilename)(request.sessionId), "\""),
                                        },
                                    })];
                        }
                    });
                });
            },
        },
        respond: function (message) {
            // Route by the echoed rpcId (the wire correlation): approvals first,
            // then questions — the two registries share one id space of UUIDs.
            var approval = pendingApprovals.get(message.rpcId);
            if (approval !== undefined) {
                if (!message.result.ok)
                    return Promise.resolve({ accepted: false, reason: 'bad-response' });
                var parsed_1 = approvals_schema_ts_1.approvalResponsePayloadSchema.safeParse(message.result.value);
                // The payload's audit correlation must match the entry the rpcId routed
                // to — a mismatched answer is malformed, not merely late.
                if (!parsed_1.success || parsed_1.data.approvalId !== approval.approvalId || parsed_1.data.sessionId !== approval.sessionId) {
                    return Promise.resolve({ accepted: false, reason: 'bad-response' });
                }
                approval.resolve(parsed_1.data.outcome);
                return Promise.resolve({ accepted: true });
            }
            var pending = pendingQuestions.get(message.rpcId);
            if (pending === undefined)
                return Promise.resolve({ accepted: false, reason: 'not-pending' });
            if (!message.result.ok) {
                if (message.result.error.code !== 'cancelled') {
                    return Promise.resolve({ accepted: false, reason: 'bad-response' });
                }
                claimQuestion(pending, 'cancelled');
                pending.reject(new dsh_user_questions_1.UserQuestionError('the user cancelled ask_user_question', 'ASK_CANCELLED'));
                return Promise.resolve({ accepted: true });
            }
            var parsed = questions_schema_ts_1.questionResponsePayloadSchema.safeParse(message.result.value);
            if (!parsed.success) {
                return Promise.resolve({ accepted: false, reason: 'bad-response' });
            }
            var payload = {
                sessionId: parsed.data.sessionId,
                answer: {
                    answers: parsed.data.answer.answers.map(function (answer) { return (__assign({ id: answer.id, selected: answer.selected }, (answer.custom === undefined ? {} : { custom: answer.custom }))); }),
                },
            };
            if (!matchesQuestions(payload, pending)) {
                return Promise.resolve({ accepted: false, reason: 'bad-response' });
            }
            claimQuestion(pending, 'answered');
            pending.resolve(payload.answer);
            return Promise.resolve({ accepted: true });
        },
    };
}
