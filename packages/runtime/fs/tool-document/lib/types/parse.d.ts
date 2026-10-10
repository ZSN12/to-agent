import type { DocumentKind, DocumentOptions, ParsedDocumentResult } from './protocol.ts';
export declare function parseDocumentBytes(bytes: Uint8Array, options: DocumentOptions): Promise<ParsedDocumentResult>;
export declare function classifyDocument(bytes: Uint8Array): DocumentKind;
//# sourceMappingURL=parse.d.ts.map