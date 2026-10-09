"use strict";
/**
 * Tool bridge: discovers MCP tools, registers them on the harness ToolRuntime
 * under deterministic server-qualified public names, and handles re-sync when
 * the server's tool list changes.
 *
 * Naming contract (see the mcp-client Agent Note "Naming invariants"): every MCP tool
 * has the stable identity `(serverName, rawName)`; the model-facing public name
 * is `mcp__<serverName>__<rawName>`, normalized to the DeepSeek function-name
 * constraints. The raw name is only ever sent on the wire (`tools/call`); the
 * public name is never parsed to recover it.
 *
 * @module
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
exports.publicToolName = publicToolName;
exports.syncTools = syncTools;
var node_crypto_1 = require("node:crypto");
var node_util_1 = require("node:util");
var types_js_1 = require("@modelcontextprotocol/sdk/types.js");
var zod_1 = require("zod");
var dsh_attachment_1 = require("@z/dsh-attachment");
var dsh_tools_1 = require("@z/dsh-tools");
/**
 * DeepSeek function-name contract: at most 64 characters. Wire-protocol
 * constant, not configuration.
 */
var MAX_PUBLIC_NAME_LENGTH = 64;
/** DeepSeek function-name contract: only `[A-Za-z0-9_-]` is allowed. */
var INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g;
/** Hex chars of the SHA-256 identity hash appended on lossy normalization. */
var HASH_LENGTH = 12;
/** Raw result record: the bridge owns JSON-value validation after transport. */
var RawCallToolResultSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
/** Raster formats supported by the durable attachment vocabulary. */
var IMAGE_MEDIA_TYPES = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
];
/** Canonical RFC 4648 base64, excluding whitespace and URL-safe aliases. */
var CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
/** List without mutating the SDK's per-page output-validator cache. */
function listToolsUncached(client, cursor) {
    return client.request(__assign({ method: 'tools/list' }, cursor === undefined ? {} : { params: { cursor: cursor } }), types_js_1.ListToolsResultSchema);
}
/** Call without the SDK pre-validating an output schema the bridge may not support. */
function callToolUncached(client, rawName, args, exec, opts) {
    return client.request({ method: 'tools/call', params: { name: rawName, arguments: args } }, RawCallToolResultSchema, {
        signal: exec.signal,
        timeout: opts.toolCallTimeoutMs,
    });
}
/**
 * Derive the model-facing public name for one MCP tool.
 *
 * Deterministic pure function of `(serverName, rawName)`: the clean case is
 * `mcp__<serverName>__<rawName>` verbatim. When character replacement or
 * truncation to the DeepSeek function-name contract (64 chars,
 * `[A-Za-z0-9_-]`) changes the name, a 12-hex-char SHA-256 hash of the
 * identity is appended so distinct MCP identities never collapse into the
 * same public name.
 *
 * @param serverName - Stable local namespace from plugin config.
 * @param rawName - The MCP server's own tool name.
 * @returns The globally unique, model-facing ToolRuntime name.
 */
function publicToolName(serverName, rawName) {
    var joined = "mcp__".concat(serverName, "__").concat(rawName);
    var normalized = joined.replace(INVALID_NAME_CHARS, '_');
    if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH)
        return normalized;
    var hash = (0, node_crypto_1.createHash)('sha256').update("".concat(serverName, "\0").concat(rawName)).digest('hex').slice(0, HASH_LENGTH);
    return "".concat(normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1), "_").concat(hash);
}
/**
 * Sync the MCP server's tool list into the harness ToolRuntime.
 *
 * Two phases keep the swap safe:
 *
 * 1. Fetch: drain uncached `tools/list` pagination and build the full next
 *    generation of `ToolDefinition`s under public names. Any failure here
 *    (network error, duplicate raw name in the server's list) rejects and
 *    leaves the previous generation registered untouched.
 * 2. Swap: dispose the previous generation, register the new one. A registry
 *    conflict here can only mean a foreign registration squats on this
 *    server's `mcp__<serverName>__` namespace — the partial generation is
 *    rolled back (zero tools from this server) and logged. Initial strict
 *    synchronization may propagate the conflict so its parent transaction
 *    rejects; ordinary clients and later re-syncs return an empty map.
 *
 * @param client - Connected MCP Client instance used to list and call tools.
 * @param ctx - Cordis context providing the `tools` service for registration.
 * @param opts - Bridge options: server namespace and per-call timeout.
 * @param previous - Disposer map from the prior sync generation; disposed
 *   during the swap phase (only after the fetch phase succeeded).
 * @returns A map of registered public tool names to their unregister
 *   disposers — the exact set of live registrations owned by this server.
 */
