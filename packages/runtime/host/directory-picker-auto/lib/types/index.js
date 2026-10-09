"use strict";
/**
 * Adaptive chooser of the directory-picker seam: resolves the host's
 * situation once at boot (bind host, SSH launch, display session, Linux
 * chooser binary) and mounts the matching interaction — `native` or `browse`
 * — as real Loader entries in the in-memory root tree. Each interaction is a
 * pair: the Host backend serving the seam capability and the client surface
 * occupying ui-workspace's directory-flow holes. Both arrive as ordinary
 * entries, so the surface is discovered exactly as a config-row's would be
 * and one resolved choice still swaps both faces; pinning an interaction
 * remains composing that pair directly instead of this row.
 * @module @z/dsh-host-directory-picker-auto
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
exports.SURFACE_PACKAGES = exports.BACKEND_PACKAGES = exports.inject = exports.name = exports.resolveDirectoryPickerBackend = exports.hasLinuxChooserBinary = exports.canExecute = void 0;
exports.apply = apply;
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var probe_ts_1 = require("./probe.ts");
var resolve_ts_1 = require("./resolve.ts");
var probe_ts_2 = require("./probe.ts");
Object.defineProperty(exports, "canExecute", { enumerable: true, get: function () { return probe_ts_2.canExecute; } });
Object.defineProperty(exports, "hasLinuxChooserBinary", { enumerable: true, get: function () { return probe_ts_2.hasLinuxChooserBinary; } });
var resolve_ts_2 = require("./resolve.ts");
Object.defineProperty(exports, "resolveDirectoryPickerBackend", { enumerable: true, get: function () { return resolve_ts_2.resolveDirectoryPickerBackend; } });
/** Cordis plugin name. */
exports.name = 'directory-picker-auto';
/** Required services: the effective bind host (`webServer`) and the entry tree the backend mounts into (`loader`). */
exports.inject = ['webServer', 'loader'];
/**
 * Host backend package per resolved kind — fixed composition vocabulary, not a
 * tunable. Exported because the reference is a runtime string the static
 * config gate cannot see in a yml row: `verify-cordis-config` requires every
 * app composing this chooser to declare both values as dependencies.
 */
exports.BACKEND_PACKAGES = {
    native: '@z/dsh-host-directory-picker-native',
    browse: '@z/dsh-host-directory-picker-browse',
};
/**
 * Client surface package per resolved kind, mounted with its backend so one
 * resolved interaction still composes both faces. Declared as dependencies by
 * every composing app for the same reason as {@link BACKEND_PACKAGES}. Only the
 * specifier is referenced here — the packages belong to the Client program, so
 * no import of them exists on this side and knip needs them ignored for this
 * workspace.
 */
exports.SURFACE_PACKAGES = {
    native: '@z/dsh-client-ui-directory-picker-native',
    browse: '@z/dsh-client-ui-directory-picker-browse',
};
/**
 * Resolve the interaction from one boot-time sample and mount its backend and
 * surface as Loader entries; the effect's disposer removes both entries and
 * joins their fibers' teardown, so unloading this plugin returns only after
 * both faces of the mounted interaction (and their dependents) quiesced.
 * @param ctx - cordis context carrying the injected `webServer` and `loader`.
 */
function apply(ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var backend;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    backend = (0, resolve_ts_1.resolveDirectoryPickerBackend)({
                        bindHost: ctx.webServer.host,
                        platform: process.platform,
                        env: process.env,
                        linuxChooser: (0, probe_ts_1.hasLinuxChooserBinary)(process.env.PATH, probe_ts_1.canExecute),
                    });
                    return [4 /*yield*/, ctx.effect(function () { return __awaiter(_this, void 0, void 0, function () {
                            var ids, unmount, packages, _i, packages_1, name_1, _a, _b, cause_1;
                            var _this = this;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        ids = [];
                                        unmount = function () { return __awaiter(_this, void 0, void 0, function () {
                                            var _i, _a, id;
                                            return __generator(this, function (_b) {
                                                switch (_b.label) {
                                                    case 0:
                                                        _i = 0, _a = __spreadArray([], ids, true).reverse();
                                                        _b.label = 1;
                                                    case 1:
                                                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                                                        id = _a[_i];
                                                        // Tree teardown (group.stop) can have removed the entry already;
                                                        // nothing is left to unmount or await then.
                                                        if (ctx.loader.store[id] === undefined)
                                                            return [3 /*break*/, 3];
                                                        // remove() disposes the entry transactionally, so the chooser's unload
                                                        // signals completion only after that face quiesced.
                                                        return [4 /*yield*/, ctx.loader.remove(id)];
                                                    case 2:
                                                        // remove() disposes the entry transactionally, so the chooser's unload
                                                        // signals completion only after that face quiesced.
                                                        _b.sent();
                                                        _b.label = 3;
                                                    case 3:
                                                        _i++;
                                                        return [3 /*break*/, 1];
                                                    case 4: return [2 /*return*/];
                                                }
                                            });
                                        }); };
                                        _c.label = 1;
                                    case 1:
                                        _c.trys.push([1, 6, , 8]);
                                        packages = [exports.BACKEND_PACKAGES[backend]];
                                        // TaskWeaver Electron owns the UI; skip DSH browser directory-picker surfaces.
                                        if (!(0, dsh_home_paths_1.taskweaverEmbeddedFromEnv)()) {
                                            packages.push(exports.SURFACE_PACKAGES[backend]);
                                        }
                                        _i = 0, packages_1 = packages;
                                        _c.label = 2;
                                    case 2:
                                        if (!(_i < packages_1.length)) return [3 /*break*/, 5];
                                        name_1 = packages_1[_i];
                                        _b = (_a = ids).push;
                                        return [4 /*yield*/, ctx.loader.create({ name: name_1 })];
                                    case 3:
                                        _b.apply(_a, [_c.sent()]);
                                        _c.label = 4;
                                    case 4:
                                        _i++;
                                        return [3 /*break*/, 2];
                                    case 5: return [3 /*break*/, 8];
                                    case 6:
                                        cause_1 = _c.sent();
                                        // Setup owns the entries it created until it returns the disposer: leaving
                                        // the backend mounted would make a retry collide with its own
                                        // directoryPicker registration.
                                        return [4 /*yield*/, unmount()];
                                    case 7:
                                        // Setup owns the entries it created until it returns the disposer: leaving
                                        // the backend mounted would make a retry collide with its own
                                        // directoryPicker registration.
                                        _c.sent();
                                        throw cause_1;
                                    case 8: return [2 /*return*/, unmount];
                                }
                            });
                        }); }, 'directory-picker-auto: interaction entries')];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
