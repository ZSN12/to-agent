"use strict";
/**
 * Rendering and traversal over the compiler-independent TypeGraph. Emitters
 * use this module instead of reaching back into TypeScript AST nodes.
 * @module @z/dsh-typert-generator/renderer
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
exports.TypeGraphRenderer = exports.TypeGraphRenderError = void 0;
var model_ts_1 = require("./model.ts");
/** Failure to render or traverse an internally inconsistent TypeGraph. */
var TypeGraphRenderError = /** @class */ (function (_super) {
    __extends(TypeGraphRenderError, _super);
    function TypeGraphRenderError() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.name = 'TypeGraphRenderError';
        return _this;
    }
    return TypeGraphRenderError;
}(Error));
exports.TypeGraphRenderError = TypeGraphRenderError;
/** Read and render one TypeGraph without compiler objects. */
var TypeGraphRenderer = /** @class */ (function () {
    /**
     * Index one complete graph.
     * @param graph - compiler-independent graph to render.
     */
    function TypeGraphRenderer(graph) {
        this.graph = graph;
        this.parameterNames = new Map();
        this.nodes = new Map(graph.nodes.map(function (node) { return [node.id, node]; }));
        this.declarations = new Map(graph.declarations.map(function (declaration) { return [declaration.id, declaration]; }));
        this.members = new Map(graph.declarations.flatMap(function (declaration) { return declaration.members.map(function (member) { return [member.id, member]; }); }));
        for (var _i = 0, _a = graph.declarations; _i < _a.length; _i++) {
            var declaration = _a[_i];
            this.indexParameters(declaration.typeParameters);
            for (var _b = 0, _c = declaration.members; _b < _c.length; _b++) {
                var member = _c[_b];
                if ('signature' in member)
                    this.indexParameters(member.signature.typeParameters);
            }
        }
    }
    /**
     * Resolve a node id or fail with the broken edge.
     * @param id - graph-local type node id.
     * @returns the referenced node.
     */
    TypeGraphRenderer.prototype.node = function (id) {
        var node = this.nodes.get(id);
        if (node === undefined)
            throw new TypeGraphRenderError("type graph references missing node ".concat(id));
        return node;
    };
    /**
     * Resolve a declaration id or fail with the broken edge.
     * @param id - workspace symbol id.
     * @returns the referenced declaration.
     */
    TypeGraphRenderer.prototype.declaration = function (id) {
        var declaration = this.declarations.get(id);
        if (declaration === undefined)
            throw new TypeGraphRenderError("type graph references missing declaration ".concat(id));
        return declaration;
    };
    /**
     * Resolve a public member id.
     * @param id - declaration member id.
     * @returns the referenced member.
     */
    TypeGraphRenderer.prototype.member = function (id) {
        var member = this.members.get(id);
        if (member === undefined)
            throw new TypeGraphRenderError("type graph references missing member ".concat(id));
        return member;
    };
    /**
     * Render one type expression from the retained source structure.
     * @param id - type node id.
     * @param references - optional generated names for declaration references.
     * @returns TypeScript type text.
     */
    TypeGraphRenderer.prototype.renderType = function (id, references) {
        var _this = this;
        var _a, _b;
        var node = this.node(id);
        switch (node.kind) {
            case 'keyword': return node.name;
            case 'literal': return node.text;
            case 'parenthesized': return "(".concat(this.renderType(node.type, references), ")");
            case 'reference': {
                var name_1 = node.target.kind === 'type-parameter'
                    ? (_a = this.parameterNames.get(node.target.parameter)) !== null && _a !== void 0 ? _a : node.name
                    : node.target.kind === 'declaration'
                        ? (_b = references === null || references === void 0 ? void 0 : references.get(node.target.symbol)) !== null && _b !== void 0 ? _b : node.name
                        : node.name;
                return node.arguments.length === 0
                    ? name_1
                    : "".concat(name_1, "<").concat(node.arguments.map(function (argument) { return _this.renderType(argument, references); }).join(', '), ">");
            }
            case 'union': return node.types.map(function (type) { return _this.renderType(type, references); }).join(' | ');
            case 'intersection': return node.types.map(function (type) { return _this.renderType(type, references); }).join(' & ');
            case 'array': {
                var element = this.renderType(node.element, references);
                var wrapped = needsArrayParentheses(this.node(node.element)) ? "(".concat(element, ")") : element;
                return "".concat(wrapped, "[]");
            }
            case 'tuple': {
                var elements = node.elements.map(function (element) {
                    var type = _this.renderType(element.type, references);
                    if (element.name !== undefined) {
                        return "".concat(element.rest ? '...' : '').concat(element.name).concat(element.optional ? '?' : '', ": ").concat(type);
                    }
                    return "".concat(element.rest ? '...' : '').concat(type).concat(element.optional ? '?' : '');
                });
                return "[".concat(elements.join(', '), "]");
            }
            case 'object': return this.renderObject(node.members, references);
            case 'function': return "".concat(this.renderSignatureHead(node.signature, references), " => ").concat(this.renderType(node.signature.returns, references));
            case 'constructor': return "".concat(node.abstract ? 'abstract ' : '', "new ").concat(this.renderSignatureHead(node.signature, references), " => ").concat(this.renderType(node.signature.returns, references));
            case 'indexed-access': return "".concat(this.renderType(node.object, references), "[").concat(this.renderType(node.index, references), "]");
            case 'operator': return "".concat(node.operator, " ").concat(this.renderType(node.type, references));
            case 'conditional': {
                return "".concat(this.renderType(node.check, references), " extends ").concat(this.renderType(node.extends, references), " ? ").concat(this.renderType(node.whenTrue, references), " : ").concat(this.renderType(node.whenFalse, references));
            }
            case 'infer': return "infer ".concat(this.renderTypeParameter(node.parameter, false, references));
            case 'mapped': {
                var readonly = node.readonly === 'preserve' ? '' : node.readonly === 'remove' ? '-readonly ' : 'readonly ';
                var optional = node.optional === 'preserve' ? '' : node.optional === 'remove' ? '-?' : '?';
                if (node.parameter.constraint === undefined) {
                    throw new TypeGraphRenderError("mapped type parameter ".concat(node.parameter.name, " has no constraint"));
                }
                var parameter = "".concat(node.parameter.name, " in ").concat(this.renderType(node.parameter.constraint, references));
                var nameType = node.nameType === undefined ? '' : " as ".concat(this.renderType(node.nameType, references));
                var value = node.value === undefined ? 'unknown' : this.renderType(node.value, references);
                return "{ ".concat(readonly, "[").concat(parameter).concat(nameType, "]").concat(optional, ": ").concat(value, " }");
            }
            case 'template-literal': {
                var spans = node.spans.map(function (span) { return "${".concat(_this.renderType(span.type, references), "}").concat(escapeTemplate(span.text)); }).join('');
                return "`".concat(escapeTemplate(node.head)).concat(spans, "`");
            }
            case 'type-query': {
                var argumentsText = node.arguments.length === 0
                    ? ''
                    : "<".concat(node.arguments.map(function (argument) { return _this.renderType(argument, references); }).join(', '), ">");
                return "typeof ".concat(node.expression).concat(argumentsText);
            }
            case 'import-type': {
                var attributes = node.attributes === undefined ? '' : ", ".concat(node.attributes);
                var imported = "import(".concat(quote(node.module)).concat(attributes, ")").concat(node.qualifier === undefined ? '' : ".".concat(node.qualifier));
                var argumentsText = node.arguments.length === 0
                    ? ''
                    : "<".concat(node.arguments.map(function (argument) { return _this.renderType(argument, references); }).join(', '), ">");
                return "".concat(node.typeof ? 'typeof ' : '').concat(imported).concat(argumentsText);
            }
            case 'predicate': {
                var assertion = node.asserts ? 'asserts ' : '';
                return node.type === undefined
                    ? "".concat(assertion).concat(node.parameter)
                    : "".concat(assertion).concat(node.parameter, " is ").concat(this.renderType(node.type, references));
            }
            case 'this': return 'this';
            default: return assertNever(node);
        }
    };
    /**
     * Render a callable signature without a member name.
     * @param signature - modeled signature.
     * @param references - optional generated names for declaration references.
     * @returns parameter list and return type.
     */
    TypeGraphRenderer.prototype.renderSignature = function (signature, references) {
        return "".concat(this.renderSignatureHead(signature, references), ": ").concat(this.renderType(signature.returns, references));
    };
    /**
     * Render one class/interface member as a body-free declaration.
     * @param member - modeled member.
     * @param sourceModifiers - retain source-only modifiers for reflection text.
     * @param references - optional generated names for declaration references.
     * @returns one-line TypeScript member text.
     */
    TypeGraphRenderer.prototype.renderMember = function (member, sourceModifiers, references) {
        var _this = this;
        if (sourceModifiers === void 0) { sourceModifiers = false; }
        if (sourceModifiers)
            return member.text;
        var name = renderPropertyName(member.name);
        var optional = member.optional ? '?' : '';
        var readonly = member.readonly ? 'readonly ' : '';
        var abstract = member.abstract ? 'abstract ' : '';
        switch (member.kind) {
            case 'property': return "".concat(abstract).concat(readonly).concat(name).concat(optional, ": ").concat(this.renderType(member.type, references));
            case 'method': return "".concat(abstract).concat(name).concat(optional).concat(this.renderSignature(member.signature, references));
            case 'getter': return "".concat(abstract, "get ").concat(name, "()").concat(this.renderReturn(member.signature, references));
            case 'setter': return "".concat(abstract, "set ").concat(name).concat(this.renderSignatureHead(member.signature, references));
            case 'call': return this.renderSignature(member.signature, references);
            case 'construct': return "new ".concat(this.renderSignature(member.signature, references));
            case 'index': {
                var parameters = member.signature.parameters.map(function (parameter) { return _this.renderParameter(parameter, references); }).join(', ');
                return "".concat(readonly, "[").concat(parameters, "]: ").concat(this.renderType(member.signature.returns, references));
            }
            default: return assertNever(member);
        }
    };
    /**
     * Render a named declaration without JSDoc.
     * @param id - declaration symbol id.
     * @returns exported TypeScript declaration text.
     */
    TypeGraphRenderer.prototype.renderDeclaration = function (id) {
        var _this = this;
        var _a, _b;
        var declaration = this.declaration(id);
        var parameters = this.renderTypeParameters(declaration.typeParameters);
        if (declaration.kind === 'enum') {
            var members_1 = (_b = (_a = declaration.enumMembers) === null || _a === void 0 ? void 0 : _a.map(function (member) {
                return "    ".concat(renderPropertyName(member.name)).concat(member.initializer === undefined ? '' : " = ".concat(member.initializer), ",");
            })) !== null && _b !== void 0 ? _b : [];
            return __spreadArray(__spreadArray(["export enum ".concat(declaration.name, " {")], members_1, true), ['}'], false).join('\n');
        }
        if (declaration.kind === 'alias') {
            if (declaration.type === undefined)
                throw new TypeGraphRenderError("alias ".concat(id, " has no type node"));
            return "export type ".concat(declaration.name).concat(parameters, " = ").concat(this.renderType(declaration.type), ";");
        }
        var extendsTypes = declaration.extends.map(function (type) { return _this.renderType(type); });
        var implementsTypes = declaration.implements.map(function (type) { return _this.renderType(type); });
        var heritage = [
            extendsTypes.length === 0 ? '' : " extends ".concat(extendsTypes.join(', ')),
            implementsTypes.length === 0 ? '' : " implements ".concat(implementsTypes.join(', ')),
        ].join('');
        var prefix = declaration.kind === 'class' && declaration.abstract ? 'abstract ' : '';
        var members = declaration.members.map(function (member) { return "    ".concat(_this.renderMember(member), ";"); });
        return __spreadArray(__spreadArray(["export ".concat(prefix).concat(declaration.kind, " ").concat(declaration.name).concat(parameters).concat(heritage, " {")], members, true), ['}'], false).join('\n');
    };
    /**
     * Find the transitive declaration closure referenced by members.
     * @param memberIds - business-API member ids.
     * @returns declarations in graph order, excluding no roots implicitly.
     */
    TypeGraphRenderer.prototype.declarationClosureForMembers = function (memberIds) {
        return this.declarationClosure(memberIds, []);
    };
    /**
     * Find the transitive declaration closure referenced by type roots.
     * @param typeIds - graph type roots.
     * @returns declarations in graph order.
     */
    TypeGraphRenderer.prototype.declarationClosureForTypes = function (typeIds) {
        return this.declarationClosure([], typeIds);
    };
    TypeGraphRenderer.prototype.declarationClosure = function (memberIds, typeIds) {
        var _this = this;
        var found = new Set();
        var visiting = new Set();
        var visitNode = function (id) {
            var _a;
            var node = _this.node(id);
            if (node.kind === 'reference' && node.target.kind === 'declaration')
                visitDeclaration(node.target.symbol);
            if (node.kind === 'import-type' && ((_a = node.target) === null || _a === void 0 ? void 0 : _a.kind) === 'declaration')
                visitDeclaration(node.target.symbol);
            for (var _i = 0, _b = (0, model_ts_1.childTypeNodeIds)(node); _i < _b.length; _i++) {
                var child = _b[_i];
                visitNode(child);
            }
            for (var _c = 0, _d = nodeSignatures(node); _c < _d.length; _c++) {
                var signature = _d[_c];
                visitSignature(signature);
            }
            if (node.kind === 'object')
                for (var _e = 0, _f = node.members; _e < _f.length; _e++) {
                    var member = _f[_e];
                    visitMember(member);
                }
        };
        var visitSignature = function (signature) {
            for (var _i = 0, _a = signature.typeParameters; _i < _a.length; _i++) {
                var parameter = _a[_i];
                if (parameter.constraint !== undefined)
                    visitNode(parameter.constraint);
                if (parameter.default !== undefined)
                    visitNode(parameter.default);
            }
            for (var _b = 0, _c = signature.parameters; _b < _c.length; _b++) {
                var parameter = _c[_b];
                visitNode(parameter.type);
            }
            visitNode(signature.returns);
        };
        var visitMember = function (member) {
            if (member.kind === 'property')
                visitNode(member.type);
            else
                visitSignature(member.signature);
        };
        var visitDeclaration = function (id) {
            if (found.has(id) || visiting.has(id))
                return;
            visiting.add(id);
            var declaration = _this.declaration(id);
            for (var _i = 0, _a = declaration.typeParameters; _i < _a.length; _i++) {
                var parameter = _a[_i];
                if (parameter.constraint !== undefined)
                    visitNode(parameter.constraint);
                if (parameter.default !== undefined)
                    visitNode(parameter.default);
            }
            for (var _b = 0, _c = __spreadArray(__spreadArray([], declaration.extends, true), declaration.implements, true); _b < _c.length; _b++) {
                var type = _c[_b];
                visitNode(type);
            }
            if (declaration.type !== undefined)
                visitNode(declaration.type);
            for (var _d = 0, _e = declaration.members; _d < _e.length; _d++) {
                var member = _e[_d];
                visitMember(member);
            }
            visiting.delete(id);
            found.add(id);
        };
        for (var _i = 0, memberIds_1 = memberIds; _i < memberIds_1.length; _i++) {
            var id = memberIds_1[_i];
            visitMember(this.member(id));
        }
        for (var _a = 0, typeIds_1 = typeIds; _a < typeIds_1.length; _a++) {
            var id = typeIds_1[_a];
            visitNode(id);
        }
        return this.graph.declarations.filter(function (declaration) { return found.has(declaration.id); });
    };
    TypeGraphRenderer.prototype.renderSignatureHead = function (signature, references) {
        var _this = this;
        return "".concat(this.renderTypeParameters(signature.typeParameters, references), "(").concat(signature.parameters.map(function (parameter) { return _this.renderParameter(parameter, references); }).join(', '), ")");
    };
    TypeGraphRenderer.prototype.renderReturn = function (signature, references) {
        return ": ".concat(this.renderType(signature.returns, references));
    };
    TypeGraphRenderer.prototype.renderParameter = function (parameter, references) {
        var name = parameter.binding === 'identifier' ? renderPropertyName(parameter.name) : parameter.name;
        var optional = parameter.initializer === undefined && parameter.optional && !parameter.rest ? '?' : '';
        var initializer = parameter.initializer === undefined ? '' : " = ".concat(parameter.initializer);
        return "".concat(parameter.rest ? '...' : '').concat(name).concat(optional, ": ").concat(this.renderType(parameter.type, references)).concat(initializer);
    };
    TypeGraphRenderer.prototype.renderTypeParameters = function (parameters, references) {
        var _this = this;
        return parameters.length === 0
            ? ''
            : "<".concat(parameters.map(function (parameter) { return _this.renderTypeParameter(parameter, true, references); }).join(', '), ">");
    };
    TypeGraphRenderer.prototype.renderTypeParameter = function (parameter, includeDefault, references) {
        var variance = parameter.variance === undefined ? '' : "".concat(parameter.variance === 'in-out' ? 'in out' : parameter.variance, " ");
        var constModifier = parameter.const ? 'const ' : '';
        var constraint = parameter.constraint === undefined ? '' : " extends ".concat(this.renderType(parameter.constraint, references));
        var fallback = !includeDefault || parameter.default === undefined ? '' : " = ".concat(this.renderType(parameter.default, references));
        return "".concat(constModifier).concat(variance).concat(parameter.name).concat(constraint).concat(fallback);
    };
    TypeGraphRenderer.prototype.renderObject = function (members, references) {
        var _this = this;
        if (members.length === 0)
            return '{}';
        return "{ ".concat(members.map(function (member) { return "".concat(_this.renderMember(member, false, references), ";"); }).join(' '), " }");
    };
    TypeGraphRenderer.prototype.indexParameters = function (parameters) {
        for (var _i = 0, parameters_1 = parameters; _i < parameters_1.length; _i++) {
            var parameter = parameters_1[_i];
            this.parameterNames.set(parameter.id, parameter.name);
        }
    };
    return TypeGraphRenderer;
}());
exports.TypeGraphRenderer = TypeGraphRenderer;
function nodeSignatures(node) {
    return node.kind === 'function' || node.kind === 'constructor' ? [node.signature] : [];
}
function needsArrayParentheses(node) {
    return node.kind === 'union' || node.kind === 'intersection' || node.kind === 'function' || node.kind === 'constructor' || node.kind === 'conditional';
}
function renderPropertyName(name) {
    if (name.startsWith('[') && name.endsWith(']'))
        return name;
    if (/^(?:[$A-Z_a-z][$\w]*|\d+)$/u.test(name))
        return name;
    return quote(name);
}
function quote(value) {
    return "'".concat(value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n'), "'");
}
function escapeTemplate(value) {
    return value.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
}
function assertNever(value) {
    throw new TypeGraphRenderError("unsupported model variant ".concat(JSON.stringify(value)));
}
