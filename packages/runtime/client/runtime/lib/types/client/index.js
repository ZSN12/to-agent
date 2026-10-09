"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.PendingWait = exports.displayFailureMessage = exports.sessionRecallLabels = exports.contextProvenance = exports.contextForm = exports.isTokenDelta = exports.emptyAssistantBlock = exports.toAssistantBlocks = exports.toAssistantBlock = exports.EMPTY_CONVERSATION_VIEWS = exports.EMPTY_CHAT_SNAPSHOT = exports.createSnapshotStore = exports.resolveWorkspacePath = exports.abbreviateHomePath = exports.WorkspaceRuntime = exports.WorkspaceCreateError = exports.DirectoryBrowseError = exports.createScope = exports.SessionProvideChannel = exports.indexSubagentDescendants = exports.workspaceTitleOf = exports.scopeOf = exports.SessionRuntime = exports.SessionCreateError = exports.conversationContextKey = exports.ConversationLocationIndex = exports.ConversationNodeAssembler = exports.ConversationViewRegistry = exports.ConversationEventRegistry = exports.isReplacementSurfaceEvent = exports.isAppendSurfaceEvent = void 0;
exports.apply = apply;
var service_ts_1 = require("./sessions/service.ts");
var service_ts_2 = require("./workspaces/service.ts");
var event_registry_ts_1 = require("./conversation/event-registry.ts");
var view_registry_ts_1 = require("./conversation/view-registry.ts");
var surface_1 = require("@z/dsh-session/surface");
Object.defineProperty(exports, "isAppendSurfaceEvent", { enumerable: true, get: function () { return surface_1.isAppendSurfaceEvent; } });
Object.defineProperty(exports, "isReplacementSurfaceEvent", { enumerable: true, get: function () { return surface_1.isReplacementSurfaceEvent; } });
var event_registry_ts_2 = require("./conversation/event-registry.ts");
Object.defineProperty(exports, "ConversationEventRegistry", { enumerable: true, get: function () { return event_registry_ts_2.ConversationEventRegistry; } });
var view_registry_ts_2 = require("./conversation/view-registry.ts");
Object.defineProperty(exports, "ConversationViewRegistry", { enumerable: true, get: function () { return view_registry_ts_2.ConversationViewRegistry; } });
var conversation_assembler_ts_1 = require("./sessions/conversation-assembler.ts");
Object.defineProperty(exports, "ConversationNodeAssembler", { enumerable: true, get: function () { return conversation_assembler_ts_1.ConversationNodeAssembler; } });
var conversation_location_index_ts_1 = require("./sessions/conversation-location-index.ts");
Object.defineProperty(exports, "ConversationLocationIndex", { enumerable: true, get: function () { return conversation_location_index_ts_1.ConversationLocationIndex; } });
var conversation_ts_1 = require("./contract/conversation.ts");
Object.defineProperty(exports, "conversationContextKey", { enumerable: true, get: function () { return conversation_ts_1.conversationContextKey; } });
var service_ts_3 = require("./sessions/service.ts");
Object.defineProperty(exports, "SessionCreateError", { enumerable: true, get: function () { return service_ts_3.SessionCreateError; } });
Object.defineProperty(exports, "SessionRuntime", { enumerable: true, get: function () { return service_ts_3.SessionRuntime; } });
Object.defineProperty(exports, "scopeOf", { enumerable: true, get: function () { return service_ts_3.scopeOf; } });
Object.defineProperty(exports, "workspaceTitleOf", { enumerable: true, get: function () { return service_ts_3.workspaceTitleOf; } });
var subagent_lineage_ts_1 = require("./sessions/subagent-lineage.ts");
Object.defineProperty(exports, "indexSubagentDescendants", { enumerable: true, get: function () { return subagent_lineage_ts_1.indexSubagentDescendants; } });
// The channel owns runtime session-data materialization.
var provide_ts_1 = require("./sessions/provide.ts");
Object.defineProperty(exports, "SessionProvideChannel", { enumerable: true, get: function () { return provide_ts_1.SessionProvideChannel; } });
var scope_ts_1 = require("./agents/scope.ts");
Object.defineProperty(exports, "createScope", { enumerable: true, get: function () { return scope_ts_1.createScope; } });
var service_ts_4 = require("./workspaces/service.ts");
Object.defineProperty(exports, "DirectoryBrowseError", { enumerable: true, get: function () { return service_ts_4.DirectoryBrowseError; } });
Object.defineProperty(exports, "WorkspaceCreateError", { enumerable: true, get: function () { return service_ts_4.WorkspaceCreateError; } });
Object.defineProperty(exports, "WorkspaceRuntime", { enumerable: true, get: function () { return service_ts_4.WorkspaceRuntime; } });
var path_ts_1 = require("./workspaces/path.ts");
Object.defineProperty(exports, "abbreviateHomePath", { enumerable: true, get: function () { return path_ts_1.abbreviateHomePath; } });
Object.defineProperty(exports, "resolveWorkspacePath", { enumerable: true, get: function () { return path_ts_1.resolveWorkspacePath; } });
// Runtime owns the data store and its observable snapshot contract.
var store_ts_1 = require("./contract/store.ts");
Object.defineProperty(exports, "createSnapshotStore", { enumerable: true, get: function () { return store_ts_1.createSnapshotStore; } });
var conversation_ts_2 = require("./sessions/conversation.ts");
Object.defineProperty(exports, "EMPTY_CHAT_SNAPSHOT", { enumerable: true, get: function () { return conversation_ts_2.EMPTY_CHAT_SNAPSHOT; } });
Object.defineProperty(exports, "EMPTY_CONVERSATION_VIEWS", { enumerable: true, get: function () { return conversation_ts_2.EMPTY_CONVERSATION_VIEWS; } });
Object.defineProperty(exports, "toAssistantBlock", { enumerable: true, get: function () { return conversation_ts_2.toAssistantBlock; } });
Object.defineProperty(exports, "toAssistantBlocks", { enumerable: true, get: function () { return conversation_ts_2.toAssistantBlocks; } });
var partial_ts_1 = require("./sessions/partial.ts");
Object.defineProperty(exports, "emptyAssistantBlock", { enumerable: true, get: function () { return partial_ts_1.emptyAssistantBlock; } });
var assistant_timing_ts_1 = require("./sessions/assistant-timing.ts");
Object.defineProperty(exports, "isTokenDelta", { enumerable: true, get: function () { return assistant_timing_ts_1.isTokenDelta; } });
var context_provenance_ts_1 = require("./sessions/context-provenance.ts");
Object.defineProperty(exports, "contextForm", { enumerable: true, get: function () { return context_provenance_ts_1.contextForm; } });
Object.defineProperty(exports, "contextProvenance", { enumerable: true, get: function () { return context_provenance_ts_1.contextProvenance; } });
Object.defineProperty(exports, "sessionRecallLabels", { enumerable: true, get: function () { return context_provenance_ts_1.sessionRecallLabels; } });
var failure_display_ts_1 = require("./sessions/failure-display.ts");
Object.defineProperty(exports, "displayFailureMessage", { enumerable: true, get: function () { return failure_display_ts_1.displayFailureMessage; } });
var pending_ts_1 = require("./sessions/pending.ts");
Object.defineProperty(exports, "PendingWait", { enumerable: true, get: function () { return pending_ts_1.PendingWait; } });
/** Required services: the wire handle and Client Typert registry. */
exports.inject = ['connection', 'typert', 'remote', 'remote.commands'];
/** Mounts the browser runtime services and connection stream.
 * @param ctx - Client Cordis context.
 */
