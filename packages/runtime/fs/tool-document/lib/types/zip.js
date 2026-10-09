import { unzipSync } from 'fflate';
import { DocumentReadError } from "./errors.js";
export const ZIP_MAX_ENTRIES = 10_000;
export const ZIP_MAX_EXPANDED_BYTES = 500 * 1024 * 1024;
export const ZIP_MAX_RATIO = 100;
/** Inspect central-directory sizes before any decompression takes place. */
export function inspectZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const searchFrom = Math.max(0, bytes.length - 65_557);
    let eocd = -1;
    for (let offset = bytes.length - 22; offset >= searchFrom; offset -= 1) {
        if (view.getUint32(offset, true) === 0x06054b50) {
            eocd = offset;
            break;
        }
    }
    if (eocd < 0 || eocd + 22 > bytes.length) {
        throw new DocumentReadError('Office file is a malformed ZIP archive', 'DOCUMENT_ZIP_INVALID');
    }
    const disk = view.getUint16(eocd + 4, true);
    const directoryDisk = view.getUint16(eocd + 6, true);
    const diskEntries = view.getUint16(eocd + 8, true);
    const totalEntries = view.getUint16(eocd + 10, true);
    const directoryBytes = view.getUint32(eocd + 12, true);
    const directoryOffset = view.getUint32(eocd + 16, true);
    if (disk !== 0 || directoryDisk !== 0 || diskEntries !== totalEntries) {
        throw new DocumentReadError('Multi-disk ZIP archives are not supported', 'DOCUMENT_ZIP_UNSUPPORTED');
    }
    if (totalEntries === 0xffff || directoryBytes === 0xffffffff || directoryOffset === 0xffffffff) {
        throw new DocumentReadError('ZIP64 Office files are not supported', 'DOCUMENT_ZIP_UNSUPPORTED');
    }
    if (totalEntries > ZIP_MAX_ENTRIES) {
        throw new DocumentReadError(`Office archive has more than ${ZIP_MAX_ENTRIES.toLocaleString()} entries`, 'DOCUMENT_ZIP_TOO_MANY_ENTRIES');
    }
    if (directoryOffset + directoryBytes > eocd || directoryOffset > bytes.length) {
        throw new DocumentReadError('Office file has an invalid ZIP directory', 'DOCUMENT_ZIP_INVALID');
    }
    const entries = new Map();
    let offset = directoryOffset;
    let expandedTotal = 0;
    for (let index = 0; index < totalEntries; index += 1) {
        if (offset + 46 > eocd || view.getUint32(offset, true) !== 0x02014b50) {
            throw new DocumentReadError('Office file has a malformed ZIP directory entry', 'DOCUMENT_ZIP_INVALID');
        }
        const flags = view.getUint16(offset + 8, true);
        const method = view.getUint16(offset + 10, true);
        const compressedBytes = view.getUint32(offset + 20, true);
        const expandedBytes = view.getUint32(offset + 24, true);
        const nameBytes = view.getUint16(offset + 28, true);
        const extraBytes = view.getUint16(offset + 30, true);
        const commentBytes = view.getUint16(offset + 32, true);
        const localOffset = view.getUint32(offset + 42, true);
        const next = offset + 46 + nameBytes + extraBytes + commentBytes;
        if (next > eocd || next > bytes.length) {
            throw new DocumentReadError('Office file has a truncated ZIP directory name', 'DOCUMENT_ZIP_INVALID');
        }
        if ((flags & 0x1) !== 0)
            throw new DocumentReadError('Encrypted Office documents are not supported', 'DOCUMENT_ENCRYPTED');
        if (compressedBytes === 0xffffffff || expandedBytes === 0xffffffff || localOffset === 0xffffffff) {
            throw new DocumentReadError('ZIP64 Office files are not supported', 'DOCUMENT_ZIP_UNSUPPORTED');
        }
        if (method !== 0 && method !== 8) {
            throw new DocumentReadError(`Office ZIP compression method ${method} is not supported`, 'DOCUMENT_ZIP_UNSUPPORTED');
        }
        const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameBytes));
        if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
            throw new DocumentReadError('Office archive contains an unsafe entry path', 'DOCUMENT_ZIP_INVALID');
        }
        if (entries.has(name))
            throw new DocumentReadError(`Office archive has duplicate entry ${name}`, 'DOCUMENT_ZIP_INVALID');
        if (expandedBytes > 0 && (compressedBytes === 0 || expandedBytes / compressedBytes > ZIP_MAX_RATIO)) {
            throw new DocumentReadError(`Office entry ${name} exceeds the ${ZIP_MAX_RATIO}:1 compression-ratio limit`, 'DOCUMENT_ZIP_BOMB');
        }
        expandedTotal += expandedBytes;
        if (expandedTotal > ZIP_MAX_EXPANDED_BYTES) {
            throw new DocumentReadError('Office archive expands beyond the 500 MB safety limit', 'DOCUMENT_ZIP_BOMB');
        }
        entries.set(name, { name, compressedBytes, expandedBytes, method, localOffset });
        offset = next;
    }
    if (offset !== directoryOffset + directoryBytes) {
        throw new DocumentReadError('Office file has an inconsistent ZIP directory size', 'DOCUMENT_ZIP_INVALID');
    }
    return entries;
}
/** Decompress only requested entries after the entire archive has passed size checks. */
export function extractZipEntries(bytes, catalog, requested) {
    for (const name of requested) {
        if (!catalog.has(name))
            throw new DocumentReadError(`Office archive is missing ${name}`, 'DOCUMENT_PART_MISSING');
        const entry = catalog.get(name);
        if (entry.expandedBytes > 50 * 1024 * 1024) {
            throw new DocumentReadError(`Office XML part ${name} exceeds the 50 MB parser limit`, 'DOCUMENT_XML_TOO_LARGE');
        }
    }
    try {
        const archive = unzipSync(bytes, { filter: entry => requested.has(entry.name) });
        return new Map(Object.entries(archive));
    }
    catch (cause) {
        if (cause instanceof DocumentReadError)
            throw cause;
        throw new DocumentReadError('Office archive could not be safely decompressed', 'DOCUMENT_ZIP_INVALID', { cause });
    }
}
export function textPart(parts, name) {
    const data = parts.get(name);
    if (!data)
        throw new DocumentReadError(`Office archive is missing ${name}`, 'DOCUMENT_PART_MISSING');
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(data);
    }
    catch (cause) {
        throw new DocumentReadError(`Office XML part ${name} is not valid UTF-8`, 'DOCUMENT_XML_INVALID', { cause });
    }
}
//# sourceMappingURL=zip.js.map