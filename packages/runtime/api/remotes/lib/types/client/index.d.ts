/** Platform-neutral assembly of generated Host Remote contributions. */
import type { Context } from '@taskweaver/cordis';
import type { TypertClientRemote } from '@taskweaver/dsh-typert-protocol';
export type { TypertClientRemote as ClientRemote } from '@taskweaver/dsh-typert-protocol';
export type { PluginInventorySnapshot } from '@taskweaver/dsh-host-plugin-inventory/types';
export type {} from '@taskweaver/dsh-commands/remote';
export type {} from '@taskweaver/dsh-file-reference/remote';
export type {} from '@taskweaver/dsh-goal/remote';
export type {} from '@taskweaver/dsh-host-plugin-inventory/remote';
export type {} from '@taskweaver/dsh-session-reference/remote';
export type { ApiRemoteForwardedEvent } from '../types.ts';
export type {} from '@taskweaver/dsh-commands/types';
export type {} from '@taskweaver/dsh-cordis-host-runner/types';
export type {} from '@taskweaver/dsh-credentials/types';
export type {} from '@taskweaver/dsh-llm/types';
export type {} from '@taskweaver/dsh-agent-presets/types';
export type {} from '@taskweaver/dsh-settings/types';
/**
 * The carrier's Client-facing types, re-exported so a business package names one
 * assembly package instead of both this facade and the Connection plugin. Type-only:
 * the carrier's runtime values stay behind their own module edge.
 */
export type { ClientResponse, ConfigurableProviderView, ConnectionHandle, ConnectionSinks, ContentBlock, CredentialView, DirectoryListing, DiscoveredModelView, HistoryEntry, HostFrame, IApiClient, MessageId, ModelCatalogFailure, ModelProviderGroup, ModelReasoningEffort, ModelSelection, MuxFrame, PromptContentPart, QuestionResponsePayload, QueueAction, RpcError, RpcId, RpcReceipt, RpcRequest, RpcResponse, RpcResult, SessionId, SessionModels, SessionSearchItem, SessionSummary, SettingsNamespaceView, SettingsPathOpView, SkillEntry, StreamChunk, SubagentAddress, SubagentCatalog, JobView, ToolCallView, ToolEventView, ToolResultView, WorkspaceId, WorkspaceView, } from '@taskweaver/dsh-client-connection/client';
export type {} from '@taskweaver/dsh-api-gateway/client';
export type {} from '@taskweaver/dsh-cordis-host-runner/remote';
export type { ApprovalRequestId, CordisHalfState, CordisDynamicPackageId, CordisDynamicPluginId, CordisDynamicPluginRunId, CordisDynamicRunMode, CordisInspectMethodManifest, CordisInspectPlatform, CordisInspectProviderManifest, CordisInspectProviderView, CordisInspectQueryRequest, CordisInspectQueryResolution, CordisInspectQueryResolved, CordisInspectRequestId, CordisInspectResolveAck, CordisRunDiagnostic, CordisRunStatus, DynamicCordisClientSource, DynamicCordisHostHalfResult, DynamicCordisInventoryRow, DynamicCordisInvokeResult, DynamicCordisPackage, DynamicCordisRequestResolved, DynamicCordisResolveAck, DynamicCordisRetracted, DynamicCordisRunRequest, DynamicCordisRunResolution, DynamicCordisRunAttempt, DynamicCordisRunResponse, DynamicCordisStopResponse, DynamicCordisUndefineReceipt, RequestRunOutcome, } from '@taskweaver/dsh-cordis-host-runner/types';
export type { JsonValue } from '@taskweaver/dsh-session/types';
export type { FileReferenceCandidate } from '@taskweaver/dsh-file-reference/types';
export type { SessionReferenceMentionCandidate } from '@taskweaver/dsh-session-reference/types';
declare module '@taskweaver/cordis' {
    interface Context {
        /** Generated Remote namespaces selected by this Client assembly. */
        remote: TypertClientRemote;
    }
}
/** Required service: the typed Client Remote contribution mount. */
export declare const inject: string[];
/**
 * Mount the Host capabilities explicitly selected for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after every selected Remote namespace is ready.
 */
export declare function apply(ctx: Context): Promise<() => Promise<void>>;
//# sourceMappingURL=index.d.ts.map