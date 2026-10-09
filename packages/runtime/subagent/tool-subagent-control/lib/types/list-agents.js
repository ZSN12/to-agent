"use strict";
/**
 * The globally named `list_agents` tool: a thin model-facing adapter over
 * the continuable projection of `ctx.subagents.listChildren()` and, for the
 * `descendants` scope, `ctx.subagents.listDescendants()`. It stays separately
 * loadable from the root `send_message` plugin so a deployment can register
 * continuation delivery without exposing discovery.
 * @module @z/dsh-tool-subagent-control/list-agents
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
exports.inject = exports.name = void 0;
exports.apply = apply;
var dsh_tools_1 = require("@z/dsh-tools");
var dsh_llm_1 = require("@z/dsh-llm");
exports.name = 'tool-subagent-list-agents';
exports.inject = ['tools', 'subagents', 'agents'];
/** Resolve the optional model request into an internal required-scope spec. */
function resolveListAgentsRequest(request) {
    var _a;
    return { scope: (_a = request.scope) !== null && _a !== void 0 ? _a : 'children' };
}
/**
 * Refine one candidate's status through the live Agent registry: `running`
 * for an active driver, `idle` for a resident Agent between turns (possibly
 * waiting on agents it started), and `ready` when no live Agent remains.
 * `ready` preserves resumability without presenting an inactive conversation
 * as a terminal result to collect.
 */
function statusOf(agents, id) {
    var agent = agents.get(id);
    if (agent === undefined)
        return 'ready';
    return agent.status === 'running' ? 'running' : 'idle';
}
/** Project one service row into the model-facing entry, or omit a one-shot child. */
function project(agents, entry, position) {
    var at = position === undefined ? {} : { parent: position.parentId, depth: position.depth };
    if (entry.kind === 'diagnostic') {
        return __assign({ kind: 'diagnostic', id: entry.id, reason: entry.reason }, at);
    }
    // One-shot children cannot be continued by send_message, so the model
    // never selects them; discovery still traversed them for descendants.
    if (entry.mode !== 'continuable')
        return undefined;
    return __assign({ kind: 'child', id: entry.id, label: entry.label, status: statusOf(agents, entry.id) }, at);
}
/**
 * Register the `list_agents` tool.
 * @param ctx - context carrying the tool registry, subagent service, and live Agent registry.
 */
