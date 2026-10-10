import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { delimiter, dirname, extname, join, resolve } from "node:path";
import { FsError } from "@taskweaver/dsh-fs";
import { runtimeHomePath } from "@taskweaver/dsh-home-paths";
import { defineTool } from "@taskweaver/dsh-tools";
import z from "@taskweaver/schemastery";
import { resolveRegularReadTarget } from "@taskweaver/dsh-tool-fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import "pdfjs-dist/legacy/build/pdf.mjs";
import { unzipSync } from "fflate";
//#region lib/types/cache.js
const DEFAULT_DOCUMENT_CACHE_BYTES = 209715200;
const MAX_CACHED_IMAGE_BYTES = 10485760;
const MAX_CACHE_ENTRY_BYTES = 41943040;
const CACHE_ENTRY_VERSION = 1;
function documentCacheKey(bytes, options) {
	return createHash("sha256").update(bytes).update("\0taskweaver-document-parser-v3\0" + JSON.stringify(options)).digest("hex");
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function decodeResult(value) {
	if (!isRecord(value) || !Array.isArray(value.content) || typeof value.truncated !== "boolean" || !Number.isSafeInteger(value.tokensEstimate) || value.next !== void 0 && typeof value.next !== "string" || value.outline !== void 0 && (!Array.isArray(value.outline) || !value.outline.every((line) => typeof line === "string"))) return void 0;
	const content = [];
	for (const block of value.content) {
		if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") return void 0;
		content.push({
			type: "text",
			text: block.text
		});
	}
	let imageCandidates;
	if (value.imageCandidates !== void 0) {
		if (!Array.isArray(value.imageCandidates)) return void 0;
		imageCandidates = [];
		for (const candidate of value.imageCandidates) {
			if (!isRecord(candidate) || typeof candidate.data !== "string" || typeof candidate.name !== "string" || ![
				"image/png",
				"image/jpeg",
				"image/webp",
				"image/gif"
			].includes(String(candidate.mediaType))) return void 0;
			const data = Buffer.from(candidate.data, "base64");
			if (data.byteLength === 0 || data.byteLength > MAX_CACHED_IMAGE_BYTES || data.toString("base64") !== candidate.data) return void 0;
			imageCandidates.push({
				data: new Uint8Array(data),
				name: candidate.name,
				mediaType: candidate.mediaType
			});
		}
	}
	return {
		content,
		truncated: value.truncated,
		tokensEstimate: value.tokensEstimate,
		...typeof value.next === "string" ? { next: value.next } : {},
		...Array.isArray(value.outline) ? { outline: value.outline } : {},
		...imageCandidates ? { imageCandidates } : {}
	};
}
/** Private DSH-home cache with content-addressed entries and a disk LRU ceiling. */
var DocumentResultCache = class {
	directory;
	maxBytes;
	maintenance = Promise.resolve();
	constructor(directory, maxBytes = DEFAULT_DOCUMENT_CACHE_BYTES) {
		if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("document cache maxBytes must be a non-negative safe integer");
		this.directory = resolve(directory);
		this.maxBytes = maxBytes;
	}
	async ensureDirectory() {
		await mkdir(this.directory, {
			recursive: true,
			mode: 448
		});
		const info = await lstat(this.directory);
		if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("document cache directory must be a real directory");
		await chmod(this.directory, 448);
	}
	fileFor(key) {
		if (!/^[a-f0-9]{64}$/u.test(key)) throw new Error("invalid document cache key");
		return join(this.directory, key + ".json");
	}
	async read(key) {
		try {
			await this.ensureDirectory();
			const path = this.fileFor(key);
			const info = await lstat(path);
			if (!info.isFile() || info.isSymbolicLink() || info.size > Math.min(this.maxBytes, MAX_CACHE_ENTRY_BYTES)) {
				await rm(path, { force: true });
				return;
			}
			const envelope = JSON.parse(await readFile(path, "utf8"));
			if (!isRecord(envelope) || envelope.version !== CACHE_ENTRY_VERSION || envelope.key !== key) {
				await rm(path, { force: true });
				return;
			}
			const decoded = decodeResult(envelope.result);
			if (!decoded) {
				await rm(path, { force: true });
				return;
			}
			const now = /* @__PURE__ */ new Date();
			await utimes(path, now, now);
			return decoded;
		} catch {
			return;
		}
	}
	async write(key, value) {
		if (this.maxBytes === 0) return;
		try {
			await this.ensureDirectory();
			const serialized = JSON.stringify({
				version: CACHE_ENTRY_VERSION,
				key,
				result: {
					...value,
					...value.imageCandidates ? { imageCandidates: value.imageCandidates.map((candidate) => ({
						data: Buffer.from(candidate.data).toString("base64"),
						mediaType: candidate.mediaType,
						name: candidate.name
					})) } : {}
				}
			});
			if (Buffer.byteLength(serialized) > Math.min(this.maxBytes, MAX_CACHE_ENTRY_BYTES)) return;
			const path = this.fileFor(key);
			const temporary = join(this.directory, "." + key + "." + randomUUID() + ".tmp");
			try {
				await writeFile(temporary, serialized, {
					encoding: "utf8",
					flag: "wx",
					mode: 384
				});
				await rename(temporary, path);
			} finally {
				await rm(temporary, { force: true }).catch(() => void 0);
			}
			await this.withMaintenance(() => this.prune(path));
		} catch {}
	}
	withMaintenance(task) {
		const next = this.maintenance.then(task, task);
		this.maintenance = next.catch(() => void 0);
		return next;
	}
	async prune(newestPath) {
		const entries = await readdir(this.directory, { withFileTypes: true });
		const files = [];
		let total = 0;
		for (const entry of entries) {
			if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/u.test(entry.name)) continue;
			const path = join(this.directory, entry.name);
			const metadata = await stat(path).catch(() => void 0);
			if (!metadata?.isFile()) continue;
			files.push({
				path,
				size: metadata.size,
				touched: metadata.mtimeMs
			});
			total += metadata.size;
		}
		files.sort((left, right) => left.touched - right.touched);
		for (const file of files) {
			if (total <= this.maxBytes || file.path === newestPath) continue;
			await rm(file.path, { force: true }).catch(() => void 0);
			total -= file.size;
		}
		if (total > this.maxBytes) await rm(newestPath, { force: true }).catch(() => void 0);
	}
};
//#endregion
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
const MAX_PDF_BYTES$1 = 104857600;
const MAX_OFFICE_BYTES$1 = 52428800;
function isOleCompoundFile(bytes) {
	return OLE_HEADER.every((byte, index) => bytes[index] === byte);
}
function legacyOfficeExtension(path) {
	const extension = extname(path).toLowerCase();
	return extension === ".doc" || extension === ".ppt" || extension === ".xls" ? extension : void 0;
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
function legacyOfficeTarget(extension) {
	switch (extension) {
		case ".doc": return "docx";
		case ".ppt": return "pdf";
		case ".xls": return "xlsx";
	}
}
async function executable(path) {
	try {
		const canonical = await realpath(path);
		if (!(await lstat(canonical)).isFile()) return void 0;
		await access(canonical, constants.X_OK);
		return canonical;
	} catch {
		return;
	}
}
/** Locate LibreOffice without invoking a shell or inheriting any child environment. */
async function findLibreOffice(configuredPath, searchPath = process.env.PATH ?? "") {
	const candidates = [
		configuredPath,
		...searchPath.split(delimiter).filter(Boolean).map((directory) => join(directory, "soffice")),
		"/Applications/LibreOffice.app/Contents/MacOS/soffice"
	].filter((candidate) => Boolean(candidate));
	const visited = /* @__PURE__ */ new Set();
	for (const candidate of candidates) {
		if (visited.has(candidate)) continue;
		visited.add(candidate);
		const path = await executable(candidate);
		if (path) return path;
	}
}
function runLibreOffice(binary, args, environment, signal) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DocumentReadError("LibreOffice conversion was cancelled.", "DOCUMENT_CONVERSION_CANCELLED"));
			return;
		}
		let child;
		try {
			child = spawn(binary, args, {
				cwd: tmpdir(),
				env: environment,
				shell: false,
				stdio: "ignore",
				windowsHide: true
			});
		} catch (cause) {
			reject(new DocumentReadError("LibreOffice could not be started.", "DOCUMENT_CONVERSION_FAILED", { cause }));
			return;
		}
		let settled = false;
		let timeout;
		let failure;
		const finish = (error) => {
			if (settled) return;
			settled = true;
			if (timeout) clearTimeout(timeout);
			signal?.removeEventListener("abort", abort);
			if (error) reject(error);
			else resolve();
		};
		const stop = (error) => {
			if (failure) return;
			failure = error;
			try {
				child.kill("SIGKILL");
			} catch {
				finish(error);
			}
		};
		const abort = () => stop(new DocumentReadError("LibreOffice conversion was cancelled.", "DOCUMENT_CONVERSION_CANCELLED"));
		signal?.addEventListener("abort", abort, { once: true });
		timeout = setTimeout(() => stop(new DocumentReadError("LibreOffice conversion exceeded the 60-second limit.", "DOCUMENT_CONVERSION_TIMEOUT")), 6e4);
		child.once("error", (cause) => finish(new DocumentReadError("LibreOffice could not be started.", "DOCUMENT_CONVERSION_FAILED", { cause })));
		child.once("close", (code) => {
			if (failure) finish(failure);
			else if (code !== 0) finish(new DocumentReadError("LibreOffice could not convert this legacy Office file (exit code " + String(code) + "). It may be encrypted or damaged.", "DOCUMENT_CONVERSION_FAILED"));
			else finish();
		});
	});
}
/**
* Convert an already sandbox-authorized OLE document from a private snapshot.
* The source path supplied by the user is never passed to LibreOffice.
*/
async function convertLegacyOffice(bytes, extension, options = {}) {
	if (!isOleCompoundFile(bytes)) throw new DocumentReadError("File contents do not match a legacy Office document.", "DOCUMENT_TYPE_MISMATCH");
	if (officeEncryptionMarkersPresent(bytes)) throw new DocumentReadError("This Office document is encrypted. Remove its password and retry.", "DOCUMENT_ENCRYPTED");
	const binary = await findLibreOffice(options.sofficePath);
	if (!binary) throw new DocumentReadError("This is a legacy Office format. Save it as .docx, .pptx, or .xlsx, or install LibreOffice and retry.", "DOCUMENT_LIBREOFFICE_UNAVAILABLE");
	const directory = await mkdtemp(join(tmpdir(), "taskweaver-office-convert-"));
	const target = legacyOfficeTarget(extension);
	const targetPath = join(directory, "source." + target);
	const profilePath = join(directory, "profile");
	try {
		const directoryInfo = await lstat(directory);
		if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || (directoryInfo.mode & 63) !== 0) throw new DocumentReadError("Private conversion directory is not safe.", "DOCUMENT_CONVERSION_FAILED");
		await mkdir(profilePath, { mode: 448 });
		const sourcePath = join(directory, "source" + extension);
		await writeFile(sourcePath, bytes, {
			flag: "wx",
			mode: 384
		});
		const environment = {
			PATH: process.env.PATH ?? "/usr/bin:/bin",
			HOME: profilePath,
			TMPDIR: directory,
			TMP: directory,
			TEMP: directory,
			LANG: process.env.LANG ?? "C.UTF-8"
		};
		await runLibreOffice(binary, [
			"--headless",
			"--norestore",
			"--nodefault",
			"--nofirststartwizard",
			"-env:UserInstallation=" + pathToFileURL(profilePath).href,
			"--convert-to",
			target,
			"--outdir",
			directory,
			sourcePath
		], environment, options.signal);
		const info = await lstat(targetPath);
		const maxBytes = target === "pdf" ? MAX_PDF_BYTES$1 : MAX_OFFICE_BYTES$1;
		if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > maxBytes) throw new DocumentReadError("LibreOffice output is missing, unsafe, or larger than the supported document limit.", "DOCUMENT_CONVERSION_FAILED");
		const handle = await open(targetPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
		try {
			const verified = await handle.stat();
			if (!verified.isFile() || verified.size !== info.size) throw new DocumentReadError("LibreOffice output changed while it was being read.", "DOCUMENT_CONVERSION_FAILED");
			return new Uint8Array(await handle.readFile());
		} finally {
			await handle.close();
		}
	} catch (cause) {
		if (cause instanceof DocumentReadError) throw cause;
		if (cause?.code === "ENOENT") throw new DocumentReadError("LibreOffice did not create the expected ." + target + " conversion output.", "DOCUMENT_CONVERSION_FAILED", { cause });
		throw new DocumentReadError("LibreOffice conversion failed.", "DOCUMENT_CONVERSION_FAILED", { cause });
	} finally {
		await rm(directory, {
			recursive: true,
			force: true
		}).catch(() => void 0);
	}
}
//#endregion
//#region lib/types/worker-pool.js
const DEFAULT_POOL_SIZE = 2;
const DEFAULT_WORKER_TIMEOUT_MS = 3e4;
const DEFAULT_WORKER_MEMORY_MB = 512;
function abortError() {
	return /* @__PURE__ */ new Error("Document reading was cancelled.");
}
var DocumentWorkerPool = class {
	slots;
	queue = [];
	nextId = 1;
	size;
	timeoutMs;
	memoryMb;
	workerURL;
	constructor(options = {}) {
		this.size = options.size ?? DEFAULT_POOL_SIZE;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS;
		this.memoryMb = options.memoryMb ?? DEFAULT_WORKER_MEMORY_MB;
		this.workerURL = options.workerURL;
		if (!Number.isSafeInteger(this.size) || this.size < 1) throw new Error("document worker pool size must be a positive integer");
		if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) throw new Error("document worker timeout must be a positive integer");
		if (!Number.isSafeInteger(this.memoryMb) || this.memoryMb < 64) throw new Error("document worker memory limit must be at least 64 MB");
		this.slots = Array.from({ length: this.size }, () => ({
			worker: void 0,
			job: void 0
		}));
	}
	run(bytes, options, signal) {
		if (signal?.aborted) return Promise.reject(abortError());
		return new Promise((resolve, reject) => {
			const job = {
				id: this.nextId++,
				bytes,
				options,
				...signal ? { signal } : {},
				resolve,
				reject
			};
			if (signal) {
				job.abort = () => {
					const queuedAt = this.queue.indexOf(job);
					if (queuedAt !== -1) {
						this.queue.splice(queuedAt, 1);
						reject(abortError());
						return;
					}
					const slot = this.slots.find((item) => item.job === job);
					if (slot) this.stop(slot, abortError());
				};
				signal.addEventListener("abort", job.abort, { once: true });
			}
			this.queue.push(job);
			this.pump();
		});
	}
	createWorker() {
		const source = this.workerURL ?? (import.meta.url.endsWith(".ts") ? new URL("./worker.ts", import.meta.url) : new URL("./worker.js", import.meta.url));
		const options = {
			name: "taskweaver-document-parser",
			resourceLimits: { maxOldGenerationSizeMb: this.memoryMb }
		};
		return new Worker(source, options);
	}
	attachWorker(slot, worker) {
		worker.on("message", (response) => {
			if (slot.worker !== worker) return;
			const job = slot.job;
			if (!job) return;
			if (response.id !== job.id) {
				this.stop(slot, /* @__PURE__ */ new Error("Document parser returned a mismatched request id."));
				return;
			}
			slot.job = void 0;
			const error = response.error ? new DocumentReadError(response.error.message, response.error.code) : void 0;
			this.settle(job, error, response.result);
			worker.unref();
			this.pump();
		});
		worker.on("error", (error) => {
			if (slot.worker === worker) this.stop(slot, new Error("Document parser worker failed: " + error.message, { cause: error }));
		});
		worker.on("exit", (code) => {
			if (slot.worker !== worker) return;
			slot.worker = void 0;
			const job = slot.job;
			slot.job = void 0;
			if (job) this.settle(job, /* @__PURE__ */ new Error("Document parser worker exited unexpectedly (" + code + ")."));
			this.pump();
		});
	}
	pump() {
		for (const slot of this.slots) {
			if (slot.job || this.queue.length === 0) continue;
			const job = this.queue.shift();
			if (job.signal?.aborted) {
				this.settle(job, abortError());
				continue;
			}
			const worker = slot.worker ?? this.createWorker();
			slot.worker = worker;
			if (!slot.job && worker.listenerCount("message") === 0) this.attachWorker(slot, worker);
			slot.job = job;
			worker.ref();
			job.timeout = setTimeout(() => this.stop(slot, /* @__PURE__ */ new Error("Document parsing exceeded the " + this.timeoutMs + " ms time limit. Retry with a smaller document.")), this.timeoutMs);
			const transferable = Uint8Array.from(job.bytes);
			worker.postMessage({
				id: job.id,
				bytes: transferable,
				options: job.options
			}, [transferable.buffer]);
		}
	}
	stop(slot, error) {
		const worker = slot.worker;
		const job = slot.job;
		slot.job = void 0;
		slot.worker = void 0;
		if (job) this.settle(job, error);
		if (worker) worker.terminate().finally(() => this.pump());
		else this.pump();
	}
	settle(job, error, value) {
		if (job.timeout) clearTimeout(job.timeout);
		if (job.abort && job.signal) job.signal.removeEventListener("abort", job.abort);
		if (error) job.reject(error);
		else if (value) job.resolve(value);
		else job.reject(/* @__PURE__ */ new Error("Document parser returned no result."));
	}
};
const documentWorkerPool = new DocumentWorkerPool();
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
createRequire(import.meta.url);
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
function classifyDocument(bytes) {
	return detectDocument(bytes).kind;
}
//#endregion
//#region lib/types/documents.js
const MAX_PDF_BYTES = 104857600;
const MAX_OFFICE_BYTES = 52428800;
const EXTENSION_BY_KIND = {
	pdf: ".pdf",
	pptx: ".pptx",
	docx: ".docx",
	xlsx: ".xlsx",
	ppt: ".ppt",
	doc: ".doc",
	xls: ".xls"
};
function safeDisplayName(value, extension) {
	const base = (value ?? "document").split(/[\\/]/u).at(-1)?.replace(/[\u0000-\u001f\u007f]/gu, "").trim();
	if (!base) return "document" + extension;
	return (base.replace(/\.[^.]*$/u, "") || "document").slice(0, 180) + extension;
}
async function ensurePrivateDirectory(directory) {
	await mkdir(directory, {
		recursive: true,
		mode: 448
	});
	const info = await lstat(directory);
	if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 63) !== 0) throw new DocumentReadError("Document attachment directory must be a private, non-symlink directory.", "DOCUMENT_STORAGE_UNSAFE");
	return realpath(directory);
}
function sessionDirectoryName(sessionId) {
	if (typeof sessionId !== "string" || sessionId.trim().length === 0 || Buffer.byteLength(sessionId, "utf8") > 512) throw new DocumentReadError("A valid session id is required to store an external document.", "DOCUMENT_SESSION_REQUIRED");
	return createHash("sha256").update("taskweaver-document-session\0").update(sessionId).digest("hex");
}
async function verifyExisting(path, expectedDigest) {
	const info = await lstat(path);
	if (!info.isFile() || info.isSymbolicLink()) throw new DocumentReadError("Existing document attachment is not a regular file.", "DOCUMENT_STORAGE_UNSAFE");
	const bytes = await readFile(path);
	if (createHash("sha256").update(bytes).digest("hex") !== expectedDigest) throw new DocumentReadError("Existing document attachment failed its content-address check.", "DOCUMENT_STORAGE_CORRUPT");
}
/**
* Save a bounded external document snapshot outside the workspace. Host upload
* adapters can pass received bytes here and send only the returned `@doc:` ref
* to the agent; the path is derived from verified content, never caller input.
*/
async function storeDocumentSnapshot(bytes, options) {
	if (bytes.byteLength > MAX_PDF_BYTES) throw new DocumentReadError("Document exceeds the 100 MB file limit.", "DOCUMENT_TOO_LARGE");
	if (bytes.length >= 4 && bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4 && bytes.byteLength > MAX_OFFICE_BYTES) throw new DocumentReadError("Office document exceeds the 50 MB file limit.", "DOCUMENT_TOO_LARGE");
	let kind;
	if (isOleCompoundFile(bytes)) {
		if (officeEncryptionMarkersPresent(bytes)) throw new DocumentReadError("This Office document is encrypted. Remove its password and retry.", "DOCUMENT_ENCRYPTED");
		const extension = legacyOfficeExtension(options.name ?? "");
		if (!extension) throw new DocumentReadError("Legacy Office attachments must include a .doc, .ppt, or .xls file name.", "DOCUMENT_LEGACY_FORMAT_UNKNOWN");
		kind = extension.slice(1);
	} else kind = classifyDocument(bytes);
	const extension = EXTENSION_BY_KIND[kind];
	const maxBytes = kind === "pdf" ? MAX_PDF_BYTES : MAX_OFFICE_BYTES;
	if (bytes.byteLength > maxBytes) throw new DocumentReadError("Document exceeds the " + Math.floor(maxBytes / 1048576) + " MB file limit.", "DOCUMENT_TOO_LARGE");
	const digest = createHash("sha256").update(bytes).digest("hex");
	const canonicalDirectory = await ensurePrivateDirectory(resolve(options.directory || runtimeHomePath("documents")));
	const path = join(canonicalDirectory, digest + extension);
	try {
		await verifyExisting(path, digest);
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
		const temporary = join(canonicalDirectory, "." + digest + "." + randomUUID() + ".tmp");
		try {
			await writeFile(temporary, bytes, {
				flag: "wx",
				mode: 384
			});
			const handle = await open(temporary, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
			try {
				await handle.sync();
			} finally {
				await handle.close();
			}
			try {
				await link(temporary, path);
			} catch (cause) {
				if (cause?.code !== "EEXIST") throw cause;
				await verifyExisting(path, digest);
			}
		} finally {
			await rm(temporary, { force: true }).catch(() => void 0);
		}
	}
	const sessionsDirectory = await ensurePrivateDirectory(join(canonicalDirectory, ".sessions"));
	const sessionDirectory = await ensurePrivateDirectory(join(sessionsDirectory, sessionDirectoryName(options.sessionId)));
	const sessionPath = join(sessionDirectory, digest + extension);
	try {
		await link(path, sessionPath);
	} catch (cause) {
		if (cause?.code !== "EEXIST") throw cause;
		await verifyExisting(sessionPath, digest);
	}
	return {
		reference: "@doc:" + digest,
		sha256: digest,
		name: safeDisplayName(options.name, extension),
		kind,
		bytes: bytes.byteLength
	};
}
//#endregion
//#region lib/types/index.js
const name = "tool-document";
const inject = [
	"tools",
	"fs",
	"systemPrompt"
];
const Config = z.object({
	readMaxBytes: z.number().default(51200),
	maxPdfBytes: z.number().default(104857600),
	maxOfficeBytes: z.number().default(52428800),
	maxFileReadBytes: z.number().default(104857600),
	cacheDirectory: z.string().default(""),
	documentsDirectory: z.string().default(""),
	cacheMaxBytes: z.number().default(DEFAULT_DOCUMENT_CACHE_BYTES),
	sofficePath: z.string(),
	maxSegmentBytes: z.number().default(16777216)
});
function positiveInteger(name, value) {
	if (!Number.isSafeInteger(value) || value < 512) throw new Error("tool-document: " + name + " must be an integer of at least 512");
}
function parseArgs(args) {
	if (typeof args.path !== "string" || args.path.trim().length === 0) throw new Error("path must be a non-empty document path");
	for (const [name, value] of [
		["pages", args.pages],
		["sheet", args.sheet],
		["range", args.range],
		["section", args.section]
	]) if (value !== void 0 && (typeof value !== "string" || value.trim().length === 0)) throw new Error(name + " must be a non-empty string when provided");
	return {
		path: args.path,
		options: {
			...args.pages !== void 0 ? { pages: args.pages } : {},
			...args.sheet !== void 0 ? { sheet: args.sheet } : {},
			...args.range !== void 0 ? { range: args.range } : {},
			...args.section !== void 0 ? { section: args.section } : {},
			images: args.images ?? false,
			maxPdfBytes: 104857600,
			maxOfficeBytes: 52428800
		}
	};
}
const outputSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		outline: {
			type: "array",
			items: { type: "string" }
		},
		content: {
			type: "array",
			required: true,
			items: { oneOf: [{
				type: "object",
				additionalProperties: false,
				properties: {
					type: {
						type: "string",
						enum: ["text"],
						required: true
					},
					text: {
						type: "string",
						required: true
					}
				}
			}, {
				type: "object",
				additionalProperties: false,
				properties: {
					type: {
						type: "string",
						enum: ["image"],
						required: true
					},
					attachment: {
						type: "object",
						additionalProperties: false,
						properties: {
							attachmentId: {
								type: "string",
								required: true
							},
							mediaType: {
								type: "string",
								enum: [
									"image/png",
									"image/jpeg",
									"image/webp",
									"image/gif"
								],
								required: true
							},
							bytes: {
								type: "integer",
								required: true
							},
							width: {
								type: "integer",
								required: true
							},
							height: {
								type: "integer",
								required: true
							},
							name: { type: "string" },
							originalDimensions: {
								type: "object",
								additionalProperties: false,
								properties: {
									width: {
										type: "integer",
										required: true
									},
									height: {
										type: "integer",
										required: true
									}
								}
							}
						}
					}
				}
			}] }
		},
		next: { type: "string" },
		truncated: {
			type: "boolean",
			required: true
		},
		tokensEstimate: {
			type: "integer",
			required: true
		}
	}
};
function activeRouteSupportsImages(ctx, exec) {
	const routed = exec.agent?.session.requestHeader()?.config;
	const provider = routed?.provider ?? exec.agent?.options.provider;
	const model = routed?.model ?? exec.agent?.options.model;
	const llm = ctx.get("llm");
	if (!provider || !model || !llm) return Promise.resolve(false);
	return llm.resolveModelInfo(provider, model, exec.signal).then((info) => info.inputModalities?.includes("image") === true).catch(() => false);
}
function imageTokensEstimate(ref) {
	return Math.ceil(ref.width / 28) * Math.ceil(ref.height / 28);
}
function estimateTokens(text) {
	let cjk = 0;
	for (const character of text) {
		const code = character.codePointAt(0);
		if (code >= 11904 && code <= 40959 || code >= 63744 && code <= 64255) cjk += 1;
	}
	return Math.ceil(cjk * 1.3 + ([...text].length - cjk) / 4);
}
function utf8Prefix(value, maxBytes) {
	let output = "";
	let used = 0;
	for (const character of value) {
		const bytes = Buffer.byteLength(character, "utf8");
		if (used + bytes > maxBytes) break;
		output += character;
		used += bytes;
	}
	return output;
}
async function saveDocumentSpill(ctx, exec, content) {
	const sessionId = exec.agent?.session.header.id;
	if (sessionId === void 0) return void 0;
	const spillStore = ctx.get("spillStore");
	if (spillStore === void 0) return void 0;
	const save = {
		owner: { sessionId },
		source: {
			toolName: exec.name,
			callId: exec.callId,
			label: "document segment"
		},
		suggestedName: "document-segment.txt",
		content
	};
	try {
		return await spillStore.saveText(save);
	} catch (error) {
		ctx.logger.warn("tool-document: spill save failed: " + (error instanceof Error ? error.message : String(error)));
		return;
	}
}
async function boundToolOutput(ctx, exec, result, maxBytes) {
	const fullText = result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n\n");
	if (Buffer.byteLength(fullText, "utf8") <= maxBytes) return result;
	const spill = await saveDocumentSpill(ctx, exec, fullText);
	const parserCapped = fullText.includes("configured byte limit");
	const recovery = spill ? "[Document segment text saved at " + spill.locator + " (" + spill.bytes + " bytes). " + spill.retrievalHint + "]" : "[Inline output is limited to " + maxBytes + " bytes; narrow pages, section, sheet, or range to read the rest.]";
	const capHint = parserCapped ? "\n[The extracted segment also reached its configured parser limit; narrow the requested segment to read the remaining source content.]" : "";
	const nextHint = result.next ? "\nNext: " + result.next : "";
	const suffix = utf8Prefix("\n\n" + recovery + capHint + nextHint, maxBytes);
	const text = utf8Prefix(fullText, Math.max(0, maxBytes - Buffer.byteLength(suffix, "utf8"))) + suffix;
	const nonText = result.content.filter((block) => block.type === "image");
	return {
		...result,
		content: [{
			type: "text",
			text
		}, ...nonText],
		truncated: true,
		tokensEstimate: estimateTokens(text) + nonText.reduce((sum, block) => sum + imageTokensEstimate(block.attachment), 0)
	};
}
function withTextNotice(result, notice, maxBytes) {
	const content = [...result.content];
	const first = content[0];
	const original = first?.text ?? "";
	const suffix = "\n\n" + notice;
	const available = Math.max(0, maxBytes - Buffer.byteLength(suffix, "utf8"));
	let text = "";
	let used = 0;
	for (const character of original) {
		const bytes = Buffer.byteLength(character, "utf8");
		if (used + bytes > available) break;
		text += character;
		used += bytes;
	}
	text += suffix;
	if (first) content[0] = {
		type: "text",
		text
	};
	else content.push({
		type: "text",
		text
	});
	let oldCjk = 0;
	let newCjk = 0;
	for (const character of original) {
		const code = character.codePointAt(0);
		if (code >= 11904 && code <= 40959 || code >= 63744 && code <= 64255) oldCjk += 1;
	}
	for (const character of text) {
		const code = character.codePointAt(0);
		if (code >= 11904 && code <= 40959 || code >= 63744 && code <= 64255) newCjk += 1;
	}
	const oldTokens = Math.ceil(oldCjk * 1.3 + ([...original].length - oldCjk) / 4);
	const newTokens = Math.ceil(newCjk * 1.3 + ([...text].length - newCjk) / 4);
	return {
		...result,
		content,
		truncated: result.truncated || text.length < original.length + suffix.length,
		tokensEstimate: Math.max(0, result.tokensEstimate - oldTokens + newTokens)
	};
}
const DOCUMENT_REFERENCE = /^@doc:([a-f0-9]{64})$/u;
const DOCUMENT_EXTENSIONS = [
	".pdf",
	".pptx",
	".docx",
	".xlsx",
	".ppt",
	".doc",
	".xls"
];
async function readDocumentReference(digest, directory, sessionId, maxBytes) {
	if (!sessionId) throw new FsError("document attachment is not available in this session", "FS_PERMISSION_DENIED");
	let directoryInfo;
	try {
		directoryInfo = await lstat(directory);
	} catch (cause) {
		if (cause?.code === "ENOENT") throw new FsError("document attachment " + digest + " was not found", "FS_NOT_FOUND", { cause });
		throw new FsError("cannot inspect the document attachment directory", "FS_IO_ERROR", { cause });
	}
	if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || (directoryInfo.mode & 63) !== 0) throw new FsError("document attachments are unavailable because their private directory is unsafe", "FS_PERMISSION_DENIED");
	const canonicalRoot = await realpath(directory);
	const sessionsDirectory = join(canonicalRoot, ".sessions");
	let sessionsInfo;
	try {
		sessionsInfo = await lstat(sessionsDirectory);
	} catch (cause) {
		if (cause?.code === "ENOENT") throw new FsError("document attachment is not available in this session", "FS_PERMISSION_DENIED", { cause });
		throw new FsError("cannot inspect the session document attachment directory", "FS_IO_ERROR", { cause });
	}
	if (!sessionsInfo.isDirectory() || sessionsInfo.isSymbolicLink() || (sessionsInfo.mode & 63) !== 0) throw new FsError("session document attachments are unavailable because their private directory is unsafe", "FS_PERMISSION_DENIED");
	const canonicalSessions = await realpath(sessionsDirectory);
	if (canonicalSessions !== sessionsDirectory || dirname(canonicalSessions) !== canonicalRoot) throw new FsError("session document attachments escaped their private directory", "FS_PERMISSION_DENIED");
	const sessionDirectory = join(canonicalSessions, createHash("sha256").update("taskweaver-document-session\0").update(sessionId).digest("hex"));
	let sessionInfo;
	try {
		sessionInfo = await lstat(sessionDirectory);
	} catch (cause) {
		if (cause?.code === "ENOENT") throw new FsError("document attachment is not available in this session", "FS_PERMISSION_DENIED", { cause });
		throw new FsError("cannot inspect this session document attachment directory", "FS_IO_ERROR", { cause });
	}
	if (!sessionInfo.isDirectory() || sessionInfo.isSymbolicLink() || (sessionInfo.mode & 63) !== 0) throw new FsError("session document attachments are unavailable because their private directory is unsafe", "FS_PERMISSION_DENIED");
	const canonicalDirectory = await realpath(sessionDirectory);
	if (canonicalDirectory !== sessionDirectory || dirname(canonicalDirectory) !== canonicalSessions) throw new FsError("session document attachments escaped their private directory", "FS_PERMISSION_DENIED");
	const matches = [];
	for (const extension of DOCUMENT_EXTENSIONS) {
		const path = join(canonicalDirectory, digest + extension);
		try {
			const info = await lstat(path);
			if (info.isSymbolicLink() || !info.isFile()) throw new FsError("document attachment is not a regular file", "FS_PERMISSION_DENIED");
			matches.push({
				path,
				extension
			});
		} catch (cause) {
			if (cause?.code !== "ENOENT") throw cause;
		}
	}
	if (matches.length === 0) throw new FsError("document attachment " + digest + " was not found", "FS_NOT_FOUND");
	if (matches.length > 1) throw new FsError("document attachment reference is ambiguous", "FS_IO_ERROR");
	const { path, extension } = matches[0];
	let handle;
	try {
		const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
		handle = await open(path, flags);
		const canonicalPath = await realpath(path);
		if (dirname(canonicalPath) !== canonicalDirectory) throw new FsError("document attachment escaped its private directory", "FS_PERMISSION_DENIED");
		const info = await handle.stat();
		if (!info.isFile()) throw new FsError("document attachment is not a regular file", "FS_PERMISSION_DENIED");
		if (!Number.isSafeInteger(info.size) || info.size > maxBytes) throw new FsError("document attachment exceeds the " + maxBytes + "-byte document limit", "FS_TOO_LARGE");
		const bytes = Buffer.allocUnsafe(info.size);
		let offset = 0;
		while (offset < bytes.length) {
			const read = await handle.read(bytes, offset, bytes.length - offset, offset);
			if (read.bytesRead === 0) break;
			offset += read.bytesRead;
		}
		const extra = Buffer.allocUnsafe(1);
		if ((await handle.read(extra, 0, 1, offset)).bytesRead > 0) throw new FsError("document attachment changed while it was being read", "FS_TOO_LARGE");
		const contents = bytes.subarray(0, offset);
		if (createHash("sha256").update(contents).digest("hex") !== digest) throw new FsError("document attachment failed its content-address check", "FS_PERMISSION_DENIED");
		return {
			bytes: contents,
			displayPath: "@doc:" + digest,
			extension
		};
	} catch (cause) {
		if (cause instanceof FsError) throw cause;
		if (cause?.code === "ELOOP") throw new FsError("document attachment cannot be a symbolic link", "FS_PERMISSION_DENIED", { cause });
		throw new FsError("cannot read document attachment " + digest, "FS_IO_ERROR", { cause });
	} finally {
		await handle?.close().catch(() => void 0);
	}
}
function apply(ctx, config) {
	const maxBytes = config.readMaxBytes ?? 51200;
	const maxPdfBytes = config.maxPdfBytes ?? 104857600;
	const maxOfficeBytes = config.maxOfficeBytes ?? 52428800;
	const maxFileBytes = config.maxFileReadBytes ?? 104857600;
	const maxSegmentBytes = config.maxSegmentBytes ?? 16777216;
	const documentsDirectory = resolve(config.documentsDirectory || runtimeHomePath("documents"));
	positiveInteger("readMaxBytes", maxBytes);
	positiveInteger("maxPdfBytes", maxPdfBytes);
	positiveInteger("maxOfficeBytes", maxOfficeBytes);
	positiveInteger("maxFileReadBytes", maxFileBytes);
	positiveInteger("maxSegmentBytes", maxSegmentBytes);
	if (maxPdfBytes > 104857600) throw new Error("tool-document: maxPdfBytes cannot exceed 100 MB");
	if (maxOfficeBytes > 52428800) throw new Error("tool-document: maxOfficeBytes cannot exceed 50 MB");
	if (maxFileBytes > 104857600) throw new Error("tool-document: maxFileReadBytes cannot exceed the 100 MB PDF parser limit");
	if (maxSegmentBytes > 33554432) throw new Error("tool-document: maxSegmentBytes cannot exceed 32 MB");
	const cache = new DocumentResultCache(config.cacheDirectory || runtimeHomePath("document-cache"), config.cacheMaxBytes ?? 209715200);
	ctx.systemPrompt.section({
		name: "tool:read_document",
		order: 110,
		text: "Use read_document for user-supplied @doc references or sandboxed document paths; it enforces the filesystem sandbox and reads bounded segments."
	});
	ctx.tools.register(defineTool({
		name: "read_document",
		description: "Read bounded text from PDF, PPTX, DOCX, or XLSX. Legacy .doc, .ppt, and .xls files can be converted with LibreOffice after user approval. Reads through the filesystem sandbox and returns an outline first when a document exceeds a per-call limit. With an image-capable route, images=true also attaches supported embedded or scanned-page images.",
		parameters: {
			path: {
				type: "string",
				required: true,
				description: "Sandboxed file path or a private document reference in the form @doc:<sha256>."
			},
			pages: {
				type: "string",
				description: "PDF page or PPTX slide range, for example 1-5. Maximum 20 each call."
			},
			sheet: {
				type: "string",
				description: "XLSX worksheet name or 1-based index. One worksheet per call."
			},
			range: {
				type: "string",
				description: "XLSX cell range in A1 notation, for example A1:Z200. Maximum 200 rows by 50 columns."
			},
			section: {
				type: "string",
				description: "DOCX heading section number or range, for example 2 or 2-3."
			},
			images: {
				type: "boolean",
				description: "Request embedded/scanned page images when supported by the active image pipeline."
			}
		},
		output: {
			schema: outputSchema,
			render: (_args, value) => value.content
		},
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const input = parseArgs(args);
			const attachments = ctx.get("attachments");
			const canAttachImages = input.options.images && attachments !== void 0 && await activeRouteSupportsImages(ctx, exec);
			let bytes;
			const documentReference = DOCUMENT_REFERENCE.exec(input.path);
			let target;
			let displayPath;
			let extension;
			if (documentReference) {
				const attached = await readDocumentReference(documentReference[1], documentsDirectory, exec.agent?.session.header.id, maxFileBytes);
				bytes = attached.bytes;
				displayPath = attached.displayPath;
				extension = attached.extension;
			} else {
				const resolved = await resolveRegularReadTarget(ctx, exec, input.path);
				target = resolved.target;
				displayPath = target.displayPath;
				extension = displayPath;
				if (resolved.info.size !== void 0 && resolved.info.size > maxFileBytes) throw new FsError("cannot read document \"" + displayPath + "\": file exceeds the " + maxFileBytes + "-byte document limit", "FS_TOO_LARGE");
				try {
					bytes = await ctx.fs.readBytes(target, exec.signal, maxFileBytes);
				} catch (error) {
					if (error instanceof FsError && error.code === "FS_TOO_LARGE") throw new FsError("cannot read document \"" + displayPath + "\": file exceeds the configured document size limit", "FS_TOO_LARGE", { cause: error });
					throw error;
				}
				ctx.emit("fs/observed", target, {
					kind: "present",
					version: resolved.info.version
				}, exec);
			}
			const options = {
				...input.options,
				images: canAttachImages,
				maxOutputBytes: maxSegmentBytes,
				maxPdfBytes,
				maxOfficeBytes
			};
			const key = documentCacheKey(bytes, options);
			let parsed = await cache.read(key);
			if (!parsed) {
				let parseBytes = bytes;
				if (isOleCompoundFile(bytes)) {
					const legacyExtension = legacyOfficeExtension(extension);
					if (!legacyExtension) throw new DocumentReadError("This legacy Office file has no .doc, .ppt, or .xls extension to select a safe conversion format.", "DOCUMENT_LEGACY_FORMAT_UNKNOWN");
					if (bytes.byteLength > maxOfficeBytes) throw new DocumentReadError("Legacy Office document exceeds the " + Math.floor(maxOfficeBytes / 1048576) + " MB Office file limit.", "DOCUMENT_TOO_LARGE");
					if (officeEncryptionMarkersPresent(bytes)) throw new DocumentReadError("This Office document is encrypted. Remove its password and retry.", "DOCUMENT_ENCRYPTED");
					const libreOfficePath = await findLibreOffice(config.sofficePath);
					if (!libreOfficePath) throw new DocumentReadError("This is a legacy Office format. Save it as .docx, .pptx, or .xlsx, or install LibreOffice and retry.", "DOCUMENT_LIBREOFFICE_UNAVAILABLE");
					const approval = ctx.get("approval");
					if (!approval) throw new DocumentReadError("Legacy Office conversion requires a user approval channel. Save the file as a modern Office document and retry.", "DOCUMENT_CONVERSION_APPROVAL_UNAVAILABLE");
					if (!exec.agent) throw new DocumentReadError("Legacy Office conversion requires an agent session so the user can approve it.", "DOCUMENT_CONVERSION_APPROVAL_UNAVAILABLE");
					const displayName = displayPath.split(/[\\/]/u).at(-1)?.replace(/[\u0000-\u001f\u007f]/gu, "").slice(0, 160) || "the selected file";
					const outcome = await approval.request({
						agent: exec.agent,
						toolName: "read_document",
						callId: exec.callId,
						reason: "Convert legacy Office document \"" + displayName + "\" with LibreOffice. It will process a private temporary copy, use a separate profile, and never overwrite the original file.",
						signal: exec.signal
					});
					if (outcome !== "allowed-once") throw new DocumentReadError(outcome === "rejected" ? "The user rejected LibreOffice conversion. Save the file as a modern Office document and retry." : outcome === "cancelled" ? "LibreOffice conversion approval was cancelled." : "LibreOffice conversion could not be approved because no approval channel is available.", outcome === "cancelled" ? "DOCUMENT_CONVERSION_CANCELLED" : "DOCUMENT_CONVERSION_NOT_APPROVED");
					parseBytes = await convertLegacyOffice(bytes, legacyExtension, {
						sofficePath: libreOfficePath,
						signal: exec.signal
					});
				}
				parsed = await documentWorkerPool.run(parseBytes, options, exec.signal);
				await cache.write(key, parsed);
			}
			if (input.options.images && !canAttachImages) parsed = withTextNotice(parsed, attachments === void 0 ? "Images were not attached because durable attachment storage is unavailable." : "Images were not attached because the current model route does not declare image input.", maxSegmentBytes);
			const candidates = parsed.imageCandidates ?? [];
			if (!canAttachImages || candidates.length === 0 || attachments === void 0) {
				const { imageCandidates: _ignored, ...result } = parsed;
				return boundToolOutput(ctx, exec, result, maxBytes);
			}
			const limits = attachments.imageLimits;
			const accepted = [];
			let aggregateBytes = 0;
			let omitted = 0;
			for (const candidate of candidates) {
				if (accepted.length >= Math.min(8, limits.maxImagesPerMessage) || !limits.mediaTypes.includes(candidate.mediaType) || candidate.data.byteLength > limits.maxImageBytes || aggregateBytes + candidate.data.byteLength > limits.maxMessageImageBytes) {
					omitted += 1;
					continue;
				}
				accepted.push(candidate);
				aggregateBytes += candidate.data.byteLength;
			}
			let refs = [];
			let attachmentFailure = false;
			try {
				refs = await attachments.saveImages(accepted.map((candidate) => ({
					data: candidate.data,
					mediaType: candidate.mediaType,
					name: candidate.name.slice(candidate.name.lastIndexOf("/") + 1)
				})));
			} catch {
				attachmentFailure = true;
			}
			const { imageCandidates: _ignored, ...base } = parsed;
			const content = [...base.content];
			if (omitted > 0) content.push({
				type: "text",
				text: "[" + omitted + " embedded image(s) omitted because they exceed the attachment limits.]"
			});
			if (attachmentFailure) content.push({
				type: "text",
				text: "[Embedded images could not be saved to durable attachment storage.]"
			});
			content.push(...refs.map((attachment) => ({
				type: "image",
				attachment
			})));
			return boundToolOutput(ctx, exec, {
				...base,
				content,
				tokensEstimate: base.tokensEstimate + refs.reduce((sum, ref) => sum + imageTokensEstimate(ref), 0)
			}, maxBytes);
		},
		presentCall(args) {
			return {
				card: "generic",
				title: "Read document " + (args.path ?? ""),
				kind: "read",
				locations: [{ path: args.path ?? "" }]
			};
		}
	}));
}
//#endregion
export { Config, apply, inject, name, storeDocumentSnapshot };
