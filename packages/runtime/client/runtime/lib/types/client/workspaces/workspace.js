"use strict";
/** React-free Workspace entity with a client-local materialization lifecycle. */
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
exports.Workspace = void 0;
var api_1 = require("@z/dsh-host-apiproxy/api");
var notifier_ts_1 = require("../sessions/notifier.ts");
/**
 * Observable Workspace object whose identity survives Host materialization.
 * Local instances retain their create input and failure state; materialized
 * instances expose the latest Host view.
 */
var Workspace = /** @class */ (function () {
    /**
     * @param api - shared wire client.
     * @param source - local create input or an existing Host Workspace view.
     */
    function Workspace(api, source) {
        var _this = this;
        this.api = api;
        this.materialization = null;
        this.notifier = new notifier_ts_1.Notifier(function () {
            _this.snapshotCache = _this.buildSnapshot();
        });
        if ('workspaceId' in source) {
            this.view = source;
        }
        else {
            this.intent = {
                input: source,
                snapshot: { name: intentName(source), phase: 'ready' },
            };
        }
        this.snapshotCache = this.buildSnapshot();
    }
    /**
     * Materialize this local Workspace through the Host create API.
     * Re-entry shares the in-flight completion; a materialized instance returns undefined.
     * @returns the Host result, or undefined when this Workspace is already materialized.
     */
    Workspace.prototype.materialize = function () {
        var _this = this;
        if (this.materialization !== null)
            return this.materialization;
        var intent = this.intent;
        if (intent === undefined)
            return undefined;
        intent.snapshot = { name: intent.snapshot.name, phase: 'creating' };
        this.notifier.notifyNow();
        var completion = this.completeMaterialization(intent).finally(function () {
            if (_this.materialization === completion)
                _this.materialization = null;
        });
        this.materialization = completion;
        return completion;
    };
    /**
     * Adopt a Host view without replacing this Workspace object.
     * An existing materialized identity accepts updates only for the same Workspace id.
     * @param view - latest Host projection.
     */
    Workspace.prototype.adopt = function (view) {
        if (this.view !== undefined && this.view.workspaceId !== view.workspaceId) {
            throw new Error('cannot adopt a different Workspace id');
        }
        this.view = view;
        this.intent = undefined;
        this.notifier.markDirty();
    };
    /**
     * Subscribe to Workspace snapshot invalidation.
     * @param listener - snapshot invalidation callback.
     * @returns unsubscribe function.
     */
    Workspace.prototype.subscribe = function (listener) {
        return this.notifier.subscribe(listener);
    };
    /**
     * Read the cached Workspace snapshot after flushing pending notifications.
     * @returns the cached Workspace snapshot.
     */
    Workspace.prototype.getSnapshot = function () {
        this.notifier.ensureFresh();
        return this.snapshotCache;
    };
    Workspace.prototype.completeMaterialization = function (intent) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.api.workspace.create(intent.input)];
                    case 1:
                        result = (_a.sent()).result;
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        result = (0, api_1.transportError)(error_1);
                        return [3 /*break*/, 3];
                    case 3:
                        if (this.intent !== intent)
                            return [2 /*return*/, result];
                        if (result.ok) {
                            this.adopt(result.value.workspace);
                        }
                        else {
                            intent.snapshot = {
                                name: intent.snapshot.name,
                                phase: 'ready',
                                error: "".concat(result.error.code, ": ").concat(result.error.message),
                            };
                            this.notifier.markDirty();
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    Workspace.prototype.buildSnapshot = function () {
        var _a;
        return { view: this.view, intent: (_a = this.intent) === null || _a === void 0 ? void 0 : _a.snapshot };
    };
    return Workspace;
}());
exports.Workspace = Workspace;
function intentName(input) {
    var _a;
    var trimmed = input.path.replace(/[\\/]+$/, '');
    return (_a = trimmed.split(/[\\/]/).pop()) !== null && _a !== void 0 ? _a : input.path;
}