function syncTools(client, ctx, opts, previous) {
    return __awaiter(this, void 0, void 0, function () {
        var definitions, cursor, response, _i, _a, tool, publicName, _b, _c, dispose, disposers, _d, definitions_1, _e, publicName, definition, _f, _g, dispose;
        var _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    definitions = new Map();
                    _k.label = 1;
                case 1: return [4 /*yield*/, listToolsUncached(client, cursor)];
                case 2:
                    response = _k.sent();
                    for (_i = 0, _a = response.tools; _i < _a.length; _i++) {
                        tool = _a[_i];
                        publicName = publicToolName(opts.serverName, tool.name);
                        if (definitions.has(publicName)) {
                            throw new Error("mcp-client(".concat(opts.serverName, "): server listed tool \"").concat(tool.name, "\" more than once \u2014 invalid tool list"));
                        }
                        definitions.set(publicName, createDefinition(client, ctx, publicName, tool.name, (_h = tool.description) !== null && _h !== void 0 ? _h : '', tool.inputSchema, supportedOutputSchema(tool.outputSchema), ((_j = tool.execution) === null || _j === void 0 ? void 0 : _j.taskSupport) === 'required', opts));
                    }
                    cursor = response.nextCursor;
                    _k.label = 3;
                case 3:
                    if (cursor) return [3 /*break*/, 1];
                    _k.label = 4;
                case 4:
                    // Phase 2: swap generations.
                    for (_b = 0, _c = previous.values(); _b < _c.length; _b++) {
                        dispose = _c[_b];
                        dispose();
                    }
                    disposers = new Map();
                    try {
                        for (_d = 0, definitions_1 = definitions; _d < definitions_1.length; _d++) {
                            _e = definitions_1[_d], publicName = _e[0], definition = _e[1];
                            disposers.set(publicName, ctx.tools.register(definition));
                        }
                    }
                    catch (error) {
                        // A conflict on an `mcp__<serverName>__`-qualified name means a foreign
                        // registration occupies this server's namespace. Roll back so the model
                        // sees either the full generation or none of it — never a partial set.
                        for (_f = 0, _g = disposers.values(); _f < _g.length; _f++) {
                            dispose = _g[_f];
                            dispose();
                        }
                        ctx.logger.error("mcp-client(".concat(opts.serverName, "): tool registration failed, no tools registered: ").concat(String(error)));
                        if (opts.registrationFailure === 'throw')
                            throw error;
                        return [2 /*return*/, new Map()];
                    }
                    return [2 /*return*/, disposers];
            }
        });
    });
}
/** Keep a supported advertised schema; unsupported MCP vocabulary falls back to JsonValue. */
function supportedOutputSchema(candidate) {
    if (candidate === undefined)
        return undefined;
    try {
        (0, dsh_tools_1.assertSupportedJsonSchema)(candidate);
        return candidate;
    }
    catch (_a) {
        return undefined;
    }
}
/**
 * Build one generation-local tool definition and its execution-local rich projections.
 * @param client - connected MCP client used for calls.
 * @param ctx - plugin context carrying optional attachment and model services.
 * @param publicName - registry-qualified public tool name.
 * @param rawName - MCP wire tool name.
 * @param description - model-facing tool description.
 * @param parameters - MCP input schema.
 * @param structuredSchema - supported structured-output schema, when advertised.
 * @param taskRequired - whether this MCP tool requires unsupported task execution.
 * @param opts - bridge timeout and namespace options.
 * @returns a complete ToolRuntime definition.
 */
