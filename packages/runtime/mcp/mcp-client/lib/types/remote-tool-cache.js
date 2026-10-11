/** Private, endpoint-scoped cache for remote MCP tool schemas. */
import { createHash, randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
const CACHE_SCHEMA = 1;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/;
function runtimeHome() {
    const configured = process.env.TASKWEAVER_HOME?.trim()
        || process.env.Z_HOME?.trim()
        || process.env.DSH_HOME?.trim()
        || join(homedir(), '.taskweaver', 'runtime');
    const expanded = configured === '~'
        ? homedir()
        : configured.startsWith('~/') || configured.startsWith('~\\')
            ? join(homedir(), configured.slice(2).replaceAll(sep === '/' ? '\\' : '/', sep))
            : configured;
    return resolve(expanded);
}
function endpointIdentity(url) {
    return createHash('sha256').update(url).digest('hex');
}
function cacheableTool(tool) {
    return {
        name: tool.name,
        inputSchema: tool.inputSchema,
        ...(tool.description !== undefined ? { description: tool.description } : {}),
        ...(tool.outputSchema !== undefined ? { outputSchema: tool.outputSchema } : {}),
        ...(tool.execution?.taskSupport !== undefined
            ? { execution: { taskSupport: tool.execution.taskSupport } }
            : {}),
    };
}
/**
 * A best-effort cache. Cache I/O and malformed cache files never make MCP
 * connection or tool synchronization fail.
 */
export function createRemoteToolCache(serverName, url) {
    if (!SERVER_NAME.test(serverName))
        throw new Error('MCP cache serverName is invalid');
    const directory = join(runtimeHome(), 'cache', 'mcp-tools');
    const filePath = join(directory, `${serverName}.json`);
    const endpoint = endpointIdentity(url);
    async function read() {
        try {
            const file = await lstat(filePath);
            if (!file.isFile() || file.isSymbolicLink() || file.size <= 0 || file.size > MAX_CACHE_BYTES
                || (file.mode & 0o077) !== 0)
                return null;
            const parsed = JSON.parse(await readFile(filePath, 'utf8'));
            if (!parsed || typeof parsed !== 'object')
                return null;
            const record = parsed;
            if (record.schema !== CACHE_SCHEMA || record.endpoint !== endpoint || !Array.isArray(record.tools))
                return null;
            const validated = ListToolsResultSchema.safeParse({ tools: record.tools });
            return validated.success ? validated.data.tools : null;
        }
        catch {
            return null;
        }
    }
    async function write(tools) {
        const sanitized = tools.map(cacheableTool);
        const validated = ListToolsResultSchema.safeParse({ tools: sanitized });
        if (!validated.success)
            return false;
        const content = `${JSON.stringify({ schema: CACHE_SCHEMA, endpoint, tools: validated.data.tools })}\n`;
        if (Buffer.byteLength(content, 'utf8') > MAX_CACHE_BYTES)
            return false;
        const temporaryPath = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
        try {
            await mkdir(directory, { recursive: true, mode: 0o700 });
            await chmod(directory, 0o700);
            await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
            await rename(temporaryPath, filePath);
            await chmod(filePath, 0o600);
            return true;
        }
        catch {
            await rm(temporaryPath, { force: true }).catch(() => { });
            return false;
        }
    }
    return { filePath, read, write };
}
//# sourceMappingURL=remote-tool-cache.js.map