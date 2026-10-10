/** Package-owned durable workflow-record invariants. @module @taskweaver/dsh-tool-workflow/invariant */
import type { Context } from '@taskweaver/cordis';
/** Cordis companion plugin name. */
export declare const name = "tool-workflow-invariant";
/** Services required to validate existing and newly appended Session logs. */
export declare const inject: string[];
/** Register this package's invariant companion. */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map