function createDefinition(client, ctx, publicName, rawName, description, parameters, structuredSchema, taskRequired, opts) {
    var projections = new WeakMap();
    return {
        name: publicName,
        description: description,
        parameters: parameters,
        output: createOutput(rawName, structuredSchema),
        execute: createExecutor(client, ctx, rawName, taskRequired, opts, projections),
        finalizeContent: function (exec, result) {
            var projection = projections.get(exec);
            if (projection === undefined)
                return undefined;
            projections.delete(exec);
            if (result.isError)
                return undefined;
            if (!(0, node_util_1.isDeepStrictEqual)(result.value, projection.value))
                return undefined;
            if (!(0, node_util_1.isDeepStrictEqual)(result.content, projection.fallback))
                return undefined;
            return projection.content;
        },
    };
}
/** Build the canonical result schema and existing Native text projection. */
function createOutput(rawName, structuredSchema) {
    return {
        schema: {
            type: 'object',
            properties: {
                content: { type: 'array', items: {} },
                structuredContent: structuredSchema !== null && structuredSchema !== void 0 ? structuredSchema : {},
            },
            required: structuredSchema === undefined ? ['content'] : ['content', 'structuredContent'],
            additionalProperties: false,
        },
        render: function (_args, value) {
            var result = value;
            return [{ type: 'text', text: extractText(result.content, rawName) }];
        },
    };
}
/**
 * Create an execute function for one MCP tool. The executor closes over the
 * raw MCP tool name and sends an uncached `tools/call` request with it (never
 * the public name), with abort signal and timeout, then maps the result to
 * harness ContentBlocks. Owning the raw request prevents the SDK's internal
 * per-page schema cache from pre-validating a different contract.
 *
 * When the MCP server returns `isError: true`, the executor throws so that
 * the ToolRuntime's catch path produces an `isError` result for the model.
 */
function createExecutor(client, ctx, rawName, taskRequired, opts, projections) {
    var _this = this;
    return function (args, exec) { return __awaiter(_this, void 0, void 0, function () {
        var agentPreset, argsObj, result, rendered, text_1, content, text, value, fallback, projected;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    agentPreset = (_c = (_b = (_a = exec.agent) === null || _a === void 0 ? void 0 : _a.session) === null || _b === void 0 ? void 0 : _b.header) === null || _c === void 0 ? void 0 : _c.agentPreset;
                    if (agentPreset === 'taskweaver-readonly' || agentPreset === 'taskweaver-planner') {
                        // MCP servers are external capability providers; their annotations are
                        // untrusted and cannot make a tool safe for a read-only/planner agent.
                        // Keep this check in the executor so a model call cannot bypass it by
                        // invoking a schema that was already present in the Host-wide catalog.
                        throw new Error('MCP tools are unavailable to read-only and planner agents');
                    }
                    if (taskRequired) {
                        throw new Error("Tool \"".concat(rawName, "\" requires task-based execution, which this bridge does not support"));
                    }
                    argsObj = (typeof args === 'object' && args !== null ? args : {});
                    return [4 /*yield*/, callToolUncached(client, rawName, argsObj, exec, opts)
                        // The SDK may return a legacy `toolResult` shape; normalize to content array.
                    ];
                case 1:
                    result = _d.sent();
                    // The SDK may return a legacy `toolResult` shape; normalize to content array.
                    if (!Array.isArray(result.content)) {
                        rendered = 'toolResult' in result
                            ? JSON.stringify(result.toolResult)
                            : '(no output)';
                        text_1 = typeof rendered === 'string' ? rendered : '(no output)';
                        if (result.isError === true)
                            throw new Error(text_1);
                        return [2 /*return*/, __assign({ content: [{ type: 'text', text: text_1 }] }, result.structuredContent !== undefined
                                ? { structuredContent: result.structuredContent }
                                : {})];
                    }
                    content = result.content;
                    text = extractText(content, rawName);
                    // MCP isError → throw so ToolRuntime produces an isError result for the model.
                    if (result.isError === true) {
                        throw new Error(text);
                    }
                    value = __assign({ content: content }, result.structuredContent !== undefined
                        ? { structuredContent: result.structuredContent }
                        : {});
                    if (!containsImage(content)) return [3 /*break*/, 3];
                    fallback = [{ type: 'text', text: extractText(content, rawName) }];
                    return [4 /*yield*/, prepareImageProjection(ctx, exec, content, rawName)];
                case 2:
                    projected = _d.sent();
                    projections.set(exec, { value: value, fallback: fallback, content: projected });
                    _d.label = 3;
                case 3: return [2 /*return*/, value];
            }
        });
    }); };
}
/** Whether an untrusted MCP content array contains a declared image block. */
function containsImage(content) {
    return content.some(function (value) { return isRecord(value) && value.type === 'image'; });
}
/** Narrow one JSON value to a string-keyed object. */
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Narrow a declared MIME string to the durable image vocabulary. */
function isImageMediaType(value) {
    return IMAGE_MEDIA_TYPES.includes(value);
}
/** Decode one untrusted MCP image block without accepting base64 aliases. */
function decodeImage(block) {
    if (block.mimeType === undefined || !isImageMediaType(block.mimeType)) {
        throw new Error('the declared media type is not PNG, JPEG, WebP, or GIF');
    }
    if (block.data === undefined || !CANONICAL_BASE64.test(block.data)) {
        throw new Error('the image data is not canonical base64');
    }
    var data = Buffer.from(block.data, 'base64');
    if (data.toString('base64') !== block.data) {
        throw new Error('the image data is not canonical base64');
    }
    return { data: data, mediaType: block.mimeType };
}
/**
 * Resolve the active model route and durable store for an image-bearing result.
 * @param ctx - plugin context with optional services.
 * @param exec - exact tool execution whose agent supplies the latest route.
 * @returns the attachment store after exact positive image-capability proof.
 */
