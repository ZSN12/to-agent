"use strict";
/**
 * Service Definition for the credential-reference capability seam (`ctx.credentials`). Settings and composition files carry
 * *references* to secrets — environment-variable names — while providers own
 * the actual values and their storage. Consumers resolve a reference once per
 * operation, so a changed credential reaches the next operation without any
 * plugin restart, and configuration surfaces describe a reference without
 * ever seeing its value.
 * @module @z/dsh-credentials
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialProvider = void 0;
exports.credentialRef = credentialRef;
exports.isCredentialRefName = isCredentialRefName;
exports.isCredentialKeySegment = isCredentialKeySegment;
exports.credentialKey = credentialKey;
exports.parseCredentialKey = parseCredentialKey;
exports.credentialKeyScope = credentialKeyScope;
exports.credentialKeyId = credentialKeyId;
var cordis_1 = require("@z/cordis");
var REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Both halves of a {@link CredentialKey}; the `/` between them is what keeps it out of {@link REF_PATTERN}. */
var KEY_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/;
/**
 * Brand a raw string as a {@link CredentialRef}.
 * @param value - candidate reference; a POSIX shell identifier such as `DEEPSEEK_API_KEY`.
 * @returns the branded reference.
 */
function credentialRef(value) {
    if (!isCredentialRefName(value)) {
        throw new TypeError("credential ref \"".concat(value, "\" must match ").concat(String(REF_PATTERN)));
    }
    return value;
}
/**
 * Whether a raw string could name a reference at all. Consumers that receive
 * environment-variable names from somewhere else — a provider library's own
 * ambient discovery, a hook payload — ask this before resolving, because a name
 * outside the grammar has no reference to miss and should read as "not set"
 * rather than as a thrown error.
 * @param value - candidate reference.
 * @returns true when {@link credentialRef} would accept it.
 */
function isCredentialRefName(value) {
    return REF_PATTERN.test(value);
}
/**
 * Whether a raw string could be a {@link credentialKey} segment at all.
 * Consumers whose addressing units come from somewhere else — a settings dict
 * key, a library's own provider id — ask this before building a key, because a
 * unit outside the grammar can never have stored a record and should read as
 * "nothing stored" rather than as a thrown error.
 * @param value - candidate segment.
 * @returns true when {@link credentialKey} would accept it as either segment.
 */
function isCredentialKeySegment(value) {
    return KEY_SEGMENT_PATTERN.test(value);
}
/**
 * Brand a scope and an id as a {@link CredentialKey}.
 * @param scope - the owning plugin's registered name, such as `llm-pi-ai`.
 * @param id - that plugin's own addressing unit, such as a provider route key.
 * @returns the branded key.
 * @throws TypeError when either segment is not a lowercase hyphenated identifier.
 */
function credentialKey(scope, id) {
    for (var _i = 0, _a = [scope, id]; _i < _a.length; _i++) {
        var segment = _a[_i];
        if (!KEY_SEGMENT_PATTERN.test(segment)) {
            throw new TypeError("credential key segment \"".concat(segment, "\" must match ").concat(String(KEY_SEGMENT_PATTERN)));
        }
    }
    return "".concat(scope, "/").concat(id);
}
/**
 * Brand a stored `<scope>/<id>` string as a {@link CredentialKey}. This is the
 * read half of {@link credentialKey}, for a provider admitting keys off disk.
 * @param value - candidate key in its joined form.
 * @returns the branded key.
 * @throws TypeError when the value is not exactly two valid segments.
 */
function parseCredentialKey(value) {
    var segments = value.split('/');
    var scope = segments[0], id = segments[1];
    if (segments.length !== 2 || scope === undefined || id === undefined) {
        throw new TypeError("credential key \"".concat(value, "\" must be \"<scope>/<id>\""));
    }
    return credentialKey(scope, id);
}
/**
 * The owning plugin's name for one key. A record whose scope names no
 * currently registered owner is an orphan, which a configuration surface must
 * report as such rather than as a working credential.
 * @param key - the key to read.
 * @returns the scope segment.
 */
