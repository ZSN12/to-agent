"use strict";
// flattenLineage: summaries -> flat list with lineage indentation (pure function).
// The input order is authoritative; lineage only makes each child adjacent to its parent.
// Orphaned lineage degrades to root level; cycles fail soft and emit as roots.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.flattenLineage = flattenLineage;
/**
 * Summaries -> flat list with lineage indentation. Root and sibling order
 * follows the established input order; this projection never re-sorts a
 * hydrated list from mutable timestamps.
 * @param summaries - the host's session.list items.
 * @param pendingInteractions - current manager-owned interaction status by session.
 * @param completed - sessions with a pending completion reminder (manager-owned live fact; absent = false).
 * @returns display rows in render order.
 */
function flattenLineage(summaries, pendingInteractions, completed) {
    var _a;
    var byId = new Map();
    for (var _i = 0, summaries_1 = summaries; _i < summaries_1.length; _i++) {
        var s = summaries_1[_i];
        byId.set(s.sessionId, s);
    }
    var children = new Map();
    var roots = [];
    for (var _b = 0, summaries_2 = summaries; _b < summaries_2.length; _b++) {
        var s = summaries_2[_b];
        if (s.parentSessionId !== undefined && byId.has(s.parentSessionId)) {
            var list = (_a = children.get(s.parentSessionId)) !== null && _a !== void 0 ? _a : [];
            list.push(s);
            children.set(s.parentSessionId, list);
        }
        else {
            roots.push(s); // root, or an orphan whose parent is absent from summaries (degrade to root, never drop)
        }
    }
    var out = [];
    var visited = new Set();
    var walk = function (s, depth) {
        var _a;
        if (visited.has(s.sessionId)) {
            console.warn("[web-runtime] lineage cycle at ".concat(s.sessionId, "; emitting as root"));
            return;
        }
        visited.add(s.sessionId);
        var pendingInteraction = pendingInteractions === null || pendingInteractions === void 0 ? void 0 : pendingInteractions.get(s.sessionId);
        out.push(__assign(__assign(__assign({}, s), (pendingInteraction === undefined ? {} : { pendingInteraction: pendingInteraction })), { completed: (_a = completed === null || completed === void 0 ? void 0 : completed.has(s.sessionId)) !== null && _a !== void 0 ? _a : false, depth: depth }));
        var kids = children.get(s.sessionId);
        if (kids === undefined)
            return;
        for (var _i = 0, kids_1 = kids; _i < kids_1.length; _i++) {
            var kid = kids_1[_i];
            walk(kid, depth + 1);
        }
    };
    for (var _c = 0, roots_1 = roots; _c < roots_1.length; _c++) {
        var root = roots_1[_c];
        walk(root, 0);
    }
    // Cycle members (unreachable from any root): emit as roots so no entry is lost.
    for (var _d = 0, summaries_3 = summaries; _d < summaries_3.length; _d++) {
        var s = summaries_3[_d];
        if (!visited.has(s.sessionId))
            walk(s, 0);
    }
    return out;
}
