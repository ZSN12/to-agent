"use strict";
/**
 * Plan mode is logged per-agent collaboration state: while active, a
 * deployment-owned guidance section is included in each model request, and
 * `exit_plan_mode` presents the completed plan for user review, while the
 * `/plan off` command lets a user leave directly. Sandbox mode and approval
 * policy enforce restrictions independently and do not read or write plan
 * state.
 *
 * The state in force is folded from the session log (`plan/mode`, last one
 * wins), so resume and fork restore it without a live mirror. User selections
 * remain pending until the next accepted in-turn pre-step. The service includes
 * the selected state in the proposed step assembly, then appends `plan/mode`
 * from `agent/pre-step` only when the step is accepted. Same-step request
 * retries reuse their assembly.
 *
 * The exit tool remains registered while plan mode is inactive, so entering
 * or leaving plan mode changes only the prompt section, not the request tool
 * catalog.
 *
 * Agent Note:
 * - .agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md
 *
 * @module @z/dsh-plan-mode
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
exports.PlanModeController = exports.EXIT_PLAN_MODE = void 0;
exports.resolveConfig = resolveConfig;
exports.foldPlanMode = foldPlanMode;
var cordis_1 = require("@z/cordis");
var zod_1 = require("zod");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_tools_1 = require("@z/dsh-tools");
var dsh_user_questions_1 = require("@z/dsh-user-questions");
/**
 * The model-facing exit tool's name. It stays registered while plan mode is
 * inactive so the request tool catalog is stable across transitions.
 */
exports.EXIT_PLAN_MODE = 'exit_plan_mode';
/** The review question's id, echoed in the answer this tool reads. */
var REVIEW_ID = 'plan-review';
/** The review question's approve option label. */
var APPROVE_LABEL = 'Approve';
/** The review question's keep-planning option label. */
var KEEP_PLANNING_LABEL = 'Keep planning';
var EXIT_DESCRIPTION = 'Use only in plan mode. Present your plan for the user\'s review and, on approval, leave plan mode. '
    + 'Send the COMPLETE plan as markdown, starting with a # heading that names it. '
    + 'The user may approve (carry out the plan from your next step) or keep '
    + 'planning — their feedback comes back in the tool result; revise and present again.';
/** The plan's first markdown heading (any level), or `undefined` when it has none. */
function firstHeading(plan) {
    for (var _i = 0, _a = plan.split('\n'); _i < _a.length; _i++) {
        var line = _a[_i];
        var match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
        if (match)
            return match[1];
    }
    return undefined;
}
/**
 * Validate deployment-owned plan guidance. Missing, blank, non-string, or
 * unknown fields fail at plugin load rather than being ignored.
 *
 * @param config Raw plugin config.
 * @returns A detached validated config.
 */
function resolveConfig(config) {
    var section = config.section;
    if (typeof section !== 'string') {
        throw new Error('PlanModeConfig needs a string `section`');
    }
    if (section.trim() === '') {
        throw new Error('PlanModeConfig needs a non-empty `section`');
    }
    var unknown = Object.keys(config).filter(function (key) { return key !== 'section'; });
    if (unknown.length > 0) {
        throw new Error("PlanModeConfig has unknown key(s) ".concat(unknown.join(', '), " \u2014 config is { section }"));
    }
    return { section: section };
}
/**
 * Whether plan mode is active after the first `end` events. The last
 * `plan/mode` wins; a prefix with none is inactive.
 *
 * @param events The session log or any prefix of it.
 * @param end Fold `events[0, end)`; defaults to the whole log.
 * @returns Whether plan mode is active.
 */
