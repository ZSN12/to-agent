"use strict";
/**
 * The globally named `send_message` and `interrupt_agent` tools: thin
 * model-facing adapters over `ctx.subagents.followup()` and
 * `ctx.subagents.interrupt()`. They perform no lifecycle routing of their own —
 * residency, cold resume, and interrupt authorization belong to the subagent
 * service — and they live apart from the provider-bound
 * `@z/dsh-tool-subagent` instances so multiple delegation tools share
 * one control API.
 * @module @z/dsh-tool-subagent-control
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
exports.inject = exports.name = void 0;
exports.apply = apply;
var dsh_tools_1 = require("@z/dsh-tools");
var dsh_session_1 = require("@z/dsh-session");
exports.name = 'tool-subagent-control';
exports.inject = ['tools', 'subagents'];
/**
 * Register the `send_message` and `interrupt_agent` tools.
 * @param ctx - context carrying the tool registry and subagent service.
 */
function apply(ctx) {
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'send_message',
        description: 'Send a message to a background subagent by its subagent id, continuing the same conversation. It '
            + 'becomes the subagent\'s next turn: if it is still working, the message waits until its current turn '
            + 'finishes, so it cannot redirect work already underway. This call returns no answer from the '
            + 'subagent — only confirmation that the message was delivered — so use it to give it more work. A '
            + 'failure means the message was NOT delivered.',
        parameters: {
            subagent_id: {
                type: 'string',
                required: true,
                description: 'The subagent id returned when the background subagent was started.',
            },
            message: {
                type: 'string',
                required: true,
                description: 'The message to deliver to the subagent.',
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
            render: function (args, _value) { return [{
                    type: 'text',
                    text: "message queued as the next turn for subagent ".concat(args.subagent_id),
                }]; },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var parent, message, messageId;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            parent = exec.agent;
                            if (!parent) {
                                // Parent authority requires an exact live calling agent.
                                throw new Error('send_message requires a calling agent (exec.agent was undefined)');
                            }
                            message = [{ type: 'text', text: args.message }];
                            return [4 /*yield*/, ctx.subagents.followup(parent, (0, dsh_session_1.SessionId)(args.subagent_id), message, {
                                    source: { kind: 'coordinator', form: 'relay', senderSessionId: parent.id },
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
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'interrupt_agent',
        description: 'Request cancellation of a background agent\'s current turn by its agent id. The target may be your '
            + 'direct child or a deeper agent created under you. Only the current turn stops: messages already '
            + 'queued for the agent stay parked until a later send_message, agents it started keep running, and '
            + 'the agent itself stays available for follow-ups. This call returns as soon as the stop request is '
            + 'accepted, so the target may keep running briefly; interrupting an agent that already finished is '
            + 'an accepted no-op.',
        parameters: {
            agent_id: {
                type: 'string',
                required: true,
                description: 'The agent id of the running agent to interrupt.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    accepted: { type: 'boolean', required: true },
                },
            },
            render: function (args, _value) { return [{
                    type: 'text',
                    text: "interrupt requested for agent ".concat(args.agent_id),
                }]; },
        },
        execute: function (args, exec) {
            var caller = exec.agent;
            if (!caller) {
                // Ancestor authority requires an exact live calling agent.
                throw new Error('interrupt_agent requires a calling agent (exec.agent was undefined)');
            }
            // The service authorizes the exact live caller against the target's
            // recorded lineage; the tool adds no authority of its own.
            ctx.subagents.interrupt((0, dsh_session_1.SessionId)(args.agent_id), { kind: 'ancestor', agent: caller });
            return Promise.resolve({ accepted: true });
        },
    }));
}
