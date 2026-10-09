"use strict";
/**
 * Non-protocol wire vocabulary for the worker-thread engine: the `workerData` init payload and
 * the child-port interfaces the worker-side runtime consumes. Host/worker messages are defined in
 * `./protocol.ts`; transported child requests and results are plain JSON for structured clone.
 * @module @z/dsh-workflow-worker-thread/types
 */
Object.defineProperty(exports, "__esModule", { value: true });
