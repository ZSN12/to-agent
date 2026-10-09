"use strict";
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
exports.inject = exports.transportError = exports.AbstractApiClient = exports.RpcId = void 0;
exports.apply = apply;
var connection_ts_1 = require("./connection.ts");
var fixture_ts_1 = require("./fixture.ts");
var web_api_client_ts_1 = require("./web-api-client.ts");
var rpc_ts_1 = require("./rpc.ts");
var loopback_hostname_ts_1 = require("../loopback-hostname.ts");
var api_ts_1 = require("./api.ts");
Object.defineProperty(exports, "RpcId", { enumerable: true, get: function () { return api_ts_1.RpcId; } });
Object.defineProperty(exports, "AbstractApiClient", { enumerable: true, get: function () { return api_ts_1.AbstractApiClient; } });
Object.defineProperty(exports, "transportError", { enumerable: true, get: function () { return api_ts_1.transportError; } });
/** Required services (none — this is the wire root). */
exports.inject = [];
/**
 * Client plugin body: pick the api by page mode and provide ctx.connection.
 * @param ctx - client cordis context.
 */
function apply(ctx) {
    var _a, _b;
    var pageLocation = typeof location === 'undefined' ? undefined : location;
    var fixture = pageLocation !== undefined && new URLSearchParams(pageLocation.search).has('fixture');
    var fixtureClient = fixture ? new fixture_ts_1.FixtureApiClient() : undefined;
    var transport = globalThis.__DSH_TRANSPORT__;
    var api = (_a = fixtureClient !== null && fixtureClient !== void 0 ? fixtureClient : transport === null || transport === void 0 ? void 0 : transport.createApiClient()) !== null && _a !== void 0 ? _a : new web_api_client_ts_1.WebApiClient();
    var rpc = (_b = fixtureClient === null || fixtureClient === void 0 ? void 0 : fixtureClient.rpc) !== null && _b !== void 0 ? _b : (0, rpc_ts_1.createWebConnectionRpc)(transport === null || transport === void 0 ? void 0 : transport.fetch);
    var started = false;
    var description;
    var descriptionListeners = new Set();
    var publishDescription = function (next) {
        if (Object.is(description, next))
            return;
        description = next;
        for (var _i = 0, _a = __spreadArray([], descriptionListeners, true); _i < _a.length; _i++) {
            var listener = _a[_i];
            try {
                listener();
            }
            catch (error) {
                console.error('[web-runtime] host-description listener threw:', error);
            }
        }
    };
    var handle = {
        api: api,
        isLoopback: pageLocation === undefined || (0, loopback_hostname_ts_1.isLoopbackHostname)(pageLocation.hostname),
        hostDescription: {
            getSnapshot: function () { return description; },
            subscribe: function (listener) {
                descriptionListeners.add(listener);
                return function () { descriptionListeners.delete(listener); };
            },
        },
        rpc: rpc,
        start: function (sinks, config) {
            if (started)
                throw new Error('connection: the stream loop is already owned by another consumer');
            started = true;
            var controller = new connection_ts_1.ConnectionController(api, __assign(__assign({}, sinks), { onConnected: function (next) {
                    var _a;
                    publishDescription(next);
                    // A description subscriber may synchronously stop the loop. In that
                    // case publishDescription(undefined) has already retracted this
                    // generation, so do not leak its stale connected notification to
                    // the consumer sink afterward.
                    if (!Object.is(description, next))
                        return;
                    (_a = sinks.onConnected) === null || _a === void 0 ? void 0 : _a.call(sinks, next);
                }, onStateChange: function (state) {
                    var _a;
                    if (state === 'reconnecting')
                        publishDescription(undefined);
                    (_a = sinks.onStateChange) === null || _a === void 0 ? void 0 : _a.call(sinks, state);
                } }), config !== null && config !== void 0 ? config : {});
            controller.start();
            return {
                stop: function () {
                    controller.stop();
                    publishDescription(undefined);
                },
            };
        },
    };
    ctx.provide('connection', handle);
}
