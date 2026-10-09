"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexSubagentDescendants = indexSubagentDescendants;
/**
 * Index every subagent descendant under each ancestor it reaches through an
 * uninterrupted subagent-origin chain. Cycles fail soft and orphan owners
 * remain harmless map keys until their summaries arrive.
 * @param summaries - retained session summaries keyed by id.
 * @returns descendant totals and running totals keyed by possible parent id.
 */
function indexSubagentDescendants(summaries) {
    var indexed = new Map();
    for (var _i = 0, _a = Object.values(summaries); _i < _a.length; _i++) {
        var descendant = _a[_i];
        if (descendant.origin !== 'subagent')
            continue;
        var seen = new Set();
        var current = descendant;
        while ((current === null || current === void 0 ? void 0 : current.origin) === 'subagent' && current.parentId !== undefined
            && !seen.has(current.id)) {
            seen.add(current.id);
            var aggregate = indexed.get(current.parentId);
            if (aggregate === undefined) {
                indexed.set(current.parentId, {
                    count: 1,
                    runningCount: descendant.running ? 1 : 0,
                });
            }
            else {
                aggregate.count += 1;
                if (descendant.running)
                    aggregate.runningCount += 1;
            }
            current = summaries[current.parentId];
        }
    }
    return indexed;
}
