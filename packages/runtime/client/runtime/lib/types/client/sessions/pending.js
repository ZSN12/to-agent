"use strict";
// PendingWait: the carrier-protocol half of a pending host interaction. The runtime owns only
// envelope knowledge (rpcId backfill into a client-response); domain result encoding belongs to
// the interaction's consumer package.
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _PendingWait_settled, _PendingWait_rpcId, _PendingWait_respond;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PendingWait = void 0;
/** Key prefixes, one per kind (the key doubles as the Session pending-map key). */
var KEY_PREFIX = { approval: 'a', question: 'q' };
/**
 * One pending host-owned interaction wait: an immutable render face
 * (kind/key/sessionId/payload) plus the response carrier. respond() backfills
 * the requested frame's rpcId into a client-response envelope — no consumer
 * ever sees the raw rpcId. Settlement is expressed only by pending-list
 * membership (the settled flag is a fail-loud guard, not a render input).
 */
var PendingWait = /** @class */ (function () {
    /**
     * Minted by Session on a requested frame (public construction is the test-fixture path).
     * @param kind - interaction kind.
     * @param rpcId - the requested frame's stable envelope id (kept private; respond echoes it).
     * @param sessionId - owning session.
     * @param payload - the requested frame's domain fields.
     * @param respond - the client-response carrier (api.respond).
     */
    function PendingWait(kind, rpcId, sessionId, payload, respond) {
        _PendingWait_settled.set(this, false);
        _PendingWait_rpcId.set(this, void 0);
        _PendingWait_respond.set(this, void 0);
        this.kind = kind;
        this.key = "".concat(KEY_PREFIX[kind], ":").concat(rpcId);
        this.sessionId = sessionId;
        this.payload = payload;
        __classPrivateFieldSet(this, _PendingWait_rpcId, rpcId, "f");
        __classPrivateFieldSet(this, _PendingWait_respond, respond, "f");
    }
    /**
     * Send a result for this wait: wraps it into the client-response envelope
     * with the rpcId backfilled. Throws synchronously once settled.
     * @param result - the result shell (ok value / error envelope), domain-encoded by the caller.
     * @returns the carrier receipt.
     */
    PendingWait.prototype.respond = function (result) {
        if (__classPrivateFieldGet(this, _PendingWait_settled, "f"))
            throw new Error("pending wait ".concat(this.key, " is already settled"));
        return __classPrivateFieldGet(this, _PendingWait_respond, "f").call(this, { type: 'client-response', rpcId: __classPrivateFieldGet(this, _PendingWait_rpcId, "f"), result: result });
    };
    /** Session-only settlement mark (the authoritative resolved frame arrived); respond() throws afterwards. */
    PendingWait.prototype.markSettled = function () {
        __classPrivateFieldSet(this, _PendingWait_settled, true, "f");
    };
    return PendingWait;
}());
exports.PendingWait = PendingWait;
_PendingWait_settled = new WeakMap(), _PendingWait_rpcId = new WeakMap(), _PendingWait_respond = new WeakMap();
