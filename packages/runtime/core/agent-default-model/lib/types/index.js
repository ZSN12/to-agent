"use strict";
/**
 * Default model selection for an Agent without a session-specific selection.
 *
 * @module @z/dsh-agent-default-model
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
exports.AgentDefaultModelConfig = exports.AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA = exports.AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE = void 0;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_settings_1 = require("@z/dsh-settings");
/** Settings namespace carrying the default model selection for future Agents. */
exports.AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE = (0, dsh_settings_1.settingsNamespace)('agent-default-model');
/** Schema of the default Agent model settings section. */
exports.AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA = schemastery_1.default.object({
    provider: schemastery_1.default.string().required(),
    model: schemastery_1.default.string().required(),
    reasoningEffort: schemastery_1.default.string(),
});
/** Project stored settings onto the Agent-facing selection type. */
function selection(settings) {
    return __assign({ provider: settings.provider, model: settings.model }, settings.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: (0, dsh_llm_1.ReasoningEffortId)(settings.reasoningEffort) });
}
/**
 * Owns the default model selection independently of any Host or transport.
 * The composition entry remains usable without a settings provider; when one
 * is mounted, its user layer is read live.
 */
var AgentDefaultModelConfig = /** @class */ (function (_super) {
    __extends(AgentDefaultModelConfig, _super);
    function AgentDefaultModelConfig(ctx, config) {
        var _this = _super.call(this, ctx, 'agentDefaultModel') || this;
        var entry = { provider: config.provider, model: config.model };
        _this.source = function () { return entry; };
        (0, dsh_settings_1.installSettingsSection)(ctx, exports.AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, exports.AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA, entry, {
            setSource: function (current) { _this.source = current; },
            // Every consumer reads through currentSelection(), so no registration-level fact
            // needs rebuilding when the settings document changes.
            onChange: function () { },
        });
        return _this;
    }
    /**
     * Read the current default model selection.
     * @returns a detached provider, model, and optional reasoning selection.
     */
    AgentDefaultModelConfig.prototype.currentSelection = function () {
        return selection(this.source());
    };
    /**
     * Save the complete default model selection. A deployment without a settings
     * provider keeps its composition entry.
     * @param next - resolved selection accepted by an entry point.
     * @returns fulfillment after the optional settings write settles.
     */
    AgentDefaultModelConfig.prototype.saveSelection = function (next) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, ((_a = this.ctx.get('settings')) === null || _a === void 0 ? void 0 : _a.replace(exports.AGENT_DEFAULT_MODEL_SETTINGS_NAMESPACE, __assign({ provider: next.provider, model: next.model }, next.reasoningEffort === undefined ? {} : { reasoningEffort: String(next.reasoningEffort) })))];
                    case 1:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    AgentDefaultModelConfig.Config = schemastery_1.default.object({
        provider: schemastery_1.default.string().required(),
        model: schemastery_1.default.string().required(),
    });
    return AgentDefaultModelConfig;
}(cordis_1.Service));
exports.AgentDefaultModelConfig = AgentDefaultModelConfig;
exports.default = AgentDefaultModelConfig;
