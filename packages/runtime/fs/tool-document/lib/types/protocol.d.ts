export type DocumentKind = 'pdf' | 'pptx' | 'docx' | 'xlsx';
export interface DocumentOptions {
    pages?: string;
    sheet?: string;
    range?: string;
    section?: string;
    images: boolean;
    maxOutputBytes: number;
}
export interface DocumentReadResult {
    outline?: string[];
    content: Array<{
        type: 'text';
        text: string;
    }>;
    next?: string;
    truncated: boolean;
    tokensEstimate: number;
}
export interface WorkerRequest {
    id: number;
    bytes: Uint8Array;
    options: DocumentOptions;
}
export interface WorkerResponse {
    id: number;
    result?: DocumentReadResult;
    error?: {
        message: string;
        code?: string;
    };
}
//# sourceMappingURL=protocol.d.ts.map