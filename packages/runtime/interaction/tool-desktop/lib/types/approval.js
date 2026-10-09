"use strict";
/**
 * The desktop approver: resolve a policy verdict into a go/no-go by consulting
 * the `approval/request` waterfall for anything not already allowed, with an
 * in-process persistent-approval cache per bundle id. Enforcement stays with
 * the approval service — the approver only asks and interprets outcomes.
 * @module @z/dsh-tool-desktop
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
exports.PersistentGrantCache = void 0;
exports.createApprover = createApprover;
var policy_ts_1 = require("./policy.ts");
require("./session-events.ts");
/** A persistent grant cache shared across approver instances in one process. */
var PersistentGrantCache = /** @class */ (function () {
    function PersistentGrantCache() {
        this.granted = new Set();
    }
    /**
     * Record a grant for a bundle id.
     * @param bundleId - the granted macOS bundle id
     */
    PersistentGrantCache.prototype.grant = function (bundleId) {
        this.granted.add(bundleId);
    };
    /**
     * Whether a grant is currently held for a bundle id.
     * @param bundleId - the bundle id to query
     * @returns true when a grant is currently held
     */
    PersistentGrantCache.prototype.has = function (bundleId) {
        return this.granted.has(bundleId);
    };
    return PersistentGrantCache;
}());
exports.PersistentGrantCache = PersistentGrantCache;
/**
 * Build an approver that decides a desktop action for a target bundle id on
 * behalf of an agent. A `deny` policy verdict is final and never prompts.
 * Anything else consults the approval waterfall; `rejected` denies,
 * `allowed-once` grants (and is cached when `persist`), and any other outcome
 * fails closed to deny.
 * @param options - policy, dispatcher, and gating/persistence options
 * @param cache - shared persistent-grant cache (may be a fresh one)
 * @returns an approver keyed on agent, bundle id, and action
 */
function createApprover(options, cache) {
    var _this = this;
    if (cache === void 0) { cache = new PersistentGrantCache(); }
    return function (agent, bundleId, action) { return __awaiter(_this, void 0, void 0, function () {
        var outcome_1, verdict, outcome;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!!bundleId) return [3 /*break*/, 2];
                    return [4 /*yield*/, options.approval.request({
                            agent: agent,
                            toolName: 'desktop_' + action,
                            reason: 'No frontmost application to scope desktop access; confirm the action.',
                        })];
                case 1:
                    outcome_1 = _a.sent();
                    if (outcome_1 === 'allowed-once')
                        return [2 /*return*/, { ok: true }];
                    return [2 /*return*/, { ok: false, reason: "desktop: not approved (".concat(outcome_1, ")") }];
                case 2:
                    verdict = (0, policy_ts_1.classifyDesktopAccess)(options.policy, bundleId);
                    if (verdict === 'deny') {
                        return [2 /*return*/, { ok: false, reason: "desktop: access denied by policy for ".concat(bundleId) }];
                    }
                    if (options.persist && cache.has(bundleId))
                        return [2 /*return*/, { ok: true }];
                    if (verdict === 'allow' && !options.gateAllow) {
                        if (options.persist)
                            cache.grant(bundleId);
                        return [2 /*return*/, { ok: true }];
                    }
                    return [4 /*yield*/, options.approval.request({
                            agent: agent,
                            toolName: 'desktop_' + action,
                            reason: "Desktop action on ".concat(bundleId),
                        })];
                case 3:
                    outcome = _a.sent();
                    if (outcome === 'allowed-once') {
                        if (options.persist)
                            cache.grant(bundleId);
                        return [2 /*return*/, { ok: true }];
                    }
                    return [2 /*return*/, { ok: false, reason: "desktop: not approved for ".concat(bundleId, " (").concat(outcome, ")") }];
            }
        });
    }); };
}
