"use strict";
/**
 * Local-filesystem implementation of `ctx.fileReferences`.
 *
 * @module @z/dsh-file-reference-local
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
exports.LocalFileReferenceService = exports.formatFileMention = exports.activeAtToken = exports.FILE_REFERENCE_PROMPT = exports.WorkspaceFileSearch = exports.DEFAULT_FILE_SEARCH_MAX_RESULTS = exports.DEFAULT_FILE_SEARCH_MAX_ENTRIES = exports.DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES = void 0;
var schemastery_1 = require("@z/schemastery");
var dsh_file_reference_1 = require("@z/dsh-file-reference");
var search_ts_1 = require("./search.ts");
var search_ts_2 = require("./search.ts");
Object.defineProperty(exports, "DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES", { enumerable: true, get: function () { return search_ts_2.DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES; } });
Object.defineProperty(exports, "DEFAULT_FILE_SEARCH_MAX_ENTRIES", { enumerable: true, get: function () { return search_ts_2.DEFAULT_FILE_SEARCH_MAX_ENTRIES; } });
Object.defineProperty(exports, "DEFAULT_FILE_SEARCH_MAX_RESULTS", { enumerable: true, get: function () { return search_ts_2.DEFAULT_FILE_SEARCH_MAX_RESULTS; } });
Object.defineProperty(exports, "WorkspaceFileSearch", { enumerable: true, get: function () { return search_ts_2.WorkspaceFileSearch; } });
var dsh_file_reference_2 = require("@z/dsh-file-reference");
Object.defineProperty(exports, "FILE_REFERENCE_PROMPT", { enumerable: true, get: function () { return dsh_file_reference_2.FILE_REFERENCE_PROMPT; } });
var grammar_1 = require("@z/dsh-file-reference/grammar");
Object.defineProperty(exports, "activeAtToken", { enumerable: true, get: function () { return grammar_1.activeAtToken; } });
Object.defineProperty(exports, "formatFileMention", { enumerable: true, get: function () { return grammar_1.formatFileMention; } });
/** Local-filesystem owner of the file-reference discovery service. */
var LocalFileReferenceService = /** @class */ (function (_super) {
    __extends(LocalFileReferenceService, _super);
    function LocalFileReferenceService(ctx, config) {
        if (config === void 0) { config = {}; }
        var _a, _b, _c;
        var _this = _super.call(this, ctx) || this;
        _this.searches = new Map();
        _this.promptFibers = new Map();
        _this.promptDisposals = new Set();
        _this.config = {
            maxResults: (_a = config.maxResults) !== null && _a !== void 0 ? _a : search_ts_1.DEFAULT_FILE_SEARCH_MAX_RESULTS,
            maxEntries: (_b = config.maxEntries) !== null && _b !== void 0 ? _b : search_ts_1.DEFAULT_FILE_SEARCH_MAX_ENTRIES,
            excludedDirectories: (_c = config.excludedDirectories) !== null && _c !== void 0 ? _c : search_ts_1.DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES,
        };
        validateConfig(_this.config);
        var installPrompt = function (agent) {
            if (_this.promptFibers.has(agent))
                return;
            var fiber = agent.ctx.inject(['systemPrompt', 'tools'], function (scope) {
                scope.systemPrompt.section({
                    name: 'context:file-reference',
                    order: 99,
                    text: function () { return agent.ctx.tools.get('read', agent) === undefined ? '' : dsh_file_reference_1.FILE_REFERENCE_PROMPT; },
                });
            });
            _this.promptFibers.set(agent, fiber);
        };
        var disposePrompt = function (agent) {
            var fiber = _this.promptFibers.get(agent);
            if (fiber === undefined)
                return;
            _this.promptFibers.delete(agent);
            var task = fiber.dispose().catch(function (error) {
                ctx.logger.warn("file-reference-local: prompt cleanup failed: ".concat(error instanceof Error ? error.message : String(error)));
            });
            _this.promptDisposals.add(task);
            void task.finally(function () {
                _this.promptDisposals.delete(task);
            });
        };
        for (var _i = 0, _d = ctx.agents.list(); _i < _d.length; _i++) {
            var agent = _d[_i];
            installPrompt(agent);
        }
        ctx.on('agent/created', function (_a) {
            var agent = _a.agent;
            installPrompt(agent);
        });
        ctx.on('agent/disposed', function (_a) {
            var _b;
            var agent = _a.agent;
            (_b = _this.searches.get(agent)) === null || _b === void 0 ? void 0 : _b.dispose();
            _this.searches.delete(agent);
            disposePrompt(agent);
        });
        ctx.on('session/event', function (session, event) {
            var _a;
            if (event.type !== 'tool/result')
                return;
            var agent = ctx.agents.get(session.id);
            if (agent !== undefined)
                (_a = _this.searches.get(agent)) === null || _a === void 0 ? void 0 : _a.invalidate();
        });
        ctx.effect(function () { return function () { return __awaiter(_this, void 0, void 0, function () {
            var _i, _a, search, promptFibers;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        for (_i = 0, _a = this.searches.values(); _i < _a.length; _i++) {
                            search = _a[_i];
                            search.dispose();
                        }
                        this.searches.clear();
                        promptFibers = __spreadArray([], this.promptFibers.values(), true);
                        this.promptFibers.clear();
                        return [4 /*yield*/, Promise.all(__spreadArray(__spreadArray([], promptFibers.map(function (fiber) { return fiber.dispose(); }), true), this.promptDisposals, true))];
                    case 1:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        }); }; }, 'file-reference-local: search cache');
        return _this;
    }
    LocalFileReferenceService.prototype.list = function (agent, query, signal) {
        var _a;
        var search = this.searches.get(agent);
        if (search === undefined) {
            search = new search_ts_1.WorkspaceFileSearch((_a = agent.session.header.cwd) !== null && _a !== void 0 ? _a : process.cwd(), this.config);
            this.searches.set(agent, search);
        }
        return search.list(query, signal);
    };
    LocalFileReferenceService.inject = ['agents'];
    LocalFileReferenceService.Config = schemastery_1.default.object({
        maxResults: schemastery_1.default.number().step(1).min(1).default(search_ts_1.DEFAULT_FILE_SEARCH_MAX_RESULTS),
        maxEntries: schemastery_1.default.number().step(1).min(1).default(search_ts_1.DEFAULT_FILE_SEARCH_MAX_ENTRIES),
        excludedDirectories: schemastery_1.default.array(schemastery_1.default.string()).default(__spreadArray([], search_ts_1.DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES, true)),
    });
    return LocalFileReferenceService;
}(dsh_file_reference_1.default));
exports.LocalFileReferenceService = LocalFileReferenceService;
function validateConfig(config) {
    if (!Number.isSafeInteger(config.maxResults) || config.maxResults <= 0) {
        throw new Error('file-reference-local: maxResults must be a positive safe integer');
    }
    if (!Number.isSafeInteger(config.maxEntries) || config.maxEntries <= 0) {
        throw new Error('file-reference-local: maxEntries must be a positive safe integer');
    }
    if (config.excludedDirectories.some(function (name) { return name.length === 0 || name.includes('/') || name.includes('\\'); })) {
        throw new Error('file-reference-local: excludedDirectories entries must be non-empty directory basenames');
    }
}
exports.default = LocalFileReferenceService;
