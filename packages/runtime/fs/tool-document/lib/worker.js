import { createRequire } from "node:module";
import { parentPort } from "node:worker_threads";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OPS, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { unzipSync } from "fflate";
//#region lib/types/errors.js
var DocumentReadError = class extends Error {
	code;
	constructor(message, code = "DOCUMENT_READ_ERROR", options) {
		super(message, options);
		this.name = "DocumentReadError";
		this.code = code;
	}
};
//#endregion
//#region lib/types/xml.js
function localName(name) {
	const split = name.lastIndexOf(":");
	return split === -1 ? name : name.slice(split + 1);
}
function tagEnd(xml, start) {
	let quote = "";
	for (let index = start; index < xml.length; index += 1) {
		const character = xml[index];
		if (quote) {
			if (character === quote) quote = "";
		} else if (character === "\"" || character === "'") quote = character;
		else if (character === ">") return index;
	}
	return -1;
}
function decodeEntities(value) {
	if (/&(?!(?:amp|lt|gt|quot|apos|#(?:[0-9]+|x[0-9a-f]+));)/iu.test(value)) throw new DocumentReadError("Office XML contains an invalid entity reference", "DOCUMENT_XML_ENTITY");
	return value.replace(/&([^;]{1,32});/gu, (_entity, code) => {
		switch (code) {
			case "amp": return "&";
			case "lt": return "<";
			case "gt": return ">";
			case "quot": return "\"";
			case "apos": return "'";
			default: {
				const numeric = code.startsWith("#x") || code.startsWith("#X") ? Number.parseInt(code.slice(2), 16) : code.startsWith("#") ? Number.parseInt(code.slice(1), 10) : NaN;
				if (!Number.isInteger(numeric) || numeric < 1 || numeric > 1114111 || numeric >= 55296 && numeric <= 57343) throw new DocumentReadError("Office XML contains an unsupported entity reference", "DOCUMENT_XML_ENTITY");
				return String.fromCodePoint(numeric);
			}
		}
	});
}
function parseAttributes(source) {
	const result = Object.create(null);
	const matcher = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/gu;
	let match;
	while ((match = matcher.exec(source)) !== null) {
		const name = localName(match[1]);
		const value = decodeEntities(match[3] ?? match[4] ?? "");
		result[name] = value;
		result[name.toLowerCase()] = value;
	}
	return result;
}
/** A deliberately small, non-validating XML reader: external entities and DTDs are rejected. */
function parseXml(xml, maxNodes = 1e6) {
	if (xml.length > 52428800) throw new DocumentReadError("Office XML part exceeds the 50 MB parser limit", "DOCUMENT_XML_TOO_LARGE");
	if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) throw new DocumentReadError("Office XML with DTD or entity declarations is not accepted", "DOCUMENT_XML_DTD");
	const root = {
		name: "#document",
		attributes: Object.create(null),
		children: [],
		text: ""
	};
	const stack = [root];
	let nodes = 0;
	let cursor = 0;
	while (cursor < xml.length) {
		const open = xml.indexOf("<", cursor);
		const parent = stack.at(-1);
		if (open === -1) {
			if (cursor < xml.length) parent.text += decodeEntities(xml.slice(cursor));
			break;
		}
		if (open > cursor) parent.text += decodeEntities(xml.slice(cursor, open));
		if (xml.startsWith("<!--", open)) {
			const end = xml.indexOf("-->", open + 4);
			if (end === -1) throw new DocumentReadError("Office XML has an unterminated comment", "DOCUMENT_XML_INVALID");
			cursor = end + 3;
			continue;
		}
		if (xml.startsWith("<![CDATA[", open)) {
			const end = xml.indexOf("]]>", open + 9);
			if (end === -1) throw new DocumentReadError("Office XML has an unterminated CDATA section", "DOCUMENT_XML_INVALID");
			parent.text += xml.slice(open + 9, end);
			cursor = end + 3;
			continue;
		}
		if (xml.startsWith("<?", open)) {
			const end = xml.indexOf("?>", open + 2);
			if (end === -1) throw new DocumentReadError("Office XML has an unterminated processing instruction", "DOCUMENT_XML_INVALID");
			cursor = end + 2;
			continue;
		}
		const close = tagEnd(xml, open + 1);
		if (close === -1) throw new DocumentReadError("Office XML has an unterminated tag", "DOCUMENT_XML_INVALID");
		const raw = xml.slice(open + 1, close).trim();
		if (raw.startsWith("!")) throw new DocumentReadError("Office XML contains an unsupported declaration", "DOCUMENT_XML_DTD");
		if (raw.startsWith("/")) {
			const expected = localName(raw.slice(1).trim());
			if (stack.length === 1 || stack.at(-1).name !== expected) throw new DocumentReadError("Office XML contains mismatched tags", "DOCUMENT_XML_INVALID");
			stack.pop();
			cursor = close + 1;
			continue;
		}
		const selfClosing = raw.endsWith("/");
		const body = selfClosing ? raw.slice(0, -1).trimEnd() : raw;
		const nameEnd = body.search(/\s/u);
		const name = localName(nameEnd === -1 ? body : body.slice(0, nameEnd));
		if (!name) throw new DocumentReadError("Office XML contains an empty tag name", "DOCUMENT_XML_INVALID");
		const node = {
			name,
			attributes: parseAttributes(nameEnd === -1 ? "" : body.slice(nameEnd + 1)),
			children: [],
			text: ""
		};
		parent.children.push(node);
		nodes += 1;
		if (nodes > maxNodes) throw new DocumentReadError("Office XML exceeds the parser node limit", "DOCUMENT_XML_TOO_LARGE");
		if (!selfClosing) stack.push(node);
		cursor = close + 1;
	}
	if (stack.length !== 1) throw new DocumentReadError("Office XML contains unclosed tags", "DOCUMENT_XML_INVALID");
	return root;
}
/**
* Validate XML and deliver SAX-style events without retaining a document tree.
* Large worksheet parts can contain millions of cells, so building one object
* per XML tag would defeat the parser worker's memory ceiling.
*/
function walkXml(xml, visitor, maxNodes = 1e7) {
	if (xml.length > 314572800) throw new DocumentReadError("Office XML part exceeds the 300 MB parser limit", "DOCUMENT_XML_TOO_LARGE");
	if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) throw new DocumentReadError("Office XML with DTD or entity declarations is not accepted", "DOCUMENT_XML_DTD");
	const stack = [];
	let nodes = 0;
	let roots = 0;
	let cursor = 0;
	while (cursor < xml.length) {
		const open = xml.indexOf("<", cursor);
		if (open === -1) {
			const tail = decodeEntities(xml.slice(cursor));
			if (tail) visitor.text(tail);
			break;
		}
		if (open > cursor) {
			const text = decodeEntities(xml.slice(cursor, open));
			if (text) visitor.text(text);
		}
		if (xml.startsWith("<!--", open)) {
			const end = xml.indexOf("-->", open + 4);
			if (end === -1) throw new DocumentReadError("Office XML has an unterminated comment", "DOCUMENT_XML_INVALID");
			cursor = end + 3;
			continue;
		}
		if (xml.startsWith("<![CDATA[", open)) {
			const end = xml.indexOf("]]>", open + 9);
			if (end === -1) throw new DocumentReadError("Office XML has an unterminated CDATA section", "DOCUMENT_XML_INVALID");
			visitor.text(xml.slice(open + 9, end));
			cursor = end + 3;
			continue;
		}
		if (xml.startsWith("<?", open)) {
			const end = xml.indexOf("?>", open + 2);
			if (end === -1) throw new DocumentReadError("Office XML has an unterminated processing instruction", "DOCUMENT_XML_INVALID");
			cursor = end + 2;
			continue;
		}
		const close = tagEnd(xml, open + 1);
		if (close === -1) throw new DocumentReadError("Office XML has an unterminated tag", "DOCUMENT_XML_INVALID");
		const raw = xml.slice(open + 1, close).trim();
		if (raw.startsWith("!")) throw new DocumentReadError("Office XML contains an unsupported declaration", "DOCUMENT_XML_DTD");
		if (raw.startsWith("/")) {
			const name = localName(raw.slice(1).trim());
			if (stack.at(-1) !== name) throw new DocumentReadError("Office XML contains mismatched tags", "DOCUMENT_XML_INVALID");
			visitor.end(name);
			stack.pop();
			cursor = close + 1;
			continue;
		}
		const selfClosing = raw.endsWith("/");
		const body = selfClosing ? raw.slice(0, -1).trimEnd() : raw;
		const nameEnd = body.search(/\s/u);
		const name = localName(nameEnd === -1 ? body : body.slice(0, nameEnd));
		if (!name) throw new DocumentReadError("Office XML contains an empty tag name", "DOCUMENT_XML_INVALID");
		nodes += 1;
		if (nodes > maxNodes) throw new DocumentReadError("Office XML exceeds the parser node limit", "DOCUMENT_XML_TOO_LARGE");
		if (stack.length === 0 && ++roots > 1) throw new DocumentReadError("Office XML has multiple document roots", "DOCUMENT_XML_INVALID");
		const attributes = parseAttributes(nameEnd === -1 ? "" : body.slice(nameEnd + 1));
		visitor.start(name, attributes);
		if (selfClosing) visitor.end(name);
		else stack.push(name);
		cursor = close + 1;
	}
	if (stack.length !== 0) throw new DocumentReadError("Office XML contains unclosed tags", "DOCUMENT_XML_INVALID");
	if (roots !== 1) throw new DocumentReadError("Office XML has no document root", "DOCUMENT_XML_INVALID");
}
function descendants(node, name) {
	const found = [];
	const stack = [...node.children].reverse();
	while (stack.length > 0) {
		const current = stack.pop();
		if (current.name === name) found.push(current);
		for (let index = current.children.length - 1; index >= 0; index -= 1) stack.push(current.children[index]);
	}
	return found;
}
function firstDescendant(node, name) {
	const stack = [...node.children].reverse();
	while (stack.length > 0) {
		const current = stack.pop();
		if (current.name === name) return current;
		for (let index = current.children.length - 1; index >= 0; index -= 1) stack.push(current.children[index]);
	}
}
function directChildren(node, name) {
	return node.children.filter((child) => child.name === name);
}
function textContent(node) {
	const parts = [];
	const stack = [node];
	while (stack.length > 0) {
		const current = stack.pop();
		if (current.text) parts.push(current.text);
		for (let index = current.children.length - 1; index >= 0; index -= 1) stack.push(current.children[index]);
	}
	return parts.join("");
}
//#endregion
//#region lib/types/zip.js
const ZIP_MAX_ENTRIES = 1e4;
const ZIP_MAX_XML_PART_BYTES = 52428800;
/** Inspect central-directory sizes before any decompression takes place. */
function inspectZip(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const searchFrom = Math.max(0, bytes.length - 65557);
	let eocd = -1;
	for (let offset = bytes.length - 22; offset >= searchFrom; offset -= 1) if (view.getUint32(offset, true) === 101010256) {
		eocd = offset;
		break;
	}
	if (eocd < 0 || eocd + 22 > bytes.length) throw new DocumentReadError("Office file is a malformed ZIP archive", "DOCUMENT_ZIP_INVALID");
	const disk = view.getUint16(eocd + 4, true);
	const directoryDisk = view.getUint16(eocd + 6, true);
	const diskEntries = view.getUint16(eocd + 8, true);
	const totalEntries = view.getUint16(eocd + 10, true);
	const directoryBytes = view.getUint32(eocd + 12, true);
	const directoryOffset = view.getUint32(eocd + 16, true);
	if (disk !== 0 || directoryDisk !== 0 || diskEntries !== totalEntries) throw new DocumentReadError("Multi-disk ZIP archives are not supported", "DOCUMENT_ZIP_UNSUPPORTED");
	if (totalEntries === 65535 || directoryBytes === 4294967295 || directoryOffset === 4294967295) throw new DocumentReadError("ZIP64 Office files are not supported", "DOCUMENT_ZIP_UNSUPPORTED");
	if (totalEntries > 1e4) throw new DocumentReadError(`Office archive has more than ${ZIP_MAX_ENTRIES.toLocaleString()} entries`, "DOCUMENT_ZIP_TOO_MANY_ENTRIES");
	if (directoryOffset + directoryBytes > eocd || directoryOffset > bytes.length) throw new DocumentReadError("Office file has an invalid ZIP directory", "DOCUMENT_ZIP_INVALID");
	const entries = /* @__PURE__ */ new Map();
	let offset = directoryOffset;
	let expandedTotal = 0;
	for (let index = 0; index < totalEntries; index += 1) {
		if (offset + 46 > eocd || view.getUint32(offset, true) !== 33639248) throw new DocumentReadError("Office file has a malformed ZIP directory entry", "DOCUMENT_ZIP_INVALID");
		const flags = view.getUint16(offset + 8, true);
		const method = view.getUint16(offset + 10, true);
		const compressedBytes = view.getUint32(offset + 20, true);
		const expandedBytes = view.getUint32(offset + 24, true);
		const nameBytes = view.getUint16(offset + 28, true);
		const extraBytes = view.getUint16(offset + 30, true);
		const commentBytes = view.getUint16(offset + 32, true);
		const localOffset = view.getUint32(offset + 42, true);
		const next = offset + 46 + nameBytes + extraBytes + commentBytes;
		if (next > eocd || next > bytes.length) throw new DocumentReadError("Office file has a truncated ZIP directory name", "DOCUMENT_ZIP_INVALID");
		if ((flags & 1) !== 0) throw new DocumentReadError("Encrypted Office documents are not supported", "DOCUMENT_ENCRYPTED");
		if (compressedBytes === 4294967295 || expandedBytes === 4294967295 || localOffset === 4294967295) throw new DocumentReadError("ZIP64 Office files are not supported", "DOCUMENT_ZIP_UNSUPPORTED");
		if (method !== 0 && method !== 8) throw new DocumentReadError(`Office ZIP compression method ${method} is not supported`, "DOCUMENT_ZIP_UNSUPPORTED");
		const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameBytes));
		if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) throw new DocumentReadError("Office archive contains an unsafe entry path", "DOCUMENT_ZIP_INVALID");
		if (entries.has(name)) throw new DocumentReadError(`Office archive has duplicate entry ${name}`, "DOCUMENT_ZIP_INVALID");
		if (expandedBytes > 0 && (compressedBytes === 0 || expandedBytes / compressedBytes > 100)) throw new DocumentReadError(`Office entry ${name} exceeds the 100:1 compression-ratio limit`, "DOCUMENT_ZIP_BOMB");
		expandedTotal += expandedBytes;
		if (expandedTotal > 524288e3) throw new DocumentReadError("Office archive expands beyond the 500 MB safety limit", "DOCUMENT_ZIP_BOMB");
		entries.set(name, {
			name,
			compressedBytes,
			expandedBytes,
			method,
			localOffset
		});
		offset = next;
	}
	if (offset !== directoryOffset + directoryBytes) throw new DocumentReadError("Office file has an inconsistent ZIP directory size", "DOCUMENT_ZIP_INVALID");
	return entries;
}
/** Decompress only requested entries after the entire archive has passed size checks. */
function extractZipEntries(bytes, catalog, requested, maxPartBytes = ZIP_MAX_XML_PART_BYTES) {
	for (const name of requested) {
		if (!catalog.has(name)) throw new DocumentReadError(`Office archive is missing ${name}`, "DOCUMENT_PART_MISSING");
		if (catalog.get(name).expandedBytes > maxPartBytes) throw new DocumentReadError(`Office XML part ${name} exceeds the ${Math.floor(maxPartBytes / 1048576)} MB parser limit`, "DOCUMENT_XML_TOO_LARGE");
	}
	try {
		const archive = unzipSync(bytes, { filter: (entry) => requested.has(entry.name) });
		return new Map(Object.entries(archive));
	} catch (cause) {
		if (cause instanceof DocumentReadError) throw cause;
		throw new DocumentReadError("Office archive could not be safely decompressed", "DOCUMENT_ZIP_INVALID", { cause });
	}
}
function textPart(parts, name, maxBytes = ZIP_MAX_XML_PART_BYTES) {
	const data = parts.get(name);
	if (!data) throw new DocumentReadError(`Office archive is missing ${name}`, "DOCUMENT_PART_MISSING");
	if (data.byteLength > maxBytes) throw new DocumentReadError(`Office XML part ${name} exceeds the ${Math.floor(maxBytes / 1048576)} MB parser limit`, "DOCUMENT_XML_TOO_LARGE");
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(data);
	} catch (cause) {
		throw new DocumentReadError(`Office XML part ${name} is not valid UTF-8`, "DOCUMENT_XML_INVALID", { cause });
	}
}
//#endregion
//#region lib/types/legacy-office.js
const OLE_HEADER = [
	208,
	207,
	17,
	224,
	161,
	177,
	26,
	225
];
function isOleCompoundFile(bytes) {
	return OLE_HEADER.every((byte, index) => bytes[index] === byte);
}
function officeEncryptionMarkersPresent(bytes) {
	if (!isOleCompoundFile(bytes)) return false;
	const data = Buffer.from(bytes);
	for (const marker of ["EncryptionInfo", "EncryptedPackage"]) {
		const ascii = Buffer.from(marker, "ascii");
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
		if (data.includes(ascii) || data.includes(utf16le) || data.includes(utf16be)) return true;
	}
	return false;
}
//#endregion
//#region lib/types/parse.js
const PDF_MAX_BYTES = 104857600;
const OFFICE_MAX_BYTES = 52428800;
const PDF_MAX_PAGES = 2e3;
const SEGMENT_MAX = 20;
const SHEET_MAX_ROWS = 200;
const SHEET_MAX_COLUMNS = 50;
const CELL_MAX_CHARS = 200;
const XLSX_WORKSHEET_XML_BYTES = 314572800;
const IMAGE_MAX_COUNT = 8;
const IMAGE_MAX_BYTES = 10485760;
const IMAGE_MAX_TOTAL_BYTES = 26214400;
const require = createRequire(import.meta.url);
const IMAGE_TYPES = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp"
};
function imageTypeForPath(path) {
	const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
	return IMAGE_TYPES[extension];
}
function imageReferences(node) {
	return descendants(node, "blip").flatMap((blip) => blip.attributes.embed ? [blip.attributes.embed] : []);
}
function imageDimensions(data) {
	if (data.length >= 24 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) {
		const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
		return {
			width: view.getUint32(16),
			height: view.getUint32(20)
		};
	}
	if (data.length >= 10 && data[0] === 71 && data[1] === 73 && data[2] === 70) return {
		width: data[6] | data[7] << 8,
		height: data[8] | data[9] << 8
	};
	if (data.length >= 30 && data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70 && data[8] === 87 && data[9] === 69 && data[10] === 66 && data[11] === 80) {
		if (String.fromCharCode(data[12], data[13], data[14], data[15]) === "VP8X") return {
			width: 1 + data[24] + (data[25] << 8) + (data[26] << 16),
			height: 1 + data[27] + (data[28] << 8) + (data[29] << 16)
		};
	}
	if (data.length > 4 && data[0] === 255 && data[1] === 216) {
		let offset = 2;
		while (offset + 9 < data.length) {
			if (data[offset] !== 255) {
				offset += 1;
				continue;
			}
			const marker = data[offset + 1];
			const size = data[offset + 2] << 8 | data[offset + 3];
			if ([
				192,
				193,
				194,
				195,
				197,
				198,
				199,
				201,
				202,
				203,
				205,
				206,
				207
			].includes(marker)) return {
				width: data[offset + 7] << 8 | data[offset + 8],
				height: data[offset + 5] << 8 | data[offset + 6]
			};
			if (size < 2) break;
			offset += 2 + size;
		}
	}
}
function relatedOfficeImages(bytes, catalog, relationshipsPath, basePath, usedIds, location, maxCandidates = IMAGE_MAX_COUNT, maxTotalBytes = IMAGE_MAX_TOTAL_BYTES) {
	if (usedIds.size === 0 || !catalog.has(relationshipsPath)) return {
		candidates: [],
		omitted: 0
	};
	const relationships = rootOf(extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set([relationshipsPath])), relationshipsPath);
	const candidates = [];
	let omitted = 0;
	let totalBytes = 0;
	for (const relation of descendants(relationships, "Relationship")) {
		const id = relation.attributes.id;
		const target = relation.attributes.target;
		if (!id || !usedIds.has(id) || !target || relation.attributes.targetmode?.toLowerCase() === "external") continue;
		if (!relation.attributes.type?.endsWith("/image")) continue;
		const targetPath = resolvePartTarget(basePath, target);
		const mediaType = imageTypeForPath(targetPath);
		if (!mediaType || !catalog.has(targetPath)) {
			omitted += 1;
			continue;
		}
		const data = extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set([targetPath])).get(targetPath);
		if (data.byteLength === 0 || data.byteLength > IMAGE_MAX_BYTES || candidates.length >= maxCandidates || totalBytes + data.byteLength > maxTotalBytes) {
			omitted += 1;
			continue;
		}
		candidates.push({
			data,
			mediaType,
			name: location + "/" + targetPath.slice(targetPath.lastIndexOf("/") + 1)
		});
		totalBytes += data.byteLength;
	}
	return {
		candidates,
		omitted
	};
}
function resolvePartTarget(base, target) {
	if (target.includes("\\")) throw new DocumentReadError("Office relationship contains an unsafe path.", "DOCUMENT_PART_MISSING");
	const parts = target.startsWith("/") ? [] : base.split("/").filter(Boolean);
	for (const segment of target.replace(/^\//u, "").split("/")) {
		if (!segment || segment === ".") continue;
		if (segment === "..") {
			if (parts.length === 0) throw new DocumentReadError("Office relationship escapes the package root.", "DOCUMENT_PART_MISSING");
			parts.pop();
		} else parts.push(segment);
	}
	return parts.join("/");
}
function detectDocument(bytes) {
	if (new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 2048))).startsWith("%PDF-")) return { kind: "pdf" };
	if (isOleCompoundFile(bytes)) {
		if (officeEncryptionMarkersPresent(bytes)) throw new DocumentReadError("This Office document is encrypted. Remove its password and retry.", "DOCUMENT_ENCRYPTED");
		throw new DocumentReadError("This is a legacy .doc, .ppt, or .xls file. To read it, install LibreOffice and approve the isolated conversion, or save it as .docx, .pptx, or .xlsx.", "DOCUMENT_LEGACY_OFFICE");
	}
	if (bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4) {
		const catalog = inspectZip(bytes);
		if (!catalog.has("[Content_Types].xml")) throw new DocumentReadError("ZIP archive is not a supported Office document.", "DOCUMENT_UNSUPPORTED");
		const manifest = textPart(extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set(["[Content_Types].xml"])), "[Content_Types].xml");
		if (/\/ppt\/presentation\.xml/u.test(manifest)) return {
			kind: "pptx",
			catalog
		};
		if (/\/word\/document\.xml/u.test(manifest)) return {
			kind: "docx",
			catalog
		};
		if (/\/xl\/workbook\.xml/u.test(manifest)) return {
			kind: "xlsx",
			catalog
		};
		throw new DocumentReadError("ZIP archive is not a supported .pptx, .docx, or .xlsx file.", "DOCUMENT_UNSUPPORTED");
	}
	throw new DocumentReadError("Unsupported document type. Supported formats are PDF, PPTX, DOCX, and XLSX.", "DOCUMENT_UNSUPPORTED");
}
function estimateTokens(value) {
	let cjk = 0;
	for (const character of value) {
		const code = character.codePointAt(0);
		if (code >= 11904 && code <= 40959 || code >= 63744 && code <= 64255) cjk += 1;
	}
	return Math.ceil(cjk * 1.3 + ([...value].length - cjk) / 4);
}
function result(value, metadata = {}, maxBytes = 51200) {
	const lines = [value];
	const outline = [];
	let clipped = false;
	const nextText = metadata.next ? "\n\nNext: " + metadata.next : "";
	const fits = (candidate) => Buffer.byteLength(candidate + nextText, "utf8") <= maxBytes;
	if (metadata.outline?.length) {
		if (fits(lines.concat("", "Outline:").join("\n"))) lines.push("", "Outline:");
		else clipped = true;
		for (const entry of metadata.outline) {
			if (clipped) break;
			if (!fits(lines.concat("- " + entry).join("\n"))) {
				clipped = true;
				break;
			}
			outline.push(entry);
			lines.push("- " + entry);
		}
		if (clipped) {
			if (fits(lines.concat("- [outline clipped by the output limit]").join("\n"))) lines.push("- [outline clipped by the output limit]");
		}
	}
	if (metadata.next) lines.push("", "Next: " + metadata.next);
	let contentText = lines.join("\n");
	if (Buffer.byteLength(contentText, "utf8") > maxBytes) {
		const notice = "\n\n[Output clipped by the configured byte limit]";
		const room = Math.max(0, maxBytes - Buffer.byteLength(notice + nextText, "utf8"));
		let base = "";
		let used = 0;
		for (const character of value) {
			const size = Buffer.byteLength(character, "utf8");
			if (used + size > room) break;
			base += character;
			used += size;
		}
		contentText = base + notice + nextText;
		if (metadata.outline) outline.length = 0;
		clipped = true;
	}
	return {
		...metadata,
		...metadata.outline ? { outline } : {},
		content: [{
			type: "text",
			text: contentText
		}],
		truncated: Boolean(metadata.truncated || clipped),
		tokensEstimate: estimateTokens(contentText)
	};
}
function bounded(value, maxBytes, next) {
	const footerBytes = next ? Buffer.byteLength("\n\nNext: " + next, "utf8") : 0;
	if (Buffer.byteLength(value, "utf8") + footerBytes <= maxBytes) return result(value, next ? { next } : {}, maxBytes);
	let excerpt = value;
	const notice = "\n\n[Output reached the configured byte limit and was truncated.]";
	while (Buffer.byteLength(excerpt + notice, "utf8") + footerBytes > maxBytes && excerpt.length > 0) excerpt = excerpt.slice(0, Math.floor(excerpt.length * .8));
	return result(excerpt + notice, {
		truncated: true,
		...next ? { next } : {}
	}, maxBytes);
}
function parseRange(value, total, name) {
	if (value === void 0 || value.trim() === "") {
		if (total > SEGMENT_MAX) throw new DocumentReadError("Document exceeds the per-call segment limit. Inspect the outline and specify a range.", "DOCUMENT_RANGE_REQUIRED");
		return total === 0 ? [1, 0] : [1, total];
	}
	const match = /^(\d+)(?:\s*-\s*(\d+))?$/u.exec(value.trim());
	if (!match) throw new DocumentReadError(name + " must be a number or an ascending range such as 1-5.", "DOCUMENT_RANGE_INVALID");
	const start = Number(match[1]);
	const end = Number(match[2] ?? match[1]);
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start + 1 > SEGMENT_MAX) throw new DocumentReadError(name + " range must be ascending and include at most 20 segments.", "DOCUMENT_RANGE_LIMIT");
	if (start > total) throw new DocumentReadError(name + " " + start + " exceeds the document length of " + total + ".", "DOCUMENT_RANGE_INVALID");
	return [start, Math.min(end, total)];
}
function pdfPageText(items) {
	const lines = [];
	for (const item of items) {
		const value = item.str?.trim();
		if (!value) continue;
		const x = item.transform?.[4] ?? 0;
		const y = item.transform?.[5] ?? 0;
		const line = lines.find((candidate) => Math.abs(candidate.y - y) < 2.5);
		if (line) {
			line.x = Math.min(line.x, x);
			line.text += " " + value;
		} else lines.push({
			y,
			x,
			text: value
		});
	}
	return lines.sort((a, b) => b.y - a.y || a.x - b.x).map((line) => line.text).join("\n");
}
async function inspectPdfPage(pdf, pageNumber) {
	const page = await pdf.getPage(pageNumber);
	const text = pdfPageText((await page.getTextContent({ includeMarkedContent: false })).items.filter((item) => "str" in item));
	let scanned = false;
	if (text.length < 20) {
		const operators = await page.getOperatorList();
		const imageOps = new Set([
			OPS.paintImageXObject,
			OPS.paintInlineImageXObject,
			OPS.paintImageMaskXObject,
			OPS.paintImageMaskXObjectGroup,
			OPS.paintImageXObjectRepeat
		].filter((value) => typeof value === "number"));
		scanned = operators.fnArray.some((operator) => imageOps.has(operator));
	}
	page.cleanup();
	return {
		text,
		scanned
	};
}
/** Render one scanned PDF page with the system Poppler binary when available. */
async function renderScannedPdfPage(bytes, pageNumber) {
	let directory;
	try {
		directory = await mkdtemp(join(tmpdir(), "taskweaver-document-page-"));
		const inputPath = join(directory, "source.pdf");
		const outputPrefix = join(directory, "page");
		const outputPath = outputPrefix + ".png";
		await writeFile(inputPath, bytes, {
			flag: "wx",
			mode: 384
		});
		if (await new Promise((resolve) => {
			let child;
			let settled = false;
			let timer;
			const finish = (value) => {
				if (settled) return;
				settled = true;
				if (timer) clearTimeout(timer);
				resolve(value);
			};
			try {
				child = spawn("pdftoppm", [
					"-f",
					String(pageNumber),
					"-l",
					String(pageNumber),
					"-singlefile",
					"-scale-to",
					"1568",
					"-png",
					inputPath,
					outputPrefix
				], {
					stdio: "ignore",
					windowsHide: true
				});
			} catch {
				finish(void 0);
				return;
			}
			timer = setTimeout(() => {
				child.kill("SIGKILL");
				finish(void 0);
			}, 18e3);
			child.on("error", () => finish(void 0));
			child.on("close", (value) => finish(value ?? void 0));
		}) !== 0) return void 0;
		const output = await stat(outputPath);
		if (!output.isFile() || output.size < 8 || output.size > IMAGE_MAX_BYTES) return void 0;
		const data = await readFile(outputPath);
		if (data.length < 8 || !data.subarray(0, 8).equals(Buffer.from([
			137,
			80,
			78,
			71,
			13,
			10,
			26,
			10
		]))) return void 0;
		return new Uint8Array(data);
	} catch {
		return;
	} finally {
		if (directory) await rm(directory, {
			recursive: true,
			force: true
		}).catch(() => void 0);
	}
}
/** Render through the bundled native canvas when Poppler is not installed. */
async function renderScannedPdfPageWithCanvas(pdf, pageNumber) {
	let page;
	try {
		const canvasModule = require("@napi-rs/canvas");
		page = await pdf.getPage(pageNumber);
		const initial = page.getViewport({ scale: 1 });
		if (!Number.isFinite(initial.width) || initial.width <= 0 || !Number.isFinite(initial.height) || initial.height <= 0) return void 0;
		const viewport = page.getViewport({ scale: 1568 / initial.width });
		const width = Math.ceil(viewport.width);
		const height = Math.ceil(viewport.height);
		if (width <= 0 || height <= 0 || width > 4096 || height > 4096 || width * height > 8e6) return void 0;
		const canvas = canvasModule.createCanvas(width, height);
		const context = canvas.getContext("2d");
		await page.render({
			canvasContext: context,
			viewport
		}).promise;
		const data = canvas.toBuffer("image/png");
		if (data.length === 0 || data.length > IMAGE_MAX_BYTES) return void 0;
		return new Uint8Array(data);
	} catch {
		return;
	} finally {
		page?.cleanup();
	}
}
async function readPdf(bytes, options) {
	if (bytes.length > (options.maxPdfBytes ?? PDF_MAX_BYTES)) throw new DocumentReadError("PDF exceeds the " + Math.floor((options.maxPdfBytes ?? PDF_MAX_BYTES) / 1048576) + " MB file limit.", "DOCUMENT_TOO_LARGE");
	const loading = getDocument({
		data: Uint8Array.from(bytes),
		isEvalSupported: false,
		useWorkerFetch: false,
		verbosity: 0
	});
	let pdf;
	try {
		pdf = await loading.promise;
	} catch (cause) {
		if (cause?.name === "PasswordException" || /password|encrypt/iu.test(String(cause))) throw new DocumentReadError("This PDF is password-protected. Remove the password and retry.", "DOCUMENT_ENCRYPTED", { cause });
		throw new DocumentReadError("PDF could not be read: " + (cause instanceof Error ? cause.message : String(cause)), "DOCUMENT_PDF_INVALID", { cause });
	}
	try {
		const total = pdf.numPages;
		const outline = [];
		const previews = /* @__PURE__ */ new Map();
		const pageLimit = Math.min(total, PDF_MAX_PAGES);
		if (total > PDF_MAX_PAGES || options.pages === void 0 && total > SEGMENT_MAX) for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
			const preview = await inspectPdfPage(pdf, pageNumber);
			previews.set(pageNumber, preview);
			const firstLine = preview.text.split("\n").find((line) => line.trim())?.slice(0, 180);
			outline.push(pageNumber + ". " + (firstLine || (preview.scanned ? "(Scanned page)" : "(Blank page)")));
		}
		if (total > PDF_MAX_PAGES) return result("PDF has " + total + " pages, above the 2000-page parsing limit. Outline shows the first 2000 pages.", {
			outline,
			next: "Split the PDF into files of at most 2000 pages.",
			truncated: true
		}, options.maxOutputBytes);
		if (options.pages === void 0 && total > SEGMENT_MAX) return result("PDF has " + total + " pages. First call returns its outline; specify pages, up to 20 per call.", {
			outline,
			next: "pages=1-20",
			truncated: true
		}, options.maxOutputBytes);
		const [start, end] = parseRange(options.pages, total, "pages");
		const pieces = [];
		const imageCandidates = [];
		for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
			const page = previews.get(pageNumber) ?? await inspectPdfPage(pdf, pageNumber);
			let fallback = "[Blank page]";
			if (page.scanned) {
				const currentImageBytes = imageCandidates.reduce((sum, candidate) => sum + candidate.data.byteLength, 0);
				if (options.images && imageCandidates.length < IMAGE_MAX_COUNT && currentImageBytes < IMAGE_MAX_TOTAL_BYTES) {
					const data = await renderScannedPdfPage(bytes, pageNumber) ?? await renderScannedPdfPageWithCanvas(pdf, pageNumber);
					if (data && data.byteLength + currentImageBytes <= IMAGE_MAX_TOTAL_BYTES) {
						imageCandidates.push({
							data,
							mediaType: "image/png",
							name: "page-" + pageNumber + ".png"
						});
						fallback = "[Scanned page attached as an image.]";
					} else fallback = "[Scanned page; rendering is unavailable. Install Poppler (pdftoppm) or provide a screenshot.]";
				} else if (options.images) fallback = "[Scanned page image omitted; each call can attach at most 8 images.]";
				else fallback = "[Scanned page; provide a screenshot or a searchable PDF to read this page.]";
			}
			pieces.push("--- Page " + pageNumber + " ---\n" + (page.text || fallback));
		}
		const next = end < total ? "pages=" + (end + 1) + "-" + Math.min(total, end + SEGMENT_MAX) : void 0;
		const response = bounded(pieces.join("\n\n"), options.maxOutputBytes, next);
		return imageCandidates.length ? {
			...response,
			imageCandidates
		} : response;
	} finally {
		await loading.destroy();
	}
}
function rootOf(parts, name) {
	return parseXml(textPart(parts, name));
}
function nodeText(node) {
	return textContent(node).replace(/\s+/gu, " ").trim();
}
function pptxSlidePaths(presentation, rels) {
	const targets = new Map(descendants(rels, "Relationship").map((rel) => [rel.attributes.Id, rel.attributes.Target]));
	return descendants(presentation, "sldId").map((ref) => {
		const target = targets.get(ref.attributes.id ?? "");
		if (!target || target.split("/").includes("..")) throw new DocumentReadError("PPTX slide relationship is missing or unsafe.", "DOCUMENT_PART_MISSING");
		return resolvePartTarget("ppt", target);
	});
}
function pptxTitle(slide) {
	for (const shape of descendants(slide, "sp")) {
		const type = firstDescendant(shape, "ph")?.attributes.type;
		if (type === "title" || type === "ctrTitle") {
			const value = descendants(shape, "t").map(nodeText).filter(Boolean).join(" ");
			if (value) return value;
		}
	}
	return descendants(slide, "t").map(nodeText).find(Boolean) ?? "(Untitled)";
}
function pptxBody(slide) {
	const lines = [];
	for (const shape of descendants(slide, "sp")) {
		const type = firstDescendant(shape, "ph")?.attributes.type;
		if (type === "title" || type === "ctrTitle") continue;
		for (const paragraph of descendants(shape, "p")) {
			const value = descendants(paragraph, "t").map(nodeText).filter(Boolean).join("");
			if (!value) continue;
			const properties = firstDescendant(paragraph, "pPr");
			const level = Math.max(0, Number(properties?.attributes.lvl ?? "0") || 0);
			const isBullet = properties !== void 0 && (properties.attributes.lvl !== void 0 || firstDescendant(properties, "buChar") !== void 0 || firstDescendant(properties, "buAutoNum") !== void 0) && firstDescendant(properties, "buNone") === void 0;
			lines.push((isBullet ? "  ".repeat(Math.min(level, 8)) + "- " : "") + value);
		}
	}
	for (const table of descendants(slide, "tbl")) {
		const rows = descendants(table, "tr").map((row) => descendants(row, "tc").map((cell) => descendants(cell, "t").map(nodeText).filter(Boolean).join(" ").replace(/\|/gu, "\\|")));
		if (rows.length > 0) {
			lines.push("| " + rows[0].join(" | ") + " |");
			lines.push("| " + rows[0].map(() => "---").join(" | ") + " |");
			for (const row of rows.slice(1)) lines.push("| " + row.join(" | ") + " |");
		}
	}
	return lines.join("\n");
}
function notesForSlide(bytes, catalog, path) {
	const relsPath = "ppt/slides/_rels/" + path.slice(path.lastIndexOf("/") + 1) + ".rels";
	if (!catalog.has(relsPath)) return void 0;
	const target = descendants(rootOf(extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set([relsPath])), relsPath), "Relationship").find((item) => item.attributes.type?.endsWith("/notesSlide"))?.attributes.Target;
	if (!target) return void 0;
	let notesPath;
	try {
		notesPath = resolvePartTarget("ppt/slides", target);
	} catch {
		return;
	}
	if (!catalog.has(notesPath)) return void 0;
	return descendants(rootOf(extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set([notesPath])), notesPath), "sp").filter((shape) => {
		const kind = firstDescendant(shape, "ph")?.attributes.type;
		return ![
			"sldNum",
			"slidenum",
			"sldImg"
		].includes(kind ?? "");
	}).flatMap((shape) => descendants(shape, "t").map(nodeText)).filter(Boolean).join(" ") || void 0;
}
async function readPptx(bytes, options, catalog) {
	if (bytes.length > (options.maxOfficeBytes ?? OFFICE_MAX_BYTES)) throw new DocumentReadError("Office file exceeds the configured file limit.", "DOCUMENT_TOO_LARGE");
	const basics = extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set(["ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"]));
	const paths = pptxSlidePaths(rootOf(basics, "ppt/presentation.xml"), rootOf(basics, "ppt/_rels/presentation.xml.rels"));
	const titles = [];
	for (const path of paths) {
		if (!catalog.has(path)) throw new DocumentReadError("PPTX is missing " + path, "DOCUMENT_PART_MISSING");
		const slide = rootOf(extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set([path])), path);
		titles.push(pptxTitle(slide));
	}
	const outline = titles.map((title, index) => index + 1 + ". " + title);
	if (options.pages === void 0 && paths.length > SEGMENT_MAX) return result("Presentation has " + paths.length + " slides. First call returns its outline; specify pages, up to 20 slides per call.", {
		outline,
		next: "pages=1-20",
		truncated: true
	}, options.maxOutputBytes);
	const [start, end] = parseRange(options.pages, paths.length, "pages");
	const content = [];
	const imageCandidates = [];
	for (let page = start; page <= end; page += 1) {
		const path = paths[page - 1];
		const slide = rootOf(extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set([path])), path);
		let section = "## Slide " + page + ": " + titles[page - 1] + "\n" + pptxBody(slide);
		const notes = notesForSlide(bytes, catalog, path);
		if (notes) section += "\n> Notes: " + notes;
		const relsPath = "ppt/slides/_rels/" + path.slice(path.lastIndexOf("/") + 1) + ".rels";
		if (catalog.has(relsPath)) {
			const rels = rootOf(extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set([relsPath])), relsPath);
			const ids = new Set(imageReferences(slide));
			const imageRelations = descendants(rels, "Relationship").filter((rel) => ids.has(rel.attributes.id ?? "") && rel.attributes.type?.endsWith("/image"));
			const existingImageBytes = imageCandidates.reduce((sum, candidate) => sum + candidate.data.byteLength, 0);
			const images = relatedOfficeImages(bytes, catalog, relsPath, path.slice(0, path.lastIndexOf("/")), ids, "slide-" + page, IMAGE_MAX_COUNT - imageCandidates.length, IMAGE_MAX_TOTAL_BYTES - existingImageBytes);
			if (imageRelations.length) {
				const labels = images.candidates.map((candidate) => {
					const dimensions = imageDimensions(candidate.data);
					return candidate.name.slice(candidate.name.lastIndexOf("/") + 1) + (dimensions ? " " + dimensions.width + "×" + dimensions.height + " px" : "");
				});
				section += "\n\n[Embedded image(s): " + (labels.join(", ") || "unsupported or unavailable format") + "]";
				if (options.images) {
					for (const candidate of images.candidates) imageCandidates.push(candidate);
					if (Math.max(0, imageRelations.length - images.candidates.length) > 0) section += "\n[Some images were omitted because their format, size, or per-call count is unsupported.]";
				}
			}
		}
		content.push(section);
	}
	const next = end < paths.length ? "pages=" + (end + 1) + "-" + Math.min(paths.length, end + SEGMENT_MAX) : void 0;
	const response = bounded(content.join("\n\n"), options.maxOutputBytes, next);
	return options.images && imageCandidates.length ? {
		...response,
		imageCandidates
	} : response;
}
const DOCX_HIDDEN_REVISION_NODES = /* @__PURE__ */ new Set([
	"ins",
	"del",
	"moveFrom",
	"moveTo",
	"commentRangeStart",
	"commentRangeEnd",
	"commentReference"
]);
function visibleDocxText(node) {
	const parts = [];
	const stack = [node];
	while (stack.length > 0) {
		const current = stack.pop();
		if (DOCX_HIDDEN_REVISION_NODES.has(current.name)) continue;
		if (current.name === "t") {
			if (current.text) parts.push(current.text);
			continue;
		}
		for (let index = current.children.length - 1; index >= 0; index -= 1) stack.push(current.children[index]);
	}
	return parts.join("");
}
function docParagraphText(paragraph) {
	return visibleDocxText(paragraph).replace(/\s+/gu, " ").trim();
}
function docHeadingLevel(paragraph) {
	const style = firstDescendant(paragraph, "pStyle")?.attributes.val?.toLowerCase();
	const match = style ? /heading\s*([1-6])/u.exec(style) : void 0;
	return match ? Number(match[1]) : void 0;
}
function docSections(root) {
	const body = firstDescendant(root, "body");
	if (!body) throw new DocumentReadError("DOCX body is missing.", "DOCUMENT_XML_INVALID");
	const sections = [];
	let current = {
		title: "Document",
		level: 1,
		blocks: [],
		imageIds: []
	};
	const save = () => {
		if (current.title !== "Document" || current.blocks.length) sections.push(current);
	};
	for (const block of body.children) if (block.name === "p") {
		const value = docParagraphText(block);
		const level = docHeadingLevel(block);
		if (level !== void 0) {
			save();
			current = {
				title: value || "(Untitled)",
				level,
				blocks: [],
				imageIds: []
			};
			current.imageIds.push(...imageReferences(block));
		} else {
			if (value) {
				const listLevel = firstDescendant(block, "ilvl")?.attributes.val;
				current.blocks.push((listLevel === void 0 ? "" : "  ".repeat(Math.min(Number(listLevel) || 0, 8)) + "- ") + value);
			}
			current.imageIds.push(...imageReferences(block));
		}
	} else if (block.name === "tbl") {
		const rows = descendants(block, "tr").map((row) => descendants(row, "tc").map((cell) => descendants(cell, "p").map(docParagraphText).filter(Boolean).join("<br>").replace(/\|/gu, "\\|")));
		if (rows.length) {
			current.blocks.push("| " + rows[0].join(" | ") + " |", "| " + rows[0].map(() => "---").join(" | ") + " |");
			current.blocks.push(...rows.slice(1).map((row) => "| " + row.join(" | ") + " |"));
			current.imageIds.push(...imageReferences(block));
		}
	}
	save();
	if (sections.length === 0) sections.push(current);
	if (sections.length !== 1 || sections[0].title !== "Document") return sections;
	const chunks = [];
	let chunk = [];
	let length = 0;
	const flush = () => {
		if (chunk.length === 0) return;
		chunks.push({
			title: "Document part " + (chunks.length + 1),
			level: 1,
			blocks: chunk,
			imageIds: []
		});
		chunk = [];
		length = 0;
	};
	for (const block of sections[0].blocks) {
		if (length > 0 && length + block.length > 2e4) flush();
		if (block.length <= 2e4) {
			chunk.push(block);
			length += block.length;
			continue;
		}
		const characters = Array.from(block);
		for (let offset = 0; offset < characters.length; offset += 2e4) {
			const part = characters.slice(offset, offset + 2e4).join("");
			if (length > 0) flush();
			chunk.push(part);
			length = part.length;
			if (offset + 2e4 < characters.length) flush();
		}
	}
	flush();
	return chunks.length > 0 ? chunks : sections;
}
function docSectionRange(value, count) {
	const match = /^(\d+)(?:\s*-\s*(\d+))?$/u.exec(value.trim());
	if (!match) throw new DocumentReadError("section must be a number or range such as 2-3.", "DOCUMENT_RANGE_INVALID");
	const start = Number(match[1]);
	const end = Number(match[2] ?? match[1]);
	if (start < 1 || end < start || end - start + 1 > SEGMENT_MAX) throw new DocumentReadError("section range must be ascending and contain at most 20 sections.", "DOCUMENT_RANGE_LIMIT");
	if (start > count) throw new DocumentReadError("section is out of range; the document has " + count + " sections.", "DOCUMENT_RANGE_INVALID");
	return [start, Math.min(end, count)];
}
async function readDocx(bytes, options, catalog) {
	if (bytes.length > (options.maxOfficeBytes ?? OFFICE_MAX_BYTES)) throw new DocumentReadError("Office file exceeds the configured file limit.", "DOCUMENT_TOO_LARGE");
	const sections = docSections(rootOf(extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set(["word/document.xml"])), "word/document.xml"));
	const outline = sections.map((section, index) => index + 1 + ". " + "#".repeat(Math.max(1, Math.min(section.level, 6))) + " " + section.title);
	const totalChars = sections.reduce((sum, section) => sum + section.blocks.join("\n").length, 0);
	if (options.section === void 0 && (sections.length > 1 || totalChars > 2e4)) return result("Document has " + sections.length + " sections and about " + totalChars + " body characters. First call returns its outline; specify section.", {
		outline,
		next: "section=1",
		truncated: true
	}, options.maxOutputBytes);
	const [start, end] = options.section ? docSectionRange(options.section, sections.length) : [1, sections.length];
	const selected = sections.slice(start - 1, end);
	const selectedIds = new Set(selected.flatMap((section) => section.imageIds));
	const imagePart = relatedOfficeImages(bytes, catalog, "word/_rels/document.xml.rels", "word", selectedIds, "docx");
	const labels = imagePart.candidates.map((candidate) => {
		const dimensions = imageDimensions(candidate.data);
		return candidate.name.slice(candidate.name.lastIndexOf("/") + 1) + (dimensions ? " " + dimensions.width + "×" + dimensions.height + " px" : "");
	});
	const imageSummary = labels.length > 0 ? "\n\n[Embedded image(s): " + labels.join(", ") + "]" : selectedIds.size > 0 ? "\n\n[Embedded image(s): unsupported or unavailable format]" : "";
	const content = selected.map((section) => "#".repeat(Math.max(1, Math.min(section.level, 6))) + " " + section.title + "\n" + section.blocks.join("\n\n"));
	if (imageSummary) content[content.length - 1] = (content.at(-1) ?? "") + imageSummary;
	const next = end < sections.length ? "section=" + (end + 1) : void 0;
	const response = bounded(content.join("\n\n"), options.maxOutputBytes, next);
	return options.images && imagePart.candidates.length > 0 ? {
		...response,
		imageCandidates: imagePart.candidates
	} : response;
}
function excelColumnToNumber(name) {
	let result = 0;
	for (const character of name.toUpperCase()) result = result * 26 + character.charCodeAt(0) - 64;
	return result;
}
function excelNumberToColumn(value) {
	let number = value;
	let output = "";
	while (number > 0) {
		number -= 1;
		output = String.fromCharCode(65 + number % 26) + output;
		number = Math.floor(number / 26);
	}
	return output;
}
function parseCellAddress(value) {
	const match = /^([A-Z]{1,3})([1-9]\d*)$/iu.exec(value);
	if (!match) throw new DocumentReadError("Invalid XLSX cell address " + value, "DOCUMENT_RANGE_INVALID");
	return {
		column: excelColumnToNumber(match[1]),
		row: Number(match[2])
	};
}
function parseCellRange(value, dimension) {
	const dim = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/iu.exec(dimension);
	if (value === void 0) {
		const last = parseCellAddress(dim?.[2] ?? dim?.[1] ?? "AX200");
		return {
			c1: 1,
			r1: 1,
			c2: Math.min(SHEET_MAX_COLUMNS, last.column),
			r2: Math.min(SHEET_MAX_ROWS, last.row)
		};
	}
	const match = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/iu.exec(value);
	if (!match) throw new DocumentReadError("range must use A1 notation, for example A1:Z200.", "DOCUMENT_RANGE_INVALID");
	const first = parseCellAddress(match[1]);
	const last = parseCellAddress(match[2] ?? match[1]);
	const range = {
		c1: Math.min(first.column, last.column),
		r1: Math.min(first.row, last.row),
		c2: Math.max(first.column, last.column),
		r2: Math.max(first.row, last.row)
	};
	if (range.c2 - range.c1 + 1 > SHEET_MAX_COLUMNS || range.r2 - range.r1 + 1 > SHEET_MAX_ROWS) throw new DocumentReadError("XLSX range is limited to 200 rows × 50 columns per call.", "DOCUMENT_RANGE_LIMIT");
	return range;
}
function workbookParts(bytes, catalog) {
	const parts = extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set(["xl/workbook.xml", "xl/_rels/workbook.xml.rels"]));
	const workbook = rootOf(parts, "xl/workbook.xml");
	const rels = rootOf(parts, "xl/_rels/workbook.xml.rels");
	const targets = new Map(descendants(rels, "Relationship").map((rel) => [rel.attributes.Id, rel.attributes.Target]));
	return {
		workbook,
		sheets: descendants(workbook, "sheet").map((sheet) => {
			const target = targets.get(sheet.attributes.id ?? "");
			if (!target) throw new DocumentReadError("XLSX sheet relationship is missing or unsafe.", "DOCUMENT_PART_MISSING");
			const path = resolvePartTarget("xl", target);
			return {
				name: sheet.attributes.name ?? "(unnamed)",
				path
			};
		})
	};
}
function excelDate(serial, date1904) {
	const offset = date1904 ? 1462 : 0;
	const date = new Date(Date.UTC(1899, 11, 30) + (serial + offset) * 864e5);
	if (!Number.isFinite(date.getTime())) return String(serial);
	return date.toISOString().replace("T", " ").replace(/\.000Z$/u, " UTC");
}
function dateStyleIndexes(root) {
	if (!root) return /* @__PURE__ */ new Set();
	const custom = new Map(descendants(root, "numFmt").map((item) => [Number(item.attributes.numFmtId), item.attributes.formatCode ?? ""]));
	const xfs = descendants(root, "cellXfs")[0];
	if (!xfs) return /* @__PURE__ */ new Set();
	const builtin = /* @__PURE__ */ new Set([
		14,
		15,
		16,
		17,
		18,
		19,
		20,
		21,
		22,
		27,
		30,
		36,
		45,
		46,
		47,
		50,
		57
	]);
	return new Set(directChildren(xfs, "xf").flatMap((xf, index) => {
		const id = Number(xf.attributes.numFmtId ?? "0");
		const code = (custom.get(id) ?? "").replace(/"[^"]*"|\\.|\[[^\]]*\]/gu, "");
		return builtin.has(id) || /[ymdh]/iu.test(code) ? [index] : [];
	}));
}
function formatCellValue(type, style, raw, formula, inlineText, shared, dateStyles, date1904) {
	let value = raw;
	if (type === "s") value = shared[Number(raw)] ?? "";
	else if (type === "inlineStr") value = inlineText;
	else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
	else if (type === "e") value = "#ERROR " + raw;
	else if (raw && dateStyles.has(Number(style ?? "0")) && Number.isFinite(Number(raw))) value = excelDate(Number(raw), date1904);
	if (value.length > CELL_MAX_CHARS) value = value.slice(0, CELL_MAX_CHARS) + "…";
	return formula ? value + (value ? " " : "") + "(=" + formula.trim() + ")" : value;
}
function worksheetDimension(xml) {
	const match = /<(?:[\w.-]+:)?dimension\b([^>]*)\/?\s*>/iu.exec(xml);
	const ref = match?.[1] ? /\bref\s*=\s*(?:"([^"]*)"|'([^']*)')/iu.exec(match[1]) : void 0;
	return ref?.[1] ?? ref?.[2] ?? "A1";
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
	const rows = /* @__PURE__ */ new Map();
	walkXml(xml, {
		start(name, attributes) {
			elementStack.push(name);
			if (name === "dimension") dimension = attributes.ref ?? dimension;
			else if (name === "mergeCell") {
				mergeCount += 1;
				if (merges.length < 12 && attributes.ref) merges.push(attributes.ref);
			} else if (name === "row") {
				const parsed = Number(attributes.r);
				rowNumber = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : (rowNumber ?? 0) + 1;
				currentColumn = 0;
				lastRow = Math.max(lastRow, rowNumber);
			} else if (name === "c") {
				const address = attributes.r;
				let targetRow = rowNumber;
				let targetColumn;
				if (address) {
					const parsed = parseCellAddress(address);
					targetRow = parsed.row;
					targetColumn = parsed.column;
				} else targetColumn = currentColumn + 1;
				currentColumn = targetColumn;
				if (targetRow !== void 0) {
					lastRow = Math.max(lastRow, targetRow);
					lastColumn = Math.max(lastColumn, targetColumn);
				}
				const capture = targetRow !== void 0 && range !== void 0 && targetRow >= range.r1 && targetRow <= range.r2 && targetColumn >= range.c1 && targetColumn <= range.c2;
				cell = {
					row: targetRow ?? 0,
					column: targetColumn,
					capture,
					...attributes.t !== void 0 ? { type: attributes.t } : {},
					...attributes.s !== void 0 ? { style: attributes.s } : {},
					value: "",
					formula: "",
					inlineText: ""
				};
			} else if (name === "f") {
				formulas += 1;
				if (cell?.capture) rangeFormulas += 1;
			}
		},
		text(value) {
			if (!cell?.capture) return;
			switch (elementStack.at(-1)) {
				case "v":
					cell.value += value;
					break;
				case "f":
					cell.formula += value;
					break;
				case "t": if (cell.type === "inlineStr") cell.inlineText += value;
			}
		},
		end(name) {
			if (name === "c" && cell) {
				if (cell.capture) {
					let values = rows.get(cell.row);
					if (!values) rows.set(cell.row, values = /* @__PURE__ */ new Map());
					values.set(cell.column, formatCellValue(cell.type, cell.style, cell.value, cell.formula, cell.inlineText, shared, dateStyles, date1904));
				}
				cell = void 0;
			} else if (name === "row") rowNumber = void 0;
			elementStack.pop();
		}
	});
	const declared = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/iu.exec(dimension);
	if (declared) {
		const last = parseCellAddress(declared[2] ?? declared[1]);
		lastRow = Math.max(lastRow, last.row);
		lastColumn = Math.max(lastColumn, last.column);
	}
	return {
		dimension,
		formulas,
		rangeFormulas,
		merges,
		mergeCount,
		lastRow,
		lastColumn,
		rows
	};
}
async function readXlsx(bytes, options, catalog) {
	if (bytes.length > (options.maxOfficeBytes ?? OFFICE_MAX_BYTES)) throw new DocumentReadError("Office file exceeds the configured file limit.", "DOCUMENT_TOO_LARGE");
	const { workbook, sheets } = workbookParts(bytes, catalog);
	if (!sheets.length) throw new DocumentReadError("XLSX workbook has no worksheets.", "DOCUMENT_XML_INVALID");
	const metadata = /* @__PURE__ */ new Map();
	const outline = [];
	let index = 0;
	if (options.sheet !== void 0) {
		if (/^\d+$/u.test(options.sheet.trim())) index = Number(options.sheet) - 1;
		else index = sheets.findIndex((sheet) => sheet.name === options.sheet);
		if (index < 0 || index >= sheets.length) throw new DocumentReadError("Sheet " + options.sheet + " not found. Available sheets: " + sheets.map((sheet) => sheet.name).join(", "), "DOCUMENT_SHEET_NOT_FOUND");
	}
	const selected = sheets[index];
	const inspect = options.sheet === void 0 ? sheets : [selected];
	let selectedWorksheetXml;
	for (const sheet of inspect) {
		const xml = textPart(extractZipEntries(bytes, catalog, /* @__PURE__ */ new Set([sheet.path]), XLSX_WORKSHEET_XML_BYTES), sheet.path, XLSX_WORKSHEET_XML_BYTES);
		const dimension = worksheetDimension(xml);
		metadata.set(sheet.name, { dimension });
		if (sheet.name === selected.name) selectedWorksheetXml = xml;
		if (options.sheet === void 0) outline.push(sheet.name + " — " + dimension);
	}
	if (options.sheet === void 0) {
		if (sheets.length > 1) return result("Workbook has " + sheets.length + " sheets. First call returns its outline; specify sheet by name or 1-based number.", {
			outline,
			next: "sheet=1",
			truncated: true
		}, options.maxOutputBytes);
	}
	const sheetMeta = metadata.get(selected.name);
	if (options.sheet === void 0) {
		const dimension = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/iu.exec(sheetMeta.dimension);
		const last = parseCellAddress(dimension?.[2] ?? dimension?.[1] ?? "AX200");
		if (sheets.length > 1 || last.row > SHEET_MAX_ROWS || last.column > SHEET_MAX_COLUMNS) return result("Workbook contains worksheet data beyond the per-call range limit. First call returns its outline; specify a sheet to start reading.", {
			outline,
			next: "sheet=1",
			truncated: true
		}, options.maxOutputBytes);
	}
	const range = parseCellRange(options.range, sheetMeta.dimension);
	const sharedPath = "xl/sharedStrings.xml";
	const stylesPath = "xl/styles.xml";
	const requested = /* @__PURE__ */ new Set();
	if (catalog.has(sharedPath)) requested.add(sharedPath);
	if (catalog.has(stylesPath)) requested.add(stylesPath);
	const parts = requested.size > 0 ? extractZipEntries(bytes, catalog, requested) : /* @__PURE__ */ new Map();
	const shared = parts.has(sharedPath) ? descendants(rootOf(parts, sharedPath), "si").map((item) => descendants(item, "t").map(textContent).join("")) : [];
	const dateStyles = dateStyleIndexes(parts.has(stylesPath) ? rootOf(parts, stylesPath) : void 0);
	const worksheetXml = selectedWorksheetXml;
	if (!worksheetXml) throw new DocumentReadError("XLSX worksheet is missing.", "DOCUMENT_PART_MISSING");
	const sheetScan = scanWorksheet(worksheetXml, range, shared, dateStyles, firstDescendant(workbook, "workbookPr")?.attributes.date1904 === "1");
	const rows = sheetScan.rows;
	const actualDimension = sheetScan.dimension;
	const columns = Array.from({ length: range.c2 - range.c1 + 1 }, (_, offset) => excelNumberToColumn(range.c1 + offset));
	const header = ["Row", ...columns.map((column) => column + " (" + column + range.r1 + ")")];
	const output = [
		"Sheet: " + selected.name + "; dimensions: " + actualDimension + "; merged ranges: " + sheetScan.mergeCount + (sheetScan.mergeCount ? " (" + sheetScan.merges.join(", ") + (sheetScan.mergeCount > sheetScan.merges.length ? ", …" : "") + ")" : "") + "; formulas on sheet: " + sheetScan.formulas + "; formulas in this range: " + sheetScan.rangeFormulas,
		"| " + header.join(" | ") + " |",
		"| " + header.map(() => "---").join(" | ") + " |"
	];
	for (let rowNumber = range.r1; rowNumber <= range.r2; rowNumber += 1) {
		const row = rows.get(rowNumber);
		const values = columns.map((_column, offset) => (row?.get(range.c1 + offset) ?? "").replace(/\|/gu, "\\|").replace(/\r?\n/gu, "<br>"));
		output.push("| " + rowNumber + " | " + values.join(" | ") + " |");
	}
	const dimension = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/iu.exec(actualDimension);
	const lastRow = Math.max(range.r2, sheetScan.lastRow, dimension ? Number(dimension[4] ?? dimension[2]) : range.r2);
	const lastColumn = Math.max(range.c2, sheetScan.lastColumn, dimension ? excelColumnToNumber(dimension[3] ?? dimension[1]) : range.c2);
	let next;
	if (range.r2 < lastRow) next = "sheet=" + (index + 1) + "&range=" + excelNumberToColumn(range.c1) + (range.r2 + 1) + ":" + excelNumberToColumn(range.c2) + Math.min(lastRow, range.r2 + SHEET_MAX_ROWS);
	else if (range.c2 < lastColumn) {
		const nextColumn = range.c2 + 1;
		next = "sheet=" + (index + 1) + "&range=" + excelNumberToColumn(nextColumn) + "1:" + excelNumberToColumn(Math.min(lastColumn, nextColumn + SHEET_MAX_COLUMNS - 1)) + Math.min(lastRow, SHEET_MAX_ROWS);
	} else if (index + 1 < sheets.length) next = "sheet=" + (index + 2);
	return bounded(output.join("\n"), options.maxOutputBytes, next);
}
async function parseDocumentBytes(bytes, options) {
	const detected = detectDocument(bytes);
	if (detected.kind === "pdf") return await readPdf(bytes, options);
	if (bytes.length > (options.maxOfficeBytes ?? OFFICE_MAX_BYTES)) throw new DocumentReadError("Office file exceeds the configured file limit.", "DOCUMENT_TOO_LARGE");
	if (!detected.catalog) throw new DocumentReadError("Office archive directory is missing.", "DOCUMENT_ZIP_INVALID");
	if (detected.kind === "pptx") return await readPptx(bytes, options, detected.catalog);
	if (detected.kind === "docx") return await readDocx(bytes, options, detected.catalog);
	return await readXlsx(bytes, options, detected.catalog);
}
//#endregion
//#region lib/types/worker.js
if (!parentPort) throw new Error("tool-document worker must run inside worker_threads");
parentPort.on("message", async (request) => {
	const response = { id: request.id };
	try {
		response.result = await parseDocumentBytes(request.bytes, request.options);
	} catch (error) {
		response.error = {
			message: error instanceof Error ? error.message : String(error),
			...typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? { code: error.code } : {}
		};
	}
	parentPort.postMessage(response);
});
//#endregion
export {};
