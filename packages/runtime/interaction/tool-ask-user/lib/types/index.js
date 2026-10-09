"use strict";
/**
 * Model-facing Consumer of the `ctx.userQuestions` capability seam.
 * The tool pauses until a UI provider returns a human answer, then feeds that
 * answer back into the agent loop as an ordinary tool result.
 *
 * @module @z/dsh-tool-ask-user
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
exports.inject = exports.name = void 0;
exports.apply = apply;
var dsh_tools_1 = require("@z/dsh-tools");
require("@z/dsh-user-questions");
exports.name = 'tool-ask-user';
exports.inject = ['tools', 'userQuestions'];
var description = 'Ask the user a concise question when you need confirmation, a choice, or missing information before proceeding. '
    + 'Send one or more questions, each with a stable id that will be echoed in the answer.';
function apply(ctx) {
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'ask_user_question',
        description: description,
        parameters: {
            questions: {
                type: 'array',
                required: true,
                description: 'Questions to ask the user before continuing.',
                items: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                        id: { type: 'string', required: true, description: 'Stable id for this question; echoed in the answer.' },
                        question: { type: 'string', required: true, description: 'The specific question to ask the user.' },
                        header: {
                            type: 'string',
                            description: 'Optional short heading for the question, such as "Confirm" or "Choose Mode".',
                        },
                        options: {
                            type: 'array',
                            description: 'Optional choices to show the user. If you recommend one, put it first and append "(Recommended)" to that label.',
                            items: {
                                type: 'object',
                                additionalProperties: true,
                                properties: {
                                    label: { type: 'string', required: true, description: 'Short user-facing option label.' },
                                    description: { type: 'string', description: 'One sentence explaining the tradeoff or impact.' },
                                },
                            },
                        },
                        multi_select: {
                            type: 'boolean',
                            description: 'Whether the user may select more than one option. Defaults to false.',
                        },
                    },
                },
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    answers: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                id: { type: 'string', required: true },
                                selected: { type: 'array', required: true, items: { type: 'string' } },
                                custom: { type: 'string' },
                            },
                        },
                    },
                },
            },
            render: function (_args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, ctx.userQuestions.ask(__assign(__assign({ questions: args.questions.map(function (question) { return (__assign(__assign(__assign({ id: question.id, question: question.question }, question.header !== undefined ? { header: question.header } : {}), question.options !== undefined ? { options: question.options } : {}), question.multi_select !== undefined ? { multiSelect: question.multi_select } : {})); }) }, exec.agent !== undefined ? { agent: exec.agent } : {}), { signal: exec.signal }))];
                        case 1:
                            result = _a.sent();
                            return [2 /*return*/, {
                                    answers: result.answers.map(function (answer) { return (__assign({ id: answer.id, selected: __spreadArray([], answer.selected, true) }, answer.custom !== undefined ? { custom: answer.custom } : {})); }),
                                }];
                    }
                });
            });
        },
    }));
}
