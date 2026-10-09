"use strict";
/**
 * Tool registry, model presentation modes, and pre/guard/around/post/result
 * execution pipeline.
 * @module @z/dsh-tools
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
exports.ToolRuntime = exports.ToolOutputError = exports.ToolNotFoundError = exports.TOOL_ABORTED_BEFORE_DISPATCH = exports.TOOL_ABORTED = exports.TOOL_RUNTIME_SCHEDULER = exports.defineContentToolFixture = exports.renderToolsSdkPy = exports.jsonSchemaToPy = exports.renderToolsSdk = exports.jsonSchemaToTs = exports.RUN_CODE_NAME = exports.CodeRunFailedError = exports.JsonSchemaError = exports.validateJsonSchemaValue = exports.assertObjectJsonSchema = exports.assertSupportedJsonSchema = exports.ToolArgsError = exports.validateArgs = exports.parameterSchemaSpecToJsonSchema = exports.valueSchemaSpecToJsonSchema = exports.defineTool = void 0;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var dsh_scope_1 = require("@z/dsh-scope");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_session_1 = require("@z/dsh-session");
var json_schema_ts_1 = require("./json-schema.ts");
var code_mode_ts_1 = require("./code-mode.ts");
var ts_types_ts_1 = require("./ts-types.ts");
var py_types_ts_1 = require("./py-types.ts");
/**
 * Language → SDK-section renderer. The registry looks up the loaded
 * `ctx.codeRuntime.language` in this table when assembling the `tools:sdk`
 * section under a non-native mode; a runtime whose language is not a key
 * fails the assembly loudly (same idiom as `toolOrder` violations). Adding a
 * new backend language is three parallel edits — a {@link CodeSdkLanguage}
 * member, an entry here, and a `RUN_CODE_FLAVORS` entry in `code-mode.ts` for
 * its `run_code` schema strings — plus the renderer function this table points
 * at. The `satisfies` clause pins this table's key set to that union, which
 * the flavor table is checked against too, so any of the three left out is a
 * typecheck failure. What no check reaches is the prose that names the values
 * instead of deriving them: the seam's `dsh-code-runtime` README pair, its
 * `CodeRuntime.language` JSDoc, and `docs/subsystems/code-runtime.md`
 * with its zh pair, plus this package's own README pair and the
 * {@link Config.mode} JSDoc.
 */
/**
 * Prompt order of the `code` collapse statement: after the persona and before
 * the 100-199 per-tool guidance band, so the model reads which tools it may
 * call before it reads what each one is for.
 */
var COLLAPSE_SECTION_ORDER = 99;
/**
 * The model-facing statement of the `code` collapse. Names the consequence
 * (the call fails) and the route (inside the program), because a rule the
 * model can only discover by being denied is one it corrects too late.
 */
var CODE_ONLY_INSTRUCTION = "`".concat(code_mode_ts_1.RUN_CODE_NAME, "` is the only tool you can call directly \u2014 a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.");
var SDK_RENDERERS = {
    typescript: ts_types_ts_1.renderToolsSdk,
    python: py_types_ts_1.renderToolsSdkPy,
};
var schema_ts_1 = require("./schema.ts");
Object.defineProperty(exports, "defineTool", { enumerable: true, get: function () { return schema_ts_1.defineTool; } });
Object.defineProperty(exports, "valueSchemaSpecToJsonSchema", { enumerable: true, get: function () { return schema_ts_1.valueSchemaSpecToJsonSchema; } });
Object.defineProperty(exports, "parameterSchemaSpecToJsonSchema", { enumerable: true, get: function () { return schema_ts_1.parameterSchemaSpecToJsonSchema; } });
Object.defineProperty(exports, "validateArgs", { enumerable: true, get: function () { return schema_ts_1.validateArgs; } });
Object.defineProperty(exports, "ToolArgsError", { enumerable: true, get: function () { return schema_ts_1.ToolArgsError; } });
var json_schema_ts_2 = require("./json-schema.ts");
Object.defineProperty(exports, "assertSupportedJsonSchema", { enumerable: true, get: function () { return json_schema_ts_2.assertSupportedJsonSchema; } });
Object.defineProperty(exports, "assertObjectJsonSchema", { enumerable: true, get: function () { return json_schema_ts_2.assertObjectJsonSchema; } });
Object.defineProperty(exports, "validateJsonSchemaValue", { enumerable: true, get: function () { return json_schema_ts_2.validateJsonSchemaValue; } });
Object.defineProperty(exports, "JsonSchemaError", { enumerable: true, get: function () { return json_schema_ts_2.JsonSchemaError; } });
var code_mode_ts_2 = require("./code-mode.ts");
Object.defineProperty(exports, "CodeRunFailedError", { enumerable: true, get: function () { return code_mode_ts_2.CodeRunFailedError; } });
Object.defineProperty(exports, "RUN_CODE_NAME", { enumerable: true, get: function () { return code_mode_ts_2.RUN_CODE_NAME; } });
var ts_types_ts_2 = require("./ts-types.ts");
Object.defineProperty(exports, "jsonSchemaToTs", { enumerable: true, get: function () { return ts_types_ts_2.jsonSchemaToTs; } });
Object.defineProperty(exports, "renderToolsSdk", { enumerable: true, get: function () { return ts_types_ts_2.renderToolsSdk; } });
var py_types_ts_2 = require("./py-types.ts");
Object.defineProperty(exports, "jsonSchemaToPy", { enumerable: true, get: function () { return py_types_ts_2.jsonSchemaToPy; } });
Object.defineProperty(exports, "renderToolsSdkPy", { enumerable: true, get: function () { return py_types_ts_2.renderToolsSdkPy; } });
var testing_ts_1 = require("./testing.ts");
Object.defineProperty(exports, "defineContentToolFixture", { enumerable: true, get: function () { return testing_ts_1.defineContentToolFixture; } });
/**
 * Scheduler entry point omitted from the generated named service API.
 * @internal
 */
exports.TOOL_RUNTIME_SCHEDULER = Symbol('@z/dsh-tools.scheduler');
/** Canonical error code for cancellation after a tool body was invoked. */
exports.TOOL_ABORTED = 'ABORTED';
/** Canonical error code for cancellation before a tool body was invoked. */
exports.TOOL_ABORTED_BEFORE_DISPATCH = 'ABORTED_BEFORE_DISPATCH';
/**
 * Thrown (internally) when the model requests a tool that isn't registered.
 * Extends {@link HarnessError} (`code: 'UNKNOWN_TOOL'`) so an unknown-tool
 * failure is as routable as a tool-thrown one — retry/sandbox/replay code can
 * distinguish it from a tool body's own error.
 */
var ToolNotFoundError = /** @class */ (function (_super) {
    __extends(ToolNotFoundError, _super);
    /**
     * @param toolName - the name the caller asked for.
     * @param reachableFrom - how the model reaches this tool instead, when the
     *   name IS visible and only the presentation denies calling it directly.
     *   Omitted for a name that is registered nowhere.
     */
    function ToolNotFoundError(toolName, reachableFrom) {
        var _this = _super.call(this, reachableFrom === undefined
            ? "unknown tool \"".concat(toolName, "\"")
            : "unknown tool \"".concat(toolName, "\": ").concat(reachableFrom), 'UNKNOWN_TOOL') || this;
        _this.name = 'ToolNotFoundError';
        return _this;
    }
    return ToolNotFoundError;
}(dsh_llm_1.HarnessError));
exports.ToolNotFoundError = ToolNotFoundError;
/** Thrown when a tool body or post-policy value violates its declared output. */
var ToolOutputError = /** @class */ (function (_super) {
    __extends(ToolOutputError, _super);
    function ToolOutputError(toolName, violations) {
        var _this = _super.call(this, "tool \"".concat(toolName, "\" returned invalid output: ").concat(violations.join('; ')), 'INVALID_TOOL_OUTPUT') || this;
        _this.name = 'ToolOutputError';
        _this.violations = violations;
        return _this;
    }
    return ToolOutputError;
}(dsh_llm_1.HarnessError));
exports.ToolOutputError = ToolOutputError;
/** Convert one projector exception into the canonical invalid-output failure. */
function projectionError(toolName, projector, error) {
    return new ToolOutputError(toolName, ["output.".concat(projector, " failed: ").concat(errorMessage(error))]);
}
/** Snapshot one projector result before later durable-result materialization. */
function snapshotProjection(toolName, projector, candidate) {
    try {
        var detached = (0, dsh_session_1.snapshotJsonValue)(candidate);
        if (detached === undefined) {
            throw new ToolOutputError(toolName, ["output.".concat(projector, " returned non-lossless JSON")]);
        }
        return detached;
    }
    catch (error) {
        if (error instanceof ToolOutputError)
            throw error;
        throw projectionError(toolName, projector, error);
    }
}
/** Snapshot one body or policy value into the canonical invalid-output failure class. */
function snapshotToolValue(toolName, candidate) {
    try {
        var detached = (0, dsh_session_1.snapshotJsonValue)(candidate);
        if (detached === undefined)
            throw new ToolOutputError(toolName, ['value is not lossless JSON']);
        return detached;
    }
    catch (error) {
        if (error instanceof ToolOutputError)
            throw error;
        throw new ToolOutputError(toolName, ["value snapshot failed: ".concat(errorMessage(error))]);
    }
}
/**
 * Best-effort human-readable message from an arbitrary thrown value: Error
 * instances use `.message`; non-Error objects with a string `message`
 * property (e.g. `throw { message: 'denied' }`) use it too; everything else
 * is stringified.
 */
