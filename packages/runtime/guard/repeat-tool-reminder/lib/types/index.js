"use strict";
/**
 * Per-agent repeat-call detector. It enriches post-execute decisions with
 * logged model context, nudges scoped read-only searches toward reading source,
 * and latches a search scope after an exact glob/grep cycle repeats; it never
 * rewrites calls or imposes a total-task tool/time/token budget. Configuration and semantics live in the package
 * README; rationale lives in the repeat-tool-reminder Agent Note.
 * @module @z/dsh-repeat-tool-reminder
 */
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.name = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_llm_1 = require("@z/dsh-llm");
exports.name = 'repeat-tool-reminder';
exports.Config = schemastery_1.default.object({
    thresholds: schemastery_1.default.array(schemastery_1.default.number()).default([3, 5, 8]),
    include: schemastery_1.default.array(schemastery_1.default.string()).default([]),
    exclude: schemastery_1.default.array(schemastery_1.default.string()).default([]),
    argumentsPreviewChars: schemastery_1.default.number().default(500),
});
/**
 * The `{kind:'plugin'}` source stamped on every reminder this guard injects —
 * the label is load-bearing (an unlabeled context would render as a user
 * prompt in derived history).
 */
var PLUGIN_SOURCE = { kind: 'plugin', plugin: 'repeat-tool-reminder' };
/** Only discovery tools participate; this is not a per-task call or time budget. */
var SEARCH_TOOLS = new Set(['glob', 'grep']);
var SCOPED_READ_TOOLS = new Set(['read', 'read_image']);
var SCOPED_SEARCH_TOOLS = new Set(['glob', 'grep', 'find', 'ls']);
var FOCUS_SEARCH_TOOLS = new Set(['glob', 'grep', 'find', 'ls']);
var SEARCH_FOCUS_REMINDER_THRESHOLDS = new Set([2, 4]);
var READONLY_SCOPE_SEARCH_REMINDER_AT = 6;
var MAX_READONLY_SCOPE_SEARCH_CALLS = 10;
var MAX_READONLY_FILE_READ_CALLS = 8;
var MAX_READONLY_IDENTICAL_READ_CALLS = 3;
var READONLY_SCOPE_OPEN = '<taskweaver-readonly-scope-v1>';
var READONLY_SCOPE_CLOSE = '</taskweaver-readonly-scope-v1>';
var MAX_SEARCH_CYCLE_PERIOD = 8;
var SEARCH_CYCLE_HISTORY_SIZE = MAX_SEARCH_CYCLE_PERIOD * 2;
/** After a cycle is latched, allow one model step to switch to a narrower action. */
var MAX_BLOCKED_SCOPE_RETRIES = 1;
/**
 * The gentle first-threshold reminder. Keyed to `thresholds[0]`, not a literal
 * count, so a custom first threshold keeps the gentle-then-detailed escalation.
 */
var GENTLE_REMINDER = 'You are repeating the exact same tool call with identical arguments. '
    + 'Carefully analyze the previous result before calling again: if the task is '
    + 'not complete, try a different approach or different arguments instead of '
    + 'repeating the call.';
/** The detailed later-threshold reminder naming the tool, the run length, and the canonical arguments. */
function detailedReminder(toolName, count, canonicalArguments) {
    return 'Repeated tool call detected:\n'
        + "- tool: ".concat(toolName, "\n")
        + "- consecutive_calls: ".concat(count, "\n")
        + "- arguments: ".concat(canonicalArguments, "\n")
        + 'The repeated calls are not making progress. Do not call this tool with '
        + 'these exact arguments again. Inspect the latest result and choose a '
        + 'different action, different arguments, or finish the task if enough '
        + 'evidence has been gathered.';
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
    if (Array.isArray(value))
        return value.map(sortJsonValue);
    if (value !== null && typeof value === 'object') {
        var record = value;
        var sorted = {};
        for (var _i = 0, _a = Object.keys(record).sort(); _i < _a.length; _i++) {
            var key = _a[_i];
            sorted[key] = sortJsonValue(record[key]);
        }
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
    var escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, String.raw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["$&"], ["\\$&"]))));
    return new RegExp("^".concat(escaped.replaceAll('*', '.*'), "$"));
}
/**
 * Head-truncate the canonical arguments for quoting in the detailed reminder,
 * marking how much was omitted. Bounds only the model-visible text — the
 * chain key always uses the full canonical string.
 */
