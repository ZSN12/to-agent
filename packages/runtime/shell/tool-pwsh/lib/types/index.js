"use strict";
/**
 * Model-facing PowerShell Consumer of the `ctx.shell` capability seam. Intended for
 * Windows compositions where a PowerShell executor (e.g.
 * `@z/dsh-pwsh-local`) backs `ctx.shell`; the tool contract is
 * PowerShell-dialect: native `C:\...` paths and `$env:NAME` variables.
 *
 * Behavior mirrors `dsh-tool-bash` call-for-call: foreground and
 * `run_in_background` execution (background handles register with the
 * generic `ctx.jobs` runtime), the managed `DSH_*` environment through the
 * shared `shell-env` registry, the per-call sandbox policy resolution (the
 * calling session's mode and cwd travel to the confining executor), the
 * sandbox-denial rendering with the same-turn escalation surface
 * (`sandbox_permissions` + `justification` resolved through
 * `ctx.approval`), and the bash marker/truncation rendering story. UI
 * presentation mirrors the bash tool's too: a completed foreground call is
 * a terminal card with the parsed exit-status pill, using the shared
 * exit-status parse from `@z/dsh-shell`.
 *
 * @module @z/dsh-tool-pwsh
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
var node_path_1 = require("node:path");
var schemastery_1 = require("@z/schemastery");
var dsh_tools_1 = require("@z/dsh-tools");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_sandbox_1 = require("@z/dsh-sandbox");
var dsh_shell_1 = require("@z/dsh-shell");
var background_ts_1 = require("./background.ts");
var render_ts_1 = require("./render.ts");
exports.name = 'tool-pwsh';
exports.inject = ['tools', 'shell', 'systemPrompt', 'shellEnv'];
/** Runtime configuration schema for the pwsh tool plugin. */
exports.Config = schemastery_1.default.object({
    enableRunInBackground: schemastery_1.default.boolean().default(true),
});
/* jscpd:ignore-start -- minimal mirror of dsh-tool-bash's validation and execute plumbing (Agent Note). */
function validatePwshArgs(args) {
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
/* jscpd:ignore-end */
function pwshDescription(backgroundEnabled, escalationModes) {
    var background = backgroundEnabled
        ? 'Set `run_in_background: true` for long-running commands: the call returns a job id immediately; read its output with `job_output` and stop it with `job_kill`.'
        : 'Background execution is not available; long-running commands must finish within the timeout.';
    var base = 'Execute a PowerShell command (`pwsh -Command`) and return its stdout/stderr. '
        + 'Each call runs in a fresh pwsh process: no state (cwd, variables, functions) persists between calls — '
        + 'pass `workdir` instead of using `cd`. Paths use native Windows form (`C:\\...`); read environment '
        + 'variables with `$env:NAME`. Non-zero exits are reported as `[exit code: N]`. '
        + 'Current harness environment facts are exposed through managed `$env:DSH_*` variables; inspect them when needed. '
        + 'Commands may run under a file sandbox; a blocked file operation is reported as `[sandbox: file access denied under <mode> mode]` — a policy denial, not a bug in the command; do not retry another way. '
        + 'Long output is truncated to its tail; the full output is saved to a file whose path is reported when available. '
        + 'On Windows a force-killed command settles as `[exit code: 1]` without a signal marker — treat it as an interruption, not a command failure. '
        + background;
    if (escalationModes.length === 0)
        return base;
    // The language-mode and named-pipe contracts below are Windows-restricted-token
    // behavior, but the gate is 'any confining executor is mounted'
    // (escalationModes non-empty). The conflation is safe today because every
    // shipped composition pairing tool-pwsh with a confining executor is
    // win32-only; a future POSIX pwsh-sandbox composition must gate both
    // sentences on the platform instead (tracked in the pwsh-tool-and-executor
    // Agent Note).
    return base + ' Under the Windows sandbox, read-only pwsh runs in PowerShell ConstrainedLanguage mode, while '
        + 'workspace-write stays in FullLanguage unless host policy says otherwise. In read-only, prefer cmdlets and core types (`[string]`, `[datetime]`, `[regex]`, `[guid]`); '
        + '.NET static calls (`[System.IO.*]::`, `[math]::`), `Add-Type`, COM objects, and reflection fail '
        + 'with "only core types" errors. `-f` formatting, property access, and core cmdlets work. '
        + 'In both confined modes, programs cannot open named pipes, so a command that captures another '
        + 'program\'s output through piped stdio (Node.js `child_process.spawn`/`exec` with the default '
        + '`stdio: \'pipe\'`) fails with EPERM, while `stdio: \'inherit\'` and `stdio: \'ignore\'` spawns '
        + 'work and PowerShell\'s own pipelines are unaffected. That EPERM is the documented boundary: '
        + 'do not retry the command another way — escalate the exact command once or restructure it to '
        + 'avoid capturing output. '
        + 'Attempting a command the sandbox may deny is safe and expected: run it and read the '
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
/**
 * Resolve an explicit workdir first, making a relative one session-workspace-relative;
 * otherwise use the session header cwd and leave executor defaulting as the fallback.
 */
function resolveWorkdir(modelWorkdir, exec) {
    var _a;
    var headerCwd = (_a = exec.agent) === null || _a === void 0 ? void 0 : _a.session.header.cwd;
    if (modelWorkdir === undefined)
        return headerCwd;
    if (headerCwd !== undefined && !(0, node_path_1.isAbsolute)(modelWorkdir)) {
        return (0, node_path_1.resolve)(headerCwd, modelWorkdir);
    }
    return modelWorkdir;
}
/** Detach the executor DTO from readonly Service Definition types into plain JSON data. */
function canonicalPwshResult(result) {
    var output = function (stream) { return (__assign({ text: stream.text, truncated: stream.truncated }, stream.spillPath !== undefined ? { spillPath: stream.spillPath } : {})); };
    return __assign({ kind: 'foreground', exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut, aborted: result.aborted, timeoutMs: result.timeoutMs, 
        /* jscpd:ignore-start -- the canonical projection and background-handle shape mirror dsh-tool-bash's by design (Agent Note). */
        stdout: output(result.stdout), stderr: output(result.stderr) }, result.sandbox !== undefined ? {
        sandbox: __assign(__assign({ mode: result.sandbox.mode, denied: result.sandbox.denied }, result.sandbox.enforcement !== undefined ? { enforcement: result.sandbox.enforcement } : {}), result.sandbox.runnerFailed !== undefined ? { runnerFailed: result.sandbox.runnerFailed } : {}),
    } : {});
}
/** Canonical background-handle properties shared by the pwsh output union. */
var BACKGROUND_OUTPUT_PROPERTIES = {
    kind: { type: 'string', required: true, const: 'background' },
    jobId: { type: 'string', required: true },
};
/* jscpd:ignore-end */
/* jscpd:ignore-start -- deliberate mirror of dsh-tool-bash's apply() preamble (pwsh-tool-and-executor Agent Note). */
function apply(ctx, config) {
    var _a;
    if (config === void 0) { config = {}; }
    var backgroundEnabled = (_a = config.enableRunInBackground) !== null && _a !== void 0 ? _a : true;
    var defaultMode = ctx.shell.sandboxMode;
    var escalationModes = defaultMode === undefined ? [] : dsh_sandbox_1.ESCALATION_TARGETS;
    var sandboxPolicy = defaultMode === undefined ? undefined : ctx.get('sandboxPolicy');
    if (defaultMode !== undefined && sandboxPolicy === undefined) {
        throw new Error('tool-pwsh: the mounted bash executor confines but ctx.sandboxPolicy is missing');
    }
    /* jscpd:ignore-end */
    /** Resolve the complete standing policy for this call when a confining executor is mounted. */
    var resolveSandboxPolicy = function (exec) {
        return sandboxPolicy === null || sandboxPolicy === void 0 ? void 0 : sandboxPolicy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session });
    };
    /* jscpd:ignore-start -- deliberate mirror of dsh-tool-bash's escalation resolver (pwsh-tool-and-executor Agent Note). */
    /**
     * Resolve a sandbox-escalation request through `ctx.approval` BEFORE
     * anything executes, delegating the shared fail-closed sequence (strict
     * widening, channel resolution, outcome mapping) to
     * {@link approveEscalation}. This tool contributes only the composition
     * guard (the fields are unadvertised without a sandboxing executor, yet
     * schema validation checks advertised keys only, so an unadvertised
     * `sandbox_permissions` still reaches execute) and the approval
     * ingredients. The shared policy resolver is required whenever the
     * executor advertises confinement, so a split composition fails at
     * tool-plugin load.
     */
    var approvePwshEscalation = function (mode, justification, exec, standingPolicy) {
        if (escalationModes.length === 0) {
            throw new Error('sandbox_permissions is not available in this composition (no sandboxing executor to escalate)');
        }
        var effectiveMode = standingPolicy.mode;
        return (0, dsh_sandbox_1.approveEscalation)({ requestedMode: mode, justification: justification, effectiveMode: effectiveMode, subject: 'command' }, {
            approver: ctx.get('approval'),
            agent: exec.agent,
            callId: exec.callId,
            toolName: 'pwsh',
            signal: exec.signal,
        });
    };
    /* jscpd:ignore-end */
    ctx.systemPrompt.section({
        name: 'tool:pwsh',
        order: 105,
        text: 'Non-zero exits are reported as `[exit code: N]` markers; investigate failures before moving on. '
            + 'On Windows a killed process settles as `[exit code: 1]` without a signal marker; treat a bare exit 1 after an interruption as a termination, not a command failure.',
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'pwsh',
        description: pwshDescription(backgroundEnabled, escalationModes),
        /* jscpd:ignore-start -- deliberate mirror of dsh-tool-bash's parameter surface (pwsh-tool-and-executor Agent Note). */
        parameters: __assign(__assign({ command: { type: 'string', required: true, description: 'The PowerShell command to execute.' }, description: {
                type: 'string',
                required: true,
                description: 'Clear, concise description of what this command does in active voice, '
                    + '5-10 words (shown in the UI). Examples: "ls" → "List files in current directory"; '
                    + '"git status" → "Show working tree status"; "Get-Process" → "List running processes".',
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
        /* jscpd:ignore-end */
        output: {
            // The foreground result wire shape mirrors dsh-tool-bash's by contract —
            // consumers of one must accept the other (see the pwsh-tool-and-executor
            // Agent Note).
            /* jscpd:ignore-start -- deliberate result-schema symmetry with dsh-tool-bash. */
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
            /* jscpd:ignore-end */
            render: function (_args, value) { return [{
                    type: 'text',
                    text: value.kind === 'background'
                        ? "started background job ".concat(value.jobId)
                        : (0, render_ts_1.renderPwshResult)(value, escalationModes),
                }]; },
        },
        /* jscpd:ignore-start -- the execute path mirrors dsh-tool-bash's by design (see the pwsh-tool-and-executor Agent Note). */
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var standingPolicy, approvedMode, _a, policy, workdir, request, jobs, error, id, result, error;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            validatePwshArgs(args);
                            standingPolicy = resolveSandboxPolicy(exec);
                            if (!(args.sandbox_permissions !== undefined && args.justification !== undefined)) return [3 /*break*/, 2];
                            return [4 /*yield*/, approvePwshEscalation(args.sandbox_permissions, args.justification, exec, standingPolicy)];
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
                            workdir = resolveWorkdir(args.workdir, exec);
                            request = __assign(__assign(__assign(__assign({ command: args.command }, workdir !== undefined ? { workdir: workdir } : {}), args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}), { dshEnv: ctx.shellEnv.collect(exec) }), policy !== undefined ? { sandboxPolicy: policy } : {});
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
                                id = jobs.start(__assign(__assign({ kind: 'pwsh', label: args.command }, exec.agent ? { owner: exec.agent } : {}), { run: function () {
                                        var proc = ctx.shell.start(ctx.shell.resolve(request));
                                        return {
                                            cancel: function () { return void proc.kill(); },
                                            done: proc.done.then(function () { return (0, background_ts_1.processOutcome)(proc); }),
                                            readOutput: function () { return (0, render_ts_1.renderPwshProcessRead)(proc.readOutput(), proc.sandbox, escalationModes); },
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
                            return [2 /*return*/, canonicalPwshResult(result)];
                    }
                });
            });
        },
        /* jscpd:ignore-end */
        /* jscpd:ignore-start -- the background call card mirrors presentBashCall's by design (Agent Note). */
        presentCall: function (args) {
            // Background acknowledgements carry no terminal exit status; the generic
            // card mirrors the bash tool's background presentation.
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
        },
        /* jscpd:ignore-end */
        /* jscpd:ignore-start -- the completed-result presentation mirrors presentBashResult's by design (Agent Note). */
        presentResult: function (args, result) {
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
            var _a = (0, dsh_shell_1.parseExitStatus)(raw), body = _a.body, exit = __rest(_a, ["body"]);
            return __assign({ card: 'terminal', output: body }, exit);
        },
        /* jscpd:ignore-end */
    }));
}
