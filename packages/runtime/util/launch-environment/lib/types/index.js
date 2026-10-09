"use strict";
/**
 * Immutable launch-time environment snapshot that records which layer
 * supplied each value. Harness consumers resolve through it instead of a flattened
 * `process.env`; launchers may still materialize accepted values for config
 * expressions and third-party libraries.
 * @module @z/dsh-launch-environment
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
exports.DSH_LAUNCH_ENVIRONMENT_KEY = void 0;
exports.createLaunchEnvironmentSnapshot = createLaunchEnvironmentSnapshot;
exports.launchEnvironmentOf = launchEnvironmentOf;
/** Layer order, most trusted first. */
var SOURCE_ORDER = ['process', 'project-env', 'user-env'];
/**
 * The map key one variable name resolves under. Windows treats environment
 * names case-insensitively; every other platform does not.
 * @param name - the variable name as written.
 * @returns the key to store and look up by.
 */
function lookupKey(name) {
    /* v8 ignore next -- native Windows coverage exercises the folding arm; POSIX covers the exact one */
    return process.platform === 'win32' ? name.toUpperCase() : name;
}
/**
 * Build the snapshot from each layer's contents.
 * @param layers - the layers in any order; the result searches them by canonical trust order.
 * @returns the immutable snapshot.
 */
function createLaunchEnvironmentSnapshot(layers) {
    // Copy every layer so later mutations cannot change the snapshot. Fold names
    // on Windows so case variants cannot split precedence; POSIX remains exact.
    var bySource = new Map();
    for (var _i = 0, layers_1 = layers; _i < layers_1.length; _i++) {
        var layer = layers_1[_i];
        bySource.set(layer.source, __assign(__assign({}, layer.path === undefined ? {} : { path: layer.path }), { values: new Map(Object.entries(layer.values).map(function (_a) {
                var name = _a[0], value = _a[1];
                return [lookupKey(name), value];
            })) }));
    }
    var getFrom = function (name, sources) {
        var key = lookupKey(name);
        for (var _i = 0, SOURCE_ORDER_1 = SOURCE_ORDER; _i < SOURCE_ORDER_1.length; _i++) {
            var source = SOURCE_ORDER_1[_i];
            if (!sources.includes(source))
                continue;
            var layer = bySource.get(source);
            var value = layer === null || layer === void 0 ? void 0 : layer.values.get(key);
            if (value === undefined)
                continue;
            return __assign({ value: value, source: source }, (layer === null || layer === void 0 ? void 0 : layer.path) === undefined ? {} : { path: layer.path });
        }
        return undefined;
    };
    return {
        get: function (name) { return getFrom(name, SOURCE_ORDER); },
        getFrom: getFrom,
    };
}
/** Context slot the launcher fills with this run's snapshot before any config entry mounts. */
exports.DSH_LAUNCH_ENVIRONMENT_KEY = 'launchEnvironment';
/**
 * Return the launcher's snapshot, or the inherited environment as the sole
 * layer when the host provided none.
 * @param ctx - the consuming plugin's context.
 * @returns the snapshot to resolve user-facing values against.
 */
function launchEnvironmentOf(ctx) {
    var _a;
    return (_a = ctx.get(exports.DSH_LAUNCH_ENVIRONMENT_KEY)) !== null && _a !== void 0 ? _a : createLaunchEnvironmentSnapshot([{ source: 'process', values: process.env }]);
}
