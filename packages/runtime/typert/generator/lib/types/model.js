"use strict";
/**
 * Compiler-independent Typert analysis model. TypeScript nodes and checker
 * objects are extraction inputs only; emitters consume this graph.
 * @module @z/dsh-typert-generator/model
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
exports.childTypeNodeIds = childTypeNodeIds;
/**
 * Return the direct type-expression edges owned by one node.
 * @param node - compiler-independent type node to inspect.
 * @returns graph-local ids of its direct child type nodes.
 */
function childTypeNodeIds(node) {
    switch (node.kind) {
        case 'parenthesized':
        case 'operator': return [node.type];
        case 'reference': return __spreadArray([], node.arguments, true);
        case 'union':
        case 'intersection': return __spreadArray([], node.types, true);
        case 'array': return [node.element];
        case 'tuple': return node.elements.map(function (element) { return element.type; });
        case 'indexed-access': return [node.object, node.index];
        case 'conditional': return [node.check, node.extends, node.whenTrue, node.whenFalse];
        case 'mapped': return __spreadArray(__spreadArray(__spreadArray(__spreadArray([], (node.parameter.constraint === undefined ? [] : [node.parameter.constraint]), true), (node.parameter.default === undefined ? [] : [node.parameter.default]), true), (node.nameType === undefined ? [] : [node.nameType]), true), (node.value === undefined ? [] : [node.value]), true);
        case 'template-literal': return node.spans.map(function (span) { return span.type; });
        case 'type-query':
        case 'import-type': return __spreadArray([], node.arguments, true);
        case 'predicate': return node.type === undefined ? [] : [node.type];
        case 'infer': return __spreadArray(__spreadArray([], (node.parameter.constraint === undefined ? [] : [node.parameter.constraint]), true), (node.parameter.default === undefined ? [] : [node.parameter.default]), true);
        case 'keyword':
        case 'literal':
        case 'object':
        case 'function':
        case 'constructor':
        case 'this': return [];
        default: return assertNever(node);
    }
}
function assertNever(value) {
    throw new Error("unsupported model variant ".concat(JSON.stringify(value)));
}