function resolveImageAdmission(ctx, exec) {
    return __awaiter(this, void 0, void 0, function () {
        var attachments, routed, provider, model, llm, info, _a;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    attachments = ctx.get('attachments');
                    if (attachments === undefined)
                        throw new Error('no attachment store is mounted');
                    routed = (_c = (_b = exec.agent) === null || _b === void 0 ? void 0 : _b.session.requestHeader()) === null || _c === void 0 ? void 0 : _c.config;
                    provider = (_d = routed === null || routed === void 0 ? void 0 : routed.provider) !== null && _d !== void 0 ? _d : (_e = exec.agent) === null || _e === void 0 ? void 0 : _e.options.provider;
                    model = (_f = routed === null || routed === void 0 ? void 0 : routed.model) !== null && _f !== void 0 ? _f : (_g = exec.agent) === null || _g === void 0 ? void 0 : _g.options.model;
                    llm = ctx.get('llm');
                    if (provider === undefined || model === undefined || llm === undefined) {
                        throw new Error('the current model route could not be resolved');
                    }
                    _h.label = 1;
                case 1:
                    _h.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, llm.resolveModelInfo(provider, model, exec.signal)];
                case 2:
                    info = _h.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _h.sent();
                    throw new Error('the current model route could not be verified');
                case 4:
                    if (info.inputModalities === undefined || !info.inputModalities.includes('image')) {
                        throw new Error("model \"".concat(model, "\" does not declare image input"));
                    }
                    if (exec.signal.aborted)
                        throw new Error('the tool call was canceled before image storage');
                    return [2 /*return*/, attachments];
            }
        });
    });
}
/** Stable diagnostic text for an image block that was not admitted. */
function imageDiagnostic(block, reason) {
    var _a;
    var mediaType = (_a = block.mimeType) !== null && _a !== void 0 ? _a : 'unknown media type';
    return "[image unavailable: ".concat(mediaType, "; ").concat(reason, "; raw image data remains available to programmatic callers]");
}
/**
 * Decode, preflight, and durably save one MCP result's ordered image batch.
 * Any refusal projects every image as text while retaining the canonical raw
 * value for programmatic callers.
 */
