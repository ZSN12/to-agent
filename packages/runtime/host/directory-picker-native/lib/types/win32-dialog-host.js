"use strict";
/**
 * Real-process half of the Win32 dialog driver: spawn the dialog child
 * process (source or built plane) and close a dialog thread's windows. The
 * module itself loads everywhere (the import chain from native-picker.ts is
 * static); what stays win32-only is koffi, imported dynamically inside the
 * bindings' functions. The driver's logic is tested against fakes of this
 * surface instead.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeThreadWindows = void 0;
exports.spawnDialogWorker = spawnDialogWorker;
var node_child_process_1 = require("node:child_process");
var node_url_1 = require("node:url");
/**
 * Spawn the dialog child process. Built consumers launch the bundled CJS
 * entry next to this module under plain node; unbuilt (source) consumers
 * bootstrap tsx first, mirroring the dsh CLI's source launch. The dialog is
 * the child's first window, so Windows activates it without a foreground
 * call.
 * @param data - the child payload (dialog title).
 * @returns the spawned child process.
 */
function spawnDialogWorker(data) {
    var env = __assign(__assign({}, process.env), { DSH_DIALOG_TITLE: data.title });
    var stdio = ['ignore', 'inherit', 'inherit', 'ipc'];
    /* v8 ignore next 3 -- the built-output arm: tests always run unbuilt (src/) */
    if (!import.meta.url.endsWith('.ts')) {
        return (0, node_child_process_1.spawn)(process.execPath, [(0, node_url_1.fileURLToPath)(new URL('./worker.cjs', import.meta.url))], { env: env, stdio: stdio, windowsHide: true });
    }
    return (0, node_child_process_1.spawn)(process.execPath, ['--import', import.meta.resolve('tsx/esm'), (0, node_url_1.fileURLToPath)(new URL('./win32-dialog-worker.ts', import.meta.url))], { env: env, stdio: stdio, windowsHide: true });
}
var win32_dialog_bindings_ts_1 = require("./win32-dialog-bindings.ts");
Object.defineProperty(exports, "closeThreadWindows", { enumerable: true, get: function () { return win32_dialog_bindings_ts_1.closeThreadWindows; } });
