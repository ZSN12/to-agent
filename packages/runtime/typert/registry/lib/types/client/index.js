"use strict";
/** Browser face of the shared Typert runtime registry. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = void 0;
exports.apply = apply;
var service_ts_1 = require("../service.ts");
/** Required services: none; this is the Client reflection root. */
exports.inject = [];
/**
 * Install the same registry implementation used by the Host face.
 * @param ctx - Client Cordis root.
 */
function apply(ctx) {
    new service_ts_1.TypertRegistry(ctx);
}