function prepareImageProjection(ctx, exec, content, toolName) {
    return __awaiter(this, void 0, void 0, function () {
        var decoded, validationErrors, imageIndexes, _i, _a, _b, index, value, attachments, error_1, reason_1, refs_1, byIndex_1, error_2, reason_2;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    decoded = [];
                    validationErrors = new Map();
                    imageIndexes = [];
                    for (_i = 0, _a = content.entries(); _i < _a.length; _i++) {
                        _b = _a[_i], index = _b[0], value = _b[1];
                        if (!isRecord(value) || value.type !== 'image')
                            continue;
                        imageIndexes.push(index);
                        try {
                            decoded.push(decodeImage(value));
                        }
                        catch (error) {
                            // decodeImage owns every throw above and always produces Error.
                            validationErrors.set(index, error.message);
                        }
                    }
                    if (validationErrors.size > 0) {
                        return [2 /*return*/, projectContent(content, toolName, function (block, index) {
                                var _a;
                                return ({
                                    type: 'text',
                                    text: imageDiagnostic(block, (_a = validationErrors.get(index)) !== null && _a !== void 0 ? _a : 'another image in the same result was invalid'),
                                });
                            })];
                    }
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, resolveImageAdmission(ctx, exec)];
                case 2:
                    attachments = _c.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _c.sent();
                    reason_1 = error_1.message;
                    return [2 /*return*/, projectContent(content, toolName, function (block) { return ({ type: 'text', text: imageDiagnostic(block, reason_1) }); })];
                case 4:
                    _c.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, attachments.saveImages(decoded)];
                case 5:
                    refs_1 = _c.sent();
                    byIndex_1 = new Map(imageIndexes.map(function (index, offset) { return [index, refs_1[offset]]; }));
                    return [2 /*return*/, projectContent(content, toolName, function (_block, index) { return ({
                            type: 'image',
                            attachment: byIndex_1.get(index),
                        }); })];
                case 6:
                    error_2 = _c.sent();
                    reason_2 = (0, dsh_attachment_1.isImageAdmissionError)(error_2)
                        ? "image admission rejected the result: ".concat(error_2.message)
                        : 'durable image storage rejected the result';
                    return [2 /*return*/, projectContent(content, toolName, function (block) { return ({
                            type: 'text',
                            text: imageDiagnostic(block, reason_2),
                        }); })];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * Extract text from an MCP content array into a single string.
 * - text blocks: join with '\n'
 * - image/audio/resource blocks: replaced with a placeholder
 *
 * Defensive: fields that the MCP spec declares required (mimeType, text) are
 * guarded with fallbacks because this is a network trust boundary.
 */
function extractText(mcpContent, toolName) {
    var content = projectContent(mcpContent, toolName);
    // The default image projector below also returns text, so this local call
    // cannot produce a core image block.
    return content.map(function (block) { return block.text; }).join('\n');
}
/**
 * Project ordered MCP blocks into the core content vocabulary.
 * Text-like runs are newline-coalesced; admitted images split those runs at
 * their original position.
 */
function projectContent(mcpContent, toolName, image) {
    var _a;
    if (image === void 0) { image = function (block) { return ({
        type: 'text',
        text: imageDiagnostic(block, 'this result was not admitted to durable model context'),
    }); }; }
    var projected = [];
    var text = [];
    var flushText = function () {
        if (text.length === 0)
            return;
        projected.push({ type: 'text', text: text.splice(0).join('\n') });
    };
    for (var _i = 0, _b = mcpContent.entries(); _i < _b.length; _i++) {
        var _c = _b[_i], index = _c[0], value = _c[1];
        if (!isRecord(value)) {
            text.push('[unsupported MCP content block: expected an object]');
            continue;
        }
        var block = value;
        switch (block.type) {
            case 'text':
                if (block.text !== undefined)
                    text.push(block.text);
                break;
            case 'image':
                flushText();
                projected.push(image(block, index));
                break;
            case 'resource_link':
                if (block.name === undefined || block.uri === undefined) {
                    text.push('[resource link unavailable: the MCP block is missing its name or URI]');
                }
                else {
                    text.push("Resource link: ".concat(block.name, " (").concat(block.uri, ")"));
                }
                break;
            case 'audio':
                text.push("[audio result unsupported: ".concat((_a = block.mimeType) !== null && _a !== void 0 ? _a : 'unknown media type', "; raw audio data remains available to programmatic callers]"));
                break;
            case 'resource':
                text.push('[embedded resource unsupported; raw resource data remains available to programmatic callers]');
                break;
            default:
                text.push("[unsupported MCP content type: ".concat(block.type, "]"));
        }
    }
    flushText();
    return projected.length > 0
        ? projected
        : [{ type: 'text', text: "(".concat(toolName, " returned no model-visible content)") }];
}
