"use strict";
/**
 * Process-local dynamic Plugin registry and its opaque identity mints.
 * @module @z/dsh-cordis-host-runner/registry
 */
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
exports.DynamicCordisRegistry = void 0;
/** Registry, identity mints, and pending approval index. */
var DynamicCordisRegistry = /** @class */ (function () {
    function DynamicCordisRegistry() {
        this.plugins = new Map();
        this.pendingRequests = new Map();
        this.nextPlugin = 1;
        this.nextPackage = 1;
        this.nextRun = 1;
        this.nextApproval = 1;
    }
    /**
     * Mint a semantic plugin ID without reusing a prior suffix.
     * @param prefix - validated lowercase semantic prefix proposed by the model.
     * @returns a process-unique Plugin ID.
     */
    DynamicCordisRegistry.prototype.mintPluginId = function (prefix) {
        var id;
        do
            id = "".concat(prefix, "-").concat(this.nextPlugin++);
        while (this.plugins.has(id));
        return id;
    };
    /**
     * Mint an immutable package ID.
     * @returns a process-unique Package ID.
     */
    DynamicCordisRegistry.prototype.mintPackageId = function () {
        return "pkg-".concat(this.nextPackage++);
    };
    /**
     * Mint an activation ID.
     * @returns a process-unique Plugin Run ID.
     */
    DynamicCordisRegistry.prototype.mintPluginRunId = function () {
        return "run-".concat(this.nextRun++);
    };
    /**
     * Mint an approval ID.
     * @returns a process-unique approval request ID.
     */
    DynamicCordisRegistry.prototype.mintApprovalRequestId = function () {
        return "approval-".concat(this.nextApproval++);
    };
    /**
     * Add one stable plugin.
     * @param plugin - Plugin record to retain under its stable ID.
     */
    DynamicCordisRegistry.prototype.add = function (plugin) {
        this.plugins.set(plugin.pluginId, plugin);
    };
    /**
     * Read one plugin.
     * @param id - stable Plugin ID.
     * @returns the Plugin record, or `undefined` when absent.
     */
    DynamicCordisRegistry.prototype.get = function (id) {
        return this.plugins.get(id);
    };
    /**
     * Delete one plugin and all package versions.
     * @param id - stable Plugin ID to remove.
     * @returns whether a Plugin record was removed.
     */
    DynamicCordisRegistry.prototype.delete = function (id) {
        return this.plugins.delete(id);
    };
    /**
     * Read all plugins in creation order.
     * @returns a snapshot of every Plugin record.
     */
    DynamicCordisRegistry.prototype.all = function () {
        return __spreadArray([], this.plugins.values(), true);
    };
    /**
     * Read one session's plugins in creation order.
     * @param sessionId - owning session to filter by.
     * @returns a snapshot of matching Plugin records.
     */
    DynamicCordisRegistry.prototype.ofSession = function (sessionId) {
        return this.all().filter(function (plugin) { return plugin.sessionId === sessionId; });
    };
    /**
     * Publish one pending approval.
     * @param id - approval request ID.
     * @param pending - resolver and Plugin metadata retained until settlement.
     */
    DynamicCordisRegistry.prototype.armRequest = function (id, pending) {
        this.pendingRequests.set(id, pending);
    };
    /**
     * Read one pending approval without claiming it.
     * @param id - approval request ID.
     * @returns the pending request, or `undefined` when absent.
     */
    DynamicCordisRegistry.prototype.peekRequest = function (id) {
        return this.pendingRequests.get(id);
    };
    /**
     * Claim one pending approval; first answer wins.
     * @param id - approval request ID.
     * @returns the claimed request, or `undefined` when already settled.
     */
    DynamicCordisRegistry.prototype.claimRequest = function (id) {
        var pending = this.pendingRequests.get(id);
        if (pending !== undefined)
            this.pendingRequests.delete(id);
        return pending;
    };
    /**
     * Cancel one pending approval.
     * @param id - approval request ID to remove.
     */
    DynamicCordisRegistry.prototype.disarmRequest = function (id) {
        this.pendingRequests.delete(id);
    };
    /**
     * Find a pending approval for one Plugin.
     * @param pluginId - stable Plugin ID.
     * @returns its approval request ID, or `undefined` when none is pending.
     */
    DynamicCordisRegistry.prototype.pendingRequestFor = function (pluginId) {
        for (var _i = 0, _a = this.pendingRequests; _i < _a.length; _i++) {
            var _b = _a[_i], requestId = _b[0], request = _b[1];
            if (request.pluginId === pluginId)
                return requestId;
        }
        return undefined;
    };
    return DynamicCordisRegistry;
}());
exports.DynamicCordisRegistry = DynamicCordisRegistry;
