"use strict";
/**
 * Event-only filesystem observation policy; it registers no service. A weak owner/target map
 * records every authoritative presence/absence observation, single-slot intent listeners derive
 * guards from that state, and the provider performs the atomic freshness/no-clobber check. Without
 * this plugin, tools retain the bare provider's unconditional mutation behavior. See the package
 * README for composition rules.
 * @module @z/dsh-fs-observation-policy
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.name = void 0;
exports.apply = apply;
var dsh_fs_1 = require("@z/dsh-fs");
/**
 * Per-context observed-file state and the three `fs/*` decisions over it. One
 * instance is created per `apply()` so disposal can drop all state for HMR.
 */
var ObservedStateGate = /** @class */ (function () {
    function ObservedStateGate() {
        /**
         * Observed-file state, keyed first by the owner object (weakly held, so a
         * collected session frees its state), then by {@link FsTarget.targetKey}. An
         * entry's presence is the prior-observation record; its discriminant keeps
         * confirmed absence distinct from an unseen target.
         */
        this.observed = new WeakMap();
    }
    /**
     * Derive the observed-state owner from the opaque event actor — normally the
     * active agent session. `undefined` when no owner can be derived (e.g. a
     * direct tool call with no agent); such calls read freely but cannot satisfy
     * the write/edit prior-observation policy.
     */
    ObservedStateGate.prototype.owner = function (actor) {
        var _a;
        // tsgolint treats object as assignable to weak FsObservationActor, while tsc still requires the structural cast for property access.
        // See the analyzer-divergence consequence in .agents/notes/implemented/process/2026-07-29-oxlint-linter.md.
        // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- The analyzers disagree on this weak type.
        return (_a = actor === null || actor === void 0 ? void 0 : actor.agent) === null || _a === void 0 ? void 0 : _a.session;
    };
    ObservedStateGate.prototype.get = function (owner, targetKey) {
        var _a;
        return (_a = this.observed.get(owner)) === null || _a === void 0 ? void 0 : _a.get(targetKey);
    };
    ObservedStateGate.prototype.set = function (owner, targetKey, observation) {
        var byTarget = this.observed.get(owner);
        if (!byTarget) {
            byTarget = new Map();
            this.observed.set(owner, byTarget);
        }
        byTarget.set(targetKey, observation);
    };
    /** Drop all recorded state (HMR safety / disposal). */
    ObservedStateGate.prototype.clear = function () {
        this.observed = new WeakMap();
    };
    /**
     * Decide the write intent: unseen or confirmed absent ⇒ `createIfAbsent`;
     * confirmed present ⇒ `replaceIfVersion` at the observed version.
     */
    ObservedStateGate.prototype.writeIntent = function (target, actor) {
        var owner = this.owner(actor);
        var prior = owner ? this.get(owner, target.targetKey) : undefined;
        return (prior === null || prior === void 0 ? void 0 : prior.kind) === 'present'
            ? { kind: 'replaceIfVersion', version: prior.version }
            : { kind: 'createIfAbsent' };
    };
    /**
     * Decide the edit version guard: unseen rejects with `FS_NOT_OBSERVED`,
     * confirmed absence rejects with `FS_NOT_FOUND`, and presence supplies the
     * observed version as the CAS basis.
     */
    ObservedStateGate.prototype.editIntent = function (target, actor) {
        var owner = this.owner(actor);
        var prior = owner ? this.get(owner, target.targetKey) : undefined;
        if (!owner || prior === undefined) {
            throw new dsh_fs_1.FsError("edit requires reading \"".concat(target.displayPath, "\" first"), 'FS_NOT_OBSERVED');
        }
        if (prior.kind === 'absent') {
            throw new dsh_fs_1.FsError("cannot edit \"".concat(target.displayPath, "\": not found"), 'FS_NOT_FOUND');
        }
        return { version: prior.version };
    };
    /** Record an authoritative present or absent observation for this owner and target. */
    ObservedStateGate.prototype.observe = function (target, observation, actor) {
        var owner = this.owner(actor);
        if (owner)
            this.set(owner, target.targetKey, observation);
    };
    return ObservedStateGate;
}());
/** Cordis plugin name used by loader diagnostics. */
exports.name = 'fs-observation-policy';
/**
 * Register the three `fs/*` listeners. No `inject` — this plugin reads no
 * services; it operates only on its own `WeakMap`. The waterfalls are unbound
 * (the tool dispatches them with no `this`), so the listeners take the raw
 * `(target, actor, next)` arguments.
 */
function apply(ctx) {
    var gate = new ObservedStateGate();
    ctx.effect(function () { return function () {
        // Drop all recorded state on disposal so a reloaded plugin starts clean
        // (HMR safety). The WeakMap itself would be GC'd, but replacing it makes the
        // release observable and immediate for tests.
        gate.clear();
    }; }, 'fs-observation-policy observed-state teardown');
    // fs/write-intent: occupy the single decision slot — do NOT call next().
    // Deferred through Promise.resolve().then so the declared Promise return type
    // holds (a throw rejects, never escapes synchronously through the waterfall).
    ctx.on('fs/write-intent', function (target, actor) { return Promise.resolve().then(function () { return gate.writeIntent(target, actor); }); });
    // fs/edit-intent: occupy the single decision slot — do not call next().
    ctx.on('fs/edit-intent', function (target, actor) { return Promise.resolve().then(function () { return gate.editIntent(target, actor); }); });
    // fs/observed must remain synchronous and non-throwing: emit does not await
    // promises, and successful mutations have already committed. WeakMap.set
    // satisfies that contract for both presence and absence.
    ctx.on('fs/observed', function (target, observation, actor) {
        gate.observe(target, observation, actor);
    });
}
