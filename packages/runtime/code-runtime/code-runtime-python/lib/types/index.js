"use strict";
/**
 * CPython subprocess code runtime for the DeepSeek Harness code-execution seam.
 *
 * The package owns the versionless fd-3 wire protocol between the Node host and
 * the CPython subprocess. The protocol's host-side codec and hostile-frame
 * validators are re-exported so every consumer of the wire shares one
 * vocabulary.
 * @module @z/dsh-code-runtime-python
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateChildFrame = exports.logTruncationMarker = exports.hasUnsafeIntegerToken = exports.hasNonLosslessNumber = exports.encodeJsonPlain = exports.checkDoneValue = void 0;
var protocol_ts_1 = require("./protocol.ts");
Object.defineProperty(exports, "checkDoneValue", { enumerable: true, get: function () { return protocol_ts_1.checkDoneValue; } });
Object.defineProperty(exports, "encodeJsonPlain", { enumerable: true, get: function () { return protocol_ts_1.encodeJsonPlain; } });
Object.defineProperty(exports, "hasNonLosslessNumber", { enumerable: true, get: function () { return protocol_ts_1.hasNonLosslessNumber; } });
Object.defineProperty(exports, "hasUnsafeIntegerToken", { enumerable: true, get: function () { return protocol_ts_1.hasUnsafeIntegerToken; } });
Object.defineProperty(exports, "logTruncationMarker", { enumerable: true, get: function () { return protocol_ts_1.logTruncationMarker; } });
Object.defineProperty(exports, "validateChildFrame", { enumerable: true, get: function () { return protocol_ts_1.validateChildFrame; } });
