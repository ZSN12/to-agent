import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import z from "@taskweaver/schemastery";
import { CodeRuntime, DUNDER_MEMBER, PORTABLE_RESERVED_WORDS, RESERVED_BINDING_GLOBALS, RESERVED_ERROR_MEMBERS } from "@taskweaver/dsh-code-runtime";
import { snapshotJsonValue } from "@taskweaver/dsh-session";
Object.fromEntries(Object.entries({
	BootMessage: {
		type: "required",
		cpuSeconds: "required",
		addressSpaceBytes: "required",
		maxLogBytes: "required",
		maxValueBytes: "required",
		namespaces: "required"
	},
	Namespace: {
		global: "required",
		names: "required",
		errorClass: "optional"
	},
	RunMessage: {
		type: "required",
		program: "required"
	},
	BootAckMessage: { type: "required" },
	CallMessage: {
		type: "required",
		id: "required",
		global: "required",
		name: "required",
		args: "required"
	},
	LogMessage: {
		type: "required",
		text: "required",
		truncated: "optional"
	},
	DoneErrorField: {
		kind: "required",
		message: "required"
	},
	DoneMessage: {
		type: "required",
		value: "optional",
		error: "optional"
	},
	ErrorClass: {
		name: "required",
		memberNameProperty: "required"
	},
	ReplyOk: {
		type: "required",
		id: "required",
		ok: "required",
		value: "required"
	},
	ReplyErr: {
		type: "required",
		id: "required",
		ok: "required",
		message: "required"
	}
}).map(([frame, roles]) => {
	return [frame, {
		required: Object.keys(roles).filter((key) => roles[key] === "required").sort(),
		optional: Object.keys(roles).filter((key) => roles[key] === "optional").sort()
	}];
}));
/**
* The in-band marker text announcing that log capture stopped at the byte
* budget. Shared wire vocabulary: the Python-side LogBuffer emits it when ITS
* ledger exhausts, and the host emits identical text when its own ledger drops
* a frame first (forged fd-3 traffic, stray stdout bytes) — a truncated run
* reads the same however the cap was hit.
* @param maxBytes - the configured `maxLogBytes` the marker names.
* @returns the marker line.
*/
function logTruncationMarker(maxBytes) {
	return `[dsh-code-runtime-python] log capture truncated at ${maxBytes} bytes`;
}
/**
* Serialize one JSON-parse-produced value without recursion. `JSON.stringify`
* recurses per nesting level and throws `RangeError` a few thousand levels
* deep, but the seam's `CodeJsonValue` has no depth limit — an honest deep
* completion or binding resolution below the byte budget must cross intact
* (the worker backend's wire is equally stack-safe). Callers must pass a value
* produced by `JSON.parse` (or equally JSON-plain): only `null`, finite
* numbers, booleans, strings, dense arrays, and plain objects — this encoder
* validates nothing. Output matches compact `JSON.stringify` byte for byte
* EXCEPT on an integral double beyond the safe range, where {@link scalarJson}
* emits the exact integer's BigInt digits rather than `JSON.stringify`'s rounded
* spelling (`1152921504606846976`, not `...847000`) so the seam's lossless-JSON
* promise holds across the wire.
* @param value - a JSON-plain value (e.g. straight from `JSON.parse`).
* @returns the compact JSON encoding.
*/
function encodeJsonPlain(value) {
	const chunks = [];
	const tasks = [{ value }];
	for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
		if ("text" in task) {
			chunks.push(task.text);
			continue;
		}
		const current = task.value;
		if (typeof current === "string") chunks.push(JSON.stringify(current));
		else if (Array.isArray(current)) {
			chunks.push("[");
			tasks.push({ text: "]" });
			for (let index = current.length - 1; index >= 0; index--) {
				if (index < current.length - 1) tasks.push({ text: "," });
				tasks.push({ value: current[index] });
			}
		} else if (typeof current === "object" && current !== null) {
			const record = current;
			chunks.push("{");
			tasks.push({ text: "}" });
			const keys = Object.keys(record);
			for (let index = keys.length - 1; index >= 0; index--) {
				const key = keys[index];
				if (index < keys.length - 1) tasks.push({ text: "," });
				tasks.push({ value: record[key] });
				tasks.push({ text: `${JSON.stringify(key)}:` });
			}
		} else chunks.push(scalarJson(current));
	}
	return chunks.join("");
}
/**
* One scalar (null, boolean, finite number) as JSON text. A beyond-safe-range
* integral double needs BigInt digits: `String(2 ** 60)` emits the ROUNDED
* `...847000` form, and echoing that to the child would silently change the
* integer the seam promised to carry losslessly — `BigInt(2 ** 60)` prints the
* exact `...846976` the double actually holds.
* @param current - a JSON-plain scalar (JSON.parse emits nothing else).
* @returns its JSON encoding.
*/
function scalarJson(current) {
	if (typeof current === "number" && Number.isInteger(current) && !Number.isSafeInteger(current)) return BigInt(current).toString();
	return String(current);
}
/**
* Exact UTF-8 byte length of one string's compact JSON form (quotes + escapes),
* computed by a single non-allocating scan that stops the instant the running
* total exceeds `maxBytes`. Used instead of `Buffer.byteLength(JSON.stringify(s))`
* so a control-heavy forged string — whose escaped copy expands up to ~6x — is
* rejected BEFORE that copy is materialized: `JSON.stringify` would allocate the
* full escaped form first, the very hundreds-of-MB spike the metered traversal
* exists to avoid. Mirrors `JSON.stringify`'s escaping byte-for-byte: `"` and
* `\` and the five short C0 escapes cost 2, other C0 controls `\uXXXX` cost 6, a
* valid surrogate pair is one astral code point emitted as raw 4-byte UTF-8, a
* LONE surrogate becomes `\uXXXX` at 6, and any other code point costs its raw
* UTF-8 width.
* @param text - the string to meter.
* @param maxBytes - largest serialized size the caller can still admit.
* @returns the exact serialized byte length, or `undefined` once it exceeds `maxBytes`.
*/
function jsonStringBytesUpTo$1(text, maxBytes) {
	let bytes = 2;
	if (bytes > maxBytes) return void 0;
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) bytes += 2;
		else if (code < 32) bytes += 6;
		else if (code < 128) bytes += 1;
		else if (code < 2048) bytes += 2;
		else if (code >= 55296 && code <= 56319 && index + 1 < text.length) {
			const next = text.charCodeAt(index + 1);
			if (next >= 56320 && next <= 57343) {
				bytes += 4;
				index++;
			} else bytes += 6;
		} else if (code >= 55296 && code <= 57343) bytes += 6;
		else bytes += 3;
		if (bytes > maxBytes) return void 0;
	}
	return bytes;
}
/**
* Meter a `JSON.parse`-produced done value's compact-JSON byte length AND its
* number losslessness in one traversal, stopping the instant `maxBytes` is
* crossed. This bounds the INCREMENTAL allocation the check itself would add on
* top of the already-parsed value — the enqueued children; strings and keys are
* metered by {@link jsonStringBytesUpTo} without allocating an escaped copy —
* not the parse that produced `value`.
* That upstream width is bounded separately, by the host-side cap on inbound
* fd-3 frame size before `JSON.parse` runs (owned by the runtime that reads the
* channel), so `value` cannot be arbitrarily large when it reaches here. The
* budget is the `maxValueBytes` the boot frame carries — a required wire field
* with no default at this layer. The traversal rejects over-budget BEFORE
* materializing a string's escaped form or enqueuing an array's/object's
* children, so a forgery within that frame cap cannot force those secondary
* allocations. Object key COUNTING is
* unavoidably O(keys) — JS has no lazy own-key iterator, and the parse already
* built the key set — but the check still refuses the per-entry work before the
* enqueue loop. A non-lossless number (non-finite, negative zero) is caught only
* when the value fits the budget — an over-budget value is rejected regardless,
* so the distinction is moot. Same JSON-plain precondition and traversal shape
* as {@link encodeJsonPlain}; a number's byte length is measured through
* {@link scalarJson} (matching the encoder, so a beyond-safe-range integer
* meters its exact BigInt digits, not `JSON.stringify`'s rounded spelling) and
* a string's/key's through {@link jsonStringBytesUpTo} (the exact escaped size,
* scanned without allocating the escaped copy).
* @param value - a JSON-plain value (e.g. straight from `JSON.parse`).
* @param maxBytes - the completion-value budget in bytes.
* @returns `{ ok: true, bytes }` with the exact serialized size, or
* `{ ok: false, reason }` — `over-budget` once the size exceeds `maxBytes`,
* `non-lossless` on a non-finite or negative-zero number.
*/
function checkDoneValue(value, maxBytes) {
	let bytes = 0;
	let nonLossless = false;
	const stack = [value];
	while (stack.length > 0) {
		const current = stack.pop();
		if (typeof current === "number") {
			if (!Number.isFinite(current) || Object.is(current, -0)) nonLossless = true;
			bytes += Buffer.byteLength(scalarJson(current), "utf8");
		} else if (typeof current === "string") {
			const stringBytes = jsonStringBytesUpTo$1(current, maxBytes - bytes);
			if (stringBytes === void 0) return {
				ok: false,
				reason: "over-budget"
			};
			bytes += stringBytes;
		} else if (Array.isArray(current)) {
			bytes += 2 + (current.length > 1 ? current.length - 1 : 0);
			if (bytes + current.length > maxBytes) return {
				ok: false,
				reason: "over-budget"
			};
			for (const item of current) stack.push(item);
		} else if (typeof current === "object" && current !== null) {
			const record = current;
			let count = 0;
			for (const key in record) if (Object.hasOwn(record, key)) count += 1;
			bytes += 2 + (count > 1 ? count - 1 : 0);
			if (bytes + count * 4 > maxBytes) return {
				ok: false,
				reason: "over-budget"
			};
			for (const key in record) {
				if (!Object.hasOwn(record, key)) continue;
				const keyBytes = jsonStringBytesUpTo$1(key, maxBytes - bytes);
				if (keyBytes === void 0) return {
					ok: false,
					reason: "over-budget"
				};
				bytes += keyBytes + 1;
				stack.push(record[key]);
			}
		} else bytes += Buffer.byteLength(scalarJson(current), "utf8");
		if (bytes > maxBytes) return {
			ok: false,
			reason: "over-budget"
		};
	}
	if (nonLossless) return {
		ok: false,
		reason: "non-lossless"
	};
	return {
		ok: true,
		bytes
	};
}
/**
* Whether a raw JSON line contains an integer token that would lose precision
* as a JavaScript number. `JSON.parse` silently rounds such a token
* (`9007199254740993` becomes `...992`) BEFORE any validation can see it, so
* the check must read the source text; a beyond-safe-range token whose double
* parse round-trips exactly (`2**53`, `2**60`) is lossless and passes. The scan walks the line skipping string literals (a digit run
* inside a string is data, not a number token) and tests every number token
* in plain integer form — no fraction or exponent, which parse as doubles by
* intent. A reviver cannot do this job: the reviver walk recurses per nesting
* level and would reintroduce the depth limit `encodeJsonPlain` removes.
* @param line - the raw UTF-8 text of one JSON-lines frame.
* @returns true when an unsafe integer token is present outside strings.
*/
function hasUnsafeIntegerToken(line) {
	for (let index = 0; index < line.length; index++) {
		const char = line[index];
		if (char === "\"") {
			for (index++; index < line.length; index++) if (line[index] === "\\") index++;
			else if (line[index] === "\"") break;
			continue;
		}
		if (char === "-" || char !== void 0 && char >= "0" && char <= "9") {
			let end = index + 1;
			while (end < line.length) {
				const c = line[end];
				if (c >= "0" && c <= "9" || c === "." || c === "e" || c === "E" || c === "+" || c === "-") end++;
				else break;
			}
			const token = line.slice(index, end);
			if (/^-?\d+$/.test(token)) {
				const parsed = Number(token);
				if (!Number.isFinite(parsed)) return true;
				if (!Number.isSafeInteger(parsed) && BigInt(token) !== BigInt(parsed)) return true;
			}
			index = end - 1;
		}
	}
	return false;
}
/**
* Lazily yield one plain object's own enumerable property values. A generator
* (not `Object.values`/`Object.entries`) because {@link hasNonLosslessNumber}
* walks breadth it cannot bound: those helpers copy the whole VALUE (or
* key/value pair) list into a fresh array up front, so a wide object would cost
* that second full-breadth allocation before a single value is examined. The
* `for...in` here does not make the walk sublinear — V8 still materializes the
* key-name enumeration when the loop starts — but it avoids the extra value
* array, yielding each value straight off the already-parsed object.
* @param record - a JSON-parse-produced object.
* @yields each own enumerable property value, in key order.
*/
function* ownValues(record) {
	for (const key in record) if (Object.hasOwn(record, key)) yield record[key];
}
/**
* Whether a JSON.parse-produced value contains a number outside lossless
* JSON: non-finite (`1e400` parses to `Infinity`) or negative zero (`-0.0`
* parses to JS `-0`, whose sign bit a re-serialization drops). The honest
* child's validator rejects these before sending, so a frame carrying one is
* forged.
*
* Runs on `call.args`, which — unlike a completion value — has NO seam byte
* cap, so there is no budget to reject a wide payload against the way
* {@link checkDoneValue} does. The traversal therefore holds ONE cursor per
* NESTING LEVEL (an array or {@link ownValues} iterator) instead of one entry
* per member: a forged flat `args` at the top of the host's inbound frame-size
* cap would
* otherwise push tens of millions of stack entries — and `Object.values` would
* copy each object's full breadth — allocating hundreds of megabytes beyond
* what `JSON.parse` already holds. Iterative either way, so a deep frame
* cannot overflow the host stack.
* @param value - a JSON-parse-produced value from an fd-3 frame.
* @returns true when any contained number is non-finite or negative zero.
*/
function hasNonLosslessNumber(value) {
	const cursors = [[value].values()];
	while (cursors.length > 0) {
		const step = cursors.at(-1).next();
		if (step.done === true) {
			cursors.pop();
			continue;
		}
		const current = step.value;
		if (typeof current === "number") {
			if (!Number.isFinite(current) || Object.is(current, -0)) return true;
		} else if (Array.isArray(current)) cursors.push(current.values());
		else if (typeof current === "object" && current !== null) cursors.push(ownValues(current));
	}
	return false;
}
/**
* Runtime shape gate for inbound fd-3 traffic. Model code has full access to
* fd 3 and can post anything — `null`, primitives, poisoned fields — so the
* compile-time union means nothing here: every field is validated and REBUILT
* before the host reads it (forged extras never ride along; a non-number id
* can never be echoed into a reply). Junk returns `undefined` and is dropped
* so a throw in the host's `message` handler cannot crash the host process.
* @param raw - one JSON-parsed frame from fd 3.
* @returns the rebuilt frame, or `undefined` to drop it silently.
*/
function validateChildFrame(raw) {
	if (typeof raw !== "object" || raw === null) return void 0;
	const m = raw;
	switch (m.type) {
		case "boot-ack": return { type: "boot-ack" };
		case "log":
			if (typeof m.text !== "string") return void 0;
			return {
				type: "log",
				text: m.text,
				...m.truncated === true ? { truncated: true } : {}
			};
		case "call":
			if (typeof m.id !== "number" || !Number.isFinite(m.id) || Object.is(m.id, -0) || typeof m.global !== "string" || typeof m.name !== "string") return void 0;
			if (!Object.hasOwn(m, "args")) return void 0;
			if (hasNonLosslessNumber(m.args)) return void 0;
			return {
				type: "call",
				id: m.id,
				global: m.global,
				name: m.name,
				args: m.args
			};
		case "done": {
			const err = m.error;
			if (err === void 0) return m.value === void 0 ? { type: "done" } : {
				type: "done",
				value: m.value
			};
			if (typeof err !== "object" || err === null) return void 0;
			const { kind, message } = err;
			if (typeof message !== "string") return void 0;
			if (kind !== "exception" && kind !== "invalid-output" && kind !== "output-limit") return void 0;
			return m.value === void 0 ? {
				type: "done",
				error: {
					kind,
					message
				}
			} : {
				type: "done",
				value: m.value,
				error: {
					kind,
					message
				}
			};
		}
		default: return;
	}
}
//#endregion
//#region lib/types/python-runtime.js
/**
* CPython subprocess implementation of `ctx.codeRuntime`.
* @module @taskweaver/dsh-code-runtime-python/src/python-runtime
*/
const RUNNER_PATH = fileURLToPath(new URL("../py/runner.py", import.meta.url));
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_TIMER_DELAY_MS = 2147483647;
const PYTHON_PROBE_TIMEOUT_MS = 2500;
const KILL_GRACE_MS = 250;
const MIN_OUTPUT_BYTES = 4;
const INSTALL_GUIDANCE = "Install CPython 3.9 or newer and make its python3 executable available on PATH.";
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
function isCommandLineToolsStub(executablePath, detail) {
	const normalized = executablePath.replaceAll("\\", "/");
	return /(?:^|\/)CommandLineTools\/usr\/bin\/python3$/.test(normalized) || /xcode-select|Command Line Tools|developer tools were found/i.test(detail);
}
function unavailablePythonMessage(sawCltStub) {
	return sawCltStub ? `The macOS Command Line Tools python3 entry is only an inactive installer stub. ${INSTALL_GUIDANCE}` : `A usable python3 executable was not found. ${INSTALL_GUIDANCE}`;
}
function pythonVersion(output) {
	const match = /(?:^|\n)(\d+)\.(\d+)\.(\d+)(?:\n|$)/.exec(output.trim());
	if (match === null) return void 0;
	const major = Number(match[1]);
	const minor = Number(match[2]);
	return major > 3 || major === 3 && minor >= 9 ? `${match[1]}.${match[2]}.${match[3]}` : void 0;
}
function pathCandidates(pathValue, platform) {
	if (platform === "win32") return [];
	const names = ["python3"];
	const candidates = /* @__PURE__ */ new Set();
	for (const directory of (pathValue ?? "").split(delimiter)) {
		if (directory.length === 0) continue;
		for (const name of names) candidates.add(resolve(directory, name));
	}
	return [...candidates];
}
async function probeExecutable(executablePath) {
	return await new Promise((resolveProbe) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		let timer;
		const child = spawn(executablePath, [
			"-I",
			"-B",
			"-c",
			"import sys; print(\"%d.%d.%d\" % sys.version_info[:3])"
		], {
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			],
			windowsHide: true,
			env: process.env
		});
		const finish = (result) => {
			if (settled) return;
			settled = true;
			if (timer !== void 0) clearTimeout(timer);
			resolveProbe(result);
		};
		const capture = (sink, chunk) => {
			if (settled) return;
			if ((sink === "stdout" ? stdout : stderr).length < 2048) {
				const text = chunk.toString("utf8");
				if (sink === "stdout") stdout += text.slice(0, 2048 - stdout.length);
				else stderr += text.slice(0, 2048 - stderr.length);
			}
		};
		child.stdout?.on("data", (chunk) => capture("stdout", chunk));
		child.stderr?.on("data", (chunk) => capture("stderr", chunk));
		child.once("error", (error) => finish({ detail: error.message }));
		child.once("close", (code) => {
			const output = `${stdout}\n${stderr}`;
			const version = code === 0 ? pythonVersion(stdout) : void 0;
			finish({
				...version === void 0 ? {} : { version },
				detail: output.trim() || `python3 exited with code ${String(code)}`
			});
		});
		timer = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {}
			finish({ detail: `python3 probe exceeded ${PYTHON_PROBE_TIMEOUT_MS}ms` });
		}, PYTHON_PROBE_TIMEOUT_MS);
		timer.unref?.();
	});
}
/**
* Probe only executables named `python3` on PATH. The probe executes no user
* code and rejects macOS Command Line Tools' placeholder, non-CPython output,
* and interpreters older than the package's supported Python 3.9 floor.
*/
async function discoverPython3(pathValue = process.env.PATH, platform = process.platform) {
	if (platform === "win32") return { error: `The TaskWeaver Python code runtime does not support Windows yet. ${INSTALL_GUIDANCE}` };
	let sawCltStub = false;
	for (const candidate of pathCandidates(pathValue, platform)) {
		try {
			await access(candidate, constants.X_OK);
		} catch {
			continue;
		}
		const probe = await probeExecutable(candidate);
		if (probe.version !== void 0) return { executable: {
			path: candidate,
			version: probe.version
		} };
		sawCltStub ||= isCommandLineToolsStub(candidate, probe.detail);
	}
	return { error: unavailablePythonMessage(sawCltStub) };
}
function validateBindings(request) {
	const bindings = /* @__PURE__ */ new Map();
	for (const namespace of request.bindings) {
		if (!IDENTIFIER.test(namespace.global) || PORTABLE_RESERVED_WORDS.has(namespace.global)) throw new Error(`dsh-code-runtime-python: binding global ${JSON.stringify(namespace.global)} is not a usable identifier`);
		if (RESERVED_BINDING_GLOBALS.has(namespace.global)) throw new Error(`dsh-code-runtime-python: reserved binding global ${JSON.stringify(namespace.global)}`);
		if (bindings.has(namespace.global)) throw new Error(`dsh-code-runtime-python: duplicate binding global ${JSON.stringify(namespace.global)}`);
		bindings.set(namespace.global, namespace);
	}
	const injectedNames = /* @__PURE__ */ new Set();
	for (const namespace of request.bindings) {
		const descriptor = namespace.errorClass;
		if (descriptor === void 0) continue;
		if (!IDENTIFIER.test(descriptor.name) || PORTABLE_RESERVED_WORDS.has(descriptor.name)) throw new Error(`dsh-code-runtime-python: binding error class ${JSON.stringify(descriptor.name)} is not a usable identifier`);
		if (RESERVED_BINDING_GLOBALS.has(descriptor.name) || bindings.has(descriptor.name) || injectedNames.has(descriptor.name)) throw new Error(`dsh-code-runtime-python: duplicate or reserved injected global ${JSON.stringify(descriptor.name)}`);
		const member = descriptor.memberNameProperty;
		if (member.length === 0 || RESERVED_ERROR_MEMBERS.has(member) || DUNDER_MEMBER.test(member)) throw new Error(`dsh-code-runtime-python: binding error member property ${JSON.stringify(member)} is not usable`);
		injectedNames.add(descriptor.name);
	}
	return bindings;
}
/** Exact escaped JSON byte size for one string; stops without allocating its escaped form. */
function jsonStringBytesUpTo(text, maxBytes) {
	let bytes = 2;
	if (bytes > maxBytes) return void 0;
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) bytes += 2;
		else if (code < 32) bytes += 6;
		else if (code < 128) bytes += 1;
		else if (code < 2048) bytes += 2;
		else if (code >= 55296 && code <= 56319 && index + 1 < text.length) {
			const next = text.charCodeAt(index + 1);
			if (next >= 56320 && next <= 57343) {
				bytes += 4;
				index++;
			} else bytes += 6;
		} else if (code >= 55296 && code <= 57343) bytes += 6;
		else bytes += 3;
		if (bytes > maxBytes) return void 0;
	}
	return bytes;
}
function truncateJsonString(text, maxBytes) {
	const prefix = [];
	let bytes = 2;
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		let width;
		let part = text[index];
		if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) width = 2;
		else if (code < 32) width = 6;
		else if (code < 128) width = 1;
		else if (code < 2048) width = 2;
		else if (code >= 55296 && code <= 56319 && index + 1 < text.length) {
			const next = text.charCodeAt(index + 1);
			if (next >= 56320 && next <= 57343) {
				width = 4;
				part += text[++index];
			} else width = 6;
		} else if (code >= 55296 && code <= 57343) width = 6;
		else width = 3;
		if (bytes + width > maxBytes) break;
		bytes += width;
		prefix.push(part);
	}
	return prefix.join("");
}
/** Host-side result ledger bounds logs plus completion value or failure text. */
var OutputLedger = class {
	maxBytes;
	bytes = 2;
	entries = 0;
	constructor(maxBytes) {
		this.maxBytes = maxBytes;
	}
	admit(text, logs) {
		const separator = this.entries > 0 ? 1 : 0;
		const size = jsonStringBytesUpTo(text, this.maxBytes - this.bytes - separator);
		if (size === void 0) return false;
		this.bytes += separator + size;
		this.entries++;
		logs.push(text);
		return true;
	}
	success(logs, value) {
		if (value !== void 0 && !checkDoneValue(value, this.maxBytes - this.bytes).ok) return this.limit(logs);
		return {
			logs,
			...value === void 0 ? {} : { value }
		};
	}
	failure(logs, error) {
		if (jsonStringBytesUpTo(error.message, this.maxBytes - this.bytes) === void 0) return this.limit(logs);
		return {
			logs,
			error
		};
	}
	limit(logs) {
		const fullMessage = `outer output exceeded ${this.maxBytes} bytes`;
		const retained = [];
		let used = 2;
		const messageBudget = Math.max(2, this.maxBytes - used);
		const message = truncateJsonString(fullMessage, messageBudget);
		const messageBytes = jsonStringBytesUpTo(message, messageBudget) ?? message.length + 2;
		const logsBudget = Math.max(2, this.maxBytes - messageBytes);
		for (const text of logs) {
			const separator = retained.length > 0 ? 1 : 0;
			const available = logsBudget - used - separator;
			const exact = jsonStringBytesUpTo(text, available);
			if (exact !== void 0) {
				retained.push(text);
				used += separator + exact;
				continue;
			}
			const prefix = truncateJsonString(text, available);
			if (prefix.length > 0 && jsonStringBytesUpTo(prefix, available) !== void 0) retained.push(prefix);
			break;
		}
		return {
			logs: retained,
			error: {
				kind: "output-limit",
				message
			}
		};
	}
};
function processEnvForPython(pythonPath) {
	const pathEntries = [
		dirname(pythonPath),
		"/usr/local/bin",
		"/opt/homebrew/bin",
		"/usr/bin",
		"/bin",
		"/usr/sbin",
		"/sbin"
	];
	return {
		PATH: [...new Set(pathEntries)].join(delimiter),
		PYTHONIOENCODING: "utf-8",
		PYTHONDONTWRITEBYTECODE: "1"
	};
}
function signalProcessTree(child, signal) {
	if (child.pid === void 0) return;
	try {
		if (process.platform !== "win32") process.kill(-child.pid, signal);
		else child.kill(signal);
	} catch (error) {
		if (error?.code !== "ESRCH") try {
			child.kill(signal);
		} catch {}
	}
}
/**
* CPython subprocess code runtime. Each call gets a fresh interpreter process;
* model code runs only after the resolved sandbox policy has been applied.
*/
var PythonCodeRuntime = class extends CodeRuntime {
	static Config = z.object({
		maxWallMs: z.number().default(6e4),
		cpuSeconds: z.number().default(30),
		addressSpaceBytes: z.number().default(1073741824),
		maxLogBytes: z.number().default(4194304),
		maxValueBytes: z.number().default(8388608),
		maxOutputBytes: z.number().default(16777216),
		maxFrameBytes: z.number().default(16777728)
	});
	language = "python";
	isolation = "process";
	config;
	pythonPromise;
	live = /* @__PURE__ */ new Set();
	disposed = false;
	constructor(ctx, config) {
		super(ctx);
		this.config = config;
		for (const [key, value] of Object.entries(this.config)) if (!(Number.isSafeInteger(value) && value > 0)) throw new Error(`dsh-code-runtime-python: config.${key} must be a positive safe integer, got ${String(value)}`);
		if (this.config.maxWallMs > MAX_TIMER_DELAY_MS) throw new Error(`dsh-code-runtime-python: config.maxWallMs must be at most ${MAX_TIMER_DELAY_MS}`);
		if (this.config.maxOutputBytes < MIN_OUTPUT_BYTES) throw new Error(`dsh-code-runtime-python: config.maxOutputBytes must be at least ${MIN_OUTPUT_BYTES}`);
		if (this.config.maxFrameBytes < Math.max(1024, this.config.maxValueBytes + 128)) throw new Error("dsh-code-runtime-python: config.maxFrameBytes must fit maxValueBytes plus a protocol envelope and be at least 1024 bytes");
		ctx.effect(() => () => this.teardown(), "python code-runtime teardown");
	}
	async teardown() {
		this.disposed = true;
		const runs = [...this.live];
		for (const run of runs) run.abort({
			kind: "abort",
			message: "runtime disposed"
		});
		await Promise.all(runs.map((run) => run.finished));
	}
	async run(request) {
		if (this.disposed) throw new Error("dsh-code-runtime-python: run() after disposal");
		const bindings = validateBindings(request);
		const output = new OutputLedger(this.config.maxOutputBytes);
		if (request.signal?.aborted) return output.failure([], {
			kind: "abort",
			message: String(request.signal.reason)
		});
		if (Buffer.byteLength(request.program, "utf8") + 64 > this.config.maxFrameBytes) return output.failure([], {
			kind: "output-limit",
			message: `program exceeded the ${this.config.maxFrameBytes}-byte protocol frame limit`
		});
		this.pythonPromise ??= discoverPython3();
		const discovered = await this.pythonPromise;
		if ("error" in discovered) return output.failure([], {
			kind: "worker-exit",
			message: discovered.error
		});
		if (request.signal?.aborted) return output.failure([], {
			kind: "abort",
			message: String(request.signal.reason)
		});
		return await this.execute(request, bindings, discovered.executable);
	}
	async execute(request, bindings, python) {
		const output = new OutputLedger(this.config.maxOutputBytes);
		const logs = [];
		const answered = /* @__PURE__ */ new Set();
		const defaultPolicy = this.ctx.get("sandboxPolicy")?.resolve();
		const policy = request.sandboxPolicy ?? defaultPolicy;
		if (policy === void 0) return output.failure([], {
			kind: "worker-exit",
			message: "sandboxPolicy service is unavailable; refusing to launch Python code"
		});
		const programArgv = [
			python.path,
			"-I",
			"-B",
			RUNNER_PATH
		];
		let argv;
		try {
			if (policy.mode === "danger-full-access") argv = programArgv;
			else {
				const confinedPolicy = {
					mode: policy.mode,
					workspaceRoot: policy.workspaceRoot,
					...policy.sessionId === void 0 ? {} : { sessionId: policy.sessionId }
				};
				argv = this.ctx.sandbox.confine(programArgv, confinedPolicy).argv;
			}
		} catch (error) {
			return output.failure([], {
				kind: "worker-exit",
				message: `Python sandbox setup failed: ${messageOf(error)}`
			});
		}
		let child;
		try {
			child = spawn(argv[0], argv.slice(1), {
				cwd: policy.workspaceRoot,
				env: processEnvForPython(python.path),
				stdio: [
					"ignore",
					"pipe",
					"pipe",
					"pipe"
				],
				detached: process.platform !== "win32",
				windowsHide: true
			});
		} catch (error) {
			return output.failure([], {
				kind: "worker-exit",
				message: `Python process could not be started: ${messageOf(error)}`
			});
		}
		const protocol = child.stdio[3];
		const stdout = child.stdout;
		const stderr = child.stderr;
		if (protocol === null || stdout === null || stderr === null) {
			signalProcessTree(child, "SIGKILL");
			return output.failure([], {
				kind: "worker-exit",
				message: "Python subprocess did not expose the required fd-3/stdout/stderr pipes"
			});
		}
		return await new Promise((resolveResult) => {
			let settled = false;
			let closed = false;
			let completed = false;
			let gotBootAck = false;
			let childLogTruncated = false;
			let terminalOverride;
			let finalizer;
			let killTimer;
			let lineParts = [];
			let lineBytes = 0;
			let fdDecoder = new StringDecoder("utf8");
			const stdoutDecoder = new StringDecoder("utf8");
			const stderrDecoder = new StringDecoder("utf8");
			let finishResolve;
			const finished = new Promise((done) => {
				finishResolve = done;
			});
			let live;
			const finish = (makeResult, terminate = true) => {
				if (settled) return;
				settled = true;
				finalizer = makeResult;
				clearTimeout(wallTimer);
				request.signal?.removeEventListener("abort", onAbort);
				if (terminate && !closed && child.exitCode === null && child.signalCode === null) {
					signalProcessTree(child, "SIGTERM");
					killTimer = setTimeout(() => signalProcessTree(child, "SIGKILL"), KILL_GRACE_MS);
					killTimer.unref?.();
				}
				if (closed) complete();
			};
			const complete = () => {
				if (!closed || !settled || completed) return;
				completed = true;
				if (killTimer !== void 0) clearTimeout(killTimer);
				this.live.delete(live);
				const result = terminalOverride ?? finalizer?.() ?? output.failure(logs, {
					kind: "worker-exit",
					message: "Python process ended without a result"
				});
				finishResolve();
				resolveResult(result);
			};
			const appendLog = (text) => {
				if (text.length === 0) return;
				if (!output.admit(text, logs)) {
					terminalOverride = output.limit([...logs, text]);
					finish(() => terminalOverride);
				}
			};
			const sendFrame = (frame) => {
				if (settled || protocol.destroyed || !protocol.writable) return;
				let encoded;
				try {
					encoded = `${encodeJsonPlain(frame)}\n`;
				} catch (error) {
					finish(() => output.failure(logs, {
						kind: "worker-exit",
						message: `could not encode host protocol frame: ${messageOf(error)}`
					}));
					return;
				}
				if (Buffer.byteLength(encoded, "utf8") - 1 > this.config.maxFrameBytes) {
					finish(() => output.failure(logs, {
						kind: "output-limit",
						message: `host protocol frame exceeded ${this.config.maxFrameBytes} bytes`
					}));
					return;
				}
				try {
					protocol.write(encoded, (error) => {
						if (error !== void 0 && error !== null) finish(() => output.failure(logs, {
							kind: "worker-exit",
							message: `Python protocol write failed: ${error.message}`
						}));
					});
				} catch (error) {
					finish(() => output.failure(logs, {
						kind: "worker-exit",
						message: `Python protocol write failed: ${messageOf(error)}`
					}));
				}
			};
			const sendRun = () => sendFrame({
				type: "run",
				program: request.program
			});
			const onCall = (message) => {
				if (settled || answered.has(message.id)) return;
				answered.add(message.id);
				const functions = bindings.get(message.global)?.functions;
				const fn = functions !== void 0 && Object.hasOwn(functions, message.name) ? functions[message.name] : void 0;
				const reply = (value) => {
					if (settled) return;
					sendFrame(value);
				};
				if (typeof fn !== "function") {
					reply({
						type: "reply",
						id: message.id,
						ok: false,
						message: `unknown binding ${JSON.stringify(`${message.global}.${message.name}`)}`
					});
					return;
				}
				(async () => {
					try {
						const resolved = await fn(message.args);
						const snapshot = snapshotJsonValue(resolved);
						if (snapshot === void 0) {
							reply({
								type: "reply",
								id: message.id,
								ok: false,
								message: "binding resolution must be lossless JSON"
							});
							return;
						}
						const replyOutput = JSON.parse(encodeJsonPlain(snapshot));
						if (!checkDoneValue(replyOutput, this.config.maxFrameBytes - 128).ok) {
							reply({
								type: "reply",
								id: message.id,
								ok: false,
								message: "binding resolution must be lossless JSON and fit the protocol frame limit"
							});
							return;
						}
						reply({
							type: "reply",
							id: message.id,
							ok: true,
							value: replyOutput
						});
					} catch (error) {
						reply({
							type: "reply",
							id: message.id,
							ok: false,
							message: truncateJsonString(messageOf(error), this.config.maxFrameBytes - 256)
						});
					}
				})();
			};
			const processLine = (line) => {
				if (line.length === 0 || settled) return;
				if (hasUnsafeIntegerToken(line)) return;
				let raw;
				try {
					raw = JSON.parse(line);
				} catch {
					return;
				}
				const frame = validateChildFrame(raw);
				if (frame === void 0) return;
				if (frame.type === "boot-ack") {
					if (!gotBootAck) {
						gotBootAck = true;
						sendRun();
					}
					return;
				}
				if (frame.type === "log") {
					if (childLogTruncated) return;
					appendLog(frame.text);
					if (frame.truncated === true) childLogTruncated = true;
					return;
				}
				if (frame.type === "call") {
					onCall(frame);
					return;
				}
				if (frame.type === "done") {
					if (frame.error !== void 0) {
						finish(() => output.failure(logs, frame.error));
						return;
					}
					if (frame.value === void 0) {
						finish(() => output.success(logs));
						return;
					}
					const checked = checkDoneValue(frame.value, this.config.maxValueBytes);
					if (!checked.ok) {
						const kind = checked.reason === "over-budget" ? "output-limit" : "invalid-output";
						const message = checked.reason === "over-budget" ? `completion value exceeded ${this.config.maxValueBytes} bytes` : "program completion must be lossless JSON";
						finish(() => output.failure(logs, {
							kind,
							message
						}));
						return;
					}
					finish(() => output.success(logs, frame.value));
				}
			};
			const receiveProtocol = (text) => {
				let rest = text;
				while (rest.length > 0 && !settled) {
					const newline = rest.indexOf("\n");
					const part = newline < 0 ? rest : rest.slice(0, newline);
					const addedBytes = Buffer.byteLength(part, "utf8") + (newline < 0 ? 0 : 1);
					if (lineBytes + addedBytes > this.config.maxFrameBytes) {
						terminalOverride = output.failure(logs, {
							kind: "output-limit",
							message: `protocol frame exceeded ${this.config.maxFrameBytes} bytes`
						});
						finish(() => terminalOverride);
						return;
					}
					lineParts.push(part);
					lineBytes += addedBytes;
					if (newline < 0) break;
					const line = lineParts.join("");
					lineParts = [];
					lineBytes = 0;
					processLine(line);
					rest = rest.slice(newline + 1);
				}
			};
			const capture = (decoder, chunk) => appendLog(decoder.write(chunk));
			stdout.on("data", (chunk) => capture(stdoutDecoder, chunk));
			stderr.on("data", (chunk) => capture(stderrDecoder, chunk));
			protocol.on("data", (chunk) => receiveProtocol(fdDecoder.write(chunk)));
			protocol.once("end", () => receiveProtocol(fdDecoder.end()));
			child.once("error", (error) => {
				finish(() => output.failure(logs, {
					kind: "worker-exit",
					message: `Python process error: ${error.message}`
				}));
			});
			child.once("close", (code, signal) => {
				closed = true;
				appendLog(stdoutDecoder.end());
				appendLog(stderrDecoder.end());
				receiveProtocol(fdDecoder.end());
				if (!settled) {
					const detail = gotBootAck ? "before completing" : "before acknowledging boot";
					finish(() => output.failure(logs, {
						kind: "worker-exit",
						message: `Python process exited ${detail} (code ${String(code)}, signal ${String(signal)})`
					}), false);
				}
				complete();
			});
			const onAbort = () => finish(() => output.failure(logs, {
				kind: "abort",
				message: String(request.signal?.reason)
			}));
			request.signal?.addEventListener("abort", onAbort, { once: true });
			const wallTimer = setTimeout(() => {
				finish(() => output.failure(logs, {
					kind: "timeout",
					message: `wall-clock ceiling reached (${this.config.maxWallMs}ms)`
				}));
			}, this.config.maxWallMs);
			wallTimer.unref?.();
			live = {
				abort: (failure) => finish(() => output.failure(logs, failure)),
				finished
			};
			this.live.add(live);
			sendFrame({
				type: "boot",
				cpuSeconds: this.config.cpuSeconds,
				addressSpaceBytes: this.config.addressSpaceBytes,
				maxLogBytes: this.config.maxLogBytes,
				maxValueBytes: this.config.maxValueBytes,
				namespaces: [...bindings].map(([global, namespace]) => ({
					global,
					names: Object.keys(namespace.functions),
					...namespace.errorClass === void 0 ? {} : { errorClass: namespace.errorClass }
				}))
			});
		});
	}
};
//#endregion
export { PythonCodeRuntime, checkDoneValue, discoverPython3, encodeJsonPlain, hasNonLosslessNumber, hasUnsafeIntegerToken, logTruncationMarker, validateChildFrame };
