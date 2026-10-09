"use strict";
/**
 * File-reference discovery seam shared by host-backed user interfaces.
 *
 * @module @z/dsh-file-reference
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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileReferenceService = exports.FILE_REFERENCE_PROMPT = exports.formatFileMention = exports.activeAtToken = void 0;
var dsh_typert_protocol_1 = require("@z/dsh-typert-protocol");
var grammar_ts_1 = require("./grammar.ts");
Object.defineProperty(exports, "activeAtToken", { enumerable: true, get: function () { return grammar_ts_1.activeAtToken; } });
Object.defineProperty(exports, "formatFileMention", { enumerable: true, get: function () { return grammar_ts_1.formatFileMention; } });
/** Model guidance for path-only references selected by a user interface. */
exports.FILE_REFERENCE_PROMPT = 'Paths prefixed with @ are files explicitly referenced by the user. Use the read tool when their contents are needed; do not claim to have inspected a file before reading it.';
/** Host capability for cancellable file-reference discovery. */
var FileReferenceService = function () {
    var _a;
    var _classSuper = dsh_typert_protocol_1.TypertRemoteService;
    var _instanceExtraInitializers = [];
    var _remoteExportList_decorators;
    return _a = /** @class */ (function (_super) {
            __extends(FileReferenceService, _super);
            function FileReferenceService(ctx) {
                var _this = _super.call(this, ctx, 'fileReferences') || this;
                __runInitializers(_this, _instanceExtraInitializers);
                return _this;
            }
            /**
             * Remote face of {@link list}; the decorator cannot mark the abstract
             * member, so this concrete adapter carries the identical contract.
             * @param agent - target agent whose session cwd bounds discovery.
             * @param query - path text following `@` or `@"`.
             * @param signal - caller cancellation.
             * @returns deterministic path-only candidates.
             */
            FileReferenceService.prototype.remoteExportList = function (agent, query, signal) {
                return this.list(agent, query, signal);
            };
            return FileReferenceService;
        }(_classSuper)),
        (function () {
            var _b;
            var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_b = _classSuper[Symbol.metadata]) !== null && _b !== void 0 ? _b : null) : void 0;
            _remoteExportList_decorators = [(0, dsh_typert_protocol_1.Remote)('list')];
            __esDecorate(_a, null, _remoteExportList_decorators, { kind: "method", name: "remoteExportList", static: false, private: false, access: { has: function (obj) { return "remoteExportList" in obj; }, get: function (obj) { return obj.remoteExportList; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
}();
exports.FileReferenceService = FileReferenceService;
exports.default = FileReferenceService;
