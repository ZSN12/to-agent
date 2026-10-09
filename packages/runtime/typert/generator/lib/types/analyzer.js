"use strict";
/**
 * TypeScript project analyzer for the compiler-independent Typert model.
 * Programs, symbols, and syntax nodes remain extraction-only implementation
 * details; callers receive only the model declared in {@link ./model.ts}.
 * @module @z/dsh-typert-generator/analyzer
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
exports.WorkspaceAnalyzer = exports.WorkspaceCaches = exports.TypertAnalysisError = void 0;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var typescript_1 = require("typescript");
/** Analysis failure with a source-oriented diagnostic. */
var TypertAnalysisError = /** @class */ (function (_super) {
    __extends(TypertAnalysisError, _super);
    function TypertAnalysisError() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.name = 'TypertAnalysisError';
        return _this;
    }
    return TypertAnalysisError;
}(Error));
exports.TypertAnalysisError = TypertAnalysisError;
var SourceEditQueued = /** @class */ (function (_super) {
    __extends(SourceEditQueued, _super);
    function SourceEditQueued() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return SourceEditQueued;
}(Error));
var EMPTY_DOCUMENTATION = { tags: [] };
/**
 * Process-wide parse cache for the bundled TypeScript default libraries.
 * `typescript/lib/lib.*.d.ts` content is immutable for the process lifetime,
 * so parses are shared across every {@link WorkspaceCaches} instance; the key
 * carries the parse-affecting settings, keeping reuse exact.
 */
var defaultLibraryParses = new Map();
function defaultLibraryKey(fileName, languageVersionOrOptions) {
    var _a, _b;
    var options = typeof languageVersionOrOptions === 'object'
        ? languageVersionOrOptions
        : { languageVersion: languageVersionOrOptions };
    return [
        fileName,
        String(options.languageVersion),
        String((_a = options.impliedNodeFormat) !== null && _a !== void 0 ? _a : ''),
        String((_b = options.jsDocParsingMode) !== null && _b !== void 0 ? _b : ''),
    ].join('\0');
}
/**
 * Shared memo over one immutable workspace snapshot. Passing one instance to
 * several analyzers (the batched and write-mode children reuse their parent's
 * automatically) reuses parsed tsconfigs, the registration inventory, and
 * per-face compiler hosts whose parsed and bound source files and module
 * resolutions carry across programs. Callers that mutate workspace files
 * between analyses must start from a fresh instance; write-mode source edits
 * invalidate themselves through {@link invalidate}.
 */
