"use strict";
/**
 * Canonical directory-boundary checks for the Windows ACL workspace and
 * private-temp capabilities.
 * @module @z/dsh-sandbox-windows-acl/path-boundary
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertTempRootOutsideWorkspace = assertTempRootOutsideWorkspace;
exports.assertPrivateTempDisjoint = assertPrivateTempDisjoint;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
/** Whether `root` is the same canonical directory as `candidate` or contains it. */
function containsDirectory(root, candidate) {
    var relation = (0, node_path_1.relative)(node_fs_1.realpathSync.native(root), node_fs_1.realpathSync.native(candidate));
    return relation === '' || (!(0, node_path_1.isAbsolute)(relation) && relation !== '..' && !relation.startsWith("..".concat(node_path_1.sep)));
}
/**
 * Reject a temp parent that is inside the workspace: every child created
 * below it would inherit the standing workspace capability.
 * @param workspaceRoot - the canonical workspace root that receives the standing ACE.
 * @param tempRoot - the existing parent beneath which a private temp child would be created.
 */
function assertTempRootOutsideWorkspace(workspaceRoot, tempRoot) {
    if (containsDirectory(workspaceRoot, tempRoot)) {
        throw new Error("Windows ACL temp root must be outside the workspace: workspace=".concat(workspaceRoot, "; temp=").concat(tempRoot));
    }
}
/**
 * Reject overlap between an actual private temp directory and any writable
 * directory: either inheritance direction would merge the two capabilities.
 * @param writableDirs - directories carrying the standing workspace capability.
 * @param tempDir - the existing directory carrying the revocable temp capability.
 */
function assertPrivateTempDisjoint(writableDirs, tempDir) {
    for (var _i = 0, writableDirs_1 = writableDirs; _i < writableDirs_1.length; _i++) {
        var writableDir = writableDirs_1[_i];
        if (containsDirectory(writableDir, tempDir) || containsDirectory(tempDir, writableDir)) {
            throw new Error("AclSandbox private temp directory must be disjoint from writable directories: writable=".concat(writableDir, "; temp=").concat(tempDir));
        }
    }
}
