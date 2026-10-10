export const VCS_DIRECTORIES = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'];
/** Deployment exclusions are directory names, not model-controlled globs. */
export function validateExcludedDirectories(names) {
    for (const name of names) {
        if (!/^[\w.-]+$/.test(name) || name === '.' || name === '..') {
            throw new Error('tool-fs-search: excludeDirectories entries must be literal directory names');
        }
    }
}
/** Prune during traversal; exclude contents even when the root is inside one. */
export function searchExclusionArgs(names, includeExcluded) {
    if (includeExcluded)
        return [];
    return names.flatMap(name => [`--glob=!**/${name}`, `--glob=!**/${name}/**`]);
}
export function searchScopeGuidance(names) {
    return names.length
        ? ` Default discovery excludes these dependency/build directories: ${names.join(', ')}. To deliberately inspect them, set includeExcluded=true with a narrow path. Direct file reads are unaffected.`
        : '';
}
//# sourceMappingURL=search-scope.js.map