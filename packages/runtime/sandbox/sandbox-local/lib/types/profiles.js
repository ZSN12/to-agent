"use strict";
/**
 * Internal platform-profile builders for the local sandbox provider.
 *
 * @module @z/dsh-sandbox-local/profiles
 */
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bwrapProfileArgs = bwrapProfileArgs;
exports.seatbeltProfileArgs = seatbeltProfileArgs;
var dsh_sandbox_1 = require("@z/dsh-sandbox");
/**
 * Build the bwrap profile arguments for one file-effect policy.
 * @param policy - file-effect policy to express as bwrap mounts.
 * @returns profile arguments before the trailing separator and command argv.
 */
function bwrapProfileArgs(policy) {
    var args = ['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc', '--die-with-parent'];
    if (policy.mode === 'workspace-write') {
        args.push('--tmpfs', '/tmp');
        args.push('--bind', policy.workspaceRoot, policy.workspaceRoot);
    }
    return args;
}
/** Quote one path as an SBPL string literal. */
function sbplString(path) {
    return "\"".concat(path.replaceAll('\\', String.raw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\\"], ["\\\\"])))).replaceAll('"', String.raw(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\""], ["\\\""])))), "\"");
}
/**
 * Build the sandbox-exec arguments and SBPL profile for one policy. The
 * writable roots come from the shared {@link writableRoots} helper (canonical,
 * deduplicated) so the Seatbelt grant and the in-process fs fence
 * (`@z/dsh-fs-sandbox`) can never drift apart.
 * @param policy - file-effect policy to express as an SBPL profile.
 * @returns sandbox-exec arguments before the trailing separator and command argv.
 */
function seatbeltProfileArgs(policy) {
    var forms = ['(version 1)', '(allow default)', '(deny file-write*)', "(allow file-write* (literal ".concat(sbplString('/dev/null'), "))")];
    var roots = (0, dsh_sandbox_1.writableRoots)(policy);
    if (roots.length > 0) {
        forms.push("(allow file-write* ".concat(roots.map(function (root) { return "(subpath ".concat(sbplString(root), ")"); }).join(' '), ")"));
    }
    return ['-p', forms.join(' ')];
}
var templateObject_1, templateObject_2;
