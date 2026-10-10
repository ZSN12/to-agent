export type { ApiProxy, SessionsApi, SessionSearchItem, SessionSummary, PromptContentPart, HostApi, EventsApi, MuxFrame, HostFrame, ApprovalResponsePayload, QuestionResponsePayload, HistoryEntry, ToolEventView, DirectoryEntry, DirectoryListing, ResponseValue, WorkspaceApi, WorkspaceId, WorkspaceView, SkillsApi, SkillEntry, ModelCatalogFailure, ModelCatalogModel, ModelProviderGroup, ModelReasoning, ModelReasoningEffort, ModelSelection, QueueAction, QueuedInboxItem, SessionModels, GoalsApi, GoalRef, SettingsApi, SettingsNamespaceView, SettingsPathOpView, SettingsSecretView, CredentialsApi, CredentialView, ConfigurableProviderView, DiscoveredModelView, LlmApi, SubagentsApi, SubagentAddress, SubagentCatalog, SubagentListEntry, SubagentPromptReceipt, JobView, } from '@taskweaver/dsh-host-apiproxy/api';
export type { ToolCallView, ToolResultView } from '@taskweaver/dsh-tools/presentation';
export type { RpcRequest, RpcResponse, RpcResult, RpcError, RpcErrorCode, ClientRequest, ServerResponse, ServerRequest, ClientResponse, RpcMessage, RpcReceipt, } from '@taskweaver/dsh-host-apiproxy/api';
export { RpcId, SESSION_SEARCH_RESULT_LIMIT, transportError, } from '@taskweaver/dsh-host-apiproxy/api';
export { AbstractApiClient } from '@taskweaver/dsh-host-apiproxy/client';
export type { IApiClient } from '@taskweaver/dsh-host-apiproxy/client';
export type { SessionId, SessionEvent } from '@taskweaver/dsh-session/types';
export type { MessageId } from '@taskweaver/dsh-llm/brand';
export type { ContentBlock, StreamChunk } from '@taskweaver/dsh-llm/types';
/** Successful value returned by the connection-generation host handshake. */
export type HostDescription = import('@taskweaver/dsh-host-apiproxy/api').ResponseValue<'host.describe'>;
import type { RpcResponse, RpcResult } from '@taskweaver/dsh-host-apiproxy/api';
/**
 * Unwrap a unary response: RpcResponse<T> -> RpcResult<T> (business code only
 * cares about the result slot).
 * @param response - the unary response.
 * @returns its result slot.
 */
export declare function resultOf<T>(response: RpcResponse<T>): RpcResult<T>;
//# sourceMappingURL=api.d.ts.map