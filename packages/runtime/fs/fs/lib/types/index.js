/**
 * Filesystem Service Definition for one execution world. Backends own stable target
 * identity, process paths and file URIs, containment, text reads, decoding,
 * binary rejection, and atomic mutations. Read windows and
 * observed-state policy stay in consumer and policy plugins; `editText`
 * remains here so version check, literal match, and rewrite share one critical
 * section.
 * @module @taskweaver/dsh-fs
 */
import { Service } from '@taskweaver/cordis';
import { FsError } from "./types.js";
export { FsError, FsTargetKey, FsVersion, } from "./types.js";
/**
 * Abstract filesystem provider. Targets must preserve identity across aliases;
 * reads expose regular UTF-8 text or typed errors, listings are stable and
 * content-free, and single-file mutations are atomic. Batch text mutation is a
 * separate optional capability: providers must either provide rollback-capable
 * semantics or fail with FS_TRANSACTION_UNSUPPORTED. The local provider locks
 * targets within one process, validates and stages every member before publish,
 * and compensates completed publishes after an error. Ordinary filesystems do
 * not provide multi-path visibility atomicity; external processes can observe
 * intermediate publishes, and external concurrent writes can make rollback
 * incomplete. Callers must not advertise this as a crash-safe or cross-process
 * transaction.
 */
export class FileSystem extends Service {
    constructor(ctx) {
        super(ctx, 'fs');
    }
    /**
     * The sandbox mode this backend enforces on mutations BY DEFAULT, or
     * `undefined` when it does not confine at all — the capability fact the tool
     * layer reads to advertise the escalation fields honestly (mirrors
     * `ShellExecutor.sandboxMode`). The base class and the bare local backend
     * report `undefined`; a sandboxing backend (`@taskweaver/dsh-fs-sandbox`)
     * overrides it with the deployment default. A session override may make the
     * effective mode narrower or wider, so strict escalation widening is checked
     * per call rather than encoded in this default-relative fact.
     * @returns the configured default mode of a sandboxing backend; `undefined`
     *   for a backend that never confines.
     */
    get sandboxMode() {
        return undefined;
    }
    /**
     * Apply a version-guarded batch of full-text creates/replacements. Every
     * target must be validated and permission-checked before the provider begins
     * publishing any member. Unsupported providers fail closed. Implementations
     * may serialize calls inside their own process and compensate completed
     * members after a failure, but must document weaker storage guarantees and
     * never claim multi-path visibility atomicity unless the underlying host can
     * actually provide it.
     *
     * @param mutations - unique targets and mandatory create/stale guards.
     * @param signal - cancellation is honored before publication begins; once a
     *   provider starts publishing, it must finish or compensate rather than
     *   stop midway.
     * @param sandboxPolicy - per-call mode and workspace root for sandboxed
     *   implementations; the bare provider ignores it.
     * @returns one outcome per mutation, in input order, only after all members
     *   have been published and verified.
     */
    async applyTextTransaction(_mutations, _signal, _sandboxPolicy) {
        throw new FsError('filesystem provider does not support rollback-capable text batches', 'FS_TRANSACTION_UNSUPPORTED');
    }
}
export default FileSystem;
//# sourceMappingURL=index.js.map