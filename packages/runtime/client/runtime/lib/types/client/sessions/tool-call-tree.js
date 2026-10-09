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
exports.ToolCallTree = exports.MAX_TOOL_CALL_TREE_DEPTH = void 0;
/** Fixed wire-safety ceiling for every recursive Tool call consumer. */
exports.MAX_TOOL_CALL_TREE_DEPTH = 256;
function sameReferences(left, right) {
    return left.length === right.length
        && left.every(function (block, index) { return block === right[index]; });
}
/**
 * Owns Code Dispatch pairing and projects its private parent index into the
 * recursive Tool call contract exposed by conversation snapshots.
 */
var ToolCallTree = /** @class */ (function () {
    function ToolCallTree() {
        this.childrenByParent = new Map();
        this.depthByCall = new Map();
        this.projectedByCall = new Map();
        this.revision = 0;
        this.nodesCache = null;
        this.runningCache = null;
    }
    /** Forget all event-derived child calls before replaying a new window. */
    ToolCallTree.prototype.reset = function () {
        this.childrenByParent.clear();
        this.depthByCall.clear();
        this.projectedByCall.clear();
        this.revision++;
    };
    /**
     * Fold one event when it belongs to the Code Dispatch lifecycle.
     * @param event - Session event from the current live or history window.
     * @returns Whether the event was consumed as a child-call lifecycle event.
     */
    ToolCallTree.prototype.apply = function (event) {
        var _a, _b, _c;
        if (event.type === 'tool/code-dispatch-start') {
            var data_1 = event.data;
            var running = {
                callId: data_1.subCallId,
                name: data_1.name,
                argsRaw: JSON.stringify(data_1.arguments),
                turn: 0,
                step: 0,
                time: event.time,
                callView: null,
                subCalls: [],
            };
            var siblings_1 = (_a = this.childrenByParent.get(data_1.parentCallId)) !== null && _a !== void 0 ? _a : [];
            if (!this.acceptEdge(data_1.parentCallId, data_1.subCallId))
                return true;
            this.childrenByParent.set(data_1.parentCallId, __spreadArray(__spreadArray([], siblings_1, true), [running], false));
            this.revision++;
            return true;
        }
        if (event.type !== 'tool/code-dispatch')
            return false;
        var data = event.data;
        var siblings = (_b = this.childrenByParent.get(data.parentCallId)) !== null && _b !== void 0 ? _b : [];
        var at = siblings.findIndex(function (sub) { return sub.callId === data.subCallId; });
        if (at === -1 && !this.acceptEdge(data.parentCallId, data.subCallId))
            return true;
        var started = at === -1 ? undefined : siblings[at];
        var settled = {
            kind: 'tool-result',
            seq: event.seq,
            time: event.time,
            callId: data.subCallId,
            call: { name: data.name, argsRaw: JSON.stringify(data.arguments) },
            callTime: (_c = started === null || started === void 0 ? void 0 : started.time) !== null && _c !== void 0 ? _c : null,
            content: data.content,
            isError: data.isError,
            callView: null,
            resultView: null,
            subCalls: [],
        };
        this.childrenByParent.set(data.parentCallId, at === -1
            ? __spreadArray(__spreadArray([], siblings, true), [settled], false) : siblings.map(function (sub, index) { return index === at ? settled : sub; }));
        this.revision++;
        return true;
    };
    /**
     * Attach recursively projected children to all settled roots in a node list.
     * @param nodes - Cache-stable base conversation nodes.
     * @returns The original list when no root changed, otherwise a structurally shared list.
     */
    ToolCallTree.prototype.projectNodes = function (nodes) {
        var _this = this;
        var _a;
        if (((_a = this.nodesCache) === null || _a === void 0 ? void 0 : _a.source) === nodes && this.nodesCache.revision === this.revision) {
            return this.nodesCache.value;
        }
        var projected = nodes.map(function (node) {
            if (node.kind !== 'tool-result')
                return node;
            return _this.projectBlock(node);
        });
        var value = sameReferences(nodes, projected) ? nodes : projected;
        this.nodesCache = { source: nodes, revision: this.revision, value: value };
        return value;
    };
    /**
     * Attach recursively projected children to all running root calls.
     * @param calls - Cache-stable base running calls.
     * @returns The original list when no root changed, otherwise a structurally shared list.
     */
    ToolCallTree.prototype.projectRunningCalls = function (calls) {
        var _this = this;
        var _a;
        if (((_a = this.runningCache) === null || _a === void 0 ? void 0 : _a.source) === calls && this.runningCache.revision === this.revision) {
            return this.runningCache.value;
        }
        var projected = calls.map(function (call) { return _this.projectBlock(call); });
        var value = sameReferences(calls, projected) ? calls : projected;
        this.runningCache = { source: calls, revision: this.revision, value: value };
        return value;
    };
    ToolCallTree.prototype.projectBlock = function (block) {
        var _this = this;
        var _a;
        var children = (_a = this.childrenByParent.get(block.callId)) !== null && _a !== void 0 ? _a : block.subCalls;
        var projectedChildren = children.map(function (child) { return _this.projectBlock(child); });
        var childValue = sameReferences(children, projectedChildren)
            ? children
            : projectedChildren;
        var cached = this.projectedByCall.get(block.callId);
        if ((cached === null || cached === void 0 ? void 0 : cached.source) === block && sameReferences(cached.children, childValue)) {
            return cached.value;
        }
        var value = block.subCalls === childValue
            ? block
            : __assign(__assign({}, block), { subCalls: childValue });
        this.projectedByCall.set(block.callId, {
            source: block,
            children: childValue,
            value: value,
        });
        return value;
    };
    /**
     * Accept an edge only when every recursive consumer can traverse it safely.
     * Host-minted ids exclude cycles and current bindings emit one level; a
     * malformed wire/history edge is consumed without hiding the rest of the session.
     */
    ToolCallTree.prototype.acceptEdge = function (parentCallId, subCallId) {
        var _a, _b, _c, _d;
        if (this.wouldCreateCycle(parentCallId, subCallId))
            return false;
        var pending = [{
                callId: subCallId,
                depth: ((_a = this.depthByCall.get(parentCallId)) !== null && _a !== void 0 ? _a : 1) + 1,
            }];
        var updates = new Map();
        for (var _i = 0, pending_1 = pending; _i < pending_1.length; _i++) {
            var candidate = pending_1[_i];
            var knownDepth = (_c = (_b = updates.get(candidate.callId)) !== null && _b !== void 0 ? _b : this.depthByCall.get(candidate.callId)) !== null && _c !== void 0 ? _c : 1;
            if (candidate.depth <= knownDepth)
                continue;
            if (candidate.depth > exports.MAX_TOOL_CALL_TREE_DEPTH)
                return false;
            updates.set(candidate.callId, candidate.depth);
            for (var _e = 0, _f = (_d = this.childrenByParent.get(candidate.callId)) !== null && _d !== void 0 ? _d : []; _e < _f.length; _e++) {
                var child = _f[_e];
                pending.push({ callId: child.callId, depth: candidate.depth + 1 });
            }
        }
        for (var _g = 0, updates_1 = updates; _g < updates_1.length; _g++) {
            var _h = updates_1[_g], callId = _h[0], depth = _h[1];
            this.depthByCall.set(callId, depth);
        }
        return true;
    };
    ToolCallTree.prototype.wouldCreateCycle = function (parentCallId, subCallId) {
        var _a;
        if (parentCallId === subCallId)
            return true;
        var pending = [subCallId];
        var visited = new Set(pending);
        for (var _i = 0, pending_2 = pending; _i < pending_2.length; _i++) {
            var callId = pending_2[_i];
            for (var _b = 0, _c = (_a = this.childrenByParent.get(callId)) !== null && _a !== void 0 ? _a : []; _b < _c.length; _b++) {
                var child = _c[_b];
                if (child.callId === parentCallId)
                    return true;
                if (visited.has(child.callId))
                    continue;
                visited.add(child.callId);
                pending.push(child.callId);
            }
        }
        return false;
    };
    return ToolCallTree;
}());
exports.ToolCallTree = ToolCallTree;
