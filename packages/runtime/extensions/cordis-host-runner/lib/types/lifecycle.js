"use strict";
/**
 * Host-half fiber lifecycle over the `cordis-dynamic` group: settle a
 * sandbox-produced plugin as a child fiber (never leaving a failed fiber
 * mounted), and report the services a settled-but-pending fiber still waits
 * for. Stopping needs no helper — a host half unwinds through an ordinary
 * awaited `fiber.dispose()`, because everything the plugin registered is an
 * effect on its fiber.
 * @module @z/dsh-cordis-host-runner/lifecycle
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
exports.startHostHalf = startHostHalf;
exports.missingServices = missingServices;
var guard_ts_1 = require("./guard.ts");
/**
 * Await the group, start and settle one guarded child, and dispose it before rethrowing any
 * startup failure so a failed run never lingers. A valid unresolved inject may remain pending.
 * @param group - the `cordis-dynamic` group fiber every host half hangs under.
 * @param plugin - the plugin the sandbox returned; wrapped with the registration guard before starting.
 * @param reportGuardFailure - reports post-activation Host guard rejections to the owning Agent.
 * @returns the settled child fiber (possibly pending on unsatisfied `inject`).
 */
function startHostHalf(group, plugin, reportGuardFailure) {
    return __awaiter(this, void 0, void 0, function () {
        var fiber, error_1, message;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, group.await()];
                case 1:
                    _a.sent();
                    fiber = group.ctx.plugin((0, guard_ts_1.guardedPlugin)(plugin, reportGuardFailure));
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 6]);
                    return [4 /*yield*/, fiber.await()];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4:
                    error_1 = _a.sent();
                    return [4 /*yield*/, fiber.dispose()];
                case 5:
                    _a.sent();
                    message = error_1 instanceof Error ? error_1.message : String(error_1);
                    // The commonest startup collision is running a NEW version of a package
                    // while the old run still holds the name — teach the replace recipe.
                    if (message.includes('already registered')) {
                        throw new Error("".concat(message, " \u2014 to REPLACE something an earlier dynamic package registered, first cordis_stop that package's id ")
                            + '(find it with cordis_runtime_inspect what:"temporary"), then run the new version.');
                    }
                    throw error_1 instanceof Error ? error_1 : new Error(message);
                case 6: return [2 /*return*/, fiber];
            }
        });
    });
}
/**
 * The services a fiber declared in `inject` that do not exist yet — a settled
 * fiber that is not active is waiting on exactly these (legal cordis
 * semantics: it activates when the service appears).
 * @param ctx - the context to resolve service existence against.
 * @param fiber - the host-half fiber whose `inject` declarations are checked.
 * @returns the missing service names, in declaration order.
 */
function missingServices(ctx, fiber) {
    return Object.keys(fiber.inject).filter(function (service) { return ctx.get(service) === undefined; });
}
