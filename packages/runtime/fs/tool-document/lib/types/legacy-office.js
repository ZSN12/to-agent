import { constants as fsConstants } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { delimiter, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { DocumentReadError } from "./errors.js";
const OLE_HEADER = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_OFFICE_BYTES = 50 * 1024 * 1024;
export function isOleCompoundFile(bytes) {
    return OLE_HEADER.every((byte, index) => bytes[index] === byte);
}
export function legacyOfficeExtension(path) {
    const extension = extname(path).toLowerCase();
    return extension === '.doc' || extension === '.ppt' || extension === '.xls' ? extension : undefined;
}
export function officeEncryptionMarkersPresent(bytes) {
    if (!isOleCompoundFile(bytes))
        return false;
    const data = Buffer.from(bytes);
    for (const marker of ['EncryptionInfo', 'EncryptedPackage']) {
        const ascii = Buffer.from(marker, 'ascii');
        const utf16le = Buffer.allocUnsafe(marker.length * 2);
        for (let index = 0; index < marker.length; index += 1) {
            utf16le[index * 2] = marker.charCodeAt(index);
            utf16le[index * 2 + 1] = 0;
        }
        const utf16be = Buffer.from(utf16le);
        for (let index = 0; index < utf16be.length; index += 2) {
            const byte = utf16be[index];
            utf16be[index] = utf16be[index + 1];
            utf16be[index + 1] = byte;
        }
        if (data.includes(ascii) || data.includes(utf16le) || data.includes(utf16be))
            return true;
    }
    return false;
}
export function legacyOfficeTarget(extension) {
    switch (extension) {
        case '.doc': return 'docx';
        case '.ppt': return 'pdf';
        case '.xls': return 'xlsx';
    }
}
async function executable(path) {
    try {
        const canonical = await realpath(path);
        const info = await lstat(canonical);
        if (!info.isFile())
            return undefined;
        await access(canonical, fsConstants.X_OK);
        return canonical;
    }
    catch {
        return undefined;
    }
}
/** Locate LibreOffice without invoking a shell or inheriting any child environment. */
export async function findLibreOffice(configuredPath, searchPath = process.env.PATH ?? '') {
    const candidates = [
        configuredPath,
        ...searchPath.split(delimiter).filter(Boolean).map(directory => join(directory, 'soffice')),
        '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    ].filter((candidate) => Boolean(candidate));
    const visited = new Set();
    for (const candidate of candidates) {
        if (visited.has(candidate))
            continue;
        visited.add(candidate);
        const path = await executable(candidate);
        if (path)
            return path;
    }
    return undefined;
}
function runLibreOffice(binary, args, environment, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DocumentReadError('LibreOffice conversion was cancelled.', 'DOCUMENT_CONVERSION_CANCELLED'));
            return;
        }
        let child;
        try {
            child = spawn(binary, args, { cwd: tmpdir(), env: environment, shell: false, stdio: 'ignore', windowsHide: true });
        }
        catch (cause) {
            reject(new DocumentReadError('LibreOffice could not be started.', 'DOCUMENT_CONVERSION_FAILED', { cause }));
            return;
        }
        let settled = false;
        let timeout;
        let failure;
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            if (timeout)
                clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
            if (error)
                reject(error);
            else
                resolve();
        };
        const stop = (error) => {
            if (failure)
                return;
            failure = error;
            try {
                child.kill('SIGKILL');
            }
            catch {
                finish(error);
            }
        };
        const abort = () => stop(new DocumentReadError('LibreOffice conversion was cancelled.', 'DOCUMENT_CONVERSION_CANCELLED'));
        signal?.addEventListener('abort', abort, { once: true });
        timeout = setTimeout(() => stop(new DocumentReadError('LibreOffice conversion exceeded the 60-second limit.', 'DOCUMENT_CONVERSION_TIMEOUT')), 60_000);
        child.once('error', cause => finish(new DocumentReadError('LibreOffice could not be started.', 'DOCUMENT_CONVERSION_FAILED', { cause })));
        child.once('close', code => {
            if (failure)
                finish(failure);
            else if (code !== 0)
                finish(new DocumentReadError('LibreOffice could not convert this legacy Office file (exit code ' + String(code) + '). It may be encrypted or damaged.', 'DOCUMENT_CONVERSION_FAILED'));
            else
                finish();
        });
    });
}
/**
 * Convert an already sandbox-authorized OLE document from a private snapshot.
 * The source path supplied by the user is never passed to LibreOffice.
 */
