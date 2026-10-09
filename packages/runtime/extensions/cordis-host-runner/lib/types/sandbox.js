"use strict";
/**
 * The `node:vm` sandbox a dynamic package's HOST half evaluates in: a fresh realm whose globals
 * are a tagged write-through console, the `harness` registration helpers, the encoding primitives
 * a bare vm context lacks, and callable traps over the Node APIs the sandbox deliberately
 * withholds. Traps steer filesystem, network, process, and timer work to `ctx.fs`, `ctx.web`,
 * `ctx.bash`, and Cordis timers. This keeps cooperative packages inspectable and disposable but
 * is not containment: host-realm helper functions remain an escape route.
 *
 * The browser half never reaches this module — it is evaluated by the client-side runner in a
 * closure, with its own facade.
 * @module @z/dsh-cordis-host-runner/sandbox
 */
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
exports.HOST_BUILTIN_INSPECTION = void 0;
exports.createSandbox = createSandbox;
exports.syntaxErrorContext = syntaxErrorContext;
exports.parseErrorMessage = parseErrorMessage;
exports.precheckCode = precheckCode;
exports.evaluateHostCode = evaluateHostCode;
var node_vm_1 = require("node:vm");
var guard_ts_1 = require("./guard.ts");
/** Exact Host closure symbols exposed by the sandbox and guarded Context. */
exports.HOST_BUILTIN_INSPECTION = [
    {
        name: 'ctx',
        description: 'Restricted Cordis Context. Prefer ctx.get(name) with an undefined check; use inject for hard dependencies.',
        signatures: [
            'ctx.get(name: string): unknown | undefined',
            'ctx.on(name: string, listener: Function): () => void',
            'ctx.provide(name: string, value: unknown): () => void',
            'ctx.effect(callback: Function, label?: string): () => void',
        ],
    },
    {
        name: 'harness',
        description: 'Host helpers for Package-private Client RPC and model-visible dynamic Tools.',
        signatures: [
            'harness.handle(method: string, handler: (args: JsonValue) => JsonValue | Promise<JsonValue>): () => void',
            'harness.defineTool(definition: ToolDefinition): ToolDefinition',
            'harness.registerTool(ctx: Context, tool: ToolDefinition): () => void',
        ],
    },
    { name: 'console', description: 'Package-tagged Host logging.', signatures: ['console.log(...values): void', 'console.error(...values): void'] },
    { name: 'btoa', description: 'Encode UTF-8 text as base64.', signatures: ['btoa(value: string): string'] },
    { name: 'atob', description: 'Decode base64 as UTF-8 text.', signatures: ['atob(value: string): string'] },
    { name: 'TextEncoder', description: 'Standard UTF-8 encoder constructor.', signatures: ['new TextEncoder()'] },
    { name: 'TextDecoder', description: 'Standard text decoder constructor.', signatures: ['new TextDecoder(label?: string)'] },
];
/**
 * A write-through console for one package, tagging every line with the package
 * id. Write-through (host stdout/stderr), NOT buffered into the tool result:
 * a registered listener fires long after the run call returned, and its output
 * must land somewhere the user can see — for a terminal entry point, the host terminal.
 */
function taggedConsole(id) {
    var tag = "[cordis:".concat(id, "]");
    var log = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.log.apply(console, __spreadArray([tag], args, false));
    };
    var error = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.error.apply(console, __spreadArray([tag], args, false));
    };
    return { log: log, info: log, warn: log, debug: log, error: error };
}
/**
 * Patch only VM constructors so `instanceof` accepts both VM values and host values passed as
 * arguments, events, or service results; host intrinsics remain untouched.
 */
var DUAL_REALM_INSTANCEOF_PRELUDE = "\n(hostIntrinsics) => {\n  'use strict'\n  const ordinary = Function.prototype[Symbol.hasInstance]\n  for (const name of Object.keys(hostIntrinsics)) {\n    const VmCtor = globalThis[name]\n    const HostCtor = hostIntrinsics[name]\n    if (typeof VmCtor !== 'function' || typeof HostCtor !== 'function') continue\n    Object.defineProperty(VmCtor, Symbol.hasInstance, {\n      value: (instance) => ordinary.call(VmCtor, instance) || ordinary.call(HostCtor, instance),\n      configurable: true,\n    })\n  }\n}\n";
/** Run {@link DUAL_REALM_INSTANCEOF_PRELUDE} in a freshly created sandbox, handing it the host intrinsics to pair up. */
function patchDualRealmInstanceof(sandbox) {
    var patch = (0, node_vm_1.runInContext)(DUAL_REALM_INSTANCEOF_PRELUDE, sandbox);
    patch({ Object: Object, Array: Array, Function: Function, Error: Error, TypeError: TypeError, RangeError: RangeError, SyntaxError: SyntaxError, Promise: Promise, RegExp: RegExp, Date: Date, Map: Map, Set: Set });
}
var TIMER_REDIRECT = 'Node timers are unavailable. Use the cordis timer service instead: declare inject: [\'timer\'] on your plugin '
    + 'and call ctx.timeout / ctx.interval after querying Host Service.listService for the exact overloads. '
    + 'Those calls are fiber effects, cleaned up automatically when stopped.';
