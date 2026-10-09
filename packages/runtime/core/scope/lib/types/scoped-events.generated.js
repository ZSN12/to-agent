"use strict";
/**
 * Generated scoped-event routing-subject resolvers for dsh-scope invariants.
 * Do not edit by hand; run `pnpm run gen-scoped-events`.
 *
 * @module @z/dsh-scope/scoped-events.generated
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scopedSubjectResolverFor = scopedSubjectResolverFor;
var scopedSubjectResolvers = Object.freeze({
    'agent/created': function (args) { return args[0]['agent']; },
    'agent/disposed': function (args) { return args[0]['agent']; },
    'agent/error': function (args) { return args[0]['agent']; },
    'agent/inbox/claimed': function (args) { return args[0]['agent']; },
    'agent/inbox/discarded': function (args) { return args[0]['agent']; },
    'agent/inbox/inserted': function (args) { return args[0]['agent']; },
    'agent/pre-step': function (args) { return args[0]['agent']; },
    'agent/request': function (args) { return args[0]['agent']; },
    'agent/request-error': function (args) { return args[0]['agent']; },
    'agent/session-start': function (args) { return args[0]['agent']; },
    'agent/status': function (args) { return args[0]['agent']; },
    'agent/turn-stopping': function (args) { return args[0]['agent']; },
    'approval/request': function (args) { return args[0]['agent']; },
    'goal/changed': function (args) { return args[0]['agent']; },
    'session/created': null,
    'session/disposed': null,
    'session/event': null,
    'session/flush': null,
    'subagent/end': null,
    'subagent/start': null,
    'system-prompt/assemble': function (args) { return args[1]['scope']; },
    'tools/code-dispatch-log': function (args) { return args[0]['agent']; },
    'tools/execute': function (args) { return args[0]['agent']; },
    'tools/post-execute': function (args) { return args[0]['agent']; },
    'tools/pre-execute': function (args) { return args[0]['agent']; },
    'tools/result': function (args) { return args[0]['agent']; },
});
/**
 * Resolve the routing key named by one scoped event payload. A null
 * resolver means the payload cannot expose its external routing key, so the
 * invariant checks carrier presence only.
 * @param event - runtime Cordis event name.
 * @returns the generated subject resolver, null for presence-only,
 *   or undefined when the event is not scope-filtered.
 */
function scopedSubjectResolverFor(event) {
    return scopedSubjectResolvers[event];
}
