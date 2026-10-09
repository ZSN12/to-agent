"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionProvideChannel = void 0;
/**
 * Provider roster + materialization + current projection. The channel owns
 * every rule a provider contribution must satisfy; owners keep only their
 * per-session bundle storage and the definition of "current".
 */
var SessionProvideChannel = /** @class */ (function () {
    /**
     * @param host - owner-side bundle storage and current-selection resolution.
     */
    function SessionProvideChannel(host) {
        var _this = this;
        this.host = host;
        this.providers = [];
        /** Projection subscribers (plain cell: bundles hold live session sources, so no store freeze may touch them). */
        this.listeners = new Set();
        // The runtime's own contribution comes first in every session-data bundle.
        this.providers.push({
            hooks: ['session'],
            resolve: function (binding) { return ({ hooks: { session: binding.session } }); },
        });
        this.maybeInfoCache = this.materializeMaybeInfo();
        this.currentSnapshot = this.maybeInfoCache;
        this.currentProvideInfo = {
            getSnapshot: function () { return _this.currentSnapshot; },
            subscribe: function (fn) {
                _this.listeners.add(fn);
                return function () { _this.listeners.delete(fn); };
            },
        };
    }
    Object.defineProperty(SessionProvideChannel.prototype, "maybeInfo", {
        /** The static no-session projection under the current roster (declared names present, values undefined). */
        get: function () {
            return this.maybeInfoCache;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Register a per-session standard-props provider (see
     * SessionRuntime.provide for the product contract). Live bundles rebuild
     * immediately; misdeclared providers fail loud here, at the registration
     * edge, and the registration rolls back — the channel never stays on a
     * roster it cannot materialize.
     * @param descriptor - static member roster plus per-session resolver.
     * @returns disposer removing the provider.
     */
    SessionProvideChannel.prototype.provide = function (descriptor) {
        var _this = this;
        this.providers.push(descriptor);
        try {
            this.applyRosterChange();
        }
        catch (error) {
            this.providers.splice(this.providers.indexOf(descriptor), 1);
            // Restore the previous (valid) roster's bundles; cannot rethrow — the
            // pre-push roster materialized successfully before.
            this.applyRosterChange();
            throw error;
        }
        return function () {
            var at = _this.providers.indexOf(descriptor);
            if (at >= 0)
                _this.providers.splice(at, 1);
            _this.applyRosterChange();
        };
    };
    /**
     * Re-derive the current selection's bundle and publish it when it changed.
     * Bundles are identity-stable per (scope, roster) materialization, so an
     * identity compare is exact; synchronous notify — call sites (the owner's
     * list subscription, provide()) already sit behind their own batching or
     * registration edges.
     */
    SessionProvideChannel.prototype.publishCurrent = function () {
        var next = this.host.resolveCurrent();
        if (next === this.currentSnapshot)
            return;
        this.currentSnapshot = next;
        for (var _i = 0, _a = __spreadArray([], this.listeners, true); _i < _a.length; _i++) {
            var fn = _a[_i];
            try {
                fn();
            }
            catch (error) {
                // Contain subscriber failures: this notify runs inside the list
                // notification, where a throwing render-side subscriber would starve
                // later listeners and abort the projection pass that scheduled it.
                console.error('sessions.currentProvideInfo subscriber failed:', error);
            }
        }
    };
    /**
     * Materialize the standard-props bundle for one session (fails loud on
     * undeclared, missing, and duplicate member names).
     * @param binding - session assembly handle fed to every resolver.
     * @returns the materialized bundle (identity-stable until the next materialization).
     */
    SessionProvideChannel.prototype.materializeInfo = function (binding) {
        var _a, _b, _c, _d, _e, _f;
        var hooks = {};
        var props = {};
        for (var _i = 0, _g = this.providers; _i < _g.length; _i++) {
            var descriptor = _g[_i];
            var contribution = descriptor.resolve(binding);
            var contributedHooks = (_a = contribution.hooks) !== null && _a !== void 0 ? _a : {};
            var contributedProps = (_b = contribution.props) !== null && _b !== void 0 ? _b : {};
            for (var _h = 0, _j = Object.keys(contributedHooks); _h < _j.length; _h++) {
                var name_1 = _j[_h];
                if (!((_c = descriptor.hooks) !== null && _c !== void 0 ? _c : []).includes(name_1)) {
                    throw new Error("sessions.provide: undeclared hook \"".concat(name_1, "\""));
                }
            }
            for (var _k = 0, _l = Object.keys(contributedProps); _k < _l.length; _k++) {
                var name_2 = _l[_k];
                if (!((_d = descriptor.props) !== null && _d !== void 0 ? _d : []).includes(name_2)) {
                    throw new Error("sessions.provide: undeclared prop \"".concat(name_2, "\""));
                }
            }
            for (var _m = 0, _o = (_e = descriptor.hooks) !== null && _e !== void 0 ? _e : []; _m < _o.length; _m++) {
                var name_3 = _o[_m];
                var source = contributedHooks[name_3];
                if (source === undefined)
                    throw new Error("sessions.provide: missing hook \"".concat(name_3, "\""));
                if (Object.hasOwn(hooks, name_3))
                    throw new Error("sessions.provide: duplicate hook \"".concat(name_3, "\""));
                hooks[name_3] = source;
            }
            for (var _p = 0, _q = (_f = descriptor.props) !== null && _f !== void 0 ? _f : []; _p < _q.length; _p++) {
                var name_4 = _q[_p];
                if (!Object.hasOwn(contributedProps, name_4))
                    throw new Error("sessions.provide: missing prop \"".concat(name_4, "\""));
                if (Object.hasOwn(props, name_4))
                    throw new Error("sessions.provide: duplicate prop \"".concat(name_4, "\""));
                props[name_4] = contributedProps[name_4];
            }
        }
        return {
            sessionId: binding.sessionId,
            hooks: hooks,
            props: props,
            // The useProjection seat: key-addressed bare value faces off the
            // session's projection store (open key space — never a static roster member).
            projections: { faceOf: function (key) { return binding.session.projections.faceOf(key); } },
        };
    };
    /** Rebuild the static projection and the owner's live bundles, then republish the current one. */
    SessionProvideChannel.prototype.applyRosterChange = function () {
        this.maybeInfoCache = this.materializeMaybeInfo();
        this.host.rebuildBundles();
        this.publishCurrent();
    };
    /** Build the static no-session kit and reject duplicate declared names. */
    SessionProvideChannel.prototype.materializeMaybeInfo = function () {
        var _a, _b;
        var hooks = {};
        var props = {};
        for (var _i = 0, _c = this.providers; _i < _c.length; _i++) {
            var descriptor = _c[_i];
            for (var _d = 0, _e = (_a = descriptor.hooks) !== null && _a !== void 0 ? _a : []; _d < _e.length; _d++) {
                var name_5 = _e[_d];
                if (Object.hasOwn(hooks, name_5))
                    throw new Error("sessions.provide: duplicate hook \"".concat(name_5, "\""));
                hooks[name_5] = undefined;
            }
            for (var _f = 0, _g = (_b = descriptor.props) !== null && _b !== void 0 ? _b : []; _f < _g.length; _f++) {
                var name_6 = _g[_f];
                if (Object.hasOwn(props, name_6))
                    throw new Error("sessions.provide: duplicate prop \"".concat(name_6, "\""));
                props[name_6] = undefined;
            }
        }
        return { sessionId: undefined, hooks: hooks, props: props }; // no projections face: every key reads absent without a session
    };
    return SessionProvideChannel;
}());
exports.SessionProvideChannel = SessionProvideChannel;
