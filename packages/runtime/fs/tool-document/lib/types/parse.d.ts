import type { DocumentKind, DocumentOptions, DocumentReadResult } from './protocol.ts';
export declare function parseDocumentBytes(bytes: Uint8Array, options: DocumentOptions): Promise<DocumentReadResult>;
export declare function classifyDocument(bytes: Uint8Array): DocumentKind;
//# sourceMappingURL=parse.d.ts.map