"use strict";
/**
 * Model-facing result rendering for the pwsh tool — the PowerShell twin of
 * `dsh-tool-bash`'s renderer: stdout, a marked stderr section, sandbox
 * denial/runner-failure markers (with the same-turn escalation hint), and
 * truncation notices with spill paths, then exit-status markers. Non-zero
 * exits are reported, not errored — the model decides how to react; only
 * infrastructure failures (spawn errors, aborts) surface as isError
 * results.
 *
 * @module @z/dsh-tool-pwsh/render
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPwshResult = renderPwshResult;
exports.renderPwshProcessRead = renderPwshProcessRead;
var dsh_sandbox_1 = require("@z/dsh-sandbox");
/* jscpd:ignore-start -- deliberate twin of dsh-tool-bash/render.ts (Agent Note). */
/** Append the truncation notice (with the full-output spill path) to a stream's text. */
function streamText(output) {
    var _a;
    if (!output.truncated)
        return output.text;
    return "".concat(output.text, "\n[output truncated; full output: ").concat((_a = output.spillPath) !== null && _a !== void 0 ? _a : '(unavailable)', "]");
}
/**
 * Shape one finished run into the text the model sees: stdout, then a marked
 * stderr section, then exit-status markers, matching the bash tool's story —
 * a clean exit (0, no signal) produces no marker.
 * @param result - the completed foreground run from the executor.
 * @param escalationModes - the escalation targets this composition advertises;
 *   non-empty adds the same-turn escalation hint after a denial marker
 *   (default `[]`: no hint).
 * @returns the model-facing text: output body (or `(no output)`), then any timeout/signal/exit markers, each on its own line.
 */
function renderPwshResult(result, escalationModes) {
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
    // A command may trap the termination and exit 0 after timeout; still report interruption.
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
 * spill paths) when in-memory truncation dropped unread bytes.
 * @param read - one incremental read from the process handle.
 * @param sandbox - settled sandbox facts, when this was a confined process.
 * @param escalationModes - escalation targets advertised by this composition.
 * @returns the delta text with any loss or sandbox notice appended.
 */
function renderPwshProcessRead(read, sandbox, escalationModes) {
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
/* jscpd:ignore-end */
