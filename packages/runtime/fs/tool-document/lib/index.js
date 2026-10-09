import { FsError } from "@z/dsh-fs";
import { defineTool } from "@z/dsh-tools";
import z from "@z/schemastery";
import { resolveRegularReadTarget } from "@z/dsh-tool-fs/src/read-target.ts";
import { Worker } from "node:worker_threads";
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
//#region lib/types/worker-pool.js
const POOL_SIZE = 2;
const WORKER_TIMEOUT_MS = 3e4;
const WORKER_MEMORY_MB = 512;
function abortError() {
	return /* @__PURE__ */ new Error("Document reading was cancelled.");
}
var DocumentWorkerPool = class {
	slots = Array.from({ length: POOL_SIZE }, () => ({
		worker: void 0,
		job: void 0
	}));
	queue = [];
	nextId = 1;
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
		return new Worker(import.meta.url.endsWith(".ts") ? new URL("./worker.ts", import.meta.url) : new URL("./worker.js", import.meta.url), {
			name: "taskweaver-document-parser",
			resourceLimits: { maxOldGenerationSizeMb: WORKER_MEMORY_MB }
		});
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
			job.timeout = setTimeout(() => this.stop(slot, /* @__PURE__ */ new Error("Document parsing exceeded the 30 second time limit. Retry with a smaller document.")), WORKER_TIMEOUT_MS);
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
//#region lib/types/index.js
const name = "tool-document";
const inject = [
	"tools",
	"fs",
	"systemPrompt"
];
const Config = z.object({
	readMaxBytes: z.number().default(50 * 1024),
	maxFileReadBytes: z.number().default(100 * 1024 * 1024)
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
			images: args.images ?? false
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
			items: {
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
			}
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
function apply(ctx, config) {
	const maxBytes = config.readMaxBytes ?? 50 * 1024;
	const maxFileBytes = config.maxFileReadBytes ?? 100 * 1024 * 1024;
	positiveInteger("readMaxBytes", maxBytes);
	positiveInteger("maxFileReadBytes", maxFileBytes);
	if (maxFileBytes > 100 * 1024 * 1024) throw new Error("tool-document: maxFileReadBytes cannot exceed the 100 MB PDF parser limit");
	ctx.systemPrompt.section({
		name: "tool:read_document",
		order: 110,
		text: "Use read_document for PDF, PPTX, DOCX, and XLSX files. It reads through the filesystem sandbox. Large documents first return an outline; continue with pages, section, sheet, or range from next. A call returns at most 20 PDF pages or slides, one worksheet range, or selected document sections."
	});
	ctx.tools.register(defineTool({
		name: "read_document",
		description: "Read bounded text from PDF, PPTX, DOCX, or XLSX. Reads files through the filesystem sandbox and returns an outline first when a document exceeds a per-call limit.",
		parameters: {
			path: {
				type: "string",
				required: true,
				description: "Path to the document, resolved by the filesystem backend."
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
			const { target, info } = await resolveRegularReadTarget(ctx, exec, input.path);
			if (info.size !== void 0 && info.size > maxFileBytes) throw new FsError("cannot read document \"" + target.displayPath + "\": file exceeds the " + maxFileBytes + "-byte document limit", "FS_TOO_LARGE");
			let bytes;
			try {
				bytes = await ctx.fs.readBytes(target, exec.signal, maxFileBytes);
			} catch (error) {
				if (error instanceof FsError && error.code === "FS_TOO_LARGE") throw new FsError("cannot read document \"" + target.displayPath + "\": file exceeds the configured document size limit", "FS_TOO_LARGE", { cause: error });
				throw error;
			}
			ctx.emit("fs/observed", target, {
				kind: "present",
				version: info.version
			}, exec);
			const options = {
				...input.options,
				maxOutputBytes: maxBytes
			};
			return await documentWorkerPool.run(bytes, options, exec.signal);
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
export { Config, apply, inject, name };
