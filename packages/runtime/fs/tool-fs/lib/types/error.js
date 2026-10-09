"use strict";
/**
 * Model-facing remediation for guarded-mutation failures. The provider's
 * `FS_STALE_VERSION` and `FS_NOT_OBSERVED` messages state the condition but
 * not the only correct recovery (re-read / read the file), so this package
 * appends the remedy at the model boundary; provider messages stay
 * machine-oriented and unchanged.
 * @module @z/dsh-tool-fs/src/error
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.remediateFsError = remediateFsError;
var dsh_fs_1 = require("@z/dsh-fs");
/** The remedy appended to each remediable failure code's message. */
var REMEDIES = {
    FS_STALE_VERSION: 're-read the file, then retry',
    FS_NOT_OBSERVED: 'read the file, then retry',
};
/**
 * Append the correct recovery instruction to a guarded-mutation failure's
 * message. `FS_STALE_VERSION` (the file changed since this session's last
 * observation, including a missing target) recovers only by re-reading;
 * `FS_NOT_OBSERVED` (no prior read by this session) by reading. The `FsError`
 * code is preserved so retry/permission/UI layers keep routing on it, and the
 * original error chains as `cause`. Anything else passes through untouched.
 * @param error - the caught value from a write/edit execution.
 * @returns a remediated `FsError` for the two guarded-mutation codes, else the original value.
 */
function remediateFsError(error) {
    if (!(error instanceof dsh_fs_1.FsError))
        return error;
    var remedy = REMEDIES[error.code];
    if (!remedy)
        return error;
    return new dsh_fs_1.FsError("".concat(error.message, " \u2014 ").concat(remedy), error.code, { cause: error });
}