function previewArguments(canonical, cap) {
    if (canonical.length <= cap)
        return canonical;
    return "".concat(canonical.slice(0, cap), "\u2026 (+").concat(canonical.length - cap, " more chars)");
}
/**
 * Validate `thresholds` per the fail-loud contract and return them sorted
 * ascending (the escalation rule reads `thresholds[0]` as the gentle tier, so
 * order is normalized here, once).
 */
function validateThresholds(values) {
    if (values.length === 0) {
        throw new Error('repeat-tool-reminder: `thresholds` must not be empty');
    }
    for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
        var value = values_1[_i];
        if (!Number.isInteger(value) || value < 2) {
            throw new Error("repeat-tool-reminder: invalid threshold ".concat(value, " \u2014 every threshold must be an integer >= 2"));
        }
    }
    if (new Set(values).size !== values.length) {
        throw new Error('repeat-tool-reminder: `thresholds` must not contain duplicates');
    }
    return __spreadArray([], values, true).sort(function (a, b) { return a - b; });
}
/** Keep nudging after configured thresholds, using the final threshold spacing as cadence. */
function shouldRemindAt(count, thresholds, thresholdSet) {
    if (thresholdSet.has(count))
        return true;
    var last = thresholds.at(-1);
    if (last === undefined || count <= last)
        return false;
    var previous = thresholds.at(-2);
    var cadence = previous === undefined ? last : last - previous;
    return cadence > 0 && (count - last) % cadence === 0;
}
/** Reads of one file are often range-by-range and evade exact-argument repeat detection. */
function readTarget(exec) {
    if (exec.name !== 'read' || exec.arguments === null || typeof exec.arguments !== 'object')
        return undefined;
    var filePath = exec.arguments.file_path;
    if (typeof filePath !== 'string' || filePath.trim() === '')
        return undefined;
    return filePath.trim().normalize('NFC');
}
/** Normalize a literal workspace-relative path; reject roots, traversal, globs, and absolute paths. */
function normalizeScopedPath(raw) {
    if (typeof raw !== 'string' || raw.trim() === '')
        return undefined;
    var candidate = raw.trim().normalize('NFC').replaceAll('\\', '/');
    var segments = candidate.split('/');
    if (candidate.startsWith('/')
        || /^[a-z]:/i.test(candidate)
        || /[\u0000-\u001f\u007f]/.test(candidate)
        || /[*?{}\[\]]/.test(candidate)
        || segments.includes('..'))
        return undefined;
    var normalized = segments.filter(function (segment) { return segment !== '' && segment !== '.'; }).join('/');
    return normalized || undefined;
}
/**
 * Read the marker only from the direct user prompt of the current turn. It is
 * appended after planner text, so planner-provided prompt content cannot
 * shadow the enforceable boundary with an earlier marker.
 */
