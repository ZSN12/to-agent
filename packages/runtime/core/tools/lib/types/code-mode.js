"use strict";
/**
 * Code Mode `run_code` transport. Programs call the registry's agent-visible
 * tools through nested executions scheduled under the native concurrency
 * contract; each sub-dispatch is logged for reconstruction, while only the
 * outer curated result enters model history.
 * @module @z/dsh-tools/src/code-mode
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.CodeRunFailedError = exports.SDK_SECTION_ORDER = exports.RUN_CODE_NAME = void 0;
exports.createRunCodeTool = createRunCodeTool;
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_session_1 = require("@z/dsh-session");
var schema_ts_1 = require("./schema.ts");
var index_ts_1 = require("./index.ts");
/** The model-facing name of the Code Mode tool. */
exports.RUN_CODE_NAME = 'run_code';
/** The `tools:sdk` section order: inside the 100–199 tool-guidance band, after per-tool guidance sections. */
exports.SDK_SECTION_ORDER = 150;
/**
 * The TypeScript flavor: the fallback for a schema read with no runtime
 * mounted ({@link resolveFlavor} owns which readers reach that). A real
 * assembly always resolves a runtime first, so the model never sees this
 * fallback outside its own language.
 */
var TYPESCRIPT_FLAVOR = {
    description: 'Execute a TypeScript program against the available tools. Takes two required '
        + 'arguments: `code`, the BODY of an async function (erasable syntax only; top-level '
        + '`await` and `return` work), and `description`, a short summary of what the program '
        + 'does. Call tools as `await tools.name(args)` per the declarations in the system '
        + 'prompt. Only what you print or return is program output — curate it. Image-bearing '
        + 'subtool results are attached after the run.',
    codeDescription: 'The program: the body of an async TypeScript function.',
};
/**
 * The Python flavor: the body of an async function, top-level `await` and
 * `return`, answer via `print` and/or the returned value, matching
 * {@link ./py-types.ts}'s SDK instructions.
 */
var PYTHON_FLAVOR = {
    description: 'Execute a Python program against the available tools. Takes two required '
        + 'arguments: `code`, the BODY of an async function (top-level `await` and `return` '
        + 'work), and `description`, a short summary of what the program does. Call tools as '
        + '`await tools.name(args)` per the declarations in the system prompt. Use '
        + '`print(...)` and/or `return <value>` for program output — curate it. Image-bearing '
        + 'subtool results are attached after the run.',
    codeDescription: 'The program: the body of an async Python function.',
};
/** Per-language `run_code` schema flavors (see {@link RunCodeFlavor}); one entry per {@link CodeSdkLanguage}. */
var RUN_CODE_FLAVORS = {
    typescript: TYPESCRIPT_FLAVOR,
    python: PYTHON_FLAVOR,
};
/**
 * The `description` parameter's model-facing description: language-independent
 * (the UI label contract is the same for every runtime), shared between the
 * static spec and the language-aware `parameters` getter so the two emissions
 * can never drift.
 */
var RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION = 'Clear, concise description of what this program does in active voice, '
    + '5-10 words (shown in the UI). Examples: "Count TODO markers across packages"; '
    + '"Read failing test and its fixture"; "Rename config key in every cordis.yml".';
/**
 * Resolve the {@link RunCodeFlavor} for the loaded runtime's language, read at
 * schema-emission time so the model-visible `run_code` schema always matches
 * the SDK section's language. `peekRuntime` returns `undefined` only when no
 * runtime is mounted, which reaches this function through definition readers
 * and `schemas()` — the doc-catalog harvest is the only shipped one, and none
 * of them feeds a model, because `wireSchemas` calls `requireCodeRuntime`
 * before projecting — so that path degrades to {@link TYPESCRIPT_FLAVOR}. A
 * mounted runtime whose language has no flavor entry fails loud, exactly as
 * `requireCodeRuntime` rejects it at assembly. Keeping this table in step with
 * `SDK_RENDERERS` is the compiler's job ({@link CodeSdkLanguage}); what this
 * guard owns is the runtime-supplied language neither table knows, which never
 * yields a wrong-language schema for a real runtime.
 */
