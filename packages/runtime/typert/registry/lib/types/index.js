"use strict";
/** Host entry for the shared Typert runtime registry. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.typertPackageKey = exports.typertKey = exports.typertEndpoint = exports.TypertRegistry = exports.default = void 0;
var service_ts_1 = require("./service.ts");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return service_ts_1.default; } });
Object.defineProperty(exports, "TypertRegistry", { enumerable: true, get: function () { return service_ts_1.TypertRegistry; } });
Object.defineProperty(exports, "typertEndpoint", { enumerable: true, get: function () { return service_ts_1.typertEndpoint; } });
Object.defineProperty(exports, "typertKey", { enumerable: true, get: function () { return service_ts_1.typertKey; } });
Object.defineProperty(exports, "typertPackageKey", { enumerable: true, get: function () { return service_ts_1.typertPackageKey; } });
