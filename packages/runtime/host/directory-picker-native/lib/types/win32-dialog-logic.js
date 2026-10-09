"use strict";
/**
 * Pure sequencing of the Win32 `IFileOpenDialog` folder-picker COM
 * conversation over injectable platform bindings, so every outcome path
 * (selection, cancellation, HRESULT failure, cleanup ordering) is testable on
 * any platform. The koffi-backed bindings live in
 * `win32-dialog-bindings.ts`, which only a real win32 process ever loads.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FOS_NOCHANGEDIR = exports.FOS_FORCEFILESYSTEM = exports.FOS_PICKFOLDERS = exports.HRESULT_CANCELLED = void 0;
exports.runFolderDialog = runFolderDialog;
/** `HRESULT_FROM_WIN32(ERROR_CANCELLED)`: the user dismissed the dialog. */
exports.HRESULT_CANCELLED = 0x800704c7 | 0;
/** `FOS_PICKFOLDERS`: the dialog selects directories, not files. */
exports.FOS_PICKFOLDERS = 0x20;
/** `FOS_FORCEFILESYSTEM`: only results with a filesystem path can be chosen. */
exports.FOS_FORCEFILESYSTEM = 0x40;
/** `FOS_NOCHANGEDIR`: never mutate the process working directory. */
exports.FOS_NOCHANGEDIR = 0x8;
/**
 * Throw when an HRESULT signals failure.
 * @param hr - the HRESULT to check.
 * @param what - the failing call's name for the error message.
 * @returns the (successful) HRESULT unchanged.
 */
function check(hr, what) {
    if (hr < 0)
        throw new Error("".concat(what, " failed: HRESULT 0x").concat((hr >>> 0).toString(16)));
    return hr;
}
/**
 * Run one modal folder-picker conversation on the calling thread: DPI opt-in,
 * STA init, dialog creation, `Show`, and result extraction, releasing the
 * dialog on every path.
 * @param bindings - the native surface (koffi-backed in production, fakes in tests).
 * @param title - the dialog title text.
 * @param onShowing - called with the native thread id immediately before the
 *   blocking `Show`, so a driver on another thread can close the dialog.
 * @returns the selected filesystem path, or null when the user cancels.
 */
function runFolderDialog(bindings, title, onShowing) {
    bindings.setThreadDpiAwareness();
    check(bindings.coInitializeSta(), 'CoInitializeEx');
    // From here the apartment is initialized (S_OK or S_FALSE) and must be
    // uninitialized exactly once on every path.
    try {
        var dialog = bindings.createFolderDialog();
        try {
            check(dialog.setOptions(exports.FOS_PICKFOLDERS | exports.FOS_FORCEFILESYSTEM | exports.FOS_NOCHANGEDIR), 'SetOptions');
            check(dialog.setTitle(title), 'SetTitle');
            onShowing(bindings.currentThreadId());
            var shown = dialog.show();
            if (shown === exports.HRESULT_CANCELLED)
                return null;
            check(shown, 'Show');
            var result = dialog.resultPath();
            check(result.hr, 'GetResult');
            return result.path;
        }
        finally {
            dialog.release();
        }
    }
    finally {
        bindings.coUninitialize();
    }
}
