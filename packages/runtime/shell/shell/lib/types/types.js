"use strict";
/**
 * Execution types for the bash executor seam. Background job semantics belong
 * to `@z/dsh-jobs`; this seam exposes only process handles. The
 * managed-environment and captured-output vocabulary is owned by the
 * subprocess seam and re-exported here so bash consumers keep one import
 * root.
 * @module dsh-shell/types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DSH_ENV_PREFIX = void 0;
var dsh_subprocess_1 = require("@z/dsh-subprocess");
Object.defineProperty(exports, "DSH_ENV_PREFIX", { enumerable: true, get: function () { return dsh_subprocess_1.DSH_ENV_PREFIX; } });