function errorMessage(error) {
    try {
        if (error instanceof Error)
            return error.message;
        if (typeof error === 'object' && error !== null
            && 'message' in error && typeof error.message === 'string') {
            return error.message;
        }
        return String(error);
    }
    catch (_a) {
        // A hostile thrown value can trap `instanceof`, property access, or string
        // coercion. Error normalization is the outermost safety boundary, so its
        // fallback must itself be total.
        return '<unprintable thrown value>';
    }
}
/** Derive one failure message from policy feedback without changing its rendered blocks. */
function failureMessageFromContent(content) {
    var text = content
        .map(function (block) { return block.type === 'text' ? block.text : "[".concat(block.type, " content]"); })
        .join('\n');
    return text.length > 0 ? text : 'tool result blocked by post-execute policy';
}
/** Snapshot and freeze one durable tool-result projection or reject lossy data. */
function materializePresentation(candidate) {
    var detached = (0, dsh_session_1.snapshotJsonValue)(candidate);
    if (detached === undefined) {
        throw new TypeError('tool result must be losslessly JSON-serializable');
    }
    return (0, dsh_llm_1.deepFreeze)(detached);
}
/** Structured `{ name, code }` for a thrown HarnessError, else undefined. */
function errorInfo(error) {
    try {
        return error instanceof dsh_llm_1.HarnessError ? { name: error.name, code: error.code } : undefined;
    }
    catch (_a) {
        return undefined;
    }
}
/** One scope's complete tool-registry contribution. */
var ToolLayer = /** @class */ (function () {
    function ToolLayer(scope) {
        this.restrictions = new dsh_scope_1.AnonymousEntries();
        this.guards = new dsh_scope_1.AnonymousEntries();
        this.tools = new dsh_scope_1.NamedEntries(function (name) { return new Error(scope === undefined
            ? "tool \"".concat(name, "\" is already registered (for a per-agent variant, register through that agent's `agent.ctx` instead)")
            : "tool \"".concat(name, "\" is already registered in this scope")); });
    }
    /** Whether every contribution table in this aggregate layer is empty. */
    ToolLayer.prototype.isEmpty = function () {
        return this.tools.isEmpty() && this.restrictions.isEmpty() && this.guards.isEmpty()
            && this.mode === undefined;
    };
    /** Whether every compiled restriction in this layer admits a global tool name. */
    ToolLayer.prototype.admits = function (name) {
        for (var _i = 0, _a = this.restrictions.values(); _i < _a.length; _i++) {
            var filter = _a[_i];
            if ((filter.allow !== undefined && !filter.allow.has(name))
                || (filter.deny !== undefined && filter.deny.has(name)))
                return false;
        }
        return true;
    };
    /** First monotonic denial from this layer's live guard registrations. */
    ToolLayer.prototype.guardReason = function (exec) {
        for (var _i = 0, _a = this.guards.values(); _i < _a.length; _i++) {
            var guard = _a[_i];
            var reason = guard(exec);
            if (reason !== undefined)
                return reason;
        }
        return undefined;
    };
    return ToolLayer;
}());
/** Resolve the run_code overlap cap at the owning config boundary (direct construction bypasses the Loader schema). */
function resolveMaxParallelSubCalls(value) {
    var maxParallelSubCalls = value !== null && value !== void 0 ? value : 10;
    if (!Number.isInteger(maxParallelSubCalls) || maxParallelSubCalls < 1) {
        throw new Error('maxParallelSubCalls must be a positive integer');
    }
    return maxParallelSubCalls;
}
/**
 * Tool registry and execution pipeline. Scoped registrations shadow globals;
 * one visibility resolver feeds presentation, lookup, and dispatch.
 */
