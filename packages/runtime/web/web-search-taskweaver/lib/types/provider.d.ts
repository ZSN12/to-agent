import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@z/dsh-web';
/** Search provider using only configuration injected by Electron at Host startup. */
export declare class TaskWeaverSearchProvider implements WebSearchProvider {
    readonly id = "taskweaver-baidu";
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
//# sourceMappingURL=provider.d.ts.map