/** Browser runtime services for sessions, workspaces, and connection-stream delivery. */
import type { Context } from '@z/cordis';
import type { SessionId } from '@z/dsh-api-remotes/client';
import type { TypertContext } from '@z/dsh-typert-protocol';
export { isAppendSurfaceEvent, isReplacementSurfaceEvent } from '@z/dsh-session/surface';
export { ConversationEventRegistry } from './conversation/event-registry.ts';
export { ConversationViewRegistry } from './conversation/view-registry.ts';
export { ConversationNodeAssembler } from './sessions/conversation-assembler.ts';
export { ConversationLocationIndex } from './sessions/conversation-location-index.ts';
export { conversationContextKey } from './contract/conversation.ts';
export type { ChatConversationViewNode, ConversationContextReader, ConversationEventInput, ConversationLocationData, ConversationLocationDataScope, ConversationLocationDataStore, ConversationStepDataMap, ConversationLocation, ConversationMatch, ConversationMatchResult, ConversationNodeContext, ConversationNodeDefinition, ConversationPreviousContext, ConversationPublication, ConversationTimelineSnapshot, ConversationTurnDataMap, ConversationViewBuilder, ConversationViewDefinition, ConversationViewNode, ConversationViewSnapshotMap, ConversationViewSnapshotStore, StepLocation, TurnLocation, } from './contract/conversation.ts';
export type { ConversationRuntime } from './sessions/conversation-assembler.ts';
export { SessionCreateError, SessionRuntime, scopeOf, workspaceTitleOf } from './sessions/service.ts';
export { indexSubagentDescendants } from './sessions/subagent-lineage.ts';
export type { SubagentDescendantSummary } from './sessions/subagent-lineage.ts';
export { SessionProvideChannel } from './sessions/provide.ts';
export type { SessionProvideChannelHost } from './sessions/provide.ts';
export { createScope } from './agents/scope.ts';
export type { AgentScopeHandle } from './agents/scope.ts';
export { DirectoryBrowseError, WorkspaceCreateError, WorkspaceRuntime } from './workspaces/service.ts';
export { abbreviateHomePath, resolveWorkspacePath } from './workspaces/path.ts';
export type { SettingsScope, SettingsScopeSnapshot, SettingsScopeSpec, } from './contract/settings-scope.ts';
export type { Session } from './sessions/session.ts';
export type { ISession, ProjectionsFace, SessionFace } from './contract/session.ts';
export type { AgentContext, ISessions } from './contract/sessions.ts';
export type { IWorkspaces } from './contract/workspaces.ts';
export type { SessionBinding, SessionListState, SessionProvideContribution, SessionProvideDescriptor, SessionSummary, } from './sessions/service.ts';
export type { SessionListPhase, SessionSearchResultItem, SubagentCatalogSnapshot } from './sessions/manager.ts';
export type { SubagentAddress, JobView } from '@z/dsh-client-connection/client';
export type { WorkspaceListPhase } from './workspaces/manager.ts';
export type { WorkspaceListState } from './workspaces/service.ts';
export type { DirectoryEntry, DirectoryListing, WorkspaceId, WorkspaceView, } from '@z/dsh-client-connection/client';
export { createSnapshotStore } from './contract/store.ts';
export type { ObservableSnapshot, SnapshotStore } from './contract/store.ts';
export type { SessionMaybeProvideInfo, SessionProvideInfo } from './contract/session-provide.ts';
export type { AssistantBlock, AssistantMessageNode, AssistantProvenanceView, AssistantRequestConfig, AssistantTiming, ChatLocationNodeIndex, ChatNodeStore, ChatSnapshot, CommandNode, CompactionSummaryNode, ComposerPhase, ContextMessageNode, ConversationNode, ConversationSnapshot, ModelRetryNode, QueuedMessage, LegacyConversationSlice, PartialAssistant, RunningToolCall, SteeringMessageNode, TodoItem, ToolCallBlock, ToolResultNode, TurnErrorNode, TurnMaxTokensNode, UnknownSurfaceNode, UserMessageNode, } from './sessions/conversation.ts';
export { EMPTY_CHAT_SNAPSHOT, EMPTY_CONVERSATION_VIEWS, toAssistantBlock, toAssistantBlocks, } from './sessions/conversation.ts';
export { emptyAssistantBlock } from './sessions/partial.ts';
export { isTokenDelta } from './sessions/assistant-timing.ts';
export { contextForm, contextProvenance, sessionRecallLabels } from './sessions/context-provenance.ts';
export { displayFailureMessage } from './sessions/failure-display.ts';
export type { ConversationContext, ConversationContextOriginKind, } from './sessions/conversation-context.ts';
export type { ContextProvenanceView, ContextRole, KnownContextForm, } from './sessions/context-provenance.ts';
export type { ConversationPromptSnapshot, RequestInspectionSnapshot, RequestPromptChange, RequestView, } from './sessions/request-inspection.ts';
export { PendingWait } from './sessions/pending.ts';
export type { PendingInteraction, PendingInteractionStatus, PendingKind, PendingPayloads, } from './sessions/pending.ts';
export type { ProjectionsBaseline, ProjectionValueStore, SessionProjectionMap, UseProjection, } from './sessions/projection-store.ts';
export type { SessionId } from '@z/dsh-client-connection/client';
/** Client-side Cordis context after declaration merging. */
export type ClientContext = Context;
declare module '@z/dsh-typert-protocol' {
    interface TypertContextMap {
        /** Client Agent scope identity; the agent and session share one wire id. */
        agent: TypertContext<SessionId>;
    }
}
declare module '@z/cordis' {
    interface Events {
        /**
         * A connection generation was (re-)established. Wire-derived caches must
         * treat their state as stale and repull (commands directory; the queue
         * mirrors reset themselves through the session resync path).
         * @mode emit
         */
        'connection/reset'(): void;
    }
    interface Context {
        /** Event-to-business-Context Definition registry. */
        conversationEvents: import('./conversation/event-registry.ts').ConversationEventRegistry;
        /** Per-target Conversation snapshot builder registry. */
        conversationViews: import('./conversation/view-registry.ts').ConversationViewRegistry;
        /** The outward face only; the concrete service stays inside the runtime. */
        sessions: import('./contract/sessions.ts').ISessions;
        /** The outward face only; the concrete service stays inside the runtime. */
        workspaces: import('./contract/workspaces.ts').IWorkspaces;
    }
}
/** Required services: the wire handle and Client Typert registry. */
export declare const inject: string[];
/** Mounts the browser runtime services and connection stream.
 * @param ctx - Client Cordis context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map