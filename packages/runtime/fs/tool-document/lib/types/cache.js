import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, rm, stat, lstat, utimes, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
export const DOCUMENT_PARSER_VERSION = 'taskweaver-document-parser-v3';
export const DEFAULT_DOCUMENT_CACHE_BYTES = 200 * 1024 * 1024;
const MAX_CACHED_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CACHE_ENTRY_BYTES = 40 * 1024 * 1024;
const CACHE_ENTRY_VERSION = 1;
export function documentCacheKey(bytes, options) {
    return createHash('sha256')
        .update(bytes)
        .update('\0' + DOCUMENT_PARSER_VERSION + '\0' + JSON.stringify(options))
        .digest('hex');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function decodeResult(value) {
    if (!isRecord(value) || !Array.isArray(value.content) || typeof value.truncated !== 'boolean'
        || !Number.isSafeInteger(value.tokensEstimate) || (value.next !== undefined && typeof value.next !== 'string')
        || (value.outline !== undefined && (!Array.isArray(value.outline) || !value.outline.every(line => typeof line === 'string'))))
        return undefined;
    const content = [];
    for (const block of value.content) {
        if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string')
            return undefined;
        content.push({ type: 'text', text: block.text });
    }
    let imageCandidates;
    if (value.imageCandidates !== undefined) {
        if (!Array.isArray(value.imageCandidates))
            return undefined;
        imageCandidates = [];
        for (const candidate of value.imageCandidates) {
            if (!isRecord(candidate) || typeof candidate.data !== 'string' || typeof candidate.name !== 'string'
                || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(candidate.mediaType)))
                return undefined;
            const data = Buffer.from(candidate.data, 'base64');
            if (data.byteLength === 0 || data.byteLength > MAX_CACHED_IMAGE_BYTES || data.toString('base64') !== candidate.data)
                return undefined;
            imageCandidates.push({
                data: new Uint8Array(data),
                name: candidate.name,
                mediaType: candidate.mediaType,
            });
        }
    }
    return {
        content,
        truncated: value.truncated,
        tokensEstimate: value.tokensEstimate,
        ...(typeof value.next === 'string' ? { next: value.next } : {}),
        ...(Array.isArray(value.outline) ? { outline: value.outline } : {}),
        ...(imageCandidates ? { imageCandidates } : {}),
    };
}
/** Private DSH-home cache with content-addressed entries and a disk LRU ceiling. */
export class DocumentResultCache {
    directory;
    maxBytes;
    maintenance = Promise.resolve();
    constructor(directory, maxBytes = DEFAULT_DOCUMENT_CACHE_BYTES) {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
            throw new Error('document cache maxBytes must be a non-negative safe integer');
        this.directory = resolve(directory);
        this.maxBytes = maxBytes;
    }
    async ensureDirectory() {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const info = await lstat(this.directory);
        if (!info.isDirectory() || info.isSymbolicLink())
            throw new Error('document cache directory must be a real directory');
        await chmod(this.directory, 0o700);
    }
    fileFor(key) {
        if (!/^[a-f0-9]{64}$/u.test(key))
            throw new Error('invalid document cache key');
        return join(this.directory, key + '.json');
    }
    async read(key) {
        try {
            await this.ensureDirectory();
            const path = this.fileFor(key);
            const info = await lstat(path);
            if (!info.isFile() || info.isSymbolicLink() || info.size > Math.min(this.maxBytes, MAX_CACHE_ENTRY_BYTES)) {
                await rm(path, { force: true });
                return undefined;
            }
            const envelope = JSON.parse(await readFile(path, 'utf8'));
            if (!isRecord(envelope) || envelope.version !== CACHE_ENTRY_VERSION || envelope.key !== key) {
                await rm(path, { force: true });
                return undefined;
            }
            const decoded = decodeResult(envelope.result);
            if (!decoded) {
                await rm(path, { force: true });
                return undefined;
            }
            const now = new Date();
            await utimes(path, now, now);
            return decoded;
        }
        catch {
            // An unavailable or corrupt cache must never prevent a sandboxed document read.
            return undefined;
        }
    }
    async write(key, value) {
        if (this.maxBytes === 0)
            return;
        try {
            await this.ensureDirectory();
            const serialized = JSON.stringify({
                version: CACHE_ENTRY_VERSION,
                key,
                result: {
                    ...value,
                    ...(value.imageCandidates ? {
                        imageCandidates: value.imageCandidates.map(candidate => ({
                            data: Buffer.from(candidate.data).toString('base64'),
                            mediaType: candidate.mediaType,
                            name: candidate.name,
                        })),
                    } : {}),
                },
            });
            const bytes = Buffer.byteLength(serialized);
            if (bytes > Math.min(this.maxBytes, MAX_CACHE_ENTRY_BYTES))
                return;
            const path = this.fileFor(key);
            const temporary = join(this.directory, '.' + key + '.' + randomUUID() + '.tmp');
            try {
                await writeFile(temporary, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
                await rename(temporary, path);
            }
            finally {
                await rm(temporary, { force: true }).catch(() => undefined);
            }
            await this.withMaintenance(() => this.prune(path));
        }
        catch {
            // Caching is an optimization; read_document remains usable when DSH home is read-only.
        }
    }
    withMaintenance(task) {
        const next = this.maintenance.then(task, task);
        this.maintenance = next.catch(() => undefined);
        return next;
    }
    async prune(newestPath) {
        const entries = await readdir(this.directory, { withFileTypes: true });
        const files = [];
        let total = 0;
        for (const entry of entries) {
            if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/u.test(entry.name))
                continue;
            const path = join(this.directory, entry.name);
            const metadata = await stat(path).catch(() => undefined);
            if (!metadata?.isFile())
                continue;
            files.push({ path, size: metadata.size, touched: metadata.mtimeMs });
            total += metadata.size;
        }
        files.sort((left, right) => left.touched - right.touched);
        for (const file of files) {
            if (total <= this.maxBytes || file.path === newestPath)
                continue;
            await rm(file.path, { force: true }).catch(() => undefined);
            total -= file.size;
        }
        if (total > this.maxBytes)
            await rm(newestPath, { force: true }).catch(() => undefined);
    }
}
//# sourceMappingURL=cache.js.map