"use strict";
/**
 * User-facing permission presets over the independent sandbox-mode and
 * approval-policy knobs. A switch records the selected preset, then writes
 * changed knobs through their canonical setters. Execution, prompt narration,
 * and replay keep reading their knob folds. The preset event preserves user
 * intent when two presets share a bundle. The read side ships as the
 * `permissions` session projection; the write side ships as the
 * `/permission` command — both optional children over the same service.
 *
 * @module dsh-permission-presets
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
exports.PermissionPresetService = exports.PERMISSION_SETTINGS_NAMESPACE = exports.CUSTOM_PRESET = void 0;
exports.effectivePermissionPreset = effectivePermissionPreset;
exports.applyKnobEvent = applyKnobEvent;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var zod_1 = require("zod");
var dsh_sandbox_policy_1 = require("@z/dsh-sandbox-policy");
var dsh_user_approval_1 = require("@z/dsh-user-approval");
var dsh_settings_1 = require("@z/dsh-settings");
/**
 * Returned when effective knob values match no table entry. Clients may show
 * it as the current value, but it is never a switch target or event payload.
 */
exports.CUSTOM_PRESET = 'custom';
/** Settings namespace carrying the default for future sessions. */
exports.PERMISSION_SETTINGS_NAMESPACE = (0, dsh_settings_1.settingsNamespace)('permission');
/**
 * Fold the last selected preset from the durable log; replay needs no catch-up
 * state.
 * @param events - session events in log order; other event types are ignored.
 * @returns the last selected preset, or undefined when none was recorded.
 */
function effectivePermissionPreset(events) {
    for (var index = events.length - 1; index >= 0; index -= 1) {
        var event_1 = events[index];
        if (event_1.type === 'permission/preset')
            return event_1.data.preset;
    }
    return undefined;
}
var knobStateSchema = zod_1.z.object({
    preset: zod_1.z.string().nullable(),
    sandbox: zod_1.z.union([
        zod_1.z.literal('read-only'),
        zod_1.z.literal('workspace-write'),
        zod_1.z.literal('danger-full-access'),
    ]).nullable(),
    approval: zod_1.z.union([zod_1.z.literal('ask'), zod_1.z.literal('never')]).nullable(),
}).strict();
/** State for the empty log: every knob at its composition default. */
var EMPTY_KNOBS = { preset: null, sandbox: null, approval: null };
/**
 * One-event knob transition (the projection unit's `apply`). Uninterested
 * events return the same reference — the registry's change gate.
 * @param state - the folded knob state before `event`.
 * @param event - one committed session event.
 * @returns the next state; the same reference when the event is not a knob.
 */
function applyKnobEvent(state, event) {
    switch (event.type) {
        case 'permission/preset':
            return __assign(__assign({}, state), { preset: event.data.preset });
        case 'sandbox/mode':
            return __assign(__assign({}, state), { sandbox: event.data.mode });
        case 'approval/policy':
            return __assign(__assign({}, state), { approval: event.data.policy });
        default:
            return state;
    }
}
/** Whole-log knob fold (the cold-read parallel of {@link applyKnobEvent}). */
function foldKnobs(events) {
    var state = EMPTY_KNOBS;
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_2 = events_1[_i];
        state = applyKnobEvent(state, event_2);
    }
    return state;
}
/**
 * Owns the deployment's permission presets and their write path. Requires a
 * confining `ctx.shell` executor and `ctx.approval`; unmatched knob values are
 * reported as {@link CUSTOM_PRESET}, not an error.
 */
