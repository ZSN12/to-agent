import type { Tool } from '@modelcontextprotocol/sdk/types.js';
/**
 * A best-effort cache. Cache I/O and malformed cache files never make MCP
 * connection or tool synchronization fail.
 */
export declare function createRemoteToolCache(serverName: string, url: string): {
    filePath: string;
    read: () => Promise<Tool[] | null>;
    write: (tools: readonly Tool[]) => Promise<boolean>;
};
//# sourceMappingURL=remote-tool-cache.d.ts.map