function credentialKeyScope(key) {
    // The brand's only constructors both validate two segments, so the split
    // cannot come back short here.
    return key.slice(0, key.indexOf('/'));
}
/**
 * The owning plugin's own addressing unit for one key — the half that plugin
 * chose, such as a provider route.
 * @param key - the key to read.
 * @returns the id segment.
 */
function credentialKeyId(key) {
    return key.slice(key.indexOf('/') + 1);
}
/**
 * Abstract credential service over two key spaces that answer two questions.
 *
 * A {@link CredentialRef} answers "what is behind this environment-variable
 * name", layered over the process environment, the provider-managed store, and
 * `.env` files. One seam-wide rule binds that half: an empty stored value is
 * absent everywhere — `resolve` skips it, `describe` reports it unconfigured —
 * so a blank never masquerades as a configured secret.
 *
 * A {@link CredentialKey} answers "what credential does this plugin hold for
 * this id". Nothing can layer here — an authorization grant has no
 * environment to be read from — so presence of the record is the whole fact,
 * and {@link modifyRecord} is the only write path because a correct write
 * depends on the current value (a token refresh is read-decide-replace under
 * one lock).
 */
var CredentialProvider = /** @class */ (function (_super) {
    __extends(CredentialProvider, _super);
    function CredentialProvider(ctx) {
        return _super.call(this, ctx, 'credentials') || this;
    }
    /**
     * Fan `credentials/reference-updated` out with contained listener failures: every
     * listener runs, and a sync throw or async rejection is logged without
     * changing the committed operation's outcome — except `INVARIANT`-coded
     * failures, which rethrow after every listener ran (the rethrow reaches the
     * caller only from synchronous listeners, so invariant checks on this event
     * must not be async functions). Providers call this only after the write or
     * reload actually committed, so a broken observer can never make a durable
     * change look failed.
     * @param ref - the reference whose stored value changed.
     */
    CredentialProvider.prototype.notifyUpdated = function (ref) {
        this.fanOut('credentials/reference-updated', ref);
    };
    /**
     * Fan `credentials/record-updated` out on exactly the terms
     * {@link notifyUpdated} documents, for the record half of the seam.
     * @param key - the record whose stored value changed.
     */
    CredentialProvider.prototype.notifyRecordUpdated = function (key) {
        this.fanOut('credentials/record-updated', key);
    };
    /* jscpd:ignore-start -- deliberate symmetry with the settings seam's commit
       fan-out: the contained-dispatch shape is the reviewed listener-lifecycle
       contract, and extracting it would couple the two seams' event semantics. */
    /** The contained dispatch both notifications run through; see {@link notifyUpdated}. */
    CredentialProvider.prototype.fanOut = function (event, subject) {
        var _this = this;
        var invariantFailure;
        var args = [event, subject];
        for (var _i = 0, _a = this.ctx.events.dispatch('emit', args); _i < _a.length; _i++) {
            var listener = _a[_i];
            try {
                var returned = listener(subject);
                if (returned != null && typeof returned.then === 'function') {
                    void Promise.resolve(returned).then(undefined, function (error) {
                        _this.warnListenerFailure(event, subject, error);
                    });
                }
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 'INVARIANT') {
                    invariantFailure !== null && invariantFailure !== void 0 ? invariantFailure : (invariantFailure = error);
                    continue;
                }
                this.warnListenerFailure(event, subject, error);
            }
        }
        if (invariantFailure !== undefined)
            throw invariantFailure;
    };
    /* jscpd:ignore-end */
    /** Contained-listener diagnostic shared by the sync and async failure paths. */
    CredentialProvider.prototype.warnListenerFailure = function (event, subject, error) {
        this.ctx.logger.warn('credentials: a %s listener for "%s" failed', event, subject);
        this.ctx.logger.warn(error);
    };
    return CredentialProvider;
}(cordis_1.Service));
exports.CredentialProvider = CredentialProvider;
exports.default = CredentialProvider;
