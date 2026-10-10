import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { DocumentReadError } from "./errors.js";
import { descendants, directChildren, firstDescendant, parseXml, textContent } from "./xml.js";
import { extractZipEntries, inspectZip, textPart } from "./zip.js";
import { walkXml } from "./xml.js";
import { isOleCompoundFile, officeEncryptionMarkersPresent } from "./legacy-office.js";
const PDF_MAX_BYTES = 100 * 1024 * 1024;
const OFFICE_MAX_BYTES = 50 * 1024 * 1024;
const PDF_MAX_PAGES = 2_000;
const SEGMENT_MAX = 20;
const SHEET_MAX_ROWS = 200;
const SHEET_MAX_COLUMNS = 50;
const CELL_MAX_CHARS = 200;
const XLSX_WORKSHEET_XML_BYTES = 300 * 1024 * 1024;
const IMAGE_MAX_COUNT = 8;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const require = createRequire(import.meta.url);
const IMAGE_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
};
function imageTypeForPath(path) {
    const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
    return IMAGE_TYPES[extension];
}
function imageReferences(node) {
    return descendants(node, 'blip').flatMap(blip => blip.attributes.embed ? [blip.attributes.embed] : []);
}
function imageDimensions(data) {
    if (data.length >= 24 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (data.length >= 10 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
        return { width: data[6] | data[7] << 8, height: data[8] | data[9] << 8 };
    }
    if (data.length >= 30 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46
        && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
        const kind = String.fromCharCode(data[12], data[13], data[14], data[15]);
        if (kind === 'VP8X')
            return {
                width: 1 + data[24] + (data[25] << 8) + (data[26] << 16),
                height: 1 + data[27] + (data[28] << 8) + (data[29] << 16),
            };
    }
    if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
        let offset = 2;
        while (offset + 9 < data.length) {
            if (data[offset] !== 0xff) {
                offset += 1;
                continue;
            }
            const marker = data[offset + 1];
            const size = data[offset + 2] << 8 | data[offset + 3];
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
                return { width: data[offset + 7] << 8 | data[offset + 8], height: data[offset + 5] << 8 | data[offset + 6] };
            }
            if (size < 2)
                break;
            offset += 2 + size;
        }
    }
    return undefined;
}
function relatedOfficeImages(bytes, catalog, relationshipsPath, basePath, usedIds, location, maxCandidates = IMAGE_MAX_COUNT, maxTotalBytes = IMAGE_MAX_TOTAL_BYTES) {
    if (usedIds.size === 0 || !catalog.has(relationshipsPath))
        return { candidates: [], omitted: 0 };
    const relationships = rootOf(extractZipEntries(bytes, catalog, new Set([relationshipsPath])), relationshipsPath);
    const candidates = [];
    let omitted = 0;
    let totalBytes = 0;
    for (const relation of descendants(relationships, 'Relationship')) {
        const id = relation.attributes.id;
        const target = relation.attributes.target;
        if (!id || !usedIds.has(id) || !target || relation.attributes.targetmode?.toLowerCase() === 'external')
            continue;
        if (!relation.attributes.type?.endsWith('/image'))
            continue;
        const targetPath = resolvePartTarget(basePath, target);
        const mediaType = imageTypeForPath(targetPath);
        if (!mediaType || !catalog.has(targetPath)) {
            omitted += 1;
            continue;
        }
        const data = extractZipEntries(bytes, catalog, new Set([targetPath])).get(targetPath);
        if (data.byteLength === 0 || data.byteLength > IMAGE_MAX_BYTES || candidates.length >= maxCandidates
            || totalBytes + data.byteLength > maxTotalBytes) {
            omitted += 1;
            continue;
        }
        candidates.push({ data, mediaType, name: location + '/' + targetPath.slice(targetPath.lastIndexOf('/') + 1) });
        totalBytes += data.byteLength;
    }
    return { candidates, omitted };
}
function resolvePartTarget(base, target) {
    if (target.includes('\\'))
        throw new DocumentReadError('Office relationship contains an unsafe path.', 'DOCUMENT_PART_MISSING');
    const parts = target.startsWith('/') ? [] : base.split('/').filter(Boolean);
    for (const segment of target.replace(/^\//u, '').split('/')) {
        if (!segment || segment === '.')
            continue;
        if (segment === '..') {
            if (parts.length === 0)
                throw new DocumentReadError('Office relationship escapes the package root.', 'DOCUMENT_PART_MISSING');
            parts.pop();
        }
        else
            parts.push(segment);
    }
    return parts.join('/');
}
function detectDocument(bytes) {
    const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 2048)));
    if (header.startsWith('%PDF-'))
        return { kind: 'pdf' };
    if (isOleCompoundFile(bytes)) {
        if (officeEncryptionMarkersPresent(bytes)) {
            throw new DocumentReadError('This Office document is encrypted. Remove its password and retry.', 'DOCUMENT_ENCRYPTED');
        }
        throw new DocumentReadError('This is a legacy .doc, .ppt, or .xls file. To read it, install LibreOffice and approve the isolated conversion, or save it as .docx, .pptx, or .xlsx.', 'DOCUMENT_LEGACY_OFFICE');
    }
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
        const catalog = inspectZip(bytes);
        if (!catalog.has('[Content_Types].xml'))
            throw new DocumentReadError('ZIP archive is not a supported Office document.', 'DOCUMENT_UNSUPPORTED');
        const manifest = textPart(extractZipEntries(bytes, catalog, new Set(['[Content_Types].xml'])), '[Content_Types].xml');
        if (/\/ppt\/presentation\.xml/u.test(manifest))
            return { kind: 'pptx', catalog };
        if (/\/word\/document\.xml/u.test(manifest))
            return { kind: 'docx', catalog };
        if (/\/xl\/workbook\.xml/u.test(manifest))
            return { kind: 'xlsx', catalog };
        throw new DocumentReadError('ZIP archive is not a supported .pptx, .docx, or .xlsx file.', 'DOCUMENT_UNSUPPORTED');
    }
    throw new DocumentReadError('Unsupported document type. Supported formats are PDF, PPTX, DOCX, and XLSX.', 'DOCUMENT_UNSUPPORTED');
}
function estimateTokens(value) {
    let cjk = 0;
    for (const character of value) {
        const code = character.codePointAt(0);
        if ((code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff))
            cjk += 1;
    }
    return Math.ceil(cjk * 1.3 + ([...value].length - cjk) / 4);
}
function result(value, metadata = {}, maxBytes = 50 * 1024) {
    const lines = [value];
    const outline = [];
    let clipped = false;
    const nextText = metadata.next ? '\n\nNext: ' + metadata.next : '';
    const fits = (candidate) => Buffer.byteLength(candidate + nextText, 'utf8') <= maxBytes;
    if (metadata.outline?.length) {
        const heading = lines.concat('', 'Outline:').join('\n');
        if (fits(heading))
            lines.push('', 'Outline:');
        else
            clipped = true;
        for (const entry of metadata.outline) {
            if (clipped)
                break;
            const candidate = lines.concat('- ' + entry).join('\n');
            if (!fits(candidate)) {
                clipped = true;
                break;
            }
            outline.push(entry);
            lines.push('- ' + entry);
        }
        if (clipped) {
            const candidate = lines.concat('- [outline clipped by the output limit]').join('\n');
            if (fits(candidate))
                lines.push('- [outline clipped by the output limit]');
        }
    }
    if (metadata.next)
        lines.push('', 'Next: ' + metadata.next);
    let contentText = lines.join('\n');
    if (Buffer.byteLength(contentText, 'utf8') > maxBytes) {
        const notice = '\n\n[Output clipped by the configured byte limit]';
        const room = Math.max(0, maxBytes - Buffer.byteLength(notice + nextText, 'utf8'));
        let base = '';
        let used = 0;
        for (const character of value) {
            const size = Buffer.byteLength(character, 'utf8');
            if (used + size > room)
                break;
            base += character;
            used += size;
        }
        contentText = base + notice + nextText;
        if (metadata.outline)
            outline.length = 0;
        clipped = true;
    }
    return {
        ...metadata,
        ...(metadata.outline ? { outline } : {}),
        content: [{ type: 'text', text: contentText }],
        truncated: Boolean(metadata.truncated || clipped),
        tokensEstimate: estimateTokens(contentText),
    };
}
function bounded(value, maxBytes, next) {
    const footerBytes = next ? Buffer.byteLength('\n\nNext: ' + next, 'utf8') : 0;
    if (Buffer.byteLength(value, 'utf8') + footerBytes <= maxBytes)
        return result(value, next ? { next } : {}, maxBytes);
    let excerpt = value;
    const notice = '\n\n[Output reached the configured byte limit and was truncated.]';
    while (Buffer.byteLength(excerpt + notice, 'utf8') + footerBytes > maxBytes && excerpt.length > 0)
        excerpt = excerpt.slice(0, Math.floor(excerpt.length * 0.8));
    return result(excerpt + notice, { truncated: true, ...(next ? { next } : {}) }, maxBytes);
}
function parseRange(value, total, name) {
    if (value === undefined || value.trim() === '') {
        if (total > SEGMENT_MAX)
            throw new DocumentReadError('Document exceeds the per-call segment limit. Inspect the outline and specify a range.', 'DOCUMENT_RANGE_REQUIRED');
        return total === 0 ? [1, 0] : [1, total];
    }
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/u.exec(value.trim());
    if (!match)
        throw new DocumentReadError(name + ' must be a number or an ascending range such as 1-5.', 'DOCUMENT_RANGE_INVALID');
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start + 1 > SEGMENT_MAX) {
        throw new DocumentReadError(name + ' range must be ascending and include at most ' + SEGMENT_MAX + ' segments.', 'DOCUMENT_RANGE_LIMIT');
    }
    if (start > total)
        throw new DocumentReadError(name + ' ' + start + ' exceeds the document length of ' + total + '.', 'DOCUMENT_RANGE_INVALID');
    return [start, Math.min(end, total)];
}
function pdfPageText(items) {
    const lines = [];
    for (const item of items) {
        const value = item.str?.trim();
        if (!value)
            continue;
        const x = item.transform?.[4] ?? 0;
        const y = item.transform?.[5] ?? 0;
        const line = lines.find(candidate => Math.abs(candidate.y - y) < 2.5);
        if (line) {
            line.x = Math.min(line.x, x);
            line.text += ' ' + value;
        }
        else
            lines.push({ y, x, text: value });
    }
    return lines.sort((a, b) => b.y - a.y || a.x - b.x).map(line => line.text).join('\n');
}
async function inspectPdfPage(pdf, pageNumber) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ includeMarkedContent: false });
    const textItems = content.items.filter((item) => 'str' in item);
    const text = pdfPageText(textItems);
    let scanned = false;
    if (text.length < 20) {
        const operators = await page.getOperatorList();
        const imageOps = new Set([
            OPS.paintImageXObject,
            OPS.paintInlineImageXObject,
            OPS.paintImageMaskXObject,
            OPS.paintImageMaskXObjectGroup,
            OPS.paintImageXObjectRepeat,
        ].filter((value) => typeof value === 'number'));
        scanned = operators.fnArray.some(operator => imageOps.has(operator));
    }
    page.cleanup();
    return { text, scanned };
}
/** Render one scanned PDF page with the system Poppler binary when available. */
async function renderScannedPdfPage(bytes, pageNumber) {
    let directory;
    try {
        directory = await mkdtemp(join(tmpdir(), 'taskweaver-document-page-'));
        const inputPath = join(directory, 'source.pdf');
        const outputPrefix = join(directory, 'page');
        const outputPath = outputPrefix + '.png';
        await writeFile(inputPath, bytes, { flag: 'wx', mode: 0o600 });
        const code = await new Promise(resolve => {
            let child;
            let settled = false;
            let timer;
            const finish = (value) => {
                if (settled)
                    return;
                settled = true;
                if (timer)
                    clearTimeout(timer);
                resolve(value);
            };
            try {
                child = spawn('pdftoppm', [
                    '-f', String(pageNumber), '-l', String(pageNumber), '-singlefile',
                    '-scale-to', '1568', '-png', inputPath, outputPrefix,
                ], { stdio: 'ignore', windowsHide: true });
            }
            catch {
                finish(undefined);
                return;
            }
            timer = setTimeout(() => {
                child.kill('SIGKILL');
                finish(undefined);
            }, 18_000);
            child.on('error', () => finish(undefined));
            child.on('close', value => finish(value ?? undefined));
        });
        if (code !== 0)
            return undefined;
        const output = await stat(outputPath);
        if (!output.isFile() || output.size < 8 || output.size > IMAGE_MAX_BYTES)
            return undefined;
        const data = await readFile(outputPath);
        if (data.length < 8 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
            return undefined;
        return new Uint8Array(data);
    }
    catch {
        return undefined;
    }
    finally {
        if (directory)
            await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
}
/** Render through the bundled native canvas when Poppler is not installed. */
async function renderScannedPdfPageWithCanvas(pdf, pageNumber) {
    let page;
    try {
        const canvasModule = require('@napi-rs/canvas');
        page = await pdf.getPage(pageNumber);
        const initial = page.getViewport({ scale: 1 });
        if (!Number.isFinite(initial.width) || initial.width <= 0 || !Number.isFinite(initial.height) || initial.height <= 0)
            return undefined;
        const viewport = page.getViewport({ scale: 1568 / initial.width });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        if (width <= 0 || height <= 0 || width > 4096 || height > 4096 || width * height > 8_000_000)
            return undefined;
        const canvas = canvasModule.createCanvas(width, height);
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;
        const data = canvas.toBuffer('image/png');
        if (data.length === 0 || data.length > IMAGE_MAX_BYTES)
            return undefined;
        return new Uint8Array(data);
    }
    catch {
        return undefined;
    }
    finally {
        page?.cleanup();
    }
}
async function readPdf(bytes, options) {
    if (bytes.length > (options.maxPdfBytes ?? PDF_MAX_BYTES)) {
        throw new DocumentReadError('PDF exceeds the ' + Math.floor((options.maxPdfBytes ?? PDF_MAX_BYTES) / (1024 * 1024)) + ' MB file limit.', 'DOCUMENT_TOO_LARGE');
    }
    const loading = getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false, useWorkerFetch: false, verbosity: 0 });
    let pdf;
    try {
        pdf = await loading.promise;
    }
    catch (cause) {
        const name = cause?.name;
        if (name === 'PasswordException' || /password|encrypt/iu.test(String(cause))) {
            throw new DocumentReadError('This PDF is password-protected. Remove the password and retry.', 'DOCUMENT_ENCRYPTED', { cause });
        }
        throw new DocumentReadError('PDF could not be read: ' + (cause instanceof Error ? cause.message : String(cause)), 'DOCUMENT_PDF_INVALID', { cause });
    }
    try {
        const total = pdf.numPages;
        const outline = [];
        const previews = new Map();
        const pageLimit = Math.min(total, PDF_MAX_PAGES);
        const needOutline = total > PDF_MAX_PAGES || (options.pages === undefined && total > SEGMENT_MAX);
        if (needOutline) {
            for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
                const preview = await inspectPdfPage(pdf, pageNumber);
                previews.set(pageNumber, preview);
                const firstLine = preview.text.split('\n').find(line => line.trim())?.slice(0, 180);
                outline.push(pageNumber + '. ' + (firstLine || (preview.scanned ? '(Scanned page)' : '(Blank page)')));
            }
        }
        if (total > PDF_MAX_PAGES)
            return result('PDF has ' + total + ' pages, above the ' + PDF_MAX_PAGES + '-page parsing limit. Outline shows the first ' + PDF_MAX_PAGES + ' pages.', {
                outline, next: 'Split the PDF into files of at most 2000 pages.', truncated: true,
            }, options.maxOutputBytes);
        if (options.pages === undefined && total > SEGMENT_MAX)
            return result('PDF has ' + total + ' pages. First call returns its outline; specify pages, up to ' + SEGMENT_MAX + ' per call.', {
                outline, next: 'pages=1-20', truncated: true,
            }, options.maxOutputBytes);
        const [start, end] = parseRange(options.pages, total, 'pages');
        const pieces = [];
        const imageCandidates = [];
        for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
            const page = previews.get(pageNumber) ?? await inspectPdfPage(pdf, pageNumber);
            let fallback = '[Blank page]';
            if (page.scanned) {
                const currentImageBytes = imageCandidates.reduce((sum, candidate) => sum + candidate.data.byteLength, 0);
                if (options.images && imageCandidates.length < IMAGE_MAX_COUNT && currentImageBytes < IMAGE_MAX_TOTAL_BYTES) {
                    const data = await renderScannedPdfPage(bytes, pageNumber)
                        ?? await renderScannedPdfPageWithCanvas(pdf, pageNumber);
                    if (data && data.byteLength + currentImageBytes <= IMAGE_MAX_TOTAL_BYTES) {
                        imageCandidates.push({ data, mediaType: 'image/png', name: 'page-' + pageNumber + '.png' });
                        fallback = '[Scanned page attached as an image.]';
                    }
                    else
                        fallback = '[Scanned page; rendering is unavailable. Install Poppler (pdftoppm) or provide a screenshot.]';
                }
                else if (options.images)
                    fallback = '[Scanned page image omitted; each call can attach at most 8 images.]';
                else
                    fallback = '[Scanned page; provide a screenshot or a searchable PDF to read this page.]';
            }
            pieces.push('--- Page ' + pageNumber + ' ---\n' + (page.text || fallback));
        }
        const next = end < total ? 'pages=' + (end + 1) + '-' + Math.min(total, end + SEGMENT_MAX) : undefined;
        const response = bounded(pieces.join('\n\n'), options.maxOutputBytes, next);
        return imageCandidates.length ? { ...response, imageCandidates } : response;
    }
    finally {
        await loading.destroy();
    }
}
function rootOf(parts, name) {
    return parseXml(textPart(parts, name));
}
function nodeText(node) {
    return textContent(node).replace(/\s+/gu, ' ').trim();
}
function pptxSlidePaths(presentation, rels) {
    const targets = new Map(descendants(rels, 'Relationship').map(rel => [rel.attributes.Id, rel.attributes.Target]));
    return descendants(presentation, 'sldId').map(ref => {
        const target = targets.get(ref.attributes.id ?? '');
        if (!target || target.split('/').includes('..')) {
            throw new DocumentReadError('PPTX slide relationship is missing or unsafe.', 'DOCUMENT_PART_MISSING');
        }
        return resolvePartTarget('ppt', target);
    });
}
function pptxTitle(slide) {
    for (const shape of descendants(slide, 'sp')) {
        const type = firstDescendant(shape, 'ph')?.attributes.type;
        if (type === 'title' || type === 'ctrTitle') {
            const value = descendants(shape, 't').map(nodeText).filter(Boolean).join(' ');
            if (value)
                return value;
        }
    }
    return descendants(slide, 't').map(nodeText).find(Boolean) ?? '(Untitled)';
}
function pptxBody(slide) {
    const lines = [];
    for (const shape of descendants(slide, 'sp')) {
        const type = firstDescendant(shape, 'ph')?.attributes.type;
        if (type === 'title' || type === 'ctrTitle')
            continue;
        for (const paragraph of descendants(shape, 'p')) {
            const value = descendants(paragraph, 't').map(nodeText).filter(Boolean).join('');
            if (!value)
                continue;
            const properties = firstDescendant(paragraph, 'pPr');
            const level = Math.max(0, Number(properties?.attributes.lvl ?? '0') || 0);
            const isBullet = properties !== undefined && (properties.attributes.lvl !== undefined
                || firstDescendant(properties, 'buChar') !== undefined
                || firstDescendant(properties, 'buAutoNum') !== undefined) && firstDescendant(properties, 'buNone') === undefined;
            lines.push((isBullet ? '  '.repeat(Math.min(level, 8)) + '- ' : '') + value);
        }
    }
    for (const table of descendants(slide, 'tbl')) {
        const rows = descendants(table, 'tr').map(row => descendants(row, 'tc').map(cell => descendants(cell, 't').map(nodeText).filter(Boolean).join(' ').replace(/\|/gu, '\\|')));
        if (rows.length > 0) {
            lines.push('| ' + rows[0].join(' | ') + ' |');
            lines.push('| ' + rows[0].map(() => '---').join(' | ') + ' |');
            for (const row of rows.slice(1))
                lines.push('| ' + row.join(' | ') + ' |');
        }
    }
    return lines.join('\n');
}
function notesForSlide(bytes, catalog, path) {
    const filename = path.slice(path.lastIndexOf('/') + 1);
    const relsPath = 'ppt/slides/_rels/' + filename + '.rels';
    if (!catalog.has(relsPath))
        return undefined;
    const rels = rootOf(extractZipEntries(bytes, catalog, new Set([relsPath])), relsPath);
    const relation = descendants(rels, 'Relationship').find(item => item.attributes.type?.endsWith('/notesSlide'));
    const target = relation?.attributes.Target;
    if (!target)
        return undefined;
    let notesPath;
    try {
        notesPath = resolvePartTarget('ppt/slides', target);
    }
    catch {
        return undefined;
    }
    if (!catalog.has(notesPath))
        return undefined;
    const notes = rootOf(extractZipEntries(bytes, catalog, new Set([notesPath])), notesPath);
    const text = descendants(notes, 'sp').filter(shape => {
        const kind = firstDescendant(shape, 'ph')?.attributes.type;
        return !['sldNum', 'slidenum', 'sldImg'].includes(kind ?? '');
    }).flatMap(shape => descendants(shape, 't').map(nodeText)).filter(Boolean).join(' ');
    return text || undefined;
}
async function readPptx(bytes, options, catalog) {
    if (bytes.length > (options.maxOfficeBytes ?? OFFICE_MAX_BYTES))
        throw new DocumentReadError('Office file exceeds the configured file limit.', 'DOCUMENT_TOO_LARGE');
    const basics = extractZipEntries(bytes, catalog, new Set(['ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels']));
    const paths = pptxSlidePaths(rootOf(basics, 'ppt/presentation.xml'), rootOf(basics, 'ppt/_rels/presentation.xml.rels'));
    const titles = [];
    for (const path of paths) {
        if (!catalog.has(path))
            throw new DocumentReadError('PPTX is missing ' + path, 'DOCUMENT_PART_MISSING');
        const slide = rootOf(extractZipEntries(bytes, catalog, new Set([path])), path);
        titles.push(pptxTitle(slide));
    }
    const outline = titles.map((title, index) => (index + 1) + '. ' + title);
    if (options.pages === undefined && paths.length > SEGMENT_MAX)
        return result('Presentation has ' + paths.length + ' slides. First call returns its outline; specify pages, up to ' + SEGMENT_MAX + ' slides per call.', {
            outline, next: 'pages=1-20', truncated: true,
        }, options.maxOutputBytes);
    const [start, end] = parseRange(options.pages, paths.length, 'pages');
    const content = [];
    const imageCandidates = [];
    for (let page = start; page <= end; page += 1) {
        const path = paths[page - 1];
        const slide = rootOf(extractZipEntries(bytes, catalog, new Set([path])), path);
        let section = '## Slide ' + page + ': ' + titles[page - 1] + '\n' + pptxBody(slide);
        const notes = notesForSlide(bytes, catalog, path);
        if (notes)
            section += '\n> Notes: ' + notes;
        const relsPath = 'ppt/slides/_rels/' + path.slice(path.lastIndexOf('/') + 1) + '.rels';
        if (catalog.has(relsPath)) {
            const rels = rootOf(extractZipEntries(bytes, catalog, new Set([relsPath])), relsPath);
            const ids = new Set(imageReferences(slide));
            const imageRelations = descendants(rels, 'Relationship').filter(rel => ids.has(rel.attributes.id ?? '') && rel.attributes.type?.endsWith('/image'));
            const existingImageBytes = imageCandidates.reduce((sum, candidate) => sum + candidate.data.byteLength, 0);
            const images = relatedOfficeImages(bytes, catalog, relsPath, path.slice(0, path.lastIndexOf('/')), ids, 'slide-' + page, IMAGE_MAX_COUNT - imageCandidates.length, IMAGE_MAX_TOTAL_BYTES - existingImageBytes);
            if (imageRelations.length) {
                const labels = images.candidates.map(candidate => {
                    const dimensions = imageDimensions(candidate.data);
                    return candidate.name.slice(candidate.name.lastIndexOf('/') + 1) + (dimensions ? ' ' + dimensions.width + '×' + dimensions.height + ' px' : '');
                });
                section += '\n\n[Embedded image(s): ' + (labels.join(', ') || 'unsupported or unavailable format') + ']';
                if (options.images) {
                    for (const candidate of images.candidates)
                        imageCandidates.push(candidate);
                    const missing = Math.max(0, imageRelations.length - images.candidates.length);
                    if (missing > 0)
                        section += '\n[Some images were omitted because their format, size, or per-call count is unsupported.]';
                }
            }
        }
        content.push(section);
    }
    const next = end < paths.length ? 'pages=' + (end + 1) + '-' + Math.min(paths.length, end + SEGMENT_MAX) : undefined;
    const response = bounded(content.join('\n\n'), options.maxOutputBytes, next);
    return options.images && imageCandidates.length ? { ...response, imageCandidates } : response;
}
const DOCX_HIDDEN_REVISION_NODES = new Set([
    'ins', 'del', 'moveFrom', 'moveTo', 'commentRangeStart', 'commentRangeEnd', 'commentReference',
]);
function visibleDocxText(node) {
    const parts = [];
    const stack = [node];
    while (stack.length > 0) {
        const current = stack.pop();
        if (DOCX_HIDDEN_REVISION_NODES.has(current.name))
            continue;
        if (current.name === 't') {
            if (current.text)
                parts.push(current.text);
            continue;
        }
        for (let index = current.children.length - 1; index >= 0; index -= 1)
            stack.push(current.children[index]);
    }
    return parts.join('');
}
function docParagraphText(paragraph) {
    return visibleDocxText(paragraph).replace(/\s+/gu, ' ').trim();
}
function docHeadingLevel(paragraph) {
    const style = firstDescendant(paragraph, 'pStyle')?.attributes.val?.toLowerCase();
    const match = style ? /heading\s*([1-6])/u.exec(style) : undefined;
    return match ? Number(match[1]) : undefined;
}
function docSections(root) {
    const body = firstDescendant(root, 'body');
    if (!body)
        throw new DocumentReadError('DOCX body is missing.', 'DOCUMENT_XML_INVALID');
    const sections = [];
    let current = { title: 'Document', level: 1, blocks: [], imageIds: [] };
    const save = () => {
        if (current.title !== 'Document' || current.blocks.length)
            sections.push(current);
    };
    for (const block of body.children) {
        if (block.name === 'p') {
            const value = docParagraphText(block);
            const level = docHeadingLevel(block);
            if (level !== undefined) {
                save();
                current = { title: value || '(Untitled)', level, blocks: [], imageIds: [] };
                current.imageIds.push(...imageReferences(block));
            }
            else {
                if (value) {
                    const listLevel = firstDescendant(block, 'ilvl')?.attributes.val;
                    current.blocks.push((listLevel === undefined ? '' : '  '.repeat(Math.min(Number(listLevel) || 0, 8)) + '- ') + value);
                }
                current.imageIds.push(...imageReferences(block));
            }
        }
        else if (block.name === 'tbl') {
            const rows = descendants(block, 'tr').map(row => descendants(row, 'tc').map(cell => descendants(cell, 'p').map(docParagraphText).filter(Boolean).join('<br>').replace(/\|/gu, '\\|')));
            if (rows.length) {
                current.blocks.push('| ' + rows[0].join(' | ') + ' |', '| ' + rows[0].map(() => '---').join(' | ') + ' |');
                current.blocks.push(...rows.slice(1).map(row => '| ' + row.join(' | ') + ' |'));
                current.imageIds.push(...imageReferences(block));
            }
        }
    }
    save();
    if (sections.length === 0)
        sections.push(current);
    if (sections.length !== 1 || sections[0].title !== 'Document')
        return sections;
    // Untitled documents lack semantic heading boundaries. Split their blocks
    // into navigable sections around the same 20k-character reading window.
    const chunks = [];
    let chunk = [];
    let length = 0;
    const flush = () => {
        if (chunk.length === 0)
            return;
        chunks.push({ title: 'Document part ' + (chunks.length + 1), level: 1, blocks: chunk, imageIds: [] });
        chunk = [];
        length = 0;
    };
    for (const block of sections[0].blocks) {
        if (length > 0 && length + block.length > 20_000)
            flush();
        if (block.length <= 20_000) {
            chunk.push(block);
            length += block.length;
            continue;
        }
        const characters = Array.from(block);
        for (let offset = 0; offset < characters.length; offset += 20_000) {
            const part = characters.slice(offset, offset + 20_000).join('');
            if (length > 0)
                flush();
            chunk.push(part);
            length = part.length;
            if (offset + 20_000 < characters.length)
                flush();
        }
    }
    flush();
    return chunks.length > 0 ? chunks : sections;
}
function docSectionRange(value, count) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/u.exec(value.trim());
    if (!match)
        throw new DocumentReadError('section must be a number or range such as 2-3.', 'DOCUMENT_RANGE_INVALID');
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end - start + 1 > SEGMENT_MAX)
        throw new DocumentReadError('section range must be ascending and contain at most ' + SEGMENT_MAX + ' sections.', 'DOCUMENT_RANGE_LIMIT');
    if (start > count)
        throw new DocumentReadError('section is out of range; the document has ' + count + ' sections.', 'DOCUMENT_RANGE_INVALID');
    return [start, Math.min(end, count)];
}
async function readDocx(bytes, options, catalog) {
    if (bytes.length > (options.maxOfficeBytes ?? OFFICE_MAX_BYTES))
        throw new DocumentReadError('Office file exceeds the configured file limit.', 'DOCUMENT_TOO_LARGE');
    const root = rootOf(extractZipEntries(bytes, catalog, new Set(['word/document.xml'])), 'word/document.xml');
    const sections = docSections(root);
    const outline = sections.map((section, index) => (index + 1) + '. ' + '#'.repeat(Math.max(1, Math.min(section.level, 6))) + ' ' + section.title);
    const totalChars = sections.reduce((sum, section) => sum + section.blocks.join('\n').length, 0);
    if (options.section === undefined && (sections.length > 1 || totalChars > 20_000))
        return result('Document has ' + sections.length + ' sections and about ' + totalChars + ' body characters. First call returns its outline; specify section.', {
            outline, next: 'section=1', truncated: true,
        }, options.maxOutputBytes);
    const [start, end] = options.section ? docSectionRange(options.section, sections.length) : [1, sections.length];
    const selected = sections.slice(start - 1, end);
    const selectedIds = new Set(selected.flatMap(section => section.imageIds));
    const imagePart = relatedOfficeImages(bytes, catalog, 'word/_rels/document.xml.rels', 'word', selectedIds, 'docx');
    const labels = imagePart.candidates.map(candidate => {
        const dimensions = imageDimensions(candidate.data);
        return candidate.name.slice(candidate.name.lastIndexOf('/') + 1) + (dimensions ? ' ' + dimensions.width + '×' + dimensions.height + ' px' : '');
    });
    const imageSummary = labels.length > 0
        ? '\n\n[Embedded image(s): ' + labels.join(', ') + ']'
        : selectedIds.size > 0 ? '\n\n[Embedded image(s): unsupported or unavailable format]' : '';
    const content = selected.map(section => '#'.repeat(Math.max(1, Math.min(section.level, 6))) + ' ' + section.title + '\n' + section.blocks.join('\n\n'));
    if (imageSummary)
        content[content.length - 1] = (content.at(-1) ?? '') + imageSummary;
    const next = end < sections.length ? 'section=' + (end + 1) : undefined;
    const response = bounded(content.join('\n\n'), options.maxOutputBytes, next);
    return options.images && imagePart.candidates.length > 0 ? { ...response, imageCandidates: imagePart.candidates } : response;
}
function excelColumnToNumber(name) {
    let result = 0;
    for (const character of name.toUpperCase())
        result = result * 26 + character.charCodeAt(0) - 64;
    return result;
}
function excelNumberToColumn(value) {
    let number = value;
    let output = '';
    while (number > 0) {
        number -= 1;
        output = String.fromCharCode(65 + number % 26) + output;
        number = Math.floor(number / 26);
    }
    return output;
}
function parseCellAddress(value) {
    const match = /^([A-Z]{1,3})([1-9]\d*)$/iu.exec(value);
    if (!match)
        throw new DocumentReadError('Invalid XLSX cell address ' + value, 'DOCUMENT_RANGE_INVALID');
    return { column: excelColumnToNumber(match[1]), row: Number(match[2]) };
}
function parseCellRange(value, dimension) {
    const dim = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/iu.exec(dimension);
    if (value === undefined) {
        const last = parseCellAddress(dim?.[2] ?? dim?.[1] ?? 'AX200');
        return { c1: 1, r1: 1, c2: Math.min(SHEET_MAX_COLUMNS, last.column), r2: Math.min(SHEET_MAX_ROWS, last.row) };
    }
    const match = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/iu.exec(value);
    if (!match)
        throw new DocumentReadError('range must use A1 notation, for example A1:Z200.', 'DOCUMENT_RANGE_INVALID');
    const first = parseCellAddress(match[1]);
    const last = parseCellAddress(match[2] ?? match[1]);
    const range = {
        c1: Math.min(first.column, last.column),
        r1: Math.min(first.row, last.row),
        c2: Math.max(first.column, last.column),
        r2: Math.max(first.row, last.row),
    };
    if (range.c2 - range.c1 + 1 > SHEET_MAX_COLUMNS || range.r2 - range.r1 + 1 > SHEET_MAX_ROWS) {
        throw new DocumentReadError('XLSX range is limited to ' + SHEET_MAX_ROWS + ' rows × ' + SHEET_MAX_COLUMNS + ' columns per call.', 'DOCUMENT_RANGE_LIMIT');
    }
    return range;
}
function workbookParts(bytes, catalog) {
    const names = new Set(['xl/workbook.xml', 'xl/_rels/workbook.xml.rels']);
    const parts = extractZipEntries(bytes, catalog, names);
    const workbook = rootOf(parts, 'xl/workbook.xml');
    const rels = rootOf(parts, 'xl/_rels/workbook.xml.rels');
    const targets = new Map(descendants(rels, 'Relationship').map(rel => [rel.attributes.Id, rel.attributes.Target]));
    const sheets = descendants(workbook, 'sheet').map(sheet => {
        const target = targets.get(sheet.attributes.id ?? '');
        if (!target)
            throw new DocumentReadError('XLSX sheet relationship is missing or unsafe.', 'DOCUMENT_PART_MISSING');
        const path = resolvePartTarget('xl', target);
        return { name: sheet.attributes.name ?? '(unnamed)', path };
    });
    return { workbook, sheets };
}
function excelDate(serial, date1904) {
    const offset = date1904 ? 1_462 : 0;
    const date = new Date(Date.UTC(1899, 11, 30) + (serial + offset) * 86_400_000);
    if (!Number.isFinite(date.getTime()))
        return String(serial);
    return date.toISOString().replace('T', ' ').replace(/\.000Z$/u, ' UTC');
}
function dateStyleIndexes(root) {
    if (!root)
        return new Set();
    const custom = new Map(descendants(root, 'numFmt').map(item => [Number(item.attributes.numFmtId), item.attributes.formatCode ?? '']));
    const xfs = descendants(root, 'cellXfs')[0];
    if (!xfs)
        return new Set();
    const builtin = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
    return new Set(directChildren(xfs, 'xf').flatMap((xf, index) => {
        const id = Number(xf.attributes.numFmtId ?? '0');
        const code = (custom.get(id) ?? '').replace(/"[^"]*"|\\.|\[[^\]]*\]/gu, '');
        return builtin.has(id) || /[ymdh]/iu.test(code) ? [index] : [];
    }));
}
function formatCellValue(type, style, raw, formula, inlineText, shared, dateStyles, date1904) {
    let value = raw;
    if (type === 's')
        value = shared[Number(raw)] ?? '';
    else if (type === 'inlineStr')
        value = inlineText;
    else if (type === 'b')
        value = raw === '1' ? 'TRUE' : 'FALSE';
    else if (type === 'e')
        value = '#ERROR ' + raw;
    else if (raw && dateStyles.has(Number(style ?? '0')) && Number.isFinite(Number(raw)))
        value = excelDate(Number(raw), date1904);
    if (value.length > CELL_MAX_CHARS)
        value = value.slice(0, CELL_MAX_CHARS) + '…';
    return formula ? value + (value ? ' ' : '') + '(=' + formula.trim() + ')' : value;
}
function worksheetDimension(xml) {
    const match = /<(?:[\w.-]+:)?dimension\b([^>]*)\/?\s*>/iu.exec(xml);
    const ref = match?.[1] ? /\bref\s*=\s*(?:"([^"]*)"|'([^']*)')/iu.exec(match[1]) : undefined;
    return ref?.[1] ?? ref?.[2] ?? 'A1';
}
/** Walk a worksheet without materializing a tree containing millions of cell nodes. */
function scanWorksheet(xml, range, shared, dateStyles, date1904) {
    let dimension = worksheetDimension(xml);
    let formulas = 0;
    let rangeFormulas = 0;
    let mergeCount = 0;
    const merges = [];
    let lastRow = 1;
    let lastColumn = 1;
    let rowNumber;
    let currentColumn = 0;
    let cell;
    const elementStack = [];
    const rows = new Map();
    walkXml(xml, {
        start(name, attributes) {
            elementStack.push(name);
            if (name === 'dimension')
                dimension = attributes.ref ?? dimension;
            else if (name === 'mergeCell') {
                mergeCount += 1;
                if (merges.length < 12 && attributes.ref)
                    merges.push(attributes.ref);
            }
            else if (name === 'row') {
                const parsed = Number(attributes.r);
                rowNumber = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : (rowNumber ?? 0) + 1;
                currentColumn = 0;
                lastRow = Math.max(lastRow, rowNumber);
            }
            else if (name === 'c') {
                const address = attributes.r;
                let targetRow = rowNumber;
                let targetColumn;
                if (address) {
                    const parsed = parseCellAddress(address);
                    targetRow = parsed.row;
                    targetColumn = parsed.column;
                }
                else
                    targetColumn = currentColumn + 1;
                currentColumn = targetColumn;
                if (targetRow !== undefined) {
                    lastRow = Math.max(lastRow, targetRow);
                    lastColumn = Math.max(lastColumn, targetColumn);
                }
                const capture = targetRow !== undefined && range !== undefined
                    && targetRow >= range.r1 && targetRow <= range.r2
                    && targetColumn >= range.c1 && targetColumn <= range.c2;
                cell = {
                    row: targetRow ?? 0,
                    column: targetColumn,
                    capture,
                    ...(attributes.t !== undefined ? { type: attributes.t } : {}),
                    ...(attributes.s !== undefined ? { style: attributes.s } : {}),
                    value: '',
                    formula: '',
                    inlineText: '',
                };
            }
            else if (name === 'f') {
                formulas += 1;
                if (cell?.capture)
                    rangeFormulas += 1;
            }
        },
        text(value) {
            if (!cell?.capture)
                return;
            switch (elementStack.at(-1)) {
                case 'v':
                    cell.value += value;
                    break;
                case 'f':
                    cell.formula += value;
                    break;
                case 't':
                    if (cell.type === 'inlineStr')
                        cell.inlineText += value;
                    break;
            }
        },
        end(name) {
            if (name === 'c' && cell) {
                if (cell.capture) {
                    let values = rows.get(cell.row);
                    if (!values)
                        rows.set(cell.row, values = new Map());
                    values.set(cell.column, formatCellValue(cell.type, cell.style, cell.value, cell.formula, cell.inlineText, shared, dateStyles, date1904));
                }
                cell = undefined;
            }
            else if (name === 'row')
                rowNumber = undefined;
            elementStack.pop();
        },
    });
    // Keep malformed declared extents from hiding actual populated cells.
    const declared = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/iu.exec(dimension);
    if (declared) {
        const last = parseCellAddress(declared[2] ?? declared[1]);
        lastRow = Math.max(lastRow, last.row);
        lastColumn = Math.max(lastColumn, last.column);
    }
    return { dimension, formulas, rangeFormulas, merges, mergeCount, lastRow, lastColumn, rows };
}
async function readXlsx(bytes, options, catalog) {
    if (bytes.length > (options.maxOfficeBytes ?? OFFICE_MAX_BYTES))
        throw new DocumentReadError('Office file exceeds the configured file limit.', 'DOCUMENT_TOO_LARGE');
    const { workbook, sheets } = workbookParts(bytes, catalog);
    if (!sheets.length)
        throw new DocumentReadError('XLSX workbook has no worksheets.', 'DOCUMENT_XML_INVALID');
    const metadata = new Map();
    const outline = [];
    let index = 0;
    if (options.sheet !== undefined) {
        if (/^\d+$/u.test(options.sheet.trim()))
            index = Number(options.sheet) - 1;
        else
            index = sheets.findIndex(sheet => sheet.name === options.sheet);
        if (index < 0 || index >= sheets.length)
            throw new DocumentReadError('Sheet ' + options.sheet + ' not found. Available sheets: ' + sheets.map(sheet => sheet.name).join(', '), 'DOCUMENT_SHEET_NOT_FOUND');
    }
    const selected = sheets[index];
    const inspect = options.sheet === undefined ? sheets : [selected];
    let selectedWorksheetXml;
    for (const sheet of inspect) {
        const xml = textPart(extractZipEntries(bytes, catalog, new Set([sheet.path]), XLSX_WORKSHEET_XML_BYTES), sheet.path, XLSX_WORKSHEET_XML_BYTES);
        const dimension = worksheetDimension(xml);
        metadata.set(sheet.name, { dimension });
        if (sheet.name === selected.name)
            selectedWorksheetXml = xml;
        if (options.sheet === undefined)
            outline.push(sheet.name + ' — ' + dimension);
    }
    if (options.sheet === undefined) {
        if (sheets.length > 1)
            return result('Workbook has ' + sheets.length + ' sheets. First call returns its outline; specify sheet by name or 1-based number.', {
                outline, next: 'sheet=1', truncated: true,
            }, options.maxOutputBytes);
    }
    const sheetMeta = metadata.get(selected.name);
    if (options.sheet === undefined) {
        const dimension = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/iu.exec(sheetMeta.dimension);
        const last = parseCellAddress(dimension?.[2] ?? dimension?.[1] ?? 'AX200');
        if (sheets.length > 1 || last.row > SHEET_MAX_ROWS || last.column > SHEET_MAX_COLUMNS) {
            return result('Workbook contains worksheet data beyond the per-call range limit. First call returns its outline; specify a sheet to start reading.', {
                outline, next: 'sheet=1', truncated: true,
            }, options.maxOutputBytes);
        }
    }
    const range = parseCellRange(options.range, sheetMeta.dimension);
    const sharedPath = 'xl/sharedStrings.xml';
    const stylesPath = 'xl/styles.xml';
    const requested = new Set();
    if (catalog.has(sharedPath))
        requested.add(sharedPath);
    if (catalog.has(stylesPath))
        requested.add(stylesPath);
    const parts = requested.size > 0 ? extractZipEntries(bytes, catalog, requested) : new Map();
    const shared = parts.has(sharedPath) ? descendants(rootOf(parts, sharedPath), 'si').map(item => descendants(item, 't').map(textContent).join('')) : [];
    const styles = parts.has(stylesPath) ? rootOf(parts, stylesPath) : undefined;
    const dateStyles = dateStyleIndexes(styles);
    const worksheetXml = selectedWorksheetXml;
    if (!worksheetXml)
        throw new DocumentReadError('XLSX worksheet is missing.', 'DOCUMENT_PART_MISSING');
    const sheetScan = scanWorksheet(worksheetXml, range, shared, dateStyles, firstDescendant(workbook, 'workbookPr')?.attributes.date1904 === '1');
    const rows = sheetScan.rows;
    const actualDimension = sheetScan.dimension;
    const columns = Array.from({ length: range.c2 - range.c1 + 1 }, (_, offset) => excelNumberToColumn(range.c1 + offset));
    const header = ['Row', ...columns.map(column => column + ' (' + column + range.r1 + ')')];
    const output = [
        'Sheet: ' + selected.name + '; dimensions: ' + actualDimension + '; merged ranges: ' + sheetScan.mergeCount +
            (sheetScan.mergeCount ? ' (' + sheetScan.merges.join(', ') + (sheetScan.mergeCount > sheetScan.merges.length ? ', …' : '') + ')' : '') +
            '; formulas on sheet: ' + sheetScan.formulas + '; formulas in this range: ' + sheetScan.rangeFormulas,
        '| ' + header.join(' | ') + ' |',
        '| ' + header.map(() => '---').join(' | ') + ' |',
    ];
    for (let rowNumber = range.r1; rowNumber <= range.r2; rowNumber += 1) {
        const row = rows.get(rowNumber);
        const values = columns.map((_column, offset) => (row?.get(range.c1 + offset) ?? '').replace(/\|/gu, '\\|').replace(/\r?\n/gu, '<br>'));
        output.push('| ' + rowNumber + ' | ' + values.join(' | ') + ' |');
    }
    const dimension = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/iu.exec(actualDimension);
    const lastRow = Math.max(range.r2, sheetScan.lastRow, dimension ? Number(dimension[4] ?? dimension[2]) : range.r2);
    const lastColumn = Math.max(range.c2, sheetScan.lastColumn, dimension ? excelColumnToNumber(dimension[3] ?? dimension[1]) : range.c2);
    let next;
    if (range.r2 < lastRow) {
        next = 'sheet=' + (index + 1) + '&range=' + excelNumberToColumn(range.c1) + (range.r2 + 1) + ':' + excelNumberToColumn(range.c2) + Math.min(lastRow, range.r2 + SHEET_MAX_ROWS);
    }
    else if (range.c2 < lastColumn) {
        const nextColumn = range.c2 + 1;
        next = 'sheet=' + (index + 1) + '&range=' + excelNumberToColumn(nextColumn) + '1:' + excelNumberToColumn(Math.min(lastColumn, nextColumn + SHEET_MAX_COLUMNS - 1)) + Math.min(lastRow, SHEET_MAX_ROWS);
    }
    else if (index + 1 < sheets.length)
        next = 'sheet=' + (index + 2);
    return bounded(output.join('\n'), options.maxOutputBytes, next);
}
export async function parseDocumentBytes(bytes, options) {
    const detected = detectDocument(bytes);
    if (detected.kind === 'pdf')
        return await readPdf(bytes, options);
    if (bytes.length > (options.maxOfficeBytes ?? OFFICE_MAX_BYTES))
        throw new DocumentReadError('Office file exceeds the configured file limit.', 'DOCUMENT_TOO_LARGE');
    if (!detected.catalog)
        throw new DocumentReadError('Office archive directory is missing.', 'DOCUMENT_ZIP_INVALID');
    if (detected.kind === 'pptx')
        return await readPptx(bytes, options, detected.catalog);
    if (detected.kind === 'docx')
        return await readDocx(bytes, options, detected.catalog);
    return await readXlsx(bytes, options, detected.catalog);
}
export function classifyDocument(bytes) {
    return detectDocument(bytes).kind;
}
//# sourceMappingURL=parse.js.map