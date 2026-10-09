"use strict";
/**
 * Optional tsdown (rolldown) plugin face of the typert generator. It lowers
 * standard decorators in TypeScript dependencies before bundling, then emits
 * model-driven face artifacts at the package output root. Packages without a
 * Typert or Remote export are skipped.
 * @module @z/dsh-typert-generator/tsdown
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
exports.typertPlugin = typertPlugin;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var typescript_1 = require("typescript");
var workspace_ts_1 = require("./workspace.ts");
var DECORATOR_SYNTAX = /^\s*@[A-Za-z_$][\w$]*/m;
/**
 * Create the decorator-lowering and typert-generation plugin for the root tsdown config.
 * @param pluginOptions - package/workspace emission mode and independent program faces.
 * @returns a rolldown-compatible plugin that lowers source decorators and emits local and Host-for-Client artifacts.
 */
function typertPlugin(pluginOptions) {
    if (pluginOptions === void 0) { pluginOptions = {}; }
    var artifactsByRoot = new Map();
    var emittedWorkspaces = new Set();
    return {
        name: 'dsh-typert-generator',
        transform: function (code, id) {
            var _a;
            var file = (_a = id.split('?', 1)[0]) !== null && _a !== void 0 ? _a : id;
            if (!/\.[cm]?tsx?$/.test(file) || !DECORATOR_SYNTAX.test(code))
                return;
            var result = typescript_1.default.transpileModule(code, {
                fileName: file,
                compilerOptions: __assign(__assign({ target: typescript_1.default.ScriptTarget.ES2024, module: typescript_1.default.ModuleKind.ESNext }, (file.endsWith('x') ? { jsx: typescript_1.default.JsxEmit.ReactJSX } : {})), { sourceMap: true }),
            });
            return {
                code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
                map: result.sourceMapText,
            };
        },
        writeBundle: function (bundleOptions) {
            // options.dir is the package's absolute outDir (<package>/lib); its
            // nearest package.json owns the bundle even when a custom config writes
            // a nested output such as <package>/lib/dev.
            if (bundleOptions.dir === undefined)
                return;
            var root = workspaceRoot(bundleOptions.dir);
            if (emittedWorkspaces.has(root))
                return;
            if (pluginOptions.mode === 'workspace') {
                emitWorkspace(root, pluginOptions.faces);
                emittedWorkspaces.add(root);
                return;
            }
            var packageDir = packageRoot(bundleOptions.dir, root);
            if (packageDir === undefined)
                return;
            var manifest = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(packageDir, 'package.json'), 'utf8'));
            if (manifest.name === undefined || !hasTypertExport(manifest.exports))
                return;
            var artifacts = artifactsByRoot.get(root);
            if (artifacts === undefined) {
                var generator = new workspace_ts_1.WorkspaceTypertGenerator(root);
                artifacts = pluginOptions.faces === undefined
                    ? generator.generate()
                    : generator.generate(undefined, pluginOptions.faces);
                artifactsByRoot.set(root, artifacts);
            }
            emitArtifacts(packageDir, artifacts.filter(function (candidate) { return candidate.package === manifest.name; }));
        },
    };
    function emitWorkspace(root, faces) {
        var generator = new workspace_ts_1.WorkspaceTypertGenerator(root);
        var packages = generator.discover(faces)
            .filter(function (candidate) { return hasTypertExport(readManifest((0, node_path_1.join)(root, candidate.root)).exports); })
            .map(function (candidate) { return candidate.package; });
        if (packages.length === 0)
            return;
        for (var _i = 0, _a = generator.generate(packages, faces); _i < _a.length; _i++) {
            var artifact = _a[_i];
            emitArtifacts((0, node_path_1.join)(root, artifact.packageRoot), [artifact]);
        }
    }
}
function emitArtifacts(packageDir, artifacts) {
    var output = (0, node_path_1.join)(packageDir, 'lib');
    (0, node_fs_1.mkdirSync)(output, { recursive: true });
    var emittedRemote = false;
    for (var _i = 0, artifacts_1 = artifacts; _i < artifacts_1.length; _i++) {
        var artifact = artifacts_1[_i];
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(output, "typert.".concat(artifact.face, ".js")), artifact.js);
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(output, "typert.".concat(artifact.face, ".d.ts")), artifact.dts);
        if (artifact.remote !== undefined) {
            emittedRemote = true;
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(output, 'typert.remote-client.js'), artifact.remote.js);
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(output, 'typert.remote-client.d.ts'), artifact.remote.dts);
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap);
        }
    }
    if (!emittedRemote && artifacts.some(function (artifact) { return artifact.face === 'host'; })) {
        for (var _a = 0, _b = [
            'typert.remote-client.js',
            'typert.remote-client.d.ts',
            'typert.remote-client.d.ts.map',
        ]; _a < _b.length; _a++) {
            var file = _b[_a];
            (0, node_fs_1.rmSync)((0, node_path_1.join)(output, file), { force: true });
        }
    }
}
function readManifest(packageDir) {
    return JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(packageDir, 'package.json'), 'utf8'));
}
function hasTypertExport(exportsField) {
    if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField))
        return false;
    return Object.hasOwn(exportsField, './typert')
        || Object.hasOwn(exportsField, './client/typert')
        || Object.hasOwn(exportsField, './remote');
}
function packageRoot(start, workspace) {
    var current = (0, node_path_1.resolve)(start);
    while (current !== workspace) {
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(current, 'package.json')))
            return current;
        current = (0, node_path_1.dirname)(current);
    }
    return undefined;
}
function workspaceRoot(start) {
    var current = (0, node_path_1.resolve)(start);
    while (!(0, node_fs_1.existsSync)((0, node_path_1.join)(current, 'tsconfig.host.json'))) {
        var parent_1 = (0, node_path_1.dirname)(current);
        if (parent_1 === current)
            throw new Error("typert-generator: cannot find workspace root above ".concat(start));
        current = parent_1;
    }
    return current;
}
