"use strict";
/**
 * Model-facing `get_goal`, `create_goal`, and `update_goal` tools over the
 * persisted same-session goal domain.
 * @module @z/dsh-tool-goal
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_goal_1 = require("@z/dsh-goal");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_tools_1 = require("@z/dsh-tools");
var authority_ts_1 = require("./authority.ts");
var wrapup_ts_1 = require("./wrapup.ts");
exports.name = 'tool-goal';
exports.inject = ['agents', 'goals', 'tools', 'systemPrompt'];
/** Schemastery config for the goal-tool policy. */
exports.Config = schemastery_1.default.object({
    blockedAfterConsecutiveRounds: schemastery_1.default.number().step(1).min(1).default(3),
});
var UPDATE_ACTIONS = ['edit', 'pause', 'resume', 'complete', 'blocked'];
var CREATE_DESCRIPTION = 'Create one persisted same-session completion goal when the current direct human request '
    + 'is a long-running objective that should continue across autonomous goal rounds. You may '
    + 'infer that intent without requiring the user to say "create a goal". Do not use this for '
    + 'trivial single-turn work. Execution rejects non-human and subagent authority.';
var GET_DESCRIPTION = 'Read the current same-session goal, including its exact id/revision, objective, phase, completed '
    + 'continuation rounds, round limit, blocker reason when present, and whether another continuation is armed. '
    + 'Call this before updating a goal.';