function resolveFlavor(peekRuntime) {
    var runtime = peekRuntime();
    if (runtime === undefined) {
        // No runtime mounted: reached by definition readers and `schemas()`, of
        // which the doc-catalog harvest is the only shipped one. None feeds a
        // model — `wireSchemas` calls `requireCodeRuntime` before projecting, so
        // the assembly path never arrives here. Degrade to the TS default.
        return TYPESCRIPT_FLAVOR;
    }
    // Own-property read: a language like `toString`/`constructor` would otherwise
    // resolve an inherited Object.prototype member as a flavor.
    var flavor = RUN_CODE_FLAVORS[runtime.language];
    if (!Object.hasOwn(RUN_CODE_FLAVORS, runtime.language) || flavor === undefined) {
        var known = Object.keys(RUN_CODE_FLAVORS).map(function (name) { return JSON.stringify(name); }).join(', ');
        throw new Error("dsh-tools: no run_code schema flavor registered for runtime language ".concat(JSON.stringify(runtime.language), " (known: ").concat(known, ")"));
    }
    return flavor;
}
/**
 * Thrown by `run_code` when the program run itself failed — a program
 * exception, a budget expiry, an abort, or substrate death. Extends
 * {@link HarnessError} (`code: 'CODE_RUN_FAILED'`); the registry's execution
 * pipeline converts it into a structured `isError` result whose text carries
 * the failure kind plus the captured logs, so the model can self-correct.
 */
var CodeRunFailedError = /** @class */ (function (_super) {
    __extends(CodeRunFailedError, _super);
    function CodeRunFailedError(message) {
        var _this = _super.call(this, message, 'CODE_RUN_FAILED') || this;
        _this.name = 'CodeRunFailedError';
        return _this;
    }
    return CodeRunFailedError;
}(dsh_llm_1.HarnessError));
exports.CodeRunFailedError = CodeRunFailedError;
/**
 * Snapshot one binding call's argument as lossless JSON, then snapshot that
 * detached value again so dispatch and logging stay independent without
 * reintroducing structured-clone's platform-specific nesting limit.
 */
function jsonNormalizeArgs(value) {
    var snapshot;
    try {
        snapshot = (0, dsh_session_1.snapshotJsonValue)(value);
    }
    catch (error) {
        throw new Error("tool arguments must be lossless JSON: ".concat(error instanceof Error ? error.message : String(error)));
    }
    if (snapshot === undefined) {
        throw new Error('tool arguments must be lossless JSON (call the tool with an arguments object, e.g. `{}`)');
    }
    var logged = (0, dsh_session_1.snapshotJsonValue)(snapshot);
    /* v8 ignore next -- snapshot is already a detached lossless JSON value. */
    if (logged === undefined) {
        throw new Error('tool arguments could not be detached for durable logging');
    }
    return { dispatched: snapshot, logged: logged };
}
/** Two-space JSON presentation, matching the existing shallow `run_code` text contract. */
var JSON_INDENT = '  ';
/**
 * ECMAScript caps `JSON.stringify`'s `space` string at ten characters. The
 * renderer also caps TOTAL indentation there, compacting deeper subtrees, so
 * formatted output remains linear in the canonical JSON size.
 */
