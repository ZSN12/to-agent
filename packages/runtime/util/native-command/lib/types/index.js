"use strict";
/**
 * Shared no-shell `execFile` runner for host-native OS integrations (the
 * native directory chooser, the open-with-default-application hand-off):
 * utf8 stdio capture, abort propagation, Windows console hide. A library,
 * not a plugin — no ctx, no state, no events.
 * @module @z/dsh-native-command
 */
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
exports.runNativeCommand = void 0;
var node_child_process_1 = require("node:child_process");
/**
 * Run a host command with utf8 stdio, abort propagation, and Windows hide.
 * @param command - executable path or PATH name.
 * @param args - argv (never a shell string).
 * @param signal - caller/connection lifetime; abort terminates the child.
 * @returns captured stdout/stderr on exit 0.
 */
var runNativeCommand = function (command, args, signal) {
    return new Promise(function (resolve, reject) {
        (0, node_child_process_1.execFile)(command, __spreadArray([], args, true), { encoding: 'utf8', signal: signal, windowsHide: true }, function (error, stdout, stderr) {
            if (error !== null) {
                var failure = Object.assign(new Error(error.message, { cause: error }), {
                    code: error.code,
                    stdout: stdout,
                    stderr: stderr,
                });
                reject(failure);
                return;
            }
            resolve({ stdout: stdout, stderr: stderr });
        });
    });
};
exports.runNativeCommand = runNativeCommand;
