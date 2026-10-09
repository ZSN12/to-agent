"use strict";
/**
 * Answering "which models can this provider serve?" for the configuration
 * surface's "fetch available models" action.
 *
 * A route the installed pi-ai catalog ships is answered **from that catalog**,
 * with no network call at all: pi-ai's registry is the authoritative list for
 * its own providers, and it carries the capacities a listing endpoint would
 * not disclose. Only a route the catalog does not describe — a gateway, a
 * self-hosted server — is interrogated over the wire.
 *
 * Neither path is a catalog refresh. Nothing here is stored: the request
 * carries a draft the user is still editing, and the reply is candidate
 * metadata the surface offers for adoption. `settings.yaml` remains the only
 * thing that decides what a route serves.
 *
 * Only OpenAI-compatible protocols are interrogated. Their listing is the one
 * shape a gateway, a self-hosted server, and the official endpoints all agree
 * on, which is the case this action exists for; every other protocol reports
 * that it cannot be interrogated so the surface falls back to hand-entry
 * rather than guessing a response shape.
 *
 * @module dsh-llm-pi-ai/discovery
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
exports.discoverModels = discoverModels;
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_llm_2 = require("@z/dsh-llm");
var catalog_ts_1 = require("./catalog.ts");
/**
 * Protocols whose model listing this module can read: the two that speak
 * OpenAI's `GET /models` shape with bearer auth. Azure is absent despite its
 * OpenAI lineage — it authenticates with an `api-key` header and requires an
 * `api-version` query — and Codex authenticates through OAuth; guessing at
 * either would report an authentication failure as a provider with no models.
 * pi-ai's remaining protocols are absent for the same reason.
 */
var LISTABLE_PROTOCOLS = new Set([
    'openai-completions',
    'openai-responses',
]);
/**
 * Endpoint replies larger than this are refused. The endpoint is whatever URL
 * the user typed, so the ceiling holds on the bytes actually read rather than
 * on the length the server claims — the same two-stage shape `dsh-web-fetch`
 * uses for its own caller-supplied URLs, except that a truncated model listing
 * is not parseable, so overflow rejects instead of truncating.
 */
var MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
/** A positive integer field of a listing entry, or `undefined` when absent or unusable. */
function capacity() {
    var candidates = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        candidates[_i] = arguments[_i];
    }
    for (var _a = 0, candidates_1 = candidates; _a < candidates_1.length; _a++) {
        var candidate = candidates_1[_a];
        if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0)
            return candidate;
    }
    return undefined;
}
/** A non-empty string field of a listing entry, or `undefined`. */
function label() {
    var candidates = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        candidates[_i] = arguments[_i];
    }
    for (var _a = 0, candidates_2 = candidates; _a < candidates_2.length; _a++) {
        var candidate = candidates_2[_a];
        if (typeof candidate === 'string' && candidate.length > 0)
            return candidate;
    }
    return undefined;
}
/**
 * Join the endpoint base with the listing path. The base is treated as a
 * prefix rather than a URL to resolve against, so a deployment path such as
 * `https://gateway.example/openai/v1` keeps its segments instead of losing
 * them to `URL` resolution.
 */
function listingUrl(baseURL) {
    return "".concat(baseURL.replace(/\/+$/, ''), "/models");
}
/**
 * Read a reply body, refusing one that outgrows the ceiling. A declared length
 * is checked first so an honest server is turned away without transferring
 * anything; the accumulated total is what actually enforces the bound, because
 * a server that under-declares (or streams) tells us nothing up front.
 */
