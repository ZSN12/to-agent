"use strict";
/**
 * Model-facing whole-list replacement. Each call appends a `todo/write` snapshot to the calling
 * agent's session; replay is last-write-wins, and UIs render from session events. A non-agent
 * caller has no owning list and is rejected. Named exports preserve loader injection metadata.
 * @module @z/dsh-tool-todo
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
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var zod_1 = require("zod");
var dsh_tools_1 = require("@z/dsh-tools");
exports.name = 'tool-todo';
exports.inject = ['tools'];
/** The valid {@link TodoItem} statuses, as a runtime set for input narrowing. */
var STATUSES = ['pending', 'in_progress', 'completed'];
/** Schemastery configuration for the todo tool consumer. */
exports.Config = schemastery_1.default.object({
    allowParallelInProgress: schemastery_1.default.boolean().required(),
});
var DESCRIPTION_HEAD = 'Record and update a structured task list for the current work. Send the ENTIRE '
    + 'list every call — it REPLACES the previous list (there are no partial updates, '
    + 'no per-item edits). Use it to plan multi-step work and show progress: add one '
    + 'todo per concrete step before you start. ';
var DESCRIPTION_PARALLEL = 'Mark every todo being actively worked '
    + 'on `in_progress` — several at once when work genuinely runs in parallel (e.g. '
    + 'concurrent subagents or background commands), one for sequential work; while '
    + 'work remains, at least one task should be `in_progress`. ';
var DESCRIPTION_SINGLE = 'Keep AT MOST ONE todo `in_progress` at a '
    + 'time; while work remains, exactly one active task should be `in_progress`. ';
var DESCRIPTION_TAIL = 'Mark a todo '
    + '`completed` the moment it is done (do not batch completions), and allow no '
    + '`in_progress` item only once all work is complete. Skip the list for trivial '
    + 'single-step tasks. Statuses: `pending` (not started), `in_progress` (being '
    + 'worked on now), `completed` (finished).';
/**
 * The model-facing description for one activation. The active-status clause is the only part that
 * varies, because it is the only instruction the parallel policy changes.
 * @param allowParallel - whether several todos may be `in_progress` at once.
 * @returns the composed tool description.
 */
function describe(allowParallel) {
    return DESCRIPTION_HEAD
        + (allowParallel ? DESCRIPTION_PARALLEL : DESCRIPTION_SINGLE)
        + DESCRIPTION_TAIL;
}
/**
 * Validate the value constraints the ParameterSchemaSpec can't express and build the canonical {@link
 * TodoItem}[]: trimmed non-empty unique content, and at most one `in_progress` item unless the
 * deployment allows parallel work. The registry has already enforced the status enum and rejected
 * unknown item keys (`additionalProperties: false` — the logged snapshot must equal what the model
 * believes it wrote, so a nested/extended item shape fails loud at the schema boundary instead of
 * silently flattening); the cast below records that guarantee.
 * @param raw - the model-supplied list, already schema-checked.
 * @param allowParallel - whether several items may be `in_progress` at once.
 * @returns the canonical list.
 */
function toTodoList(raw, allowParallel) {
    var todos = [];
    var seen = new Set();
    var active = 0;
    for (var _i = 0, raw_1 = raw; _i < raw_1.length; _i++) {
        var item = raw_1[_i];
        var content = item.content.trim();
        if (content.length === 0) {
            throw new Error('invalid todo: `content` must be a non-empty string');
        }
        if (seen.has(content)) {
            throw new Error("invalid todos: duplicate content ".concat(JSON.stringify(content)));
        }
        seen.add(content);
        if (item.status === 'in_progress')
            active++;
        todos.push({ content: content, status: item.status });
    }
    if (!allowParallel && active > 1) {
        throw new Error("invalid todos: at most one task may be in_progress (got ".concat(active, ")"));
    }
    return todos;
}
/** Wire payload schema of the `todos` projection (whole list or pre-first-write null). */
var todosProjectionSchema = zod_1.z.union([
    zod_1.z.array(zod_1.z.object({
        content: zod_1.z.string(),
        status: zod_1.z.union([zod_1.z.literal('pending'), zod_1.z.literal('in_progress'), zod_1.z.literal('completed')]),
    })),
    zod_1.z.null(),
]);
/**
 * Register the `todo_write` tool on `ctx.tools` and, when the session-projection seam is composed,
 * the `todos` unit.
 * @param ctx - registrant context carrying the tool registry.
 * @param config - deployment's explicit todo policy.
 */
function apply(ctx, config) {
    var allowParallel = config.allowParallelInProgress;
    // The unit child activates only when a projection registry is composed
    // (headless assemblies without the seam stay unaffected). Standing-plan fold:
    // latest whole todo/write list, cleared by the next turn/start (turn/end keeps
    // the finished checklist visible); null before the first write or after a
    // later turn begins; every other event returns the same state reference.
    ctx.inject(['sessionProjections'], function (projectionCtx) {
        projectionCtx.sessionProjections.register({
            key: 'todos',
            stateSchema: todosProjectionSchema,
            init: function () { return null; },
            apply: function (state, event) {
                if (event.type === 'todo/write')
                    return event.data.todos;
                if (event.type === 'turn/start')
                    return null;
                return state;
            },
            wire: { viewSchema: todosProjectionSchema, view: function (state) { return state; } },
            stateVersion: 2,
        });
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'todo_write',
        description: describe(allowParallel),
        parameters: {
            todos: {
                type: 'array',
                required: true,
                description: 'The COMPLETE task list, replacing any previous list.',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        content: { type: 'string', required: true, description: 'What the task is — a short imperative line.' },
                        status: {
                            type: 'string',
                            required: true,
                            enum: __spreadArray([], STATUSES, true),
                            description: 'pending (not started) | in_progress (now) | completed (done).',
                        },
                    },
                },
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    todos: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                content: { type: 'string', required: true },
                                status: { type: 'string', required: true, enum: __spreadArray([], STATUSES, true) },
                            },
                        },
                    },
                    counts: {
                        type: 'object',
                        additionalProperties: false,
                        required: true,
                        properties: {
                            pending: { type: 'integer', required: true },
                            inProgress: { type: 'integer', required: true },
                            completed: { type: 'integer', required: true },
                        },
                    },
                },
            },
            render: function (_args, value) { return [{
                    type: 'text',
                    text: "Updated todo list: ".concat(value.counts.pending, " pending, ").concat(value.counts.inProgress, " in progress, ").concat(value.counts.completed, " completed."),
                }]; },
        },
        execute: function (args, exec) {
            var todos = toTodoList(args.todos, allowParallel);
            if (!exec.agent) {
                // The list is per-agent-session state; a non-agent caller (no owning
                // session) has nowhere to write it. Reject rather than silently no-op.
                throw new Error('todo_write requires an owning agent session');
            }
            exec.agent.session.append('todo/write', { todos: todos });
            var count = function (status) { return todos.filter(function (t) { return t.status === status; }).length; };
            return Promise.resolve({
                todos: todos.map(function (todo) { return ({ content: todo.content, status: todo.status }); }),
                counts: {
                    pending: count('pending'),
                    inProgress: count('in_progress'),
                    completed: count('completed'),
                },
            });
        },
        presentCall: function (args) { return ({ card: 'generic', title: 'Update todo list', kind: 'other', rawInput: args.todos }); },
    }));
}
