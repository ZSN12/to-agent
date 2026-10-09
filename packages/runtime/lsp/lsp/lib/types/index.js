"use strict";
/**
 * Service Definition for the LSP capability seam (`ctx.lsp`): a language-server provider registry and per-query,
 * order-independent selection over normalized goToDefinition/findReferences/goToImplementation/
 * hover queries.
 *
 * A provider reserves a branded id and an exclusive set of file extensions atomically:
 * {@link Lsp.registerProvider} validates and conflict-checks everything before mutating, so an
 * invalid or conflicting registration publishes nothing, and its disposer releases every
 * reservation together. Selection routes a query by the file's final extension; it never depends on
 * registration order. The seam exposes exactly the four operations and no JSON-RPC escape hatch.
 * @module @z/dsh-lsp
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
exports.Lsp = exports.LspError = exports.LspProviderId = void 0;
exports.finalExtension = finalExtension;
var cordis_1 = require("@z/cordis");
var dsh_llm_1 = require("@z/dsh-llm");
var brand_ts_1 = require("./brand.ts");
Object.defineProperty(exports, "LspProviderId", { enumerable: true, get: function () { return brand_ts_1.LspProviderId; } });
/**
 * Structured LSP failure. Extends {@link HarnessError} with a stable `code`
 * (`LSP_INVALID_PROVIDER`, `LSP_CONFLICT`, `LSP_UNAVAILABLE`, `LSP_DISPOSED`,
 * `LSP_UNSUPPORTED_OPERATION`, `LSP_MALFORMED_RESPONSE`, …) that callers route on instead of
 * parsing `message`.
 */
var LspError = /** @class */ (function (_super) {
    __extends(LspError, _super);
    function LspError() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return LspError;
}(dsh_llm_1.HarnessError));
exports.LspError = LspError;
/**
 * Extract a file's final extension as a normalized, lowercase, leading-dot key (e.g. `Foo.TS` →
 * `.ts`, `foo.d.ts` → `.ts`). Returns `''` for a name with no extension or a leading-dot dotfile
 * (`.bashrc`), which no route ever matches. Splits on both `/` and `\` so a caller's path separator
 * does not change the result.
 * @param filePath - the source path to inspect.
 * @returns the normalized extension, or `''` when there is none.
 */
function finalExtension(filePath) {
    var lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    var base = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
    var dot = base.lastIndexOf('.');
    // dot <= 0 covers both "no dot" (-1) and a leading-dot dotfile (0): neither has an extension.
    if (dot <= 0)
        return '';
    return base.slice(dot).toLowerCase();
}
/** A well-formed normalized extension: a dot followed by one or more non-dot, non-separator chars. */
var EXTENSION_PATTERN = /^\.[^./\\]+$/;
/**
 * `ctx.lsp`. Holds the id reservations and the extension→route table; both are populated and cleared
 * together per provider so a route always has a live provider.
 */
var Lsp = /** @class */ (function (_super) {
    __extends(Lsp, _super);
    function Lsp(ctx) {
        var _this = _super.call(this, ctx, 'lsp') || this;
        _this.providerIds = new Set();
        _this.routes = new Map();
        return _this;
    }
    Lsp.prototype.registerProvider = function (provider) {
        // Validate and conflict-check everything BEFORE any mutation: an invalid or conflicting
        // registration must publish nothing (fail-loud, all-or-nothing).
        var id = provider.id;
        if (id.trim() === '') {
            throw new LspError('an LSP provider id must be a non-empty string', 'LSP_INVALID_PROVIDER');
        }
        if (this.providerIds.has(id)) {
            throw new LspError("an LSP provider with id \"".concat(id, "\" is already registered"), 'LSP_CONFLICT');
        }
        var entries = Object.entries(provider.extensionToLanguage);
        if (entries.length === 0) {
            throw new LspError("LSP provider \"".concat(id, "\" registers no file extensions"), 'LSP_INVALID_PROVIDER');
        }
        // Normalize into this provider's route set, catching intra-provider duplicates (e.g. `.TS` and
        // `.ts`) before checking cross-provider conflicts.
        var pending = new Map();
        for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
            var _a = entries_1[_i], rawExt = _a[0], languageId = _a[1];
            var ext = normalizeExtension(rawExt);
            if (!EXTENSION_PATTERN.test(ext)) {
                throw new LspError("LSP provider \"".concat(id, "\" maps an invalid extension \"").concat(rawExt, "\""), 'LSP_INVALID_PROVIDER');
            }
            if (languageId.trim() === '') {
                throw new LspError("LSP provider \"".concat(id, "\" maps extension \"").concat(ext, "\" to an empty language id"), 'LSP_INVALID_PROVIDER');
            }
            if (pending.has(ext)) {
                throw new LspError("LSP provider \"".concat(id, "\" maps extension \"").concat(ext, "\" more than once"), 'LSP_INVALID_PROVIDER');
            }
            pending.set(ext, { provider: provider, languageId: languageId });
        }
        for (var _b = 0, _c = pending.keys(); _b < _c.length; _b++) {
            var ext = _c[_b];
            if (this.routes.has(ext)) {
                throw new LspError("extension \"".concat(ext, "\" is already handled by another LSP provider"), 'LSP_CONFLICT');
            }
        }
        // All checks passed: reserve id and every extension in one lifecycle controller so disposal
        // releases them together.
        var dispose = this.ctx.effect(function () {
            var _i, pending_1, _a, ext, route;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.providerIds.add(id);
                        for (_i = 0, pending_1 = pending; _i < pending_1.length; _i++) {
                            _a = pending_1[_i], ext = _a[0], route = _a[1];
                            this.routes.set(ext, route);
                        }
                        return [4 /*yield*/, function () {
                                _this.providerIds.delete(id);
                                for (var _i = 0, _a = pending.keys(); _i < _a.length; _i++) {
                                    var ext = _a[_i];
                                    _this.routes.delete(ext);
                                }
                            }];
                    case 1:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'lsp.registerProvider()');
        // ctx.effect's disposer returns Promise<void>; our disposer API is synchronous
        // fire-and-forget — discard the (always-resolved) promise.
        return function () { return void dispose(); };
    };
    Lsp.prototype.query = function (request, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var route;
            return __generator(this, function (_a) {
                route = this.routes.get(finalExtension(request.filePath));
                if (route === undefined) {
                    throw new LspError("no LSP provider handles \"".concat(request.filePath, "\""), 'LSP_UNAVAILABLE');
                }
                return [2 /*return*/, route.provider.query(__assign(__assign({}, request), { languageId: route.languageId }), signal)];
            });
        });
    };
    return Lsp;
}(cordis_1.Service));
exports.Lsp = Lsp;
/** Lowercase an extension and ensure it carries a leading dot; `EXTENSION_PATTERN` rejects the rest. */
function normalizeExtension(ext) {
    var lower = ext.toLowerCase();
    return lower.startsWith('.') ? lower : ".".concat(lower);
}
exports.default = Lsp;