function readBounded(response, url) {
    return __awaiter(this, void 0, void 0, function () {
        var oversized, declared, reader, chunks, total, _a, done, value, body, offset, _i, chunks_1, chunk;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    oversized = function () {
                        return new dsh_llm_1.LlmError("".concat(url, " answered with more than ").concat(MAX_RESPONSE_BYTES, " bytes"), 'DISCOVERY_FAILED');
                    };
                    declared = Number((_b = response.headers.get('content-length')) !== null && _b !== void 0 ? _b : Number.NaN);
                    if (!(Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES)) return [3 /*break*/, 2];
                    return [4 /*yield*/, ((_c = response.body) === null || _c === void 0 ? void 0 : _c.cancel())];
                case 1:
                    _d.sent();
                    throw oversized();
                case 2:
                    /* v8 ignore next -- fetch always exposes a body stream on a 2xx Response; the null guard is defensive. */
                    if (response.body === null)
                        return [2 /*return*/, ''];
                    reader = response.body.getReader();
                    chunks = [];
                    total = 0;
                    _d.label = 3;
                case 3:
                    _d.trys.push([3, , 8, 10]);
                    _d.label = 4;
                case 4: return [4 /*yield*/, reader.read()];
                case 5:
                    _a = _d.sent(), done = _a.done, value = _a.value;
                    if (done)
                        return [3 /*break*/, 7];
                    total += value.byteLength;
                    if (total > MAX_RESPONSE_BYTES)
                        throw oversized();
                    chunks.push(value);
                    _d.label = 6;
                case 6: return [3 /*break*/, 4];
                case 7: return [3 /*break*/, 10];
                case 8: 
                /* v8 ignore next 4 -- cancel() after a completed or abandoned read settles without rejecting; unobserved best-effort cleanup. */
                return [4 /*yield*/, reader.cancel().catch(function () {
                        // Cancel after a drained read, or after this function walked away from
                        // an oversized one, is cleanup; the reply is already decided either way.
                    })];
                case 9:
                    /* v8 ignore next 4 -- cancel() after a completed or abandoned read settles without rejecting; unobserved best-effort cleanup. */
                    _d.sent();
                    return [7 /*endfinally*/];
                case 10:
                    body = new Uint8Array(total);
                    offset = 0;
                    for (_i = 0, chunks_1 = chunks; _i < chunks_1.length; _i++) {
                        chunk = chunks_1[_i];
                        body.set(chunk, offset);
                        offset += chunk.byteLength;
                    }
                    return [2 /*return*/, new TextDecoder().decode(body)];
            }
        });
    });
}
/**
 * Read one OpenAI-compatible listing reply. Entries without a usable id are
 * skipped rather than failing the whole interrogation: a single malformed row
 * should not deny the user the rest of a working endpoint's catalog.
 */
function readListing(body) {
    var data = body === null || body === void 0 ? void 0 : body.data;
    if (!Array.isArray(data)) {
        throw new dsh_llm_1.LlmError('the endpoint\'s model listing has no "data" array; enter this provider\'s models by hand', 'DISCOVERY_FAILED');
    }
    var models = [];
    for (var _i = 0, data_1 = data; _i < data_1.length; _i++) {
        var raw = data_1[_i];
        var entry = raw;
        var id = label(entry === null || entry === void 0 ? void 0 : entry.id);
        if (id === undefined)
            continue;
        var name_1 = label(entry === null || entry === void 0 ? void 0 : entry.name, entry === null || entry === void 0 ? void 0 : entry.display_name);
        var contextWindow = capacity(entry === null || entry === void 0 ? void 0 : entry.context_window, entry === null || entry === void 0 ? void 0 : entry.context_length);
        var maxTokens = capacity(entry === null || entry === void 0 ? void 0 : entry.max_output_tokens, entry === null || entry === void 0 ? void 0 : entry.max_tokens);
        models.push(__assign(__assign(__assign({ id: id }, name_1 === undefined ? {} : { name: name_1 }), contextWindow === undefined ? {} : { contextWindow: contextWindow }), maxTokens === undefined ? {} : { maxTokens: maxTokens }));
    }
    return models;
}
/**
 * Accept one probe key, or refuse it before the header is built. Without this
 * the `fetch` below would throw a ByteString `TypeError` that this function's
 * catch reports as `could not reach <url>` — blaming the network for a local,
 * deterministic fault.
 * @param raw - the key typed into the form or read from storage.
 * @returns the trimmed, usable key.
 */
function usableProbeKey(raw) {
    var checked = (0, dsh_llm_1.normalizeApiKey)(raw);
    if (checked.ok)
        return checked.value;
    throw new dsh_llm_1.LlmError(checked.reason === 'empty'
        ? 'this provider\'s API key is blank; enter it on the Models page, or clear it to probe unauthenticated'
        : 'this provider\'s API key contains characters no HTTP header can carry; paste the raw key only', dsh_llm_1.INVALID_CREDENTIAL_CODE);
}
/**
 * Interrogate one draft provider endpoint for the models it advertises.
 * @param request - the endpoint, protocol, and one-shot credential to use.
 * @param storedApiKey - the credential the named route already stored, asked
 *   for only when the draft carries none and only on the path that reaches the
 *   network. A configuration surface never holds a stored secret — it edits a
 *   redacted descriptor — so without this an already-configured route would be
 *   interrogated unauthenticated and answer 401.
 * @returns the advertised models in endpoint order.
 * @throws LlmError when the protocol has no readable listing, the endpoint
 *   refuses or fails the request, or the reply is not a model listing.
 */
