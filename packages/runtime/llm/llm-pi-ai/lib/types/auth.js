"use strict";
/**
 * The three adapters between pi-ai's auth model and the harness credential
 * plane. Every pi-ai-specific concept stays on this side of them: the harness
 * seams they consume — `ctx.credentials` records and `ctx.authorization` flows —
 * name nothing from this library, so another adapter family can arrive with a
 * different auth model and share the same two seams.
 *
 * @module dsh-llm-pi-ai/auth
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECORD_SCOPE = void 0;
exports.recordKeyFor = recordKeyFor;
exports.credentialStoreFrom = credentialStoreFrom;
exports.authContextFrom = authContextFrom;
var node_os_1 = require("node:os");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var dsh_credentials_1 = require("@z/dsh-credentials");
var dsh_launch_environment_1 = require("@z/dsh-launch-environment");
var dsh_llm_1 = require("@z/dsh-llm");
/**
 * The record scope every credential this adapter family stores is written
 * under. It is the plugin's registered name, which is what tells a later
 * reader — a configuration UI, or a second adapter family serving the same
 * provider name — that this plugin owns the format inside the record.
 */
exports.RECORD_SCOPE = 'llm-pi-ai';
/**
 * The record address for one pi-ai provider id.
 * @param providerId - pi-ai's own provider id, which is also the harness route key.
 * @returns the scoped credential key this adapter family reads and writes.
 */
function recordKeyFor(providerId) {
    return (0, dsh_credentials_1.credentialKey)(exports.RECORD_SCOPE, providerId);
}
/**
 * Translate a stored record into the credential pi-ai expects.
 *
 * An `api-key` record is structural on both sides, so it is rebuilt field by
 * field. A `grant` payload is pi-ai's own OAuth credential, stored verbatim:
 * the seam treats it as opaque JSON precisely so a library that owns a token
 * format keeps owning it, refresh fields and all.
 * @param record - the stored record, or undefined when nothing is stored.
 * @returns the pi-ai credential, or undefined for an absent record.
 */
function toPiCredential(record) {
    if (record === undefined)
        return undefined;
    if (record.kind === 'api-key') {
        return __assign(__assign({ type: 'api_key' }, record.key === undefined ? {} : { key: record.key }), record.env === undefined ? {} : { env: __assign({}, record.env) });
    }
    return record.payload;
}
/**
 * Translate a pi-ai credential into the record to store.
 * @param credential - what a login or refresh produced.
 * @returns the record to commit, in the union the credential seam stores.
 */
function toRecord(credential) {
    if (credential.type === 'api_key') {
        return __assign(__assign({ kind: 'api-key' }, credential.key === undefined ? {} : { key: credential.key }), credential.env === undefined ? {} : { env: __assign({}, credential.env) });
    }
    return { kind: 'grant', payload: credential };
}
/**
 * The credential service, or the failure that names what is missing. Reads
 * answer "nothing stored" without a service, because a composition with no
 * credential plane genuinely holds no credential; writes refuse, because a
 * login whose grant silently evaporated would report success and then fail
 * every request.
 * @param ctx - the plugin context.
 * @returns the live service.
 * @throws {LlmError} code `NO_CREDENTIAL_STORE` when none is mounted.
 */
function writableStore(ctx) {
    var credentials = ctx.get('credentials');
    if (credentials === undefined) {
        throw new dsh_llm_1.LlmError('llm-pi-ai: this composition mounts no credentials service, so there is nowhere to store the'
            + ' credential a sign-in produces; mount one (dsh-credentials-local) to sign in', 'NO_CREDENTIAL_STORE');
    }
    return credentials;
}
/**
 * A pi-ai `CredentialStore` over the harness credential records.
 *
 * pi-ai runs OAuth refresh *inside* `modify()`, so this store's exclusion has
 * to cover a network round trip rather than a file rename — which is why the
 * record write path takes a wait limit of its own rather than the short one a
 * local write would need.
 *
 * pi-ai asks this store about every provider in the collection, hand-declared
 * routes included, and a route key is an arbitrary settings dict key while a
 * record id is not. An id outside the record grammar can never have stored a
 * record, so reads answer "nothing stored" and a delete has nothing to remove;
 * only `modify` refuses it, because a write that cannot land must not report
 * that it did.
 * @param ctx - the plugin context carrying the optional `ctx.credentials`.
 * @returns the store to hand `createModels()`.
 */
