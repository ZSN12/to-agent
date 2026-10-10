/**
 * TaskWeaver / pnpm-deploy runtime layout: dependencies live in `runtime-packages/`.
 * @module @taskweaver/dsh/deploy-layout
 */
export declare const RUNTIME_PACKAGES_DIR = "runtime-packages";
/** Ensure `<runtime-root>/node_modules` resolves the deploy closure when present. */
export declare function ensureDeployNodeModules(runtimeRoot: string): void;
/**
 * TaskWeaver ≤0.1 wrote `authorization` into `$TASKWEAVER_HOME/cordis.patch.yml`. The
 * TaskWeaver bundle now owns that row — drop the legacy home overlay before Cordis loads.
 */
export declare function migrateLegacyTaskWeaverHomePatch(): void;
//# sourceMappingURL=deploy-layout.d.ts.map