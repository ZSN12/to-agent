"use strict";
/**
 * Spawn-only worker entrypoint over {@link runWorkerMain}. Executable logic stays in
 * `bootstrap.ts` for in-process coverage; real-worker tests cover this glue.
 * @module @z/dsh-code-runtime-worker-thread/src/worker
 */
Object.defineProperty(exports, "__esModule", { value: true });
var node_worker_threads_1 = require("node:worker_threads");
var bootstrap_ts_1 = require("./bootstrap.ts");
// A worker always has a parent port; guard loudly rather than run detached.
if (!node_worker_threads_1.parentPort)
    throw new Error('dsh-code-runtime-worker-thread: worker entry loaded outside a worker thread');
void (0, bootstrap_ts_1.runWorkerMain)(node_worker_threads_1.parentPort, node_worker_threads_1.workerData, { stdout: process.stdout, stderr: process.stderr });