function credentialStoreFrom(ctx) {
    return {
        read: function (providerId) {
            return __awaiter(this, void 0, void 0, function () {
                var credentials, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            credentials = ctx.get('credentials');
                            if (credentials === undefined)
                                return [2 /*return*/, undefined];
                            if (!(0, dsh_credentials_1.isCredentialKeySegment)(providerId))
                                return [2 /*return*/, undefined];
                            _a = toPiCredential;
                            return [4 /*yield*/, credentials.readRecord(recordKeyFor(providerId))];
                        case 1: return [2 /*return*/, _a.apply(void 0, [_b.sent()])];
                    }
                });
            });
        },
        list: function () {
            return __awaiter(this, void 0, void 0, function () {
                var stored, mine, _i, stored_1, entry;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0: return [4 /*yield*/, ((_a = ctx.get('credentials')) === null || _a === void 0 ? void 0 : _a.listRecords())];
                        case 1:
                            stored = (_b = _c.sent()) !== null && _b !== void 0 ? _b : [];
                            mine = [];
                            for (_i = 0, stored_1 = stored; _i < stored_1.length; _i++) {
                                entry = stored_1[_i];
                                // Records another plugin owns are not this collection's to report:
                                // their payloads are written in a format pi-ai never agreed to.
                                if ((0, dsh_credentials_1.credentialKeyScope)(entry.key) !== exports.RECORD_SCOPE)
                                    continue;
                                mine.push({
                                    providerId: (0, dsh_credentials_1.credentialKeyId)(entry.key),
                                    type: entry.kind === 'api-key' ? 'api_key' : 'oauth',
                                });
                            }
                            return [2 /*return*/, mine];
                    }
                });
            });
        },
        modify: function (providerId, mutate) {
            return __awaiter(this, void 0, void 0, function () {
                var stored;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!(0, dsh_credentials_1.isCredentialKeySegment)(providerId)) {
                                throw new dsh_llm_1.LlmError("llm-pi-ai: provider id \"".concat(providerId, "\" cannot address a stored credential record (a record id is a")
                                    + ' lowercase hyphenated identifier); authenticate this route through apiKeyEnv instead of a stored'
                                    + ' credential', 'UNSTORABLE_PROVIDER_ID');
                            }
                            return [4 /*yield*/, writableStore(ctx).modifyRecord(recordKeyFor(providerId), function (current) { return __awaiter(_this, void 0, void 0, function () {
                                    var next;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, mutate(toPiCredential(current))];
                                            case 1:
                                                next = _a.sent();
                                                return [2 /*return*/, next === undefined ? undefined : toRecord(next)];
                                        }
                                    });
                                }); })];
                        case 1:
                            stored = _a.sent();
                            return [2 /*return*/, toPiCredential(stored)];
                    }
                });
            });
        },
        // `async` so a missing service reaches the caller as a rejection: pi-ai's
        // store contract is promise-returning, and a synchronous throw would
        // escape the `ModelsError` wrapper every other storage failure gets.
        delete: function (providerId) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!(0, dsh_credentials_1.isCredentialKeySegment)(providerId))
                                return [2 /*return*/];
                            return [4 /*yield*/, writableStore(ctx).deleteRecord(recordKeyFor(providerId))];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        },
    };
}
/**
 * A pi-ai `AuthContext` over the harness credential plane and the host
 * filesystem.
 *
 * `env()` answers from the credential seam first, so a value a deployment
 * stored through the harness is found by a provider's own ambient discovery —
 * without this, that discovery reads only the process environment and a stored
 * `AWS_ACCESS_KEY_ID` is invisible to it. `fileExists()` answers about the host
 * process's own filesystem rather than the workspace `ctx.fs` seam, because the
 * paths it is asked about (`~/.aws/credentials`, application-default
 * credentials) are facts about where this process runs, not about the project
 * under edit.
 * @param ctx - the plugin context carrying the optional `ctx.credentials`.
 * @returns the auth context to hand `createModels()`.
 */
function authContextFrom(ctx) {
    return {
        env: function (name) {
            return __awaiter(this, void 0, void 0, function () {
                var credentials, hit;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!(0, dsh_credentials_1.isCredentialRefName)(name)) return [3 /*break*/, 2];
                            credentials = ctx.get('credentials');
                            return [4 /*yield*/, (credentials === null || credentials === void 0 ? void 0 : credentials.resolve((0, dsh_credentials_1.credentialRef)(name)))];
                        case 1:
                            hit = _b.sent();
                            if (hit !== undefined)
                                return [2 /*return*/, hit.value];
                            _b.label = 2;
                        case 2: return [2 /*return*/, (_a = (0, dsh_launch_environment_1.launchEnvironmentOf)(ctx).get(name)) === null || _a === void 0 ? void 0 : _a.value];
                    }
                });
            });
        },
        fileExists: function (path) {
            return __awaiter(this, void 0, void 0, function () {
                var expanded, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            expanded = path.startsWith('~/') || path === '~'
                                ? (0, node_path_1.resolve)((0, node_os_1.homedir)(), path.slice(1).replace(/^\//, ''))
                                : path;
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, promises_1.access)(expanded)];
                        case 2:
                            _b.sent();
                            return [2 /*return*/, true];
                        case 3:
                            _a = _b.sent();
                            // Absent, unreadable, or a broken symlink — every one of which means
                            // this ambient credential source cannot be used, which is the only
                            // distinction the caller makes.
                            return [2 /*return*/, false];
                        case 4: return [2 /*return*/];
                    }
                });
            });
        },
    };
}
