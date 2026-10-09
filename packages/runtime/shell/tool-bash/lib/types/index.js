"use strict";
/**
 * Model-facing Consumer of the `ctx.shell` capability seam. Background calls
 * register process handles with `ctx.jobs`; their work uses job cancellation
 * rather than the tool-call signal after an id is returned.
 *
 * TODO(permissions): deployment policy belongs in `tools/pre-execute` and
 * sandboxing executors; see docs/architecture.md § Where new behavior goes.
 * @module @z/dsh-tool-bash
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var node_path_1 = require("node:path");
var dsh_tools_1 = require("@z/dsh-tools");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_sandbox_1 = require("@z/dsh-sandbox");
var dsh_shell_1 = require("@z/dsh-shell");
var background_ts_1 = require("./background.ts");
var render_ts_1 = require("./render.ts");
exports.name = 'tool-bash';
exports.inject = ['tools', 'shell', 'systemPrompt', 'shellEnv'];
/** Runtime configuration schema for the bash tool plugin. */
exports.Config = schemastery_1.default.object({
    enableRunInBackground: schemastery_1.default.boolean().default(true),
});
function validateBashArgs(args) {
    if (args.command.trim().length === 0) {
        throw new Error('invalid command: expected a non-empty string');
    }
    if (args.description.trim().length === 0) {
        throw new Error('invalid description: expected a non-empty string');
    }
    if (args.timeoutMs !== undefined && (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0)) {
        throw new Error("invalid timeoutMs: expected a positive number, got ".concat(JSON.stringify(args.timeoutMs)));
    }
    // The escalation pairing (sandbox_permissions ⇔ justification, non-empty) is
    // the shared rule both enforcing families validate identically.
    (0, dsh_sandbox_1.validateEscalationArgs)(args.sandbox_permissions, args.justification);
}
function bashDescription(backgroundEnabled, escalationModes) {
    var background = backgroundEnabled
        ? 'Set `run_in_background: true` for long-running commands: the call returns a job id immediately; read its output with `job_output` and stop it with `job_kill`.'
        : 'Background execution is not available; long-running commands must finish within the timeout.';
    var base = 'Execute a bash command (`bash -c`) and return its stdout/stderr. '
        + 'Each call runs in a fresh shell: no state (cwd, variables, functions) persists between calls — '
        + 'pass `workdir` instead of using `cd`. Non-zero exits are reported as `[exit code: N]`. '
        + "Current harness environment facts are exposed through managed `$".concat(dsh_shell_1.DSH_ENV_PREFIX, "*` variables; inspect them when needed. ")
        + 'Commands may run under a file sandbox; a blocked file operation is reported as `[sandbox: file access denied under <mode> mode]` — a policy denial, not a bug in the command; do not retry another way. '
        + 'Long output is truncated to its tail; the full output is saved to a file whose path is reported when available. '
        + background;
    if (escalationModes.length === 0)
        return base;
    return base + ' Attempting a command the sandbox may deny is safe and expected: run it and read the '
        + 'marker rather than assuming the denial. When a command is denied and a wider mode would let it '
        + 'succeed, escalate immediately in the same turn — the one sanctioned exception to a denial: retry '
        + 'the exact same command once with `sandbox_permissions` (the narrowest wider mode that suffices) '
        + 'plus a one-sentence `justification`. Do not detour through chat to ask permission first — the '
        + 'approval prompt raised by that retry is how the user consents. If the session states approval '
        + 'prompts are disabled, there is no exception: a denial is final — do not set `sandbox_permissions`. '
        + 'Never escalate speculatively: ground the request in a real denial — normally the one this command '
        + 'just hit; escalating up front is fine only when this session already denied the same access. '
        + 'A rejected escalation is final for that command — stop and explain, never work around '
        + 'it — but it does not forbid attempting or escalating other commands later.';
}
function presentBashCall(args) {
    if (args.run_in_background === true) {
        return {
            card: 'generic',
            title: args.command,
            kind: 'execute',
            rawInput: args.command,
            content: [{ type: 'text', text: args.description }],
        };
    }
    return __assign({ card: 'terminal', title: args.command, description: args.description }, args.workdir !== undefined ? { cwd: args.workdir } : {});
}
/**
 * Present completed foreground output as a terminal; background acknowledgements
 * and execution errors use generic fenced output without an exit-status pill.
 */