function apply(ctx) {
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'wait_agents',
        description: 'Wait for a real lifecycle change in one of your currently running direct subagents. Use this instead '
            + 'of repeatedly calling `list_agents`: the call sleeps until at least one child stops running, the '
            + 'timeout expires, or your turn is cancelled. A child becoming idle can mean it is waiting for its own '
            + 'children, so inspect the returned snapshot before deciding what to do next. Prefer continuing useful '
            + 'independent work while background agents run; do not call this in a tight loop.',
        parameters: {
            timeout_ms: {
                type: 'number',
                description: 'Maximum wait in milliseconds (1,000–120,000; default 30,000).',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    changed: { type: 'boolean', required: true },
                    statuses: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                id: { type: 'string', required: true },
                                status: { type: 'string', required: true, enum: ['running', 'idle', 'ready'] },
                            },
                        },
                    },
                },
            },
            render: function (_args, result) { return [{
                    type: 'text',
                    text: "".concat(result.changed ? 'A subagent changed state' : 'No subagent state changed before timeout', ".\n")
                        + (result.statuses.length === 0
                            ? '(no continuable subagents)'
                            : result.statuses.map(function (entry) { return "".concat(entry.id, " [").concat(entry.status, "]"); }).join('\n')),
                }]; },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var parent, timeoutMs, childIds, runningChildIds, observedIdleIds, observedChange, disposeStatus, settleWait, changed, children, error_1, _i, children_1, entry, statuses;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            parent = exec.agent;
                            if (!parent)
                                throw new Error('wait_agents requires a calling agent (exec.agent was undefined)');
                            timeoutMs = (_a = args.timeout_ms) !== null && _a !== void 0 ? _a : 30000;
                            if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
                                throw new Error('wait_agents timeout_ms must be an integer from 1,000 to 120,000');
                            }
                            childIds = new Set();
                            runningChildIds = new Set();
                            observedIdleIds = new Set();
                            observedChange = false;
                            changed = new Promise(function (resolve, reject) {
                                var settled = false;
                                var finish = function (value) {
                                    if (settled)
                                        return;
                                    settled = true;
                                    clearTimeout(timer);
                                    disposeStatus === null || disposeStatus === void 0 ? void 0 : disposeStatus();
                                    exec.signal.removeEventListener('abort', onAbort);
                                    resolve(value);
                                };
                                var onAbort = function () {
                                    if (settled)
                                        return;
                                    settled = true;
                                    clearTimeout(timer);
                                    disposeStatus === null || disposeStatus === void 0 ? void 0 : disposeStatus();
                                    reject(exec.signal.reason instanceof Error ? exec.signal.reason : new Error('wait_agents cancelled'));
                                };
                                var timer = setTimeout(function () { finish(false); }, timeoutMs);
                                settleWait = finish;
                                disposeStatus = ctx.on('agent/status', function (_a) {
                                    var agent = _a.agent, status = _a.status;
                                    if (status === 'idle') {
                                        observedIdleIds.add(agent.id);
                                        if (childIds.has(agent.id)) {
                                            observedChange = true;
                                            finish(true);
                                        }
                                    }
                                });
                                if (exec.signal.aborted)
                                    onAbort();
                                else
                                    exec.signal.addEventListener('abort', onAbort, { once: true });
                            });
                            // The snapshot read can fail or be cancelled before the caller reaches
                            // the final await; attach a rejection observer immediately as well.
                            void changed.catch(function () { });
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 3, , 5]);
                            return [4 /*yield*/, ctx.subagents.listChildren(parent.id, exec.signal)];
                        case 2:
                            children = _c.sent();
                            return [3 /*break*/, 5];
                        case 3:
                            error_1 = _c.sent();
                            settleWait === null || settleWait === void 0 ? void 0 : settleWait(false);
                            return [4 /*yield*/, changed.catch(function () { return undefined; })];
                        case 4:
                            _c.sent();
                            throw error_1;
                        case 5:
                            for (_i = 0, children_1 = children; _i < children_1.length; _i++) {
                                entry = children_1[_i];
                                if (entry.kind !== 'child' || entry.mode !== 'continuable')
                                    continue;
                                childIds.add(entry.id);
                                if (((_b = ctx.agents.get(entry.id)) === null || _b === void 0 ? void 0 : _b.status) === 'running')
                                    runningChildIds.add(entry.id);
                            }
                            if (!(runningChildIds.size === 0)) return [3 /*break*/, 7];
                            observedChange = __spreadArray([], childIds, true).some(function (id) { return observedIdleIds.has(id); });
                            settleWait === null || settleWait === void 0 ? void 0 : settleWait(observedChange);
                            return [4 /*yield*/, changed];
                        case 6:
                            observedChange = _c.sent();
                            return [3 /*break*/, 9];
                        case 7:
                            // A child may have gone idle while the durable child catalog loaded.
                            if (__spreadArray([], runningChildIds, true).some(function (id) { var _a; return ((_a = ctx.agents.get(id)) === null || _a === void 0 ? void 0 : _a.status) !== 'running'; })
                                || __spreadArray([], runningChildIds, true).some(function (id) { return observedIdleIds.has(id); })) {
                                observedChange = true;
                                settleWait === null || settleWait === void 0 ? void 0 : settleWait(true);
                            }
                            return [4 /*yield*/, changed];
                        case 8:
                            observedChange = _c.sent();
                            _c.label = 9;
                        case 9:
                            statuses = children
                                .filter(function (entry) {
                                return entry.kind === 'child' && entry.mode === 'continuable';
                            })
                                .map(function (entry) { return ({ id: entry.id, status: statusOf(ctx.agents, entry.id) }); });
                            return [2 /*return*/, { changed: observedChange, statuses: statuses }];
                    }
                });
            });
        },
    }));
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'list_agents',
        description: 'List your continuable background subagents by durable id and label. Use it to recall which ones '
            + 'you started, not to poll for completion. When you must wait, call `wait_agents` to sleep until a real '
            + 'state change instead of repeatedly taking snapshots. Status comes from the live '
            + 'registry: running means the agent is working right now, idle means it is loaded but between turns '
            + '(it may be waiting on agents it started), and ready means it exists only in storage — resumable, not '
            + 'terminal, and not a result waiting to be collected; a `send_message` starts a new turn on the same '
            + 'conversation, and a direct child remains a `send_message` candidate in every status. The snapshot is not a delivery '
            + 'promise — `send_message` performs the authoritative check and may still fail. Children that could '
            + 'not be read are reported as diagnostics instead of being silently dropped. Scope `descendants` '
            + 'walks the whole tree below you in stable pre-order, annotating each entry with its durable direct-parent '
            + 'session id and depth. You may use `send_message` only for depth-1 entries; deeper entries are '
            + 'candidates for `interrupt_agent` only.',
        parameters: {
            scope: {
                type: 'string',
                enum: ['children', 'descendants'],
                description: 'children (default) lists direct children only; descendants walks the complete tree below you.',
            },
        },
        output: {
            schema: {
                type: 'array',
                items: {
                    oneOf: [
                        {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                kind: { type: 'string', required: true, enum: ['child'] },
                                id: { type: 'string', required: true },
                                label: { type: 'string', required: true },
                                status: { type: 'string', required: true, enum: ['running', 'idle', 'ready'] },
                                parent: { type: 'string' },
                                depth: { type: 'number' },
                            },
                        },
                        {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                kind: { type: 'string', required: true, enum: ['diagnostic'] },
                                id: { type: 'string', required: true },
                                reason: { type: 'string', required: true, enum: ['corrupt', 'unsupported', 'unavailable'] },
                                parent: { type: 'string' },
                                depth: { type: 'number' },
                            },
                        },
                    ],
                },
            },
            render: function (args, entries) {
                var request = resolveListAgentsRequest(args);
                return [{
                        type: 'text',
                        text: entries.length === 0
                            ? '(no subagents)'
                            : entries.map(function (entry) {
                                // A descendants row always carries its position; children rows
                                // never render it. String() spans the schema-optional shape
                                // without a dead fallback branch.
                                var at = request.scope === 'descendants'
                                    ? " parent=".concat(String(entry.parent), " depth=").concat(String(entry.depth))
                                    : '';
                                return entry.kind === 'child'
                                    ? "".concat(entry.id, " [").concat(entry.status, "]").concat(at, " \u2014 ").concat(entry.label)
                                    : "".concat(entry.id, " [diagnostic: ").concat(entry.reason, "]").concat(at);
                            }).join('\n'),
                    }];
            },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var parent, request, _a, entries, entries;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            parent = exec.agent;
                            if (!parent) {
                                // Non-agent callers have no session whose children could be listed.
                                throw new Error('list_agents requires a calling agent (exec.agent was undefined)');
                            }
                            request = resolveListAgentsRequest(args);
                            _a = request.scope;
                            switch (_a) {
                                case 'children': return [3 /*break*/, 1];
                                case 'descendants': return [3 /*break*/, 3];
                            }
                            return [3 /*break*/, 5];
                        case 1: return [4 /*yield*/, ctx.subagents.listChildren(parent.id, exec.signal)];
                        case 2:
                            entries = _b.sent();
                            return [2 /*return*/, entries
                                    .map(function (entry) { return project(ctx.agents, entry); })
                                    .filter(function (entry) { return entry !== undefined; })];
                        case 3: return [4 /*yield*/, ctx.subagents.listDescendants(parent.id, exec.signal)];
                        case 4:
                            entries = _b.sent();
                            return [2 /*return*/, entries
                                    .map(function (entry) { return project(ctx.agents, entry, entry); })
                                    .filter(function (entry) { return entry !== undefined; })];
                        case 5: return [2 /*return*/, (0, dsh_llm_1.assertNever)(request.scope, 'list_agents scope')];
                    }
                });
            });
        },
    }));
}
