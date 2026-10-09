"use strict";
/**
 * PATH probe for the native backend's Linux chooser binaries: one boot-time
 * sampled fact for the resolver, so an attended Linux host without
 * zenity/kdialog keeps the working `browse` interaction instead of a backend
 * whose every pick fails.
 * @module @z/dsh-host-directory-picker-auto/probe
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canExecute = canExecute;
exports.hasLinuxChooserBinary = hasLinuxChooserBinary;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
/** The chooser binaries the native backend can drive on Linux (zenity, KDialog fallback). */
var LINUX_CHOOSER_BINARIES = ['zenity', 'kdialog'];
/**
 * Whether the current process may execute the candidate path.
 * @param candidate - absolute or PATH-joined file path.
 * @returns true only for an existing executable file.
 */
function canExecute(candidate) {
    try {
        (0, node_fs_1.accessSync)(candidate, node_fs_1.constants.X_OK);
    }
    catch (_a) {
        // Absent or non-executable candidate — the only signals accessSync(X_OK) emits.
        return false;
    }
    return true;
}
/**
 * Scan a PATH value for one of the native backend's Linux chooser binaries.
 * @param pathValue - the `PATH` environment value (absent or empty scans nothing).
 * @param isExecutable - executability predicate ({@link canExecute} in production; injected for deterministic tests).
 * @returns whether any PATH directory holds an executable chooser binary.
 */
function hasLinuxChooserBinary(pathValue, isExecutable) {
    for (var _i = 0, _a = (pathValue !== null && pathValue !== void 0 ? pathValue : '').split(node_path_1.delimiter); _i < _a.length; _i++) {
        var dir = _a[_i];
        if (dir === '')
            continue;
        for (var _b = 0, LINUX_CHOOSER_BINARIES_1 = LINUX_CHOOSER_BINARIES; _b < LINUX_CHOOSER_BINARIES_1.length; _b++) {
            var name_1 = LINUX_CHOOSER_BINARIES_1[_b];
            if (isExecutable((0, node_path_1.join)(dir, name_1)))
                return true;
        }
    }
    return false;
}