var PermissionPresetService = /** @class */ (function (_super) {
    __extends(PermissionPresetService, _super);
    function PermissionPresetService(ctx, config) {
        var _a;
        var _this = _super.call(this, ctx, 'permissionPresets') || this;
        // The schema defaulted the table — the cast records that runtime fact.
        _this.presets = config.presets;
        if (exports.CUSTOM_PRESET in _this.presets) {
            throw new Error("permission: \"".concat(exports.CUSTOM_PRESET, "\" is reserved for the derived not-a-preset state and cannot name a table entry"));
        }
        if (ctx.shell.sandboxMode === undefined) {
            throw new Error('permission: the mounted bash executor does not confine (no sandboxMode) — presets bundle a sandbox mode, so composing this plugin over an unconfined executor is a misconfiguration');
        }
        var inferredDefault = _this.derive(EMPTY_KNOBS);
        var defaultPreset = (_a = config.defaultPreset) !== null && _a !== void 0 ? _a : inferredDefault;
        if (defaultPreset === exports.CUSTOM_PRESET) {
            throw new Error('permission: composed sandbox and approval defaults match no preset; configure defaultPreset explicitly');
        }
        _this.resolve(defaultPreset);
        var baseSettings = { defaultPreset: defaultPreset };
        _this.defaultSettings = function () { return baseSettings; };
        var presetChoices = _this.names.map(function (name) {
            var _a;
            var choice = schemastery_1.default.const(name);
            var label = (_a = _this.presets[name]) === null || _a === void 0 ? void 0 : _a.name;
            return label === undefined ? choice : choice.description(label);
        });
        var settingsSchema = schemastery_1.default.object({
            defaultPreset: schemastery_1.default.union(presetChoices).required(),
        });
        (0, dsh_settings_1.installSettingsSection)(ctx, exports.PERMISSION_SETTINGS_NAMESPACE, settingsSchema, baseSettings, {
            setSource: function (current) {
                _this.defaultSettings = current;
            },
            // The source thunk reads the latest scope snapshot at session creation;
            // no process-level registration needs replacement on change.
            onChange: function () { },
        });
        ctx.on('session/created', function (session) {
            _this.pinInitialPermission(session);
        });
        for (var _i = 0, _b = ctx.sessions.list(); _i < _b.length; _i++) {
            var session = _b[_i];
            _this.pinInitialPermission(session);
        }
        // The permissions projection unit: fold the three whole-value knob
        // events; view derives the select over the composition defaults this
        // service already owns. The unit child activates only when a projection
        // registry is composed (headless assemblies stay unaffected).
        // zod `.optional()` types the key `string | undefined` while the domain
        // says `description?: string`; on the JSON wire the two serialize
        // identically (absent), so the cast records exactly that
        // exactOptionalPropertyTypes widening (the Wire<T> precedent).
        var selectSchema = zod_1.z.object({
            options: zod_1.z.array(zod_1.z.object({
                value: zod_1.z.string().min(1),
                name: zod_1.z.string().min(1),
                description: zod_1.z.string().optional(),
            })),
            currentValue: zod_1.z.string().min(1),
        });
        ctx.inject(['sessionProjections'], function (projectionCtx) {
            projectionCtx.sessionProjections.register({
                key: 'permissions',
                stateSchema: knobStateSchema,
                init: function () { return EMPTY_KNOBS; },
                apply: applyKnobEvent,
                wire: { viewSchema: selectSchema, view: function (state) { return _this.selectFor(state); } },
                stateVersion: 1,
            });
        });
        // The /permission command: the one write path a web client uses (the
        // popup contribution submits the picked preset as this line). The child
        // activates only when a command registry is composed.
        ctx.inject(['commands'], function (commandCtx) {
            commandCtx.commands.register({
                name: 'permission',
                description: 'Switch the permission preset (sandbox mode + approval policy)',
                input: { hint: '<preset>' },
                // No settlement text labels its value with this command's own name: a
                // surface that renders `name · text` (the web command row) would
                // otherwise read `permission · Permission preset: workspace-write.`
                handler: function (_a) {
                    var agent = _a.agent, rawInput = _a.rawInput;
                    var name = rawInput.trim();
                    if (name === '') {
                        return { kind: 'success', text: "current preset ".concat(_this.current(agent.session.events), " (available: ").concat(_this.names.join(', '), ")") };
                    }
                    if (!_this.names.includes(name)) {
                        return { kind: 'error', text: "unknown preset \"".concat(name, "\" (available: ").concat(_this.names.join(', '), ")") };
                    }
                    _this.apply(agent.session, name, function (policy) { _this.ctx.approval.setPolicy(agent, policy); });
                    return { kind: 'success', text: "preset ".concat(name) };
                },
            });
        });
        return _this;
    }
    Object.defineProperty(PermissionPresetService.prototype, "names", {
        /**
         * The advertised preset names, in the preset table's declaration order.
         * @returns every switchable preset name.
         */
        get: function () {
            return Object.keys(this.presets);
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(PermissionPresetService.prototype, "defaultPreset", {
        /**
         * The preset currently selected as the default for future sessions.
         * @returns the resolved settings value, or the composition default without
         * a mounted settings provider.
         */
        get: function () {
            return this.defaultSettings().defaultPreset;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Resolve the preset matching the effective knob values. A still-matching
     * last selection wins shared-bundle ties; otherwise the first table match
     * wins, or {@link CUSTOM_PRESET} when no entry matches.
     * @param events - the session's events in log order.
     * @returns the effective preset name, or `custom` when nothing matches.
     */
    PermissionPresetService.prototype.current = function (events) {
        return this.derive(foldKnobs(events));
    };
    /** Resolve the preset for one folded knob state (the shared mathematics of `current` and the projection unit). */
    PermissionPresetService.prototype.derive = function (state) {
        var _a, _b, _c;
        var sandbox = (_a = state.sandbox) !== null && _a !== void 0 ? _a : this.ctx.shell.sandboxMode;
        var approval = (_c = (_b = state.approval) !== null && _b !== void 0 ? _b : this.ctx.approval.config.policy) !== null && _c !== void 0 ? _c : 'ask';
        var matches = function (spec) { return spec.sandbox === sandbox && spec.approval === approval; };
        if (state.preset !== null) {
            var spec = this.presets[state.preset];
            if (spec !== undefined && matches(spec))
                return state.preset;
        }
        for (var _i = 0, _d = Object.entries(this.presets); _i < _d.length; _i++) {
            var _e = _d[_i], name_1 = _e[0], spec = _e[1];
            if (matches(spec))
                return name_1;
        }
        return exports.CUSTOM_PRESET;
    };
    /**
     * Build the whole select value for one folded knob state: every table
     * option in declaration order, `custom` appended exactly while derived.
     * @param state - the folded knob overrides.
     * @returns the `permissions` projection payload.
     */
    PermissionPresetService.prototype.selectFor = function (state) {
        var _this = this;
        var currentValue = this.derive(state);
        return {
            options: __spreadArray(__spreadArray([], this.names.map(function (name) { return _this.optionOf(name); }), true), currentValue === exports.CUSTOM_PRESET ? [this.optionOf(exports.CUSTOM_PRESET)] : [], true),
            currentValue: currentValue,
        };
    };
    /**
     * Resolve a preset's knob bundle.
     * @param name - the preset name to resolve.
     * @returns the configured bundle.
     * @throws when `name` is not in the table.
     */
    PermissionPresetService.prototype.resolve = function (name) {
        var spec = this.presets[name];
        if (spec === undefined) {
            throw new Error("permission: unknown preset \"".concat(name, "\" (known: ").concat(Object.keys(this.presets).join(', '), ")"));
        }
        return spec;
    };
    /**
     * Build the client option for a table entry or {@link CUSTOM_PRESET}. A
     * missing label falls back to the table key.
     * @param name - a table key, or `custom`.
     * @returns the option a client renders.
     * @throws when `name` is neither a table key nor `custom`.
     */
    PermissionPresetService.prototype.optionOf = function (name) {
        var _a;
        if (name === exports.CUSTOM_PRESET) {
            return { value: exports.CUSTOM_PRESET, name: 'Custom', description: 'Current sandbox and approval settings do not match a preset.' };
        }
        var spec = this.resolve(name);
        return __assign({ value: name, name: (_a = spec.name) !== null && _a !== void 0 ? _a : name }, spec.description !== undefined ? { description: spec.description } : {});
    };
    /**
     * Record a changed preset, then update each changed knob through its own
     * setter. Selecting the effective preset again appends nothing.
     * @param session - the session the switch belongs to.
     * @param name - the preset to switch to; unknown names throw.
     */
    PermissionPresetService.prototype.set = function (session, name) {
        this.apply(session, name, function (policy) { (0, dsh_user_approval_1.setApprovalPolicy)(session, policy); });
    };
    /** Apply one preset with the caller-selected live or initialization policy writer. */
    PermissionPresetService.prototype.apply = function (session, name, setApproval) {
        var _a, _b, _c;
        var spec = this.resolve(name);
        if (this.current(session.events) !== name) {
            session.append('permission/preset', { preset: name });
        }
        var events = session.events;
        if (spec.sandbox !== ((_a = (0, dsh_sandbox_policy_1.effectiveSandboxMode)(events)) !== null && _a !== void 0 ? _a : this.ctx.shell.sandboxMode)) {
            (0, dsh_sandbox_policy_1.setSandboxMode)(session, spec.sandbox);
        }
        if (spec.approval !== ((_c = (_b = (0, dsh_user_approval_1.effectiveApprovalPolicy)(events)) !== null && _b !== void 0 ? _b : this.ctx.approval.config.policy) !== null && _c !== void 0 ? _c : 'ask')) {
            setApproval(spec.approval);
        }
    };
    /**
     * Fill every missing permission fact before a session is published. A
     * genuinely fresh session uses the current user default; seeded or partially
     * initialized sessions preserve their effective knob values and only gain
     * the missing durable facts.
     */
    PermissionPresetService.prototype.pinInitialPermission = function (session) {
        var _a;
        var events = session.events;
        var selected = effectivePermissionPreset(events);
        var sandbox = (0, dsh_sandbox_policy_1.effectiveSandboxMode)(events);
        var approval = (0, dsh_user_approval_1.effectiveApprovalPolicy)(events);
        var seeded = events.some(function (event) { return event.type === 'session/end-seed'; });
        if (selected === undefined && sandbox === undefined && approval === undefined && !seeded) {
            var name_2 = this.defaultPreset;
            var spec = this.resolve(name_2);
            session.append('permission/preset', { preset: name_2 });
            (0, dsh_sandbox_policy_1.setSandboxMode)(session, spec.sandbox);
            (0, dsh_user_approval_1.setApprovalPolicy)(session, spec.approval);
            return;
        }
        var state = {
            preset: selected !== null && selected !== void 0 ? selected : null,
            sandbox: sandbox !== null && sandbox !== void 0 ? sandbox : null,
            approval: approval !== null && approval !== void 0 ? approval : null,
        };
        var effective = this.derive(state);
        if (selected === undefined && effective !== exports.CUSTOM_PRESET) {
            session.append('permission/preset', { preset: effective });
        }
        if (sandbox === undefined) {
            (0, dsh_sandbox_policy_1.setSandboxMode)(session, this.ctx.shell.sandboxMode);
        }
        if (approval === undefined) {
            (0, dsh_user_approval_1.setApprovalPolicy)(session, (_a = this.ctx.approval.config.policy) !== null && _a !== void 0 ? _a : 'ask');
        }
    };
    // Inline schema call: the config catalog walks `static Config` statically.
    PermissionPresetService.Config = schemastery_1.default.object({
        presets: schemastery_1.default.dict(schemastery_1.default.object({
            sandbox: schemastery_1.default.union(dsh_sandbox_policy_1.SANDBOX_MODES).required(),
            approval: schemastery_1.default.union(dsh_user_approval_1.APPROVAL_POLICIES).required(),
            name: schemastery_1.default.string(),
            description: schemastery_1.default.string(),
        })).default({
            'workspace-write': {
                sandbox: 'workspace-write', approval: 'ask',
                name: 'workspace-write', description: 'Write inside the workspace and permitted temporary directories; wider retries require approval.',
            },
            'danger-full-access': {
                sandbox: 'danger-full-access', approval: 'never',
                name: 'danger-full-access', description: 'Full file access without approval prompts.',
            },
        }),
        defaultPreset: schemastery_1.default.string(),
    });
    PermissionPresetService.inject = ['shell', 'approval', 'sessions'];
    return PermissionPresetService;
}(cordis_1.Service));
exports.PermissionPresetService = PermissionPresetService;
exports.default = PermissionPresetService;
