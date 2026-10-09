"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VCS_DIRECTORIES = void 0;
exports.validateExcludedDirectories = validateExcludedDirectories;
exports.searchExclusionArgs = searchExclusionArgs;
exports.searchScopeGuidance = searchScopeGuidance;
exports.VCS_DIRECTORIES = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'];
/** Deployment exclusions are directory names, not model-controlled globs. */
function validateExcludedDirectories(names) {
    for (var _i = 0, names_1 = names; _i < names_1.length; _i++) {
        var name_1 = names_1[_i];
        if (!/^[\w.-]+$/.test(name_1) || name_1 === '.' || name_1 === '..') {
            throw new Error('tool-fs-search: excludeDirectories entries must be literal directory names');
        }
    }
}
/** Prune during traversal; exclude contents even when the root is inside one. */
function searchExclusionArgs(names, includeExcluded) {
    if (includeExcluded)
        return [];
    return names.flatMap(function (name) { return ["--glob=!**/".concat(name), "--glob=!**/".concat(name, "/**")]; });
}
function searchScopeGuidance(names) {
    return names.length
        ? " Default discovery excludes these dependency/build directories: ".concat(names.join(', '), ". To deliberately inspect them, set includeExcluded=true with a narrow path. Direct file reads are unaffected.")
        : '';
}
