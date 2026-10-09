#!/usr/bin/env node
"use strict";
/**
 * Standalone process wrapper for the scriptable mock LLM server.
 * @module @z/dsh-llm-mock-server/src/bin
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
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
var promises_1 = require("node:timers/promises");
var cli_ts_1 = require("./cli.ts");
var index_ts_1 = require("./index.ts");
/* v8 ignore start -- thin process/signal glue; parser and server behavior are covered directly */
try {
    var parsed = (0, cli_ts_1.parseMockLlmCliArgs)(process.argv.slice(2));
    if (parsed.kind === 'help') {
        process.stdout.write(cli_ts_1.MOCK_LLM_CLI_USAGE);
    }
    else {
        var _c = parsed.config, serverOptions = _c.server, listenDelayMs = _c.listenDelayMs, startsUnavailable = _c.startsUnavailable;
        var host = (_a = serverOptions.host) !== null && _a !== void 0 ? _a : '127.0.0.1';
        var port = (_b = serverOptions.port) !== null && _b !== void 0 ? _b : 8000;
        if (startsUnavailable) {
            process.stdout.write("".concat(JSON.stringify({
                type: 'unavailable',
                baseURL: "http://".concat(host, ":").concat(port, "/v1"),
                listenDelayMs: listenDelayMs,
            }), "\n"));
            await (0, promises_1.setTimeout)(listenDelayMs);
        }
        var server_1 = await (0, index_ts_1.startMockLlmServer)(__assign(__assign({}, serverOptions), { onEvent: function (event) { process.stdout.write("".concat(JSON.stringify(event), "\n")); } }));
        process.stdout.write("".concat(JSON.stringify({
            type: 'ready',
            baseURL: "".concat(server_1.baseURL, "/v1"),
            randomSeed: server_1.randomSeed,
        }), "\n"));
        var closing_1 = false;
        var close_1 = function (code) {
            if (closing_1)
                return;
            closing_1 = true;
            void server_1.close().finally(function () { process.exit(code); });
        };
        process.on('SIGINT', function () { close_1(130); });
        process.on('SIGTERM', function () { close_1(143); });
    }
}
catch (error) {
    process.stderr.write("".concat(error instanceof Error ? error.message : String(error), "\n\n").concat(cli_ts_1.MOCK_LLM_CLI_USAGE));
    process.exitCode = 1;
}
/* v8 ignore stop */
