"use strict";
/**
 * Authorization flows for the pi-ai providers that ship a login. This is the
 * whole of the translation between the harness's neutral notice/prompt
 * vocabulary and pi-ai's `AuthInteraction`; nothing above it knows which
 * library ran the conversation.
 *
 * @module dsh-llm-pi-ai/login
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
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
exports.registerPiAiFlows = registerPiAiFlows;
var pi_ai_1 = require("@earendil-works/pi-ai");
var dsh_credentials_1 = require("@z/dsh-credentials");
var catalog_ts_1 = require("./catalog.ts");
var auth_ts_1 = require("./auth.ts");
/**
 * The login methods one catalog provider offers.
 *
 * A method appears only when pi-ai can actually run it: `oauth` always carries
 * a `login`, while an api-key method has one only when the provider collects
 * its key interactively — which every installed one currently does, so a key is
 * typed into pi-ai's own prompt rather than into the settings form.
 * @param provider - the installed catalog provider, if pi-ai ships one.
 * @returns its methods, most preferred first; empty when it offers no login.
 */
function loginMethods(provider) {
    var _a;
    var methods = [];
    var oauth = provider === null || provider === void 0 ? void 0 : provider.auth.oauth;
    if (oauth !== undefined)
        methods.push({ id: 'oauth', label: (_a = oauth.loginLabel) !== null && _a !== void 0 ? _a : oauth.name });
    var apiKey = provider === null || provider === void 0 ? void 0 : provider.auth.apiKey;
    if ((apiKey === null || apiKey === void 0 ? void 0 : apiKey.login) !== undefined)
        methods.push({ id: 'api-key', label: apiKey.name });
    return methods;
}
/**
 * Restate one pi-ai login event in the seam's vocabulary.
 *
 * A device-code grant is the one event carrying two things the human needs at
 * once — where to go and what to type there — which is why the neutral notice
 * has a `code` beside its `url` rather than folding the code into the message.
 * @param event - what pi-ai reported.
 * @param session - the attempt to report it to.
 */
function relay(event, session) {
    var _a, _b;
    switch (event.type) {
        case 'info': {
            var link = (_a = event.links) === null || _a === void 0 ? void 0 : _a[0];
            session.notify(__assign({ message: event.message }, link === undefined ? {} : { url: link.url }));
            return;
        }
        case 'auth_url':
            session.notify({
                message: (_b = event.instructions) !== null && _b !== void 0 ? _b : 'Open this page to continue signing in.',
                url: event.url,
            });
            return;
        case 'device_code':
            session.notify({
                message: 'Enter this code on the verification page to finish signing in.',
                url: event.verificationUri,
                code: event.userCode,
            });
            return;
        case 'progress':
            session.notify({ message: event.message });
            return;
        default:
            // pi-ai's event union is open to new members: a build that meets one it
            // does not know still shows the human that something is happening rather
            // than going silent mid-login.
            session.notify({ message: 'Signing in…' });
    }
}
/**
 * Restate one pi-ai prompt in the seam's vocabulary.
 *
 * `manual_code` becomes a plain text question because the difference pi-ai
 * draws — a code the human copies from a browser rather than a value they know
 * — changes nothing a surface renders. Its own `signal` is carried through, and
 * that is the part which matters: it is how a flow racing a typed code against
 * a browser callback withdraws the losing question.
 * @param prompt - what pi-ai asked.
 * @returns the neutral prompt to put to the human.
 */
function restate(prompt) {
    var signal = prompt.signal === undefined ? {} : { signal: prompt.signal };
    switch (prompt.type) {
        case 'select':
            return __assign(__assign({}, signal), { kind: 'select', message: prompt.message, options: prompt.options });
        case 'secret':
            return __assign(__assign(__assign({}, signal), { kind: 'secret', message: prompt.message }), prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder });
        default:
            return __assign(__assign(__assign({}, signal), { kind: 'text', message: prompt.message }), prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder });
    }
}
/**
 * Register one authorization flow per installed provider that ships a login.
 *
 * Registration is unconditional on configuration: a provider has to be signed
 * into before a route for it is worth adding, so the flow exists from the
 * moment the plugin mounts rather than appearing once a profile does.
 * @param ctx - the plugin context carrying `ctx.authorization`.
 * @param auth - the injectables every collection here is built with.
 */
function registerPiAiFlows(ctx, auth) {
    var _loop_1 = function (providerId) {
        var provider = (0, catalog_ts_1.catalogProvider)(providerId);
        var _b = loginMethods(provider), first = _b[0], rest = _b.slice(1);
        /* v8 ignore next 3 -- every id here names an installed provider and every
           installed provider ships a login, so nothing is skipped today; the guard
           is what keeps that from becoming a crash if either stops being true. */
        if (provider === undefined || first === undefined)
            return "continue";
        /* v8 ignore next 7 -- every installed catalog id today is a lowercase
           hyphenated identifier; the guard keeps a future upstream id outside the
           record grammar (dotted or uppercase, as vendor ids elsewhere already
           are) from throwing in `recordKeyFor` and failing the whole mount. */
        if (!(0, dsh_credentials_1.isCredentialKeySegment)(providerId)) {
            ctx.logger.warn('llm-pi-ai: catalog provider "%s" cannot address a credential record; its sign-in is not offered', providerId);
            return "continue";
        }
        ctx.authorization.registerFlow({
            key: (0, auth_ts_1.recordKeyFor)(providerId),
            label: provider.name,
            methods: __spreadArray([first], rest, true),
            run: function (session) {
                return __awaiter(this, void 0, void 0, function () {
                    var models, type;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                models = (0, pi_ai_1.createModels)(auth);
                                models.setProvider(provider);
                                type = session.method === 'oauth' ? 'oauth' : 'api_key';
                                // pi-ai persists what the login returns through that same store, which
                                // is what makes it the single writer of this record.
                                return [4 /*yield*/, models.login(providerId, type, {
                                        signal: session.signal,
                                        notify: function (event) { relay(event, session); },
                                        prompt: function (prompt) { return session.prompt(restate(prompt)); },
                                    })];
                            case 1:
                                // pi-ai persists what the login returns through that same store, which
                                // is what makes it the single writer of this record.
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                });
            },
        });
    };
    for (var _i = 0, _a = (0, catalog_ts_1.catalogProviderIds)(); _i < _a.length; _i++) {
        var providerId = _a[_i];
        _loop_1(providerId);
    }
}