/**
 * The callable Node APIs the sandbox deliberately disables, each mapped to the
 * cordis alternative its trap error names. Only function-valued globals are
 * trapped; a data-valued global such as `process` stays `undefined`, because a
 * throwing accessor would detonate the common `typeof process` feature probe
 * at resolution time.
 */
var NODE_API_REDIRECTS = {
    require: 'Node modules are unavailable. Use the cordis services on ctx instead — e.g. inject: [\'fs\'] for files, '
        + '[\'web\'] for HTTP, [\'bash\'] for processes; query Service.listService with cordis_inspect_query first.',
    setTimeout: TIMER_REDIRECT,
    setInterval: TIMER_REDIRECT,
    setImmediate: TIMER_REDIRECT,
    clearTimeout: TIMER_REDIRECT,
    clearInterval: TIMER_REDIRECT,
    fetch: 'Network access goes through the cordis web service: declare inject: [\'web\'] and call ctx.web '
        + '(query Host Service.listService with cordis_inspect_query for its methods).',
};
/** Build the trap functions for {@link NODE_API_REDIRECTS}: calling one throws the redirect. */
function nodeApiTraps() {
    var traps = {};
    var _loop_1 = function (name_1, redirect) {
        traps[name_1] = function () {
            throw new Error("".concat(name_1, " is not available in the dynamic package sandbox \u2014 ").concat(redirect));
        };
    };
    for (var _i = 0, _a = Object.entries(NODE_API_REDIRECTS); _i < _a.length; _i++) {
        var _b = _a[_i], name_1 = _b[0], redirect = _b[1];
        _loop_1(name_1, redirect);
    }
    return traps;
}
/**
 * Build the vm context one host half evaluates in: the tagged console, the
 * `harness` registration helpers, the encoding primitives, the Node-API traps,
 * and the dual-realm `instanceof` patch, already `createContext`-ed.
 * @param id - the package id (`dyn-<n>`), used as the console tag and filename stem.
 * @param harnessExtras - per-package `harness` verbs beyond the registration pair (`handle`).
 * @returns the contextified sandbox object to pass to {@link evaluateHostCode}.
 */
function createSandbox(id, harnessExtras) {
    if (harnessExtras === void 0) { harnessExtras = {}; }
    var sandbox = __assign(__assign({}, nodeApiTraps()), { console: taggedConsole(id), harness: __assign({ defineTool: guard_ts_1.sandboxDefineTool, registerTool: guard_ts_1.sandboxRegisterTool }, harnessExtras), 
        // Web APIs absent from fresh vm contexts — made available so the model
        // can encode/decode base64 without Buffer (which is also absent). Host
        // closures over Buffer, never Buffer itself.
        btoa: function (s) { return Buffer.from(s, 'utf-8').toString('base64'); }, atob: function (s) { return Buffer.from(s, 'base64').toString('utf-8'); }, TextEncoder: TextEncoder, TextDecoder: TextDecoder });
    (0, node_vm_1.createContext)(sandbox);
    patchDualRealmInstanceof(sandbox);
    return sandbox;
}
/**
 * Cross-realm SyntaxError detection: a compile failure inside `runInContext`
 * constructs its error in the SANDBOX realm, so a host `instanceof
 * SyntaxError` is silently false — the `name` property is the realm-safe tag.
 */
function isSyntaxError(error) {
    return typeof error === 'object' && error !== null && error.name === 'SyntaxError';
}
/**
 * The parse-failure context a vm `SyntaxError` carries: the vm prints the
 * offending source line and a caret before the message, which is exactly what
 * a model needs to self-correct — surface it instead of the bare message.
 * Falls back to `String(error)` when the stack carries no such prelude.
 * @param error - the `SyntaxError` (host- or sandbox-realm) thrown while compiling package code.
 * @returns the stack prefix up to and including the `SyntaxError: …` line.
 */
function syntaxErrorContext(error) {
    var _a;
    var lines = ((_a = error.stack) !== null && _a !== void 0 ? _a : '').split('\n');
    var messageIndex = lines.findIndex(function (line) { return line.startsWith('SyntaxError'); });
    if (messageIndex === -1)
        return String(error);
    return lines.slice(0, messageIndex + 1).join('\n');
}
/**
 * The teaching text one parse failure produces, shared by the define-time
 * precheck and the run-time evaluation so a model reads the same diagnosis
 * whichever verb caught it.
 * @param half - which half failed to parse, named as the define argument that carried it.
 * @param context - the {@link syntaxErrorContext} of the failure.
 * @returns the model-facing error message.
 */
