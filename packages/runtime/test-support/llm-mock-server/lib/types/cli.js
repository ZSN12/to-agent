"use strict";
/**
 * Dependency-free CLI parsing for the standalone mock LLM server.
 * @module @z/dsh-llm-mock-server/cli
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
exports.MOCK_LLM_CLI_USAGE = exports.CONNECTION_REFUSED_BEHAVIOR = void 0;
exports.parseMockLlmCliArgs = parseMockLlmCliArgs;
var node_util_1 = require("node:util");
var index_ts_1 = require("./index.ts");
/** Listener lifecycle behavior understood only by the standalone CLI. */
exports.CONNECTION_REFUSED_BEHAVIOR = 'connection_refused';
var BEHAVIORS = new Set(index_ts_1.MOCK_LLM_BEHAVIORS);
var DEFAULT_LISTEN_DELAY_MS = 750;
/** Command usage written for `--help` and invalid arguments. */
exports.MOCK_LLM_CLI_USAGE = "Usage: dsh-llm-mock-server [options]\n\nRequired:\n  --sequence <a,b,...>       Ordered behaviors; connection_refused is allowed first\n\nListener:\n  --host <host>              Default 127.0.0.1\n  --port <port>              Default 8000; required and nonzero for connection_refused\n  --api-key <token>          Validate exact Bearer token when present\n  --listen-delay-ms <ms>     Unavailable interval (default 750 with connection_refused)\n  --repeat-last              Repeat the final request behavior after exhaustion\n  --seed <uint32>            Reproduce random selections\n  --random-weights <a=n,...> Relative weights for concrete behaviors\n\nResponse:\n  --success-text <text>\n  --partial-text <text>\n  --reasoning-text <text>\n  --chunk-size <count>\n  --chunk-delay-ms <ms>\n  --disconnect-delay-ms <ms>\n  --retry-after-ms <ms>\n  --request-id <id>\n  --tool-name <name>\n  --tool-arguments <json>\n\nOther:\n  --help\n";
function numberValue(option, value) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed))
        throw new Error("dsh-llm-mock-server: ".concat(option, " must be a finite number"));
    return parsed;
}
function boundedIntegerValue(option, value, min, max) {
    var parsed = numberValue(option, value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error("dsh-llm-mock-server: ".concat(option, " must be an integer between ").concat(min, " and ").concat(max));
    }
    return parsed;
}
function parseSequence(raw) {
    var entries = raw.split(',').map(function (entry) { return entry.trim(); });
    if (entries.some(function (entry) { return entry.length === 0; })) {
        throw new Error('dsh-llm-mock-server: --sequence must contain non-empty comma-separated behaviors');
    }
    var startsUnavailable = entries[0] === exports.CONNECTION_REFUSED_BEHAVIOR;
    if (entries.slice(1).includes(exports.CONNECTION_REFUSED_BEHAVIOR)) {
        throw new Error('dsh-llm-mock-server: connection_refused is allowed only as the first behavior');
    }
    var requestEntries = startsUnavailable ? entries.slice(1) : entries;
    if (requestEntries.length === 0) {
        throw new Error('dsh-llm-mock-server: connection_refused must be followed by a request behavior');
    }
    for (var _i = 0, requestEntries_1 = requestEntries; _i < requestEntries_1.length; _i++) {
        var entry = requestEntries_1[_i];
        if (!BEHAVIORS.has(entry))
            throw new Error("dsh-llm-mock-server: unknown behavior ".concat(JSON.stringify(entry)));
    }
    return { startsUnavailable: startsUnavailable, sequence: requestEntries };
}
function parseRandomWeights(raw) {
    var weights = {};
    for (var _i = 0, _a = raw.split(','); _i < _a.length; _i++) {
        var entry = _a[_i];
        var _b = entry.split('='), behavior = _b[0], rawWeight = _b[1], extra = _b.slice(2);
        if (behavior === undefined || behavior === '' || rawWeight === undefined || rawWeight === '' || extra.length > 0) {
            throw new Error('dsh-llm-mock-server: --random-weights expects behavior=weight comma-separated entries');
        }
        if (!BEHAVIORS.has(behavior) || behavior === 'random') {
            throw new Error("dsh-llm-mock-server: random weight requires a concrete behavior, got ".concat(JSON.stringify(behavior)));
        }
        if (Object.hasOwn(weights, behavior)) {
            throw new Error("dsh-llm-mock-server: duplicate random weight for ".concat(JSON.stringify(behavior)));
        }
        weights[behavior] = numberValue('--random-weights', rawWeight);
    }
    return weights;
}
/** parseArgs vocabulary: every documented flag; only `--repeat-last` and `--help` are boolean. */
var CLI_OPTIONS = {
    'sequence': { type: 'string' },
    'host': { type: 'string' },
    'port': { type: 'string' },
    'api-key': { type: 'string' },
    'listen-delay-ms': { type: 'string' },
    'repeat-last': { type: 'boolean' },
    'seed': { type: 'string' },
    'random-weights': { type: 'string' },
    'success-text': { type: 'string' },
    'partial-text': { type: 'string' },
    'reasoning-text': { type: 'string' },
    'chunk-size': { type: 'string' },
    'chunk-delay-ms': { type: 'string' },
    'disconnect-delay-ms': { type: 'string' },
    'retry-after-ms': { type: 'string' },
    'request-id': { type: 'string' },
    'tool-name': { type: 'string' },
    'tool-arguments': { type: 'string' },
};
/**
 * Parse standalone server arguments without starting a process or listener.
 * Tokenizing rides `node:util` `parseArgs` (strict, no positionals); numeric
 * coercion, bounds, and cross-option constraints remain manual below it.
 * @param argv - arguments after the executable name.
 * @returns help or validated run configuration.
 */
