"use strict";
/**
 * Human-facing `/goal` command over the persisted same-session goal domain.
 * @module @z/dsh-command-goal
 */
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
var dsh_goal_1 = require("@z/dsh-goal");
var dsh_llm_1 = require("@z/dsh-llm");
exports.name = 'command-goal';
exports.inject = ['commands', 'goals'];
var USAGE = 'Usage: /goal [<objective>|clear|edit <objective>|pause|resume]';
/** Fail loudly if a locally closed union gains an unhandled member. */
/* v8 ignore start -- closed-union backstop is unreachable without violating the TypeScript contract */
function assertNever(value, label) {
    throw new TypeError("unknown ".concat(label, ": ").concat(String(value)));
}
/* v8 ignore stop */
/** Parse only the grammar owned by `/goal`; arbitrary other input is an objective. */
function parseGoalCommand(rawInput) {
    var input = rawInput.trim();
    if (input.length === 0)
        return { kind: 'show' };
    var control = input.toLowerCase();
    if (control === 'clear')
        return { kind: 'clear' };
    if (control === 'pause')
        return { kind: 'pause' };
    if (control === 'resume')
        return { kind: 'resume' };
    if (control === 'edit')
        return { kind: 'invalid-edit' };
    if (/^edit(?=\s)/iu.test(input))
        return { kind: 'edit', objective: input.slice(4).trim() };
    return { kind: 'create', objective: input };
}
/** Human label for one durable goal phase. */
function phaseLabel(phase) {
    switch (phase) {
        case 'active': return 'active';
        case 'paused': return 'paused';
        case 'blocked': return 'blocked';
        case 'complete': return 'complete';
        /* v8 ignore next 2 -- GoalPhase is closed and every member is handled above */
        default: return assertNever(phase, 'goal phase');
    }
}
/** Commands that are meaningful from one exact live state. */
function commandHint(goal) {
    if (goal.phase === 'active') {
        return goal.activation === 'armed'
            ? '/goal edit <objective>, /goal pause, /goal clear'
            : '/goal edit <objective>, /goal resume, /goal clear';
    }
    switch (goal.phase) {
        case 'paused':
        case 'blocked':
            return '/goal edit <objective>, /goal resume, /goal clear';
        case 'complete':
            return '/goal <objective>, /goal clear';
        /* v8 ignore next 2 -- the active branch and every non-active phase are handled above */
        default: return assertNever(goal.phase, 'goal phase');
    }
}
/** Render direct UI output without exposing compare-and-set internals. */
function renderGoal(title, goal) {
    var reason = goal.phase === 'blocked' ? goal.blockedReason : undefined;
    /* v8 ignore next -- durable replay guarantees every blocked goal carries its validated reason */
    if (goal.phase === 'blocked' && reason === undefined)
        throw new TypeError('blocked goal is missing its reason');
    var blocker = reason === undefined ? [] : ["Blocker: ".concat(reason.code, ": ").concat(reason.message)];
    return {
        kind: 'success',
        text: __spreadArray(__spreadArray([
            title,
            "Status: ".concat(phaseLabel(goal.phase))
        ], blocker, true), [
            "Objective: ".concat(goal.objective),
            "Rounds: ".concat(goal.roundsStarted, "/").concat(goal.maxGoalRounds),
            "Activation: ".concat(goal.activation),
            '',
            "Commands: ".concat(commandHint(goal)),
        ], false).join('\n'),
    };
}
/** Exact current compare-and-set ref. */
function goalRef(goal) {
    return { id: goal.id, revision: goal.revision };
}
/** Direct error for an operation that requires a current goal. */
function missingGoal(action) {
    return {
        kind: 'error',
        text: "No goal is currently set; /goal ".concat(action, " requires one. ").concat(USAGE),
    };
}
/**
 * Submit the invocation's admitted composer images as one model-visible user
 * message ahead of the goal's next round. The images precede a fixed text
 * block naming their role, so a later goal round reads them from ordinary
 * session history without the goal domain storing attachment state.
 */
function submitObjectiveAttachments(invocation) {
    if (invocation.attachments.length === 0)
        return;
    invocation.agent.followup((0, dsh_llm_1.createUserMessage)({
        content: __spreadArray(__spreadArray([], invocation.attachments, true), [{ type: 'text', text: 'Reference images for the goal objective.' }], false),
        source: { kind: 'user' },
    }));
}
/** Execute one parsed human command through the domain that owns persistence. */
function executeGoalCommand(ctx, invocation) {
    var command = parseGoalCommand(invocation.rawInput);
    if (invocation.attachments.length > 0 && command.kind !== 'create' && command.kind !== 'edit') {
        return {
            kind: 'error',
            text: 'Image attachments only accompany a goal objective: /goal <objective> or /goal edit <objective>.',
        };
    }
    try {
        var current = ctx.goals.get(invocation.agent);
        switch (command.kind) {
            case 'show':
                return current === undefined
                    ? { kind: 'success', text: "No goal is currently set.\n".concat(USAGE) }
                    : renderGoal('Goal', current);
            case 'invalid-edit':
                return { kind: 'error', text: "Goal editing requires a replacement objective.\n".concat(USAGE) };
            case 'create': {
                if (current !== undefined && current.phase !== 'complete') {
                    return {
                        kind: 'error',
                        text: "A goal is already ".concat(phaseLabel(current.phase), ". Use /goal edit <objective> to change it or /goal clear before replacing it."),
                    };
                }
                var created = ctx.goals.create(invocation.agent, { objective: command.objective });
                submitObjectiveAttachments(invocation);
                return renderGoal('Goal created', created);
            }
            case 'edit': {
                if (current === undefined)
                    return missingGoal('edit');
                if (current.phase === 'complete') {
                    var replaced = ctx.goals.create(invocation.agent, { objective: command.objective });
                    submitObjectiveAttachments(invocation);
                    return renderGoal('Goal created', replaced);
                }
                var edited = ctx.goals.edit(invocation.agent, goalRef(current), { objective: command.objective });
                submitObjectiveAttachments(invocation);
                return renderGoal('Goal updated', edited);
            }
            case 'pause':
                if (current === undefined)
                    return missingGoal('pause');
                return renderGoal('Goal paused', ctx.goals.pause(invocation.agent, goalRef(current)));
            case 'resume':
                if (current === undefined)
                    return missingGoal('resume');
                return renderGoal('Goal resumed', ctx.goals.resume(invocation.agent, goalRef(current)));
            case 'clear':
                if (current === undefined)
                    return { kind: 'success', text: 'No goal to clear.' };
                ctx.goals.clear(invocation.agent, goalRef(current));
                return { kind: 'success', text: 'Goal cleared.' };
            /* v8 ignore next 2 -- GoalCommand is closed and every member is handled above */
            default: return assertNever(command, 'goal command');
        }
    }
    catch (error) {
        if (error instanceof dsh_goal_1.GoalError) {
            return {
                kind: 'error',
                text: 'The goal command is not valid for the current state. Run /goal to view available commands.',
            };
        }
        throw error;
    }
}
/** Register the Codex-shaped `/goal` command for every composed command adapter. */
function apply(ctx) {
    ctx.commands.register({
        name: 'goal',
        description: 'set or view the goal for a long-running task',
        input: { hint: '[<objective>|clear|edit <objective>|pause|resume]', images: true },
        handler: function (invocation) { return executeGoalCommand(ctx, invocation); },
    });
}
