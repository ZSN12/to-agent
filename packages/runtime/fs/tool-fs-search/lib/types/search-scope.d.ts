export declare const VCS_DIRECTORIES: readonly string[];
/** Deployment exclusions are directory names, not model-controlled globs. */
export declare function validateExcludedDirectories(names: readonly string[]): void;
/** Prune during traversal; exclude contents even when the root is inside one. */
export declare function searchExclusionArgs(names: readonly string[], includeExcluded?: boolean): string[];
export declare function searchScopeGuidance(names: readonly string[]): string;
//# sourceMappingURL=search-scope.d.ts.map