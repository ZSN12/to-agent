"use strict";
/**
 * @z/dsh-host-webserver — Web route-registration plugin: a node:http
 * server plus the `webServer` service (HTTP and upgrade route registries, the
 * structured index injection table with raw transform taps behind it, and the
 * single fallback seat for everything no route claims). Knows no harness concepts and serves no files; the composing
 * application's frontend plugin owns dist serving through the fallback hook.
 * Web shape only — Electron loads dist over file:// and carries fetch over an
 * IPC bridge. This package never prints: the URL line belongs to the shell.
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
exports.WebServer = exports.renderIndexInjections = void 0;
var node_http_1 = require("node:http");
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var injections_ts_1 = require("./injections.ts");
var injections_ts_2 = require("./injections.ts");
Object.defineProperty(exports, "renderIndexInjections", { enumerable: true, get: function () { return injections_ts_2.renderIndexInjections; } });
/**
 * The browser HTTP carrier service. Activation listens immediately. Route
 * registration order does not affect requests because configured named routes
 * must be distinct, and the fallback handler answers anything not yet claimed
 * during startup with 404 until its owner registers. A listen failure rejects
 * initialization, and the boot process reports the failed fiber.
 */
var WebServer = /** @class */ (function (_super) {
    __extends(WebServer, _super);
    function WebServer(ctx, config) {
        var _this = _super.call(this, ctx, 'webServer') || this;
        _this.config = config;
        _this.exact = new Map();
        _this.prefixes = new Map();
        _this.upgrades = new Map();
        _this.upgradedSockets = new Set();
        _this.indexTaps = [];
        return _this;
    }
    Object.defineProperty(WebServer.prototype, "port", {
        /** The listening port (the OS-assigned value when config.port is 0). */
        get: function () {
            return this.listenedPort;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(WebServer.prototype, "host", {
        /** The configured bind host (the loopback or all-interfaces literal). */
        get: function () {
            return this.config.host;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Register a named route. Duplicate (kind, path) throws — route patterns are
     * a composition-level contract, so a collision is a misconfiguration.
     * @param route - kind, path, and the owning handler.
     * @returns the disposer removing the route.
     */
    WebServer.prototype.register = function (route) {
        var table = route.kind === 'exact' ? this.exact : this.prefixes;
        if (table.has(route.path)) {
            throw new Error("webserver: duplicate ".concat(route.kind, " route \"").concat(route.path, "\""));
        }
        table.set(route.path, route);
        return function () { table.delete(route.path); };
    };
    /**
     * Register an exact-path HTTP upgrade route. Duplicate paths throw because
     * one socket can have only one protocol owner.
     * @param route - pathname and handler owning negotiation plus socket use.
     * @returns the disposer removing the route.
     */
    WebServer.prototype.registerUpgrade = function (route) {
        var _this = this;
        if (this.upgrades.has(route.path)) {
            throw new Error("webserver: duplicate upgrade route \"".concat(route.path, "\""));
        }
        this.upgrades.set(route.path, route);
        return function () { _this.upgrades.delete(route.path); };
    };
    /**
     * Claim the fallback seat: the handler answering every request no named
     * route matches (the SPA dist server in the shipped Web composition). One
     * owner only — a second registration throws, because two fallbacks cannot
     * compose.
     * @param handler - owns the full response lifecycle of unmatched requests.
     * @returns the disposer releasing the seat.
     */
    WebServer.prototype.registerFallback = function (handler) {
        var _this = this;
        if (this.fallback !== undefined) {
            throw new Error('webserver: fallback already registered');
        }
        this.fallback = handler;
        return function () { _this.fallback = undefined; };
    };
    /**
     * Register a raw-HTML index transform, the escape hatch for markup no
     * {@link IndexInjection} row expresses: {@link renderIndex} applies taps in
     * registration order after rendering the structured rows.
     * @param transform - pure html-to-html function.
     * @returns the disposer removing the transform.
     */
    WebServer.prototype.tapIndex = function (transform) {
        var _this = this;
        this.indexTaps.push(transform);
        return function () {
            var at = _this.indexTaps.indexOf(transform);
            if (at !== -1)
                _this.indexTaps.splice(at, 1);
        };
    };
    /** Listen; resolves once the socket is bound (rejection = FAILED fiber). */
    WebServer.prototype[cordis_1.Service.init] = function () {
        return __awaiter(this, void 0, void 0, function () {
            var handle;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        handle = function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                            var rawPath, route, fallback;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        rawPath = new URL((_a = req.url) !== null && _a !== void 0 ? _a : '/', 'http://x').pathname;
                                        route = this.match(rawPath);
                                        if (!(route !== undefined)) return [3 /*break*/, 2];
                                        return [4 /*yield*/, route.handler(req, res)];
                                    case 1:
                                        _b.sent();
                                        return [2 /*return*/];
                                    case 2:
                                        fallback = this.fallback;
                                        if (fallback === undefined) {
                                            res.writeHead(404);
                                            res.end();
                                            return [2 /*return*/];
                                        }
                                        return [4 /*yield*/, fallback(req, res)];
                                    case 3:
                                        _b.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); };
                        // Last-resort guard: handle() rejecting would otherwise be an unhandled
                        // rejection killing the process on one malformed request (bad %-escape,
                        // client dropping mid-body). Per-request failures log and answer 400 —
                        // never a process exit.
                        this.server = (0, node_http_1.createServer)(function (req, res) {
                            handle(req, res).catch(function (err) {
                                _this.ctx.logger.warn(err instanceof Error ? err : new Error(String(err)));
                                if (res.headersSent) {
                                    res.destroy();
                                    return;
                                }
                                res.writeHead(400);
                                res.end();
                            });
                        });
                        this.server.on('upgrade', function (req, socket, head) {
                            var _a;
                            var onError = function (error) {
                                _this.ctx.logger.warn(error);
                                socket.destroy();
                            };
                            socket.on('error', onError);
                            socket.once('close', function () {
                                socket.off('error', onError);
                                _this.upgradedSockets.delete(socket);
                            });
                            var route;
                            try {
                                /* v8 ignore next -- node:http always sets url on server requests. */
                                route = _this.upgrades.get(new URL((_a = req.url) !== null && _a !== void 0 ? _a : '/', 'http://x').pathname);
                            }
                            catch (error) {
                                _this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
                                socket.destroy();
                                return;
                            }
                            if (route === undefined) {
                                socket.destroy();
                                return;
                            }
                            _this.upgradedSockets.add(socket);
                            try {
                                Promise.resolve(route.handler(req, socket, head)).catch(function (error) {
                                    _this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
                                    socket.destroy();
                                });
                            }
                            catch (error) {
                                _this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
                                socket.destroy();
                            }
                        });
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                _this.server.once('error', reject);
                                _this.server.listen(_this.config.port, _this.config.host, function () {
                                    _this.server.off('error', reject);
                                    _this.server.on('error', function (err) { _this.ctx.logger.error(err); });
                                    _this.listenedPort = _this.server.address().port;
                                    resolve();
                                });
                            })
                            // Node does not include upgraded sockets in closeAllConnections(). The service
                            // owns them with the other connections, so it tracks and destroys them explicitly.
                        ];
                    case 1:
                        _a.sent();
                        // Node does not include upgraded sockets in closeAllConnections(). The service
                        // owns them with the other connections, so it tracks and destroys them explicitly.
                        this.ctx.effect(function () { return function () { return __awaiter(_this, void 0, void 0, function () {
                            var serverClosed, upgradedClosed;
                            var _this = this;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        serverClosed = new Promise(function (resolve) {
                                            _this.server.close(function () { resolve(); });
                                        });
                                        this.server.closeAllConnections();
                                        upgradedClosed = __spreadArray([], this.upgradedSockets, true).map(function (socket) { return new Promise(function (resolve) {
                                            socket.once('close', function () { resolve(); });
                                            socket.destroy();
                                        }); });
                                        return [4 /*yield*/, Promise.all(__spreadArray([serverClosed], upgradedClosed, true))];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); }; }, 'webServer.listen');
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Longest-prefix-wins over the prefix table after an exact-table miss. */
    WebServer.prototype.match = function (pathname) {
        var exact = this.exact.get(pathname);
        if (exact !== undefined)
            return exact;
        var best;
        for (var _i = 0, _a = this.prefixes; _i < _a.length; _i++) {
            var _b = _a[_i], prefix = _b[0], route = _b[1];
            if (pathname !== prefix && !pathname.startsWith("".concat(prefix, "/")))
                continue;
            if (best === undefined || prefix.length > best.path.length)
                best = route;
        }
        return best;
    };
    /**
     * Run an index.html body through the registered taps in registration order
     * — called by the fallback owner on every index response it renders.
     * @param html - the raw index.html body.
     * @returns the transformed body.
     */
    WebServer.prototype.applyIndexTaps = function (html) {
        var out = html;
        for (var _i = 0, _a = this.indexTaps; _i < _a.length; _i++) {
            var transform = _a[_i];
            out = transform(out);
        }
        return out;
    };
    /**
     * Gather the structured injection table: one `webserver/index-inject` emit,
     * every subscriber pushes its current rows. Fresh per call, so subscribers
     * read live state (module graph, theme preference) at emit time.
     * @returns rows in subscriber activation order.
     */
    WebServer.prototype.collectIndexInjections = function () {
        var table = [];
        this.ctx.emit('webserver/index-inject', table);
        return table;
    };
    /**
     * Render one index.html body: the structured injection table first, then
     * the raw `tapIndex` transforms over the result.
     * @param html - the raw index.html body.
     * @returns the transformed body.
     */
    WebServer.prototype.renderIndex = function (html) {
        return this.applyIndexTaps((0, injections_ts_1.renderIndexInjections)(html, this.collectIndexInjections()));
    };
    WebServer.Config = schemastery_1.default.object({
        host: schemastery_1.default.union([schemastery_1.default.const('127.0.0.1'), schemastery_1.default.const('0.0.0.0')]).required(),
        port: schemastery_1.default.natural().max(65535).required(),
    });
    return WebServer;
}(cordis_1.Service));
exports.WebServer = WebServer;
exports.default = WebServer;
