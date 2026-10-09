/**
 * Authorization domain contract: a UI-agnostic view of DSH's registered
 * credential flows, plus the request/answer/cancel lifecycle needed by a
 * desktop surface. Secrets are never included in flow or prompt events.
 */
import type { RpcRequest, RpcResponse } from './rpc.ts';
export interface AuthorizationMethod {
    id: string;
    label: string;
}
export interface AuthorizationNotice {
    message: string;
    url?: string;
    code?: string;
}
export type AuthorizationPrompt = {
    kind: 'text' | 'secret';
    message: string;
    placeholder?: string;
} | {
    kind: 'select';
    message: string;
    options: readonly {
        id: string;
        label: string;
        description?: string;
    }[];
};
export interface AuthorizationFlowView {
    key: string;
    label: string;
    methods: AuthorizationMethod[];
    inFlight: boolean;
    configured: boolean;
}
export interface AuthorizationApi {
    list(request: RpcRequest<{}>): Promise<RpcResponse<{
        flows: AuthorizationFlowView[];
    }>>;
    begin(request: RpcRequest<{
        attemptId: string;
        key: string;
        method?: string;
    }>, signal?: AbortSignal): Promise<RpcResponse<{
        status: 'authorized' | 'cancelled';
    }>>;
    cancel(request: RpcRequest<{
        key: string;
        attemptId?: string;
    }>): Promise<RpcResponse<{
        cancelled: boolean;
    }>>;
    answer(request: RpcRequest<{
        attemptId: string;
        promptId: string;
        answer?: string;
        declined?: boolean;
    }>): Promise<RpcResponse<{
        accepted: boolean;
    }>>;
    logout(request: RpcRequest<{
        key: string;
    }>): Promise<RpcResponse<{}>>;
}
export type AuthorizationNoticeView = AuthorizationNotice;
export type AuthorizationPromptView = Omit<AuthorizationPrompt, 'signal'>;
//# sourceMappingURL=authorization.d.ts.map