function readOnlyTaskScope(agent) {
    var _a;
    var events = agent.session.events;
    var turnStart = events.length - 1;
    while (turnStart >= 0 && ((_a = events[turnStart]) === null || _a === void 0 ? void 0 : _a.type) !== 'turn/start')
        turnStart -= 1;
    if (turnStart < 0)
        turnStart = 0;
    for (var index = events.length - 1; index >= turnStart; index -= 1) {
        var event_1 = events[index];
        if ((event_1 === null || event_1 === void 0 ? void 0 : event_1.type) !== 'user/message' || event_1.data.source.kind !== 'user')
            continue;
        var text = event_1.data.content
            .map(function (block) { return block.type === 'text' ? block.text : ''; })
            .join('\n');
        var openIndex = text.lastIndexOf(READONLY_SCOPE_OPEN);
        if (openIndex < 0)
            return undefined;
        var valueStart = openIndex + READONLY_SCOPE_OPEN.length;
        var closeIndex = text.indexOf(READONLY_SCOPE_CLOSE, valueStart);
        if (closeIndex < 0)
            return { paths: [], invalid: true };
        try {
            var parsed = JSON.parse(text.slice(valueStart, closeIndex));
            if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.paths)) {
                return { paths: [], invalid: true };
            }
            var rawPaths = parsed.paths;
            var paths = rawPaths.map(normalizeScopedPath);
            if (paths.length === 0 || paths.some(function (path) { return path === undefined; }))
                return { paths: [], invalid: true };
            return { paths: __spreadArray([], new Set(paths), true), invalid: false };
        }
        catch (_b) {
            return { paths: [], invalid: true };
        }
    }
    return undefined;
}
function scopedToolPath(exec) {
    var _a, _b, _c;
    var args = exec.arguments !== null && typeof exec.arguments === 'object'
        ? exec.arguments
        : {};
    // Models sometimes call glob with only an exact pattern, leaving `path` at
    // the workspace root. Treat that as the named target (not as permission to
    // search the root); wildcard patterns at `.` remain denied below.
    if (exec.name === 'glob' && (args.path === undefined || args.path === '.')) {
        var literalPattern = normalizeScopedPath(args.pattern);
        if (literalPattern)
            return literalPattern;
    }
    var raw = SCOPED_READ_TOOLS.has(exec.name)
        ? args.file_path
        : (_c = (_b = (_a = args.path) !== null && _a !== void 0 ? _a : args.directory) !== null && _b !== void 0 ? _b : args.cwd) !== null && _c !== void 0 ? _c : '.';
    if (typeof raw !== 'string' || raw.trim() === '')
        return undefined;
    if (raw.trim() === '.')
        return '.';
    return normalizeScopedPath(raw);
}
function isInsideReadOnlyScope(target, paths) {
    if (!target || target === '.')
        return false;
    return paths.some(function (scope) { return target === scope || target.startsWith("".concat(scope, "/")); });
}
function readOnlyScopeDenial(exec, scope, target) {
    var requested = typeof target === 'string' ? target : '(missing or invalid path)';
    var allowed = scope.paths.length ? scope.paths.join(', ') : '(none; invalid scope marker)';
    return "TaskWeaver read-only scope denied ".concat(exec.name, " at ").concat(requested, " before execution. ")
        + "Allowed workspace-relative paths: ".concat(allowed, ". Stay within the assigned files/directories; do not retry a broader search. ")
        + 'Use evidence already collected, or report the missing evidence and finish the subtask. This is a path boundary, not a total tool-call budget.';
}
/** A distinct reminder for sequential ranges of the same file (advisory only; legitimate long reads remain possible). */
function readTargetReminder(filePath, count, detailed, previewChars) {
    if (!detailed) {
        return 'You have read the same file several times '
            + "(".concat(previewArguments(JSON.stringify(filePath), previewChars), "), possibly in different line ranges. Reuse the excerpts already gathered; ")
            + 'request another range only when you can name the specific missing information, then synthesize your findings.';
    }
    return 'Repeated reads of the same file detected:\n'
        + "- file_path: ".concat(previewArguments(JSON.stringify(filePath), previewChars), "\n")
        + "- reads_of_file: ".concat(count, "\n")
        + 'Avoid overlapping ranges and stop rereading once the relevant evidence is sufficient. Summarize what is known now; '
        + 'if a necessary section is still missing, request only that concrete, non-overlapping range.';
}
/** A per-scope nudge for TaskWeaver read-only agents that keep searching without opening source. */
function searchFocusReminder(scope, count) {
    return "You have run ".concat(count, " filesystem searches in scope ").concat(scope, " without reading the matching source. ")
        + 'Stop varying search terms for now; read the relevant range from the known file path and cite its line numbers. '
        + 'If the symbol is still not found after one targeted search, report that evidence gap and finish. '
        + 'This is a per-scope progress reminder, not a total tool-call, time, or token budget.';
}
function readOnlyScopeSearchReminder(scope, count) {
    return "You have made ".concat(count, " filesystem searches in the assigned read-only scope ").concat(scope, ". ")
        + 'The source paths are already known. Stop varying search expressions; read only the relevant source ranges and synthesize the findings. '
        + "A single scope permits at most ".concat(MAX_READONLY_SCOPE_SEARCH_CALLS, " search attempts to prevent repetitive search loops; this does not limit reads, other scopes, or the task as a whole.");
}
function readOnlyScopeSearchLimitDenial(scope) {
    return "Filesystem search at assigned read-only scope ".concat(scope, " was denied after ").concat(MAX_READONLY_SCOPE_SEARCH_CALLS, " search attempts in this same scope. ")
        + 'Use the known paths and evidence already gathered, read a relevant range if needed, then finish and state any remaining evidence gap. '
        + 'One recovery response is allowed; retrying this blocked scope again ends the turn before another model request. This is not a task-wide budget.';
}
function readOnlyIdenticalReadDenial(filePath) {
    return "The identical read of ".concat(filePath, " has already returned the same source three times, so this read was denied before execution. ")
        + 'Use the excerpts already gathered, request a specific non-overlapping range if evidence is missing, or finish and state the gap. '
        + 'One recovery response is allowed; retrying this identical read again ends the turn before another model request. This is not a task-wide budget.';
}
function readOnlyFileReadLimitDenial(filePath) {
    return "Reads of ".concat(filePath, " were denied after ").concat(MAX_READONLY_FILE_READ_CALLS, " in-scope reads of this same file in the current agent turn. ")
        + 'Use the excerpts already gathered, continue with another already-authorized file, or finish and state any specific evidence gap. '
        + 'One recovery response is allowed; retrying this file again ends the turn before another model request. This is a per-file loop guard, not a task-wide budget.';
}
function blockedFileReadDenial(filePath) {
    return "Further reads of ".concat(filePath, " remain blocked after the one recovery response. ")
        + 'Use the existing excerpts or another already-authorized file; the turn will end before another model request.';
}
function blockedIdenticalReadDenial(filePath) {
    return "The identical read of ".concat(filePath, " remains blocked after its one recovery response. ")
        + 'Use the existing excerpts or a different, concrete range; the turn will end before another model request.';
}
/** Return a repeated period when the next tool/scope signature completes a third search cycle. */
function repeatedSearchCycleLength(history, nextKey) {
    var _loop_1 = function (period) {
        if (history.length < period * 2 || history.at(-period) !== nextKey)
            return "continue";
        var firstCycle = history.slice(-period * 2, -period);
        var secondCycle = history.slice(-period);
        if (firstCycle.every(function (key, index) { return key === secondCycle[index]; }))
            return { value: period };
    };
    for (var period = 2; period <= MAX_SEARCH_CYCLE_PERIOD; period += 1) {
        var state_1 = _loop_1(period);
        if (typeof state_1 === "object")
            return state_1.value;
    }
    return undefined;
}
/** Search-cycle identity includes the normalized query/options, so distinct useful searches are not mistaken for a loop. */
function searchCallSignature(exec) {
    var args = exec.arguments !== null && typeof exec.arguments === 'object'
        ? exec.arguments
        : {};
    var queryAndOptions = Object.fromEntries(Object.entries(args).filter(function (_a) {
        var key = _a[0];
        return !['path', 'directory', 'cwd'].includes(key);
    }));
    return JSON.stringify([exec.name, searchScope(exec), canonicalize(normalizeSearchValue(queryAndOptions))]);
}
function normalizeSearchValue(value) {
    if (typeof value === 'string')
        return value.normalize('NFC');
    if (Array.isArray(value))
        return value.map(normalizeSearchValue);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(function (_a) {
            var key = _a[0], child = _a[1];
            return [key, normalizeSearchValue(child)];
        }));
    }
    return value;
}
function searchScope(exec) {
    var _a, _b, _c;
    var args = exec.arguments !== null && typeof exec.arguments === 'object'
        ? exec.arguments
        : {};
    var raw = (_c = (_b = (_a = args.path) !== null && _a !== void 0 ? _a : args.directory) !== null && _b !== void 0 ? _b : args.cwd) !== null && _c !== void 0 ? _c : '.';
    if (typeof raw !== 'string')
        return canonicalize(raw);
    var normalized = raw.trim().replaceAll('\\', '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
    return normalized || '.';
}
function searchCycleDenial(exec, period, previewChars, scope) {
    var args = previewArguments(canonicalize(exec.arguments), previewChars);
    return "Repeated filesystem-search cycle detected: the same ".concat(period, "-call glob/grep sequence with identical search arguments at scope ").concat(scope, " has already repeated. ")
        + "This search was denied before execution (tool: ".concat(exec.name, "; arguments: ").concat(args, "). ")
        + "Further glob/grep calls at the same search scope (".concat(scope, ") are now denied for this agent turn. ")
        + 'Stop broad filesystem discovery for this turn. Use evidence already gathered and answer now, clearly stating any gaps. '
        + 'Only read a file whose path is already known if one specific missing fact is essential; do not restart or repeat the directory scan.';
}
function blockedSearchScopeDenial(exec, previewChars, scope, reason) {
    var args = previewArguments(canonicalize(exec.arguments), previewChars);
    if (reason === 'readonly-search-limit') {
        return "Filesystem search at assigned read-only scope ".concat(scope, " remains blocked after its one recovery response. ")
            + "This variant was denied before execution (tool: ".concat(exec.name, "; arguments: ").concat(args, "). ")
            + 'Use evidence already gathered or read a different, already-known path; the agent turn will stop before another model request.';
    }
    return "Filesystem search at scope ".concat(scope, " was disabled after a repeated glob/grep cycle. ")
        + "This variant was denied before execution (tool: ".concat(exec.name, "; arguments: ").concat(args, "). ")
        + 'This uses the one allowed model retry after the cycle warning; the agent turn will stop before another model request if this blocked scope is retried. '
        + 'Do not try another filesystem search in this scope. Synthesize the answer from evidence already found; if essential, read one already-known path, then answer and state any gaps.';
}
/**
 * Install the guard's listeners.
 * @param ctx - plugin context; listeners are scoped to it and disposed with it.
 * @param config - validated {@link Config}; `thresholds` is re-checked fail-loud here.
 */
function apply(ctx, config) {
    var _this = this;
    // schemastery's .default() guarantees the fields are set after validation.
    var thresholds = validateThresholds(config.thresholds);
    var thresholdSet = new Set(thresholds);
    var includePatterns = config.include.map(wildcardToRegExp);
    var excludePatterns = config.exclude.map(wildcardToRegExp);
    var argumentsPreviewChars = config.argumentsPreviewChars;
    if (!Number.isInteger(argumentsPreviewChars) || argumentsPreviewChars < 1) {
        throw new Error("repeat-tool-reminder: invalid argumentsPreviewChars ".concat(argumentsPreviewChars, " \u2014 must be an integer >= 1"));
    }
    var chains = new WeakMap();
    var readTargetCounts = new WeakMap();
    var searchFocusCounts = new WeakMap();
    var readOnlyScopeSearchCounts = new WeakMap();
    var readOnlyIdenticalReadCounts = new WeakMap();
    var blockedReadTargets = new WeakMap();
    var blockedIdenticalReads = new WeakMap();
    var searchHistories = new WeakMap();
    var blockedSearchScopes = new WeakMap();
    var stopBeforeNextStep = new WeakMap();
    /** Whether a tool participates in the chain (untracked calls are transparent: they neither count nor reset). */
    function tracked(toolName) {
        if (includePatterns.length > 0 && !includePatterns.some(function (pattern) { return pattern.test(toolName); }))
            return false;
        return !excludePatterns.some(function (pattern) { return pattern.test(toolName); });
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
        var _a, _b;
        // A direct `ctx.tools.execute()` caller has no model to remind and no id
        // to key on; only agent-loop calls participate.
        if (!exec.agent)
            return undefined;
        if (!tracked(exec.name))
            return undefined;
        var path = readTarget(exec);
        if (path !== undefined) {
            // Keep same-file reads independent from the exact-call chain: useful
            // searches or reads of other files between ranges must not erase the
            // advisory signal for a file the agent keeps reopening.
            chains.delete(exec.agent);
            var counts = (_a = readTargetCounts.get(exec.agent)) !== null && _a !== void 0 ? _a : new Map();
            var count_1 = ((_b = counts.get(path)) !== null && _b !== void 0 ? _b : 0) + 1;
            counts.set(path, count_1);
            readTargetCounts.set(exec.agent, counts);
            if (!shouldRemindAt(count_1, thresholds, thresholdSet))
                return undefined;
            return (0, dsh_llm_1.createUserMessage)({
                content: [{ type: 'text', text: readTargetReminder(path, count_1, count_1 !== thresholds[0], argumentsPreviewChars) }],
                source: __assign(__assign({}, PLUGIN_SOURCE), { form: 'notice', summary: "".concat(exec.name, " ").concat(path, " \u00D7 ").concat(count_1) }),
            });
        }
        var canonical = canonicalize(exec.arguments);
        var key = JSON.stringify([exec.name, canonical]);
        var chain = chains.get(exec.agent);
        var count = chain !== undefined && chain.key === key ? chain.count + 1 : 1;
        chains.set(exec.agent, { key: key, count: count });
        if (!shouldRemindAt(count, thresholds, thresholdSet))
            return undefined;
        var text = count === thresholds[0]
            ? GENTLE_REMINDER
            : detailedReminder(exec.name, count, previewArguments(canonical, argumentsPreviewChars));
        return (0, dsh_llm_1.createUserMessage)({
            content: [{ type: 'text', text: text }],
            source: __assign(__assign({}, PLUGIN_SOURCE), { form: 'notice', summary: "".concat(exec.name, " \u00D7 ").concat(count) }),
        });
    }
    /** Count discovery searches per literal scope until a source read demonstrates progress. */
    function observeSearchFocus(exec) {
        var _a, _b;
        if (!exec.agent || !tracked(exec.name))
            return undefined;
        var counts = (_a = searchFocusCounts.get(exec.agent)) !== null && _a !== void 0 ? _a : new Map();
        searchFocusCounts.set(exec.agent, counts);
        var readPath = readTarget(exec);
        if (readPath !== undefined) {
            for (var _i = 0, _c = counts.keys(); _i < _c.length; _i++) {
                var scope_1 = _c[_i];
                if (scope_1 === '.' || readPath === scope_1 || readPath.startsWith("".concat(scope_1, "/")) || scope_1.startsWith("".concat(readPath, "/"))) {
                    counts.delete(scope_1);
                }
            }
            return undefined;
        }
        if (!FOCUS_SEARCH_TOOLS.has(exec.name) || !readOnlyTaskScope(exec.agent))
            return undefined;
        var scope = searchScope(exec);
        var count = ((_b = counts.get(scope)) !== null && _b !== void 0 ? _b : 0) + 1;
        counts.set(scope, count);
        if (!SEARCH_FOCUS_REMINDER_THRESHOLDS.has(count))
            return undefined;
        return (0, dsh_llm_1.createUserMessage)({
            content: [{ type: 'text', text: searchFocusReminder(scope, count) }],
            source: __assign(__assign({}, PLUGIN_SOURCE), { form: 'notice', summary: "".concat(exec.name, " ").concat(scope, " \u00D7 ").concat(count) }),
        });
    }
    /** Count varied discovery calls per assigned literal scope; reads never reset this loop guard. */
    function observeReadOnlyScopeSearch(exec) {
        var _a, _b;
        if (!exec.agent || !tracked(exec.name) || !FOCUS_SEARCH_TOOLS.has(exec.name))
            return undefined;
        if (!readOnlyTaskScope(exec.agent))
            return undefined;
        var scope = searchScope(exec);
        var counts = (_a = readOnlyScopeSearchCounts.get(exec.agent)) !== null && _a !== void 0 ? _a : new Map();
        var count = ((_b = counts.get(scope)) !== null && _b !== void 0 ? _b : 0) + 1;
        counts.set(scope, count);
        readOnlyScopeSearchCounts.set(exec.agent, counts);
        if (count !== READONLY_SCOPE_SEARCH_REMINDER_AT)
            return undefined;
        return (0, dsh_llm_1.createUserMessage)({
            content: [{ type: 'text', text: readOnlyScopeSearchReminder(scope, count) }],
            source: __assign(__assign({}, PLUGIN_SOURCE), { form: 'notice', summary: "".concat(exec.name, " ").concat(scope, " \u00D7 ").concat(count) }),
        });
    }
    /** Exact repeat reads add no new evidence; distinct ranges of a long file remain available. */
    function recordReadOnlyIdenticalRead(exec) {
        var _a, _b;
        if (!exec.agent || !tracked(exec.name) || !SCOPED_READ_TOOLS.has(exec.name))
            return;
        if (!readOnlyTaskScope(exec.agent))
            return;
        var canonical = canonicalize(exec.arguments);
        var key = JSON.stringify([exec.name, canonical]);
        var counts = (_a = readOnlyIdenticalReadCounts.get(exec.agent)) !== null && _a !== void 0 ? _a : new Map();
        counts.set(key, ((_b = counts.get(key)) !== null && _b !== void 0 ? _b : 0) + 1);
        readOnlyIdenticalReadCounts.set(exec.agent, counts);
    }
    /** Keep a short per-agent suffix of tool/scope/query signatures to recognize exact repeating search cycles. */
    function recordSearchCall(exec) {
        var _a;
        if (!exec.agent || !tracked(exec.name))
            return;
        if (!SEARCH_TOOLS.has(exec.name)) {
            searchHistories.delete(exec.agent);
            return;
        }
        var history = (_a = searchHistories.get(exec.agent)) !== null && _a !== void 0 ? _a : [];
        history.push(searchCallSignature(exec));
        if (history.length > SEARCH_CYCLE_HISTORY_SIZE)
            history.splice(0, history.length - SEARCH_CYCLE_HISTORY_SIZE);
        searchHistories.set(exec.agent, history);
    }
    // A recurring multi-query search cycle evades the consecutive-identical-call
    // advisory. Cycle identity includes tool, normalized scope, and canonical
    // query/options, so genuinely different searches remain available. Once an
    // exact cycle is confirmed, latch that path for the rest of the agent turn;
    // other scopes and direct reads remain usable.
    ctx.on('tools/pre-execute', function (exec, next) { return __awaiter(_this, void 0, void 0, function () {
        var scope_2, target, filePath, blockedTargets, blockedTarget, nextBlockedTargets, signature, blockedReads, blockedRead, filePath_1, nextBlockedReads, filePath_2, scope, blocked, blockedScopes_1, history, key, period, blockedScopes;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        return __generator(this, function (_s) {
            if (!exec.agent)
                return [2 /*return*/, next()];
            if (SCOPED_READ_TOOLS.has(exec.name) || SCOPED_SEARCH_TOOLS.has(exec.name)) {
                scope_2 = readOnlyTaskScope(exec.agent);
                if (scope_2) {
                    target = scopedToolPath(exec);
                    if (scope_2.invalid || !isInsideReadOnlyScope(target, scope_2.paths)) {
                        return [2 /*return*/, { kind: 'deny', reason: readOnlyScopeDenial(exec, scope_2, target) }];
                    }
                    if (SCOPED_READ_TOOLS.has(exec.name) && tracked(exec.name)) {
                        filePath = readTarget(exec);
                        blockedTargets = blockedReadTargets.get(exec.agent);
                        blockedTarget = filePath ? blockedTargets === null || blockedTargets === void 0 ? void 0 : blockedTargets.get(filePath) : undefined;
                        if (filePath && blockedTarget) {
                            blockedTarget.blockedRetries += 1;
                            if (blockedTarget.blockedRetries >= MAX_BLOCKED_SCOPE_RETRIES)
                                stopBeforeNextStep.set(exec.agent, filePath);
                            return [2 /*return*/, { kind: 'deny', reason: blockedFileReadDenial(filePath) }];
                        }
                        if (filePath && ((_b = (_a = readTargetCounts.get(exec.agent)) === null || _a === void 0 ? void 0 : _a.get(filePath)) !== null && _b !== void 0 ? _b : 0) >= MAX_READONLY_FILE_READ_CALLS) {
                            nextBlockedTargets = (_c = blockedReadTargets.get(exec.agent)) !== null && _c !== void 0 ? _c : new Map();
                            nextBlockedTargets.set(filePath, { blockedRetries: 0 });
                            blockedReadTargets.set(exec.agent, nextBlockedTargets);
                            return [2 /*return*/, { kind: 'deny', reason: readOnlyFileReadLimitDenial(filePath) }];
                        }
                        signature = JSON.stringify([exec.name, canonicalize(exec.arguments)]);
                        blockedReads = blockedIdenticalReads.get(exec.agent);
                        blockedRead = blockedReads === null || blockedReads === void 0 ? void 0 : blockedReads.get(signature);
                        if (blockedRead) {
                            blockedRead.blockedRetries += 1;
                            if (blockedRead.blockedRetries >= MAX_BLOCKED_SCOPE_RETRIES)
                                stopBeforeNextStep.set(exec.agent, signature);
                            filePath_1 = (_e = (_d = readTarget(exec)) !== null && _d !== void 0 ? _d : target) !== null && _e !== void 0 ? _e : '(unknown file)';
                            return [2 /*return*/, { kind: 'deny', reason: blockedIdenticalReadDenial(filePath_1) }];
                        }
                        if (((_g = (_f = readOnlyIdenticalReadCounts.get(exec.agent)) === null || _f === void 0 ? void 0 : _f.get(signature)) !== null && _g !== void 0 ? _g : 0) >= MAX_READONLY_IDENTICAL_READ_CALLS) {
                            nextBlockedReads = (_h = blockedIdenticalReads.get(exec.agent)) !== null && _h !== void 0 ? _h : new Map();
                            nextBlockedReads.set(signature, { blockedRetries: 0 });
                            blockedIdenticalReads.set(exec.agent, nextBlockedReads);
                            filePath_2 = (_k = (_j = readTarget(exec)) !== null && _j !== void 0 ? _j : target) !== null && _k !== void 0 ? _k : '(unknown file)';
                            return [2 /*return*/, { kind: 'deny', reason: readOnlyIdenticalReadDenial(filePath_2) }];
                        }
                    }
                }
            }
            if (!tracked(exec.name) || !SEARCH_TOOLS.has(exec.name))
                return [2 /*return*/, next()];
            scope = searchScope(exec);
            blocked = (_l = blockedSearchScopes.get(exec.agent)) === null || _l === void 0 ? void 0 : _l.get(scope);
            if (blocked) {
                blocked.blockedRetries += 1;
                if (blocked.blockedRetries >= MAX_BLOCKED_SCOPE_RETRIES)
                    stopBeforeNextStep.set(exec.agent, scope);
                return [2 /*return*/, { kind: 'deny', reason: blockedSearchScopeDenial(exec, argumentsPreviewChars, scope, blocked.reason) }];
            }
            if (readOnlyTaskScope(exec.agent) && ((_o = (_m = readOnlyScopeSearchCounts.get(exec.agent)) === null || _m === void 0 ? void 0 : _m.get(scope)) !== null && _o !== void 0 ? _o : 0) >= MAX_READONLY_SCOPE_SEARCH_CALLS) {
                blockedScopes_1 = (_p = blockedSearchScopes.get(exec.agent)) !== null && _p !== void 0 ? _p : new Map();
                blockedScopes_1.set(scope, { blockedRetries: 0, reason: 'readonly-search-limit' });
                blockedSearchScopes.set(exec.agent, blockedScopes_1);
                return [2 /*return*/, { kind: 'deny', reason: readOnlyScopeSearchLimitDenial(scope) }];
            }
            history = (_q = searchHistories.get(exec.agent)) !== null && _q !== void 0 ? _q : [];
            key = searchCallSignature(exec);
            period = repeatedSearchCycleLength(history, key);
            if (period === undefined)
                return [2 /*return*/, next()];
            blockedScopes = (_r = blockedSearchScopes.get(exec.agent)) !== null && _r !== void 0 ? _r : new Map();
            blockedScopes.set(scope, { blockedRetries: 0, reason: 'cycle' });
            blockedSearchScopes.set(exec.agent, blockedScopes);
            return [2 /*return*/, { kind: 'deny', reason: searchCycleDenial(exec, period, argumentsPreviewChars, scope) }];
        });
    }); });
    // Observe-and-enrich: count first (state advances regardless of the downstream
    // outcome), DELEGATE so later listeners can still block or replace, then fold
    // the reminder onto whatever came back — additionalContexts rides both
    // decision variants, so a blocked call still gets the nudge.
    ctx.on('tools/post-execute', function (exec, _result, next) { return __awaiter(_this, void 0, void 0, function () {
        var focusReminder, scopeSearchReminder, reminder, downstream, reminders;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    recordSearchCall(exec);
                    recordReadOnlyIdenticalRead(exec);
                    focusReminder = observeSearchFocus(exec);
                    scopeSearchReminder = observeReadOnlyScopeSearch(exec);
                    reminder = observe(exec);
                    return [4 /*yield*/, next()];
                case 1:
                    downstream = _c.sent();
                    reminders = [focusReminder, scopeSearchReminder, reminder].filter(function (item) { return item !== undefined; });
                    if (reminders.length === 0)
                        return [2 /*return*/, downstream];
                    if (downstream.kind === 'block') {
                        return [2 /*return*/, { kind: 'block', feedback: downstream.feedback, additionalContexts: __spreadArray(__spreadArray([], reminders, true), ((_a = downstream.additionalContexts) !== null && _a !== void 0 ? _a : []), true) }];
                    }
                    return [2 /*return*/, __assign(__assign({}, downstream), { additionalContexts: __spreadArray(__spreadArray([], reminders, true), ((_b = downstream.additionalContexts) !== null && _b !== void 0 ? _b : []), true) })];
            }
        });
    }); });
    // A user interjection changes the context; repetition across it is not a
    // loop. Pure reset hook: always delegates (attaching nothing, vetoing
    // nothing).
    ctx.on('agent/pre-step', function (_a, next) {
        var agent = _a.agent, messages = _a.messages;
        var userInterjection = messages.some(function (message) { return message.source.kind === 'user'; });
        if (userInterjection) {
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
        // The tool result from the single retry above has already been logged and
        // made visible. Reject the next step before it can incur another LLM call.
        if (stopBeforeNextStep.has(agent)) {
            stopBeforeNextStep.delete(agent);
            return Promise.resolve({ kind: 'reject' });
        }
        return next();
    });
}
var templateObject_1;