var WorkspaceCaches = /** @class */ (function () {
    function WorkspaceCaches() {
        /** Parsed tsconfig files by absolute config path. */
        this.configs = new Map();
        /** Registration inventories keyed by root and aggregate config paths. */
        this.registrations = new Map();
        this.hosts = new Map();
    }
    /**
     * Parse one tsconfig once per workspace snapshot.
     * @param path - absolute config path.
     * @returns the memoized parse result.
     */
    WorkspaceCaches.prototype.config = function (path) {
        var parsed = this.configs.get(path);
        if (parsed === undefined) {
            parsed = parseConfig(path);
            this.configs.set(path, parsed);
        }
        return parsed;
    };
    /**
     * Return the shared compiler host for one face. Every program of one face
     * is built from the same aggregate compiler options (the first call wins),
     * so parsed source files, binder state, and module resolutions are safe to
     * reuse across the face's batched programs.
     * @param face - the face whose programs share this host.
     * @param options - the face's effective compiler options.
     * @returns a compiler host with source-file and module-resolution caches.
     */
    WorkspaceCaches.prototype.programHost = function (face, options) {
        var entry = this.hosts.get(face);
        if (entry === undefined) {
            var host_1 = typescript_1.default.createCompilerHost(options);
            var files_1 = new Map();
            var resolutionCache_1 = typescript_1.default.createModuleResolutionCache(host_1.getCurrentDirectory(), function (fileName) { return host_1.getCanonicalFileName(fileName); }, options);
            var base_1 = host_1.getSourceFile.bind(host_1);
            // The snapshot contract makes shouldCreateNewSourceFile irrelevant: it
            // only fires under oldProgram reuse, which these fresh programs never
            // request, and invalidate() is the one supported re-read path.
            host_1.getSourceFile = function (fileName, languageVersionOrOptions, onError) {
                if (isStandardLibraryFile(fileName)) {
                    var key = defaultLibraryKey(fileName, languageVersionOrOptions);
                    if (!defaultLibraryParses.has(key)) {
                        defaultLibraryParses.set(key, base_1(fileName, languageVersionOrOptions, onError));
                    }
                    return defaultLibraryParses.get(key);
                }
                if (!files_1.has(fileName))
                    files_1.set(fileName, base_1(fileName, languageVersionOrOptions, onError));
                return files_1.get(fileName);
            };
            host_1.getModuleResolutionCache = function () { return resolutionCache_1; };
            entry = { host: host_1, files: files_1 };
            this.hosts.set(face, entry);
        }
        return entry.host;
    };
    /**
     * Drop cached parses of one edited source file so the next analysis reads
     * the written content.
     * @param file - path of the edited file.
     */
    WorkspaceCaches.prototype.invalidate = function (file) {
        var target = realPath(file);
        for (var _i = 0, _a = this.hosts.values(); _i < _a.length; _i++) {
            var files = _a[_i].files;
            for (var _b = 0, _c = __spreadArray([], files.keys(), true); _b < _c.length; _b++) {
                var key = _c[_b];
                if (realPath(key) === target)
                    files.delete(key);
            }
        }
    };
    return WorkspaceCaches;
}());
exports.WorkspaceCaches = WorkspaceCaches;
/** Analyze host and client as independent TypeScript programs. */
var WorkspaceAnalyzer = /** @class */ (function () {
    function WorkspaceAnalyzer(options) {
        var _a, _b, _c, _d, _e, _f;
        this.crossFaceLinks = new Map();
        this.checkedProjects = new Set();
        this.registrations = [];
        this.options = __assign({ root: realPath(options.root), hostConfig: (_a = options.hostConfig) !== null && _a !== void 0 ? _a : 'tsconfig.host.json', clientConfig: (_b = options.clientConfig) !== null && _b !== void 0 ? _b : 'tsconfig.client.json', faces: (_c = options.faces) !== null && _c !== void 0 ? _c : ['host', 'client'], checkDiagnostics: (_d = options.checkDiagnostics) !== null && _d !== void 0 ? _d : true, mode: (_e = options.mode) !== null && _e !== void 0 ? _e : 'check' }, (options.packages === undefined ? {} : { packages: options.packages }));
        this.caches = (_f = options.caches) !== null && _f !== void 0 ? _f : new WorkspaceCaches();
    }
    /**
     * Build the workspace model. Write mode applies inferred annotations and then
     * returns a fresh check-mode analysis of the edited projects.
     * @returns the independent face models and their explicit cross-face links.
     */
    WorkspaceAnalyzer.prototype.analyze = function () {
        var _this = this;
        this.registrations = this.loadRegistrations();
        var selected = this.options.packages === undefined
            ? undefined
            : new Set(this.options.packages);
        var faces = [];
        try {
            var _loop_1 = function (face) {
                var registrations = this_1.registrations.filter(function (registration) {
                    return registration.face === face && (selected === undefined || selected.has(registration.name));
                });
                if (registrations.length === 0)
                    return "continue";
                if (this_1.options.checkDiagnostics) {
                    for (var _b = 0, registrations_1 = registrations; _b < registrations_1.length; _b++) {
                        var registration = registrations_1[_b];
                        this_1.checkProject(registration);
                    }
                }
                var aggregatePath = (0, node_path_1.resolve)(this_1.options.root, face === 'host' ? this_1.options.hostConfig : this_1.options.clientConfig);
                var aggregate = this_1.caches.config(aggregatePath);
                var rootNames = __spreadArray([], new Set(registrations.flatMap(function (registration) { return registration.config.parsed.fileNames; })), true);
                var options = __assign(__assign({}, aggregate.parsed.options), { composite: false, incremental: false, noEmit: true });
                var program = typescript_1.default.createProgram({
                    rootNames: rootNames,
                    options: options,
                    host: this_1.caches.programHost(face, options),
                });
                faces.push(new FaceAnalyzer({
                    root: this_1.options.root,
                    face: face,
                    program: program,
                    registrations: registrations,
                    allRegistrations: this_1.registrations,
                    mode: this_1.options.mode,
                    queueEdit: function (edit) { _this.queueEdit(edit); },
                    crossFaceLinks: this_1.crossFaceLinks,
                }).analyze());
            };
            var this_1 = this;
            for (var _i = 0, _a = this.options.faces; _i < _a.length; _i++) {
                var face = _a[_i];
                _loop_1(face);
            }
        }
        catch (error) {
            if (!(error instanceof SourceEditQueued) || this.options.mode !== 'write' || this.queuedEdit === undefined)
                throw error;
        }
        if (this.queuedEdit !== undefined) {
            this.applyEdit(this.queuedEdit);
            return new WorkspaceAnalyzer(__assign(__assign({}, this.options), { caches: this.caches, mode: 'write' })).analyze();
        }
        if (this.options.mode === 'write') {
            return new WorkspaceAnalyzer(__assign(__assign({}, this.options), { caches: this.caches, mode: 'check' })).analyze();
        }
        return {
            faces: faces,
            crossFaceLinks: __spreadArray([], this.crossFaceLinks.values(), true).sort(compareCrossFaceLinks),
        };
    };
    /**
     * Analyze an explicit package selection through bounded compiler programs.
     * The resulting model is identical in shape to {@link analyze}; stable graph
     * ids let repeated dependency declarations merge without flattening types.
     * @param batchSize - maximum selected packages in one face program.
     * @returns one merged workspace model.
     */
    WorkspaceAnalyzer.prototype.analyzeInBatches = function (batchSize) {
        if (batchSize === void 0) { batchSize = 8; }
        if (this.options.packages === undefined) {
            throw new TypertAnalysisError('typert: batched analysis requires an explicit package selection');
        }
        if (!Number.isInteger(batchSize) || batchSize < 1) {
            throw new TypertAnalysisError("typert: batch size must be a positive integer, received ".concat(String(batchSize)));
        }
        var batches = [];
        for (var index = 0; index < this.options.packages.length; index += batchSize) {
            batches.push(new WorkspaceAnalyzer(__assign(__assign({}, this.options), { caches: this.caches, packages: this.options.packages.slice(index, index + batchSize) })).analyze());
        }
        return mergeWorkspaceModels(batches);
    };
    /**
     * Discover package faces from public-export-reachable Cordis augmentations
     * and explicit `@typert` roots without constructing a type-checker program.
     * @returns contributors grouped by package with deterministic face order.
     */
    WorkspaceAnalyzer.prototype.discoverPackages = function () {
        var _this = this;
        var _a;
        var registrations = this.loadRegistrations()
            .filter(function (registration) { return _this.options.faces.includes(registration.face); })
            .filter(function (registration) { return _this.registrationHasSurface(registration); });
        var packages = new Map();
        for (var _i = 0, registrations_2 = registrations; _i < registrations_2.length; _i++) {
            var registration = registrations_2[_i];
            var current = (_a = packages.get(registration.name)) !== null && _a !== void 0 ? _a : {
                root: slash((0, node_path_1.relative)(this.options.root, registration.root)),
                faces: new Set(),
            };
            current.faces.add(registration.face);
            packages.set(registration.name, current);
        }
        return __spreadArray([], packages, true).map(function (_a) {
            var packageName = _a[0], value = _a[1];
            return ({
                package: packageName,
                root: value.root,
                faces: __spreadArray([], value.faces, true).sort(),
            });
        })
            .sort(function (left, right) { return left.package.localeCompare(right.package); });
    };
    /**
     * Index top-level exported type declarations without promoting them to graph
     * roots. Consumers use this lexical index for ambiguity checks while all
     * semantic traversal continues through {@link TypeGraph}.
     * @returns declarations from the selected faces and package projects.
     */
    WorkspaceAnalyzer.prototype.indexSourceDeclarations = function () {
        var selected = this.options.packages === undefined ? undefined : new Set(this.options.packages);
        var declarations = [];
        for (var _i = 0, _a = this.loadRegistrations(); _i < _a.length; _i++) {
            var registration = _a[_i];
            if (!this.options.faces.includes(registration.face)
                || (selected !== undefined && !selected.has(registration.name)))
                continue;
            for (var _b = 0, _c = registration.config.parsed.fileNames; _b < _c.length; _b++) {
                var file = _c[_b];
                var relativeFile = slash((0, node_path_1.relative)(this.options.root, file));
                if (!(0, node_fs_1.existsSync)(file)
                    || !isWithin(realPath(file), (0, node_path_1.join)(registration.root, 'src'))
                    || !/\.(?:cts|mts|ts)$/.test(file))
                    continue;
                var sourceFile = typescript_1.default.createSourceFile(file, (0, node_fs_1.readFileSync)(file, 'utf8'), typescript_1.default.ScriptTarget.Latest, true);
                for (var _d = 0, _e = sourceFile.statements; _d < _e.length; _d++) {
                    var statement = _e[_d];
                    if (!isTypeDeclaration(statement)
                        || statement.name === undefined
                        || !hasModifier(statement, typescript_1.default.SyntaxKind.ExportKeyword))
                        continue;
                    var position = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile));
                    declarations.push({
                        face: registration.face,
                        package: registration.name,
                        name: statement.name.text,
                        kind: typescript_1.default.isClassDeclaration(statement)
                            ? 'class'
                            : typescript_1.default.isInterfaceDeclaration(statement)
                                ? 'interface'
                                : typescript_1.default.isTypeAliasDeclaration(statement)
                                    ? 'alias'
                                    : 'enum',
                        location: {
                            file: relativeFile,
                            line: position.line + 1,
                            column: position.character + 1,
                        },
                        text: declarationText(statement),
                    });
                }
            }
        }
        return uniqueBy(declarations, function (declaration) {
            return "".concat(declaration.face, "\0").concat(declaration.location.file, "\0").concat(String(declaration.location.line), "\0").concat(declaration.name);
        })
            .sort(function (left, right) { return left.face.localeCompare(right.face)
            || left.location.file.localeCompare(right.location.file)
            || left.location.line - right.location.line; });
    };
    WorkspaceAnalyzer.prototype.loadRegistrations = function () {
        var _a;
        var inventoryKey = "".concat(this.options.root, "\0").concat(this.options.hostConfig, "\0").concat(this.options.clientConfig);
        var cached = this.caches.registrations.get(inventoryKey);
        if (cached !== undefined)
            return cached;
        var registrations = [];
        for (var _i = 0, _b = ['host', 'client']; _i < _b.length; _i++) {
            var face = _b[_i];
            var aggregatePath = (0, node_path_1.resolve)(this.options.root, face === 'host' ? this.options.hostConfig : this.options.clientConfig);
            if (!(0, node_fs_1.existsSync)(aggregatePath))
                continue;
            var aggregate = this.caches.config(aggregatePath);
            for (var _c = 0, _d = (_a = aggregate.parsed.projectReferences) !== null && _a !== void 0 ? _a : []; _c < _d.length; _c++) {
                var reference = _d[_c];
                var configPath = projectConfigPath(reference.path);
                var packageRoot = (0, node_path_1.dirname)(configPath);
                if (!isWithin(realPath(packageRoot), (0, node_path_1.join)(this.options.root, 'packages')))
                    continue;
                var manifestPath = (0, node_path_1.join)(packageRoot, 'package.json');
                if (!(0, node_fs_1.existsSync)(manifestPath))
                    continue;
                var manifest = JSON.parse((0, node_fs_1.readFileSync)(manifestPath, 'utf8'));
                if (typeof manifest.name !== 'string')
                    continue;
                var registration = {
                    face: face,
                    name: manifest.name,
                    root: realPath(packageRoot),
                    config: this.caches.config(configPath),
                    manifest: manifest,
                };
                if (!isDualFacePackage(manifest)) {
                    registrations.push(registration);
                }
                else if (configPath === (0, node_path_1.join)(packageRoot, 'tsconfig.json')) {
                    registrations.push(__assign(__assign({}, registration), { face: 'host', exportSubpaths: hostExportSubpaths(manifest) }), __assign(__assign({}, registration), { face: 'client', exportSubpaths: clientExportSubpaths(manifest) }));
                }
                else {
                    registrations.push(__assign(__assign({}, registration), { exportSubpaths: face === 'host'
                            ? hostExportSubpaths(manifest)
                            : clientExportSubpaths(manifest) }));
                }
            }
        }
        var inventory = uniqueBy(registrations, function (registration) { return "".concat(registration.face, "\0").concat(registration.name); })
            .sort(function (left, right) {
            return left.face.localeCompare(right.face) || left.name.localeCompare(right.name);
        });
        this.caches.registrations.set(inventoryKey, inventory);
        return inventory;
    };
    WorkspaceAnalyzer.prototype.entrySourcePaths = function (registration) {
        return packageExportTargets(registration.manifest)
            .filter(function (_a) {
            var subpath = _a[0], target = _a[1];
            return (registration.exportSubpaths === undefined
                || registration.exportSubpaths.includes(subpath))
                && !target.includes('*')
                && subpath !== './package.json'
                && subpath !== './typert'
                && subpath !== './client/typert'
                && subpath !== './remote'
                && !target.endsWith('.json');
        })
            .map(function (_a) {
            var target = _a[1];
            return sourcePathForExport(registration.root, target);
        })
            .filter(node_fs_1.existsSync);
    };
    WorkspaceAnalyzer.prototype.registrationHasSurface = function (registration) {
        var seen = new Set();
        var queue = this.entrySourcePaths(registration);
        while (queue.length > 0) {
            var file = realPath(queue.shift());
            if (seen.has(file) || !isWithin(file, registration.root))
                continue;
            seen.add(file);
            var source = (0, node_fs_1.readFileSync)(file, 'utf8');
            var sourceFile = typescript_1.default.createSourceFile(file, source, typescript_1.default.ScriptTarget.Latest, true);
            if (sourceFileHasSurface(sourceFile))
                return true;
            for (var _i = 0, _a = typescript_1.default.preProcessFile(source).importedFiles; _i < _a.length; _i++) {
                var imported = _a[_i];
                var resolved = typescript_1.default.resolveModuleName(imported.fileName, file, registration.config.parsed.options, typescript_1.default.sys).resolvedModule;
                if (resolved !== undefined && isWithin(resolved.resolvedFileName, registration.root)) {
                    queue.push(resolved.resolvedFileName);
                }
            }
        }
        return false;
    };
    WorkspaceAnalyzer.prototype.checkProject = function (registration) {
        var _this = this;
        if (this.checkedProjects.has(registration.config.path))
            return;
        this.checkedProjects.add(registration.config.path);
        var program = typescript_1.default.createProgram({
            rootNames: registration.config.parsed.fileNames,
            options: __assign(__assign({}, registration.config.parsed.options), { composite: false, incremental: false, noEmit: true, 
                // Source-plane workspace aliases resolve referenced packages to source.
                // Widen only this diagnostic program's root so those imports do not
                // produce an artificial TS6059 before Typert checks the public edge.
                rootDir: this.options.root }),
        });
        var diagnostics = __spreadArray(__spreadArray([], program.getSyntacticDiagnostics(), true), program.getSemanticDiagnostics(), true).filter(function (diagnostic) { return diagnostic.file !== undefined
            && diagnostic.start !== undefined
            && isWithin(diagnostic.file.fileName, registration.root); });
        if (diagnostics.length === 0)
            return;
        throw new TypertAnalysisError(diagnostics
            .map(function (diagnostic) { return formatProgramDiagnostic(_this.options.root, registration.face, diagnostic); })
            .join('\n'));
    };
    WorkspaceAnalyzer.prototype.queueEdit = function (edit) {
        this.queuedEdit = edit;
    };
    WorkspaceAnalyzer.prototype.applyEdit = function (edit) {
        var source = (0, node_fs_1.readFileSync)(edit.file, 'utf8');
        (0, node_fs_1.writeFileSync)(edit.file, source.slice(0, edit.position) + edit.text + source.slice(edit.position));
        this.caches.invalidate(edit.file);
    };
    return WorkspaceAnalyzer;
}());
exports.WorkspaceAnalyzer = WorkspaceAnalyzer;
var FaceAnalyzer = /** @class */ (function () {
    function FaceAnalyzer(options) {
        this.sourceFiles = new Map();
        this.declarations = new Map();
        this.declarationStates = new Set();
        this.nodes = new Map();
        this.exportsByPackage = new Map();
        this.nodeOrdinals = new Map();
        this.root = options.root;
        this.face = options.face;
        this.program = options.program;
        this.checker = options.program.getTypeChecker();
        this.registrations = options.registrations;
        this.allRegistrations = options.allRegistrations;
        this.mode = options.mode;
        this.queueEdit = options.queueEdit;
        this.crossFaceLinks = options.crossFaceLinks;
        for (var _i = 0, _a = this.program.getSourceFiles(); _i < _a.length; _i++) {
            var sourceFile = _a[_i];
            this.sourceFiles.set(realPath(sourceFile.fileName), sourceFile);
        }
    }
    FaceAnalyzer.prototype.analyze = function () {
        var _this = this;
        for (var _i = 0, _a = this.registrations; _i < _a.length; _i++) {
            var registration = _a[_i];
            this.exportsByPackage.set(registration.name, this.collectExports(registration));
        }
        var packages = this.registrations
            .map(function (registration) { return _this.analyzePackage(registration); })
            .filter(hasPackageSurface);
        this.validateInvocationIdentity(packages);
        return {
            face: this.face,
            packages: packages,
            graph: {
                declarations: __spreadArray([], this.declarations.values(), true).sort(function (left, right) { return left.id.localeCompare(right.id); }),
                nodes: __spreadArray([], this.nodes.values(), true).sort(function (left, right) { return left.id.localeCompare(right.id); }),
            },
        };
    };
    FaceAnalyzer.prototype.analyzePackage = function (registration) {
        var records = this.exportsByPackage.get(registration.name);
        var reachable = this.reachableFiles(registration, records.map(function (record) { return record.sourceFile; }));
        var services = [];
        var events = [];
        for (var _i = 0, reachable_1 = reachable; _i < reachable_1.length; _i++) {
            var sourceFile = reachable_1[_i];
            for (var _a = 0, _b = sourceFile.statements; _a < _b.length; _a++) {
                var statement = _b[_a];
                if (!typescript_1.default.isModuleDeclaration(statement)
                    || !typescript_1.default.isStringLiteral(statement.name)
                    || statement.name.text !== '@z/cordis'
                    || statement.body === undefined
                    || !typescript_1.default.isModuleBlock(statement.body))
                    continue;
                for (var _c = 0, _d = statement.body.statements; _c < _d.length; _c++) {
                    var member = _d[_c];
                    if (!typescript_1.default.isInterfaceDeclaration(member))
                        continue;
                    if (member.name.text === 'Context') {
                        services.push.apply(services, this.collectServices(member, records));
                    }
                    else if (member.name.text === 'Events') {
                        events.push.apply(events, this.collectEvents(member));
                    }
                }
            }
        }
        var explicitServices = this.collectExplicitServices(records);
        var objects = [];
        var schemas = [];
        var seenBusinessSymbols = new Set();
        for (var _e = 0, records_1 = records; _e < records_1.length; _e++) {
            var record = records_1[_e];
            var declaration = record.declaration;
            if (!isTypeDeclaration(declaration))
                continue;
            if (this.registrationForFile(declaration.getSourceFile().fileName) === undefined)
                continue;
            var symbol = this.resolveSymbol(record.symbol);
            var symbolId = this.symbolId(symbol);
            if (seenBusinessSymbols.has(symbolId))
                continue;
            var mode = typertMode(declaration);
            if (mode !== 'object' && mode !== 'schema')
                continue;
            seenBusinessSymbols.add(symbolId);
            this.ensureDeclaration(symbol, declaration);
            var documentation = documentationOf(declaration);
            if (mode === 'object') {
                objects.push(__assign(__assign({}, documentation), { export: record.model, symbol: symbolId, passing: 'reference' }));
            }
            else {
                schemas.push(__assign(__assign({}, documentation), { export: record.model, symbol: symbolId, type: this.referenceNode(symbol, declaration) }));
            }
        }
        return {
            name: registration.name,
            root: slash((0, node_path_1.relative)(this.root, registration.root)),
            exports: records.map(function (record) { return record.model; })
                .sort(function (left, right) { return left.subpath.localeCompare(right.subpath) || left.name.localeCompare(right.name); }),
            services: uniqueBy(__spreadArray(__spreadArray([], explicitServices, true), services, true), function (service) { return service.key; })
                .sort(function (left, right) { return left.key.localeCompare(right.key); }),
            events: uniqueBy(events, function (event) { return event.name; }).sort(function (left, right) { return left.name.localeCompare(right.name); }),
            objects: objects.sort(function (left, right) { return left.export.name.localeCompare(right.export.name); }),
            schemas: schemas.sort(function (left, right) { return left.export.name.localeCompare(right.export.name); }),
            invocations: this.face === 'host'
                ? this.collectInvocations(registration, reachable).sort(function (left, right) { return left.id.localeCompare(right.id); })
                : [],
        };
    };
    FaceAnalyzer.prototype.collectExports = function (registration) {
        var targets = packageExportTargets(registration.manifest)
            .filter(function (_a) {
            var subpath = _a[0];
            return registration.exportSubpaths === undefined
                || registration.exportSubpaths.includes(subpath);
        });
        var records = [];
        for (var _i = 0, targets_1 = targets; _i < targets_1.length; _i++) {
            var _a = targets_1[_i], subpath = _a[0], target = _a[1];
            if (target.includes('*') || subpath === './package.json'
                || subpath === './typert' || subpath === './client/typert' || subpath === './remote'
                // Data exports (bundle patch lists, JSON manifests) carry no TypeScript API.
                || target.endsWith('.json') || target.endsWith('.yml') || target.endsWith('.yaml'))
                continue;
            var sourcePath = sourcePathForExport(registration.root, target);
            var sourceFile = this.sourceFiles.get(realPath(sourcePath));
            if (sourceFile === undefined) {
                throw new TypertAnalysisError("typert(".concat(this.face, "): ").concat(registration.name, " export ").concat(subpath, " resolves to missing source ").concat(sourcePath));
            }
            var moduleSymbol = this.checker.getSymbolAtLocation(sourceFile);
            if (moduleSymbol === undefined)
                continue;
            for (var _b = 0, _c = this.checker.getExportsOfModule(moduleSymbol); _b < _c.length; _b++) {
                var exported = _c[_b];
                var symbol = this.resolveSymbol(exported);
                var declaration = preferredDeclaration(symbol);
                var aliases = exported === symbol || exported.name === symbol.name
                    ? [exported.name]
                    : [exported.name, symbol.name];
                records.push({
                    model: {
                        subpath: subpath,
                        name: exported.name,
                        symbol: this.symbolId(symbol),
                        aliases: aliases,
                    },
                    symbol: symbol,
                    declaration: declaration,
                    sourceFile: sourceFile,
                });
            }
        }
        var unique = uniqueBy(records, function (record) { return "".concat(record.model.subpath, "\0").concat(record.model.name); });
        this.collectCrossFaceReExports(registration, unique);
        return unique;
    };
    FaceAnalyzer.prototype.collectCrossFaceReExports = function (registration, records) {
        var _this = this;
        var _a;
        var publicSymbols = new Set(records.map(function (record) { return record.symbol; }));
        var entryFiles = uniqueBy(records, function (record) { return record.sourceFile.fileName; }).map(function (record) { return record.sourceFile; });
        for (var _i = 0, _b = this.reachableFiles(registration, entryFiles); _i < _b.length; _i++) {
            var sourceFile = _b[_i];
            var _loop_2 = function (statement) {
                if (!typescript_1.default.isExportDeclaration(statement)
                    || statement.moduleSpecifier === undefined
                    || !typescript_1.default.isStringLiteral(statement.moduleSpecifier))
                    return "continue";
                var module_1 = moduleIdentity(statement.moduleSpecifier.text);
                if (module_1 === undefined)
                    return "continue";
                var toFace = (_a = this_2.allRegistrations
                    .find(function (candidate) { return candidate.name === module_1.package && candidate.face !== _this.face; })) === null || _a === void 0 ? void 0 : _a.face;
                if (toFace === undefined)
                    return "continue";
                if (statement.exportClause !== undefined && typescript_1.default.isNamespaceExport(statement.exportClause)) {
                    var namespace = this_2.resolveSymbol(this_2.checker.getSymbolAtLocation(statement.exportClause.name));
                    if (publicSymbols.has(namespace)) {
                        this_2.fail(statement.exportClause, 'cross-face namespace re-exports are not supported');
                    }
                    return "continue";
                }
                var exports_2 = statement.exportClause === undefined
                    ? this_2.moduleExports(statement.moduleSpecifier)
                        .map(function (symbol) { return ({ symbol: _this.resolveSymbol(symbol), requestedName: symbol.name, site: statement }); })
                    : statement.exportClause.elements.map(function (element) {
                        var _a, _b;
                        return ({
                            symbol: _this.resolveSymbol(_this.checker.getSymbolAtLocation(element.name)),
                            requestedName: (_b = (_a = element.propertyName) === null || _a === void 0 ? void 0 : _a.text) !== null && _b !== void 0 ? _b : element.name.text,
                            site: element,
                        });
                    });
                for (var _e = 0, exports_1 = exports_2; _e < exports_1.length; _e++) {
                    var exported = exports_1[_e];
                    if (!publicSymbols.has(exported.symbol))
                        continue;
                    var name_1 = this_2.packageExportName(module_1, exported.symbol, toFace, exported.requestedName);
                    if (name_1 === undefined) {
                        this_2.fail(exported.site, "cross-face re-export ".concat(exported.requestedName, " is not exported by ").concat(module_1.package, " at ").concat(module_1.subpath));
                    }
                    this_2.recordCrossFaceLink(registration.name, toFace, module_1, name_1);
                }
            };
            var this_2 = this;
            for (var _c = 0, _d = sourceFile.statements; _c < _d.length; _c++) {
                var statement = _d[_c];
                _loop_2(statement);
            }
        }
    };
    FaceAnalyzer.prototype.moduleExports = function (moduleSpecifier) {
        /* v8 ignore next -- a semantically valid export declaration from a resolved module always has a module symbol. */
        var moduleSymbol = this.checker.getSymbolAtLocation(moduleSpecifier);
        return this.checker.getExportsOfModule(moduleSymbol);
    };
    FaceAnalyzer.prototype.reachableFiles = function (registration, entryFiles) {
        var reachable = new Map();
        var queue = __spreadArray([], entryFiles, true);
        while (queue.length > 0) {
            var sourceFile = queue.shift();
            var fileName = realPath(sourceFile.fileName);
            if (reachable.has(fileName) || !isWithin(fileName, registration.root))
                continue;
            reachable.set(fileName, sourceFile);
            for (var _i = 0, _a = sourceFile.statements; _i < _a.length; _i++) {
                var statement = _a[_i];
                if ((!typescript_1.default.isImportDeclaration(statement) && !typescript_1.default.isExportDeclaration(statement))
                    || statement.moduleSpecifier === undefined
                    || !typescript_1.default.isStringLiteral(statement.moduleSpecifier))
                    continue;
                var resolved = typescript_1.default.resolveModuleName(statement.moduleSpecifier.text, sourceFile.fileName, this.program.getCompilerOptions(), typescript_1.default.sys).resolvedModule;
                if (resolved === undefined)
                    continue;
                var resolvedPath = realPath(resolved.resolvedFileName);
                if (!isWithin(resolvedPath, registration.root))
                    continue;
                queue.push(this.sourceFiles.get(resolvedPath));
            }
        }
        return __spreadArray([], reachable.values(), true).sort(function (left, right) { return left.fileName.localeCompare(right.fileName); });
    };
    FaceAnalyzer.prototype.collectServices = function (context, records) {
        var _a, _b, _c, _d, _e, _f;
        var bySymbol = new Map();
        for (var _i = 0, records_2 = records; _i < records_2.length; _i++) {
            var record = records_2[_i];
            var id = this.symbolId(record.symbol);
            var matches = (_a = bySymbol.get(id)) !== null && _a !== void 0 ? _a : [];
            matches.push(record);
            bySymbol.set(id, matches);
        }
        var result = [];
        var _loop_3 = function (member) {
            if (!typescript_1.default.isPropertySignature(member) || member.type === undefined)
                return "continue";
            // An OPTIONAL key is not a service: `X | undefined` and `key?: X` both mark
            // a value the launcher or boot code installs before the tree mounts (a root
            // accessor, an environment snapshot), which no plugin provides and no
            // consumer can reach with `inject`. Describing one as a service would answer
            // "add the plugin that provides it" for a key where no such plugin exists.
            if (member.questionToken !== undefined
                || (typescript_1.default.isUnionTypeNode(member.type)
                    && member.type.types.some(function (node) { return node.kind === typescript_1.default.SyntaxKind.UndefinedKeyword; })))
                return "continue";
            var authoredSymbol = this_3.symbolAtType(member.type);
            if (authoredSymbol === undefined)
                return "continue";
            var authoredSymbolId = this_3.symbolId(authoredSymbol);
            var exported = (_e = (_c = (_b = bySymbol.get(authoredSymbolId)) === null || _b === void 0 ? void 0 : _b.find(function (record) { return record.model.name === authoredSymbol.name; })) !== null && _c !== void 0 ? _c : (_d = bySymbol.get(authoredSymbolId)) === null || _d === void 0 ? void 0 : _d.find(function (record) { return record.model.name !== 'default'; })) !== null && _e !== void 0 ? _e : (_f = bySymbol.get(authoredSymbolId)) === null || _f === void 0 ? void 0 : _f[0];
            if (exported === undefined)
                return "continue";
            var symbol = authoredSymbol;
            var declaration = preferredDeclaration(symbol);
            var aliases = new Set();
            while (declaration !== undefined && typescript_1.default.isTypeAliasDeclaration(declaration)) {
                if (aliases.has(symbol))
                    break;
                aliases.add(symbol);
                var target = this_3.symbolAtType(declaration.type);
                if (target === undefined)
                    break;
                symbol = target;
                declaration = preferredDeclaration(symbol);
            }
            if (declaration === undefined || (!typescript_1.default.isClassDeclaration(declaration) && !typescript_1.default.isInterfaceDeclaration(declaration))) {
                this_3.fail(member, "service ".concat(memberName(member.name), " does not resolve to an exported class or interface"));
            }
            var memberOwner = this_3.registrationForFile(member.getSourceFile().fileName);
            var declarationOwner = this_3.registrationForFile(declaration.getSourceFile().fileName);
            if ((memberOwner === null || memberOwner === void 0 ? void 0 : memberOwner.name) !== (declarationOwner === null || declarationOwner === void 0 ? void 0 : declarationOwner.name))
                return "continue";
            var symbolId = this_3.symbolId(symbol);
            var model = this_3.ensureDeclaration(symbol, declaration);
            var exposed = model.members
                .filter(exposableMember)
                .map(function (publicMember) { return publicMember.id; });
            result.push(__assign(__assign({}, documentationOf(declaration)), { key: memberName(member.name), symbol: symbolId, export: exported.model, members: exposed, location: this_3.location(member) }));
        };
        var this_3 = this;
        for (var _g = 0, _h = context.members; _g < _h.length; _g++) {
            var member = _h[_g];
            _loop_3(member);
        }
        return result;
    };
    FaceAnalyzer.prototype.collectExplicitServices = function (records) {
        var _a, _b;
        var result = [];
        var seen = new Set();
        for (var _i = 0, records_3 = records; _i < records_3.length; _i++) {
            var record = records_3[_i];
            var tag = typertServiceTag(record.declaration);
            if (tag === undefined)
                continue;
            var words = ((_a = typescript_1.default.getTextOfJSDocComment(tag.comment)) !== null && _a !== void 0 ? _a : '').trim().split(/\s+/);
            if (words.length !== 2 || !isRemoteSegment((_b = words[1]) !== null && _b !== void 0 ? _b : '')) {
                this.fail(tag, '@typert service requires exactly one nonempty Cordis service key without "/"');
            }
            if (!typescript_1.default.isClassDeclaration(record.declaration)) {
                this.fail(record.declaration, '@typert service requires an exported class');
            }
            var symbol = this.resolveSymbol(record.symbol);
            var symbolId = this.symbolId(symbol);
            if (seen.has(symbolId))
                continue;
            seen.add(symbolId);
            var model = this.ensureDeclaration(symbol, record.declaration);
            result.push(__assign(__assign({}, documentationOf(record.declaration)), { key: words[1], symbol: symbolId, export: record.model, members: model.members.filter(exposableMember).map(function (member) { return member.id; }), location: this.location(record.declaration) }));
        }
        return result;
    };
    FaceAnalyzer.prototype.collectInvocations = function (registration, reachable) {
        var _this = this;
        var result = [];
        for (var _i = 0, reachable_2 = reachable; _i < reachable_2.length; _i++) {
            var sourceFile = reachable_2[_i];
            for (var _a = 0, _b = sourceFile.statements; _a < _b.length; _a++) {
                var statement = _b[_a];
                if (!typescript_1.default.isClassDeclaration(statement))
                    continue;
                var marked = statement.members.flatMap(function (member) {
                    var invocation = _this.remoteMarker(member);
                    if (invocation === undefined)
                        return [];
                    if (!typescript_1.default.isMethodDeclaration(member)) {
                        _this.fail(member, 'Remote decorators require a public instance method');
                    }
                    return [{ method: member, invocation: invocation }];
                });
                var first = marked[0];
                if (first === undefined)
                    continue;
                var binding = this.gatewayBinding(statement);
                if (binding === undefined) {
                    this.fail(first.method, 'Remote methods require TypertRemoteService or readonly typertGateway = bindTypertRemote(this, serviceKey)');
                }
                for (var _c = 0, marked_1 = marked; _c < marked_1.length; _c++) {
                    var _d = marked_1[_c], method = _d.method, invocation = _d.invocation;
                    result.push(this.invocationModel(registration, binding, method, invocation));
                }
            }
        }
        return result;
    };
    FaceAnalyzer.prototype.invocationModel = function (registration, binding, method, invocation) {
        var _a, _b, _c;
        if (visibilityOf(method) !== 'public' || hasModifier(method, typescript_1.default.SyntaxKind.StaticKeyword)) {
            this.fail(method, 'Remote decorators require a public instance method');
        }
        if (hasModifier(method, typescript_1.default.SyntaxKind.AbstractKeyword) || method.body === undefined) {
            this.fail(method, 'Remote methods must have a concrete implementation');
        }
        if (!typescript_1.default.isIdentifier(method.name)) {
            this.fail(method, 'Remote method names must be identifiers');
        }
        if (((_b = (_a = method.typeParameters) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 0) {
            this.fail(method, 'generic Remote methods are not supported');
        }
        var methodName = method.name.text;
        var exportedMethod = (_c = invocation.exportName) !== null && _c !== void 0 ? _c : methodName;
        var lookups = this.lookupDeclarations();
        var lookupByHost = new Map(lookups.map(function (lookup) { return [lookup.hostSymbol, lookup]; }));
        var parameters = [];
        var cancellation;
        var wires = new Set();
        for (var _i = 0, _d = method.parameters.entries(); _i < _d.length; _i++) {
            var _e = _d[_i], parameterIndex = _e[0], parameter = _e[1];
            if (!typescript_1.default.isIdentifier(parameter.name)) {
                this.fail(parameter, 'Remote parameters must use identifier bindings');
            }
            if (parameter.dotDotDotToken !== undefined)
                this.fail(parameter, 'Remote parameters cannot be rest parameters');
            if (parameter.initializer !== undefined)
                this.fail(parameter, 'Remote parameters cannot have default values');
            if (parameter.name.text === 'this')
                this.fail(parameter, 'Remote methods cannot declare an explicit this parameter');
            var optional = parameter.questionToken !== undefined;
            var authoredType = this.requiredType(parameter, parameter.type, 'parameter');
            var cancellationName = parameter.name.text === 'signal';
            var cancellationType = this.isGlobalAbortSignal(authoredType);
            if (cancellationName || cancellationType) {
                if (!cancellationName || !cancellationType) {
                    this.fail(parameter, 'Remote cancellation must use a parameter named signal with the global AbortSignal type');
                }
                if (parameterIndex !== method.parameters.length - 1) {
                    this.fail(parameter, 'Remote cancellation signal must be the final parameter');
                }
                cancellation = { parameter: 'signal' };
                continue;
            }
            var hostSymbol = this.symbolAtType(authoredType);
            var lookup = hostSymbol === undefined ? undefined : lookupByHost.get(this.symbolId(hostSymbol));
            var modeled = void 0;
            if (lookup !== undefined) {
                if (optional)
                    this.fail(parameter, "lookup parameter for ".concat(lookup.key, " cannot be optional"));
                if (parameter.name.text !== lookup.key) {
                    this.fail(parameter, "lookup parameter for ".concat(lookup.key, " must also be named ").concat(lookup.key));
                }
                var boundary = this.remoteBoundary(lookup.wireType, "".concat(registration.name, "#").concat(binding.namespace, "/").concat(exportedMethod, ":").concat(lookup.key, "Id"), true);
                modeled = {
                    name: parameter.name.text,
                    wire: "".concat(lookup.key, "Id"),
                    source: 'lookup',
                    lookup: lookup.key,
                    boundary: boundary,
                };
            }
            else {
                if (hostSymbol !== undefined && this.isWorkspaceClass(hostSymbol)) {
                    this.fail(parameter, "non-JSON class parameter ".concat(hostSymbol.name, " requires a TypertLookupMap entry"));
                }
                modeled = __assign(__assign({ name: parameter.name.text, wire: parameter.name.text, source: 'json' }, optional ? { optional: true } : {}), { boundary: this.remoteBoundary(authoredType, "".concat(registration.name, "#").concat(binding.namespace, "/").concat(exportedMethod, ":").concat(parameter.name.text), false, 'undefined', optional) });
            }
            if (wires.has(modeled.wire))
                this.fail(parameter, "duplicate Remote wire field ".concat(modeled.wire));
            wires.add(modeled.wire);
            parameters.push(modeled);
        }
        var receiver = { kind: 'direct' };
        if (invocation.kind === 'context') {
            var context = this.contextDeclarations().get(invocation.context);
            if (context === undefined) {
                this.fail(method, "Remote Scope ".concat(invocation.context, " has no TypertContextMap entry"));
            }
            var wire = "".concat(invocation.context, "Id");
            if (wires.has(wire))
                this.fail(method, "Remote Scope wire field ".concat(wire, " conflicts with a method parameter"));
            receiver = {
                kind: 'context',
                context: invocation.context,
                wire: wire,
                boundary: this.remoteBoundary(context.wireType, "".concat(registration.name, "#").concat(binding.namespace, "/").concat(exportedMethod, ":").concat(wire), true),
            };
        }
        var scope;
        if (invocation.kind === 'direct') {
            var lookupParameters = parameters.filter(function (parameter) { return parameter.source === 'lookup'; });
            var parameter = lookupParameters.length === 1 ? lookupParameters[0] : undefined;
            var context = (parameter === null || parameter === void 0 ? void 0 : parameter.lookup) === undefined
                ? undefined
                : this.contextDeclarations().get(parameter.lookup);
            if (parameter !== undefined && context !== undefined) {
                var contextBoundary = this.remoteBoundary(context.wireType, "".concat(registration.name, "#").concat(binding.namespace, "/").concat(exportedMethod, ":scope:").concat(context.key), true);
                if (contextBoundary.typeSymbol !== parameter.boundary.typeSymbol) {
                    this.fail(method, "Remote scope ".concat(context.key, " wire type ").concat(contextBoundary.typeSymbol, " does not match lookup wire type ").concat(parameter.boundary.typeSymbol));
                }
                scope = { context: context.key, wire: parameter.wire };
            }
        }
        var resultType = this.remoteResultType(method);
        return __assign(__assign(__assign(__assign(__assign(__assign({ id: "".concat(registration.name, "#").concat(binding.namespace, "/").concat(exportedMethod), service: binding.service, namespace: binding.namespace, method: exportedMethod }, (exportedMethod === methodName ? {} : { implementation: methodName })), { invocation: receiver }), (scope === undefined ? {} : { scope: scope })), { parameters: parameters }), (cancellation === undefined ? {} : { cancellation: cancellation })), { result: this.remoteBoundary(resultType, "".concat(registration.name, "#").concat(binding.namespace, "/").concat(exportedMethod, ":result"), false, 'undefined-or-void'), location: this.location(method.name) });
    };
    FaceAnalyzer.prototype.gatewayBinding = function (declaration) {
        var field = this.gatewayFieldBinding(declaration);
        var base = this.gatewayServiceBinding(declaration);
        if (field !== undefined && base !== undefined) {
            this.fail(field.site, 'TypertRemoteService subclasses must not declare a second typertRemote binding');
        }
        return field !== null && field !== void 0 ? field : base;
    };
    FaceAnalyzer.prototype.gatewayFieldBinding = function (declaration) {
        var _a, _b;
        var candidates = declaration.members.filter(function (member) {
            return typescript_1.default.isPropertyDeclaration(member) && memberName(member.name) === 'typertRemote';
        });
        var property = candidates[0], duplicate = candidates[1];
        if (property === undefined)
            return undefined;
        if (duplicate !== undefined)
            this.fail(duplicate, 'Service has more than one typertGateway field');
        if (visibilityOf(property) !== 'public'
            || hasModifier(property, typescript_1.default.SyntaxKind.StaticKeyword)
            || !hasModifier(property, typescript_1.default.SyntaxKind.ReadonlyKeyword)) {
            this.fail(property, 'typertGateway must be a public readonly instance field');
        }
        if (property.initializer === undefined
            || !typescript_1.default.isCallExpression(property.initializer)
            || !this.isTypeMetaSymbol(property.initializer.expression, 'bindTypertRemote')) {
            this.fail(property, 'typertGateway must call bindTypertRemote()');
        }
        var call = property.initializer;
        if (call.arguments.length < 2 || call.arguments.length > 3) {
            this.fail(call, 'bindTypertRemote() requires this, service key, and an optional options object');
        }
        if (((_a = call.arguments[0]) === null || _a === void 0 ? void 0 : _a.kind) !== typescript_1.default.SyntaxKind.ThisKeyword) {
            this.fail((_b = call.arguments[0]) !== null && _b !== void 0 ? _b : call, 'bindTypertRemote() first argument must be this');
        }
        return this.gatewayBindingArguments(call, property);
    };
    FaceAnalyzer.prototype.gatewayServiceBinding = function (declaration) {
        var _this = this;
        var _a;
        var heritage = ((_a = declaration.heritageClauses) !== null && _a !== void 0 ? _a : [])
            .filter(function (clause) { return clause.token === typescript_1.default.SyntaxKind.ExtendsKeyword; })
            .flatMap(function (clause) { return __spreadArray([], clause.types, true); })
            .find(function (type) { return _this.isTypeMetaSymbol(type.expression, 'TypertRemoteService'); });
        if (heritage === undefined)
            return undefined;
        var constructor = declaration.members.find(typescript_1.default.isConstructorDeclaration);
        if ((constructor === null || constructor === void 0 ? void 0 : constructor.body) === undefined) {
            this.fail(heritage, 'TypertRemoteService subclasses must declare a constructor with super(ctx, serviceKey)');
        }
        var call = constructor.body.statements.flatMap(function (statement) {
            if (!typescript_1.default.isExpressionStatement(statement) || !typescript_1.default.isCallExpression(statement.expression))
                return [];
            return statement.expression.expression.kind === typescript_1.default.SyntaxKind.SuperKeyword ? [statement.expression] : [];
        })[0];
        if (call === undefined) {
            this.fail(constructor, 'TypertRemoteService constructor must call super(ctx, serviceKey) directly');
        }
        if (call.arguments.length < 2 || call.arguments.length > 3) {
            this.fail(call, 'TypertRemoteService super() requires context, service key, and an optional options object');
        }
        return this.gatewayBindingArguments(call, heritage);
    };
    FaceAnalyzer.prototype.gatewayBindingArguments = function (call, site) {
        var serviceArgument = call.arguments[1];
        if (serviceArgument === undefined)
            this.fail(call, 'Gateway service key must be a string literal');
        var service = stringLiteralValue(serviceArgument);
        if (service === undefined)
            this.fail(serviceArgument, 'Gateway service key must be a string literal');
        var namespace = service;
        var options = call.arguments[2];
        if (options !== undefined) {
            if (!typescript_1.default.isObjectLiteralExpression(options)) {
                this.fail(options, 'bindTypertRemote() options must be an object literal');
            }
            for (var _i = 0, _a = options.properties; _i < _a.length; _i++) {
                var propertyOption = _a[_i];
                if (!typescript_1.default.isPropertyAssignment(propertyOption)
                    || memberName(propertyOption.name) !== 'namespace') {
                    this.fail(propertyOption, 'bindTypertRemote() only supports a namespace option');
                }
                var value = stringLiteralValue(propertyOption.initializer);
                if (value === undefined)
                    this.fail(propertyOption.initializer, 'Gateway namespace must be a string literal');
                namespace = value;
            }
        }
        if (!isRemoteSegment(service))
            this.fail(serviceArgument, 'Gateway service key must contain only RPC endpoint segment characters');
        if (!isRemoteSegment(namespace))
            this.fail(options !== null && options !== void 0 ? options : call, 'Gateway namespace must contain only RPC endpoint segment characters');
        return { service: service, namespace: namespace, site: site };
    };
    FaceAnalyzer.prototype.remoteMarker = function (member) {
        var _a, _b, _c;
        var found;
        for (var _i = 0, _d = typescript_1.default.canHaveDecorators(member) ? (_a = typescript_1.default.getDecorators(member)) !== null && _a !== void 0 ? _a : [] : []; _i < _d.length; _i++) {
            var decorator = _d[_i];
            var expression = decorator.expression;
            var marker = void 0;
            if (this.isTypeMetaSymbol(expression, 'Remote')) {
                marker = { kind: 'direct' };
            }
            else if (typescript_1.default.isCallExpression(expression)
                && this.isTypeMetaSymbol(expression.expression, 'Remote')) {
                if (expression.arguments.length !== 1)
                    this.fail(expression, 'Remote() requires one exported method name');
                var exportName = stringLiteralValue(expression.arguments[0]);
                if (exportName === undefined || !isRemoteSegment(exportName)) {
                    this.fail((_b = expression.arguments[0]) !== null && _b !== void 0 ? _b : expression, 'Remote() name must be a string literal containing only RPC endpoint segment characters');
                }
                marker = { kind: 'direct', exportName: exportName };
            }
            else if (typescript_1.default.isCallExpression(expression)
                && this.isTypeMetaSymbol(expression.expression, 'RemoteScope')) {
                if (expression.arguments.length < 1 || expression.arguments.length > 2) {
                    this.fail(expression, 'RemoteScope() requires a Context key and optional exported method name');
                }
                var context = stringLiteralValue(expression.arguments[0]);
                if (context === undefined || !isRemoteSegment(context)) {
                    this.fail((_c = expression.arguments[0]) !== null && _c !== void 0 ? _c : expression, 'RemoteScope() key must be a string literal containing only RPC endpoint segment characters');
                }
                var exportArgument = expression.arguments[1];
                var exportName = exportArgument === undefined ? undefined : stringLiteralValue(exportArgument);
                if (exportArgument !== undefined && (exportName === undefined || !isRemoteSegment(exportName))) {
                    this.fail(exportArgument, 'RemoteScope() name must be a string literal containing only RPC endpoint segment characters');
                }
                marker = __assign({ kind: 'context', context: context }, exportName === undefined ? {} : { exportName: exportName });
            }
            else {
                continue;
            }
            if (found !== undefined)
                this.fail(decorator, 'a method can have only one Remote invocation decorator');
            found = marker;
        }
        return found;
    };
    FaceAnalyzer.prototype.remoteResultType = function (method) {
        var _a, _b;
        var authored = this.requiredType(method, method.type, 'return');
        if (!typescript_1.default.isTypeReferenceNode(authored))
            return authored;
        var symbol = this.checker.getSymbolAtLocation(authored.typeName);
        var resolved = symbol === undefined ? undefined : this.resolveSymbol(symbol);
        var resultType = (_a = authored.typeArguments) === null || _a === void 0 ? void 0 : _a[0];
        if ((resolved === null || resolved === void 0 ? void 0 : resolved.name) !== 'Promise' || resultType === undefined || ((_b = authored.typeArguments) === null || _b === void 0 ? void 0 : _b.length) !== 1)
            return authored;
        var declaration = preferredDeclaration(resolved);
        if (declaration === undefined || !isStandardLibraryFile(declaration.getSourceFile().fileName))
            return authored;
        return resultType;
    };
    FaceAnalyzer.prototype.isGlobalAbortSignal = function (type) {
        var _a;
        var symbol = this.symbolAtType(type);
        if ((symbol === null || symbol === void 0 ? void 0 : symbol.name) !== 'AbortSignal')
            return false;
        return ((_a = symbol.declarations) === null || _a === void 0 ? void 0 : _a.some(function (declaration) {
            return isStandardLibraryFile(declaration.getSourceFile().fileName);
        })) === true;
    };
    FaceAnalyzer.prototype.lookupDeclarations = function () {
        var _a;
        if (this.staticLookups !== undefined)
            return this.staticLookups;
        var byKey = new Map();
        var byHost = new Map();
        for (var _i = 0, _b = this.typeMetaMapMembers('TypertLookupMap'); _i < _b.length; _i++) {
            var declaration = _b[_i];
            if (!typescript_1.default.isPropertySignature(declaration) || declaration.type === undefined) {
                this.fail(declaration, 'TypertLookupMap entries must be required properties');
            }
            var key = memberName(declaration.name);
            if (!isRemoteSegment(key))
                this.fail(declaration.name, 'TypertLookupMap key must contain only RPC endpoint segment characters');
            if (!typescript_1.default.isTypeReferenceNode(declaration.type)
                || !this.isTypeMetaSymbol(declaration.type.typeName, 'TypertLookup')
                || ((_a = declaration.type.typeArguments) === null || _a === void 0 ? void 0 : _a.length) !== 2) {
                this.fail(declaration.type, 'TypertLookupMap values must be TypertLookup<Host, Wire>');
            }
            var hostType = declaration.type.typeArguments[0];
            var wireType = declaration.type.typeArguments[1];
            if (hostType === undefined || wireType === undefined) {
                this.fail(declaration.type, 'TypertLookupMap values must be TypertLookup<Host, Wire>');
            }
            var host = this.symbolAtType(hostType);
            if (host === undefined)
                this.fail(hostType, 'TypertLookup Host must be a named type');
            var entry = {
                key: key,
                hostSymbol: this.symbolId(host),
                wireType: wireType,
                site: declaration,
            };
            if (byKey.has(key))
                this.fail(declaration, "duplicate TypertLookupMap key ".concat(key));
            if (byHost.has(entry.hostSymbol))
                this.fail(declaration, "Host type ".concat(host.name, " has more than one Typert lookup"));
            byKey.set(key, entry);
            byHost.set(entry.hostSymbol, entry);
        }
        this.staticLookups = __spreadArray([], byKey.values(), true);
        return this.staticLookups;
    };
    FaceAnalyzer.prototype.contextDeclarations = function () {
        var _a;
        if (this.staticContexts !== undefined)
            return this.staticContexts;
        var result = new Map();
        for (var _i = 0, _b = this.typeMetaMapMembers('TypertContextMap'); _i < _b.length; _i++) {
            var declaration = _b[_i];
            if (!typescript_1.default.isPropertySignature(declaration) || declaration.type === undefined) {
                this.fail(declaration, 'TypertContextMap entries must be required properties');
            }
            var key = memberName(declaration.name);
            if (!isRemoteSegment(key))
                this.fail(declaration.name, 'TypertContextMap key must contain only RPC endpoint segment characters');
            if (!typescript_1.default.isTypeReferenceNode(declaration.type)
                || !this.isTypeMetaSymbol(declaration.type.typeName, 'TypertContext')
                || ((_a = declaration.type.typeArguments) === null || _a === void 0 ? void 0 : _a.length) !== 1) {
                this.fail(declaration.type, 'TypertContextMap values must be TypertContext<Wire>');
            }
            if (result.has(key))
                this.fail(declaration, "duplicate TypertContextMap key ".concat(key));
            var wireType = declaration.type.typeArguments[0];
            if (wireType === undefined)
                this.fail(declaration.type, 'TypertContextMap values must be TypertContext<Wire>');
            result.set(key, {
                key: key,
                wireType: wireType,
                site: declaration,
            });
        }
        this.staticContexts = result;
        return result;
    };
    FaceAnalyzer.prototype.typeMetaMapMembers = function (name) {
        var result = [];
        for (var _i = 0, _a = this.program.getSourceFiles(); _i < _a.length; _i++) {
            var sourceFile = _a[_i];
            for (var _b = 0, _c = sourceFile.statements; _b < _c.length; _b++) {
                var statement = _c[_b];
                if (!typescript_1.default.isModuleDeclaration(statement)
                    || !typescript_1.default.isStringLiteral(statement.name)
                    || statement.name.text !== '@z/dsh-typert-protocol'
                    || statement.body === undefined
                    || !typescript_1.default.isModuleBlock(statement.body))
                    continue;
                for (var _d = 0, _e = statement.body.statements; _d < _e.length; _d++) {
                    var nested = _e[_d];
                    if (typescript_1.default.isInterfaceDeclaration(nested) && nested.name.text === name)
                        result.push.apply(result, nested.members);
                }
            }
        }
        return result;
    };
    FaceAnalyzer.prototype.remoteBoundary = function (authoredType, fallbackTypeSymbol, requireNamed, topLevelAbsence, optional) {
        var _this = this;
        if (topLevelAbsence === void 0) { topLevelAbsence = 'reject'; }
        if (optional === void 0) { optional = false; }
        var type = this.convertType(authoredType);
        var declaredType = this.checker.getTypeFromTypeNode(authoredType);
        // An optional parameter's authored node carries no `undefined`; the codec
        // still has to accept the omitted wire field the consumer sends.
        var resolvedType = optional
            ? this.checker.getNullableType(declaredType, typescript_1.default.TypeFlags.Undefined)
            : declaredType;
        var codecType = this.resolvedRemoteCodecType(authoredType, resolvedType, topLevelAbsence);
        var acceptsUndefined = topLevelAbsence !== 'reject' && this.includesRemoteAbsence(resolvedType);
        var rootSymbol = this.namedWorkspaceType(authoredType);
        var imports = new Map();
        var visit = function (node) {
            if ((typescript_1.default.isTypeReferenceNode(node) || typescript_1.default.isImportTypeNode(node))) {
                var symbol = typescript_1.default.isTypeReferenceNode(node)
                    ? _this.checker.getSymbolAtLocation(node.typeName)
                    : node.qualifier === undefined ? undefined : _this.checker.getSymbolAtLocation(node.qualifier);
                if (symbol !== undefined) {
                    var resolved = _this.resolveSymbol(symbol);
                    var declaration = preferredDeclaration(resolved);
                    if (declaration !== undefined
                        && !isStandardLibraryFile(declaration.getSourceFile().fileName)
                        && _this.registrationForFile(declaration.getSourceFile().fileName) !== undefined) {
                        var imported = _this.publicRemoteType(resolved, node);
                        imports.set(imported.symbol, imported);
                    }
                }
            }
            typescript_1.default.forEachChild(node, visit);
        };
        visit(authoredType);
        if (rootSymbol !== undefined) {
            var imported = this.publicRemoteType(rootSymbol, authoredType);
            return {
                type: type,
                codecType: codecType,
                acceptsUndefined: acceptsUndefined,
                typeSymbol: "".concat(imported.specifier, "#").concat(imported.name),
                imports: __spreadArray([], imports.values(), true).sort(function (left, right) {
                    return left.specifier.localeCompare(right.specifier) || left.name.localeCompare(right.name);
                }),
            };
        }
        if (requireNamed)
            this.fail(authoredType, 'lookup and Context wire types must be named public types');
        return {
            type: type,
            codecType: codecType,
            acceptsUndefined: acceptsUndefined,
            typeSymbol: fallbackTypeSymbol,
            imports: __spreadArray([], imports.values(), true).sort(function (left, right) {
                return left.specifier.localeCompare(right.specifier) || left.name.localeCompare(right.name);
            }),
        };
    };
    /**
     * Project one authored Remote boundary through the complete face Program.
     * Consumer declarations retain the authored alias, while codecs use this
     * concrete graph so declaration-merged mapped and conditional types are
     * validated without teaching the compiler-independent emitter TypeScript's
     * type evaluator.
     */
    FaceAnalyzer.prototype.resolvedRemoteCodecType = function (authoredType, resolvedType, topLevelAbsence) {
        var _this = this;
        this.assertRemoteJsonType(resolvedType, authoredType, new Set(), topLevelAbsence !== 'reject', topLevelAbsence === 'undefined-or-void');
        var completed = new Map();
        var active = new Map();
        var recursiveDeclarations = new Map();
        var convert = function (type) {
            var _a, _b;
            var cached = completed.get(type);
            if (cached !== undefined)
                return cached;
            var activeId = active.get(type);
            if (activeId !== undefined) {
                if (_this.checker.isArrayType(type) || _this.checker.isArrayLikeType(type)) {
                    var element = _this.checker.getIndexTypeOfType(type, typescript_1.default.IndexKind.Number);
                    var elementId = element === undefined ? undefined : active.get(element);
                    if (element !== undefined && elementId !== undefined) {
                        return _this.addNode(authoredType, {
                            kind: 'array',
                            element: _this.resolvedCycleReference(element, authoredType, elementId, recursiveDeclarations),
                        });
                    }
                }
                return _this.resolvedCycleReference(type, authoredType, activeId, recursiveDeclarations);
            }
            var id = _this.allocateNodeId(authoredType);
            active.set(type, id);
            try {
                var add = function (model) {
                    _this.nodes.set(id, __assign({ id: id }, model));
                    completed.set(type, id);
                    return id;
                };
                var flags = type.flags;
                if ((flags & typescript_1.default.TypeFlags.Any) !== 0)
                    return add({ kind: 'keyword', name: 'any' });
                if ((flags & typescript_1.default.TypeFlags.Unknown) !== 0)
                    return add({ kind: 'keyword', name: 'unknown' });
                if ((flags & typescript_1.default.TypeFlags.Never) !== 0)
                    return add({ kind: 'keyword', name: 'never' });
                if ((flags & typescript_1.default.TypeFlags.String) !== 0)
                    return add({ kind: 'keyword', name: 'string' });
                if ((flags & typescript_1.default.TypeFlags.Number) !== 0)
                    return add({ kind: 'keyword', name: 'number' });
                if ((flags & typescript_1.default.TypeFlags.BigInt) !== 0)
                    return add({ kind: 'keyword', name: 'bigint' });
                if ((flags & typescript_1.default.TypeFlags.Boolean) !== 0)
                    return add({ kind: 'keyword', name: 'boolean' });
                if ((flags & typescript_1.default.TypeFlags.ESSymbol) !== 0)
                    return add({ kind: 'keyword', name: 'symbol' });
                if ((flags & typescript_1.default.TypeFlags.Undefined) !== 0)
                    return add({ kind: 'keyword', name: 'undefined' });
                if ((flags & typescript_1.default.TypeFlags.Void) !== 0)
                    return add({ kind: 'keyword', name: 'void' });
                if ((flags & typescript_1.default.TypeFlags.Null) !== 0)
                    return add({ kind: 'literal', value: null, text: 'null' });
                if ((flags & typescript_1.default.TypeFlags.StringLiteral) !== 0) {
                    var value = type.value;
                    return add({ kind: 'literal', value: value, text: JSON.stringify(value) });
                }
                if ((flags & typescript_1.default.TypeFlags.NumberLiteral) !== 0) {
                    var value = type.value;
                    return add({ kind: 'literal', value: value, text: String(value) });
                }
                if ((flags & typescript_1.default.TypeFlags.BigIntLiteral) !== 0) {
                    var value = type.value;
                    var text = "".concat(value.negative ? '-' : '').concat(value.base10Value, "n");
                    return add({ kind: 'literal', value: BigInt("".concat(value.negative ? '-' : '').concat(value.base10Value)), text: text });
                }
                if ((flags & typescript_1.default.TypeFlags.BooleanLiteral) !== 0) {
                    var value = type.intrinsicName === 'true';
                    return add({ kind: 'literal', value: value, text: String(value) });
                }
                if (type.isUnionOrIntersection()) {
                    return add({
                        kind: (flags & typescript_1.default.TypeFlags.Union) !== 0 ? 'union' : 'intersection',
                        types: type.types.map(convert),
                    });
                }
                if ((flags & typescript_1.default.TypeFlags.TypeParameter) !== 0) {
                    _this.fail(authoredType, 'Remote codec contains an unresolved type parameter');
                }
                if ((flags & typescript_1.default.TypeFlags.Object) === 0) {
                    _this.fail(authoredType, "Remote codec type ".concat(_this.checker.typeToString(type, authoredType, typescript_1.default.TypeFormatFlags.NoTruncation), " has no concrete Zod projection"));
                }
                if (_this.checker.isTupleType(type)) {
                    var reference = type;
                    var target_1 = reference.target;
                    var arguments_ = _this.checker.getTypeArguments(reference);
                    return add({
                        kind: 'tuple',
                        elements: arguments_.map(function (argument, index) {
                            var _a;
                            var elementFlags = (_a = target_1.elementFlags[index]) !== null && _a !== void 0 ? _a : typescript_1.default.ElementFlags.Required;
                            return {
                                type: convert(argument),
                                optional: (elementFlags & typescript_1.default.ElementFlags.Optional) !== 0,
                                rest: (elementFlags & (typescript_1.default.ElementFlags.Rest | typescript_1.default.ElementFlags.Variadic)) !== 0,
                            };
                        }),
                    });
                }
                if (_this.checker.isArrayType(type) || _this.checker.isArrayLikeType(type)) {
                    var element = _this.checker.getIndexTypeOfType(type, typescript_1.default.IndexKind.Number);
                    if (element === undefined)
                        _this.fail(authoredType, 'Remote codec array has no element type');
                    return add({ kind: 'array', element: convert(element) });
                }
                if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
                    _this.fail(authoredType, 'Remote codec cannot contain callable or constructable values');
                }
                var members = [];
                for (var _i = 0, _c = _this.checker.getPropertiesOfType(type); _i < _c.length; _i++) {
                    var property = _c[_i];
                    var declaration = (_a = property.valueDeclaration) !== null && _a !== void 0 ? _a : (_b = property.declarations) === null || _b === void 0 ? void 0 : _b[0];
                    var propertyType = _this.checker.getTypeOfSymbolAtLocation(property, declaration !== null && declaration !== void 0 ? declaration : authoredType);
                    var symbolKey = property.getName();
                    members.push(__assign(__assign(__assign(__assign({}, EMPTY_DOCUMENTATION), { id: "".concat(id, "#").concat(symbolKey), name: symbolKey }), (symbolKey.startsWith('__@') ? { computed: 'symbol' } : {})), { optional: (property.flags & typescript_1.default.SymbolFlags.Optional) !== 0, readonly: declaration !== undefined && hasModifier(declaration, typescript_1.default.SyntaxKind.ReadonlyKeyword), async: false, abstract: false, static: false, visibility: 'public', location: _this.location(authoredType), text: '', kind: 'property', type: convert(propertyType) }));
                }
                for (var _d = 0, _e = _this.checker.getIndexInfosOfType(type).entries(); _d < _e.length; _d++) {
                    var _f = _e[_d], index = _f[0], info = _f[1];
                    members.push(__assign(__assign({}, EMPTY_DOCUMENTATION), { id: "".concat(id, "#index:").concat(String(index)), name: '(index)', optional: false, readonly: info.isReadonly, async: false, abstract: false, static: false, visibility: 'public', location: _this.location(authoredType), text: '', kind: 'index', signature: {
                            typeParameters: [],
                            parameters: [{
                                    name: 'key',
                                    binding: 'identifier',
                                    type: convert(info.keyType),
                                    optional: false,
                                    rest: false,
                                    receiver: false,
                                }],
                            returns: convert(info.type),
                        } }));
                }
                return add({ kind: 'object', members: members });
            }
            finally {
                active.delete(type);
            }
        };
        return convert(resolvedType);
    };
    FaceAnalyzer.prototype.assertRemoteJsonType = function (type, site, active, allowUndefined, allowVoid) {
        var _this = this;
        var _a, _b, _c, _d, _e;
        var flags = type.flags;
        if ((flags & typescript_1.default.TypeFlags.Undefined) !== 0 && allowUndefined)
            return;
        if ((flags & typescript_1.default.TypeFlags.Void) !== 0 && allowVoid)
            return;
        if ((flags & (typescript_1.default.TypeFlags.Any | typescript_1.default.TypeFlags.Unknown)) !== 0) {
            this.fail(site, "Remote boundary contains unconstrained ".concat(this.checker.typeToString(type), " data"));
        }
        if ((flags & (typescript_1.default.TypeFlags.BigIntLike | typescript_1.default.TypeFlags.ESSymbolLike | typescript_1.default.TypeFlags.Undefined | typescript_1.default.TypeFlags.Void)) !== 0) {
            this.fail(site, "Remote boundary contains non-JSON type ".concat(this.checker.typeToString(type)));
        }
        if ((flags & (typescript_1.default.TypeFlags.StringLike
            | typescript_1.default.TypeFlags.NumberLike
            | typescript_1.default.TypeFlags.BooleanLike
            | typescript_1.default.TypeFlags.Null
            | typescript_1.default.TypeFlags.Never)) !== 0)
            return;
        if (type.isUnion()) {
            for (var _i = 0, _f = type.types; _i < _f.length; _i++) {
                var member = _f[_i];
                this.assertRemoteJsonType(member, site, active, allowUndefined, allowVoid);
            }
            return;
        }
        if (type.isIntersection()) {
            var material = type.types.filter(function (member) { return !_this.isRemotePhantomConstraint(member); });
            if (material.length === 0)
                this.fail(site, 'Remote boundary contains a symbol-only object');
            for (var _g = 0, material_1 = material; _g < material_1.length; _g++) {
                var member = material_1[_g];
                this.assertRemoteJsonType(member, site, active, false, false);
            }
            return;
        }
        if ((flags & typescript_1.default.TypeFlags.TypeParameter) !== 0) {
            this.fail(site, 'Remote boundary contains an unresolved type parameter');
        }
        if ((flags & typescript_1.default.TypeFlags.Object) === 0) {
            this.fail(site, "Remote boundary contains non-JSON type ".concat(this.checker.typeToString(type)));
        }
        var symbol = type.getSymbol();
        var declaration = (_a = symbol === null || symbol === void 0 ? void 0 : symbol.valueDeclaration) !== null && _a !== void 0 ? _a : (_b = symbol === null || symbol === void 0 ? void 0 : symbol.declarations) === null || _b === void 0 ? void 0 : _b[0];
        if (declaration !== undefined && (typescript_1.default.isClassDeclaration(declaration) || typescript_1.default.isClassExpression(declaration))) {
            this.fail(site, "Remote boundary contains class instance ".concat((_c = symbol === null || symbol === void 0 ? void 0 : symbol.name) !== null && _c !== void 0 ? _c : this.checker.typeToString(type)));
        }
        if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
            this.fail(site, 'Remote boundary contains callable or constructable data');
        }
        if (active.has(type))
            return;
        active.add(type);
        try {
            if (this.checker.isTupleType(type)) {
                var reference = type;
                var target_2 = reference.target;
                var arguments_ = this.checker.getTypeArguments(reference);
                arguments_.forEach(function (argument, index) {
                    var _a;
                    var elementFlags = (_a = target_2.elementFlags[index]) !== null && _a !== void 0 ? _a : typescript_1.default.ElementFlags.Required;
                    _this.assertRemoteJsonType(argument, site, active, (elementFlags & typescript_1.default.ElementFlags.Optional) !== 0, false);
                });
                return;
            }
            if (this.checker.isArrayType(type) || this.checker.isArrayLikeType(type)) {
                var element = this.checker.getIndexTypeOfType(type, typescript_1.default.IndexKind.Number);
                if (element === undefined)
                    this.fail(site, 'Remote boundary array has no element type');
                this.assertRemoteJsonType(element, site, active, false, false);
                return;
            }
            var properties = this.checker.getPropertiesOfType(type);
            if (properties.some(function (property) { return property.getName().startsWith('__@'); })) {
                this.fail(site, 'Remote boundary contains a symbol-keyed property');
            }
            for (var _h = 0, properties_1 = properties; _h < properties_1.length; _h++) {
                var property = properties_1[_h];
                var propertyDeclaration = (_d = property.valueDeclaration) !== null && _d !== void 0 ? _d : (_e = property.declarations) === null || _e === void 0 ? void 0 : _e[0];
                var propertyType = this.checker.getTypeOfSymbolAtLocation(property, propertyDeclaration !== null && propertyDeclaration !== void 0 ? propertyDeclaration : site);
                this.assertRemoteJsonType(propertyType, site, active, (property.flags & typescript_1.default.SymbolFlags.Optional) !== 0, false);
            }
            for (var _j = 0, _k = this.checker.getIndexInfosOfType(type); _j < _k.length; _j++) {
                var info = _k[_j];
                if ((info.keyType.flags & typescript_1.default.TypeFlags.ESSymbolLike) !== 0) {
                    this.fail(site, 'Remote boundary contains a symbol index signature');
                }
                this.assertRemoteJsonType(info.type, site, active, false, false);
            }
        }
        finally {
            active.delete(type);
        }
    };
    FaceAnalyzer.prototype.includesRemoteAbsence = function (type) {
        var _this = this;
        if ((type.flags & (typescript_1.default.TypeFlags.Undefined | typescript_1.default.TypeFlags.Void)) !== 0)
            return true;
        return type.isUnion() && type.types.some(function (member) { return _this.includesRemoteAbsence(member); });
    };
    FaceAnalyzer.prototype.isRemotePhantomConstraint = function (type) {
        if ((type.flags & typescript_1.default.TypeFlags.Unknown) !== 0)
            return true;
        if ((type.flags & typescript_1.default.TypeFlags.Any) !== 0 || (type.flags & typescript_1.default.TypeFlags.Object) === 0)
            return false;
        if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0)
            return false;
        if (this.checker.getIndexInfosOfType(type).length > 0)
            return false;
        return this.checker.getPropertiesOfType(type).every(function (property) { return property.getName().startsWith('__@'); });
    };
    FaceAnalyzer.prototype.resolvedCycleReference = function (type, site, resolvedType, recursiveDeclarations) {
        var _a;
        var symbol = (_a = type.aliasSymbol) !== null && _a !== void 0 ? _a : type.getSymbol();
        if (symbol === undefined)
            this.fail(site, 'Remote codec contains an unnamed recursive type');
        var resolved = this.resolveSymbol(symbol);
        var declaration = preferredDeclaration(resolved);
        if (declaration === undefined || isStandardLibraryFile(declaration.getSourceFile().fileName)) {
            this.fail(site, "Remote codec recursive type ".concat(resolved.name, " has no workspace declaration"));
        }
        var owner = this.registrationForFile(declaration.getSourceFile().fileName);
        if (owner === undefined)
            this.fail(site, "Remote codec recursive type ".concat(resolved.name, " is not owned by this face"));
        var id = recursiveDeclarations.get(type);
        if (id === undefined) {
            id = "".concat(this.symbolId(resolved), "#remote-codec:").concat(resolvedType);
            recursiveDeclarations.set(type, id);
            this.declarations.set(id, __assign(__assign({}, EMPTY_DOCUMENTATION), { id: id, package: owner.name, name: "".concat(resolved.name, "RemoteCodec"), kind: 'alias', abstract: false, exported: false, location: this.location(declaration), text: '', typeParameters: [], extends: [], implements: [], members: [], type: resolvedType }));
        }
        return this.addNode(site, {
            kind: 'reference',
            name: "".concat(resolved.name, "RemoteCodec"),
            target: { kind: 'declaration', symbol: id },
            arguments: [],
        });
    };
    FaceAnalyzer.prototype.namedWorkspaceType = function (node) {
        if (!typescript_1.default.isTypeReferenceNode(node) && !typescript_1.default.isImportTypeNode(node))
            return undefined;
        var symbol = typescript_1.default.isTypeReferenceNode(node)
            ? this.checker.getSymbolAtLocation(node.typeName)
            : node.qualifier === undefined ? undefined : this.checker.getSymbolAtLocation(node.qualifier);
        if (symbol === undefined)
            return undefined;
        var resolved = this.resolveSymbol(symbol);
        var declaration = preferredDeclaration(resolved);
        if (declaration === undefined
            || isStandardLibraryFile(declaration.getSourceFile().fileName)
            || this.registrationForFile(declaration.getSourceFile().fileName) === undefined)
            return undefined;
        return resolved;
    };
    FaceAnalyzer.prototype.publicRemoteType = function (symbol, site) {
        var declaration = preferredDeclaration(symbol);
        if (declaration === undefined)
            this.fail(site, "type ".concat(symbol.name, " has no declaration"));
        var registration = this.registrationForFile(declaration.getSourceFile().fileName);
        if (registration === undefined)
            this.fail(site, "type ".concat(symbol.name, " is not owned by a workspace package"));
        var candidates = [];
        for (var _i = 0, _a = packageExportTargets(registration.manifest); _i < _a.length; _i++) {
            var _b = _a[_i], subpath = _b[0], target = _b[1];
            if (subpath === '.' || subpath === './package.json' || subpath === './typert'
                || subpath === './client/typert' || subpath === './remote' || target.includes('*'))
                continue;
            var sourceFile = this.sourceFiles.get(realPath(sourcePathForExport(registration.root, target)));
            if (sourceFile === undefined)
                continue;
            var moduleSymbol = this.checker.getSymbolAtLocation(sourceFile);
            if (moduleSymbol === undefined)
                continue;
            for (var _c = 0, _d = this.checker.getExportsOfModule(moduleSymbol); _c < _d.length; _c++) {
                var exported = _d[_c];
                if (this.resolveSymbol(exported) !== symbol)
                    continue;
                candidates.push({
                    symbol: this.symbolId(symbol),
                    specifier: packageExportSpecifier(registration.name, subpath),
                    name: exported.name,
                });
            }
        }
        var selected = candidates.sort(function (left, right) {
            return left.specifier.localeCompare(right.specifier) || left.name.localeCompare(right.name);
        })[0];
        if (selected === undefined) {
            this.fail(site, "Remote boundary type ".concat(symbol.name, " must be exported from a public non-root type subpath"));
        }
        return selected;
    };
    FaceAnalyzer.prototype.isWorkspaceClass = function (symbol) {
        var declaration = preferredDeclaration(symbol);
        return declaration !== undefined
            && typescript_1.default.isClassDeclaration(declaration)
            && this.registrationForFile(declaration.getSourceFile().fileName) !== undefined;
    };
    FaceAnalyzer.prototype.isTypeMetaSymbol = function (node, name) {
        var symbol = this.checker.getSymbolAtLocation(node);
        if (symbol === undefined)
            return false;
        var resolved = this.resolveSymbol(symbol);
        if (resolved.name !== name)
            return false;
        var declaration = preferredDeclaration(resolved);
        if (declaration === undefined)
            return false;
        var registration = this.registrationForFile(declaration.getSourceFile().fileName);
        if ((registration === null || registration === void 0 ? void 0 : registration.name) === '@z/dsh-typert-protocol')
            return true;
        for (var current = declaration; current !== undefined; current = optionalParent(current)) {
            if (typescript_1.default.isModuleDeclaration(current)
                && typescript_1.default.isStringLiteral(current.name)
                && current.name.text === '@z/dsh-typert-protocol')
                return true;
        }
        return false;
    };
    FaceAnalyzer.prototype.validateInvocationIdentity = function (packages) {
        var endpoints = new Map();
        var ids = new Map();
        for (var _i = 0, _a = packages.flatMap(function (packageModel) { return packageModel.invocations; }); _i < _a.length; _i++) {
            var invocation = _a[_i];
            var endpoint = "".concat(invocation.namespace, "/").concat(invocation.method);
            var existingEndpoint = endpoints.get(endpoint);
            if (existingEndpoint !== undefined) {
                throw new TypertAnalysisError("typert(".concat(this.face, "): ").concat(invocation.location.file, ":").concat(String(invocation.location.line), ":").concat(String(invocation.location.column), ": Remote endpoint ").concat(endpoint, " conflicts with ").concat(existingEndpoint.id));
            }
            var existingId = ids.get(invocation.id);
            if (existingId !== undefined) {
                throw new TypertAnalysisError("typert(".concat(this.face, "): ").concat(invocation.location.file, ":").concat(String(invocation.location.line), ":").concat(String(invocation.location.column), ": Remote invocation id ").concat(invocation.id, " conflicts with ").concat(existingId.id));
            }
            endpoints.set(endpoint, invocation);
            ids.set(invocation.id, invocation);
        }
    };
    FaceAnalyzer.prototype.collectEvents = function (events) {
        var _a, _b;
        var result = [];
        for (var _i = 0, _c = events.members; _i < _c.length; _i++) {
            var member = _c[_i];
            var documentation = documentationOf(member);
            var mode = (_b = (_a = documentation.tags.find(function (tag) { return tag.name === 'mode'; })) === null || _a === void 0 ? void 0 : _a.comment) === null || _b === void 0 ? void 0 : _b.trim();
            if (typescript_1.default.isMethodSignature(member)) {
                var signature = this.signature(member, member.type);
                result.push(__assign(__assign(__assign(__assign({}, documentation), { name: memberName(member.name), signature: this.addNode(member, { kind: 'function', signature: signature }), text: memberText(member) }), (mode === undefined ? {} : { mode: mode })), { location: this.location(member) }));
            }
            else if (typescript_1.default.isPropertySignature(member) && member.type !== undefined) {
                result.push(__assign(__assign(__assign(__assign({}, documentation), { name: memberName(member.name), signature: this.convertType(member.type), text: memberText(member) }), (mode === undefined ? {} : { mode: mode })), { location: this.location(member) }));
            }
        }
        return result;
    };
    FaceAnalyzer.prototype.ensureDeclaration = function (symbol, selected) {
        var _this = this;
        var resolved = this.resolveSymbol(symbol);
        var id = this.symbolId(resolved);
        var existing = this.declarations.get(id);
        if (existing !== undefined)
            return existing;
        var declarationParts = resolved.declarations.filter(isTypeDeclaration);
        if (declarationParts.length > 1 && !declarationParts.every(typescript_1.default.isInterfaceDeclaration)) {
            this.fail(selected, "merged ".concat(typescript_1.default.SyntaxKind[selected.kind], " declaration ").concat(resolved.name, " is not supported"));
        }
        if (selected.name === undefined) {
            this.fail(selected, "anonymous ".concat(typescript_1.default.SyntaxKind[selected.kind], " cannot be represented as a named type declaration"));
        }
        var owner = this.registrationForFile(selected.getSourceFile().fileName);
        this.declarationStates.add(id);
        if (declarationParts.length > 1) {
            var analyzedParts = declarationParts.map(function (declarationPart) {
                var part = declarationPart;
                var partOwner = _this.registrationForFile(part.getSourceFile().fileName);
                if (partOwner === undefined) {
                    _this.fail(part, "merged interface ".concat(resolved.name, " contains a declaration outside this face"));
                }
                var typeParameters = _this.typeParameters(part.typeParameters);
                var heritage = _this.heritage(part);
                var members = _this.members(part.members, id);
                return {
                    typeParameters: typeParameters,
                    heritage: heritage,
                    members: members,
                    model: __assign(__assign({}, documentationOf(part)), { package: partOwner.name, location: _this.location(part), typeParameters: typeParameters, extends: heritage.extends, members: members.map(function (member) { return member.id; }) }),
                };
            });
            var parameters_1 = this.mergeTypeParameters(analyzedParts.map(function (part) { return part.typeParameters; }), selected, resolved.name);
            var model_1 = __assign(__assign({}, documentationOf(selected)), { id: id, package: owner.name, name: declarationName(selected), kind: 'interface', abstract: false, exported: hasModifier(selected, typescript_1.default.SyntaxKind.ExportKeyword), location: this.location(selected), text: declarationText(selected), typeParameters: parameters_1, extends: analyzedParts.flatMap(function (part) { return part.heritage.extends; }), implements: [], members: analyzedParts.flatMap(function (part) { return part.members; }), parts: analyzedParts.map(function (part) { return part.model; }) });
            this.declarations.set(id, model_1);
            this.declarationStates.delete(id);
            return model_1;
        }
        var parameters = typescript_1.default.isEnumDeclaration(selected) ? [] : this.typeParameters(selected.typeParameters);
        var heritage = typescript_1.default.isTypeAliasDeclaration(selected) || typescript_1.default.isEnumDeclaration(selected)
            ? { extends: [], implements: [] }
            : this.heritage(selected);
        var kind = typescript_1.default.isClassDeclaration(selected)
            ? 'class'
            : typescript_1.default.isInterfaceDeclaration(selected)
                ? 'interface'
                : typescript_1.default.isTypeAliasDeclaration(selected)
                    ? 'alias'
                    : 'enum';
        var model = __assign(__assign(__assign(__assign({}, documentationOf(selected)), { id: id, package: owner.name, name: declarationName(selected), kind: kind, abstract: hasModifier(selected, typescript_1.default.SyntaxKind.AbstractKeyword), exported: hasModifier(selected, typescript_1.default.SyntaxKind.ExportKeyword), location: this.location(selected), text: declarationText(selected), typeParameters: parameters, extends: heritage.extends, implements: heritage.implements, members: typescript_1.default.isTypeAliasDeclaration(selected) || typescript_1.default.isEnumDeclaration(selected)
                ? []
                : this.members(selected.members, id) }), (typescript_1.default.isTypeAliasDeclaration(selected) ? { type: this.convertType(selected.type) } : {})), (typescript_1.default.isEnumDeclaration(selected) ? { enumMembers: this.enumMembers(selected) } : {}));
        this.declarations.set(id, model);
        this.declarationStates.delete(id);
        return model;
    };
    FaceAnalyzer.prototype.enumMembers = function (declaration) {
        var _this = this;
        return declaration.members.map(function (member) { return (__assign(__assign(__assign(__assign({}, documentationOf(member)), { name: memberName(member.name) }), (member.initializer === undefined ? {} : { initializer: member.initializer.getText() })), { location: _this.location(member) })); });
    };
    FaceAnalyzer.prototype.heritage = function (declaration) {
        var _a;
        var result = { extends: [], implements: [] };
        for (var _i = 0, _b = (_a = declaration.heritageClauses) !== null && _a !== void 0 ? _a : []; _i < _b.length; _i++) {
            var clause = _b[_i];
            var target = clause.token === typescript_1.default.SyntaxKind.ExtendsKeyword ? result.extends : result.implements;
            for (var _c = 0, _d = clause.types; _c < _d.length; _c++) {
                var type = _d[_c];
                target.push(this.convertHeritage(type));
            }
        }
        return result;
    };
    FaceAnalyzer.prototype.convertHeritage = function (node) {
        var _this = this;
        var _a, _b;
        var symbol = this.checker.getSymbolAtLocation(node.expression);
        return this.addNode(node, {
            kind: 'reference',
            name: node.expression.getText(),
            target: this.targetForReference(this.resolveSymbol(symbol), node),
            arguments: (_b = (_a = node.typeArguments) === null || _a === void 0 ? void 0 : _a.map(function (argument) { return _this.convertType(argument); })) !== null && _b !== void 0 ? _b : [],
        });
    };
    FaceAnalyzer.prototype.members = function (members, ownerId) {
        var result = [];
        var _loop_4 = function (member) {
            if (typescript_1.default.isPropertyDeclaration(member)
                && memberName(member.name) === 'typertRemote'
                && member.initializer !== undefined
                && typescript_1.default.isCallExpression(member.initializer)
                && this_4.isTypeMetaSymbol(member.initializer.expression, 'bindTypertRemote'))
                return "continue";
            if (typescript_1.default.isMethodDeclaration(member) && member.body !== undefined
                && members.some(function (candidate) { return candidate !== member
                    && (typescript_1.default.isMethodDeclaration(candidate) || typescript_1.default.isMethodSignature(candidate))
                    && memberName(candidate.name) === memberName(member.name)
                    && (!typescript_1.default.isMethodDeclaration(candidate) || candidate.body === undefined); }))
                return "continue";
            var visibility = visibilityOf(member);
            var isStatic = hasModifier(member, typescript_1.default.SyntaxKind.StaticKeyword);
            if (visibility !== 'public' || isStatic || typescript_1.default.isConstructorDeclaration(member))
                return "continue";
            var base = this_4.memberBase(member, ownerId, visibility, isStatic);
            if (typescript_1.default.isPropertySignature(member) || typescript_1.default.isPropertyDeclaration(member)) {
                var type = this_4.requiredType(member, member.type, 'property');
                result.push(__assign(__assign({}, base), { kind: 'property', type: this_4.convertType(type) }));
            }
            else if (typescript_1.default.isMethodSignature(member) || typescript_1.default.isMethodDeclaration(member)) {
                result.push(__assign(__assign({}, base), { kind: 'method', signature: this_4.signature(member, member.type) }));
            }
            else if (typescript_1.default.isGetAccessorDeclaration(member)) {
                result.push(__assign(__assign({}, base), { kind: 'getter', signature: this_4.signature(member, member.type) }));
            }
            else if (typescript_1.default.isSetAccessorDeclaration(member)) {
                result.push(__assign(__assign({}, base), { kind: 'setter', signature: this_4.signature(member, member.type) }));
            }
            else if (typescript_1.default.isCallSignatureDeclaration(member)) {
                result.push(__assign(__assign({}, base), { kind: 'call', signature: this_4.signature(member, member.type) }));
            }
            else if (typescript_1.default.isConstructSignatureDeclaration(member)) {
                result.push(__assign(__assign({}, base), { kind: 'construct', signature: this_4.signature(member, member.type) }));
            }
            else if (typescript_1.default.isIndexSignatureDeclaration(member)) {
                result.push(__assign(__assign({}, base), { kind: 'index', signature: this_4.signature(member, member.type) }));
            }
        };
        var this_4 = this;
        for (var _i = 0, members_1 = members; _i < members_1.length; _i++) {
            var member = members_1[_i];
            _loop_4(member);
        }
        return result;
    };
    FaceAnalyzer.prototype.memberBase = function (member, ownerId, visibility, isStatic) {
        var identity = member.name !== undefined
            ? this.memberIdentity(member.name)
            : {
                name: typescript_1.default.isCallSignatureDeclaration(member)
                    ? '(call)'
                    : typescript_1.default.isConstructSignatureDeclaration(member)
                        ? '(construct)'
                        : '(index)',
            };
        return __assign(__assign(__assign(__assign({}, documentationOf(member)), { id: "".concat(ownerId, "#").concat(identity.name, "@").concat(String(member.getStart())) }), identity), { optional: 'questionToken' in member && member.questionToken !== undefined, readonly: hasModifier(member, typescript_1.default.SyntaxKind.ReadonlyKeyword), async: hasModifier(member, typescript_1.default.SyntaxKind.AsyncKeyword), abstract: hasModifier(member, typescript_1.default.SyntaxKind.AbstractKeyword), static: isStatic, visibility: visibility, location: this.location(member), text: memberText(member) });
    };
    FaceAnalyzer.prototype.memberIdentity = function (name) {
        if (!typescript_1.default.isComputedPropertyName(name))
            return { name: memberName(name) };
        var expression = name.expression;
        if (typescript_1.default.isStringLiteral(expression) || typescript_1.default.isNumericLiteral(expression)
            || typescript_1.default.isNoSubstitutionTemplateLiteral(expression)) {
            return { name: memberName(name), jsonName: expression.text };
        }
        var type = this.checker.getTypeAtLocation(expression);
        return {
            name: memberName(name),
            computed: (type.flags & typescript_1.default.TypeFlags.UniqueESSymbol) !== 0 ? 'symbol' : 'dynamic',
        };
    };
    FaceAnalyzer.prototype.signature = function (node, explicitReturn) {
        var _this = this;
        var parameters = node.parameters.map(function (parameter) { return (__assign({ name: memberName(parameter.name), binding: typescript_1.default.isIdentifier(parameter.name)
                ? 'identifier'
                : typescript_1.default.isObjectBindingPattern(parameter.name)
                    ? 'object'
                    : 'array', type: _this.convertType(_this.requiredType(parameter, parameter.type, 'parameter')), optional: parameter.questionToken !== undefined || parameter.initializer !== undefined, rest: parameter.dotDotDotToken !== undefined, receiver: typescript_1.default.isIdentifier(parameter.name) && parameter.name.text === 'this' }, (parameter.initializer === undefined ? {} : { initializer: parameter.initializer.getText() }))); });
        return {
            typeParameters: this.typeParameters(node.typeParameters),
            parameters: parameters,
            returns: typescript_1.default.isSetAccessorDeclaration(node)
                ? this.addNode(node, { kind: 'keyword', name: 'void' })
                : this.convertType(this.requiredType(node, explicitReturn, 'return')),
        };
    };
    FaceAnalyzer.prototype.typeParameters = function (parameters) {
        var _this = this;
        var _a;
        return (_a = parameters === null || parameters === void 0 ? void 0 : parameters.map(function (parameter) { return (__assign(__assign(__assign({ id: "".concat(_this.locationKey(parameter), "#").concat(parameter.name.text), name: parameter.name.text, const: hasModifier(parameter, typescript_1.default.SyntaxKind.ConstKeyword) }, (parameter.constraint === undefined ? {} : { constraint: _this.convertType(parameter.constraint) })), (parameter.default === undefined ? {} : { default: _this.convertType(parameter.default) })), (hasModifier(parameter, typescript_1.default.SyntaxKind.InKeyword) && hasModifier(parameter, typescript_1.default.SyntaxKind.OutKeyword)
            ? { variance: 'in-out' }
            : hasModifier(parameter, typescript_1.default.SyntaxKind.InKeyword)
                ? { variance: 'in' }
                : hasModifier(parameter, typescript_1.default.SyntaxKind.OutKeyword)
                    ? { variance: 'out' }
                    : {}))); })) !== null && _a !== void 0 ? _a : [];
    };
    FaceAnalyzer.prototype.mergeTypeParameters = function (parts, site, declarationName) {
        var _this = this;
        var first = parts[0];
        return first.map(function (parameter, index) {
            var _a, _b;
            var peers = parts.map(function (part) { return part[index]; });
            var constraint = (_a = peers.find(function (peer) { return peer.constraint !== undefined; })) === null || _a === void 0 ? void 0 : _a.constraint;
            var fallback = (_b = peers.find(function (peer) { return peer.default !== undefined; })) === null || _b === void 0 ? void 0 : _b.default;
            var variances = __spreadArray([], new Set(peers.flatMap(function (peer) { return peer.variance === undefined ? [] : [peer.variance]; })), true);
            if (variances.length > 1) {
                _this.fail(site, "merged interface ".concat(declarationName, " has incompatible variance modifiers"));
            }
            return __assign(__assign(__assign({ id: parameter.id, name: parameter.name, const: peers.some(function (peer) { return peer.const; }) }, (constraint === undefined ? {} : { constraint: constraint })), (fallback === undefined ? {} : { default: fallback })), (variances[0] === undefined ? {} : { variance: variances[0] }));
        });
    };
    FaceAnalyzer.prototype.requiredType = function (owner, type, purpose) {
        if (type !== undefined)
            return type;
        if (this.mode === 'check') {
            this.fail(owner, "public ".concat(purpose, " is missing an explicit type annotation"));
        }
        var inferred = this.inferType(owner, purpose);
        var rendered = typescript_1.default.createPrinter().printNode(typescript_1.default.EmitHint.Unspecified, inferred, owner.getSourceFile());
        var position = annotationPosition(owner, purpose);
        this.queueEdit({ file: realPath(owner.getSourceFile().fileName), position: position, text: ": ".concat(rendered) });
        throw new SourceEditQueued();
    };
    FaceAnalyzer.prototype.inferType = function (owner, purpose) {
        var type;
        if (purpose === 'return') {
            var signature = this.checker.getSignatureFromDeclaration(owner);
            type = this.checker.getReturnTypeOfSignature(signature);
        }
        else {
            type = this.checker.getTypeAtLocation(owner);
        }
        return this.checker.typeToTypeNode(type, owner, typescript_1.default.NodeBuilderFlags.NoTruncation | typescript_1.default.NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope);
    };
    FaceAnalyzer.prototype.convertType = function (node) {
        var _this = this;
        var _a, _b, _c, _d, _e, _f;
        var id = this.allocateNodeId(node);
        var add = function (model) {
            _this.nodes.set(id, __assign({ id: id }, model));
            return id;
        };
        var keyword = keywordName(node.kind);
        if (keyword !== undefined)
            return add({ kind: 'keyword', name: keyword });
        if (typescript_1.default.isParenthesizedTypeNode(node)) {
            return add({ kind: 'parenthesized', type: this.convertType(node.type) });
        }
        if (typescript_1.default.isLiteralTypeNode(node))
            return add(literalModel(node));
        if (typescript_1.default.isTypeReferenceNode(node)) {
            var symbol = this.checker.getSymbolAtLocation(node.typeName);
            return add({
                kind: 'reference',
                name: node.typeName.getText(),
                target: this.targetForReference(this.resolveSymbol(symbol), node),
                arguments: (_b = (_a = node.typeArguments) === null || _a === void 0 ? void 0 : _a.map(function (argument) { return _this.convertType(argument); })) !== null && _b !== void 0 ? _b : [],
            });
        }
        if (typescript_1.default.isUnionTypeNode(node) || typescript_1.default.isIntersectionTypeNode(node)) {
            return add({
                kind: typescript_1.default.isUnionTypeNode(node) ? 'union' : 'intersection',
                types: node.types.map(function (type) { return _this.convertType(type); }),
            });
        }
        if (typescript_1.default.isArrayTypeNode(node))
            return add({ kind: 'array', element: this.convertType(node.elementType) });
        if (typescript_1.default.isTupleTypeNode(node)) {
            return add({
                kind: 'tuple',
                elements: node.elements.map(function (element) {
                    var _a;
                    var named = typescript_1.default.isNamedTupleMember(element) ? element : undefined;
                    var raw = (_a = named === null || named === void 0 ? void 0 : named.type) !== null && _a !== void 0 ? _a : element;
                    var optional = (named === null || named === void 0 ? void 0 : named.questionToken) !== undefined || typescript_1.default.isOptionalTypeNode(raw);
                    var rest = (named === null || named === void 0 ? void 0 : named.dotDotDotToken) !== undefined || typescript_1.default.isRestTypeNode(raw);
                    var type = typescript_1.default.isOptionalTypeNode(raw) || typescript_1.default.isRestTypeNode(raw) ? raw.type : raw;
                    return __assign(__assign({}, (named === undefined ? {} : { name: named.name.text })), { type: _this.convertType(type), optional: optional, rest: rest });
                }),
            });
        }
        if (typescript_1.default.isTypeLiteralNode(node))
            return add({ kind: 'object', members: this.members(node.members, id) });
        if (typescript_1.default.isFunctionTypeNode(node)) {
            return add({ kind: 'function', signature: this.signature(node, node.type) });
        }
        if (typescript_1.default.isConstructorTypeNode(node)) {
            return add({
                kind: 'constructor',
                abstract: hasModifier(node, typescript_1.default.SyntaxKind.AbstractKeyword),
                signature: this.signature(node, node.type),
            });
        }
        if (typescript_1.default.isIndexedAccessTypeNode(node)) {
            return add({
                kind: 'indexed-access',
                object: this.convertType(node.objectType),
                index: this.convertType(node.indexType),
            });
        }
        if (typescript_1.default.isTypeOperatorNode(node)) {
            return add({
                kind: 'operator',
                operator: typescript_1.default.tokenToString(node.operator),
                type: this.convertType(node.type),
            });
        }
        if (typescript_1.default.isConditionalTypeNode(node)) {
            return add({
                kind: 'conditional',
                check: this.convertType(node.checkType),
                extends: this.convertType(node.extendsType),
                whenTrue: this.convertType(node.trueType),
                whenFalse: this.convertType(node.falseType),
            });
        }
        if (typescript_1.default.isInferTypeNode(node)) {
            return add({ kind: 'infer', parameter: this.typeParameters(typescript_1.default.factory.createNodeArray([node.typeParameter]))[0] });
        }
        if (typescript_1.default.isMappedTypeNode(node)) {
            var parameter = this.typeParameters(typescript_1.default.factory.createNodeArray([node.typeParameter]))[0];
            return add(__assign(__assign(__assign({ kind: 'mapped', parameter: parameter }, (node.nameType === undefined ? {} : { nameType: this.convertType(node.nameType) })), (node.type === undefined ? {} : { value: this.convertType(node.type) })), { readonly: modifierMode(node.readonlyToken), optional: modifierMode(node.questionToken) }));
        }
        if (typescript_1.default.isTemplateLiteralTypeNode(node)) {
            return add({
                kind: 'template-literal',
                head: node.head.text,
                spans: node.templateSpans.map(function (span) { return ({ type: _this.convertType(span.type), text: span.literal.text }); }),
            });
        }
        if (typescript_1.default.isTypeQueryNode(node)) {
            return add({
                kind: 'type-query',
                expression: node.exprName.getText(),
                arguments: (_d = (_c = node.typeArguments) === null || _c === void 0 ? void 0 : _c.map(function (argument) { return _this.convertType(argument); })) !== null && _d !== void 0 ? _d : [],
            });
        }
        if (typescript_1.default.isImportTypeNode(node)) {
            var argument = node.argument;
            var symbol = node.qualifier === undefined ? undefined : this.checker.getSymbolAtLocation(node.qualifier);
            return add(__assign(__assign(__assign(__assign({ kind: 'import-type', module: argument.literal.text }, (node.qualifier === undefined ? {} : { qualifier: node.qualifier.getText() })), { arguments: (_f = (_e = node.typeArguments) === null || _e === void 0 ? void 0 : _e.map(function (argument) { return _this.convertType(argument); })) !== null && _f !== void 0 ? _f : [], typeof: node.isTypeOf }), (node.attributes === undefined ? {} : { attributes: importTypeAttributesText(node) })), (symbol === undefined ? {} : { target: this.targetForReference(this.resolveSymbol(symbol), node) })));
        }
        if (typescript_1.default.isTypePredicateNode(node)) {
            return add(__assign({ kind: 'predicate', asserts: node.assertsModifier !== undefined, parameter: node.parameterName.getText() }, (node.type === undefined ? {} : { type: this.convertType(node.type) })));
        }
        /* v8 ignore else -- every source TypeNode kind accepted by TypeScript is handled above; this arm keeps
         * future compiler kinds fail-loud. */
        if (typescript_1.default.isThisTypeNode(node))
            return add({ kind: 'this' });
        /* v8 ignore next -- paired with the exhaustive TypeNode guard above. */
        this.fail(node, "unsupported TypeScript type node ".concat(typescript_1.default.SyntaxKind[node.kind]));
    };
    FaceAnalyzer.prototype.addNode = function (site, model) {
        var id = this.allocateNodeId(site);
        this.nodes.set(id, __assign({ id: id }, model));
        return id;
    };
    FaceAnalyzer.prototype.referenceNode = function (symbol, site) {
        return this.addNode(site, {
            kind: 'reference',
            name: symbol.name,
            target: { kind: 'declaration', symbol: this.symbolId(symbol) },
            arguments: [],
        });
    };
    FaceAnalyzer.prototype.targetForReference = function (symbol, site) {
        var _this = this;
        var declaration = preferredDeclaration(symbol);
        /* v8 ignore next -- a symbol from a semantically valid source type reference always has a declaration. */
        if (declaration === undefined)
            this.fail(site, "type symbol ".concat(symbol.name, " has no declaration"));
        if (typescript_1.default.isTypeParameterDeclaration(declaration)) {
            return {
                kind: 'type-parameter',
                parameter: "".concat(this.locationKey(declaration), "#").concat(declaration.name.text),
            };
        }
        if (isStandardLibraryFile(declaration.getSourceFile().fileName)) {
            return { kind: 'standard', name: symbol.name };
        }
        var moduleSpecifier = moduleSpecifierOf(site);
        var module = moduleSpecifier === undefined ? undefined : moduleIdentity(moduleSpecifier);
        var from = this.registrationForFile(site.getSourceFile().fileName);
        var owner = this.registrationForFile(declaration.getSourceFile().fileName);
        if (owner !== undefined) {
            if (owner.name !== from.name) {
                if (module === undefined) {
                    this.fail(site, "reference to ".concat(symbol.name, " crosses a package without an explicit package import"));
                }
                var exportName = authoredExportName(site, moduleSpecifier);
                if (this.packageExportName(module, symbol, owner.face, exportName) === undefined) {
                    this.fail(site, "package reference ".concat(exportName, " is not exported by ").concat(module.package, " at ").concat(module.subpath));
                }
            }
            var typeDeclaration = declaration;
            if (!this.declarationStates.has(this.symbolId(symbol)))
                this.ensureDeclaration(symbol, typeDeclaration);
            return { kind: 'declaration', symbol: this.symbolId(symbol) };
        }
        var packageFaces = module === undefined
            ? []
            : __spreadArray([], new Set(this.allRegistrations.filter(function (candidate) { return candidate.name === module.package; }).map(function (candidate) { return candidate.face; })), true);
        var otherFace = packageFaces.find(function (face) { return face !== _this.face; });
        if (otherFace !== undefined && module !== undefined) {
            var requestedName = authoredExportName(site, moduleSpecifier);
            var exportName = this.packageExportName(module, symbol, otherFace, requestedName);
            if (exportName === undefined) {
                this.fail(site, "cross-face reference ".concat(requestedName, " is not exported by ").concat(module.package, " at ").concat(module.subpath));
            }
            this.recordCrossFaceLink(from.name, otherFace, module, exportName);
            return {
                kind: 'cross-face',
                face: otherFace,
                package: module.package,
                subpath: module.subpath,
                name: exportName,
            };
        }
        if (module !== undefined) {
            return {
                kind: 'external',
                module: module.package,
                subpath: module.subpath,
                name: symbol.name,
            };
        }
        var external = externalModuleIdentityForFile(declaration.getSourceFile().fileName);
        if (external !== undefined) {
            return {
                kind: 'external',
                module: external.package,
                subpath: external.subpath,
                name: symbol.name,
            };
        }
        this.fail(site, "reference to ".concat(symbol.name, " crosses a package or face without an explicit import"));
    };
    FaceAnalyzer.prototype.recordCrossFaceLink = function (fromPackage, toFace, module, name) {
        var link = {
            fromFace: this.face,
            fromPackage: fromPackage,
            toFace: toFace,
            toPackage: module.package,
            subpath: module.subpath,
            name: name,
        };
        var key = [
            link.fromFace,
            link.fromPackage,
            link.toFace,
            link.toPackage,
            link.subpath,
            link.name,
        ].join('\0');
        this.crossFaceLinks.set(key, link);
    };
    FaceAnalyzer.prototype.packageExportName = function (module, symbol, face, requestedName) {
        var _this = this;
        var _a;
        var registration = this.allRegistrations.find(function (candidate) {
            return candidate.face === face && candidate.name === module.package;
        });
        var target = (_a = packageExportTargets(registration.manifest)
            .find(function (_a) {
            var subpath = _a[0];
            return subpath === module.subpath;
        })) === null || _a === void 0 ? void 0 : _a[1];
        if (target === undefined)
            return undefined;
        var sourceFile = this.sourceFiles.get(realPath(sourcePathForExport(registration.root, target)));
        var moduleSymbol = this.checker.getSymbolAtLocation(sourceFile);
        var exported = this.checker.getExportsOfModule(moduleSymbol)
            .find(function (candidate) { return candidate.name === requestedName && _this.resolveSymbol(candidate) === symbol; });
        return exported === null || exported === void 0 ? void 0 : exported.name;
    };
    FaceAnalyzer.prototype.symbolAtType = function (node) {
        var _a;
        if (typescript_1.default.isTypeReferenceNode(node)) {
            return this.resolveSymbol(this.checker.getSymbolAtLocation(node.typeName));
        }
        var type = this.checker.getTypeAtLocation(node);
        var symbol = (_a = type.aliasSymbol) !== null && _a !== void 0 ? _a : type.getSymbol();
        return symbol === undefined ? undefined : this.resolveSymbol(symbol);
    };
    FaceAnalyzer.prototype.resolveSymbol = function (symbol) {
        return (symbol.flags & typescript_1.default.SymbolFlags.Alias) === 0 ? symbol : this.checker.getAliasedSymbol(symbol);
    };
    FaceAnalyzer.prototype.symbolId = function (symbol) {
        var declaration = preferredDeclaration(symbol);
        if (declaration === undefined)
            return "symbol:".concat(symbol.name);
        var location = this.location(declaration);
        return "".concat(this.packageNameForFile(declaration.getSourceFile().fileName), ":").concat(location.file, "#").concat(symbol.name);
    };
    FaceAnalyzer.prototype.registrationForFile = function (file) {
        var _this = this;
        var path = realPath(file);
        return this.allRegistrations
            .find(function (registration) { return registration.face === _this.face && isWithin(path, registration.root); });
    };
    FaceAnalyzer.prototype.packageNameForFile = function (file) {
        var _a, _b;
        var path = realPath(file);
        return (_b = (_a = this.allRegistrations.find(function (registration) { return isWithin(path, registration.root); })) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '<external>';
    };
    FaceAnalyzer.prototype.allocateNodeId = function (site) {
        var _a;
        var location = this.locationKey(site);
        var ordinal = ((_a = this.nodeOrdinals.get(location)) !== null && _a !== void 0 ? _a : 0) + 1;
        this.nodeOrdinals.set(location, ordinal);
        return "type:".concat(location, "#").concat(String(ordinal));
    };
    FaceAnalyzer.prototype.locationKey = function (node) {
        var location = this.location(node);
        return "".concat(location.file, ":").concat(String(location.line), ":").concat(String(location.column));
    };
    FaceAnalyzer.prototype.location = function (node) {
        var sourceFile = node.getSourceFile();
        var position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        return {
            file: slash((0, node_path_1.relative)(this.root, sourceFile.fileName)),
            line: position.line + 1,
            column: position.character + 1,
        };
    };
    FaceAnalyzer.prototype.fail = function (node, message) {
        var location = this.location(node);
        throw new TypertAnalysisError("typert(".concat(this.face, "): ").concat(location.file, ":").concat(String(location.line), ":").concat(String(location.column), ": ").concat(message));
    };
    return FaceAnalyzer;
}());
function mergeWorkspaceModels(models) {
    var _a;
    var faces = new Map();
    var links = new Map();
    for (var _i = 0, models_1 = models; _i < models_1.length; _i++) {
        var model = models_1[_i];
        for (var _b = 0, _c = model.faces; _b < _c.length; _b++) {
            var face = _c[_b];
            var merged = (_a = faces.get(face.face)) !== null && _a !== void 0 ? _a : {
                packages: new Map(),
                declarations: new Map(),
                nodes: new Map(),
            };
            for (var _d = 0, _e = face.packages; _d < _e.length; _d++) {
                var packageModel = _e[_d];
                merged.packages.set(packageModel.name, packageModel);
            }
            for (var _f = 0, _g = face.graph.declarations; _f < _g.length; _f++) {
                var declaration = _g[_f];
                if (!merged.declarations.has(declaration.id))
                    merged.declarations.set(declaration.id, declaration);
            }
            for (var _h = 0, _j = face.graph.nodes; _h < _j.length; _h++) {
                var node = _j[_h];
                if (!merged.nodes.has(node.id))
                    merged.nodes.set(node.id, node);
            }
            faces.set(face.face, merged);
        }
        for (var _k = 0, _l = model.crossFaceLinks; _k < _l.length; _k++) {
            var link = _l[_k];
            links.set([
                link.fromFace,
                link.fromPackage,
                link.toFace,
                link.toPackage,
                link.subpath,
                link.name,
            ].join('\0'), link);
        }
    }
    return {
        faces: __spreadArray([], faces, true).sort(function (_a, _b) {
            var left = _a[0];
            var right = _b[0];
            return (left === 'host' ? 0 : 1) - (right === 'host' ? 0 : 1);
        }).map(function (_a) {
            var face = _a[0], model = _a[1];
            return ({
                face: face,
                packages: __spreadArray([], model.packages.values(), true).sort(function (left, right) { return left.name.localeCompare(right.name); }),
                graph: {
                    declarations: __spreadArray([], model.declarations.values(), true).sort(function (left, right) { return left.id.localeCompare(right.id); }),
                    nodes: __spreadArray([], model.nodes.values(), true).sort(function (left, right) { return left.id.localeCompare(right.id); }),
                },
            });
        }),
        crossFaceLinks: __spreadArray([], links.values(), true).sort(compareCrossFaceLinks),
    };
}
function parseConfig(path) {
    var compilerPath = path.split(node_path_1.sep).join('/');
    var read = typescript_1.default.readConfigFile(compilerPath, function (file) { return typescript_1.default.sys.readFile(file); });
    if (read.error !== undefined)
        throw new TypertAnalysisError(formatDiagnostic(read.error));
    var parsed = typescript_1.default.parseJsonConfigFileContent(read.config, typescript_1.default.sys, (0, node_path_1.dirname)(compilerPath), undefined, compilerPath);
    if (parsed.errors.length > 0)
        throw new TypertAnalysisError(parsed.errors.map(formatDiagnostic).join('\n'));
    return { path: path, parsed: parsed };
}
function projectConfigPath(path) {
    if ((0, node_path_1.extname)(path) === '.json')
        return path;
    return (0, node_path_1.join)(path, 'tsconfig.json');
}
function sourceFileHasSurface(sourceFile) {
    var _a;
    for (var _i = 0, _b = sourceFile.statements; _i < _b.length; _i++) {
        var statement = _b[_i];
        if ((typescript_1.default.isClassDeclaration(statement)
            || typescript_1.default.isInterfaceDeclaration(statement)
            || typescript_1.default.isTypeAliasDeclaration(statement)
            || typescript_1.default.isEnumDeclaration(statement))
            && (typertMode(statement) !== undefined || typertServiceTag(statement) !== undefined))
            return true;
        if (typescript_1.default.isClassDeclaration(statement)) {
            for (var _c = 0, _d = statement.members; _c < _d.length; _c++) {
                var member = _d[_c];
                if (typescript_1.default.isPropertyDeclaration(member)
                    && memberName(member.name) === 'typertRemote'
                    && member.initializer !== undefined
                    && typescript_1.default.isCallExpression(member.initializer)
                    && expressionName(member.initializer.expression) === 'bindTypertRemote')
                    return true;
                for (var _e = 0, _f = typescript_1.default.canHaveDecorators(member) ? (_a = typescript_1.default.getDecorators(member)) !== null && _a !== void 0 ? _a : [] : []; _e < _f.length; _e++) {
                    var decorator = _f[_e];
                    var expression = typescript_1.default.isCallExpression(decorator.expression)
                        ? decorator.expression.expression
                        : decorator.expression;
                    var name_2 = expressionName(expression);
                    if (name_2 === 'Remote' || name_2 === 'RemoteScope')
                        return true;
                }
            }
        }
        if (!typescript_1.default.isModuleDeclaration(statement)
            || !typescript_1.default.isStringLiteral(statement.name)
            || statement.name.text !== '@z/cordis'
            || statement.body === undefined
            || !typescript_1.default.isModuleBlock(statement.body))
            continue;
        if (statement.body.statements.some(function (member) { return typescript_1.default.isInterfaceDeclaration(member)
            && (member.name.text === 'Context' || member.name.text === 'Events')
            && member.members.length > 0; }))
            return true;
    }
    return false;
}
function hasPackageSurface(model) {
    return model.services.length > 0
        || model.events.length > 0
        || model.objects.length > 0
        || model.schemas.length > 0
        || model.invocations.length > 0;
}
function isDualFacePackage(manifest) {
    var dsh = manifest.dsh;
    var client = dsh !== null && typeof dsh === 'object'
        ? dsh.client
        : undefined;
    return client !== null
        && typeof client === 'object'
        && clientExportSubpaths(manifest).length > 0;
}
function hostExportSubpaths(manifest) {
    return packageExportTargets(manifest)
        .map(function (_a) {
        var subpath = _a[0];
        return subpath;
    })
        .filter(function (subpath) { return subpath !== './client'
        && !subpath.startsWith('./client/')
        && subpath !== './remote'; });
}
function clientExportSubpaths(manifest) {
    return packageExportTargets(manifest)
        .map(function (_a) {
        var subpath = _a[0];
        return subpath;
    })
        .filter(function (subpath) { return subpath === './client' || subpath.startsWith('./client/'); });
}
function packageExportTargets(manifest) {
    var exportsField = manifest.exports;
    if (typeof exportsField === 'string')
        return [['.', exportsField]];
    if (exportsField === null || typeof exportsField !== 'object') {
        var types = manifest.types;
        return typeof types === 'string' ? [['.', types]] : [];
    }
    if (Array.isArray(exportsField)
        || !Object.keys(exportsField).some(function (key) { return key.startsWith('.'); })) {
        var target = exportTarget(exportsField);
        return target === undefined ? [] : [['.', target]];
    }
    var result = [];
    for (var _i = 0, _a = Object.entries(exportsField); _i < _a.length; _i++) {
        var _b = _a[_i], subpath = _b[0], value = _b[1];
        if (!subpath.startsWith('.'))
            continue;
        var target = exportTarget(value);
        if (target !== undefined)
            result.push([subpath, target]);
    }
    return result.sort(function (_a, _b) {
        var left = _a[0];
        var right = _b[0];
        return left.localeCompare(right);
    });
}
function exportTarget(value) {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value)) {
        for (var _i = 0, value_1 = value; _i < value_1.length; _i++) {
            var candidate = value_1[_i];
            var target = exportTarget(candidate);
            if (target !== undefined)
                return target;
        }
        return undefined;
    }
    if (value === null || typeof value !== 'object')
        return undefined;
    var conditions = value;
    for (var _a = 0, _b = ['types', 'import', 'default']; _a < _b.length; _a++) {
        var key = _b[_a];
        var target = exportTarget(conditions[key]);
        if (target !== undefined)
            return target;
    }
    for (var _c = 0, _d = Object.values(conditions); _c < _d.length; _c++) {
        var candidate = _d[_c];
        var target = exportTarget(candidate);
        if (target !== undefined)
            return target;
    }
    return undefined;
}
function sourcePathForExport(packageRoot, target) {
    var normalized = target.replace(/^\.\//, '');
    if (normalized.startsWith('lib/types/')) {
        return (0, node_path_1.resolve)(packageRoot, 'src', normalized.slice('lib/types/'.length).replace(/\.d\.(?:mts|cts|ts)$/, '.ts'));
    }
    if (normalized.startsWith('lib/')) {
        return (0, node_path_1.resolve)(packageRoot, 'src', normalized.slice('lib/'.length).replace(/\.(?:mjs|cjs|js|d\.ts)$/, '.ts'));
    }
    return (0, node_path_1.resolve)(packageRoot, normalized);
}
function preferredDeclaration(symbol) {
    var _a, _b, _c, _d;
    return (_c = (_b = (_a = symbol.declarations) === null || _a === void 0 ? void 0 : _a.find(isTypeDeclaration)) !== null && _b !== void 0 ? _b : symbol.valueDeclaration) !== null && _c !== void 0 ? _c : (_d = symbol.declarations) === null || _d === void 0 ? void 0 : _d[0];
}
function optionalParent(node) {
    return node.parent;
}
function isTypeDeclaration(node) {
    return typescript_1.default.isClassDeclaration(node)
        || typescript_1.default.isInterfaceDeclaration(node)
        || typescript_1.default.isTypeAliasDeclaration(node)
        || typescript_1.default.isEnumDeclaration(node);
}
function declarationName(declaration) {
    return declaration.name.text;
}
function memberText(member) {
    var sourceFile = member.getSourceFile();
    var full = member.getText(sourceFile);
    var body = member.body;
    var signature = body === undefined ? full : full.slice(0, full.length - body.getText(sourceFile).length);
    return signature.replace(/\s*;?\s*$/, '').replace(/\s+/g, ' ').trim();
}
function declarationText(declaration) {
    var printer = typescript_1.default.createPrinter({ removeComments: true });
    var projected = typescript_1.default.isClassDeclaration(declaration) ? classShape(declaration) : declaration;
    return printer.printNode(typescript_1.default.EmitHint.Unspecified, projected, declaration.getSourceFile()).replace(/\r/g, '');
}
function classShape(node) {
    var nonPublic = function (member) {
        var _a, _b;
        return (_b = (_a = (typescript_1.default.canHaveModifiers(member) ? typescript_1.default.getModifiers(member) : undefined)) === null || _a === void 0 ? void 0 : _a.some(function (modifier) {
            return modifier.kind === typescript_1.default.SyntaxKind.PrivateKeyword || modifier.kind === typescript_1.default.SyntaxKind.ProtectedKeyword;
        })) !== null && _b !== void 0 ? _b : false;
    };
    var members = node.members.flatMap(function (member) {
        var _a;
        if (nonPublic(member) || (typescript_1.default.isPropertyDeclaration(member) && typescript_1.default.isPrivateIdentifier(member.name)))
            return [];
        if (typescript_1.default.isMethodDeclaration(member)) {
            return [typescript_1.default.factory.updateMethodDeclaration(member, member.modifiers, member.asteriskToken, member.name, member.questionToken, member.typeParameters, member.parameters, member.type, undefined)];
        }
        if (typescript_1.default.isConstructorDeclaration(member)) {
            return [typescript_1.default.factory.updateConstructorDeclaration(member, member.modifiers, member.parameters, undefined)];
        }
        if (typescript_1.default.isGetAccessorDeclaration(member)) {
            return [typescript_1.default.factory.updateGetAccessorDeclaration(member, member.modifiers, member.name, member.parameters, member.type, undefined)];
        }
        if (typescript_1.default.isSetAccessorDeclaration(member)) {
            return [typescript_1.default.factory.updateSetAccessorDeclaration(member, member.modifiers, member.name, member.parameters, undefined)];
        }
        if (typescript_1.default.isPropertyDeclaration(member)) {
            return [typescript_1.default.factory.updatePropertyDeclaration(member, member.modifiers, member.name, (_a = member.questionToken) !== null && _a !== void 0 ? _a : member.exclamationToken, member.type, undefined)];
        }
        return [member];
    });
    return typescript_1.default.factory.updateClassDeclaration(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, members);
}
function documentationOf(node) {
    var blocks = typescript_1.default.getJSDocCommentsAndTags(node).filter(typescript_1.default.isJSDoc);
    var block = blocks.at(-1);
    if (block === undefined)
        return EMPTY_DOCUMENTATION;
    var description = normalizedDocText(typescript_1.default.getTextOfJSDocComment(block.comment));
    var tags = typescript_1.default.getJSDocTags(node).map(function (tag) {
        var named = tag;
        var comment = normalizedDocText(typescript_1.default.getTextOfJSDocComment(tag.comment));
        return __assign(__assign(__assign({ name: tag.tagName.text }, (named.name === undefined ? {} : { argument: named.name.getText() })), (comment === undefined ? {} : { comment: comment })), { text: tag.getText(tag.getSourceFile()).trim() });
    });
    return __assign(__assign({}, (description === undefined ? {} : {
        description: description,
        summary: firstSentence(description),
    })), { tags: tags, jsDoc: rawJsDoc(node) });
}
function normalizedDocText(value) {
    if (value === undefined)
        return undefined;
    var normalized = value.replace(/\s+/g, ' ').trim();
    /* v8 ignore next -- TypeScript represents whitespace-only JSDoc as undefined before this helper is called. */
    return normalized.length === 0 ? undefined : normalized;
}
function firstSentence(value) {
    var _a, _b;
    return ((_b = (_a = /^(.*?[.!?])(?:\s|$)/.exec(value)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : value).trim();
}
function rawJsDoc(node) {
    var sourceFile = node.getSourceFile();
    var source = sourceFile.getFullText();
    var ranges = typescript_1.default.getLeadingCommentRanges(source, node.getFullStart());
    var range = ranges.filter(function (candidate) { return source.slice(candidate.pos, candidate.pos + 3) === '/**'; }).at(-1);
    var raw = source.slice(range.pos, range.end);
    var line = sourceFile.getLineAndCharacterOfPosition(range.pos).line;
    var lineStart = sourceFile.getPositionOfLineAndCharacter(line, 0);
    var indent = source.slice(lineStart, range.pos);
    return raw.split('\n')
        .map(function (text, index) { return index > 0 && text.startsWith(indent) ? text.slice(indent.length) : text; })
        .join('\n');
}
function typertMode(node) {
    var _a;
    for (var _i = 0, _b = typescript_1.default.getJSDocTags(node); _i < _b.length; _i++) {
        var tag = _b[_i];
        if (tag.tagName.text !== 'typert')
            continue;
        var mode = ((_a = typescript_1.default.getTextOfJSDocComment(tag.comment)) !== null && _a !== void 0 ? _a : '').trim().split(/\s+/, 1)[0];
        if (mode === 'object')
            return 'object';
        if (mode === '' || mode === 'schema' || mode === 'type')
            return 'schema';
    }
    return undefined;
}
function typertServiceTag(node) {
    return typescript_1.default.getJSDocTags(node).find(function (tag) {
        var _a;
        return tag.tagName.text === 'typert'
            && ((_a = typescript_1.default.getTextOfJSDocComment(tag.comment)) !== null && _a !== void 0 ? _a : '').trim().split(/\s+/, 1)[0] === 'service';
    });
}
function memberName(name) {
    if (typescript_1.default.isIdentifier(name) || typescript_1.default.isPrivateIdentifier(name) || typescript_1.default.isStringLiteral(name)
        || typescript_1.default.isNumericLiteral(name) || typescript_1.default.isNoSubstitutionTemplateLiteral(name))
        return name.text;
    if (typescript_1.default.isComputedPropertyName(name))
        return "[".concat(name.expression.getText(), "]");
    return name.getText();
}
function stringLiteralValue(node) {
    return node !== undefined && (typescript_1.default.isStringLiteral(node) || typescript_1.default.isNoSubstitutionTemplateLiteral(node))
        ? node.text
        : undefined;
}
function isRemoteSegment(value) {
    // Generation bootstraps workspace artifacts before dsh-typert-protocol is built,
    // so this extraction-only copy must mirror isTypertRemoteSegment().
    return value !== '.' && value !== '..' && /^[A-Za-z0-9_$.-]+$/.test(value);
}
function expressionName(node) {
    if (typescript_1.default.isIdentifier(node))
        return node.text;
    if (typescript_1.default.isPropertyAccessExpression(node))
        return node.name.text;
    return undefined;
}
function packageExportSpecifier(packageName, subpath) {
    return subpath === '.' ? packageName : "".concat(packageName).concat(subpath.slice(1));
}
function visibilityOf(node) {
    if ('name' in node && node.name !== undefined && typescript_1.default.isPrivateIdentifier(node.name))
        return 'private';
    if (hasModifier(node, typescript_1.default.SyntaxKind.PrivateKeyword))
        return 'private';
    if (hasModifier(node, typescript_1.default.SyntaxKind.ProtectedKeyword))
        return 'protected';
    return 'public';
}
function hasModifier(node, kind) {
    var _a, _b;
    return (_b = (_a = (typescript_1.default.canHaveModifiers(node) ? typescript_1.default.getModifiers(node) : undefined)) === null || _a === void 0 ? void 0 : _a.some(function (modifier) { return modifier.kind === kind; })) !== null && _b !== void 0 ? _b : false;
}
function exposableMember(member) {
    return member.visibility === 'public' && !member.static;
}
function keywordName(kind) {
    switch (kind) {
        case typescript_1.default.SyntaxKind.AnyKeyword: return 'any';
        case typescript_1.default.SyntaxKind.BigIntKeyword: return 'bigint';
        case typescript_1.default.SyntaxKind.BooleanKeyword: return 'boolean';
        case typescript_1.default.SyntaxKind.NeverKeyword: return 'never';
        case typescript_1.default.SyntaxKind.NumberKeyword: return 'number';
        case typescript_1.default.SyntaxKind.ObjectKeyword: return 'object';
        case typescript_1.default.SyntaxKind.StringKeyword: return 'string';
        case typescript_1.default.SyntaxKind.SymbolKeyword: return 'symbol';
        case typescript_1.default.SyntaxKind.UndefinedKeyword: return 'undefined';
        case typescript_1.default.SyntaxKind.UnknownKeyword: return 'unknown';
        case typescript_1.default.SyntaxKind.VoidKeyword: return 'void';
        default: return undefined;
    }
}
function literalModel(node) {
    var literal = node.literal;
    if (typescript_1.default.isStringLiteral(literal))
        return { kind: 'literal', value: literal.text, text: literal.getText() };
    if (typescript_1.default.isNoSubstitutionTemplateLiteral(literal)) {
        return { kind: 'literal', value: literal.text, text: literal.getText() };
    }
    if (typescript_1.default.isNumericLiteral(literal))
        return { kind: 'literal', value: Number(literal.text), text: literal.getText() };
    if (typescript_1.default.isBigIntLiteral(literal))
        return { kind: 'literal', value: BigInt(literal.text.slice(0, -1)), text: literal.getText() };
    if (literal.kind === typescript_1.default.SyntaxKind.TrueKeyword)
        return { kind: 'literal', value: true, text: 'true' };
    if (literal.kind === typescript_1.default.SyntaxKind.FalseKeyword)
        return { kind: 'literal', value: false, text: 'false' };
    if (literal.kind === typescript_1.default.SyntaxKind.NullKeyword)
        return { kind: 'literal', value: null, text: 'null' };
    /* v8 ignore else -- all remaining LiteralTypeNode syntax is a signed numeric or bigint literal. */
    if (typescript_1.default.isPrefixUnaryExpression(literal)
        && (typescript_1.default.isNumericLiteral(literal.operand) || typescript_1.default.isBigIntLiteral(literal.operand))) {
        return {
            kind: 'literal',
            value: typescript_1.default.isBigIntLiteral(literal.operand)
                ? BigInt(literal.getText().slice(0, -1))
                : Number(literal.getText()),
            text: literal.getText(),
        };
    }
    /* v8 ignore next -- TypeScript's LiteralTypeNode grammar is exhausted above; this contains future compiler syntax. */
    throw new TypertAnalysisError("typert: unsupported literal type ".concat(literal.getText()));
}
function modifierMode(token) {
    if ((token === null || token === void 0 ? void 0 : token.kind) === typescript_1.default.SyntaxKind.PlusToken)
        return 'add';
    if ((token === null || token === void 0 ? void 0 : token.kind) === typescript_1.default.SyntaxKind.MinusToken)
        return 'remove';
    return token === undefined ? 'preserve' : 'add';
}
function annotationPosition(node, purpose) {
    if (purpose === 'return')
        return node.parameters.end + 1;
    return node.name.end;
}
function moduleSpecifierOf(node) {
    var _a, _b;
    if (typescript_1.default.isImportTypeNode(node)) {
        var argument = node.argument;
        return argument.literal.text;
    }
    var symbol = typescript_1.default.isTypeReferenceNode(node)
        ? node.typeName
        : node.expression;
    var sourceFile = node.getSourceFile();
    var first = typescript_1.default.isIdentifier(symbol) ? symbol.text : (_a = symbol.getFirstToken(sourceFile)) === null || _a === void 0 ? void 0 : _a.getText(sourceFile);
    for (var _i = 0, _c = sourceFile.statements; _i < _c.length; _i++) {
        var statement = _c[_i];
        if (!typescript_1.default.isImportDeclaration(statement) || statement.importClause === undefined
            || !typescript_1.default.isStringLiteral(statement.moduleSpecifier))
            continue;
        if (((_b = statement.importClause.name) === null || _b === void 0 ? void 0 : _b.text) === first)
            return statement.moduleSpecifier.text;
        var bindings = statement.importClause.namedBindings;
        if (bindings !== undefined && typescript_1.default.isNamespaceImport(bindings) && bindings.name.text === first) {
            return statement.moduleSpecifier.text;
        }
        if (bindings !== undefined && typescript_1.default.isNamedImports(bindings)
            && bindings.elements.some(function (element) { return element.name.text === first; }))
            return statement.moduleSpecifier.text;
    }
    return undefined;
}
function authoredExportName(node, moduleSpecifier) {
    var _a, _b, _c;
    if (typescript_1.default.isImportTypeNode(node))
        return node.qualifier.getText().split('.')[0];
    var referenced = typescript_1.default.isTypeReferenceNode(node)
        ? node.typeName.getText().split('.')
        : node.expression.getText().split('.');
    var localName = referenced[0];
    for (var _i = 0, _d = node.getSourceFile().statements; _i < _d.length; _i++) {
        var statement = _d[_i];
        if (!typescript_1.default.isImportDeclaration(statement)
            || statement.importClause === undefined
            || !typescript_1.default.isStringLiteral(statement.moduleSpecifier)
            || statement.moduleSpecifier.text !== moduleSpecifier)
            continue;
        if (((_a = statement.importClause.name) === null || _a === void 0 ? void 0 : _a.text) === localName)
            return 'default';
        var bindings = statement.importClause.namedBindings;
        if (bindings !== undefined && typescript_1.default.isNamedImports(bindings)) {
            var imported = bindings.elements.find(function (element) { return element.name.text === localName; });
            if (imported !== undefined)
                return (_c = (_b = imported.propertyName) === null || _b === void 0 ? void 0 : _b.text) !== null && _c !== void 0 ? _c : imported.name.text;
        }
        if (bindings !== undefined && typescript_1.default.isNamespaceImport(bindings) && bindings.name.text === localName) {
            return referenced[1];
        }
    }
    /* v8 ignore next -- moduleSpecifierOf returns only the matching import inspected by this loop. */
    throw new TypertAnalysisError("typert: cannot recover export name for ".concat(localName, " from ").concat(moduleSpecifier));
}
function importTypeAttributesText(node) {
    var sourceFile = node.getSourceFile();
    var children = node.getChildren(sourceFile);
    var comma = children.find(function (child) { return child.kind === typescript_1.default.SyntaxKind.CommaToken; });
    var close = children.find(function (child) { return child.kind === typescript_1.default.SyntaxKind.CloseParenToken; });
    return sourceFile.text.slice(comma.end, close.pos).trim();
}
function moduleIdentity(specifier) {
    if (specifier.startsWith('.') || specifier.startsWith('/'))
        return undefined;
    var parts = specifier.split('/');
    var packageLength = specifier.startsWith('@') ? 2 : 1;
    var packageName = parts.slice(0, packageLength).join('/');
    var rest = parts.slice(packageLength).join('/');
    return {
        package: packageName,
        subpath: rest.length === 0 ? '.' : "./".concat(rest),
    };
}
function externalModuleIdentityForFile(file) {
    var normalized = slash(file);
    var marker = '/node_modules/';
    var index = normalized.lastIndexOf(marker);
    if (index < 0)
        return undefined;
    var parts = normalized.slice(index + marker.length).split('/');
    var packageLength = parts[0].startsWith('@') ? 2 : 1;
    var packageName = parts.slice(0, packageLength).join('/');
    return { package: packageName, subpath: '.' };
}
function isStandardLibraryFile(file) {
    var base = file.replaceAll('\\', '/');
    return /\/typescript\/lib\/lib\.[^/]+\.d\.ts$/.test(base);
}
function formatDiagnostic(diagnostic) {
    return typescript_1.default.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}
function formatProgramDiagnostic(root, face, diagnostic) {
    var message = typescript_1.default.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    var position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    var file = slash((0, node_path_1.relative)(root, diagnostic.file.fileName));
    return "typert(".concat(face, "): ").concat(file, ":").concat(String(position.line + 1), ":").concat(String(position.character + 1), ": TypeScript TS").concat(String(diagnostic.code), ": ").concat(message);
}
var realPathCache = new Map();
function realPath(path) {
    var absolute = (0, node_path_1.resolve)(path);
    var cached = realPathCache.get(absolute);
    if (cached !== undefined)
        return cached;
    // Only existing paths are memoized: a path can come into existence later,
    // but an existing path's canonical form is stable for the process lifetime
    // (analysis edits rewrite file contents, never the directory tree).
    if (!(0, node_fs_1.existsSync)(absolute))
        return absolute;
    var resolved = (0, node_fs_1.realpathSync)(absolute);
    realPathCache.set(absolute, resolved);
    return resolved;
}
function isWithin(path, root) {
    var absolute = realPath(path);
    var parent = realPath(root);
    return absolute === parent || absolute.startsWith(parent + node_path_1.sep);
}
function slash(value) {
    return value.replaceAll('\\', '/');
}
function uniqueBy(values, key) {
    var result = new Map();
    for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
        var value = values_1[_i];
        if (!result.has(key(value)))
            result.set(key(value), value);
    }
    return __spreadArray([], result.values(), true);
}
function compareCrossFaceLinks(left, right) {
    return left.fromFace.localeCompare(right.fromFace)
        || left.fromPackage.localeCompare(right.fromPackage)
        || left.toFace.localeCompare(right.toFace)
        || left.toPackage.localeCompare(right.toPackage)
        || left.subpath.localeCompare(right.subpath)
        || left.name.localeCompare(right.name);
}
