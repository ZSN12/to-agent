"use strict";
/**
 * Ownership of one unpublished Session before registry publication.
 * @module @z/dsh-session/preparation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionPreparation = void 0;
/**
 * One exact unpublished Session and the provider state that keeps it usable.
 * Disposal is synchronous and idempotent. Providers decide whether release
 * returns the Session to a cache or discards it; publication may consume that
 * state before disposal, making the callback a no-op.
 */
var SessionPreparation = /** @class */ (function () {
    function SessionPreparation(session, options) {
        this.options = options;
        this.released = false;
        this.session = session;
    }
    /**
     * Wrap an unpublished Session in one preparation lifetime.
     * @param session - exact unpublished Session.
     * @param options - optional provider release behavior.
     * @returns a preparation disposed after publication or rollback.
     */
    SessionPreparation.create = function (session, options) {
        return new SessionPreparation(session, options !== null && options !== void 0 ? options : {});
    };
    /** Release provider state once when this preparation leaves its caller. */
    SessionPreparation.prototype[Symbol.dispose] = function () {
        var _a, _b;
        if (this.released)
            return;
        this.released = true;
        (_b = (_a = this.options).release) === null || _b === void 0 ? void 0 : _b.call(_a);
    };
    return SessionPreparation;
}());
exports.SessionPreparation = SessionPreparation;