var ToolRuntime = /** @class */ (function (_super) {
    __extends(ToolRuntime, _super);
    function ToolRuntime(ctx, config) {
        if (config === void 0) { config = {}; }
        var _b;
        var _this = _super.call(this, ctx, 'tools') || this;
        /** Internal staged view consumed by `dsh-agent-loop`'s parallel scheduler. */
        _this[_a] = {
            prepare: function (exec) { return _this.prepareScheduledExecution(exec); },
            dispatch: function (exec) { return _this.dispatchScheduledExecution(exec); },
            finalize: function (exec, result) { return _this.finalizeScheduledExecution(exec, result); },
            finish: function (exec, result) { return _this.finishScheduledExecution(exec, result); },
        };
        /** Context deferred by a running tool body, keyed by its scheduler-owned execution. */
        _this.deferredContexts = new WeakMap();
        /** Executions whose tool body declared the current turn complete. */
        _this.concludingExecutions = new WeakSet();
        /** Original caller cancellation, kept outside the wrapper-mutable execution object. */
        _this.cancellationStates = new WeakMap();
        /** Definition-owned final content transform snapshotted before policy begins. */
        _this.contentFinalizers = new WeakMap();
        _this.layers = new dsh_scope_1.ScopedLayers(function (scope) { return new ToolLayer(scope); }, function () { _this.ctx.emit('tools/change'); });
        /** Registry-normalized results and the exact dispatch that validated each value. */
        _this.canonicalResults = new WeakMap();
        // The schema already defaulted an omitted mode; the ?? narrows the
        // optional-input type for direct (non-Loader) construction in tests.
        _this.defaultMode = (_b = config.mode) !== null && _b !== void 0 ? _b : 'native';
        _this.maxParallelSubCalls = resolveMaxParallelSubCalls(config.maxParallelSubCalls);
        ctx.systemPrompt.tools(function (context) { return _this.wireSchemas(context.scope); });
        if (_this.defaultMode !== 'native') {
            ctx.systemPrompt.section(_this.collapseSection());
            ctx.systemPrompt.section(_this.sdkSection());
        }
        return _this;
    }
    /**
     * The prompt statement of the `code` executor collapse, registered wherever
     * {@link sdkSection} is and rendering empty outside an effective `code`.
     *
     * Every tool contributes its own guidance section naming its tool, none of
     * them qualify how that tool is reached, and they all render before the SDK
     * (orders 100-199 against {@link SDK_SECTION_ORDER}). Without this the model
     * reads a catalog of tools it is told to use and no statement that only
     * `run_code` may be called, so it emits a native call, receives
     * `UNKNOWN_TOOL` for a tool the prompt just declared, and concludes the
     * deployment is inconsistent. {@link COLLAPSE_SECTION_ORDER} places the rule
     * before that guidance rather than after it.
     *
     * `both` renders empty: native calls do execute there, so the rule is false.
     * @returns the section registration.
     */
    ToolRuntime.prototype.collapseSection = function () {
        var _this = this;
        return {
            name: 'tools:code-only',
            order: COLLAPSE_SECTION_ORDER,
            // The SAME predicate the executor denies by, so the prompt cannot state
            // a rule the registry does not enforce (see `collapses`).
            text: function (context) { return _this.modeFor(context.scope) === 'code' ? CODE_ONLY_INSTRUCTION : ''; },
        };
    };
    /**
     * The generated-SDK prompt section, registered globally by a code-mode
     * deployment and per scope by {@link presentAs}.
     *
     * The body regenerates from the CALLING scope, and renders empty for an
     * agent presenting natively — an agent that opted out under a code-mode
     * deployment still sees the global registration, and an empty section is
     * dropped from the rendered prompt.
     * @returns the section registration.
     */
    ToolRuntime.prototype.sdkSection = function () {
        var _this = this;
        return {
            name: 'tools:sdk',
            order: code_mode_ts_1.SDK_SECTION_ORDER,
            // Regenerate from the calling scope's visible tools in stable order.
            text: function (context) {
                var mode = _this.modeFor(context.scope);
                if (mode === 'native')
                    return '';
                var runtime = _this.requireCodeRuntime(mode);
                // Own-property read: a language like `toString`/`constructor` would
                // otherwise resolve an inherited Object.prototype member as a renderer.
                var render = SDK_RENDERERS[runtime.language];
                /* v8 ignore next -- requireCodeRuntime rejects an unknown language before this runs. */
                if (render === undefined)
                    throw new Error("dsh-tools: no SDK renderer for ".concat(runtime.language));
                return render(_this.sdkSchemas(context.scope));
            },
        };
    };
    /**
     * The presentation one scope's agent sees: its own declaration, else the
     * deployment default.
     * @param scope - the calling agent, or undefined for the global view.
     * @returns the resolved presentation mode.
     */
    ToolRuntime.prototype.modeFor = function (scope) {
        var _b;
        // Nearest scope wins along the chain: a preset's standing declaration
        // covers every agent parented under it, and an agent's own (were one ever
        // declared) would override its preset's. The mode decides what the model
        // SEES, which is exactly the class of fact the chain inherits.
        var layers = this.layers.chainLayers(scope);
        for (var index = layers.length - 1; index >= 0; index -= 1) {
            var mode = (_b = layers[index]) === null || _b === void 0 ? void 0 : _b.mode;
            if (mode !== undefined)
                return mode;
        }
        return this.defaultMode;
    };
    /**
     * The reserved `run_code` transport, built on first need.
     *
     * It never enters the global layer: per-agent restrictions must not remove
     * it, and a scoped registration must not shadow it. The visibility resolver
     * appends it after resolving the filterable global/scoped capability layers,
     * and only for scopes whose mode actually presents it.
     * @returns the shared transport definition.
     */
    ToolRuntime.prototype.requireCodeTransport = function () {
        var _this = this;
        var _b;
        (_b = this.codeTransport) !== null && _b !== void 0 ? _b : (this.codeTransport = (0, code_mode_ts_1.createRunCodeTool)(this, {
            requireRuntime: function () { return _this.requireCodeRuntime(_this.defaultMode); },
            // The language-aware description/parameters getters read the runtime
            // without demanding one, so a native-default process can still project
            // the transport for an agent that chose code.
            peekRuntime: function () { return _this.ctx.get('codeRuntime'); },
            maxParallel: this.maxParallelSubCalls,
            shapeDispatchLog: function (dispatch) { return _this.shapeDispatchLog(dispatch); },
        }));
        return this.codeTransport;
    };
    /**
     * Present the calling scope's tools in `mode` instead of the deployment
     * default. Nearest scope on the chain wins, so a preset's standing
     * declaration covers every agent joined under it.
     *
     * Scoped only, and one declaration per scope: this is how an agent preset
     * composes Code Mode agents beside native ones in the same process, and a
     * process-global override would be the `mode` config field instead.
     * @param mode - the presentation the covered agents' models see.
     * @returns the exact disposer that restores the deployment default.
     */
    ToolRuntime.prototype.presentAs = function (mode) {
        var ctx = this.ctx;
        if ((0, dsh_scope_1.scopeOf)(ctx) === undefined) {
            throw new Error('tools.presentAs() requires a scoped context (agent.ctx): a context-global presentation is the `mode` config field on the tools row');
        }
        var dispose = ctx.effect(function () {
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.layers.effect(ctx, function (layer) {
                            if (layer.mode !== undefined) {
                                throw new Error("tools.presentAs(\"".concat(mode, "\") conflicts with \"").concat(layer.mode, "\" already declared for this scope; one composition selects one presentation"));
                            }
                            layer.mode = mode;
                            return function () { layer.mode = undefined; };
                        }, { label: 'tools.presentAs()' })
                        // The SDK and collapse sections are per scope for the same reason the
                        // mode is. Under a deployment that already defaults to a code mode this
                        // shadows the global registration with an identical body, which costs
                        // nothing and keeps one rule instead of a case analysis.
                    ];
                    case 1:
                        _b.sent();
                        if (!(mode !== 'native')) return [3 /*break*/, 4];
                        return [4 /*yield*/, ctx.systemPrompt.section(this.collapseSection())];
                    case 2:
                        _b.sent();
                        return [4 /*yield*/, ctx.systemPrompt.section(this.sdkSection())];
                    case 3:
                        _b.sent();
                        _b.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        }.bind(this), 'tools.presentAs()');
        // oxlint-disable-next-line typescript/no-misused-promises -- synchronous composite teardown; direct return preserves disposer identity
        return dispose;
    };
    /**
     * Build one scope's wire schemas and names for prompt-order validation.
     * Restrictions do not make known tools invalid, but a mode collapse does.
     */
    ToolRuntime.prototype.wireSchemas = function (scope) {
        var _this = this;
        var view = this.view(scope);
        var mode = this.modeFor(scope);
        if (mode === 'native') {
            var schemas_1 = __spreadArray([], view.visible.values(), true).map(function (definition) { return _this.schemaOf(definition, false); });
            return { schemas: schemas_1, knownNames: __spreadArray([], view.knownNames, true) };
        }
        // Validate the runtime language BEFORE projecting schemas: schemaOf reads
        // run_code's language-aware description/parameters getters, whose own
        // flavor-table guard would otherwise surface first. This keeps the
        // renderer-table rejection the canonical assembly-time error for a
        // language with no SDK renderer.
        this.requireCodeRuntime(mode);
        var schemas = __spreadArray([], view.visible.values(), true).map(function (definition) { return _this.schemaOf(definition, false); });
        if (mode === 'code') {
            return {
                schemas: schemas.filter(function (schema) { return schema.name === code_mode_ts_1.RUN_CODE_NAME; }),
                knownNames: [code_mode_ts_1.RUN_CODE_NAME],
            };
        }
        return { schemas: schemas, knownNames: __spreadArray(__spreadArray([], view.knownNames, true), [code_mode_ts_1.RUN_CODE_NAME], false) };
    };
    /**
     * Resolve the code runtime or throw the actionable misconfiguration error.
     * Read at use time (assembly / run_code execution), NOT via static
     * `inject`: an inject entry would hold `ctx.tools` — and every tool plugin
     * behind it — hostage to a code runtime existing even under `mode:
     * 'native'` (the loop's optional-backend idiom, same as
     * `sessionPersistence`).
     *
     * Assembly and `run_code` execution read separately, so the language is not
     * bound to a request. Harmless while one published backend exists — both
     * reads return the same flavor — but a reload that swapped in a second
     * language between them would hand a program written against one SDK to the
     * other. Binding it is deferred until a second backend ships (the first
     * point it is testable); rationale in the
     * [language-dispatch note](../../../../.agents/notes/implemented/feature/2026-07-31-code-mode-language-dispatch.md).
     */
    ToolRuntime.prototype.requireCodeRuntime = function (mode) {
        var runtime = this.ctx.get('codeRuntime');
        if (!runtime) {
            throw new Error("dsh-tools: mode \"".concat(mode, "\" requires a code runtime \u2014 load a ctx.codeRuntime implementation (e.g. @z/dsh-code-runtime-worker-thread) or set tools mode to \"native\""));
        }
        if (!Object.hasOwn(SDK_RENDERERS, runtime.language)) {
            var known = Object.keys(SDK_RENDERERS).map(function (name) { return JSON.stringify(name); }).join(', ');
            throw new Error("dsh-tools: no SDK renderer registered for runtime language ".concat(JSON.stringify(runtime.language), " (known: ").concat(known, ")"));
        }
        return runtime;
    };
    /**
     * Register globally or in the calling agent scope. Scoped tools shadow
     * globals; duplicates within one layer and the reserved `run_code` name fail.
     * @param definition - tool schema, execution, and optional finalization/presentation callbacks.
     * @returns the exact disposer that unregisters the tool.
     */
    ToolRuntime.prototype.register = function (definition) {
        var name = definition.name;
        var output = definition.output;
        if (output === undefined || typeof output !== 'object'
            || typeof output.render !== 'function'
            || (output.presentationMeta !== undefined && typeof output.presentationMeta !== 'function')) {
            throw new TypeError("tool \"".concat(name, "\" must declare output { schema, render, presentationMeta? }"));
        }
        (0, json_schema_ts_1.assertSupportedJsonSchema)(output.schema);
        var timeoutMs = definition.timeoutMs;
        if (timeoutMs !== undefined
            && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
            throw new TypeError("tool \"".concat(name, "\" timeoutMs must be a positive finite number"));
        }
        // Reserved unconditionally: any agent may select a code mode for itself,
        // so a name free to take under the deployment default would become a
        // collision the moment a preset mounted.
        if (name === code_mode_ts_1.RUN_CODE_NAME) {
            throw new Error("tool name \"".concat(code_mode_ts_1.RUN_CODE_NAME, "\" is reserved for the Code Mode presentation transport and cannot be registered or shadowed"));
        }
        return this.layers.effect(this.ctx, function (layer) { return layer.tools.insert(name, definition); }, { label: 'tools.register()' });
    };
    /**
     * Restrict global tools for the calling agent scope. Empty filters, unknown
     * names, scope-local names, and reserved transport names fail. Restrictions
     * intersect; scoped registrations remain visible.
     * @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
     * @returns the exact disposer that lifts this restriction.
     */
    ToolRuntime.prototype.restrict = function (filter) {
        var scope = (0, dsh_scope_1.scopeOf)(this.ctx);
        if (scope === undefined) {
            throw new Error('tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent — deny the tool for the intended agent instead');
        }
        var allow = filter.allow;
        var deny = filter.deny;
        if (allow === undefined && deny === undefined) {
            throw new Error('tools.restrict({}) is a no-op: pass `allow` and/or `deny` (an empty filter is almost always a materialized-empty-config bug)');
        }
        var compiled = __assign(__assign({}, allow !== undefined ? { allow: new Set(allow) } : {}), deny !== undefined ? { deny: new Set(deny) } : {});
        if (__spreadArray(__spreadArray([], allow !== null && allow !== void 0 ? allow : [], true), deny !== null && deny !== void 0 ? deny : [], true).includes(code_mode_ts_1.RUN_CODE_NAME)) {
            throw new Error("tools.restrict() cannot name reserved Code Mode presentation transport \"".concat(code_mode_ts_1.RUN_CODE_NAME, "\"; restrict end-capability tools instead"));
        }
        var known = this.view(scope).restrictableNames;
        var unknown = __spreadArray(__spreadArray([], allow !== null && allow !== void 0 ? allow : [], true), deny !== null && deny !== void 0 ? deny : [], true).filter(function (name) { return !known.has(name); });
        if (unknown.length > 0) {
            throw new Error("tools.restrict() names unknown global tool".concat(unknown.length > 1 ? 's' : '', " ").concat(unknown.map(function (n) { return "\"".concat(n, "\""); }).join(', '), "; known global tools: ").concat(__spreadArray([], known, true).sort().join(', ') || '(none)'));
        }
        return this.layers.effect(this.ctx, function (layer) { return layer.restrictions.append(compiled); }, { label: 'tools.restrict()' });
    };
    /**
     * Register a monotonic guard after the extensible `tools/pre-execute`
     * waterfall. A plain-context guard applies globally; one registered through
     * `agent.ctx` applies only to that agent. Any matching guard may deny by
     * returning a reason, while no guard can force-allow a call another guard
     * denied. The exact effect disposer is returned for ordered ownership and
     * HMR cleanup.
     * @param guard - synchronous check; a returned string denies the execution.
     * @returns the exact disposer that unregisters the guard.
     */
    ToolRuntime.prototype.guard = function (guard) {
        return this.layers.effect(this.ctx, function (layer) { return layer.guards.append(guard); }, { label: 'tools.guard()', notify: false });
    };
    /** First monotonic denial from the global then the scope chain's guard layers, farthest first. */
    ToolRuntime.prototype.guardReason = function (exec) {
        var globalReason = this.layers.global.guardReason(exec);
        if (globalReason !== undefined)
            return globalReason;
        if (exec.agent === undefined)
            return undefined;
        for (var _i = 0, _b = this.layers.chainLayers(exec.agent); _i < _b.length; _i++) {
            var layer = _b[_i];
            var reason = layer.guardReason(exec);
            if (reason !== undefined)
                return reason;
        }
        return undefined;
    };
    /**
     * Resolve every registry fact one scope needs in one layer traversal. The
     * visible map applies restrictions to the INHERITED surface, then the
     * scope's own registrations and the reserved presentation transport; the
     * other sets retain the pre-restriction facts needed by restriction and
     * prompt-order validation.
     *
     * A restriction filters what a scope inherits — the global layer and every
     * ancestor layer on its chain — and never what its OWN layer registers.
     * That exemption is what a per-child capability filter has to keep intact:
     * the delegation runtime registers a child's reporting and structured-output
     * tools into the child's own layer, and a filter naming the capabilities the
     * child may use must not strip the machinery it answers through.
     *
     * Reading the exempt set as "the global layer" instead of "not mine" held
     * only while every model-facing tool sat in the host composition. Once
     * presets moved them onto the agent plane they became an ANCESTOR
     * contribution, so a child's filter silently stopped constraining anything
     * it was given.
     * @param scope - the viewing scope (the agent), or undefined for the global view.
     * @returns the complete derived view for that scope.
     */
    ToolRuntime.prototype.view = function (scope) {
        // Scope-chain layers, farthest ancestor first, the exact scope last.
        var layers = this.layers.chainLayers(scope);
        // Chain-blind on purpose: this is the ONE layer whose registrations the
        // scope owns rather than inherits, and it is absent until the scope
        // contributes something.
        var own = this.layers.peek(scope);
        // Inherited surface, nearest ancestor last: a nearer scope's same-name
        // entry shadows a farther one, and the global layer is the farthest.
        var inherited = new Map(this.layers.global.tools.entries());
        for (var _i = 0, layers_1 = layers; _i < layers_1.length; _i++) {
            var layer = layers_1[_i];
            if (layer === own)
                continue;
            for (var _b = 0, _c = layer.tools.entries(); _b < _c.length; _b++) {
                var _d = _c[_b], name_1 = _d[0], definition = _d[1];
                inherited.set(name_1, definition);
            }
        }
        var visible = new Map();
        var knownNames = new Set();
        var restrictableNames = new Set();
        var _loop_1 = function (name_2, definition) {
            knownNames.add(name_2);
            restrictableNames.add(name_2);
            // Restrictions intersect across the whole chain: any scope on it may
            // mask an inherited name for everything nested inside it.
            if (layers.every(function (layer) { return layer.admits(name_2); }))
                visible.set(name_2, definition);
        };
        for (var _e = 0, inherited_1 = inherited; _e < inherited_1.length; _e++) {
            var _f = inherited_1[_e], name_2 = _f[0], definition = _f[1];
            _loop_1(name_2, definition);
        }
        // The scope's own registrations last, shadowing an inherited name and
        // outside the filter above.
        if (own !== undefined) {
            for (var _g = 0, _h = own.tools.entries(); _g < _h.length; _g++) {
                var _j = _h[_g], name_3 = _j[0], definition = _j[1];
                knownNames.add(name_3);
                visible.set(name_3, definition);
            }
        }
        // Presentation infrastructure is resolved last and outside capability
        // filtering. Registration rejects this reserved name, so the insertion is
        // an invariant assertion as well as protection against future layer
        // changes. Per scope: a native agent must not find `run_code` in its
        // dispatch table because some other agent in the process presents it.
        if (this.modeFor(scope) !== 'native') {
            visible.set(code_mode_ts_1.RUN_CODE_NAME, this.requireCodeTransport());
        }
        return { visible: visible, knownNames: knownNames, restrictableNames: restrictableNames };
    };
    /**
     * Look up a tool as one scope sees it (scoped
     * shadows global; a restricted-away global reads as absent). Presenters pass
     * the calling agent so the rendered card matches the definition that
     * actually executed.
     * @param name - the tool name as registered.
     * @param scope - the viewing scope (the agent); omitted = the global view.
     * @returns the definition the scope resolves, or undefined when none is visible.
     */
    ToolRuntime.prototype.get = function (name, scope) {
        return this.view(scope).visible.get(name);
    };
    /**
     * Resolve the definition that MAY EXECUTE for a call, applying the mode
     * collapse at the operation boundary that owns it. The registry view
     * (`get`) is presentation-agnostic; here a MODEL-DIRECT call under `code`
     * may only name the reserved `run_code` transport, while a nested
     * sub-dispatch (a `parent` token set — the `run_code` SDK calling a tool
     * it bound) may call any visible tool. Denial surfaces as `UNKNOWN_TOOL`
     * through the executor, matching an absent definition.
     * @param name - the tool name as registered.
     * @param scope - the viewing scope (the agent); omitted = the global view.
     * @param nested - whether the call is a transport sub-dispatch, not a model-direct call.
     * @returns the definition that may run, or undefined when the call must be rejected.
     */
    ToolRuntime.prototype.resolveExecution = function (name, scope, nested) {
        var tool = this.get(name, scope);
        if (tool === undefined)
            return undefined;
        if (this.collapses(name, scope, nested))
            return undefined;
        return tool;
    };
    /**
     * Project visible definitions onto the allowlisted model-facing schema fields,
     * excluding execution and presentation callbacks.
     * @param scope - the viewing scope (the agent); omitted = the global view.
     * @returns one deep-cloned schema per visible tool.
     */
    ToolRuntime.prototype.schemas = function (scope) {
        var _this = this;
        return __spreadArray([], this.view(scope).visible.values(), true).map(function (definition) { return _this.schemaOf(definition, true); });
    };
    /** Project visible callable tools onto the generated Code Mode SDK contract. */
    ToolRuntime.prototype.sdkSchemas = function (scope) {
        var _this = this;
        return __spreadArray([], this.view(scope).visible.values(), true).filter(function (definition) { return definition.name !== code_mode_ts_1.RUN_CODE_NAME; })
            .map(function (definition) {
            var output = (0, dsh_session_1.snapshotJsonValue)(definition.output.schema);
            /* v8 ignore next -- registration already validated and retained this schema as lossless JSON. */
            if (output === undefined) {
                throw new Error("tool \"".concat(definition.name, "\" output schema must be lossless JSON before SDK projection"));
            }
            return __assign(__assign({}, _this.schemaOf(definition, true)), { output: output });
        });
    };
    /** Project one definition onto the model-facing schema fields. */
    ToolRuntime.prototype.schemaOf = function (definition, detachParameters) {
        var name = definition.name, description = definition.description, parameters = definition.parameters;
        var detached = detachParameters ? (0, dsh_session_1.snapshotJsonValue)(parameters) : parameters;
        if (detached === undefined) {
            throw new Error("tool \"".concat(name, "\" parameters must be lossless JSON before schema projection"));
        }
        return {
            name: name,
            description: description,
            parameters: detached,
        };
    };
    /**
     * Classify a pending call through the caller's visible tool definition. Only
     * an exact `true` is parallel; unknown, hidden, undeclared, invalid, or
     * throwing classifiers are exclusive.
     * @param exec - call name, parsed arguments, and optional agent scope.
     * @returns the fail-closed scheduling mode.
     */
    ToolRuntime.prototype.executionMode = function (exec) {
        var tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== undefined);
        if (!(tool === null || tool === void 0 ? void 0 : tool.isConcurrencySafe))
            return { kind: 'exclusive' };
        try {
            var concurrencySafe = tool.isConcurrencySafe(exec.arguments);
            return concurrencySafe === true ? { kind: 'parallel' } : { kind: 'exclusive' };
        }
        catch (_b) {
            return { kind: 'exclusive' };
        }
    };
    /**
     * Run the `tools/code-dispatch-log` waterfall over one settled sub-dispatch
     * and return the content the bridge should log on `tool/code-dispatch`.
     * Contained: when a listener throws, the method logs the original settled
     * content; that failure must not fail the dispatch or omit the settle event. Private:
     * the ONE consumer is the `run_code` bridge this registry constructs, which
     * receives it as a capability parameter (the `requireRuntime` idiom) — the
     * waterfall, not this invoker, is the public extension point.
     */
    ToolRuntime.prototype.shapeDispatchLog = function (dispatch) {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.ctx.waterfall((0, dsh_scope_1.scopeTarget)(this, dispatch.agent), 'tools/code-dispatch-log', dispatch, function () { return Promise.resolve(dispatch.content); })];
                    case 1: return [2 /*return*/, _b.sent()];
                    case 2:
                        error_1 = _b.sent();
                        this.ctx.logger.warn("tools: code-dispatch-log listener failed for ".concat(dispatch.name, ": ").concat(errorMessage(error_1), "; logging the original settled content"));
                        return [2 /*return*/, dispatch.content];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Whether the `code` mode collapse denies a model-direct call: only the
     * reserved `run_code` transport may be named. Nested sub-dispatches (a
     * `parent` token set) bypass the collapse. One home for the
     * security-relevant predicate, shared by {@link resolveExecution} and
     * {@link createExecution} so the two can never drift apart.
     *
     * Resolved through {@link modeFor}, NOT `defaultMode`: an agent given `code`
     * by an agent preset under a native deployment is the composition
     * `dsh-agent-tool-presentation` exists for, and reading the deployment default would
     * leave exactly that agent uncollapsed — announcing one surface while
     * executing another, which is the bypass this collapse closes.
     * @param name - the tool name as registered.
     * @param scope - the viewing scope whose effective presentation mode applies.
     * @param nested - whether the call is a transport sub-dispatch, not a model-direct call.
     */
    ToolRuntime.prototype.collapses = function (name, scope, nested) {
        return !nested && this.modeFor(scope) === 'code' && name !== code_mode_ts_1.RUN_CODE_NAME;
    };
    /**
     * Execute through pre-policy, guards, around-dispatch, post-policy,
     * definition-owned content finalization, and final notification. Tool and
     * listener failures resolve as materialized error results; an invisible tool
     * reports `UNKNOWN_TOOL`. The returned outcome is the same lossless, frozen
     * snapshot final observers receive. Cancellation
     * arriving after entry and before final result materialization skips a
     * not-yet-started body with `ABORTED_BEFORE_DISPATCH` or replaces a
     * successful started outcome with `ABORTED`; already-started work is still
     * drained and may retain a tool-owned structured error.
     * @param exec - the typed same-process call input. The registry assigns its
     *   correlation token before policy begins.
     * @returns the materialized final result.
     */
    ToolRuntime.prototype.execute = function (exec) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_b) {
                return [2 /*return*/, this.prepareExecution(exec, function (prepared) { return _this.completeScheduledExecution(prepared); })];
            });
        });
    };
    ToolRuntime.prototype.completeScheduledExecution = function (prepared) {
        return __awaiter(this, void 0, void 0, function () {
            var _b, dispatched, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _b = prepared.kind;
                        switch (_b) {
                            case 'dispatch': return [3 /*break*/, 1];
                            case 'post-result': return [3 /*break*/, 6];
                            case 'final-result': return [3 /*break*/, 8];
                        }
                        return [3 /*break*/, 9];
                    case 1: return [4 /*yield*/, this.dispatchScheduledExecution(prepared.exec)];
                    case 2:
                        dispatched = _d.sent();
                        if (!(dispatched.kind === 'post-result')) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.finalizeScheduledExecution(prepared.exec, dispatched.result)];
                    case 3:
                        _c = _d.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _c = this.finishScheduledExecution(prepared.exec, dispatched.result);
                        _d.label = 5;
                    case 5: return [2 /*return*/, _c];
                    case 6: return [4 /*yield*/, this.finalizeScheduledExecution(prepared.exec, prepared.result)];
                    case 7: return [2 /*return*/, _d.sent()];
                    case 8: return [2 /*return*/, this.finishScheduledExecution(prepared.exec, prepared.result)
                        /* v8 ignore next -- closed-union exhaustiveness guard */
                    ];
                    case 9: return [2 /*return*/, (0, dsh_llm_1.assertNever)(prepared, 'scheduled tool preparation')];
                }
            });
        });
    };
    ToolRuntime.prototype.createExecution = function (exec) {
        var _b, _c;
        var deferredContexts = [];
        var token = createExecutionToken();
        var callId = exec.callId;
        var rootCallId = (_b = exec.rootCallId) !== null && _b !== void 0 ? _b : callId;
        var name = exec.name;
        var agent = exec.agent;
        var parent = exec.parent;
        var signal = exec.signal;
        // Distinguish a mode-collapsed call (visible in the scope, denied only by
        // the `code` collapse) from a genuinely unknown tool. A collapsed call is
        // deterministically denied, so it terminates BEFORE the extensible policy
        // pipeline: pre-execute listeners, approval `ask`, and guards must never
        // observe — or worse, approve — a call that can only fail. An unknown tool
        // keeps the historical dispatch-stage `UNKNOWN_TOOL` path so policy
        // listeners still see every name that reaches the registry.
        var visible = this.get(name, agent);
        var collapsed = visible !== undefined && this.collapses(name, agent, parent !== undefined);
        var concludingExecutions = this.concludingExecutions;
        var base = __assign(__assign(__assign({ token: token, callId: callId, rootCallId: rootCallId, name: name, signal: signal }, agent !== undefined ? { agent: agent } : {}), parent !== undefined ? { parent: parent } : {}), { deferContext: function (context) {
                deferredContexts.push(context);
            }, concludeTurn: function () {
                concludingExecutions.add(this);
            } });
        // Capture the finalizer BEFORE argument materialization: the
        // `finalizeContent` contract snapshots the callback when the call starts,
        // and an arguments getter can replace or clear the registered callback
        // during `snapshotJsonValue`. The collapse only decides whether the
        // CAPTURED callback is retained: the pre-dispatch abort path keeps it
        // (the cancellation contract routes aborted results through it — a getter
        // that aborts mid-materialization before an invalid-args failure lands in
        // the same retained path), while the `UNKNOWN_TOOL` denial and the
        // invalid-args failure of a NON-ABORTED collapsed call drop it (the call
        // could never execute).
        var capturedFinalizer = (_c = visible === null || visible === void 0 ? void 0 : visible.finalizeContent) === null || _c === void 0 ? void 0 : _c.bind(visible);
        var finalizerFor = function () {
            return collapsed && !signal.aborted ? undefined : capturedFinalizer;
        };
        try {
            var detached = (0, dsh_session_1.snapshotJsonValue)(exec.arguments);
            if (detached === undefined) {
                throw new TypeError('tool execution arguments must be losslessly JSON-serializable');
            }
            var execution = __assign(__assign({}, base), { arguments: (0, dsh_llm_1.deepFreeze)(detached) });
            this.deferredContexts.set(execution, deferredContexts);
            this.contentFinalizers.set(execution, finalizerFor());
            this.cancellationStates.set(execution, {
                callerSignal: signal,
                bodyInvoked: false,
            });
            if (collapsed) {
                // The collapse denies the call before the policy pipeline, but a
                // pre-dispatch abort still keeps the established cancellation
                // contract: `prepare`'s caller-cancellation check is skipped for
                // final-results, so honor the abort here instead of surfacing
                // `UNKNOWN_TOOL` on an already-cancelled call.
                if (signal.aborted) {
                    return { kind: 'final-result', exec: execution, result: toolAbortedBeforeDispatchResult() };
                }
                // The name IS visible here, so the denial carries the route the model
                // must take instead. Without it the model reads a bare `unknown tool`
                // for a tool the prompt just declared and concludes the deployment is
                // broken rather than correcting itself.
                return {
                    kind: 'final-result',
                    exec: execution,
                    result: toolErrorResult(new ToolNotFoundError(name, "only `".concat(code_mode_ts_1.RUN_CODE_NAME, "` is callable directly \u2014 call `").concat(name, "` from inside a `").concat(code_mode_ts_1.RUN_CODE_NAME, "` program instead"))),
                };
            }
            return { kind: 'ready', exec: execution };
        }
        catch (error) {
            var execution = __assign(__assign({}, base), { arguments: undefined });
            this.contentFinalizers.set(execution, finalizerFor());
            return { kind: 'final-result', exec: execution, result: toolErrorResult(error) };
        }
    };
    /**
     * Run the ordered pre-execute and monotonic guard stages for the scheduler.
     * @param input - the caller-supplied execution input.
     * @returns the prepared execution plus the next scheduler stage.
     * @internal
     */
    ToolRuntime.prototype.prepareScheduledExecution = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_b) {
                return [2 /*return*/, this.prepareExecution(input, function (prepared) { return prepared; })];
            });
        });
    };
    ToolRuntime.prototype.prepareExecution = function (input, next) {
        return __awaiter(this, void 0, void 0, function () {
            var created, exec, carrier, gate, askResolution, _b, decision, denialReason, error_2;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        created = this.createExecution(input);
                        if (created.kind !== 'ready')
                            return [2 /*return*/, next(created)];
                        exec = created.exec;
                        if (this.callerCancelled(exec)) {
                            return [2 /*return*/, next({ kind: 'final-result', exec: exec, result: toolAbortedBeforeDispatchResult() })];
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 13, , 14]);
                        carrier = (0, dsh_scope_1.scopeTarget)(this, exec.agent);
                        return [4 /*yield*/, this.ctx.waterfall(carrier, 'tools/pre-execute', exec, function () { return Promise.resolve({ kind: 'allow' }); })];
                    case 2:
                        gate = _c.sent();
                        if (!(gate.kind === 'ask')) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.serviceAsk(exec, gate)];
                    case 3:
                        _b = _c.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _b = { decision: gate, approvalCancelled: false };
                        _c.label = 5;
                    case 5:
                        askResolution = _b;
                        decision = askResolution.decision;
                        if (!(this.callerCancelled(exec) && askResolution.approvalCancelled)) return [3 /*break*/, 7];
                        return [4 /*yield*/, next({ kind: 'post-result', exec: exec, result: toolAbortedBeforeDispatchResult() })];
                    case 6: return [2 /*return*/, _c.sent()];
                    case 7:
                        denialReason = decision.kind === 'allow'
                            ? this.guardReason(exec)
                            : decision.reason;
                        if (!(denialReason !== undefined)) return [3 /*break*/, 9];
                        return [4 /*yield*/, next({
                                kind: 'post-result',
                                exec: exec,
                                result: this.materializeFinalResult({
                                    content: [{ type: 'text', text: "Error: ".concat(denialReason) }],
                                    isError: true,
                                    error: { message: denialReason },
                                }),
                            })];
                    case 8: return [2 /*return*/, _c.sent()];
                    case 9:
                        if (!this.callerCancelled(exec)) return [3 /*break*/, 11];
                        return [4 /*yield*/, next({ kind: 'post-result', exec: exec, result: toolAbortedBeforeDispatchResult() })];
                    case 10: return [2 /*return*/, _c.sent()];
                    case 11: return [4 /*yield*/, next({ kind: 'dispatch', exec: exec })];
                    case 12: return [2 /*return*/, _c.sent()];
                    case 13:
                        error_2 = _c.sent();
                        return [2 /*return*/, next({ kind: 'final-result', exec: exec, result: toolErrorResult(error_2) })];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    /** Whether the original caller signal is currently aborted. */
    ToolRuntime.prototype.callerCancelled = function (exec) {
        var state = this.cancellationStates.get(exec);
        /* v8 ignore next -- only registry-minted executions reach the staged scheduler methods */
        if (state === undefined)
            throw new Error('tool registry scheduler invariant violated: missing cancellation state');
        return state.callerSignal.aborted;
    };
    /** Canonical cancellation outcome selected by whether the tool body started. */
    ToolRuntime.prototype.cancellationResult = function (exec, prior) {
        var state = this.cancellationStates.get(exec);
        /* v8 ignore next -- only registry-minted executions reach the staged scheduler methods */
        if (state === undefined)
            throw new Error('tool registry scheduler invariant violated: missing cancellation state');
        return state.bodyInvoked
            ? toolAbortedResult(prior)
            : toolAbortedBeforeDispatchResult(prior);
    };
    /**
     * Dispatch the registered body with the original caller signal fused back
     * into any around-wrapper replacement. Cancellation never abandons the body:
     * a started promise reaches quiescence before its outcome becomes `ABORTED`.
     */
    ToolRuntime.prototype.dispatchToolBody = function (exec) {
        return __awaiter(this, void 0, void 0, function () {
            var state, wrapperSignal, fused, signal, tool, returned, result, error_3;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        state = this.cancellationStates.get(exec);
                        /* v8 ignore next -- only registry-minted executions reach the staged scheduler methods */
                        if (state === undefined)
                            throw new Error('tool registry scheduler invariant violated: missing cancellation state');
                        wrapperSignal = exec.signal;
                        fused = fuseToolSignals(state.callerSignal, wrapperSignal);
                        signal = fused.signal;
                        if (isAborted(signal)) {
                            fused.dispose();
                            return [2 /*return*/, toolAbortedBeforeDispatchResult()];
                        }
                        exec.signal = signal;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, 4, 5]);
                        tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== undefined);
                        if (!tool)
                            throw new ToolNotFoundError(exec.name);
                        state.bodyInvoked = true;
                        return [4 /*yield*/, tool.execute(exec.arguments, exec)];
                    case 2:
                        returned = _b.sent();
                        result = this.createSuccessResult(exec, tool, returned);
                        return [2 /*return*/, isAborted(signal)
                                ? toolAbortedResult(result)
                                : result];
                    case 3:
                        error_3 = _b.sent();
                        return [2 /*return*/, toolErrorResult(error_3)];
                    case 4:
                        fused.dispose();
                        exec.signal = wrapperSignal;
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Run around-dispatch and the tool body. Tool and unknown-tool failures still
     * receive post-execute; pipeline failures are already final.
     * @param exec - the prepared execution.
     * @returns whether the result still needs post-execute.
     * @internal
     */
    ToolRuntime.prototype.dispatchScheduledExecution = function (exec) {
        return __awaiter(this, void 0, void 0, function () {
            var mutableExec_1, carrier, result, normalized, deferredContexts, resultWithDeferredContexts, error_4;
            var _this = this;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 2, , 3]);
                        mutableExec_1 = exec;
                        carrier = (0, dsh_scope_1.scopeTarget)(this, exec.agent);
                        return [4 /*yield*/, this.ctx.waterfall(carrier, 'tools/execute', mutableExec_1, function () { return _this.dispatchToolBody(mutableExec_1); })];
                    case 1:
                        result = _c.sent();
                        normalized = this.normalizeDispatchResult(exec, result);
                        deferredContexts = this.deferredContexts.get(exec);
                        /* v8 ignore next -- dispatch only receives executions minted by this registry's prepare stage */
                        if (deferredContexts === undefined)
                            throw new Error('tool registry scheduler invariant violated: unprepared execution');
                        resultWithDeferredContexts = deferredContexts.length === 0
                            ? normalized
                            : this.markCanonical(exec, __assign(__assign({}, normalized), { additionalContexts: __spreadArray(__spreadArray([], deferredContexts, true), (_b = normalized.additionalContexts) !== null && _b !== void 0 ? _b : [], true) }));
                        return [2 /*return*/, {
                                kind: 'post-result',
                                result: this.callerCancelled(exec) && !resultWithDeferredContexts.isError
                                    ? this.cancellationResult(exec, resultWithDeferredContexts)
                                    : resultWithDeferredContexts,
                            }];
                    case 2:
                        error_4 = _c.sent();
                        return [2 /*return*/, { kind: 'final-result', result: toolErrorResult(error_4) }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Run ordered post-execute, then apply definition-owned content finalization,
     * materialize, and notify the final outcome.
     * @param exec - the prepared execution.
     * @param result - dispatch/pre result that still needs post-execute.
     * @returns the materialized final result.
     * @internal
     */
    ToolRuntime.prototype.finalizeScheduledExecution = function (exec, result) {
        return __awaiter(this, void 0, void 0, function () {
            var postResult, error_5;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.postExecute(exec, result)];
                    case 1:
                        postResult = _b.sent();
                        return [2 /*return*/, this.finishScheduledExecution(exec, this.callerCancelled(exec) && !postResult.isError
                                ? this.cancellationResult(exec, postResult)
                                : postResult)];
                    case 2:
                        error_5 = _b.sent();
                        return [2 /*return*/, this.finishScheduledExecution(exec, toolErrorResult(error_5))];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Materialize the candidate, apply definition-owned content finalization,
     * then materialize and notify the authoritative result.
     * @param exec - the prepared execution.
     * @param result - final result.
     * @returns the materialized final result.
     * @internal
     */
    ToolRuntime.prototype.finishScheduledExecution = function (exec, result) {
        var materializedResult;
        try {
            materializedResult = this.materializeFinalResult(result);
        }
        catch (error) {
            materializedResult = this.materializeFinalResult(toolErrorResult(error));
        }
        var finalResult;
        try {
            finalResult = this.materializeFinalResult(this.applyFinalContent(exec, materializedResult));
        }
        catch (error) {
            finalResult = this.materializeFinalResult(toolErrorResult(error));
        }
        this.notifyResult(exec, finalResult);
        return finalResult;
    };
    /** Apply the snapshotted tool-owned content transform without exposing other result fields. */
    ToolRuntime.prototype.applyFinalContent = function (exec, result) {
        var finalizeContent = this.contentFinalizers.get(exec);
        if (finalizeContent === undefined)
            return result;
        var content = finalizeContent(exec, result);
        return content === undefined ? result : __assign(__assign({}, result), { content: content });
    };
    /** Notify observers without exposing a mutation or error channel into the outcome. */
    ToolRuntime.prototype.notifyResult = function (exec, result) {
        var _this = this;
        // Freeze the registry's live object before observers receive its readonly
        // WeakMap-keyable view.
        Object.freeze(exec);
        var toolName = exec.name, callId = exec.callId;
        var reportFailure = function (error) {
            _this.ctx.logger.warn("tool \"".concat(toolName, "\" (").concat(callId, "): tools/result observer failed: ").concat(errorMessage(error)));
        };
        var callbacks = this.ctx.events.dispatch('emit', [
            (0, dsh_scope_1.scopeTarget)(this, exec.agent), 'tools/result', exec, result,
        ]);
        for (var _i = 0, callbacks_1 = callbacks; _i < callbacks_1.length; _i++) {
            var callback = callbacks_1[_i];
            try {
                var returned = callback(exec, result);
                void Promise.resolve(returned).catch(reportFailure);
            }
            catch (error) {
                reportFailure(error);
            }
        }
    };
    /**
     * Resolve an `ask` decision to allow/deny through the approval seam. The
     * seam is consumed opportunistically with `ctx.get('approval')` — a
     * deployment that composes no ApprovalService keeps the historical degrade
     * to deny, and an unmount mid-session degrades the same way on the next ask.
     * An agent-less execution also degrades: without an agent there is no
     * session to audit to and no UI to route to. Otherwise the outcome maps
     * one-to-one — `allowed-once` proceeds; the three non-grants deny with
     * distinct reasons so the model can tell a human "no" from an absent
     * approval channel.
     */
    ToolRuntime.prototype.serviceAsk = function (exec, ask) {
        return __awaiter(this, void 0, void 0, function () {
            var approval, outcome;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        approval = this.ctx.get('approval');
                        if (approval === undefined) {
                            return [2 /*return*/, {
                                    decision: { kind: 'deny', reason: (_b = ask.reason) !== null && _b !== void 0 ? _b : "tool \"".concat(exec.name, "\" requires approval (not yet supported)") },
                                    approvalCancelled: false,
                                }];
                        }
                        if (exec.agent === undefined) {
                            return [2 /*return*/, {
                                    decision: { kind: 'deny', reason: "tool \"".concat(exec.name, "\" requires approval, but the call has no agent to route it through") },
                                    approvalCancelled: false,
                                }];
                        }
                        return [4 /*yield*/, approval.request(__assign(__assign({ agent: exec.agent, toolName: exec.name, callId: exec.callId }, ask.reason !== undefined ? { reason: ask.reason } : {}), { signal: exec.signal }))];
                    case 1:
                        outcome = _c.sent();
                        switch (outcome) {
                            case 'allowed-once': return [2 /*return*/, { decision: { kind: 'allow' }, approvalCancelled: false }];
                            case 'rejected': return [2 /*return*/, {
                                    decision: { kind: 'deny', reason: "the user rejected tool \"".concat(exec.name, "\"") },
                                    approvalCancelled: false,
                                }];
                            case 'cancelled': return [2 /*return*/, {
                                    decision: { kind: 'deny', reason: "approval for tool \"".concat(exec.name, "\" was cancelled") },
                                    approvalCancelled: true,
                                }];
                            case 'unavailable': return [2 /*return*/, {
                                    decision: { kind: 'deny', reason: "tool \"".concat(exec.name, "\" requires approval, but no approval channel is available") },
                                    approvalCancelled: false,
                                }];
                            default: return [2 /*return*/, (0, dsh_llm_1.assertNever)(outcome, 'ApprovalOutcome')];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Run the `tools/post-execute` waterfall over a dispatched `result` and apply
     * its {@link PostToolDecision}: `accept` keeps the call successful (replacing
     * `content` when given), `block` turns it into an `isError` whose content is
     * the corrective `feedback`. Either decision may attach `additionalContexts`,
     * which are ferried on the returned result for the loop's active-batch FIFO.
     * Context deferred by the tool body survives an accepted result but is
     * discarded when the outer call is blocked; a block exposes only context the
     * blocking decision explicitly supplied.
     * Runs inside `execute`'s outer try/catch (a throwing listener → isError).
     */
    ToolRuntime.prototype.postExecute = function (exec, result) {
        return __awaiter(this, void 0, void 0, function () {
            var decision, decisionContexts, message, additionalContexts, tool, replaced;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: return [4 /*yield*/, this.ctx.waterfall((0, dsh_scope_1.scopeTarget)(this, exec.agent), 'tools/post-execute', exec, result, function () { return Promise.resolve({ kind: 'accept' }); })];
                    case 1:
                        decision = _d.sent();
                        decisionContexts = (_b = decision.additionalContexts) !== null && _b !== void 0 ? _b : [];
                        if (decision.kind === 'block') {
                            message = failureMessageFromContent(decision.feedback);
                            return [2 /*return*/, this.markCanonical(exec, __assign({ content: decision.feedback, isError: true, error: { message: message } }, decisionContexts.length > 0 ? { additionalContexts: decisionContexts } : {}))];
                        }
                        if (Object.hasOwn(decision, 'content') && Object.hasOwn(decision, 'value')) {
                            throw new TypeError('tools/post-execute accept decision cannot replace both value and content');
                        }
                        additionalContexts = __spreadArray(__spreadArray([], (_c = result.additionalContexts) !== null && _c !== void 0 ? _c : [], true), decisionContexts, true);
                        if (Object.hasOwn(decision, 'value')) {
                            if (result.isError) {
                                throw new TypeError('tools/post-execute cannot replace the value of a failed result');
                            }
                            tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== undefined);
                            if (tool === undefined)
                                throw new ToolNotFoundError(exec.name);
                            replaced = this.createSuccessResult(exec, tool, decision.value);
                            return [2 /*return*/, this.markCanonical(exec, __assign(__assign({}, replaced), additionalContexts.length > 0 ? { additionalContexts: additionalContexts } : {}))];
                        }
                        return [2 /*return*/, this.markCanonical(exec, __assign(__assign(__assign({}, result), decision.content !== undefined ? { content: decision.content } : {}), additionalContexts.length > 0 ? { additionalContexts: additionalContexts } : {}))];
                }
            });
        });
    };
    /** Mark one registry-normalized result as canonical only for its owning dispatch. */
    ToolRuntime.prototype.markCanonical = function (exec, result) {
        this.canonicalResults.set(result, exec.token);
        return result;
    };
    /** Snapshot, validate, render, and optionally project one successful body value. */
    ToolRuntime.prototype.createSuccessResult = function (exec, tool, candidate) {
        var detached = snapshotToolValue(tool.name, candidate);
        var violations = (0, json_schema_ts_1.validateJsonSchemaValue)(tool.output.schema, detached, 'value');
        if (violations.length > 0)
            throw new ToolOutputError(tool.name, violations);
        var value = (0, dsh_llm_1.deepFreeze)(detached);
        var rendered;
        try {
            rendered = tool.output.render(exec.arguments, value);
        }
        catch (error) {
            throw projectionError(tool.name, 'render', error);
        }
        var content = snapshotProjection(tool.name, 'render', rendered);
        var meta;
        if (exec.parent === undefined && tool.output.presentationMeta !== undefined) {
            var projected = void 0;
            try {
                projected = tool.output.presentationMeta(exec.arguments, value);
            }
            catch (error) {
                throw projectionError(tool.name, 'presentationMeta', error);
            }
            meta = snapshotProjection(tool.name, 'presentationMeta', projected);
        }
        var concludesTurn = this.concludingExecutions.has(exec);
        return this.markCanonical(exec, this.materializeFinalResult(__assign(__assign({ isError: false, value: value, content: content }, meta !== undefined ? { meta: meta } : {}), concludesTurn ? { concludesTurn: true } : {})));
    };
    /** Normalize an around-dispatch wrapper's authored result through the owning output contract. */
    ToolRuntime.prototype.normalizeDispatchResult = function (exec, result) {
        if (this.canonicalResults.get(result) === exec.token)
            return result;
        if (result.isError) {
            return this.markCanonical(exec, __assign(__assign({ isError: true, error: result.error, content: result.content }, result.meta !== undefined ? { meta: result.meta } : {}), result.additionalContexts !== undefined ? { additionalContexts: result.additionalContexts } : {}));
        }
        var tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== undefined);
        if (tool === undefined)
            throw new ToolNotFoundError(exec.name);
        var normalized = this.createSuccessResult(exec, tool, result.value);
        return this.markCanonical(exec, __assign(__assign({}, normalized), result.additionalContexts !== undefined ? { additionalContexts: result.additionalContexts } : {}));
    };
    /** Materialize the authoritative commit outcome once, immediately before `tools/result`. */
    ToolRuntime.prototype.materializeFinalResult = function (result) {
        var presentation = __assign(__assign({ content: result.content }, result.meta !== undefined ? { meta: result.meta } : {}), result.additionalContexts !== undefined ? { additionalContexts: result.additionalContexts } : {});
        if (result.isError) {
            return materializePresentation(__assign({ isError: true, error: result.error }, presentation));
        }
        var detached = materializePresentation(__assign(__assign({ isError: false }, presentation), result.concludesTurn === true ? { concludesTurn: true } : {}));
        return (0, dsh_llm_1.deepFreeze)(__assign(__assign({}, detached), { value: result.value }));
    };
    var _a;
    _a = exports.TOOL_RUNTIME_SCHEDULER;
    ToolRuntime.inject = ['systemPrompt'];
    ToolRuntime.Config = schemastery_1.default.object({
        mode: schemastery_1.default.union(['native', 'code', 'both']).default('native'),
        maxParallelSubCalls: schemastery_1.default.natural().min(1).default(10),
    });
    return ToolRuntime;
}(cordis_1.Service));
exports.ToolRuntime = ToolRuntime;
/** Mint a same-process correlation token whose identity is its value. */
function createExecutionToken() {
    return Symbol('dsh.tool.execution');
}
function toolErrorResult(error) {
    var info = errorInfo(error);
    var message = errorMessage(error);
    return {
        content: [{ type: 'text', text: "Error: ".concat(message) }],
        isError: true,
        error: __assign({ message: message }, info ? { info: info } : {}),
    };
}
/** Read live abort state across an await without treating it as synchronously immutable. */
function isAborted(signal) {
    return signal.aborted;
}
/**
 * Fuse caller and wrapper cancellation without nesting `AbortSignal.any`.
 * Keeping the relay dispatch-scoped also removes listeners when work settles.
 */
function fuseToolSignals(caller, wrapper) {
    if (caller === wrapper)
        return { signal: caller, dispose: function () { } };
    var controller = new AbortController();
    var listening = false;
    var dispose = function () {
        if (!listening)
            return;
        listening = false;
        caller.removeEventListener('abort', abortFromCaller);
        wrapper.removeEventListener('abort', abortFromWrapper);
    };
    var abortFrom = function (source) {
        var reason = source.reason;
        controller.abort(reason);
        dispose();
    };
    var abortFromCaller = function () { abortFrom(caller); };
    var abortFromWrapper = function () { abortFrom(wrapper); };
    if (wrapper.aborted)
        abortFromWrapper();
    else if (caller.aborted)
        abortFromCaller();
    else {
        listening = true;
        caller.addEventListener('abort', abortFromCaller, { once: true });
        wrapper.addEventListener('abort', abortFromWrapper, { once: true });
    }
    return { signal: controller.signal, dispose: dispose };
}
/** Canonical result when cancellation supersedes success after body invocation. */
function toolAbortedResult(prior) {
    var _b;
    var additionalContexts = (_b = prior === null || prior === void 0 ? void 0 : prior.additionalContexts) !== null && _b !== void 0 ? _b : [];
    return __assign({ content: [{ type: 'text', text: 'Error: tool call aborted' }], isError: true, error: {
            message: 'tool call aborted',
            info: { name: 'AbortError', code: exports.TOOL_ABORTED },
        } }, additionalContexts.length > 0 ? { additionalContexts: additionalContexts } : {});
}
/** Canonical result when cancellation prevents tool body invocation. */
function toolAbortedBeforeDispatchResult(prior) {
    var _b;
    var additionalContexts = (_b = prior === null || prior === void 0 ? void 0 : prior.additionalContexts) !== null && _b !== void 0 ? _b : [];
    return __assign({ content: [{ type: 'text', text: 'Error: tool call aborted before dispatch' }], isError: true, error: {
            message: 'tool call aborted before dispatch',
            info: { name: 'AbortError', code: exports.TOOL_ABORTED_BEFORE_DISPATCH },
        } }, additionalContexts.length > 0 ? { additionalContexts: additionalContexts } : {});
}
exports.default = ToolRuntime;
