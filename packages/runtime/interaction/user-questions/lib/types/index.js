"use strict";
/**
 * Service Definition for the user-questions capability seam (`ctx.userQuestions`): a UI-backed service for
 * pausing an agent tool call until the human answers a question. The model-
 * facing tool lives in `@z/dsh-tool-ask-user`; UI packages provide
 * the single active provider.
 *
 * @module @z/dsh-user-questions
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserQuestionService = exports.UserQuestionError = void 0;
var cordis_1 = require("@z/cordis");
var dsh_llm_1 = require("@z/dsh-llm");
/** Stable error taxonomy for user-questions failures. */
var UserQuestionError = /** @class */ (function (_super) {
    __extends(UserQuestionError, _super);
    function UserQuestionError(message, code, options) {
        var _this = _super.call(this, message, code, options) || this;
        _this.name = 'UserQuestionError';
        return _this;
    }
    return UserQuestionError;
}(dsh_llm_1.HarnessError));
exports.UserQuestionError = UserQuestionError;
/** `ctx.userQuestions`: one active UI provider plus an `ask()` API. */
var UserQuestionService = /** @class */ (function (_super) {
    __extends(UserQuestionService, _super);
    function UserQuestionService(ctx) {
        return _super.call(this, ctx, 'userQuestions') || this;
    }
    /**
     * Register the UI provider. Only one provider may be active in a context.
     *
     * @param provider UI-side implementation that collects answers.
     * @returns Disposer that unregisters this provider.
     */
    UserQuestionService.prototype.registerProvider = function (provider) {
        var dispose = this.ctx.effect(function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.provider !== undefined) {
                            throw new UserQuestionError('a user-questions provider is already registered', 'DUPLICATE_PROVIDER');
                        }
                        this.provider = provider;
                        return [4 /*yield*/, function () {
                                _this.provider = undefined;
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'userInteraction.registerProvider()');
        return function () { return void dispose(); };
    };
    /**
     * Ask the active UI provider and wait for the user's answer.
     *
     * When a caller supplies an agent, human interaction is valid only for the
     * exact live runtime root. Runtime ownership, not durable session lineage,
     * decides this boundary: an owned child has no human answerer and would
     * block forever, while a lineage-bearing session resumed as a new runtime
     * root may ask normally.
     *
     * @param request Questions, owner agent, and abort signal.
     * @returns The answer chosen or typed by the human.
     * @throws {UserQuestionError} code `CALLER_NOT_LIVE` when a supplied
     *   agent is not the registry's exact live instance, or `DELEGATED_CALLER`
     *   when that live agent is owned by another agent.
     */
    UserQuestionService.prototype.ask = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var agent, agents, _loop_1, _i, _a, question;
            var _b, _c;
            return __generator(this, function (_d) {
                if ((_b = request.signal) === null || _b === void 0 ? void 0 : _b.aborted) {
                    throw new UserQuestionError('ask_user_question was aborted before the user answered', 'ASK_ABORTED');
                }
                if (request.questions.length === 0) {
                    throw new UserQuestionError('ask_user_question requires at least one question', 'EMPTY_QUESTIONS');
                }
                agent = request.agent;
                if (agent !== undefined) {
                    agents = this.ctx.get('agents');
                    if (agents === undefined || agents.get(agent.id) !== agent) {
                        throw new UserQuestionError('human interaction requires the exact live calling agent when an agent is supplied', 'CALLER_NOT_LIVE');
                    }
                    if (!agents.roots().includes(agent)) {
                        throw new UserQuestionError('human interaction is unavailable while the calling agent is owned by another live agent; '
                            + "include the unresolved question or decision in the child agent's final result", 'DELEGATED_CALLER');
                    }
                }
                _loop_1 = function (question) {
                    var intent = question.intent;
                    if (intent === undefined)
                        return "continue";
                    if (!((_c = question.options) !== null && _c !== void 0 ? _c : []).some(function (option) { return option.label === intent.approve; })) {
                        throw new UserQuestionError("question ".concat(question.id, " declares intent ").concat(intent.kind, " whose approve label ")
                            + "".concat(JSON.stringify(intent.approve), " names none of its options"), 'BAD_INTENT');
                    }
                    if (question.detail === undefined) {
                        throw new UserQuestionError("question ".concat(question.id, " declares intent ").concat(intent.kind, " without the detail it reviews"), 'BAD_INTENT');
                    }
                };
                // A presentation intent asserts two things the types cannot: that the
                // named approve label is one of this question's own options, and that a
                // plan-review carries the plan it is a review of. A UI honouring the
                // intent answers with that label, and shows that detail as the plan, so
                // either gap would put a choice the asker never offered — or an approval of
                // something invisible — in front of the user. Caught at the asker, where
                // the mistake is, rather than in each UI.
                for (_i = 0, _a = request.questions; _i < _a.length; _i++) {
                    question = _a[_i];
                    _loop_1(question);
                }
                if (this.provider === undefined) {
                    throw new UserQuestionError('no user-questions provider is registered', 'NO_PROVIDER');
                }
                return [2 /*return*/, this.provider.ask(request)];
            });
        });
    };
    return UserQuestionService;
}(cordis_1.Service));
exports.UserQuestionService = UserQuestionService;
exports.default = UserQuestionService;
