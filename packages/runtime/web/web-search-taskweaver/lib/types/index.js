"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.name = exports.TaskWeaverSearchProvider = void 0;
exports.apply = apply;
var provider_ts_1 = require("./provider.ts");
var provider_ts_2 = require("./provider.ts");
Object.defineProperty(exports, "TaskWeaverSearchProvider", { enumerable: true, get: function () { return provider_ts_2.TaskWeaverSearchProvider; } });
exports.name = 'web-search-taskweaver';
exports.inject = ['web'];
function apply(ctx) {
    ctx.web.registerSearchProvider(new provider_ts_1.TaskWeaverSearchProvider());
}
