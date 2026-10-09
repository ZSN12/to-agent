import type { CodeChunk } from './types';
export declare class CodeChunker {
    chunk(file: string, content: string, language: string): Promise<CodeChunk[]>;
    private chunkJavaScript;
    private chunkPython;
    private chunkGeneric;
    private extractComments;
    private extractImports;
}
//# sourceMappingURL=chunker.d.ts.map