function parseMockLlmCliArgs(argv) {
    var _a;
    if (argv.includes('--help'))
        return { kind: 'help' };
    var values = (0, node_util_1.parseArgs)({ args: __spreadArray([], argv, true), options: CLI_OPTIONS, strict: true, allowPositionals: false }).values;
    var host = values.host;
    var port = values.port === undefined ? 8000 : numberValue('--port', values.port);
    var apiKey = values['api-key'];
    var listenDelayMs = values['listen-delay-ms'] === undefined
        ? undefined
        : boundedIntegerValue('--listen-delay-ms', values['listen-delay-ms'], 0, index_ts_1.MAX_MOCK_LLM_TIMER_DELAY_MS);
    var repeatLast = (_a = values['repeat-last']) !== null && _a !== void 0 ? _a : false;
    var randomSeed = values.seed === undefined ? undefined : numberValue('--seed', values.seed);
    var randomWeights = values['random-weights'] === undefined ? undefined : parseRandomWeights(values['random-weights']);
    var successText = values['success-text'];
    var partialText = values['partial-text'];
    var reasoningText = values['reasoning-text'];
    var chunkSize = values['chunk-size'] === undefined ? undefined : numberValue('--chunk-size', values['chunk-size']);
    var chunkDelayMs = values['chunk-delay-ms'] === undefined ? undefined : numberValue('--chunk-delay-ms', values['chunk-delay-ms']);
    var disconnectDelayMs = values['disconnect-delay-ms'] === undefined
        ? undefined
        : numberValue('--disconnect-delay-ms', values['disconnect-delay-ms']);
    var retryAfterMs = values['retry-after-ms'] === undefined ? undefined : numberValue('--retry-after-ms', values['retry-after-ms']);
    var requestId = values['request-id'];
    var toolName = values['tool-name'];
    var toolArguments = values['tool-arguments'];
    if (values.sequence === undefined)
        throw new Error('dsh-llm-mock-server: --sequence is required');
    var sequenceRaw = values.sequence;
    var parsedSequence = parseSequence(sequenceRaw);
    if (parsedSequence.startsUnavailable && port === 0) {
        throw new Error('dsh-llm-mock-server: connection_refused requires an explicit nonzero --port');
    }
    if (!parsedSequence.startsUnavailable && listenDelayMs !== undefined) {
        throw new Error('dsh-llm-mock-server: --listen-delay-ms requires connection_refused first in --sequence');
    }
    if (!parsedSequence.sequence.includes('random') && (randomSeed !== undefined || randomWeights !== undefined)) {
        throw new Error('dsh-llm-mock-server: --seed and --random-weights require random in --sequence');
    }
    return {
        kind: 'run',
        config: {
            server: __assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign({ sequence: parsedSequence.sequence, port: port, repeatLast: repeatLast }, randomSeed === undefined ? {} : { randomSeed: randomSeed }), randomWeights === undefined ? {} : { randomWeights: randomWeights }), host === undefined ? {} : { host: host }), apiKey === undefined ? {} : { apiKey: apiKey }), successText === undefined ? {} : { successText: successText }), partialText === undefined ? {} : { partialText: partialText }), reasoningText === undefined ? {} : { reasoningText: reasoningText }), chunkSize === undefined ? {} : { chunkSize: chunkSize }), chunkDelayMs === undefined ? {} : { chunkDelayMs: chunkDelayMs }), disconnectDelayMs === undefined ? {} : { disconnectDelayMs: disconnectDelayMs }), retryAfterMs === undefined ? {} : { retryAfterMs: retryAfterMs }), requestId === undefined ? {} : { requestId: requestId }), toolName === undefined ? {} : { toolName: toolName }), toolArguments === undefined ? {} : { toolArguments: toolArguments }),
            listenDelayMs: parsedSequence.startsUnavailable ? listenDelayMs !== null && listenDelayMs !== void 0 ? listenDelayMs : DEFAULT_LISTEN_DELAY_MS : 0,
            startsUnavailable: parsedSequence.startsUnavailable,
        },
    };
}