function presentBashResult(args, result) {
    var block = result.content.length === 1 ? result.content[0] : undefined;
    if (block === undefined || block.type !== 'text')
        return undefined;
    var raw = block.text;
    var isBackground = typeof args === 'object' && args !== null && args.run_in_background === true;
    // Background acknowledgements and errors have no terminal exit status.
    if (isBackground || result.isError) {
        return { card: 'generic', content: [{ type: 'text', text: "```console\n".concat(raw.replace(/\n+$/, ''), "\n```") }] };
    }
    // The exit marker becomes the card's exit pill, so it leaves the output body.
    var _a = (0, render_ts_1.parseExitStatus)(raw), body = _a.body, exit = __rest(_a, ["body"]);
    return __assign({ card: 'terminal', output: body }, exit);
}
/**
 * Resolve an explicit workdir first, making a relative one session-workspace-relative;
 * otherwise use the filesystem identity of the session cwd and leave executor
 * defaulting as the fallback. A resolved sandbox-policy root wins so workdir
 * and confinement use the exact same per-call identity.
 */
function resolveWorkdir(modelWorkdir, exec, policyWorkspaceRoot) {
    var _a;
    var headerCwd = (_a = exec.agent) === null || _a === void 0 ? void 0 : _a.session.header.cwd;
    var sessionCwd = policyWorkspaceRoot !== null && policyWorkspaceRoot !== void 0 ? policyWorkspaceRoot : (headerCwd === undefined ? undefined : (0, dsh_sandbox_1.canonicalPath)(headerCwd));
    if (modelWorkdir === undefined)
        return sessionCwd;
    if (sessionCwd !== undefined && !(0, node_path_1.isAbsolute)(modelWorkdir)) {
        return (0, node_path_1.resolve)(sessionCwd, modelWorkdir);
    }
    return modelWorkdir;
}
/** Detach the executor DTO from readonly Service Definition types into plain JSON data. */
function canonicalBashResult(result) {
    var output = function (stream) { return (__assign({ text: stream.text, truncated: stream.truncated }, stream.spillPath !== undefined ? { spillPath: stream.spillPath } : {})); };
    return __assign({ exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut, aborted: result.aborted, timeoutMs: result.timeoutMs, stdout: output(result.stdout), stderr: output(result.stderr) }, result.sandbox !== undefined ? {
        sandbox: __assign(__assign({ mode: result.sandbox.mode, denied: result.sandbox.denied }, result.sandbox.enforcement !== undefined ? { enforcement: result.sandbox.enforcement } : {}), result.sandbox.runnerFailed !== undefined ? { runnerFailed: result.sandbox.runnerFailed } : {}),
    } : {});
}
/** Canonical background-handle properties shared by the bash output union. */
var BACKGROUND_OUTPUT_PROPERTIES = {
    kind: { type: 'string', required: true, const: 'background' },
    jobId: { type: 'string', required: true },
};
function apply(ctx, config) {
    var _a;
    if (config === void 0) { config = {}; }
    var backgroundEnabled = (_a = config.enableRunInBackground) !== null && _a !== void 0 ? _a : true;
    var defaultMode = ctx.shell.sandboxMode;
    var escalationModes = defaultMode === undefined ? [] : dsh_sandbox_1.ESCALATION_TARGETS;
    var sandboxPolicy = defaultMode === undefined ? undefined : ctx.get('sandboxPolicy');
    if (defaultMode !== undefined && sandboxPolicy === undefined) {
        throw new Error('tool-bash: the mounted bash executor confines but ctx.sandboxPolicy is missing');
    }
    /** Resolve the complete standing policy for this call when a confining executor is mounted. */
    var resolveSandboxPolicy = function (exec) {
        return sandboxPolicy === null || sandboxPolicy === void 0 ? void 0 : sandboxPolicy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session });
    };
    /**
     * Resolve a sandbox-escalation request through `ctx.approval` BEFORE
     * anything executes, delegating the shared fail-closed sequence (strict
     * widening, channel resolution, outcome mapping) to
     * {@link approveEscalation}. This tool contributes only the composition
     * guard (the fields are unadvertised without a sandboxing executor, yet
     * schema validation checks advertised keys only, so an unadvertised
     * `sandbox_permissions` still reaches execute) and the approval
     * ingredients. The shared policy resolver is required whenever the executor
     * advertises confinement, so a split composition fails at tool-plugin load.
     */
    var approveBashEscalation = function (mode, justification, exec, standingPolicy) {
        if (escalationModes.length === 0) {
            throw new Error('sandbox_permissions is not available in this composition (no sandboxing executor to escalate)');
        }
        var effectiveMode = standingPolicy.mode;
        return (0, dsh_sandbox_1.approveEscalation)({ requestedMode: mode, justification: justification, effectiveMode: effectiveMode, subject: 'command' }, {
            approver: ctx.get('approval'),
            agent: exec.agent,
            callId: exec.callId,
            toolName: 'bash',
            signal: exec.signal,
        });
    };
    // Cross-call guidance belongs in the prompt rather than one-call schema prose.
    ctx.systemPrompt.section({
        name: 'tool:bash',
        order: 105,
        text: 'Check the [exit code: N] marker on every bash result; investigate failures before moving on.',
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'bash',
        description: bashDescription(backgroundEnabled, escalationModes),
        parameters: __assign(__assign({ command: { type: 'string', required: true, description: 'The bash command to execute.' }, description: {
                type: 'string',
                required: true,
                description: 'Clear, concise description of what this command does in active voice, '
                    + '5-10 words (shown in the UI). Examples: "ls" → "List files in current directory"; '
                    + '"git status" → "Show working tree status"; "npm install" → "Install package dependencies".',
            }, timeoutMs: { type: 'number', description: 'Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry.' }, workdir: { type: 'string', description: 'Working directory for this command. Defaults to the session workspace; a relative path is resolved against it.' } }, backgroundEnabled ? {
            run_in_background: { type: 'boolean', description: 'Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies.' },
        } : {}), escalationModes.length > 0 ? {
            sandbox_permissions: {
                type: 'string',
                enum: __spreadArray([], escalationModes, true),
                description: 'The wider sandbox mode this command needs. Only valid as a one-shot retry of a command the sandbox just denied; requires justification and user approval.',
            },
            justification: {
                type: 'string',
                description: 'Required with sandbox_permissions: one sentence for the user explaining why this exact command needs the wider access.',
            },
        } : {}),
        output: {
            schema: {
                oneOf: [
                    {
                        type: 'object',
                        additionalProperties: false,
                        properties: BACKGROUND_OUTPUT_PROPERTIES,
                    },
                    {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            kind: { type: 'string', required: true, const: 'foreground' },
                            exitCode: { required: true, oneOf: [{ type: 'integer' }, { type: 'null' }] },
                            signal: { required: true, oneOf: [{ type: 'string' }, { type: 'null' }] },
                            timedOut: { type: 'boolean', required: true },
                            aborted: { type: 'boolean', required: true },
                            timeoutMs: { type: 'number', required: true },
                            stdout: {
                                type: 'object',
                                additionalProperties: false,
                                required: true,
                                properties: {
                                    text: { type: 'string', required: true },
                                    truncated: { type: 'boolean', required: true },
                                    spillPath: { type: 'string' },
                                },
                            },
                            stderr: {
                                type: 'object',
                                additionalProperties: false,
                                required: true,
                                properties: {
                                    text: { type: 'string', required: true },
                                    truncated: { type: 'boolean', required: true },
                                    spillPath: { type: 'string' },
                                },
                            },
                            sandbox: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    mode: { type: 'string', required: true },
                                    denied: { type: 'boolean', required: true },
                                    enforcement: { type: 'string' },
                                    runnerFailed: { type: 'boolean' },
                                },
                            },
                        },
                    },
                ],
            },
            render: function (_args, value) { return [{
                    type: 'text',
                    text: value.kind === 'background'
                        ? "started background job ".concat(value.jobId)
                        : (0, render_ts_1.renderResult)(value, escalationModes),
                }]; },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var standingPolicy, approvedMode, _a, policy, workdir, dshEnv, request, jobs, error, id, result, error;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            validateBashArgs(args);
                            standingPolicy = resolveSandboxPolicy(exec);
                            if (!(args.sandbox_permissions !== undefined && args.justification !== undefined)) return [3 /*break*/, 2];
                            return [4 /*yield*/, approveBashEscalation(args.sandbox_permissions, args.justification, exec, standingPolicy)];
                        case 1:
                            _a = _b.sent();
                            return [3 /*break*/, 3];
                        case 2:
                            _a = undefined;
                            _b.label = 3;
                        case 3:
                            approvedMode = _a;
                            policy = approvedMode === undefined
                                ? standingPolicy
                                : __assign(__assign({}, standingPolicy), { mode: approvedMode });
                            workdir = resolveWorkdir(args.workdir, exec, standingPolicy === null || standingPolicy === void 0 ? void 0 : standingPolicy.workspaceRoot);
                            dshEnv = ctx.shellEnv.collect(exec);
                            request = __assign(__assign(__assign(__assign({ command: args.command }, workdir !== undefined ? { workdir: workdir } : {}), args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}), { dshEnv: dshEnv }), policy !== undefined ? { sandboxPolicy: policy } : {});
                            if (args.run_in_background === true) {
                                // Undeclared keys are allowed, so schema omission also needs enforcement.
                                if (!backgroundEnabled) {
                                    throw new Error('run_in_background is disabled for this deployment (enableRunInBackground: false)');
                                }
                                jobs = ctx.get('jobs');
                                if (jobs === undefined) {
                                    throw new Error('background jobs unavailable: load @z/dsh-jobs and @z/dsh-tool-jobs');
                                }
                                // The caller owns cancellation until ctx.jobs commits detached ownership.
                                if (exec.signal.aborted) {
                                    error = new dsh_llm_1.HarnessError('tool call aborted', dsh_tools_1.TOOL_ABORTED);
                                    error.name = 'AbortError';
                                    throw error;
                                }
                                id = jobs.start(__assign(__assign({ kind: 'bash', label: args.command }, exec.agent ? { owner: exec.agent } : {}), { run: function () {
                                        var proc = ctx.shell.start(ctx.shell.resolve(request));
                                        return {
                                            cancel: function () { return void proc.kill(); },
                                            done: proc.done.then(function () { return (0, background_ts_1.processOutcome)(proc); }),
                                            readOutput: function () { return (0, render_ts_1.renderProcessRead)(proc.readOutput(), proc.sandbox, escalationModes); },
                                        };
                                    } }));
                                return [2 /*return*/, { kind: 'background', jobId: id }];
                            }
                            return [4 /*yield*/, ctx.shell.run(ctx.shell.resolve(__assign(__assign({}, request), { signal: exec.signal })))];
                        case 4:
                            result = _b.sent();
                            if (result.aborted) {
                                error = new dsh_llm_1.HarnessError('tool call aborted', dsh_tools_1.TOOL_ABORTED);
                                error.name = 'AbortError';
                                throw error;
                            }
                            return [2 /*return*/, __assign({ kind: 'foreground' }, canonicalBashResult(result))];
                    }
                });
            });
        },
        presentCall: presentBashCall,
        presentResult: presentBashResult,
    }));
}