function apply(ctx) {
    var conversation = {
        events: new event_registry_ts_1.ConversationEventRegistry(ctx),
        views: new view_registry_ts_1.ConversationViewRegistry(ctx),
    };
    var connection = ctx.get('connection');
    var sessions = new service_ts_1.SessionRuntime(ctx, connection.api, ctx.remote, conversation);
    ctx.typert.contexts.registerClient('agent', {
        identity: function (candidate) { return sessions.scopeOf(candidate); },
    });
    var workspaces = new service_ts_2.WorkspaceRuntime(ctx, connection.api, sessions);
    ctx.effect(function () { return workspaces.startInitialSelection(); }, 'runtime: initial Workspace selection');
    var loop = connection.start({
        onMuxEnvelope: function (envelope) {
            sessions.handleMuxEnvelope(envelope);
        },
        onHostEnvelope: function (envelope) {
            sessions.handleHostEnvelope(envelope);
            workspaces.handleHostEnvelope(envelope);
            // Forwarded-event bridge: the session layer ignores registry frames (no
            // session routing). This plugin owns the frame sink, so it hands the
            // decoded frame straight to the Remote service, which fans it out to
            // `ctx.remote.$on` subscribers; no consumer reads a frame.
            var frame = envelope.payload;
            if (frame.type === 'host/remote-event')
                ctx.remote.$dispatch(frame.event, frame.args);
        },
        onConnected: function () {
            sessions.handleConnected();
            workspaces.handleConnected();
            ctx.emit('connection/reset');
        },
        onStateChange: function (state) {
            // Generation death fires before any next-generation frame can arrive
            // (reconnect replays flow from stream open, ahead of onConnected):
            // the only safe moment to drop generation-scoped interaction state.
            if (state === 'reconnecting') {
                sessions.handleDisconnected();
            }
        },
    });
    ctx.effect(function () { return function () { loop.stop(); }; }, 'runtime: connection stream loop');
}
