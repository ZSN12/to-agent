"use strict";
/**
 * Model-facing result rendering for the bash tool.
 *
 * @module @z/dsh-tool-bash/render
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExitStatus = void 0;
exports.renderResult = renderResult;
exports.renderProcessRead = renderProcessRead;
var dsh_sandbox_1 = require("@z/dsh-sandbox");
/** Append the truncation notice (with the full-output spill path) to a stream's text. */
function streamText(output) {
    var _a;
    if (!output.truncated)
        return output.text;
    return "".concat(output.text, "\n[output truncated; full output: ").concat((_a = output.spillPath) !== null && _a !== void 0 ? _a : '(unavailable)', "]");
}
/**
 * Shape one finished run into the text the model sees: stdout, then a marked
 * stderr section, then exit-status markers. Non-zero exits are reported, not
 * errored — the model decides how to react; only infrastructure failures
 * (spawn errors, aborts) surface as isError results.
 * @param result - the completed foreground run from the executor.
 * @param escalationModes - the escalation targets this composition advertises;
 *   non-empty adds the same-turn escalation hint after a denial marker
 *   (default `[]`: no hint).
 * @returns the model-facing text: output body (or `(no output)`), then any timeout/signal/exit markers, each on its own line.
 */
function renderResult(result, escalationModes) {
    var _a;
    if (escalationModes === void 0) { escalationModes = []; }
    var out = streamText(result.stdout);
    var err = streamText(result.stderr);
    var body = out;
    if (err.length > 0) {
        // Single newline between sections (stdout usually ends with one already).
        if (body.length > 0 && !body.endsWith('\n'))
            body += '\n';
        body += "[stderr]\n".concat(err);
    }
    if (body.length === 0)
        body = '(no output)';
    var markers = [];
    // Keep the exit marker last because parseExitStatus anchors there.
    if ((_a = result.sandbox) === null || _a === void 0 ? void 0 : _a.denied) {
        markers.push((0, dsh_sandbox_1.sandboxDenialMarker)(result.sandbox.mode));
        // Hint only when the composition exposes escalation, before the final exit marker.
        if (escalationModes.length > 0) {
            markers.push((0, dsh_sandbox_1.escalationHintMarker)('command'));
        }
    }
    // A command may trap SIGTERM and exit 0 after timeout; still report interruption.
    if (result.timedOut)
        markers.push("[timed out after ".concat(result.timeoutMs, "ms]"));
    if (result.signal !== null) {
        markers.push("[killed by signal: ".concat(result.signal, "]"));
    }
    else if (result.exitCode !== 0) {
        markers.push("[exit code: ".concat(result.exitCode, "]"));
    }
    if (markers.length === 0)
        return body;
    if (!body.endsWith('\n'))
        body += '\n';
    return body + markers.join('\n');
}
/**
 * Shape one background-process read into the `job_output` delta the model
 * sees: the incremental delta, plus the lossy-read notice (with full-stream
 * spill paths) when in-memory truncation dropped unread bytes. Empty-delta
 * rendering (`(no new output)`) is the generic job controller's job.
 * @param read - one incremental read from the process handle.
 * @param sandbox - settled sandbox facts, when this was a confined process.
 * @param escalationModes - escalation targets advertised by this composition.
 * @returns the delta text with any loss or sandbox notice appended.
 */
function renderProcessRead(read, sandbox, escalationModes) {
    if (escalationModes === void 0) { escalationModes = []; }
    var notices = [];
    if (read.lossy) {
        var paths = [read.stdoutSpillPath, read.stderrSpillPath].filter(function (path) { return path !== undefined; });
        notices.push("[some output was dropped from memory; full output: ".concat(paths.length > 0 ? paths.join(', ') : '(unavailable)', "]"));
    }
    if (sandbox === null || sandbox === void 0 ? void 0 : sandbox.runnerFailed) {
        notices.push("[sandbox: the sandbox runner itself failed under ".concat(sandbox.mode, " mode \u2014 the command did not run; this is a sandbox problem, not a command failure]"));
    }
    else if (sandbox === null || sandbox === void 0 ? void 0 : sandbox.denied) {
        notices.push((0, dsh_sandbox_1.sandboxDenialMarker)(sandbox.mode));
        if (escalationModes.length > 0) {
            notices.push((0, dsh_sandbox_1.escalationHintMarker)('command'));
        }
    }
    if (notices.length === 0)
        return read.delta;
    return "".concat(read.delta).concat(read.delta.length > 0 && !read.delta.endsWith('\n') ? '\n' : '').concat(notices.join('\n'));
}
/**
 * The exit-status parse is the shared marker-contract half of the shell-tool
 * rendering story, owned by `@z/dsh-shell` so `dsh-tool-pwsh` reuses
 * it (its renderer emits the same markers). Re-exported here to keep
 * `../src/render.ts` a single import root for bash-tool consumers.
 */
var dsh_shell_1 = require("@z/dsh-shell");
Object.defineProperty(exports, "parseExitStatus", { enumerable: true, get: function () { return dsh_shell_1.parseExitStatus; } });
