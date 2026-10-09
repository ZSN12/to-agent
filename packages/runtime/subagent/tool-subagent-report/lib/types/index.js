"use strict";
/**
 * The child-scoped `report` tool and its usage guidance, installed into every
 * continuable in-process child's unpublished context. Roots, one-shot children,
 * remote providers, and agentless executions never see the registration.
 *
 * @module @z/dsh-tool-subagent-report
 */
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
exports.Config = exports.inject = exports.name = void 0;
exports.installReportTool = installReportTool;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_tools_1 = require("@z/dsh-tools");
exports.name = 'tool-subagent-report';
// The contribution registers only through childCtx.tools and
// childCtx.systemPrompt, but declaring both services makes Loader ordering fail
// at load instead of at the next child materialization.
exports.inject = ['subagents', 'tools', 'systemPrompt'];
/** Guidance order after every per-tool section a continuable child can carry. */
var REPORT_SECTION_ORDER = 117;
exports.Config = schemastery_1.default.object({
    reportDelivery: schemastery_1.default.union(['quiet', 'next-step']).default('next-step'),
});
/**
 * Install `report` and its usage guidance into one continuable child's scope.
 * Both registrations are owned by that scope and are therefore invisible to the
 * child's parent and siblings.
 * @param childCtx - child-scoped context receiving the tool and the guidance.
 * @param ctx - service context used for delivery.
 * @param delivery - resolved deployment scheduling policy.
 * @returns disposer that attempts both child registrations before reporting cleanup failures.
 */
function installReportTool(childCtx, ctx, delivery) {
    var disposeSection = childCtx.systemPrompt.section({
        name: 'tool:report',
        order: REPORT_SECTION_ORDER,
        text: 'Deliver your result with the report tool before you finish: call it once with a self-contained '
            + 'answer. The agent that started you shares your workspace but does not automatically receive your '
            + 'transcript, tool output, or reasoning, so a closing remark such as "done" leaves it nothing it can '
            + 'use. Report earlier as well whenever a partial finding changes what that agent should do next; '
            + 'reporting never ends your turn.',
    });
    var disposeTool;
    try {
        disposeTool = childCtx.tools.register((0, dsh_tools_1.defineTool)({
            name: 'report',
            description: 'Report selected content to the agent that started you. Call this once before you finish, with a '
                + 'self-contained final result, and earlier for progress or findings that change what that agent does '
                + 'next. That agent shares your workspace but does not automatically receive your transcript, tool '
                + 'output, or reasoning, so finishing your work is not itself a result. Reporting does not end your '
                + 'turn or finish your work, and only your direct parent receives it. A failed call may still have '
                + 'arrived, so do not blindly repeat it.',
            parameters: {
                output: {
                    type: 'string',
                    required: true,
                    description: 'Actionable content for your parent; summarize conclusions and reference relevant shared paths.',
                },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        messageId: { type: 'string', required: true },
                    },
                },
                render: function (_args, value) { return [{
                        type: 'text',
                        text: "report accepted by the agent that started you as message ".concat(value.messageId),
                    }]; },
            },
            execute: function (args, exec) {
                return __awaiter(this, void 0, void 0, function () {
                    var content, messageId;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                content = [{ type: 'text', text: args.output }];
                                return [4 /*yield*/, ctx.subagents.reportFrom(exec.agent, content, {
                                        delivery: delivery,
                                        signal: exec.signal,
                                    })];
                            case 1:
                                messageId = _a.sent();
                                return [2 /*return*/, { messageId: messageId }];
                        }
                    });
                });
            },
        }));
    }
    catch (error) {
        try {
            disposeSection();
        }
        catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'failed to register the report tool and roll back its prompt guidance');
        }
        throw error;
    }
    return function () {
        var failures = [];
        for (var _i = 0, _a = [disposeTool, disposeSection]; _i < _a.length; _i++) {
            var dispose = _a[_i];
            try {
                dispose();
            }
            catch (error) {
                failures.push(error);
            }
        }
        if (failures.length > 0) {
            throw new AggregateError(failures, 'failed to revoke report tool and prompt registrations');
        }
    };
}
/**
 * Register the continuable-child contribution.
 * @param ctx - context carrying tools, the system prompt, and the subagent service.
 * @param config - deployment scheduling policy.
 */
function apply(ctx, config) {
    if (config === void 0) { config = {}; }
    // Config() applies the schema default at runtime; the schemastery return
    // type keeps the input's optional shape, so assert the resolved one.
    var reportDelivery = (0, exports.Config)(config).reportDelivery;
    ctx.subagents.registerContinuableSetup(function (childCtx) {
        return installReportTool(childCtx, ctx, reportDelivery);
    });
}