function discoverModels(request, storedApiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var installed, api, url, supplied, _a, apiKey, response, error_1, text, error_2, body;
        var _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    // A catalog route already has its answer, and a better one: the installed
                    // entries carry context windows and output caps no listing endpoint reports.
                    if (request.provider !== undefined) {
                        installed = (0, catalog_ts_1.catalogModels)(request.provider);
                        if (installed.size > 0) {
                            return [2 /*return*/, __spreadArray([], installed.values(), true).map(function (model) { return ({
                                    id: model.id,
                                    name: model.name,
                                    contextWindow: model.contextWindow,
                                    maxTokens: model.maxTokens,
                                }); })];
                        }
                    }
                    if (request.baseURL === undefined || request.baseURL.length === 0) {
                        throw new dsh_llm_1.LlmError("pi-ai ships no catalog for provider \"".concat((_b = request.provider) !== null && _b !== void 0 ? _b : '', "\", so its models can only come from its")
                            + " endpoint; set a baseURL, or enter this provider's models by hand", 'DISCOVERY_FAILED');
                    }
                    api = (_c = request.api) !== null && _c !== void 0 ? _c : 'openai-completions';
                    if (!LISTABLE_PROTOCOLS.has(api)) {
                        throw new dsh_llm_1.LlmError("pi-ai protocol \"".concat(api, "\" has no model listing this build can read; enter this provider's models by hand"), 'DISCOVERY_UNSUPPORTED');
                    }
                    url = listingUrl(request.baseURL);
                    if (!((_d = request.apiKey) !== null && _d !== void 0)) return [3 /*break*/, 1];
                    _a = _d;
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, (storedApiKey === null || storedApiKey === void 0 ? void 0 : storedApiKey())];
                case 2:
                    _a = _g.sent();
                    _g.label = 3;
                case 3:
                    supplied = _a;
                    apiKey = supplied === undefined ? undefined : usableProbeKey(supplied);
                    _g.label = 4;
                case 4:
                    _g.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, fetch(url, __assign({ method: 'GET', headers: __assign(__assign({ accept: 'application/json' }, apiKey === undefined ? {} : { authorization: "Bearer ".concat(apiKey) }), (0, dsh_llm_2.attributionHeaders)()) }, request.signal === undefined ? {} : { signal: request.signal }))];
                case 5:
                    response = _g.sent();
                    return [3 /*break*/, 7];
                case 6:
                    error_1 = _g.sent();
                    if ((_e = request.signal) === null || _e === void 0 ? void 0 : _e.aborted) {
                        throw new dsh_llm_1.LlmError('model discovery aborted by caller', 'ABORTED', { cause: error_1 });
                    }
                    throw new dsh_llm_1.LlmError("could not reach ".concat(url), 'DISCOVERY_FAILED', { cause: error_1 });
                case 7:
                    if (!response.ok) {
                        throw new dsh_llm_1.LlmError("".concat(url, " answered ").concat(response.status).concat(response.status === 401 || response.status === 403 ? '; check the API key' : ''), 'DISCOVERY_FAILED');
                    }
                    _g.label = 8;
                case 8:
                    _g.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, readBounded(response, url)];
                case 9:
                    text = _g.sent();
                    return [3 /*break*/, 11];
                case 10:
                    error_2 = _g.sent();
                    // Cancellation during the body read rejects with the abort reason, which
                    // may be any value; the caller gets the same coded failure it would have
                    // for a cancellation before the request went out.
                    if ((_f = request.signal) === null || _f === void 0 ? void 0 : _f.aborted) {
                        throw new dsh_llm_1.LlmError('model discovery aborted by caller', 'ABORTED', { cause: error_2 });
                    }
                    throw error_2;
                case 11:
                    try {
                        body = JSON.parse(text);
                    }
                    catch (error) {
                        throw new dsh_llm_1.LlmError("".concat(url, " did not answer with JSON"), 'DISCOVERY_FAILED', { cause: error });
                    }
                    return [2 /*return*/, readListing(body)];
            }
        });
    });
}