function foldPlanMode(events, end) {
    if (end === void 0) { end = events.length; }
    var active = false;
    var index = 0;
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        if (index >= end)
            break;
        index++;
        if (event_1.type === 'plan/mode')
            active = event_1.data.active;
    }
    return active;
}
var planUnitStateSchema = zod_1.z.object({
    active: zod_1.z.boolean(),
    wanted: zod_1.z.boolean().nullable(),
    running: zod_1.z.object({
        commandId: zod_1.z.string(),
        wanted: zod_1.z.boolean(),
    }).strict().nullable(),
}).strict();
/** Wire payload schema of the `plan` projection. */
var planProjectionSchema = zod_1.z.object({
    active: zod_1.z.boolean(),
    pending: zod_1.z.boolean(),
});
/** Whether the log holds an opened turn without its closing `turn/end`. */
function hasOpenTurn(events) {
    var open = false;
    for (var _i = 0, events_2 = events; _i < events_2.length; _i++) {
        var event_2 = events_2[_i];
        if (event_2.type === 'turn/start')
            open = true;
        else if (event_2.type === 'turn/end')
            open = false;
    }
    return open;
}
/** Plan state at the last logged request header, or `undefined` before the first header. */
function planModeAtLastHeader(events) {
    var lastHeader = -1;
    var index = 0;
    for (var _i = 0, events_3 = events; _i < events_3.length; _i++) {
        var event_3 = events_3[_i];
        if (event_3.type === 'request/header')
            lastHeader = index;
        index++;
    }
    if (lastHeader < 0)
        return undefined;
    return foldPlanMode(events, lastHeader + 1);
}
/**
 * `ctx.planMode`: owns logged plan state, applies and narrates selected state at step start,
 * the `plan:policy` section, the `/plan` command, and the stable exit tool.
 * UIs observe committed flips through `session/event`; there is no live mirror.
 */
