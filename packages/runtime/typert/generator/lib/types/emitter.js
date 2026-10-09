"use strict";
/**
 * Model-driven Typert artifact emitter. It consumes only FaceModel and
 * TypeGraph data; TypeScript compiler nodes are not part of this boundary.
 * @module @z/dsh-typert-generator/emitter
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
exports.FaceModelEmitter = exports.TypertEmitError = void 0;
var node_buffer_1 = require("node:buffer");
var node_path_1 = require("node:path");
var gen_mapping_1 = require("@jridgewell/gen-mapping");
var renderer_ts_1 = require("./renderer.ts");
/** Failure to project a modeled construct into an emitted artifact. */
var TypertEmitError = /** @class */ (function (_super) {
    __extends(TypertEmitError, _super);
    function TypertEmitError() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.name = 'TypertEmitError';
        return _this;
    }
    return TypertEmitError;
}(Error));
exports.TypertEmitError = TypertEmitError;
/** Emit generated runtime and type artifacts from one independently analyzed face. */
var FaceModelEmitter = /** @class */ (function () {
    /**
     * Create an emitter for one face graph.
     * @param face - independently analyzed face.
     */
    function FaceModelEmitter(face) {
        this.face = face;
        this.renderer = new renderer_ts_1.TypeGraphRenderer(face.graph);
    }
    /**
     * Emit one modeled package.
     * @param packageName - exact package name in the face model.
     * @returns executable JavaScript and its precise declaration file.
     */
    FaceModelEmitter.prototype.emit = function (packageName) {
        var packageModel = this.face.packages.find(function (candidate) { return candidate.name === packageName; });
        if (packageModel === undefined) {
            throw new TypertEmitError("typert emitter(".concat(this.face.face, "): package ").concat(packageName, " is not modeled on this face"));
        }
        var schemas = new SchemaEmitter(this.renderer, packageModel.schemas, invocationBoundaryRoots(packageModel.invocations));
        var schemaArtifact = schemas.emit();
        var runtimeModel = this.runtimeModel(packageModel);
        var js = this.renderJs(packageModel, schemaArtifact, runtimeModel);
        var dts = this.renderDts(packageModel, schemaArtifact);
        return __assign({ package: packageName, face: this.face.face, exports: packageModel.schemas.map(function (schema) { return schema.export.name; }), js: js, dts: dts }, (this.face.face === 'host' && packageModel.invocations.length > 0
            ? { remote: this.emitRemote(packageModel) }
            : {}));
    };
    FaceModelEmitter.prototype.runtimeModel = function (packageModel) {
        var _this = this;
        var services = packageModel.services.map(function (service) {
            var members = service.members.map(function (id) { return _this.runtimeMember(_this.renderer.member(id)); });
            return __assign(__assign({}, documentationLiteral(service)), { key: service.key, exportName: service.export.name, members: members, types: _this.runtimeTypes(_this.renderer.declarationClosureForMembers(service.members), service.symbol) });
        });
        var events = packageModel.events.map(function (event) {
            var node = _this.renderer.node(event.signature);
            if (node.kind !== 'function') {
                throw new TypertEmitError("typert emitter(".concat(_this.face.face, "): event ").concat(event.name, " is not a function type"));
            }
            return __assign(__assign(__assign(__assign({}, documentationLiteral(event)), { name: event.name }), (event.mode === undefined ? {} : { mode: event.mode })), { signature: "".concat(quote(event.name)).concat(_this.renderer.renderSignature(node.signature)) });
        });
        var objects = packageModel.objects.map(function (object) {
            var declaration = _this.renderer.declaration(object.symbol);
            return __assign(__assign({}, documentationLiteral(object)), { name: declaration.name, exportName: object.export.name, members: declaration.members.map(function (member) { return _this.runtimeMember(member); }), types: _this.runtimeTypes(_this.renderer.declarationClosureForMembers(declaration.members.map(function (member) { return member.id; })), declaration.id) });
        });
        return { services: services, events: events, objects: objects };
    };
    FaceModelEmitter.prototype.runtimeMember = function (member) {
        return __assign(__assign({ kind: member.kind, name: member.name, signature: this.renderer.renderMember(member, true) }, (member.summary === undefined ? {} : { summary: member.summary })), (member.jsDoc === undefined ? {} : { jsDoc: member.jsDoc }));
    };
    FaceModelEmitter.prototype.runtimeTypes = function (declarations, root) {
        var _this = this;
        return declarations
            .filter(function (declaration) { return declaration.id !== root; })
            .map(function (declaration) { return ({
            name: declaration.name,
            declaration: _this.renderer.renderDeclaration(declaration.id),
        }); })
            .sort(function (left, right) { return left.name.localeCompare(right.name); });
    };
    FaceModelEmitter.prototype.renderJs = function (packageModel, schemas, runtimeModel) {
        var lines = [
            '/* Generated by @z/dsh-typert-generator from FaceModel — do not edit. */',
        ];
        if (schemas.definitions.length > 0)
            lines.push('import { z } from \'zod\'', '');
        lines.push.apply(lines, schemas.definitions);
        if (schemas.definitions.length > 0)
            lines.push('');
        for (var _i = 0, _a = schemas.exports; _i < _a.length; _i++) {
            var schema = _a[_i];
            lines.push("export const ".concat(schema.exportName, " = ").concat(schema.internalName));
        }
        if (schemas.exports.length > 0)
            lines.push('');
        var model = JSON.stringify(runtimeModel, null, 2);
        lines.push('export const TYPERT = {');
        lines.push("  package: ".concat(quote(packageModel.name), ","));
        lines.push("  face: ".concat(quote(this.face.face), ","));
        lines.push('  schemas: [');
        for (var _b = 0, _c = schemas.exports; _b < _c.length; _b++) {
            var schema = _c[_b];
            lines.push("    { name: ".concat(quote(schema.exportName), ", schema: ").concat(schema.exportName, " },"));
        }
        lines.push('  ],');
        lines.push('  invocations: [');
        for (var _d = 0, _e = packageModel.invocations; _d < _e.length; _d++) {
            var invocation = _e[_d];
            lines.push("".concat(indent(this.invocationLiteral(invocation, schemas), 4), ","));
        }
        lines.push('  ],');
        lines.push("  model: ".concat(indent(model, 2).trimStart(), ","));
        lines.push('}');
        return "".concat(lines.join('\n'), "\n");
    };
    FaceModelEmitter.prototype.renderDts = function (packageModel, schemas) {
        var _a;
        var imports = new Map();
        for (var _i = 0, _b = schemas.exports; _i < _b.length; _i++) {
            var schema = _b[_i];
            var specifier = packageExportSpecifier(packageModel.name, schema.model.export.subpath);
            var names = (_a = imports.get(specifier)) !== null && _a !== void 0 ? _a : [];
            names.push("".concat(schema.model.export.name, " as ").concat(schema.exportName, "$source"));
            imports.set(specifier, names);
        }
        var lines = [
            '/* Generated by @z/dsh-typert-generator from FaceModel — do not edit. */',
        ];
        if (schemas.exports.length > 0)
            lines.splice(1, 0, 'import type { z } from \'zod\'');
        for (var _c = 0, _d = __spreadArray([], imports, true).sort(function (_a, _b) {
            var left = _a[0];
            var right = _b[0];
            return left.localeCompare(right);
        }); _c < _d.length; _c++) {
            var _e = _d[_c], specifier = _e[0], names = _e[1];
            lines.push("import type { ".concat(names.sort().join(', '), " } from ").concat(quote(specifier)));
        }
        lines.push('');
        for (var _f = 0, _g = schemas.exports; _f < _g.length; _f++) {
            var schema = _g[_f];
            lines.push("export declare const ".concat(schema.exportName, ": z.ZodType<").concat(schema.exportName, "$source>"));
        }
        if (schemas.exports.length > 0)
            lines.push('');
        // The Loader validates and narrows this generated module boundary before
        // registration. Keeping the public declaration unknown prevents every
        // contributing business package from depending on the runtime registry.
        lines.push('export declare const TYPERT: unknown');
        return "".concat(lines.join('\n'), "\n");
    };
    FaceModelEmitter.prototype.emitRemote = function (packageModel) {
        var schemas = new SchemaEmitter(this.renderer, [], invocationBoundaryRoots(packageModel.invocations)).emit();
        var lines = [
            '/* Generated by @z/dsh-typert-generator from the Host FaceModel — do not edit. */',
        ];
        if (schemas.definitions.length > 0)
            lines.push('import { z } from \'zod\'', '');
        lines.push.apply(lines, schemas.definitions);
        if (schemas.definitions.length > 0)
            lines.push('');
        lines.push('export const TYPERT_REMOTE = {');
        lines.push("  package: ".concat(quote(packageModel.name), ","));
        lines.push('  descriptors: [');
        for (var _i = 0, _a = packageModel.invocations; _i < _a.length; _i++) {
            var invocation = _a[_i];
            lines.push("".concat(indent(this.invocationLiteral(invocation, schemas), 4), ","));
        }
        lines.push('  ],');
        lines.push('}');
        lines.push('');
        lines.push('export default TYPERT_REMOTE');
        var declaration = this.renderRemoteDts(packageModel);
        return __assign({ js: "".concat(lines.join('\n'), "\n") }, declaration);
    };
    FaceModelEmitter.prototype.invocationLiteral = function (invocation, schemas) {
        var lines = [
            '{',
            "  id: ".concat(quote(invocation.id), ","),
            "  service: ".concat(quote(invocation.service), ","),
            "  namespace: ".concat(quote(invocation.namespace), ","),
            "  method: ".concat(quote(invocation.method), ","),
        ];
        if (invocation.implementation !== undefined) {
            lines.push("  implementation: ".concat(quote(invocation.implementation), ","));
        }
        if (invocation.invocation.kind === 'direct') {
            lines.push('  invocation: { kind: \'direct\' },');
        }
        else {
            lines.push('  invocation: {');
            lines.push('    kind: \'context\',');
            lines.push("    context: ".concat(quote(invocation.invocation.context), ","));
            lines.push("    wire: ".concat(quote(invocation.invocation.wire), ","));
            lines.push("    codec: ".concat(indent(strictCodec(invocation.invocation.boundary, schemas.boundary(contextBoundaryKey(invocation))), 4).trimStart(), ","));
            lines.push('  },');
        }
        if (invocation.scope !== undefined) {
            lines.push('  scope: {');
            lines.push("    context: ".concat(quote(invocation.scope.context), ","));
            lines.push("    wire: ".concat(quote(invocation.scope.wire), ","));
            lines.push('  },');
        }
        lines.push('  parameters: [');
        invocation.parameters.forEach(function (parameter, index) {
            lines.push('    {');
            lines.push("      name: ".concat(quote(parameter.name), ","));
            lines.push("      wire: ".concat(quote(parameter.wire), ","));
            lines.push("      source: ".concat(quote(parameter.source), ","));
            if (parameter.lookup !== undefined)
                lines.push("      lookup: ".concat(quote(parameter.lookup), ","));
            if (parameter.boundary.acceptsUndefined)
                lines.push('      acceptsUndefined: true,');
            lines.push("      codec: ".concat(indent(strictCodec(parameter.boundary, schemas.boundary(parameterBoundaryKey(invocation, index))), 6).trimStart(), ","));
            lines.push('    },');
        });
        lines.push('  ],');
        if (invocation.cancellation !== undefined) {
            lines.push("  cancellation: { parameter: 'signal' },");
        }
        lines.push("  result: ".concat(indent(strictCodec(invocation.result, schemas.boundary(resultBoundaryKey(invocation))), 2).trimStart(), ","));
        lines.push("  sourceLocation: ".concat(JSON.stringify(invocation.location), ","));
        lines.push('}');
        return lines.join('\n');
    };
    FaceModelEmitter.prototype.renderRemoteDts = function (packageModel) {
        var _a;
        var imports = remoteImports(packageModel.invocations);
        var referenceNames = allocateRemoteImportNames(imports);
        var grouped = new Map();
        for (var _i = 0, imports_1 = imports; _i < imports_1.length; _i++) {
            var imported = imports_1[_i];
            var values = (_a = grouped.get(imported.specifier)) !== null && _a !== void 0 ? _a : [];
            values.push({
                name: imported.name,
                local: referenceNames.get(imported.symbol),
            });
            grouped.set(imported.specifier, values);
        }
        var lines = [
            '/* Generated by @z/dsh-typert-generator from the Host FaceModel — do not edit. */',
            'import type {',
            '  RemoteResult,',
            '  TypertRemoteContribution,',
            '} from \'@z/dsh-typert-protocol\'',
        ];
        var sourceMap = new gen_mapping_1.GenMapping({ file: 'typert.remote-client.d.ts' });
        for (var _b = 0, _c = __spreadArray([], grouped, true).sort(function (_a, _b) {
            var left = _a[0];
            var right = _b[0];
            return left.localeCompare(right);
        }); _b < _c.length; _b++) {
            var _d = _c[_b], specifier = _d[0], values = _d[1];
            var names = values.sort(function (left, right) { return left.local.localeCompare(right.local); }).map(function (value) {
                return value.name === value.local ? value.name : "".concat(value.name, " as ").concat(value.local);
            });
            lines.push("import type { ".concat(names.join(', '), " } from ").concat(quote(specifier)));
        }
        lines.push('');
        lines.push('declare module \'@z/dsh-typert-protocol\' {');
        var direct = packageModel.invocations.filter(function (invocation) { return invocation.invocation.kind === 'direct'; });
        var scoped = packageModel.invocations.filter(function (invocation) {
            return invocation.invocation.kind === 'context' || invocation.scope !== undefined;
        });
        if (direct.length > 0) {
            var _loop_1 = function (namespace) {
                lines.push("  interface ".concat(remoteNamespaceInterface(namespace), " {"));
                for (var _l = 0, _m = direct.filter(function (candidate) { return candidate.namespace === namespace; }); _l < _m.length; _l++) {
                    var invocation = _m[_l];
                    this_1.pushRemoteNamespaceSignature(lines, sourceMap, packageModel, invocation, referenceNames);
                }
                lines.push('  }');
            };
            var this_1 = this;
            for (var _e = 0, _f = uniqueNamespaces(direct); _e < _f.length; _e++) {
                var namespace = _f[_e];
                _loop_1(namespace);
            }
            lines.push('  interface TypertRemoteMap {');
            for (var _g = 0, direct_1 = direct; _g < direct_1.length; _g++) {
                var invocation = direct_1[_g];
                this.pushRemoteSignature(lines, sourceMap, packageModel, invocation, referenceNames, false);
            }
            lines.push('  }');
            lines.push('  interface TypertRemoteNamespaceMap {');
            for (var _h = 0, _j = uniqueNamespaces(direct); _h < _j.length; _h++) {
                var namespace = _j[_h];
                lines.push("    ".concat(quote(namespace), ": ").concat(remoteNamespaceInterface(namespace)));
            }
            lines.push('  }');
        }
        if (scoped.length > 0) {
            lines.push('  interface TypertRemoteScopeMap {');
            for (var _k = 0, scoped_1 = scoped; _k < scoped_1.length; _k++) {
                var invocation = scoped_1[_k];
                this.pushRemoteSignature(lines, sourceMap, packageModel, invocation, referenceNames, true);
            }
            lines.push('  }');
        }
        lines.push('}');
        lines.push('');
        lines.push('export declare const TYPERT_REMOTE: TypertRemoteContribution');
        lines.push('export default TYPERT_REMOTE');
        lines.push('//# sourceMappingURL=typert.remote-client.d.ts.map');
        return {
            dts: "".concat(lines.join('\n'), "\n"),
            dtsMap: "".concat(JSON.stringify((0, gen_mapping_1.toEncodedMap)(sourceMap)), "\n"),
        };
    };
    FaceModelEmitter.prototype.pushRemoteSignature = function (lines, sourceMap, packageModel, invocation, referenceNames, scoped) {
        var signature = this.remoteSignature(invocation, referenceNames, scoped);
        var keyLength = signature.indexOf(': (');
        if (keyLength < 0)
            throw new TypertEmitError("Remote signature ".concat(invocation.id, " has no property delimiter"));
        this.pushMappedRemoteSignature(lines, sourceMap, packageModel, invocation, signature, keyLength);
    };
    FaceModelEmitter.prototype.pushRemoteNamespaceSignature = function (lines, sourceMap, packageModel, invocation, referenceNames) {
        var key = renderRemotePropertyName(invocation.method);
        var signature = "".concat(key, ": ").concat(this.remoteFunctionType(invocation, referenceNames, false));
        this.pushMappedRemoteSignature(lines, sourceMap, packageModel, invocation, signature, key.length);
    };
    FaceModelEmitter.prototype.pushMappedRemoteSignature = function (lines, sourceMap, packageModel, invocation, signature, keyLength) {
        lines.push("    ".concat(signature));
        var generatedLine = lines.length;
        var source = remoteDeclarationSource(packageModel, invocation);
        (0, gen_mapping_1.addMapping)(sourceMap, {
            generated: { line: generatedLine, column: 4 },
            source: source,
            original: { line: invocation.location.line, column: invocation.location.column - 1 },
            name: invocation.method,
        });
        (0, gen_mapping_1.addMapping)(sourceMap, {
            generated: { line: generatedLine, column: 4 + keyLength },
        });
    };
    FaceModelEmitter.prototype.remoteSignature = function (invocation, referenceNames, scoped) {
        var _a;
        var context = invocation.invocation.kind === 'context'
            ? invocation.invocation.context
            : (_a = invocation.scope) === null || _a === void 0 ? void 0 : _a.context;
        var key = scoped
            ? "".concat(context, ":").concat(invocation.namespace, "/").concat(invocation.method)
            : "".concat(invocation.namespace, "/").concat(invocation.method);
        return "".concat(quote(key), ": ").concat(this.remoteFunctionType(invocation, referenceNames, scoped));
    };
    FaceModelEmitter.prototype.remoteFunctionType = function (invocation, referenceNames, scoped) {
        var _this = this;
        var parameters = invocation.parameters.filter(function (parameter) { var _a; return !scoped || invocation.invocation.kind === 'context' || parameter.wire !== ((_a = invocation.scope) === null || _a === void 0 ? void 0 : _a.wire); }).map(function (parameter) {
            return "".concat(safeIdentifier(parameter.wire)).concat(parameter.optional === true ? '?' : '', ": ").concat(_this.renderer.renderType(parameter.boundary.type, referenceNames));
        });
        if (invocation.cancellation !== undefined)
            parameters.push('signal?: AbortSignal');
        var result = this.renderer.renderType(invocation.result.type, referenceNames);
        // The Client Remote face delivers the carrier's outcome, so every generated
        // consumer signature resolves to a result the caller reads instead of a
        // value it must guard with its own try/catch.
        return "(".concat(parameters.join(', '), ") => Promise<RemoteResult<").concat(result, ">>");
    };
    return FaceModelEmitter;
}());
exports.FaceModelEmitter = FaceModelEmitter;
function remoteDeclarationSource(packageModel, invocation) {
    var relativeSource = node_path_1.posix.relative(packageModel.root, invocation.location.file);
    if (relativeSource === '' || relativeSource === '..' || relativeSource.startsWith('../') || node_path_1.posix.isAbsolute(relativeSource)) {
        throw new TypertEmitError("Remote declaration ".concat(invocation.id, " is outside its package root ").concat(packageModel.root));
    }
    return node_path_1.posix.join('..', relativeSource);
}
function uniqueNamespaces(invocations) {
    return __spreadArray([], new Set(invocations.map(function (invocation) { return invocation.namespace; })), true).sort();
}
function remoteNamespaceInterface(namespace) {
    return "TypertRemoteNamespace$".concat(node_buffer_1.Buffer.from(namespace, 'utf8').toString('hex'));
}
var SchemaEmitter = /** @class */ (function () {
    function SchemaEmitter(renderer, schemas, boundaries) {
        this.renderer = renderer;
        this.schemas = schemas;
        this.boundaries = boundaries;
        this.names = new Map();
        this.boundaryNames = new Map();
        var declarations = new Map();
        for (var _i = 0, schemas_1 = schemas; _i < schemas_1.length; _i++) {
            var schema = schemas_1[_i];
            for (var _a = 0, _b = renderer.declarationClosureForTypes([schema.type]); _a < _b.length; _a++) {
                var declaration = _b[_a];
                declarations.set(declaration.id, declaration);
            }
        }
        for (var _c = 0, boundaries_1 = boundaries; _c < boundaries_1.length; _c++) {
            var boundary = boundaries_1[_c];
            for (var _d = 0, _e = renderer.declarationClosureForTypes([boundary.type]); _d < _e.length; _d++) {
                var declaration = _e[_d];
                declarations.set(declaration.id, declaration);
            }
        }
        this.declarations = renderer.graph.declarations.filter(function (declaration) { return declarations.has(declaration.id); });
        var identifiers = new Set();
        for (var _f = 0, _g = this.declarations; _f < _g.length; _f++) {
            var declaration = _g[_f];
            var base = "".concat(safeIdentifier(declaration.name), "$schema");
            var name_1 = base;
            var suffix = 2;
            while (identifiers.has(name_1))
                name_1 = "".concat(base).concat(String(suffix++));
            identifiers.add(name_1);
            this.names.set(declaration.id, name_1);
        }
        for (var _h = 0, boundaries_2 = boundaries; _h < boundaries_2.length; _h++) {
            var boundary = boundaries_2[_h];
            var base = "".concat(safeIdentifier(boundary.key), "$schema");
            var name_2 = base;
            var suffix = 2;
            while (identifiers.has(name_2))
                name_2 = "".concat(base).concat(String(suffix++));
            identifiers.add(name_2);
            this.boundaryNames.set(boundary.key, name_2);
        }
    }
    SchemaEmitter.prototype.emit = function () {
        var _this = this;
        var definitions = this.declarations.map(function (declaration) { return _this.declarationDefinition(declaration); });
        for (var _i = 0, _a = this.boundaries; _i < _a.length; _i++) {
            var boundary = _a[_i];
            definitions.push("const ".concat(this.boundaryName(boundary.key), " = ").concat(this.typeSchema(boundary.type)));
        }
        var exports = this.schemas.map(function (model) { return ({
            model: model,
            exportName: safeIdentifier(model.export.name),
            internalName: _this.exportSchemaName(model),
        }); });
        return {
            definitions: definitions,
            exports: exports,
            boundary: function (key) { return _this.boundaryName(key); },
        };
    };
    SchemaEmitter.prototype.declarationDefinition = function (declaration) {
        var name = this.schemaName(declaration.id);
        if (declaration.typeParameters.length === 0) {
            return "const ".concat(name, " = ").concat(this.declarationSchema(declaration, new Map()));
        }
        var parameters = declaration.typeParameters.map(function (parameter, index) {
            return ["type".concat(String(index), "$schema"), parameter.id];
        });
        var substitutions = new Map(parameters.map(function (_a) {
            var schema = _a[0], id = _a[1];
            return [id, schema];
        }));
        return "const ".concat(name, " = (").concat(parameters.map(function (_a) {
            var schema = _a[0];
            return schema;
        }).join(', '), ") => ").concat(this.declarationSchema(declaration, substitutions));
    };
    SchemaEmitter.prototype.declarationSchema = function (declaration, substitutions) {
        if (declaration.kind === 'enum') {
            this.fail(declaration.name, 'enum declarations have no Zod projection');
        }
        if (declaration.kind === 'alias') {
            if (declaration.type === undefined)
                this.fail(declaration.name, 'alias has no modeled type');
            return this.describe(this.typeSchema(declaration.type, substitutions), declaration);
        }
        var own = this.objectSchema(declaration.members, declaration.name, substitutions);
        var result = own;
        for (var _i = 0, _a = declaration.extends; _i < _a.length; _i++) {
            var heritage = _a[_i];
            result = "z.intersection(".concat(this.typeSchema(heritage, substitutions), ", ").concat(result, ")");
        }
        return this.describe(result, declaration);
    };
    SchemaEmitter.prototype.typeSchema = function (id, substitutions) {
        var _this = this;
        if (substitutions === void 0) { substitutions = new Map(); }
        var node = this.renderer.node(id);
        switch (node.kind) {
            case 'keyword': return this.keywordSchema(node.name);
            case 'literal': return "z.literal(".concat(node.text, ")");
            case 'parenthesized': return this.typeSchema(node.type, substitutions);
            case 'reference': return this.referenceSchema(node, substitutions);
            case 'union': {
                if (node.types.length === 0)
                    return 'z.never()';
                if (node.types.length === 1)
                    return this.typeSchema(node.types[0], substitutions);
                return "z.union([".concat(node.types.map(function (type) { return _this.typeSchema(type, substitutions); }).join(', '), "])");
            }
            case 'intersection': {
                var _a = node.types, head = _a[0], tail = _a.slice(1);
                if (head === undefined)
                    return 'z.unknown()';
                return tail.reduce(function (left, right) { return "z.intersection(".concat(left, ", ").concat(_this.typeSchema(right, substitutions), ")"); }, this.typeSchema(head, substitutions));
            }
            case 'array': return "z.array(".concat(this.typeSchema(node.element, substitutions), ")");
            case 'tuple': {
                var fixed = node.elements.filter(function (element) { return !element.rest; });
                var rest = node.elements.find(function (element) { return element.rest; });
                var schema = "z.tuple([".concat(fixed.map(function (element) { return _this.optional(_this.typeSchema(element.type, substitutions), element.optional); }).join(', '), "])");
                if (rest !== undefined)
                    schema += ".rest(".concat(this.tupleRestSchema(rest.type, substitutions), ")");
                return schema;
            }
            case 'object': return this.objectSchema(node.members, id, substitutions);
            case 'operator':
            case 'indexed-access':
            case 'conditional':
            case 'infer':
            case 'mapped':
            case 'template-literal':
            case 'type-query':
            case 'import-type':
            case 'predicate':
            case 'function':
            case 'constructor':
            case 'this': return this.unsupported(node);
        }
    };
    SchemaEmitter.prototype.referenceSchema = function (node, substitutions) {
        if (node.target.kind === 'declaration') {
            var name_3 = this.schemaName(node.target.symbol);
            var declaration = this.renderer.declaration(node.target.symbol);
            if (declaration.typeParameters.length === 0) {
                if (node.arguments.length > 0) {
                    this.fail(node.name, "non-generic declaration received ".concat(String(node.arguments.length), " type arguments"));
                }
                return "z.lazy(() => ".concat(name_3, ")");
            }
            var arguments_ = this.declarationArguments(node, declaration, substitutions);
            return "z.lazy(() => ".concat(name_3, "(").concat(arguments_.join(', '), "))");
        }
        if (node.target.kind === 'type-parameter') {
            if (node.arguments.length > 0)
                this.fail(node.name, 'type parameter reference cannot receive type arguments');
            var schema = substitutions.get(node.target.parameter);
            if (schema === undefined)
                this.fail(node.name, 'type parameter has no schema substitution');
            return schema;
        }
        if (node.target.kind === 'standard') {
            switch (node.target.name) {
                case 'Array':
                case 'ReadonlyArray': {
                    var element = node.arguments[0];
                    if (element === undefined)
                        this.fail(node.name, 'array reference has no element type');
                    return this.readonly("z.array(".concat(this.typeSchema(element, substitutions), ")"), node.target.name === 'ReadonlyArray');
                }
                case 'Record': {
                    var key = node.arguments[0];
                    var value = node.arguments[1];
                    if (key === undefined || value === undefined)
                        this.fail(node.name, 'Record requires key and value types');
                    return "z.record(".concat(this.typeSchema(key, substitutions), ", ").concat(this.typeSchema(value, substitutions), ")");
                }
                case 'Date': return 'z.date()';
                default: this.fail(node.name, "standard type ".concat(node.target.name, " has no Zod projection"));
            }
        }
        this.fail(node.name, "".concat(node.target.kind, " reference has no Zod projection"));
    };
    SchemaEmitter.prototype.declarationArguments = function (node, declaration, substitutions) {
        if (node.arguments.length > declaration.typeParameters.length) {
            this.fail(node.name, "generic declaration accepts ".concat(String(declaration.typeParameters.length), " type arguments but received ").concat(String(node.arguments.length)));
        }
        var resolved = new Map(substitutions);
        var arguments_ = [];
        for (var _i = 0, _a = declaration.typeParameters.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], index = _b[0], parameter = _b[1];
            var argument = node.arguments[index];
            var schema = argument === undefined
                ? parameter.default === undefined
                    ? this.fail(node.name, "missing type argument ".concat(parameter.name))
                    : this.typeSchema(parameter.default, resolved)
                : this.typeSchema(argument, substitutions);
            arguments_.push(schema);
            resolved.set(parameter.id, schema);
        }
        return arguments_;
    };
    SchemaEmitter.prototype.tupleRestSchema = function (id, substitutions) {
        var node = this.renderer.node(id);
        if (node.kind === 'array')
            return this.typeSchema(node.element, substitutions);
        if (node.kind === 'reference'
            && node.target.kind === 'standard'
            && (node.target.name === 'Array' || node.target.name === 'ReadonlyArray')) {
            var element = node.arguments[0];
            if (element === undefined)
                this.fail(node.name, 'tuple rest array has no element type');
            return this.typeSchema(element, substitutions);
        }
        this.fail(id, 'tuple rest element must retain an array type');
    };
    SchemaEmitter.prototype.objectSchema = function (members, subject, substitutions) {
        var _a;
        var properties = [];
        var indices = [];
        var symbolMembers = 0;
        for (var _i = 0, members_1 = members; _i < members_1.length; _i++) {
            var member = members_1[_i];
            if (member.static || member.visibility !== 'public')
                continue;
            if (member.computed === 'symbol') {
                symbolMembers++;
                continue;
            }
            if (member.computed === 'dynamic') {
                this.fail(subject, "computed member ".concat(member.name, " has no fixed JSON property name"));
            }
            if (member.kind === 'index') {
                var parameter = member.signature.parameters[0];
                if (member.signature.parameters.length !== 1 || parameter === undefined) {
                    this.fail(subject, 'index signature must have exactly one key parameter');
                }
                indices.push(this.readonly("z.record(".concat(this.typeSchema(parameter.type, substitutions), ", ").concat(this.typeSchema(member.signature.returns, substitutions), ")"), member.readonly));
                continue;
            }
            if (member.kind !== 'property')
                this.fail(subject, "".concat(member.kind, " member ").concat(member.name, " is not data-schema projectable"));
            var property = this.describe(this.optional(this.readonly(this.typeSchema(member.type, substitutions), member.readonly), member.optional), member);
            properties.push("".concat(quote((_a = member.jsonName) !== null && _a !== void 0 ? _a : member.name), ": ").concat(property));
        }
        if (indices.length > 1)
            this.fail(subject, 'object type has more than one JSON index signature');
        // A unique-symbol-only object is a compile-time marker and imposes no JSON shape.
        if (properties.length === 0 && indices.length === 0 && symbolMembers > 0)
            return 'z.unknown()';
        var object = "z.object({".concat(properties.length === 0 ? '' : "\n".concat(properties.map(function (property) { return "  ".concat(property, ","); }).join('\n'), "\n"), "})");
        var index = indices[0];
        if (index === undefined)
            return object;
        if (properties.length === 0)
            return index;
        return "z.intersection(".concat(object, ", ").concat(index, ")");
    };
    SchemaEmitter.prototype.exportSchemaName = function (model) {
        var name = this.schemaName(model.symbol);
        var declaration = this.renderer.declaration(model.symbol);
        if (declaration.typeParameters.length > 0) {
            this.fail(model.export.name, 'generic schema exports require a concrete declaration');
        }
        return name;
    };
    SchemaEmitter.prototype.keywordSchema = function (name) {
        switch (name) {
            case 'any': return 'z.any()';
            case 'unknown': return 'z.unknown()';
            case 'never': return 'z.never()';
            case 'string': return 'z.string()';
            case 'number': return 'z.number()';
            case 'bigint': return 'z.bigint()';
            case 'boolean': return 'z.boolean()';
            case 'symbol': return 'z.symbol()';
            case 'undefined': return 'z.undefined()';
            case 'void': return 'z.void()';
            case 'object': return "z.custom((value) => (typeof value === 'object' && value !== null) || typeof value === 'function')";
            default: this.fail(name, "keyword ".concat(name, " has no Zod projection"));
        }
    };
    SchemaEmitter.prototype.schemaName = function (symbol) {
        var name = this.names.get(symbol);
        if (name === undefined)
            this.fail(symbol, 'referenced declaration is outside the selected schema closure');
        return name;
    };
    SchemaEmitter.prototype.boundaryName = function (key) {
        var name = this.boundaryNames.get(key);
        if (name === undefined)
            this.fail(key, 'invocation boundary is outside the selected schema roots');
        return name;
    };
    SchemaEmitter.prototype.describe = function (schema, documentation) {
        return documentation.description === undefined ? schema : "".concat(schema, ".describe(").concat(quote(documentation.description), ")");
    };
    SchemaEmitter.prototype.optional = function (schema, optional) {
        return optional ? "".concat(schema, ".optional()") : schema;
    };
    SchemaEmitter.prototype.readonly = function (schema, readonly) {
        return readonly ? "".concat(schema, ".readonly()") : schema;
    };
    SchemaEmitter.prototype.unsupported = function (node) {
        this.fail(node.id, "type node ".concat(node.kind, " has no Zod projection"));
    };
    SchemaEmitter.prototype.fail = function (subject, message) {
        throw new TypertEmitError("typert Zod emitter: ".concat(subject, ": ").concat(message));
    };
    return SchemaEmitter;
}());
function documentationLiteral(documentation) {
    return __assign(__assign(__assign(__assign({}, (documentation.description === undefined ? {} : { description: documentation.description })), (documentation.summary === undefined ? {} : { summary: documentation.summary })), { tags: documentation.tags }), (documentation.jsDoc === undefined ? {} : { jsDoc: documentation.jsDoc }));
}
function invocationBoundaryRoots(invocations) {
    var result = [];
    var _loop_2 = function (invocation) {
        if (invocation.invocation.kind === 'context') {
            result.push({ key: contextBoundaryKey(invocation), type: invocation.invocation.boundary.codecType });
        }
        invocation.parameters.forEach(function (parameter, index) {
            result.push({ key: parameterBoundaryKey(invocation, index), type: parameter.boundary.codecType });
        });
        result.push({ key: resultBoundaryKey(invocation), type: invocation.result.codecType });
    };
    for (var _i = 0, invocations_1 = invocations; _i < invocations_1.length; _i++) {
        var invocation = invocations_1[_i];
        _loop_2(invocation);
    }
    return result;
}
function contextBoundaryKey(invocation) {
    return "".concat(invocation.id, ":context");
}
function parameterBoundaryKey(invocation, index) {
    return "".concat(invocation.id, ":parameter:").concat(String(index));
}
function resultBoundaryKey(invocation) {
    return "".concat(invocation.id, ":result");
}
function strictCodec(boundary, schema) {
    return [
        '{',
        '  mode: \'strict\',',
        "  typeSymbol: ".concat(quote(boundary.typeSymbol), ","),
        "  schema: ".concat(schema, ","),
        '}',
    ].join('\n');
}
function remoteImports(invocations) {
    var imports = new Map();
    var add = function (boundary) {
        for (var _i = 0, _a = boundary.imports; _i < _a.length; _i++) {
            var imported = _a[_i];
            var current = imports.get(imported.symbol);
            if (current !== undefined
                && (current.specifier !== imported.specifier || current.name !== imported.name)) {
                throw new TypertEmitError("typert Remote emitter: symbol ".concat(imported.symbol, " has inconsistent public imports"));
            }
            imports.set(imported.symbol, imported);
        }
    };
    for (var _i = 0, invocations_2 = invocations; _i < invocations_2.length; _i++) {
        var invocation = invocations_2[_i];
        if (invocation.invocation.kind === 'context')
            add(invocation.invocation.boundary);
        for (var _a = 0, _b = invocation.parameters; _a < _b.length; _a++) {
            var parameter = _b[_a];
            add(parameter.boundary);
        }
        add(invocation.result);
    }
    return __spreadArray([], imports.values(), true).sort(function (left, right) {
        return left.specifier.localeCompare(right.specifier) || left.name.localeCompare(right.name);
    });
}
function allocateRemoteImportNames(imports) {
    var used = new Set(['TypertRemoteContribution', 'TYPERT_REMOTE']);
    var names = new Map();
    for (var _i = 0, imports_2 = imports; _i < imports_2.length; _i++) {
        var imported = imports_2[_i];
        var base = safeIdentifier(imported.name);
        var name_4 = base;
        var suffix = 2;
        while (used.has(name_4))
            name_4 = "".concat(base, "$remote").concat(String(suffix++));
        used.add(name_4);
        names.set(imported.symbol, name_4);
    }
    return names;
}
function packageExportSpecifier(packageName, subpath) {
    return subpath === '.' ? packageName : "".concat(packageName).concat(subpath.slice(1));
}
function safeIdentifier(name) {
    var normalized = name.replace(/[^$\w]/gu, '_');
    if (/^[$A-Z_a-z]/u.test(normalized))
        return normalized;
    return "_".concat(normalized);
}
function renderRemotePropertyName(name) {
    return /^[$A-Z_a-z][$\w]*$/u.test(name) ? name : quote(name);
}
function quote(value) {
    return "'".concat(value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n').replaceAll('\r', '\\r'), "'");
}
function indent(value, spaces) {
    var prefix = ' '.repeat(spaces);
    return value.split('\n').map(function (line) { return "".concat(prefix).concat(line); }).join('\n');
}