var MAX_JSON_INDENT_CHARS = 10;
/** Render one non-string JSON root without recursive traversal or unbounded indentation growth. */
function renderJsonValue(value) {
    var chunks = [];
    var tasks = [{ kind: 'value', value: value, depth: 0, compact: false }];
    for (var task = tasks.pop(); task !== undefined; task = tasks.pop()) {
        if (task.kind === 'text') {
            chunks.push(task.text);
            continue;
        }
        var current = task.value;
        if (current === null || typeof current === 'boolean' || typeof current === 'number') {
            chunks.push(String(current));
            continue;
        }
        if (typeof current === 'string') {
            chunks.push(JSON.stringify(current));
            continue;
        }
        var compact = task.compact || (task.depth + 1) * JSON_INDENT.length > MAX_JSON_INDENT_CHARS;
        var childDepth = task.depth + 1;
        if (Array.isArray(current)) {
            chunks.push('[');
            if (current.length === 0) {
                chunks.push(']');
                continue;
            }
            tasks.push({ kind: 'text', text: compact ? ']' : "\n".concat(JSON_INDENT.repeat(task.depth), "]") });
            for (var index = current.length - 1; index >= 0; index--) {
                var item = current[index];
                /* v8 ignore next -- canonical JsonValue arrays are dense. */
                if (item === undefined)
                    throw new Error('cannot render a sparse JSON array');
                tasks.push({ kind: 'value', value: item, depth: childDepth, compact: compact });
                tasks.push({
                    kind: 'text',
                    text: compact
                        ? index === 0 ? '' : ','
                        : "".concat(index === 0 ? '\n' : ',\n').concat(JSON_INDENT.repeat(childDepth)),
                });
            }
            continue;
        }
        var keys = Object.keys(current);
        chunks.push('{');
        if (keys.length === 0) {
            chunks.push('}');
            continue;
        }
        tasks.push({ kind: 'text', text: compact ? '}' : "\n".concat(JSON_INDENT.repeat(task.depth), "}") });
        for (var index = keys.length - 1; index >= 0; index--) {
            var key = keys[index];
            /* v8 ignore next -- the loop is bounded by the captured key count. */
            if (key === undefined)
                throw new Error('cannot render a missing JSON object key');
            var item = current[key];
            /* v8 ignore next -- canonical JsonValue records contain no undefined properties. */
            if (item === undefined)
                throw new Error('cannot render an undefined JSON object property');
            tasks.push({ kind: 'value', value: item, depth: childDepth, compact: compact });
            tasks.push({
                kind: 'text',
                text: compact
                    ? "".concat(index === 0 ? '' : ',').concat(JSON.stringify(key), ":")
                    : "".concat(index === 0 ? '\n' : ',\n').concat(JSON_INDENT.repeat(childDepth)).concat(JSON.stringify(key), ": "),
            });
        }
    }
    return chunks.join('');
}
/** Render one present program completion value for the model-facing result text. */
function renderValue(value) {
    return typeof value === 'string' ? value : renderJsonValue(value);
}
/**
 * Build the `run_code` {@link ToolDefinition}: required `code` and
 * `description` parameters, executed through the dispatch bridge described
 * above. The
 * registry reserves it as presentation infrastructure under non-native modes,
 * outside the filterable global/scoped capability layers.
 * @param registry - the owning registry (sub-calls go through its `execute`,
 *   bindings cover its registered tools).
 * @param options - the registry-private capabilities described above.
 * @returns the registry-ready definition.
 */