function parseErrorMessage(half, context) {
    var _a;
    // Scope the TypeScript heuristic to the OFFENDING line, not the whole code:
    // an ` as ` inside an ordinary description string must not turn a plain
    // syntax error into a misleading remove-annotations message.
    var offendingLine = (_a = context.split('\n')[1]) !== null && _a !== void 0 ? _a : '';
    if (/\bas\b/.test(offendingLine)) {
        return "dynamic package `".concat(half, "` failed to parse:\n").concat(context, "\n")
            + 'The sandbox runs plain JavaScript, not TypeScript. Remove type annotations:\n'
            + '  ✗ { type: \'text\' as const, text: x }\n'
            + '  ✓ { type: \'text\', text: x }';
    }
    return "dynamic package `".concat(half, "` failed to parse:\n").concat(context, "\n")
        + 'Note: it runs as the BODY of an async function (line numbers are offset by the 1-line wrapper). '
        + 'Check bracket balance — ending the returned plugin object with `});` closes a call that was never opened; '
        + 'a plain `return { … }` ends with `}` (an optional `;`), never `)`.';
}
/**
 * Parse one half's source without running it: the define-time precheck that
 * keeps unparseable code out of the registry, so a model fixes it and defines
 * again instead of discovering the failure at run time. `new Function` is the
 * gate — hosts without a real `node:vm` (the browser worker) still refuse
 * unparseable code — and `vm.Script` is only the best-effort prettifier: on a
 * Node host its failure carries the source-line-and-caret prelude the
 * teaching text builds on, and where the vm is a stub the message stays bare.
 * The two parsers' syntax faces differ at the margin (`new.target` parses in
 * a function body but not at the vm wrapper's top level), an accepted cost of
 * a vm-free gate; and under a page CSP without `'unsafe-eval'`, `new Function`
 * throws `EvalError`, which propagates unwrapped.
 * @param code - the model-written function body.
 * @param half - which define argument carried it, for the error text.
 * @throws when the body does not parse, with the offending line and a teaching hint.
 */
function precheckCode(code, half) {
    var wrapped = "(async () => {\n".concat(code, "\n})()");
    try {
        // Compile-only: constructing the function parses the source and runs nothing.
        // oxlint-disable-next-line typescript/no-implied-eval -- parse gate over model-written code; nothing is invoked
        new Function(wrapped);
    }
    catch (error) {
        if (!isSyntaxError(error))
            throw error;
        throw new Error(parseErrorMessage(half, prettyParseContext(wrapped, half, error)));
    }
}
/**
 * Best-effort vm recompile of a body `new Function` already refused, for the
 * source-line-and-caret prelude only.
 * @param wrapped - the wrapped source that failed to parse.
 * @param half - which define argument carried it, for the vm filename.
 * @param refusal - the gate's own `SyntaxError`, the fallback context source.
 * @returns the vm prelude when a real vm produced one, else the bare refusal.
 */
function prettyParseContext(wrapped, half, refusal) {
    try {
        new node_vm_1.Script(wrapped, { filename: "cordis-dyn-".concat(half, ".js") });
    }
    catch (vmError) {
        if (isSyntaxError(vmError))
            return syntaxErrorContext(vmError);
        // A stubbed vm (the browser worker) refuses Script itself; the gate's
        // error is the only context there is.
    }
    return String(refusal);
}
/**
 * Evaluate a host half as the body of an async function inside the sandbox. `vmTimeoutMs` only
 * bounds the SYNCHRONOUS portion; an async body escapes it — acceptable under the module's
 * trust stance. Parse errors include the offending line and a TypeScript-removal or bracket-
 * balance hint.
 * @param sandbox - the contextified object from {@link createSandbox}.
 * @param code - the model-written function body; must `return` a plugin.
 * @param id - the package id, used as the vm filename (`cordis-dyn-<id>.js`).
 * @param vmTimeoutMs - the synchronous evaluation bound in milliseconds.
 * @returns whatever the code returned, still un-narrowed (the run lifecycle checks plugin shape).
 */
function evaluateHostCode(sandbox, code, id, vmTimeoutMs) {
    return __awaiter(this, void 0, void 0, function () {
        var error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, node_vm_1.runInContext)("(async () => {\n".concat(code, "\n})()"), sandbox, { filename: "cordis-dyn-".concat(id, ".js"), timeout: vmTimeoutMs })];
                case 1: return [2 /*return*/, _a.sent()];
                case 2:
                    error_1 = _a.sent();
                    if (!isSyntaxError(error_1))
                        throw error_1;
                    throw new Error(parseErrorMessage('code.host', syntaxErrorContext(error_1)));
                case 3: return [2 /*return*/];
            }
        });
    });
}