var GOAL_VALUE_SCHEMA = {
    oneOf: [
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                goal: { type: 'null', required: true },
            },
        },
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                goal: {
                    type: 'object',
                    additionalProperties: false,
                    required: true,
                    properties: {
                        id: { type: 'string', required: true },
                        revision: { type: 'integer', required: true },
                        objective: { type: 'string', required: true },
                        phase: { type: 'string', required: true, enum: ['active', 'paused', 'blocked', 'complete'] },
                        roundsStarted: { type: 'integer', required: true },
                        maxGoalRounds: { type: 'integer', required: true },
                        blockedReason: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                code: { type: 'string', required: true },
                                message: { type: 'string', required: true },
                            },
                        },
                    },
                },
                activation: { type: 'string', required: true, enum: ['armed', 'disarmed'] },
            },
        },
    ],
};
/** Render policy guidance with its deployment-selected blocked threshold. */
function guidance(blockedAfter) {
    return 'Use goal tools for one long-running completion objective in the current session. '
        + 'create_goal may infer goal intent from a direct human request in any language; do not '
        + 'create a goal for routine single-turn work. Call get_goal before update_goal and copy its '
        + 'exact goal_id and revision. After session resume or fork, an active goal is disarmed: when '
        + 'a human asks to continue or resume in any wording or language, use update_goal action '
        + 'resume to rearm it. Mark complete only when the objective is actually achieved. Mark '
        + "blocked only after the same blocking condition persists for at least ".concat(blockedAfter, " ")
        + 'consecutive goal rounds, and report that concrete condition in blocked_reason; difficulty, uncertainty, '
        + 'or useful remaining work is not blocked.';
}
/** Validate config even when apply is called directly outside Loader normalization. */
function resolveConfig(config) {
    var _a;
    var blockedAfter = (_a = config.blockedAfterConsecutiveRounds) !== null && _a !== void 0 ? _a : 3;
    if (!Number.isSafeInteger(blockedAfter) || blockedAfter < 1) {
        throw new TypeError('blockedAfterConsecutiveRounds must be a positive safe integer');
    }
    return { blockedAfterConsecutiveRounds: blockedAfter };
}
/** Whether optional text is meaningful rather than a strict-schema empty filler. */
function hasText(value) {
    return value !== undefined && value !== '';
}
/** Whether an optional round cap is meaningful rather than a strict-schema zero filler. */
function hasRoundCap(value) {
    return value !== undefined && value !== 0;
}
/** Build the exact compare-and-set ref from model arguments. */
function goalRef(goalId, revision) {
    if (goalId.length === 0 || goalId !== goalId.trim()
        || !Number.isSafeInteger(revision) || revision < 1) {
        throw new dsh_llm_1.HarnessError('goal_id must be non-empty and revision must be a positive safe integer', 'GOAL_TOOL_INVALID_UPDATE');
    }
    return { id: (0, dsh_goal_1.GoalId)(goalId), revision: revision };
}
/** Stable compact model result; activation is an observation, not replay state. */
function goalValue(goal) {
    if (goal === undefined)
        return { goal: null };
    return {
        goal: __assign({ id: goal.id, revision: goal.revision, objective: goal.objective, phase: goal.phase, roundsStarted: goal.roundsStarted, maxGoalRounds: goal.maxGoalRounds }, goal.blockedReason === undefined ? {} : {
            blockedReason: { code: goal.blockedReason.code, message: goal.blockedReason.message },
        }),
        activation: goal.activation,
    };
}
/** Reusable canonical output declaration for all three goal controls. */
var GOAL_OUTPUT = {
    schema: GOAL_VALUE_SCHEMA,
    render: function (_args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
};
/** Generic, args-only pending presentation shared by the goal tools. */
function present(title, kind, rawInput) {
    return __assign({ card: 'generic', title: title, kind: kind }, rawInput === undefined ? {} : { rawInput: rawInput });
}
/** Register the three Codex-shaped goal tools and their shared policy section. */
function apply(ctx, config) {
    var resolved = resolveConfig(config);
    ctx.systemPrompt.section({
        name: 'tool:goal',
        order: 114,
        text: guidance(resolved.blockedAfterConsecutiveRounds),
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'get_goal',
        description: GET_DESCRIPTION,
        parameters: {},
        output: GOAL_OUTPUT,
        execute: function (_args, exec) {
            var execution = (0, authority_ts_1.goalToolExecution)(ctx, exec);
            return Promise.resolve(goalValue(ctx.goals.get(execution.agent)));
        },
        presentCall: function () { return present('Read current goal', 'read'); },
    }));
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'create_goal',
        description: CREATE_DESCRIPTION,
        parameters: {
            objective: {
                type: 'string',
                required: true,
                description: 'The concrete completion objective inferred from the direct human request.',
            },
            max_goal_rounds: {
                type: 'number',
                description: 'Optional positive safe-integer limit on automatic continuation rounds.',
            },
        },
        output: GOAL_OUTPUT,
        execute: function (args, exec) {
            var execution = (0, authority_ts_1.goalToolExecution)(ctx, exec);
            (0, authority_ts_1.requireDirectHuman)(ctx, execution);
            var goal = ctx.goals.create(execution.agent, __assign({ objective: args.objective }, args.max_goal_rounds === undefined ? {} : { maxGoalRounds: args.max_goal_rounds }));
            return Promise.resolve(goalValue(goal));
        },
        presentCall: function (args) { return present('Create goal', 'other', args.objective); },
    }));
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'update_goal',
        description: 'Update the exact current goal revision. edit, pause, and resume require a direct '
            + 'top-level human request. During an automatic continuation of the current goal, complete '
            + 'and blocked are also allowed. blocked is rejected before the configured minimum round count; the model remains '
            + 'responsible for judging that the same condition persisted across those rounds and must explain it in blocked_reason.',
        parameters: {
            goal_id: { type: 'string', required: true, description: 'Exact id returned by get_goal.' },
            revision: { type: 'number', required: true, description: 'Exact positive revision returned by get_goal.' },
            action: {
                type: 'string',
                required: true,
                enum: UPDATE_ACTIONS,
                description: 'edit | pause | resume | complete | blocked',
            },
            objective: { type: 'string', description: 'Replacement objective; valid only with action edit.' },
            max_goal_rounds: { type: 'number', description: 'Replacement cap; valid only with action edit.' },
            blocked_reason: {
                type: 'string',
                description: 'Concrete blocking condition; required only with action blocked.',
            },
        },
        output: GOAL_OUTPUT,
        execute: function (args, exec) {
            var execution = (0, authority_ts_1.goalToolExecution)(ctx, exec);
            var ref = goalRef(args.goal_id, args.revision);
            var replacements = __assign(__assign({}, hasText(args.objective) ? { objective: args.objective } : {}), hasRoundCap(args.max_goal_rounds) ? { maxGoalRounds: args.max_goal_rounds } : {});
            if (args.action === 'edit') {
                (0, authority_ts_1.requireDirectHuman)(ctx, execution);
                if (hasText(args.blocked_reason)) {
                    throw new dsh_llm_1.HarnessError('blocked_reason is valid only with action blocked', 'GOAL_TOOL_INVALID_UPDATE');
                }
                var goal_1 = ctx.goals.edit(execution.agent, ref, replacements);
                return Promise.resolve(goalValue(goal_1));
            }
            if (args.action === 'pause' || args.action === 'resume') {
                (0, authority_ts_1.requireDirectHuman)(ctx, execution);
                if (hasText(args.objective) || hasRoundCap(args.max_goal_rounds) || hasText(args.blocked_reason)) {
                    throw new dsh_llm_1.HarnessError('objective and max_goal_rounds are valid only with action edit; blocked_reason is valid only with action blocked', 'GOAL_TOOL_INVALID_UPDATE');
                }
                var goal_2 = args.action === 'pause'
                    ? ctx.goals.pause(execution.agent, ref)
                    : ctx.goals.resume(execution.agent, ref);
                return Promise.resolve(goalValue(goal_2));
            }
            var authority = (0, authority_ts_1.completionAuthority)(ctx, execution);
            if (hasText(args.objective) || hasRoundCap(args.max_goal_rounds)) {
                throw new dsh_llm_1.HarnessError('objective and max_goal_rounds are valid only with action edit', 'GOAL_TOOL_INVALID_UPDATE');
            }
            if (args.action === 'complete' && hasText(args.blocked_reason)) {
                throw new dsh_llm_1.HarnessError('blocked_reason is valid only with action blocked', 'GOAL_TOOL_INVALID_UPDATE');
            }
            if (args.action === 'blocked'
                && (args.blocked_reason === undefined || args.blocked_reason.trim().length === 0)) {
                throw new dsh_llm_1.HarnessError('blocked_reason is required with action blocked', 'GOAL_TOOL_INVALID_UPDATE');
            }
            if (args.action === 'blocked' && authority.kind === 'goal-round'
                && authority.goal.roundsStarted < resolved.blockedAfterConsecutiveRounds) {
                throw new dsh_llm_1.HarnessError("blocked requires at least ".concat(resolved.blockedAfterConsecutiveRounds, " consecutive goal rounds; ")
                    + "current round is ".concat(authority.goal.roundsStarted), 'GOAL_TOOL_BLOCK_THRESHOLD');
            }
            var goal = args.action === 'complete'
                ? ctx.goals.complete(execution.agent, ref)
                : ctx.goals.block(execution.agent, ref, {
                    code: 'model-reported',
                    message: args.blocked_reason,
                });
            if (authority.kind === 'goal-round') {
                exec.deferContext((0, dsh_llm_1.createUserMessage)({
                    content: args.action === 'complete'
                        ? (0, wrapup_ts_1.renderWrapupContext)(goal.objective)
                        : (0, wrapup_ts_1.renderWrapupContext)(goal.objective, args.blocked_reason),
                    source: {
                        kind: 'plugin',
                        plugin: 'tool-goal',
                        form: 'notice',
                        summary: (0, dsh_llm_1.boundContextSummary)("".concat(args.action, ": ").concat(goal.objective)),
                    },
                }));
            }
            return Promise.resolve(goalValue(goal));
        },
        presentCall: function (args) { return present("".concat(args.action === 'blocked' ? 'Mark' : args.action.charAt(0).toUpperCase() + args.action.slice(1), " goal"), 'other', hasText(args.blocked_reason)
            ? args.blocked_reason
            : hasText(args.objective)
                ? args.objective
                : hasRoundCap(args.max_goal_rounds) ? args.max_goal_rounds : args.goal_id); },
    }));
}