function createRunCodeTool(registry, options) {
    var requireRuntime = options.requireRuntime, peekRuntime = options.peekRuntime, maxParallel = options.maxParallel, shapeDispatchLog = options.shapeDispatchLog;
    var definition = (0, schema_ts_1.defineTool)({
        name: exports.RUN_CODE_NAME,
        // The description and `code` parameter description are placeholders here:
        // the language-aware getters installed below replace both, resolving the
        // loaded runtime's flavor at schema-emission time so the schema the MODEL
        // sees matches the SDK section's language. Argument VALIDATION still keys
        // off this static spec (defineTool closes over it), which is language-
        // independent (one required string `code`).
        description: TYPESCRIPT_FLAVOR.description,
        parameters: {
            code: { type: 'string', required: true, description: TYPESCRIPT_FLAVOR.codeDescription },
            description: {
                type: 'string',
                required: true,
                description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION,
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    logs: { type: 'array', required: true, items: { type: 'string' } },
                    result: { type: 'json' },
                },
            },
            render: function (_args, value) {
                var rendered = value.result === undefined ? '' : renderValue(value.result);
                var parts = [value.logs.join('\n'), rendered].filter(function (part) { return part.length > 0; });
                return [{ type: 'text', text: parts.length > 0 ? parts.join('\n') : '(run_code completed with no output)' }];
            },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var runtime, runController, onOuterAbort, dispatches, pendingQueue, inFlight, logWork, commitQueue, exclusiveActive, driving, driverRun, wake, wakeup, drive, drainDispatches, runOver, binding, functions, _i, _a, schema, result, logsText;
                var _this = this;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (args.description.trim().length === 0) {
                                throw new Error('invalid description: expected a non-empty string');
                            }
                            runtime = requireRuntime();
                            runController = new AbortController();
                            onOuterAbort = function () { runController.abort(exec.signal.reason); };
                            exec.signal.addEventListener('abort', onOuterAbort, { once: true });
                            dispatches = 0;
                            pendingQueue = [];
                            inFlight = new Set();
                            logWork = new Set();
                            commitQueue = [];
                            exclusiveActive = false;
                            driving = false;
                            driverRun = Promise.resolve();
                            wakeup = function () {
                                var release = wake;
                                wake = undefined;
                                release === null || release === void 0 ? void 0 : release();
                            };
                            drive = function () {
                                if (driving)
                                    return driverRun;
                                driving = true;
                                driverRun = (function () { return __awaiter(_this, void 0, void 0, function () {
                                    var _loop_1, state_1;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                _a.trys.push([0, , 5, 6]);
                                                _loop_1 = function () {
                                                    var signal, commitHead, head, mode, capacity, flight_1;
                                                    return __generator(this, function (_b) {
                                                        switch (_b.label) {
                                                            case 0:
                                                                signal = new Promise(function (resolve) { wake = resolve; });
                                                                commitHead = commitQueue[0];
                                                                if (!(commitHead !== undefined && commitHead.settled)) return [3 /*break*/, 2];
                                                                commitQueue.shift();
                                                                return [4 /*yield*/, commitHead.commit()
                                                                    // The barrier covers post-execute: later starts wait for the
                                                                    // exclusive call's full pipeline, as under the native loop.
                                                                ];
                                                            case 1:
                                                                _b.sent();
                                                                // The barrier covers post-execute: later starts wait for the
                                                                // exclusive call's full pipeline, as under the native loop.
                                                                if (commitHead.mode === 'exclusive')
                                                                    exclusiveActive = false;
                                                                return [2 /*return*/, "continue"];
                                                            case 2:
                                                                head = pendingQueue[0];
                                                                if (!(head !== undefined)) return [3 /*break*/, 4];
                                                                if (runController.signal.aborted) {
                                                                    pendingQueue.shift();
                                                                    head.abandon();
                                                                    return [2 /*return*/, "continue"];
                                                                }
                                                                mode = head.classify();
                                                                capacity = !exclusiveActive
                                                                    && (mode === 'exclusive' ? inFlight.size === 0 : inFlight.size < maxParallel);
                                                                if (!capacity) return [3 /*break*/, 4];
                                                                if (mode === 'exclusive')
                                                                    exclusiveActive = true;
                                                                head.mode = mode;
                                                                pendingQueue.shift();
                                                                // Joined before start() so the commit cursor sees submission
                                                                // order; nothing commits it until `settled` flips.
                                                                commitQueue.push(head);
                                                                return [4 /*yield*/, head.start()];
                                                            case 3:
                                                                _b.sent();
                                                                flight_1 = head.flight.finally(function () {
                                                                    inFlight.delete(flight_1);
                                                                    wakeup();
                                                                });
                                                                inFlight.add(flight_1);
                                                                return [2 /*return*/, "continue"];
                                                            case 4:
                                                                if (pendingQueue.length === 0 && commitQueue.length === 0 && inFlight.size === 0)
                                                                    return [2 /*return*/, { value: void 0 }];
                                                                return [4 /*yield*/, signal];
                                                            case 5:
                                                                _b.sent();
                                                                return [2 /*return*/];
                                                        }
                                                    });
                                                };
                                                _a.label = 1;
                                            case 1: return [5 /*yield**/, _loop_1()];
                                            case 2:
                                                state_1 = _a.sent();
                                                if (typeof state_1 === "object")
                                                    return [2 /*return*/, state_1.value];
                                                _a.label = 3;
                                            case 3: return [3 /*break*/, 1];
                                            case 4: return [3 /*break*/, 6];
                                            case 5:
                                                driving = false;
                                                wake = undefined;
                                                return [7 /*endfinally*/];
                                            case 6: return [2 /*return*/];
                                        }
                                    });
                                }); })();
                                return driverRun;
                            };
                            drainDispatches = function () { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: 
                                        // The abort already fired: the driver abandons queued-unstarted
                                        // entries, awaits the live pool, and drains the ordered commit lane —
                                        // including a commit already in progress when the program returned.
                                        return [4 /*yield*/, drive()
                                            // Every settle event is appended inside the open run_code turn
                                            // (tasks self-remove on settlement).
                                        ];
                                        case 1:
                                            // The abort already fired: the driver abandons queued-unstarted
                                            // entries, awaits the live pool, and drains the ordered commit lane —
                                            // including a commit already in progress when the program returned.
                                            _a.sent();
                                            _a.label = 2;
                                        case 2:
                                            if (!(logWork.size > 0)) return [3 /*break*/, 4];
                                            return [4 /*yield*/, Promise.allSettled(__spreadArray([], logWork, true))];
                                        case 3:
                                            _a.sent();
                                            return [3 /*break*/, 2];
                                        case 4: return [2 /*return*/];
                                    }
                                });
                            }); };
                            runOver = function () { return runController.signal.aborted; };
                            binding = function (name) { return function (rawArgs) { return __awaiter(_this, void 0, void 0, function () {
                                var normalized, n, subCallId, input, scheduler, outcome;
                                var _this = this;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (runOver()) {
                                                throw new Error("run_code run is over (".concat(String(runController.signal.reason), "); ").concat(name, " not dispatched"));
                                            }
                                            normalized = jsonNormalizeArgs(rawArgs);
                                            n = ++dispatches;
                                            subCallId = (0, dsh_llm_1.CallId)("".concat(String(exec.callId), ":code:").concat(n));
                                            input = __assign(__assign({ callId: subCallId, rootCallId: exec.rootCallId, name: name, arguments: normalized.dispatched }, exec.agent ? { agent: exec.agent } : {}), { parent: exec.token, signal: runController.signal });
                                            scheduler = registry[index_ts_1.TOOL_RUNTIME_SCHEDULER];
                                            return [4 /*yield*/, new Promise(function (resolve, reject) {
                                                    // Set by the dispatch stage (or start() for a pre-settled result): what commit() finalizes in submission order.
                                                    var parked;
                                                    var settle = function (result) {
                                                        // The program gets its value NOW: the log-content listener (for
                                                        // example, a spill backend) must never delay the binding or occupy
                                                        // a dispatch slot. The event append is tracked side work; the run's
                                                        // settlement drains logWork so every settle event is still appended
                                                        // inside the open turn (shapeDispatchLog is contained, so this
                                                        // chain cannot reject).
                                                        resolve(result.isError
                                                            ? { isError: true, message: result.error.message }
                                                            : { isError: false, value: result.value });
                                                        var agent = exec.agent;
                                                        if (agent === undefined)
                                                            return;
                                                        var task = (function () { return __awaiter(_this, void 0, void 0, function () {
                                                            var logged;
                                                            return __generator(this, function (_a) {
                                                                switch (_a.label) {
                                                                    case 0: return [4 /*yield*/, shapeDispatchLog({
                                                                            exec: exec,
                                                                            agent: agent,
                                                                            subCallId: subCallId,
                                                                            name: name,
                                                                            isError: result.isError,
                                                                            // The registry deep-froze this projection at result
                                                                            // finalization; append snapshots the final copy again, so
                                                                            // the log stays detached.
                                                                            content: result.content,
                                                                        })];
                                                                    case 1:
                                                                        logged = _a.sent();
                                                                        agent.session.append('tool/code-dispatch', {
                                                                            rootCallId: exec.rootCallId,
                                                                            parentCallId: exec.callId,
                                                                            subCallId: subCallId,
                                                                            name: name,
                                                                            // The SIBLING parse of the dispatched value: byte-identical JSON,
                                                                            // but a separate object — a tool mutating its args cannot desync
                                                                            // this record from what it actually received.
                                                                            arguments: normalized.logged,
                                                                            isError: result.isError,
                                                                            content: logged,
                                                                        });
                                                                        return [2 /*return*/];
                                                                }
                                                            });
                                                        }); })().finally(function () { logWork.delete(task); });
                                                        logWork.add(task);
                                                    };
                                                    pendingQueue.push({
                                                        flight: Promise.resolve(),
                                                        settled: false,
                                                        // Re-read per driver pass against the same agent view the SDK
                                                        // declared; fail-closed exclusive when undeclared/invalid.
                                                        classify: function () { return registry.executionMode(input).kind; },
                                                        abandon: function () {
                                                            reject(new Error("run_code run is over (".concat(String(runController.signal.reason), "); ").concat(name, " tool call abandoned")));
                                                        },
                                                        start: function () {
                                                            return __awaiter(this, void 0, void 0, function () {
                                                                var prepared;
                                                                var _this = this;
                                                                var _a;
                                                                return __generator(this, function (_b) {
                                                                    switch (_b.label) {
                                                                        case 0:
                                                                            (_a = exec.agent) === null || _a === void 0 ? void 0 : _a.session.append('tool/code-dispatch-start', {
                                                                                rootCallId: exec.rootCallId,
                                                                                parentCallId: exec.callId,
                                                                                subCallId: subCallId,
                                                                                name: name,
                                                                                arguments: normalized.logged,
                                                                            });
                                                                            return [4 /*yield*/, scheduler.prepare(input)];
                                                                        case 1:
                                                                            prepared = _b.sent();
                                                                            if (prepared.kind === 'dispatch') {
                                                                                this.flight = scheduler.dispatch(prepared.exec).then(function (dispatchOutcome) {
                                                                                    parked = { kind: dispatchOutcome.kind, exec: prepared.exec, result: dispatchOutcome.result };
                                                                                    _this.settled = true;
                                                                                });
                                                                                return [2 /*return*/];
                                                                            }
                                                                            parked = { kind: prepared.kind, exec: prepared.exec, result: prepared.result };
                                                                            this.settled = true;
                                                                            return [2 /*return*/];
                                                                    }
                                                                });
                                                            });
                                                        },
                                                        commit: function () {
                                                            return __awaiter(this, void 0, void 0, function () {
                                                                var result, _a, _i, _b, context;
                                                                var _c;
                                                                return __generator(this, function (_d) {
                                                                    switch (_d.label) {
                                                                        case 0:
                                                                            /* v8 ignore next -- commit() runs only after `settled` flipped, which set parked. */
                                                                            if (parked === undefined)
                                                                                return [2 /*return*/];
                                                                            if (!(parked.kind === 'post-result')) return [3 /*break*/, 2];
                                                                            return [4 /*yield*/, scheduler.finalize(parked.exec, parked.result)];
                                                                        case 1:
                                                                            _a = _d.sent();
                                                                            return [3 /*break*/, 3];
                                                                        case 2:
                                                                            _a = scheduler.finish(parked.exec, parked.result);
                                                                            _d.label = 3;
                                                                        case 3:
                                                                            result = _a;
                                                                            if (!result.isError && result.content.some(function (block) { return block.type === 'image'; })) {
                                                                                exec.deferContext((0, dsh_llm_1.createUserMessage)({
                                                                                    content: result.content,
                                                                                    source: { kind: 'plugin', plugin: 'tools-code-mode' },
                                                                                }));
                                                                            }
                                                                            for (_i = 0, _b = (_c = result.additionalContexts) !== null && _c !== void 0 ? _c : []; _i < _b.length; _i++) {
                                                                                context = _b[_i];
                                                                                exec.deferContext(context);
                                                                            }
                                                                            // The composite forwards `additionalContexts` above and
                                                                            // `concludesTurn` here from the nested result. Only a successful
                                                                            // nested result can carry the terminal marker
                                                                            // (ToolExecutionFailure types it never), so a policy-converted
                                                                            // failure cannot stop the turn through a recovering program.
                                                                            if (result.concludesTurn)
                                                                                exec.concludeTurn();
                                                                            settle(result);
                                                                            _d.label = 4;
                                                                        case 4:
                                                                            if (!(logWork.size > maxParallel)) return [3 /*break*/, 6];
                                                                            return [4 /*yield*/, Promise.race(logWork)];
                                                                        case 5:
                                                                            _d.sent();
                                                                            return [3 /*break*/, 4];
                                                                        case 6: return [2 /*return*/];
                                                                    }
                                                                });
                                                            });
                                                        },
                                                    });
                                                    wakeup();
                                                    void drive();
                                                })
                                                // A budget expiry or outer cancel that occurs while this call was in
                                                // flight already aborted the dispatch; stop the program now rather
                                                // than hand it a result from a run that is over.
                                            ];
                                        case 1:
                                            outcome = _a.sent();
                                            // A budget expiry or outer cancel that occurs while this call was in
                                            // flight already aborted the dispatch; stop the program now rather
                                            // than hand it a result from a run that is over.
                                            if (runOver()) {
                                                throw new Error("run_code run is over (".concat(String(runController.signal.reason), "); ").concat(name, " result discarded"));
                                            }
                                            // The worker turns a binding rejection into ToolCallError and adds
                                            // only the binding name. Native content and internal error metadata
                                            // stay outside the program-facing failure contract.
                                            if (outcome.isError)
                                                throw new Error(outcome.message);
                                            return [2 /*return*/, outcome.value];
                                    }
                                });
                            }); }; };
                            functions = Object.create(null);
                            // Enumerate the CALLING AGENT's visible set (scoped tools join,
                            // restricted globals vanish) — the same view the SDK section declared,
                            // so a program can bind exactly what its prompt promised; sub-dispatch
                            // re-resolves per call through the same view (exec.agent threads down).
                            for (_i = 0, _a = registry.schemas(exec.agent); _i < _a.length; _i++) {
                                schema = _a[_i];
                                if (schema.name === exports.RUN_CODE_NAME)
                                    continue;
                                Object.defineProperty(functions, schema.name, { enumerable: true, value: binding(schema.name) });
                            }
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, , 7, 8]);
                            result = void 0;
                            _b.label = 2;
                        case 2:
                            _b.trys.push([2, , 4, 6]);
                            return [4 /*yield*/, runtime.run({
                                    program: args.code,
                                    bindings: [{
                                            global: 'tools',
                                            functions: functions,
                                            errorClass: { name: 'ToolCallError', memberNameProperty: 'toolName' },
                                        }],
                                    signal: runController.signal,
                                })];
                        case 3:
                            result = _b.sent();
                            return [3 /*break*/, 6];
                        case 4:
                            // Abort sub-dispatches and drain every in-flight dispatch before
                            // closing the turn (queued-unstarted ones are abandoned unlogged).
                            // Binding failures remain observable through their individual promises.
                            runController.abort('run_code settled');
                            return [4 /*yield*/, drainDispatches()];
                        case 5:
                            _b.sent();
                            return [7 /*endfinally*/];
                        case 6:
                            if (result.error) {
                                logsText = result.logs.length > 0 ? "\nCaptured output:\n".concat(result.logs.join('\n')) : '';
                                throw new CodeRunFailedError("code run failed (".concat(result.error.kind, "): ").concat(result.error.message).concat(logsText));
                            }
                            return [2 /*return*/, __assign({ logs: result.logs }, result.value !== undefined ? { result: result.value } : {})];
                        case 7:
                            exec.signal.removeEventListener('abort', onOuterAbort);
                            return [7 /*endfinally*/];
                        case 8: return [2 /*return*/];
                    }
                });
            });
        },
        // The model-authored description is the call's always-visible UI label
        // (the bash `description` precedent); the program itself rides rawInput.
        presentCall: function (args) { return ({
            card: 'generic',
            title: args.description,
            kind: 'execute',
            rawInput: args.code,
        }); },
        // Deliberately no presentResult: the generic card fallback keeps this
        // title and reads durable result content without duplicating a large raw
        // result into the host view payload.
    });
    // Resolve the language flavor lazily, at the moment the registry projects the
    // schema (`schemaOf` destructures `description`/`parameters`). The definition
    // is minted once at registration, before a runtime is known; deferring here
    // is the least invasive point that still emits the loaded runtime's language.
    Object.defineProperty(definition, 'description', {
        enumerable: true,
        get: function () { return resolveFlavor(peekRuntime).description; },
    });
    Object.defineProperty(definition, 'parameters', {
        enumerable: true,
        // Recompile through the same spec→schema projection defineTool used, so
        // the emitted schema always matches the validated specification.
        get: function () { return (0, schema_ts_1.parameterSchemaSpecToJsonSchema)({
            code: { type: 'string', required: true, description: resolveFlavor(peekRuntime).codeDescription },
            description: { type: 'string', required: true, description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION },
        }); },
    });
    return definition;
}
