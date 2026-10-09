import { createRequire } from "node:module";
import z from "@z/schemastery";
import "@z/cordis";
//#region ../../llm/llm/src/brand.ts
/**
* Brand a message identifier.
* @param id - the opaque message identifier.
* @returns the same string, branded; no validation is performed.
*/
function MessageId(id) {
	return id;
}
//#endregion
//#region ../../llm/llm/src/call-config.ts
/**
* Deep-freeze a value in place with an iterative traversal, guarding cycles,
* so later mutation throws without imposing a JavaScript call-stack depth cap.
* {@link AbortSignal} objects are deliberately skipped because they are the
* request's live cancellation channel and freezing them breaks abort.
* @param value - the value to freeze in place.
* @returns the same value, frozen.
*/
function deepFreeze(value) {
	const seen = /* @__PURE__ */ new WeakSet();
	const pending = [{
		kind: "visit",
		node: value
	}];
	while (pending.length > 0) {
		const task = pending.pop();
		/* v8 ignore next -- the loop condition guarantees one pending task. */
		if (task === void 0) continue;
		if (task.kind === "property") {
			pending.push({
				kind: "visit",
				node: task.source[task.key]
			});
			continue;
		}
		const node = task.node;
		if (node === null || typeof node !== "object") continue;
		if (node instanceof AbortSignal) continue;
		if (seen.has(node)) continue;
		seen.add(node);
		Object.freeze(node);
		const keys = Object.keys(node);
		for (let index = keys.length - 1; index >= 0; index--) {
			const key = keys[index];
			/* v8 ignore next -- the loop is bounded by the captured key count. */
			if (key === void 0) continue;
			pending.push({
				kind: "property",
				source: node,
				key
			});
		}
	}
	return value;
}
//#endregion
//#region ../../llm/llm/src/message.ts
/** Message value types, identity, and immutable construction helpers. */
/**
* Detach and deep-freeze a message whose identity already exists.
* @param message - complete message, including its stable identity.
* @returns an immutable snapshot that preserves the identity.
*/
function freezeMessage(message) {
	return deepFreeze(structuredClone(message));
}
/**
* Create one identified message and freeze it before publication.
* @param input - complete role, content, and source for a new message.
* @returns an immutable message with a fresh stable identity.
*/
function createMessage(input) {
	return freezeMessage({
		...input,
		id: MessageId(crypto.randomUUID())
	});
}
/**
* Create one identified user-role message and freeze it before publication.
* @param input - complete content and source for a new user message.
* @returns an immutable user message with a fresh stable identity.
*/
function createUserMessage(input) {
	return createMessage({
		...input,
		role: "user"
	});
}
//#endregion
//#region ../../util/timeout/src/index.ts
/** Largest delay Node schedules without clamping it to one millisecond. */
const MAX_TIMER_DELAY_MS = 2147483647;
//#endregion
//#region ../../llm/llm/src/error.ts
/**
* Canonical provider-neutral code for a response that completed normally but
* carried no content blocks at all. Providers occasionally emit a degenerate
* completion (a terminal stop with zero output); adapters classify it as this
* failure instead of yielding an empty assistant message, because an empty
* message silently ends the turn with nothing for the user or the loop to act
* on. The attempt produced nothing durable, so retry policy treats it as safe
* to repeat.
*/
const EMPTY_RESPONSE_CODE = "EMPTY_RESPONSE";
new RegExp(String.raw`(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-]` + String.raw`(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])`, "i");
new RegExp(String.raw`\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?` + String.raw`too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?` + String.raw`(?:model(?:'s)?\s+)?context(?:\s+window)?\b`, "i");
new RegExp(String.raw`\b(?:input|prompt|request|messages?)\b.{0,40}` + String.raw`\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}` + String.raw`\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b`, "i");
//#endregion
//#region ../../llm/llm/src/retry-policy.ts
/**
* Provider-owned request-retry policy configuration and resolution.
*
* Adapters expose one resolved policy per registered provider route; the
* optional dsh-llm-retry plugin executes it on the agent's failed-step extension point.
*
* @module @z/dsh-llm/retry-policy
*/
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 1e4;
const DEFAULT_JITTER_RATIO = .1;
const DEFAULT_RETRYABLE_CODES = Object.freeze([
	EMPTY_RESPONSE_CODE,
	"RATE_LIMIT",
	"SERVER",
	"TIMEOUT",
	"TRANSPORT"
]);
const backoffSchema = z.object({
	initialDelayMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_INITIAL_DELAY_MS),
	maxDelayMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_MAX_DELAY_MS),
	jitterRatio: z.number().min(0).max(1).default(DEFAULT_JITTER_RATIO)
});
const normalPolicySchema = z.object({
	mode: z.const("normal").required(),
	maxRetries: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_RETRIES),
	retryableCodes: z.array(z.string()).default([...DEFAULT_RETRYABLE_CODES]),
	backoff: backoffSchema
});
const alwaysPolicySchema = z.object({
	mode: z.const("always").required(),
	backoff: backoffSchema
});
z.union([normalPolicySchema, alwaysPolicySchema]);
//#endregion
//#region ../../llm/llm/src/attribution.ts
/**
* Centralize the non-secret product identity every provider request sends as `User-Agent`, keeping
* adapters from drifting. See
* `.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md`.
*
* App-attribution vocabulary for provider requests.
* @module @z/dsh-llm/attribution
*/
const { version } = createRequire(import.meta.url)("../package.json");
//#endregion
//#region lib/types/index.js
/**
* Per-agent repeat-call detector. It enriches post-execute decisions with
* logged model context, nudges scoped read-only searches toward reading source,
* and latches a search scope after an exact glob/grep cycle repeats; it never
* rewrites calls or imposes a total-task tool/time/token budget. Configuration and semantics live in the package
* README; rationale lives in the repeat-tool-reminder Agent Note.
* @module @z/dsh-repeat-tool-reminder
*/
const name = "repeat-tool-reminder";
const Config = z.object({
	thresholds: z.array(z.number()).default([
		3,
		5,
		8
	]),
	include: z.array(z.string()).default([]),
	exclude: z.array(z.string()).default([]),
	argumentsPreviewChars: z.number().default(500)
});
/**
* The `{kind:'plugin'}` source stamped on every reminder this guard injects —
* the label is load-bearing (an unlabeled context would render as a user
* prompt in derived history).
*/
const PLUGIN_SOURCE = {
	kind: "plugin",
	plugin: "repeat-tool-reminder"
};
/** Only discovery tools participate; this is not a per-task call or time budget. */
const SEARCH_TOOLS = new Set(["glob", "grep"]);
const SCOPED_READ_TOOLS = new Set(["read", "read_image"]);
const SCOPED_SEARCH_TOOLS = new Set([
	"glob",
	"grep",
	"find",
	"ls"
]);
const FOCUS_SEARCH_TOOLS = new Set([
	"glob",
	"grep",
	"find",
	"ls"
]);
const SEARCH_FOCUS_REMINDER_THRESHOLDS = new Set([2, 4]);
const READONLY_SCOPE_SEARCH_REMINDER_AT = 6;
const MAX_READONLY_SCOPE_SEARCH_CALLS = 10;
const MAX_READONLY_FILE_READ_CALLS = 8;
const MAX_READONLY_IDENTICAL_READ_CALLS = 3;
const READONLY_SCOPE_OPEN = "<taskweaver-readonly-scope-v1>";
const READONLY_SCOPE_CLOSE = "</taskweaver-readonly-scope-v1>";
const MAX_SEARCH_CYCLE_PERIOD = 8;
const SEARCH_CYCLE_HISTORY_SIZE = MAX_SEARCH_CYCLE_PERIOD * 2;
/** After a cycle is latched, allow one model step to switch to a narrower action. */
const MAX_BLOCKED_SCOPE_RETRIES = 1;
/**
* The gentle first-threshold reminder. Keyed to `thresholds[0]`, not a literal
* count, so a custom first threshold keeps the gentle-then-detailed escalation.
*/
const GENTLE_REMINDER = "You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again: if the task is not complete, try a different approach or different arguments instead of repeating the call.";
/** The detailed later-threshold reminder naming the tool, the run length, and the canonical arguments. */
function detailedReminder(toolName, count, canonicalArguments) {
	return `Repeated tool call detected:
- tool: ${toolName}\n- consecutive_calls: ${count}\n- arguments: ${canonicalArguments}\nThe repeated calls are not making progress. Do not call this tool with these exact arguments again. Inspect the latest result and choose a different action, different arguments, or finish the task if enough evidence has been gathered.`;
}
/**
* Deep key-sort of a parsed-JSON value so two argument objects that differ
* only in property order canonicalize identically. Arguments reach the guard
* as the loop's `JSON.parse` output (or its raw-string fallback for malformed
* argument JSON), so JSON's value domain is the whole input domain — no
* bigint, cycle, or `undefined` handling exists because no input path can
* produce them.
*/
function sortJsonValue(value) {
	if (Array.isArray(value)) return value.map(sortJsonValue);
	if (value !== null && typeof value === "object") {
		const record = value;
		const sorted = {};
		for (const key of Object.keys(record).sort()) sorted[key] = sortJsonValue(record[key]);
		return sorted;
	}
	return value;
}
/** Canonical string form of a call's arguments: deep key-sort, then stringify. */
function canonicalize(argumentsValue) {
	return JSON.stringify(sortJsonValue(argumentsValue));
}
/** Compile one `*`-wildcard pattern to an anchored RegExp (every other regex metacharacter is matched literally). */
function wildcardToRegExp(pattern) {
	const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`);
	return new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
}
/**
* Head-truncate the canonical arguments for quoting in the detailed reminder,
* marking how much was omitted. Bounds only the model-visible text — the
* chain key always uses the full canonical string.
*/
function previewArguments(canonical, cap) {
	if (canonical.length <= cap) return canonical;
	return `${canonical.slice(0, cap)}… (+${canonical.length - cap} more chars)`;
}
/**
* Validate `thresholds` per the fail-loud contract and return them sorted
* ascending (the escalation rule reads `thresholds[0]` as the gentle tier, so
* order is normalized here, once).
*/
function validateThresholds(values) {
	if (values.length === 0) throw new Error("repeat-tool-reminder: `thresholds` must not be empty");
	for (const value of values) if (!Number.isInteger(value) || value < 2) throw new Error(`repeat-tool-reminder: invalid threshold ${value} — every threshold must be an integer >= 2`);
	if (new Set(values).size !== values.length) throw new Error("repeat-tool-reminder: `thresholds` must not contain duplicates");
	return [...values].sort((a, b) => a - b);
}
/** Keep nudging after configured thresholds, using the final threshold spacing as cadence. */
function shouldRemindAt(count, thresholds, thresholdSet) {
	if (thresholdSet.has(count)) return true;
	const last = thresholds.at(-1);
	if (last === void 0 || count <= last) return false;
	const previous = thresholds.at(-2);
	const cadence = previous === void 0 ? last : last - previous;
	return cadence > 0 && (count - last) % cadence === 0;
}
/** Reads of one file are often range-by-range and evade exact-argument repeat detection. */
function readTarget(exec) {
	if (exec.name !== "read" || exec.arguments === null || typeof exec.arguments !== "object") return void 0;
	const filePath = exec.arguments.file_path;
	if (typeof filePath !== "string" || filePath.trim() === "") return void 0;
	return filePath.trim().normalize("NFC");
}
/** Normalize a literal workspace-relative path; reject roots, traversal, globs, and absolute paths. */
function normalizeScopedPath(raw) {
	if (typeof raw !== "string" || raw.trim() === "") return void 0;
	const candidate = raw.trim().normalize("NFC").replaceAll("\\", "/");
	const segments = candidate.split("/");
	if (candidate.startsWith("/") || /^[a-z]:/i.test(candidate) || /[\u0000-\u001f\u007f]/.test(candidate) || /[*?{}\[\]]/.test(candidate) || segments.includes("..")) return void 0;
	return segments.filter((segment) => segment !== "" && segment !== ".").join("/") || void 0;
}
/**
* Read the marker only from the direct user prompt of the current turn. It is
* appended after planner text, so planner-provided prompt content cannot
* shadow the enforceable boundary with an earlier marker.
*/
function readOnlyTaskScope(agent) {
	const events = agent.session.events;
	let turnStart = events.length - 1;
	while (turnStart >= 0 && events[turnStart]?.type !== "turn/start") turnStart -= 1;
	if (turnStart < 0) turnStart = 0;
	for (let index = events.length - 1; index >= turnStart; index -= 1) {
		const event = events[index];
		if (event?.type !== "user/message" || event.data.source.kind !== "user") continue;
		const text = event.data.content.map((block) => block.type === "text" ? block.text : "").join("\n");
		const openIndex = text.lastIndexOf(READONLY_SCOPE_OPEN);
		if (openIndex < 0) return void 0;
		const valueStart = openIndex + 30;
		const closeIndex = text.indexOf(READONLY_SCOPE_CLOSE, valueStart);
		if (closeIndex < 0) return {
			paths: [],
			invalid: true
		};
		try {
			const parsed = JSON.parse(text.slice(valueStart, closeIndex));
			if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.paths)) return {
				paths: [],
				invalid: true
			};
			const paths = parsed.paths.map(normalizeScopedPath);
			if (paths.length === 0 || paths.some((path) => path === void 0)) return {
				paths: [],
				invalid: true
			};
			return {
				paths: [...new Set(paths)],
				invalid: false
			};
		} catch {
			return {
				paths: [],
				invalid: true
			};
		}
	}
}
function scopedToolPath(exec) {
	const args = exec.arguments !== null && typeof exec.arguments === "object" ? exec.arguments : {};
	if (exec.name === "glob" && (args.path === void 0 || args.path === ".")) {
		const literalPattern = normalizeScopedPath(args.pattern);
		if (literalPattern) return literalPattern;
	}
	const raw = SCOPED_READ_TOOLS.has(exec.name) ? args.file_path : args.path ?? args.directory ?? args.cwd ?? ".";
	if (typeof raw !== "string" || raw.trim() === "") return void 0;
	if (raw.trim() === ".") return ".";
	return normalizeScopedPath(raw);
}
function isInsideReadOnlyScope(target, paths) {
	if (!target || target === ".") return false;
	return paths.some((scope) => target === scope || target.startsWith(`${scope}/`));
}
function readOnlyScopeDenial(exec, scope, target) {
	const requested = typeof target === "string" ? target : "(missing or invalid path)";
	const allowed = scope.paths.length ? scope.paths.join(", ") : "(none; invalid scope marker)";
	return `TaskWeaver read-only scope denied ${exec.name} at ${requested} before execution. Allowed workspace-relative paths: ${allowed}. Stay within the assigned files/directories; do not retry a broader search. Use evidence already collected, or report the missing evidence and finish the subtask. This is a path boundary, not a total tool-call budget.`;
}
/** A distinct reminder for sequential ranges of the same file (advisory only; legitimate long reads remain possible). */
function readTargetReminder(filePath, count, detailed, previewChars) {
	if (!detailed) return `You have read the same file several times (${previewArguments(JSON.stringify(filePath), previewChars)}), possibly in different line ranges. Reuse the excerpts already gathered; request another range only when you can name the specific missing information, then synthesize your findings.`;
	return `Repeated reads of the same file detected:
- file_path: ${previewArguments(JSON.stringify(filePath), previewChars)}\n- reads_of_file: ${count}\nAvoid overlapping ranges and stop rereading once the relevant evidence is sufficient. Summarize what is known now; if a necessary section is still missing, request only that concrete, non-overlapping range.`;
}
/** A per-scope nudge for TaskWeaver read-only agents that keep searching without opening source. */
function searchFocusReminder(scope, count) {
	return `You have run ${count} filesystem searches in scope ${scope} without reading the matching source. Stop varying search terms for now; read the relevant range from the known file path and cite its line numbers. If the symbol is still not found after one targeted search, report that evidence gap and finish. This is a per-scope progress reminder, not a total tool-call, time, or token budget.`;
}
function readOnlyScopeSearchReminder(scope, count) {
	return `You have made ${count} filesystem searches in the assigned read-only scope ${scope}. The source paths are already known. Stop varying search expressions; read only the relevant source ranges and synthesize the findings. A single scope permits at most ${MAX_READONLY_SCOPE_SEARCH_CALLS} search attempts to prevent repetitive search loops; this does not limit reads, other scopes, or the task as a whole.`;
}
function readOnlyScopeSearchLimitDenial(scope) {
	return `Filesystem search at assigned read-only scope ${scope} was denied after ${MAX_READONLY_SCOPE_SEARCH_CALLS} search attempts in this same scope. Use the known paths and evidence already gathered, read a relevant range if needed, then finish and state any remaining evidence gap. One recovery response is allowed; retrying this blocked scope again ends the turn before another model request. This is not a task-wide budget.`;
}
function readOnlyIdenticalReadDenial(filePath) {
	return `The identical read of ${filePath} has already returned the same source three times, so this read was denied before execution. Use the excerpts already gathered, request a specific non-overlapping range if evidence is missing, or finish and state the gap. One recovery response is allowed; retrying this identical read again ends the turn before another model request. This is not a task-wide budget.`;
}
function readOnlyFileReadLimitDenial(filePath) {
	return `Reads of ${filePath} were denied after ${MAX_READONLY_FILE_READ_CALLS} in-scope reads of this same file in the current agent turn. Use the excerpts already gathered, continue with another already-authorized file, or finish and state any specific evidence gap. One recovery response is allowed; retrying this file again ends the turn before another model request. This is a per-file loop guard, not a task-wide budget.`;
}
function blockedFileReadDenial(filePath) {
	return `Further reads of ${filePath} remain blocked after the one recovery response. Use the existing excerpts or another already-authorized file; the turn will end before another model request.`;
}
function blockedIdenticalReadDenial(filePath) {
	return `The identical read of ${filePath} remains blocked after its one recovery response. Use the existing excerpts or a different, concrete range; the turn will end before another model request.`;
}
/** Return a repeated period when the next tool/scope signature completes a third search cycle. */
function repeatedSearchCycleLength(history, nextKey) {
	for (let period = 2; period <= MAX_SEARCH_CYCLE_PERIOD; period += 1) {
		if (history.length < period * 2 || history.at(-period) !== nextKey) continue;
		const firstCycle = history.slice(-period * 2, -period);
		const secondCycle = history.slice(-period);
		if (firstCycle.every((key, index) => key === secondCycle[index])) return period;
	}
}
/** Search-cycle identity includes the normalized query/options, so distinct useful searches are not mistaken for a loop. */
function searchCallSignature(exec) {
	const args = exec.arguments !== null && typeof exec.arguments === "object" ? exec.arguments : {};
	const queryAndOptions = Object.fromEntries(Object.entries(args).filter(([key]) => ![
		"path",
		"directory",
		"cwd"
	].includes(key)));
	return JSON.stringify([
		exec.name,
		searchScope(exec),
		canonicalize(normalizeSearchValue(queryAndOptions))
	]);
}
function normalizeSearchValue(value) {
	if (typeof value === "string") return value.normalize("NFC");
	if (Array.isArray(value)) return value.map(normalizeSearchValue);
	if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeSearchValue(child)]));
	return value;
}
function searchScope(exec) {
	const args = exec.arguments !== null && typeof exec.arguments === "object" ? exec.arguments : {};
	const raw = args.path ?? args.directory ?? args.cwd ?? ".";
	if (typeof raw !== "string") return canonicalize(raw);
	return raw.trim().replaceAll("\\", "/").replace(/^(?:\.\/)+/, "").replace(/\/+$/, "") || ".";
}
function searchCycleDenial(exec, period, previewChars, scope) {
	const args = previewArguments(canonicalize(exec.arguments), previewChars);
	return `Repeated filesystem-search cycle detected: the same ${period}-call glob/grep sequence with identical search arguments at scope ${scope} has already repeated. This search was denied before execution (tool: ${exec.name}; arguments: ${args}). Further glob/grep calls at the same search scope (${scope}) are now denied for this agent turn. Stop broad filesystem discovery for this turn. Use evidence already gathered and answer now, clearly stating any gaps. Only read a file whose path is already known if one specific missing fact is essential; do not restart or repeat the directory scan.`;
}
function blockedSearchScopeDenial(exec, previewChars, scope, reason) {
	const args = previewArguments(canonicalize(exec.arguments), previewChars);
	if (reason === "readonly-search-limit") return `Filesystem search at assigned read-only scope ${scope} remains blocked after its one recovery response. This variant was denied before execution (tool: ${exec.name}; arguments: ${args}). Use evidence already gathered or read a different, already-known path; the agent turn will stop before another model request.`;
	return `Filesystem search at scope ${scope} was disabled after a repeated glob/grep cycle. This variant was denied before execution (tool: ${exec.name}; arguments: ${args}). This uses the one allowed model retry after the cycle warning; the agent turn will stop before another model request if this blocked scope is retried. Do not try another filesystem search in this scope. Synthesize the answer from evidence already found; if essential, read one already-known path, then answer and state any gaps.`;
}
/**
* Install the guard's listeners.
* @param ctx - plugin context; listeners are scoped to it and disposed with it.
* @param config - validated {@link Config}; `thresholds` is re-checked fail-loud here.
*/
function apply(ctx, config) {
	const thresholds = validateThresholds(config.thresholds);
	const thresholdSet = new Set(thresholds);
	const includePatterns = config.include.map(wildcardToRegExp);
	const excludePatterns = config.exclude.map(wildcardToRegExp);
	const argumentsPreviewChars = config.argumentsPreviewChars;
	if (!Number.isInteger(argumentsPreviewChars) || argumentsPreviewChars < 1) throw new Error(`repeat-tool-reminder: invalid argumentsPreviewChars ${argumentsPreviewChars} — must be an integer >= 1`);
	const chains = /* @__PURE__ */ new WeakMap();
	const readTargetCounts = /* @__PURE__ */ new WeakMap();
	const searchFocusCounts = /* @__PURE__ */ new WeakMap();
	const readOnlyScopeSearchCounts = /* @__PURE__ */ new WeakMap();
	const readOnlyIdenticalReadCounts = /* @__PURE__ */ new WeakMap();
	const blockedReadTargets = /* @__PURE__ */ new WeakMap();
	const blockedIdenticalReads = /* @__PURE__ */ new WeakMap();
	const searchHistories = /* @__PURE__ */ new WeakMap();
	const blockedSearchScopes = /* @__PURE__ */ new WeakMap();
	const stopBeforeNextStep = /* @__PURE__ */ new WeakMap();
	/** Whether a tool participates in the chain (untracked calls are transparent: they neither count nor reset). */
	function tracked(toolName) {
		if (includePatterns.length > 0 && !includePatterns.some((pattern) => pattern.test(toolName))) return false;
		return !excludePatterns.some((pattern) => pattern.test(toolName));
	}
	/**
	* Advance the calling agent's chain for one attempt and return the reminder
	* to deliver, if this attempt's run length hits a configured threshold.
	* Counting happens here — in post-execute — because denied calls also flow
	* through this waterfall (`ToolRuntime.execute` routes a deny through the
	* same pipeline), and a model hammering a denied call is exactly the loop
	* worth breaking.
	*/
	function observe(exec) {
		if (!exec.agent) return void 0;
		if (!tracked(exec.name)) return void 0;
		const path = readTarget(exec);
		if (path !== void 0) {
			chains.delete(exec.agent);
			const counts = readTargetCounts.get(exec.agent) ?? /* @__PURE__ */ new Map();
			const count = (counts.get(path) ?? 0) + 1;
			counts.set(path, count);
			readTargetCounts.set(exec.agent, counts);
			if (!shouldRemindAt(count, thresholds, thresholdSet)) return void 0;
			return createUserMessage({
				content: [{
					type: "text",
					text: readTargetReminder(path, count, count !== thresholds[0], argumentsPreviewChars)
				}],
				source: {
					...PLUGIN_SOURCE,
					form: "notice",
					summary: `${exec.name} ${path} × ${count}`
				}
			});
		}
		const canonical = canonicalize(exec.arguments);
		const key = JSON.stringify([exec.name, canonical]);
		const chain = chains.get(exec.agent);
		const count = chain !== void 0 && chain.key === key ? chain.count + 1 : 1;
		chains.set(exec.agent, {
			key,
			count
		});
		if (!shouldRemindAt(count, thresholds, thresholdSet)) return void 0;
		return createUserMessage({
			content: [{
				type: "text",
				text: count === thresholds[0] ? GENTLE_REMINDER : detailedReminder(exec.name, count, previewArguments(canonical, argumentsPreviewChars))
			}],
			source: {
				...PLUGIN_SOURCE,
				form: "notice",
				summary: `${exec.name} × ${count}`
			}
		});
	}
	/** Count discovery searches per literal scope until a source read demonstrates progress. */
	function observeSearchFocus(exec) {
		if (!exec.agent || !tracked(exec.name)) return void 0;
		const counts = searchFocusCounts.get(exec.agent) ?? /* @__PURE__ */ new Map();
		searchFocusCounts.set(exec.agent, counts);
		const readPath = readTarget(exec);
		if (readPath !== void 0) {
			for (const scope of counts.keys()) if (scope === "." || readPath === scope || readPath.startsWith(`${scope}/`) || scope.startsWith(`${readPath}/`)) counts.delete(scope);
			return;
		}
		if (!FOCUS_SEARCH_TOOLS.has(exec.name) || !readOnlyTaskScope(exec.agent)) return void 0;
		const scope = searchScope(exec);
		const count = (counts.get(scope) ?? 0) + 1;
		counts.set(scope, count);
		if (!SEARCH_FOCUS_REMINDER_THRESHOLDS.has(count)) return void 0;
		return createUserMessage({
			content: [{
				type: "text",
				text: searchFocusReminder(scope, count)
			}],
			source: {
				...PLUGIN_SOURCE,
				form: "notice",
				summary: `${exec.name} ${scope} × ${count}`
			}
		});
	}
	/** Count varied discovery calls per assigned literal scope; reads never reset this loop guard. */
	function observeReadOnlyScopeSearch(exec) {
		if (!exec.agent || !tracked(exec.name) || !FOCUS_SEARCH_TOOLS.has(exec.name)) return void 0;
		if (!readOnlyTaskScope(exec.agent)) return void 0;
		const scope = searchScope(exec);
		const counts = readOnlyScopeSearchCounts.get(exec.agent) ?? /* @__PURE__ */ new Map();
		const count = (counts.get(scope) ?? 0) + 1;
		counts.set(scope, count);
		readOnlyScopeSearchCounts.set(exec.agent, counts);
		if (count !== READONLY_SCOPE_SEARCH_REMINDER_AT) return void 0;
		return createUserMessage({
			content: [{
				type: "text",
				text: readOnlyScopeSearchReminder(scope, count)
			}],
			source: {
				...PLUGIN_SOURCE,
				form: "notice",
				summary: `${exec.name} ${scope} × ${count}`
			}
		});
	}
	/** Exact repeat reads add no new evidence; distinct ranges of a long file remain available. */
	function recordReadOnlyIdenticalRead(exec) {
		if (!exec.agent || !tracked(exec.name) || !SCOPED_READ_TOOLS.has(exec.name)) return;
		if (!readOnlyTaskScope(exec.agent)) return;
		const canonical = canonicalize(exec.arguments);
		const key = JSON.stringify([exec.name, canonical]);
		const counts = readOnlyIdenticalReadCounts.get(exec.agent) ?? /* @__PURE__ */ new Map();
		counts.set(key, (counts.get(key) ?? 0) + 1);
		readOnlyIdenticalReadCounts.set(exec.agent, counts);
	}
	/** Keep a short per-agent suffix of tool/scope/query signatures to recognize exact repeating search cycles. */
	function recordSearchCall(exec) {
		if (!exec.agent || !tracked(exec.name)) return;
		if (!SEARCH_TOOLS.has(exec.name)) {
			searchHistories.delete(exec.agent);
			return;
		}
		const history = searchHistories.get(exec.agent) ?? [];
		history.push(searchCallSignature(exec));
		if (history.length > SEARCH_CYCLE_HISTORY_SIZE) history.splice(0, history.length - SEARCH_CYCLE_HISTORY_SIZE);
		searchHistories.set(exec.agent, history);
	}
	ctx.on("tools/pre-execute", async (exec, next) => {
		if (!exec.agent) return next();
		if (SCOPED_READ_TOOLS.has(exec.name) || SCOPED_SEARCH_TOOLS.has(exec.name)) {
			const scope = readOnlyTaskScope(exec.agent);
			if (scope) {
				const target = scopedToolPath(exec);
				if (scope.invalid || !isInsideReadOnlyScope(target, scope.paths)) return {
					kind: "deny",
					reason: readOnlyScopeDenial(exec, scope, target)
				};
				if (SCOPED_READ_TOOLS.has(exec.name) && tracked(exec.name)) {
					const filePath = readTarget(exec);
					const blockedTargets = blockedReadTargets.get(exec.agent);
					const blockedTarget = filePath ? blockedTargets?.get(filePath) : void 0;
					if (filePath && blockedTarget) {
						blockedTarget.blockedRetries += 1;
						if (blockedTarget.blockedRetries >= MAX_BLOCKED_SCOPE_RETRIES) stopBeforeNextStep.set(exec.agent, filePath);
						return {
							kind: "deny",
							reason: blockedFileReadDenial(filePath)
						};
					}
					if (filePath && (readTargetCounts.get(exec.agent)?.get(filePath) ?? 0) >= MAX_READONLY_FILE_READ_CALLS) {
						const nextBlockedTargets = blockedReadTargets.get(exec.agent) ?? /* @__PURE__ */ new Map();
						nextBlockedTargets.set(filePath, { blockedRetries: 0 });
						blockedReadTargets.set(exec.agent, nextBlockedTargets);
						return {
							kind: "deny",
							reason: readOnlyFileReadLimitDenial(filePath)
						};
					}
					const signature = JSON.stringify([exec.name, canonicalize(exec.arguments)]);
					const blockedRead = blockedIdenticalReads.get(exec.agent)?.get(signature);
					if (blockedRead) {
						blockedRead.blockedRetries += 1;
						if (blockedRead.blockedRetries >= MAX_BLOCKED_SCOPE_RETRIES) stopBeforeNextStep.set(exec.agent, signature);
						return {
							kind: "deny",
							reason: blockedIdenticalReadDenial(readTarget(exec) ?? target ?? "(unknown file)")
						};
					}
					if ((readOnlyIdenticalReadCounts.get(exec.agent)?.get(signature) ?? 0) >= MAX_READONLY_IDENTICAL_READ_CALLS) {
						const nextBlockedReads = blockedIdenticalReads.get(exec.agent) ?? /* @__PURE__ */ new Map();
						nextBlockedReads.set(signature, { blockedRetries: 0 });
						blockedIdenticalReads.set(exec.agent, nextBlockedReads);
						return {
							kind: "deny",
							reason: readOnlyIdenticalReadDenial(readTarget(exec) ?? target ?? "(unknown file)")
						};
					}
				}
			}
		}
		if (!tracked(exec.name) || !SEARCH_TOOLS.has(exec.name)) return next();
		const scope = searchScope(exec);
		const blocked = blockedSearchScopes.get(exec.agent)?.get(scope);
		if (blocked) {
			blocked.blockedRetries += 1;
			if (blocked.blockedRetries >= MAX_BLOCKED_SCOPE_RETRIES) stopBeforeNextStep.set(exec.agent, scope);
			return {
				kind: "deny",
				reason: blockedSearchScopeDenial(exec, argumentsPreviewChars, scope, blocked.reason)
			};
		}
		if (readOnlyTaskScope(exec.agent) && (readOnlyScopeSearchCounts.get(exec.agent)?.get(scope) ?? 0) >= MAX_READONLY_SCOPE_SEARCH_CALLS) {
			const blockedScopes = blockedSearchScopes.get(exec.agent) ?? /* @__PURE__ */ new Map();
			blockedScopes.set(scope, {
				blockedRetries: 0,
				reason: "readonly-search-limit"
			});
			blockedSearchScopes.set(exec.agent, blockedScopes);
			return {
				kind: "deny",
				reason: readOnlyScopeSearchLimitDenial(scope)
			};
		}
		const period = repeatedSearchCycleLength(searchHistories.get(exec.agent) ?? [], searchCallSignature(exec));
		if (period === void 0) return next();
		const blockedScopes = blockedSearchScopes.get(exec.agent) ?? /* @__PURE__ */ new Map();
		blockedScopes.set(scope, {
			blockedRetries: 0,
			reason: "cycle"
		});
		blockedSearchScopes.set(exec.agent, blockedScopes);
		return {
			kind: "deny",
			reason: searchCycleDenial(exec, period, argumentsPreviewChars, scope)
		};
	});
	ctx.on("tools/post-execute", async (exec, _result, next) => {
		recordSearchCall(exec);
		recordReadOnlyIdenticalRead(exec);
		const focusReminder = observeSearchFocus(exec);
		const scopeSearchReminder = observeReadOnlyScopeSearch(exec);
		const reminder = observe(exec);
		const downstream = await next();
		const reminders = [
			focusReminder,
			scopeSearchReminder,
			reminder
		].filter((item) => item !== void 0);
		if (reminders.length === 0) return downstream;
		if (downstream.kind === "block") return {
			kind: "block",
			feedback: downstream.feedback,
			additionalContexts: [...reminders, ...downstream.additionalContexts ?? []]
		};
		return {
			...downstream,
			additionalContexts: [...reminders, ...downstream.additionalContexts ?? []]
		};
	});
	ctx.on("agent/pre-step", ({ agent, messages }, next) => {
		if (messages.some((message) => message.source.kind === "user")) {
			chains.delete(agent);
			readTargetCounts.delete(agent);
			searchFocusCounts.delete(agent);
			readOnlyScopeSearchCounts.delete(agent);
			readOnlyIdenticalReadCounts.delete(agent);
			blockedReadTargets.delete(agent);
			blockedIdenticalReads.delete(agent);
			searchHistories.delete(agent);
			blockedSearchScopes.delete(agent);
			stopBeforeNextStep.delete(agent);
			return next();
		}
		if (stopBeforeNextStep.has(agent)) {
			stopBeforeNextStep.delete(agent);
			return Promise.resolve({ kind: "reject" });
		}
		return next();
	});
}
//#endregion
export { Config, apply, name };
