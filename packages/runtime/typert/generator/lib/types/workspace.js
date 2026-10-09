"use strict";
/**
 * Workspace-level discovery and model-driven Typert generation.
 * @module @z/dsh-typert-generator/workspace
 */
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
exports.WorkspaceTypertGenerator = void 0;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var analyzer_ts_1 = require("./analyzer.ts");
var emitter_ts_1 = require("./emitter.ts");
/** Discover, analyze, and emit package reflection from independent faces. */
var WorkspaceTypertGenerator = /** @class */ (function () {
    /**
     * Bind generation to one workspace root.
     * @param root - directory containing face aggregate tsconfigs.
     */
    function WorkspaceTypertGenerator(root) {
        this.root = root;
    }
    /**
     * Find public package faces that contribute Cordis services/events or
     * explicitly tagged Typert roots.
     * @param faces - optional independent program faces to inspect.
     * @returns discovered packages in stable package-name order.
     */
    WorkspaceTypertGenerator.prototype.discover = function (faces) {
        return new analyzer_ts_1.WorkspaceAnalyzer(__assign({ root: this.root }, (faces === undefined ? {} : { faces: faces }))).discoverPackages();
    };
    /**
     * Generate all discovered contributors, or an explicit package subset.
     * @param packages - optional exact package names for a focused pass.
     * @param faces - optional independent program faces to analyze.
     * @returns one artifact per package face.
     */
    WorkspaceTypertGenerator.prototype.generate = function (packages, faces) {
        var selected = packages !== null && packages !== void 0 ? packages : this.discover(faces).map(function (candidate) { return candidate.package; });
        var workspace = new analyzer_ts_1.WorkspaceAnalyzer(__assign({ root: this.root, packages: selected }, (faces === undefined ? {} : { faces: faces }))).analyze();
        var artifacts = [];
        for (var _i = 0, _a = workspace.faces; _i < _a.length; _i++) {
            var face = _a[_i];
            var emitter = new emitter_ts_1.FaceModelEmitter(face);
            for (var _b = 0, _c = face.packages; _b < _c.length; _b++) {
                var packageModel = _c[_b];
                var artifact = __assign(__assign({}, emitter.emit(packageModel.name)), { packageRoot: packageModel.root });
                this.validateExport(artifact);
                artifacts.push(artifact);
            }
        }
        return artifacts;
    };
    WorkspaceTypertGenerator.prototype.validateExport = function (artifact) {
        var manifestPath = (0, node_path_1.resolve)(this.root, artifact.packageRoot, 'package.json');
        var manifest = JSON.parse((0, node_fs_1.readFileSync)(manifestPath, 'utf8'));
        var subpath = artifact.face === 'host' ? './typert' : './client/typert';
        var expected = {
            types: "./lib/typert.".concat(artifact.face, ".d.ts"),
            default: "./lib/typert.".concat(artifact.face, ".js"),
        };
        var actual = manifest.exports !== null && typeof manifest.exports === 'object'
            ? manifest.exports[subpath]
            : undefined;
        if (!sameExport(actual, expected)) {
            throw new analyzer_ts_1.TypertAnalysisError("typert(".concat(artifact.face, "): ").concat(artifact.package, " must export ").concat(subpath, " as ").concat(JSON.stringify(expected)));
        }
        var files = Array.isArray(manifest.files) ? manifest.files : [];
        for (var _i = 0, _a = ["lib/typert.".concat(artifact.face, ".js"), "lib/typert.".concat(artifact.face, ".d.ts")]; _i < _a.length; _i++) {
            var file = _a[_i];
            if (!files.includes(file)) {
                throw new analyzer_ts_1.TypertAnalysisError("typert(".concat(artifact.face, "): ").concat(artifact.package, " package files must include ").concat(file));
            }
        }
        if (artifact.face !== 'host')
            return;
        var remoteExpected = {
            types: './lib/typert.remote-client.d.ts',
            default: './lib/typert.remote-client.js',
        };
        var remoteActual = manifest.exports !== null && typeof manifest.exports === 'object'
            ? manifest.exports['./remote']
            : undefined;
        // The declaration map is emitted beside these two but never published: it
        // serves editor navigation in the workspace, where the package link
        // resolves its source.
        var remoteFiles = [
            'lib/typert.remote-client.js',
            'lib/typert.remote-client.d.ts',
        ];
        if (artifact.remote === undefined) {
            if (remoteActual !== undefined || remoteFiles.some(function (file) { return files.includes(file); })) {
                throw new analyzer_ts_1.TypertAnalysisError("typert(host): ".concat(artifact.package, " publishes Remote artifacts but has no Remote methods"));
            }
            return;
        }
        if (!sameExport(remoteActual, remoteExpected)) {
            throw new analyzer_ts_1.TypertAnalysisError("typert(host): ".concat(artifact.package, " must export ./remote as ").concat(JSON.stringify(remoteExpected)));
        }
        for (var _b = 0, remoteFiles_1 = remoteFiles; _b < remoteFiles_1.length; _b++) {
            var file = remoteFiles_1[_b];
            if (!files.includes(file)) {
                throw new analyzer_ts_1.TypertAnalysisError("typert(host): ".concat(artifact.package, " package files must include ").concat(file));
            }
        }
    };
    return WorkspaceTypertGenerator;
}());
exports.WorkspaceTypertGenerator = WorkspaceTypertGenerator;
function sameExport(actual, expected) {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual))
        return false;
    var value = actual;
    return value.types === expected.types && value.default === expected.default;
}