var PlanModeController = /** @class */ (function (_super) {
    __extends(PlanModeController, _super);
    function PlanModeController(ctx, config) {
        if (config === void 0) { config = { section: '' }; }
        var _this = _super.call(this, ctx, 'planMode') || this;
        /**
         * Latest selection per session awaiting the next accepted in-turn pre-step.
         * `narrate` is true for user selections and false for the exit tool, whose
         * result already narrates the transition.
         */
        _this.pendingIntents = new WeakMap();
        _this.section = resolveConfig(config).section;
        var disposed = false;
        // Pre-step is outside Session.append publication, so it can append the
        // log-only mode event inside an open turn without re-entering the session.
        // A failed append remains pending for a later accepted in-turn pre-step,
        // and policy cannot block the step.
        ctx.on('agent/pre-step', function (_a, next_1) { return __awaiter(_this, [_a, next_1], void 0, function (_b, next) {
            var decision, pending, narration;
            var agent = _b.agent, signal = _b.signal;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, next()];
                    case 1:
                        decision = _c.sent();
                        pending = this.pendingIntents.get(agent.session);
                        if (decision.kind === 'reject' || signal.aborted || pending === undefined)
                            return [2 /*return*/, decision];
                        narration = this.narration(agent.session, pending.active);
                        try {
                            this.onBoundary(agent.session);
                        }
                        catch (error) {
                            ctx.logger.warn('dsh-plan-mode: failed to append selected plan mode at step start: %o', error);
                            return [2 /*return*/, decision];
                        }
                        return [2 /*return*/, !pending.narrate || narration === undefined
                                ? decision
                                : __assign(__assign({}, decision), { messages: __spreadArray(__spreadArray([], decision.messages, true), [narration], false) })];
                }
            });
        }); });
        ctx.effect(function () { return function () { disposed = true; }; }, 'dsh-plan-mode: close service lifetime');
        ctx.systemPrompt.section({
            name: 'plan:policy',
            order: 50,
            text: function (context) {
                var _a;
                if (context.agent === undefined)
                    return '';
                var pending = _this.pendingIntents.get(context.agent.session);
                return ((_a = pending === null || pending === void 0 ? void 0 : pending.active) !== null && _a !== void 0 ? _a : foldPlanMode(context.agent.session.events)) ? _this.section : '';
            },
        });
        // The plan projection unit (session-projection RFC): a pure event fold
        // serving clients the whole {active, pending} value. `command/run`
        // records the user's logged /plan selection, its paired `command/done`
        // keeps only successful selections, and `plan/mode` records that
        // selection and clears it. Pending is thereby a pure
        // replay quantity: host restarts, other tabs, and cold reads all recover
        // it from the log alone. The unit child activates only when a projection
        // registry is composed (headless assemblies stay unaffected).
        ctx.inject(['sessionProjections'], function (projectionCtx) {
            projectionCtx.sessionProjections.register({
                key: 'plan',
                stateSchema: planUnitStateSchema,
                init: function () { return ({ active: false, wanted: null, running: null }); },
                apply: function (state, event) {
                    var _a;
                    if (event.type === 'command/run' && event.data.name === 'plan') {
                        if (event.data.args === undefined)
                            return state;
                        var wanted = event.data.args.trim() !== 'off';
                        return __assign(__assign({}, state), { running: { commandId: event.data.commandId, wanted: wanted } });
                    }
                    if (event.type === 'command/done' && event.data.commandId === ((_a = state.running) === null || _a === void 0 ? void 0 : _a.commandId)) {
                        var wanted = event.data.kind === 'success' && state.running.wanted !== state.active
                            ? state.running.wanted
                            : null;
                        return __assign(__assign({}, state), { wanted: wanted, running: null });
                    }
                    if (event.type === 'plan/mode') {
                        return __assign(__assign({}, state), { active: event.data.active, wanted: null });
                    }
                    return state;
                },
                wire: {
                    viewSchema: planProjectionSchema,
                    view: function (state) {
                        var _a, _b;
                        var wanted = (_b = (_a = state.running) === null || _a === void 0 ? void 0 : _a.wanted) !== null && _b !== void 0 ? _b : state.wanted;
                        return { active: state.active, pending: wanted !== null && wanted !== state.active };
                    },
                },
                stateVersion: 2,
            });
        });
        // The command child activates only when a command registry is composed.
        ctx.inject(['commands'], function (commandCtx) {
            commandCtx.commands.register({
                name: 'plan',
                description: 'Enter or leave plan mode',
                input: { hint: '[off|message]', images: true },
                handler: function (_a) {
                    var agent = _a.agent, rawInput = _a.rawInput, attachments = _a.attachments;
                    var message = rawInput.trim();
                    if (message === 'off' && attachments.length > 0) {
                        return { kind: 'error', text: 'Image attachments cannot accompany /plan off.' };
                    }
                    if (message === 'off') {
                        switch (_this.set(agent, false)) {
                            case 'committed':
                                return { kind: 'success', text: 'Plan mode off.' };
                            case 'queued':
                                return { kind: 'success', text: 'Leaving plan mode (applies from the next step).' };
                            case 'cancelled':
                                return { kind: 'success', text: 'Plan mode entry cancelled.' };
                            case 'noop':
                                // Repeat the queued wording while an exit still awaits the
                                // next accepted pre-step; only a truly inactive session reads
                                // idempotent.
                                return foldPlanMode(agent.session.events)
                                    ? { kind: 'success', text: 'Leaving plan mode (applies from the next step).' }
                                    : { kind: 'success', text: 'Plan mode is already inactive.' };
                        }
                    }
                    var outcome = _this.set(agent, true);
                    if (message !== '' || attachments.length > 0) {
                        agent.steer((0, dsh_llm_1.createUserMessage)({
                            content: __spreadArray(__spreadArray([], attachments, true), (message === '' ? [] : [{ type: 'text', text: message }]), true),
                            source: { kind: 'user' },
                        }));
                    }
                    return {
                        kind: 'success',
                        text: outcome === 'committed'
                            ? 'Plan mode on. Use /plan off to leave.'
                            : 'Entering plan mode (applies from the next step). Use /plan off to leave.',
                    };
                },
            });
        });
        ctx.tools.register((0, dsh_tools_1.defineTool)({
            name: exports.EXIT_PLAN_MODE,
            description: EXIT_DESCRIPTION,
            parameters: {
                plan: { type: 'string', required: true, description: 'The complete plan, as markdown, starting with a # heading that names it.' },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        approved: { type: 'boolean', const: true, required: true },
                    },
                },
                render: function () { return [{ type: 'text', text: 'Plan approved — plan mode exited; carry out the plan starting with your next step.' }]; },
            },
            execute: function (args, exec) { return __awaiter(_this, void 0, void 0, function () {
                var agent, interaction, answer, reviewItems, item, feedback;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            agent = exec.agent;
                            if (agent === undefined)
                                throw new Error("".concat(exports.EXIT_PLAN_MODE, " requires a calling agent (no session to switch)"));
                            if (!foldPlanMode(agent.session.events)) {
                                throw new Error("".concat(exports.EXIT_PLAN_MODE, " is only available in plan mode"));
                            }
                            if (!/^#\s+\S/.test(args.plan.trim())) {
                                throw new Error("".concat(exports.EXIT_PLAN_MODE, " requires a non-empty markdown plan starting with a # heading"));
                            }
                            interaction = ctx.get('userQuestions');
                            if (interaction === undefined) {
                                throw new Error('no user-questions channel is available to review the plan; ask the user to switch the session mode instead');
                            }
                            return [4 /*yield*/, interaction.ask({
                                    questions: [{
                                            id: REVIEW_ID,
                                            header: 'Plan review',
                                            question: 'Approve this plan and leave plan mode?',
                                            detail: args.plan,
                                            options: [
                                                { label: APPROVE_LABEL, description: 'Leave plan mode; the plan is carried out from the next step.' },
                                                { label: KEEP_PLANNING_LABEL, description: 'Stay in plan mode; feedback goes back to the model.' },
                                            ],
                                            // Presentation only: a capable UI renders the plan as a review
                                            // decision instead of a generic question, and answers with one of
                                            // the labels above either way.
                                            intent: { kind: 'plan-review', approve: APPROVE_LABEL },
                                        }],
                                    agent: agent,
                                    signal: exec.signal,
                                }).catch(function (cause) {
                                    // A dismissed review is not a failed one: the user took the turn back
                                    // to say something the two options do not cover. Say so, because the
                                    // generic channel message names ask_user_question, which the model
                                    // never called. An abort (turn cancel, provider teardown) keeps its
                                    // own message — there is no user to wait for.
                                    if (cause instanceof dsh_user_questions_1.UserQuestionError && cause.code === 'ASK_CANCELLED') {
                                        throw new Error('The user dismissed the plan review to speak instead; '
                                            + 'stay in plan mode, stop here, and wait for their message.');
                                    }
                                    throw cause;
                                })
                                // A review may outlive this plugin fiber. Without its pre-step listener,
                                // an approved selection could never be appended, so fail and keep planning.
                            ];
                        case 1:
                            answer = _b.sent();
                            // A review may outlive this plugin fiber. Without its pre-step listener,
                            // an approved selection could never be appended, so fail and keep planning.
                            if (disposed) {
                                throw new Error('the plan-mode service was reloaded while the plan was under review; present the plan again');
                            }
                            reviewItems = answer.answers.filter(function (entry) { return entry.id === REVIEW_ID; });
                            item = reviewItems.length === 1 ? reviewItems[0] : undefined;
                            if ((item === null || item === void 0 ? void 0 : item.selected.length) !== 1 || item.selected[0] !== APPROVE_LABEL || item.custom !== undefined) {
                                feedback = (_a = item === null || item === void 0 ? void 0 : item.custom) !== null && _a !== void 0 ? _a : '';
                                throw new Error(feedback === ''
                                    ? 'The user chose to keep planning; revise the plan and present it again.'
                                    : "The user chose to keep planning; their feedback: ".concat(feedback));
                            }
                            // Keep plan guidance for the rest of this assistant tool batch. The
                            // silent selection is appended at the next accepted in-turn pre-step,
                            // before its request assembly.
                            this.pendingIntents.set(agent.session, { active: false, narrate: false });
                            return [2 /*return*/, { approved: true }];
                    }
                });
            }); },
            presentCall: function (args) {
                var _a;
                return ({
                    card: 'generic',
                    title: (_a = firstHeading(args.plan)) !== null && _a !== void 0 ? _a : 'Plan',
                    kind: 'other',
                    content: [{ type: 'text', text: args.plan }],
                });
            },
            presentResult: function (_args, result) { return ({
                card: 'generic',
                title: 'Plan review',
                content: result.content,
            }); },
        }));
        return _this;
    }
    /**
     * Read the logged plan state and any selected state awaiting the next
     * accepted in-turn pre-step.
     *
     * @param agent The agent to read.
     * @returns Current logged state plus a pending selection, when present.
     */
    PlanModeController.prototype.get = function (agent) {
        var active = foldPlanMode(agent.session.events);
        var pending = this.pendingIntents.get(agent.session);
        return pending === undefined ? { active: active } : { active: active, pending: pending.active };
    };
    /**
     * Select whether plan mode should be active. Between turns the method
     * appends the change immediately because no in-turn pre-step will run until
     * another prompt starts a turn. The open-turn fold is the idle signal:
     * agent status stays `running` through post-turn checkpointing, when no
     * further in-turn pre-step runs. During an open turn the selection remains
     * pending until the next accepted in-turn pre-step. Repeated selection of
     * the current or already-pending state is a no-op.
     *
     * @param agent The agent to switch.
     * @param active Whether plan mode should be active.
     * @returns what happened: `committed` (logged now), `queued` (awaiting the
     * next accepted in-turn pre-step), `cancelled` (an opposite pending selection
     * was cleared; the logged state already matches), or `noop` (already in that
     * state).
     */
    PlanModeController.prototype.set = function (agent, active) {
        var _a;
        var session = agent.session;
        var pending = this.pendingIntents.get(session);
        var target = (_a = pending === null || pending === void 0 ? void 0 : pending.active) !== null && _a !== void 0 ? _a : foldPlanMode(session.events);
        if (active === target)
            return 'noop';
        if (hasOpenTurn(session.events)) {
            this.pendingIntents.set(session, { active: active, narrate: true });
            return foldPlanMode(session.events) === active ? 'cancelled' : 'queued';
        }
        // No open turn: commit now. Delete only after append succeeds so a
        // failed durable write leaves the selection retryable, not dropped.
        if (active === foldPlanMode(session.events)) {
            this.pendingIntents.delete(session);
            return 'cancelled';
        }
        session.append('plan/mode', { active: active });
        this.pendingIntents.delete(session);
        var narration = this.narration(session, active);
        if (narration !== undefined)
            agent.inject(narration);
        return 'committed';
    };
    /** Append one pending selection before the next request assembly. */
    PlanModeController.prototype.onBoundary = function (session) {
        var pending = this.pendingIntents.get(session);
        if (pending === undefined)
            return;
        var target = pending.active;
        if (target === foldPlanMode(session.events)) {
            this.pendingIntents.delete(session);
            return;
        }
        session.append('plan/mode', { active: target });
        // Delete only after append succeeds so a later accepted in-turn pre-step
        // can retry a failed durable write.
        this.pendingIntents.delete(session);
    };
    /** Build a user-switch notice when the last logged header described the other mode. */
    PlanModeController.prototype.narration = function (session, target) {
        var told = planModeAtLastHeader(session.events);
        if (told === undefined || told === target)
            return;
        var text = target
            ? 'The user switched this session to plan mode.'
            : 'The user switched this session back to the default mode.';
        return (0, dsh_llm_1.createUserMessage)({
            content: [{ type: 'text', text: text }],
            // The narration is already one sentence, so it is its own summary.
            source: { kind: 'plugin', plugin: 'plan-mode', form: 'notice', summary: text },
        });
    };
    PlanModeController.inject = ['tools', 'systemPrompt'];
    return PlanModeController;
}(cordis_1.Service));
exports.PlanModeController = PlanModeController;
exports.default = PlanModeController;
