"use strict";
/**
 * MCP client bridge plugin: connects to an external MCP server and registers
 * its tools on `ctx.tools` under server-qualified public names
 * (`mcp__<serverName>__<rawName>`). Each plugin instance connects to one MCP
 * server; load multiple instances in `cordis.yml` for multiple servers.
 *
 * Namespace plugin (named exports, no default export). Lifecycle is
 * effect-scoped: disposal disconnects from the server, unregisters all tools,
 * and releases the `serverName` namespace reservation. HMR hot-swaps by
 * disposing the old instance and creating a new one; identical `serverName`
 * reproduces identical public tool names.
 *
 * @module @z/dsh-mcp-client
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
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_timeout_1 = require("@z/dsh-timeout");
var connection_ts_1 = require("./connection.ts");
/** Cordis plugin name used by loader diagnostics. */
exports.name = 'mcp-client';
/** Services required by this plugin. */
exports.inject = ['tools'];
/** Default timeout for individual MCP tool calls (ms). */
var DEFAULT_TOOL_CALL_TIMEOUT_MS = 60000;
/** Valid `serverName`, kept below the public tool-name budget. */
var SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
/**
 * Live `serverName` reservations per app, keyed off `ctx.root` (multiple apps
 * in one process — tests — must not see each other's names). A duplicate
 * namespace is a configuration error surfaced at plugin load, never silent
 * shadowing.
 */
var activeServerNames = new WeakMap();
var Reconnect = schemastery_1.default.object({
    enabled: schemastery_1.default.boolean().default(connection_ts_1.RECONNECT_DEFAULTS.enabled),
    initialDelayMs: schemastery_1.default.number().min(1).max(dsh_timeout_1.MAX_TIMER_DELAY_MS).default(connection_ts_1.RECONNECT_DEFAULTS.initialDelayMs),
    maxDelayMs: schemastery_1.default.number().min(1).max(dsh_timeout_1.MAX_TIMER_DELAY_MS).default(connection_ts_1.RECONNECT_DEFAULTS.maxDelayMs),
    maxAttempts: schemastery_1.default.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(connection_ts_1.RECONNECT_DEFAULTS.maxAttempts),
});
exports.Config = schemastery_1.default.union([
    schemastery_1.default.object({
        transport: schemastery_1.default.const('stdio'),
        serverName: schemastery_1.default.string().required().pattern(SERVER_NAME_PATTERN),
        command: schemastery_1.default.string().required(),
        args: schemastery_1.default.array(String).default([]),
        env: schemastery_1.default.dict(String).default({}),
        cwd: schemastery_1.default.string().default(''),
        toolCallTimeoutMs: schemastery_1.default.number().default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
        failOnStartupError: schemastery_1.default.boolean().default(false),
        reconnect: Reconnect,
    }),
    schemastery_1.default.object({
        transport: schemastery_1.default.const('streamable-http'),
        serverName: schemastery_1.default.string().required().pattern(SERVER_NAME_PATTERN),
        url: schemastery_1.default.string().required(),
        headers: schemastery_1.default.dict(String).default({}),
        toolCallTimeoutMs: schemastery_1.default.number().default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
        failOnStartupError: schemastery_1.default.boolean().default(false),
        reconnect: Reconnect,
    }),
]);
// ---- Plugin apply ----
/**
 * Connect one MCP server and publish its initial tool generation before activation.
 * This entry remains explicitly `async`: Cordis treats a prototype-bearing
 * ordinary function as a constructor, whose returned Promise is not startup work.
 * @param ctx - plugin context carrying the tool registry.
 * @param config - resolved transport and server namespace configuration.
 * @returns startup readiness after connection and initial tool discovery settle.
 */
function apply(ctx, config) {
    return __awaiter(this, void 0, void 0, function () {
        var reconnect, connection, outcome;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    reconnect = (0, connection_ts_1.resolveReconnectPolicy)(config.reconnect, "mcp-client(".concat(config.serverName, "): reconnect"));
                    // Reserve the namespace next: a duplicate `serverName` fails THIS instance
                    // at load with an actionable error and leaves the earlier instance intact.
                    ctx.effect(function () {
                        var names = activeServerNames.get(ctx.root);
                        if (!names) {
                            names = new Set();
                            activeServerNames.set(ctx.root, names);
                        }
                        if (names.has(config.serverName)) {
                            throw new Error("mcp-client: serverName \"".concat(config.serverName, "\" is already in use by another mcp-client instance \u2014 pick a unique serverName in cordis.yml"));
                        }
                        names.add(config.serverName);
                        return function () { return void names.delete(config.serverName); };
                    }, 'mcp-client.serverName');
                    connection = (0, connection_ts_1.startConnection)(ctx, config, reconnect);
                    ctx.effect(function () {
                        return function () { return connection.dispose(); };
                    }, 'mcp-client.connection');
                    return [4 /*yield*/, connection.ready];
                case 1:
                    outcome = _a.sent();
                    if (outcome.error !== undefined && config.failOnStartupError) {
                        throw new Error("mcp-client(".concat(config.serverName, "): initial connection or tool synchronization failed"), { cause: outcome.error });
                    }
                    return [2 /*return*/];
            }
        });
    });
}
