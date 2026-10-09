"use strict";
/** Host BFF entry and Loader shell for the Remote contribution assembly. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_REMOTE_FORWARDED_EVENTS = exports.inspectApiRemoteSession = exports.hasApiRemoteSubagentOwner = exports.createApiRemoteAgentResolver = exports.apiRemoteSubagentOwnershipError = exports.ApiRemoteSubagentSessionOwnership = exports.ApiRemoteSessionNotFound = void 0;
exports.apply = apply;
var remote_events_ts_1 = require("./remote-events.ts");
var agent_lookup_ts_1 = require("./agent-lookup.ts");
Object.defineProperty(exports, "ApiRemoteSessionNotFound", { enumerable: true, get: function () { return agent_lookup_ts_1.ApiRemoteSessionNotFound; } });
Object.defineProperty(exports, "ApiRemoteSubagentSessionOwnership", { enumerable: true, get: function () { return agent_lookup_ts_1.ApiRemoteSubagentSessionOwnership; } });
Object.defineProperty(exports, "apiRemoteSubagentOwnershipError", { enumerable: true, get: function () { return agent_lookup_ts_1.apiRemoteSubagentOwnershipError; } });
Object.defineProperty(exports, "createApiRemoteAgentResolver", { enumerable: true, get: function () { return agent_lookup_ts_1.createApiRemoteAgentResolver; } });
Object.defineProperty(exports, "hasApiRemoteSubagentOwner", { enumerable: true, get: function () { return agent_lookup_ts_1.hasApiRemoteSubagentOwner; } });
Object.defineProperty(exports, "inspectApiRemoteSession", { enumerable: true, get: function () { return agent_lookup_ts_1.inspectApiRemoteSession; } });
var remote_events_ts_2 = require("./remote-events.ts");
Object.defineProperty(exports, "API_REMOTE_FORWARDED_EVENTS", { enumerable: true, get: function () { return remote_events_ts_2.API_REMOTE_FORWARDED_EVENTS; } });
// Shape gate over the allowlist, kept in the Host face because the Host's event
// vocabulary is the authoritative one. It pins three things at compile time:
// every entry NAMES a declared event (the predicate is keyed on `keyof
// Events`), no entry BINDS a Scope (a scoped event's `ThisParameterType` is not
// `unknown`, which is how "must not depend on AgentScope" is stated statically),
// and every entry is ONE-WAY (a waterfall or bail shape returns something other
// than void and is excluded). Widening the array to an event that fails any of
// these fails here, not on the wire.
remote_events_ts_1.API_REMOTE_FORWARDED_EVENTS;
/** Host plugin body; the selected contributions mount only in Client environments. */
function apply() { }
