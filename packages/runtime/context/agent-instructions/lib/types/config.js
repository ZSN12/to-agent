"use strict";
/**
 * Configuration normalization for workspace instruction discovery and rendering.
 *
 * @module @z/dsh-agent-instructions/config
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
exports.Config = void 0;
exports.workspaceBaselineIdentity = workspaceBaselineIdentity;
exports.resolveConfig = resolveConfig;
exports.resolveDiscoveryConfig = resolveDiscoveryConfig;
var node_path_1 = require("node:path");
var schemastery_1 = require("@z/schemastery");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var DEFAULT_PROJECT_ROOT_MARKERS = ['.git'];
var DEFAULT_INSTRUCTION_FILE_CANDIDATES = ['AGENTS.md', 'CLAUDE.md'];
var DEFAULT_LOCAL_INSTRUCTION_FILE_CANDIDATES = ['AGENTS.local.md', 'CLAUDE.local.md'];
var DEFAULT_MAX_SOURCE_BYTES = 1048576;
var RESERVED_PATH_SEGMENTS = new Set(['', '.', '..']);
exports.Config = schemastery_1.default.object({
    dshHome: schemastery_1.default.string(),
    projectRootMarkers: schemastery_1.default.array(schemastery_1.default.string()).default(__spreadArray([], DEFAULT_PROJECT_ROOT_MARKERS, true)),
    maxBytes: schemastery_1.default.number().required(),
    maxSourceBytes: schemastery_1.default.number().step(1).min(1).default(DEFAULT_MAX_SOURCE_BYTES),
    instructionFileCandidates: schemastery_1.default.array(schemastery_1.default.string()).default(__spreadArray([], DEFAULT_INSTRUCTION_FILE_CANDIDATES, true)),
    localInstructionFileCandidates: schemastery_1.default.array(schemastery_1.default.string()).default(__spreadArray([], DEFAULT_LOCAL_INSTRUCTION_FILE_CANDIDATES, true)),
});
/**
 * Identify the discovery, precedence, and budget semantics of one baseline.
 * @param config - normalized plugin configuration.
 * @param cwd - absolute session working directory.
 * @param projectRoot - project root selected for the current baseline.
 * @returns stable serialized identity for compatibility checks on resume.
 */
function workspaceBaselineIdentity(config, cwd, projectRoot) {
    return JSON.stringify({
        projectRoot: (0, node_path_1.relative)(cwd, projectRoot),
        projectRootMarkers: config.projectRootMarkers,
        maxBytes: config.maxBytes,
        maxSourceBytes: config.maxSourceBytes,
        instructionFileCandidates: config.instructionFileCandidates,
        localInstructionFileCandidates: config.localInstructionFileCandidates,
    });
}
/**
 * Resolve defaults, the harness home, and valid same-directory candidates.
 * @param config - user-facing plugin configuration.
 * @returns normalized runtime configuration.
 */
function resolveConfig(config) {
    var _a;
    return __assign(__assign({}, resolveDiscoveryConfig(config)), { maxBytes: config.maxBytes, maxSourceBytes: (_a = config.maxSourceBytes) !== null && _a !== void 0 ? _a : DEFAULT_MAX_SOURCE_BYTES });
}
/**
 * Resolve the subset of configuration used before instruction content is rendered.
 * @param config - optional discovery controls.
 * @returns normalized home, root markers, and instruction candidates.
 */
function resolveDiscoveryConfig(config) {
    var _a;
    return {
        dshHome: (0, dsh_home_paths_1.resolveDshHome)(config.dshHome),
        projectRootMarkers: (_a = config.projectRootMarkers) !== null && _a !== void 0 ? _a : __spreadArray([], DEFAULT_PROJECT_ROOT_MARKERS, true),
        instructionFileCandidates: resolveInstructionFileCandidates(config.instructionFileCandidates, DEFAULT_INSTRUCTION_FILE_CANDIDATES),
        localInstructionFileCandidates: resolveInstructionFileCandidates(config.localInstructionFileCandidates, DEFAULT_LOCAL_INSTRUCTION_FILE_CANDIDATES),
    };
}
function resolveInstructionFileCandidates(candidates, fallback) {
    return (candidates !== null && candidates !== void 0 ? candidates : __spreadArray([], fallback, true)).filter(function (candidate) { return (!RESERVED_PATH_SEGMENTS.has(candidate) && !/[\\/]/.test(candidate)); });
}