export async function convertLegacyOffice(bytes, extension, options = {}) {
    if (!isOleCompoundFile(bytes))
        throw new DocumentReadError('File contents do not match a legacy Office document.', 'DOCUMENT_TYPE_MISMATCH');
    if (officeEncryptionMarkersPresent(bytes))
        throw new DocumentReadError('This Office document is encrypted. Remove its password and retry.', 'DOCUMENT_ENCRYPTED');
    const binary = await findLibreOffice(options.sofficePath);
    if (!binary) {
        throw new DocumentReadError('This is a legacy Office format. Save it as .docx, .pptx, or .xlsx, or install LibreOffice and retry.', 'DOCUMENT_LIBREOFFICE_UNAVAILABLE');
    }
    const directory = await mkdtemp(join(tmpdir(), 'taskweaver-office-convert-'));
    const target = legacyOfficeTarget(extension);
    const targetPath = join(directory, 'source.' + target);
    const profilePath = join(directory, 'profile');
    try {
        const directoryInfo = await lstat(directory);
        if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || (directoryInfo.mode & 0o077) !== 0) {
            throw new DocumentReadError('Private conversion directory is not safe.', 'DOCUMENT_CONVERSION_FAILED');
        }
        await mkdir(profilePath, { mode: 0o700 });
        const sourcePath = join(directory, 'source' + extension);
        await writeFile(sourcePath, bytes, { flag: 'wx', mode: 0o600 });
        const environment = {
            PATH: process.env.PATH ?? '/usr/bin:/bin',
            HOME: profilePath,
            TMPDIR: directory,
            TMP: directory,
            TEMP: directory,
            LANG: process.env.LANG ?? 'C.UTF-8',
        };
        await runLibreOffice(binary, [
            '--headless',
            '--norestore',
            '--nodefault',
            '--nofirststartwizard',
            '-env:UserInstallation=' + pathToFileURL(profilePath).href,
            '--convert-to', target,
            '--outdir', directory,
            sourcePath,
        ], environment, options.signal);
        const info = await lstat(targetPath);
        const maxBytes = target === 'pdf' ? MAX_PDF_BYTES : MAX_OFFICE_BYTES;
        if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > maxBytes) {
            throw new DocumentReadError('LibreOffice output is missing, unsafe, or larger than the supported document limit.', 'DOCUMENT_CONVERSION_FAILED');
        }
        const handle = await open(targetPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
        try {
            const verified = await handle.stat();
            if (!verified.isFile() || verified.size !== info.size) {
                throw new DocumentReadError('LibreOffice output changed while it was being read.', 'DOCUMENT_CONVERSION_FAILED');
            }
            return new Uint8Array(await handle.readFile());
        }
        finally {
            await handle.close();
        }
    }
    catch (cause) {
        if (cause instanceof DocumentReadError)
            throw cause;
        if (cause?.code === 'ENOENT') {
            throw new DocumentReadError('LibreOffice did not create the expected .' + target + ' conversion output.', 'DOCUMENT_CONVERSION_FAILED', { cause });
        }
        throw new DocumentReadError('LibreOffice conversion failed.', 'DOCUMENT_CONVERSION_FAILED', { cause });
    }
    finally {
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
}
//# sourceMappingURL=legacy-office.js.map